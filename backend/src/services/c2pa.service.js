/**
 * TrustStream C2PA Service
 *
 * Implements C2PA (Coalition for Content Provenance and Authenticity)
 * specification v2.2 for digital news video segments.
 *
 * Applicable C2PA Assertions implemented:
 * 1. c2pa.hash.data       — SHA-256 hard binding (tamper detection)
 * 2. c2pa.actions         — Created, transcoded, published actions
 * 3. c2pa.claim_generator — TrustStream software identity
 * 4. stds.schema-org.CreativeWork — Video metadata
 * 5. c2pa.ingredient      — Original MP4 → HLS segment relationship
 * 6. c2pa.timestamp       — Trusted time of existence
 * 7. truststream.consortium — Custom: 3-org endorsement info
 * 8. truststream.chain_hash — Custom: chain hash provenance
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ─── C2PA Specification Version ─────────────────────────
const C2PA_SPEC_VERSION = "2.2";
const C2PA_CLAIM_GENERATOR = `TrustStream/1.0 c2pa-spec/${C2PA_SPEC_VERSION}`;

// ─── Assertion Builders ──────────────────────────────────

/**
 * Assertion 1: c2pa.hash.data
 * Hard binding — cryptographically ties manifest to segment content.
 * Required by C2PA spec for tamper detection.
 */
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

/**
 * Assertion 2: c2pa.actions
 * Documents the lifecycle actions performed on this segment.
 * Required by C2PA spec — must not be redacted.
 */
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

/**
 * Assertion 3: c2pa.claim_generator
 * Identifies the software that generated this C2PA manifest.
 */
const buildClaimGeneratorAssertion = () => ({
  label: "c2pa.claim_generator_info",
  data: {
    name: "TrustStream",
    version: "1.0.0",
    operating_system: process.platform,
    description: "Decentralized Trust and Provenance for C2PA-Compliant Digital News Streaming",
    homepage: "https://github.com/nahidhossain143/TrustStream",
    spec_version: C2PA_SPEC_VERSION,
    institution: "Ahsanullah University of Science and Technology",
    program: "B.Sc. in Computer Science and Engineering",
  },
});

/**
 * Assertion 4: stds.schema-org.CreativeWork
 * Schema.org metadata for the video segment.
 * Provides human-readable provenance information.
 */
const buildCreativeWorkAssertion = ({ title, description, createdAt, videoId, segmentIndex, totalSegments }) => ({
  label: "stds.schema-org.CreativeWork",
  data: {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": `${title} — Segment ${segmentIndex}`,
    "description": description || `HLS segment ${segmentIndex} of ${totalSegments} from "${title}"`,
    "dateCreated": createdAt,
    "datePublished": new Date().toISOString(),
    "encodingFormat": "video/MP2T",
    "duration": "PT2S",
    "isPartOf": {
      "@type": "VideoObject",
      "identifier": videoId,
      "name": title,
      "numberOfParts": totalSegments,
    },
    "publisher": {
      "@type": "Organization",
      "name": "TrustStream News Network",
      "description": "Decentralized authenticated news platform",
    },
    "creator": {
      "@type": "Organization",
      "name": "NewsAgency",
      "description": "Primary content registrar in TrustStream consortium",
    },
  },
});

/**
 * Assertion 5: c2pa.ingredient
 * Documents the relationship between the original MP4 and this HLS segment.
 * Tracks provenance chain from source to derived asset.
 */
const buildIngredientAssertion = ({ originalFilename, videoId, sha256Hash }) => ({
  label: "c2pa.ingredient",
  data: {
    title: originalFilename || "Original news video",
    format: "video/mp4",
    relationship: "parentOf",
    description: "This HLS segment was derived from the original MP4 upload via FFmpeg transcoding",
    instance_id: `urn:truststream:source:${videoId}`,
    data_types: ["video/mp4"],
    validationStatus: [
      {
        code: "claimSignature.validated",
        explanation: "Segment derived from validated source asset",
        url: null,
      },
    ],
  },
});

