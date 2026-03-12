const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");

// Sepolia connection via Alchemy
const web3 = new Web3(
  `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
);

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
  {
    inputs: [{ internalType: "string", name: "videoId", type: "string" }],
    name: "getVideo",
    outputs: [
      { internalType: "string",  name: "title",         type: "string"  },
      { internalType: "string",  name: "uploader",      type: "string"  },
      { internalType: "address", name: "uploaderAddr",  type: "address" },
      { internalType: "uint256", name: "totalSegments", type: "uint256" },
      { internalType: "uint256", name: "registeredAt",  type: "uint256" },
      { internalType: "bool",    name: "exists",        type: "bool"    },
    ],
    stateMutability: "view",
    type: "function",
  },
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

// Load deployment info
let contract = null;
let orgs = null;

try {
  const deploymentInfo = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../../network/deployment.json"),
      "utf8"
    )
  );
  contract = new web3.eth.Contract(CONTRACT_ABI, deploymentInfo.address);
  orgs = deploymentInfo.organizations;
  console.log("✅ Blockchain contract loaded:", deploymentInfo.address);
} catch (e) {
  console.warn("⚠️  deployment.json not found. Blockchain features disabled.");
}

module.exports = { web3, contract, orgs };