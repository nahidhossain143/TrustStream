require("dotenv").config();
const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🏢 Deploying with account:", deployer.address);

  // Load from .env
  const newsAgency = process.env.NEWSAGENCY_ADDRESS;
  const broadcaster = process.env.BROADCASTER_ADDRESS;
  const auditor = process.env.AUDITOR_ADDRESS;

  // Validation
  if (!newsAgency || !broadcaster || !auditor) {
    throw new Error("❌ Missing organization addresses in .env file");
  }

  console.log("Organizations:");
  console.log("  NewsAgency: ", newsAgency);
  console.log("  Broadcaster:", broadcaster);
  console.log("  Auditor:    ", auditor);

  const TrustStream = await hre.ethers.getContractFactory("TrustStream");
  const contract = await TrustStream.deploy(newsAgency, broadcaster, auditor);

  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log("\n✅ TrustStream deployed to:", address);

  const deploymentInfo = {
    address,
    organizations: {
      newsAgency: { address: newsAgency },
      broadcaster: { address: broadcaster },
      auditor: { address: auditor }
    },
    network: "sepolia",
    chainId: 11155111,
    deployedAt: new Date().toISOString(),
  };

  fs.writeFileSync("deployment.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("📄 Deployment info saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});