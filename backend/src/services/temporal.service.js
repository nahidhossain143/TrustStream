"use strict";

// -----------------------------------------------------------------
//  backend/src/services/temporal.service.js
//
//  Module 2 — Temporal Consistency Analysis
//
//  What it does:
//    Extracts low-resolution grayscale frames via FFmpeg and
//    analyzes pixel-level differences between consecutive frames
//    to detect abrupt discontinuities, flicker, and texture shifts.
//
//  Key signals:
//    - Flicker: sudden mean brightness change between frames.
//      Natural video transitions smoothly; spliced footage jumps.
//    - Boundary instability: edge energy change between frames.
//      Indicates structural content discontinuity.
//    - Texture shift: variance change between frames.
//      Abrupt texture shifts suggest frame substitution.
//    - Motion disruption: high standard deviation in motion diffs
//      across the clip indicates unnatural motion pattern.
//    - Scene cuts: frames where motion diff > threshold,
//      used to count potential splice points.
//
//  No AI / no ML. Pure pixel arithmetic on FFmpeg rawvideo output.
//  Used by forensics.service.js (score fusion).
// -----------------------------------------------------------------

const { execFile } = require("child_process");

const FRAME_WIDTH  = 160;
const FRAME_HEIGHT = 90;
const FRAME_SIZE   = FRAME_WIDTH * FRAME_HEIGHT; // bytes per gray frame

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

const topQuartileAverage = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const count  = Math.max(1, Math.ceil(sorted.length * 0.25));
  return average(sorted.slice(0, count));
};

const round = (value, digits = 3) =>
  Number(Number.isFinite(value) ? value : 0).toFixed(digits) * 1;

const buildSegmentTemplate = (totalSegments) =>
  Array.from({ length: totalSegments }, (_, i) => ({
    segmentIndex:    i,
    temporalSamples: [],
  }));

// ─── Frame extraction ─────────────────────────────────────

/**
 * Extract grayscale frames at given FPS into a raw Buffer.
 * Returns Buffer of (frameCount × FRAME_SIZE) bytes.
 */
const extractGrayFrames = async (videoPath, fps = 3) => {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-i", videoPath,
      "-vf",
      `fps=${fps},` +
      `scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,` +
      `pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,` +
      `format=gray`,
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "pipe:1",
    ],
    { encoding: "buffer" }
  );
  return stdout;
};

/**
 * Split a raw frame Buffer into array of per-frame Buffers.
 */
const splitRawFrames = (buffer, frameSize = FRAME_SIZE) => {
  if (!frameSize || buffer.length < frameSize) return [];
  const frameCount = Math.floor(buffer.length / frameSize);
  const frames     = [];
  for (let i = 0; i < frameCount; i++) {
    frames.push(buffer.subarray(i * frameSize, (i + 1) * frameSize));
  }
  return frames;
};

// ─── Per-frame stats ──────────────────────────────────────

/**
 * Compute mean brightness, texture std dev, and edge energy
 * for a single grayscale frame buffer.
 */
const computeFrameStats = (frameBuffer) => {
  let sum = 0, sqSum = 0, edgeSum = 0;
  for (let y = 0; y < FRAME_HEIGHT; y++) {
    for (let x = 0; x < FRAME_WIDTH; x++) {
      const idx   = y * FRAME_WIDTH + x;
      const pixel = frameBuffer[idx];
      sum   += pixel;
      sqSum += pixel * pixel;
      if (x > 0) edgeSum += Math.abs(pixel - frameBuffer[idx - 1]);
      if (y > 0) edgeSum += Math.abs(pixel - frameBuffer[idx - FRAME_WIDTH]);
    }
  }
  const count = FRAME_WIDTH * FRAME_HEIGHT;
  const mean  = sum / count;
  return {
    mean,
    textureStd:  Math.sqrt(Math.max(sqSum / count - mean * mean, 0)),
    edgeEnergy:  edgeSum / (count * 2),
  };
};

// ─── Main analysis ────────────────────────────────────────

/**
 * Analyze temporal consistency from a raw frame Buffer.
 *
 * @param {object} options
 * @param {Buffer} options.frameBuffer          - raw grayscale frame data
 * @param {number} options.totalSegments        - number of HLS segments
 * @param {number} options.segmentDurationSeconds
 * @returns {object} module report with temporalAnomalyScore
 */
