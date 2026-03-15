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

const normalizePrivateKey = (value) => {
  if (!value) throw new Error("Missing blockchain private key");
  return value.startsWith("0x") ? value : `0x${value}`;
};

const getAccounts = () => {
  if (!web3) throw new Error("Web3 not configured");

  const newsAgency  = web3.eth.accounts.privateKeyToAccount(normalizePrivateKey(process.env.PRIVATE_KEY));
  const broadcaster = web3.eth.accounts.privateKeyToAccount(normalizePrivateKey(process.env.BROADCASTER_KEY));
  const auditor     = web3.eth.accounts.privateKeyToAccount(normalizePrivateKey(process.env.AUDITOR_KEY));

  try { web3.eth.accounts.wallet.add(newsAgency);  } catch {}
  try { web3.eth.accounts.wallet.add(broadcaster); } catch {}
  try { web3.eth.accounts.wallet.add(auditor);     } catch {}

  return { newsAgency, broadcaster, auditor };
};

// Gas price cache — 30 seconds valid
let _gasPriceCache = null;
let _gasPriceCachedAt = 0;

const getGasPrice = async () => {
  const now = Date.now();
  if (_gasPriceCache && now - _gasPriceCachedAt < 30000) return _gasPriceCache;
  const raw = await web3.eth.getGasPrice();
  const base = BigInt(raw.toString());
  _gasPriceCache = (base * 120n / 100n).toString();
  _gasPriceCachedAt = now;
  return _gasPriceCache;
};

// Nonce tracker per address
const _nonceMap = {};

const getNonce = async (address) => {
  const onChain = Number(await web3.eth.getTransactionCount(address, "pending"));
  const local = _nonceMap[address] || 0;
  const nonce = Math.max(onChain, local);
  _nonceMap[address] = nonce + 1;
  return nonce;
};

// ─── Feature 1: Transaction Receipt Tracking ─────────────
/**
 * Fetch full tx receipt — txHash, blockNumber, gasUsed, status
 */
const getTxReceipt = async (txHash) => {
  if (!web3 || !txHash) return null;
  try {
    const receipt = await web3.eth.getTransactionReceipt(txHash);
    if (!receipt) return null;
    return {
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
      blockHash: receipt.blockHash,
      gasUsed: Number(receipt.gasUsed),
      status: receipt.status ? "success" : "failed",
      from: receipt.from,
      to: receipt.to,
      contractAddress: receipt.contractAddress || null,
    };
  } catch (err) {
    console.error("getTxReceipt error:", shortError(err));
    return null;
  }
};

// ─── Feature 2: Network Status Check ─────────────────────
/**
 * Check Sepolia network status — latest block, chainId, syncing
 */
const getNetworkStatus = async () => {
  if (!web3) return { online: false };
  try {
    const [blockNumber, chainId, gasPrice] = await Promise.all([
      web3.eth.getBlockNumber(),
      web3.eth.getChainId(),
      web3.eth.getGasPrice(),
    ]);

    const latestBlock = await web3.eth.getBlock(Number(blockNumber));

    return {
      online: true,
      network: "Sepolia Testnet",
      chainId: Number(chainId),
      latestBlock: Number(blockNumber),
      blockTimestamp: latestBlock ? Number(latestBlock.timestamp) : null,
      gasPrice: gasPrice.toString(),
      gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(4),
      rpcProvider: "Alchemy",
      contractAddress: process.env.CONTRACT_ADDRESS || null,
    };
  } catch (err) {
    console.error("getNetworkStatus error:", shortError(err));
    return { online: false, error: shortError(err) };
  }
};

// ─── Feature 3: Wallet Balance Check ─────────────────────
/**
 * Get ETH balance for all 3 org wallets
 */
const getWalletBalances = async () => {
  if (!web3) return [];
  try {
    const { newsAgency, broadcaster, auditor } = getAccounts();

    const [bal1, bal2, bal3] = await Promise.all([
      web3.eth.getBalance(newsAgency.address),
      web3.eth.getBalance(broadcaster.address),
      web3.eth.getBalance(auditor.address),
    ]);

    const toEth = (wei) => (Number(wei) / 1e18).toFixed(6);

    return [
      {
        org: "NewsAgency",
        role: "Submitter",
        address: newsAgency.address,
        balanceWei: bal1.toString(),
        balanceEth: toEth(bal1),
        network: "Sepolia",
      },
      {
        org: "Broadcaster",
        role: "Endorser",
        address: broadcaster.address,
        balanceWei: bal2.toString(),
        balanceEth: toEth(bal2),
        network: "Sepolia",
      },
      {
        org: "Auditor",
        role: "Endorser",
        address: auditor.address,
        balanceWei: bal3.toString(),
        balanceEth: toEth(bal3),
        network: "Sepolia",
      },
    ];
  } catch (err) {
    console.error("getWalletBalances error:", shortError(err));
    return [];
  }
};

// ─── Helpers for receipt + block tracking ────────────────
/**
 * Send tx and return full receipt with block + gas data
 */
const sendAndTrack = async (txPromise) => {
  const receipt = await txPromise;
  return {
    txHash: receipt.transactionHash,
    blockNumber: Number(receipt.blockNumber),
    blockHash: receipt.blockHash,
    gasUsed: Number(receipt.gasUsed),
    status: receipt.status ? "success" : "failed",
    from: receipt.from,
  };
};

// ─── Core Functions ───────────────────────────────────────

