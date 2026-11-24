// -----------------------------------------------------------------
//  backend/src/routes/upload.routes.js
//
//  Upload + verification routes for VIDEOS and IMAGES.
//
//  Two parallel pipelines share the same blockchain / IPFS / C2PA
//  infrastructure but use different on-chain entities and different
//  catalog directories:
//
//    Video:  data/catalog/<videoId>.json
//            (managed via ../services/catalog.service.js)
//    Image:  data/catalog/images/<imageId>.json
//            (managed via local helpers in this file)
//
//  Both kinds are merged in the unified /feed route for the
//  Facebook-style home page.
//
//  IMMUTABILITY: this router exposes ZERO delete endpoints. Once
//  content is uploaded, only revoke (status flip) and tamper reports
//  are possible. The on-chain record stays forever.
// -----------------------------------------------------------------

const express = require("express");
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { exec, execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// --- Directory Setup ---------------------------------------------
const storageRoot = process.env.STORAGE_PATH || path.join(__dirname, "../../");
const uploadsDir = path.join(storageRoot, "public/uploads");
const streamsDir = path.join(storageRoot, "public/streams");
const imagesDir = path.join(storageRoot, "public/images");
const thumbnailsDir = path.join(storageRoot, "public/thumbnails");
const imageCatalogDir = path.join(storageRoot, "data/catalog/images");

[uploadsDir, streamsDir, imagesDir, thumbnailsDir, imageCatalogDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// --- Service Imports ---------------------------------------------
const {
  registerVideoProof,
  registerImageProof,
  verifyVideoProof,
  verifyImageProof,
  revokeMediaProof,
  reportTamper,
  clearDispute,
  approveByBroadcaster,
  rejectByBroadcaster,
  approveByAuditor,
  rejectByAuditor,
  queryPendingBroadcaster,
  queryPendingAuditor,
  getMediaHistory,
  queryLedger,
  fabricEvents,
  getEventStreamStatus,
} = require("../services/fabric.service");

const {
  uploadSegmentToIPFS,
  uploadMetadataToIPFS,
  uploadJsonToIPFS,
  uploadImageToIPFS,
  uploadImageMetadataToIPFS,
  uploadVideoSourceToIPFS,
  buildGatewayUrl,
  fetchJsonFromIPFS,
  fetchBufferFromIPFS,
} = require("../services/ipfs.service");

const {
  writeManifest,
  readManifest,
  updateManifest,
  listManifests,
} = require("../services/catalog.service");

const {
  generateAllManifests,
  readAndVerifyManifest,
  buildVideoManifest,
  embedImageManifest,
  embedVideoManifest,
  verifyEmbeddedAsset,
} = require("../services/c2pa.service");

const { analyzeVideoForensics } = require("../services/forensics.service");
const { analyzeImageForensics } = require("../services/image-forensics.service");
const { buildRevocationTimeline } = require("../services/timeline.service");

const router = express.Router();

// --- Rate Limiting -------------------------------------------------
// General ceiling on the whole API surface (feed polling, detail pages,
// per-segment verify calls during playback all add up - generous but
// bounded). A tighter limit specifically on the two upload endpoints,
// since those are the expensive/abusable ones (FFmpeg, forensics, IPFS
// pinning, Fabric writes all get triggered per call).
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many uploads from this IP - try again later." },
});

// The Broadcaster/Auditor portals are passcode-gated but still reachable by
// anyone who finds the URL - bounds brute-force guessing of the passcode.
const portalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts - try again later." },
});

// Read-only portal calls (pending queue, per-item integrity check) aren't
// passcode guesses - they fire once per item every time the queue loads, so
// they need real headroom. Login/approve/reject stay on the stricter
// portalLimiter above.
const portalDataLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests - try again later." },
});

router.use(generalLimiter);

// --- ID Param Validation --------------------------------------------
// videoId/imageId are crypto.randomUUID() strings; every lookup builds a
// filesystem path from them (data/catalog/<id>.json). Without validation
// here, a crafted id containing "../" segments could read arbitrary
// .json files outside the catalog directory. Centralized via
// router.param() so it applies to every route using these names, not
// just the ones touched in this pass.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validateIdParam = (req, res, next, value) => {
  if (!UUID_RE.test(value)) return res.status(400).json({ error: "Invalid id format" });
  next();
};
router.param("videoId", validateIdParam);
router.param("imageId", validateIdParam);
router.param("id", validateIdParam);
router.param("mediaId", validateIdParam);

router.param("mediaType", (req, res, next, value) => {
  if (value !== "video" && value !== "image") return res.status(400).json({ error: "Invalid mediaType" });
  next();
});

router.param("segmentIndex", (req, res, next, value) => {
  if (!/^\d+$/.test(value)) return res.status(400).json({ error: "Invalid segmentIndex" });
  next();
});

router.param("kind", (req, res, next, value) => {
  if (value !== "video" && value !== "image") return res.status(400).json({ error: "Invalid kind" });
  next();
});

// --- Multer Configs ----------------------------------------------
// Video uploads: accepts both `video` (mp4) and optional `thumbnail` (image)
// using multer .fields() to handle two named file inputs in one request.
const upload = multer({ dest: uploadsDir });

const videoUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 },
}).fields([
  { name: "video", maxCount: 1 },
  { name: "thumbnail", maxCount: 1 },
]);

// Image multer: only jpg/jpeg/png/webp accepted, 20MB max
const imageUpload = multer({
  dest: uploadsDir,
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only JPG, PNG, and WebP images are allowed"));
    }
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

// =================================================================
//  IMAGE CATALOG HELPERS
//  Stores image manifests at backend/data/catalog/images/<imageId>.json
// =================================================================

const writeImageManifest = (imageId, data) => {
  const filePath = path.join(imageCatalogDir, `${imageId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return data;
};

const readImageManifest = (imageId) => {
  const filePath = path.join(imageCatalogDir, `${imageId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const updateImageManifest = (imageId, updaterFn) => {
  const current = readImageManifest(imageId);
  if (!current) return null;
  const updated = updaterFn(current);
  return writeImageManifest(imageId, updated);
};

const listImageManifests = () => {
  if (!fs.existsSync(imageCatalogDir)) return [];
  return fs
    .readdirSync(imageCatalogDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(imageCatalogDir, f), "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

// =================================================================
//  COMMON HELPERS
// =================================================================

// Reject obviously-abusive metadata (huge titles/descriptions bloat the
// catalog and the C2PA CreativeWork assertion embedded in every asset).
// Trims whitespace; rejects empty titles and anything over a sane cap.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const validateMeta = (rawTitle, rawDescription, fallbackTitle) => {
  const title = (rawTitle || fallbackTitle || "").trim();
  const description = (rawDescription || "").trim();
  if (!title) return { error: "Title is required" };
  if (title.length > TITLE_MAX) return { error: `Title must be ${TITLE_MAX} characters or fewer` };
  if (description.length > DESCRIPTION_MAX) return { error: `Description must be ${DESCRIPTION_MAX} characters or fewer` };
  return { title, description };
};

const hashFile = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });

const runFfmpeg = (command) =>
  new Promise((resolve, reject) => {
    exec(command, (err) => (err ? reject(err) : resolve()));
  });

// Target HLS segment length. Shorter = finer-grained tamper localization
// (each segment gets its own hash/chain-hash/forensic sub-score/C2PA
// sidecar) at the cost of more IPFS pins and sidecar files per video;
// longer = less overhead, coarser localization. Configurable rather than
// a magic number buried in the ffmpeg command.
const HLS_SEGMENT_SECONDS = Number(process.env.HLS_SEGMENT_SECONDS) || 2;

// Real duration of one segment file, in seconds. `-hls_time` is only a
// *target* - FFmpeg cuts at the nearest existing keyframe, so actual
// segment length drifts from the target whenever the source's keyframe
// interval doesn't divide evenly into it, and the final segment of any
// video is essentially always shorter. Probing the real value (rather
// than assuming every segment is exactly HLS_SEGMENT_SECONDS) is what
// makes duration displays and metadata actually correct.
const probeSegmentDuration = async (filePath) => {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath,
    ]);
    const seconds = parseFloat(stdout);
    return Number.isFinite(seconds) ? seconds : HLS_SEGMENT_SECONDS;
  } catch {
    return HLS_SEGMENT_SECONDS;
  }
};

// =================================================================
//  VIDEO SUMMARY HELPERS
// =================================================================

const buildMetadataPayload = (manifest) => ({
  videoId: manifest.videoId,
  title: manifest.title,
  description: manifest.description,
  createdAt: manifest.createdAt,
  // Both digests go on-chain (chaincode v3.2+ stores this payload in the
  // ledger's own state): the file as the submitter handed it over, and the
  // published copy TrustStream embedded its C2PA manifest into. Without the
  // first one, a submitter verifying their own master could only be checked
  // against this server's local catalog - which is a cache, not evidence.
  originalSha256: manifest.originalSha256 || null,
  sourceSha256: manifest.sourceSha256 || null,
  totalSegments: manifest.totalSegments,
  playlistUrl: manifest.playlistUrl,
  segments: manifest.segments.map((segment) => ({
    index: segment.index,
    filename: segment.filename,
    sha256Hash: segment.sha256Hash,
    chainHash: segment.chainHash,
    cid: segment.ipfsCid,
    gatewayUrl: segment.ipfsUrl,
    durationSeconds: segment.durationSeconds,
    c2paManifestHash: segment.c2paManifestHash || null,
    c2paInstanceId: segment.c2paInstanceId || null,
    c2paSignedAt: segment.c2paSignedAt || null,
  })),
});

const buildVideoSummary = (manifest) => ({
  id: manifest.videoId,
  mediaType: "video",
  videoId: manifest.videoId,
  title: manifest.title,
  description: manifest.description,
  totalSegments: manifest.totalSegments,
  // Sum of each segment's *measured* duration (see probeSegmentDuration) -
  // not totalSegments * a fixed constant, since -hls_time is only a
  // target and the final segment is virtually always shorter than it.
  totalDurationSeconds: (manifest.segments || []).reduce((sum, s) => sum + (s.durationSeconds || 0), 0),
  playlistUrl: manifest.playlistUrl,
  createdAt: manifest.createdAt,
  registeredAt: manifest.createdAt,
  metadataCid: manifest.metadataCid,
  metadataUrl: manifest.metadataCid ? buildGatewayUrl(manifest.metadataCid) : null,
  merkleRoot: manifest.merkleRoot || null,
  thumbnailUrl: manifest.thumbnailUrl || null,
  status: manifest.status,
  ipfsStatus: manifest.ipfsStatus,
  fabricStatus: manifest.fabricStatus || "pending",
  fabricResult: manifest.fabricResult || null,
  fabricError: manifest.fabricError || null,
  c2paStatus: manifest.c2paStatus || "pending",
  sourceC2paStatus: manifest.sourceC2paStatus || "pending",
  sourceC2paManifestHash: manifest.sourceC2paManifestHash || null,
  sourceC2paInstanceId: manifest.sourceC2paInstanceId || null,
  sourceC2paSignedAt: manifest.sourceC2paSignedAt || null,
  sourceIpfsCid: manifest.sourceIpfsCid || null,
  sourceIpfsUrl: manifest.sourceIpfsUrl || null,
});

const buildForensicSummary = (manifest) => ({
  forensicStatus: manifest.forensicStatus || "pending",
  forensicError: manifest.forensicError || null,
  forensicLabel: manifest.forensics?.finalLabel || null,
  forensicRiskScore: manifest.forensics?.videoRiskScore ?? null,
  forensicReportCid: manifest.forensicReportCid || null,
  forensicReportUrl: manifest.forensicReportUrl || null,
});

const buildVideoSummaryWithForensics = (manifest) => ({
  ...buildVideoSummary(manifest),
  ...buildForensicSummary(manifest),
});

const buildMetadataPayloadWithForensics = (manifest) => {
  const payload = buildMetadataPayload(manifest);
  if (manifest.forensics) {
    payload.forensics = {
      analysisVersion: manifest.forensics.analysisVersion,
      analysisTimestamp: manifest.forensics.analysisTimestamp,
      videoRiskScore: manifest.forensics.videoRiskScore,
      finalLabel: manifest.forensics.finalLabel,
      forensicReportCid: manifest.forensicReportCid || null,
      forensicReportUrl: manifest.forensicReportUrl || null,
    };
  }
  return payload;
};

const buildForensicReportPayload = (manifest) => ({
  ...manifest.forensics,
  videoId: manifest.videoId,
  title: manifest.title,
  description: manifest.description,
  createdAt: manifest.createdAt,
  playlistUrl: manifest.playlistUrl,
  metadataCid: manifest.metadataCid || null,
  forensicReportCid: manifest.forensicReportCid || null,
});

const getSegmentFromManifest = (videoId, segmentIndex) => {
  const manifest = readManifest(videoId);
  if (!manifest) return { manifest: null, segment: null };
  const segment = manifest.segments.find((item) => item.index === Number(segmentIndex));
  return { manifest, segment: segment || null };
};