const analyzeTemporalConsistency = ({ frameBuffer, totalSegments, segmentDurationSeconds }) => {
  const rawFrames = splitRawFrames(frameBuffer, FRAME_SIZE);
  const notes     = [];

  if (rawFrames.length < 3) {
    return {
      module:                   "temporal-consistency",
      temporalAnomalyScore:     0.5,
      flickerScore:             0.5,
      boundaryInstabilityScore: 0.5,
      textureShiftScore:        0.5,
      motionDisruptionScore:    0.5,
      notes: ["Not enough frames were available for temporal analysis"],
      segments: buildSegmentTemplate(totalSegments),
    };
  }

  // Frames extracted at 3 fps
  const fps            = 3;
  const segmentBuckets = buildSegmentTemplate(totalSegments);
  const flickers       = [];
  const boundaryDiffs  = [];
  const textureShifts  = [];
  const motionDiffs    = [];
  const sceneCutTimes  = [];

  let previousStats = computeFrameStats(rawFrames[0]);

  for (let i = 1; i < rawFrames.length; i++) {
    const currentStats = computeFrameStats(rawFrames[i]);
    const prev         = rawFrames[i - 1];
    const curr         = rawFrames[i];

    // Pixel-level motion diff (MAE over all pixels)
    let diffSum = 0;
    for (let p = 0; p < curr.length; p++) diffSum += Math.abs(curr[p] - prev[p]);
    const motionDiff   = diffSum / curr.length / 255;

    // Brightness flicker
    const flicker      = Math.abs(currentStats.mean - previousStats.mean) / 255;

    // Edge energy change (structural boundary shift)
    const boundaryDiff = Math.abs(currentStats.edgeEnergy - previousStats.edgeEnergy) / 64;

    // Texture variance shift
    const textureShift = Math.abs(currentStats.textureStd - previousStats.textureStd) / 64;

    const timeSeconds  = i / fps;
    const segmentIndex = Math.min(
      totalSegments - 1,
      Math.max(0, Math.floor(timeSeconds / segmentDurationSeconds))
    );

    flickers.push(flicker);
    boundaryDiffs.push(boundaryDiff);
    textureShifts.push(textureShift);
    motionDiffs.push(motionDiff);

    // Per-segment temporal sample (weighted combo of signals)
    segmentBuckets[segmentIndex].temporalSamples.push(
      clamp(motionDiff * 0.45 + flicker * 0.20 + boundaryDiff * 0.20 + textureShift * 0.15)
    );

    // Scene cut detection: abrupt motion spike = potential splice point
    if (motionDiff > 0.23) sceneCutTimes.push(round(timeSeconds, 2));

    previousStats = currentStats;
  }

  // Use top-quartile averages so a single bad frame matters
  const flickerScore             = clamp(topQuartileAverage(flickers)      / 0.12);
  const boundaryInstabilityScore = clamp(topQuartileAverage(boundaryDiffs)  / 0.18);
  const textureShiftScore        = clamp(topQuartileAverage(textureShifts)  / 0.16);
  const motionDisruptionScore    = clamp(stddev(motionDiffs)                / 0.08);

  const temporalAnomalyScore = clamp(
    flickerScore             * 0.30 +
    boundaryInstabilityScore * 0.30 +
    textureShiftScore        * 0.20 +
    motionDisruptionScore    * 0.20
  );

  if (temporalAnomalyScore > 0.55)
    notes.push("Visible frame-to-frame instability detected in sampled frames");
  if (sceneCutTimes.length > 2)
    notes.push("Abrupt temporal transitions suggest possible splicing or hidden edits");
  if (textureShiftScore > 0.55)
    notes.push("Abrupt temporal texture changes detected");

  return {
    module:                   "temporal-consistency",
    temporalAnomalyScore:     round(temporalAnomalyScore),
    flickerScore:             round(flickerScore),
    boundaryInstabilityScore: round(boundaryInstabilityScore),
    textureShiftScore:        round(textureShiftScore),
    motionDisruptionScore:    round(motionDisruptionScore),
    notes,
    sceneCutTimes,
    segments: segmentBuckets,
  };
};

/**
 * Full extract + analyze pipeline for standalone usage.
 */
const analyzeTemporal = async (videoPath, totalSegments, segmentDurationSeconds = 2) => {
  const frameBuffer = await extractGrayFrames(videoPath, 3);
  return analyzeTemporalConsistency({ frameBuffer, totalSegments, segmentDurationSeconds });
};

module.exports = {
  // Used by forensics.service.js (receives pre-extracted frame buffer)
  analyzeTemporalConsistency,
  // FFmpeg helper (re-exported so forensics.service can reuse)
  extractGrayFrames,
  splitRawFrames,
  // Standalone usage
  analyzeTemporal,
};