

import { useTheme } from "../context/ThemeContext";

// ─── Helpers ──────────────────────────────────────────────
const scoreTone = (score) => {
  if (score == null) return "text-neutral-400 border-neutral-700 bg-neutral-900/60";
  if (score <= 0.3)  return "text-emerald-400 border-emerald-700/30 bg-emerald-950/20";
  if (score <= 0.6)  return "text-amber-400  border-amber-700/30  bg-amber-950/20";
  return                    "text-red-400    border-red-700/30    bg-red-950/20";
};

const labelTone = (label) => {
  if (label === "Authentic")          return "text-emerald-400 border-emerald-700/30 bg-emerald-950/20";
  if (label === "Suspicious")         return "text-amber-400   border-amber-700/30   bg-amber-950/20";
  if (label === "Likely Manipulated") return "text-red-400     border-red-700/30     bg-red-950/20";
  return "text-neutral-400 border-neutral-700 bg-neutral-900/60";
};

const labelIcon = (label) => {
  if (label === "Authentic")          return "✅";
  if (label === "Suspicious")         return "⚠️";
  if (label === "Likely Manipulated") return "🚨";
  return "🔬";
};

const percent = (score) => `${Math.round((score || 0) * 100)}%`;

// ─── Metric Card ──────────────────────────────────────────
function MetricCard({ title, score, hint, isDark }) {
  const base = isDark
    ? "border-neutral-800 bg-neutral-950/70"
    : "border-neutral-200 bg-neutral-50";
  const hintColor = isDark ? "text-neutral-500" : "text-neutral-400";

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${base}`}>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-[10px] uppercase tracking-widest font-semibold ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
          {title}
        </p>
        <span className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-bold ${scoreTone(score)}`}>
          {percent(score)}
        </span>
      </div>
      <p className={`text-[11px] leading-relaxed ${hintColor}`}>{hint}</p>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────
