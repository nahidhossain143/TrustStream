"use strict";

const { execFile } = require("child_process");

const ANALYSIS_VERSION        = "ai-free-forensics/v2";   // bumped to match image forensics
const MAX_ANALYSIS_SECONDS    = 60;
const SEGMENT_DURATION_SECONDS = 2;
const FRAME_WIDTH  = 160;
const FRAME_HEIGHT = 90;

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

// Local (windowed) coefficient-of-variation scan: splits `values` into
// overlapping windows and returns the worst single window's CoV, instead of
// one ratio over the whole clip. A manipulation confined to part of a longer
// video shifts one local window sharply without moving the whole-clip
// average enough to cross a global threshold -- the general "local beats
// global for splice localization" principle behind double-compression
// forensics (e.g. Barni & Costanzo's block-based recompression detectors,
// and the wider double-JPEG/double-MPEG detection literature), applied here
// as a plain deterministic sliding-window statistic rather than a trained
// classifier, to stay within the project's AI-free constraint.
const localizedAnomalyRatio = (values, windowSize, stride) => {
  if (values.length < windowSize) return { maxRatio: 0, windowCount: 0 };
  let maxRatio = 0;
  let windowCount = 0;
  for (let start = 0; start + windowSize <= values.length; start += stride) {
    const window = values.slice(start, start + windowSize);
    const mean = average(window);
    const ratio = mean > 0 ? stddev(window) / mean : 0;
    if (ratio > maxRatio) maxRatio = ratio;
    windowCount++;
  }
  return { maxRatio, windowCount };
};

const topQuartileAverage = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const count  = Math.max(1, Math.ceil(sorted.length * 0.25));
  return average(sorted.slice(0, count));
};

const parseFraction = (value) => {
  if (!value || typeof value !== "string") return 0;
  const [n, d] = value.split("/").map(Number);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return 0;
  return n / d;
};

const round = (value, digits = 3) =>
  Number(Number.isFinite(value) ? value : 0).toFixed(digits) * 1;

const labelForScore = (score) => {
  if (score <= 0.3) return "Authentic";
  if (score <= 0.6) return "Suspicious";
  return "Likely Manipulated";
};

const normalizePcmSamples = (buffer) => {
  const sampleCount = Math.floor(buffer.length / 2);
  const samples     = new Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) samples[i] = buffer.readInt16LE(i * 2) / 32768;
  return samples;
};

const splitRawFrames = (buffer, frameSize) => {
  if (!frameSize || buffer.length < frameSize) return [];
  const frameCount = Math.floor(buffer.length / frameSize);
  const frames     = [];
  for (let i = 0; i < frameCount; i++) {
    const start = i * frameSize;
    frames.push(buffer.subarray(start, start + frameSize));
  }
  return frames;
};

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

const buildSegmentTemplate = (totalSegments) =>
  Array.from({ length: totalSegments }, (_, i) => ({
    segmentIndex:   i,
    temporalSamples: [],
    avSamples:      [],
  }));

const sanitizeSegmentReport = (seg) => ({
  segmentIndex:         seg.segmentIndex,
  compressionScore:     round(seg.compressionScore),
  metadataAnomalyScore: round(seg.metadataAnomalyScore),
  temporalAnomalyScore: round(seg.temporalAnomalyScore),
  avSyncScore:          round(seg.avSyncScore),
  syncOffsetMs:         Math.round(seg.syncOffsetMs || 0),
  segmentRiskScore:     round(seg.segmentRiskScore),
  label:                seg.label,
});

// ─── FFprobe / FFmpeg helpers ─────────────────────────────

const ffprobeJson = async (args) => {
  const { stdout } = await execFileAsync("ffprobe", args, { encoding: "utf8" });
  return JSON.parse(stdout || "{}");
};
const ffmpegBuffer = async (args) => {
  const { stdout } = await execFileAsync("ffmpeg", args, { encoding: "buffer" });
  return stdout;
};

const probeSource  = (videoPath) => ffprobeJson(["-v","error","-print_format","json","-show_format","-show_streams", videoPath]);
const probePackets = (videoPath, w) => ffprobeJson(["-v","error","-read_intervals",`0%+${w}`,"-select_streams","v:0","-show_entries","packet=pts_time,size,flags","-of","json", videoPath]);
const probeFrames  = (videoPath, w) => ffprobeJson(["-v","error","-read_intervals",`0%+${w}`,"-select_streams","v:0","-show_entries","frame=best_effort_timestamp_time,pict_type","-of","json", videoPath]);

