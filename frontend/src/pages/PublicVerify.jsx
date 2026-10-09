import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import { verifyAPI } from "../services/api";
import { useTheme } from "../context/ThemeContext";

// Every verdict the backend can return, with the colour and headline the
// reader actually reacts to. Kept in one table so the page can't drift
// from the API's own vocabulary.
const VERDICTS = {
  authentic: { label: "Authentic", icon: "✅", tone: "emerald",
    headline: "These bytes are exactly what was published." },
  tampered: { label: "Tampered", icon: "🚨", tone: "red",
    headline: "This file has been altered since it was published." },
  pre_publication_master: { label: "Same file", icon: "✅", tone: "emerald",
    headline: "Identical to the file the newsroom submitted." },
  claim_mismatch: { label: "Not this item", icon: "🚨", tone: "red",
    headline: "These bytes are not the published item you compared against." },
  revoked: { label: "Revoked", icon: "⛔", tone: "red",
    headline: "The consortium has withdrawn this item." },
  disputed: { label: "Disputed", icon: "⚠️", tone: "amber",
    headline: "Two organizations have flagged this item." },
  pending: { label: "Not yet approved", icon: "⏳", tone: "amber",
    headline: "This submission hasn't cleared the approval workflow." },
  unknown_record: { label: "Unknown record", icon: "❓", tone: "amber",
    headline: "The provenance manifest names an item this server doesn't have." },
  not_comparable: { label: "Not comparable", icon: "❓", tone: "amber",
    headline: "No registered digest is available to compare against." },
  unregistered: { label: "No provenance", icon: "❌", tone: "neutral",
    headline: "This file was never published through TrustStream." },
};

