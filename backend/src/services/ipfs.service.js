// -----------------------------------------------------------------
//  backend/src/services/ipfs.service.js
//
//  Pinata-backed IPFS upload helpers for files (video segments, images)
//  and JSON metadata. All Pinata-specific boilerplate is centralized in
//  the internal `pinFile` / `pinJson` helpers; the public API stays
//  thin and named for the caller's intent (segment / image / metadata).
// -----------------------------------------------------------------

const fs = require("fs");
const axios = require("axios");
const FormData = require("form-data");

const PINATA_JWT = process.env.PINATA_JWT;
const IPFS_GATEWAY =
  process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";

const PINATA_FILE_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PINATA_JSON_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

// --- Internal helpers --------------------------------------------

const ensureJwt = (label) => {
  if (!PINATA_JWT) {
    console.warn(`[ipfs] PINATA_JWT not set; skipping ${label} upload`);
    return false;
  }
  return true;
};

const formatError = (err) =>
  err.response?.data ? JSON.stringify(err.response.data) : err.message;

const isRateLimit = (msg) => /RATE_LIMITED|rate limit/i.test(msg || "");

/**
 * Pin any file to Pinata.
 * Throws on rate-limit so the caller can implement retry/backoff.
 * Returns the CID on success, null on non-rate-limit failure.
 */
const pinFile = async (filePath, fileName, pinataName, label) => {
  if (!ensureJwt(label)) return null;
  try {
    const data = new FormData();
    data.append("file", fs.createReadStream(filePath), fileName);
    data.append("pinataMetadata", JSON.stringify({ name: pinataName }));
    data.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const response = await axios.post(PINATA_FILE_URL, data, {
      maxBodyLength: Infinity,
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        ...data.getHeaders(),
      },
    });

    console.log(`[ipfs] ${label} ${fileName} -> ${response.data.IpfsHash}`);
    return response.data.IpfsHash;
  } catch (err) {
    const message = formatError(err);
    if (isRateLimit(message)) throw new Error("RATE_LIMITED: " + message);
    console.error(`[ipfs] ${label} upload failed for ${fileName}: ${message}`);
    return null;
  }
};

/**
 * Pin a JSON payload to Pinata.
 * Throws on rate-limit; returns CID on success, null on other failure.
 */
const pinJson = async (payload, pinataName, label) => {
  if (!ensureJwt(label)) return null;
  try {
    const response = await axios.post(
      PINATA_JSON_URL,
      {
        pinataContent: payload,
        pinataMetadata: { name: pinataName },
        pinataOptions: { cidVersion: 1 },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PINATA_JWT}`,
        },
      }
    );

    console.log(`[ipfs] ${label} ${pinataName} -> ${response.data.IpfsHash}`);
    return response.data.IpfsHash;
  } catch (err) {
    const message = formatError(err);
    if (isRateLimit(message)) throw new Error("RATE_LIMITED: " + message);
    console.error(
      `[ipfs] ${label} upload failed for ${pinataName}: ${message}`
    );
    return null;
  }
};

// --- Public API --------------------------------------------------

/**
 * Upload an arbitrary JSON object to IPFS.
 * Returns CID or null.
 */
const uploadJsonToIPFS = (payload, name = "metadata") =>
  pinJson(payload, name, "json");

/**
 * Upload a video HLS segment (.ts file) to IPFS.
 * Used inside the per-segment register pipeline.
 */
const uploadSegmentToIPFS = (filePath, fileName) =>
  pinFile(filePath, fileName, fileName, "segment");

/**
 * Upload an image file (jpg/png/webp/etc.) to IPFS.
 * Single-shot upload - images aren't chunked.
 */
const uploadImageToIPFS = (filePath, fileName) =>
  pinFile(filePath, fileName, `image_${fileName}`, "image");

/**
 * Upload a video manifest's metadata JSON to IPFS.
 * Convention: "metadata_<videoId>".
 */
const uploadMetadataToIPFS = (metadata) =>
  pinJson(metadata, `metadata_${metadata.videoId}`, "video-metadata");

/**
 * Upload an image manifest's metadata JSON to IPFS.
 * Convention: "image_metadata_<imageId>".
 */
const uploadImageMetadataToIPFS = (metadata) =>
  pinJson(metadata, `image_metadata_${metadata.imageId}`, "image-metadata");

/**
 * Upload a signed C2PA image sidecar manifest as JSON to IPFS.
 * Convention: "image_c2pa_<imageId>". Used in the IPFS-only image
 * pipeline so verification works without a local sidecar file.
 */
const uploadImageC2paToIPFS = (signedManifest, imageId) =>
  pinJson(signedManifest, `image_c2pa_${imageId}`, "image-c2pa");

/**
 * Fetch a JSON document from IPFS via the configured gateway.
 * Returns null on miss / network failure (does not throw).
 */
const fetchJsonFromIPFS = async (cid) => {
  if (!cid) return null;
  try {
    const url = `${IPFS_GATEWAY}/${cid}`;
    const response = await axios.get(url, { timeout: 15000 });
    return response.data;
  } catch (err) {
    console.warn(`[ipfs] fetch failed for CID ${cid}: ${err.message}`);
    return null;
  }
};

/**
 * Build a public gateway URL for a CID, or null if no CID provided.
 */
const buildGatewayUrl = (cid) => {
  if (!cid) return null;
  return `${IPFS_GATEWAY}/${cid}`;
};

module.exports = {
  uploadJsonToIPFS,
  uploadSegmentToIPFS,
  uploadImageToIPFS,
  uploadMetadataToIPFS,
  uploadImageMetadataToIPFS,
  uploadImageC2paToIPFS,
  fetchJsonFromIPFS,
  buildGatewayUrl,
};