const extractGrayFrames = (videoPath, fps) => ffmpegBuffer([
  "-hide_banner","-loglevel","error","-i", videoPath,
  "-vf", `fps=${fps},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,format=gray`,
  "-f","rawvideo","-pix_fmt","gray","pipe:1",
]);

const extractMonoAudio = (videoPath) => ffmpegBuffer([
  "-hide_banner","-loglevel","error","-i", videoPath,
  "-vn","-ac","1","-ar","1000","-f","s16le","pipe:1",
]);

// ═════════════════════════════════════════════════════════
//  MODULE 1: COMPRESSION + METADATA
// ═════════════════════════════════════════════════════════

const analyzeCompressionAndMetadata = ({ sourceInfo, packetInfo, frameInfo }) => {
  const format      = sourceInfo.format  || {};
  const streams     = sourceInfo.streams || [];
  const videoStream = streams.find((s) => s.codec_type === "video") || {};
  const audioStream = streams.find((s) => s.codec_type === "audio") || null;
  const packets     = packetInfo.packets || [];
  const frames      = frameInfo.frames   || [];
  const notes       = [];
  const metadataNotes = [];

  // ── Compression signals ───────────────────────────────
  const packetSizes          = packets.map((p) => Number(p.size || 0)).filter((v) => v > 0);
  const bitrateVariationRatio = packetSizes.length > 1 ? stddev(packetSizes) / Math.max(average(packetSizes), 1) : 0;
  const bitrateVariationScore = clamp((bitrateVariationRatio - 0.35) / 0.9);

  // Localized scan: 40-packet windows sliding 20 packets at a time. A window
  // is short enough (well under 1s of video at typical framerates) to
  // isolate a splice boundary instead of averaging it into the whole clip.
  const localBitrate = localizedAnomalyRatio(packetSizes, 40, 20);
  const localBitrateAnomalyScore = clamp((localBitrate.maxRatio - 0.45) / 1.1);

  const iFrameIndexes = frames.map((f, i) => f.pict_type === "I" ? i : -1).filter((i) => i >= 0);
  const gopIntervals  = [];
  for (let i = 1; i < iFrameIndexes.length; i++) gopIntervals.push(iFrameIndexes[i] - iFrameIndexes[i - 1]);
  const gopIrregularityRatio = gopIntervals.length > 1 ? stddev(gopIntervals) / Math.max(average(gopIntervals), 1) : 0;
  const gopIrregularityScore = clamp((gopIrregularityRatio - 0.12) / 0.55);

  const declaredFps = parseFraction(videoStream.avg_frame_rate) || parseFraction(videoStream.r_frame_rate) || 0;
  const frameTimes  = frames.map((f) => Number(f.best_effort_timestamp_time)).filter((v) => Number.isFinite(v));
  const actualFps   = frameTimes.length > 1
    ? (frameTimes.length - 1) / Math.max(frameTimes[frameTimes.length - 1] - frameTimes[0], 0.001)
    : declaredFps;
  const fpsMismatchRatio  = declaredFps > 0 ? Math.abs(declaredFps - actualFps) / declaredFps : 0;
  const fpsMismatchScore  = clamp((fpsMismatchRatio - 0.03) / 0.2);

  const formatDuration    = Number(format.duration  || 0);
  const streamDuration    = Number(videoStream.duration || formatDuration || 0);
  const durationMismatch  = formatDuration > 0 ? Math.abs(formatDuration - streamDuration) / formatDuration : 0;
  const durationScore     = clamp((durationMismatch - 0.01) / 0.08);

  const encoderTag = videoStream.tags?.encoder || format.tags?.encoder || format.tags?.major_brand || "";

  // ── Metadata signals ──────────────────────────────────
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

  if (bitrateVariationScore > 0.55) notes.push("Bitrate variation unusually high across sampled packets");
  if (gopIrregularityScore  > 0.55) notes.push("Irregular GOP pattern detected");
  if (localBitrateAnomalyScore > 0.5 && localBitrateAnomalyScore > bitrateVariationScore + 0.15) {
    notes.push("Localized packet-size spike detected in a short window — possible splice boundary not visible in the whole-clip average");
  }

  // ← FIXED: distinguish TrustStream pipeline (expected) vs suspicious re-encode
  if (encoderTag && /ffmpeg|lavf|libx264/i.test(encoderTag)) {
    notes.push(
      "Encoder tag indicates FFmpeg pipeline — expected for HLS production; " +
      "elevated only if combined with other anomalies"
    );
    // Do NOT add to metadataWeight — TrustStream itself uses FFmpeg; this is not a penalty
  }

  // Whole-clip ratio and worst-local-window ratio each catch a different
  // failure mode (global shift vs. localized splice) -- take whichever is
  // higher rather than averaging them together and diluting either signal.
  const effectiveBitrateScore = Math.max(bitrateVariationScore, localBitrateAnomalyScore);
  const compressionScore    = clamp(effectiveBitrateScore * 0.45 + gopIrregularityScore * 0.35 + fpsMismatchScore * 0.1 + durationScore * 0.1);
  const metadataAnomalyScore = clamp(metadataWeight / 2.2);
  const suspiciousSignals   = [bitrateVariationScore > 0.55, gopIrregularityScore > 0.55, fpsMismatchRatio > 0.05, metadataWeight >= 0.8].filter(Boolean).length;

  return {
    module:                    "compression-metadata",
    compressionScore:          round(compressionScore),
    metadataAnomalyScore:      round(metadataAnomalyScore),
    doubleCompressionSuspected: suspiciousSignals >= 2 || compressionScore > 0.65,
    encodingFingerprint: {
      container:   format.format_name         || null,
      videoCodec:  videoStream.codec_name     || null,
      audioCodec:  audioStream?.codec_name    || null,
      pixelFormat: videoStream.pix_fmt        || null,
      declaredFps: round(declaredFps),
      observedFps: round(actualFps),
      encoderTag:  encoderTag                 || null,
    },
    metrics: {
      bitrateVariationRatio:    round(bitrateVariationRatio),
      localBitrateAnomalyRatio: round(localBitrate.maxRatio),
      localBitrateWindowCount:  localBitrate.windowCount,
      gopIrregularityRatio:     round(gopIrregularityRatio),
      fpsMismatchRatio:         round(fpsMismatchRatio),
      durationMismatchRatio:    round(durationMismatch),
    },
    notes: [...notes, ...metadataNotes],
  };
};

