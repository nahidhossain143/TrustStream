require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  // --- Deployer info -------------------------------------------------
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const network = await hre.ethers.provider.getNetwork();
  const networkName = hre.network.name;
  const chainId = Number(network.chainId);

  console.log("[deploy] Account:", deployer.address);
  console.log("[deploy] Balance:", hre.ethers.formatEther(balance), "ETH");
  console.log("[deploy] Network:", networkName, "(chainId: " + chainId + ")");

  // --- Org addresses from .env ---------------------------------------
  const newsAgency = process.env.NEWSAGENCY_ADDRESS;
  const broadcaster = process.env.BROADCASTER_ADDRESS;
  const auditor = process.env.AUDITOR_ADDRESS;

  if (!newsAgency || !broadcaster || !auditor) {
    throw new Error(
      "Missing organization addresses in .env (NEWSAGENCY_ADDRESS, BROADCASTER_ADDRESS, AUDITOR_ADDRESS)"
    );
  }

  console.log("");
  console.log("[deploy] Organizations:");
  console.log("         NewsAgency: ", newsAgency);
  console.log("         Broadcaster:", broadcaster);
  console.log("         Auditor:    ", auditor);

  // --- Deploy --------------------------------------------------------
  console.log("");
  console.log("[deploy] Deploying TrustStream...");
  const TrustStream = await hre.ethers.getContractFactory("TrustStream");
  const contract = await TrustStream.deploy(newsAgency, broadcaster, auditor);

  const deployTx = contract.deploymentTransaction();
  console.log("[deploy] Tx hash:", deployTx.hash);
  console.log("[deploy] Waiting for confirmation...");

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await deployTx.wait();

  console.log("");
  console.log("[deploy] TrustStream deployed.");
  console.log("         Address:  ", address);
  console.log("         Block:    ", receipt.blockNumber);
  console.log("         Gas used: ", receipt.gasUsed.toString());

  // --- Smoke test: confirm new image functions exist in bytecode ----
  console.log("");
  console.log("[deploy] Smoke test (image + video functions):");
  try {
    const videoCount = await contract.getVideoIdCount();
    const imageCount = await contract.getImageIdCount();
    console.log("         getVideoIdCount():", videoCount.toString(), "OK");
    console.log("         getImageIdCount():", imageCount.toString(), "OK (image support active)");
  } catch (err) {
    console.warn("         Smoke test failed:", err.message);
  }

  // --- Save deployment artifacts ------------------------------------
  const deploymentInfo = {
    address,
    txHash: deployTx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    deployer: deployer.address,
    organizations: {
      newsAgency: { address: newsAgency },
      broadcaster: { address: broadcaster },
      auditor: { address: auditor },
    },
    network: networkName,
    chainId,
    deployedAt: new Date().toISOString(),
    constructorArgs: [newsAgency, broadcaster, auditor],
    contractName: "TrustStream",
  };

  // Use __dirname so the script works regardless of cwd
  const networkDir = path.resolve(__dirname, "..");
  const deploymentPath = path.join(networkDir, "deployment.json");
  const addressPath = path.join(networkDir, "contract-address.json");

  fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
  fs.writeFileSync(addressPath, JSON.stringify({ address, chainId }, null, 2));

  console.log("");
  console.log("[deploy] Deployment artifacts saved:");
  console.log("         ", path.relative(networkDir, deploymentPath));
  console.log("         ", path.relative(networkDir, addressPath));

  // --- Auto-export ABI bundle to backend + frontend -----------------
  // Eliminates manual ABI sync; backend/frontend always match deployed contract
  console.log("");
  console.log("[deploy] Exporting ABI to backend + frontend:");
  try {
    const artifactPath = path.join(
      networkDir,
      "artifacts/contracts/TrustStream.sol/TrustStream.json"
    );

    if (!fs.existsSync(artifactPath)) {
      console.warn(
        "         Compile artifact not found. Run `npx hardhat compile` first, then re-run deploy."
      );
    } else {
      const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
      const abiBundle = {
        contractName: "TrustStream",
        address,
        chainId,
        network: networkName,
        deployedAt: deploymentInfo.deployedAt,
        abi: artifact.abi,
      };

      // Backend -> backend/src/config/TrustStream.abi.json
      const backendAbiDir = path.resolve(networkDir, "../backend/src/config");
      if (fs.existsSync(backendAbiDir)) {
        const backendAbiPath = path.join(backendAbiDir, "TrustStream.abi.json");
        fs.writeFileSync(backendAbiPath, JSON.stringify(abiBundle, null, 2));
        console.log("         Backend  ->", path.relative(networkDir, backendAbiPath));
      } else {
        console.warn("         Backend  -> skipped (dir not found):", backendAbiDir);
      }

      // Frontend -> frontend/src/services/TrustStream.abi.json
      const frontendAbiDir = path.resolve(networkDir, "../frontend/src/services");
      if (fs.existsSync(frontendAbiDir)) {
        const frontendAbiPath = path.join(frontendAbiDir, "TrustStream.abi.json");
        fs.writeFileSync(frontendAbiPath, JSON.stringify(abiBundle, null, 2));
        console.log("         Frontend ->", path.relative(networkDir, frontendAbiPath));
      } else {
        console.warn("         Frontend -> skipped (dir not found):", frontendAbiDir);
      }
    }
  } catch (err) {
    console.warn("         ABI export failed:", err.message);
  }

  // --- Block explorer URLs (Sepolia) --------------------------------
  if (chainId === 11155111) {
    console.log("");
    console.log("[deploy] Block explorers:");
    console.log("         Etherscan:  https://sepolia.etherscan.io/address/" + address);
    console.log("         Blockscout: https://eth-sepolia.blockscout.com/address/" + address);
    console.log(
      "         Sourcify:   https://repo.sourcify.dev/contracts/full_match/11155111/" +
        address +
        "/"
    );
    console.log("");
    console.log("[deploy] To verify on Etherscan, run:");
    console.log(
      "         npx hardhat verify --network sepolia " +
        address +
        " " +
        newsAgency +
        " " +
        broadcaster +
        " " +
        auditor
    );
  }

  console.log("");
  console.log("[deploy] Deployment complete.");
  console.log("");
}

main().catch((error) => {
  console.error("");
  console.error("[deploy] Deployment failed:");
  console.error(error);
  process.exit(1);
});