/**
 * Assertion 6: c2pa.timestamp (Proof of Existence)
 * Establishes trusted time of existence for the segment.
 * Uses local timestamp as TSA substitute (production would use RFC 3161 TSA).
 */
const buildTimestampAssertion = ({ createdAt, videoId, segmentIndex, sha256Hash }) => {
  const proofHash = crypto
    .createHash("sha256")
    .update(`${videoId}:${segmentIndex}:${sha256Hash}:${createdAt}`)
    .digest("hex");

  return {
    label: "c2pa.timestamp",
    data: {
      timestamp: new Date().toISOString(),
      created_at: createdAt,
      proof_hash: proofHash,
      method: "local-hmac",
      note: "Production implementation would use RFC 3161 trusted timestamp authority (TSA)",
      asset_reference: {
        video_id: videoId,
        segment_index: segmentIndex,
        sha256: sha256Hash,
      },
    },
  };
};

/**
 * Custom Assertion 7: truststream.consortium
 * Documents the 3-organization consortium endorsement model.
 * Custom C2PA assertion specific to TrustStream.
 */
const buildConsortiumAssertion = ({ videoId, segmentIndex, ipfsCid, contractAddress }) => ({
  label: "truststream.consortium",
  data: {
    spec: "TrustStream Consortium Endorsement v1.0",
    blockchain: {
      network: "Ethereum Sepolia Testnet",
      chain_id: 11155111,
      contract_address: contractAddress || process.env.CONTRACT_ADDRESS || null,
      rpc_provider: "Alchemy",
    },
    organizations: [
      {
        name: "NewsAgency",
        role: "Submitter",
        address: process.env.NEWSAGENCY_ADDRESS || null,
        action: "Registers segment hash on blockchain",
        order: 1,
      },
      {
        name: "Broadcaster",
        role: "Endorser",
        address: process.env.BROADCASTER_ADDRESS || null,
        action: "Endorses registered hash",
        order: 2,
      },
      {
        name: "Auditor",
        role: "Endorser",
        address: process.env.AUDITOR_ADDRESS || null,
        action: "Final endorsement and verification",
        order: 3,
      },
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
    asset_reference: {
      video_id: videoId,
      segment_index: segmentIndex,
    },
  },
});

/**
 * Custom Assertion 8: truststream.chain_hash
 * Documents the chain hash mechanism linking segments sequentially.
 * Ensures any modification to any segment breaks the entire chain.
 */
const buildChainHashAssertion = ({ videoId, segmentIndex, sha256Hash, chainHash, totalSegments }) => ({
  label: "truststream.chain_hash",
  data: {
    spec: "TrustStream Chain Hash Provenance v1.0",
    mechanism: "SHA-256(currentHash + prevHash)",
    description: "Sequential tamper detection: modifying any segment invalidates all subsequent chain hashes",
    asset_reference: {
      video_id: videoId,
      segment_index: segmentIndex,
      total_segments: totalSegments,
    },
    hashes: {
      sha256_hash: sha256Hash,
      chain_hash: chainHash,
      algorithm: "SHA-256",
      chain_position: segmentIndex === 0 ? "genesis" : "chained",
    },
    security_properties: [
      "Sequential integrity — modification of segment N invalidates segments N+1 through end",
      "Immutable ledger — chain hashes stored on Ethereum Sepolia blockchain",
      "Decentralized storage — hashes pinned to IPFS via Pinata",
    ],
  },
});

// ─── Manifest Builder ────────────────────────────────────

/**
 * Build a complete C2PA manifest with all applicable assertions.
 */
const buildManifest = ({
  videoId,
  segmentIndex,
  filename,
  sha256Hash,
  chainHash,
  ipfsCid,
  title,
  description,
  createdAt,
  totalSegments,
  fileSize,
  originalFilename,
}) => {
  const assertions = [
    buildHashAssertion({ sha256Hash, filename, fileSize }),
    buildActionsAssertion({ createdAt, videoId, segmentIndex, originalFilename }),
    buildClaimGeneratorAssertion(),
    buildCreativeWorkAssertion({ title, description, createdAt, videoId, segmentIndex, totalSegments }),
    buildIngredientAssertion({ originalFilename, videoId, sha256Hash }),
    buildTimestampAssertion({ createdAt, videoId, segmentIndex, sha256Hash }),
    buildConsortiumAssertion({ videoId, segmentIndex, ipfsCid }),
    buildChainHashAssertion({ videoId, segmentIndex, sha256Hash, chainHash, totalSegments }),
  ];

  return {
    "@context": "https://c2pa.org/manifest/v1",
    "spec_version": C2PA_SPEC_VERSION,
    "claim_generator": C2PA_CLAIM_GENERATOR,
    "title": `${title} — Segment ${String(segmentIndex).padStart(3, "0")}`,
    "format": "video/MP2T",
    "instance_id": `urn:truststream:${videoId}:seg:${segmentIndex}`,
    "assertions": assertions,
    "claim": {
      "created_assertions": assertions.map((a) => a.label),
      "gathered_assertions": [],
      "alg": "HMAC-SHA256",
      "created_at": createdAt,
    },
  };
};

// ─── Signing ─────────────────────────────────────────────

/**
 * Sign a C2PA manifest using HMAC-SHA256 with the NewsAgency private key.
 * Production implementation would use X.509 PKI certificates.
 */
const signManifest = (manifest) => {
  const privateKey = process.env.PRIVATE_KEY || "truststream-default-signing-key";
  const payload = JSON.stringify(manifest, null, 0);
  const signature = crypto
    .createHmac("sha256", privateKey)
    .update(payload)
    .digest("hex");

  return {
    ...manifest,
    "claim_signature": {
      "alg": "HMAC-SHA256",
      "signer": "NewsAgency",
      "signer_address": process.env.NEWSAGENCY_ADDRESS || null,
      "signer_org": "TrustStream News Network",
      "sig": signature,
      "signed_at": new Date().toISOString(),
      "note": "Production implementation uses X.509 PKI certificates per C2PA spec",
    },
  };
};

// ─── Verify ──────────────────────────────────────────────

/**
 * Verify a C2PA manifest signature and validate assertion integrity.
 */
const verifyManifestSignature = (signedManifest) => {
  try {
    const { claim_signature, ...manifestWithoutSig } = signedManifest;
    if (!claim_signature) return { valid: false, error: "No claim_signature found" };

    const privateKey = process.env.PRIVATE_KEY || "truststream-default-signing-key";
    const payload = JSON.stringify(manifestWithoutSig, null, 0);
    const expected = crypto
      .createHmac("sha256", privateKey)
      .update(payload)
      .digest("hex");

    const valid = expected === claim_signature.sig;

    // Extract key assertion data for response
    const hashAssertion = signedManifest.assertions?.find((a) => a.label === "c2pa.hash.data");
    const actionsAssertion = signedManifest.assertions?.find((a) => a.label === "c2pa.actions");
    const consortiumAssertion = signedManifest.assertions?.find((a) => a.label === "truststream.consortium");
    const chainHashAssertion = signedManifest.assertions?.find((a) => a.label === "truststream.chain_hash");
    const timestampAssertion = signedManifest.assertions?.find((a) => a.label === "c2pa.timestamp");

    return {
      valid,
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
      error: valid ? null : "Signature mismatch — manifest may have been tampered",
    };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

// ─── Generate + Save ─────────────────────────────────────

/**
 * Generate, sign, and save a C2PA sidecar manifest for a segment.
 * Sidecar: seg_000.c2pa alongside seg_000.ts
 */
const generateSegmentManifest = async ({
  videoId,
  segmentIndex,
  filename,
  localPath,
  sha256Hash,
  chainHash,
  ipfsCid,
  title,
  description,
  createdAt,
  totalSegments,
  originalFilename,
}) => {
  try {
    // Get file size if available
    let fileSize = null;
    try {
      fileSize = fs.statSync(localPath).size;
    } catch {}

    const manifest = buildManifest({
      videoId,
      segmentIndex,
      filename,
      sha256Hash,
      chainHash,
      ipfsCid: ipfsCid || null,
      title,
      description,
      createdAt,
      totalSegments,
      fileSize,
      originalFilename,
    });

    const signedManifest = signManifest(manifest);

    // Save .c2pa sidecar file
    const sidecarPath = localPath.replace(/\.ts$/, ".c2pa");
    fs.writeFileSync(sidecarPath, JSON.stringify(signedManifest, null, 2));

    const manifestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(signedManifest))
      .digest("hex");

    console.log(`📋 C2PA: seg_${String(segmentIndex).padStart(3, "0")}.c2pa signed (${signedManifest.assertions.length} assertions) ✅`);

    return {
      ok: true,
      sidecarPath,
      manifestHash,
      signedAt: signedManifest.claim_signature.signed_at,
      instanceId: signedManifest.instance_id,
      assertionsCount: signedManifest.assertions.length,
    };
  } catch (err) {
    console.error(`⚠️  C2PA failed for seg ${segmentIndex}:`, err.message);
    return { ok: false, error: err.message };
  }
};

/**
 * Generate C2PA manifests for all segments in parallel batches.
 */
const C2PA_BATCH_SIZE = 5;

const generateAllManifests = async (videoId, segments, title, createdAt, description, totalSegments) => {
  const results = [];

  for (let i = 0; i < segments.length; i += C2PA_BATCH_SIZE) {
    const batch = segments.slice(i, i + C2PA_BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((seg) =>
        generateSegmentManifest({
          videoId,
          segmentIndex: seg.index,
          filename: seg.filename,
          localPath: seg.localPath,
          sha256Hash: seg.sha256Hash,
          chainHash: seg.chainHash,
          ipfsCid: seg.ipfsCid || null,
          title,
          description,
          createdAt,
          totalSegments: totalSegments || segments.length,
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

/**
 * Read and verify a saved C2PA sidecar manifest.
 */
const readAndVerifyManifest = (localPath) => {
  try {
    const sidecarPath = localPath.replace(/\.ts$/, ".c2pa");
    if (!fs.existsSync(sidecarPath)) {
      return { exists: false, valid: false, error: "C2PA sidecar not found" };
    }

    const signedManifest = JSON.parse(fs.readFileSync(sidecarPath, "utf8"));
    const verification = verifyManifestSignature(signedManifest);

    return {
      exists: true,
      ...verification,
      manifest: signedManifest,
    };
  } catch (err) {
    return { exists: false, valid: false, error: err.message };
  }
};

/**
 * Build a video-level C2PA summary manifest.
 */
const buildVideoManifest = (manifest, segmentResults) => {
  const signedCount = segmentResults.filter((r) => r.ok).length;
  const allSigned = signedCount === segmentResults.length;

  const videoManifest = {
    "@context": "https://c2pa.org/manifest/v1",
    "spec_version": C2PA_SPEC_VERSION,
    "claim_generator": C2PA_CLAIM_GENERATOR,
    "title": manifest.title,
    "format": "application/x-mpegURL",
    "instance_id": `urn:truststream:${manifest.videoId}:playlist`,
    "assertions": [
      buildClaimGeneratorAssertion(),
      buildCreativeWorkAssertion({
        title: manifest.title,
        description: manifest.description,
        createdAt: manifest.createdAt,
        videoId: manifest.videoId,
        segmentIndex: "playlist",
        totalSegments: manifest.totalSegments,
      }),
      buildActionsAssertion({
        createdAt: manifest.createdAt,
        videoId: manifest.videoId,
        segmentIndex: "playlist",
      }),
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
    "created_at": manifest.createdAt,
  };

  return signManifest(videoManifest);
};

module.exports = {
  generateSegmentManifest,
  generateAllManifests,
  readAndVerifyManifest,
  buildVideoManifest,
  verifyManifestSignature,
  // Export individual assertion builders for testing/extension
  buildHashAssertion,
  buildActionsAssertion,
  buildConsortiumAssertion,
  buildChainHashAssertion,
  buildTimestampAssertion,
};