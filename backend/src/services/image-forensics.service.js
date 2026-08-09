// -----------------------------------------------------------------
//  backend/src/services/image-forensics.service.js
//
//  AI-free quantitative image forensics.
//
//  3 modules (upgraded from 2):
//    1) Compression   - JPEG quantization tables, quality estimation,
//                       bytes-per-pixel ratio, PNG chunk inspection
//    2) Metadata      - EXIF strip detection, software tag, camera
//                       make/model, timestamp, dimension anomaly
//    3) ELA           - Error Level Analysis via FFmpeg re-encode
//                       (JPEG only). Detects re-saved regions using
//                       PSNR between original and re-saved copy.
//
//  Score fusion (thesis style, image variant):
//      risk = 0.45*C + 0.30*M + 0.25*ELA
//  Bands: <=0.30 Authentic | <=0.60 Suspicious | >0.60 Likely Manipulated
//
//  Pure quantitative - no AI / no ML models.
//  No new npm packages - uses ffprobe + ffmpeg (already dependencies).
// -----------------------------------------------------------------

"use strict";

const fs      = require("fs");
const path    = require("path");
const os      = require("os");
const { execFile } = require("child_process");

const ANALYSIS_VERSION = "ai-free-image-forensics/v2";

// ─── Utilities ────────────────────────────────────────────

const execFileAsync = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      { maxBuffer: 32 * 1024 * 1024, ...options },
      (error, stdout, stderr) => {
        if (error) { error.stderr = stderr; reject(error); return; }
        resolve({ stdout, stderr });
      }
    );
  });

const clamp = (v, min = 0, max = 1) =>
  Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));

const round = (v, digits = 3) =>
  Number(Number.isFinite(v) ? v : 0).toFixed(digits) * 1;

const labelForScore = (score) => {
  if (score <= 0.3) return "Authentic";
  if (score <= 0.6) return "Suspicious";
  return "Likely Manipulated";
};

// ─── ffprobe wrapper ──────────────────────────────────────

const probeImage = async (imagePath) => {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", imagePath],
    { encoding: "utf8" }
  );
  return JSON.parse(stdout || "{}");
};

// ═════════════════════════════════════════════════════════
//  JPEG BINARY PARSING
// ═════════════════════════════════════════════════════════

const isJpeg = (buffer) =>
  buffer.length >= 3 &&
  buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

/**
 * Parse all DQT (quantization) tables from a JPEG buffer.
 * Returns array of { id, precision, values[64] }.
 */
const extractQuantizationTables = (buffer) => {
  const tables = [];
  if (!isJpeg(buffer)) return tables;
  try {
    let i = 2;
    while (i < buffer.length - 3) {
      if (buffer[i] !== 0xff) { i += 1; continue; }
      const marker = buffer[i + 1];
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      if (marker === 0xda) break; // SOS - past metadata zone
      const length = (buffer[i + 2] << 8) | buffer[i + 3];
      if (length < 2 || i + 2 + length > buffer.length) break;
      if (marker === 0xdb) {
        let pos = i + 4;
        const segEnd = i + 2 + length;
        while (pos < segEnd) {
          const pq = buffer[pos] >> 4;
          const tq = buffer[pos] & 0x0f;
          pos += 1;
          if (pos + 64 * (pq === 0 ? 1 : 2) > segEnd) break;
          const values = new Array(64);
          for (let k = 0; k < 64; k++) {
            values[k] = pq === 0 ? buffer[pos + k] : (buffer[pos + k*2] << 8) | buffer[pos + k*2 + 1];
          }
          pos += 64 * (pq === 0 ? 1 : 2);
          tables.push({ id: tq, precision: pq, values });
        }
      }
      i += 2 + length;
    }
  } catch {}
  return tables;
};

const estimateJpegQuality = (tables) => {
  const luma = tables.find((t) => t.id === 0);
  if (!luma) return null;
  const avg = luma.values.reduce((s, v) => s + v, 0) / luma.values.length;
  if (avg <= 1)  return 100;
  if (avg <= 5)  return Math.round(100 - avg * 2);
  if (avg <= 20) return Math.round(95 - (avg - 5) * 2);
  if (avg <= 50) return Math.round(65 - (avg - 20) * 0.8);
  return Math.max(10, Math.round(40 - (avg - 50) * 0.4));
};

