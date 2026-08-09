const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { EventEmitter } = require("events");
const grpc = require("@grpc/grpc-js");
const { connect, signers } = require("@hyperledger/fabric-gateway");
const {
  common,
  peer: peerProtos,
  msp: mspProtos,
  gateway: gatewayProtos,
} = require("@hyperledger/fabric-protos");

const ORG_NAME_BY_MSP = {
  Org1MSP: "NewsAgency",
  Org2MSP: "Broadcaster",
  Org3MSP: "Auditor",
};

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

// Decodes the endorsed (but not yet submitted) transaction envelope to find
// which physical peer (peer0 or peer1, identified by its own enrolled cert
// CN) actually endorsed on behalf of each org -- not derivable from the
// chaincode's own `endorsements` field, since that only records the org that
// invoked the function, not which of that org's peers signed it.
function getEndorsingPeersByOrg(transaction) {
  const prepared = gatewayProtos.PreparedTransaction.deserializeBinary(
    transaction.getBytes()
  );
  const envelope = prepared.getEnvelope();
  const payload = common.Payload.deserializeBinary(envelope.getPayload_asU8());
  const tx = peerProtos.Transaction.deserializeBinary(payload.getData_asU8());

  const endorsingPeers = {};

  for (const action of tx.getActionsList()) {
    const ccActionPayload = peerProtos.ChaincodeActionPayload.deserializeBinary(
      action.getPayload_asU8()
    );
    const endorsements = ccActionPayload.getAction().getEndorsementsList();

    for (const endorsement of endorsements) {
      const identity = mspProtos.SerializedIdentity.deserializeBinary(
        endorsement.getEndorser_asU8()
      );
      const mspId = identity.getMspid();
      const pem = Buffer.from(identity.getIdBytes_asU8()).toString("utf8");

      let peerCommonName = null;
      try {
        peerCommonName = new crypto.X509Certificate(pem).subject
          .split("\n")
          .find((line) => line.startsWith("CN="))
          ?.slice(3);
      } catch {
        // leave peerCommonName null if the cert is unparsable
      }

      const orgName = ORG_NAME_BY_MSP[mspId] || mspId;
      endorsingPeers[orgName] = peerCommonName
        ? `${peerCommonName}.${mspId.toLowerCase().replace("msp", "")}.example.com`
        : mspId;
    }
  }

  return endorsingPeers;
}

async function submitWithEndorsingPeers(contract, fnName, args) {
  const proposal = contract.newProposal(fnName, { arguments: args });
  const transaction = await proposal.endorse();
  const endorsingPeers = getEndorsingPeersByOrg(transaction);
  const commit = await transaction.submit();
  await commit.getStatus();

  const proof = parseFabricResult(transaction.getResult());
  proof.endorsingPeers = endorsingPeers;
  return proof;
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
    return await submitWithEndorsingPeers(contract, "RegisterVideoProof", [
      String(videoId),
      String(title || ""),
      String(metadataCid || ""),
      String(merkleRoot || ""),
      String(totalSegments || 0),
    ]);
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
    return await submitWithEndorsingPeers(contract, "RegisterImageProof", [
      String(imageId),
      String(title || ""),
      String(sha256Hash || ""),
      String(ipfsCid || ""),
      String(metadataCid || ""),
      String(c2paHash || ""),
    ]);
  } finally {
    gateway.close();
    client.close();
  }
}

async function verifyVideoProof(videoId, currentMerkleRoot) {
  if (process.env.FABRIC_ENABLED !== "true") {
    return { available: false, reason: "FABRIC_ENABLED is not true" };
  }

  const { gateway, client, contract } = await getFabricContract();

  try {
    const result = await contract.evaluateTransaction(
      "VerifyVideoProof",
      String(videoId),
      String(currentMerkleRoot || "")
    );
    return { available: true, ...parseFabricResult(result) };
  } catch (err) {
    return { available: false, reason: err.message };
  } finally {
    gateway.close();
    client.close();
  }
}

async function verifyImageProof(imageId, currentSha256Hash) {
  if (process.env.FABRIC_ENABLED !== "true") {
    return { available: false, reason: "FABRIC_ENABLED is not true" };
  }

  const { gateway, client, contract } = await getFabricContract();

  try {
    const result = await contract.evaluateTransaction(
      "VerifyImageProof",
      String(imageId),
      String(currentSha256Hash || "")
    );
    return { available: true, ...parseFabricResult(result) };
  } catch (err) {
    return { available: false, reason: err.message };
  } finally {
    gateway.close();
    client.close();
  }
}

