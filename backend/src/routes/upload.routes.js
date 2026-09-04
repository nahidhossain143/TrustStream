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
const { exec } = require("child_process");

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

// Public, unauthenticated verify-by-upload endpoint - tighter than the
// admin upload limiter since anyone on the internet can hit it.
const publicVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many verification requests - try again in a few minutes." },
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

// Public verify-by-upload: any image or MP4, capped smaller than the
// authenticated upload limits since this is unauthenticated and
// abuse-prone (repeated large uploads just to run a lookup).
const verifyUpload = multer({
  dest: uploadsDir,
  fileFilter: (_req, file, cb) => {
    // .ts HLS segments have no reliable standard MIME type across
    // browsers/tools (video/mp2t, video/mp2ts, application/octet-stream
    // are all seen in the wild) - allowed here so someone verifying a
    // raw downloaded segment still reaches the hash-fallback check,
    // even though it can never carry an embedded C2PA manifest itself.
    const allowed = [
      "image/jpeg", "image/jpg", "image/png", "image/webp",
      "video/mp4", "video/mp2t", "video/mp2ts", "application/octet-stream",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type for verification"));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 },
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

// =================================================================
//  VIDEO SUMMARY HELPERS
// =================================================================

const buildMetadataPayload = (manifest) => ({
  videoId: manifest.videoId,
  title: manifest.title,
  description: manifest.description,
  createdAt: manifest.createdAt,
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

  const metadataCid = await uploadMetadataToIPFS(metadataPayload);
  const metadataUrl = buildGatewayUrl(metadataCid);

  updateManifest(videoId, (cur) => ({
    ...cur,
    metadataCid,
    metadataUrl,
    ipfsStatus: metadataCid ? "uploaded" : "partial",
  }));

  if (!metadataCid) {
    updateManifest(videoId, (cur) => ({
      ...cur,
      fabricStatus: "skipped",
      backgroundError: "Metadata upload to IPFS failed",
    }));
    return;
  }

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

  // Step 3: Upload metadata JSON to IPFS (includes forensic summary).
  // No separate C2PA sidecar to pin anymore - the manifest is embedded
  // directly in the image bytes already pinned at `ipfsCid` above.
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
  const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -hls_time 2 -hls_playlist_type vod -hls_segment_filename "${outputFolder}/seg_%03d.ts" "${playlistPath}"`;

  try {
    await runFfmpeg(ffmpegCmd);

    const files = fs.readdirSync(outputFolder).filter((f) => f.endsWith(".ts")).sort();
    const segments = [];
    let prevHash = null;

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const localPath = path.join(outputFolder, filename);
      const sha256Hash = await hashFile(localPath);
      const chainHash = crypto
        .createHash("sha256")
        .update(Buffer.from(sha256Hash + (prevHash || ""), "hex"))
        .digest("hex");

      segments.push({
        index: i, filename, localPath, sha256Hash, chainHash,
        durationSeconds: 2, ipfsCid: null, ipfsUrl: null,
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
    try {
      const videoBuffer = fs.readFileSync(inputPath);
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

  const lines = [
    "#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:2",
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
//  PUBLIC VERIFY-BY-UPLOAD
//
//  No login required - anyone can drop in a file and find out whether
//  it's something TrustStream has on record. Two independent checks:
//
//  1. Embedded C2PA (images + video source MP4 - see c2pa.service.js):
//     the file is genuinely self-describing, so this works even on a
//     copy that was never re-uploaded to TrustStream - re-run the real
//     C2PA validation pipeline directly against the uploaded bytes, then
//     parse the manifest's instance_id (urn:truststream:image:<id> or
//     urn:truststream:<id>:source) to look up the matching catalog entry.
//  2. Hash fallback: if there's no embedded manifest (e.g. a raw .ts
//     HLS segment, which was never C2PA-embeddable to begin with - see
//     c2pa.service.js's file header), fall back to an exact SHA-256
//     match against stored image/segment hashes.
// =================================================================

const parseTrustStreamInstanceId = (instanceId) => {
  if (!instanceId) return null;
  const imageMatch = instanceId.match(/^urn:truststream:image:([0-9a-f-]+)$/i);
  if (imageMatch) return { mediaType: "image", id: imageMatch[1] };
  const videoMatch = instanceId.match(/^urn:truststream:([0-9a-f-]+):source$/i);
  if (videoMatch) return { mediaType: "video", id: videoMatch[1] };
  return null;
};

const findByHash = (sha256Hash) => {
  const image = listImageManifests().find((m) => m.sha256Hash === sha256Hash);
  if (image) return { mediaType: "image", id: image.imageId, title: image.title };

  const videos = listManifests({ kind: "video" });
  for (const video of videos) {
    const segment = (video.segments || []).find((s) => s.sha256Hash === sha256Hash);
    if (segment) return { mediaType: "video", id: video.videoId, title: video.title, segmentIndex: segment.index };
  }
  return null;
};

router.post("/public-verify", publicVerifyLimiter, verifyUpload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A file is required" });
  const { path: inputPath, mimetype } = req.file;

  try {
    const buffer = fs.readFileSync(inputPath);
    const sha256Hash = crypto.createHash("sha256").update(buffer).digest("hex");

    let c2pa = null;
    let match = null;

    if (mimetype === "image/jpeg" || mimetype === "image/jpg" || mimetype === "image/png" || mimetype === "video/mp4") {
      c2pa = await verifyEmbeddedAsset(buffer, mimetype);
      if (c2pa?.exists) {
        const parsed = parseTrustStreamInstanceId(c2pa.instance_id);
        if (parsed?.mediaType === "image") {
          const manifest = readImageManifest(parsed.id);
          if (manifest) match = { mediaType: "image", id: parsed.id, title: manifest.title, manifest };
        } else if (parsed?.mediaType === "video") {
          const manifest = readManifest(parsed.id);
          if (manifest) match = { mediaType: "video", id: parsed.id, title: manifest.title, manifest };
        }
      }
    }

    if (!match) {
      const hashMatch = findByHash(sha256Hash);
      if (hashMatch) {
        const manifest = hashMatch.mediaType === "image" ? readImageManifest(hashMatch.id) : readManifest(hashMatch.id);
        match = { ...hashMatch, manifest };
      }
    }

    const matchType = match
      ? (c2pa?.valid && parseTrustStreamInstanceId(c2pa?.instance_id) ? "embedded-c2pa" : "hash-match")
      : "none";

    res.json({
      matched: Boolean(match),
      matchType,
      sha256Hash,
      c2pa: c2pa ? {
        exists: c2pa.exists,
        valid: c2pa.valid,
        validation_state: c2pa.validation_state,
        signer: c2pa.signer,
        signer_org: c2pa.signer_org,
        algorithm: c2pa.algorithm,
        actions: c2pa.actions,
        error: c2pa.error,
      } : null,
      match: match ? {
        mediaType: match.mediaType,
        id: match.id,
        title: match.title,
        createdAt: match.manifest?.createdAt || null,
        fabricStatus: match.manifest?.fabricStatus || null,
        status: match.manifest?.fabricResult?.status || match.manifest?.status || null,
        detailUrl: match.mediaType === "image" ? `/image/${match.id}` : `/video/${match.id}`,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    fs.unlink(inputPath, () => {});
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
    } else if (status === "verified") {
      feed = feed.filter((item) =>
        item.fabricStatus === "ready" &&
        item.fabricResult?.status !== "disputed" &&
        item.fabricResult?.status !== "revoked"
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

router.post("/:videoId/revoke", async (req, res) => {
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

router.post("/images/:imageId/revoke", async (req, res) => {
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
