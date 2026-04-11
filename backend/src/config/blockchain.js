const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");

const alchemyKey = process.env.ALCHEMY_API_KEY;

const web3 = alchemyKey
  ? new Web3(`https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`)
  : null;

// ─── Updated ABI — matches new TrustStream.sol ───────────
const CONTRACT_ABI = [
  // Constructor
  {
    inputs: [
      { internalType: "address", name: "newsAgencyAddr", type: "address" },
      { internalType: "address", name: "broadcasterAddr", type: "address" },
      { internalType: "address", name: "auditorAddr", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },

  // ─── Write Functions ───────────────────────────────────
  {
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "string", name: "title", type: "string" },
      { internalType: "string", name: "metadataCid", type: "string" },
      { internalType: "uint256", name: "totalSegments", type: "uint256" },
    ],
    name: "registerVideo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "string", name: "reason", type: "string" },
    ],
    name: "revokeVideo",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "string", name: "newMetadataCid", type: "string" },
    ],
    name: "updateMetadataCid",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    // Updated: now 7 params including c2paManifestHash + c2paInstanceId
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "string", name: "sha256Hash", type: "string" },
      { internalType: "string", name: "chainHash", type: "string" },
      { internalType: "string", name: "ipfsCid", type: "string" },
      { internalType: "string", name: "c2paManifestHash", type: "string" },
      { internalType: "string", name: "c2paInstanceId", type: "string" },
    ],
    name: "registerSegment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
    ],
    name: "endorseSegment",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "string", name: "evidence", type: "string" },
    ],
    name: "reportTamper",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },

  // ─── View Functions ────────────────────────────────────
  {
    // Updated: returns isTampered + videoStatus
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "string", name: "sha256Hash", type: "string" },
    ],
    name: "verifySegment",
    outputs: [
      { internalType: "bool", name: "hashMatch", type: "bool" },
      { internalType: "bool", name: "fullyEndorsed", type: "bool" },
      { internalType: "uint256", name: "endorsementCount", type: "uint256" },
      { internalType: "bool", name: "isTampered", type: "bool" },
      { internalType: "uint8", name: "videoStatus", type: "uint8" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    // Updated: returns status + revokeReason
    inputs: [{ internalType: "string", name: "videoId", type: "string" }],
    name: "getVideo",
    outputs: [
      { internalType: "string", name: "title", type: "string" },
      { internalType: "string", name: "metadataCid", type: "string" },
      { internalType: "string", name: "uploader", type: "string" },
      { internalType: "address", name: "uploaderAddr", type: "address" },
      { internalType: "uint256", name: "totalSegments", type: "uint256" },
      { internalType: "uint256", name: "registeredAt", type: "uint256" },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "string", name: "revokeReason", type: "string" },
      { internalType: "bool", name: "exists", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    // Updated: returns c2paManifestHash + c2paInstanceId (split from old getSegment)
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
    ],
    name: "getSegment",
    outputs: [
      { internalType: "string", name: "sha256Hash", type: "string" },
      { internalType: "string", name: "chainHash", type: "string" },
      { internalType: "string", name: "ipfsCid", type: "string" },
      { internalType: "string", name: "c2paManifestHash", type: "string" },
      { internalType: "string", name: "c2paInstanceId", type: "string" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
      { internalType: "address", name: "submitter", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    // New function — split from getSegment to avoid stack too deep
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
    ],
    name: "getSegmentStatus",
    outputs: [
      { internalType: "uint256", name: "endorsementCount", type: "uint256" },
      { internalType: "bool", name: "fullyEndorsed", type: "bool" },
      { internalType: "bool", name: "tampered", type: "bool" },
      { internalType: "uint256", name: "disputeCount", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    // New function
    inputs: [{ internalType: "string", name: "videoId", type: "string" }],
    name: "getFullyEndorsedCount",
    outputs: [{ internalType: "uint256", name: "count", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    // New function
    inputs: [{ internalType: "address", name: "uploaderAddr", type: "address" }],
    name: "getVideosByUploader",
    outputs: [{ internalType: "string[]", name: "", type: "string[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    // New function
    inputs: [],
    name: "getTamperReportCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    // New function
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getTamperReport",
    outputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "address", name: "reporter", type: "address" },
      { internalType: "string", name: "reporterOrg", type: "string" },
      { internalType: "string", name: "evidence", type: "string" },
      { internalType: "uint256", name: "reportedAt", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getVideoIdCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getVideoIdAt",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
    ],
    name: "getEndorsements",
    outputs: [
      { internalType: "address[]", name: "", type: "address[]" },
      { internalType: "string[]", name: "", type: "string[]" },
      { internalType: "uint256[]", name: "", type: "uint256[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getTxLogCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "index", type: "uint256" }],
    name: "getTxLog",
    outputs: [
      { internalType: "string", name: "action", type: "string" },
      { internalType: "string", name: "videoId", type: "string" },
      { internalType: "uint256", name: "segmentIndex", type: "uint256" },
      { internalType: "address", name: "actor", type: "address" },
      { internalType: "string", name: "orgName", type: "string" },
      { internalType: "uint256", name: "timestamp", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "getOrganizations",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
];

let contract = null;

try {
  if (!web3) throw new Error("ALCHEMY_API_KEY not configured");

  // ─── Contract address: env first, then deployment.json ──
  let contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    const deploymentPath = path.join(__dirname, "../../../network/deployment.json");
    if (fs.existsSync(deploymentPath)) {
      const deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
      contractAddress = deploymentInfo.address;
    }
  }

  if (!contractAddress) throw new Error("CONTRACT_ADDRESS not set in .env or deployment.json");

  contract = new web3.eth.Contract(CONTRACT_ABI, contractAddress);
  console.log("✅ Blockchain contract loaded:", contractAddress);
} catch (err) {
  console.warn(`⚠️  Blockchain features disabled: ${err.message}`);
}

module.exports = { web3, contract };