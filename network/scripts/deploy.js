const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🏢 Deploying with account:", deployer.address);

  const newsAgency = "0x4b4b13F24F888FaaaDF4E301e48933C2f8243137";
  const broadcaster = "0xe0C68F64e2E871D01A073D2cd25100f5A5d161d6";
  const auditor = "0x6986205bE39f85627934D6edf7dA627f0857eA86";

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
    chainId: 11155111
  };

  fs.writeFileSync("deployment.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("📄 Deployment info saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});