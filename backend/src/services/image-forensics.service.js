// -----------------------------------------------------------------
//  backend/src/services/image-forensics.service.js
//
//  AI-free quantitative image forensics. Mirrors the philosophy of
//  forensics.service.js (video) but adapted for still images:
//
//    1) Compression analysis - JPEG quantization tables, quality
//       estimation, bytes-per-pixel re-save signal
//    2) Metadata anomaly     - EXIF strip detection, software tag,
//       camera make/model presence, timestamp
//
//  No temporal / no AV-sync (single frame, no audio).
//
//  Score fusion (matches thesis style, image variant):
//      risk = 0.60*C + 0.40*M
//  Bands match video: <=0.30 Authentic | <=0.60 Suspicious | >0.60 Likely Manipulated
//
//  Pure quantitative - no AI / no ML models.
//  Uses ffprobe (already a dependency) plus manual JPEG marker
//  parsing for quantization tables. No new npm packages required.
// -----------------------------------------------------------------

const fs = require("fs");
const { execFile } = require("child_process");

const ANALYSIS_VERSION = "ai-free-image-forensics/v1";

// --- Utilities ---------------------------------------------------

const execFileAsync = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { maxBuffer: 16 * 1024 * 1024, ...options },
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

const round = (value, digits = 3) =>
  Number(Number.isFinite(value) ? value : 0).toFixed(digits) * 1;

const labelForScore = (score) => {
  if (score <= 0.3) return "Authentic";
  if (score <= 0.6) return "Suspicious";
  return "Likely Manipulated";
};

// --- ffprobe wrapper ---------------------------------------------

const probeImage = async (imagePath) => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      imagePath,
    ],
    { encoding: "utf8" }
  );
  return JSON.parse(stdout || "{}");
};

// --- Manual JPEG marker walker -----------------------------------
//
// JPEG layout (relevant markers):
//   0xFFD8         SOI  (Start Of Image)
//   0xFFDB         DQT  (Define Quantization Table) - 1+ tables
//   0xFFC0..C2     SOF  (Start Of Frame)
//   0xFFE0         APP0 (JFIF)
//   0xFFE1         APP1 (often EXIF)
//   0xFFDA         SOS  (Start Of Scan) - past the metadata zone
//   0xFFD9         EOI  (End Of Image)
//
// Each segment after a marker is: [marker FF XX][length 2 bytes BE][data...]
// where length INCLUDES the 2 length bytes but NOT the marker.

const isJpeg = (buffer) =>
  buffer.length >= 3 &&
  buffer[0] === 0xff &&
  buffer[1] === 0xd8 &&
  buffer[2] === 0xff;

/**
 * Parse all DQT (quantization) tables from a JPEG buffer.
 * Returns array of { id, precision, values[64] }.
 * Stops cleanly at SOS or EOI; tolerates malformed segments.
 */