// Standard libjpeg luma Q50 table (ITU-T T.81 Annex K).
const STANDARD_LUMA_Q50 = [
  16, 11, 10, 16,  24,  40,  51,  61,
  12, 12, 14, 19,  26,  58,  60,  55,
  14, 13, 16, 24,  40,  57,  69,  56,
  14, 17, 22, 29,  51,  87,  80,  62,
  18, 22, 37, 56,  68, 109, 103,  77,
  24, 35, 55, 64,  81, 104, 113,  92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103,  99,
];

const detectNonStandardTables = (tables) => {
  const luma = tables.find((t) => t.id === 0);
  if (!luma) return { nonStandard: false, distance: 0 };
  let sumDiff = 0;
  for (let i = 0; i < 64; i++) sumDiff += Math.abs(luma.values[i] - STANDARD_LUMA_Q50[i]);
  return { nonStandard: sumDiff > 200, distance: sumDiff };
};

// ═════════════════════════════════════════════════════════
//  PNG BINARY PARSING  ← NEW
//  Parse tEXt / iTXt / iCCP chunks for software tags.
//  PNG spec: 8-byte signature + chunks[length(4) + type(4) + data + crc(4)]
// ═════════════════════════════════════════════════════════

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isPng = (buffer) =>
  buffer.length >= 8 && PNG_SIGNATURE.every((b, i) => buffer[i] === b);

const SOFTWARE_EDITORS =
  /photoshop|gimp|inkscape|paint|canva|figma|snapseed|lightroom|affinity|corel|stable.?diffusion|midjourney|dall.?e|gemini|firefly|imagen|adobe/i;

/**
 * Walk PNG chunks and extract text metadata.
 * Returns { software, chunks[], hasIccp, hasSrgb }
 */
const parsePngChunks = (buffer) => {
  const result = { software: null, chunks: [], hasIccp: false, hasSrgb: false };
  if (!isPng(buffer)) return result;
  try {
    let i = 8; // skip signature
    while (i + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(i);
      const type   = buffer.toString("ascii", i + 4, i + 8);
      result.chunks.push(type);

      if (type === "tEXt" && length > 0) {
        const data    = buffer.toString("latin1", i + 8, i + 8 + length);
        const nullPos = data.indexOf("\0");
        const keyword = nullPos >= 0 ? data.slice(0, nullPos)  : data;
        const value   = nullPos >= 0 ? data.slice(nullPos + 1) : "";
        if (/software|comment|author|description/i.test(keyword)) {
          result.software = result.software || value.trim();
        }
      }

      if (type === "iTXt" && length > 0) {
        const data    = buffer.toString("utf8", i + 8, i + 8 + length);
        const nullPos = data.indexOf("\0");
        const value   = nullPos >= 0 ? data.slice(nullPos + 1) : data;
        if (!result.software && SOFTWARE_EDITORS.test(value)) {
          result.software = value.slice(0, 100).trim();
        }
      }

      if (type === "iCCP") result.hasIccp = true;
      if (type === "sRGB") result.hasSrgb = true;
      if (type === "IEND") break;

      i += 8 + length + 4; // marker + data + CRC
    }
  } catch {}
  return result;
};

// ═════════════════════════════════════════════════════════
//  MODULE 1: IMAGE COMPRESSION
// ═════════════════════════════════════════════════════════

