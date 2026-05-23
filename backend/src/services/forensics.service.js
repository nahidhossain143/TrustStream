const { execFile } = require("child_process");

const ANALYSIS_VERSION = "ai-free-forensics/v1";
const MAX_ANALYSIS_SECONDS = 60;
const SEGMENT_DURATION_SECONDS = 2;
const FRAME_WIDTH = 160;
const FRAME_HEIGHT = 90;

const execFileAsync = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        maxBuffer: 64 * 1024 * 1024,
        ...options,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(error);
          return;
        }

        resolve({ stdout, stderr });
      }
    );
  });

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));

const average = (values) => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const stddev = (values) => {
  if (values.length < 2) return 0;
  const mean = average(values);
  const variance = average(values.map((value) => (value - mean) ** 2));
  return Math.sqrt(variance);
};

const topQuartileAverage = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => b - a);
  const count = Math.max(1, Math.ceil(sorted.length * 0.25));
  return average(sorted.slice(0, count));
};

const parseFraction = (value) => {
  if (!value || typeof value !== "string") return 0;
  const [numerator, denominator] = value.split("/").map(Number);

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return 0;
  }

  return numerator / denominator;
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
  const samples = new Array(sampleCount);

  for (let index = 0; index < sampleCount; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2) / 32768;
  }

  return samples;
};

const splitRawFrames = (buffer, frameSize) => {
  if (!frameSize || buffer.length < frameSize) {
    return [];
  }

  const frameCount = Math.floor(buffer.length / frameSize);
  const frames = [];

  for (let index = 0; index < frameCount; index += 1) {
    const start = index * frameSize;
    frames.push(buffer.subarray(start, start + frameSize));
  }

  return frames;
};

const pearson = (seriesA, seriesB) => {
  const size = Math.min(seriesA.length, seriesB.length);
  if (size < 3) return 0;

  const a = seriesA.slice(0, size);
  const b = seriesB.slice(0, size);
  const meanA = average(a);
  const meanB = average(b);
  const stdA = stddev(a);
  const stdB = stddev(b);

  if (stdA === 0 || stdB === 0) {
    return 0;
  }

  let covariance = 0;
  for (let index = 0; index < size; index += 1) {
    covariance += (a[index] - meanA) * (b[index] - meanB);
  }

  return covariance / (size * stdA * stdB);
};

const buildSegmentTemplate = (totalSegments) =>
  Array.from({ length: totalSegments }, (_, index) => ({
    segmentIndex: index,
    temporalSamples: [],
    avSamples: [],
  }));

const sanitizeSegmentReport = (segment) => ({
  segmentIndex: segment.segmentIndex,
  compressionScore: round(segment.compressionScore),
  metadataAnomalyScore: round(segment.metadataAnomalyScore),
  temporalAnomalyScore: round(segment.temporalAnomalyScore),
  avSyncScore: round(segment.avSyncScore),
  syncOffsetMs: Math.round(segment.syncOffsetMs || 0),
  segmentRiskScore: round(segment.segmentRiskScore),
  label: segment.label,
});

const ffprobeJson = async (args) => {
  const { stdout } = await execFileAsync("ffprobe", args, { encoding: "utf8" });
  return JSON.parse(stdout || "{}");
};

const ffmpegBuffer = async (args) => {
  const { stdout } = await execFileAsync("ffmpeg", args, { encoding: "buffer" });
  return stdout;
};

const probeSource = async (videoPath) =>
  ffprobeJson([
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath,
  ]);

const probePackets = async (videoPath, analysisWindow) =>
  ffprobeJson([
    "-v",
    "error",
    "-read_intervals",
    `0%+${analysisWindow}`,
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time,size,flags",
    "-of",
    "json",
    videoPath,
  ]);

const probeFrames = async (videoPath, analysisWindow) =>
  ffprobeJson([
    "-v",
    "error",
    "-read_intervals",
    `0%+${analysisWindow}`,
    "-select_streams",
    "v:0",
    "-show_entries",
    "frame=best_effort_timestamp_time,pict_type",
    "-of",
    "json",
    videoPath,
  ]);