// ═════════════════════════════════════════════════════════
//  MODULE 2: TEMPORAL CONSISTENCY
// ═════════════════════════════════════════════════════════

// Mean Structural Similarity (Wang, Bovik, Sheikh & Simoncelli, "Image
// Quality Assessment: From Error Visibility to Structural Similarity", IEEE
// Trans. Image Processing, 2004). Splits each frame into non-overlapping
// blocks and averages per-block SSIM (the standard MSSIM formulation),
// rather than the module's previous whole-frame mean/edge/texture diffs,
// which discard exactly the local structure SSIM is designed to capture.
// Fully deterministic arithmetic -- no model, no training data.
const SSIM_C1 = (0.01 * 255) ** 2;
const SSIM_C2 = (0.03 * 255) ** 2;

const blockSSIM = (a, b, offsets, blockSize, width) => {
  let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
  const n = blockSize * blockSize;

  for (let y = 0; y < blockSize; y++) {
    const rowOffset = offsets + y * width;
    for (let x = 0; x < blockSize; x++) {
      const pa = a[rowOffset + x], pb = b[rowOffset + x];
      sumA += pa; sumB += pb;
      sumAA += pa * pa; sumBB += pb * pb; sumAB += pa * pb;
    }
  }

  const muA = sumA / n, muB = sumB / n;
  const varA = sumAA / n - muA * muA;
  const varB = sumBB / n - muB * muB;
  const covAB = sumAB / n - muA * muB;

  return (
    ((2 * muA * muB + SSIM_C1) * (2 * covAB + SSIM_C2)) /
    ((muA * muA + muB * muB + SSIM_C1) * (varA + varB + SSIM_C2))
  );
};

const computeMSSIM = (frameA, frameB, width, height, blockSize = 8) => {
  const blocksX = Math.floor(width / blockSize);
  const blocksY = Math.floor(height / blockSize);
  if (blocksX < 1 || blocksY < 1) return 1;

  let total = 0;
  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      total += blockSSIM(frameA, frameB, by * blockSize * width + bx * blockSize, blockSize, width);
    }
  }
  return total / (blocksX * blocksY);
};

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
  return { mean, textureStd: Math.sqrt(Math.max(sqSum / count - mean * mean, 0)), edgeEnergy: edgeSum / (count * 2) };
};

