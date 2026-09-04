import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { verifyAPI } from "../services/api";
import { useTheme } from "../context/ThemeContext";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "video/mp4"];

export default function PublicVerify() {
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState(null);

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const cardBg = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";

  const runVerify = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    try {
      const res = await verifyAPI.verifyFile(file);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) runVerify(file);
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Verify Content</h1>
          <p className={`text-sm ${textMuted}`}>
            Drop in any image or video and find out whether it's genuine TrustStream-registered content —
            no account needed. Verification runs against the file's own embedded C2PA provenance data
            (real ES256-signed, X.509-trusted) and cross-checks the Hyperledger Fabric ledger.
          </p>
        </div>

        {!result && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={`rounded-2xl border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
              dragOver
                ? isDark ? "border-blue-500 bg-blue-950/20" : "border-blue-400 bg-blue-50"
                : isDark ? "border-neutral-700 bg-neutral-900 hover:border-neutral-600" : "border-neutral-300 bg-white hover:border-neutral-400"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => runVerify(e.target.files?.[0])}
            />
            {busy ? (
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-t-2 border-blue-400 animate-spin" />
                <p className={`text-sm font-mono ${textMuted}`}>Verifying {fileName}…</p>
              </div>
            ) : (
              <div className="space-y-3">
                <span className="text-5xl block">🔍</span>
                <p className="font-semibold">Drop a file here or click to browse</p>
                <p className={`text-xs font-mono ${textMuted}`}>JPG · PNG · WebP · MP4 — up to 100MB</p>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className={`rounded-2xl border p-5 text-sm ${isDark ? "bg-red-950/20 border-red-800/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}>
            ✗ {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Headline verdict */}
            <div className={`rounded-2xl border p-6 text-center space-y-2 ${
              result.matched
                ? isDark ? "bg-emerald-950/20 border-emerald-800/40" : "bg-emerald-50 border-emerald-200"
                : isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
            }`}>
              <span className="text-4xl block">{result.matched ? "✅" : "❓"}</span>
              <p className={`font-bold text-lg ${result.matched ? (isDark ? "text-emerald-400" : "text-emerald-700") : text}`}>
                {result.matched ? "Found on TrustStream" : "Not found on TrustStream"}
              </p>
              <p className={`text-xs ${textMuted}`}>
                {result.matchType === "embedded-c2pa" && "Verified via the file's own embedded C2PA manifest"}
                {result.matchType === "hash-match" && "Matched by exact content hash (no embedded C2PA in this file type)"}
                {result.matchType === "none" && "This file's hash and any embedded provenance data don't match anything in the catalog"}
              </p>
            </div>

            {/* Matched record */}
            {result.match && (
              <div className={`rounded-2xl border p-5 ${cardBg}`}>
                <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>Matched Record</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4"><span className={textMuted}>Title</span><span className="font-semibold text-right">{result.match.title}</span></div>
                  <div className="flex justify-between gap-4"><span className={textMuted}>Type</span><span className="font-mono">{result.match.mediaType}</span></div>
                  <div className="flex justify-between gap-4"><span className={textMuted}>Fabric Status</span><span className="font-mono">{result.match.fabricStatus || "—"}</span></div>
                  <div className="flex justify-between gap-4">
                    <span className={textMuted}>Ledger Status</span>
                    <span className={`font-mono ${result.match.status === "disputed" ? "text-amber-500" : result.match.status === "revoked" ? "text-red-500" : ""}`}>
                      {result.match.status || "—"}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(result.match.detailUrl)}
                  className="mt-4 w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors"
                >
                  View Full Details ↗
                </button>
              </div>
            )}

            {/* C2PA detail */}
            {result.c2pa?.exists && (
              <div className={`rounded-2xl border p-5 ${cardBg}`}>
                <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>Embedded C2PA Manifest</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className={textMuted}>Validation</span>
                    <span className={`font-mono ${result.c2pa.valid ? "text-emerald-500" : "text-amber-500"}`}>{result.c2pa.validation_state}</span>
                  </div>
                  <div className="flex justify-between gap-4"><span className={textMuted}>Signer</span><span className="font-mono text-right">{result.c2pa.signer || "—"}</span></div>
                  <div className="flex justify-between gap-4"><span className={textMuted}>Algorithm</span><span className="font-mono">{result.c2pa.algorithm || "—"}</span></div>
                  {!result.c2pa.valid && result.c2pa.error && (
                    <p className={`text-xs mt-2 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                      ⚠ {result.c2pa.error} — this file carries a C2PA manifest, but not one issued by TrustStream's signing identity.
                    </p>
                  )}
                </div>
              </div>
            )}

            <p className={`text-[10px] font-mono ${textMuted} break-all`}>SHA-256: {result.sha256Hash}</p>

            <button
              onClick={reset}
              className={`w-full py-2.5 rounded-xl border text-sm font-semibold transition-colors ${isDark ? "border-neutral-800 text-neutral-400 hover:text-white" : "border-neutral-200 text-neutral-500 hover:text-neutral-900"}`}
            >
              Verify another file
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