const uploadWithRetry = async (localPath, filename, maxRetries = 3) => {
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await uploadSegmentToIPFS(localPath, filename);
    } catch (err) {
      const errStr = err?.message || JSON.stringify(err) || "";
      const isRateLimit =
        errStr.includes("RATE_LIMITED") || errStr.includes("rate limit");
      if (isRateLimit && attempt < maxRetries) {
        const waitMs = 2000 * (attempt + 1);
        console.log(
          `[upload] rate-limited on ${filename}, retrying in ${waitMs / 1000}s...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      } else {
        throw err;
      }
    }
  }
  return null;
};

const buildMerkleRootFromSegments = (segments = []) => {
  let level = segments
    .map((segment) => segment.chainHash || segment.sha256Hash)
    .filter(Boolean)
    .map((hash) => hash.replace(/^0x/, ""))
    .map((hash) => Buffer.from(hash, "hex"));

  if (!level.length) return "";

  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] || left;
      next.push(crypto.createHash("sha256").update(Buffer.concat([left, right])).digest());
    }
    level = next;
  }

  return `0x${level[0].toString("hex")}`;
};

// Re-hashes every segment file from disk right now (not the cached manifest
// value) and rebuilds the sequential chain-hash + Merkle root exactly as at
// upload time. Comparing this against the root stored on the Fabric ledger
// is what actually proves the local copy hasn't drifted since registration.
const recomputeMerkleRootFromDisk = async (segments = []) => {
  let prevHash = null;
  const fresh = [];

  for (const segment of segments) {
    const sha256Hash = await hashFile(segment.localPath);
    const chainHash = crypto
      .createHash("sha256")
      .update(Buffer.from(sha256Hash + (prevHash || ""), "hex"))
      .digest("hex");

    fresh.push({ index: segment.index, sha256Hash, chainHash });
    prevHash = sha256Hash;
  }

  return { merkleRoot: buildMerkleRootFromSegments(fresh), segments: fresh };
};

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms)
    ),
  ]);

const IPFS_BATCH_SIZE = 2;

// =================================================================
//  IMAGE SUMMARY HELPERS
// =================================================================

const buildImageForensicSummary = (manifest) => ({
  forensicStatus: manifest.forensicStatus || "pending",
  forensicError: manifest.forensicError || null,
  forensicLabel: manifest.forensics?.finalLabel || null,
  forensicRiskScore: manifest.forensics?.imageRiskScore ?? null,
});

const buildImageSummary = (manifest) => ({
  id: manifest.imageId,
  mediaType: "image",
  imageId: manifest.imageId,
  title: manifest.title,
  description: manifest.description,
  filename: manifest.filename,
  mimeType: manifest.mimeType,
  sha256Hash: manifest.sha256Hash,
  ipfsCid: manifest.ipfsCid,
  ipfsUrl: manifest.ipfsCid ? buildGatewayUrl(manifest.ipfsCid) : null,
  metadataCid: manifest.metadataCid,
  metadataUrl: manifest.metadataCid ? buildGatewayUrl(manifest.metadataCid) : null,
  c2paManifestHash: manifest.c2paManifestHash || null,
  c2paInstanceId: manifest.c2paInstanceId || null,
  c2paSignedAt: manifest.c2paSignedAt || null,
  c2paSigned: manifest.c2paSigned || false,
  c2paStatus: manifest.c2paStatus || "pending",
  c2paEmbedded: true,
  fabricStatus: manifest.fabricStatus || "pending",
  fabricResult: manifest.fabricResult || null,
  fabricError: manifest.fabricError || null,
  fabricCompletedAt: manifest.fabricCompletedAt || null,
  ipfsStatus: manifest.ipfsStatus,
  status: manifest.status,
  createdAt: manifest.createdAt,
  registeredAt: manifest.createdAt,
  ...buildImageForensicSummary(manifest),
});

const buildImageMetadataPayload = (manifest) => {
  const payload = {
    imageId: manifest.imageId,
    title: manifest.title,
    description: manifest.description,
    filename: manifest.filename,
    originalFilename: manifest.originalFilename || null,
    mimeType: manifest.mimeType,
    sha256Hash: manifest.sha256Hash,
    ipfsCid: manifest.ipfsCid,
    createdAt: manifest.createdAt,
    c2paManifestHash: manifest.c2paManifestHash || null,
    c2paInstanceId: manifest.c2paInstanceId || null,
  };
  if (manifest.forensics) {
    payload.forensics = {
      analysisVersion: manifest.forensics.analysisVersion,
      analysisTimestamp: manifest.forensics.analysisTimestamp,
      imageRiskScore: manifest.forensics.imageRiskScore,
      finalLabel: manifest.forensics.finalLabel,
    };
  }
  return payload;
};

// =================================================================
//  VIDEO BACKGROUND PIPELINE
// =================================================================

const syncVideoToIpfsAndChain = async (videoId) => {
  let manifest = readManifest(videoId);
  if (!manifest) return;

  console.log(`[upload] generating C2PA manifests for video ${videoId}...`);
  updateManifest(videoId, (current) => ({ ...current, c2paStatus: "signing" }));

  const c2paResults = await generateAllManifests(
    videoId,
    manifest.segments,
    manifest.title,
    manifest.createdAt
  );

  updateManifest(videoId, (current) => ({
    ...current,
    c2paStatus: c2paResults.every((r) => r.ok) ? "signed" : "partial",
    segments: current.segments.map((item) => {
      const c2pa = c2paResults.find((r) => r.index === item.index);
      if (!c2pa) return item;
      return {
        ...item,
        c2paSigned: Boolean(c2pa.ok),
        c2paManifestHash: c2pa.manifestHash || null,
        c2paInstanceId: c2pa.instanceId || null,
        c2paSignedAt: c2pa.signedAt || null,
        c2paSidecarPath: c2pa.sidecarPath || null,
      };
    }),
  }));

  console.log(
    `[upload] C2PA: ${c2paResults.filter((r) => r.ok).length}/${manifest.totalSegments} signed`
  );

  updateManifest(videoId, (current) => ({
    ...current,
    ipfsStatus: "uploading",
    backgroundError: null,
  }));

  manifest = readManifest(videoId);
  if (!manifest) return;

  const pendingSegments = manifest.segments.filter((seg) => !seg.ipfsCid);

  for (let i = 0; i < pendingSegments.length; i += IPFS_BATCH_SIZE) {
    const batch = pendingSegments.slice(i, i + IPFS_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (seg) => {
        try {
          const ipfsCid = await uploadWithRetry(seg.localPath, seg.filename);
          const ipfsUrl = buildGatewayUrl(ipfsCid);
          updateManifest(videoId, (cur) => ({
            ...cur,
            segments: cur.segments.map((s) =>
              s.index === seg.index ? { ...s, ipfsCid, ipfsUrl } : s
            ),
          }));
        } catch (err) {
          console.error(`[upload] IPFS failed for seg ${seg.index}: ${err.message}`);
        }
      })
    );
    if (i + IPFS_BATCH_SIZE < pendingSegments.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  manifest = readManifest(videoId);
  if (!manifest) return;

  if (manifest.forensics && !manifest.forensicReportCid) {
    const forensicReportCid = await uploadJsonToIPFS(
      buildForensicReportPayload(manifest),
      `forensic_${manifest.videoId}`
    );
    const forensicReportUrl = buildGatewayUrl(forensicReportCid);
    updateManifest(videoId, (cur) => ({ ...cur, forensicReportCid, forensicReportUrl }));
  }

  manifest = readManifest(videoId);
  if (!manifest) return;

  // Pin the C2PA-embedded source MP4 (the video-level "source of
  // record") to IPFS, then drop the local copy - same pattern as
  // segments and images. A failed embed upstream just means there's
  // nothing to pin here; the HLS/segment pipeline is unaffected.
  if (manifest.sourceC2paPath && !manifest.sourceIpfsCid) {
    try {
      const sourceIpfsCid = await uploadVideoSourceToIPFS(manifest.sourceC2paPath, `${videoId}_source.mp4`);
      const sourceIpfsUrl = buildGatewayUrl(sourceIpfsCid);
      updateManifest(videoId, (cur) => ({ ...cur, sourceIpfsCid, sourceIpfsUrl }));
    } catch (err) {
      console.error(`[upload] source MP4 IPFS pin failed for ${videoId}: ${err.message}`);
    } finally {
      fs.unlink(manifest.sourceC2paPath, () => {});
    }
  }

  manifest = readManifest(videoId);
  if (!manifest) return;

  if (manifest.segments.some((s) => !s.ipfsCid)) {
    updateManifest(videoId, (cur) => ({
      ...cur,
      ipfsStatus: "partial",
      fabricStatus: "skipped",
      backgroundError: "Some segments failed to upload to IPFS",
    }));
    return;
  }

  const metadataPayload = buildMetadataPayloadWithForensics(manifest);
  const videoC2paManifest = buildVideoManifest(manifest, c2paResults);
  metadataPayload.c2paVideoManifest = videoC2paManifest;

  // The metadata JSON is registered directly on the Fabric ledger below
  // (see registerVideoProof's `metadata` field) - that's the authoritative
  // copy now, replicated across all 3 orgs' peers, not dependent on any
  // third-party pinning service. Still best-effort-mirroring it to IPFS
  // here gives it a convenient public gateway URL, but a failure (rate
  // limit, quota, outage) must not block registration anymore the way it
  // used to when the CID was the only place the metadata lived.
  const metadataCid = await uploadMetadataToIPFS(metadataPayload);
  const metadataUrl = buildGatewayUrl(metadataCid);

  updateManifest(videoId, (cur) => ({
    ...cur,
    metadataCid,
    metadataUrl,
    ipfsStatus: metadataCid ? "uploaded" : "partial",
  }));

  try {
    updateManifest(videoId, (cur) => ({
      ...cur,
      fabricStatus: "registering",
      fabricError: null,
    }));

    manifest = readManifest(videoId);
    if (!manifest) return;

    const merkleRoot = manifest.merkleRoot || buildMerkleRootFromSegments(manifest.segments);

    const fabricResult = await registerVideoProof({
      videoId: manifest.videoId,
      title: manifest.title,
      metadataCid,
      merkleRoot,
      totalSegments: manifest.totalSegments,
      metadata: metadataPayload,
    });

    console.log("[fabric] RegisterVideoProof success:", fabricResult);

    updateManifest(videoId, (cur) => ({
      ...cur,
      merkleRoot,
      fabricStatus: fabricResult?.skipped ? "skipped" : "ready",
      fabricResult,
      fabricError: null,
    }));
  } catch (fabricErr) {
    console.error("[upload] Fabric RegisterVideoProof failed:", fabricErr.message);

    updateManifest(videoId, (cur) => ({
      ...cur,
      fabricStatus: "degraded",
      fabricError: fabricErr.message,
    }));
  }

  manifest = readManifest(videoId);
  if (!manifest) return;

  const fabricFailed = manifest.fabricStatus === "degraded";

  updateManifest(videoId, (cur) => ({
    ...cur,
    status: "ready",
    backgroundError: fabricFailed
      ? "Fabric ledger registration failed"
      : null,
  }));

  console.log(`[upload] video ${videoId} pipeline complete (fabricStatus=${manifest.fabricStatus})`);
};

// =================================================================
//  IMAGE BACKGROUND PIPELINE  (IPFS-only, zero local persistence)
// =================================================================
//
//  The image bytes never leave the temp uploads/ dir. After IPFS pin
//  succeeds, the temp file is unlinked unconditionally - the canonical
//  copy is content-addressed on IPFS, the verification sidecar is also
//  pinned. This satisfies the thesis claim that "image content lives
//  only on the decentralized network, no central server holds it".
//
//  Caller must pass `tempPath` (multer's req.file.path).
//
const syncImageToIpfsAndChain = async (imageId, opts = {}) => {
  const { tempPath } = opts;

  let manifest = readImageManifest(imageId);
  if (!manifest) return;

  // Step 1: Embed a real, ES256-signed C2PA manifest directly into the
  // image bytes (JUMBF), overwriting tempPath in place. The signed
  // bytes - not the original upload - are what get pinned to IPFS, so
  // the canonical decentralized copy is itself the provenance record.
  console.log(`[upload-image] embedding C2PA manifest for ${imageId}...`);
  updateImageManifest(imageId, (cur) => ({ ...cur, c2paStatus: "signing" }));

  let c2paResult = { ok: false, error: "no temp path supplied" };
  if (tempPath) {
    try {
      const imageBuffer = fs.readFileSync(tempPath);
      c2paResult = await embedImageManifest({
        imageId,
        imageBuffer,
        mimeType: manifest.mimeType,
        title: manifest.title,
        description: manifest.description,
        createdAt: manifest.createdAt,
      });
      if (c2paResult.ok) fs.writeFileSync(tempPath, c2paResult.signedBuffer);
    } catch (err) {
      c2paResult = { ok: false, error: err.message };
    }
  }

  // The pinned/canonical bytes are now the C2PA-embedded ones (if
  // embedding succeeded), not the original upload - recompute the hash
  // that goes on the Fabric ledger so it matches what IPFS actually
  // serves. Otherwise a client hashing the downloaded file would never
  // match the on-chain record.
  const canonicalSha256Hash = c2paResult.ok ? await hashFile(tempPath) : manifest.sha256Hash;

  updateImageManifest(imageId, (cur) => ({
    ...cur,
    sha256Hash: canonicalSha256Hash,
    c2paSigned: Boolean(c2paResult.ok),
    c2paStatus: c2paResult.ok ? "signed" : "failed",
    c2paManifestHash: c2paResult.manifestHash || null,
    c2paInstanceId: c2paResult.instanceId || null,
    c2paSignedAt: c2paResult.signedAt || null,
    c2paError: c2paResult.ok ? null : c2paResult.error,
  }));

  // Step 2: Upload the C2PA-embedded image bytes to IPFS (from temp path).
  console.log(`[upload-image] pinning ${imageId} to IPFS...`);
  updateImageManifest(imageId, (cur) => ({ ...cur, ipfsStatus: "uploading" }));

  let ipfsCid = null;
  if (tempPath) {
    try {
      ipfsCid = await uploadImageToIPFS(tempPath, manifest.filename);
    } catch (err) {
      console.error(`[upload-image] IPFS upload failed: ${err.message}`);
    }
  } else {
    console.error(`[upload-image] no temp path supplied - cannot pin ${imageId}`);
  }

  const ipfsUrl = buildGatewayUrl(ipfsCid);
  updateImageManifest(imageId, (cur) => ({
    ...cur,
    ipfsCid,
    ipfsUrl,
    ipfsStatus: ipfsCid ? "uploaded" : "failed",
  }));

  if (!ipfsCid) {
    updateImageManifest(imageId, (cur) => ({
      ...cur,
      fabricStatus: "skipped",
      backgroundError: "Image upload to IPFS failed",
    }));
    // Pipeline aborts here - still clean up temp file so we don't leak.
    safeUnlink(tempPath);
    return;
  }

  // Step 3: best-effort mirror of the metadata JSON to IPFS (includes
  // forensic summary). The authoritative copy is registered directly on
  // the Fabric ledger below (registerImageProof's `metadata` field), so a
  // failure here (rate limit, quota, outage) only costs the convenience
  // gateway URL, not the registration itself. No separate C2PA sidecar to
  // pin anymore - the manifest is embedded directly in the image bytes
  // already pinned at `ipfsCid` above.
  manifest = readImageManifest(imageId);
  const metadataPayload = buildImageMetadataPayload({ ...manifest, ipfsCid });

  const metadataCid = await uploadImageMetadataToIPFS(metadataPayload);
  const metadataUrl = buildGatewayUrl(metadataCid);
  updateImageManifest(imageId, (cur) => ({ ...cur, metadataCid, metadataUrl }));

  // Step 5: Register image proof on Hyperledger Fabric.
  try {
    updateImageManifest(imageId, (cur) => ({
      ...cur,
      fabricStatus: "registering",
      fabricError: null,
    }));

    manifest = readImageManifest(imageId);

    const fabricResult = await withTimeout(
      registerImageProof({
        imageId,
        title: manifest.title,
        sha256Hash: manifest.sha256Hash,
        ipfsCid,
        metadataCid: metadataCid || "",
        c2paHash: manifest.c2paManifestHash || "",
        metadata: metadataPayload,
      }),
      20000,
      "Fabric RegisterImageProof"
    );

    console.log("[fabric] RegisterImageProof success:", fabricResult);

    updateImageManifest(imageId, (cur) => ({
      ...cur,
      fabricStatus: fabricResult?.skipped ? "skipped" : "ready",
      fabricResult,
      fabricError: null,
      fabricCompletedAt: new Date().toISOString(),
    }));
  } catch (fabricErr) {
    console.error("[upload-image] Fabric RegisterImageProof failed:", fabricErr.message);

    updateImageManifest(imageId, (cur) => ({
      ...cur,
      fabricStatus: "degraded",
      fabricError: fabricErr.message,
      fabricCompletedAt: new Date().toISOString(),
    }));
  }

  manifest = readImageManifest(imageId);

  updateImageManifest(imageId, (cur) => ({
    ...cur,
    status: "ready",
    backgroundError: manifest.fabricStatus === "degraded"
      ? "Fabric ledger registration failed"
      : null,
  }));

  // Step 6: Always delete the temp file. IPFS-only mode is the only mode
  // for images now - the env flag is gone, the local copy is gone, the
  // canonical bytes live on IPFS (CID-addressed) and the Fabric ledger (hash anchor).
  safeUnlink(tempPath);
  updateImageManifest(imageId, (cur) => ({
    ...cur,
    localImageDeleted: true,
    localImageDeletedAt: new Date().toISOString(),
  }));

  console.log(`[upload-image] ${imageId} pipeline complete (fabricStatus=${manifest.fabricStatus}, ipfs-only)`);
};

// Best-effort unlink that never throws and logs at info level if the
// file was already gone. Used for temp-file cleanup in the IPFS-only
// pipeline.
const safeUnlink = (filePath) => {
  if (!filePath) return;
  fs.unlink(filePath, (err) => {
    if (err && err.code !== "ENOENT") {
      console.warn(`[upload-image] could not unlink temp file: ${err.message}`);
    } else if (!err) {
      console.log(`[upload-image] temp file unlinked: ${path.basename(filePath)}`);
    }
  });
};


// =================================================================
//  VIDEO ROUTES
// =================================================================

router.post("/", uploadLimiter, videoUpload, async (req, res) => {
  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];

  if (!videoFile) return res.status(400).json({ error: "Video file is required" });

  const inputPath = videoFile.path;
  const meta = validateMeta(req.body.title, req.body.description, videoFile.originalname);
  if (meta.error) {
    fs.unlink(inputPath, () => {});
    if (thumbnailFile) fs.unlink(thumbnailFile.path, () => {});
    return res.status(400).json({ error: meta.error });
  }
  const { title, description } = meta;
  const videoId = crypto.randomUUID();
  const outputFolder = path.join(streamsDir, videoId);

  fs.mkdirSync(outputFolder, { recursive: true });

  // Move thumbnail (if any) into public/thumbnails/<videoId>.<ext>
  // Served via app.use("/thumbnails", ...) in server.js.
  let thumbnailUrl = null;
  if (thumbnailFile) {
    const allowed = {
      "image/jpeg": ".jpg",
      "image/jpg": ".jpg",
      "image/png": ".png",
      "image/webp": ".webp",
    };
    const ext = allowed[thumbnailFile.mimetype];
    if (ext) {
      const thumbName = `${videoId}${ext}`;
      const thumbPath = path.join(thumbnailsDir, thumbName);
      try {
        fs.renameSync(thumbnailFile.path, thumbPath);
        thumbnailUrl = `/thumbnails/${thumbName}`;
      } catch (err) {
        console.warn(`[upload] could not save thumbnail: ${err.message}`);
        fs.unlink(thumbnailFile.path, () => {});
      }
    } else {
      // Wrong mime — silently drop temp file, continue without thumbnail
      fs.unlink(thumbnailFile.path, () => {});
    }
  }

  const playlistPath = path.join(outputFolder, "playlist.m3u8");
  // -force_key_frames forces an actual keyframe at every N-second boundary
  // so -hls_time's cuts land where requested, instead of drifting to
  // wherever the encoder's own GOP structure happens to place keyframes.
  const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -force_key_frames "expr:gte(t,n_forced*${HLS_SEGMENT_SECONDS})" -hls_time ${HLS_SEGMENT_SECONDS} -hls_playlist_type vod -hls_segment_filename "${outputFolder}/seg_%03d.ts" "${playlistPath}"`;

  try {
    await runFfmpeg(ffmpegCmd);

    const files = fs.readdirSync(outputFolder).filter((f) => f.endsWith(".ts")).sort();
    const segments = [];
    let prevHash = null;

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const localPath = path.join(outputFolder, filename);
      const [sha256Hash, durationSeconds] = await Promise.all([
        hashFile(localPath),
        probeSegmentDuration(localPath),
      ]);
      const chainHash = crypto
        .createHash("sha256")
        .update(Buffer.from(sha256Hash + (prevHash || ""), "hex"))
        .digest("hex");

      segments.push({
        index: i, filename, localPath, sha256Hash, chainHash,
        durationSeconds, ipfsCid: null, ipfsUrl: null,
        c2paSigned: false, c2paManifestHash: null, c2paInstanceId: null,
        c2paSignedAt: null, c2paSidecarPath: null,
      });
      prevHash = sha256Hash;
    }

    let forensicReport = null;
    let forensicStatus = "pending";
    let forensicError = null;
    try {
      forensicReport = await analyzeVideoForensics({
        videoId, videoPath: inputPath, title, totalSegments: segments.length,
      });
      forensicStatus = "ready";
    } catch (forensicErr) {
      forensicStatus = "failed";
      forensicError = forensicErr.message;
      console.error("[upload] forensic analysis error:", forensicErr.message);
    }

    const createdAt = new Date().toISOString();

    // Embed a real, ES256-signed C2PA manifest directly into the
    // original MP4 (a genuinely C2PA-embeddable container, unlike the
    // .ts segments FFmpeg is about to produce from it). The signed copy
    // is written into the video's own stream folder and pinned to IPFS
    // by the background pipeline as the video's "source of record".
    let sourceC2paResult = { ok: false, error: "not attempted" };
    let sourceC2paPath = null;
    let originalSha256 = null;
    try {
      const videoBuffer = fs.readFileSync(inputPath);
      // Digest of the submitter's own file, before anything is embedded into
      // it. The published copy is the C2PA-embedded one (sourceSha256), so
      // without this the uploader verifying their own master would be told
      // it doesn't match - true, but useless. Recorded so /public-verify can
      // recognise a pre-publication master for what it is.
      originalSha256 = crypto.createHash("sha256").update(videoBuffer).digest("hex");
      sourceC2paResult = await embedVideoManifest({ videoId, videoBuffer, title, description, createdAt });
      if (sourceC2paResult.ok) {
        sourceC2paPath = path.join(outputFolder, "source.c2pa.mp4");
        fs.writeFileSync(sourceC2paPath, sourceC2paResult.signedBuffer);
      }
    } catch (err) {
      sourceC2paResult = { ok: false, error: err.message };
    }
    if (!sourceC2paResult.ok) {
      console.error(`[upload] source MP4 C2PA embed failed for ${videoId}: ${sourceC2paResult.error}`);
    }

    const manifest = writeManifest(videoId, {
      kind: "video",
      videoId, title, description,
      createdAt,
      totalSegments: segments.length,
      playlistUrl: `/streams/${videoId}/playlist.m3u8`,
      thumbnailUrl,
      metadataCid: null, metadataUrl: null,
      merkleRoot: null,
      status: "ready", ipfsStatus: "pending",
      fabricStatus: "pending",
      fabricResult: null,
      fabricError: null,
      fabricCompletedAt: null,
      c2paStatus: "pending",
      sourceC2paPath,
      // Digest of the *embedded* source MP4 - the exact bytes pinned to
      // IPFS and handed to viewers. The ledger's own digest for a video is
      // the Merkle root over its HLS segments, which nobody holding just
      // the MP4 can recompute, so this is what /public-verify compares a
      // re-uploaded file against.
      originalSha256,
      sourceSha256: sourceC2paResult.ok
        ? crypto.createHash("sha256").update(sourceC2paResult.signedBuffer).digest("hex")
        : null,
      sourceC2paStatus: sourceC2paResult.ok ? "signed" : "failed",
      sourceC2paManifestHash: sourceC2paResult.manifestHash || null,
      sourceC2paInstanceId: sourceC2paResult.instanceId || null,
      sourceC2paSignedAt: sourceC2paResult.signedAt || null,
      sourceC2paError: sourceC2paResult.ok ? null : sourceC2paResult.error,
      sourceIpfsCid: null, sourceIpfsUrl: null,
      backgroundError: null,
      forensicStatus, forensicError, forensics: forensicReport,
      forensicReportCid: null, forensicReportUrl: null,
      segments,
    });

    res.json({
      message: "Upload complete. C2PA signing, IPFS and blockchain sync running in background.",
      ...buildVideoSummaryWithForensics(manifest),
      forensics: manifest.forensics || null,
    });

    fs.unlink(inputPath, () => {});

    syncVideoToIpfsAndChain(videoId).catch((err) => {
      console.error("[upload] background sync error:", err.message);
      updateManifest(videoId, (cur) => ({
        ...cur,
        ipfsStatus: cur.ipfsStatus === "uploaded" ? cur.ipfsStatus : "partial",
        fabricStatus: cur.fabricStatus === "ready" ? cur.fabricStatus : "degraded",
        backgroundError: err.message,
      }));
    });
  } catch (err) {
    console.error("[upload] processing error:", err.message);
    fs.unlink(inputPath, () => {});
    res.status(500).json({ error: "FFmpeg processing failed." });
  }
});

