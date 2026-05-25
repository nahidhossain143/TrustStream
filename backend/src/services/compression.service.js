"use strict";

// -----------------------------------------------------------------
//  backend/src/services/compression.service.js
//
//  Module 1 — Video Compression + Metadata Forensics
//
//  What it does:
//    Analyzes video packet sizes, GOP structure, FPS consistency,
//    and container/stream metadata to detect signs of re-encoding
//    or manipulation.
//
//  Key signals:
//    - Bitrate variance: original camera footage is stable;
//      re-encoded video has erratic frame size spikes.
//    - GOP irregularity: editing software breaks the regular
//      I-frame pattern from the original encoder.
//    - FPS mismatch: declared vs observed frame timing divergence.
//    - Metadata completeness: encoder tag, pixel format, codec.
//
//  No AI / no ML. Pure FFprobe packet/frame analysis.
//  Used by forensics.service.js (score fusion).
// -----------------------------------------------------------------

const { execFile } = require("child_process");

// ─── Utilities ────────────────────────────────────────────

const execFileAsync = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(command, args, { maxBuffer: 64 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) { error.stderr = stderr; reject(error); return; }
        resolve({ stdout, stderr });
      }
    );
  });

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
};

const stddev = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2)));
};

const parseFraction = (value) => {
  if (!value || typeof value !== "string") return 0;
  const [n, d] = value.split("/").map(Number);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
};

const round = (value, digits = 3) =>
  Number(Number.isFinite(value) ? value : 0).toFixed(digits) * 1;

// ─── FFprobe helpers ──────────────────────────────────────

const ffprobeJson = async (args) => {
  const { stdout } = await execFileAsync("ffprobe", args, { encoding: "utf8" });
  return JSON.parse(stdout || "{}");
};

/**
 * Probe source file for format + stream info.
 */
const probeSource = (videoPath) =>
  ffprobeJson([
    "-v", "error",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    videoPath,
  ]);

/**
 * Probe packet sizes and flags for the video stream.
 */
const probePackets = (videoPath, analysisWindow) =>
  ffprobeJson([
    "-v", "error",
    "-read_intervals", `0%+${analysisWindow}`,
    "-select_streams", "v:0",
    "-show_entries", "packet=pts_time,size,flags",
    "-of", "json",
    videoPath,
  ]);

/**
 * Probe frame types (I/P/B) and timestamps.
 */
const probeFrames = (videoPath, analysisWindow) =>
  ffprobeJson([
    "-v", "error",
    "-read_intervals", `0%+${analysisWindow}`,
    "-select_streams", "v:0",
    "-show_entries", "frame=best_effort_timestamp_time,pict_type",
    "-of", "json",
    videoPath,
  ]);

// ─── Main analysis ────────────────────────────────────────

/**
 * Analyze compression artifacts and metadata consistency.
 *
 * @param {object} options
 * @param {object} options.sourceInfo  - ffprobe format+streams JSON
 * @param {object} options.packetInfo  - ffprobe packets JSON
 * @param {object} options.frameInfo   - ffprobe frames JSON
 * @returns {object} module report with compressionScore + metadataAnomalyScore
 */