const analyzeImageCompression = ({ buffer, sourceInfo, fileSize }) => {
  const notes = [];
  const stream  = (sourceInfo.streams || []).find((s) => s.codec_type === "video") || {};
  const codec   = stream.codec_name || "";
  const width   = Number(stream.width  || 0);
  const height  = Number(stream.height || 0);
  const pixelCount = width * height;

  // ── Bytes-per-pixel ratio ─────────────────────────────
  // Camera JPEG: ~0.5–2.0 bpp. Web-resaved: <0.15. Heavily compressed: <0.05
  const bytesPerPixel = pixelCount > 0 ? fileSize / pixelCount : 0;
  let bppScore = 0;
  if (bytesPerPixel > 0) {
    if (bytesPerPixel < 0.05) {
      bppScore = clamp((0.05 - bytesPerPixel) / 0.04 + 0.5);
      notes.push("Bytes/pixel ratio extremely low — aggressive recompression likely");
    } else if (bytesPerPixel < 0.15) {
      bppScore = clamp((0.15 - bytesPerPixel) / 0.5);
      notes.push("Bytes/pixel ratio below camera range — multiple save cycles possible");
    }
  }

  // ── Dimension anomaly ← NEW ───────────────────────────
  // Camera sensors produce standard MP counts. Odd dimensions = cropped/edited.
  let dimensionScore = 0;
  if (width > 0 && height > 0) {
    const commonAspects = [[16,9],[4,3],[3,2],[1,1],[9,16],[2,3],[3,4]];
    const ratio = width / height;
    const isStandardAspect = commonAspects.some(([w, h]) => Math.abs(ratio - w/h) < 0.02);
    if (!isStandardAspect) {
      dimensionScore = 0.2;
      notes.push(`Non-standard aspect ratio ${width}×${height} — suggests cropping or editing`);
    }
    // Very small image — likely a thumbnail or resized copy
    if (pixelCount < 100_000) {
      dimensionScore = clamp(dimensionScore + 0.15);
      notes.push("Image resolution very low — may be a resized/thumbnail copy");
    }
  }

  // ── JPEG-specific: quantization tables ───────────────
  let quantizationScore = 0;
  let estimatedQuality  = null;
  let tableCount        = 0;
  let nonStandard       = false;

  if (codec === "mjpeg" || codec === "jpeg") {
    const tables    = extractQuantizationTables(buffer);
    tableCount      = tables.length;
    estimatedQuality = estimateJpegQuality(tables);
    const detection = detectNonStandardTables(tables);
    nonStandard     = detection.nonStandard;

    if (estimatedQuality !== null && estimatedQuality < 60) {
      quantizationScore = clamp((60 - estimatedQuality) / 50);
      notes.push(`Estimated JPEG quality ~${estimatedQuality} — indicates recompression`);
    }
    if (nonStandard) {
      quantizationScore = clamp(quantizationScore + 0.25);
      notes.push("JPEG quantization tables differ from camera defaults — software re-encode suspected");
    }
  }

  // ── PNG-specific: chunk analysis ← NEW ───────────────
  let pngScore = 0;
  let pngInfo  = null;

  if (codec === "png" && isPng(buffer)) {
    const parsed = parsePngChunks(buffer);
    pngInfo = { software: parsed.software, hasIccp: parsed.hasIccp, hasSrgb: parsed.hasSrgb };

    if (parsed.software && SOFTWARE_EDITORS.test(parsed.software)) {
      pngScore += 0.5;
      notes.push(`PNG tEXt Software chunk identifies editor: "${parsed.software}"`);
    } else if (parsed.software) {
      pngScore += 0.2;
      notes.push(`PNG tEXt Software chunk present: "${parsed.software}"`);
    }
    // sRGB chunk is often added by browsers/editors when saving
    if (parsed.hasSrgb && !parsed.hasIccp) {
      pngScore += 0.1;
      notes.push("PNG has sRGB chunk without iCCP — typical of browser/editor save");
    }
    pngScore = clamp(pngScore);
  }

  if (codec === "webp") {
    notes.push("WebP format — quantization analysis not applicable; metadata is primary signal");
  }

  const compressionScore = clamp(
    bppScore * 0.4 + quantizationScore * 0.35 + dimensionScore * 0.15 + pngScore * 0.1
  );

  return {
    module:           "image-compression",
    compressionScore: round(compressionScore),
    metrics: {
      width, height, pixelCount, fileSize,
      bytesPerPixel:           round(bytesPerPixel, 4),
      codec:                   codec || null,
      jpegQuality:             estimatedQuality,
      quantizationTableCount:  tableCount,
      nonStandardQuantization: nonStandard,
      dimensionAnomalyScore:   round(dimensionScore),
      pngSoftwareTag:          pngInfo?.software || null,
    },
    notes,
  };
};

// ═════════════════════════════════════════════════════════
//  MODULE 2: IMAGE METADATA
// ═════════════════════════════════════════════════════════

const SUSPICIOUS_SOFTWARE =
  /photoshop|gimp|screenshot|paint|canva|figma|snapseed|stable.?diffusion|midjourney|dall.?e|gemini|firefly|adobe|lightroom|affinity|corel/i;

