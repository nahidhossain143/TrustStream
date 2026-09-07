import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import api, { API_ORIGIN } from "../services/api";
import Navbar from "../components/Navbar";
import ForensicPanel from "../components/ForensicPanel";
import VideoPlayer from "../components/VideoPlayer";
import { useTheme } from "../context/ThemeContext";

const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";
const FABRIC_CHANNEL = import.meta.env.VITE_FABRIC_CHANNEL_NAME || "mychannel";
const FABRIC_CHAINCODE = import.meta.env.VITE_FABRIC_CHAINCODE_NAME || "truststreamcc";
const FABRIC_MSP_ID = import.meta.env.VITE_FABRIC_MSP_ID || "Org1MSP";
const FABRIC_PEER = import.meta.env.VITE_FABRIC_PEER_HOST_ALIAS || "peer0.org1.example.com";

function SectionHeader({ icon, title, color = "blue", isDark }) {
  const colors = {
    blue: { bg: "bg-blue-500/15", border: "border-blue-500/25", text: "text-blue-400" },
    emerald: { bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-400" },
    violet: { bg: "bg-violet-500/15", border: "border-violet-500/25", text: "text-violet-400" },
    orange: { bg: "bg-orange-500/15", border: "border-orange-500/25", text: "text-orange-400" },
    pink: { bg: "bg-pink-500/15", border: "border-pink-500/25", text: "text-pink-400" },
  };

  const c = colors[color];

  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-7 h-7 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center text-base`}>
        {icon}
      </div>
      <h2 className={`text-sm font-bold tracking-wide ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>
        {title}
      </h2>
    </div>
  );
}

function InfoRow({ label, value, mono, link, color, isDark }) {
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const textVal = color || (isDark ? "text-neutral-300" : "text-neutral-700");

  return (
    <div className={`flex gap-3 items-start py-2.5 border-b last:border-0 ${isDark ? "border-white/5" : "border-neutral-100"}`}>
      <span className={`text-[10px] uppercase tracking-widest font-mono w-32 flex-shrink-0 pt-0.5 ${textMuted}`}>
        {label}
      </span>

      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] break-all underline font-mono text-blue-400 hover:text-blue-300"
        >
          {value}
        </a>
      ) : (
        <span className={`text-[11px] break-all ${mono ? "font-mono" : ""} ${textVal}`}>
          {value || "—"}
        </span>
      )}
    </div>
  );
}

function StatusBadge({ ok, label }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 ${
      ok
        ? "text-emerald-400 bg-emerald-950/30 border-emerald-800/40"
        : "text-neutral-500 bg-neutral-900/40 border-neutral-800"
    }`}>
      {ok ? "✓" : "—"} {label}
    </span>
  );
}

function ForensicBadge({ forensics }) {
  if (!forensics?.finalLabel) return null;

  const tone =
    forensics.finalLabel === "Authentic"
      ? "text-emerald-400 bg-emerald-950/30 border-emerald-800/40"
      : forensics.finalLabel === "Suspicious"
      ? "text-amber-400 bg-amber-950/30 border-amber-800/40"
      : "text-red-400 bg-red-950/30 border-red-800/40";

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 ${tone}`}>
      ✓ Forensic: {forensics.finalLabel}
    </span>
  );
}

function isFabricReady(manifest) {
  if (manifest?.fabricStatus === "ready") return true;
  if (manifest?.fabricResult && !manifest.fabricResult.skipped && !manifest.fabricError) return true;
  return false;
}

function formatFabricStatus(manifest) {
  if (manifest?.fabricError) return "degraded";
  if (manifest?.fabricResult?.skipped) return "skipped";
  if (isFabricReady(manifest)) return "ready";
  return manifest?.fabricStatus || "pending";
}

