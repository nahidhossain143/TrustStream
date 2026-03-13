const { web3, contract } = require("../config/blockchain");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isBlockchainReady = () => Boolean(web3 && contract);

const withRetry = async (label, fn, retries = 2) => {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await delay(400 * (attempt + 1));
      }
    }
  }

  throw lastError;
};

const shortError = (err) => {
  const raw =
    err?.message ||
    err?.cause?.message ||
    err?.innerError?.message ||
    "Unknown blockchain error";

  return raw.replace(/\s+/g, " ").trim();
};

const normalizePrivateKey = (value) => {
  if (!value) {
    throw new Error("Missing blockchain private key");
  }
  return value.startsWith("0x") ? value : `0x${value}`;
};

const getAccounts = () => {
  if (!web3) {
    throw new Error("Web3 not configured");
  }

  const newsAgency = web3.eth.accounts.privateKeyToAccount(normalizePrivateKey(process.env.PRIVATE_KEY));
  const broadcaster = web3.eth.accounts.privateKeyToAccount(normalizePrivateKey(process.env.BROADCASTER_KEY));
  const auditor = web3.eth.accounts.privateKeyToAccount(normalizePrivateKey(process.env.AUDITOR_KEY));

  try { web3.eth.accounts.wallet.add(newsAgency); } catch {}
  try { web3.eth.accounts.wallet.add(broadcaster); } catch {}
  try { web3.eth.accounts.wallet.add(auditor); } catch {}

  return { newsAgency, broadcaster, auditor };
};

const getGasPrice = async () => {
  const base = BigInt(await web3.eth.getGasPrice());
  return (base * 120n / 100n).toString();
};

const getNonce = async (address) => {
  return web3.eth.getTransactionCount(address, "pending");
};

const registerVideoOnChain = async (videoId, title, metadataCid, totalSegments) => {
  if (!isBlockchainReady()) {
    return { ok: false, skipped: true, error: "Blockchain not configured" };
  }

  try {
    const { newsAgency } = getAccounts();

    await withRetry("registerVideo", async () => {
      const gasPrice = await getGasPrice();
      const nonce = await getNonce(newsAgency.address);

      await contract.methods
        .registerVideo(videoId, title, metadataCid, totalSegments)
        .send({ from: newsAgency.address, gas: 700000, gasPrice, nonce });
    });

    console.log(`⛓️  Video "${title}" registered on blockchain ✅`);
    return { ok: true };
  } catch (err) {
    const error = shortError(err);
    console.error("⚠️  Blockchain registerVideo failed:", error);
    return { ok: false, error };
  }
};

const registerAndEndorse = async (videoId, segmentIndex, sha256Hash, chainHash, ipfsCid) => {
  if (!isBlockchainReady()) {
    return { ok: false, skipped: true, error: "Blockchain not configured" };
  }

  try {
    const { newsAgency, broadcaster, auditor } = getAccounts();
    const gasPrice = await getGasPrice();

    await withRetry(`registerSegment:${segmentIndex}`, async () => {
      const nonce1 = await getNonce(newsAgency.address);
      await contract.methods
        .registerSegment(videoId, segmentIndex, sha256Hash, chainHash, ipfsCid)
        .send({ from: newsAgency.address, gas: 1200000, gasPrice, nonce: nonce1 });
    });

    await delay(2000);

    await withRetry(`endorseBroadcaster:${segmentIndex}`, async () => {
      const nonce2 = await getNonce(broadcaster.address);
      await contract.methods
        .endorseSegment(videoId, segmentIndex)
        .send({ from: broadcaster.address, gas: 500000, gasPrice, nonce: nonce2 });
    });

    await delay(2000);

    await withRetry(`endorseAuditor:${segmentIndex}`, async () => {
      const nonce3 = await getNonce(auditor.address);
      await contract.methods
        .endorseSegment(videoId, segmentIndex)
        .send({ from: auditor.address, gas: 500000, gasPrice, nonce: nonce3 });
    });

    console.log(`⛓️  Segment ${segmentIndex}: registered + endorsed by 3 orgs ✅`);
    return { ok: true, endorsementCount: 3, fullyEndorsed: true };
  } catch (err) {
    const error = shortError(err);
    console.error(`⚠️  Blockchain failed for segment ${segmentIndex}:`, error);
    return { ok: false, error };
  }
};

const verifyOnChain = async (videoId, segmentIndex, clientHash) => {
  if (!isBlockchainReady()) {
    return {
      available: false,
      hashMatch: null,
      fullyEndorsed: null,
      endorsementCount: null,
      error: "Blockchain not configured",
    };
  }

  try {
    const result = await withRetry(
      `verifySegment:${segmentIndex}`,
      () => contract.methods.verifySegment(videoId, Number(segmentIndex), clientHash).call(),
      1
    );

    return {
      available: true,
      hashMatch: result.hashMatch,
      fullyEndorsed: result.fullyEndorsed,
      endorsementCount: Number(result.endorsementCount),
    };
  } catch (err) {
    const error = shortError(err);
    console.error("Blockchain verify error:", error);
    return {
      available: false,
      hashMatch: null,
      fullyEndorsed: null,
      endorsementCount: null,
      error,
    };
  }
};

const getEndorsementsFromChain = async (videoId, segmentIndex) => {
  if (!isBlockchainReady()) return [];

  try {
    const result = await withRetry(
      `getEndorsements:${segmentIndex}`,
      () => contract.methods.getEndorsements(videoId, Number(segmentIndex)).call(),
      1
    );

    return result[0].map((addr, i) => ({
      address: addr,
      orgName: result[1][i],
      timestamp: Number(result[2][i]),
    }));
  } catch (err) {
    console.error("getEndorsements error:", shortError(err));
    return [];
  }
};

const getTxLogsFromChain = async () => {
  if (!isBlockchainReady()) return [];

  try {
    const count = Number(await withRetry("getTxLogCount", () => contract.methods.getTxLogCount().call(), 1));
    const logs = [];
    const start = Math.max(0, count - 20);

    for (let i = start; i < count; i += 1) {
      const log = await withRetry(`getTxLog:${i}`, () => contract.methods.getTxLog(i).call(), 1);
      logs.push({
        action: log.action,
        videoId: log.videoId,
        segmentIndex: Number(log.segmentIndex),
        actor: log.actor,
        orgName: log.orgName,
        timestamp: Number(log.timestamp),
      });
      await delay(150);
    }

    return logs.reverse();
  } catch (err) {
    console.error("getTxLogs error:", shortError(err));
    return [];
  }
};

const getVideoFromChain = async (videoId) => {
  if (!isBlockchainReady()) return { exists: false };

  try {
    const result = await withRetry(`getVideo:${videoId}`, () => contract.methods.getVideo(videoId).call(), 1);

    return {
      title: result.title,
      metadataCid: result.metadataCid,
      uploader: result.uploader,
      uploaderAddr: result.uploaderAddr,
      totalSegments: Number(result.totalSegments),
      registeredAt: Number(result.registeredAt),
      exists: result.exists,
    };
  } catch (err) {
    console.error("getVideo error:", shortError(err));
    return { exists: false };
  }
};

module.exports = {
  registerVideoOnChain,
  registerAndEndorse,
  verifyOnChain,
  getEndorsementsFromChain,
  getTxLogsFromChain,
  getVideoFromChain,
  isBlockchainReady,
};