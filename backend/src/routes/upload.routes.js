const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { exec } = require("child_process");

const {
  registerVideoOnChain,
  registerAndEndorse,
  verifyOnChain,
  getEndorsementsFromChain,
  getTxLogsFromChain,
  getVideoFromChain,
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
      if (err) {
        reject(err);
        return;
      }
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
});

const getSegmentFromManifest = (videoId, segmentIndex) => {
  const manifest = readManifest(videoId);
  if (!manifest) {
    return { manifest: null, segment: null };
  }

  const segment = manifest.segments.find((item) => item.index === Number(segmentIndex));
  return { manifest, segment: segment || null };
};

const syncVideoToIpfsAndChain = async (videoId) => {
  let manifest = readManifest(videoId);
  if (!manifest) return;

  updateManifest(videoId, (current) => ({
    ...current,
    ipfsStatus: "uploading",
    backgroundError: null,
  }));

  for (const segment of manifest.segments) {
    if (segment.ipfsCid) continue;

    const ipfsCid = await uploadSegmentToIPFS(segment.localPath, segment.filename);
    const ipfsUrl = buildGatewayUrl(ipfsCid);

    updateManifest(videoId, (current) => ({
      ...current,
      segments: current.segments.map((item) =>
        item.index === segment.index ? { ...item, ipfsCid, ipfsUrl } : item
      ),
    }));
  }

  manifest = readManifest(videoId);
  if (!manifest) return;

  const hasMissingIpfsSegment = manifest.segments.some((segment) => !segment.ipfsCid);
  if (hasMissingIpfsSegment) {
    updateManifest(videoId, (current) => ({
      ...current,
      ipfsStatus: "partial",
      blockchainStatus: "skipped",
      backgroundError: "Some segments failed to upload to IPFS",
    }));
    return;
  }

  const metadataPayload = buildMetadataPayload(manifest);
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

  updateManifest(videoId, (current) => ({
    ...current,
    blockchainStatus: "registering",
  }));

  manifest = readManifest(videoId);

  const registerVideoResult = await registerVideoOnChain(
    manifest.videoId,
    manifest.title,
    metadataCid,
    manifest.totalSegments
  );

  if (!registerVideoResult?.ok) {
    updateManifest(videoId, (current) => ({
      ...current,
      blockchainStatus: registerVideoResult?.skipped ? "skipped" : "degraded",
      backgroundError: registerVideoResult?.error || null,
    }));
    return;
  }

  for (const segment of manifest.segments) {
    const segmentResult = await registerAndEndorse(
      manifest.videoId,
      segment.index,
      segment.sha256Hash,
      segment.chainHash,
      segment.ipfsCid
    );

    updateManifest(videoId, (current) => ({
      ...current,
      segments: current.segments.map((item) =>
        item.index === segment.index
          ? {
              ...item,
              blockchainRegistered: Boolean(segmentResult?.ok),
              endorsementCount: segmentResult?.endorsementCount || item.endorsementCount || 0,
              fullyEndorsed: Boolean(segmentResult?.fullyEndorsed),
              blockchainError: segmentResult?.ok ? null : segmentResult?.error || null,
            }
          : item
      ),
    }));
  }

  manifest = readManifest(videoId);
  const hasChainFailures = manifest.segments.some((segment) => segment.blockchainRegistered === false);

  updateManifest(videoId, (current) => ({
    ...current,
    status: "ready",
    blockchainStatus: hasChainFailures ? "degraded" : "ready",
    backgroundError: hasChainFailures ? "Some segments were not registered on-chain" : null,
  }));
};

