// -----------------------------------------------------------------
//  backend/src/services/blockchain.service.js
//
//  All blockchain write/read operations for video + image flows.
//  Uses a single shared web3/contract instance and the 3 org accounts
//  loaded by ../config/blockchain.js.
// -----------------------------------------------------------------

const {
  web3,
  contract,
  accounts,         // { newsAgency, broadcaster, auditor } - addresses (strings)
  contractAddress,
  network,
  isReady,
  getExplorerUrl,
} = require("../config/blockchain");

// --- Utilities ---------------------------------------------------

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isBlockchainReady = () => isReady();

const withRetry = async (label, fn, retries = 2) => {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) await delay(300 * (attempt + 1));
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

// Throws if the requested org account isn't configured.
const requireAccount = (role) => {
  const addr = accounts[role];
  if (!addr) {
    throw new Error(
      `${role} account not configured. Set its private key in backend/.env.`
    );
  }
  return addr;
};

// --- Gas price cache (30 sec TTL) -------------------------------

let _gasPriceCache = null;
let _gasPriceCachedAt = 0;

const getGasPrice = async () => {
  const now = Date.now();
  if (_gasPriceCache && now - _gasPriceCachedAt < 30000) return _gasPriceCache;
  const raw = await web3.eth.getGasPrice();
  const base = BigInt(raw.toString());
  _gasPriceCache = ((base * 120n) / 100n).toString(); // +20% safety margin
  _gasPriceCachedAt = now;
  return _gasPriceCache;
};

// --- Nonce tracker per address ----------------------------------

const _nonceMap = {};

const getNonce = async (address) => {
  const onChain = Number(await web3.eth.getTransactionCount(address, "pending"));
  const local = _nonceMap[address] || 0;
  const nonce = Math.max(onChain, local);
  _nonceMap[address] = nonce + 1;
  return nonce;
};

// --- Receipt formatter (uniform shape) --------------------------

const formatReceipt = (receipt) => ({
  txHash: receipt.transactionHash,
  blockNumber: Number(receipt.blockNumber),
  blockHash: receipt.blockHash,
  gasUsed: Number(receipt.gasUsed),
  status: receipt.status ? "success" : "failed",
  from: receipt.from,
  to: receipt.to || null,
  etherscanUrl: getExplorerUrl(receipt.transactionHash, "tx"),
});

// --- Public utility endpoints -----------------------------------

const getTxReceipt = async (txHash) => {
  if (!isReady() || !txHash) return null;
  try {
    const receipt = await web3.eth.getTransactionReceipt(txHash);
    if (!receipt) return null;
    return formatReceipt(receipt);
  } catch (err) {
    console.error("[blockchain] getTxReceipt:", shortError(err));
    return null;
  }
};

const getNetworkStatus = async () => {
  if (!isReady()) return { online: false };
  try {
    const [blockNumber, blockChainId, gasPrice] = await Promise.all([
      web3.eth.getBlockNumber(),
      web3.eth.getChainId(),
      web3.eth.getGasPrice(),
    ]);
    const latestBlock = await web3.eth.getBlock(Number(blockNumber));
    return {
      online: true,
      network: network || "Sepolia Testnet",
      chainId: Number(blockChainId),
      latestBlock: Number(blockNumber),
      blockTimestamp: latestBlock ? Number(latestBlock.timestamp) : null,
      gasPrice: gasPrice.toString(),
      gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(4),
      contractAddress,
    };
  } catch (err) {
    console.error("[blockchain] getNetworkStatus:", shortError(err));
    return { online: false, error: shortError(err) };
  }
};