const TONES = {
  emerald: { dark: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400", light: "bg-emerald-50 border-emerald-200 text-emerald-700" },
  red:     { dark: "bg-red-500/10 border-red-500/30 text-red-400",             light: "bg-red-50 border-red-200 text-red-700" },
  amber:   { dark: "bg-amber-500/10 border-amber-500/30 text-amber-400",       light: "bg-amber-50 border-amber-200 text-amber-700" },
  neutral: { dark: "bg-neutral-800 border-neutral-700 text-neutral-300",       light: "bg-neutral-100 border-neutral-200 text-neutral-600" },
};

const formatBytes = (n) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export default function PublicVerify() {
  const { isDark } = useTheme();
  const fileInput = useRef(null);

  const [file, setFile] = useState(null);
  const [claimedMediaId, setClaimedMediaId] = useState("");
  const [published, setPublished] = useState([]);
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const muted = isDark ? "text-neutral-500" : "text-neutral-500";
  const card = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";

  useEffect(() => {
    verifyAPI.getPublished()
      .then((res) => setPublished(res.data?.items || []))
      .catch(() => setPublished([]));
  }, []);

  const fileKind = file ? (file.type.startsWith("video") ? "video" : "image") : null;

  const pickFile = (picked) => {
    setFile(picked || null);
    setResult(null);
    setError(null);
    setClaimedMediaId("");
  };

  const handleVerify = async () => {
    if (!file) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      if (claimedMediaId) form.append("claimedMediaId", claimedMediaId);
      const res = await verifyAPI.verifyFile(form);
      setResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setChecking(false);
    }
  };

  const downloadReport = () => {
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `truststream-verification-${result.verdict}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const verdict = result ? VERDICTS[result.verdict] || VERDICTS.unregistered : null;
  const tone = verdict ? TONES[verdict.tone][isDark ? "dark" : "light"] : "";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div>
          <h1 className="text-xl font-bold">Verify a file yourself</h1>
          <p className={`text-xs mt-1 leading-relaxed ${muted}`}>
            Drop in any video or image you were sent. TrustStream hashes it in front of you and
            compares that digest with what the three organizations recorded on the ledger — so an
            edited copy of a real news clip is caught even when it looks identical.
            Your file is never stored; only its digest is computed.
          </p>
        </div>

        {/* ── File picker ───────────────────────────────────────── */}
        <div className={`rounded-2xl border p-4 ${card}`}>
          <div
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
            className={`rounded-xl border-2 border-dashed px-4 py-8 text-center cursor-pointer transition-colors ${
              isDark ? "border-neutral-700 hover:border-emerald-500" : "border-neutral-300 hover:border-emerald-400"
            }`}
          >
            <span className="text-3xl block mb-2">{file ? "📄" : "⬆️"}</span>
            {file ? (
              <>
                <p className="text-sm font-semibold truncate">{file.name}</p>
                <p className={`text-[11px] font-mono mt-0.5 ${muted}`}>{formatBytes(file.size)} · {file.type || "unknown type"}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Drop a file here, or click to choose</p>
                <p className={`text-[11px] mt-0.5 ${muted}`}>MP4 video, or JPG / PNG / WebP image</p>
              </>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,image/jpeg,image/png,image/webp"
            onChange={(e) => pickFile(e.target.files?.[0])}
            className="hidden"
          />

          {/* Only needed when an editor stripped the file's own manifest -
              then the reader names what it claims to be and the answer is a
              straight digest comparison against that record. */}
          {published.length > 0 && (
            <div className="mt-3">
              <label className={`text-[11px] block mb-1 ${muted}`}>
                Optional — which published item does this claim to be?
              </label>
              <select
                value={claimedMediaId}
                onChange={(e) => setClaimedMediaId(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${
                  isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-200 text-neutral-900"
                }`}
              >
                <option value="">Let TrustStream work it out from the file</option>
                {published
                  // A video can never hash to an image's digest, so offering
                  // the other kind only invites a meaningless comparison.
                  .filter((item) => !fileKind || item.kind === fileKind)
                  .map((item) => (
                    <option key={item.mediaId} value={item.mediaId}>
                      {item.kind === "video" ? "🎬" : "🖼"} {item.title}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={!file || checking}
            className="w-full mt-3 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {checking ? "Hashing and checking the ledger…" : "Check this file"}
          </button>
          {error && <p className="text-xs text-red-400 mt-2">✗ {error}</p>}
        </div>

        {/* ── Result ────────────────────────────────────────────── */}
        {result && (
          <>
            {result.match?.claimIgnored && (
              <div className={`rounded-2xl border p-3 text-xs ${
                isDark ? "bg-neutral-900 border-neutral-800 text-neutral-400" : "bg-white border-neutral-200 text-neutral-600"
              }`}>
                ℹ️ {result.match.claimIgnored}
              </div>
            )}

            <div className={`rounded-2xl border p-4 ${tone}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">{verdict.icon}</span>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold">{verdict.label} — {verdict.headline}</h2>
                  <p className="text-xs mt-1 leading-relaxed opacity-90">{result.explanation}</p>
                </div>
              </div>
            </div>

            {/* The heart of it: two digests, side by side. */}
            <div className={`rounded-2xl border p-4 ${card}`}>
              <h3 className="text-xs font-bold uppercase tracking-wide mb-3">SHA-256 comparison</h3>
              <div className="space-y-3">
                {result.hash.registeredMaster && (
                  <div>
                    <p className={`text-[10px] uppercase tracking-wide mb-1 ${muted}`}>
                      On the ledger — the file as the newsroom submitted it
                    </p>
                    <p className={`text-[11px] font-mono break-all ${
                      result.hash.matchesSubmittedMaster ? "text-emerald-400" : ""
                    }`}>{result.hash.registeredMaster}</p>
                  </div>
                )}
                <div>
                  <p className={`text-[10px] uppercase tracking-wide mb-1 ${muted}`}>
                    On the ledger — the published copy (carries the C2PA manifest)
                  </p>
                  <p className={`text-[11px] font-mono break-all ${
                    result.hash.matches ? "text-emerald-400" : ""
                  }`}>{result.hash.registered || "— no registered digest found —"}</p>
                </div>
                <div>
                  <p className={`text-[10px] uppercase tracking-wide mb-1 ${muted}`}>Computed from your file just now</p>
                  <p className={`text-[11px] font-mono break-all ${
                    result.hash.matches || result.hash.matchesSubmittedMaster ? "text-emerald-400" : "text-red-400"
                  }`}>{result.hash.uploaded}</p>
                </div>
              </div>
              <div className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${
                result.hash.matches
                  ? (isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700")
                  : result.hash.matchesSubmittedMaster
                    ? (isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700")
                    : (isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700")
              }`}>
                {result.hash.matches
                  ? "✓ Your file's digest is identical to the published copy on the ledger."
                  : result.hash.matchesSubmittedMaster
                    ? `✓ Your file's digest is identical to the submitted file on the ledger — nothing in it has changed. (The published copy differs only by the C2PA manifest embedded into it.${
                        result.hash.masterDigestFrom === "ledger" ? " Both digests are recorded on the ledger itself." : ""
                      })`
                    : "✗ Your file's digest matches neither the submitted file nor the published copy — these are not the same bytes."}
              </div>
            </div>

            <div className={`rounded-2xl border p-4 ${card} space-y-3`}>
              <h3 className="text-xs font-bold uppercase tracking-wide">Other signals</h3>

              <div className="flex items-start gap-2">
                <span className="text-sm">{result.c2pa.present && result.c2pa.valid ? "✅" : result.c2pa.present ? "🚨" : "⚪"}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">
                    C2PA manifest {result.c2pa.present ? (result.c2pa.valid ? "verifies" : "fails verification") : "not present"}
                  </p>
                  <p className={`text-[11px] leading-relaxed ${muted}`}>
                    {result.c2pa.present
                      ? result.c2pa.valid
                        ? `Signed by ${result.c2pa.signer || "the consortium"}; the signature, certificate chain and hash binding all check out against this exact file.`
                        : result.c2pa.error || "The manifest is attached but no longer matches the bytes around it."
                      : "This file carries no embedded provenance manifest — either it was never signed, or an editor stripped it while re-saving."}
                  </p>
                </div>
              </div>

              {result.fabric?.checked && (
                <div className="flex items-start gap-2">
                  <span className="text-sm">{result.fabric.hashMatches ? "✅" : "🚨"}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">Fabric peers agreeing: {result.fabric.agreement || "—"}</p>
                    <p className={`text-[11px] leading-relaxed ${muted}`}>
                      NewsAgency, Broadcaster and Auditor were each asked independently whether this digest is the one they hold.
                    </p>
                  </div>
                </div>
              )}

              {result.record && (
                <div className="flex items-start gap-2">
                  <span className="text-sm">🏛</span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold truncate">Matched record: {result.record.title}</p>
                    <p className={`text-[11px] ${muted}`}>
                      {result.match?.source === "manifest"
                        ? "The file's own C2PA manifest names this item."
                        : result.match?.source === "digest"
                          ? "Matched by digest — these bytes are on the ledger."
                          : "You chose this item to compare against; nothing in the file itself points to it."}
                    </p>
                    <p className={`text-[11px] ${muted}`}>
                      Registered by {result.record.registeredBy} on{" "}
                      {result.record.createdAt ? new Date(result.record.createdAt).toLocaleString() : "an unknown date"} ·
                      ledger status <span className="font-mono">{result.record.status || "unknown"}</span>
                    </p>
                    <Link to={result.record.detailUrl} className="text-[11px] font-mono text-blue-400 hover:text-blue-300">
                      View full provenance ↗
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={downloadReport}
              className={`w-full py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                isDark ? "border-neutral-700 text-neutral-300 hover:border-neutral-500" : "border-neutral-200 text-neutral-600 hover:border-neutral-400"
              }`}
            >
              ⬇ Download this verification as a report
            </button>
          </>
        )}
      </div>
    </div>
  );
}