router.get("/videos", async (req, res) => {
  try {
    res.json(listManifests({ kind: "video" }).map(buildVideoSummaryWithForensics));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/videos/:videoId", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });
  res.json({
    ...buildVideoSummaryWithForensics(manifest),
    backgroundError: manifest.backgroundError,
    forensics: manifest.forensics || null,
  });
});

router.get("/videos/:videoId/forensics", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });
  res.json({
    videoId: manifest.videoId,
    ...buildForensicSummary(manifest),
    forensics: manifest.forensics || null,
  });
});

router.get("/videos/:videoId/segments", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });
  res.json(manifest.segments.map((seg) => ({
    segmentIndex: seg.index,
    sha256Hash: seg.sha256Hash,
    chainHash: seg.chainHash,
    ipfsCid: seg.ipfsCid,
    gatewayUrl: seg.ipfsUrl,
    c2paSigned: seg.c2paSigned || false,
    c2paManifestHash: seg.c2paManifestHash || null,
    c2paInstanceId: seg.c2paInstanceId || null,
    c2paSignedAt: seg.c2paSignedAt || null,
  })));
});

router.get("/ipfs/:videoId/:segmentIndex", async (req, res) => {
  const { segment } = getSegmentFromManifest(req.params.videoId, req.params.segmentIndex);
  if (!segment) return res.status(404).json({ error: "Segment not found" });
  res.json({ segmentIndex: segment.index, ipfsCid: segment.ipfsCid, ipfsUrl: segment.ipfsUrl });
});