const getWalletBalances = async () => {
  if (!isReady()) return [];
  try {
    const orgs = [
      { org: "NewsAgency", role: "Submitter", address: accounts.newsAgency },
      { org: "Broadcaster", role: "Endorser", address: accounts.broadcaster },
      { org: "Auditor", role: "Endorser", address: accounts.auditor },
    ].filter((o) => o.address);

    const balances = await Promise.all(
      orgs.map((o) => web3.eth.getBalance(o.address))
    );

    return orgs.map((o, i) => ({
      ...o,
      balanceWei: balances[i].toString(),
      balanceEth: (Number(balances[i]) / 1e18).toFixed(6),
      network: network || "sepolia",
    }));
  } catch (err) {
    console.error("[blockchain] getWalletBalances:", shortError(err));
    return [];
  }
};

// =================================================================
//  VIDEO FUNCTIONS
// =================================================================

const registerVideoOnChain = async (videoId, title, metadataCid, totalSegments) => {
  if (!isReady()) {
    return { ok: false, skipped: true, error: "Blockchain not configured" };
  }
  try {
    const from = requireAccount("newsAgency");
    let txReceipt = null;

    await withRetry("registerVideo", async () => {
      const gasPrice = await getGasPrice();
      const nonce = await getNonce(from);
      const receipt = await contract.methods
        .registerVideo(videoId, title, metadataCid, totalSegments)
        .send({ from, gas: 1500000, gasPrice, nonce });

      txReceipt = formatReceipt(receipt);
    });

    console.log(
      `[blockchain] Video "${title}" registered: block=${txReceipt.blockNumber} gas=${txReceipt.gasUsed} tx=${txReceipt.txHash?.slice(0, 16)}...`
    );
    return { ok: true, txReceipt };
  } catch (err) {
    console.error("[blockchain] registerVideo failed:", shortError(err));
    return { ok: false, error: shortError(err) };
  }
};

// Register a segment AND have Broadcaster + Auditor endorse it.
// Contract's registerSegment auto-endorses NewsAgency, so total = 3 endorsements.
// REQUIRED_ENDORSEMENTS in contract = 2, so this always reaches FullyEndorsed.
const registerAndEndorse = async (
  videoId,
  segmentIndex,
  sha256Hash,
  chainHash,
  ipfsCid,
  c2paManifestHash = "",
  c2paInstanceId = ""
) => {
  if (!isReady()) {
    return { ok: false, skipped: true, error: "Blockchain not configured" };
  }
  try {
    const newsAgency = requireAccount("newsAgency");
    const broadcaster = requireAccount("broadcaster");
    const auditor = requireAccount("auditor");

    const gasPrice = await getGasPrice();
    const txReceipts = {};

    // Step 1: register (NewsAgency auto-endorses inside contract)
    await withRetry(`reg:${segmentIndex}`, async () => {
      const nonce = await getNonce(newsAgency);
      const receipt = await contract.methods
        .registerSegment(
          videoId,
          segmentIndex,
          sha256Hash,
          chainHash,
          ipfsCid,
          c2paManifestHash || "",
          c2paInstanceId || ""
        )
        .send({ from: newsAgency, gas: 1500000, gasPrice, nonce });
      txReceipts.register = formatReceipt(receipt);
    });

    // Step 2: Broadcaster + Auditor endorse in parallel
    await Promise.all([
      withRetry(`endorse-b:${segmentIndex}`, async () => {
        const nonce = await getNonce(broadcaster);
        const receipt = await contract.methods
          .endorseSegment(videoId, segmentIndex)
          .send({ from: broadcaster, gas: 1500000, gasPrice, nonce });
        txReceipts.broadcaster = formatReceipt(receipt);
      }),
      withRetry(`endorse-a:${segmentIndex}`, async () => {
        const nonce = await getNonce(auditor);
        const receipt = await contract.methods
          .endorseSegment(videoId, segmentIndex)
          .send({ from: auditor, gas: 500000, gasPrice, nonce });
        txReceipts.auditor = formatReceipt(receipt);
      }),
    ]);

    const totalGasUsed =
      (txReceipts.register?.gasUsed || 0) +
      (txReceipts.broadcaster?.gasUsed || 0) +
      (txReceipts.auditor?.gasUsed || 0);

    console.log(
      `[blockchain] Segment ${segmentIndex} registered + endorsed (gas=${totalGasUsed})`
    );
    return {
      ok: true,
      endorsementCount: 3, // NewsAgency auto + Broadcaster + Auditor
      fullyEndorsed: true, // contract REQUIRED_ENDORSEMENTS=2, we did 3
      txReceipts,
      totalGasUsed,
      blockNumber: txReceipts.register?.blockNumber || null,
    };
  } catch (err) {
    console.error(
      `[blockchain] segment ${segmentIndex} failed:`,
      shortError(err)
    );
    return { ok: false, error: shortError(err) };
  }
};

