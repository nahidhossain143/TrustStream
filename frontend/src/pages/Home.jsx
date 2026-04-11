import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import VerificationBadge from "../components/VerificationBadge";
import SyncButton from "../components/SyncButton";
import { useTheme } from "../context/ThemeContext";

// ─── Sidebar Video Card ──────────────────────────────────
function VideoCard({ v, isActive, onClick, formatDuration, timeAgo, isDark }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left group flex gap-3 p-3 rounded-xl border transition-all duration-300 ${
        isActive
          ? isDark ? "bg-blue-500/8 border-blue-500/30" : "bg-blue-50 border-blue-200 shadow-sm"
          : isDark ? "bg-transparent border-transparent hover:bg-white/4 hover:border-white/10"
                   : "bg-transparent border-transparent hover:bg-neutral-100 hover:border-neutral-200"
      }`}
    >
      {/* Thumbnail */}
      <div className={`relative w-28 h-[63px] flex-shrink-0 rounded-lg overflow-hidden border ${
        isDark ? "bg-neutral-900 border-white/8" : "bg-neutral-200 border-neutral-300"
      }`}>
        <div className={`absolute inset-0 flex items-center justify-center`}>
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
        <span className={`absolute bottom-1.5 right-1.5 font-mono text-[9px] px-1.5 py-0.5 rounded-md ${
          isDark ? "bg-black/70 text-neutral-300" : "bg-black/50 text-white"
        }`}>
          {formatDuration((v.totalSegments ?? 0) * 2)}
        </span>
        {isActive && <div className="absolute inset-0 ring-1 ring-blue-500/40 rounded-lg" />}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 py-0.5 space-y-1">
        <p className={`text-[12px] font-medium leading-snug line-clamp-2 ${
          isActive
            ? isDark ? "text-white" : "text-blue-700"
            : isDark ? "text-neutral-400 group-hover:text-neutral-300" : "text-neutral-600 group-hover:text-neutral-900"
        }`}>{v.title}</p>
        <p className={`text-[10px] ${isDark ? "text-neutral-600" : "text-neutral-400"}`}>TrustStream News</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-md border ${
            isDark ? "text-neutral-700 bg-neutral-900/80 border-neutral-800" : "text-neutral-500 bg-neutral-100 border-neutral-200"
          }`}>{v.totalSegments} segs</span>
          {v.c2paStatus === "signed" && (
            <span className="font-mono text-[9px] text-violet-500 bg-violet-950/30 border border-violet-800/40 px-1.5 py-0.5 rounded-md">C2PA</span>
          )}
          {v.blockchainStatus === "ready" && (
            <span className="font-mono text-[9px] text-emerald-500 bg-emerald-950/30 border border-emerald-800/40 px-1.5 py-0.5 rounded-md">⛓ On-chain</span>
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
  const navigate = useNavigate();
  const [videoList, setVideoList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [verified, setVerified] = useState(null);
  const [verifyDetails, setVerifyDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchVideos = () =>
    api.get("/upload/videos").then((res) => {
      setVideoList(res.data);
      if (res.data.length > 0 && !selected) setSelected(res.data[0]);
    }).catch(console.error);

  useEffect(() => {
    fetchVideos().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setVerified(null);
    setVerifyDetails(null);
  }, [selected]);

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

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const cardBg = isDark ? "bg-neutral-900/40 border-white/8" : "bg-white border-neutral-200";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";

  // ── Loading ──────────────────────────────────────────
  if (loading) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-12 h-12">
              <div className="absolute inset-0 rounded-full border border-blue-500/20" />
              <div className="absolute inset-0 rounded-full border-t border-blue-500 animate-spin" />
            </div>
            <p className={`text-[10px] ${textMuted} tracking-[0.3em] uppercase font-mono`}>Initializing feed</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────
  if (videoList.length === 0) {
    return (
      <div className={`min-h-screen ${bg} flex flex-col`}>
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-6 max-w-sm px-6">
            <div className={`w-20 h-20 rounded-2xl border flex items-center justify-center text-4xl mx-auto ${
              isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"
            }`}>📡</div>
            <div>
              <p className={`font-semibold text-xl ${text}`}>No broadcasts yet</p>
              <p className={`text-sm mt-2 ${textMuted}`}>
                Upload from{" "}
                <a href="/admin" className="text-blue-500 hover:text-blue-400">Admin</a>
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

        {/* ── LEFT ──────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-4">

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
              onVerify={(status, details) => { setVerified(status); setVerifyDetails(details); }}
            />
          </div>

          {/* Verification Badge */}
          <VerificationBadge verified={verified} details={verifyDetails} />

          {/* Title + Meta */}
          <div className={`rounded-2xl border p-5 space-y-4 ${cardBg}`}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <h1 className={`text-xl font-bold leading-tight ${text}`}>{selected?.title}</h1>
                {selected?.description && (
                  <p className={`text-sm leading-relaxed ${textMuted}`}>{selected.description}</p>
                )}
              </div>

              {/* View Details Button */}
              <button
                onClick={() => navigate(`/video/${selected?.videoId || selected?.id}`)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl transition-all shadow-lg shadow-blue-900/30 flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                View Full Details
              </button>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { label: `${selected?.totalSegments ?? 0} segments` },
                { label: formatDuration((selected?.totalSegments ?? 0) * 2) },
                { label: timeAgo(selected?.registeredAt) },
              ].map(({ label }) => (
                <span key={label} className={`inline-flex items-center border rounded-md px-2.5 py-1 text-[11px] font-mono ${
                  isDark ? "bg-white/5 border-white/10 text-neutral-400" : "bg-neutral-100 border-neutral-200 text-neutral-500"
                }`}>{label}</span>
              ))}

              {/* Status badges */}
              {selected?.blockchainStatus === "ready" && (
                <span className="inline-flex items-center gap-1 border rounded-md px-2.5 py-1 text-[11px] font-mono text-emerald-500 bg-emerald-950/20 border-emerald-800/30">
                  ⛓ Blockchain
                </span>
              )}
              {selected?.c2paStatus === "signed" && (
                <span className="inline-flex items-center gap-1 border rounded-md px-2.5 py-1 text-[11px] font-mono text-violet-500 bg-violet-950/20 border-violet-800/30">
                  📋 C2PA
                </span>
              )}
              {selected?.ipfsStatus === "uploaded" && (
                <span className="inline-flex items-center gap-1 border rounded-md px-2.5 py-1 text-[11px] font-mono text-orange-500 bg-orange-950/20 border-orange-800/30">
                  📌 IPFS
                </span>
              )}
            </div>

            {/* Publisher */}
            <div className="flex items-center gap-3 pt-1 border-t border-white/5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-[10px] font-black text-white">TS</div>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${text}`}>TrustStream News</span>
                  <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/25 px-1.5 py-0.5 rounded uppercase">Verified</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className={`text-[10px] font-mono ${textMuted}`}>Live blockchain authentication</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT (Sidebar) ─────────────────────── */}
        <div className="lg:w-[300px] xl:w-[320px] flex-shrink-0 flex flex-col gap-3 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pr-1">

          {/* Sync */}
          <div className={`rounded-xl border p-3 ${cardBg}`}>
            <SyncButton onSyncComplete={fetchVideos} />
          </div>

          {/* Feed Header */}
          <div className="flex items-center gap-3 px-1">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_#ef4444]" />
              <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Live Feed</span>
            </div>
            <div className={`flex-1 h-px bg-gradient-to-r to-transparent ${isDark ? "from-neutral-800" : "from-neutral-200"}`} />
            <span className={`text-[9px] font-mono ${textMuted}`}>{videoList.length} broadcast{videoList.length !== 1 ? "s" : ""}</span>
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
            <p className={`text-[9px] font-mono text-center ${textMuted}`}>
              TrustStream v1.0 · C2PA v2.2 · Sepolia
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}