const analyzeImageMetadata = ({ sourceInfo }) => {
  const notes  = [];
  const format = sourceInfo.format || {};
  const stream = (sourceInfo.streams || []).find((s) => s.codec_type === "video") || {};
  const tags   = { ...(format.tags || {}), ...(stream.tags || {}) };

  const make     = tags.make  || tags.Make  || tags["com.android.manufacturer"] || null;
  const model    = tags.model || tags.Model || null;
  const software = tags.software || tags.Software || tags.encoder || null;
  const dateTime = tags.DateTime || tags.DateTimeOriginal || tags.creation_time || null;
  const gpsLat   = tags.GPSLatitude || tags.gps_latitude || tags.location || null;
  const tagCount = Object.keys(tags).length;

  // ── Check for future or impossible timestamps ← NEW ──
  let timestampAnomalyScore = 0;
  if (dateTime) {
    try {
      const d = new Date(dateTime.replace(/:/g, "-").replace(" ", "T"));
      if (d > new Date()) {
        timestampAnomalyScore = 0.4;
        notes.push("EXIF timestamp is in the future — likely manipulated metadata");
      }
    } catch {}
  }

  let weight = 0;

  if (tagCount === 0) {
    weight += 0.35;
    notes.push("No EXIF/format metadata - common after browser/app upload or re-saving");
  }
  if (!make && !model) {
    weight += 0.15;
    notes.push("Camera make/model absent - weak signal only; many uploads strip this");
  }
  if (software && SUSPICIOUS_SOFTWARE.test(software)) {
    weight += 0.8;
    notes.push(`Software tag indicates editor or AI generator: "${software}"`);
  }
  if (!dateTime) {
    weight += 0.1;
    notes.push("Capture date/time tag missing - weak signal only");
  }
  weight += timestampAnomalyScore;

  // ── Inconsistency check ← NEW ─────────────────────────
  // Camera present but no date is suspicious (cameras always write date)
  if ((make || model) && !dateTime) {
    weight += 0.3;
    notes.push("Camera make/model present but date absent — metadata may have been partially stripped");
  }

  const metadataAnomalyScore = clamp(weight / 2.0); // conservative: missing metadata alone should not dominate

  return {
    module:               "image-metadata",
    metadataAnomalyScore: round(metadataAnomalyScore),
    fingerprint: {
      make:       make     || null,
      model:      model    || null,
      software:   software || null,
      dateTime:   dateTime || null,
      gpsPresent: Boolean(gpsLat),
      tagCount,
    },
    notes,
  };
};

// ═════════════════════════════════════════════════════════
//  MODULE 3: ERROR LEVEL ANALYSIS (ELA)  ← NEW
//  JPEG only. Uses FFmpeg to re-encode at known quality,
//  then measures PSNR between original and re-encoded copy.
//
//  Key insight:
//  - Original camera JPEG:   high error variance between regions
//    (edge areas differ from flat areas at re-encode).
//    PSNR after re-save at Q75 is typically 32–42 dB.
//  - Already-re-saved JPEG:  error is more uniform (regions
//    converged to stable compression state).
//    PSNR after re-save at Q75 is typically >48 dB.
//
//  High PSNR → image was ALREADY re-saved → manipulation signal.
//  Low / mid PSNR → typical first-generation output → authentic.
// ═════════════════════════════════════════════════════════

const ELA_QUALITY = 75; // re-encode quality for ELA comparison

/**
 * Parse PSNR output from ffmpeg stderr.
 * ffmpeg -filter_complex "psnr" outputs a line like:
 *   PSNR y:40.123456 u:41.0 v:40.9 average:40.7 min:35.0 max:inf
 */
const parsePsnr = (stderr) => {
  const match = stderr.match(/PSNR\s+.*?average:([\d.]+|inf)/);
  if (!match) return null;
  const val = match[1] === "inf" ? 999 : parseFloat(match[1]);
  return Number.isFinite(val) ? val : null;
};