export default function VideoDetail() {
  const { isDark } = useTheme();
  const { videoId } = useParams();
  const navigate = useNavigate();

  const [manifest, setManifest] = useState(null);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fabricCheck, setFabricCheck] = useState(null);
  const [fabricCheckLoading, setFabricCheckLoading] = useState(false);
  const [fabricCheckError, setFabricCheckError] = useState(null);

  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [showRawProof, setShowRawProof] = useState(false);

  const [tamperReporting, setTamperReporting] = useState(false);
  const [clearingDispute, setClearingDispute] = useState(false);

  const [playbackSource, setPlaybackSource] = useState("local"); // "local" | "ipfs"
  const [showPlayer, setShowPlayer] = useState(false);

  const reportTamper = () => {
    setTamperReporting(true);
    api
      .post("/upload/report-tamper", { videoId })
      .then(() => api.get(`/upload/videos/${videoId}`))
      .then((res) => setManifest(res.data))
      .catch((err) => alert(err.response?.data?.error || "Tamper report failed"))
      .finally(() => setTamperReporting(false));
  };

  const clearDispute = () => {
    setClearingDispute(true);
    api
      .post(`/upload/${videoId}/clear-dispute`)
      .then(() => api.get(`/upload/videos/${videoId}`))
      .then((res) => setManifest(res.data))
      .catch((err) => alert(err.response?.data?.error || "Clear dispute failed"))
      .finally(() => setClearingDispute(false));
  };

  const checkFabricAuthenticity = () => {
    setFabricCheckLoading(true);
    setFabricCheckError(null);
    setFabricCheck(null);

    api
      .post(`/upload/${videoId}/verify-fabric`)
      .then((res) => setFabricCheck(res.data))
      .catch((err) => setFabricCheckError(err.response?.data?.error || "Check failed"))
      .finally(() => setFabricCheckLoading(false));
  };

  const loadLedgerHistory = () => {
    setHistoryLoading(true);
    setHistoryError(null);

    api
      .get(`/upload/blockchain/fabric-history/video/${videoId}`)
      .then((res) => {
        if (res.data.available) setHistory(res.data.history);
        else setHistoryError(res.data.reason || "History unavailable");
      })
      .catch((err) => setHistoryError(err.response?.data?.error || "Could not load history"))
      .finally(() => setHistoryLoading(false));
  };

  useEffect(() => {
    if (!videoId) return;

    Promise.all([
      api.get(`/upload/videos/${videoId}`),
      api.get(`/upload/videos/${videoId}/segments`),
    ])
      .then(([videoRes, segRes]) => {
        setManifest(videoRes.data);
        setSegments(segRes.data);
      })
      .catch(() => setError("Video not found"))
      .finally(() => setLoading(false));
  }, [videoId]);

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const cardBg = isDark ? "bg-neutral-900/40 border-white/8" : "bg-white border-neutral-200";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";

  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border border-blue-500/20" />
            <div className="absolute inset-0 rounded-full border-t border-blue-500 animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !manifest) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className={`text-lg font-semibold ${text}`}>Video not found</p>
            <button onClick={() => navigate("/")} className="text-blue-400 hover:underline text-sm">
              ← Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const disputed = manifest.fabricResult?.status === "disputed";

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="space-y-3">
          <button
            onClick={() => navigate("/")}
            className={`flex items-center gap-2 text-[11px] font-mono transition-colors ${textMuted} hover:text-blue-400`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to feed
          </button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className={`text-2xl font-bold tracking-tight ${text}`}>{manifest.title}</h1>
              {manifest.description && (
                <p className={`text-sm mt-1 ${textMuted}`}>{manifest.description}</p>
              )}
            </div>

            <div className="flex gap-2 flex-wrap">
              <StatusBadge ok={manifest.c2paStatus === "signed"} label="C2PA" />
              <StatusBadge ok={manifest.ipfsStatus === "uploaded"} label="IPFS" />
              <StatusBadge ok={isFabricReady(manifest)} label="Fabric" />
              {disputed && (
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 text-red-400 bg-red-950/30 border-red-800/40">
                  ⚠ Disputed
                </span>
              )}
              <ForensicBadge forensics={manifest.forensics} />

              <Link
                to={`/timeline/video/${videoId}`}
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 ${
                  isDark
                    ? "text-cyan-300 bg-cyan-950/20 border-cyan-800/40 hover:bg-cyan-900/30"
                    : "text-cyan-700 bg-cyan-50 border-cyan-200 hover:bg-cyan-100"
                }`}
              >
                View Audit Trail
              </Link>

              <Link
                to="/fabric-audit"
                className={`inline-flex items-center gap-1.5 text-[10px] font-semibold border rounded-full px-2.5 py-1 ${
                  isDark
                    ? "text-violet-300 bg-violet-950/20 border-violet-800/40 hover:bg-violet-900/30"
                    : "text-violet-700 bg-violet-50 border-violet-200 hover:bg-violet-100"
                }`}
              >
                Fabric Audit
              </Link>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="▶" title="Watch" color="blue" isDark={isDark} />
            <p className={`text-[11px] mb-3 ${textMuted}`}>
              Default playback streams from this server's local HLS cache (fast, reliable). The same content
              is independently pinned to IPFS — switch sources below to prove it's really there. Public IPFS
              gateways are meaningfully slower and rate-limit aggressively (a real segment fetch took ~8s and
              was rate-limited on repeat requests when we measured it), so expect buffering — that's the honest
              cost of true decentralization, not a bug.
            </p>
            <div className={`flex gap-1 rounded-lg p-0.5 w-fit mb-4 ${isDark ? "bg-neutral-800" : "bg-neutral-100"}`}>
              {[
                { key: "local", label: "⚡ Local Cache" },
                { key: "ipfs", label: "🌐 Direct from IPFS" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setPlaybackSource(key); setShowPlayer(true); }}
                  className={`text-[11px] font-mono px-3 py-1.5 rounded-md transition-all ${
                    showPlayer && playbackSource === key
                      ? (isDark ? "bg-white/10 text-white" : "bg-white text-neutral-900 shadow-sm")
                      : textMuted
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {showPlayer && (
              <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: "16/9" }}>
                <VideoPlayer
                  videoId={manifest.videoId}
                  playlistUrl={
                    playbackSource === "ipfs"
                      ? `${API_ORIGIN}/api/upload/ipfs-playlist/${manifest.videoId}`
                      : `${API_ORIGIN}${manifest.playlistUrl}`
                  }
                  posterUrl={manifest.thumbnailUrl ? `${API_ORIGIN}${manifest.thumbnailUrl}` : undefined}
                  onVerify={() => {}}
                />
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📄" title="Video Metadata" color="blue" isDark={isDark} />
            <InfoRow label="Video ID" value={manifest.videoId} mono isDark={isDark} />
            <InfoRow label="Title" value={manifest.title} isDark={isDark} />
            <InfoRow label="Description" value={manifest.description} isDark={isDark} />
            <InfoRow label="Created At" value={new Date(manifest.createdAt).toLocaleString()} isDark={isDark} />
            <InfoRow label="Total Segments" value={manifest.totalSegments} isDark={isDark} />
            <InfoRow label="Duration" value={`${(manifest.totalDurationSeconds || 0).toFixed(1)}s`} isDark={isDark} />
            <InfoRow label="Status" value={manifest.status} isDark={isDark} />
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="🏛" title="Hyperledger Fabric Proof" color="violet" isDark={isDark} />
            <InfoRow label="Status" value={formatFabricStatus(manifest)} isDark={isDark} />
            <InfoRow label="Network" value="Fabric test-network" isDark={isDark} />
            <InfoRow label="Channel" value={FABRIC_CHANNEL} mono isDark={isDark} />
            <InfoRow label="Chaincode" value={FABRIC_CHAINCODE} mono isDark={isDark} />
            <InfoRow label="Peer" value={FABRIC_PEER} mono isDark={isDark} />
            <InfoRow label="MSP" value={FABRIC_MSP_ID} mono isDark={isDark} />
            <InfoRow label="Ledger Record" value={isFabricReady(manifest) ? "saved" : null} isDark={isDark} />
            <InfoRow label="Media Type" value={manifest.fabricResult?.mediaType || "video"} isDark={isDark} />
            <InfoRow label="Media ID" value={manifest.fabricResult?.mediaId || manifest.videoId} mono isDark={isDark} />
            <InfoRow label="Created By" value={manifest.fabricResult?.createdBy || null} mono isDark={isDark} />
            <InfoRow
              label="Created At"
              value={manifest.fabricResult?.createdAt ? new Date(manifest.fabricResult.createdAt).toLocaleString() : null}
              isDark={isDark}
            />
            <InfoRow
              label="Updated At"
              value={manifest.fabricResult?.updatedAt ? new Date(manifest.fabricResult.updatedAt).toLocaleString() : null}
              isDark={isDark}
            />
            <InfoRow label="Error" value={manifest.fabricError || null} color="text-red-400" isDark={isDark} />

            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                Fabric Consortium Endorsements
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "NewsAgency", role: "Submitter", icon: "🏢", color: "text-emerald-400" },
                  { name: "Broadcaster", role: "Endorser", icon: "📡", color: "text-blue-400" },
                  { name: "Auditor", role: "Endorser", icon: "🔍", color: "text-violet-400" },
                ].map(({ name, role, icon, color }) => {
                  const endorsed = Boolean(manifest.fabricResult?.endorsements?.[name]);
                  const endorsingPeer = manifest.fabricResult?.endorsingPeers?.[name];

                  return (
                    <div
                      key={name}
                      className={`rounded-xl p-3 border text-center ${
                        endorsed
                          ? isDark
                            ? "bg-emerald-950/20 border-emerald-800/40"
                            : "bg-emerald-50 border-emerald-200"
                          : isDark
                          ? "bg-neutral-800/40 border-neutral-700"
                          : "bg-neutral-50 border-neutral-200"
                      }`}
                    >
                      <div className="text-xl mb-1">{icon}</div>
                      <p className={`text-[11px] font-semibold ${color}`}>{name}</p>
                      <p className={`text-[9px] ${textMuted}`}>{role}</p>
                      <p className={`text-[9px] mt-1 font-mono ${endorsed ? "text-emerald-400" : textMuted}`}>
                        {endorsed ? "✓ Endorsed" : "— Pending"}
                      </p>
                      {endorsingPeer && (
                        <p className={`text-[8px] mt-0.5 font-mono truncate ${textMuted}`} title={endorsingPeer}>
                          via {endorsingPeer.split(".")[0]}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className={`pt-3 mt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                Tamper Reports &amp; Dispute
              </p>

              {disputed ? (
                <div
                  className={`rounded-xl p-4 border mb-3 ${
                    isDark ? "bg-red-950/20 border-red-800/40" : "bg-red-50 border-red-200"
                  }`}
                >
                  <p className="text-sm font-bold text-red-400">
                    ⚠ Disputed — 2 of 3 orgs reported possible tampering
                  </p>
                  <p className={`text-[10px] font-mono mt-1 ${textMuted}`}>
                    Reporting orgs: {Object.keys(manifest.fabricResult?.tamperReports || {}).join(", ") || "—"}
                  </p>
                  <button
                    onClick={clearDispute}
                    disabled={clearingDispute}
                    className={`w-full mt-3 rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                      clearingDispute
                        ? "opacity-60 cursor-wait"
                        : "bg-emerald-950/30 border-emerald-800/40 text-emerald-300 hover:bg-emerald-950/50"
                    }`}
                  >
                    {clearingDispute ? "Clearing…" : "✓ Clear Dispute (Auditor only)"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={reportTamper}
                  disabled={tamperReporting}
                  className={`w-full rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                    tamperReporting
                      ? "opacity-60 cursor-wait"
                      : isDark
                      ? "bg-amber-950/30 border-amber-800/40 text-amber-300 hover:bg-amber-950/50"
                      : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  {tamperReporting ? "Reporting…" : "🚩 Report Tamper"}
                </button>
              )}
            </div>

            <div className={`pt-3 mt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                Check Authenticity
              </p>

              <button
                onClick={checkFabricAuthenticity}
                disabled={fabricCheckLoading}
                className={`w-full rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                  fabricCheckLoading
                    ? "opacity-60 cursor-wait"
                    : isDark
                    ? "bg-violet-950/30 border-violet-800/40 text-violet-300 hover:bg-violet-950/50"
                    : "bg-violet-50 border-violet-200 text-violet-700 hover:bg-violet-100"
                }`}
              >
                {fabricCheckLoading
                  ? "Re-hashing segments and checking ledger…"
                  : "🔎 Check Authenticity"}
              </button>

              {fabricCheckError && (
                <p className="text-[11px] text-red-400 mt-2 font-mono">{fabricCheckError}</p>
              )}

              {fabricCheck && (
                <div
                  className={`mt-3 rounded-xl p-4 border ${
                    fabricCheck.authentic
                      ? isDark
                        ? "bg-emerald-950/20 border-emerald-800/40"
                        : "bg-emerald-50 border-emerald-200"
                      : isDark
                      ? "bg-red-950/20 border-red-800/40"
                      : "bg-red-50 border-red-200"
                  }`}
                >
                  <p
                    className={`text-sm font-bold ${
                      fabricCheck.authentic ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {fabricCheck.authentic
                      ? "✓ Authentic — matches the ledger"
                      : fabricCheck.fabric?.revoked
                      ? "✗ Endorsement withdrawn by the consortium"
                      : "✗ Does not match the ledger"}
                  </p>
                  <div className={`mt-2 space-y-1 text-[10px] font-mono ${textMuted}`}>
                    <p>File on disk intact: {fabricCheck.fileIntact ? "yes" : "no — content changed"}</p>
                    <p>
                      Fabric record valid:{" "}
                      {fabricCheck.fabric?.available
                        ? fabricCheck.fabric.valid
                          ? "yes"
                          : fabricCheck.fabric.revoked
                          ? "no — revoked (hash still matches)"
                          : "no — hash mismatch"
                        : `unavailable (${fabricCheck.fabric?.reason || "unknown"})`}
                    </p>
                    {fabricCheck.fabric?.revoked && fabricCheck.fabric?.proof?.revocationReason && (
                      <p>Reason: {fabricCheck.fabric.proof.revocationReason}</p>
                    )}
                    <p className="break-all">Current hash: {fabricCheck.currentMerkleRoot}</p>
                    <p className="break-all">Registered hash: {fabricCheck.registeredMerkleRoot}</p>
                  </div>
                </div>
              )}

              {/* Ledger history — every version this record has held, read from
                  Fabric's history index rather than current state. */}
              <div className={`mt-5 pt-5 border-t ${isDark ? "border-white/8" : "border-neutral-200"}`}>
                <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>
                  Ledger History
                </p>

                <button
                  onClick={loadLedgerHistory}
                  disabled={historyLoading}
                  className={`w-full rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                    historyLoading
                      ? "opacity-60 cursor-wait"
                      : isDark
                      ? "bg-neutral-900/60 border-white/10 text-neutral-300 hover:bg-neutral-800"
                      : "bg-neutral-50 border-neutral-200 text-neutral-700 hover:bg-neutral-100"
                  }`}
                >
                  {historyLoading ? "Reading the ledger…" : "📜 Show ledger history"}
                </button>

                {historyError && (
                  <p className="text-[11px] text-red-400 mt-2 font-mono">{historyError}</p>
                )}

                {history && (
                  <div className="mt-3 space-y-2">
                    {history.length === 0 && (
                      <p className={`text-[11px] font-mono ${textMuted}`}>No ledger entries found.</p>
                    )}
                    {history.map((entry) => {
                      const revoked = entry.value?.status === "revoked";
                      return (
                        <div
                          key={entry.txId}
                          className={`rounded-xl border px-3 py-2.5 ${
                            revoked
                              ? isDark
                                ? "border-red-800/40 bg-red-950/15"
                                : "border-red-200 bg-red-50"
                              : isDark
                              ? "border-white/8 bg-neutral-900/40"
                              : "border-neutral-200 bg-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider ${
                                revoked ? "text-red-400" : "text-emerald-400"
                              }`}
                            >
                              {revoked ? "Revoked" : "Registered"}
                            </span>
                            <span className={`text-[10px] font-mono ${textMuted}`}>
                              {new Date(entry.timestamp).toLocaleString()}
                            </span>
                          </div>
                          <p className={`text-[10px] font-mono mt-1.5 break-all ${textMuted}`}>
                            tx {entry.txId}
                          </p>
                          {revoked && entry.value?.revocationReason && (
                            <p className={`text-[10px] font-mono mt-1 ${isDark ? "text-red-400/80" : "text-red-700"}`}>
                              {entry.value.revocationReason}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {manifest.fabricResult && (
              <div className={`pt-3 mt-3 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
                <button
                  onClick={() => setShowRawProof((v) => !v)}
                  className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border transition-colors ${
                    isDark ? "border-white/10 text-neutral-400 hover:border-white/20" : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
                  }`}
                >
                  {showRawProof ? "▾ Hide raw ledger JSON" : "▸ View raw ledger JSON"}
                </button>

                {showRawProof && (
                  <pre className={`mt-2 rounded-xl p-3 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all ${
                    isDark ? "bg-neutral-950 border border-white/8 text-neutral-300" : "bg-neutral-50 border border-neutral-200 text-neutral-700"
                  }`}>
                    {JSON.stringify(manifest.fabricResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📌" title="IPFS Storage" color="orange" isDark={isDark} />
            <InfoRow label="Provider" value="Pinata" isDark={isDark} />
            <InfoRow label="Status" value={manifest.ipfsStatus} isDark={isDark} />
            <InfoRow
              label="Metadata CID"
              value={manifest.metadataCid}
              mono
              link={manifest.metadataCid ? `${IPFS_GATEWAY}/${manifest.metadataCid}` : null}
              isDark={isDark}
            />
            <InfoRow label="Metadata URL" value={manifest.metadataUrl} mono link={manifest.metadataUrl} isDark={isDark} />
            <InfoRow label="Content" value="Video segments (.ts) + metadata JSON" isDark={isDark} />
          </div>
        </div>

        <ForensicPanel
          forensicStatus={manifest.forensicStatus}
          forensicError={manifest.forensicError}
          forensicReportCid={manifest.forensicReportCid}
          forensicReportUrl={manifest.forensicReportUrl}
          forensics={manifest.forensics}
          isDark={isDark}
        />

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📋" title="C2PA Provenance" color="violet" isDark={isDark} />
            <InfoRow label="Spec Version" value="C2PA v2.2" isDark={isDark} />
            <InfoRow label="Status" value={manifest.c2paStatus} isDark={isDark} />
            <InfoRow label="Assertions" value="6 per segment" isDark={isDark} />
            <InfoRow label="Algorithm" value="ES256 (P-256 ECDSA, X.509 cert chain)" isDark={isDark} />
            <InfoRow label="Signer" value="TrustStream C2PA Signer" isDark={isDark} />
            <InfoRow label="Format" value="Sidecar .c2pa file per .ts segment (MPEG-TS isn't C2PA-embeddable — the source MP4 gets real embedded C2PA instead, see below)" isDark={isDark} />

            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>6 Assertions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Hash Binding", icon: "🔒", value: "c2pa.hash.data" },
                  { label: "Actions", icon: "⚡", value: "c2pa.actions" },
                  { label: "Creative Work", icon: "🎬", value: "schema-org" },
                  { label: "Timestamp", icon: "⏰", value: "c2pa.timestamp" },
                  { label: "Consortium", icon: "🏢", value: "truststream.consortium" },
                  { label: "Chain Hash", icon: "⛓", value: "truststream.chain_hash" },
                ].map(({ label, icon, value }) => (
                  <div
                    key={value}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                      isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                    }`}
                  >
                    <span className="text-[11px]">{icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[10px] font-semibold ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>{label}</p>
                      <p className={`text-[9px] font-mono truncate ${textMuted}`}>{value}</p>
                    </div>
                    <span className="text-[9px] text-emerald-500">✓</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="🎬" title="Source MP4 Provenance" color="violet" isDark={isDark} />
            <p className={`text-[11px] mb-3 ${textMuted}`}>
              Unlike the per-segment sidecars above, the original MP4 (before HLS splitting) is a real C2PA-embeddable
              container — a genuine, spec-compliant manifest is embedded directly into its bytes and pinned to IPFS.
            </p>
            <InfoRow label="Status" value={manifest.sourceC2paStatus} isDark={isDark} />
            <InfoRow label="Manifest Hash" value={manifest.sourceC2paManifestHash} mono isDark={isDark} />
            <InfoRow label="Instance ID" value={manifest.sourceC2paInstanceId} mono isDark={isDark} />
            <InfoRow label="IPFS CID" value={manifest.sourceIpfsCid} mono isDark={isDark} />
          </div>
        </div>

        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="🔐" title="Segment Hashes" color="pink" isDark={isDark} />
            <p className={`text-[11px] mb-4 ${textMuted}`}>
              SHA-256 chain hash links all segments sequentially. Modifying any segment breaks the chain.
            </p>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {segments.map((seg) => (
                <div
                  key={seg.segmentIndex}
                  className={`rounded-xl border p-3 space-y-1.5 ${
                    isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold font-mono ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                      SEG_{String(seg.segmentIndex).padStart(3, "0")}
                    </span>

                    <div className="flex gap-1.5">
                      {seg.c2paSigned && (
                        <span className="text-[9px] text-violet-500 bg-violet-950/30 border border-violet-800/40 px-1.5 py-0.5 rounded-md font-mono">
                          📋 C2PA
                        </span>
                      )}
                      {seg.ipfsCid && (
                        <span className="text-[9px] text-orange-500 bg-orange-950/30 border border-orange-800/40 px-1.5 py-0.5 rounded-md font-mono">
                          📌 IPFS
                        </span>
                      )}
                    </div>
                  </div>

                  <p className={`font-mono text-[9px] break-all leading-relaxed ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>
                    SHA256: <span className={isDark ? "text-blue-400/80" : "text-blue-600"}>{seg.sha256Hash}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <p className={`text-center text-[9px] font-mono ${textMuted}`}>
          TrustStream v1.0 · C2PA v2.2 · Hyperledger Fabric · IPFS via Pinata
        </p>
      </div>
    </div>
  );
}