const BATCH_SIZE = 3;

const registerAndEndorseBatch = async (videoId, segments) => {
  const results = [];

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((seg) =>
        registerAndEndorse(
          videoId,
          seg.index,
          seg.sha256Hash,
          seg.chainHash,
          seg.ipfsCid,
          seg.c2paManifestHash || "",
          seg.c2paInstanceId || ""
        )
      )
    );

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j];
      results.push({
        index: batch[j].index,
        ok: result.status === "fulfilled" && result.value?.ok,
        endorsementCount: result.value?.endorsementCount || 0,
        fullyEndorsed: result.value?.fullyEndorsed || false,
        txReceipts: result.value?.txReceipts || null,
        totalGasUsed: result.value?.totalGasUsed || 0,
        blockNumber: result.value?.blockNumber || null,
        error:
          result.status === "rejected"
            ? result.reason?.message
            : result.value?.error,
      });
    }

    if (i + BATCH_SIZE < segments.length) await delay(200);
  }

  return results;
};

const verifyOnChain = async (videoId, segmentIndex, clientHash) => {
  if (!isReady()) {
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
      () =>
        contract.methods
          .verifySegment(videoId, Number(segmentIndex), clientHash)
          .call(),
      1
    );
    return {
      available: true,
      hashMatch: result.hashMatch,
      fullyEndorsed: result.fullyEndorsed,
      endorsementCount: Number(result.endorsementCount),
    };
  } catch (err) {
    console.error("[blockchain] verifySegment:", shortError(err));
    return {
      available: false,
      hashMatch: null,
      fullyEndorsed: null,
      endorsementCount: null,
      error: shortError(err),
    };
  }
};

const getEndorsementsFromChain = async (videoId, segmentIndex) => {
  if (!isReady()) return [];
  try {
    const result = await withRetry(
      `getEndorsements:${segmentIndex}`,
      () =>
        contract.methods.getEndorsements(videoId, Number(segmentIndex)).call(),
      1
    );
    return result[0].map((addr, i) => ({
      address: addr,
      orgName: result[1][i],
      timestamp: Number(result[2][i]),
    }));
  } catch (err) {
    console.error("[blockchain] getEndorsements:", shortError(err));
    return [];
  }
};

const getVideoFromChain = async (videoId) => {
  if (!isReady()) return { exists: false };
  try {
    const result = await withRetry(
      `getVideo:${videoId}`,
      () => contract.methods.getVideo(videoId).call(),
      1
    );
    return {
      title: result.title,
      metadataCid: result.metadataCid,
      uploader: result.uploader,
      uploaderAddr: result.uploaderAddr,
      totalSegments: Number(result.totalSegments),
      registeredAt: Number(result.registeredAt),
      status: Number(result.status), // 0=Active 1=Revoked 2=Disputed
      tamperReports: Number(result.tamperReports || 0),
      exists: result.exists,
    };
  } catch (err) {
    console.error("[blockchain] getVideo:", shortError(err));
    return { exists: false };
  }
};

