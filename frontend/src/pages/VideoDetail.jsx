import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || "";
const IPFS_GATEWAY = "https://gateway.pinata.cloud/ipfs";

// ─── Section Header ───────────────────────────────────────
function SectionHeader({ icon, title, color = "blue", isDark }) {
  const colors = {
    blue:   { bg: "bg-blue-500/15",   border: "border-blue-500/25",   text: "text-blue-400" },
    emerald:{ bg: "bg-emerald-500/15", border: "border-emerald-500/25", text: "text-emerald-400" },
    violet: { bg: "bg-violet-500/15", border: "border-violet-500/25", text: "text-violet-400" },
    orange: { bg: "bg-orange-500/15", border: "border-orange-500/25", text: "text-orange-400" },
    pink:   { bg: "bg-pink-500/15",   border: "border-pink-500/25",   text: "text-pink-400" },
  };
  const c = colors[color];
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className={`w-7 h-7 rounded-lg ${c.bg} border ${c.border} flex items-center justify-center text-base`}>
        {icon}
      </div>
      <h2 className={`text-sm font-bold tracking-wide ${isDark ? "text-neutral-300" : "text-neutral-700"}`}>{title}</h2>
    </div>
  );
}

// ─── Info Row ─────────────────────────────────────────────
function InfoRow({ label, value, mono, link, color, isDark }) {
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const textVal = color || (isDark ? "text-neutral-300" : "text-neutral-700");

  return (
    <div className={`flex gap-3 items-start py-2.5 border-b last:border-0 ${isDark ? "border-white/5" : "border-neutral-100"}`}>
      <span className={`text-[10px] uppercase tracking-widest font-mono w-32 flex-shrink-0 pt-0.5 ${textMuted}`}>{label}</span>
      {link ? (
        <a href={link} target="_blank" rel="noreferrer"
          className="text-[11px] break-all underline font-mono text-blue-400 hover:text-blue-300">
          {value}
        </a>
      ) : (
        <span className={`text-[11px] break-all ${mono ? "font-mono" : ""} ${textVal}`}>{value || "—"}</span>
      )}
    </div>
  );
}

// ─── Badge ────────────────────────────────────────────────
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

