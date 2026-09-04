import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { UserButton, useUser } from "@clerk/clerk-react";
import api, { imageAPI } from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

// ─── Pipeline Step ────────────────────────────────────────
function PipelineStep({ icon, label, sublabel, status, isDark }) {
  return (
    <div className={`flex items-center gap-3 transition-all duration-500 ${
      status === "done" ? "opacity-100" : status === "active" ? "opacity-100" : "opacity-30"
    }`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all duration-500 ${
        status === "done"
          ? "bg-emerald-500/15 border-emerald-500/40"
          : status === "active"
          ? "bg-blue-500/15 border-blue-500/40"
          : isDark
          ? "bg-neutral-800/60 border-neutral-700/40"
          : "bg-neutral-100 border-neutral-200"
      }`}>
        {status === "done" ? (
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : status === "active" ? (
          <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        ) : (
          <span className="text-sm">{icon}</span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-semibold ${
          status === "done" ? "text-emerald-400"
          : status === "active" ? "text-blue-400"
          : isDark ? "text-neutral-600" : "text-neutral-400"
        }`}>{label}</p>
        {sublabel && (
          <p className={`text-[10px] font-mono mt-0.5 ${
            status === "active" ? "text-blue-400/60"
            : isDark ? "text-neutral-700" : "text-neutral-400"
          }`}>{sublabel}</p>
        )}
      </div>

      {status === "done" && (
        <span className="text-[9px] font-bold text-emerald-500 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">DONE</span>
      )}
      {status === "active" && (
        <span className="text-[9px] font-bold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded-full animate-pulse">RUNNING</span>
      )}
    </div>
  );
}