router.get("/ipfs-playlist/:videoId", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) return res.status(404).send("Playlist not found");

  let metadata = null;
  if (manifest.metadataCid) metadata = await fetchJsonFromIPFS(manifest.metadataCid);

  const sourceSegments = metadata?.segments?.length
    ? metadata.segments
    : manifest.segments.filter((s) => s.ipfsCid).map((s) => ({ cid: s.ipfsCid, durationSeconds: s.durationSeconds }));

  if (!sourceSegments.length) return res.status(404).send("IPFS playlist not available yet");

  // Per RFC 8216 §4.3.3.1, EXT-X-TARGETDURATION must be an integer >= the
  // longest segment's actual duration - segments only *target*
  // HLS_SEGMENT_SECONDS (see the Segment Duration note in the README),
  // so this has to be computed from what was really measured, not assumed.
  const targetDuration = Math.max(2, Math.ceil(Math.max(...sourceSegments.map((s) => s.durationSeconds || 2))));

  const lines = [
    "#EXTM3U", "#EXT-X-VERSION:3", `#EXT-X-TARGETDURATION:${targetDuration}`,
    "#EXT-X-PLAYLIST-TYPE:VOD", "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  for (const seg of sourceSegments) {
    lines.push(`#EXTINF:${Number(seg.durationSeconds || 2).toFixed(6)},`);
    lines.push(buildGatewayUrl(seg.cid));
  }
  lines.push("#EXT-X-ENDLIST");
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(lines.join(""));
});

router.get("/c2pa/:videoId/:segmentIndex", async (req, res) => {
  const { segment } = getSegmentFromManifest(req.params.videoId, req.params.segmentIndex);
  if (!segment) return res.status(404).json({ error: "Segment not found" });
  const result = readAndVerifyManifest(segment.localPath);
  res.json({
    segmentIndex: segment.index,
    c2paSigned: segment.c2paSigned || false,
    c2paManifestHash: segment.c2paManifestHash || null,
    c2paInstanceId: segment.c2paInstanceId || null,
    c2paSignedAt: segment.c2paSignedAt || null,
    verification: result,
  });
});

// Real embedded-C2PA verification for the video's source MP4 (distinct
// from the per-segment sidecars above): fetches the actual pinned bytes
// from IPFS and runs the full C2PA validation pipeline against them.
router.get("/:videoId/source-c2pa", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });

  let result;
  if (!manifest.sourceIpfsCid) {
    result = { exists: false, valid: false, error: "Source MP4 not yet pinned to IPFS" };
  } else {
    const buffer = await fetchBufferFromIPFS(manifest.sourceIpfsCid);
    result = buffer ? await verifyEmbeddedAsset(buffer, "video/mp4") : { exists: false, valid: false, error: "Failed to fetch source MP4 from IPFS" };
  }

  res.json({
    videoId: manifest.videoId,
    c2paSigned: manifest.sourceC2paStatus === "signed",
    c2paManifestHash: manifest.sourceC2paManifestHash || null,
    c2paInstanceId: manifest.sourceC2paInstanceId || null,
    c2paSignedAt: manifest.sourceC2paSignedAt || null,
    verification: result,
  });
});

// Local hash check (browser-computed hash vs the manifest's stored hash for
// this segment). Chain-side verification against the Fabric ledger is a
// separate call -- see POST /:videoId/verify-fabric -- since Fabric proofs
// are anchored per-video (one merkleRoot covering all segments), not
// per-segment.
router.post("/verify", async (req, res) => {
  const { videoId, segmentIndex, clientHash } = req.body;
  const { manifest, segment } = getSegmentFromManifest(videoId, segmentIndex);
  if (!manifest || !segment) return res.status(404).json({ error: "Segment not found" });

  const isMatch = segment.sha256Hash === clientHash;
  const c2pa = readAndVerifyManifest(segment.localPath);

  res.json({
    isMatch,
    storedHash: segment.sha256Hash,
    ipfsCid: segment.ipfsCid,
    ipfsUrl: segment.ipfsUrl,
    c2pa: {
      signed: segment.c2paSigned || false,
      valid: c2pa.valid || false,
      instanceId: segment.c2paInstanceId || null,
      manifestHash: segment.c2paManifestHash || null,
      signedAt: segment.c2paSignedAt || null,
      signer: c2pa.signer || null,
      assertionsCount: c2pa.assertions_count || 0,
      error: c2pa.error || null,
    },
    playback: { source: manifest.playlistUrl, ipfsReady: Boolean(segment.ipfsCid) },
    status: isMatch ? "verified" : "tampered",
  });
});

