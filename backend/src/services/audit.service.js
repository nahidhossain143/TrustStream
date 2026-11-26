"use strict";

// Auditor-only "Independent Audit".
//
// The pre-approval integrity check (runIntegrityCheck) is shared by both
// reviewing orgs and answers "is this server's copy still what was
// registered?". The Auditor is the last gate, so it additionally re-verifies
// from sources other than this server's own copy: what IPFS actually serves,
// compared against what the ledger recorded, plus the approval trail that got
// the item this far.
//
// Each check is { id, label, ok, detail }. ok is true, false, or null when the
// check could not be completed (e.g. an IPFS gateway timeout) - which is not
// evidence of tampering and is reported differently from a failure.

const crypto = require("crypto");
const { queryLedger, getMediaHistory } = require("./fabric.service");
const { fetchBufferFromIPFS } = require("./ipfs.service");
const { readAndVerifyManifest, verifyEmbeddedAsset } = require("./c2pa.service");

// The public gateway answers bursts with 429, so audits download one file at
// a time, back off between attempts, and remember digests for a while.
const RETRY_DELAYS_MS = [0, 3000, 10000];
const DIGEST_TTL_MS = 10 * 60 * 1000;

const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const result = (id, label, ok, detail) => ({ id, label, ok, detail });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithBackoff = async (cid) => {
  for (const delay of RETRY_DELAYS_MS) {
    await sleep(delay);
    const buffer = await fetchBufferFromIPFS(cid);
    if (buffer) return buffer;
  }
  return null;
};

// One download at a time across all audits running on this server.
let queue = Promise.resolve();
const download = (cid) => {
  const next = queue.then(() => fetchWithBackoff(cid));
  queue = next.catch(() => {});
  return next;
};

// A CID names fixed content, so a digest computed from it a moment ago is
// still right. Concurrent requests for one CID share a single download.
// Failures are not remembered.
const digests = new Map();
const digestOf = (cid) => {
  const cached = digests.get(cid);
  if (cached && Date.now() - cached.at < DIGEST_TTL_MS) return cached.digest;

  const digest = download(cid).then((buffer) => {
    if (!buffer) digests.delete(cid);
    return buffer ? sha256(buffer) : null;
  });
  digests.set(cid, { at: Date.now(), digest });
  return digest;
};

const checkImageFromIpfs = async (proof) => {
  const label = "IPFS copy";
  const buffer = await download(proof.ipfsCid);
  if (!buffer) return [result("ipfs", label, null, "Could not download the image from IPFS")];

  const matches = sha256(buffer) === proof.sha256Hash;
  const checks = [result("ipfs", label, matches, matches
    ? "Downloaded bytes match the digest on the ledger"
    : "Downloaded bytes do NOT match the digest on the ledger")];

  const c2pa = await verifyEmbeddedAsset(buffer, proof.metadata?.mimeType || "image/jpeg");
  const assertion = c2pa.manifest?.assertions?.find((a) => a.label === "truststream.consortium");
  const namedId = assertion?.data?.asset_reference?.media_id;
  const bound = c2pa.valid === true && namedId === proof.mediaId;
  checks.push(result("c2pa-binding", "C2PA names this record", bound, bound
    ? "The embedded manifest is trusted and names this media ID"
    : c2pa.error || `The embedded manifest names a different record (${namedId || "none"})`));
  return checks;
};

// Rebuilds the Merkle root from the segments IPFS serves, the same way it was
// built at upload time: chain hash per segment, then a Merkle tree over those.
const checkVideoFromIpfs = async (proof, buildMerkleRoot) => {
  const label = "IPFS copy";
  const segments = [...(proof.metadata?.segments || [])].sort((a, b) => a.index - b.index);
  if (!segments.length || segments.some((s) => !s.cid)) {
    return [result("ipfs", label, false, "The ledger record has no IPFS CID for every segment")];
  }

  const segmentDigests = [];
  for (const segment of segments) {
    const digest = await digestOf(segment.cid);
    if (!digest) {
      return [result("ipfs", label, null,
        `Could not download segment ${segment.index} from IPFS (gateway busy or unreachable) - reload to try again`)];
    }
    segmentDigests.push(digest);
  }

  let prevHash = "";
  const chained = segmentDigests.map((digest) => {
    const chainHash = sha256(Buffer.from(digest + prevHash, "hex"));
    prevHash = digest;
    return { sha256Hash: digest, chainHash };
  });

  const matches = buildMerkleRoot(chained) === proof.merkleRoot;
  return [result("ipfs", label, matches, matches
    ? `${segments.length} segments downloaded; Merkle root matches the ledger`
    : "Merkle root of the downloaded segments does NOT match the ledger")];
};

