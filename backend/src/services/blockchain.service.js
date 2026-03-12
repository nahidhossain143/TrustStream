const { web3, contract } = require("../config/blockchain");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ============================================================
// 3 আলাদা account setup
// ============================================================
const getAccounts = () => {
  const newsAgency  = web3.eth.accounts.privateKeyToAccount(`0x${process.env.PRIVATE_KEY}`);
  const broadcaster = web3.eth.accounts.privateKeyToAccount(`0x${process.env.BROADCASTER_KEY}`);
  const auditor     = web3.eth.accounts.privateKeyToAccount(`0x${process.env.AUDITOR_KEY}`);

  // Already added check — warning আর আসবে না
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
  return await web3.eth.getTransactionCount(address, "pending");
};

// ============================================================
// Register video metadata on blockchain
// ============================================================
const registerVideoOnChain = async (videoId, title, totalSegments) => {
  if (!contract) return;
  try {
    const { newsAgency } = getAccounts();
    const gasPrice = await getGasPrice();
    const nonce = await getNonce(newsAgency.address);

    await contract.methods
      .registerVideo(videoId, title, totalSegments)
      .send({ from: newsAgency.address, gas: 500000, gasPrice, nonce });

    console.log(`⛓️  Video "${title}" registered on blockchain ✅`);
  } catch (err) {
    console.error(`⚠️  Blockchain registerVideo failed:`, err.message);
  }
};

// ============================================================
// Register + 3-org endorsement
// ============================================================
const registerAndEndorse = async (videoId, segmentIndex, sha256Hash, chainHash) => {
  if (!contract) return;
  try {
    const { newsAgency, broadcaster, auditor } = getAccounts();
    const gasPrice = await getGasPrice();

    // Step 1: NewsAgency registers
    const nonce1 = await getNonce(newsAgency.address);
    await contract.methods
      .registerSegment(videoId, segmentIndex, sha256Hash, chainHash)
      .send({ from: newsAgency.address, gas: 1000000, gasPrice, nonce: nonce1 });

    await delay(2000);

    // Step 2: Broadcaster endorses
    const nonce2 = await getNonce(broadcaster.address);
    await contract.methods
      .endorseSegment(videoId, segmentIndex)
      .send({ from: broadcaster.address, gas: 500000, gasPrice, nonce: nonce2 });

    await delay(2000);

    // Step 3: Auditor endorses
    const nonce3 = await getNonce(auditor.address);
    await contract.methods
      .endorseSegment(videoId, segmentIndex)
      .send({ from: auditor.address, gas: 500000, gasPrice, nonce: nonce3 });

    console.log(`⛓️  Segment ${segmentIndex}: registered + endorsed by 3 orgs ✅`);
  } catch (err) {
    console.error(`⚠️  Blockchain failed for segment ${segmentIndex}:`, err.message);
  }
};

// ============================================================
// Verify segment
// ============================================================
const verifyOnChain = async (videoId, segmentIndex, clientHash) => {
  if (!contract) return null;
  try {
    const result = await contract.methods
      .verifySegment(videoId, segmentIndex, clientHash)
      .call();
    return {
      hashMatch:        result.hashMatch,
      fullyEndorsed:    result.fullyEndorsed,
      endorsementCount: Number(result.endorsementCount),
    };
  } catch (err) {
    console.error("Blockchain verify error:", err.message);
    return null;
  }
};

// ============================================================
// Get endorsements
// ============================================================
const getEndorsementsFromChain = async (videoId, segmentIndex) => {
  if (!contract) return [];
  try {
    const result = await contract.methods
      .getEndorsements(videoId, Number(segmentIndex))
      .call();
    return result[0].map((addr, i) => ({
      address:   addr,
      orgName:   result[1][i],
      timestamp: Number(result[2][i]),
    }));
  } catch (err) {
    console.error("getEndorsements error:", err.message);
    return [];
  }
};

// ============================================================
// Get tx logs
// ============================================================
const getTxLogsFromChain = async () => {
  if (!contract) return [];
  try {
    const count = Number(await contract.methods.getTxLogCount().call());
    const logs  = [];
    const start = Math.max(0, count - 20);
    for (let i = start; i < count; i++) {
      const log = await contract.methods.getTxLog(i).call();
      logs.push({
        action:       log.action,
        videoId:      log.videoId,
        segmentIndex: Number(log.segmentIndex),
        actor:        log.actor,
        orgName:      log.orgName,
        timestamp:    Number(log.timestamp),
      });
      await delay(200);
    }
    return logs.reverse();
  } catch (err) {
    console.error("getTxLogs error:", err.message);
    return [];
  }
};

// ============================================================
// Get video from chain
// ============================================================
const getVideoFromChain = async (videoId) => {
  if (!contract) return { exists: false };
  try {
    const result = await contract.methods.getVideo(videoId).call();
    return {
      title:         result.title,
      uploader:      result.uploader,
      uploaderAddr:  result.uploaderAddr,
      totalSegments: Number(result.totalSegments),
      registeredAt:  Number(result.registeredAt),
      exists:        result.exists,
    };
  } catch (err) {
    console.error("getVideo error:", err.message);
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
};