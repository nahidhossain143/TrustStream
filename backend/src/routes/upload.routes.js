const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { exec } = require("child_process");

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
} = require("../services/blockchain.service");
const {
  uploadSegmentToIPFS,
  uploadMetadataToIPFS,
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
} = require("../services/c2pa.service");

const router = express.Router();
const upload = multer({ dest: "public/uploads/" });

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
    exec(command, (err) => {
      if (err) { reject(err); return; }
      resolve();
    });
  });

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
    // Feature 1+2+4: tx data in IPFS metadata
    txHash: segment.txHash || null,
    blockNumber: segment.blockNumber || null,
    gasUsed: segment.totalGasUsed || null,
  })),
});

const buildVideoSummary = (manifest) => ({
  id: manifest.videoId,
  videoId: manifest.videoId,
  title: manifest.title,
  description: manifest.description,
  totalSegments: manifest.totalSegments,
  playlistUrl: manifest.playlistUrl,
  createdAt: manifest.createdAt,
  registeredAt: manifest.createdAt,
  metadataCid: manifest.metadataCid,
  metadataUrl: manifest.metadataCid ? buildGatewayUrl(manifest.metadataCid) : null,
  status: manifest.status,
  ipfsStatus: manifest.ipfsStatus,
  blockchainStatus: manifest.blockchainStatus,
  c2paStatus: manifest.c2paStatus || "pending",
  // Feature 1+2: video-level tx info
  videoTxHash: manifest.videoTxHash || null,
  videoBlockNumber: manifest.videoBlockNumber || null,
  totalGasUsed: manifest.totalGasUsed || null,
});

const getSegmentFromManifest = (videoId, segmentIndex) => {
  const manifest = readManifest(videoId);
  if (!manifest) return { manifest: null, segment: null };
  const segment = manifest.segments.find((item) => item.index === Number(segmentIndex));
  return { manifest, segment: segment || null };
};

