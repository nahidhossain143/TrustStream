import { useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

// ─── Pipeline Step ────────────────────────────────────────
function PipelineStep({ icon, label, sublabel, status }) {
  return (
    <div className={`flex items-center gap-3 transition-all duration-500 ${
      status === "done" ? "opacity-100" :
      status === "active" ? "opacity-100" :
      "opacity-30"
    }`}>
      {/* Icon */}
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 border transition-all duration-500 ${
        status === "done"
          ? "bg-emerald-500/15 border-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
          : status === "active"
          ? "bg-blue-500/15 border-blue-500/40 shadow-[0_0_12px_rgba(59,130,246,0.2)]"
          : "bg-neutral-800/60 border-neutral-700/40"
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

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className={`text-[12px] font-semibold transition-colors ${
          status === "done" ? "text-emerald-400" :
          status === "active" ? "text-blue-400" :
          "text-neutral-600"
        }`}>
          {label}
        </p>
        {sublabel && (
          <p className={`text-[10px] font-mono mt-0.5 ${
            status === "active" ? "text-blue-400/60" : "text-neutral-700"
          }`}>
            {sublabel}
          </p>
        )}
      </div>

      {/* Status badge */}
      {status === "done" && (
        <span className="text-[9px] font-bold text-emerald-500 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full">
          DONE
        </span>
      )}
      {status === "active" && (
        <span className="text-[9px] font-bold text-blue-400 bg-blue-950/40 border border-blue-800/40 px-2 py-0.5 rounded-full animate-pulse">
          RUNNING
        </span>
      )}
    </div>
  );
}

// ─── Result Row ───────────────────────────────────────────
function ResultRow({ label, value, mono, link, isDark }) {
  return (
    <div className={`flex gap-3 items-start py-2.5 border-b last:border-0 ${
      isDark ? "border-neutral-800/60" : "border-neutral-100"
    }`}>
      <span className={`text-[10px] uppercase tracking-widest font-mono w-28 flex-shrink-0 pt-0.5 ${
        isDark ? "text-neutral-600" : "text-neutral-400"
      }`}>
        {label}
      </span>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className={`text-[11px] break-all underline font-mono ${
            isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-500"
          }`}
        >
          {value}
        </a>
      ) : (
        <span className={`text-[11px] break-all ${
          mono ? "font-mono" : ""
        } ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
          {value}
        </span>
      )}
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────
export default function Admin() {
  const { isDark } = useTheme();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const handleUpload = async () => {
    if (!file) return;
    if (!title.trim()) { setError("Please enter a news title."); return; }

    const formData = new FormData();
    formData.append("video", file);
    formData.append("title", title);
    formData.append("description", description);

    try {
      setStage("uploading");
      setError("");
      setResult(null);
      setProgress(0);

      const res = await api.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          const pct = Math.round((e.loaded * 100) / e.total);
          setProgress(pct);
          if (pct === 100) setStage("processing");
        },
      });

      setResult(res.data);
      setStage("done");
      setTitle("");
      setDescription("");
      setFile(null);
    } catch (err) {
      console.error(err);
      setError("Upload failed — check backend logs.");
      setStage("error");
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.type === "video/mp4") setFile(dropped);
  };

  const isDisabled = stage === "uploading" || stage === "processing";

  // Dynamic pipeline steps
  const pipelineSteps = [
    { icon: "⬆️", label: "Upload to server", sublabel: "multipart/form-data", status: stage === "idle" || stage === "uploading" ? (progress > 0 && progress < 100 ? "active" : progress === 0 ? "pending" : "done") : "done" },
    { icon: "✂️", label: "FFmpeg segmentation", sublabel: "2s HLS chunks (.ts)", status: stage === "processing" ? "active" : stage === "done" ? "done" : "pending" },
    { icon: "🔐", label: "SHA-256 + Chain Hash", sublabel: "SHA256(hash + prevHash)", status: stage === "processing" ? "active" : stage === "done" ? "done" : "pending" },
    { icon: "📋", label: "C2PA manifest signing", sublabel: "8 assertions • HMAC-SHA256", status: stage === "processing" ? "active" : stage === "done" ? "done" : "pending" },
    { icon: "📌", label: "IPFS upload via Pinata", sublabel: "background • segments + metadata", status: stage === "done" ? "active" : "pending" },
    { icon: "⛓️", label: "Blockchain 3-org endorsement", sublabel: "Sepolia • NewsAgency → Broadcaster → Auditor", status: stage === "done" ? "active" : "pending" },
  ];

  // Theme helpers
  const bg = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const cardBg = isDark ? "bg-neutral-900/60 border-white/8" : "bg-white border-neutral-200";
  const inputBg = isDark
    ? "bg-neutral-800 border-neutral-700 text-white placeholder-neutral-600 focus:border-blue-500/60 focus:ring-blue-500/20"
    : "bg-neutral-50 border-neutral-300 text-neutral-900 placeholder-neutral-400 focus:border-blue-500 focus:ring-blue-500/20";
  const labelColor = isDark ? "text-neutral-500" : "text-neutral-500";
  const text = isDark ? "text-white" : "text-neutral-900";

  return (
    <div className={`min-h-screen ${bg} transition-colors duration-300`}>
      <Navbar />

      <div className="max-w-xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="mb-8 space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-sm shadow-lg shadow-blue-900/30">
              📡
            </div>
            <div>
              <h1 className={`text-xl font-bold tracking-tight ${text}`}>
                Admin Upload Panel
              </h1>
              <p className={`text-[11px] font-mono ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>
                C2PA · IPFS · Sepolia Blockchain
              </p>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className={`rounded-2xl border overflow-hidden shadow-2xl ${cardBg}`}>

          {/* Form Section */}
          <div className="p-6 space-y-5">

            {/* Title */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>
                News Title <span className="text-blue-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Breaking: Election Results 2026"
                value={title}
                onChange={(e) => { setTitle(e.target.value); setError(""); }}
                disabled={isDisabled}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 disabled:opacity-40 transition-all ${inputBg}`}
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>
                Description <span className={isDark ? "text-neutral-700" : "text-neutral-400"}>(optional)</span>
              </label>
              <textarea
                placeholder="Short description of the news segment..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                disabled={isDisabled}
                className={`w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 resize-none disabled:opacity-40 transition-all ${inputBg}`}
              />
            </div>

            {/* File Drop Zone */}
            <div className="space-y-1.5">
              <label className={`text-[10px] font-bold uppercase tracking-widest ${labelColor}`}>
                Video File <span className={isDark ? "text-neutral-700" : "text-neutral-400"}>(MP4)</span>
              </label>
              <label
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                className={`flex items-center gap-4 w-full border-2 border-dashed rounded-xl px-4 py-5 cursor-pointer transition-all duration-200 ${
                  dragOver
                    ? "border-blue-500/60 bg-blue-500/5 scale-[1.01]"
                    : file
                    ? isDark ? "border-emerald-500/40 bg-emerald-500/5" : "border-emerald-400 bg-emerald-50"
                    : isDark ? "border-neutral-700 hover:border-neutral-600 hover:bg-white/2" : "border-neutral-300 hover:border-neutral-400 hover:bg-neutral-100"
                } ${isDisabled ? "opacity-40 pointer-events-none" : ""}`}
              >
                {/* Icon */}
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
                  file
                    ? isDark ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-emerald-100 border border-emerald-200"
                    : isDark ? "bg-neutral-800 border border-neutral-700" : "bg-neutral-200 border border-neutral-300"
                }`}>
                  {file ? "🎬" : "📁"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {file ? (
                    <>
                      <p className={`text-sm font-semibold truncate ${text}`}>{file.name}</p>
                      <p className={`text-[11px] mt-0.5 font-mono ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                        {(file.size / 1024 / 1024).toFixed(2)} MB · MP4
                      </p>
                    </>
                  ) : (
                    <>
                      <p className={`text-sm font-medium ${isDark ? "text-neutral-400" : "text-neutral-500"}`}>
                        Drop video here or click to browse
                      </p>
                      <p className={`text-[11px] mt-0.5 ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>
                        MP4 format · Any size
                      </p>
                    </>
                  )}
                </div>

                {/* Remove */}
                {file && (
                  <button
                    onClick={(e) => { e.preventDefault(); setFile(null); }}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors flex-shrink-0 ${
                      isDark ? "text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800" : "text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100"
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}

                <input type="file" accept="video/mp4" disabled={isDisabled} onChange={(e) => setFile(e.target.files[0])} className="hidden" />
              </label>
            </div>

            {/* Upload Progress */}
            {stage === "uploading" && (
              <div className="space-y-2">
                <div className="flex justify-between text-[11px]">
                  <span className={isDark ? "text-neutral-500" : "text-neutral-400"}>Uploading to server...</span>
                  <span className="text-blue-400 font-mono font-bold">{progress}%</span>
                </div>
                <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`}>
                  <div
                    className="bg-gradient-to-r from-blue-600 to-blue-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <span className="text-red-400 text-sm">{error}</span>
              </div>
            )}

            {/* Upload Button */}
            {stage !== "done" && (
              <button
                onClick={handleUpload}
                disabled={isDisabled || !file || !title.trim()}
                className="w-full relative bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-blue-900/30 hover:shadow-blue-800/40 overflow-hidden group"
              >
                <span className="relative z-10 flex items-center justify-center gap-2">
                  {stage === "uploading" && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {stage === "processing" && <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  {stage === "idle" && (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  )}
                  {stage === "uploading" ? "Uploading..." : stage === "processing" ? "Processing..." : "Upload & Generate Hashes"}
                </span>
              </button>
            )}
          </div>

          {/* Pipeline Panel */}
          {(stage === "processing" || stage === "done") && (
            <div className={`border-t px-6 py-5 space-y-4 ${isDark ? "border-white/6 bg-white/1" : "border-neutral-100 bg-neutral-50/50"}`}>
              <div className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-md flex items-center justify-center ${isDark ? "bg-blue-500/15 border border-blue-500/25" : "bg-blue-100 border border-blue-200"}`}>
                  <svg className="w-2.5 h-2.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                  Processing Pipeline
                </span>
              </div>

              <div className="space-y-3">
                {pipelineSteps.map((step, i) => (
                  <PipelineStep key={i} {...step} />
                ))}
              </div>

              {stage === "done" && (
                <p className={`text-[10px] font-mono pt-1 ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
                  IPFS pinning and blockchain endorsement running in background — check terminal logs.
                </p>
              )}
            </div>
          )}

          {/* Result Panel */}
          {stage === "done" && result && (
            <div className={`border-t px-6 py-5 space-y-4 ${isDark ? "border-white/6" : "border-neutral-100"}`}>
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-md bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                  Upload Complete
                </span>
              </div>

              <div className={`rounded-xl border overflow-hidden ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
                <div className={`px-4 py-1 ${isDark ? "bg-neutral-800/60" : "bg-neutral-100"}`}>
                  {[
                    { label: "Video ID", value: result.videoId, mono: true },
                    { label: "Segments", value: `${result.totalSegments} × 2s chunks` },
                    { label: "C2PA", value: result.c2paStatus || "pending" },
                    { label: "IPFS", value: result.ipfsStatus },
                    { label: "Blockchain", value: result.blockchainStatus },
                  ].map(({ label, value, mono }) => (
                    <ResultRow key={label} label={label} value={value} mono={mono} isDark={isDark} />
                  ))}

                  <ResultRow
                    label="Playlist"
                    value={result.playlistUrl}
                    mono
                    link={`http://localhost:3001${result.playlistUrl}`}
                    isDark={isDark}
                  />

                  {result.metadataCid && (
                    <ResultRow
                      label="IPFS CID"
                      value={result.metadataCid}
                      mono
                      link={`https://gateway.pinata.cloud/ipfs/${result.metadataCid}`}
                      isDark={isDark}
                    />
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setStage("idle"); setResult(null); }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    isDark
                      ? "bg-neutral-800 hover:bg-neutral-700 border-neutral-700 text-neutral-300"
                      : "bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-700"
                  }`}
                >
                  Upload Another
                </button>
                <a
                  href="/"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/20"
                >
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

        {/* Info footer */}
        <p className={`text-center text-[10px] font-mono mt-6 ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
          TrustStream Admin · C2PA v2.2 · Sepolia Testnet · IPFS via Pinata
        </p>
      </div>
    </div>
  );
}