// reportTamper(videoId, segmentIndex) - contract takes 2 params, no evidence.
// Backend signs as NewsAgency (matches existing pattern). For an external
// reporter, the frontend can sign via MetaMask using a different org wallet.
const reportTamperOnChain = async (videoId, segmentIndex) => {
  if (!isReady()) return { ok: false, error: "Blockchain not configured" };
  try {
    const from = requireAccount("newsAgency");
    const gasPrice = await getGasPrice();
    const nonce = await getNonce(from);
    const receipt = await contract.methods
      .reportTamper(videoId, segmentIndex)
      .send({ from, gas: 400000, gasPrice, nonce });

    console.log(`[blockchain] Tamper reported for segment ${segmentIndex}`);
    return { ok: true, ...formatReceipt(receipt) };
  } catch (err) {
    console.error("[blockchain] reportTamper:", shortError(err));
    return { ok: false, error: shortError(err) };
  }
};

// revokeVideo(videoId) - contract takes 1 param (no reason).
// Status flips Active -> Revoked; the on-chain record itself stays forever.
const revokeVideoOnChain = async (videoId) => {
  if (!isReady()) return { ok: false, error: "Blockchain not configured" };
  try {
    const from = requireAccount("newsAgency");
    const gasPrice = await getGasPrice();
    const nonce = await getNonce(from);
    const receipt = await contract.methods
      .revokeVideo(videoId)
      .send({ from, gas: 300000, gasPrice, nonce });

    console.log(`[blockchain] Video ${videoId} revoked`);
    return { ok: true, ...formatReceipt(receipt) };
  } catch (err) {
    console.error("[blockchain] revokeVideo:", shortError(err));
    return { ok: false, error: shortError(err) };
  }
};

// =================================================================
//  IMAGE FUNCTIONS
// =================================================================

const registerImageOnChain = async (
  imageId,
  title,
  description,
  sha256Hash,
  ipfsCid,
  metadataCid,
  c2paManifestHash = "",
  c2paInstanceId = ""
) => {
  if (!isReady()) {
    return { ok: false, skipped: true, error: "Blockchain not configured" };
  }
  try {
    const from = requireAccount("newsAgency");
    let txReceipt = null;

    await withRetry("registerImage", async () => {
      const gasPrice = await getGasPrice();
      const nonce = await getNonce(from);
      const receipt = await contract.methods
        .registerImage(
          imageId,
          title,
          description || "",
          sha256Hash,
          ipfsCid || "",
          metadataCid || "",
          c2paManifestHash || "",
          c2paInstanceId || ""
        )
        .send({ from, gas: 700000, gasPrice, nonce });
      txReceipt = formatReceipt(receipt);
    });

    console.log(
      `[blockchain] Image "${title}" registered: block=${txReceipt.blockNumber} gas=${txReceipt.gasUsed} tx=${txReceipt.txHash?.slice(0, 16)}...`
    );
    return { ok: true, txReceipt };
  } catch (err) {
    console.error("[blockchain] registerImage failed:", shortError(err));
    return { ok: false, error: shortError(err) };
  }
};

const endorseImageOnChain = async (imageId) => {
  if (!isReady()) {
    return { ok: false, skipped: true, error: "Blockchain not configured" };
  }
  try {
    const broadcaster = requireAccount("broadcaster");
    const auditor = requireAccount("auditor");

    const gasPrice = await getGasPrice();
    const txReceipts = {};

    await Promise.all([
      withRetry("endorse-image-b", async () => {
        const nonce = await getNonce(broadcaster);
        const receipt = await contract.methods
          .endorseImage(imageId)
          .send({ from: broadcaster, gas: 400000, gasPrice, nonce });
        txReceipts.broadcaster = formatReceipt(receipt);
      }),
      withRetry("endorse-image-a", async () => {
        const nonce = await getNonce(auditor);
        const receipt = await contract.methods
          .endorseImage(imageId)
          .send({ from: auditor, gas: 400000, gasPrice, nonce });
        txReceipts.auditor = formatReceipt(receipt);
      }),
    ]);

    const totalGasUsed =
      (txReceipts.broadcaster?.gasUsed || 0) +
      (txReceipts.auditor?.gasUsed || 0);

    console.log(
      `[blockchain] Image ${imageId} endorsed by Broadcaster + Auditor (gas=${totalGasUsed})`
    );
    return {
      ok: true,
      endorsementCount: 3, // NewsAgency auto-endorsed on register
      fullyEndorsed: true,
      txReceipts,
      totalGasUsed,
    };
  } catch (err) {
    console.error("[blockchain] endorseImage:", shortError(err));
    return { ok: false, error: shortError(err) };
  }
};