const extractGrayFrames = async (videoPath, fps) =>
  ffmpegBuffer([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-vf",
    `fps=${fps},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=decrease,pad=${FRAME_WIDTH}:${FRAME_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,format=gray`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "pipe:1",
  ]);

const extractMonoAudio = async (videoPath) =>
  ffmpegBuffer([
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    videoPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "1000",
    "-f",
    "s16le",
    "pipe:1",
  ]);

const analyzeCompressionAndMetadata = ({ sourceInfo, packetInfo, frameInfo }) => {
  const format = sourceInfo.format || {};
  const streams = sourceInfo.streams || [];
  const videoStream = streams.find((stream) => stream.codec_type === "video") || {};
  const audioStream = streams.find((stream) => stream.codec_type === "audio") || null;
  const packets = packetInfo.packets || [];
  const frames = frameInfo.frames || [];
  const notes = [];
  const metadataNotes = [];

  const packetSizes = packets
    .map((packet) => Number(packet.size || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const bitrateVariationRatio =
    packetSizes.length > 1 ? stddev(packetSizes) / Math.max(average(packetSizes), 1) : 0;
  const bitrateVariationScore = clamp((bitrateVariationRatio - 0.35) / 0.9);

  const iFrameIndexes = frames
    .map((frame, index) => (frame.pict_type === "I" ? index : -1))
    .filter((index) => index >= 0);
  const gopIntervals = [];
  for (let index = 1; index < iFrameIndexes.length; index += 1) {
    gopIntervals.push(iFrameIndexes[index] - iFrameIndexes[index - 1]);
  }
  const gopIrregularityRatio =
    gopIntervals.length > 1 ? stddev(gopIntervals) / Math.max(average(gopIntervals), 1) : 0;
  const gopIrregularityScore = clamp((gopIrregularityRatio - 0.12) / 0.55);

  const declaredFps =
    parseFraction(videoStream.avg_frame_rate) ||
    parseFraction(videoStream.r_frame_rate) ||
    0;
  const frameTimes = frames
    .map((frame) => Number(frame.best_effort_timestamp_time))
    .filter((value) => Number.isFinite(value));
  const actualFps =
    frameTimes.length > 1
      ? (frameTimes.length - 1) /
        Math.max(frameTimes[frameTimes.length - 1] - frameTimes[0], 0.001)
      : declaredFps;
  const fpsMismatchRatio =
    declaredFps > 0 ? Math.abs(declaredFps - actualFps) / declaredFps : 0;
  const fpsMismatchScore = clamp((fpsMismatchRatio - 0.03) / 0.2);

  const formatDuration = Number(format.duration || 0);
  const streamDuration = Number(videoStream.duration || formatDuration || 0);
  const durationMismatchRatio =
    formatDuration > 0
      ? Math.abs(formatDuration - streamDuration) / formatDuration
      : 0;
  const durationMismatchScore = clamp((durationMismatchRatio - 0.01) / 0.08);

  const encoderTag =
    videoStream.tags?.encoder ||
    format.tags?.encoder ||
    format.tags?.major_brand ||
    "";

  let metadataWeight = 0;
  if (!encoderTag) {
    metadataWeight += 0.7;
    metadataNotes.push("Encoder tag missing from metadata");
  }
  if (fpsMismatchRatio > 0.05) {
    metadataWeight += 0.8;
    metadataNotes.push("Declared FPS diverges from observed frame timing");
  }
  if (durationMismatchRatio > 0.02) {
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

  if (bitrateVariationScore > 0.55) {
    notes.push("Bitrate variation unusually high across sampled packets");
  }
  if (gopIrregularityScore > 0.55) {
    notes.push("Irregular GOP pattern detected");
  }
  if (encoderTag && /ffmpeg|lavf|libx264/i.test(encoderTag)) {
    notes.push("Encoder tag suggests the file passed through a software re-encode pipeline");
  }

  const compressionScore = clamp(
    bitrateVariationScore * 0.45 +
      gopIrregularityScore * 0.35 +
      fpsMismatchScore * 0.1 +
      durationMismatchScore * 0.1
  );

  const metadataAnomalyScore = clamp(metadataWeight / 2.2);
  const suspiciousSignals = [
    bitrateVariationScore > 0.55,
    gopIrregularityScore > 0.55,
    fpsMismatchRatio > 0.05,
    metadataWeight >= 0.8,
  ].filter(Boolean).length;

  return {
    module: "compression-metadata",
    compressionScore: round(compressionScore),
    doubleCompressionSuspected: suspiciousSignals >= 2 || compressionScore > 0.65,
    metadataAnomalyScore: round(metadataAnomalyScore),
    encodingFingerprint: {
      container: format.format_name || null,
      videoCodec: videoStream.codec_name || null,
      audioCodec: audioStream?.codec_name || null,
      pixelFormat: videoStream.pix_fmt || null,
      declaredFps: round(declaredFps),
      observedFps: round(actualFps),
      encoderTag: encoderTag || null,
    },
    metrics: {
      bitrateVariationRatio: round(bitrateVariationRatio),
      gopIrregularityRatio: round(gopIrregularityRatio),
      fpsMismatchRatio: round(fpsMismatchRatio),
      durationMismatchRatio: round(durationMismatchRatio),
    },
    notes: [...notes, ...metadataNotes],
  };
};

const computeFrameStats = (frameBuffer) => {
  let sum = 0;
  let sqSum = 0;
  let edgeSum = 0;

  for (let y = 0; y < FRAME_HEIGHT; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const index = y * FRAME_WIDTH + x;
      const pixel = frameBuffer[index];
      sum += pixel;
      sqSum += pixel * pixel;

      if (x > 0) {
        edgeSum += Math.abs(pixel - frameBuffer[index - 1]);
      }
      if (y > 0) {
        edgeSum += Math.abs(pixel - frameBuffer[index - FRAME_WIDTH]);
      }
    }
  }

  const count = FRAME_WIDTH * FRAME_HEIGHT;
  const mean = sum / count;
  const variance = Math.max(sqSum / count - mean * mean, 0);

  return {
    mean,
    textureStd: Math.sqrt(variance),
    edgeEnergy: edgeSum / (count * 2),
  };
};

const analyzeTemporalConsistency = ({ frameBuffer, totalSegments, segmentDurationSeconds }) => {
  const rawFrames = splitRawFrames(frameBuffer, FRAME_WIDTH * FRAME_HEIGHT);
  const notes = [];

  if (rawFrames.length < 3) {
    return {
      module: "temporal-consistency",
      temporalAnomalyScore: 0.5,
      flickerScore: 0.5,
      boundaryInstabilityScore: 0.5,
      textureShiftScore: 0.5,
      motionDisruptionScore: 0.5,
      notes: ["Not enough frames were available for temporal analysis"],
      segments: buildSegmentTemplate(totalSegments),
    };
  }

  const fps = 3;
  const segmentBuckets = buildSegmentTemplate(totalSegments);
  const flickers = [];
  const boundaryDiffs = [];
  const textureShifts = [];
  const motionDiffs = [];
  const sceneCutTimes = [];

  let previousStats = computeFrameStats(rawFrames[0]);

  for (let index = 1; index < rawFrames.length; index += 1) {
    const currentStats = computeFrameStats(rawFrames[index]);
    const previousFrame = rawFrames[index - 1];
    const currentFrame = rawFrames[index];

    let diffSum = 0;
    for (let pixelIndex = 0; pixelIndex < currentFrame.length; pixelIndex += 1) {
      diffSum += Math.abs(currentFrame[pixelIndex] - previousFrame[pixelIndex]);
    }

    const motionDiff = diffSum / currentFrame.length / 255;
    const flicker = Math.abs(currentStats.mean - previousStats.mean) / 255;
    const boundaryDiff =
      Math.abs(currentStats.edgeEnergy - previousStats.edgeEnergy) / 64;
    const textureShift =
      Math.abs(currentStats.textureStd - previousStats.textureStd) / 64;
    const timeSeconds = index / fps;
    const segmentIndex = Math.min(
      totalSegments - 1,
      Math.max(0, Math.floor(timeSeconds / segmentDurationSeconds))
    );

    flickers.push(flicker);
    boundaryDiffs.push(boundaryDiff);
    textureShifts.push(textureShift);
    motionDiffs.push(motionDiff);

    segmentBuckets[segmentIndex].temporalSamples.push(
      clamp(motionDiff * 0.45 + flicker * 0.2 + boundaryDiff * 0.2 + textureShift * 0.15)
    );

    if (motionDiff > 0.23) {
      sceneCutTimes.push(round(timeSeconds, 2));
    }

    previousStats = currentStats;
  }

  const flickerScore = clamp(topQuartileAverage(flickers) / 0.12);
  const boundaryInstabilityScore = clamp(topQuartileAverage(boundaryDiffs) / 0.18);
  const textureShiftScore = clamp(topQuartileAverage(textureShifts) / 0.16);
  const motionDisruptionScore = clamp(stddev(motionDiffs) / 0.08);
  const temporalAnomalyScore = clamp(
    flickerScore * 0.3 +
      boundaryInstabilityScore * 0.3 +
      textureShiftScore * 0.2 +
      motionDisruptionScore * 0.2
  );

  if (temporalAnomalyScore > 0.55) {
    notes.push("Visible frame-to-frame instability detected in sampled frames");
  }
  if (sceneCutTimes.length > 2) {
    notes.push("Abrupt temporal transitions suggest possible splicing or hidden edits");
  }
  if (textureShiftScore > 0.55) {
    notes.push("Abrupt temporal texture changes detected");
  }

  return {
    module: "temporal-consistency",
    temporalAnomalyScore: round(temporalAnomalyScore),
    flickerScore: round(flickerScore),
    boundaryInstabilityScore: round(boundaryInstabilityScore),
    textureShiftScore: round(textureShiftScore),
    motionDisruptionScore: round(motionDisruptionScore),
    notes,
    sceneCutTimes,
    segments: segmentBuckets,
  };
};

const correlateWithLag = (audioSeries, mouthSeries, lag) => {
  const alignedAudio = [];
  const alignedMouth = [];

  if (lag >= 0) {
    for (let index = 0; index + lag < mouthSeries.length && index < audioSeries.length; index += 1) {
      alignedAudio.push(audioSeries[index]);
      alignedMouth.push(mouthSeries[index + lag]);
    }
  } else {
    const shift = Math.abs(lag);
    for (let index = 0; index < mouthSeries.length && index + shift < audioSeries.length; index += 1) {
      alignedAudio.push(audioSeries[index + shift]);
      alignedMouth.push(mouthSeries[index]);
    }
  }

  return {
    correlation: pearson(alignedAudio, alignedMouth),
    alignedAudio,
    alignedMouth,
  };
};

const analyzeAvSync = async ({ videoPath, sourceInfo, totalSegments, segmentDurationSeconds }) => {
  const audioStream = (sourceInfo.streams || []).find((stream) => stream.codec_type === "audio");

  if (!audioStream) {
    return {
      module: "audio-visual-sync",
      avSyncScore: 0.5,
      syncOffsetMs: 0,
      dubbedOrManipulated: false,
      correlationScore: 0,
      notes: ["No audio stream detected, so AV sync analysis was skipped"],
      segments: buildSegmentTemplate(totalSegments),
    };
  }

  const [audioBuffer, mouthFrameBuffer] = await Promise.all([
    extractMonoAudio(videoPath),
    extractGrayFrames(videoPath, 10),
  ]);

  const pcm = normalizePcmSamples(audioBuffer);
  const mouthFrames = splitRawFrames(mouthFrameBuffer, FRAME_WIDTH * FRAME_HEIGHT);

  if (pcm.length < 200 || mouthFrames.length < 3) {
    return {
      module: "audio-visual-sync",
      avSyncScore: 0.5,
      syncOffsetMs: 0,
      dubbedOrManipulated: false,
      correlationScore: 0,
      notes: ["Insufficient audio/video samples for AV sync estimation"],
      segments: buildSegmentTemplate(totalSegments),
    };
  }

  const windowSize = 100;
  const audioEnergy = [];
  for (let index = 0; index + windowSize <= pcm.length; index += windowSize) {
    const window = pcm.slice(index, index + windowSize);
    const energy = Math.sqrt(average(window.map((sample) => sample * sample)));
    audioEnergy.push(energy);
  }

  const mouthMotion = [];
  const xStart = Math.floor(FRAME_WIDTH * 0.35);
  const xEnd = Math.floor(FRAME_WIDTH * 0.65);
  const yStart = Math.floor(FRAME_HEIGHT * 0.55);
  const yEnd = Math.floor(FRAME_HEIGHT * 0.82);

  for (let index = 1; index < mouthFrames.length; index += 1) {
    const previous = mouthFrames[index - 1];
    const current = mouthFrames[index];
    let diff = 0;
    let count = 0;

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        const offset = y * FRAME_WIDTH + x;
        diff += Math.abs(current[offset] - previous[offset]);
        count += 1;
      }
    }

    mouthMotion.push(count ? diff / count / 255 : 0);
  }

  const size = Math.min(audioEnergy.length, mouthMotion.length);
  const trimmedAudio = audioEnergy.slice(0, size);
  const trimmedMouth = mouthMotion.slice(0, size);

  let bestLag = 0;
  let bestCorrelation = -1;
  let bestAligned = { alignedAudio: trimmedAudio, alignedMouth: trimmedMouth };

  for (let lag = -7; lag <= 7; lag += 1) {
    const result = correlateWithLag(trimmedAudio, trimmedMouth, lag);
    if (result.correlation > bestCorrelation) {
      bestCorrelation = result.correlation;
      bestLag = lag;
      bestAligned = result;
    }
  }

  const avSyncScore = clamp(Math.max(bestCorrelation, 0));
  const syncOffsetMs = bestLag * 100;
  const dubbedOrManipulated = avSyncScore < 0.45 || Math.abs(syncOffsetMs) >= 180;
  const notes = [
    "Mouth motion is estimated from the center-lower face region without AI landmarks",
  ];

  if (syncOffsetMs > 120) {
    notes.push(`Speech peaks lead mouth motion by about ${syncOffsetMs} ms`);
  } else if (syncOffsetMs < -120) {
    notes.push(`Mouth motion leads speech by about ${Math.abs(syncOffsetMs)} ms`);
  }

  if (avSyncScore < 0.45) {
    notes.push("Low audio-visual alignment confidence");
  }

  const segmentBuckets = buildSegmentTemplate(totalSegments);
  const windowsPerSegment = Math.max(1, Math.round(segmentDurationSeconds * 10));

  for (let segmentIndex = 0; segmentIndex < totalSegments; segmentIndex += 1) {
    const start = segmentIndex * windowsPerSegment;
    const end = Math.min(start + windowsPerSegment, trimmedAudio.length);
    const audioSlice = trimmedAudio.slice(start, end);
    const mouthSlice = trimmedMouth.slice(start, end);
    const local = correlateWithLag(audioSlice, mouthSlice, bestLag);
    const localScore =
      local.alignedAudio.length >= 5 ? clamp(Math.max(local.correlation, 0)) : avSyncScore;

    segmentBuckets[segmentIndex].avSamples.push(localScore);
  }

  return {
    module: "audio-visual-sync",
    avSyncScore: round(avSyncScore),
    syncOffsetMs,
    dubbedOrManipulated,
    correlationScore: round(bestCorrelation),
    notes,
    segments: segmentBuckets,
    alignedWindowCount: bestAligned.alignedAudio.length,
  };
};