router.post("/", upload.single("video"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Video file is required" });
  }

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

    const files = fs.readdirSync(outputFolder).filter((file) => file.endsWith(".ts")).sort();
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
        index,
        filename,
        localPath,
        sha256Hash,
        chainHash,
        durationSeconds: 2,
        ipfsCid: null,
        ipfsUrl: null,
        blockchainRegistered: false,
        endorsementCount: 0,
        fullyEndorsed: false,
      });

      prevHash = sha256Hash;
    }

    const manifest = writeManifest(videoId, {
      videoId,
      title,
      description,
      createdAt: new Date().toISOString(),
      totalSegments: segments.length,
      playlistUrl: `/streams/${videoId}/playlist.m3u8`,
      metadataCid: null,
      metadataUrl: null,
      status: "ready",
      ipfsStatus: "pending",
      blockchainStatus: "pending",
      backgroundError: null,
      segments,
    });

    res.json({
      message: "Upload complete. IPFS and blockchain sync running in background.",
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
    res.status(500).json({ error: "FFmpeg processing failed. Check FFmpeg installation and input file." });
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
  if (!manifest) {
    return res.status(404).json({ error: "Video not found" });
  }

  res.json({
    ...buildVideoSummary(manifest),
    backgroundError: manifest.backgroundError,
  });
});

router.get("/videos/:videoId/segments", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) {
    return res.status(404).json({ error: "Video not found" });
  }

  res.json(
    manifest.segments.map((segment) => ({
      segmentIndex: segment.index,
      sha256Hash: segment.sha256Hash,
      chainHash: segment.chainHash,
      ipfsCid: segment.ipfsCid,
      gatewayUrl: segment.ipfsUrl,
      endorsementCount: segment.endorsementCount,
      fullyEndorsed: segment.fullyEndorsed,
      blockchainRegistered: segment.blockchainRegistered,
    }))
  );
});

router.get("/ipfs/:videoId/:segmentIndex", async (req, res) => {
  const { segment } = getSegmentFromManifest(req.params.videoId, req.params.segmentIndex);
  if (!segment) {
    return res.status(404).json({ error: "Segment not found" });
  }

  res.json({
    segmentIndex: segment.index,
    ipfsCid: segment.ipfsCid,
    ipfsUrl: segment.ipfsUrl,
  });
});

router.get("/ipfs-playlist/:videoId", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  if (!manifest) {
    return res.status(404).send("Playlist not found");
  }

  let metadata = null;
  if (manifest.metadataCid) {
    metadata = await fetchJsonFromIPFS(manifest.metadataCid);
  }

  const sourceSegments = metadata?.segments?.length
    ? metadata.segments
    : manifest.segments
        .filter((segment) => segment.ipfsCid)
        .map((segment) => ({
          cid: segment.ipfsCid,
          durationSeconds: segment.durationSeconds,
        }));

  if (!sourceSegments.length) {
    return res.status(404).send("IPFS playlist not available yet");
  }

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:2",
    "#EXT-X-PLAYLIST-TYPE:VOD",
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];

  for (const segment of sourceSegments) {
    lines.push(`#EXTINF:${Number(segment.durationSeconds || 2).toFixed(6)},`);
    lines.push(buildGatewayUrl(segment.cid));
  }

  lines.push("#EXT-X-ENDLIST");
  res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send(lines.join("\n"));
});

router.post("/verify", async (req, res) => {
  const { videoId, segmentIndex, clientHash } = req.body;
  const { manifest, segment } = getSegmentFromManifest(videoId, segmentIndex);

  if (!manifest || !segment) {
    return res.status(404).json({ error: "Segment not found" });
  }

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

  res.json({
    isMatch,
    storedHash: segment.sha256Hash,
    ipfsCid: segment.ipfsCid,
    ipfsUrl: segment.ipfsUrl,
    blockchain,
    playback: {
      source: manifest.playlistUrl,
      ipfsReady: Boolean(segment.ipfsCid),
    },
    status: isMatch ? "verified" : "tampered",
  });
});

router.get("/blockchain/video/:videoId", async (req, res) => {
  const manifest = readManifest(req.params.videoId);
  const chainVideo = await getVideoFromChain(req.params.videoId);

  if (chainVideo?.exists) {
    return res.json(chainVideo);
  }

  if (!manifest) {
    return res.status(404).json({ error: "Video not found" });
  }

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

module.exports = router;