const analyzeTemporalConsistency = ({ frameBuffer, totalSegments, segmentDurationSeconds }) => {
  const rawFrames = splitRawFrames(frameBuffer, FRAME_WIDTH * FRAME_HEIGHT);
  const notes     = [];
  if (rawFrames.length < 3) {
    return {
      module: "temporal-consistency",
      temporalAnomalyScore: 0.5, flickerScore: 0.5,
      boundaryInstabilityScore: 0.5, textureShiftScore: 0.5, motionDisruptionScore: 0.5,
      notes: ["Not enough frames were available for temporal analysis"],
      segments: buildSegmentTemplate(totalSegments),
    };
  }

  const fps = 3;
  const segmentBuckets = buildSegmentTemplate(totalSegments);
  const flickers = [], boundaryDiffs = [], textureShifts = [], motionDiffs = [], ssimValues = [], sceneCutTimes = [];
  let previousStats = computeFrameStats(rawFrames[0]);

  for (let i = 1; i < rawFrames.length; i++) {
    const currentStats = computeFrameStats(rawFrames[i]);
    const prev = rawFrames[i - 1], curr = rawFrames[i];
    let diffSum = 0;
    for (let p = 0; p < curr.length; p++) diffSum += Math.abs(curr[p] - prev[p]);

    const motionDiff  = diffSum / curr.length / 255;
    const flicker     = Math.abs(currentStats.mean - previousStats.mean) / 255;
    const boundaryDiff = Math.abs(currentStats.edgeEnergy - previousStats.edgeEnergy) / 64;
    const textureShift = Math.abs(currentStats.textureStd - previousStats.textureStd) / 64;
    const ssim         = computeMSSIM(prev, curr, FRAME_WIDTH, FRAME_HEIGHT);
    // Adjacent frames of real motion typically keep MSSIM well above 0.85;
    // a genuine cut/splice drops it sharply. Not yet calibrated against a
    // labeled dataset -- see the calibration caveat in the README.
    const ssimAnomaly  = clamp((0.85 - ssim) / 0.5);
    const timeSeconds  = i / fps;
    const segmentIndex = Math.min(totalSegments - 1, Math.max(0, Math.floor(timeSeconds / segmentDurationSeconds)));

    flickers.push(flicker); boundaryDiffs.push(boundaryDiff);
    textureShifts.push(textureShift); motionDiffs.push(motionDiff); ssimValues.push(ssim);
    segmentBuckets[segmentIndex].temporalSamples.push(
      clamp(motionDiff * 0.30 + flicker * 0.15 + boundaryDiff * 0.15 + textureShift * 0.10 + ssimAnomaly * 0.30)
    );
    if (motionDiff > 0.23 || ssimAnomaly > 0.6) sceneCutTimes.push(round(timeSeconds, 2));
    previousStats = currentStats;
  }

  const flickerScore            = clamp(topQuartileAverage(flickers)      / 0.12);
  const boundaryInstabilityScore = clamp(topQuartileAverage(boundaryDiffs) / 0.18);
  const textureShiftScore       = clamp(topQuartileAverage(textureShifts)  / 0.16);
  const motionDisruptionScore   = clamp(stddev(motionDiffs)                / 0.08);
  // Worst-case (top-quartile) SSIM drop, mirroring how the other per-frame
  // signals above are aggregated -- a few genuinely bad frame pairs should
  // register even if most of the clip is stable.
  const ssimAnomalyScore = clamp(topQuartileAverage(ssimValues.map((s) => clamp((0.85 - s) / 0.5))));
  const temporalAnomalyScore = clamp(
    ssimAnomalyScore * 0.35 + flickerScore * 0.20 + boundaryInstabilityScore * 0.20 +
    textureShiftScore * 0.10 + motionDisruptionScore * 0.15
  );

  if (temporalAnomalyScore > 0.55) notes.push("Visible frame-to-frame instability detected in sampled frames");
  if (sceneCutTimes.length > 2)    notes.push("Abrupt temporal transitions suggest possible splicing or hidden edits");
  if (textureShiftScore > 0.55)    notes.push("Abrupt temporal texture changes detected");
  if (ssimAnomalyScore > 0.55)     notes.push("Structural similarity (SSIM) between consecutive frames drops sharply at points in this clip");

  return {
    module: "temporal-consistency",
    temporalAnomalyScore:     round(temporalAnomalyScore),
    ssimAnomalyScore:         round(ssimAnomalyScore),
    flickerScore:             round(flickerScore),
    boundaryInstabilityScore: round(boundaryInstabilityScore),
    textureShiftScore:        round(textureShiftScore),
    motionDisruptionScore:    round(motionDisruptionScore),
    meanSSIM:                 round(ssimValues.length ? average(ssimValues) : 1),
    notes, sceneCutTimes,
    segments: segmentBuckets,
  };
};

