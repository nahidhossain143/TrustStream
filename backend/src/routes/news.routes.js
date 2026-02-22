const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

/*
  GET: Return available stream if exists
*/
router.get("/", (req, res) => {
  try {
    const streamsDir = path.join(
      __dirname,
      "../../public/streams"
    );

    const files = fs.readdirSync(streamsDir);

    const playlistFile = files.find(file =>
      file.endsWith(".m3u8")
    );

    if (!playlistFile) {
      return res.json([]);
    }

    res.json([
      {
        id: 1,
        title: "Active Stream",
        description: "Segmented & cryptographically hashed stream",
        playlist: `/streams/${playlistFile}`
      }
    ]);

  } catch (error) {
    console.error(error);
    res.json([]);
  }
});

/*
  POST: Verify segment hash
*/
router.post("/verify", (req, res) => {
  try {
    const { file, hash } = req.body;

    const hashFilePath = path.join(
      __dirname,
      "../../data/hashes.json"
    );

    if (!fs.existsSync(hashFilePath)) {
      return res.json({ verified: false });
    }

    const storedHashes = JSON.parse(
      fs.readFileSync(hashFilePath)
    );

    const match = storedHashes.find(
      item => item.file === file
    );

    if (!match) {
      return res.json({ verified: false });
    }

    res.json({
      verified: match.hash === hash
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ verified: false });
  }
});

module.exports = router;