const analyzeCompressionAndMetadata = ({ sourceInfo, packetInfo, frameInfo }) => {
  const format      = sourceInfo.format  || {};
  const streams     = sourceInfo.streams || [];
  const videoStream = streams.find((s) => s.codec_type === "video") || {};
  const audioStream = streams.find((s) => s.codec_type === "audio") || null;
  const packets     = packetInfo.packets || [];
  const frames      = frameInfo.frames   || [];
  const notes       = [];
  const metadataNotes = [];

  // ── Bitrate variance ──────────────────────────────────
  // Original camera footage produces stable packet sizes.
  // Re-encoded or edited video produces erratic spikes.
  const packetSizes = packets.map((p) => Number(p.size || 0)).filter((v) => v > 0);
  const bitrateVariationRatio = packetSizes.length > 1
    ? stddev(packetSizes) / Math.max(average(packetSizes), 1)
    : 0;
  const bitrateVariationScore = clamp((bitrateVariationRatio - 0.35) / 0.9);

  // ── GOP irregularity ──────────────────────────────────
  // Cameras encode regular GOP patterns tied to the hardware.
  // Editing software breaks this regularity when re-muxing.
  const iFrameIndexes = frames
    .map((f, i) => (f.pict_type === "I" ? i : -1))
    .filter((i) => i >= 0);
  const gopIntervals = [];
  for (let i = 1; i < iFrameIndexes.length; i++) {
    gopIntervals.push(iFrameIndexes[i] - iFrameIndexes[i - 1]);
  }
  const gopIrregularityRatio = gopIntervals.length > 1
    ? stddev(gopIntervals) / Math.max(average(gopIntervals), 1)
    : 0;
  const gopIrregularityScore = clamp((gopIrregularityRatio - 0.12) / 0.55);

  // ── FPS consistency ───────────────────────────────────
  const declaredFps = parseFraction(videoStream.avg_frame_rate)
    || parseFraction(videoStream.r_frame_rate)
    || 0;
  const frameTimes = frames
    .map((f) => Number(f.best_effort_timestamp_time))
    .filter((v) => Number.isFinite(v));
  const actualFps = frameTimes.length > 1
    ? (frameTimes.length - 1) / Math.max(frameTimes[frameTimes.length - 1] - frameTimes[0], 0.001)
    : declaredFps;
  const fpsMismatchRatio = declaredFps > 0
    ? Math.abs(declaredFps - actualFps) / declaredFps
    : 0;
  const fpsMismatchScore = clamp((fpsMismatchRatio - 0.03) / 0.2);

  // ── Duration mismatch ─────────────────────────────────
  const formatDuration   = Number(format.duration || 0);
  const streamDuration   = Number(videoStream.duration || formatDuration || 0);
  const durationMismatch = formatDuration > 0
    ? Math.abs(formatDuration - streamDuration) / formatDuration
    : 0;
  const durationScore = clamp((durationMismatch - 0.01) / 0.08);

  const encoderTag = videoStream.tags?.encoder
    || format.tags?.encoder
    || format.tags?.major_brand
    || "";

  // ── Metadata anomaly signals ──────────────────────────
  let metadataWeight = 0;

  if (!encoderTag) {
    metadataWeight += 0.7;
    metadataNotes.push("Encoder tag missing from metadata");
  }
  if (fpsMismatchRatio > 0.05) {
    metadataWeight += 0.8;
    metadataNotes.push("Declared FPS diverges from observed frame timing");
  }
  if (durationMismatch > 0.02) {
    metadataWeight += 0.5;
    metadataNotes.push("Container duration and stream duration are not aligned");
  }
  if (!videoStream.pix_fmt) {
    metadataWeight += 0.3;
    metadataNotes.push("Pixel format is missing from stream metadata");
  }
  if (!videoStream.codec_name || !format.format_name) {
    metadataWeight += 0.3;
    metadataNotes.push("Codec/container metadata is incomplete");
  }

  if (bitrateVariationScore > 0.55)
    notes.push("Bitrate variation unusually high across sampled packets");
  if (gopIrregularityScore > 0.55)
    notes.push("Irregular GOP pattern detected");

  // NOTE: FFmpeg encoder tag is expected in HLS pipelines (TrustStream uses
  // FFmpeg for segmentation). It is informational only — not penalized.
  if (encoderTag && /ffmpeg|lavf|libx264/i.test(encoderTag)) {
    notes.push(
      "Encoder tag indicates FFmpeg pipeline — expected for HLS production; " +
      "elevated only if combined with other anomalies"
    );
  }

  const compressionScore     = clamp(
    bitrateVariationScore * 0.45 +
    gopIrregularityScore  * 0.35 +
    fpsMismatchScore      * 0.10 +
    durationScore         * 0.10
  );
  const metadataAnomalyScore = clamp(metadataWeight / 2.2);

  const suspiciousSignals = [
    bitrateVariationScore > 0.55,
    gopIrregularityScore  > 0.55,
    fpsMismatchRatio      > 0.05,
    metadataWeight        >= 0.8,
  ].filter(Boolean).length;

  return {
    module:                    "compression-metadata",
    compressionScore:          round(compressionScore),
    metadataAnomalyScore:      round(metadataAnomalyScore),
    doubleCompressionSuspected: suspiciousSignals >= 2 || compressionScore > 0.65,
    encodingFingerprint: {
      container:   format.format_name      || null,
      videoCodec:  videoStream.codec_name  || null,
      audioCodec:  audioStream?.codec_name || null,
      pixelFormat: videoStream.pix_fmt     || null,
      declaredFps: round(declaredFps),
      observedFps: round(actualFps),
      encoderTag:  encoderTag              || null,
    },
    metrics: {
      bitrateVariationRatio: round(bitrateVariationRatio),
      gopIrregularityRatio:  round(gopIrregularityRatio),
      fpsMismatchRatio:      round(fpsMismatchRatio),
      durationMismatchRatio: round(durationMismatch),
    },
    notes: [...notes, ...metadataNotes],
  };
};

/**
 * Full probe + analyze pipeline for a single video file.
 * Used when calling this module standalone (not via forensics.service).
 */
const analyzeCompression = async (videoPath, analysisWindow = 60) => {
  const [sourceInfo, packetInfo, frameInfo] = await Promise.all([
    probeSource(videoPath),
    probePackets(videoPath, analysisWindow),
    probeFrames(videoPath, analysisWindow),
  ]);
  return analyzeCompressionAndMetadata({ sourceInfo, packetInfo, frameInfo });
};

module.exports = {
  // Used by forensics.service.js (receives pre-probed data)
  analyzeCompressionAndMetadata,
  // Standalone usage
  analyzeCompression,
  // FFprobe helpers (re-exported so forensics.service can reuse)
  probeSource,
  probePackets,
  probeFrames,
};