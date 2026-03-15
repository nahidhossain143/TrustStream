import { useEffect, useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import VerificationBadge from "../components/VerificationBadge";
import SyncButton from "../components/SyncButton";
import { useTheme } from "../context/ThemeContext";

const CONTRACT_ADDRESS =
  import.meta.env.VITE_CONTRACT_ADDRESS ||
  "0xb7Ab03B3202c67Aac4Ca7bF6636693358D7fCD94";

// ─── Trust Layer Pill ────────────────────────────────────
function TrustPill({ icon, label, value, color, pulse }) {
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-medium backdrop-blur-sm ${color}`}>
      {pulse && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 bg-current" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
        </span>
      )}
      <span>{icon}</span>
      <span className="opacity-70">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

// ─── Sidebar Video Card ──────────────────────────────────
function VideoCard({ v, isActive, onClick, formatDuration, timeAgo, isDark }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left group flex gap-3 p-3 rounded-xl border transition-all duration-300 ${
        isActive
          ? isDark
            ? "bg-blue-500/8 border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.08)]"
            : "bg-blue-50 border-blue-200 shadow-sm"
          : isDark
          ? "bg-transparent border-transparent hover:bg-white/4 hover:border-white/10"
          : "bg-transparent border-transparent hover:bg-neutral-100 hover:border-neutral-200"
      }`}
    >
      <div className={`relative w-28 h-[63px] flex-shrink-0 rounded-lg overflow-hidden border ${
        isDark ? "bg-neutral-900 border-white/8" : "bg-neutral-200 border-neutral-300"
      }`}>
        <div className={`absolute inset-0 ${isDark ? "bg-gradient-to-br from-slate-800 to-neutral-900" : "bg-gradient-to-br from-slate-200 to-neutral-300"}`} />
        <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${isActive ? "opacity-100" : "opacity-50 group-hover:opacity-80"}`}>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center border ${
            isActive
              ? "bg-blue-500 border-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.5)]"
              : isDark ? "bg-white/10 border-white/20" : "bg-white/70 border-neutral-300"
          }`}>
            <svg className="w-3 h-3 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
        <span className={`absolute bottom-1.5 right-1.5 font-mono text-[9px] px-1.5 py-0.5 rounded-md backdrop-blur-sm ${
          isDark ? "bg-black/70 text-neutral-300" : "bg-black/50 text-white"
        }`}>
          {formatDuration((v.totalSegments ?? 0) * 2)}
        </span>
        {isActive && <div className="absolute inset-0 ring-1 ring-blue-500/40 rounded-lg" />}
      </div>

      <div className="flex-1 min-w-0 py-0.5 space-y-1">
        <p className={`text-[12px] font-medium leading-snug line-clamp-2 transition-colors ${
          isActive
            ? isDark ? "text-white" : "text-blue-700"
            : isDark ? "text-neutral-400 group-hover:text-neutral-300" : "text-neutral-600 group-hover:text-neutral-900"
        }`}>
          {v.title}
        </p>
        <p className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>TrustStream News</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-md border ${
            isDark ? "text-neutral-700 bg-neutral-900/80 border-neutral-800" : "text-neutral-500 bg-neutral-100 border-neutral-200"
          }`}>
            {v.totalSegments} segs
          </span>
          {v.c2paStatus === "signed" && (
            <span className="font-mono text-[9px] text-violet-500 bg-violet-950/30 border border-violet-800/40 px-1.5 py-0.5 rounded-md">
              C2PA
            </span>
          )}
          <span className={`text-[10px] ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
            {timeAgo(v.registeredAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── Main ────────────────────────────────────────────────
export default function Home() {
  const { isDark } = useTheme();
  const [videoList, setVideoList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [verified, setVerified] = useState(null);
  const [verifyDetails, setVerifyDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [walletAddress, setWalletAddress] = useState(null);

  const fetchVideos = () =>
    api.get("/upload/videos").then((res) => {
      setVideoList(res.data);
      if (res.data.length > 0 && !selected) setSelected(res.data[0]);
    }).catch(console.error);

  useEffect(() => {
    setWalletAddress(null);
    fetchVideos().finally(() => setLoading(false));
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) =>
        setWalletAddress(accounts[0] || null)
      );
    }
  }, []);

  useEffect(() => {
    setVerified(null);
    setVerifyDetails(null);
  }, [selected]);

  const handleVerify = (status, details = null) => {
    setVerified(status);
    setVerifyDetails(details);
  };

  const connectWallet = async () => {
    if (!window.ethereum) return alert("MetaMask not installed!");
    try {
      try {
        await window.ethereum.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
      } catch {}
      await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0xaa36a7" }] });
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      setWalletAddress(accounts[0]);
    } catch (err) { console.error(err); }
  };

  const formatDuration = (secs) => {
    const m = Math.floor((secs || 0) / 60);
    const s = Math.round((secs || 0) % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timeAgo = (dateStr) => {
    const source = typeof dateStr === "number" && dateStr < 1_000_000_000_000 ? dateStr * 1000 : dateStr;
    const diff = (Date.now() - new Date(source)) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  const shortAddr = (addr) => addr ? `${addr.slice(0, 6)}···${addr.slice(-4)}` : null;

  // Theme classes helper
  const bg = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const cardBg = isDark ? "bg-neutral-900/40 border-white/8" : "bg-white border-neutral-200";
  const cardHeaderBg = isDark ? "bg-white/2 border-white/6" : "bg-neutral-50 border-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";
  const divider = isDark ? "bg-white/6" : "bg-neutral-100";

  // ── Loading ──────────────────────────────────────────
  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col transition-colors duration-300`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border border-blue-500/20" />
              <div className="absolute inset-0 rounded-full border-t border-blue-500 animate-spin" />
              <div className="absolute inset-2 rounded-full border border-blue-400/10" />
              <div className="absolute inset-2 rounded-full border-t border-blue-400/60 animate-spin [animation-duration:0.6s]" />
            </div>
            <p className={`text-[10px] ${textMuted} tracking-[0.3em] uppercase font-mono`}>
              Initializing feed
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────
  if (videoList.length === 0) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col transition-colors duration-300`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-sm px-6">
            <div className={`w-20 h-20 rounded-2xl border flex items-center justify-center text-4xl mx-auto shadow-xl ${
              isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
            }`}>
              📡
            </div>
            <div>
              <p className={`font-semibold text-xl tracking-tight ${text}`}>No broadcasts yet</p>
              <p className={`text-sm mt-2 leading-relaxed ${textMuted}`}>
                Upload from{" "}
                <a href="/admin" className="text-blue-500 hover:text-blue-400 transition-colors">Admin</a>
                {" "}or restore from blockchain
              </p>
            </div>
            <div className="flex justify-center">
              <SyncButton onSyncComplete={fetchVideos} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">

        {/* ── LEFT ────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Video Player */}
          <div className={`relative rounded-2xl overflow-hidden shadow-2xl ring-1 aspect-video ${
            isDark ? "bg-black ring-white/8" : "bg-neutral-900 ring-neutral-300"
          }`}>
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent z-10" />
            <div className="absolute top-0 left-0 w-8 h-8 border-t border-l border-blue-500/30 rounded-tl-2xl z-10" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t border-r border-blue-500/30 rounded-tr-2xl z-10" />
            <VideoPlayer
              videoId={selected?.videoId || selected?.id}
              playlistUrl={selected ? `http://localhost:3001${selected.playlistUrl}` : null}
              onVerify={handleVerify}
            />
          </div>

          {/* Verification Badge */}
          <VerificationBadge verified={verified} details={verifyDetails} />

          {/* Title + Meta */}
          <div className="space-y-3">
            <h1 className={`text-2xl font-bold leading-tight tracking-tight ${text}`}>
              {selected?.title}
            </h1>

            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-[11px] font-black text-white shadow-lg shadow-blue-900/30">
                  TS
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${text}`}>TrustStream News</span>
                    <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 rounded uppercase tracking-wider">
                      Verified
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#4ade80]" />
                    <span className={`text-[10px] font-mono ${textMuted}`}>Live blockchain authentication</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {[
                  { icon: "▦", label: `${selected?.totalSegments ?? 0} segments` },
                  { icon: "◷", label: formatDuration((selected?.totalSegments ?? 0) * 2) },
                  { icon: "◴", label: timeAgo(selected?.registeredAt) },
                ].map(({ icon, label }) => (
                  <span key={label} className={`inline-flex items-center gap-1.5 border rounded-md px-2.5 py-1 text-[11px] font-mono transition-colors ${
                    isDark ? "bg-white/5 border-white/10 text-neutral-400" : "bg-neutral-100 border-neutral-200 text-neutral-500"
                  }`}>
                    {icon} {label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {selected?.description && (
            <p className={`text-sm leading-relaxed border-l-2 pl-4 ${
              isDark ? "text-neutral-500 border-neutral-800" : "text-neutral-500 border-neutral-300"
            }`}>
              {selected.description}
            </p>
          )}

          <div className={`h-px bg-gradient-to-r from-neutral-800/80 via-neutral-700/40 to-transparent ${!isDark && "from-neutral-200/80 via-neutral-300/40"}`} />

          {/* Trust Layer Panel */}
          <div className={`rounded-2xl border overflow-hidden backdrop-blur-sm ${cardBg}`}>
            <div className={`flex items-center justify-between px-5 py-3.5 border-b ${cardHeaderBg}`}>
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
                  <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <span className={`text-xs font-semibold tracking-wide ${isDark ? "text-neutral-300" : "text-neutral-600"}`}>
                  Trust & Provenance Layer
                </span>
              </div>

              <div className="flex items-center gap-2">
                {walletAddress ? (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
                    isDark ? "bg-emerald-950/40 border-emerald-700/40" : "bg-emerald-50 border-emerald-200"
                  }`}>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className={`font-mono text-[10px] font-semibold ${isDark ? "text-emerald-400" : "text-emerald-700"}`}>
                      {shortAddr(walletAddress)}
                    </span>
                  </div>
                ) : (
                  <button
                    onClick={connectWallet}
                    className="flex items-center gap-2 px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white text-[11px] font-semibold rounded-full transition-all shadow-lg shadow-orange-900/30"
                  >
                    <img src="https://upload.wikimedia.org/wikipedia/commons/3/36/MetaMask_Fox.svg" className="w-3.5 h-3.5" alt="MetaMask" />
                    Connect Wallet
                  </button>
                )}
                <a
                  href={`https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/90 hover:bg-blue-500 text-white text-[11px] font-semibold rounded-full transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  Etherscan
                </a>
              </div>
            </div>

            <div className="px-5 py-4 flex flex-wrap gap-2">
              <TrustPill icon="⛓" label="Network" value="Sepolia" color="text-emerald-400 bg-emerald-950/30 border-emerald-800/40" pulse />
              <TrustPill icon="🏢" label="Orgs" value="3/3 Active" color="text-violet-400 bg-violet-950/30 border-violet-800/40" />
              <TrustPill icon="📌" label="Storage" value="IPFS + Pinata" color="text-orange-400 bg-orange-950/30 border-orange-800/40" />
              <TrustPill icon="📋" label="Standard" value="C2PA v2.2" color="text-pink-400 bg-pink-950/30 border-pink-800/40" />
            </div>

            <div className={`grid grid-cols-2 sm:grid-cols-4 gap-px border-t ${divider}`}>
              {[
                { label: "Contract", value: CONTRACT_ADDRESS ? `${CONTRACT_ADDRESS.slice(0, 6)}···${CONTRACT_ADDRESS.slice(-5)}` : "—", color: "text-blue-400" },
                { label: "Chain ID", value: "11155111", color: "text-emerald-400" },
                { label: "Consensus", value: "PoS Sepolia", color: "text-violet-400" },
                { label: "C2PA", value: "8 Assertions", color: "text-pink-400" },
              ].map(({ label, value, color }) => (
                <div key={label} className={`px-4 py-3 ${isDark ? "bg-neutral-900/60" : "bg-neutral-50"}`}>
                  <p className={`text-[9px] uppercase tracking-widest font-mono mb-1 ${textMuted}`}>{label}</p>
                  <p className={`font-mono text-[10px] font-medium ${color}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* IPFS Pending */}
          {selected?.ipfsStatus !== "uploaded" && (
            <div className="flex items-start gap-3 rounded-xl bg-amber-950/15 border border-amber-700/20 px-4 py-3">
              <span className="text-amber-400 mt-0.5 flex-shrink-0">⚠</span>
              <p className="text-[11px] text-amber-200/70 leading-relaxed">
                IPFS pinning running in background. Local playback available immediately.
              </p>
            </div>
          )}

          {/* Cryptographic Proof Panel */}
          {verifyDetails && (
            <div className={`rounded-2xl border overflow-hidden backdrop-blur-sm ${cardBg}`}>
              <div className={`flex items-center justify-between px-5 py-3.5 border-b ${cardHeaderBg}`}>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                    <svg className="w-3 h-3 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  </div>
                  <span className={`text-xs font-semibold tracking-wide ${isDark ? "text-neutral-300" : "text-neutral-600"}`}>
                    Cryptographic Proof
                  </span>
                </div>
                <span className={`font-mono text-[9px] px-2 py-1 rounded-md ${isDark ? "text-neutral-600 bg-neutral-800" : "text-neutral-400 bg-neutral-100"}`}>
                  SEG_{String(verifyDetails.segmentIndex ?? 0).padStart(3, "0")}
                </span>
              </div>

              <div className={`divide-y ${isDark ? "divide-white/5" : "divide-neutral-100"}`}>
                {[
                  { label: "Browser Hash", value: verifyDetails.clientHash, color: "text-emerald-500", tag: "COMPUTED" },
                  { label: "Ledger Hash", value: verifyDetails.storedHash, color: "text-blue-400", tag: "STORED" },
                ].map(({ label, value, color, tag }) => (
                  <div key={label} className="px-5 py-3.5 flex gap-4 items-start">
                    <div className="flex-shrink-0 pt-0.5">
                      <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded font-mono tracking-wider ${
                        isDark ? "text-neutral-700 bg-neutral-800 border border-neutral-700" : "text-neutral-400 bg-neutral-100 border border-neutral-200"
                      }`}>{tag}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-[9px] font-mono uppercase tracking-widest mb-1 ${textMuted}`}>{label}</p>
                      <p className={`font-mono text-[10px] break-all leading-relaxed ${color}`}>{value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {verifyDetails.ipfsCid && (
                <div className={`px-5 py-3.5 border-t bg-orange-950/10 ${isDark ? "border-white/5" : "border-orange-100"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-[9px] font-mono uppercase tracking-widest mb-1 ${textMuted}`}>IPFS Content ID</p>
                      <p className="font-mono text-[10px] text-orange-400 break-all">{verifyDetails.ipfsCid}</p>
                    </div>
                    <a
                      href={verifyDetails.ipfsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold text-orange-400 hover:text-orange-300 bg-orange-950/40 border border-orange-800/40 px-2.5 py-1.5 rounded-lg transition-colors"
                    >
                      View
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              )}

              {verifyDetails.endorsementCount > 0 && (
                <div className={`px-5 py-3.5 border-t flex flex-wrap gap-2 items-center ${isDark ? "border-white/5" : "border-neutral-100"}`}>
                  <span className={`text-[9px] font-mono uppercase tracking-widest mr-1 ${textMuted}`}>Endorsed by</span>
                  {[
                    { name: "NewsAgency", icon: "🏢", min: 1, color: "text-emerald-400 bg-emerald-950/30 border-emerald-800/40" },
                    { name: "Broadcaster", icon: "📡", min: 2, color: "text-blue-400 bg-blue-950/30 border-blue-800/40" },
                    { name: "Auditor", icon: "🔍", min: 3, color: "text-violet-400 bg-violet-950/30 border-violet-800/40" },
                  ]
                    .filter((o) => verifyDetails.endorsementCount >= o.min)
                    .map((o) => (
                      <span key={o.name} className={`inline-flex items-center gap-1.5 text-[10px] font-medium border rounded-full px-2.5 py-1 ${o.color}`}>
                        {o.icon} {o.name}
                      </span>
                    ))}
                  <span className={`ml-auto text-[9px] font-mono ${textMuted}`}>{verifyDetails.endorsementCount}/3</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT (Sidebar) ──────────────────────────── */}
        <div className="lg:w-[300px] xl:w-[320px] flex-shrink-0 flex flex-col gap-3 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pr-1">

          {/* Sync */}
          <div className={`rounded-xl border p-3 backdrop-blur-sm ${cardBg}`}>
            <SyncButton onSyncComplete={fetchVideos} />
          </div>

          {/* Feed Header */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? "text-neutral-500" : "text-neutral-400"}`}>
                Live Feed
              </span>
            </div>
            <div className={`flex-1 h-px bg-gradient-to-r to-transparent ${isDark ? "from-neutral-800" : "from-neutral-200"}`} />
            <span className={`text-[9px] font-mono ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
              {videoList.length} broadcast{videoList.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Video List */}
          <div className="space-y-1">
            {videoList.map((v) => {
              const isActive = selected?.id === v.id || selected?.videoId === v.videoId;
              return (
                <VideoCard
                  key={v.videoId || v.id}
                  v={v}
                  isActive={isActive}
                  onClick={() => setSelected(v)}
                  formatDuration={formatDuration}
                  timeAgo={timeAgo}
                  isDark={isDark}
                />
              );
            })}
          </div>

          {/* Footer */}
          <div className={`mt-auto pt-4 border-t px-1 ${isDark ? "border-white/6" : "border-neutral-200"}`}>
            <p className={`text-[9px] font-mono text-center leading-relaxed ${isDark ? "text-neutral-700" : "text-neutral-400"}`}>
              TrustStream v1.0 · C2PA v2.2 · Sepolia
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}