// ═════════════════════════════════════════════════════════
//  MODULE 3: AV SYNC
// ═════════════════════════════════════════════════════════

const correlateWithLag = (audioSeries, mouthSeries, lag) => {
  const alignedAudio = [], alignedMouth = [];
  if (lag >= 0) {
    for (let i = 0; i + lag < mouthSeries.length && i < audioSeries.length; i++) {
      alignedAudio.push(audioSeries[i]); alignedMouth.push(mouthSeries[i + lag]);
    }
  } else {
    const shift = Math.abs(lag);
    for (let i = 0; i < mouthSeries.length && i + shift < audioSeries.length; i++) {
      alignedAudio.push(audioSeries[i + shift]); alignedMouth.push(mouthSeries[i]);
    }
  }
  return { correlation: pearson(alignedAudio, alignedMouth), alignedAudio, alignedMouth };
};

const analyzeAvSync = async ({ videoPath, sourceInfo, totalSegments, segmentDurationSeconds }) => {
  const audioStream = (sourceInfo.streams || []).find((s) => s.codec_type === "audio");
  if (!audioStream) {
    return {
      module: "audio-visual-sync", avSyncScore: 0.5, syncOffsetMs: 0,
      dubbedOrManipulated: false, correlationScore: 0,
      notes: ["No audio stream detected — AV sync analysis skipped"],
      segments: buildSegmentTemplate(totalSegments),
    };
  }

  const [audioBuffer, mouthFrameBuffer] = await Promise.all([
    extractMonoAudio(videoPath),
    extractGrayFrames(videoPath, 10),
  ]);

  const pcm        = normalizePcmSamples(audioBuffer);
  const mouthFrames = splitRawFrames(mouthFrameBuffer, FRAME_WIDTH * FRAME_HEIGHT);

  if (pcm.length < 200 || mouthFrames.length < 3) {
    return {
      module: "audio-visual-sync", avSyncScore: 0.5, syncOffsetMs: 0,
      dubbedOrManipulated: false, correlationScore: 0,
      notes: ["Insufficient audio/video samples for AV sync estimation"],
      segments: buildSegmentTemplate(totalSegments),
    };
  }

  const windowSize = 100;
  const audioEnergy = [];
  for (let i = 0; i + windowSize <= pcm.length; i += windowSize) {
    const window = pcm.slice(i, i + windowSize);
    audioEnergy.push(Math.sqrt(average(window.map((s) => s * s))));
  }

  const mouthMotion = [];
  const xStart = Math.floor(FRAME_WIDTH * 0.35),  xEnd = Math.floor(FRAME_WIDTH * 0.65);
  const yStart = Math.floor(FRAME_HEIGHT * 0.55), yEnd = Math.floor(FRAME_HEIGHT * 0.82);

  for (let i = 1; i < mouthFrames.length; i++) {
    const prev = mouthFrames[i - 1], curr = mouthFrames[i];
    let diff = 0, count = 0;
    for (let y = yStart; y < yEnd; y++) {
      for (let x = xStart; x < xEnd; x++) {
        const offset = y * FRAME_WIDTH + x;
        diff += Math.abs(curr[offset] - prev[offset]); count++;
      }
    }
    mouthMotion.push(count ? diff / count / 255 : 0);
  }

  const size = Math.min(audioEnergy.length, mouthMotion.length);
  const trimmedAudio = audioEnergy.slice(0, size);
  const trimmedMouth = mouthMotion.slice(0, size);

  let bestLag = 0, bestCorrelation = -1, bestAligned = { alignedAudio: trimmedAudio, alignedMouth: trimmedMouth };
  for (let lag = -7; lag <= 7; lag++) {
    const result = correlateWithLag(trimmedAudio, trimmedMouth, lag);
    if (result.correlation > bestCorrelation) {
      bestCorrelation = result.correlation; bestLag = lag; bestAligned = result;
    }
  }

  const avSyncScore        = clamp(Math.max(bestCorrelation, 0));
  const syncOffsetMs       = bestLag * 100;
  const dubbedOrManipulated = avSyncScore < 0.45 || Math.abs(syncOffsetMs) >= 180;
  const notes = ["Mouth motion estimated from center-lower face region (no AI landmarks)"];

  if (syncOffsetMs > 120) notes.push(`Speech peaks lead mouth motion by ~${syncOffsetMs} ms`);
  else if (syncOffsetMs < -120) notes.push(`Mouth motion leads speech by ~${Math.abs(syncOffsetMs)} ms`);
  if (avSyncScore < 0.45) notes.push("Low audio-visual alignment confidence");

  const segmentBuckets     = buildSegmentTemplate(totalSegments);
  const windowsPerSegment  = Math.max(1, Math.round(segmentDurationSeconds * 10));

  for (let si = 0; si < totalSegments; si++) {
    const start = si * windowsPerSegment, end = Math.min(start + windowsPerSegment, trimmedAudio.length);
    const local = correlateWithLag(trimmedAudio.slice(start, end), trimmedMouth.slice(start, end), bestLag);
    segmentBuckets[si].avSamples.push(local.alignedAudio.length >= 5 ? clamp(Math.max(local.correlation, 0)) : avSyncScore);
  }

  return {
    module: "audio-visual-sync",
    avSyncScore:         round(avSyncScore),
    syncOffsetMs,
    dubbedOrManipulated,
    correlationScore:    round(bestCorrelation),
    notes, segments: segmentBuckets,
    alignedWindowCount:  bestAligned.alignedAudio.length,
  };
};