const checkSegmentSignatures = (manifest) => {
  const segments = manifest.segments || [];
  const bad = segments.filter((s) => readAndVerifyManifest(s.localPath).valid !== true);
  const ok = segments.length > 0 && bad.length === 0;
  return result("segment-c2pa", "Segment signatures", ok, ok
    ? `All ${segments.length} segment manifests have a valid signature`
    : `Invalid or missing signature on segment(s): ${bad.map((s) => s.index).join(", ") || "all"}`);
};

// Confirms from the ledger's own history that the Broadcaster really moved
// this item from pending_broadcaster to pending_auditor.
const checkApprovalTrail = async (mediaType, mediaId) => {
  const label = "Broadcaster approval";
  const response = await getMediaHistory(mediaType, mediaId);
  if (!response.available) return result("approval", label, null, response.reason);

  const versions = [...response.history].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const index = versions.findIndex((v) => v.value?.status === "pending_auditor");
  const approval = versions[index];
  const ok = index > 0
    && versions[index - 1].value?.status === "pending_broadcaster"
    && approval.value.broadcasterApprovedBy === "Org2MSP";

  return result("approval", label, ok, ok
    ? `Approved by Org2MSP at ${approval.value.broadcasterApprovedAt} (tx ${approval.txId.slice(0, 16)}…)`
    : "The ledger history shows no valid Broadcaster approval");
};

// What reviewers and viewers are shown comes from the local catalog; make
// sure it still says what was registered.
const checkMetadata = (proof, manifest) => {
  const differences = [];
  if (proof.title !== manifest.title) differences.push("title");
  if ((proof.metadata?.description || "") !== (manifest.description || "")) differences.push("description");
  const ok = differences.length === 0;
  return result("metadata", "Title & description", ok, ok
    ? "Match what was registered on the ledger"
    : `Differs from the ledger record: ${differences.join(", ")}`);
};

// Video only: the submitter's original file digest is on the ledger, so the
// same master submitted twice can be spotted.
const checkDuplicate = async (proof) => {
  const label = "Resubmission";
  const original = proof.metadata?.originalSha256;
  if (!original) return result("duplicate", label, null, "No original-file digest on this record");

  const response = await queryLedger("QueryByMediaType", ["video"]);
  if (!response.available) return result("duplicate", label, null, response.reason);

  const others = (response.results || [])
    .map((entry) => entry.value)
    // Only earlier submissions count: a later copy must not taint the original.
    .filter((v) => v && v.mediaId !== proof.mediaId && v.metadata?.originalSha256 === original
      && new Date(v.createdAt) < new Date(proof.createdAt));
  const ok = others.length === 0;
  return result("duplicate", label, ok, ok
    ? "This original file has not been submitted before"
    : `Same original file already submitted: ${others.map((v) => `"${v.title}" (${v.status})`).join(", ")}`);
};

const runIndependentAudit = async ({ mediaType, mediaId, manifest, buildMerkleRoot }) => {
  const response = await queryLedger("GetMediaProof", [mediaType, mediaId]);
  const proof = response.available ? response.results : null;
  if (!proof) {
    const checks = [result("ledger", "Ledger record", null, response.reason || "No ledger record found")];
    return { passed: false, checks };
  }

  const checks = mediaType === "image"
    ? await checkImageFromIpfs(proof)
    : [...await checkVideoFromIpfs(proof, buildMerkleRoot), checkSegmentSignatures(manifest)];

  checks.push(await checkApprovalTrail(mediaType, mediaId));
  checks.push(checkMetadata(proof, manifest));
  if (mediaType === "video") checks.push(await checkDuplicate(proof));

  return { passed: checks.every((c) => c.ok === true), checks };
};

module.exports = { runIndependentAudit };
