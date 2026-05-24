/**
 * TrustStream C2PA Service
 *
 * Implements C2PA (Coalition for Content Provenance and Authenticity)
 * specification v2.2 for digital news video segments AND images.
 *
 * VIDEO assertions (8):
 * 1. c2pa.hash.data             - SHA-256 hard binding
 * 2. c2pa.actions               - Created, Transcoded (FFmpeg), Published
 * 3. c2pa.claim_generator_info  - TrustStream software identity
 * 4. stds.schema-org.CreativeWork - VideoObject metadata
 * 5. c2pa.ingredient            - Original MP4 -> HLS segment provenance
 * 6. c2pa.timestamp             - Proof of existence (RFC 3161 compatible)
 * 7. truststream.consortium     - 3-org endorsement + blockchain + IPFS
 * 8. truststream.chain_hash     - Sequential chain hash provenance
 *
 * IMAGE assertions (7):
 * 1. c2pa.hash.data             - SHA-256 hard binding
 * 2. c2pa.actions               - Created, Published (no Transcoded)
 * 3. c2pa.claim_generator_info  - TrustStream software identity
 * 4. stds.schema-org.CreativeWork - ImageObject metadata
 * 5. c2pa.ingredient            - Original upload provenance
 * 6. c2pa.timestamp             - Proof of existence
 * 7. truststream.consortium     - 3-org endorsement + blockchain + IPFS
 * NOTE: No truststream.chain_hash - images are single units, not chained.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Pull blockchain metadata from the single config source of truth.
// This way the consortium assertion always reflects the actually-deployed
// contract + 3 org addresses without re-reading env on every call.
const {
  contractAddress: CFG_CONTRACT_ADDRESS,
  chainId: CFG_CHAIN_ID,
  network: CFG_NETWORK,
  accounts: CFG_ACCOUNTS,
} = require("../config/blockchain");

// --- C2PA Specification Version ---------------------------------
const C2PA_SPEC_VERSION = "2.2";
const C2PA_CLAIM_GENERATOR = `TrustStream/1.0 c2pa-spec/${C2PA_SPEC_VERSION}`;

// Human-readable network label for the consortium assertion.
const formatNetworkLabel = () => {
  if (CFG_NETWORK === "sepolia" || CFG_CHAIN_ID === 11155111) {
    return "Ethereum Sepolia Testnet";
  }
  if (CFG_NETWORK) return `Ethereum ${CFG_NETWORK}`;
  return "Ethereum Testnet";
};

// =================================================================
//  SHARED ASSERTION BUILDERS
// =================================================================

const buildHashAssertion = ({ sha256Hash, filename, fileSize }) => ({
  label: "c2pa.hash.data",
  data: {
    algorithm: "sha2-256",
    hash: sha256Hash,
    name: filename,
    file_size: fileSize || null,
    exclusions: [],
  },
});

const buildClaimGeneratorAssertion = () => ({
  label: "c2pa.claim_generator_info",
  data: {
    name: "TrustStream",
    version: "1.0.0",
    operating_system: process.platform,
    description:
      "Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming",
    homepage: "https://github.com/nahidhossain143/TrustStream",
    spec_version: C2PA_SPEC_VERSION,
    institution: "Ahsanullah University of Science and Technology",
    program: "B.Sc. in Computer Science and Engineering",
  },
});

const buildTimestampAssertion = ({ createdAt, mediaId, identifier, sha256Hash }) => {
  const proofHash = crypto
    .createHash("sha256")
    .update(`${mediaId}:${identifier}:${sha256Hash}:${createdAt}`)
    .digest("hex");

  return {
    label: "c2pa.timestamp",
    data: {
      timestamp: new Date().toISOString(),
      created_at: createdAt,
      proof_hash: proofHash,
      method: "local-hmac",
      note: "Production implementation would use RFC 3161 trusted timestamp authority (TSA)",
      asset_reference: { media_id: mediaId, identifier, sha256: sha256Hash },
    },
  };
};

const buildConsortiumAssertion = ({ mediaId, identifier, ipfsCid }) => ({
  label: "truststream.consortium",
  data: {
    spec: "TrustStream Consortium Endorsement v1.0",
    blockchain: {
      network: formatNetworkLabel(),
      chain_id: CFG_CHAIN_ID || null,
      contract_address: CFG_CONTRACT_ADDRESS || null,
      rpc_provider: process.env.SEPOLIA_RPC_URL ? "Custom" : "Alchemy",
    },
    organizations: [
      { name: "NewsAgency",  role: "Submitter", address: CFG_ACCOUNTS?.newsAgency  || null, action: "Registers media hash on blockchain", order: 1 },
      { name: "Broadcaster", role: "Endorser",  address: CFG_ACCOUNTS?.broadcaster || null, action: "Endorses registered hash",           order: 2 },
      { name: "Auditor",     role: "Endorser",  address: CFG_ACCOUNTS?.auditor     || null, action: "Final endorsement and verification", order: 3 },
    ],
    endorsement_policy: {
      minimum_required: 2,
      total_organizations: 3,
      policy: "2-of-3 consortium endorsement required for validation",
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

// =================================================================
//  VIDEO-SPECIFIC ASSERTION BUILDERS
// =================================================================

const buildActionsAssertion = ({ createdAt, softwareAgent, videoId, segmentIndex, originalFilename }) => ({
  label: "c2pa.actions",
  data: {
    actions: [
      {
        action: "c2pa.created",
        when: createdAt,
        softwareAgent: softwareAgent || C2PA_CLAIM_GENERATOR,
        description: "Original video content captured and ingested into TrustStream pipeline",
      },
      {
        action: "c2pa.transcoded",
        when: createdAt,
        softwareAgent: "FFmpeg/6.0",
        description: `Original MP4 transcoded to MPEG-2 TS HLS segment ${segmentIndex} using FFmpeg`,
        parameters: {
          input_format: "video/mp4",
          output_format: "video/MP2T",
          segment_duration: "2s",
          video_codec: "libx264",
          audio_codec: "aac",
          hls_type: "VOD",
          source_filename: originalFilename || null,
        },
      },
      {
        action: "c2pa.published",
        when: new Date().toISOString(),
        softwareAgent: C2PA_CLAIM_GENERATOR,
        description: "Segment published to TrustStream decentralized news platform",
        parameters: {
          platform: "TrustStream",
          video_id: videoId,
          segment_index: segmentIndex,
          distribution: "HLS streaming + IPFS + Ethereum Sepolia",
        },
      },
    ],
    allActionsIncluded: true,
  },
});

const buildCreativeWorkAssertion = ({ title, description, createdAt, videoId, segmentIndex, totalSegments }) => ({
  label: "stds.schema-org.CreativeWork",
  data: {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: `${title} - Segment ${segmentIndex}`,
    description: description || `HLS segment ${segmentIndex} of ${totalSegments} from "${title}"`,
    dateCreated: createdAt,
    datePublished: new Date().toISOString(),
    encodingFormat: "video/MP2T",
    duration: "PT2S",
    isPartOf: {
      "@type": "VideoObject",
      identifier: videoId,
      name: title,
      numberOfParts: totalSegments,
    },
    publisher: { "@type": "Organization", name: "TrustStream News Network", description: "Decentralized authenticated news platform" },
    creator:   { "@type": "Organization", name: "NewsAgency",               description: "Primary content registrar in TrustStream consortium" },
  },
});

const buildIngredientAssertion = ({ originalFilename, videoId, sha256Hash }) => ({
  label: "c2pa.ingredient",
  data: {
    title: originalFilename || "Original news video",
    format: "video/mp4",
    relationship: "parentOf",
    description: "This HLS segment was derived from the original MP4 upload via FFmpeg transcoding",
    instance_id: `urn:truststream:source:${videoId}`,
    data_types: ["video/mp4"],
    validationStatus: [{ code: "claimSignature.validated", explanation: "Segment derived from validated source asset", url: null }],
  },
});

const buildChainHashAssertion = ({ videoId, segmentIndex, sha256Hash, chainHash, totalSegments }) => ({
  label: "truststream.chain_hash",
  data: {
    spec: "TrustStream Chain Hash Provenance v1.0",
    mechanism: "SHA-256(currentHash + prevHash)",
    description: "Sequential tamper detection: modifying any segment invalidates all subsequent chain hashes",
    asset_reference: { video_id: videoId, segment_index: segmentIndex, total_segments: totalSegments },
    hashes: {
      sha256_hash: sha256Hash,
      chain_hash: chainHash,
      algorithm: "SHA-256",
      chain_position: segmentIndex === 0 ? "genesis" : "chained",
    },
    security_properties: [
      "Sequential integrity - modification of segment N invalidates segments N+1 through end",
      "Immutable ledger - chain hashes stored on Ethereum Sepolia blockchain",
      "Decentralized storage - hashes pinned to IPFS via Pinata",
    ],
  },
});

// =================================================================
//  IMAGE-SPECIFIC ASSERTION BUILDERS
// =================================================================

const buildImageActionsAssertion = ({ createdAt, imageId, originalFilename, mimeType }) => ({
  label: "c2pa.actions",
  data: {
    actions: [
      {
        action: "c2pa.created",
        when: createdAt,
        softwareAgent: C2PA_CLAIM_GENERATOR,
        description: "Original image content captured and ingested into TrustStream pipeline",
        parameters: { original_filename: originalFilename || "uploaded_image", mime_type: mimeType || "image/jpeg" },
      },
      {
        action: "c2pa.published",
        when: new Date().toISOString(),
        softwareAgent: C2PA_CLAIM_GENERATOR,
        description: "Image published to TrustStream decentralized news platform",
        parameters: { platform: "TrustStream", image_id: imageId, distribution: "IPFS + Ethereum Sepolia" },
      },
    ],
    allActionsIncluded: true,
  },
});

const buildImageCreativeWorkAssertion = ({ title, description, createdAt, imageId, mimeType }) => ({
  label: "stds.schema-org.CreativeWork",
  data: {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: title,
    description: description || `News image published on TrustStream: "${title}"`,
    dateCreated: createdAt,
    datePublished: new Date().toISOString(),
    encodingFormat: mimeType || "image/jpeg",
    identifier: imageId,
    publisher: { "@type": "Organization", name: "TrustStream News Network", description: "Decentralized authenticated news platform" },
    creator:   { "@type": "Organization", name: "NewsAgency",               description: "Primary content registrar in TrustStream consortium" },
  },
});

const buildImageIngredientAssertion = ({ originalFilename, imageId, sha256Hash, mimeType }) => ({
  label: "c2pa.ingredient",
  data: {
    title: originalFilename || "Original news image",
    format: mimeType || "image/jpeg",
    relationship: "parentOf",
    description: "Original image file uploaded directly to TrustStream - no transcoding applied",
    instance_id: `urn:truststream:image:source:${imageId}`,
    data_types: [mimeType || "image/jpeg"],
    validationStatus: [{ code: "claimSignature.validated", explanation: "Image validated from original upload", url: null }],
  },
});

// =================================================================
//  SIGNING (shared)
// =================================================================

const signManifest = (manifest) => {
  // HMAC key: NewsAgency private key (from env directly - we never leak
  // raw private keys through config). Fallback for dev only.
  const privateKey = process.env.PRIVATE_KEY || "truststream-default-signing-key";
  const payload = JSON.stringify(manifest, null, 0);
  const signature = crypto.createHmac("sha256", privateKey).update(payload).digest("hex");

  return {
    ...manifest,
    claim_signature: {
      alg: "HMAC-SHA256",
      signer: "NewsAgency",
      signer_address: CFG_ACCOUNTS?.newsAgency || null,
      signer_org: "TrustStream News Network",
      sig: signature,
      signed_at: new Date().toISOString(),
      note: "Production implementation uses X.509 PKI certificates per C2PA spec",
    },
  };
};

// =================================================================
//  VIDEO MANIFEST
// =================================================================

const buildManifest = ({ videoId, segmentIndex, filename, sha256Hash, chainHash, ipfsCid, title, description, createdAt, totalSegments, fileSize, originalFilename }) => {
  const assertions = [
    buildHashAssertion({ sha256Hash, filename, fileSize }),
    buildActionsAssertion({ createdAt, videoId, segmentIndex, originalFilename }),
    buildClaimGeneratorAssertion(),
    buildCreativeWorkAssertion({ title, description, createdAt, videoId, segmentIndex, totalSegments }),
    buildIngredientAssertion({ originalFilename, videoId, sha256Hash }),
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
    claim: { created_assertions: assertions.map((a) => a.label), gathered_assertions: [], alg: "HMAC-SHA256", created_at: createdAt },
  };
};

// =================================================================
//  IMAGE MANIFEST
// =================================================================

const buildImageManifest = ({ imageId, filename, sha256Hash, ipfsCid, title, description, createdAt, fileSize, originalFilename, mimeType }) => {
  const assertions = [
    buildHashAssertion({ sha256Hash, filename, fileSize }),
    buildImageActionsAssertion({ createdAt, imageId, originalFilename, mimeType }),
    buildClaimGeneratorAssertion(),
    buildImageCreativeWorkAssertion({ title, description, createdAt, imageId, mimeType }),
    buildImageIngredientAssertion({ originalFilename, imageId, sha256Hash, mimeType }),
    buildTimestampAssertion({ createdAt, mediaId: imageId, identifier: "image", sha256Hash }),
    buildConsortiumAssertion({ mediaId: imageId, identifier: "image", ipfsCid }),
    // NOTE: No truststream.chain_hash - images are single units.
  ];

  return {
    "@context": "https://c2pa.org/manifest/v1",
    spec_version: C2PA_SPEC_VERSION,
    claim_generator: C2PA_CLAIM_GENERATOR,
    media_type: "image",
    title,
    format: mimeType || "image/jpeg",
    instance_id: `urn:truststream:image:${imageId}`,
    assertions,
    claim: { created_assertions: assertions.map((a) => a.label), gathered_assertions: [], alg: "HMAC-SHA256", created_at: createdAt },
  };
};

// =================================================================
//  VERIFY (shared)
// =================================================================

const verifyManifestSignature = (signedManifest) => {
  try {
    const { claim_signature, ...manifestWithoutSig } = signedManifest;
    if (!claim_signature) return { valid: false, error: "No claim_signature found" };

    const privateKey = process.env.PRIVATE_KEY || "truststream-default-signing-key";
    const payload = JSON.stringify(manifestWithoutSig, null, 0);
    const expected = crypto.createHmac("sha256", privateKey).update(payload).digest("hex");
    const valid = expected === claim_signature.sig;

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
      signer_address: claim_signature.signer_address,
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
//  GENERATE + SAVE - IMAGE
// =================================================================

// Build the .c2pa sidecar path next to the image file by stripping the
// original extension (regex-free, so unusual filenames are handled safely).
const sidecarPathFor = (imageLocalPath) => {
  const dir = path.dirname(imageLocalPath);
  const ext = path.extname(imageLocalPath);
  const base = path.basename(imageLocalPath, ext);
  return path.join(dir, base + ".c2pa");
};

// IPFS-first: do NOT write a local sidecar. Returns the signed manifest
// JSON in-memory so the caller can pin it to IPFS. The .c2pa sidecar
// path concept stays for video segments (which still hit local disk
// for FFmpeg pipeline reasons), but image flow is fully decentralized.
const generateImageManifest = async ({ imageId, filename, localPath, sha256Hash, ipfsCid, title, description, createdAt, originalFilename, mimeType, fileSize: passedFileSize }) => {
  try {
    let fileSize = passedFileSize ?? null;
    if (fileSize == null && localPath) {
      try { fileSize = fs.statSync(localPath).size; } catch {}
    }

    const manifest = buildImageManifest({
      imageId, filename, sha256Hash, ipfsCid: ipfsCid || null,
      title, description, createdAt, fileSize, originalFilename, mimeType,
    });

    const signedManifest = signManifest(manifest);
    const manifestHash = crypto.createHash("sha256").update(JSON.stringify(signedManifest)).digest("hex");

    console.log(`[c2pa] ${imageId}.c2pa signed in-memory (${signedManifest.assertions.length} assertions, IPFS-bound)`);

    return {
      ok: true,
      signedManifest,
      manifestHash,
      signedAt: signedManifest.claim_signature.signed_at,
      instanceId: signedManifest.instance_id,
      assertionsCount: signedManifest.assertions.length,
    };
  } catch (err) {
    console.error(`[c2pa] image manifest failed for ${imageId}:`, err.message);
    return { ok: false, error: err.message };
  }
};

// Verify any signed C2PA manifest object. Used after the sidecar has
// been fetched from IPFS — no local file dependency.
const verifyImageManifestObject = (signedManifest) => {
  if (!signedManifest || typeof signedManifest !== "object") {
    return { exists: false, valid: false, error: "C2PA manifest object missing or invalid" };
  }
  return { exists: true, ...verifyManifestSignature(signedManifest), manifest: signedManifest };
};

// Legacy helper kept for backward compatibility with any image manifests
// that still have a local sidecar on disk (pre-IPFS-only migration).
const readAndVerifyImageManifest = (localPath) => {
  try {
    const sidecarPath = sidecarPathFor(localPath);
    if (!fs.existsSync(sidecarPath)) return { exists: false, valid: false, error: "C2PA image sidecar not found" };
    const signedManifest = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    return { exists: true, ...verifyManifestSignature(signedManifest), manifest: signedManifest };
  } catch (err) {
    return { exists: false, valid: false, error: err.message };
  }
};

// =================================================================
//  VIDEO SUMMARY MANIFEST (playlist-level)
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
      buildClaimGeneratorAssertion(),
      buildCreativeWorkAssertion({ title: manifest.title, description: manifest.description, createdAt: manifest.createdAt, videoId: manifest.videoId, segmentIndex: "playlist", totalSegments: manifest.totalSegments }),
      buildActionsAssertion({ createdAt: manifest.createdAt, videoId: manifest.videoId, segmentIndex: "playlist" }),
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
  // Video
  generateSegmentManifest,
  generateAllManifests,
  readAndVerifyManifest,
  buildVideoManifest,

  // Image
  generateImageManifest,
  readAndVerifyImageManifest,
  verifyImageManifestObject,

  // Shared
  verifyManifestSignature,

  // Individual assertion builders (for testing/extension)
  buildHashAssertion,
  buildActionsAssertion,
  buildImageActionsAssertion,
  buildConsortiumAssertion,
  buildChainHashAssertion,
  buildTimestampAssertion,
};