const analyzeELA = async ({ imagePath, codec }) => {
  // ELA is meaningful only for JPEG (lossy, block-based compression)
  if (codec !== "mjpeg" && codec !== "jpeg") {
    return {
      module:   "ela",
      elaScore: 0,
      metrics:  { applicable: false, codec: codec || "unknown" },
      notes:    [`ELA skipped for ${codec || "unknown"} format — applies to JPEG only`],
    };
  }

  const tmpPath = path.join(os.tmpdir(), `truststream_ela_${Date.now()}.jpg`);
  const notes   = [];

  try {
    // Step 1: Re-encode the image at ELA_QUALITY
    await execFileAsync("ffmpeg", [
      "-y", "-i", imagePath,
      "-q:v", String(Math.round(1 + (100 - ELA_QUALITY) * 30 / 99)),
      tmpPath,
    ]);

    // Step 2: Measure PSNR between original and re-encoded
    const { stderr } = await execFileAsync("ffmpeg", [
      "-i", imagePath,
      "-i", tmpPath,
      "-filter_complex", "psnr",
      "-f", "null", "-",
    ]).catch((err) => ({ stderr: err.stderr || "" }));

    const psnrDb = parsePsnr(stderr);

    if (psnrDb === null) {
      return {
        module:   "ela",
        elaScore: 0,
        metrics:  { applicable: true, psnrDb: null, error: "PSNR parse failed" },
        notes:    ["ELA: could not parse PSNR from ffmpeg output"],
      };
    }

    // Score mapping:
    //   psnr < 35 dB → very fresh, original-quality → score ~0.05
    //   psnr 35–45   → normal range → score linear 0.05–0.30
    //   psnr 45–55   → re-saved signal → score 0.30–0.70
    //   psnr > 55    → strong re-save → score 0.70–0.95
    let elaScore;
    if (psnrDb >= 999) {
      elaScore = 0.95; // identical after re-save = already heavily re-saved
      notes.push("ELA: image is identical after re-encode — already re-saved to convergence (strong manipulation signal)");
    } else if (psnrDb > 55) {
      elaScore = clamp(0.70 + (psnrDb - 55) * 0.025);
      notes.push(`ELA: PSNR ${psnrDb.toFixed(1)} dB — high similarity after re-encode (re-save signal)`);
    } else if (psnrDb > 45) {
      elaScore = clamp(0.30 + (psnrDb - 45) * 0.04);
      notes.push(`ELA: PSNR ${psnrDb.toFixed(1)} dB — moderate re-save signal`);
    } else if (psnrDb > 35) {
      elaScore = clamp((psnrDb - 35) * 0.025);
    } else {
      elaScore = 0.05;
      notes.push(`ELA: PSNR ${psnrDb.toFixed(1)} dB — typical first-generation capture`);
    }

    return {
      module:   "ela",
      elaScore: round(elaScore),
      metrics: {
        applicable: true,
        psnrDb:     round(psnrDb, 2),
        elaQuality: ELA_QUALITY,
      },
      notes,
    };
  } catch (err) {
    return {
      module:   "ela",
      elaScore: 0,
      metrics:  { applicable: true, error: err.message },
      notes:    [`ELA analysis failed: ${err.message}`],
    };
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
};

// Final risk calibration.
// Missing EXIF/camera tags alone are weak signals because browsers and upload
// pipelines commonly strip them. We only lift an image into Suspicious when
// metadata loss appears together with public-source/editing indicators.
const calibrateImageRisk = ({ rawRiskScore, compression, metadata, ela, codec }) => {
  const metrics = compression.metrics || {};
  const fingerprint = metadata.fingerprint || {};

  const tagCount = Number(fingerprint.tagCount || 0);
  const hasCamera = Boolean(fingerprint.make || fingerprint.model);
  const hasDateTime = Boolean(fingerprint.dateTime);
  const software = fingerprint.software || metrics.pngSoftwareTag || "";

  const pixelCount = Number(metrics.pixelCount || 0);
  const dimensionScore = Number(metrics.dimensionAnomalyScore || 0);
  const compressionScore = Number(compression.compressionScore || 0);
  const metadataScore = Number(metadata.metadataAnomalyScore || 0);
  const elaScore = Number(ela.elaScore || 0);

  const metadataStripped = tagCount === 0 && !hasCamera && !hasDateTime;
  const veryLowResolution = pixelCount > 0 && pixelCount < 100000;
  const tinyImage = pixelCount > 0 && pixelCount < 50000;
  const croppedOrOddAspect = dimensionScore >= 0.2;
  const webFormat = codec === "png" || codec === "webp";
  const editorSoftware = Boolean(software && SUSPICIOUS_SOFTWARE.test(software));
  const compressionEvidence = compressionScore >= 0.25;

  let calibratedScore = rawRiskScore;
  const calibrationNotes = [];

  if (elaScore >= 0.75) {
    calibratedScore = Math.max(calibratedScore, 0.65);
    calibrationNotes.push("Strong ELA re-save evidence - likely manipulated");
  } else if (elaScore >= 0.5 && (compressionEvidence || metadataScore >= 0.35)) {
    calibratedScore = Math.max(calibratedScore, 0.5);
    calibrationNotes.push("ELA re-save evidence combined with another anomaly - suspicious");
  }

  if (editorSoftware) {
    calibratedScore = Math.max(calibratedScore, 0.45);
    calibrationNotes.push("Editor/AI/software metadata found - suspicious");
  }

  if (metadataStripped && veryLowResolution && croppedOrOddAspect) {
    calibratedScore = Math.max(calibratedScore, 0.35);
    calibrationNotes.push("Metadata stripped plus low-resolution cropped dimensions - public/resaved source suspected");
  }

  if (metadataStripped && webFormat && tinyImage && compressionEvidence) {
    calibratedScore = Math.max(calibratedScore, 0.38);
    calibrationNotes.push("Tiny web-format image with compression evidence - public/resaved source suspected");
  }

  if (calibratedScore <= 0.3 && metadataStripped) {
    calibrationNotes.push("Metadata is missing, but no strong edit/public-source evidence was found");
  }

  return {
    imageRiskScore: clamp(calibratedScore),
    calibrationNotes,
  };
};

// ═════════════════════════════════════════════════════════
//  PUBLIC ENTRYPOINT
// ═════════════════════════════════════════════════════════

/**
 * Analyze a single image file and return a forensic report.
 *
 * @param {object} options
 * @param {string} options.imageId   - logical id (used in returned report)
 * @param {string} options.imagePath - absolute path to the image file
 * @param {string} [options.title]   - optional human title
 * @returns {Promise<object>} forensic report with mediaType="image"
 */
const analyzeImageForensics = async ({ imageId, imagePath, title }) => {
  console.log(`[forensics-image] Analyzing image ${imageId}...`);

  const buffer     = fs.readFileSync(imagePath);
  const fileSize   = buffer.length;
  const sourceInfo = await probeImage(imagePath);
  const stream     = (sourceInfo.streams || []).find((s) => s.codec_type === "video") || {};
  const codec      = stream.codec_name || "";

  // Run modules (ELA async, others sync)
  const [compression, metadata, ela] = await Promise.all([
    Promise.resolve(analyzeImageCompression({ buffer, sourceInfo, fileSize })),
    Promise.resolve(analyzeImageMetadata({ sourceInfo })),
    analyzeELA({ imagePath, codec }),
  ]);

  // ── Score fusion (3-module image variant) ─────────────
  // risk = 0.45×Compression + 0.30×Metadata + 0.25×ELA
  // ELA score is 0 for non-JPEG (neutral — doesn't penalize PNG/WebP)
  const rawImageRiskScore = clamp(
    0.45 * compression.compressionScore +
    0.30 * metadata.metadataAnomalyScore +
    0.25 * ela.elaScore
  );

  const calibrated = calibrateImageRisk({
    rawRiskScore: rawImageRiskScore,
    compression,
    metadata,
    ela,
    codec,
  });

  const imageRiskScore = calibrated.imageRiskScore;
  const finalLabel = labelForScore(imageRiskScore);

  console.log(
    `[forensics-image] ${imageId}: risk=${round(imageRiskScore)} label="${finalLabel}" ` +
    `(raw=${round(rawImageRiskScore)} C=${compression.compressionScore} M=${metadata.metadataAnomalyScore} ELA=${ela.elaScore})`
  );

  return {
    mediaType:         "image",
    imageId,
    title:             title || null,
    analysisVersion:   ANALYSIS_VERSION,
    analysisTimestamp: new Date().toISOString(),
    fileSize,
    codec:             codec || null,
    modules: {
      compression,
      metadata,
      ela,
    },
    // Top-level scalars for quick access in frontend / catalog
    imageRiskScore:    round(imageRiskScore),
    rawImageRiskScore: round(rawImageRiskScore),
    finalLabel,
    compressionScore:  compression.compressionScore,
    metadataScore:     metadata.metadataAnomalyScore,
    elaScore:          ela.elaScore,
    notes: [
      ...compression.notes,
      ...metadata.notes,
      ...ela.notes,
      ...calibrated.calibrationNotes,
    ],
    formula: "risk = 0.45*Compression + 0.30*Metadata + 0.25*ELA",
    limitations: [
      "Scores are forensic indicators, not proof of manipulation.",
      "JPEG analysis works best on first-generation camera output.",
      "ELA is JPEG-only; PNG/WebP rely on metadata and dimension signals.",
      "ELA PSNR threshold calibrated on libjpeg-turbo; results may vary across encoders.",
      "Some EXIF fields may be inaccessible via ffprobe; results are conservative.",
    ],
  };
};

module.exports = {
  ANALYSIS_VERSION,
  analyzeImageForensics,
  labelForScore,
};