const fs = require("fs");
const path = require("path");

const { readManifest } = require("./catalog.service");
const {
  getTxLogsFromChain,
  getVideoFromChain,
  getImageFromChain,
} = require("./blockchain.service");

const storageRoot = process.env.STORAGE_PATH || path.join(__dirname, "../../");
const imageCatalogDir = path.join(storageRoot, "data/catalog/images");

const readImageManifest = (imageId) => {
  const filePath = path.join(imageCatalogDir, `${imageId}.json`);
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
};

const toIso = (value) => {
  if (!value) return null;

  if (typeof value === "number") {
    return new Date(value > 1000000000000 ? value : value * 1000).toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const statusLabel = (status) => {
  if (status === 0 || status === "0" || status === "active") return "Active";
  if (status === 1 || status === "1" || status === "revoked") return "Revoked";
  if (status === 2 || status === "2" || status === "disputed") return "Disputed";
  return "Active";
};

const getCategory = (action) => {
  if (action.includes("REGISTER")) return "register";
  if (action.includes("ENDORSE")) return "endorsement";
  if (action.includes("TAMPER")) return "tamper";
  if (action.includes("REVOKE")) return "revoked";
  if (action.includes("DISPUTE")) return "disputed";
  if (action.includes("IPFS")) return "ipfs";
  if (action.includes("C2PA")) return "c2pa";
  if (action.includes("FAILED")) return "failed";
  return "local";
};

const prettyAction = (action) =>
  action
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

const makeEvent = ({
  action,
  title,
  mediaId,
  segmentIndex = null,
  actor = "Local catalog",
  orgName = "TrustStream",
  timestamp,
  txHash = null,
  etherscanUrl = null,
  note = null,
  source = "local",
}) => ({
  id: [
    source,
    action,
    mediaId,
    segmentIndex ?? "media",
    txHash || toIso(timestamp) || Math.random().toString(36).slice(2),
  ].join(":"),
  action,
  title: title || prettyAction(action),
  category: getCategory(action),
  mediaId,
  segmentIndex,
  actor,
  orgName,
  timestampIso: toIso(timestamp),
  txHash,
  etherscanUrl,
  note,
  source,
});

const txUrl = (txHash) =>
  txHash ? `https://sepolia.etherscan.io/tx/${txHash}` : null;

const buildChainEvents = async (kind, id) => {
  const logs = await getTxLogsFromChain(500);

  return logs
    .filter((log) => log.mediaId === id)
    .filter((log) => {
      if (kind === "image") return log.action.includes("IMAGE");
      if (kind === "video") return !log.action.includes("IMAGE");
      return true;
    })
    .map((log) =>
      makeEvent({
        action: log.action,
        title: prettyAction(log.action),
        mediaId: id,
        segmentIndex: log.action.includes("IMAGE") ? null : log.segmentIndex,
        actor: log.actor,
        orgName: log.orgName,
        timestamp: log.timestamp,
        source: "blockchain",
      })
    );
};

const buildVideoFallbackEvents = (manifest) => {
  const events = [];
  const mediaId = manifest.videoId;

  events.push(
    makeEvent({
      action: "UPLOAD_CREATED",
      title: "Video upload accepted",
      mediaId,
      timestamp: manifest.createdAt,
      note: `${manifest.totalSegments || 0} segment(s) prepared for provenance.`,
    })
  );

  if (manifest.c2paStatus === "signed") {
    events.push(
      makeEvent({
        action: "C2PA_SIGNED",
        title: "Video C2PA provenance signed",
        mediaId,
        timestamp:
          manifest.segments?.find((seg) => seg.c2paSignedAt)?.c2paSignedAt ||
          manifest.createdAt,
        note: "Each segment has a sidecar C2PA manifest.",
      })
    );
  }

  if (manifest.ipfsStatus === "uploaded" || manifest.metadataCid) {
    events.push(
      makeEvent({
        action: "IPFS_METADATA_UPLOADED",
        title: "Video metadata uploaded to IPFS",
        mediaId,
        timestamp: manifest.createdAt,
        note: manifest.metadataCid ? `Metadata CID: ${manifest.metadataCid}` : null,
      })
    );
  }

  if (manifest.videoTxHash) {
    events.push(
      makeEvent({
        action: "REGISTER_VIDEO",
        title: "Video registered on-chain",
        mediaId,
        timestamp: manifest.createdAt,
        txHash: manifest.videoTxHash,
        etherscanUrl: manifest.videoTxEtherscan || txUrl(manifest.videoTxHash),
        orgName: "NewsAgency",
      })
    );
  }

  for (const segment of manifest.segments || []) {
    const segmentIndex = segment.index ?? segment.segmentIndex;

    if (segment.c2paSigned || segment.c2paManifestHash) {
      events.push(
        makeEvent({
          action: "C2PA_SEGMENT_SIGNED",
          title: `Segment ${segmentIndex} C2PA signed`,
          mediaId,
          segmentIndex,
          timestamp: segment.c2paSignedAt || manifest.createdAt,
          note: segment.c2paManifestHash ? `Manifest hash: ${segment.c2paManifestHash}` : null,
        })
      );
    }

    if (segment.ipfsCid) {
      events.push(
        makeEvent({
          action: "IPFS_SEGMENT_UPLOADED",
          title: `Segment ${segmentIndex} uploaded to IPFS`,
          mediaId,
          segmentIndex,
          timestamp: manifest.createdAt,
          note: `Segment CID: ${segment.ipfsCid}`,
        })
      );
    }

    if (segment.txHash) {
      events.push(
        makeEvent({
          action: "REGISTER_SEGMENT",
          title: `Segment ${segmentIndex} registered on-chain`,
          mediaId,
          segmentIndex,
          timestamp: manifest.createdAt,
          txHash: segment.txHash,
          etherscanUrl: segment.etherscanRegister || txUrl(segment.txHash),
          orgName: "NewsAgency",
        })
      );
    }

    if (segment.txHashBroadcaster) {
      events.push(
        makeEvent({
          action: "ENDORSE_SEGMENT",
          title: `Broadcaster endorsed segment ${segmentIndex}`,
          mediaId,
          segmentIndex,
          timestamp: manifest.createdAt,
          txHash: segment.txHashBroadcaster,
          etherscanUrl: segment.etherscanBroadcaster || txUrl(segment.txHashBroadcaster),
          orgName: "Broadcaster",
        })
      );
    }

    if (segment.txHashAuditor) {
      events.push(
        makeEvent({
          action: "ENDORSE_SEGMENT",
          title: `Auditor endorsed segment ${segmentIndex}`,
          mediaId,
          segmentIndex,
          timestamp: manifest.createdAt,
          txHash: segment.txHashAuditor,
          etherscanUrl: segment.etherscanAuditor || txUrl(segment.txHashAuditor),
          orgName: "Auditor",
        })
      );
    }

    if (segment.localTamperReported || segment.tamperTxHash) {
      events.push(
        makeEvent({
          action: "REPORT_TAMPER",
          title: `Tamper report submitted for segment ${segmentIndex}`,
          mediaId,
          segmentIndex,
          timestamp: segment.tamperReportedAt || manifest.createdAt,
          txHash: segment.tamperTxHash || null,
          etherscanUrl: txUrl(segment.tamperTxHash),
        })
      );
    }
  }

  const hasAnyChainTx =
    Boolean(manifest.videoTxHash) ||
    (manifest.segments || []).some(
      (segment) => segment.txHash || segment.txHashBroadcaster || segment.txHashAuditor
    );

  if (!hasAnyChainTx && ["degraded", "skipped"].includes(manifest.blockchainStatus)) {
    events.push(
      makeEvent({
        action: "BLOCKCHAIN_REGISTRATION_FAILED",
        title: "Blockchain registration did not complete",
        mediaId,
        timestamp: manifest.createdAt,
        note:
          manifest.backgroundError ||
          "C2PA and IPFS succeeded, but no on-chain transaction hash was recorded.",
      })
    );
  }

  return events;
};

const buildImageFallbackEvents = (manifest) => {
  const events = [];
  const mediaId = manifest.imageId;

  events.push(
    makeEvent({
      action: "UPLOAD_CREATED",
      title: "Image upload accepted",
      mediaId,
      timestamp: manifest.createdAt,
      note: manifest.sha256Hash ? `SHA-256: ${manifest.sha256Hash}` : null,
    })
  );

  if (manifest.c2paSigned || manifest.c2paStatus === "signed") {
    events.push(
      makeEvent({
        action: "C2PA_IMAGE_SIGNED",
        title: "Image C2PA provenance signed",
        mediaId,
        timestamp: manifest.c2paSignedAt || manifest.createdAt,
        note: manifest.c2paManifestHash ? `Manifest hash: ${manifest.c2paManifestHash}` : null,
      })
    );
  }

  if (manifest.ipfsCid) {
    events.push(
      makeEvent({
        action: "IPFS_IMAGE_UPLOADED",
        title: "Image uploaded to IPFS",
        mediaId,
        timestamp: manifest.createdAt,
        note: `Image CID: ${manifest.ipfsCid}`,
      })
    );
  }

  if (manifest.metadataCid) {
    events.push(
      makeEvent({
        action: "IPFS_METADATA_UPLOADED",
        title: "Image metadata uploaded to IPFS",
        mediaId,
        timestamp: manifest.createdAt,
        note: `Metadata CID: ${manifest.metadataCid}`,
      })
    );
  }

  if (manifest.txHash) {
    events.push(
      makeEvent({
        action: "REGISTER_IMAGE",
        title: "Image registered on-chain",
        mediaId,
        timestamp: manifest.createdAt,
        txHash: manifest.txHash,
        etherscanUrl: manifest.etherscanRegister || txUrl(manifest.txHash),
        orgName: "NewsAgency",
      })
    );
  }

  if (manifest.txHashBroadcaster) {
    events.push(
      makeEvent({
        action: "ENDORSE_IMAGE",
        title: "Broadcaster endorsed image",
        mediaId,
        timestamp: manifest.createdAt,
        txHash: manifest.txHashBroadcaster,
        etherscanUrl: manifest.etherscanBroadcaster || txUrl(manifest.txHashBroadcaster),
        orgName: "Broadcaster",
      })
    );
  }

  if (manifest.txHashAuditor) {
    events.push(
      makeEvent({
        action: "ENDORSE_IMAGE",
        title: "Auditor endorsed image",
        mediaId,
        timestamp: manifest.createdAt,
        txHash: manifest.txHashAuditor,
        etherscanUrl: manifest.etherscanAuditor || txUrl(manifest.txHashAuditor),
        orgName: "Auditor",
      })
    );
  }

  if (manifest.localTamperReported || manifest.tamperTxHash) {
    events.push(
      makeEvent({
        action: "REPORT_IMAGE_TAMPER",
        title: "Image tamper report submitted",
        mediaId,
        timestamp: manifest.tamperReportedAt || manifest.createdAt,
        txHash: manifest.tamperTxHash || null,
        etherscanUrl: txUrl(manifest.tamperTxHash),
      })
    );
  }

  if (!manifest.txHash && ["degraded", "skipped"].includes(manifest.blockchainStatus)) {
    events.push(
      makeEvent({
        action: "BLOCKCHAIN_REGISTRATION_FAILED",
        title: "Blockchain registration did not complete",
        mediaId,
        timestamp: manifest.createdAt,
        note:
          manifest.backgroundError ||
          "C2PA and IPFS succeeded, but no on-chain transaction hash was recorded.",
      })
    );
  }

  return events;
};

const sortEvents = (events) =>
  events.sort((a, b) => {
    const timeA = a.timestampIso ? new Date(a.timestampIso).getTime() : 0;
    const timeB = b.timestampIso ? new Date(b.timestampIso).getTime() : 0;
    if (timeA !== timeB) return timeA - timeB;
    return a.action.localeCompare(b.action);
  });

const uniqueEvents = (events) => {
  const seen = new Set();

  return events.filter((event) => {
    const key = [
      event.action,
      event.mediaId,
      event.segmentIndex ?? "media",
      event.txHash || event.timestampIso || event.title,
      event.orgName,
    ].join(":");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const buildRevocationTimeline = async ({ kind = "video", id }) => {
  if (!id) return { error: "id query param required", status: 400 };

  const mediaKind = kind === "image" ? "image" : "video";
  const manifest = mediaKind === "image" ? readImageManifest(id) : readManifest(id);

  if (!manifest) {
    return {
      error: mediaKind === "image" ? "Image not found" : "Video not found",
      status: 404,
    };
  }

  const [chainEvents, chainRecord] = await Promise.all([
    buildChainEvents(mediaKind, id),
    mediaKind === "image" ? getImageFromChain(id) : getVideoFromChain(id),
  ]);

  const fallbackEvents =
    mediaKind === "image"
      ? buildImageFallbackEvents(manifest)
      : buildVideoFallbackEvents(manifest);

  const events = sortEvents(uniqueEvents([...fallbackEvents, ...chainEvents]));
  const chainHasRecord = Boolean(chainRecord?.exists);

  return {
    kind: mediaKind,
    id,
    title: manifest.title || id,
    source: chainEvents.length || chainHasRecord ? "blockchain+local" : "local-fallback",
    events,
    summary: {
      totalEvents: events.length,
      finalStatus: chainHasRecord
        ? statusLabel(chainRecord.status)
        : statusLabel(manifest.chainStatus || manifest.mediaStatus),
      hasRevocation: events.some((event) => event.category === "revoked"),
      hasDispute: events.some((event) => event.category === "disputed"),
      blockchainStatus: manifest.blockchainStatus || (chainHasRecord ? "ready" : "unknown"),
    },
    immutabilityNotice:
      "This timeline keeps local C2PA/IPFS provenance checkpoints and blockchain TxLogs together. Media cannot be deleted; revoke only changes status while the original record remains auditable.",
  };
};

module.exports = { buildRevocationTimeline };