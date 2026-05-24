require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Build the deployer account from PRIVATE_KEY in .env.
// Auto-prepends "0x" if it's missing so the user can store the key either way.
function buildPrivateKey() {
  const key = process.env.PRIVATE_KEY;
  if (!key) return null;
  return key.startsWith("0x") ? key : "0x" + key;
}

const PRIVATE_KEY = buildPrivateKey();

// Sepolia RPC URL: prefer env var, fall back to the hardcoded Alchemy URL so
// existing setups keep working. NOTE: rotate the hardcoded key when convenient
// and move it into .env (SEPOLIA_RPC_URL).
const SEPOLIA_RPC_URL =
  process.env.SEPOLIA_RPC_URL ||
  "https://eth-sepolia.g.alchemy.com/v2/WjeDbzguMl8bdUx7SewYt";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY || "",
    },
  },
  sourcify: {
    enabled: true,
  },
};
