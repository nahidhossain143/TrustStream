// -----------------------------------------------------------------
//  backend/src/config/blockchain.js
//
//  Single source of truth for blockchain connectivity.
// -----------------------------------------------------------------

const { Web3 } = require("web3");
const fs = require("fs");
const path = require("path");

// ABI bundle exported by network/scripts/deploy.js
const ABI_BUNDLE_PATH = path.join(__dirname, "TrustStream.abi.json");

// Merkle batching requires these contract methods.
// If missing, redeploy TrustStream.sol and regenerate TrustStream.abi.json.
const REQUIRED_CONTRACT_METHODS = [
  "registerVideo",
  "registerSegment",
  "endorseSegment",
  "verifySegment",
  "anchorMerkleRoot",
  "getMerkleRoot",
];

// --- Helpers -----------------------------------------------------

function normalizeKey(key) {
  if (!key) return null;
  return key.startsWith("0x") ? key : "0x" + key;
}

function loadAbiBundle() {
  if (!fs.existsSync(ABI_BUNDLE_PATH)) {
    throw new Error(
      "TrustStream.abi.json not found at " +
        ABI_BUNDLE_PATH +
        ". Run `npx hardhat run scripts/deploy.js --network sepolia` from the network/ folder first."
    );
  }

  const bundle = JSON.parse(fs.readFileSync(ABI_BUNDLE_PATH, "utf8"));

  if (!bundle.abi || !Array.isArray(bundle.abi)) {
    throw new Error("Invalid abi bundle: missing or non-array `abi` field.");
  }

  if (!bundle.address) {
    throw new Error("Invalid abi bundle: missing `address` field.");
  }

  return bundle;
}

function validateAbiMethods(abi) {
  const names = new Set(
    abi
      .filter((item) => item.type === "function")
      .map((item) => item.name)
  );

  const missing = REQUIRED_CONTRACT_METHODS.filter((name) => !names.has(name));

  if (missing.length > 0) {
    console.warn(
      "[blockchain] ABI is missing required method(s): " + missing.join(", ")
    );
    console.warn(
      "[blockchain] Redeploy TrustStream.sol and regenerate TrustStream.abi.json."
    );
  }
}

function buildRpcUrl() {
  if (process.env.SEPOLIA_RPC_URL) return process.env.SEPOLIA_RPC_URL;

  if (process.env.ALCHEMY_API_KEY) {
    return "https://eth-sepolia.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY;
  }

  return null;
}

function addOrgAccount(web3Instance, key, label) {
  const normalized = normalizeKey(key);

  if (!normalized) {
    console.warn(
      "[blockchain] " + label + " key not configured; this org cannot sign transactions."
    );
    return null;
  }

  try {
    const acct = web3Instance.eth.accounts.privateKeyToAccount(normalized);
    web3Instance.eth.accounts.wallet.add(acct);
    return acct.address;
  } catch (err) {
    console.warn("[blockchain] Failed to load " + label + " account: " + err.message);
    return null;
  }
}

// --- Module state ------------------------------------------------

let web3 = null;
let contract = null;
let contractAddress = null;
let chainId = null;
let network = null;
let deployedAt = null;

const accounts = {
  newsAgency: null,
  broadcaster: null,
  auditor: null,
};

// --- Initialization ----------------------------------------------

try {
  const rpcUrl = buildRpcUrl();

  if (!rpcUrl) {
    throw new Error(
      "RPC URL not configured. Set SEPOLIA_RPC_URL or ALCHEMY_API_KEY in backend/.env"
    );
  }

  web3 = new Web3(rpcUrl);

  const bundle = loadAbiBundle();

  validateAbiMethods(bundle.abi);

  network = bundle.network || "sepolia";
  chainId = bundle.chainId || null;
  deployedAt = bundle.deployedAt || null;

  if (
    process.env.CONTRACT_ADDRESS &&
    process.env.CONTRACT_ADDRESS.toLowerCase() !== bundle.address.toLowerCase()
  ) {
    console.warn(
      "[blockchain] CONTRACT_ADDRESS env (" +
        process.env.CONTRACT_ADDRESS +
        ") differs from abi bundle address (" +
        bundle.address +
        "). Using bundle address. Remove the env var to silence this warning."
    );
  }

  contractAddress = bundle.address;

  accounts.newsAgency = addOrgAccount(web3, process.env.PRIVATE_KEY, "NewsAgency");
  accounts.broadcaster = addOrgAccount(web3, process.env.BROADCASTER_KEY, "Broadcaster");
  accounts.auditor = addOrgAccount(web3, process.env.AUDITOR_KEY, "Auditor");

  contract = new web3.eth.Contract(bundle.abi, contractAddress);

  console.log("[blockchain] Contract loaded:", contractAddress);
  console.log("[blockchain] Network:", network, "(chainId:", chainId + ")");
  console.log("[blockchain] ABI deployed at:", deployedAt || "(unknown)");
  console.log("[blockchain] Org accounts:");
  console.log("             NewsAgency:  " + (accounts.newsAgency || "(missing PRIVATE_KEY)"));
  console.log("             Broadcaster: " + (accounts.broadcaster || "(missing BROADCASTER_KEY)"));
  console.log("             Auditor:     " + (accounts.auditor || "(missing AUDITOR_KEY)"));
} catch (err) {
  console.warn("[blockchain] Features disabled: " + err.message);
}

// --- Public helpers ----------------------------------------------

function isReady() {
  return Boolean(web3 && contract);
}

function getExplorerUrl(hashOrAddr, type) {
  const t = type || "tx";

  if (chainId === 11155111) {
    return "https://sepolia.etherscan.io/" + t + "/" + hashOrAddr;
  }

  return null;
}

function getAccountByRole(role) {
  return accounts[role] || null;
}

module.exports = {
  web3,
  contract,
  contractAddress,
  chainId,
  network,
  deployedAt,
  accounts,
  isReady,
  getExplorerUrl,
  getAccountByRole,
};