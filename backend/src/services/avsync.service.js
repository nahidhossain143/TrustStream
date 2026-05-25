"use strict";

// -----------------------------------------------------------------
//  backend/src/services/avsync.service.js
//
//  Module 3 — Audio-Visual Sync Analysis
//
//  What it does:
//    Compares mouth-region motion in video frames against audio
//    energy peaks to detect temporal drift between speech and
//    facial movement — a signal of dubbed or replaced audio.
//
//  How it works:
//    1. Extract mono audio at 1 kHz → compute RMS energy per 100ms
//       window → produces an "audio energy" time series.
//    2. Extract 160×90 grayscale frames at 10 fps → compute pixel
//       diff in the mouth region (center-lower face) → produces a
//       "mouth motion" time series.
//    3. Compute Pearson correlation between audio and mouth series
//       at lags from −700ms to +700ms (7 × 100ms steps).
//    4. Best-lag correlation = AV sync score. Low score or large
//       offset = dubbed / manipulated audio.
//
//  No AI / no ML. Pure signal processing on FFmpeg output.
//  Used by forensics.service.js (score fusion).
//
//  Key thresholds:
//    avSyncScore < 0.45  → dubbing / replacement suspected
//    |syncOffsetMs| >= 180ms → detectable AV drift
// -----------------------------------------------------------------

"use strict";

const { execFile } = require("child_process");

const FRAME_WIDTH  = 160;
const FRAME_HEIGHT = 90;
const FRAME_SIZE   = FRAME_WIDTH * FRAME_HEIGHT;

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

const round = (value, digits = 3) =>
  Number(Number.isFinite(value) ? value : 0).toFixed(digits) * 1;

const buildSegmentTemplate = (totalSegments) =>
  Array.from({ length: totalSegments }, (_, i) => ({
    segmentIndex: i,
    avSamples:    [],
  }));

// ─── Pearson correlation ──────────────────────────────────

const pearson = (seriesA, seriesB) => {
  const size = Math.min(seriesA.length, seriesB.length);
  if (size < 3) return 0;
  const a = seriesA.slice(0, size), b = seriesB.slice(0, size);
  const meanA = average(a), meanB = average(b);
  const stdA  = stddev(a),  stdB  = stddev(b);
  if (stdA === 0 || stdB === 0) return 0;
  let cov = 0;
  for (let i = 0; i < size; i++) cov += (a[i] - meanA) * (b[i] - meanB);
  return cov / (size * stdA * stdB);
};

/**
 * Correlate two series with a given lag offset.
 * Positive lag = mouthSeries shifted forward (audio leads).
 * Negative lag = audioSeries shifted forward (mouth leads).
 */
const correlateWithLag = (audioSeries, mouthSeries, lag) => {
  const alignedAudio = [], alignedMouth = [];
  if (lag >= 0) {
    for (let i = 0; i + lag < mouthSeries.length && i < audioSeries.length; i++) {
      alignedAudio.push(audioSeries[i]);
      alignedMouth.push(mouthSeries[i + lag]);
    }
  } else {
    const shift = Math.abs(lag);
    for (let i = 0; i < mouthSeries.length && i + shift < audioSeries.length; i++) {
      alignedAudio.push(audioSeries[i + shift]);
      alignedMouth.push(mouthSeries[i]);
    }
  }
  return { correlation: pearson(alignedAudio, alignedMouth), alignedAudio, alignedMouth };
};

// ─── FFmpeg extraction helpers ────────────────────────────

/**
 * Extract mono audio as raw signed 16-bit LE PCM at 1 kHz.
 * Low sample rate is sufficient for energy envelope detection.
 */
const extractMonoAudio = async (videoPath) => {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error",
      "-i", videoPath,
      "-vn", "-ac", "1", "-ar", "1000",
      "-f", "s16le", "pipe:1",
    ],
    { encoding: "buffer" }
  );
  return stdout;
};

/**
 * Extract grayscale frames at 10 fps for mouth motion analysis.
 */
const extractGrayFrames = async (videoPath, fps = 10) => {
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
      "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1",
    ],
    { encoding: "buffer" }
  );
  return stdout;
};

const splitRawFrames = (buffer, frameSize = FRAME_SIZE) => {
  if (!frameSize || buffer.length < frameSize) return [];
  const count  = Math.floor(buffer.length / frameSize);
  const frames = [];
  for (let i = 0; i < count; i++) frames.push(buffer.subarray(i * frameSize, (i + 1) * frameSize));
  return frames;
};

/**
 * Convert raw s16le buffer to normalized float samples [-1, 1].
 */
const normalizePcmSamples = (buffer) => {
  const count   = Math.floor(buffer.length / 2);
  const samples = new Array(count);
  for (let i = 0; i < count; i++) samples[i] = buffer.readInt16LE(i * 2) / 32768;
  return samples;
};

// ─── Main analysis ────────────────────────────────────────

/**
 * Analyze audio-visual sync for a video file.
 *
 * @param {object} options
 * @param {string} options.videoPath
 * @param {object} options.sourceInfo          - ffprobe format+streams JSON
 * @param {number} options.totalSegments
 * @param {number} options.segmentDurationSeconds
 * @returns {Promise<object>} module report with avSyncScore
 */