const mergeSegmentSignals = ({
  totalSegments,
  compressionScore,
  metadataAnomalyScore,
  syncOffsetMs,
  temporalSegments,
  avSegments,
  fallbackAvSyncScore,
}) => {
  const segments = [];

  for (let segmentIndex = 0; segmentIndex < totalSegments; segmentIndex += 1) {
    const temporalBucket = temporalSegments[segmentIndex] || { temporalSamples: [] };
    const avBucket = avSegments[segmentIndex] || { avSamples: [] };
    const temporalAnomalyScore = temporalBucket.temporalSamples.length
      ? average(temporalBucket.temporalSamples)
      : 0.5;
    const avSyncScore = avBucket.avSamples.length
      ? average(avBucket.avSamples)
      : fallbackAvSyncScore;

    const segmentRiskScore = clamp(
      0.35 * compressionScore +
        0.2 * metadataAnomalyScore +
        0.25 * temporalAnomalyScore +
        0.2 * (1 - avSyncScore)
    );

    segments.push({
      segmentIndex,
      compressionScore,
      metadataAnomalyScore,
      temporalAnomalyScore,
      avSyncScore,
      syncOffsetMs,
      segmentRiskScore,
      label: labelForScore(segmentRiskScore),
    });
  }

  return segments;
};

