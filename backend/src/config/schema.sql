-- TrustStream PostgreSQL Schema
-- Run this file once to initialize the database
-- Command: psql -U postgres -d truststream -f schema.sql

-- ============================================================
-- EXTENSION
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TABLE: videos
-- Stores uploaded news video metadata
-- ============================================================
CREATE TABLE IF NOT EXISTS videos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title         VARCHAR(255) NOT NULL,
  description   TEXT,
  uploader_id   VARCHAR(100) DEFAULT 'admin',
  original_filename  VARCHAR(255),
  original_path VARCHAR(500),         -- path of uploaded raw file
  status        VARCHAR(50) DEFAULT 'processing',  
                                      -- 'processing' | 'ready' | 'failed'
  total_segments INTEGER DEFAULT 0,
  duration_seconds FLOAT DEFAULT 0,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- TABLE: video_segments
-- Stores each .ts chunk with its sequential hash
-- ============================================================
CREATE TABLE IF NOT EXISTS video_segments (
  id              SERIAL PRIMARY KEY,
  video_id        UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  segment_index   INTEGER NOT NULL,       -- 0, 1, 2, 3 ... sequential
  filename        VARCHAR(255) NOT NULL,  -- e.g. sample_000.ts
  file_path       VARCHAR(500),           -- local path (before IPFS)
  ipfs_cid        VARCHAR(100),           -- IPFS CID (added in Phase 2)
  sha256_hash     VARCHAR(64) NOT NULL,   -- SHA-256 of the .ts file
  prev_hash       VARCHAR(64),            -- hash of previous segment (chain!)
  chain_hash      VARCHAR(64),            -- SHA-256(sha256_hash + prev_hash)
  duration_seconds FLOAT DEFAULT 2.0,
  file_size_bytes BIGINT,
  is_verified     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMP DEFAULT NOW(),

  UNIQUE(video_id, segment_index)         -- no duplicate segments
);


-- ============================================================
-- TABLE: verification_logs
-- Tracks every time a user verified a segment (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS verification_logs (
  id              SERIAL PRIMARY KEY,
  video_id        UUID NOT NULL REFERENCES videos(id),
  segment_index   INTEGER NOT NULL,
  client_hash     VARCHAR(64),            -- hash computed by frontend
  stored_hash     VARCHAR(64),            -- hash from our DB
  is_match        BOOLEAN NOT NULL,       -- TRUE = authentic, FALSE = tampered
  client_ip       VARCHAR(50),
  verified_at     TIMESTAMP DEFAULT NOW()
);


-- ============================================================
-- INDEXES for fast queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_segments_video_id 
  ON video_segments(video_id);

CREATE INDEX IF NOT EXISTS idx_segments_video_index 
  ON video_segments(video_id, segment_index);

CREATE INDEX IF NOT EXISTS idx_verify_logs_video 
  ON verification_logs(video_id, segment_index);


-- ============================================================
-- FUNCTION: auto-update updated_at on videos
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_videos_updated_at
  BEFORE UPDATE ON videos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