// Withdraws the consortium's endorsement of a media proof. Like registration,
// this needs all three orgs to endorse, so one member cannot unilaterally
// discredit another's work.
async function revokeMediaProof(mediaType, mediaId, reason) {
  if (process.env.FABRIC_ENABLED !== "true") {
    return { skipped: true, reason: "FABRIC_ENABLED is not true" };
  }

  const { gateway, client, contract } = await getFabricContract();

  try {
    return await submitWithEndorsingPeers(contract, "RevokeMedia", [
      String(mediaType),
      String(mediaId),
      String(reason || ""),
    ]);
  } finally {
    gateway.close();
    client.close();
  }
}

// Every version this record has held on the ledger, newest first, each with the
// transaction that produced it.
async function getMediaHistory(mediaType, mediaId) {
  if (process.env.FABRIC_ENABLED !== "true") {
    return { available: false, reason: "FABRIC_ENABLED is not true" };
  }

  const { gateway, client, contract } = await getFabricContract();

  try {
    const result = await contract.evaluateTransaction(
      "GetMediaHistory",
      String(mediaType),
      String(mediaId)
    );
    return { available: true, history: parseFabricResult(result) };
  } catch (err) {
    return { available: false, reason: err.message };
  } finally {
    gateway.close();
    client.close();
  }
}

// Rich queries run against CouchDB, so they are evaluated (read-only) and never
// submitted -- results are not guaranteed identical across peers.
async function queryLedger(fnName, args = []) {
  if (process.env.FABRIC_ENABLED !== "true") {
    return { available: false, reason: "FABRIC_ENABLED is not true" };
  }

  const { gateway, client, contract } = await getFabricContract();

  try {
    const result = await contract.evaluateTransaction(
      fnName,
      ...args.map(String)
    );
    return { available: true, results: parseFabricResult(result) };
  } catch (err) {
    return { available: false, reason: err.message };
  } finally {
    gateway.close();
    client.close();
  }
}

// ─── Chaincode event stream ───────────────────────────────────────
//
// A single long-lived listener on the channel, shared by every HTTP client.
// The chaincode emits MediaRegistered only after the block commits, so an
// event arriving here means all 3 orgs endorsed and the write is final --
// there is nothing left to poll for.
//
// Consumers subscribe to `fabricEvents` ("MediaRegistered"); they never touch
// the gateway connection, so a browser disconnecting costs nothing.

const fabricEvents = new EventEmitter();
// Route handlers attach one listener per connected browser; the default cap of
// 10 would print a spurious leak warning once a few tabs are open.
fabricEvents.setMaxListeners(0);

let eventStreamState = { running: false, error: null, lastBlock: null };

async function runEventStream() {
  const { gateway, client } = await getFabricContract();
  const network = gateway.getNetwork(process.env.FABRIC_CHANNEL_NAME);

  // Only events from here on; replaying history would re-announce every past
  // upload to anyone who opens the dashboard.
  const events = await network.getChaincodeEvents(
    process.env.FABRIC_CHAINCODE_NAME
  );

  eventStreamState = { running: true, error: null, lastBlock: null };
  console.log("[fabric] chaincode event listener started");

  try {
    for await (const event of events) {
      eventStreamState.lastBlock = event.blockNumber.toString();

      let payload;
      try {
        payload = JSON.parse(Buffer.from(event.payload).toString("utf8"));
      } catch {
        // A malformed payload is not worth killing the stream over.
        console.warn("[fabric] unparsable event payload, skipping");
        continue;
      }

      console.log(
        `[fabric] event ${event.eventName} block=${event.blockNumber} id=${payload.mediaId}`
      );

      fabricEvents.emit(event.eventName, {
        ...payload,
        blockNumber: event.blockNumber.toString(),
        transactionId: event.transactionId,
      });
    }
  } finally {
    events.close();
    gateway.close();
    client.close();
  }
}

// Keeps the stream alive across peer restarts and transient gRPC drops, which
// are routine on a laptop network that gets torn down and rebuilt.
function startFabricEventListener() {
  if (process.env.FABRIC_ENABLED !== "true") {
    console.log("[fabric] event listener disabled (FABRIC_ENABLED is not true)");
    return;
  }

  const RETRY_MS = 5000;

  const loop = async () => {
    try {
      await runEventStream();
      console.warn("[fabric] event stream ended, reconnecting...");
    } catch (err) {
      eventStreamState = { running: false, error: err.message, lastBlock: null };
      console.error("[fabric] event stream failed:", err.message);
    }
    setTimeout(loop, RETRY_MS).unref();
  };

  loop();
}

function getEventStreamStatus() {
  return { ...eventStreamState };
}

module.exports = {
  registerVideoProof,
  registerImageProof,
  verifyVideoProof,
  verifyImageProof,
  revokeMediaProof,
  getMediaHistory,
  queryLedger,
  fabricEvents,
  startFabricEventListener,
  getEventStreamStatus,
};