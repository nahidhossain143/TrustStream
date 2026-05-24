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
  registerVideoOnChain,
  registerAndEndorseBatch,
  verifyOnChain,
  getEndorsementsFromChain,
  getTxLogsFromChain,
  getVideoFromChain,
  getTxReceipt,
  getNetworkStatus,
  getWalletBalances,
  reportTamperOnChain,
  registerAndEndorseImage,
  getImageFromChain,
  getImageEndorsementsFromChain,
  reportImageTamperOnChain,
} = require("../services/blockchain.service");

const {
  uploadSegmentToIPFS,
  uploadMetadataToIPFS,
  uploadJsonToIPFS,
  uploadImageToIPFS,
  uploadImageMetadataToIPFS,
  uploadImageC2paToIPFS,
  buildGatewayUrl,
  fetchJsonFromIPFS,
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
  generateImageManifest,
  readAndVerifyImageManifest,
  verifyImageManifestObject,
} = require("../services/c2pa.service");

const { analyzeVideoForensics } = require("../services/forensics.service");
const { analyzeImageForensics } = require("../services/image-forensics.service");

const router = express.Router();

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
    txHash: segment.txHash || null,
    blockNumber: segment.blockNumber || null,
    gasUsed: segment.totalGasUsed || null,
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
  thumbnailUrl: manifest.thumbnailUrl || null,
  status: manifest.status,
  ipfsStatus: manifest.ipfsStatus,
  blockchainStatus: manifest.blockchainStatus,
  c2paStatus: manifest.c2paStatus || "pending",
  videoTxHash: manifest.videoTxHash || null,
  videoBlockNumber: manifest.videoBlockNumber || null,
  totalGasUsed: manifest.totalGasUsed || null,
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
  c2paSidecarCid: manifest.c2paSidecarCid || null,
  c2paSidecarUrl: manifest.c2paSidecarUrl || null,
  endorsementCount: manifest.endorsementCount || 0,
  fullyEndorsed: manifest.fullyEndorsed || false,
  blockchainStatus: manifest.blockchainStatus,
  ipfsStatus: manifest.ipfsStatus,
  status: manifest.status,
  txHash: manifest.txHash || null,
  blockNumber: manifest.blockNumber || null,
  totalGasUsed: manifest.totalGasUsed || null,
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
    c2paSidecarCid: manifest.c2paSidecarCid || null,
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

  if (manifest.segments.some((s) => !s.ipfsCid)) {
    updateManifest(videoId, (cur) => ({
      ...cur,
      ipfsStatus: "partial",
      blockchainStatus: "skipped",
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
      blockchainStatus: "skipped",
      backgroundError: "Metadata upload to IPFS failed",
    }));
    return;
  }

  updateManifest(videoId, (cur) => ({ ...cur, blockchainStatus: "registering" }));

  manifest = readManifest(videoId);
  if (!manifest) return;

  const registerVideoResult = await registerVideoOnChain(
    manifest.videoId,
    manifest.title,
    metadataCid,
    manifest.totalSegments
  );

  if (!registerVideoResult?.ok) {
    updateManifest(videoId, (cur) => ({
      ...cur,
      blockchainStatus: registerVideoResult?.skipped ? "skipped" : "degraded",
      backgroundError: registerVideoResult?.error || null,
    }));
    return;
  }

  const videoTxReceipt = registerVideoResult.txReceipt;
  updateManifest(videoId, (cur) => ({
    ...cur,
    videoTxHash: videoTxReceipt?.txHash || null,
    videoBlockNumber: videoTxReceipt?.blockNumber || null,
    videoTxEtherscan: videoTxReceipt?.etherscanUrl || null,
    videoTxGasUsed: videoTxReceipt?.gasUsed || null,
  }));

  const batchResults = await registerAndEndorseBatch(
    manifest.videoId,
    manifest.segments.map((seg) => ({
      index: seg.index,
      sha256Hash: seg.sha256Hash,
      chainHash: seg.chainHash,
      ipfsCid: seg.ipfsCid,
      c2paManifestHash: seg.c2paManifestHash || "",
      c2paInstanceId: seg.c2paInstanceId || "",
    }))
  );

  let totalGasUsed = videoTxReceipt?.gasUsed || 0;

  updateManifest(videoId, (cur) => ({
    ...cur,
    segments: cur.segments.map((item) => {
      const result = batchResults.find((e) => e.index === item.index);
      if (!result) return item;
      totalGasUsed += result.totalGasUsed || 0;
      return {
        ...item,
        blockchainRegistered: Boolean(result.ok),
        endorsementCount: result.endorsementCount || 0,
        fullyEndorsed: Boolean(result.fullyEndorsed),
        blockchainError: result.ok ? null : result.error || null,
        txHash: result.txReceipts?.register?.txHash || null,
        txHashBroadcaster: result.txReceipts?.broadcaster?.txHash || null,
        txHashAuditor: result.txReceipts?.auditor?.txHash || null,
        blockNumber: result.blockNumber || null,
        gasUsedRegister: result.txReceipts?.register?.gasUsed || null,
        gasUsedBroadcaster: result.txReceipts?.broadcaster?.gasUsed || null,
        gasUsedAuditor: result.txReceipts?.auditor?.gasUsed || null,
        totalGasUsed: result.totalGasUsed || null,
        etherscanRegister: result.txReceipts?.register?.etherscanUrl || null,
        etherscanBroadcaster: result.txReceipts?.broadcaster?.etherscanUrl || null,
        etherscanAuditor: result.txReceipts?.auditor?.etherscanUrl || null,
      };
    }),
  }));

  manifest = readManifest(videoId);
  if (!manifest) return;

  const hasChainFailures = manifest.segments.some(
    (s) => s.blockchainRegistered === false
  );

  updateManifest(videoId, (cur) => ({
    ...cur,
    status: "ready",
    blockchainStatus: hasChainFailures ? "degraded" : "ready",
    totalGasUsed,
    backgroundError: hasChainFailures
      ? "Some segments were not registered on-chain"
      : null,
  }));

  console.log(`[upload] video ${videoId} pipeline complete (gas=${totalGasUsed})`);
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
//  Caller must pass `tempPath` (multer's req.file.path) and ideally
//  `fileSize` so C2PA can record the size before the file is deleted.
//
const syncImageToIpfsAndChain = async (imageId, opts = {}) => {
  const { tempPath, fileSize } = opts;

  let manifest = readImageManifest(imageId);
  if (!manifest) return;

  // Step 1: Generate C2PA manifest in-memory (no disk write).
  console.log(`[upload-image] generating C2PA manifest for ${imageId}...`);
  updateImageManifest(imageId, (cur) => ({ ...cur, c2paStatus: "signing" }));

  const c2paResult = await generateImageManifest({
    imageId,
    filename: manifest.filename,
    localPath: tempPath || null,        // used only to read fileSize
    fileSize: fileSize ?? null,
    sha256Hash: manifest.sha256Hash,
    ipfsCid: null,                      // image not yet pinned
    title: manifest.title,
    description: manifest.description,
    createdAt: manifest.createdAt,
    originalFilename: manifest.originalFilename,
    mimeType: manifest.mimeType,
  });

  updateImageManifest(imageId, (cur) => ({
    ...cur,
    c2paSigned: Boolean(c2paResult.ok),
    c2paStatus: c2paResult.ok ? "signed" : "failed",
    c2paManifestHash: c2paResult.manifestHash || null,
    c2paInstanceId: c2paResult.instanceId || null,
    c2paSignedAt: c2paResult.signedAt || null,
    c2paSidecarPath: null,              // never written to disk
  }));

  // Step 2: Upload image bytes to IPFS (from temp path).
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
      blockchainStatus: "skipped",
      backgroundError: "Image upload to IPFS failed",
    }));
    // Pipeline aborts here - still clean up temp file so we don't leak.
    safeUnlink(tempPath);
    return;
  }

  // Step 3: Pin C2PA sidecar JSON to IPFS so verification can fetch it
  // without any local file. CID stored in manifest for later lookup.
  let c2paSidecarCid = null;
  if (c2paResult.ok && c2paResult.signedManifest) {
    try {
      c2paSidecarCid = await uploadImageC2paToIPFS(c2paResult.signedManifest, imageId);
    } catch (err) {
      console.error(`[upload-image] C2PA sidecar pin failed: ${err.message}`);
    }
  }
  const c2paSidecarUrl = buildGatewayUrl(c2paSidecarCid);
  updateImageManifest(imageId, (cur) => ({
    ...cur,
    c2paSidecarCid,
    c2paSidecarUrl,
  }));

  // Step 4: Upload metadata JSON to IPFS (includes forensic summary +
  // sidecar CID so a single fetch reaches everything else).
  manifest = readImageManifest(imageId);
  const metadataPayload = buildImageMetadataPayload({ ...manifest, ipfsCid });
  if (c2paSidecarCid) metadataPayload.c2paSidecarCid = c2paSidecarCid;

  const metadataCid = await uploadImageMetadataToIPFS(metadataPayload);
  const metadataUrl = buildGatewayUrl(metadataCid);
  updateImageManifest(imageId, (cur) => ({ ...cur, metadataCid, metadataUrl }));

  // Step 5: Register on blockchain + 2 endorsements (3-org consortium).
  console.log(`[upload-image] registering ${imageId} on blockchain...`);
  updateImageManifest(imageId, (cur) => ({ ...cur, blockchainStatus: "registering" }));

  manifest = readImageManifest(imageId);

  const chainResult = await registerAndEndorseImage(
    imageId,
    manifest.title,
    manifest.description,
    manifest.sha256Hash,
    ipfsCid,
    metadataCid || "",
    manifest.c2paManifestHash || "",
    manifest.c2paInstanceId || ""
  );

  const txRegister = chainResult.txReceipts?.register;
  const txBroadcaster = chainResult.txReceipts?.broadcaster;
  const txAuditor = chainResult.txReceipts?.auditor;

  updateImageManifest(imageId, (cur) => ({
    ...cur,
    status: "ready",
    blockchainStatus: chainResult.ok ? "ready" : "degraded",
    blockchainError: chainResult.ok ? null : chainResult.error,
    endorsementCount: chainResult.endorsementCount || 0,
    fullyEndorsed: chainResult.fullyEndorsed || false,
    txHash: txRegister?.txHash || null,
    txHashBroadcaster: txBroadcaster?.txHash || null,
    txHashAuditor: txAuditor?.txHash || null,
    blockNumber: chainResult.blockNumber || null,
    totalGasUsed: chainResult.totalGasUsed || null,
    etherscanRegister: txRegister?.etherscanUrl || null,
    etherscanBroadcaster: txBroadcaster?.etherscanUrl || null,
    etherscanAuditor: txAuditor?.etherscanUrl || null,
    backgroundError: chainResult.ok ? null : chainResult.error,
  }));

  // Step 6: Always delete the temp file. IPFS-only mode is the only mode
  // for images now - the env flag is gone, the local copy is gone, the
  // canonical bytes live on IPFS (CID-addressed) and Ethereum (hash anchor).
  safeUnlink(tempPath);
  updateImageManifest(imageId, (cur) => ({
    ...cur,
    localImageDeleted: true,
    localImageDeletedAt: new Date().toISOString(),
  }));

  console.log(
    `[upload-image] ${imageId} pipeline complete (gas=${chainResult.totalGasUsed || 0}, ipfs-only)`
  );
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

