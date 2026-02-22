const pool = require('../config/db');

// ============================================================
// VIDEO queries
// ============================================================

/**
 * Create a new video record (called right after upload)
 */
const createVideo = async ({ title, description, originalFilename, originalPath }) => {
  const query = `
    INSERT INTO videos (title, description, original_filename, original_path, status)
    VALUES ($1, $2, $3, $4, 'processing')
    RETURNING *
  `;
  const values = [title, description || '', originalFilename, originalPath];
  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Update video status and segment count after FFmpeg processing
 */
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

/**
 * Get all videos (for news listing on frontend)
 */
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

/**
 * Get single video by ID
 */
const getVideoById = async (videoId) => {
  const query = `SELECT * FROM videos WHERE id = $1`;
  const result = await pool.query(query, [videoId]);
  return result.rows[0] || null;
};


// ============================================================
// SEGMENT queries
// ============================================================

/**
 * Insert one segment record with its hash
 * Called sequentially for each .ts chunk after FFmpeg
 */
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
}) => {
  const query = `
    INSERT INTO video_segments 
      (video_id, segment_index, filename, file_path, sha256_hash, 
       prev_hash, chain_hash, duration_seconds, file_size_bytes)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *
  `;
  const values = [
    videoId, segmentIndex, filename, filePath,
    sha256Hash, prevHash || null, chainHash,
    durationSeconds || 2.0, fileSizeBytes || 0,
  ];
  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Get all segments for a video (ordered by index)
 */
const getSegmentsByVideoId = async (videoId) => {
  const query = `
    SELECT * FROM video_segments
    WHERE video_id = $1
    ORDER BY segment_index ASC
  `;
  const result = await pool.query(query, [videoId]);
  return result.rows;
};

/**
 * Get single segment by video + index (for verification)
 */
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

/**
 * Log a verification attempt from the frontend
 */
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
  const values = [videoId, segmentIndex, clientHash, storedHash, isMatch, clientIp || ''];
  const result = await pool.query(query, values);
  return result.rows[0];
};

/**
 * Get verification history for a video (admin use)
 */
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
  // videos
  createVideo,
  updateVideoReady,
  getAllVideos,
  getVideoById,
  // segments
  createSegment,
  getSegmentsByVideoId,
  getSegment,
  // verification
  logVerification,
  getVerificationLogs,
};