const registerVideoOnChain = async (videoId, title, metadataCid, totalSegments) => {
  if (!isBlockchainReady()) return { ok: false, skipped: true, error: "Blockchain not configured" };

  try {
    const { newsAgency } = getAccounts();
    let txReceipt = null;

    await withRetry("registerVideo", async () => {
      const gasPrice = await getGasPrice();
      const nonce = await getNonce(newsAgency.address);
      const receipt = await contract.methods
        .registerVideo(videoId, title, metadataCid, totalSegments)
        .send({ from: newsAgency.address, gas: 700000, gasPrice, nonce });

      // Feature 1 + 2: Capture tx receipt + block info
      txReceipt = {
        txHash: receipt.transactionHash,
        blockNumber: Number(receipt.blockNumber),
        blockHash: receipt.blockHash,
        gasUsed: Number(receipt.gasUsed),
        status: receipt.status ? "success" : "failed",
        from: receipt.from,
        etherscanUrl: `https://sepolia.etherscan.io/tx/${receipt.transactionHash}`,
      };
    });

    console.log(`⛓️  Video "${title}" registered on blockchain ✅`);
    if (txReceipt) {
      console.log(`   📦 Block: ${txReceipt.blockNumber} | Gas: ${txReceipt.gasUsed} | Tx: ${txReceipt.txHash?.slice(0, 16)}...`);
    }

    return { ok: true, txReceipt };
  } catch (err) {
    const error = shortError(err);
    console.error("⚠️  Blockchain registerVideo failed:", error);
    return { ok: false, error };
  }
};

const registerAndEndorse = async (videoId, segmentIndex, sha256Hash, chainHash, ipfsCid) => {
  if (!isBlockchainReady()) return { ok: false, skipped: true, error: "Blockchain not configured" };

  try {
    const { newsAgency, broadcaster, auditor } = getAccounts();
    const gasPrice = await getGasPrice();
    const txReceipts = {};

    // Step 1: Register — capture receipt
    await withRetry(`reg:${segmentIndex}`, async () => {
      const nonce = await getNonce(newsAgency.address);
      const receipt = await contract.methods
        .registerSegment(videoId, segmentIndex, sha256Hash, chainHash, ipfsCid)
        .send({ from: newsAgency.address, gas: 1200000, gasPrice, nonce });

      txReceipts.register = {
        txHash: receipt.transactionHash,
        blockNumber: Number(receipt.blockNumber),
        gasUsed: Number(receipt.gasUsed),
        from: receipt.from,
        etherscanUrl: `https://sepolia.etherscan.io/tx/${receipt.transactionHash}`,
      };
    });

    // Step 2: Both endorsements in parallel — capture receipts
    await Promise.all([
      withRetry(`endorse-b:${segmentIndex}`, async () => {
        const nonce = await getNonce(broadcaster.address);
        const receipt = await contract.methods
          .endorseSegment(videoId, segmentIndex)
          .send({ from: broadcaster.address, gas: 500000, gasPrice, nonce });

        txReceipts.broadcaster = {
          txHash: receipt.transactionHash,
          blockNumber: Number(receipt.blockNumber),
          gasUsed: Number(receipt.gasUsed),
          from: receipt.from,
          etherscanUrl: `https://sepolia.etherscan.io/tx/${receipt.transactionHash}`,
        };
      }),
      withRetry(`endorse-a:${segmentIndex}`, async () => {
        const nonce = await getNonce(auditor.address);
        const receipt = await contract.methods
          .endorseSegment(videoId, segmentIndex)
          .send({ from: auditor.address, gas: 500000, gasPrice, nonce });

        txReceipts.auditor = {
          txHash: receipt.transactionHash,
          blockNumber: Number(receipt.blockNumber),
          gasUsed: Number(receipt.gasUsed),
          from: receipt.from,
          etherscanUrl: `https://sepolia.etherscan.io/tx/${receipt.transactionHash}`,
        };
      }),
    ]);

    // Feature 4: Total gas usage per segment
    const totalGasUsed =
      (txReceipts.register?.gasUsed || 0) +
      (txReceipts.broadcaster?.gasUsed || 0) +
      (txReceipts.auditor?.gasUsed || 0);

    console.log(`⛓️  Segment ${segmentIndex}: registered + endorsed ✅ | Gas: ${totalGasUsed}`);

    return {
      ok: true,
      endorsementCount: 3,
      fullyEndorsed: true,
      txReceipts,
      totalGasUsed,
      blockNumber: txReceipts.register?.blockNumber || null,
    };
  } catch (err) {
    const error = shortError(err);
    console.error(`⚠️  Blockchain failed for segment ${segmentIndex}:`, error);
    return { ok: false, error };
  }
};

// Batch: process multiple segments in parallel
const BATCH_SIZE = 3;

const registerAndEndorseBatch = async (videoId, segments) => {
  const results = [];

  for (let i = 0; i < segments.length; i += BATCH_SIZE) {
    const batch = segments.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((seg) =>
        registerAndEndorse(videoId, seg.index, seg.sha256Hash, seg.chainHash, seg.ipfsCid)
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
        error: result.status === "rejected" ? result.reason?.message : result.value?.error,
      });
    }

    if (i + BATCH_SIZE < segments.length) await delay(200);
  }

  return results;
};

const verifyOnChain = async (videoId, segmentIndex, clientHash) => {
  if (!isBlockchainReady()) {
    return { available: false, hashMatch: null, fullyEndorsed: null, endorsementCount: null, error: "Blockchain not configured" };
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
    return { available: false, hashMatch: null, fullyEndorsed: null, endorsementCount: null, error };
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
  registerAndEndorseBatch,
  verifyOnChain,
  getEndorsementsFromChain,
  getTxLogsFromChain,
  getVideoFromChain,
  isBlockchainReady,
  // New features
  getTxReceipt,
  getNetworkStatus,
  getWalletBalances,
};