const extractQuantizationTables = (buffer) => {
  const tables = [];
  if (!isJpeg(buffer)) return tables;

  try {
    let i = 2; // skip SOI
    while (i < buffer.length - 3) {
      if (buffer[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buffer[i + 1];

      // Standalone markers (no length): SOI/EOI/RSTx
      if (marker === 0xd8 || marker === 0xd9) {
        i += 2;
        continue;
      }
      if (marker === 0xda) break; // SOS - past metadata zone

      const length = (buffer[i + 2] << 8) | buffer[i + 3];
      if (length < 2 || i + 2 + length > buffer.length) break;

      if (marker === 0xdb) {
        // DQT segment - may contain multiple tables back-to-back
        let pos = i + 4;
        const segEnd = i + 2 + length;
        while (pos < segEnd) {
          const pq = buffer[pos] >> 4; // precision: 0=8-bit, 1=16-bit
          const tq = buffer[pos] & 0x0f; // table ID
          pos += 1;
          const valueCount = 64;
          if (pos + valueCount * (pq === 0 ? 1 : 2) > segEnd) break;
          const values = new Array(valueCount);
          for (let k = 0; k < valueCount; k += 1) {
            if (pq === 0) {
              values[k] = buffer[pos + k];
            } else {
              values[k] = (buffer[pos + k * 2] << 8) | buffer[pos + k * 2 + 1];
            }
          }
          pos += valueCount * (pq === 0 ? 1 : 2);
          tables.push({ id: tq, precision: pq, values });
        }
      }

      i += 2 + length;
    }
  } catch (err) {
    // Malformed JPEG - return whatever we got
  }
  return tables;
};

/**
 * Estimate JPEG quality from the luma quantization table.
 * libjpeg-style heuristic: average quantization value has an inverse
 * relationship with quality. Empirical mapping calibrated against
 * typical libjpeg outputs.
 */
const estimateJpegQuality = (tables) => {
  const luma = tables.find((t) => t.id === 0);
  if (!luma) return null;
  const avg = luma.values.reduce((s, v) => s + v, 0) / luma.values.length;
  if (avg <= 1) return 100;
  if (avg <= 5) return Math.round(100 - avg * 2);
  if (avg <= 20) return Math.round(95 - (avg - 5) * 2);
  if (avg <= 50) return Math.round(65 - (avg - 20) * 0.8);
  return Math.max(10, Math.round(40 - (avg - 50) * 0.4));
};

// Standard libjpeg luma quantization table at quality 50 (ITU-T T.81 Annex K).
// Cameras typically use this table or close to it; software re-encoders
// (Photoshop, online optimizers) often use custom tables that diverge.
const STANDARD_LUMA_Q50 = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

/**
 * Compare luma quantization table to the standard libjpeg Q50 table.
 * Large divergence is a signal of software re-encoding.
 */
const detectNonStandardTables = (tables) => {
  const luma = tables.find((t) => t.id === 0);
  if (!luma) return { nonStandard: false, distance: 0 };
  let sumDiff = 0;
  for (let i = 0; i < 64; i += 1) {
    sumDiff += Math.abs(luma.values[i] - STANDARD_LUMA_Q50[i]);
  }
  return { nonStandard: sumDiff > 200, distance: sumDiff };
};

// --- Module 1: Image Compression ---------------------------------

const analyzeImageCompression = ({ buffer, sourceInfo, fileSize }) => {
  const notes = [];
  const stream =
    (sourceInfo.streams || []).find((s) => s.codec_type === "video") || {};
  const codec = stream.codec_name || "";
  const width = Number(stream.width || 0);
  const height = Number(stream.height || 0);
  const pixelCount = width * height;

  // Bytes-per-pixel: real-camera JPEG ~0.5-2.0, web-resaved <0.15,
  // heavily-recompressed <0.05. Lower = more compression rounds.
  const bytesPerPixel = pixelCount > 0 ? fileSize / pixelCount : 0;
  let bppScore = 0;
  if (bytesPerPixel > 0) {
    if (bytesPerPixel < 0.05) {
      bppScore = clamp((0.05 - bytesPerPixel) / 0.04 + 0.5);
      notes.push(
        "Bytes/pixel ratio is unusually low - aggressive recompression likely"
      );
    } else if (bytesPerPixel < 0.15) {
      bppScore = clamp((0.15 - bytesPerPixel) / 0.5);
    }
  }

  // JPEG-specific: quantization tables + quality estimate
  let quantizationScore = 0;
  let estimatedQuality = null;
  let tableCount = 0;
  let nonStandard = false;

  if (codec === "mjpeg" || codec === "jpeg") {
    const tables = extractQuantizationTables(buffer);
    tableCount = tables.length;
    estimatedQuality = estimateJpegQuality(tables);
    const detection = detectNonStandardTables(tables);
    nonStandard = detection.nonStandard;

    // Low quality = strong recompression signal
    if (estimatedQuality !== null && estimatedQuality < 60) {
      quantizationScore = clamp((60 - estimatedQuality) / 50);
      notes.push(`Estimated JPEG quality is low (~${estimatedQuality})`);
    }

    // Non-standard quantization tables: software re-encode signal
    if (nonStandard) {
      quantizationScore = clamp(quantizationScore + 0.25);
      notes.push(
        "JPEG quantization tables differ from camera defaults - software re-encode suspected"
      );
    }
  } else if (codec === "png" || codec === "webp") {
    notes.push(
      `Lossless or modern format (${codec}) - quantization analysis skipped`
    );
  }

  const compressionScore = clamp(bppScore * 0.6 + quantizationScore * 0.4);

  return {
    module: "image-compression",
    compressionScore: round(compressionScore),
    metrics: {
      width,
      height,
      fileSize,
      bytesPerPixel: round(bytesPerPixel, 4),
      codec: codec || null,
      jpegQuality: estimatedQuality,
      quantizationTableCount: tableCount,
      nonStandardQuantization: nonStandard,
    },
    notes,
  };
};

// --- Module 2: Image Metadata ------------------------------------

// Software / generator names that flag a non-original capture.
const SUSPICIOUS_SOFTWARE =
  /photoshop|gimp|screenshot|paint|canva|figma|snapseed|stable\s*diffusion|midjourney|dall-?e|gemini|firefly/i;

const analyzeImageMetadata = ({ sourceInfo }) => {
  const notes = [];
  const format = sourceInfo.format || {};
  const stream =
    (sourceInfo.streams || []).find((s) => s.codec_type === "video") || {};
  const tags = { ...(format.tags || {}), ...(stream.tags || {}) };

  // ffprobe surfaces common EXIF tags under different casings depending on
  // input format - check both lowercase and TitleCase variants.
  const make =
    tags.make ||
    tags.Make ||
    tags["com.android.manufacturer"] ||
    null;
  const model = tags.model || tags.Model || null;
  const software =
    tags.software || tags.Software || tags.encoder || null;
  const dateTime =
    tags.DateTime ||
    tags.DateTimeOriginal ||
    tags.creation_time ||
    null;
  const gpsLat =
    tags.GPSLatitude || tags.gps_latitude || tags.location || null;
  const tagCount = Object.keys(tags).length;

  let weight = 0;

  if (tagCount === 0) {
    weight += 0.9;
    notes.push(
      "No EXIF/format metadata at all - common after re-saving or stripping"
    );
  }
  if (!make && !model) {
    weight += 0.4;
    notes.push(
      "Camera make/model is missing - typical of edited or web-resaved images"
    );
  }
  if (software && SUSPICIOUS_SOFTWARE.test(software)) {
    weight += 0.6;
    notes.push(
      `Software tag indicates editor or generator: "${software}"`
    );
  }
  if (!dateTime) {
    weight += 0.2;
    notes.push("Capture date/time tag missing");
  }

  const metadataAnomalyScore = clamp(weight / 2.1);

  return {
    module: "image-metadata",
    metadataAnomalyScore: round(metadataAnomalyScore),
    fingerprint: {
      make: make || null,
      model: model || null,
      software: software || null,
      dateTime: dateTime || null,
      gpsPresent: Boolean(gpsLat),
      tagCount,
    },
    notes,
  };
};

// --- Public entrypoint -------------------------------------------

/**
 * Analyze a single image file and return a forensic report.
 *
 * @param {object} options
 * @param {string} options.imageId    - logical id (used in returned report)
 * @param {string} options.imagePath  - absolute path to the image file
 * @param {string} [options.title]    - optional human title
 * @returns {Promise<object>} forensic report with mediaType="image"
 */
const analyzeImageForensics = async ({ imageId, imagePath, title }) => {
  console.log(`[forensics-image] Analyzing image ${imageId}...`);

  const buffer = fs.readFileSync(imagePath);
  const fileSize = buffer.length;

  const sourceInfo = await probeImage(imagePath);
  const compression = analyzeImageCompression({
    buffer,
    sourceInfo,
    fileSize,
  });
  const metadata = analyzeImageMetadata({ sourceInfo });

  // Score fusion (image variant of the thesis formula):
  //   risk = 0.60*C + 0.40*M
  // No temporal / AV-sync terms - images are single frames, no audio.
  const imageRiskScore = clamp(
    0.6 * compression.compressionScore +
      0.4 * metadata.metadataAnomalyScore
  );
  const finalLabel = labelForScore(imageRiskScore);

  console.log(
    `[forensics-image] ${imageId}: risk=${round(imageRiskScore)} label="${finalLabel}"`
  );

  return {
    mediaType: "image",
    imageId,
    title: title || null,
    analysisVersion: ANALYSIS_VERSION,
    analysisTimestamp: new Date().toISOString(),
    fileSize,
    modules: {
      compression,
      metadata,
    },
    imageRiskScore: round(imageRiskScore),
    finalLabel,
    notes: [...compression.notes, ...metadata.notes],
    limitations: [
      "Scores are forensic indicators, not proof of manipulation.",
      "JPEG analysis is heuristic and works best on first-generation camera output.",
      "PNG/WebP analyses are limited compared to JPEG; missing metadata is the main signal.",
      "Some EXIF fields may be hidden from ffprobe; results are conservative.",
    ],
  };
};

module.exports = {
  ANALYSIS_VERSION,
  analyzeImageForensics,
  labelForScore,
};
