'use strict';

// metadataJson payloads shaped like the ones the backend registers
// (buildMetadataPayload / buildImageMetadataPayload in upload.routes.js), so
// each write carries a realistic amount of on-chain metadata (chaincode v3.2+).

const hex = (seed) => require('crypto').createHash('sha256').update(String(seed)).digest('hex');

const videoMetadata = (videoId, segmentCount) => JSON.stringify({
  videoId,
  title: 'Caliper Benchmark Video',
  description: '',
  createdAt: new Date().toISOString(),
  originalSha256: hex(videoId + 'original'),
  sourceSha256: hex(videoId + 'source'),
  totalSegments: segmentCount,
  playlistUrl: `/streams/${videoId}/playlist.m3u8`,
  segments: Array.from({ length: segmentCount }, (_, index) => ({
    index,
    filename: `seg_${String(index).padStart(3, '0')}.ts`,
    sha256Hash: hex(videoId + index),
    chainHash: hex(videoId + 'chain' + index),
    cid: `bafkbenchsegment${hex(videoId + index).slice(0, 40)}`,
    gatewayUrl: null,
    durationSeconds: 2,
    c2paManifestHash: hex(videoId + 'c2pa' + index),
    c2paInstanceId: `urn:truststream:segment:${videoId}:${index}`,
    c2paSignedAt: new Date().toISOString(),
  })),
  forensics: { analysisVersion: 'ai-free-forensics/v2', analysisTimestamp: new Date().toISOString(), videoRiskScore: 0.2, finalLabel: 'Authentic' },
});

const imageMetadata = (imageId, sha256Hash, ipfsCid) => JSON.stringify({
  imageId,
  title: 'Caliper Benchmark Image',
  description: '',
  filename: `img_${imageId}.jpg`,
  originalFilename: 'benchmark.jpg',
  mimeType: 'image/jpeg',
  sha256Hash,
  ipfsCid,
  createdAt: new Date().toISOString(),
  c2paManifestHash: hex(imageId + 'c2pa'),
  c2paInstanceId: `urn:truststream:image:${imageId}`,
  forensics: { analysisVersion: 'ai-free-image-forensics/v2', analysisTimestamp: new Date().toISOString(), imageRiskScore: 0.2, finalLabel: 'Authentic' },
});

// One query target per run: a fixed ID would already exist from an earlier
// run, and RegisterImageProof refuses an ID it has seen before.
const QUERY_TARGET_ID = `caliper-query-target-${process.env.CALIPER_RUN_ID || 'default'}`;

module.exports = { videoMetadata, imageMetadata, QUERY_TARGET_ID };
