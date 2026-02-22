const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const crypto = require("crypto");
const router = express.Router();

// DB models
const {
  createVideo,
  updateVideoReady,
  createSegment,
  getSegmentsByVideoId,
  getAllVideos,
  getSegment,
  logVerification,
} = require("../models/video.model");

const upload = multer({ dest: "public/uploads/" });

// ============================================================
// Helper: SHA-256 hash of a file
// ============================================================
const hashFile = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
};

// ============================================================
// POST /api/upload
// Admin uploads a video → FFmpeg segments → hashes → save to DB
// ============================================================
router.post("/", upload.single("video"), async (req, res) => {
  const inputPath = req.file.path;
  const title = req.body.title || req.file.originalname;
  const description = req.body.description || "";

  // 1. Create video record in DB (status: processing)
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

  const videoId = video.id;
  const outputFolder = `public/streams/${videoId}`;
  fs.mkdirSync(outputFolder, { recursive: true });

  const playlistPath = `${outputFolder}/playlist.m3u8`;

  // 2. FFmpeg segmentation
  const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:v libx264 -c:a aac -hls_time 2 -hls_playlist_type vod -hls_segment_filename "${outputFolder}/seg_%03d.ts" "${playlistPath}"`;

  exec(ffmpegCmd, async (err) => {
    if (err) {
      console.error("FFmpeg error:", err.message);
      return res.status(500).json({ error: "FFmpeg failed", videoId });
    }

    // 3. Hash each segment and save to DB sequentially
    try {
      const files = fs.readdirSync(outputFolder)
        .filter(f => f.endsWith(".ts"))
        .sort(); // ensure sequential order: seg_000, seg_001 ...

      let prevHash = null;

      for (let i = 0; i < files.length; i++) {
        const filename = files[i];
        const filePath = path.join(outputFolder, filename);
        const stats = fs.statSync(filePath);

        // SHA-256 of this segment
        const sha256Hash = hashFile(filePath);

        // Chain hash: SHA-256(currentHash + prevHash) — tamper-proof chain
        const chainInput = sha256Hash + (prevHash || "");
        const chainHash = crypto
          .createHash("sha256")
          .update(chainInput)
          .digest("hex");

        // Save to DB
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

        prevHash = sha256Hash; // next segment's prevHash
      }

      // 4. Update video status to ready
      await updateVideoReady(videoId, files.length, files.length * 2);

      res.json({
        message: "Upload & segmentation complete ✅",
        videoId,
        totalSegments: files.length,
        playlistUrl: `/streams/${videoId}/playlist.m3u8`,
      });

    } catch (dbErr) {
      console.error("DB save error:", dbErr.message);
      res.status(500).json({ error: "Hashing/DB save failed", videoId });
    }
  });
});

// ============================================================
// GET /api/upload/videos
// All uploaded news videos (for frontend listing)
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
// All segments with hashes for a video
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
// Frontend sends computed hash → compare with DB → log result
// ============================================================
router.post("/verify", async (req, res) => {
  const { videoId, segmentIndex, clientHash } = req.body;

  try {
    const segment = await getSegment(videoId, segmentIndex);
    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }

    const isMatch = segment.sha256_hash === clientHash;

    // Log verification attempt
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
      status: isMatch ? "✅ Authentic" : "🔴 Tampered",
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;