router.post("/", videoUpload, async (req, res) => {
  const videoFile = req.files?.video?.[0];
  const thumbnailFile = req.files?.thumbnail?.[0];

  if (!videoFile) return res.status(400).json({ error: "Video file is required" });

  const inputPath = videoFile.path;
  const title = req.body.title || videoFile.originalname;
  const description = req.body.description || "";
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
        blockchainRegistered: false, endorsementCount: 0, fullyEndorsed: false,
        c2paSigned: false, c2paManifestHash: null, c2paInstanceId: null,
        c2paSignedAt: null, c2paSidecarPath: null,
        txHash: null, txHashBroadcaster: null, txHashAuditor: null,
        blockNumber: null, totalGasUsed: null,
        etherscanRegister: null, etherscanBroadcaster: null, etherscanAuditor: null,
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

    const manifest = writeManifest(videoId, {
      kind: "video",
      videoId, title, description,
      createdAt: new Date().toISOString(),
      totalSegments: segments.length,
      playlistUrl: `/streams/${videoId}/playlist.m3u8`,
      thumbnailUrl,
      metadataCid: null, metadataUrl: null,
      status: "ready", ipfsStatus: "pending",
      blockchainStatus: "pending", c2paStatus: "pending",
      backgroundError: null,
      videoTxHash: null, videoBlockNumber: null,
      videoTxEtherscan: null, totalGasUsed: null,
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
        blockchainStatus: cur.blockchainStatus === "ready" ? cur.blockchainStatus : "degraded",
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
    endorsementCount: seg.endorsementCount,
    fullyEndorsed: seg.fullyEndorsed,
    blockchainRegistered: seg.blockchainRegistered,
    c2paSigned: seg.c2paSigned || false,
    c2paManifestHash: seg.c2paManifestHash || null,
    c2paInstanceId: seg.c2paInstanceId || null,
    c2paSignedAt: seg.c2paSignedAt || null,
    txHash: seg.txHash || null,
    blockNumber: seg.blockNumber || null,
    totalGasUsed: seg.totalGasUsed || null,
    etherscanRegister: seg.etherscanRegister || null,
    etherscanBroadcaster: seg.etherscanBroadcaster || null,
    etherscanAuditor: seg.etherscanAuditor || null,
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

router.post("/verify", async (req, res) => {
  const { videoId, segmentIndex, clientHash } = req.body;
  const { manifest, segment } = getSegmentFromManifest(videoId, segmentIndex);
  if (!manifest || !segment) return res.status(404).json({ error: "Segment not found" });

  const isMatch = segment.sha256Hash === clientHash;
  const blockchain = segment.blockchainRegistered
    ? await verifyOnChain(videoId, segmentIndex, clientHash)
    : {
        available: false, hashMatch: null,
        fullyEndorsed: segment.fullyEndorsed || null,
        endorsementCount: segment.endorsementCount || 0,
        error: manifest.blockchainStatus === "pending"
          ? "Blockchain registration still running"
          : "Segment not registered on-chain",
      };

  const c2pa = readAndVerifyManifest(segment.localPath);

  res.json({
    isMatch,
    storedHash: segment.sha256Hash,
    ipfsCid: segment.ipfsCid,
    ipfsUrl: segment.ipfsUrl,
    blockchain,
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
    txInfo: {
      txHash: segment.txHash || null,
      blockNumber: segment.blockNumber || null,
      totalGasUsed: segment.totalGasUsed || null,
      etherscanRegister: segment.etherscanRegister || null,
      etherscanBroadcaster: segment.etherscanBroadcaster || null,
      etherscanAuditor: segment.etherscanAuditor || null,
    },
    playback: { source: manifest.playlistUrl, ipfsReady: Boolean(segment.ipfsCid) },
    status: isMatch ? "verified" : "tampered",
  });
});

router.post("/report-tamper", async (req, res) => {
  const { videoId, segmentIndex } = req.body;
  if (!videoId || segmentIndex === undefined) {
    return res.status(400).json({ error: "videoId and segmentIndex required" });
  }

  const manifest = readManifest(videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });

  console.log(`[upload] tamper report: video=${videoId} seg=${segmentIndex}`);

  updateManifest(videoId, (cur) => ({
    ...cur,
    segments: cur.segments.map((s) =>
      s.index === Number(segmentIndex)
        ? { ...s, localTamperReported: true, tamperReportedAt: new Date().toISOString() }
        : s
    ),
  }));

  reportTamperOnChain(videoId, Number(segmentIndex))
    .then((result) => {
      if (result.ok) {
        console.log(`[upload] tamper on-chain seg=${segmentIndex} tx=${result.txHash?.slice(0, 16)}...`);
        updateManifest(videoId, (cur) => ({
          ...cur,
          segments: cur.segments.map((s) =>
            s.index === Number(segmentIndex)
              ? { ...s, tamperTxHash: result.txHash, tamperBlockNumber: result.blockNumber }
              : s
          ),
        }));
      }
    })
    .catch((err) => console.error("[upload] on-chain tamper report failed:", err.message));

  res.json({ reported: true, videoId, segmentIndex });
});

// (Part 3 next - reply with "next")

// =================================================================
//  IMAGE ROUTES
// =================================================================

// POST /api/upload/image - upload a news image (IPFS-only, no local persistence)
router.post("/image", imageUpload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Image file is required (jpg/png/webp)" });

  const inputPath = req.file.path;            // multer temp path (uploadsDir)
  const originalFilename = req.file.originalname;
  const mimeType = req.file.mimetype;
  const fileSize = req.file.size;
  const title = req.body.title || originalFilename;
  const description = req.body.description || "";
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
      c2paSidecarCid: null, c2paSidecarUrl: null,   // ← NEW: sidecar lives on IPFS
      status: "ready",
      ipfsStatus: "pending",
      blockchainStatus: "pending",
      c2paStatus: "pending",
      c2paSigned: false,
      c2paManifestHash: null,
      c2paInstanceId: null,
      c2paSignedAt: null,
      c2paSidecarPath: null,                        // legacy field, always null in IPFS-only mode
      endorsementCount: 0,
      fullyEndorsed: false,
      txHash: null,
      txHashBroadcaster: null,
      txHashAuditor: null,
      blockNumber: null,
      totalGasUsed: null,
      etherscanRegister: null,
      etherscanBroadcaster: null,
      etherscanAuditor: null,
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
        blockchainStatus: cur.blockchainStatus === "ready" ? cur.blockchainStatus : "degraded",
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

// Helper: fetch + verify the C2PA image sidecar from IPFS.
// Falls back to the legacy local-disk path if the manifest predates the
// IPFS-only migration (older uploads still have a sidecar on disk).
const verifyImageSidecar = async (manifest) => {
  if (manifest.c2paSidecarCid) {
    try {
      const signedManifest = await fetchJsonFromIPFS(manifest.c2paSidecarCid);
      if (signedManifest) return verifyImageManifestObject(signedManifest);
      return { exists: false, valid: false, error: "C2PA sidecar fetch from IPFS returned empty" };
    } catch (err) {
      return { exists: false, valid: false, error: `IPFS fetch failed: ${err.message}` };
    }
  }
  // Legacy fallback - pre-migration images may still have a local sidecar.
  if (manifest.localPath) return readAndVerifyImageManifest(manifest.localPath);
  return { exists: false, valid: false, error: "C2PA sidecar not found on IPFS or locally" };
};

router.get("/images/:imageId/c2pa", async (req, res) => {
  const manifest = readImageManifest(req.params.imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });
  const result = await verifyImageSidecar(manifest);
  res.json({
    imageId: manifest.imageId,
    c2paSigned: manifest.c2paSigned || false,
    c2paManifestHash: manifest.c2paManifestHash || null,
    c2paInstanceId: manifest.c2paInstanceId || null,
    c2paSignedAt: manifest.c2paSignedAt || null,
    c2paSidecarCid: manifest.c2paSidecarCid || null,
    c2paSidecarUrl: manifest.c2paSidecarUrl || null,
    verification: result,
  });
});

router.post("/images/verify", async (req, res) => {
  const { imageId, clientHash } = req.body;
  if (!imageId || !clientHash) return res.status(400).json({ error: "imageId and clientHash required" });

  const manifest = readImageManifest(imageId);
  if (!manifest) return res.status(404).json({ error: "Image not found" });

  const isMatch = manifest.sha256Hash === clientHash;

  let blockchain = { available: false, hashMatch: null, endorsementCount: 0 };
  if (manifest.blockchainStatus === "ready") {
    try {
      const chainData = await getImageFromChain(imageId);
      if (chainData.exists) {
        blockchain = {
          available: true,
          hashMatch: chainData.sha256Hash === clientHash,
          endorsementCount: chainData.endorsementCount,
          fullyEndorsed: chainData.endorsementCount >= 2,
          status: chainData.status, // 0=Active 1=Revoked 2=Disputed
        };
      }
    } catch (err) {
      blockchain.error = err.message;
    }
  } else {
    blockchain.error = manifest.blockchainStatus === "pending"
      ? "Blockchain registration still running"
      : "Image not registered on-chain";
  }

  const c2pa = await verifyImageSidecar(manifest);

  res.json({
    isMatch,
    storedHash: manifest.sha256Hash,
    ipfsCid: manifest.ipfsCid,
    ipfsUrl: manifest.ipfsUrl,
    blockchain,
    c2pa: {
      signed: manifest.c2paSigned || false,
      valid: c2pa.valid || false,
      instanceId: manifest.c2paInstanceId || null,
      manifestHash: manifest.c2paManifestHash || null,
      signedAt: manifest.c2paSignedAt || null,
      sidecarCid: manifest.c2paSidecarCid || null,
      sidecarUrl: manifest.c2paSidecarUrl || null,
      signer: c2pa.signer || null,
      assertionsCount: c2pa.assertions_count || 0,
      mediaType: c2pa.media_type || "image",
      error: c2pa.error || null,
    },
    txInfo: {
      txHash: manifest.txHash || null,
      blockNumber: manifest.blockNumber || null,
      totalGasUsed: manifest.totalGasUsed || null,
      etherscanRegister: manifest.etherscanRegister || null,
      etherscanBroadcaster: manifest.etherscanBroadcaster || null,
      etherscanAuditor: manifest.etherscanAuditor || null,
    },
    status: isMatch ? "verified" : "tampered",
  });
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

  reportImageTamperOnChain(imageId)
    .then((result) => {
      if (result.ok) {
        console.log(`[upload-image] tamper on-chain tx=${result.txHash?.slice(0, 16)}...`);
        updateImageManifest(imageId, (cur) => ({
          ...cur,
          tamperTxHash: result.txHash,
          tamperBlockNumber: result.blockNumber,
        }));
      }
    })
    .catch((err) => console.error("[upload-image] on-chain tamper failed:", err.message));

  res.json({ reported: true, imageId });
});

router.get("/blockchain/image/:imageId", async (req, res) => {
  const manifest = readImageManifest(req.params.imageId);
  const chainImage = await getImageFromChain(req.params.imageId);

  if (chainImage?.exists) return res.json(chainImage);
  if (!manifest) return res.status(404).json({ error: "Image not found" });

  res.json({
    title: manifest.title,
    sha256Hash: manifest.sha256Hash,
    ipfsCid: manifest.ipfsCid,
    exists: false,
    fallback: true,
  });
});

router.get("/blockchain/image/:imageId/endorsements", async (req, res) => {
  const endorsements = await getImageEndorsementsFromChain(req.params.imageId);
  res.json({ endorsements });
});

// =================================================================
//  UNIFIED FEED ROUTE
//  Returns videos + images sorted by createdAt (Facebook-style)
// =================================================================

router.get("/feed", async (req, res) => {
  try {
    const videos = listManifests({ kind: "video" }).map(buildVideoSummaryWithForensics);
    const images = listImageManifests().map(buildImageSummary);

    const feed = [...videos, ...images].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    res.json({ total: feed.length, feed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =================================================================
//  BLOCKCHAIN HELPER ROUTES (video)
// =================================================================

router.get("/blockchain/video/:videoId", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  const chainVideo = await getVideoFromChain(req.params.videoId);

  if (chainVideo?.exists) return res.json(chainVideo);
  if (!manifest) return res.status(404).json({ error: "Video not found" });

  res.json({
    title: manifest.title,
    metadataCid: manifest.metadataCid,
    totalSegments: manifest.totalSegments,
    exists: false,
    fallback: true,
  });
});

router.get("/blockchain/endorsements/:videoId/:segmentIndex", async (req, res) => {
  const endorsements = await getEndorsementsFromChain(req.params.videoId, req.params.segmentIndex);
  res.json({ endorsements });
});

router.get("/blockchain/txlogs", async (req, res) => {
  const logs = await getTxLogsFromChain();
  res.json({ logs });
});

router.get("/blockchain/receipt/:txHash", async (req, res) => {
  try {
    const receipt = await getTxReceipt(req.params.txHash);
    if (!receipt) return res.status(404).json({ error: "Transaction not found" });
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/blockchain/network-status", async (req, res) => {
  try {
    res.json(await getNetworkStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/blockchain/wallet-balances", async (req, res) => {
  try {
    res.json({ wallets: await getWalletBalances() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/blockchain/segment-tx/:videoId/:segmentIndex", async (req, res) => {
  const { segment } = getSegmentFromManifest(req.params.videoId, req.params.segmentIndex);
  if (!segment) return res.status(404).json({ error: "Segment not found" });

  res.json({
    segmentIndex: segment.index,
    blockNumber: segment.blockNumber || null,
    totalGasUsed: segment.totalGasUsed || null,
    transactions: {
      register:    { txHash: segment.txHash            || null, gasUsed: segment.gasUsedRegister    || null, etherscanUrl: segment.etherscanRegister    || null, org: "NewsAgency"  },
      broadcaster: { txHash: segment.txHashBroadcaster || null, gasUsed: segment.gasUsedBroadcaster || null, etherscanUrl: segment.etherscanBroadcaster || null, org: "Broadcaster" },
      auditor:     { txHash: segment.txHashAuditor     || null, gasUsed: segment.gasUsedAuditor     || null, etherscanUrl: segment.etherscanAuditor     || null, org: "Auditor"     },
    },
  });
});

// =================================================================
//  SYNC FROM BLOCKCHAIN (recovers both videos AND images)
// =================================================================

router.post("/sync-from-blockchain", async (req, res) => {
  try {
    console.log("[sync] starting full decentralized sync (chain + IPFS)...");

    const logs = await getTxLogsFromChain();

    const videoIds = [...new Set(
      logs
        .filter((l) => ["REGISTER_VIDEO", "REGISTER_SEGMENT", "ENDORSE_SEGMENT", "REPORT_TAMPER", "REVOKE_VIDEO"].includes(l.action))
        .map((l) => l.mediaId)
        .filter(Boolean)
    )];

    const imageIds = [...new Set(
      logs
        .filter((l) => ["REGISTER_IMAGE", "ENDORSE_IMAGE", "REPORT_IMAGE_TAMPER", "REVOKE_IMAGE"].includes(l.action))
        .map((l) => l.mediaId)
        .filter(Boolean)
    )];

    if (!videoIds.length && !imageIds.length) {
      return res.json({ message: "No media found on blockchain.", synced: [], failed: [] });
    }

    const synced = [], failed = [];

    // ── Sync Videos ──────────────────────────────────────
    for (const videoId of videoIds) {
      try {
        const existing = readManifest(videoId);
        if (existing) {
          synced.push({ videoId, title: existing.title, mediaType: "video", status: "already_exists" });
          continue;
        }

        const chainVideo = await getVideoFromChain(videoId);
        if (!chainVideo?.exists) {
          failed.push({ videoId, error: "Not found on blockchain" });
          continue;
        }

        let ipfsMetadata = null;
        if (chainVideo.metadataCid) {
          try { ipfsMetadata = await fetchJsonFromIPFS(chainVideo.metadataCid); } catch {}
        }

        const totalSegments = chainVideo.totalSegments;
        const endorsementResults = await Promise.allSettled(
          Array.from({ length: totalSegments }, (_, i) => getEndorsementsFromChain(videoId, i))
        );

        const segments = Array.from({ length: totalSegments }, (_, i) => {
          const ipfsSeg = ipfsMetadata?.segments?.[i];
          const endorsements = endorsementResults[i].status === "fulfilled" ? endorsementResults[i].value : [];
          return {
            index: i,
            filename: ipfsSeg?.filename || `seg_${String(i).padStart(3, "0")}.ts`,
            localPath: path.join(streamsDir, videoId, `seg_${String(i).padStart(3, "0")}.ts`),
            sha256Hash: ipfsSeg?.sha256Hash || null,
            chainHash: ipfsSeg?.chainHash || null,
            durationSeconds: ipfsSeg?.durationSeconds || 2,
            ipfsCid: ipfsSeg?.cid || null,
            ipfsUrl: ipfsSeg?.cid ? buildGatewayUrl(ipfsSeg.cid) : null,
            blockchainRegistered: true,
            endorsementCount: endorsements.length,
            fullyEndorsed: endorsements.length >= 2,
            c2paSigned: Boolean(ipfsSeg?.c2paManifestHash),
            c2paManifestHash: ipfsSeg?.c2paManifestHash || null,
            c2paInstanceId: ipfsSeg?.c2paInstanceId || null,
            c2paSignedAt: ipfsSeg?.c2paSignedAt || null,
            txHash: ipfsSeg?.txHash || null,
            blockNumber: ipfsSeg?.blockNumber || null,
            totalGasUsed: ipfsSeg?.gasUsed || null,
          };
        });

        const metadataForensics = ipfsMetadata?.forensics || null;

        const manifest = writeManifest(videoId, {
          kind: "video",
          videoId,
          title: chainVideo.title || ipfsMetadata?.title || "Untitled",
          description: ipfsMetadata?.description || "",
          createdAt: chainVideo.registeredAt
            ? new Date(chainVideo.registeredAt * 1000).toISOString()
            : new Date().toISOString(),
          totalSegments,
          playlistUrl: ipfsMetadata?.playlistUrl || `/streams/${videoId}/playlist.m3u8`,
          metadataCid: chainVideo.metadataCid || null,
          metadataUrl: chainVideo.metadataCid ? buildGatewayUrl(chainVideo.metadataCid) : null,
          status: "synced_from_chain",
          ipfsStatus: ipfsMetadata ? "uploaded" : "unknown",
          blockchainStatus: "ready",
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

        synced.push({ videoId, title: manifest.title, mediaType: "video", status: "synced", source: ipfsMetadata ? "blockchain+ipfs" : "blockchain_only" });
      } catch (err) {
        failed.push({ videoId, error: err.message });
      }
    }

    // ── Sync Images ──────────────────────────────────────
    for (const imageId of imageIds) {
      try {
        const existing = readImageManifest(imageId);
        if (existing) {
          synced.push({ imageId, title: existing.title, mediaType: "image", status: "already_exists" });
          continue;
        }

        const chainImage = await getImageFromChain(imageId);
        if (!chainImage?.exists) {
          failed.push({ imageId, error: "Not found on blockchain" });
          continue;
        }

        let ipfsMetadata = null;
        if (chainImage.metadataCid) {
          try { ipfsMetadata = await fetchJsonFromIPFS(chainImage.metadataCid); } catch {}
        }

        const metadataForensics = ipfsMetadata?.forensics || null;

        const manifest = writeImageManifest(imageId, {
          kind: "image",
          imageId,
          title: chainImage.title || ipfsMetadata?.title || "Untitled",
          description: chainImage.description || ipfsMetadata?.description || "",
          filename: ipfsMetadata?.filename || `img_${imageId}.jpg`,
          originalFilename: ipfsMetadata?.originalFilename || null,
          mimeType: ipfsMetadata?.mimeType || "image/jpeg",
          // IPFS-only mode: no local file. Verification fetches sidecar
          // from c2paSidecarCid below.
          localPath: null,
          sha256Hash: chainImage.sha256Hash || ipfsMetadata?.sha256Hash || null,
          createdAt: chainImage.registeredAt
            ? new Date(chainImage.registeredAt * 1000).toISOString()
            : new Date().toISOString(),
          ipfsCid: chainImage.ipfsCid || ipfsMetadata?.ipfsCid || null,
          ipfsUrl: chainImage.ipfsCid ? buildGatewayUrl(chainImage.ipfsCid) : null,
          metadataCid: chainImage.metadataCid || null,
          metadataUrl: chainImage.metadataCid ? buildGatewayUrl(chainImage.metadataCid) : null,
          status: "synced_from_chain",
          ipfsStatus: ipfsMetadata ? "uploaded" : "unknown",
          blockchainStatus: "ready",
          c2paStatus: ipfsMetadata?.c2paManifestHash ? "signed" : "unknown",
          c2paSigned: Boolean(ipfsMetadata?.c2paManifestHash),
          c2paManifestHash: chainImage.c2paManifestHash || ipfsMetadata?.c2paManifestHash || null,
          c2paInstanceId: ipfsMetadata?.c2paInstanceId || null,
          c2paSignedAt: null,
          c2paSidecarCid: ipfsMetadata?.c2paSidecarCid || null,
          c2paSidecarUrl: ipfsMetadata?.c2paSidecarCid ? buildGatewayUrl(ipfsMetadata.c2paSidecarCid) : null,
          endorsementCount: chainImage.endorsementCount || 0,
          fullyEndorsed: (chainImage.endorsementCount || 0) >= 2,
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

        synced.push({ imageId, title: manifest.title, mediaType: "image", status: "synced", source: ipfsMetadata ? "blockchain+ipfs" : "blockchain_only" });
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
