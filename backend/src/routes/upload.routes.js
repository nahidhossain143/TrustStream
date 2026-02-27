const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const crypto = require("crypto");
const { Web3 } = require("web3");
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

// ============================================================
// Blockchain Setup
// ============================================================
const web3 = new Web3("http://127.0.0.1:8545");

let deploymentInfo;
try {
  deploymentInfo = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../../network/deployment.json"),
      "utf8"
    )
  );
} catch (e) {
  console.warn("⚠️  deployment.json not found. Blockchain features disabled.");
  deploymentInfo = null;
}

const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "newsAgencyAddr",  type: "address" },
      { internalType: "address", name: "broadcasterAddr", type: "address" },
      { internalType: "address", name: "auditorAddr",     type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  // registerVideo — new function
  {
    inputs: [
      { internalType: "string",  name: "videoId",       type: "string"  },
      { internalType: "string",  name: "title",         type: "string"  },
      { internalType: "uint256", name: "totalSegments", type: "uint256" },
    ],
    name: "registerVideo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // registerSegment — only NewsAgency
  {
    inputs: [
      { internalType: "string",  name: "videoId",      type: "string"  },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "string",  name: "sha256Hash",   type: "string"  },
      { internalType: "string",  name: "chainHash",    type: "string"  },
    ],
    name: "registerSegment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // endorseSegment — only Broadcaster/Auditor
  {
    inputs: [
      { internalType: "string",  name: "videoId",      type: "string"  },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
    ],
    name: "endorseSegment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // verifySegment
  {
    inputs: [
      { internalType: "string",  name: "videoId",      type: "string"  },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "string",  name: "sha256Hash",   type: "string"  },
    ],
    name: "verifySegment",
    outputs: [
      { internalType: "bool",    name: "hashMatch",        type: "bool"    },
      { internalType: "bool",    name: "fullyEndorsed",    type: "bool"    },
      { internalType: "uint256", name: "endorsementCount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // getVideo — new function
  {
    inputs: [{ internalType: "string", name: "videoId", type: "string" }],
    name: "getVideo",
    outputs: [
      { internalType: "string",  name: "title",        type: "string"  },
      { internalType: "string",  name: "uploader",     type: "string"  },
      { internalType: "address", name: "uploaderAddr", type: "address" },
      { internalType: "uint256", name: "totalSegments",type: "uint256" },
      { internalType: "uint256", name: "registeredAt", type: "uint256" },
      { internalType: "bool",    name: "exists",       type: "bool"    },
    ],
    stateMutability: "view",
    type: "function",
  },
  // getEndorsements
  {
    inputs: [
      { internalType: "string",  name: "videoId",      type: "string"  },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
    ],
    name: "getEndorsements",
    outputs: [
      { internalType: "address[]", name: "", type: "address[]" },
      { internalType: "string[]",  name: "", type: "string[]"  },
      { internalType: "uint256[]", name: "", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // getTxLogCount
  {
    inputs: [],
    name: "getTxLogCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  // getTxLog
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getTxLog",
    outputs: [
      { internalType: "string",  name: "action",       type: "string"  },
      { internalType: "string",  name: "videoId",      type: "string"  },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "address", name: "actor",        type: "address" },
      { internalType: "string",  name: "orgName",      type: "string"  },
      { internalType: "uint256", name: "timestamp",    type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
];

let contract = null;
let orgs = null;

if (deploymentInfo) {
  contract = new web3.eth.Contract(CONTRACT_ABI, deploymentInfo.address);
  orgs = deploymentInfo.organizations;
  console.log("✅ Blockchain contract loaded:", deploymentInfo.address);
}

// ============================================================
// Helper: Register video metadata on blockchain
// ============================================================
const registerVideoOnChain = async (videoId, title, totalSegments) => {
  if (!contract || !orgs) return;
  try {
    await contract.methods
      .registerVideo(videoId, title, totalSegments)
      .send({ from: orgs.newsAgency.address, gas: 500000 });
    console.log(`⛓️  Video "${title}" registered on blockchain ✅`);
  } catch (err) {
    console.error(`⚠️  Blockchain registerVideo failed:`, err.message);
  }
};

// ============================================================
// Helper: Register + 3-org endorsement on blockchain
// ============================================================
const registerAndEndorse = async (videoId, segmentIndex, sha256Hash, chainHash) => {
  if (!contract || !orgs) return;
  try {
    await contract.methods
      .registerSegment(videoId, segmentIndex, sha256Hash, chainHash)
      .send({ from: orgs.newsAgency.address, gas: 1000000 });

    await contract.methods
      .endorseSegment(videoId, segmentIndex)
      .send({ from: orgs.broadcaster.address, gas: 500000 });

    await contract.methods
      .endorseSegment(videoId, segmentIndex)
      .send({ from: orgs.auditor.address, gas: 500000 });

    console.log(`⛓️  Segment ${segmentIndex}: registered + endorsed by 3 orgs ✅`);
  } catch (err) {
    console.error(`⚠️  Blockchain failed for segment ${segmentIndex}:`, err.message);
  }
};

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

const upload = multer({ dest: "public/uploads/" });

// ============================================================
// POST /api/upload
// Admin uploads video → FFmpeg → DB + Blockchain
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

      // Register video metadata on blockchain
      registerVideoOnChain(videoId, title, files.length);

      let prevHash = null;

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

        // Blockchain (non-blocking)
        registerAndEndorse(videoId, i, sha256Hash, chainHash);

        prevHash = sha256Hash;
      }

      await updateVideoReady(videoId, files.length, files.length * 2);

      res.json({
        message:       "Upload complete ✅",
        videoId,
        totalSegments: files.length,
        playlistUrl:   `/streams/${videoId}/playlist.m3u8`,
      });

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
// POST /api/upload/verify — DB + Blockchain dual verification
// ============================================================
router.post("/verify", async (req, res) => {
  const { videoId, segmentIndex, clientHash } = req.body;

  try {
    const segment = await getSegment(videoId, segmentIndex);
    if (!segment) {
      return res.status(404).json({ error: "Segment not found" });
    }

    const isMatch = segment.sha256_hash === clientHash;

    let blockchainResult = null;
    if (contract) {
      try {
        const result = await contract.methods
          .verifySegment(videoId, segmentIndex, clientHash)
          .call();
        blockchainResult = {
          hashMatch:        result.hashMatch,
          fullyEndorsed:    result.fullyEndorsed,
          endorsementCount: Number(result.endorsementCount),
        };
      } catch (err) {
        console.error("Blockchain verify error:", err.message);
      }
    }

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
// GET /api/upload/blockchain/video/:videoId — on-chain metadata
// ============================================================
router.get("/blockchain/video/:videoId", async (req, res) => {
  if (!contract) return res.json({ exists: false });
  try {
    const result = await contract.methods.getVideo(req.params.videoId).call();
    res.json({
      title:         result.title,
      uploader:      result.uploader,
      uploaderAddr:  result.uploaderAddr,
      totalSegments: Number(result.totalSegments),
      registeredAt:  Number(result.registeredAt),
      exists:        result.exists,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/upload/blockchain/endorsements/:videoId/:segmentIndex
// ============================================================
router.get("/blockchain/endorsements/:videoId/:segmentIndex", async (req, res) => {
  if (!contract) return res.json({ endorsements: [] });
  try {
    const { videoId, segmentIndex } = req.params;
    const result = await contract.methods
      .getEndorsements(videoId, Number(segmentIndex))
      .call();

    const endorsements = result[0].map((addr, i) => ({
      address:   addr,
      orgName:   result[1][i],
      timestamp: Number(result[2][i]),
    }));

    res.json({ endorsements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /api/upload/blockchain/txlogs
// ============================================================
router.get("/blockchain/txlogs", async (req, res) => {
  if (!contract) return res.json({ logs: [] });
  try {
    const count = Number(await contract.methods.getTxLogCount().call());
    const logs  = [];
    const start = Math.max(0, count - 20);

    for (let i = start; i < count; i++) {
      const log = await contract.methods.getTxLog(i).call();
      logs.push({
        action:       log.action,
        videoId:      log.videoId,
        segmentIndex: Number(log.segmentIndex),
        actor:        log.actor,
        orgName:      log.orgName,
        timestamp:    Number(log.timestamp),
      });
    }

    res.json({ logs: logs.reverse() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;