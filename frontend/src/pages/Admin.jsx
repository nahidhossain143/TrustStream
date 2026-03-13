import { useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";

export default function Admin() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [stage, setStage] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    if (!title.trim()) {
      setError("Please enter a news title.");
      return;
    }

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

  const isDisabled = stage === "uploading" || stage === "processing";

  const steps = [
    { label: "File uploaded to server", done: true },
    { label: "FFmpeg segmenting into 2s chunks", done: false, active: true },
    { label: "SHA-256 hashing each segment", done: false },
    { label: "IPFS upload via Pinata", done: false },
    { label: "Blockchain 3-org endorsement", done: false },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-gray-100">
      <Navbar />

      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-base">
              📡
            </div>
            <h1 className="text-xl font-bold text-white">Admin Upload Panel</h1>
          </div>
          <p className="text-xs text-neutral-600 ml-11">
            Upload news video for IPFS + blockchain-authenticated streaming
          </p>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl shadow-black/40 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              News Title <span className="text-blue-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Breaking: Election Results 2026"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setError("");
              }}
              disabled={isDisabled}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-40 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Description <span className="text-neutral-700">(optional)</span>
            </label>
            <textarea
              placeholder="Short description of the news..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              disabled={isDisabled}
              className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 resize-none disabled:opacity-40 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">
              Video File <span className="text-neutral-600">(MP4)</span>
            </label>
            <label
              className={`flex items-center gap-4 w-full bg-neutral-800 border border-dashed rounded-xl px-4 py-4 cursor-pointer transition ${
                file
                  ? "border-blue-500/40 bg-blue-500/5"
                  : "border-neutral-700 hover:border-neutral-600"
              } ${isDisabled ? "opacity-40 pointer-events-none" : ""}`}
            >
              <div className="w-9 h-9 rounded-lg bg-neutral-700 flex items-center justify-center text-lg flex-shrink-0">
                {file ? "🎬" : "📁"}
              </div>
              <div className="flex-1 min-w-0">
                {file ? (
                  <>
                    <p className="text-sm text-white font-medium truncate">{file.name}</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-neutral-400">Click to select video</p>
                    <p className="text-xs text-neutral-600 mt-0.5">MP4 format supported</p>
                  </>
                )}
              </div>
              {file && (
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setFile(null);
                  }}
                  className="text-neutral-600 hover:text-neutral-400 text-lg flex-shrink-0"
                >
                  ×
                </button>
              )}
              <input
                type="file"
                accept="video/mp4"
                disabled={isDisabled}
                onChange={(e) => setFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          {stage === "uploading" && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-neutral-500">
                <span>Uploading to server...</span>
                <span className="text-blue-400 font-mono">{progress}%</span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {stage === "processing" && (
            <div className="bg-neutral-800/60 border border-neutral-700/60 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="text-sm font-medium text-blue-400">
                  Processing pipeline running...
                </span>
              </div>

              <div className="space-y-2">
                {steps.map((step, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2.5 text-xs transition-all ${
                      step.done
                        ? "text-emerald-400"
                        : step.active
                        ? "text-yellow-400"
                        : "text-neutral-600"
                    }`}
                  >
                    {step.done ? (
                      <span className="w-3.5 h-3.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-[9px] flex-shrink-0">
                        ✓
                      </span>
                    ) : step.active ? (
                      <div className="w-3.5 h-3.5 border border-yellow-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-neutral-700 flex-shrink-0" />
                    )}
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>

              <p className="text-[10px] text-neutral-600 mt-1">
                Video is playable immediately. IPFS pinning and blockchain endorsement continue in background.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
              <span className="text-red-400 text-sm">⚠️ {error}</span>
            </div>
          )}

          {stage !== "done" && (
            <button
              onClick={handleUpload}
              disabled={isDisabled || !file}
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {stage === "uploading"
                ? "Uploading..."
                : stage === "processing"
                ? "Processing..."
                : "Upload & Generate Hashes"}
            </button>
          )}

          {stage === "done" && result && (
            <div className="space-y-4">
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-xs">
                    ✓
                  </span>
                  <span className="text-sm font-semibold text-emerald-400">
                    Upload Complete
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    { label: "Video ID", value: result.videoId, mono: true },
                    { label: "Total Segments", value: result.totalSegments, mono: false },
                  ].map(({ label, value, mono }) => (
                    <div key={label} className="flex gap-3 items-start">
                      <span className="text-neutral-600 w-28 flex-shrink-0">{label}</span>
                      <span
                        className={`text-neutral-300 break-all ${mono ? "font-mono" : ""}`}
                      >
                        {value}
                      </span>
                    </div>
                  ))}

                  <div className="flex gap-3 items-start">
                    <span className="text-neutral-600 w-28 flex-shrink-0">Playlist</span>
                    <a
                      href={`http://localhost:3001${result.playlistUrl}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline font-mono break-all"
                    >
                      {result.playlistUrl}
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-orange-950/20 border border-orange-900/30 rounded-lg px-3 py-2.5 mt-2">
                  <span className="text-orange-400 text-sm mt-0.5">📌</span>
                  <div>
                    <p className="text-[11px] font-semibold text-orange-400">
                      IPFS Pinning in Progress
                    </p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      Watch backend logs for{" "}
                      <span className="font-mono text-orange-400/70">
                        📌 IPFS: seg_xxx.ts → CID
                      </span>
                      .
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 bg-blue-950/20 border border-blue-900/30 rounded-lg px-3 py-2.5">
                  <span className="text-blue-400 text-sm mt-0.5">⛓️</span>
                  <div>
                    <p className="text-[11px] font-semibold text-blue-400">
                      Blockchain Registration in Progress
                    </p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      Watch for{" "}
                      <span className="font-mono text-blue-400/70">
                        ⛓️ Segment N: registered + endorsed ✅
                      </span>
                      .
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setStage("idle");
                  setResult(null);
                }}
                className="w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 py-2.5 rounded-xl text-sm font-medium transition"
              >
                Upload Another Video
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}