const uploadWithRetry = async (localPath, filename, maxRetries = 3) => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await uploadSegmentToIPFS(localPath, filename);
    } catch (err) {
      const errStr = err?.message || JSON.stringify(err) || "";
      const isRateLimit = errStr.includes("RATE_LIMITED") || errStr.includes("rate limit");
      if (isRateLimit && attempt < maxRetries) {
        const waitMs = 2000 * (attempt + 1);
        console.log(`⏳ Rate limited on ${filename}, retrying in ${waitMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, waitMs));
      } else {
        throw err;
      }
    }
  }
};

const IPFS_BATCH_SIZE = 2;

const syncVideoToIpfsAndChain = async (videoId) => {
  let manifest = readManifest(videoId);
  if (!manifest) return;

  // ─── Step 1: C2PA ────────────────────────────────────────
  console.log(`📋 Generating C2PA manifests for video ${videoId}...`);
  updateManifest(videoId, (current) => ({ ...current, c2paStatus: "signing" }));

  const c2paResults = await generateAllManifests(
    videoId, manifest.segments, manifest.title, manifest.createdAt
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

  console.log(`📋 C2PA: ${c2paResults.filter((r) => r.ok).length}/${manifest.totalSegments} signed ✅`);

  // ─── Step 2: IPFS Upload ─────────────────────────────────
  updateManifest(videoId, (current) => ({ ...current, ipfsStatus: "uploading", backgroundError: null }));
  manifest = readManifest(videoId);
  const pendingSegments = manifest.segments.filter((seg) => !seg.ipfsCid);

  for (let i = 0; i < pendingSegments.length; i += IPFS_BATCH_SIZE) {
    const batch = pendingSegments.slice(i, i + IPFS_BATCH_SIZE);
    await Promise.allSettled(
      batch.map(async (segment) => {
        try {
          const ipfsCid = await uploadWithRetry(segment.localPath, segment.filename);
          const ipfsUrl = buildGatewayUrl(ipfsCid);
          updateManifest(videoId, (current) => ({
            ...current,
            segments: current.segments.map((item) =>
              item.index === segment.index ? { ...item, ipfsCid, ipfsUrl } : item
            ),
          }));
        } catch (err) {
          console.error(`⚠️  IPFS failed for seg ${segment.index}:`, err.message);
        }
      })
    );
    if (i + IPFS_BATCH_SIZE < pendingSegments.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  manifest = readManifest(videoId);
  if (!manifest) return;

  const hasMissingIpfs = manifest.segments.some((seg) => !seg.ipfsCid);
  if (hasMissingIpfs) {
    updateManifest(videoId, (current) => ({
      ...current,
      ipfsStatus: "partial",
      blockchainStatus: "skipped",
      backgroundError: "Some segments failed to upload to IPFS",
    }));
    return;
  }

  // ─── Step 3: Metadata upload ─────────────────────────────
  const metadataPayload = buildMetadataPayload(manifest);
  const videoC2paManifest = buildVideoManifest(manifest, c2paResults);
  metadataPayload.c2paVideoManifest = videoC2paManifest;

  const metadataCid = await uploadMetadataToIPFS(metadataPayload);
  const metadataUrl = buildGatewayUrl(metadataCid);

  updateManifest(videoId, (current) => ({
    ...current,
    metadataCid,
    metadataUrl,
    ipfsStatus: metadataCid ? "uploaded" : "partial",
  }));

  if (!metadataCid) {
    updateManifest(videoId, (current) => ({
      ...current,
      blockchainStatus: "skipped",
      backgroundError: "Metadata upload to IPFS failed",
    }));
    return;
  }

  // ─── Step 4: Blockchain Registration ─────────────────────
  updateManifest(videoId, (current) => ({ ...current, blockchainStatus: "registering" }));
  manifest = readManifest(videoId);

  const registerVideoResult = await registerVideoOnChain(
    manifest.videoId, manifest.title, metadataCid, manifest.totalSegments
  );

  if (!registerVideoResult?.ok) {
    updateManifest(videoId, (current) => ({
      ...current,
      blockchainStatus: registerVideoResult?.skipped ? "skipped" : "degraded",
      backgroundError: registerVideoResult?.error || null,
    }));
    return;
  }

  // Feature 1+2: Save video-level tx receipt
  const videoTxReceipt = registerVideoResult.txReceipt;
  updateManifest(videoId, (current) => ({
    ...current,
    videoTxHash: videoTxReceipt?.txHash || null,
    videoBlockNumber: videoTxReceipt?.blockNumber || null,
    videoTxEtherscan: videoTxReceipt?.etherscanUrl || null,
    videoTxGasUsed: videoTxReceipt?.gasUsed || null,
  }));

  // ─── Step 5: Segment registration batch ──────────────────
  const batchResults = await registerAndEndorseBatch(
    manifest.videoId,
    manifest.segments.map((seg) => ({
      index: seg.index,
      sha256Hash: seg.sha256Hash,
      chainHash: seg.chainHash,
      ipfsCid: seg.ipfsCid,
    }))
  );

  // Feature 1+2+4: Save per-segment tx receipts + block + gas
  let totalGasUsed = videoTxReceipt?.gasUsed || 0;

  updateManifest(videoId, (current) => ({
    ...current,
    segments: current.segments.map((item) => {
      const result = batchResults.find((r) => r.index === item.index);
      if (!result) return item;
      totalGasUsed += result.totalGasUsed || 0;
      return {
        ...item,
        blockchainRegistered: Boolean(result.ok),
        endorsementCount: result.endorsementCount || 0,
        fullyEndorsed: Boolean(result.fullyEndorsed),
        blockchainError: result.ok ? null : result.error || null,
        // Feature 1: tx hashes per org
        txHash: result.txReceipts?.register?.txHash || null,
        txHashBroadcaster: result.txReceipts?.broadcaster?.txHash || null,
        txHashAuditor: result.txReceipts?.auditor?.txHash || null,
        // Feature 2: block number
        blockNumber: result.blockNumber || null,
        // Feature 4: gas usage
        gasUsedRegister: result.txReceipts?.register?.gasUsed || null,
        gasUsedBroadcaster: result.txReceipts?.broadcaster?.gasUsed || null,
        gasUsedAuditor: result.txReceipts?.auditor?.gasUsed || null,
        totalGasUsed: result.totalGasUsed || null,
        // Etherscan links
        etherscanRegister: result.txReceipts?.register?.etherscanUrl || null,
        etherscanBroadcaster: result.txReceipts?.broadcaster?.etherscanUrl || null,
        etherscanAuditor: result.txReceipts?.auditor?.etherscanUrl || null,
      };
    }),
  }));

  manifest = readManifest(videoId);
  const hasChainFailures = manifest.segments.some((seg) => seg.blockchainRegistered === false);

  updateManifest(videoId, (current) => ({
    ...current,
    status: "ready",
    blockchainStatus: hasChainFailures ? "degraded" : "ready",
    totalGasUsed,
    backgroundError: hasChainFailures ? "Some segments were not registered on-chain" : null,
  }));

  console.log(`✅ C2PA + IPFS + Blockchain complete | Total gas: ${totalGasUsed}`);
};

// ─── Routes ───────────────────────────────────────────────

router.post("/", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Video file is required" });

  const inputPath = req.file.path;
  const title = req.body.title || req.file.originalname;
  const description = req.body.description || "";
  const videoId = crypto.randomUUID();
  const outputFolder = path.join("public/streams", videoId);

  fs.mkdirSync(outputFolder, { recursive: true });

  const playlistPath = path.join(outputFolder, "playlist.m3u8");
  const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -hls_time 2 -hls_playlist_type vod -hls_segment_filename "${outputFolder}/seg_%03d.ts" "${playlistPath}"`;

  try {
    await runFfmpeg(ffmpegCmd);

    const files = fs.readdirSync(outputFolder).filter((f) => f.endsWith(".ts")).sort();
    const segments = [];
    let prevHash = null;

    for (let index = 0; index < files.length; index += 1) {
      const filename = files[index];
      const localPath = path.join(outputFolder, filename);
      const sha256Hash = await hashFile(localPath);
      const chainHash = crypto
        .createHash("sha256")
        .update(Buffer.from(sha256Hash + (prevHash || ""), "hex"))
        .digest("hex");

      segments.push({
        index, filename, localPath, sha256Hash, chainHash,
        durationSeconds: 2,
        ipfsCid: null, ipfsUrl: null,
        blockchainRegistered: false,
        endorsementCount: 0, fullyEndorsed: false,
        c2paSigned: false, c2paManifestHash: null,
        c2paInstanceId: null, c2paSignedAt: null, c2paSidecarPath: null,
        // Feature fields (populated after blockchain)
        txHash: null, txHashBroadcaster: null, txHashAuditor: null,
        blockNumber: null, totalGasUsed: null,
        etherscanRegister: null, etherscanBroadcaster: null, etherscanAuditor: null,
      });

      prevHash = sha256Hash;
    }

    const manifest = writeManifest(videoId, {
      videoId, title, description,
      createdAt: new Date().toISOString(),
      totalSegments: segments.length,
      playlistUrl: `/streams/${videoId}/playlist.m3u8`,
      metadataCid: null, metadataUrl: null,
      status: "ready",
      ipfsStatus: "pending",
      blockchainStatus: "pending",
      c2paStatus: "pending",
      backgroundError: null,
      videoTxHash: null, videoBlockNumber: null,
      videoTxEtherscan: null, totalGasUsed: null,
      segments,
    });

    res.json({
      message: "Upload complete. C2PA signing, IPFS and blockchain sync running in background.",
      ...buildVideoSummary(manifest),
    });

    fs.unlink(inputPath, () => {});

    syncVideoToIpfsAndChain(videoId).catch((err) => {
      console.error("Background sync error:", err.message);
      updateManifest(videoId, (current) => ({
        ...current,
        ipfsStatus: current.ipfsStatus === "uploaded" ? current.ipfsStatus : "partial",
        blockchainStatus: current.blockchainStatus === "ready" ? current.blockchainStatus : "degraded",
        backgroundError: err.message,
      }));
    });
  } catch (err) {
    console.error("Upload processing error:", err.message);
    fs.unlink(inputPath, () => {});
    res.status(500).json({ error: "FFmpeg processing failed." });
  }
});

router.get("/videos", async (req, res) => {
  try {
    const videos = listManifests().map(buildVideoSummary);
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/videos/:videoId", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });
  res.json({ ...buildVideoSummary(manifest), backgroundError: manifest.backgroundError });
});

router.get("/videos/:videoId/segments", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) return res.status(404).json({ error: "Video not found" });
  res.json(
    manifest.segments.map((seg) => ({
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
      // Feature 1+2+4
      txHash: seg.txHash || null,
      blockNumber: seg.blockNumber || null,
      totalGasUsed: seg.totalGasUsed || null,
      etherscanRegister: seg.etherscanRegister || null,
      etherscanBroadcaster: seg.etherscanBroadcaster || null,
      etherscanAuditor: seg.etherscanAuditor || null,
    }))
  );
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
    : manifest.segments.filter((seg) => seg.ipfsCid).map((seg) => ({ cid: seg.ipfsCid, durationSeconds: seg.durationSeconds }));

  if (!sourceSegments.length) return res.status(404).send("IPFS playlist not available yet");

  const lines = ["#EXTM3U","#EXT-X-VERSION:3","#EXT-X-TARGETDURATION:2","#EXT-X-PLAYLIST-TYPE:VOD","#EXT-X-MEDIA-SEQUENCE:0"];
  for (const seg of sourceSegments) {
    lines.push(`#EXTINF:${Number(seg.durationSeconds || 2).toFixed(6)},`);
    lines.push(buildGatewayUrl(seg.cid));
  }
  lines.push("#EXT-X-ENDLIST");
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(lines.join("\n"));
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
        available: false,
        hashMatch: null,
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
    // Feature 1+2+4: tx info in verify response
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

// ─── Feature 1: TX Receipt ────────────────────────────────
router.get("/blockchain/receipt/:txHash", async (req, res) => {
  try {
    const receipt = await getTxReceipt(req.params.txHash);
    if (!receipt) return res.status(404).json({ error: "Transaction not found" });
    res.json(receipt);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Feature 3: Network Status ────────────────────────────
router.get("/blockchain/network-status", async (req, res) => {
  try {
    const status = await getNetworkStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Feature 5: Wallet Balances ───────────────────────────
router.get("/blockchain/wallet-balances", async (req, res) => {
  try {
    const balances = await getWalletBalances();
    res.json({ wallets: balances });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Feature 2+4: Segment TX Details ─────────────────────
router.get("/blockchain/segment-tx/:videoId/:segmentIndex", async (req, res) => {
  const { segment } = getSegmentFromManifest(req.params.videoId, req.params.segmentIndex);
  if (!segment) return res.status(404).json({ error: "Segment not found" });

  res.json({
    segmentIndex: segment.index,
    blockNumber: segment.blockNumber || null,
    totalGasUsed: segment.totalGasUsed || null,
    transactions: {
      register: {
        txHash: segment.txHash || null,
        gasUsed: segment.gasUsedRegister || null,
        etherscanUrl: segment.etherscanRegister || null,
        org: "NewsAgency",
      },
      broadcaster: {
        txHash: segment.txHashBroadcaster || null,
        gasUsed: segment.gasUsedBroadcaster || null,
        etherscanUrl: segment.etherscanBroadcaster || null,
        org: "Broadcaster",
      },
      auditor: {
        txHash: segment.txHashAuditor || null,
        gasUsed: segment.gasUsedAuditor || null,
        etherscanUrl: segment.etherscanAuditor || null,
        org: "Auditor",
      },
    },
  });
});

router.post("/sync-from-blockchain", async (req, res) => {
  try {
    console.log("🔄 Starting full decentralized sync (Blockchain + IPFS)...");

    const logs = await getTxLogsFromChain();
    const videoIds = [...new Set(logs.map((log) => log.videoId).filter(Boolean))];

    if (!videoIds.length) {
      return res.json({ message: "No videos found on blockchain.", synced: [], failed: [] });
    }

    const synced = [];
    const failed = [];

    for (const videoId of videoIds) {
      try {
        const existing = readManifest(videoId);
        if (existing) {
          synced.push({ videoId, title: existing.title, status: "already_exists" });
          continue;
        }

        const chainVideo = await getVideoFromChain(videoId);
        if (!chainVideo?.exists) {
          failed.push({ videoId, error: "Not found on blockchain" });
          continue;
        }

        let ipfsMetadata = null;
        if (chainVideo.metadataCid) {
          try {
            ipfsMetadata = await fetchJsonFromIPFS(chainVideo.metadataCid);
          } catch {}
        }

        const totalSegments = chainVideo.totalSegments;
        const segments = [];

        const endorsementResults = await Promise.allSettled(
          Array.from({ length: totalSegments }, (_, i) => getEndorsementsFromChain(videoId, i))
        );

        for (let i = 0; i < totalSegments; i++) {
          const ipfsSeg = ipfsMetadata?.segments?.[i];
          const endorsements = endorsementResults[i].status === "fulfilled" ? endorsementResults[i].value : [];

          segments.push({
            index: i,
            filename: ipfsSeg?.filename || `seg_${String(i).padStart(3, "0")}.ts`,
            localPath: `public/streams/${videoId}/seg_${String(i).padStart(3, "0")}.ts`,
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
            // Feature 1+2+4 from IPFS metadata
            txHash: ipfsSeg?.txHash || null,
            blockNumber: ipfsSeg?.blockNumber || null,
            totalGasUsed: ipfsSeg?.gasUsed || null,
          });
        }

        const manifest = writeManifest(videoId, {
          videoId,
          title: chainVideo.title || ipfsMetadata?.title || "Untitled",
          description: ipfsMetadata?.description || "",
          createdAt: chainVideo.registeredAt ? new Date(chainVideo.registeredAt * 1000).toISOString() : new Date().toISOString(),
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
          segments,
        });

        synced.push({
          videoId,
          title: manifest.title,
          status: "synced",
          source: ipfsMetadata ? "blockchain+ipfs" : "blockchain_only",
        });

      } catch (videoErr) {
        failed.push({ videoId, error: videoErr.message });
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