const analyzeAvSync = async ({
  videoPath,
  sourceInfo,
  totalSegments,
  segmentDurationSeconds,
}) => {
  const audioStream = (sourceInfo.streams || []).find((s) => s.codec_type === "audio");

  // No audio → cannot compute sync; return neutral score
  if (!audioStream) {
    return {
      module:              "audio-visual-sync",
      avSyncScore:         0.5,
      syncOffsetMs:        0,
      dubbedOrManipulated: false,
      correlationScore:    0,
      notes:               ["No audio stream detected — AV sync analysis skipped"],
      segments:            buildSegmentTemplate(totalSegments),
    };
  }

  // Extract audio and mouth-region frames in parallel
  const [audioBuffer, mouthFrameBuffer] = await Promise.all([
    extractMonoAudio(videoPath),
    extractGrayFrames(videoPath, 10),
  ]);

  const pcm         = normalizePcmSamples(audioBuffer);
  const mouthFrames = splitRawFrames(mouthFrameBuffer, FRAME_SIZE);

  if (pcm.length < 200 || mouthFrames.length < 3) {
    return {
      module:              "audio-visual-sync",
      avSyncScore:         0.5,
      syncOffsetMs:        0,
      dubbedOrManipulated: false,
      correlationScore:    0,
      notes:               ["Insufficient audio/video samples for AV sync estimation"],
      segments:            buildSegmentTemplate(totalSegments),
    };
  }

  // ── Audio energy series ───────────────────────────────
  // 100ms windows at 1 kHz = 100 samples per window.
  const windowSize  = 100;
  const audioEnergy = [];
  for (let i = 0; i + windowSize <= pcm.length; i += windowSize) {
    const window = pcm.slice(i, i + windowSize);
    audioEnergy.push(Math.sqrt(average(window.map((s) => s * s))));
  }

  // ── Mouth motion series ───────────────────────────────
  // Centre-lower face region: x ∈ [35%, 65%], y ∈ [55%, 82%].
  // No face detection — heuristic crop that works for frontal news shots.
  const xStart = Math.floor(FRAME_WIDTH  * 0.35);
  const xEnd   = Math.floor(FRAME_WIDTH  * 0.65);
  const yStart = Math.floor(FRAME_HEIGHT * 0.55);
  const yEnd   = Math.floor(FRAME_HEIGHT * 0.82);

  const mouthMotion = [];
  for (let i = 1; i < mouthFrames.length; i++) {
    const prev = mouthFrames[i - 1], curr = mouthFrames[i];
    let diff = 0, count = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const offset = y * FRAME_WIDTH + x;
        diff += Math.abs(curr[offset] - prev[offset]);
        count++;
      }
    }
    mouthMotion.push(count ? diff / count / 255 : 0);
  }

  const size          = Math.min(audioEnergy.length, mouthMotion.length);
  const trimmedAudio  = audioEnergy.slice(0, size);
  const trimmedMouth  = mouthMotion.slice(0, size);

  // ── Best-lag correlation ──────────────────────────────
  // Search ±7 × 100ms = ±700ms window for best alignment.
  let bestLag = 0, bestCorrelation = -1;
  let bestAligned = { alignedAudio: trimmedAudio, alignedMouth: trimmedMouth };

  for (let lag = -7; lag <= 7; lag++) {
    const result = correlateWithLag(trimmedAudio, trimmedMouth, lag);
    if (result.correlation > bestCorrelation) {
      bestCorrelation = result.correlation;
      bestLag         = lag;
      bestAligned     = result;
    }
  }

  const avSyncScore        = clamp(Math.max(bestCorrelation, 0));
  const syncOffsetMs       = bestLag * 100;
  const dubbedOrManipulated = avSyncScore < 0.45 || Math.abs(syncOffsetMs) >= 180;

  const notes = [
    "Mouth motion estimated from center-lower face region (no AI landmarks — heuristic for frontal shots)",
  ];
  if (syncOffsetMs > 120)
    notes.push(`Speech peaks lead mouth motion by ~${syncOffsetMs} ms`);
  else if (syncOffsetMs < -120)
    notes.push(`Mouth motion leads speech by ~${Math.abs(syncOffsetMs)} ms`);
  if (avSyncScore < 0.45)
    notes.push("Low audio-visual alignment confidence — possible audio replacement");

  // ── Per-segment breakdown ─────────────────────────────
  const segmentBuckets    = buildSegmentTemplate(totalSegments);
  const windowsPerSegment = Math.max(1, Math.round(segmentDurationSeconds * 10));

  for (let si = 0; si < totalSegments; si++) {
    const start = si * windowsPerSegment;
    const end   = Math.min(start + windowsPerSegment, size);
    const local = correlateWithLag(trimmedAudio.slice(start, end), trimmedMouth.slice(start, end), bestLag);
    segmentBuckets[si].avSamples.push(
      local.alignedAudio.length >= 5
        ? clamp(Math.max(local.correlation, 0))
        : avSyncScore
    );
  }

  return {
    module:              "audio-visual-sync",
    avSyncScore:         round(avSyncScore),
    syncOffsetMs,
    dubbedOrManipulated,
    correlationScore:    round(bestCorrelation),
    notes,
    segments:            segmentBuckets,
    alignedWindowCount:  bestAligned.alignedAudio.length,
  };
};

/**
 * Full extract + analyze pipeline for standalone usage.
 * Requires ffprobe sourceInfo to detect audio stream presence.
 */
const analyzeAVSync = async (videoPath, sourceInfo, totalSegments, segmentDurationSeconds = 2) =>
  analyzeAvSync({ videoPath, sourceInfo, totalSegments, segmentDurationSeconds });

module.exports = {
  // Used by forensics.service.js (receives pre-probed sourceInfo)
  analyzeAvSync,
  // FFmpeg helpers (re-exported so forensics.service can reuse)
  extractMonoAudio,
  extractGrayFrames,
  splitRawFrames,
  normalizePcmSamples,
  // Standalone usage
  analyzeAVSync,
};