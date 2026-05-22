const scoreTone = (score) => {
    if (score == null) return "text-neutral-300 border-neutral-700 bg-neutral-900";
    if (score <= 0.3) return "text-emerald-300 border-emerald-700/30 bg-emerald-950/20";
    if (score <= 0.6) return "text-amber-300 border-amber-700/30 bg-amber-950/20";
    return "text-red-300 border-red-700/30 bg-red-950/20";
  };
  
  const labelTone = (label) => {
    if (label === "Authentic") return "text-emerald-300 border-emerald-700/30 bg-emerald-950/20";
    if (label === "Suspicious") return "text-amber-300 border-amber-700/30 bg-amber-950/20";
    if (label === "Likely Manipulated") return "text-red-300 border-red-700/30 bg-red-950/20";
    return "text-neutral-300 border-neutral-700 bg-neutral-900";
  };
  
  const percent = (score) => `${Math.round((score || 0) * 100)}%`;
  
  function MetricCard({ title, score, hint }) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-widest text-neutral-600 font-semibold">
            {title}
          </p>
          <span className={`px-2 py-1 rounded-lg border text-[11px] font-mono ${scoreTone(score)}`}>
            {percent(score)}
          </span>
        </div>
        <p className="text-xs text-neutral-500 leading-relaxed">{hint}</p>
      </div>
    );
  }
  
  export default function ForensicPanel({
    forensicStatus,
    forensicError,
    forensicReportCid,
    forensicReportUrl,
    forensics,
  }) {
    if (forensicStatus === "failed") {
      return (
        <div className="rounded-xl border border-red-800/30 bg-red-950/20 p-4">
          <p className="text-sm font-semibold text-red-300">Forensic analysis failed</p>
          <p className="text-xs text-red-200/80 mt-1">{forensicError || "Unknown analysis error"}</p>
        </div>
      );
    }
  
    if (forensicStatus !== "ready" || !forensics) {
      return (
        <div className="rounded-xl border border-neutral-800/60 bg-neutral-900/60 p-4">
          <p className="text-sm font-semibold text-neutral-300">Forensic analysis pending</p>
          <p className="text-xs text-neutral-500 mt-1">
            Compression, temporal, and AV-sync indicators are still being prepared.
          </p>
        </div>
      );
    }
  
    const modules = forensics.modules || {};
    const topSegments = forensics.notableSegments || [];
  
    return (
      <div className="rounded-xl bg-neutral-900/60 border border-neutral-800/60 p-4 backdrop-blur-sm space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-600">
                AI-Free Forensics
              </span>
              <span className="h-px w-12 bg-neutral-800" />
            </div>
            <p className="text-lg font-semibold text-white mt-1">{forensics.finalLabel}</p>
            <p className="text-xs text-neutral-500 mt-1">
              Risk score {percent(forensics.videoRiskScore)} based on explainable forensic indicators
            </p>
          </div>
  
          <div className={`px-3 py-2 rounded-xl border text-sm font-semibold ${labelTone(forensics.finalLabel)}`}>
            {forensics.finalLabel}
          </div>
        </div>
  
        <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <MetricCard
            title="Compression"
            score={modules.compression?.compressionScore}
            hint="Re-encoding, bitrate instability, and GOP irregularity."
          />
          <MetricCard
            title="Metadata"
            score={modules.compression?.metadataAnomalyScore}
            hint="Container, stream, FPS, and encoder consistency checks."
          />
          <MetricCard
            title="Temporal"
            score={modules.temporal?.temporalAnomalyScore}
            hint="Frame-to-frame flicker, texture shifts, and instability."
          />
          <MetricCard
            title="AV Sync"
            score={modules.avSync?.avSyncScore}
            hint={`Estimated sync offset ${modules.avSync?.syncOffsetMs ?? 0} ms.`}
          />
        </div>
  
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-neutral-600 font-semibold">
              Analyst Notes
            </p>
            <div className="space-y-2">
              {(forensics.notes || []).slice(0, 5).map((note) => (
                <div
                  key={note}
                  className="text-xs text-neutral-400 leading-relaxed border border-neutral-800/60 bg-neutral-900/80 rounded-lg px-3 py-2"
                >
                  {note}
                </div>
              ))}
            </div>
          </div>
  
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-4 space-y-3">
            <p className="text-[11px] uppercase tracking-widest text-neutral-600 font-semibold">
              Notable Segments
            </p>
            <div className="space-y-2">
              {topSegments.length === 0 && (
                <div className="text-xs text-neutral-500 border border-neutral-800/60 bg-neutral-900/80 rounded-lg px-3 py-2">
                  No segment crossed the suspicious threshold in the sampled analysis.
                </div>
              )}
              {topSegments.map((segment) => (
                <div
                  key={segment.segmentIndex}
                  className="flex items-center justify-between gap-3 border border-neutral-800/60 bg-neutral-900/80 rounded-lg px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-white font-medium">
                      Segment {segment.segmentIndex}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      Temporal {percent(segment.temporalAnomalyScore)} • AV {percent(segment.avSyncScore)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-lg border text-[11px] font-mono ${labelTone(segment.label)}`}>
                    {percent(segment.segmentRiskScore)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
  
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {forensicReportCid && (
            <a
              href={forensicReportUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-orange-800/30 bg-orange-950/20 text-orange-300 text-xs font-mono"
            >
              📌 {forensicReportCid}
            </a>
          )}
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-neutral-800 bg-neutral-950 text-neutral-500 text-xs">
            Version {forensics.analysisVersion}
          </span>
        </div>
      </div>
    );
  }