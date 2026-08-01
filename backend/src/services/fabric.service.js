const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const grpc = require("@grpc/grpc-js");
const { connect, signers } = require("@hyperledger/fabric-gateway");

async function getFirstKeyFile(keyDir) {
  const files = await fs.readdir(keyDir);
  const keyFile = files.find((file) => !file.startsWith("."));

  if (!keyFile) {
    throw new Error(`No private key found in ${keyDir}`);
  }

  return path.join(keyDir, keyFile);
}

async function getFabricContract() {
  const tlsCert = await fs.readFile(process.env.FABRIC_TLS_CERT_PATH);
  const credentials = grpc.credentials.createSsl(tlsCert);

  const client = new grpc.Client(
    process.env.FABRIC_PEER_ENDPOINT,
    credentials,
    {
      "grpc.ssl_target_name_override": process.env.FABRIC_PEER_HOST_ALIAS,
    }
  );

  const cert = await fs.readFile(process.env.FABRIC_CERT_PATH);

  const keyPath =
    process.env.FABRIC_KEY_PATH ||
    (await getFirstKeyFile(process.env.FABRIC_KEY_DIR));

  const privateKeyPem = await fs.readFile(keyPath);
  const privateKey = crypto.createPrivateKey(privateKeyPem);

  const gateway = connect({
    client,
    identity: {
      mspId: process.env.FABRIC_MSP_ID,
      credentials: cert,
    },
    signer: signers.newPrivateKeySigner(privateKey),
  });

  const network = gateway.getNetwork(process.env.FABRIC_CHANNEL_NAME);
  const contract = network.getContract(process.env.FABRIC_CHAINCODE_NAME);

  return { gateway, client, contract };
}

function parseFabricResult(result) {
  const text = Buffer.from(result).toString("utf8");

  try {
    return text ? JSON.parse(text) : { success: true };
  } catch {
    return { success: true, result: text };
  }
}

async function registerVideoProof({
  videoId,
  title,
  metadataCid,
  merkleRoot,
  totalSegments,
}) {
  if (process.env.FABRIC_ENABLED !== "true") {
    return {
      skipped: true,
      reason: "FABRIC_ENABLED is not true",
    };
  }

  const { gateway, client, contract } = await getFabricContract();

  try {
    const result = await contract.submitTransaction(
      "RegisterVideoProof",
      String(videoId),
      String(title || ""),
      String(metadataCid || ""),
      String(merkleRoot || ""),
      String(totalSegments || 0)
    );

    return parseFabricResult(result);
  } finally {
    gateway.close();
    client.close();
  }
}

async function registerImageProof({
  imageId,
  title,
  sha256Hash,
  ipfsCid,
  metadataCid,
  c2paHash,
}) {
  if (process.env.FABRIC_ENABLED !== "true") {
    return {
      skipped: true,
      reason: "FABRIC_ENABLED is not true",
    };
  }

  const { gateway, client, contract } = await getFabricContract();

  try {
    const result = await contract.submitTransaction(
      "RegisterImageProof",
      String(imageId),
      String(title || ""),
      String(sha256Hash || ""),
      String(ipfsCid || ""),
      String(metadataCid || ""),
      String(c2paHash || "")
    );

    return parseFabricResult(result);
  } finally {
    gateway.close();
    client.close();
  }
}

module.exports = {
  registerVideoProof,
  registerImageProof,
};