// ─── Main ────────────────────────────────────────────────
export default function VideoDetail() {
  const { isDark } = useTheme();
  const { videoId } = useParams();
  const navigate = useNavigate();

  const [manifest, setManifest] = useState(null);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
            <button onClick={() => navigate("/")} className="text-blue-400 hover:underline text-sm">← Back to home</button>
          </div>
        </div>
      </div>
    );
  }

  const totalGasEth = manifest.totalGasUsed ? (manifest.totalGasUsed / 1e18).toFixed(8) : null;

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Back + Title */}
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
              <StatusBadge ok={manifest.blockchainStatus === "ready"} label="Blockchain" />
              <StatusBadge ok={manifest.c2paStatus === "signed"} label="C2PA" />
              <StatusBadge ok={manifest.ipfsStatus === "uploaded"} label="IPFS" />
            </div>
          </div>
        </div>

        {/* ─── Metadata ─────────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📄" title="Video Metadata" color="blue" isDark={isDark} />
            <InfoRow label="Video ID"     value={manifest.videoId}    mono isDark={isDark} />
            <InfoRow label="Title"        value={manifest.title}           isDark={isDark} />
            <InfoRow label="Description"  value={manifest.description}     isDark={isDark} />
            <InfoRow label="Created At"   value={new Date(manifest.createdAt).toLocaleString()} isDark={isDark} />
            <InfoRow label="Total Segments" value={`${manifest.totalSegments} × 2s`} isDark={isDark} />
            <InfoRow label="Duration"     value={`${(manifest.totalSegments * 2)}s`} isDark={isDark} />
            <InfoRow label="Status"       value={manifest.status}          isDark={isDark} />
          </div>
        </div>

        {/* ─── Blockchain ───────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="⛓" title="Blockchain Info" color="emerald" isDark={isDark} />
            <InfoRow label="Network"      value="Ethereum Sepolia Testnet"  isDark={isDark} />
            <InfoRow label="Chain ID"     value="11155111"                  isDark={isDark} />
            <InfoRow label="Contract"     value={CONTRACT_ADDRESS}    mono
              link={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`} isDark={isDark} />
            <InfoRow label="Status"       value={manifest.blockchainStatus} isDark={isDark} />
            <InfoRow label="TX Hash"      value={manifest.videoTxHash} mono
              link={manifest.videoTxHash ? `https://sepolia.etherscan.io/tx/${manifest.videoTxHash}` : null}
              isDark={isDark} />
            <InfoRow label="Block"        value={manifest.videoBlockNumber?.toString()} mono isDark={isDark} />
            <InfoRow label="Total Gas"    value={manifest.totalGasUsed ? `${manifest.totalGasUsed.toLocaleString()} units` : null} isDark={isDark} />
            <InfoRow label="Gas (ETH)"    value={totalGasEth ? `${totalGasEth} ETH` : null} isDark={isDark} />
            <InfoRow label="RPC Provider" value="Alchemy"               isDark={isDark} />

            {/* Org endorsements */}
            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>3-Org Consortium</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "NewsAgency", role: "Submitter", icon: "🏢", color: "text-emerald-400" },
                  { name: "Broadcaster", role: "Endorser", icon: "📡", color: "text-blue-400" },
                  { name: "Auditor", role: "Endorser", icon: "🔍", color: "text-violet-400" },
                ].map(({ name, role, icon, color }) => (
                  <div key={name} className={`rounded-xl p-3 border text-center ${isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}>
                    <div className="text-xl mb-1">{icon}</div>
                    <p className={`text-[11px] font-semibold ${color}`}>{name}</p>
                    <p className={`text-[9px] ${textMuted}`}>{role}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ─── IPFS ─────────────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📌" title="IPFS Storage" color="orange" isDark={isDark} />
            <InfoRow label="Provider"     value="Pinata"                isDark={isDark} />
            <InfoRow label="Status"       value={manifest.ipfsStatus}   isDark={isDark} />
            <InfoRow label="Metadata CID" value={manifest.metadataCid} mono
              link={manifest.metadataCid ? `${IPFS_GATEWAY}/${manifest.metadataCid}` : null}
              isDark={isDark} />
            <InfoRow label="Metadata URL" value={manifest.metadataUrl} mono
              link={manifest.metadataUrl} isDark={isDark} />
            <InfoRow label="Content"      value="Video segments (.ts) + metadata JSON" isDark={isDark} />
          </div>
        </div>

        {/* ─── C2PA ─────────────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="📋" title="C2PA Provenance" color="violet" isDark={isDark} />
            <InfoRow label="Spec Version" value="C2PA v2.2"            isDark={isDark} />
            <InfoRow label="Status"       value={manifest.c2paStatus}  isDark={isDark} />
            <InfoRow label="Assertions"   value="8 per segment"        isDark={isDark} />
            <InfoRow label="Algorithm"    value="HMAC-SHA256"          isDark={isDark} />
            <InfoRow label="Signer"       value="NewsAgency"           isDark={isDark} />
            <InfoRow label="Format"       value="Sidecar .c2pa file per .ts segment" isDark={isDark} />

            {/* Assertion list */}
            <div className={`pt-3 mt-1 border-t ${isDark ? "border-white/5" : "border-neutral-100"}`}>
              <p className={`text-[10px] uppercase tracking-widest font-mono mb-3 ${textMuted}`}>8 Assertions</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Hash Binding",    icon: "🔒", value: "c2pa.hash.data" },
                  { label: "Actions",         icon: "⚡", value: "c2pa.actions" },
                  { label: "Claim Generator", icon: "🏭", value: "c2pa.claim_generator" },
                  { label: "Creative Work",   icon: "🎬", value: "schema-org" },
                  { label: "Ingredient",      icon: "🧬", value: "c2pa.ingredient" },
                  { label: "Timestamp",       icon: "⏰", value: "c2pa.timestamp" },
                  { label: "Consortium",      icon: "🏢", value: "truststream.consortium" },
                  { label: "Chain Hash",      icon: "⛓", value: "truststream.chain_hash" },
                ].map(({ label, icon, value }) => (
                  <div key={value} className={`flex items-center gap-2 rounded-lg px-3 py-2 border ${
                    isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                  }`}>
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

        {/* ─── Segments ─────────────────────────────── */}
        <div className={`rounded-2xl border overflow-hidden ${cardBg}`}>
          <div className="px-6 py-5">
            <SectionHeader icon="🔐" title="Segment Hashes" color="pink" isDark={isDark} />
            <p className={`text-[11px] mb-4 ${textMuted}`}>
              SHA-256 chain hash links all segments sequentially. Modifying any segment breaks the chain.
            </p>

            <div className="space-y-2 max-h-80 overflow-y-auto">
              {segments.map((seg) => (
                <div key={seg.segmentIndex} className={`rounded-xl border p-3 space-y-1.5 ${
                  isDark ? "bg-neutral-800/40 border-neutral-700" : "bg-neutral-50 border-neutral-200"
                }`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold font-mono ${isDark ? "text-neutral-400" : "text-neutral-600"}`}>
                      SEG_{String(seg.segmentIndex).padStart(3, "0")}
                    </span>
                    <div className="flex gap-1.5">
                      {seg.blockchainRegistered && <span className="text-[9px] text-emerald-500 bg-emerald-950/30 border border-emerald-800/40 px-1.5 py-0.5 rounded-md font-mono">⛓ On-chain</span>}
                      {seg.c2paSigned && <span className="text-[9px] text-violet-500 bg-violet-950/30 border border-violet-800/40 px-1.5 py-0.5 rounded-md font-mono">📋 C2PA</span>}
                      {seg.ipfsCid && <span className="text-[9px] text-orange-500 bg-orange-950/30 border border-orange-800/40 px-1.5 py-0.5 rounded-md font-mono">📌 IPFS</span>}
                    </div>
                  </div>
                  <p className={`font-mono text-[9px] break-all leading-relaxed ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>
                    SHA256: <span className={isDark ? "text-blue-400/80" : "text-blue-600"}>{seg.sha256Hash}</span>
                  </p>
                  {seg.txHash && (
                    <p className={`font-mono text-[9px] break-all`}>
                      TX:{" "}
                      <a href={`https://sepolia.etherscan.io/tx/${seg.txHash}`} target="_blank" rel="noreferrer"
                        className="text-emerald-500 hover:underline">
                        {seg.txHash.slice(0, 20)}...
                      </a>
                    </p>
                  )}
                  {seg.endorsementCount > 0 && (
                    <p className={`text-[9px] font-mono ${textMuted}`}>
                      Endorsements: {seg.endorsementCount}/3
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className={`text-center text-[9px] font-mono ${textMuted}`}>
          TrustStream v1.0 · C2PA v2.2 · Ethereum Sepolia · IPFS via Pinata
        </p>
      </div>
    </div>
  );
}