function RiskBar({ score, isDark }) {
  const pct = Math.round((score || 0) * 100);
  const barColor = score <= 0.3 ? "bg-emerald-500" : score <= 0.6 ? "bg-amber-500" : "bg-red-500";
  const trackColor = isDark ? "bg-neutral-800" : "bg-neutral-200";
  return (
    <div className={`w-full h-1.5 rounded-full overflow-hidden ${trackColor}`}>
      <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ─── Note row ─────────────────────────────────────────────
function NoteItem({ note, isDark }) {
  const base = isDark
    ? "border-neutral-800/60 bg-neutral-900/80 text-neutral-400"
    : "border-neutral-200 bg-white text-neutral-600";
  return (
    <div className={`text-[11px] leading-relaxed border rounded-lg px-3 py-2 ${base}`}>
      {note}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  VIDEO FORENSIC PANEL
// ═════════════════════════════════════════════════════════
function VideoForensicPanel({ forensics, forensicReportCid, forensicReportUrl, isDark }) {
  const modules     = forensics.modules || {};
  const topSegments = forensics.notableSegments || [];
  const card        = isDark ? "border-neutral-800 bg-neutral-950/70" : "border-neutral-200 bg-white";
  const muted       = isDark ? "text-neutral-500" : "text-neutral-400";
  const text        = isDark ? "text-white" : "text-neutral-900";

  return (
    <div className="space-y-4">

      {/* Score header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold uppercase tracking-widest ${muted}`}>
              AI-Free Video Forensics
            </span>
          </div>
          <p className={`text-lg font-bold ${text}`}>
            {labelIcon(forensics.finalLabel)} {forensics.finalLabel}
          </p>
          <p className={`text-[11px] font-mono ${muted}`}>
            Risk {percent(forensics.videoRiskScore)}
            {forensics.peakRiskScore != null && forensics.peakRiskScore !== forensics.videoRiskScore && (
              <span> · Peak {percent(forensics.peakRiskScore)}</span>
            )}
          </p>
          <RiskBar score={forensics.videoRiskScore} isDark={isDark} />
        </div>
        <span className={`px-3 py-2 rounded-xl border text-sm font-semibold flex-shrink-0 ${labelTone(forensics.finalLabel)}`}>
          {forensics.finalLabel}
        </span>
      </div>

      {/* 4 module cards */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          isDark={isDark}
          title="Compression"
          score={modules.compression?.compressionScore}
          hint="Re-encoding, bitrate instability, and GOP irregularity."
        />
        <MetricCard
          isDark={isDark}
          title="Metadata"
          score={modules.compression?.metadataAnomalyScore}
          hint="Container, stream, FPS, and encoder consistency checks."
        />
        <MetricCard
          isDark={isDark}
          title="Temporal"
          score={modules.temporal?.temporalAnomalyScore}
          hint="Frame-to-frame flicker, texture shifts, and instability."
        />
        <MetricCard
          isDark={isDark}
          title="AV Sync"
          score={modules.avSync?.avSyncScore != null ? 1 - modules.avSync.avSyncScore : null}
          hint={`Sync offset ${modules.avSync?.syncOffsetMs ?? 0} ms. Higher = worse sync.`}
        />
      </div>

      {/* Formula */}
      {forensics.formula && (
        <div className={`rounded-xl border px-3 py-2 font-mono text-[10px] ${isDark ? "border-neutral-800 bg-neutral-900/40 text-neutral-500" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
          {forensics.formula}
          {forensics.scoring && (
            <span className="ml-2 opacity-60">· {forensics.scoring.detail}</span>
          )}
        </div>
      )}

      {/* Notes + Notable segments */}
      <div className="grid lg:grid-cols-2 gap-4">
        <div className={`rounded-xl border p-4 space-y-3 ${card}`}>
          <p className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Analyst Notes</p>
          <div className="space-y-2">
            {(forensics.notes || []).length === 0 && (
              <NoteItem note="No notable anomalies detected." isDark={isDark} />
            )}
            {(forensics.notes || []).slice(0, 5).map((note, i) => (
              <NoteItem key={i} note={note} isDark={isDark} />
            ))}
          </div>
        </div>

        <div className={`rounded-xl border p-4 space-y-3 ${card}`}>
          <p className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Notable Segments</p>
          <div className="space-y-2">
            {topSegments.length === 0 && (
              <NoteItem note="No segment crossed the suspicious threshold in the sampled analysis." isDark={isDark} />
            )}
            {topSegments.map((seg) => (
              <div key={seg.segmentIndex}
                className={`flex items-center justify-between gap-3 border rounded-lg px-3 py-2 ${isDark ? "border-neutral-800/60 bg-neutral-900/80" : "border-neutral-200 bg-neutral-50"}`}>
                <div>
                  <p className={`text-sm font-medium ${text}`}>Segment {seg.segmentIndex}</p>
                  <p className={`text-[10px] font-mono ${muted}`}>
                    T {percent(seg.temporalAnomalyScore)} · AV {percent(seg.avSyncScore)}
                  </p>
                </div>
                <span className={`px-2 py-1 rounded-lg border text-[11px] font-mono font-bold ${labelTone(seg.label)}`}>
                  {percent(seg.segmentRiskScore)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {forensicReportCid && (
          <a href={forensicReportUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-800/30 bg-orange-950/20 text-orange-400 text-[10px] font-mono hover:text-orange-300 transition-colors">
            📌 {forensicReportCid.slice(0, 20)}…
          </a>
        )}
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono ${isDark ? "border-neutral-800 bg-neutral-950 text-neutral-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
          {forensics.analysisVersion}
        </span>
        {forensics.sampledDurationSeconds != null && (
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono ${isDark ? "border-neutral-800 bg-neutral-950 text-neutral-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
            Sampled {forensics.sampledDurationSeconds}s
          </span>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  IMAGE FORENSIC PANEL  ← NEW
// ═════════════════════════════════════════════════════════
function ImageForensicPanel({ forensics, isDark }) {
  const modules = forensics.modules || {};
  const card    = isDark ? "border-neutral-800 bg-neutral-950/70" : "border-neutral-200 bg-white";
  const muted   = isDark ? "text-neutral-500" : "text-neutral-400";
  const text    = isDark ? "text-white" : "text-neutral-900";

  return (
    <div className="space-y-4">

      {/* Score header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <span className={`text-[10px] font-semibold uppercase tracking-widest ${muted}`}>
            AI-Free Image Forensics
          </span>
          <p className={`text-lg font-bold ${text}`}>
            {labelIcon(forensics.finalLabel)} {forensics.finalLabel}
          </p>
          <p className={`text-[11px] font-mono ${muted}`}>
            Risk {percent(forensics.imageRiskScore)}
          </p>
          <RiskBar score={forensics.imageRiskScore} isDark={isDark} />
        </div>
        <span className={`px-3 py-2 rounded-xl border text-sm font-semibold flex-shrink-0 ${labelTone(forensics.finalLabel)}`}>
          {forensics.finalLabel}
        </span>
      </div>

      {/* 3 module cards */}
      <div className="grid sm:grid-cols-3 gap-3">
        <MetricCard
          isDark={isDark}
          title="Compression"
          score={modules.compression?.compressionScore}
          hint="JPEG quantization tables, bytes/pixel ratio, PNG chunk analysis."
        />
        <MetricCard
          isDark={isDark}
          title="Metadata"
          score={modules.metadata?.metadataAnomalyScore}
          hint="EXIF strip detection, software tag, camera make/model, timestamp."
        />
        <MetricCard
          isDark={isDark}
          title="ELA"
          score={modules.ela?.elaScore}
          hint={modules.ela?.metrics?.applicable
            ? `PSNR ${modules.ela?.metrics?.psnrDb ?? "—"} dB after re-encode at Q${modules.ela?.metrics?.elaQuality ?? 75}.`
            : "Error Level Analysis not applicable for this format."}
        />
      </div>

      {/* JPEG details (if applicable) */}
      {modules.compression?.metrics?.codec === "mjpeg" && (
        <div className={`rounded-xl border p-3 ${card}`}>
          <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${muted}`}>JPEG Analysis</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Est. Quality", value: modules.compression.metrics.jpegQuality != null ? `~${modules.compression.metrics.jpegQuality}` : "—" },
              { label: "Q Tables",    value: modules.compression.metrics.quantizationTableCount ?? "—" },
              { label: "Non-Std Q",   value: modules.compression.metrics.nonStandardQuantization ? "⚠ Yes" : "✓ No" },
              { label: "Bytes/px",    value: modules.compression.metrics.bytesPerPixel ?? "—" },
            ].map(({ label, value }) => (
              <div key={label} className={`rounded-lg px-2.5 py-2 border ${isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}>
                <p className={`text-[9px] uppercase font-mono ${muted}`}>{label}</p>
                <p className={`text-[11px] font-mono font-semibold mt-0.5 ${text}`}>{String(value)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Camera fingerprint */}
      {modules.metadata?.fingerprint && (
        <div className={`rounded-xl border p-3 ${card}`}>
          <p className={`text-[10px] uppercase tracking-widest font-semibold mb-2 ${muted}`}>EXIF Fingerprint</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: "Make",     value: modules.metadata.fingerprint.make     || "—" },
              { label: "Model",    value: modules.metadata.fingerprint.model    || "—" },
              { label: "Software", value: modules.metadata.fingerprint.software || "—" },
              { label: "Date",     value: modules.metadata.fingerprint.dateTime || "—" },
              { label: "GPS",      value: modules.metadata.fingerprint.gpsPresent ? "Present" : "Absent" },
              { label: "Tags",     value: `${modules.metadata.fingerprint.tagCount ?? 0} fields` },
            ].map(({ label, value }) => (
              <div key={label} className={`rounded-lg px-2.5 py-2 border ${isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}>
                <p className={`text-[9px] uppercase font-mono ${muted}`}>{label}</p>
                <p className={`text-[11px] font-mono font-semibold mt-0.5 truncate ${text}`}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formula */}
      {forensics.formula && (
        <div className={`rounded-xl border px-3 py-2 font-mono text-[10px] ${isDark ? "border-neutral-800 bg-neutral-900/40 text-neutral-500" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
          {forensics.formula}
        </div>
      )}

      {/* Notes */}
      {(forensics.notes || []).length > 0 && (
        <div className={`rounded-xl border p-4 space-y-3 ${card}`}>
          <p className={`text-[10px] uppercase tracking-widest font-semibold ${muted}`}>Analyst Notes</p>
          <div className="space-y-2">
            {(forensics.notes || []).slice(0, 6).map((note, i) => (
              <NoteItem key={i} note={note} isDark={isDark} />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono ${isDark ? "border-neutral-800 bg-neutral-950 text-neutral-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
          {forensics.analysisVersion}
        </span>
        {forensics.fileSize && (
          <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-[10px] font-mono ${isDark ? "border-neutral-800 bg-neutral-950 text-neutral-600" : "border-neutral-200 bg-neutral-50 text-neutral-400"}`}>
            {(forensics.fileSize / 1024).toFixed(1)} KB
          </span>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  MAIN EXPORT
// ═════════════════════════════════════════════════════════
export default function ForensicPanel({
  forensicStatus,
  forensicError,
  forensicReportCid,
  forensicReportUrl,
  forensics,
}) {
  const { isDark } = useTheme();

  const panelBase = isDark
    ? "rounded-2xl bg-neutral-900/60 border border-neutral-800/60 p-5 backdrop-blur-sm"
    : "rounded-2xl bg-white border border-neutral-200 p-5";

  // ── Error state ───────────────────────────────────────
  if (forensicStatus === "failed") {
    return (
      <div className="rounded-2xl border border-red-800/30 bg-red-950/20 p-4">
        <p className="text-sm font-semibold text-red-400">🔬 Forensic analysis failed</p>
        <p className="text-[11px] text-red-300/80 mt-1 font-mono">{forensicError || "Unknown analysis error"}</p>
      </div>
    );
  }

  // ── Pending state ─────────────────────────────────────
  if (forensicStatus !== "ready" || !forensics) {
    return (
      <div className={`rounded-2xl border p-4 ${isDark ? "border-neutral-800/60 bg-neutral-900/60" : "border-neutral-200 bg-white"}`}>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full border-t border-blue-400 animate-spin" />
          <p className={`text-sm font-semibold ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
            Forensic analysis pending
          </p>
        </div>
        <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
          {forensics?.mediaType === "image"
            ? "Compression, metadata, and ELA indicators are still being prepared."
            : "Compression, temporal, and AV-sync indicators are still being prepared."}
        </p>
      </div>
    );
  }

  // ── Render by media type ──────────────────────────────
  const isImage = forensics.mediaType === "image";

  return (
    <div className={panelBase}>
      {isImage ? (
        <ImageForensicPanel
          forensics={forensics}
          isDark={isDark}
        />
      ) : (
        <VideoForensicPanel
          forensics={forensics}
          forensicReportCid={forensicReportCid}
          forensicReportUrl={forensicReportUrl}
          isDark={isDark}
        />
      )}
    </div>
  );
}