// ─── Result Row ───────────────────────────────────────────
function ResultRow({ label, value, mono, link, isDark }) {
  return (
    <div className={`flex gap-3 items-start py-2.5 border-b last:border-0 ${isDark ? "border-neutral-800/60" : "border-neutral-100"}`}>
      <span className={`text-[10px] uppercase tracking-widest font-mono w-28 flex-shrink-0 pt-0.5 ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>
        {label}
      </span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer"
          className={`text-[11px] break-all underline font-mono ${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-500"}`}>
          {value}
        </a>
      ) : (
        <span className={`text-[11px] break-all ${mono ? "font-mono" : ""} ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
          {value}
        </span>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  VIDEO UPLOAD PANEL (existing logic, unchanged)
// ═════════════════════════════════════════════════════════
function VideoUploadPanel({ isDark }) {
  const [file, setFile]               = useState(null);
  const [thumbnail, setThumbnail]     = useState(null);
  const [thumbnailPreview, setThumbnailPreview] = useState(null);
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage]             = useState("idle");
  const [progress, setProgress]       = useState(0);
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState("");
  const [dragOver, setDragOver]       = useState(false);
  const [bgStatus, setBgStatus]       = useState(null);
  const pollRef = useRef(null);

  // Cleanup blob URL on unmount
  useEffect(() => () => {
    if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
  }, [thumbnailPreview]);

  const startPolling = (videoId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/upload/videos/${videoId}`);
        const data = res.data;
        setBgStatus(data);
        const ipfsDone    = ["uploaded", "partial"].includes(data.ipfsStatus);
        const fabricDone  = ["ready", "degraded", "skipped"].includes(data.fabricStatus);
        const forensicDone = ["ready", "failed"].includes(data.forensicStatus || "");
        if (ipfsDone && fabricDone && forensicDone) clearInterval(pollRef.current);
      } catch {}
    }, 4000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleUpload = async () => {
    if (!file || !title.trim()) { setError("Please enter a title."); return; }
    const formData = new FormData();
    formData.append("video", file);
    if (thumbnail) formData.append("thumbnail", thumbnail);
    formData.append("title", title);
    formData.append("description", description);

    try {
      setStage("uploading"); setError(""); setResult(null); setBgStatus(null); setProgress(0);
      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded * 100) / e.total);
          setProgress(pct);
          if (pct === 100) setStage("processing");
        },
      });
      setResult(res.data); setStage("done");
      setTitle(""); setDescription(""); setFile(null);
      setThumbnail(null);
      if (thumbnailPreview) { URL.revokeObjectURL(thumbnailPreview); setThumbnailPreview(null); }
      if (res.data.videoId) startPolling(res.data.videoId);
    } catch (err) {
      console.error(err);
      setError("Upload failed — check backend logs.");
      setStage("error");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === "video/mp4") setFile(dropped);
  };

  const isDisabled = stage === "uploading" || stage === "processing";

  const ipfsStatus    = bgStatus?.ipfsStatus;
  const fabricStatus  = bgStatus?.fabricStatus  || result?.fabricStatus;
  const c2paStatus    = bgStatus?.c2paStatus    || result?.c2paStatus;
  const forensicStatus = bgStatus?.forensicStatus || result?.forensicStatus;
  const forensicLabel  = bgStatus?.forensicLabel  || result?.forensicLabel;
  const forensicRiskScore = bgStatus?.forensicRiskScore ?? result?.forensicRiskScore ?? null;
  const forensicNotes = bgStatus?.forensics?.notes || result?.forensics?.notes || [];

  const getPipelineStatus = (step) => {
    if (stage === "idle" || stage === "error") return "pending";
    switch (step) {
      case "upload":
        if (stage === "uploading") return progress > 0 && progress < 100 ? "active" : "pending";
        return "done";
      case "ffmpeg":
      case "hash":
        if (stage === "uploading") return "pending";
        if (stage === "processing") return "active";
        return "done";
      case "forensic":
        if (stage !== "done") return "pending";
        if (!forensicStatus || forensicStatus === "pending") return "active";
        return "done";
      case "c2pa":
        if (stage !== "done") return "pending";
        if (!c2paStatus || c2paStatus === "pending" || c2paStatus === "signing") return "active";
        return "done";
      case "ipfs":
        if (stage !== "done") return "pending";
        if (!ipfsStatus || ipfsStatus === "pending" || ipfsStatus === "uploading") return "active";
        return "done";
      case "fabric":
        if (stage !== "done") return "pending";
        if (!fabricStatus || fabricStatus === "pending" || fabricStatus === "registering") return "active";
        return "done";
      default: return "pending";
    }
  };

  const pipelineSteps = [
    { key: "upload",     icon: "⬆️",  label: "Upload to server",              sublabel: "multipart/form-data" },
    { key: "ffmpeg",     icon: "✂️",  label: "FFmpeg segmentation",           sublabel: "2s HLS chunks (.ts)" },
    { key: "hash",       icon: "🔐",  label: "SHA-256 + Chain Hash",          sublabel: "SHA256(hash + prevHash)" },
    { key: "forensic",   icon: "🔬",  label: "AI-free forensic analysis",     sublabel: "compression • temporal • AV sync" },
    { key: "c2pa",       icon: "📋",  label: "C2PA manifest signing",         sublabel: "8 assertions • HMAC-SHA256" },
    { key: "ipfs",       icon: "📌",  label: "IPFS upload via Pinata",        sublabel: "segments + metadata JSON" },
    { key: "fabric",     icon: "🧾", label: "Fabric 3-org endorsement",      sublabel: "mychannel • AND(Org1, Org2, Org3)" },
  ];

  const allDone = pipelineSteps.every((s) => getPipelineStatus(s.key) === "done");

  const cardBg  = isDark ? "bg-neutral-900/60 border-white/8" : "bg-white border-neutral-200";
  const inputBg = isDark
    ? "bg-neutral-800 border-neutral-700 text-white placeholder-neutral-600 focus:border-blue-500/60 focus:ring-blue-500/20"
    : "bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-blue-500 focus:ring-blue-500/20";
  const text      = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-2xl ${cardBg}`}>
      <div className="p-6 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            News Title <span className="text-blue-500">*</span>
          </label>
          <input type="text" placeholder="e.g. Breaking: Election Results 2026"
            value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }}
            disabled={isDisabled}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-40 transition-all ${inputBg}`}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            Description <span className={textMuted}>(optional)</span>
          </label>
          <textarea placeholder="Short description..." value={description}
            onChange={(e) => setDescription(e.target.value)} rows={2}
            disabled={isDisabled}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 resize-none disabled:opacity-40 transition-all ${inputBg}`}
          />
        </div>

        {/* File drop */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            Video File <span className={textMuted}>(MP4)</span>
          </label>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`flex items-center gap-4 w-full border-2 border-dashed rounded-xl px-4 py-5 cursor-pointer transition-all duration-200 ${
              dragOver ? "border-blue-500/60 bg-blue-500/5 scale-[1.01]"
              : file ? isDark ? "border-emerald-500/40 bg-emerald-500/5" : "border-emerald-400 bg-emerald-50"
              : isDark ? "border-neutral-700 hover:border-neutral-600" : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-100"
            } ${isDisabled ? "opacity-40 pointer-events-none" : ""}`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
              file ? isDark ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-emerald-100 border border-emerald-200"
              : isDark ? "bg-neutral-800 border border-neutral-700" : "bg-neutral-200 border border-neutral-300"
            }`}>
              {file ? "🎬" : "📁"}
            </div>
            <div className="flex-1 min-w-0">
              {file ? (
                <>
                  <p className={`text-sm font-semibold truncate ${text}`}>{file.name}</p>
                  <p className={`text-[11px] mt-0.5 font-mono ${textMuted}`}>{(file.size / 1024 / 1024).toFixed(2)} MB · MP4</p>
                </>
              ) : (
                <>
                  <p className={`text-sm font-medium ${textMuted}`}>Drop video here or click to browse</p>
                  <p className={`text-[11px] mt-0.5 ${textMuted}`}>MP4 format · Any size</p>
                </>
              )}
            </div>
            {file && (
              <button onClick={(e) => { e.preventDefault(); setFile(null); }}
                className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${isDark ? "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <input type="file" accept="video/mp4" disabled={isDisabled} onChange={(e) => setFile(e.target.files[0])} className="hidden" />
          </label>
        </div>

        {/* Thumbnail (optional) */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            Thumbnail <span className={textMuted}>(JPG / PNG / WebP — shown before playback)</span>
          </label>
          <label
            className={`relative flex items-center gap-4 w-full border-2 border-dashed rounded-xl px-4 py-4 cursor-pointer transition-all duration-200 overflow-hidden ${
              thumbnail ? isDark ? "border-blue-500/40 bg-blue-500/5" : "border-blue-400 bg-blue-50"
              : isDark ? "border-neutral-700 hover:border-neutral-600" : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-100"
            } ${isDisabled ? "opacity-40 pointer-events-none" : ""}`}
          >
            {thumbnailPreview ? (
              <>
                <img src={thumbnailPreview} alt="thumbnail preview" className="w-24 h-14 object-cover rounded-lg flex-shrink-0 bg-black" />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${text}`}>{thumbnail?.name}</p>
                  <p className={`text-[11px] mt-0.5 font-mono ${textMuted}`}>
                    {thumbnail ? `${(thumbnail.size / 1024).toFixed(1)} KB · ${thumbnail.type}` : ""}
                  </p>
                </div>
                <button onClick={(e) => {
                    e.preventDefault();
                    setThumbnail(null);
                    if (thumbnailPreview) { URL.revokeObjectURL(thumbnailPreview); setThumbnailPreview(null); }
                  }}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isDark ? "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${isDark ? "bg-neutral-800 border border-neutral-700" : "bg-neutral-200 border border-neutral-300"}`}>
                  🖼️
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${textMuted}`}>Add a cover image (optional)</p>
                  <p className={`text-[11px] mt-0.5 ${textMuted}`}>Shown as the video poster before play</p>
                </div>
              </>
            )}
            <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" disabled={isDisabled}
              onChange={(e) => {
                const f = e.target.files[0];
                if (!f) return;
                if (thumbnailPreview) URL.revokeObjectURL(thumbnailPreview);
                setThumbnail(f);
                setThumbnailPreview(URL.createObjectURL(f));
              }}
              className="hidden" />
          </label>
        </div>

        {/* Progress */}
        {stage === "uploading" && (
          <div className="space-y-2">
            <div className="flex justify-between text-[11px]">
              <span className={textMuted}>Uploading to server...</span>
              <span className="text-blue-400 font-mono font-bold">{progress}%</span>
            </div>
            <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}>
              <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        {stage !== "done" && (
          <button onClick={handleUpload} disabled={isDisabled || !file || !title.trim()}
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 flex items-center justify-center gap-2">
            {(stage === "uploading" || stage === "processing") && (
              <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {stage === "idle" && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            )}
            {stage === "uploading" ? "Uploading..." : stage === "processing" ? "Processing..." : "Upload & Generate Hashes"}
          </button>
        )}
      </div>

      {/* Pipeline */}
      {(stage === "processing" || stage === "done") && (
        <div className={`border-t px-6 py-5 space-y-4 ${isDark ? "border-white/6 bg-white/1" : "border-neutral-100 bg-neutral-50/50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isDark ? "bg-blue-500/15 border border-blue-500/25" : "bg-blue-100 border border-blue-200"}`}>
                <svg className="w-2.5 h-2.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Processing Pipeline</span>
            </div>
            {allDone && <span className="text-[9px] font-bold text-emerald-500 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">ALL COMPLETE ✓</span>}
          </div>
          <div className="space-y-3">
            {pipelineSteps.map((step) => (
              <PipelineStep key={step.key} icon={step.icon} label={step.label} sublabel={step.sublabel} status={getPipelineStatus(step.key)} isDark={isDark} />
            ))}
          </div>
          {!allDone && stage === "done" && (
            <p className={`text-[10px] font-mono pt-1 ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
              IPFS + Blockchain running in background — auto-updating...
            </p>
          )}
        </div>
      )}

      {/* Result */}
      {stage === "done" && result && (
        <div className={`border-t px-6 py-5 space-y-4 ${isDark ? "border-white/6" : "border-neutral-100"}`}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Upload Complete</span>
          </div>

          <div className={`rounded-xl border overflow-hidden ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
            <div className={`${isDark ? "bg-neutral-800/60" : "bg-neutral-100"} px-4 py-1`}>
              {[
                { label: "Video ID",   value: result.videoId,                         mono: true },
                { label: "Segments",   value: `${result.totalSegments} × 2s chunks` },
                { label: "Forensics",  value: forensicStatus                          || "pending" },
                { label: "Risk Label", value: forensicLabel                           || "pending" },
                { label: "Risk Score", value: forensicRiskScore != null ? `${Math.round(forensicRiskScore * 100)}%` : "pending" },
                { label: "C2PA",       value: bgStatus?.c2paStatus    || result.c2paStatus    || "pending" },
                { label: "IPFS",       value: bgStatus?.ipfsStatus    || result.ipfsStatus    || "pending" },
                { label: "Fabric",     value: bgStatus?.fabricStatus    || result.fabricStatus    || "pending" },
              ].map(({ label, value, mono }) => (
                <ResultRow key={label} label={label} value={value} mono={mono} isDark={isDark} />
              ))}
              <ResultRow label="Playlist" value={result.playlistUrl} mono link={`http://localhost:3001${result.playlistUrl}`} isDark={isDark} />
              {(bgStatus?.metadataCid || result.metadataCid) && (
                <ResultRow label="IPFS CID" value={bgStatus?.metadataCid || result.metadataCid} mono link={`https://gateway.pinata.cloud/ipfs/${bgStatus?.metadataCid || result.metadataCid}`} isDark={isDark} />
              )}
              {(bgStatus?.forensicReportCid || result.forensicReportCid) && (
                <ResultRow label="Forensic CID" value={bgStatus?.forensicReportCid || result.forensicReportCid} mono link={bgStatus?.forensicReportUrl || result.forensicReportUrl} isDark={isDark} />
              )}
            </div>
          </div>

          {forensicNotes.length > 0 && (
            <div className={`rounded-xl border p-4 space-y-3 ${isDark ? "border-neutral-800 bg-neutral-900/40" : "border-neutral-200 bg-neutral-50"}`}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Forensic Notes</span>
              <div className="space-y-2">
                {forensicNotes.slice(0, 3).map((note) => (
                  <div key={note} className={`text-xs rounded-lg px-3 py-2 border ${isDark ? "text-neutral-300 bg-neutral-950/70 border-neutral-800" : "text-neutral-700 bg-white border-neutral-200"}`}>
                    {note}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => { setStage("idle"); setResult(null); setBgStatus(null); if (pollRef.current) clearInterval(pollRef.current); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${isDark ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300" : "bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-700"}`}>
              Upload Another
            </button>
            <a href="/" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Watch Now
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  IMAGE UPLOAD PANEL  ← NEW
// ═════════════════════════════════════════════════════════
function ImageUploadPanel({ isDark }) {
  const [file, setFile]               = useState(null);
  const [preview, setPreview]         = useState(null);
  const [title, setTitle]             = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage]             = useState("idle"); // idle | uploading | done | error
  const [result, setResult]           = useState(null);
  const [error, setError]             = useState("");
  const [dragOver, setDragOver]       = useState(false);
  const [bgStatus, setBgStatus]       = useState(null);
  const pollRef = useRef(null);

  // Cleanup preview URL on unmount
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const startPolling = (imageId) => {
    pollRef.current = setInterval(async () => {
      try {
        const res = await imageAPI.getOne(imageId);
        const data = res.data;
        setBgStatus(data);
        const ipfsDone  = ["uploaded", "failed"].includes(data.ipfsStatus);
        const fabricDone = ["ready", "degraded", "skipped"].includes(data.fabricStatus);
        if (ipfsDone && fabricDone) clearInterval(pollRef.current);
      } catch {}
    }, 4000);
  };

  const handleFile = (f) => {
    if (!f) return;
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowed.includes(f.type)) { setError("Only JPG, PNG, or WebP images allowed."); return; }
    if (f.size > 20 * 1024 * 1024) { setError("Image must be under 20MB."); return; }
    setFile(f);
    setError("");
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(f));
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleUpload = async () => {
    if (!file || !title.trim()) { setError("Please enter a title."); return; }

    const formData = new FormData();
    formData.append("image", file);
    formData.append("title", title);
    formData.append("description", description);

    try {
      setStage("uploading"); setError("");

      const res = await imageAPI.upload(formData);
      setResult(res.data); setStage("done");
      setTitle(""); setDescription(""); setFile(null);
      if (preview) { URL.revokeObjectURL(preview); setPreview(null); }

      if (res.data.imageId) startPolling(res.data.imageId);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Upload failed — check backend logs.");
      setStage("error");
    }
  };

  const isDisabled = stage === "uploading";

  const ipfsStatus  = bgStatus?.ipfsStatus    || result?.ipfsStatus;
  const fabricStatus = bgStatus?.fabricStatus || result?.fabricStatus;
  const c2paStatus  = bgStatus?.c2paStatus    || result?.c2paStatus;

  const getPipelineStatus = (step) => {
    if (stage === "idle" || stage === "error") return "pending";
    // uploading = all pending except upload
    if (stage === "uploading") return step === "upload" ? "active" : "pending";
    // done state — check background statuses
    switch (step) {
      case "upload": return "done";
      case "hash":   return "done";
      case "c2pa":
        if (!c2paStatus || c2paStatus === "pending" || c2paStatus === "signing") return "active";
        return "done";
      case "ipfs":
        if (!ipfsStatus || ipfsStatus === "pending" || ipfsStatus === "uploading") return "active";
        return "done";
      case "fabric":
        if (!fabricStatus || fabricStatus === "pending" || fabricStatus === "registering") return "active";
        return "done";
      default: return "pending";
    }
  };

  // Image pipeline: no FFmpeg, no forensics — simpler than video
  const pipelineSteps = [
    { key: "upload",     icon: "⬆️",  label: "Upload image to server",        sublabel: "multipart/form-data" },
    { key: "hash",       icon: "🔐",  label: "SHA-256 hash",                  sublabel: "single-file hash (no chain)" },
    { key: "c2pa",       icon: "📋",  label: "C2PA manifest signing",         sublabel: "7 assertions • HMAC-SHA256" },
    { key: "ipfs",       icon: "📌",  label: "IPFS upload via Pinata",        sublabel: "image file + metadata JSON" },
    { key: "fabric",     icon: "🧾", label: "Fabric 3-org endorsement",      sublabel: "mychannel • AND(Org1, Org2, Org3)" },
  ];

  const allDone = pipelineSteps.every((s) => getPipelineStatus(s.key) === "done");

  const cardBg  = isDark ? "bg-neutral-900/60 border-white/8" : "bg-white border-neutral-200";
  const inputBg = isDark
    ? "bg-neutral-800 border-neutral-700 text-white placeholder-neutral-600 focus:border-purple-500/60 focus:ring-purple-500/20"
    : "bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-purple-500 focus:ring-purple-500/20";
  const text      = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";

  return (
    <div className={`rounded-2xl border overflow-hidden shadow-2xl ${cardBg}`}>
      <div className="p-6 space-y-5">

        {/* Title */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            News Title <span className="text-purple-500">*</span>
          </label>
          <input type="text" placeholder="e.g. Flood Situation in Sylhet 2026"
            value={title} onChange={(e) => { setTitle(e.target.value); setError(""); }}
            disabled={isDisabled}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-40 transition-all ${inputBg}`}
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            Description <span className={textMuted}>(optional)</span>
          </label>
          <textarea placeholder="Caption or context for this image..." value={description}
            onChange={(e) => setDescription(e.target.value)} rows={2} disabled={isDisabled}
            className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 resize-none disabled:opacity-40 transition-all ${inputBg}`}
          />
        </div>

        {/* Image drop zone */}
        <div className="space-y-1.5">
          <label className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>
            Image File <span className={textMuted}>(JPG / PNG / WebP · max 20MB)</span>
          </label>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 overflow-hidden ${
              dragOver ? "border-purple-500/60 bg-purple-500/5 scale-[1.01]"
              : file ? isDark ? "border-purple-500/40" : "border-purple-400"
              : isDark ? "border-neutral-700 hover:border-neutral-600" : "border-neutral-300 hover:border-neutral-400"
            } ${isDisabled ? "opacity-40 pointer-events-none" : ""}`}
            style={{ minHeight: "140px" }}
          >
            {/* Preview */}
            {preview ? (
              <>
                <img src={preview} alt="preview" className="w-full max-h-48 object-contain py-2" />
                <div className={`w-full px-4 pb-3 flex items-center justify-between gap-2`}>
                  <div>
                    <p className={`text-[11px] font-semibold truncate ${text}`}>{file.name}</p>
                    <p className={`text-[10px] font-mono ${textMuted}`}>{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type}</p>
                  </div>
                  <button onClick={(e) => { e.preventDefault(); setFile(null); setPreview(null); }}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${isDark ? "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 px-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${isDark ? "bg-neutral-800 border border-neutral-700" : "bg-neutral-100 border border-neutral-200"}`}>
                  🖼️
                </div>
                <div className="text-center">
                  <p className={`text-sm font-medium ${textMuted}`}>Drop image here or click to browse</p>
                  <p className={`text-[10px] mt-1 ${textMuted}`}>JPG · PNG · WebP</p>
                </div>
              </div>
            )}
            <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp"
              disabled={isDisabled} onChange={(e) => handleFile(e.target.files[0])} className="hidden" />
          </label>
        </div>

        {/* Uploading spinner */}
        {stage === "uploading" && (
          <div className="flex items-center gap-3 bg-purple-500/10 border border-purple-500/25 rounded-xl px-4 py-3">
            <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <span className="text-purple-300 text-sm">Uploading image...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
            <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        )}

        {stage !== "done" && (
          <button onClick={handleUpload} disabled={isDisabled || !file || !title.trim()}
            className="w-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2">
            {stage === "uploading" && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            {stage === "idle" && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            )}
            {stage === "uploading" ? "Uploading..." : "Upload & Authenticate Image"}
          </button>
        )}
      </div>

      {/* Pipeline */}
      {(stage === "uploading" || stage === "done") && (
        <div className={`border-t px-6 py-5 space-y-4 ${isDark ? "border-white/6 bg-white/1" : "border-neutral-100 bg-neutral-50/50"}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isDark ? "bg-purple-500/15 border border-purple-500/25" : "bg-purple-100 border border-purple-200"}`}>
                <svg className="w-2.5 h-2.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Authentication Pipeline</span>
            </div>
            {allDone && <span className="text-[9px] font-bold text-emerald-500 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">ALL COMPLETE ✓</span>}
          </div>

          <div className="space-y-3">
            {pipelineSteps.map((step) => (
              <PipelineStep key={step.key} icon={step.icon} label={step.label} sublabel={step.sublabel} status={getPipelineStatus(step.key)} isDark={isDark} />
            ))}
          </div>

          {!allDone && stage === "done" && (
            <p className={`text-[10px] font-mono pt-1 ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
              C2PA + IPFS + Blockchain running in background — auto-updating...
            </p>
          )}
        </div>
      )}

      {/* Result */}
      {stage === "done" && result && (
        <div className={`border-t px-6 py-5 space-y-4 ${isDark ? "border-white/6" : "border-neutral-100"}`}>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Image Upload Complete</span>
          </div>

          <div className={`rounded-xl border overflow-hidden ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
            <div className={`${isDark ? "bg-neutral-800/60" : "bg-neutral-100"} px-4 py-1`}>
              {[
                { label: "Image ID",   value: result.imageId,                                                         mono: true },
                { label: "SHA-256",    value: result.sha256Hash ? `${result.sha256Hash.slice(0, 20)}…` : "computing", mono: true },
                { label: "MIME",       value: result.mimeType || "—" },
                { label: "C2PA",       value: bgStatus?.c2paStatus    || result.c2paStatus    || "pending" },
                { label: "IPFS",       value: bgStatus?.ipfsStatus    || result.ipfsStatus    || "pending" },
                { label: "Fabric",     value: bgStatus?.fabricStatus    || result.fabricStatus    || "pending" },
              ].map(({ label, value, mono }) => (
                <ResultRow key={label} label={label} value={value} mono={mono} isDark={isDark} />
              ))}

              {(bgStatus?.ipfsCid || result.ipfsCid) && (
                <ResultRow label="Image CID" value={bgStatus?.ipfsCid || result.ipfsCid} mono
                  link={`https://gateway.pinata.cloud/ipfs/${bgStatus?.ipfsCid || result.ipfsCid}`} isDark={isDark} />
              )}
              {(bgStatus?.metadataCid || result.metadataCid) && (
                <ResultRow label="Meta CID" value={bgStatus?.metadataCid || result.metadataCid} mono
                  link={`https://gateway.pinata.cloud/ipfs/${bgStatus?.metadataCid || result.metadataCid}`} isDark={isDark} />
              )}
            </div>
          </div>

          {/* Immutability notice */}
          <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${isDark ? "border-amber-800/30 bg-amber-950/20" : "border-amber-200 bg-amber-50"}`}>
            <span className="text-base flex-shrink-0">🔒</span>
            <p className={`text-[11px] leading-relaxed ${isDark ? "text-amber-400/80" : "text-amber-700"}`}>
              This image is permanently recorded on the Hyperledger Fabric ledger. It cannot be deleted — only revoked (status change). The ledger record remains forever.
            </p>
          </div>

          <div className="flex gap-2">
            <button onClick={() => { setStage("idle"); setResult(null); setBgStatus(null); if (pollRef.current) clearInterval(pollRef.current); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${isDark ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300" : "bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-700"}`}>
              Upload Another
            </button>
            <a href="/" className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-lg shadow-purple-900/20">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              View in Feed
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════
//  MAIN ADMIN PAGE
// ═════════════════════════════════════════════════════════
export default function Admin() {
  const { isDark } = useTheme();
  const { user }   = useUser();

  const [activeTab, setActiveTab] = useState("video"); // "video" | "image"

  const bg      = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const text     = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";

  const tabs = [
    { key: "video", icon: "🎬", label: "Video Upload",  accent: "blue" },
    { key: "image", icon: "🖼️", label: "Image Upload",  accent: "purple" },
  ];

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300`}>
      <Navbar />

      <div className="max-w-xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-sm shadow-lg shadow-blue-900/30">
              📡
            </div>
            <div>
              <h1 className={`text-xl font-bold tracking-tight ${text}`}>Admin Upload Panel</h1>
              <p className={`text-[11px] font-mono ${textMuted}`}>
                {user?.primaryEmailAddress?.emailAddress || ""}
              </p>
            </div>
          </div>
          <UserButton afterSignOutUrl="/" />
        </div>

        {/* Tab switcher */}
        <div className={`flex gap-1 rounded-xl p-1 mb-5 ${isDark ? "bg-neutral-900 border border-white/8" : "bg-neutral-100 border border-neutral-200"}`}>
          {tabs.map(({ key, icon, label, accent }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                activeTab === key
                  ? accent === "purple"
                    ? isDark ? "bg-purple-600 text-white shadow-lg shadow-purple-900/30" : "bg-purple-600 text-white shadow-lg"
                    : isDark ? "bg-blue-600 text-white shadow-lg shadow-blue-900/30" : "bg-blue-600 text-white shadow-lg"
                  : isDark ? "text-neutral-500 hover:text-neutral-300" : "text-neutral-500 hover:text-neutral-700"
              }`}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>

        {/* Active Panel */}
        {activeTab === "video"
          ? <VideoUploadPanel isDark={isDark} />
          : <ImageUploadPanel isDark={isDark} />
        }

        <p className={`text-center text-[10px] font-mono mt-6 ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
          TrustStream Admin · C2PA v2.2 · Hyperledger Fabric · IPFS via Pinata
        </p>
      </div>
    </div>
  );
}