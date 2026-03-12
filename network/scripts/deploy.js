const hre = require("hardhat");
const fs = require("fs");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("🏢 Deploying with account:", deployer.address);

  const newsAgency  = "0x13EF2Ab9b77e3c9c4B1B654190320C94d3296A09";
  const broadcaster = "0x792C62F52B2E6451C10F76619c785Bf1133A5869";
  const auditor     = "0x91F82a580C5aAb605AC39c18a56B36f047A84c11";

  const TrustStream = await hre.ethers.getContractFactory("TrustStream");
  const contract = await TrustStream.deploy(newsAgency, broadcaster, auditor);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log("\n✅ TrustStream deployed to:", address);

  const deploymentInfo = {
    address,
    organizations: {
      newsAgency:  { address: newsAgency  },
      broadcaster: { address: broadcaster },
      auditor:     { address: auditor     },
    },
    network: "sepolia",
    chainId: 11155111,
  };

  fs.writeFileSync("deployment.json", JSON.stringify(deploymentInfo, null, 2));
  console.log("📄 Deployment info saved to deployment.json");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});