// One-click authenticity check: re-hashes the video's stored segment files
// right now and asks the Fabric ledger whether that matches what NewsAgency,
// Broadcaster, and Auditor jointly endorsed at registration time. No manual
// hash entry required -- this checks TrustStream's own copy against the
// immutable record, unlike /verify which checks a hash the caller supplies.
router.post("/:videoId/verify-fabric", async (req, res) => {
  const { videoId } = req.params;
  const manifest = readManifest(videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });

  if (manifest.fabricStatus !== "ready") {
    return res.status(409).json({
      error: "This video has no confirmed Fabric registration to verify against",
      fabricStatus: manifest.fabricStatus || "pending",
    });
  }

  try {
    const missingFile = (manifest.segments || []).find(
      (seg) => !seg.localPath || !fs.existsSync(seg.localPath)
    );
    if (missingFile) {
      return res.status(410).json({
        error: `Segment ${missingFile.index} is no longer available locally to re-hash`,
      });
    }

    const fresh = await recomputeMerkleRootFromDisk(manifest.segments || []);
    const fileIntact = fresh.merkleRoot === manifest.merkleRoot;

    const fabric = await verifyVideoProof(videoId, fresh.merkleRoot);

    res.json({
      currentMerkleRoot: fresh.merkleRoot,
      registeredMerkleRoot: manifest.merkleRoot,
      fileIntact,
      fabric,
      authentic: fileIntact && fabric.available && fabric.valid === true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Tamper reports are whole-video (Fabric proofs are anchored per-video, not
// per-segment) -- segmentIndex is kept in the request/response for the
// caller's context but the chain call itself targets the video as a whole.
router.post("/report-tamper", async (req, res) => {
  const { videoId, segmentIndex } = req.body;
  if (!videoId) {
    return res.status(400).json({ error: "videoId required" });
  }

  const manifest = readManifest(videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });

  console.log(`[upload] tamper report: video=${videoId} seg=${segmentIndex}`);

  updateManifest(videoId, (cur) => ({
    ...cur,
    localTamperReported: true,
    tamperReportedAt: new Date().toISOString(),
  }));

  reportTamper("video", videoId)
    .then((result) => {
      console.log(`[upload] Fabric ReportTamper video=${videoId} status=${result?.status} txId=${result?.txId}`);
      updateManifest(videoId, (cur) => ({
        ...cur,
        status: result?.status === "disputed" ? "disputed" : cur.status,
        fabricTamperResult: result,
      }));
    })
    .catch((err) => console.error("[upload] Fabric tamper report failed:", err.message));

  res.json({ reported: true, videoId, segmentIndex });
});

// Auditor-only recovery from a disputed status back to active.
router.post("/:videoId/clear-dispute", async (req, res) => {
  const { videoId } = req.params;
  const manifest = readManifest(videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });

  try {
    const result = await clearDispute("video", videoId);
    updateManifest(videoId, (cur) => ({
      ...cur,
      status: result?.status === "active" ? "ready" : cur.status,
      fabricTamperResult: result,
    }));
    res.json({ cleared: true, videoId, fabric: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  IMAGE ROUTES
// =================================================================

// POST /api/upload/image - upload a news image (IPFS-only, no local persistence)
router.post("/image", uploadLimiter, imageUpload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image file is required (jpg/png/webp)" });

  const inputPath = req.file.path;            // multer temp path (uploadsDir)
  const originalFilename = req.file.originalname;
  const mimeType = req.file.mimetype;
  const fileSize = req.file.size;
  const meta = validateMeta(req.body.title, req.body.description, originalFilename);
  if (meta.error) {
    fs.unlink(inputPath, () => {});
    return res.status(400).json({ error: meta.error });
  }
  const { title, description } = meta;
  const imageId = crypto.randomUUID();

  const extMap = {
    "image/jpeg": ".jpg",
    "image/jpg":  ".jpg",
    "image/png":  ".png",
    "image/webp": ".webp",
  };
  const ext = extMap[mimeType] || ".jpg";
  // Logical filename (used in C2PA manifest + IPFS pin name). The actual
  // bytes live at `inputPath` until the IPFS pipeline finishes, then the
  // temp file is unlinked - the canonical copy is content-addressed on IPFS.
  const filename = `img_${imageId}${ext}`;

  try {
    const sha256Hash = await hashFile(inputPath);

    // Run image forensics directly on the temp file (no rename needed).
    let forensicReport = null;
    let forensicStatus = "pending";
    let forensicError = null;
    try {
      forensicReport = await analyzeImageForensics({
        imageId,
        imagePath: inputPath,
        title,
      });
      forensicStatus = "ready";
    } catch (forensicErr) {
      forensicStatus = "failed";
      forensicError = forensicErr.message;
      console.error("[upload-image] forensic analysis error:", forensicErr.message);
    }

    const manifest = writeImageManifest(imageId, {
      kind: "image",
      imageId, title, description,
      filename, originalFilename, mimeType,
      // localPath intentionally omitted - image lives only on IPFS once
      // the background pipeline completes. Until then it sits in the
      // uploads/ temp dir (referenced via the closure below).
      localPath: null,
      sha256Hash,
      createdAt: new Date().toISOString(),
      ipfsCid: null, ipfsUrl: null,
      metadataCid: null, metadataUrl: null,
      status: "ready",
      ipfsStatus: "pending",
      fabricStatus: "pending",
      fabricResult: null,
      fabricError: null,
      c2paStatus: "pending",
      c2paSigned: false,
      c2paManifestHash: null,
      c2paInstanceId: null,
      c2paSignedAt: null,
      c2paError: null,
      backgroundError: null,
      forensicStatus, forensicError, forensics: forensicReport,
    });

    res.json({
      message: "Image uploaded. C2PA signing, IPFS and blockchain sync running in background.",
      ...buildImageSummary(manifest),
      forensics: manifest.forensics || null,
    });

    // Hand the temp path to the background pipeline. It will pin to IPFS
    // and unlink the temp file unconditionally when done.
    syncImageToIpfsAndChain(imageId, { tempPath: inputPath, fileSize }).catch((err) => {
      console.error("[upload-image] background sync error:", err.message);
      updateImageManifest(imageId, (cur) => ({
        ...cur,
        ipfsStatus: cur.ipfsStatus === "uploaded" ? cur.ipfsStatus : "failed",
        fabricStatus: cur.fabricStatus === "ready" ? cur.fabricStatus : "degraded",
        backgroundError: err.message,
      }));
      // Last-resort cleanup if the pipeline never reached its own unlink.
      fs.unlink(inputPath, () => {});
    });
  } catch (err) {
    console.error("[upload-image] processing error:", err.message);
    fs.unlink(inputPath, () => {});
    res.status(500).json({ error: "Image processing failed." });
  }
});

router.get("/images", async (req, res) => {
  try {
    res.json(listImageManifests().map(buildImageSummary));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/images/:imageId", async (req, res) => {
  const manifest = readImageManifest(req.params.imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });
  res.json({
    ...buildImageSummary(manifest),
    backgroundError: manifest.backgroundError,
    forensics: manifest.forensics || null,
  });
});

router.get("/images/:imageId/forensics", async (req, res) => {
  const manifest = readImageManifest(req.params.imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });
  res.json({
    imageId: manifest.imageId,
    ...buildImageForensicSummary(manifest),
    forensics: manifest.forensics || null,
  });
});

// Helper: fetch the actual (C2PA-embedded) image bytes from IPFS and run
// the real C2PA validation pipeline against them - signature, cert-chain
// trust, and hash-binding against what IPFS is actually serving right
// now. There is no separate sidecar anymore: the manifest lives inside
// the pinned bytes themselves.
const verifyImageC2pa = async (manifest) => {
  if (!manifest.ipfsCid) return { exists: false, valid: false, error: "Image not yet pinned to IPFS" };
  const buffer = await fetchBufferFromIPFS(manifest.ipfsCid);
  if (!buffer) return { exists: false, valid: false, error: "Failed to fetch image bytes from IPFS" };
  return verifyEmbeddedAsset(buffer, manifest.mimeType);
};

router.get("/images/:imageId/c2pa", async (req, res) => {
  const manifest = readImageManifest(req.params.imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });
  const result = await verifyImageC2pa(manifest);
  res.json({
    imageId: manifest.imageId,
    c2paSigned: manifest.c2paSigned || false,
    c2paManifestHash: manifest.c2paManifestHash || null,
    c2paInstanceId: manifest.c2paInstanceId || null,
    c2paSignedAt: manifest.c2paSignedAt || null,
    verification: result,
  });
});

// Local hash check. Chain-side verification against the Fabric ledger is a
// separate call -- see POST /images/:imageId/verify-fabric.
router.post("/images/verify", async (req, res) => {
  const { imageId, clientHash } = req.body;
  if (!imageId || !clientHash) return res.status(400).json({ error: "imageId and clientHash required" });

  const manifest = readImageManifest(imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });

  const isMatch = manifest.sha256Hash === clientHash;
  const c2pa = await verifyImageC2pa(manifest);

  res.json({
    isMatch,
    storedHash: manifest.sha256Hash,
    ipfsCid: manifest.ipfsCid,
    ipfsUrl: manifest.ipfsUrl,
    c2pa: {
      signed: manifest.c2paSigned || false,
      valid: c2pa.valid || false,
      instanceId: manifest.c2paInstanceId || null,
      manifestHash: manifest.c2paManifestHash || null,
      signedAt: manifest.c2paSignedAt || null,
      signer: c2pa.signer || null,
      assertionsCount: c2pa.assertions_count || 0,
      mediaType: c2pa.media_type || "image",
      error: c2pa.error || null,
    },
    status: isMatch ? "verified" : "tampered",
  });
});

// One-click authenticity check for images: re-fetches the image from IPFS
// (its canonical stored copy), re-hashes it right now, and asks the Fabric
// ledger whether that matches what all three orgs endorsed at registration.
router.post("/images/:imageId/verify-fabric", async (req, res) => {
  const { imageId } = req.params;
  const manifest = readImageManifest(imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });

  if (manifest.fabricStatus !== "ready") {
    return res.status(409).json({
      error: "This image has no confirmed Fabric registration to verify against",
      fabricStatus: manifest.fabricStatus || "pending",
    });
  }

  if (!manifest.ipfsCid) {
    return res.status(410).json({ error: "Image has no IPFS copy to re-hash" });
  }

  try {
    const response = await fetch(buildGatewayUrl(manifest.ipfsCid));
    if (!response.ok) {
      return res.status(502).json({ error: `IPFS gateway returned ${response.status}` });
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const currentHash = crypto.createHash("sha256").update(bytes).digest("hex");
    const fileIntact = currentHash === manifest.sha256Hash;

    const fabric = await verifyImageProof(imageId, currentHash);

    res.json({
      currentHash,
      registeredHash: manifest.sha256Hash,
      fileIntact,
      fabric,
      authentic: fileIntact && fabric.available && fabric.valid === true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/images/report-tamper", async (req, res) => {
  const { imageId } = req.body;
  if (!imageId) return res.status(400).json({ error: "imageId required" });

  const manifest = readImageManifest(imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });

  console.log(`[upload-image] tamper report: ${imageId}`);

  updateImageManifest(imageId, (cur) => ({
    ...cur,
    localTamperReported: true,
    tamperReportedAt: new Date().toISOString(),
  }));

  reportTamper("image", imageId)
    .then((result) => {
      console.log(`[upload-image] Fabric ReportTamper image=${imageId} status=${result?.status} txId=${result?.txId}`);
      updateImageManifest(imageId, (cur) => ({
        ...cur,
        status: result?.status === "disputed" ? "disputed" : cur.status,
        fabricTamperResult: result,
      }));
    })
    .catch((err) => console.error("[upload-image] Fabric tamper report failed:", err.message));

  res.json({ reported: true, imageId });
});

// Auditor-only recovery from a disputed status back to active.
router.post("/images/:imageId/clear-dispute", async (req, res) => {
  const { imageId } = req.params;
  const manifest = readImageManifest(imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });

  try {
    const result = await clearDispute("image", imageId);
    updateImageManifest(imageId, (cur) => ({
      ...cur,
      status: result?.status === "active" ? "ready" : cur.status,
      fabricTamperResult: result,
    }));
    res.json({ cleared: true, imageId, fabric: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  PUBLIC VERIFY BY UPLOAD
//
//  The audience-facing half of the tamper story. Anyone - no login, no
//  passcode - can drop a file here and ask the consortium whether these
//  exact bytes are the ones that were registered.
//
//  Why this can't be faked: a re-encoded, re-cut or pixel-edited copy of
//  a TrustStream asset still carries the embedded C2PA manifest (editors
//  don't know to strip it), but the manifest's hash binding no longer
//  matches the bytes around it, and the file's sha256 no longer matches
//  what the ledger recorded. Both checks fail independently, and neither
//  can be repaired without the consortium's private signing key.
//
//  claimedMediaId is for the case where an editor DID strip the manifest:
//  the viewer names which published item the file claims to be, and the
//  answer becomes a direct digest comparison against that record.
// =================================================================

const publicVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification requests - try again later." },
});

const publicVerifyUpload = multer({
  dest: uploadsDir,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "video/mp4", "video/quicktime"];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error("Only JPG, PNG, WebP images or MP4 video can be verified"));
  },
}).single("file");

// A video's registered digest is the Merkle root over its HLS segments,
// which someone holding only the MP4 can never recompute - so the
// comparable digest is the sha256 of the C2PA-embedded source MP4 that was
// pinned to IPFS. Uploads made before that field existed get it computed
// once from the pinned copy and cached back into the manifest.
const resolveSourceSha256 = async (manifest) => {
  if (manifest.sourceSha256) return manifest.sourceSha256;
  if (!manifest.sourceIpfsCid) return null;
  const buffer = await fetchBufferFromIPFS(manifest.sourceIpfsCid);
  if (!buffer) return null;
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  updateManifest(manifest.videoId, (current) => ({ ...current, sourceSha256: digest }));
  return digest;
};

const mediaIdFromC2pa = (result) => {
  const assertion = result?.manifest?.assertions?.find((a) => a.label === "truststream.consortium");
  const id = assertion?.data?.asset_reference?.media_id;
  return typeof id === "string" && UUID_RE.test(id) ? id : null;
};

router.post("/public-verify", publicVerifyLimiter, publicVerifyUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const tempPath = req.file.path;

  try {
    const buffer = fs.readFileSync(tempPath);
    const uploadedHash = crypto.createHash("sha256").update(buffer).digest("hex");
    const kind = req.file.mimetype.startsWith("video") ? "video" : "image";

    // Read whatever provenance the file itself carries. `valid` here is a
    // real cryptographic result: signature + cert chain + hash binding
    // against these exact bytes, not a lookup of something we stored.
    const embedded = await verifyEmbeddedAsset(buffer, req.file.mimetype);
    const c2pa = {
      present: embedded.exists === true,
      valid: embedded.valid === true,
      validationState: embedded.validation_state || null,
      signer: embedded.signer || null,
      instanceId: embedded.instance_id || null,
      error: embedded.error || null,
    };

    // Identify which published item this file claims to be: the manifest's
    // own asset_reference first, then the viewer's claim, then a pure
    // digest lookup (an untouched original matches here even with no
    // manifest at all).
    const claimedMediaId = typeof req.body?.claimedMediaId === "string" && UUID_RE.test(req.body.claimedMediaId)
      ? req.body.claimedMediaId
      : null;

    // How the record was matched decides how strong a claim the verdict can
    // make. The file naming itself ("manifest") or hashing to a record
    // ("digest") is evidence about THIS file; the viewer picking an item
    // from a dropdown ("claim") is only a question being asked, so a
    // mismatch there means "this isn't that item" - not necessarily "this
    // is an edited copy of it".
    const manifestMediaId = mediaIdFromC2pa(embedded);
    let matchSource = null;
    let claimIgnored = null;

    // Look a claimed id up in BOTH catalogs, not just the one matching the
    // uploaded file's type: someone verifying a video can pick an image
    // from the list by mistake, and silently finding nothing would make the
    // claim vanish without explanation.
    const lookupAnyKind = (id) => {
      const video = readManifest(id);
      if (video) return { manifest: video, kind: "video" };
      const image = readImageManifest(id);
      if (image) return { manifest: image, kind: "image" };
      return null;
    };

    let mediaId = manifestMediaId || claimedMediaId;
    let found = mediaId ? lookupAnyKind(mediaId) : null;

    // A video file can never be the same bytes as an image record, so
    // comparing them answers nothing - say that rather than pretending.
    if (found && found.kind !== kind) {
      claimIgnored = `You compared ${kind === "video" ? "a video" : "an image"} against ${found.kind === "video" ? "a video" : "an image"} record ("${found.manifest.title}") - the two can never have the same digest.`;
      found = null;
      mediaId = null;
    }

    let manifest = found?.manifest || null;
    if (manifest) matchSource = manifestMediaId ? "manifest" : "claim";

    // What the bytes themselves match, independent of anything claimed.
    const digestMatch = kind === "image"
      ? listImageManifests().find((m) => m.sha256Hash === uploadedHash) || null
      : listManifests().find(
          (m) => m.kind === "video" && (m.sourceSha256 === uploadedHash || m.originalSha256 === uploadedHash)
        ) || null;
    const digestMatchId = digestMatch ? digestMatch.imageId || digestMatch.videoId : null;

    // Evidence from the file always beats a guess made in the dropdown: if
    // these bytes are on the ledger under some other record, reporting "not
    // the item you picked" and stopping there would hide the more useful
    // fact that the file is registered at all.
    if (digestMatch && digestMatchId !== mediaId) {
      if (manifest) {
        claimIgnored = `These bytes are on the ledger under a different record ("${digestMatch.title}"), which is stronger evidence than the item you picked - that match is what is shown below.`;
      }
      manifest = digestMatch;
      mediaId = digestMatchId;
      matchSource = "digest";
    } else if (!manifest && digestMatch) {
      manifest = digestMatch;
      mediaId = digestMatchId;
      matchSource = "digest";
    }

    let registeredHash = null;
    let ledger = null;
    let fabric = { checked: false };

    if (manifest) {
      registeredHash = kind === "image" ? manifest.sha256Hash : await resolveSourceSha256(manifest);

      const proof = await queryLedger("GetMediaProof", [kind, mediaId]);
      ledger = proof.available ? proof.results : null;

      // For images the chaincode holds the file digest itself, so the
      // viewer's bytes can be checked against all three orgs' peers
      // directly - the same 3/3 cross-check the approval portals run.
      if (kind === "image") {
        try {
          const [org1, org2, org3] = await Promise.all([
            verifyImageProof(mediaId, uploadedHash, "org1"),
            verifyImageProof(mediaId, uploadedHash, "org2"),
            verifyImageProof(mediaId, uploadedHash, "org3"),
          ]);
          const orgs = { NewsAgency: org1, Broadcaster: org2, Auditor: org3 };
          const agreeing = Object.values(orgs).filter((r) => r.available && r.hashMatches === true).length;
          fabric = { checked: true, agreement: `${agreeing}/3`, hashMatches: agreeing === 3, orgs };
        } catch (err) {
          fabric = { checked: true, error: err.message };
        }
      }
    }

    const hashMatches = Boolean(registeredHash) && registeredHash === uploadedHash;
    // The published copy is the one TrustStream embedded a C2PA manifest
    // into, so its digest differs from the file the submitter originally
    // handed over. Telling an uploader their own master "doesn't match" is
    // technically true and completely useless - recognise it instead.
    const masterDigest = ledger?.metadata?.originalSha256 || manifest?.originalSha256 || null;
    const matchesMaster = Boolean(masterDigest) && masterDigest === uploadedHash;
    // If the bytes themselves line up with the record, the match is no
    // longer just the viewer's guess - say so, rather than telling them
    // "nothing in the file points to this" while showing them a digest
    // that does.
    if (matchSource === "claim" && (hashMatches || matchesMaster)) matchSource = "digest";

    const status = ledger?.status || manifest?.fabricResult?.status || null;

    let verdict;
    if (!manifest && !c2pa.present) {
      verdict = "unregistered";
    } else if (!manifest) {
      verdict = "unknown_record";
    } else if (matchesMaster && !hashMatches) {
      // Checked before the "nothing to compare against" case: recognising
      // the submitter's own master is useful even when the published copy
      // never made it to IPFS.
      verdict = "pre_publication_master";
    } else if (!registeredHash) {
      verdict = "not_comparable";
    } else if (matchSource === "claim" && !hashMatches && !c2pa.present) {
      // Nothing about the file itself points at this record - only the
      // viewer's own comparison does. All that can honestly be said is
      // that it isn't the published item.
      verdict = "claim_mismatch";
    } else if (!hashMatches || (c2pa.present && !c2pa.valid)) {
      verdict = "tampered";
    } else if (status === "revoked") {
      verdict = "revoked";
    } else if (status === "disputed") {
      verdict = "disputed";
    } else if (status && status !== "active") {
      verdict = "pending";
    } else {
      verdict = "authentic";
    }

    const EXPLANATIONS = {
      authentic: "These exact bytes are the ones the consortium registered. The digest matches the ledger record and the embedded C2PA manifest still verifies against this file.",
      tampered: "This file does NOT match what was registered. It carries TrustStream provenance naming this item, but its digest differs from the one on the ledger - so the content has been altered since it was published, even if it looks identical.",
      pre_publication_master: "These are the original bytes that were submitted to TrustStream, before the consortium embedded its provenance manifest into them. The published copy carries that manifest, so the two digests differ by design - this file is genuine, but it is the submitter\'s master, not the published asset.",
      claim_mismatch: "These bytes are not the published item you compared them against. The file carries no TrustStream provenance of its own, so it is either an unrelated file, or a copy that was edited and re-saved hard enough to strip the manifest. Either way, it is not what the consortium published.",
      revoked: "The bytes match a registered item, but the consortium has since revoked it. Do not treat it as published.",
      disputed: "The bytes match a registered item that two organizations have flagged as possibly tampered. It is currently under dispute.",
      pending: "The bytes match a submission that has not finished the Broadcaster and Auditor approval workflow, so it is not published content yet.",
      unknown_record: "This file carries a TrustStream provenance manifest, but this server has no record of the item it names.",
      not_comparable: "A record exists, but no registered digest is available to compare against on this server.",
      unregistered: "No provenance found. This file carries no TrustStream manifest and its digest matches nothing on the ledger - it was never published through TrustStream.",
    };

    res.json({
      verdict,
      explanation: EXPLANATIONS[verdict],
      uploadedFile: {
        name: req.file.originalname,
        sizeBytes: req.file.size,
        mimeType: req.file.mimetype,
        kind,
      },
      hash: {
        uploaded: uploadedHash,
        registered: registeredHash,
        // The digest of the file as the newsroom submitted it, shown
        // alongside the published one so a viewer can see exactly which of
        // the two their copy is - or that it is neither.
        registeredMaster: masterDigest,
        matches: hashMatches,
        // Only set when the file turns out to be the pre-embed master, so
        // the page can show why two genuine files disagree.
        matchesSubmittedMaster: matchesMaster,
        // Whether that comparison came from the ledger itself or only from
        // this server's local catalog - the difference matters to anyone
        // deciding how much the answer is worth.
        masterDigestFrom: matchesMaster ? (ledger?.metadata?.originalSha256 ? "ledger" : "local catalog") : null,
      },
      c2pa,
      fabric,
      match: { source: matchSource, claimIgnored },
      record: manifest
        ? {
            mediaId,
            kind,
            title: manifest.title || null,
            createdAt: manifest.createdAt || null,
            registeredBy: ledger?.createdBy || "Org1MSP",
            status,
            detailUrl: kind === "image" ? `/image/${mediaId}` : `/video/${mediaId}`,
          }
        : null,
      ledger,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    // Verification never keeps the viewer's file - it only ever needed the
    // digest.
    fs.promises.unlink(tempPath).catch(() => {});
  }
});

// Lightweight list of published items, so the verify page can offer "which
// published item does this file claim to be?" for files whose C2PA manifest
// an editor stripped.
router.get("/public-verify/published", (req, res) => {
  const items = [
    ...listManifests()
      .filter((m) => m.kind === "video" && m.fabricResult?.status === "active")
      .map((m) => ({ mediaId: m.videoId, kind: "video", title: m.title, createdAt: m.createdAt })),
    ...listImageManifests()
      .filter((m) => m.fabricResult?.status === "active")
      .map((m) => ({ mediaId: m.imageId, kind: "image", title: m.title, createdAt: m.createdAt })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ items });
});

// =================================================================
//  ORG APPROVAL PORTALS (Broadcaster, Auditor)
//
//  Sequential workflow enforced by the chaincode itself (see
//  ApproveByBroadcaster/ApproveByAuditor in index.js): a submission sits
//  in "pending_broadcaster" until Broadcaster approves it (moving it to
//  "pending_auditor"), then in "pending_auditor" until Auditor approves
//  it (moving it to "active"). Each approval/rejection here is submitted
//  with that org's OWN Fabric identity (see fabric.service.js's
//  getFabricContract("org2"/"org3")) - the chaincode checks
//  ctx.clientIdentity.getMSPID() itself, so this can't be spoofed by
//  calling the wrong route.
//
//  Access is a single shared passcode per org (BROADCASTER_PORTAL_PASSCODE/
//  AUDITOR_PORTAL_PASSCODE env vars) - a deliberately simple gate, not a
//  full per-user auth system. Good enough to demonstrate that a distinct
//  party is approving distinct content; not meant to survive a real
//  multi-tenant deployment. See README.
// =================================================================

const requireOrgPasscode = (envVarName) => (req, res, next) => {
  const expected = process.env[envVarName];
  if (!expected) return res.status(503).json({ error: "Portal not configured on this server" });
  if (req.headers["x-org-passcode"] !== expected) {
    return res.status(401).json({ error: "Invalid passcode" });
  }
  next();
};

// Ledger entries only carry what the chaincode itself stores (title,
// metadataCid, timestamps). Enriching with the local catalog's
// thumbnail/description gives the queue a recognizable card instead of a
// bare ID - falls back gracefully to ledger-only fields if a local
// manifest isn't found (e.g. a machine recovered purely via
// sync-from-blockchain).
const enrichPendingEntry = (entry) => {
  const proof = entry.value || entry;
  const { mediaType, mediaId } = proof;
  const manifest = mediaType === "video" ? readManifest(mediaId) : readImageManifest(mediaId);

  return {
    mediaType,
    mediaId,
    title: proof.title,
    createdAt: proof.createdAt,
    createdBy: proof.createdBy,
    status: proof.status,
    thumbnailUrl: manifest?.thumbnailUrl || null,
    ipfsCid: manifest?.ipfsCid || null,
    description: manifest?.description || null,
    detailUrl: mediaType === "image" ? `/image/${mediaId}` : `/video/${mediaId}`,
  };
};

// Systematic pre-approval integrity check for the Broadcaster/Auditor
// portals - reuses the exact re-hash + Fabric-ledger + C2PA verification
// the detail page's "Check Authenticity" button runs, so an org reviewing
// its queue sees objective pass/fail signals instead of approving on
// title and thumbnail alone.
const runIntegrityCheck = async (mediaType, mediaId) => {
  const manifest = mediaType === "image" ? readImageManifest(mediaId) : readManifest(mediaId);
  if (!manifest) return { error: `${mediaType === "image" ? "Image" : "Video"} not found` };

  let hash = { checked: false };
  let currentDigest = null;

  if (mediaType === "image") {
    if (!manifest.ipfsCid) {
      hash = { checked: true, fileIntact: false, error: "Image has no IPFS copy to re-hash" };
    } else {
      try {
        const response = await fetch(buildGatewayUrl(manifest.ipfsCid));
        if (!response.ok) throw new Error(`IPFS gateway returned ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        currentDigest = crypto.createHash("sha256").update(bytes).digest("hex");
        hash = {
          checked: true,
          fileIntact: currentDigest === manifest.sha256Hash,
          current: currentDigest,
          registered: manifest.sha256Hash,
        };
      } catch (err) {
        hash = { checked: true, fileIntact: false, error: err.message };
      }
    }
  } else {
    const missingFile = (manifest.segments || []).find(
      (seg) => !seg.localPath || !fs.existsSync(seg.localPath)
    );
    if (missingFile) {
      hash = { checked: true, fileIntact: false, error: `Segment ${missingFile.index} is no longer available locally to re-hash` };
    } else {
      try {
        const fresh = await recomputeMerkleRootFromDisk(manifest.segments || []);
        currentDigest = fresh.merkleRoot;
        hash = {
          checked: true,
          fileIntact: currentDigest === manifest.merkleRoot,
          current: currentDigest,
          registered: manifest.merkleRoot,
        };
      } catch (err) {
        hash = { checked: true, fileIntact: false, error: err.message };
      }
    }
  }

  let fabric = { checked: false };
  if (manifest.fabricStatus !== "ready") {
    fabric = { checked: true, valid: false, error: "No confirmed Fabric registration to verify against" };
  } else if (currentDigest) {
    try {
      // Query all 3 orgs' peers independently instead of trusting Org1
      // alone - the endorsement policy already required all 3 to agree at
      // write time, but this project has hit a real case where a peer's
      // own CouchDB drifted from the others (see the canonicalJSON fix),
      // so a single-peer read isn't a complete guarantee on its own.
      const [org1, org2, org3] = await Promise.all([
        mediaType === "image" ? verifyImageProof(mediaId, currentDigest, "org1") : verifyVideoProof(mediaId, currentDigest, "org1"),
        mediaType === "image" ? verifyImageProof(mediaId, currentDigest, "org2") : verifyVideoProof(mediaId, currentDigest, "org2"),
        mediaType === "image" ? verifyImageProof(mediaId, currentDigest, "org3") : verifyVideoProof(mediaId, currentDigest, "org3"),
      ]);

      const orgResults = { NewsAgency: org1, Broadcaster: org2, Auditor: org3 };
      const integrityOk = (r) => r.available && r.hashMatches === true && r.revoked !== true;
      const agreeingOrgs = Object.entries(orgResults).filter(([, r]) => integrityOk(r)).map(([name]) => name);
      const disagreeingOrgs = Object.entries(orgResults).filter(([, r]) => !integrityOk(r)).map(([name]) => name);

      fabric = {
        checked: true,
        valid: disagreeingOrgs.length === 0,
        agreement: `${agreeingOrgs.length}/3`,
        disagreeingOrgs,
        orgs: orgResults,
      };
    } catch (err) {
      fabric = { checked: true, valid: false, error: err.message };
    }
  } else {
    fabric = { checked: true, valid: false, error: "Skipped - file could not be re-hashed" };
  }

  let c2pa = { checked: true, signed: false, valid: false, error: null };
  try {
    if (mediaType === "image") {
      c2pa.signed = manifest.c2paSigned || false;
      const result = await verifyImageC2pa(manifest);
      c2pa.valid = result.valid === true;
      c2pa.error = result.error || (c2pa.signed ? null : "Not C2PA-signed");
    } else {
      c2pa.signed = manifest.sourceC2paStatus === "signed";
      if (!manifest.sourceIpfsCid) {
        c2pa.error = "Source MP4 not yet pinned to IPFS";
      } else {
        const buffer = await fetchBufferFromIPFS(manifest.sourceIpfsCid);
        const result = buffer
          ? await verifyEmbeddedAsset(buffer, "video/mp4")
          : { valid: false, error: "Failed to fetch source MP4 from IPFS" };
        c2pa.valid = result.valid === true;
        c2pa.error = result.error || null;
      }
    }
  } catch (err) {
    c2pa.checked = true;
    c2pa.valid = false;
    c2pa.error = err.message;
  }

  // Hash/Fabric/C2PA only prove the file hasn't been altered since it was
  // registered - they say nothing about whether the content itself is
  // genuine (a deepfake or pre-manipulated clip would pass all three
  // forever, since nothing about it changes after upload). The forensic
  // verdict computed at upload time (see forensics.service.js /
  // image-forensics.service.js) is the actual content-authenticity signal,
  // so it belongs alongside the integrity checks here, not left buried
  // off-portal where Broadcaster/Auditor could approve a "Likely
  // Manipulated" item without ever seeing that label.
  const forensicsReady = manifest.forensicStatus === "ready";
  const forensics = {
    checked: forensicsReady,
    label: forensicsReady ? manifest.forensics?.finalLabel || null : null,
    riskScore: forensicsReady
      ? (mediaType === "image" ? manifest.forensics?.imageRiskScore : manifest.forensics?.videoRiskScore) ?? null
      : null,
  };
  const forensicsOk = forensics.checked && forensics.label === "Authentic";

  return {
    hash,
    fabric,
    c2pa,
    forensics,
    passed: hash.fileIntact === true && fabric.valid === true && c2pa.signed === true && c2pa.valid === true && forensicsOk,
  };
};

// When the pre-approval check fails, an org shouldn't just silently
// reject - it needs something it can file, attach to a rejection, or hand
// to the other org. This assembles exactly that: every signal, which ones
// failed and why, and the ledger record as it stood at review time.
const buildReviewReport = async (reviewer, mediaType, mediaId) => {
  const check = await runIntegrityCheck(mediaType, mediaId);
  if (check.error) return check;

  const manifest = mediaType === "image" ? readImageManifest(mediaId) : readManifest(mediaId);

  const findings = [];
  if (check.hash.fileIntact !== true) {
    findings.push({
      signal: "Hash",
      detail: check.hash.error
        || `Re-hashing the stored file produced ${check.hash.current}, but ${check.hash.registered} was registered - the content has changed since registration.`,
    });
  }
  if (check.fabric.valid !== true) {
    findings.push({
      signal: "Fabric",
      detail: check.fabric.error
        || `Only ${check.fabric.agreement} organizations' peers confirm this record. Disagreeing: ${(check.fabric.disagreeingOrgs || []).join(", ") || "unknown"}.`,
    });
  }
  if (check.c2pa.signed !== true || check.c2pa.valid !== true) {
    findings.push({
      signal: "C2PA",
      detail: check.c2pa.error
        || (check.c2pa.signed ? "The embedded manifest did not verify against the current bytes." : "No C2PA manifest is attached to this media."),
    });
  }
  if (check.forensics.label !== "Authentic") {
    findings.push({
      signal: "Forensics",
      detail: check.forensics.checked
        ? `Upload-time forensic verdict was "${check.forensics.label}" (risk score ${check.forensics.riskScore}).`
        : "Forensic analysis has not completed for this item.",
    });
  }

  return {
    reportId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    reviewer,
    verdict: check.passed ? "PASS" : "FAIL",
    recommendation: check.passed
      ? "All four signals passed. Safe to forward to the next stage of the approval workflow."
      : "One or more signals failed. Reject, or approve only after verifying the item by other means - the findings below should accompany that decision.",
    media: {
      mediaType,
      mediaId,
      title: manifest?.title || null,
      description: manifest?.description || null,
      submittedAt: manifest?.createdAt || null,
      submittedBy: manifest?.fabricResult?.createdBy || "Org1MSP",
      ledgerStatus: manifest?.fabricResult?.status || null,
      channel: process.env.FABRIC_CHANNEL_NAME || "mychannel",
      chaincode: process.env.FABRIC_CHAINCODE_NAME || "truststreamcc",
    },
    checks: check,
    findings,
  };
};

router.post("/broadcaster/login", portalLimiter, (req, res) => {
  if (req.body?.passcode !== process.env.BROADCASTER_PORTAL_PASSCODE) {
    return res.status(401).json({ error: "Invalid passcode" });
  }
  res.json({ ok: true });
});

router.get("/broadcaster/pending", portalDataLimiter, requireOrgPasscode("BROADCASTER_PORTAL_PASSCODE"), async (req, res) => {
  const result = await queryPendingBroadcaster();
  if (!result.available) return res.status(503).json({ error: result.reason });
  res.json({ items: (result.results || []).map(enrichPendingEntry) });
});

router.get("/broadcaster/:mediaType/:mediaId/check", portalDataLimiter, requireOrgPasscode("BROADCASTER_PORTAL_PASSCODE"), async (req, res) => {
  const result = await runIntegrityCheck(req.params.mediaType, req.params.mediaId);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

router.get("/broadcaster/:mediaType/:mediaId/report", portalDataLimiter, requireOrgPasscode("BROADCASTER_PORTAL_PASSCODE"), async (req, res) => {
  const report = await buildReviewReport("Broadcaster", req.params.mediaType, req.params.mediaId);
  if (report.error) return res.status(404).json(report);
  res.json(report);
});

// The chain itself is always the source of truth (confirmed by the
// approve/reject call's own return value), but /feed, /stats, and the
// detail pages all read the local catalog cache, not the chain directly -
// same reasoning as every other write route in this file. Without this,
// an approval would succeed on-chain while the UI kept showing the old
// pending status until the next sync-from-blockchain.
const syncMediaResultToLocalCatalog = (mediaType, mediaId, result) => {
  if (mediaType === "image") {
    updateImageManifest(mediaId, (cur) => ({ ...cur, fabricResult: result }));
  } else {
    updateManifest(mediaId, (cur) => ({ ...cur, fabricResult: result }));
  }
};

router.post("/broadcaster/:mediaType/:mediaId/approve", portalLimiter, requireOrgPasscode("BROADCASTER_PORTAL_PASSCODE"), async (req, res) => {
  try {
    const result = await approveByBroadcaster(req.params.mediaType, req.params.mediaId);
    syncMediaResultToLocalCatalog(req.params.mediaType, req.params.mediaId, result);
    res.json({ approved: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/broadcaster/:mediaType/:mediaId/reject", portalLimiter, requireOrgPasscode("BROADCASTER_PORTAL_PASSCODE"), async (req, res) => {
  try {
    const result = await rejectByBroadcaster(req.params.mediaType, req.params.mediaId, req.body?.reason);
    syncMediaResultToLocalCatalog(req.params.mediaType, req.params.mediaId, result);
    res.json({ rejected: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/auditor/login", portalLimiter, (req, res) => {
  if (req.body?.passcode !== process.env.AUDITOR_PORTAL_PASSCODE) {
    return res.status(401).json({ error: "Invalid passcode" });
  }
  res.json({ ok: true });
});

router.get("/auditor/pending", portalDataLimiter, requireOrgPasscode("AUDITOR_PORTAL_PASSCODE"), async (req, res) => {
  const result = await queryPendingAuditor();
  if (!result.available) return res.status(503).json({ error: result.reason });
  res.json({ items: (result.results || []).map(enrichPendingEntry) });
});

router.get("/auditor/:mediaType/:mediaId/check", portalDataLimiter, requireOrgPasscode("AUDITOR_PORTAL_PASSCODE"), async (req, res) => {
  const result = await runIntegrityCheck(req.params.mediaType, req.params.mediaId);
  if (result.error) return res.status(404).json(result);
  res.json(result);
});

router.get("/auditor/:mediaType/:mediaId/report", portalDataLimiter, requireOrgPasscode("AUDITOR_PORTAL_PASSCODE"), async (req, res) => {
  const report = await buildReviewReport("Auditor", req.params.mediaType, req.params.mediaId);
  if (report.error) return res.status(404).json(report);
  res.json(report);
});

router.post("/auditor/:mediaType/:mediaId/approve", portalLimiter, requireOrgPasscode("AUDITOR_PORTAL_PASSCODE"), async (req, res) => {
  try {
    const result = await approveByAuditor(req.params.mediaType, req.params.mediaId);
    syncMediaResultToLocalCatalog(req.params.mediaType, req.params.mediaId, result);
    res.json({ approved: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/auditor/:mediaType/:mediaId/reject", portalLimiter, requireOrgPasscode("AUDITOR_PORTAL_PASSCODE"), async (req, res) => {
  try {
    const result = await rejectByAuditor(req.params.mediaType, req.params.mediaId, req.body?.reason);
    syncMediaResultToLocalCatalog(req.params.mediaType, req.params.mediaId, result);
    res.json({ rejected: true, result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// =================================================================
//  PLATFORM STATISTICS
//  Aggregates real numbers across the whole catalog for the frontend
//  analytics dashboard - every figure here is computed from actual
//  stored manifests, nothing simulated or placeholder.
// =================================================================

const RISK_BUCKETS = ["0.0-0.1", "0.1-0.2", "0.2-0.3", "0.3-0.4", "0.4-0.5", "0.5-0.6", "0.6-0.7", "0.7-0.8", "0.8-0.9", "0.9-1.0"];
const riskBucketIndex = (score) => Math.min(9, Math.max(0, Math.floor(Number(score) * 10)));

router.get("/stats", async (req, res) => {
  try {
    const videos = listManifests({ kind: "video" });
    const images = listImageManifests();
    const all = [...videos, ...images];

    const verdictBreakdown = { Authentic: 0, Suspicious: 0, "Likely Manipulated": 0, Pending: 0 };
    const riskHistogram = RISK_BUCKETS.map((bucket) => ({ bucket, count: 0 }));
    const fabricStatusBreakdown = {};
    const uploadsByDay = {};
    let riskSum = 0, riskCount = 0;

    for (const item of all) {
      const label = item.forensics?.finalLabel;
      if (label && verdictBreakdown[label] !== undefined) verdictBreakdown[label]++;
      else verdictBreakdown.Pending++;

      const riskScore = item.kind === "video" ? item.forensics?.videoRiskScore : item.forensics?.imageRiskScore;
      if (typeof riskScore === "number") {
        riskHistogram[riskBucketIndex(riskScore)].count++;
        riskSum += riskScore;
        riskCount++;
      }

      const fabricStatus = item.fabricResult?.status || item.fabricStatus || "pending";
      fabricStatusBreakdown[fabricStatus] = (fabricStatusBreakdown[fabricStatus] || 0) + 1;

      const day = (item.createdAt || "").slice(0, 10);
      if (day) {
        uploadsByDay[day] = uploadsByDay[day] || { date: day, videos: 0, images: 0 };
        uploadsByDay[day][item.kind === "video" ? "videos" : "images"]++;
      }
    }

    const uploadsOverTime = Object.values(uploadsByDay).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      totals: { videos: videos.length, images: images.length, total: all.length },
      verdictBreakdown,
      riskHistogram,
      averageRiskScore: riskCount ? riskSum / riskCount : null,
      fabricStatusBreakdown,
      uploadsOverTime,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  UNIFIED FEED ROUTE
//  Returns videos + images sorted by createdAt (Facebook-style), with
//  server-side search, media-type/status filtering, and pagination.
// =================================================================

const FEED_LIMIT_MAX = 50;
const FEED_LIMIT_DEFAULT = 10;

router.get("/feed", async (req, res) => {
  try {
    const { search = "", mediaType = "all", status = "all" } = req.query;

    const videos = listManifests({ kind: "video" }).map(buildVideoSummaryWithForensics);
    const images = listImageManifests().map(buildImageSummary);

    let feed = [...videos, ...images].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    const q = String(search).trim().toLowerCase();
    if (q) {
      feed = feed.filter((item) =>
        (item.title || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q)
      );
    }

    // Content that hasn't finished the Broadcaster -> Auditor approval
    // workflow yet isn't something a public reader should see, the same way
    // a real newsroom wouldn't publish an unapproved draft. Excluded from
    // every view except an explicit ?status=pending request.
    //
    // This is an ALLOWLIST of genuinely public post-approval states, not a
    // blocklist of known-pending ones - an item whose Fabric registration
    // was itself skipped or failed (e.g. an earlier IPFS upload step
    // aborted the pipeline before RegisterVideoProof/RegisterImageProof
    // was ever called) has no fabricResult at all, so a blocklist keyed on
    // fabricResult.status would never catch it and it would leak onto the
    // feed exactly as if it were normal published content - never having
    // gone through Broadcaster/Auditor at all rather than merely waiting
    // on them.
    const PENDING_STATUSES = ["pending_broadcaster", "pending_auditor"];
    const PUBLIC_STATUSES = ["active", "disputed", "revoked"];
    const isPending = (item) =>
      PENDING_STATUSES.includes(item.fabricResult?.status) ||
      (item.fabricStatus !== "ready" && item.fabricResult?.status !== "rejected");
    const isPublic = (item) => PUBLIC_STATUSES.includes(item.fabricResult?.status);

    if (status !== "pending") {
      feed = feed.filter(isPublic);
    }

    // Counts reflect the search filter but not the mediaType/status pills
    // themselves, so the pill labels ("Video (N)") stay meaningful no
    // matter which pill is currently selected.
    const counts = {
      all: feed.length,
      video: feed.filter((i) => i.mediaType === "video").length,
      image: feed.filter((i) => i.mediaType === "image").length,
    };

    if (mediaType === "video" || mediaType === "image") {
      feed = feed.filter((item) => item.mediaType === mediaType);
    }

    if (status === "disputed") {
      feed = feed.filter((item) => item.fabricResult?.status === "disputed");
    } else if (status === "revoked") {
      feed = feed.filter((item) => item.fabricResult?.status === "revoked");
    } else if (status === "pending") {
      feed = feed.filter(isPending);
    } else if (status === "verified") {
      feed = feed.filter((item) =>
        item.fabricStatus === "ready" &&
        item.fabricResult?.status === "active"
      );
    }

    const total = feed.length;
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || FEED_LIMIT_DEFAULT, 1), FEED_LIMIT_MAX);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const start = (page - 1) * limit;
    const pageItems = feed.slice(start, start + limit);

    res.json({
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasMore: start + limit < total,
      counts,
      feed: pageItems,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  FABRIC AUDIT DASHBOARD
//  Lists every media item's Hyperledger Fabric registration record
//  (endorsements, which peer endorsed per org, proof hash) so the
//  consortium's ledger activity is browsable without a peer CLI.
// =================================================================

const FABRIC_ORG_NAME_BY_MSP = {
  Org1MSP: "NewsAgency",
  Org2MSP: "Broadcaster",
  Org3MSP: "Auditor",
};

router.get("/blockchain/fabric-audit", async (req, res) => {
  try {
    const videos = listManifests({ kind: "video" }).map(buildVideoSummary);
    const images = listImageManifests().map(buildImageSummary);

    const entries = [...videos, ...images]
      .filter((m) => m.fabricStatus && m.fabricStatus !== "pending")
      .map((m) => ({
        id: m.id,
        mediaType: m.mediaType,
        title: m.title || m.id,
        registeredAt: m.registeredAt,
        fabricStatus: m.fabricStatus,
        fabricError: m.fabricError || null,
        proofHash: m.mediaType === "video" ? m.merkleRoot : m.sha256Hash,
        createdByMsp: m.fabricResult?.createdBy || null,
        createdByOrg: FABRIC_ORG_NAME_BY_MSP[m.fabricResult?.createdBy] || null,
        endorsements: m.fabricResult?.endorsements || null,
        endorsingPeers: m.fabricResult?.endorsingPeers || null,
        txId: m.fabricResult?.txId || null,
        blockNumber: m.fabricResult?.blockNumber || null,
        disputed: m.fabricResult?.status === "disputed",
        tamperReports: m.fabricResult?.tamperReports || null,
        revoked: m.status === "revoked",
        revokedAt: m.revokedAt || null,
        revocationReason: m.revocationReason || null,
        // Full raw ledger document, for anyone who wants to see exactly
        // what's actually stored on the chaincode's state (CouchDB) rather
        // than this dashboard's derived summary fields above.
        rawProof: m.fabricResult || null,
      }))
      .sort((a, b) => new Date(b.registeredAt) - new Date(a.registeredAt));

    res.json({
      summary: {
        total: entries.length,
        ready: entries.filter((e) => e.fabricStatus === "ready").length,
        degraded: entries.filter((e) => e.fabricStatus === "degraded").length,
        skipped: entries.filter((e) => e.fabricStatus === "skipped").length,
        disputed: entries.filter((e) => e.disputed).length,
      },
      entries,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  REVOCATION  (Hyperledger Fabric)
//
//  Revoking withdraws the consortium's endorsement. It never deletes the
//  record: the ledger keeps the original registration, and this writes a
//  revocation on top of it, so the fact that it was once vouched for stays
//  visible and auditable via GetMediaHistory.
// =================================================================

const revokeMedia = async ({ kind, id, reason }) => {
  const isVideo = kind === "video";

  const manifest = isVideo ? readManifest(id) : readImageManifest(id);
  if (!manifest) return { notFound: true };

  if (manifest.status === "revoked") {
    return { alreadyRevoked: true };
  }

  const revokedAt = new Date().toISOString();

  // Local catalog first so the UI reflects the decision immediately; the
  // ledger is then updated and its outcome recorded.
  const applyLocal = (extra) => {
    const updater = (cur) => ({ ...cur, ...extra });
    return isVideo ? updateManifest(id, updater) : updateImageManifest(id, updater);
  };

  applyLocal({ status: "revoked", revokedAt, revocationReason: reason || "" });

  const fabric = await revokeMediaProof(kind, id, reason).catch((err) => ({ error: err.message }));

  applyLocal({
    revocation: fabric,
    fabricRevoked: !fabric?.error && !fabric?.skipped,
  });

  return { revoked: true, kind, id, revokedAt, fabric };
};

// Revocation is permanent - the chaincode has no way back from "revoked" -
// and media IDs are public (they're in every feed response), so an open
// endpoint would let anyone on the internet kill any item with one curl.
// Gated behind the Auditor's passcode, the same x-org-passcode header the
// Auditor portal already sends; portalLimiter bounds passcode guessing.
const requireRevokeAuth = [portalLimiter, requireOrgPasscode("AUDITOR_PORTAL_PASSCODE")];

router.post("/:videoId/revoke", requireRevokeAuth, async (req, res) => {
  try {
    const result = await revokeMedia({
      kind: "video",
      id: req.params.videoId,
      reason: req.body?.reason,
    });

    if (result.notFound) return res.status(404).json({ error: "Video not found" });
    if (result.alreadyRevoked)
      return res.status(409).json({ error: "This video is already revoked" });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/images/:imageId/revoke", requireRevokeAuth, async (req, res) => {
  try {
    const result = await revokeMedia({
      kind: "image",
      id: req.params.imageId,
      reason: req.body?.reason,
    });

    if (result.notFound) return res.status(404).json({ error: "Image not found" });
    if (result.alreadyRevoked)
      return res.status(409).json({ error: "This image is already revoked" });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  FABRIC LEDGER HISTORY + RICH QUERY
// =================================================================

// Every version of this record on the ledger, each with the transaction that
// produced it -- read from the history index, not from current state.
router.get("/blockchain/fabric-history/:kind/:id", async (req, res) => {
  const { kind, id } = req.params;

  if (kind !== "video" && kind !== "image") {
    return res.status(400).json({ error: "kind must be 'video' or 'image'" });
  }

  try {
    res.json(await getMediaHistory(kind, id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CouchDB-backed queries over the ledger's current state.
//   ?by=org&value=Org2MSP   ?by=type&value=video   ?by=revoked
router.get("/blockchain/fabric-query", async (req, res) => {
  const { by, value } = req.query;

  const lookup = {
    org: () => queryLedger("QueryByOrg", [value]),
    type: () => queryLedger("QueryByMediaType", [value]),
    revoked: () => queryLedger("QueryRevoked"),
  }[by];

  if (!lookup) {
    return res.status(400).json({ error: "by must be one of: org, type, revoked" });
  }

  if (by !== "revoked" && !value) {
    return res.status(400).json({ error: `value is required when by=${by}` });
  }

  try {
    res.json(await lookup());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Server-Sent Events stream of Fabric chaincode events. The dashboard opens
// this once and gets pushed every new registration as its block commits, so it
// stays current without polling.
//
// SSE (not WebSockets) because the traffic is one-way and EventSource
// reconnects on its own if the backend restarts.
router.get("/blockchain/fabric-events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Without this, nginx-style proxies buffer the stream and nothing arrives
    // until the connection closes.
    "X-Accel-Buffering": "no",
  });

  const send = (type, data) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);

  send("ready", getEventStreamStatus());

  const onRegistered = (payload) => send("MediaRegistered", payload);
  const onRevoked = (payload) => send("MediaRevoked", payload);
  fabricEvents.on("MediaRegistered", onRegistered);
  fabricEvents.on("MediaRevoked", onRevoked);

  // Idle proxies drop connections they think are dead; a comment line keeps
  // this one warm without showing up as an event on the client.
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    fabricEvents.off("MediaRegistered", onRegistered);
    fabricEvents.off("MediaRevoked", onRevoked);
  });
});

// =================================================================
//  BLOCKCHAIN HELPER ROUTES (video)
// =================================================================

router.get("/blockchain/revocation-timeline", async (req, res) => {
  try {
    const result = await buildRevocationTimeline({
      kind: req.query.kind,
      id: req.query.id,
    });

    if (result.error) {
      return res.status(result.status || 500).json({ error: result.error });
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  SYNC FROM BLOCKCHAIN (recovers both videos AND images from Fabric)
// =================================================================

router.post("/sync-from-blockchain", async (req, res) => {
  try {
    console.log("[sync] starting full decentralized sync (Fabric ledger + IPFS)...");

    const [videoQuery, imageQuery] = await Promise.all([
      queryLedger("QueryByMediaType", ["video"]),
      queryLedger("QueryByMediaType", ["image"]),
    ]);

    const videoProofs = videoQuery.available ? videoQuery.results || [] : [];
    const imageProofs = imageQuery.available ? imageQuery.results || [] : [];

    if (!videoProofs.length && !imageProofs.length) {
      return res.json({ message: "No media found on the Fabric ledger.", synced: [], failed: [] });
    }

    const synced = [], failed = [];

    // ── Sync Videos ──────────────────────────────────────
    for (const { value: proof } of videoProofs) {
      const videoId = proof.mediaId;
      try {
        const existing = readManifest(videoId);
        if (existing) {
          synced.push({ videoId, title: existing.title, mediaType: "video", status: "already_exists" });
          continue;
        }

        let ipfsMetadata = null;
        if (proof.metadataCid) {
          try { ipfsMetadata = await fetchJsonFromIPFS(proof.metadataCid); } catch {}
        }

        const totalSegments = proof.totalSegments || ipfsMetadata?.segments?.length || 0;

        const segments = Array.from({ length: totalSegments }, (_, i) => {
          const ipfsSeg = ipfsMetadata?.segments?.[i];
          return {
            index: i,
            filename: ipfsSeg?.filename || `seg_${String(i).padStart(3, "0")}.ts`,
            localPath: path.join(streamsDir, videoId, `seg_${String(i).padStart(3, "0")}.ts`),
            sha256Hash: ipfsSeg?.sha256Hash || null,
            chainHash: ipfsSeg?.chainHash || null,
            durationSeconds: ipfsSeg?.durationSeconds || 2,
            ipfsCid: ipfsSeg?.cid || null,
            ipfsUrl: ipfsSeg?.cid ? buildGatewayUrl(ipfsSeg.cid) : null,
            c2paSigned: Boolean(ipfsSeg?.c2paManifestHash),
            c2paManifestHash: ipfsSeg?.c2paManifestHash || null,
            c2paInstanceId: ipfsSeg?.c2paInstanceId || null,
            c2paSignedAt: ipfsSeg?.c2paSignedAt || null,
          };
        });

        const metadataForensics = ipfsMetadata?.forensics || null;

        const manifest = writeManifest(videoId, {
          kind: "video",
          videoId,
          title: proof.title || ipfsMetadata?.title || "Untitled",
          description: ipfsMetadata?.description || "",
          createdAt: proof.createdAt || new Date().toISOString(),
          totalSegments,
          playlistUrl: ipfsMetadata?.playlistUrl || `/streams/${videoId}/playlist.m3u8`,
          metadataCid: proof.metadataCid || null,
          metadataUrl: proof.metadataCid ? buildGatewayUrl(proof.metadataCid) : null,
          merkleRoot: proof.merkleRoot || null,
          status: proof.status === "disputed" ? "disputed" : proof.status === "revoked" ? "revoked" : "synced_from_chain",
          ipfsStatus: ipfsMetadata ? "uploaded" : "unknown",
          fabricStatus: "ready",
          fabricResult: proof,
          fabricError: null,
          c2paStatus: ipfsMetadata?.segments?.[0]?.c2paManifestHash ? "signed" : "unknown",
          backgroundError: null,
          syncedFromBlockchain: true,
          syncedFromIPFS: Boolean(ipfsMetadata),
          forensicStatus: metadataForensics ? "ready" : "unknown",
          forensicError: null,
          forensics: metadataForensics ? {
            analysisVersion: metadataForensics.analysisVersion || null,
            analysisTimestamp: metadataForensics.analysisTimestamp || null,
            videoRiskScore: metadataForensics.videoRiskScore ?? null,
            finalLabel: metadataForensics.finalLabel || null,
          } : null,
          forensicReportCid: metadataForensics?.forensicReportCid || null,
          forensicReportUrl: metadataForensics?.forensicReportUrl || null,
          segments,
        });

        synced.push({ videoId, title: manifest.title, mediaType: "video", status: "synced", source: ipfsMetadata ? "fabric+ipfs" : "fabric_only" });
      } catch (err) {
        failed.push({ videoId, error: err.message });
      }
    }

    // ── Sync Images ──────────────────────────────────────
    for (const { value: proof } of imageProofs) {
      const imageId = proof.mediaId;
      try {
        const existing = readImageManifest(imageId);
        if (existing) {
          synced.push({ imageId, title: existing.title, mediaType: "image", status: "already_exists" });
          continue;
        }

        let ipfsMetadata = null;
        if (proof.metadataCid) {
          try { ipfsMetadata = await fetchJsonFromIPFS(proof.metadataCid); } catch {}
        }

        const metadataForensics = ipfsMetadata?.forensics || null;

        const manifest = writeImageManifest(imageId, {
          kind: "image",
          imageId,
          title: proof.title || ipfsMetadata?.title || "Untitled",
          description: ipfsMetadata?.description || "",
          filename: ipfsMetadata?.filename || `img_${imageId}.jpg`,
          originalFilename: ipfsMetadata?.originalFilename || null,
          mimeType: ipfsMetadata?.mimeType || "image/jpeg",
          // IPFS-only mode: no local file. The C2PA manifest is embedded
          // in the pinned image bytes themselves (ipfsCid), not a sidecar.
          localPath: null,
          sha256Hash: proof.sha256Hash || ipfsMetadata?.sha256Hash || null,
          createdAt: proof.createdAt || new Date().toISOString(),
          ipfsCid: proof.ipfsCid || ipfsMetadata?.ipfsCid || null,
          ipfsUrl: proof.ipfsCid ? buildGatewayUrl(proof.ipfsCid) : null,
          metadataCid: proof.metadataCid || null,
          metadataUrl: proof.metadataCid ? buildGatewayUrl(proof.metadataCid) : null,
          status: proof.status === "disputed" ? "disputed" : proof.status === "revoked" ? "revoked" : "synced_from_chain",
          ipfsStatus: ipfsMetadata ? "uploaded" : "unknown",
          fabricStatus: "ready",
          fabricResult: proof,
          fabricError: null,
          c2paStatus: ipfsMetadata?.c2paManifestHash ? "signed" : "unknown",
          c2paSigned: Boolean(ipfsMetadata?.c2paManifestHash),
          c2paManifestHash: proof.c2paHash || ipfsMetadata?.c2paManifestHash || null,
          c2paInstanceId: ipfsMetadata?.c2paInstanceId || null,
          c2paSignedAt: null,
          backgroundError: null,
          syncedFromBlockchain: true,
          syncedFromIPFS: Boolean(ipfsMetadata),
          forensicStatus: metadataForensics ? "ready" : "unknown",
          forensicError: null,
          forensics: metadataForensics ? {
            analysisVersion: metadataForensics.analysisVersion || null,
            analysisTimestamp: metadataForensics.analysisTimestamp || null,
            imageRiskScore: metadataForensics.imageRiskScore ?? null,
            finalLabel: metadataForensics.finalLabel || null,
          } : null,
        });

        synced.push({ imageId, title: manifest.title, mediaType: "image", status: "synced", source: ipfsMetadata ? "fabric+ipfs" : "fabric_only" });
      } catch (err) {
        failed.push({ imageId, error: err.message });
      }
    }

    res.json({
      message: `Sync complete. ${synced.length} synced, ${failed.length} failed.`,
      synced,
      failed,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