// ═════════════════════════════════════════════════════════
//  SEGMENT MERGER
// ═════════════════════════════════════════════════════════

const mergeSegmentSignals = ({ totalSegments, compressionScore, metadataAnomalyScore, syncOffsetMs, temporalSegments, avSegments, fallbackAvSyncScore }) => {
  const segments = [];
  for (let si = 0; si < totalSegments; si++) {
    const tBucket = temporalSegments[si] || { temporalSamples: [] };
    const aBucket = avSegments[si]       || { avSamples: [] };
    const temporalAnomalyScore = tBucket.temporalSamples.length ? average(tBucket.temporalSamples) : 0.5;
    const avSyncScore          = aBucket.avSamples.length       ? average(aBucket.avSamples)       : fallbackAvSyncScore;

    // Thesis formula: 0.35*C + 0.20*M + 0.25*T + 0.20*(1-AV)
    const segmentRiskScore = clamp(
      0.35 * compressionScore +
      0.20 * metadataAnomalyScore +
      0.25 * temporalAnomalyScore +
      0.20 * (1 - avSyncScore)
    );
    segments.push({ segmentIndex: si, compressionScore, metadataAnomalyScore, temporalAnomalyScore, avSyncScore, syncOffsetMs, segmentRiskScore, label: labelForScore(segmentRiskScore) });
  }
  return segments;
};

// ═════════════════════════════════════════════════════════
//  RISK SCORE: WEIGHTED AVERAGE  ← IMPROVED
//  Simple average understates peak risks. We use:
//    videoRiskScore = 0.60 × average + 0.40 × peak
//  This means a single heavily-tampered segment raises the
//  overall score meaningfully without dominating the result.
// ═════════════════════════════════════════════════════════

const computeVideoRiskScore = (segments) => {
  if (!segments.length) return 0;
  const scores = segments.map((s) => s.segmentRiskScore);
  const avg    = average(scores);
  const peak   = Math.max(...scores);
  return round(clamp(0.60 * avg + 0.40 * peak));
};

// ═════════════════════════════════════════════════════════
//  PUBLIC ENTRYPOINT
// ═════════════════════════════════════════════════════════