// Register + 2 endorsements in one call (mirrors registerAndEndorse for video).
const registerAndEndorseImage = async (
  imageId,
  title,
  description,
  sha256Hash,
  ipfsCid,
  metadataCid,
  c2paManifestHash = "",
  c2paInstanceId = ""
) => {
  // Step 1: Register (NewsAgency auto-endorses inside contract)
  const regResult = await registerImageOnChain(
    imageId,
    title,
    description,
    sha256Hash,
    ipfsCid,
    metadataCid,
    c2paManifestHash,
    c2paInstanceId
  );
  if (!regResult.ok) return regResult;

  // Step 2: Broadcaster + Auditor endorse
  const endorseResult = await endorseImageOnChain(imageId);

  return {
    ok: endorseResult.ok,
    endorsementCount: endorseResult.endorsementCount || 1,
    fullyEndorsed: endorseResult.fullyEndorsed || false,
    txReceipts: {
      register: regResult.txReceipt,
      broadcaster: endorseResult.txReceipts?.broadcaster || null,
      auditor: endorseResult.txReceipts?.auditor || null,
    },
    totalGasUsed:
      (regResult.txReceipt?.gasUsed || 0) + (endorseResult.totalGasUsed || 0),
    blockNumber: regResult.txReceipt?.blockNumber || null,
    error: endorseResult.error || null,
  };
};

const getImageFromChain = async (imageId) => {
  if (!isReady()) return { exists: false };
  try {
    // Contract was split into getImage + getImageStatus to keep both
    // legs under the EVM stack budget for non-IR compilation. We merge
    // them here so callers see one unified payload.
    const [base, status] = await Promise.all([
      withRetry(`getImage:${imageId}`, () => contract.methods.getImage(imageId).call(), 1),
      withRetry(`getImageStatus:${imageId}`, () => contract.methods.getImageStatus(imageId).call(), 1),
    ]);
    return {
      title: base.title,
      description: base.description,
      sha256Hash: base.sha256Hash,
      ipfsCid: base.ipfsCid,
      metadataCid: base.metadataCid,
      c2paManifestHash: base.c2paManifestHash,
      uploaderAddr: base.uploaderAddr,
      exists: base.exists,
      registeredAt: Number(status.registeredAt),
      endorsementCount: Number(status.endorsementCount),
      tamperReports: Number(status.tamperReports),
      status: Number(status.status), // 0=Active 1=Revoked 2=Disputed
    };
  } catch (err) {
    console.error("[blockchain] getImage:", shortError(err));
    return { exists: false };
  }
};

const reportImageTamperOnChain = async (imageId) => {
  if (!isReady()) return { ok: false, error: "Blockchain not configured" };
  try {
    const from = requireAccount("newsAgency");
    const gasPrice = await getGasPrice();
    const nonce = await getNonce(from);
    const receipt = await contract.methods
      .reportImageTamper(imageId)
      .send({ from, gas: 400000, gasPrice, nonce });

    console.log(`[blockchain] Image tamper reported: ${imageId}`);
    return { ok: true, ...formatReceipt(receipt) };
  } catch (err) {
    console.error("[blockchain] reportImageTamper:", shortError(err));
    return { ok: false, error: shortError(err) };
  }
};

