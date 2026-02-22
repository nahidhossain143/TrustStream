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
    const m = Math.floor(secs / 60);
    const s = Math.round(secs % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const timeAgo = (dateStr) => {
    const diff = (Date.now() - new Date(dateStr)) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}
      className="min-h-screen bg-[#0f0f0f] text-gray-100">

      {/* Google Font */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #0f0f0f; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 4px; }

        .news-card:hover .card-title { color: #fff; }
        .news-card:hover { background: #1a1a1a; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in { animation: fadeIn 0.35s ease forwards; }

        @keyframes pulse-ring {
          0% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          70% { box-shadow: 0 0 0 8px rgba(59,130,246,0); }
          100% { box-shadow: 0 0 0 0 rgba(59,130,246,0); }
        }
        .active-ring { animation: pulse-ring 2s infinite; }
      `}</style>

      <Navbar />

      {loading ? (
        <div className="flex items-center justify-center h-[80vh]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-500 text-sm">Loading news feed...</p>
          </div>
        </div>
      ) : videoList.length === 0 ? (
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <div className="text-5xl mb-4">📡</div>
            <p className="text-gray-400 text-lg font-medium">No news uploaded yet</p>
            <p className="text-gray-600 text-sm mt-1">Visit the Admin panel to upload content</p>
          </div>
        </div>
      ) : (
        <div className="max-w-[1400px] mx-auto px-6 py-6 flex gap-6 fade-in">

          {/* ── LEFT: Main Player ── */}
          <div className="flex-1 min-w-0">

            {/* Video */}
            <div className="rounded-xl overflow-hidden bg-black aspect-video w-full">
              <VideoPlayer videoId={selected?.id} onVerify={handleVerify} />
            </div>

            {/* Verification Badge */}
            <div className="mt-3">
              <VerificationBadge verified={verified} details={verifyDetails} />
            </div>

            {/* Title & Meta */}
            <div className="mt-4">
              <h1 className="text-xl font-semibold text-white leading-snug">
                {selected?.title}
              </h1>

              <div className="flex items-center justify-between mt-3 pb-3 border-b border-[#272727]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                    TS
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">TrustStream News</p>
                    <p className="text-xs text-gray-500">Verified Publisher</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <span className="bg-[#272727] px-3 py-1.5 rounded-full">
                    🎬 {selected?.total_segments} segments
                  </span>
                  <span className="bg-[#272727] px-3 py-1.5 rounded-full">
                    ⏱ {formatDuration(selected?.duration_seconds || 0)}
                  </span>
                  <span className="bg-[#272727] px-3 py-1.5 rounded-full">
                    📅 {timeAgo(selected?.created_at)}
                  </span>
                </div>
              </div>

              {selected?.description && (
                <div className="mt-3 bg-[#1a1a1a] rounded-xl px-4 py-3">
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {selected.description}
                  </p>
                </div>
              )}
            </div>

            {/* Hash details */}
            {verifyDetails && (
              <div className="mt-4 bg-[#111] border border-[#222] rounded-xl p-4 fade-in">
                <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider"
                   style={{ fontFamily: "'DM Mono', monospace" }}>
                  Cryptographic Proof — Segment {verifyDetails.segmentIndex}
                </p>
                <div className="space-y-2 text-xs"
                     style={{ fontFamily: "'DM Mono', monospace" }}>
                  <div className="flex gap-2">
                    <span className="text-gray-600 w-20 flex-shrink-0">Browser:</span>
                    <span className="text-green-400 break-all">{verifyDetails.clientHash}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-gray-600 w-20 flex-shrink-0">Ledger:</span>
                    <span className="text-blue-400 break-all">{verifyDetails.storedHash}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT: Sidebar (YT style) ── */}
          <div className="w-[360px] flex-shrink-0 space-y-2 max-h-[calc(100vh-100px)] overflow-y-auto pr-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest px-1 mb-3">
              📡 News Feed
            </p>

            {videoList.map((v) => (
              <div
                key={v.id}
                onClick={() => setSelected(v)}
                className={`news-card cursor-pointer rounded-xl p-3 flex gap-3 transition-all duration-200 border ${
                  selected?.id === v.id
                    ? "bg-[#1a1a1a] border-blue-500/40 active-ring"
                    : "bg-transparent border-transparent hover:border-[#2a2a2a]"
                }`}
              >
                {/* Thumbnail */}
                <div className="w-40 h-24 rounded-lg bg-[#1a1a1a] flex-shrink-0 flex items-center justify-center relative overflow-hidden border border-[#2a2a2a]">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-900/30 to-purple-900/20" />
                  <span className="text-2xl z-10">📰</span>
                  <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
                    {formatDuration(v.duration_seconds || 0)}
                  </span>
                  {selected?.id === v.id && (
                    <div className="absolute inset-0 border-2 border-blue-500 rounded-lg" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 py-0.5">
                  <p className={`card-title text-sm font-medium leading-snug line-clamp-2 transition-colors ${
                    selected?.id === v.id ? "text-white" : "text-gray-300"
                  }`}>
                    {v.title}
                  </p>
                  <p className="text-xs text-gray-600 mt-1.5">TrustStream News</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-gray-600">{v.total_segments} segs</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-[10px] text-gray-600">{timeAgo(v.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}
    </div>
  );
}