const analyzeVideoForensics = async ({
  videoId,
  videoPath,
  title,
  totalSegments,
  segmentDurationSeconds = SEGMENT_DURATION_SECONDS,
}) => {
  const sourceInfo = await probeSource(videoPath);
  const formatDuration = Number(sourceInfo.format?.duration || 0);
  const analysisWindow = Math.max(
    2,
    Math.min(MAX_ANALYSIS_SECONDS, Math.ceil(formatDuration || MAX_ANALYSIS_SECONDS))
  );

  const [packetInfo, frameInfo, temporalFrameBuffer, avSync] = await Promise.all([
    probePackets(videoPath, analysisWindow),
    probeFrames(videoPath, analysisWindow),
    extractGrayFrames(videoPath, 3),
    analyzeAvSync({
      videoPath,
      sourceInfo,
      totalSegments,
      segmentDurationSeconds,
    }),
  ]);

  const compressionMetadata = analyzeCompressionAndMetadata({
    sourceInfo,
    packetInfo,
    frameInfo,
  });
  const temporal = analyzeTemporalConsistency({
    frameBuffer: temporalFrameBuffer,
    totalSegments,
    segmentDurationSeconds,
  });

  const segments = mergeSegmentSignals({
    totalSegments,
    compressionScore: compressionMetadata.compressionScore,
    metadataAnomalyScore: compressionMetadata.metadataAnomalyScore,
    syncOffsetMs: avSync.syncOffsetMs,
    temporalSegments: temporal.segments,
    avSegments: avSync.segments,
    fallbackAvSyncScore: avSync.avSyncScore,
  });

  const videoRiskScore = round(average(segments.map((segment) => segment.segmentRiskScore)));
  const finalLabel = labelForScore(videoRiskScore);

  return {
    videoId,
    title,
    analysisVersion: ANALYSIS_VERSION,
    analysisTimestamp: new Date().toISOString(),
    analysisWindowSeconds: analysisWindow,
    sampledDurationSeconds: round(Math.min(formatDuration || analysisWindow, analysisWindow)),
    sourceDurationSeconds: round(formatDuration),
    totalSegments,
    modules: {
      compression: compressionMetadata,
      temporal,
      avSync,
    },
    segments: segments.map(sanitizeSegmentReport),
    notableSegments: segments
      .filter((segment) => segment.segmentRiskScore >= 0.5)
      .sort((left, right) => right.segmentRiskScore - left.segmentRiskScore)
      .slice(0, 3)
      .map(sanitizeSegmentReport),
    videoRiskScore,
    finalLabel,
    notes: [
      ...compressionMetadata.notes,
      ...temporal.notes,
      ...avSync.notes,
      analysisWindow < formatDuration
        ? `Analysis sampled the first ${analysisWindow} seconds for responsiveness`
        : null,
    ].filter(Boolean),
    limitations: [
      "Scores are forensic indicators, not proof of deepfake generation.",
      "AV sync assumes the primary speaker is near the center of the frame.",
      "Compression metrics rely on sampled packets and may be less stable on ultra-short clips.",
    ],
  };
};

module.exports = {
  ANALYSIS_VERSION,
  analyzeVideoForensics,
  labelForScore,
};