// Status change only - record stays on blockchain forever (immutability).
const revokeImageOnChain = async (imageId) => {
  if (!isReady()) return { ok: false, error: "Blockchain not configured" };
  try {
    const from = requireAccount("newsAgency");
    const gasPrice = await getGasPrice();
    const nonce = await getNonce(from);
    const receipt = await contract.methods
      .revokeImage(imageId)
      .send({ from, gas: 300000, gasPrice, nonce });

    console.log(`[blockchain] Image ${imageId} revoked`);
    return { ok: true, ...formatReceipt(receipt) };
  } catch (err) {
    console.error("[blockchain] revokeImage:", shortError(err));
    return { ok: false, error: shortError(err) };
  }
};

const getImageEndorsementsFromChain = async (imageId) => {
  if (!isReady()) return [];
  try {
    const result = await withRetry(
      `getImageEndorsements:${imageId}`,
      () => contract.methods.getImageEndorsements(imageId).call(),
      1
    );
    return result[0].map((addr, i) => ({
      address: addr,
      orgName: result[1][i],
      timestamp: Number(result[2][i]),
    }));
  } catch (err) {
    console.error("[blockchain] getImageEndorsements:", shortError(err));
    return [];
  }
};

// =================================================================
//  TX LOG (mixed video + image actions)
// =================================================================

const getTxLogsFromChain = async (limit = 20) => {
  if (!isReady()) return [];
  try {
    const count = Number(
      await withRetry(
        "getTxLogCount",
        () => contract.methods.getTxLogCount().call(),
        1
      )
    );
    const logs = [];
    const start = Math.max(0, count - limit);

    for (let i = start; i < count; i += 1) {
      const log = await withRetry(
        `getTxLog:${i}`,
        () => contract.methods.getTxLog(i).call(),
        1
      );
      logs.push({
        action: log.action,
        mediaId: log.mediaId, // string: videoId or imageId (contract field renamed)
        segmentIndex: Number(log.segmentIndex),
        actor: log.actor,
        orgName: log.orgName,
        timestamp: Number(log.timestamp),
      });
    }
    return logs.reverse();
  } catch (err) {
    console.error("[blockchain] getTxLogs:", shortError(err));
    return [];
  }
};

// =================================================================
//  LISTING HELPERS (catalog sync)
// =================================================================

const getVideoIdsFromChain = async () => {
  if (!isReady()) return [];
  try {
    const count = Number(await contract.methods.getVideoIdCount().call());
    const ids = [];
    for (let i = 0; i < count; i += 1) {
      ids.push(await contract.methods.getVideoIdAt(i).call());
    }
    return ids;
  } catch (err) {
    console.error("[blockchain] getVideoIds:", shortError(err));
    return [];
  }
};

const getImageIdsFromChain = async () => {
  if (!isReady()) return [];
  try {
    const count = Number(await contract.methods.getImageIdCount().call());
    const ids = [];
    for (let i = 0; i < count; i += 1) {
      ids.push(await contract.methods.getImageIdAt(i).call());
    }
    return ids;
  } catch (err) {
    console.error("[blockchain] getImageIds:", shortError(err));
    return [];
  }
};

// =================================================================
//  EXPORTS
// =================================================================

module.exports = {
  // Video
  registerVideoOnChain,
  registerAndEndorse,
  registerAndEndorseBatch,
  verifyOnChain,
  getEndorsementsFromChain,
  getVideoFromChain,
  reportTamperOnChain,
  revokeVideoOnChain,
  getVideoIdsFromChain,

  // Image
  registerImageOnChain,
  endorseImageOnChain,
  registerAndEndorseImage,
  getImageFromChain,
  reportImageTamperOnChain,
  revokeImageOnChain,
  getImageEndorsementsFromChain,
  getImageIdsFromChain,

  // Shared
  getTxLogsFromChain,
  isBlockchainReady,
  getTxReceipt,
  getNetworkStatus,
  getWalletBalances,
};
