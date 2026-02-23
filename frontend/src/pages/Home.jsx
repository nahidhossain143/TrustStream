import { useEffect, useState } from "react";
import api from "../services/api";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import VerificationBadge from "../components/VerificationBadge";

export default function Home() {
  const [videoList, setVideoList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [verified, setVerified] = useState(null);
  const [verifyDetails, setVerifyDetails] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/upload/videos")
      .then(res => {
        const ready = res.data.filter(v => v.status === "ready");
        setVideoList(ready);
        if (ready.length > 0) setSelected(ready[0]);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setVerified(null);
    setVerifyDetails(null);
  }, [selected]);

  const handleVerify = (status, details = null) => {
    setVerified(status);
    setVerifyDetails(details);
  };

  const formatDuration = (secs) => {
    const m = Math.floor((secs || 0) / 60);
    const s = Math.round((secs || 0) % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timeAgo = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <p className="text-xs text-neutral-600 tracking-widest uppercase font-mono">
              Loading feed...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Empty ────────────────────────────────────────────────
  if (videoList.length === 0) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-3xl mx-auto">
              📡
            </div>
            <div>
              <p className="text-white font-semibold text-lg">No broadcasts yet</p>
              <p className="text-neutral-600 text-sm mt-1">
                Visit <a href="/admin" className="text-blue-500 hover:underline">Admin</a> to upload content
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <Navbar />

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-5 flex flex-col lg:flex-row gap-5">

        {/* ══ LEFT: Player + Info ══ */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* Video Player */}
          <div className="relative rounded-xl overflow-hidden bg-black ring-1 ring-white/10 shadow-2xl shadow-black/60 aspect-video">
            {/* top glow line */}
            <div className="absolute top-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent z-10" />
            <VideoPlayer videoId={selected?.id} onVerify={handleVerify} />
          </div>

          {/* Verification Badge */}
          <VerificationBadge verified={verified} details={verifyDetails} />

          {/* Title */}
          <h1 className="text-xl font-bold text-white leading-snug tracking-tight">
            {selected?.title}
          </h1>

          {/* Publisher Row */}
          <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-neutral-800/60">
            {/* Publisher */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-700 to-violet-700 flex items-center justify-center text-sm font-bold text-white flex-shrink-0 ring-1 ring-white/10">
                TS
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-white">TrustStream News</span>
                  <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    Verified
                  </span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#4ade80] animate-pulse flex-shrink-0" />
                  <span className="text-[10px] text-neutral-600 font-mono">Blockchain authenticated</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-2">
              {[
                { icon: "🎬", label: `${selected?.total_segments ?? 0} segs` },
                { icon: "⏱", label: formatDuration(selected?.duration_seconds) },
                { icon: "📅", label: timeAgo(selected?.created_at) },
              ].map(({ icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-[11px] text-neutral-500"
                >
                  {icon} {label}
                </span>
              ))}
            </div>
          </div>

          {/* Description */}
          {selected?.description && (
            <p className="text-sm text-neutral-500 leading-relaxed">
              {selected.description}
            </p>
          )}

          {/* Cryptographic Proof Panel */}
          {verifyDetails && (
            <div className="rounded-xl bg-neutral-900/60 border border-neutral-800/60 p-4 backdrop-blur-sm space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-neutral-600 uppercase tracking-widest">
                  <span>🔐</span>
                  <span>Cryptographic Proof</span>
                  <div className="flex-1 h-px bg-neutral-800/80 ml-1" />
                </div>
                <span className="font-mono text-[9px] text-neutral-700">
                  seg_{String(verifyDetails.segmentIndex).padStart(3, "0")}
                </span>
              </div>

              {/* Hash rows */}
              <div className="space-y-2">
                {[
                  { label: "Browser", value: verifyDetails.clientHash, color: "text-emerald-500/80" },
                  { label: "Ledger",  value: verifyDetails.storedHash,  color: "text-blue-400/80"   },
                ].map(({ label, value, color }) => (
                  <div key={label} className="flex gap-3 items-start pt-2 border-t border-neutral-800/40 first:border-0 first:pt-0">
                    <span className="font-mono text-[9px] text-neutral-700 uppercase tracking-widest w-12 flex-shrink-0 pt-0.5">
                      {label}
                    </span>
                    <span className={`font-mono text-[10px] leading-relaxed break-all ${color}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {/* Consortium endorsements */}
              {verifyDetails.endorsementCount > 0 && (
                <div className="pt-3 border-t border-neutral-800/40 space-y-2">
                  <p className="font-mono text-[9px] text-neutral-700 uppercase tracking-widest">
                    Consortium Endorsements ({verifyDetails.endorsementCount}/3)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { name: "NewsAgency",  icon: "🏢", min: 1, colors: "text-emerald-400 bg-emerald-950/30 border-emerald-800/40" },
                      { name: "Broadcaster", icon: "📡", min: 2, colors: "text-blue-400 bg-blue-950/30 border-blue-800/40"         },
                      { name: "Auditor",     icon: "🔍", min: 3, colors: "text-violet-400 bg-violet-950/30 border-violet-800/40"   },
                    ].filter(o => verifyDetails.endorsementCount >= o.min).map(o => (
                      <span
                        key={o.name}
                        className={`inline-flex items-center gap-1.5 text-[10px] font-medium border rounded-md px-2 py-1 ${o.colors}`}
                      >
                        {o.icon} {o.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ══ RIGHT: Sidebar ══ */}
        <div className="lg:w-80 xl:w-[340px] flex-shrink-0 space-y-1 lg:max-h-[calc(100vh-80px)] lg:overflow-y-auto lg:pr-1">

          {/* Label */}
          <div className="flex items-center gap-2 px-1 mb-3">
            <span className="text-[9px] font-bold text-neutral-700 uppercase tracking-widest">📡 Live Feed</span>
            <div className="flex-1 h-px bg-neutral-800/60" />
          </div>

          {videoList.map((v) => {
            const isActive = selected?.id === v.id;
            return (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`w-full text-left flex gap-3 p-3 rounded-xl border transition-all duration-200 ${
                  isActive
                    ? "bg-blue-500/5 border-blue-500/25 ring-1 ring-blue-500/10"
                    : "bg-transparent border-transparent hover:bg-neutral-900/60 hover:border-neutral-800"
                }`}
              >
                {/* Thumbnail */}
                <div className="relative w-32 h-[72px] flex-shrink-0 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 to-violet-900/20" />
                  <div className="absolute inset-0 flex items-center justify-center text-xl">
                    {isActive ? "▶️" : "📰"}
                  </div>
                  <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-neutral-300 font-mono text-[9px] px-1.5 py-0.5 rounded">
                    {formatDuration(v.duration_seconds)}
                  </span>
                  {isActive && (
                    <div className="absolute inset-0 border border-blue-500/40 rounded-lg" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-1.5 py-0.5">
                  <p className={`text-[12.5px] font-medium leading-snug line-clamp-2 ${isActive ? "text-white" : "text-neutral-400"}`}>
                    {v.title}
                  </p>
                  <p className="text-[10px] text-neutral-700">TrustStream News</p>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[9px] text-neutral-700 bg-neutral-900 border border-neutral-800 px-1.5 py-0.5 rounded">
                      {v.total_segments} segs
                    </span>
                    <span className="text-neutral-800 text-[10px]">·</span>
                    <span className="text-[10px] text-neutral-700">{timeAgo(v.created_at)}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}