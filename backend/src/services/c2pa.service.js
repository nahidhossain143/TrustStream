/**
 * TrustStream C2PA Service
 *
 * Implements C2PA (Coalition for Content Provenance and Authenticity)
 * specification v2.2 for digital news video and images, using the
 * official @contentauth/c2pa-node bindings (Adobe's Rust c2pa-rs core)
 * for two artifact classes that the format actually supports:
 *
 *  - IMAGES: a real signed C2PA manifest is embedded directly into the
 *    image bytes (JUMBF box), ES256-signed against an X.509 cert chain,
 *    and independently re-verifiable by any C2PA-compliant tool.
 *  - VIDEO (source MP4): same real embedding, applied to the original
 *    upload before it is transcoded into HLS segments.
 *
 * HLS .ts segments are NOT a C2PA-embeddable container (the spec covers
 * MP4/MOV/JPEG/PNG/WAV/etc, not raw MPEG-TS), so per-segment provenance
 * stays a TrustStream-specific signed JSON sidecar (chain-hash linking
 * consecutive segments) - now ES256-signed with the same real cert
 * instead of the previous HMAC-SHA256 shared-secret scheme.
 *
 * VIDEO SEGMENT sidecar assertions (6):
 * 1. c2pa.hash.data             - SHA-256 hard binding
 * 2. c2pa.actions               - Created, Transcoded (FFmpeg), Published
 * 3. stds.schema-org.CreativeWork - VideoObject metadata
 * 4. c2pa.timestamp             - Local proof-of-existence hash chain
 * 5. truststream.consortium     - 3-org endorsement + blockchain + IPFS
 * 6. truststream.chain_hash     - Sequential chain hash provenance
 *
 * IMAGE / VIDEO-SOURCE embedded manifest assertions:
 * 1. c2pa.hash.data  - automatic hard binding (added by the Builder/Reader)
 * 2. c2pa.actions    - Created (with IPTC digitalSourceType), Published
 * 3. stds.schema-org.CreativeWork - ImageObject / VideoObject metadata
 * 4. truststream.consortium - 3-org endorsement + blockchain + IPFS
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  Builder,
  LocalSigner,
  Reader,
  createTrustSettings,
  createVerifySettings,
  mergeSettings,
  resolveSettings,
} = require("@contentauth/c2pa-node");

// --- C2PA Specification Version ---------------------------------
const C2PA_SPEC_VERSION = "2.2";
const CLAIM_GENERATOR_NAME = "TrustStream";
const CLAIM_GENERATOR_VERSION = "1.0.0";
const C2PA_CLAIM_GENERATOR = `${CLAIM_GENERATOR_NAME}/${CLAIM_GENERATOR_VERSION} c2pa-spec/${C2PA_SPEC_VERSION}`;

const FABRIC_ORG_MSP_IDS = {
  NewsAgency: "Org1MSP",
  Broadcaster: "Org2MSP",
  Auditor: "Org3MSP",
};

const DIGITAL_SOURCE_TYPE_CAPTURE =
  "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture";

// =================================================================
//  SIGNING IDENTITY (real X.509 cert chain, ES256 / P-256 ECDSA)
// =================================================================
//
//  Self-signed dev/thesis identity: a root CA cert issued once, and a
//  leaf "TrustStream C2PA Signer" cert issued by that root, used for
//  every signature. Production deployment would swap these files for
//  a CA-issued chain - the signing code itself does not change.
//
//  Generate with: backend/scripts/generate-c2pa-cert.sh
//
const CERT_DIR = path.join(__dirname, "../../certs/c2pa");
const CHAIN_PATH = process.env.C2PA_CERT_CHAIN_PATH || path.join(CERT_DIR, "signing-chain.pem");
const KEY_PATH = process.env.C2PA_SIGNING_KEY_PATH || path.join(CERT_DIR, "leaf-key.pem");
const ROOT_PATH = process.env.C2PA_TRUST_ANCHOR_PATH || path.join(CERT_DIR, "root-cert.pem");

let _signer = null;
const getSigner = () => {
  if (_signer) return _signer;
  const chain = fs.readFileSync(CHAIN_PATH);
  const key = fs.readFileSync(KEY_PATH);
  _signer = LocalSigner.newSigner(chain, key, "es256");
  return _signer;
};

// Leaf public key, pulled straight from the chain file, used to verify
// the raw ES256 signatures on segment JSON sidecars (no c2pa-node
// Reader needed for that path - it's our own signature, not embedded).
let _leafPublicKey = null;
const getLeafPublicKey = () => {
  if (_leafPublicKey) return _leafPublicKey;
  const chainPem = fs.readFileSync(CHAIN_PATH, "utf8");
  const leafPem = chainPem.split("-----END CERTIFICATE-----")[0] + "-----END CERTIFICATE-----\n";
  _leafPublicKey = new crypto.X509Certificate(leafPem).publicKey;
  return _leafPublicKey;
};

// Resolved (snake_cased) settings JSON for the Builder/Reader: trusts
// our own root cert and turns on real trust + hash-binding validation.
// Cached as a promise since resolveSettings is async (it can fetch
// remote trust-anchor URLs; ours is a local PEM so this resolves fast).
let _settingsPromise = null;
const getSettings = () => {
  if (!_settingsPromise) {
    const rootCert = fs.readFileSync(ROOT_PATH, "utf8");
    const merged = mergeSettings(
      createTrustSettings({ trustAnchors: rootCert, verifyTrustList: true }),
      createVerifySettings({ verifyTrust: true, verifyAfterSign: true })
    );
    _settingsPromise = resolveSettings(undefined, merged);
  }
  return _settingsPromise;
};

// =================================================================
//  SHARED ASSERTION BUILDERS
// =================================================================

const buildCreativeWorkAssertion = ({ mediaId, title, description, createdAt, mimeType, schemaType }) => ({
  label: "stds.schema-org.CreativeWork",
  data: {
    "@context": "https://schema.org",
    "@type": schemaType,
    name: title,
    description: description || `${schemaType === "VideoObject" ? "News video" : "News image"} published on TrustStream: "${title}"`,
    dateCreated: createdAt,
    datePublished: new Date().toISOString(),
    encodingFormat: mimeType,
    identifier: mediaId,
    publisher: { "@type": "Organization", name: "TrustStream News Network", description: "Decentralized authenticated news platform" },
    creator:   { "@type": "Organization", name: "NewsAgency",               description: "Primary content registrar in TrustStream consortium" },
  },
});

const buildConsortiumAssertion = ({ mediaId, identifier, ipfsCid }) => ({
  label: "truststream.consortium",
  data: {
    spec: "TrustStream Consortium Endorsement v1.0",
    permissioned_ledger: {
      network: "Hyperledger Fabric",
      channel: process.env.FABRIC_CHANNEL_NAME || "mychannel",
      chaincode: process.env.FABRIC_CHAINCODE_NAME || "truststreamcc",
    },
    organizations: [
      { name: "NewsAgency",  role: "Submitter", mspId: FABRIC_ORG_MSP_IDS.NewsAgency,  action: "Registers media proof on the Fabric ledger", order: 1 },
      { name: "Broadcaster", role: "Endorser",  mspId: FABRIC_ORG_MSP_IDS.Broadcaster, action: "Peer endorses the registration proposal",     order: 2 },
      { name: "Auditor",     role: "Endorser",  mspId: FABRIC_ORG_MSP_IDS.Auditor,     action: "Peer endorses the registration proposal",     order: 3 },
    ],
    endorsement_policy: {
      minimum_required: 3,
      total_organizations: 3,
      policy: "AND('Org1MSP.peer','Org2MSP.peer','Org3MSP.peer') -- unanimous endorsement required to commit",
    },
    decentralized_storage: {
      provider: "IPFS via Pinata",
      cid: ipfsCid || null,
      gateway: ipfsCid
        ? `${process.env.IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs"}/${ipfsCid}`
        : null,
    },
    asset_reference: { media_id: mediaId, identifier },
  },
});

const createdAction = (when, description) => ({
  action: "c2pa.created",
  when,
  digitalSourceType: DIGITAL_SOURCE_TYPE_CAPTURE,
  softwareAgent: C2PA_CLAIM_GENERATOR,
  description,
});

const publishedAction = (description, parameters) => ({
  action: "c2pa.published",
  when: new Date().toISOString(),
  softwareAgent: C2PA_CLAIM_GENERATOR,
  description,
  parameters,
});

// =================================================================
//  REAL EMBEDDED C2PA - IMAGES
// =================================================================
//
//  Embeds a genuine, ES256-signed C2PA manifest directly into the
//  image bytes via the Builder/Reader native bindings. The returned
//  `signedBuffer` - not the original upload - is what gets pinned to
//  IPFS, so the canonical decentralized copy carries its own portable,
//  independently-verifiable provenance (no TrustStream server needed
//  to check it).
//
const embedImageManifest = async ({ imageId, imageBuffer, mimeType, title, description, createdAt }) => {
  try {
    const settings = await getSettings();
    const format = mimeType || "image/jpeg";

    const builder = Builder.withJson({
      title,
      format,
      instance_id: `urn:truststream:image:${imageId}`,
      claim_generator_info: [{ name: CLAIM_GENERATOR_NAME, version: CLAIM_GENERATOR_VERSION, operating_system: process.platform }],
      intent: { create: DIGITAL_SOURCE_TYPE_CAPTURE },
      assertions: [
        {
          label: "c2pa.actions",
          data: { actions: [
            createdAction(createdAt, "Original image content captured and ingested into TrustStream pipeline"),
            publishedAction("Image published to TrustStream decentralized news platform", { platform: "TrustStream", image_id: imageId, distribution: "IPFS + Hyperledger Fabric" }),
          ] },
        },
        buildCreativeWorkAssertion({ mediaId: imageId, title, description, createdAt, mimeType: format, schemaType: "ImageObject" }),
        buildConsortiumAssertion({ mediaId: imageId, identifier: "image", ipfsCid: null }),
      ],
    }, settings);

    const signer = getSigner();
    const output = { buffer: null };
    const manifestBytes = builder.sign(signer, { buffer: imageBuffer, mimeType: format }, output);

    const manifestHash = crypto.createHash("sha256").update(manifestBytes).digest("hex");
    const signedAt = new Date().toISOString();
    const instanceId = `urn:truststream:image:${imageId}`;

    console.log(`[c2pa] image ${imageId}: real manifest embedded (+${output.buffer.length - imageBuffer.length} bytes)`);

    return { ok: true, signedBuffer: output.buffer, manifestHash, signedAt, instanceId };
  } catch (err) {
    console.error(`[c2pa] image manifest failed for ${imageId}:`, err.message);
    return { ok: false, error: err.message };
  }
};

// =================================================================
//  REAL EMBEDDED C2PA - VIDEO SOURCE (original MP4, pre-HLS-split)
// =================================================================
//
//  MP4 is a genuinely C2PA-embeddable container (unlike the .ts HLS
//  segments produced downstream), so the source upload gets a real
//  signed manifest before FFmpeg ever touches it. This is the
//  video-level "manifest of record"; per-segment provenance below is
//  a separate, TrustStream-specific concept.
//
const embedVideoManifest = async ({ videoId, videoBuffer, title, description, createdAt }) => {
  try {
    const settings = await getSettings();

    const builder = Builder.withJson({
      title,
      format: "video/mp4",
      instance_id: `urn:truststream:${videoId}:source`,
      claim_generator_info: [{ name: CLAIM_GENERATOR_NAME, version: CLAIM_GENERATOR_VERSION, operating_system: process.platform }],
      intent: { create: DIGITAL_SOURCE_TYPE_CAPTURE },
      assertions: [
        {
          label: "c2pa.actions",
          data: { actions: [
            createdAction(createdAt, "Original video content captured and ingested into TrustStream pipeline"),
            publishedAction("Video published to TrustStream decentralized news platform", { platform: "TrustStream", video_id: videoId, distribution: "HLS streaming + IPFS + Hyperledger Fabric" }),
          ] },
        },
        buildCreativeWorkAssertion({ mediaId: videoId, title, description, createdAt, mimeType: "video/mp4", schemaType: "VideoObject" }),
        buildConsortiumAssertion({ mediaId: videoId, identifier: "source", ipfsCid: null }),
      ],
    }, settings);

    const signer = getSigner();
    const output = { buffer: null };
    const manifestBytes = builder.sign(signer, { buffer: videoBuffer, mimeType: "video/mp4" }, output);

    const manifestHash = crypto.createHash("sha256").update(manifestBytes).digest("hex");
    const signedAt = new Date().toISOString();
    const instanceId = `urn:truststream:${videoId}:source`;

    console.log(`[c2pa] video ${videoId}: source MP4 manifest embedded (+${output.buffer.length - videoBuffer.length} bytes)`);

    return { ok: true, signedBuffer: output.buffer, manifestHash, signedAt, instanceId };
  } catch (err) {
    console.error(`[c2pa] video source manifest failed for ${videoId}:`, err.message);
    return { ok: false, error: err.message };
  }
};

// =================================================================
//  VERIFY - real embedded manifests (images + source MP4)
// =================================================================
//
//  Runs the full C2PA validation pipeline (signature, cert-chain trust
//  against our root anchor, and hash-binding against the actual current
//  bytes) - a genuine cryptographic check, not a re-hash comparison.
//
const verifyEmbeddedAsset = async (buffer, mimeType) => {
  try {
    const settings = await getSettings();
    const reader = await Reader.fromAsset({ buffer, mimeType }, settings);
    const store = reader.json();
    const active = store.manifests?.[store.active_manifest] || null;
    const trusted = store.validation_state === "Trusted";
    const actionsAssertion = active?.assertions?.find((a) => a.label?.startsWith("c2pa.actions"));
    const consortiumAssertion = active?.assertions?.find((a) => a.label === "truststream.consortium");

    return {
      exists: true,
      valid: trusted,
      validation_state: store.validation_state,
      spec_version: C2PA_SPEC_VERSION,
      signer: active?.signature_info?.common_name || null,
      signer_org: active?.signature_info?.issuer || null,
      algorithm: active?.signature_info?.alg || null,
      instance_id: active?.instance_id || null,
      assertions_count: active?.assertions?.length || 0,
      actions: actionsAssertion?.data?.actions?.map((a) => a.action) || [],
      consortium: consortiumAssertion?.data?.endorsement_policy || null,
      error: trusted ? null : `Manifest present but not fully trusted (validation_state=${store.validation_state})`,
      manifest: active,
    };
  } catch (err) {
    return { exists: false, valid: false, error: err.message };
  }
};

// =================================================================
//  VIDEO SEGMENTS - custom signed JSON sidecar (.ts is not
//  C2PA-embeddable; see file header). Same real ES256 identity as
//  the embedded paths above, raw-signed instead of JUMBF-embedded.
// =================================================================

const buildHashAssertion = ({ sha256Hash, filename, fileSize }) => ({
  label: "c2pa.hash.data",
  data: { algorithm: "sha2-256", hash: sha256Hash, name: filename, file_size: fileSize || null, exclusions: [] },
});

const buildSegmentActionsAssertion = ({ createdAt, videoId, segmentIndex, originalFilename }) => ({
  label: "c2pa.actions",
  data: {
    actions: [
      { action: "c2pa.created", when: createdAt, softwareAgent: C2PA_CLAIM_GENERATOR, description: "Original video content captured and ingested into TrustStream pipeline" },
      {
        action: "c2pa.transcoded", when: createdAt, softwareAgent: "FFmpeg/6.0",
        description: `Original MP4 transcoded to MPEG-2 TS HLS segment ${segmentIndex} using FFmpeg`,
        parameters: { input_format: "video/mp4", output_format: "video/MP2T", segment_duration: "2s", video_codec: "libx264", audio_codec: "aac", hls_type: "VOD", source_filename: originalFilename || null },
      },
      { action: "c2pa.published", when: new Date().toISOString(), softwareAgent: C2PA_CLAIM_GENERATOR, description: "Segment published to TrustStream decentralized news platform", parameters: { platform: "TrustStream", video_id: videoId, segment_index: segmentIndex, distribution: "HLS streaming + IPFS + Hyperledger Fabric" } },
    ],
    allActionsIncluded: true,
  },
});

const buildTimestampAssertion = ({ createdAt, mediaId, identifier, sha256Hash }) => {
  const proofHash = crypto.createHash("sha256").update(`${mediaId}:${identifier}:${sha256Hash}:${createdAt}`).digest("hex");
  return {
    label: "c2pa.timestamp",
    data: {
      timestamp: new Date().toISOString(), created_at: createdAt, proof_hash: proofHash,
      method: "local-chain-hash",
      note: "TrustStream-internal proof-of-existence hash chain, not an RFC 3161 trusted timestamp authority.",
      asset_reference: { media_id: mediaId, identifier, sha256: sha256Hash },
    },
  };
};

const buildChainHashAssertion = ({ videoId, segmentIndex, sha256Hash, chainHash, totalSegments }) => ({
  label: "truststream.chain_hash",
  data: {
    spec: "TrustStream Chain Hash Provenance v1.0",
    mechanism: "SHA-256(currentHash + prevHash)",
    description: "Sequential tamper detection: modifying any segment invalidates all subsequent chain hashes",
    asset_reference: { video_id: videoId, segment_index: segmentIndex, total_segments: totalSegments },
    hashes: { sha256_hash: sha256Hash, chain_hash: chainHash, algorithm: "SHA-256", chain_position: segmentIndex === 0 ? "genesis" : "chained" },
    security_properties: [
      "Sequential integrity - modification of segment N invalidates segments N+1 through end",
      "Immutable ledger - chain hashes stored on the Hyperledger Fabric ledger",
      "Decentralized storage - hashes pinned to IPFS via Pinata",
    ],
  },
});

const buildManifest = ({ videoId, segmentIndex, filename, sha256Hash, chainHash, ipfsCid, title, description, createdAt, totalSegments, fileSize, originalFilename }) => {
  const assertions = [
    buildHashAssertion({ sha256Hash, filename, fileSize }),
    buildSegmentActionsAssertion({ createdAt, videoId, segmentIndex, originalFilename }),
    buildCreativeWorkAssertion({ mediaId: videoId, title: `${title} - Segment ${segmentIndex}`, description: description || `HLS segment ${segmentIndex} of ${totalSegments} from "${title}"`, createdAt, mimeType: "video/MP2T", schemaType: "VideoObject" }),
    buildTimestampAssertion({ createdAt, mediaId: videoId, identifier: segmentIndex, sha256Hash }),
    buildConsortiumAssertion({ mediaId: videoId, identifier: segmentIndex, ipfsCid }),
    buildChainHashAssertion({ videoId, segmentIndex, sha256Hash, chainHash, totalSegments }),
  ];

  return {
    "@context": "https://c2pa.org/manifest/v1",
    spec_version: C2PA_SPEC_VERSION,
    claim_generator: C2PA_CLAIM_GENERATOR,
    media_type: "video",
    title: `${title} - Segment ${String(segmentIndex).padStart(3, "0")}`,
    format: "video/MP2T",
    instance_id: `urn:truststream:${videoId}:seg:${segmentIndex}`,
    assertions,
    claim: { created_assertions: assertions.map((a) => a.label), gathered_assertions: [], alg: "ES256", created_at: createdAt },
  };
};

// --- Signing (real ES256 over the JSON payload; not JUMBF-embedded) ---

const signManifest = (manifest) => {
  const signer = getSigner();
  const payload = Buffer.from(JSON.stringify(manifest, null, 0), "utf8");
  const signature = signer.sign(payload);
  const leafCertDer = new crypto.X509Certificate(
    fs.readFileSync(CHAIN_PATH, "utf8").split("-----END CERTIFICATE-----")[0] + "-----END CERTIFICATE-----\n"
  ).raw;
  const certFingerprint = crypto.createHash("sha256").update(leafCertDer).digest("hex");

  return {
    ...manifest,
    claim_signature: {
      alg: "ES256",
      signer: "NewsAgency",
      signer_msp: FABRIC_ORG_MSP_IDS.NewsAgency,
      signer_org: "TrustStream News Network",
      sig: signature.toString("base64"),
      signer_cert_fingerprint: certFingerprint,
      signed_at: new Date().toISOString(),
      note: "Real asymmetric ES256 (P-256 ECDSA) signature over this JSON payload, verified against the TrustStream signing cert - not embedded C2PA JUMBF (MPEG-TS is not a C2PA-embeddable container).",
    },
  };
};

const verifyManifestSignature = (signedManifest) => {
  try {
    const { claim_signature, ...manifestWithoutSig } = signedManifest;
    if (!claim_signature) return { valid: false, error: "No claim_signature found" };

    const payload = Buffer.from(JSON.stringify(manifestWithoutSig, null, 0), "utf8");
    const sig = Buffer.from(claim_signature.sig, "base64");
    const publicKey = getLeafPublicKey();
    const valid = crypto.verify("sha256", payload, { key: publicKey, dsaEncoding: "ieee-p1363" }, sig);

    const findAssertion = (label) => signedManifest.assertions?.find((a) => a.label === label);
    const hashAssertion = findAssertion("c2pa.hash.data");
    const actionsAssertion = findAssertion("c2pa.actions");
    const consortiumAssertion = findAssertion("truststream.consortium");
    const chainHashAssertion = findAssertion("truststream.chain_hash");
    const timestampAssertion = findAssertion("c2pa.timestamp");

    return {
      valid,
      media_type: signedManifest.media_type || "video",
      spec_version: signedManifest.spec_version,
      signer: claim_signature.signer,
      signer_org: claim_signature.signer_org,
      signed_at: claim_signature.signed_at,
      algorithm: claim_signature.alg,
      instance_id: signedManifest.instance_id,
      assertions_count: signedManifest.assertions?.length || 0,
      hash_binding: hashAssertion?.data?.hash || null,
      actions: actionsAssertion?.data?.actions?.map((a) => a.action) || [],
      consortium: consortiumAssertion?.data?.endorsement_policy || null,
      chain_hash: chainHashAssertion?.data?.hashes?.chain_hash || null,
      timestamp: timestampAssertion?.data?.timestamp || null,
      error: valid ? null : "Signature mismatch - manifest may have been tampered",
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

// =================================================================
//  GENERATE + SAVE - VIDEO SEGMENT
// =================================================================

const generateSegmentManifest = async ({ videoId, segmentIndex, filename, localPath, sha256Hash, chainHash, ipfsCid, title, description, createdAt, totalSegments, originalFilename }) => {
  try {
    let fileSize = null;
    try { fileSize = fs.statSync(localPath).size; } catch {}

    const manifest = buildManifest({ videoId, segmentIndex, filename, sha256Hash, chainHash, ipfsCid: ipfsCid || null, title, description, createdAt, totalSegments, fileSize, originalFilename });
    const signedManifest = signManifest(manifest);

    const sidecarPath = localPath.replace(/\.ts$/, ".c2pa");
    fs.writeFileSync(sidecarPath, JSON.stringify(signedManifest, null, 2));

    const manifestHash = crypto.createHash("sha256").update(JSON.stringify(signedManifest)).digest("hex");

    console.log(`[c2pa] seg_${String(segmentIndex).padStart(3, "0")}.c2pa signed (${signedManifest.assertions.length} assertions)`);

    return { ok: true, sidecarPath, manifestHash, signedAt: signedManifest.claim_signature.signed_at, instanceId: signedManifest.instance_id, assertionsCount: signedManifest.assertions.length };
  } catch (err) {
    console.error(`[c2pa] segment ${segmentIndex} failed:`, err.message);
    return { ok: false, error: err.message };
  }
};

const C2PA_BATCH_SIZE = 5;

const generateAllManifests = async (videoId, segments, title, createdAt, description, totalSegments) => {
  const results = [];

  for (let i = 0; i < segments.length; i += C2PA_BATCH_SIZE) {
    const batch = segments.slice(i, i + C2PA_BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((seg) =>
        generateSegmentManifest({
          videoId, segmentIndex: seg.index, filename: seg.filename,
          localPath: seg.localPath, sha256Hash: seg.sha256Hash,
          chainHash: seg.chainHash, ipfsCid: seg.ipfsCid || null,
          title, description, createdAt, totalSegments: totalSegments || segments.length,
        })
      )
    );

    for (let j = 0; j < batch.length; j++) {
      const r = batchResults[j];
      results.push({
        index: batch[j].index,
        ok: r.status === "fulfilled" && r.value?.ok,
        sidecarPath: r.value?.sidecarPath || null,
        manifestHash: r.value?.manifestHash || null,
        signedAt: r.value?.signedAt || null,
        instanceId: r.value?.instanceId || null,
        assertionsCount: r.value?.assertionsCount || 0,
        error: r.status === "rejected" ? r.reason?.message : r.value?.error || null,
      });
    }
  }

  return results;
};

const readAndVerifyManifest = (localPath) => {
  try {
    const sidecarPath = localPath.replace(/\.ts$/, ".c2pa");
    if (!fs.existsSync(sidecarPath)) return { exists: false, valid: false, error: "C2PA sidecar not found" };
    const signedManifest = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    return { exists: true, ...verifyManifestSignature(signedManifest), manifest: signedManifest };
  } catch (err) {
    return { exists: false, valid: false, error: err.message };
  }
};

// =================================================================
//  VIDEO SUMMARY MANIFEST (playlist-level, custom-signed JSON)
// =================================================================

const buildVideoManifest = (manifest, segmentResults) => {
  const signedCount = segmentResults.filter((r) => r.ok).length;
  const allSigned = signedCount === segmentResults.length;

  const videoManifest = {
    "@context": "https://c2pa.org/manifest/v1",
    spec_version: C2PA_SPEC_VERSION,
    claim_generator: C2PA_CLAIM_GENERATOR,
    media_type: "video",
    title: manifest.title,
    format: "application/x-mpegURL",
    instance_id: `urn:truststream:${manifest.videoId}:playlist`,
    assertions: [
      buildCreativeWorkAssertion({ mediaId: manifest.videoId, title: manifest.title, description: manifest.description, createdAt: manifest.createdAt, mimeType: "application/x-mpegURL", schemaType: "VideoObject" }),
      buildSegmentActionsAssertion({ createdAt: manifest.createdAt, videoId: manifest.videoId, segmentIndex: "playlist" }),
      {
        label: "truststream.video_summary",
        data: {
          video_id: manifest.videoId,
          total_segments: manifest.totalSegments,
          signed_segments: signedCount,
          all_signed: allSigned,
          c2pa_coverage: `${signedCount}/${manifest.totalSegments}`,
          metadata_cid: manifest.metadataCid || null,
          blockchain_status: manifest.blockchainStatus,
          ipfs_status: manifest.ipfsStatus,
          playlist_url: manifest.playlistUrl,
          source_manifest_instance_id: manifest.sourceC2paInstanceId || null,
        },
      },
    ],
    created_at: manifest.createdAt,
  };

  return signManifest(videoManifest);
};

// =================================================================
//  EXPORTS
// =================================================================

module.exports = {
  // Video segments (custom signed JSON sidecar)
  generateSegmentManifest,
  generateAllManifests,
  readAndVerifyManifest,
  buildVideoManifest,

  // Real embedded C2PA (images + source MP4)
  embedImageManifest,
  embedVideoManifest,
  verifyEmbeddedAsset,

  // Shared
  verifyManifestSignature,

  // Individual assertion builders (for testing/extension)
  buildHashAssertion,
  buildConsortiumAssertion,
  buildChainHashAssertion,
  buildTimestampAssertion,
};
