const fs = require("fs");
const path = require("path");

const { readManifest } = require("./catalog.service");
const { getMediaHistory } = require("./fabric.service");

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

const statusLabel = (status) => {
  if (status === "disputed") return "Disputed";
  if (status === "revoked") return "Revoked";
  return "Active";
};

const makeEvent = ({
  action,
  title,
  mediaId,
  actor = "TrustStream",
  orgName = "TrustStream",
  timestamp,
  txId = null,
  note = null,
  category,
  source = "local",
}) => ({
  id: [source, action, mediaId, txId || timestamp || Math.random().toString(36).slice(2)].join(":"),
  action,
  title,
  category,
  mediaId,
  actor,
  orgName,
  timestampIso: timestamp,
  txId,
  note,
  source,
});

// Local pipeline stages that happen before a Fabric registration exists at
// all (upload accepted, C2PA signed, pinned to IPFS), so they can never show
// up in the ledger's history -- they only ever live in the local manifest.
const buildLocalPipelineEvents = (kind, manifest) => {
  const mediaId = kind === "image" ? manifest.imageId : manifest.videoId;
  const events = [];

  events.push(
    makeEvent({
      action: "UPLOAD_CREATED",
      title: kind === "image" ? "Image upload accepted" : "Video upload accepted",
      mediaId,
      timestamp: manifest.createdAt,
      category: "local",
      note:
        kind === "image"
          ? manifest.sha256Hash ? `SHA-256: ${manifest.sha256Hash}` : null
          : `${manifest.totalSegments || 0} segment(s) prepared for provenance.`,
    })
  );

  const c2paSigned = kind === "image" ? manifest.c2paSigned || manifest.c2paStatus === "signed" : manifest.c2paStatus === "signed";
  if (c2paSigned) {
    events.push(
      makeEvent({
        action: kind === "image" ? "C2PA_IMAGE_SIGNED" : "C2PA_SIGNED",
        title: kind === "image" ? "Image C2PA provenance signed" : "Video C2PA provenance signed",
        mediaId,
        timestamp: manifest.c2paSignedAt || manifest.createdAt,
        category: "c2pa",
        note: manifest.c2paManifestHash ? `Manifest hash: ${manifest.c2paManifestHash}` : null,
      })
    );
  }

  const ipfsUploaded = kind === "image" ? Boolean(manifest.ipfsCid) : manifest.ipfsStatus === "uploaded" || Boolean(manifest.metadataCid);
  if (ipfsUploaded) {
    events.push(
      makeEvent({
        action: kind === "image" ? "IPFS_IMAGE_UPLOADED" : "IPFS_METADATA_UPLOADED",
        title: kind === "image" ? "Image uploaded to IPFS" : "Video metadata uploaded to IPFS",
        mediaId,
        timestamp: manifest.createdAt,
        category: "ipfs",
        note: kind === "image"
          ? manifest.ipfsCid ? `Image CID: ${manifest.ipfsCid}` : null
          : manifest.metadataCid ? `Metadata CID: ${manifest.metadataCid}` : null,
      })
    );
  }

  return events;
};

// Every ledger event is derived by diffing consecutive versions of the
// proof from GetMediaHistory -- the chaincode itself only stores current
// state plus Fabric's own version history, it does not keep a separate
// event log the way the old Ethereum contract's TxLog ring buffer did.
const buildFabricEvents = (kind, mediaId, historyEntries) => {
  const versions = historyEntries
    .filter((entry) => !entry.isDelete && entry.value)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const events = [];
  let previous = null;

  for (const entry of versions) {
    const proof = entry.value;

    if (!previous) {
      events.push(
        makeEvent({
          action: kind === "image" ? "REGISTER_IMAGE" : "REGISTER_VIDEO",
          title: kind === "image" ? "Image registered on Fabric ledger" : "Video registered on Fabric ledger",
          mediaId,
          timestamp: entry.timestamp,
          txId: entry.txId,
          category: "register",
          orgName: "NewsAgency, Broadcaster, Auditor (unanimous)",
          note: kind === "image" ? proof.ipfsCid ? `Image CID: ${proof.ipfsCid}` : null : `Merkle root: ${proof.merkleRoot}`,
        })
      );
    } else {
      const priorReports = Object.keys(previous.tamperReports || {});
      const currentReports = Object.keys(proof.tamperReports || {});
      const newReporters = currentReports.filter((org) => !priorReports.includes(org));

      for (const org of newReporters) {
        events.push(
          makeEvent({
            action: kind === "image" ? "REPORT_IMAGE_TAMPER" : "REPORT_TAMPER",
            title: `${org} reported possible tampering`,
            mediaId,
            timestamp: entry.timestamp,
            txId: entry.txId,
            category: "tamper",
            orgName: org,
          })
        );
      }

      if (previous.status !== "disputed" && proof.status === "disputed") {
        events.push(
          makeEvent({
            action: "MEDIA_DISPUTED",
            title: "Disputed -- 2-of-3 org tamper threshold reached",
            mediaId,
            timestamp: entry.timestamp,
            txId: entry.txId,
            category: "disputed",
          })
        );
      }

      if (previous.status === "disputed" && proof.status === "active") {
        events.push(
          makeEvent({
            action: "DISPUTE_CLEARED",
            title: `Dispute cleared by ${proof.disputeClearedBy || "Auditor"}`,
            mediaId,
            timestamp: entry.timestamp,
            txId: entry.txId,
            category: "cleared",
            orgName: "Auditor",
          })
        );
      }

      if (previous.status !== "revoked" && proof.status === "revoked") {
        events.push(
          makeEvent({
            action: "REVOKE_MEDIA",
            title: `Revoked by ${proof.revokedByOrg || proof.revokedBy || "consortium"}`,
            mediaId,
            timestamp: entry.timestamp,
            txId: entry.txId,
            category: "revoked",
            orgName: proof.revokedByOrg || proof.revokedBy,
            note: proof.revocationReason || null,
          })
        );
      }
    }

    previous = proof;
  }

  return { events, latest: previous };
};

const sortEvents = (events) =>
  events.sort((a, b) => {
    const timeA = a.timestampIso ? new Date(a.timestampIso).getTime() : 0;
    const timeB = b.timestampIso ? new Date(b.timestampIso).getTime() : 0;
    return timeA - timeB;
  });

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

  const localEvents = buildLocalPipelineEvents(mediaKind, manifest);

  const historyResult = await getMediaHistory(mediaKind, id);
  const historyEntries = historyResult.available ? historyResult.history : [];
  const { events: fabricEvents, latest } = buildFabricEvents(mediaKind, id, historyEntries);

  const events = sortEvents([...localEvents, ...fabricEvents]);

  return {
    kind: mediaKind,
    id,
    title: manifest.title || id,
    source: historyResult.available && historyEntries.length ? "fabric+local" : "local-fallback",
    events,
    summary: {
      totalEvents: events.length,
      finalStatus: latest ? statusLabel(latest.status) : statusLabel(manifest.status),
      hasRevocation: events.some((event) => event.category === "revoked"),
      hasDispute: events.some((event) => event.category === "disputed"),
      fabricStatus: manifest.fabricStatus || (historyEntries.length ? "ready" : "unknown"),
    },
    immutabilityNotice:
      "This timeline is built from the Fabric ledger's own version history (GetMediaHistory) plus local C2PA/IPFS provenance checkpoints. Media cannot be deleted; revoke only changes status while the original record remains auditable.",
  };
};

module.exports = { buildRevocationTimeline };
