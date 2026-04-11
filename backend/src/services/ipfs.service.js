const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

const PINATA_JWT = process.env.PINATA_JWT;
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

// ─── Upload Segment ───────────────────────────────────────
const uploadSegmentToIPFS = async (filePath, fileName) => {
  if (!PINATA_JWT) {
    console.warn("⚠️ PINATA_JWT not set — skipping IPFS upload");
    return null;
  }

  try {
    const data = new FormData();
    data.append("file", fs.createReadStream(filePath), fileName);
    data.append("pinataMetadata", JSON.stringify({ name: fileName }));
    data.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      data,
      {
        maxBodyLength: Infinity,
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
          ...data.getHeaders(),
        },
      }
    );

    console.log(`📌 IPFS: ${fileName} → ${response.data.IpfsHash}`);
    return response.data.IpfsHash;
  } catch (err) {
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    const isRateLimit = message.includes("RATE_LIMITED") || message.includes("rate limit");
    if (isRateLimit) throw new Error("RATE_LIMITED: " + message);
    console.error(`⚠️ IPFS upload failed for ${fileName}: ${message}`);
    return null;
  }
};

// ─── Upload Metadata JSON ─────────────────────────────────
const uploadMetadataToIPFS = async (metadata) => {
  if (!PINATA_JWT) return null;

  try {
    const response = await axios.post(
      "https://api.pinata.cloud/pinning/pinJSONToIPFS",
      {
        pinataContent: metadata,
        pinataMetadata: { name: `metadata_${metadata.videoId}` },
        pinataOptions: { cidVersion: 1 },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PINATA_JWT}`,
        },
      }
    );

    console.log(`📌 Metadata CID: ${response.data.IpfsHash}`);
    return response.data.IpfsHash;
  } catch (err) {
    const message = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error("⚠️ IPFS metadata upload failed:", message);
    return null;
  }
};

// ─── Fetch JSON from IPFS ─────────────────────────────────
const fetchJsonFromIPFS = async (cid) => {
  if (!cid) return null;
  try {
    const url = `${IPFS_GATEWAY}/${cid}`;
    const response = await axios.get(url, { timeout: 15000 });
    return response.data;
  } catch (err) {
    console.warn(`⚠️ IPFS fetch failed for CID ${cid}: ${err.message}`);
    return null;
  }
};

// ─── Build Gateway URL ────────────────────────────────────
const buildGatewayUrl = (cid) => {
  if (!cid) return null;
  return `${IPFS_GATEWAY}/${cid}`;
};

module.exports = {
  uploadSegmentToIPFS,
  uploadMetadataToIPFS,
  fetchJsonFromIPFS,
  buildGatewayUrl,
};