const analyzeVideoForensics = async ({
  videoId,
  videoPath,
  title,
  totalSegments,
  segmentDurationSeconds = SEGMENT_DURATION_SECONDS,
}) => {
  const sourceInfo    = await probeSource(videoPath);
  const formatDuration = Number(sourceInfo.format?.duration || 0);
  const analysisWindow = Math.max(2, Math.min(MAX_ANALYSIS_SECONDS, Math.ceil(formatDuration || MAX_ANALYSIS_SECONDS)));

  const [packetInfo, frameInfo, temporalFrameBuffer, avSync] = await Promise.all([
    probePackets(videoPath, analysisWindow),
    probeFrames(videoPath,  analysisWindow),
    extractGrayFrames(videoPath, 3),
    analyzeAvSync({ videoPath, sourceInfo, totalSegments, segmentDurationSeconds }),
  ]);

  const compressionMetadata = analyzeCompressionAndMetadata({ sourceInfo, packetInfo, frameInfo });
  const temporal            = analyzeTemporalConsistency({ frameBuffer: temporalFrameBuffer, totalSegments, segmentDurationSeconds });

  const segments = mergeSegmentSignals({
    totalSegments,
    compressionScore:     compressionMetadata.compressionScore,
    metadataAnomalyScore: compressionMetadata.metadataAnomalyScore,
    syncOffsetMs:         avSync.syncOffsetMs,
    temporalSegments:     temporal.segments,
    avSegments:           avSync.segments,
    fallbackAvSyncScore:  avSync.avSyncScore,
  });

  // ← IMPROVED: weighted average(60%) + peak(40%) so a bad segment matters
  const videoRiskScore = computeVideoRiskScore(segments);
  const peakRiskScore  = round(Math.max(...segments.map((s) => s.segmentRiskScore)));
  const finalLabel     = labelForScore(videoRiskScore);

  return {
    // ── Identity ────────────────────────────────────────
    mediaType:        "video",                 // ← NEW: consistent with image forensics
    videoId,
    title,
    analysisVersion:  ANALYSIS_VERSION,
    analysisTimestamp: new Date().toISOString(),

    // ── Timing ──────────────────────────────────────────
    analysisWindowSeconds:   analysisWindow,
    sampledDurationSeconds:  round(Math.min(formatDuration || analysisWindow, analysisWindow)),
    sourceDurationSeconds:   round(formatDuration),
    totalSegments,

    // ── Module outputs ───────────────────────────────────
    modules: {
      compression: compressionMetadata,
      temporal,
      avSync,
    },

    // ── Segment results ──────────────────────────────────
    segments:         segments.map(sanitizeSegmentReport),
    notableSegments:  segments
      .filter((s) => s.segmentRiskScore >= 0.5)
      .sort((a, b) => b.segmentRiskScore - a.segmentRiskScore)
      .slice(0, 3)
      .map(sanitizeSegmentReport),

    // ── Top-level scalars ← NEW (mirrors image forensics) ─
    videoRiskScore,
    peakRiskScore,           // worst single segment — useful for display
    compressionScore:  compressionMetadata.compressionScore,
    metadataScore:     compressionMetadata.metadataAnomalyScore,
    temporalScore:     round(average(segments.map((s) => s.temporalAnomalyScore))),
    avSyncScore:       avSync.avSyncScore,

    // ── Verdict ──────────────────────────────────────────
    finalLabel,

    // ── Formula (for display / thesis) ← NEW ─────────────
    formula: "risk = 0.35×Compression + 0.20×Metadata + 0.25×Temporal + 0.20×(1-AVSync)",
    scoring: {
      method: "weighted_average_plus_peak",
      detail: "videoRiskScore = 0.60 × segmentAverage + 0.40 × peakSegment",
    },

    notes: [
      ...compressionMetadata.notes,
      ...temporal.notes,
      ...avSync.notes,
      analysisWindow < formatDuration
        ? `Analysis sampled the first ${analysisWindow}s for responsiveness (full duration: ${round(formatDuration)}s)`
        : null,
    ].filter(Boolean),

    limitations: [
      "Scores are forensic indicators, not proof of deepfake generation.",
      "AV sync assumes the primary speaker is near the center of the frame.",
      "Compression metrics rely on sampled packets; less stable on clips under 5s.",
      "FFmpeg encoder tag is expected in HLS production pipelines; it is not penalized.",
    ],
  };
};

module.exports = {
  ANALYSIS_VERSION,
  analyzeVideoForensics,
  labelForScore,
};