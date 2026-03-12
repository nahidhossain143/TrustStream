const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const crypto = require("crypto");
const router = express.Router();

const {
  createVideo,
  updateVideoReady,
  createSegment,
  getSegmentsByVideoId,
  getAllVideos,
  getSegment,
  logVerification,
} = require("../models/video.model");

const {
  registerVideoOnChain,
  registerAndEndorse,
  verifyOnChain,
  getEndorsementsFromChain,
  getTxLogsFromChain,
  getVideoFromChain,
} = require("../services/blockchain.service");

const upload = multer({ dest: "public/uploads/" });

// ============================================================
// Helper: SHA-256 hash of a file (stream-based)
// ============================================================
const hashFile = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
};

// ============================================================
// POST /api/upload
// ============================================================
router.post("/", upload.single("video"), async (req, res) => {
  const inputPath   = req.file.path;
  const title       = req.body.title || req.file.originalname;
  const description = req.body.description || "";

  let video;
  try {
    video = await createVideo({
      title,
      description,
      originalFilename: req.file.originalname,
      originalPath: inputPath,
    });
  } catch (err) {
    return res.status(500).json({ error: "DB error creating video" });
  }

  const videoId      = video.id;
  const outputFolder = `public/streams/${videoId}`;
  fs.mkdirSync(outputFolder, { recursive: true });
  const playlistPath = `${outputFolder}/playlist.m3u8`;

  const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -hls_time 2 -hls_playlist_type vod -hls_segment_filename "${outputFolder}/seg_%03d.ts" "${playlistPath}"`;

  exec(ffmpegCmd, async (err) => {
    if (err) {
      console.error("FFmpeg error:", err.message);
      return res.status(500).json({ error: "FFmpeg failed", videoId });
    }

    try {
      const files = fs
        .readdirSync(outputFolder)
        .filter((f) => f.endsWith(".ts"))
        .sort();

      let prevHash = null;

      // Step 1: DB তে সব segments save করো + segment data collect করো
      const segmentQueue = [];

      for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        const filePath = path.join(outputFolder, filename);
        const stats    = fs.statSync(filePath);

        const sha256Hash = await hashFile(filePath);

        const chainInput  = sha256Hash + (prevHash || "");
        const chainBuffer = Buffer.from(chainInput, "hex");
        const chainHash   = crypto
          .createHash("sha256")
          .update(chainBuffer)
          .digest("hex");

        await createSegment({
          videoId,
          segmentIndex: i,
          filename,
          filePath,
          sha256Hash,
          prevHash,
          chainHash,
          durationSeconds: 2.0,
          fileSizeBytes: stats.size,
        });

        // Queue এ রাখো blockchain এর জন্য
        segmentQueue.push({ index: i, sha256Hash, chainHash });

        prevHash = sha256Hash;
      }

      await updateVideoReady(videoId, files.length, files.length * 2);

      // Response আগেই পাঠাও — user wait করবে না
      res.json({
        message:       "Upload complete ✅",
        videoId,
        totalSegments: files.length,
        playlistUrl:   `/streams/${videoId}/playlist.m3u8`,
      });

      // Step 2: Blockchain এ sequential এ পাঠাও (background)
      (async () => {
        console.log(`⛓️  Starting blockchain registration for video ${videoId}...`);

        // প্রথমে video register করো
        await registerVideoOnChain(videoId, title, files.length);

        // তারপর একটা একটা করে segment পাঠাও
        for (const seg of segmentQueue) {
          await registerAndEndorse(videoId, seg.index, seg.sha256Hash, seg.chainHash);
        }

        console.log(`✅ All segments registered on blockchain for video ${videoId}`);
      })().catch((e) => console.error("Blockchain background error:", e.message));

    } catch (dbErr) {
      console.error("DB/hash error:", dbErr.message);
      res.status(500).json({ error: "Processing failed", videoId });
    }
  });
});

// ============================================================
// GET /api/upload/videos
// ============================================================
router.get("/videos", async (req, res) => {
  try {
    const videos = await getAllVideos();
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/upload/videos/:videoId/segments
// ============================================================
router.get("/videos/:videoId/segments", async (req, res) => {
  try {
    const segments = await getSegmentsByVideoId(req.params.videoId);
    res.json(segments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /api/upload/verify
// ============================================================
router.post("/verify", async (req, res) => {
  const { videoId, segmentIndex, clientHash } = req.body;

  try {
    const segment = await getSegment(videoId, segmentIndex);
    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }

    const isMatch = segment.sha256_hash === clientHash;

    const blockchainResult = await verifyOnChain(videoId, segmentIndex, clientHash);

    await logVerification({
      videoId,
      segmentIndex,
      clientHash,
      storedHash: segment.sha256_hash,
      isMatch,
      clientIp: req.ip,
    });

    res.json({
      isMatch,
      storedHash: segment.sha256_hash,
      blockchain: blockchainResult,
      status:     isMatch ? "✅ Authentic" : "🔴 Tampered",
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/upload/blockchain/video/:videoId
// ============================================================
router.get("/blockchain/video/:videoId", async (req, res) => {
  const result = await getVideoFromChain(req.params.videoId);
  res.json(result);
});

// ============================================================
// GET /api/upload/blockchain/endorsements/:videoId/:segmentIndex
// ============================================================
router.get("/blockchain/endorsements/:videoId/:segmentIndex", async (req, res) => {
  const { videoId, segmentIndex } = req.params;
  const endorsements = await getEndorsementsFromChain(videoId, segmentIndex);
  res.json({ endorsements });
});

// ============================================================
// GET /api/upload/blockchain/txlogs
// ============================================================
router.get("/blockchain/txlogs", async (req, res) => {
  const logs = await getTxLogsFromChain();
  res.json({ logs });
});

module.exports = router;