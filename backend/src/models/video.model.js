const pool = require("../config/db");

// ============================================================
// VIDEO queries
// ============================================================

const createVideo = async ({ title, description, originalFilename, originalPath }) => {
  const query = `
    INSERT INTO videos (title, description, original_filename, original_path, status)
    VALUES ($1, $2, $3, $4, 'processing')
    RETURNING *
  `;
  const values = [title, description || "", originalFilename, originalPath];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const updateVideoReady = async (videoId, totalSegments, durationSeconds) => {
  const query = `
    UPDATE videos
    SET status = 'ready', total_segments = $2, duration_seconds = $3
    WHERE id = $1
    RETURNING *
  `;
  const result = await pool.query(query, [videoId, totalSegments, durationSeconds]);
  return result.rows[0];
};

const getAllVideos = async () => {
  const query = `
    SELECT id, title, description, status, total_segments,
           duration_seconds, created_at, uploader_id
    FROM videos
    ORDER BY created_at DESC
  `;
  const result = await pool.query(query);
  return result.rows;
};

const getVideoById = async (videoId) => {
  const query = `SELECT * FROM videos WHERE id = $1`;
  const result = await pool.query(query, [videoId]);
  return result.rows[0] || null;
};

// ============================================================
// SEGMENT queries
// ============================================================

const createSegment = async ({
  videoId,
  segmentIndex,
  filename,
  filePath,
  sha256Hash,
  prevHash,
  chainHash,
  durationSeconds,
  fileSizeBytes,
  ipfsCid = null,
}) => {
  const query = `
    INSERT INTO video_segments
      (video_id, segment_index, filename, file_path, sha256_hash,
       prev_hash, chain_hash, duration_seconds, file_size_bytes, ipfs_cid)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `;
  const values = [
    videoId,
    segmentIndex,
    filename,
    filePath,
    sha256Hash,
    prevHash || null,
    chainHash,
    durationSeconds || 2.0,
    fileSizeBytes || 0,
    ipfsCid,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const updateSegmentIPFS = async (videoId, segmentIndex, ipfsCid) => {
  const query = `
    UPDATE video_segments
    SET ipfs_cid = $3
    WHERE video_id = $1 AND segment_index = $2
    RETURNING *
  `;
  const result = await pool.query(query, [videoId, segmentIndex, ipfsCid]);
  return result.rows[0];
};

const getSegmentsByVideoId = async (videoId) => {
  const query = `
    SELECT * FROM video_segments
    WHERE video_id = $1
    ORDER BY segment_index ASC
  `;
  const result = await pool.query(query, [videoId]);
  return result.rows;
};

const getSegment = async (videoId, segmentIndex) => {
  const query = `
    SELECT * FROM video_segments
    WHERE video_id = $1 AND segment_index = $2
  `;
  const result = await pool.query(query, [videoId, segmentIndex]);
  return result.rows[0] || null;
};

// ============================================================
// VERIFICATION LOG queries
// ============================================================

const logVerification = async ({
  videoId,
  segmentIndex,
  clientHash,
  storedHash,
  isMatch,
  clientIp,
}) => {
  const query = `
    INSERT INTO verification_logs
      (video_id, segment_index, client_hash, stored_hash, is_match, client_ip)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;
  const values = [videoId, segmentIndex, clientHash, storedHash, isMatch, clientIp || ""];
  const result = await pool.query(query, values);
  return result.rows[0];
};

const getVerificationLogs = async (videoId) => {
  const query = `
    SELECT * FROM verification_logs
    WHERE video_id = $1
    ORDER BY verified_at DESC
    LIMIT 100
  `;
  const result = await pool.query(query, [videoId]);
  return result.rows;
};

module.exports = {
  createVideo,
  updateVideoReady,
  getAllVideos,
  getVideoById,
  createSegment,
  updateSegmentIPFS,
  getSegmentsByVideoId,
  getSegment,
  logVerification,
  getVerificationLogs,
};