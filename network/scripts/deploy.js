const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const signers = await hre.ethers.getSigners();

  // 3 organizations using Hardhat accounts
  const newsAgency   = signers[0]; // Account #0
  const broadcaster  = signers[1]; // Account #1
  const auditor      = signers[2]; // Account #2

  console.log("🏢 Deploying with organizations:");
  console.log("  NewsAgency:  ", newsAgency.address);
  console.log("  Broadcaster: ", broadcaster.address);
  console.log("  Auditor:     ", auditor.address);

  const TrustStream = await hre.ethers.getContractFactory("TrustStream");
  const contract = await TrustStream.deploy(
    newsAgency.address,
    broadcaster.address,
    auditor.address
  );
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n✅ TrustStream deployed to:", address);

  // Save deployment info for backend
  const deploymentInfo = {
    address,
    organizations: {
      newsAgency:  { address: newsAgency.address,  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" },
      broadcaster: { address: broadcaster.address, privateKey: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" },
      auditor:     { address: auditor.address,     privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" },
    },
    network: "localhost",
    chainId: 31337,
  };

  fs.writeFileSync(
    "deployment.json",
    JSON.stringify(deploymentInfo, null, 2)
  );

  console.log("📄 Deployment info saved to deployment.json");
  console.log("\n🏢 Organizations registered:");
  console.log("  Org1 — NewsAgency   (submits & endorses)");
  console.log("  Org2 — Broadcaster  (endorses)");
  console.log("  Org3 — Auditor      (endorses)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});