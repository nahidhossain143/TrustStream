import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { feedAPI, API_ORIGIN } from "../services/api";
import Navbar from "../components/Navbar";
import VideoPlayer from "../components/VideoPlayer";
import { useTheme } from "../context/ThemeContext";

const IPFS_GATEWAY = import.meta.env.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs";
const buildGatewayUrl = (cid) => (cid ? `${IPFS_GATEWAY}/${cid}` : null);

const timeAgo = (dateStr) => {
  const source = typeof dateStr === "number" && dateStr < 1_000_000_000_000 ? dateStr * 1000 : dateStr;
  const diff = (Date.now() - new Date(source)) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};
const formatDuration = (secs) => {
  const m = Math.floor((secs || 0) / 60), s = Math.round((secs || 0) % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

// ─── Video Modal (fullscreen) ─────────────────────────────
function VideoModal({ item, onClose, isDark }) {
  const navigate = useNavigate();
  const overlayRef = useRef(null);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.95)", backdropFilter: "blur(8px)" }}>
      <div className={`relative w-full h-full flex flex-col ${isDark ? "bg-black" : "bg-neutral-950"}`}>
        <button onClick={onClose} className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/70 hover:bg-black flex items-center justify-center transition-colors">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
          <div className="w-full h-full max-w-[1600px]">
            <VideoPlayer
              videoId={item.videoId || item.id}
              playlistUrl={`${API_ORIGIN}${item.playlistUrl}`}
              posterUrl={item.thumbnailUrl ? `${API_ORIGIN}${item.thumbnailUrl}` : undefined}
              onVerify={() => {}}
            />
          </div>
        </div>
        <div className="px-6 py-4 flex items-center justify-between gap-4 bg-neutral-900 border-t border-white/10">
          <div className="min-w-0">
            <p className="font-semibold text-base truncate text-white">{item.title}</p>
            <p className="text-xs font-mono mt-0.5 text-neutral-400">
              {item.totalSegments} segments · {formatDuration(item.totalDurationSeconds || 0)}
            </p>
          </div>
          <button onClick={() => { onClose(); navigate(`/video/${item.videoId || item.id}`); }}
            className="flex-shrink-0 text-xs font-semibold text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/60 px-4 py-2 rounded-lg transition-all">
            Full Details ↗
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Image Lightbox (fullscreen) ──────────────────────────
function ImageLightbox({ item, onClose, isDark }) {
  const navigate = useNavigate();
  const overlayRef = useRef(null);
  const imgSrc = buildGatewayUrl(item.ipfsCid);
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);
  return (
    <div ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.95)", backdropFilter: "blur(8px)" }}>
      <div className={`relative w-full h-full flex flex-col ${isDark ? "bg-black" : "bg-neutral-950"}`}>
        <button onClick={onClose} className="absolute top-4 right-4 z-20 w-10 h-10 rounded-full bg-black/70 hover:bg-black flex items-center justify-center transition-colors">
          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <div className="flex-1 flex items-center justify-center overflow-auto p-6">
          {imgSrc ? (
            <img src={imgSrc} alt={item.title} className="max-w-full max-h-full object-contain" />
          ) : (
            <p className="text-neutral-400 font-mono text-sm">Image not available</p>
          )}
        </div>
        <div className="px-6 py-4 flex items-center justify-between gap-4 bg-neutral-900 border-t border-white/10">
          <div className="min-w-0">
            <p className="font-semibold text-base truncate text-white">{item.title}</p>
            <p className="text-xs font-mono mt-0.5 text-neutral-400">IPFS · {item.ipfsCid ? `${item.ipfsCid.slice(0, 12)}…` : "—"}</p>
          </div>
          <button onClick={() => { onClose(); navigate(`/image/${item.imageId}`); }}
            className="flex-shrink-0 text-xs font-semibold text-purple-400 hover:text-purple-300 border border-purple-500/30 hover:border-purple-500/60 px-4 py-2 rounded-lg transition-all">
            Full Details ↗
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Verification Pills ───────────────────────────────────
function VerifPills({ item }) {
  const pills = [];
  if (item.fabricStatus === "ready") pills.push({ label: "🏛 Fabric", cls: "text-emerald-400 border-emerald-800/40 bg-emerald-950/30" });
  if (item.c2paStatus === "signed" || item.c2paSigned) pills.push({ label: "📋 C2PA", cls: "text-violet-400 border-violet-800/40 bg-violet-950/30" });
  if (item.ipfsStatus === "uploaded") pills.push({ label: "📌 IPFS", cls: "text-orange-400 border-orange-800/40 bg-orange-950/30" });
  if (item.fabricResult?.status === "disputed") pills.push({ label: "⚠ Disputed", cls: "text-red-400 border-red-800/40 bg-red-950/30" });
  else if (item.fabricStatus === "ready") pills.push({ label: "✓ 3-Org", cls: "text-blue-400 border-blue-800/40 bg-blue-950/30" });
  return (
    <div className="flex flex-wrap gap-1.5">
      {pills.map(({ label, cls }) => (
        <span key={label} className={`text-[10px] font-mono font-semibold border rounded-full px-2 py-0.5 ${cls}`}>{label}</span>
      ))}
    </div>
  );
}

// ─── Video Post Card ──────────────────────────────────────
function VideoPostCard({ item, onPlay, isDark }) {
  const navigate = useNavigate();
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const cardBg = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";
  const text = isDark ? "text-white" : "text-neutral-900";
  return (
    <article className={`rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${cardBg}`}>
      <div className="flex items-center gap-3 px-6 pt-5 pb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-[11px] font-black text-white flex-shrink-0">TS</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${text}`}>TrustStream News</span>
            <span className="text-[8px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded uppercase tracking-wide">Verified</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border text-blue-400 border-blue-800/30 bg-blue-950/20 font-mono">🎬 VIDEO</span>
          </div>
          <p className={`text-[11px] mt-0.5 ${textMuted}`}>{timeAgo(item.registeredAt)}</p>
        </div>
      </div>
      <div onClick={() => onPlay(item)} className="relative cursor-pointer group bg-neutral-950 overflow-hidden" style={{ aspectRatio: "16/9" }}>
        {/* Thumbnail (poster) — falls back to placeholder grid if not uploaded */}
        {item.thumbnailUrl ? (
          <img
            src={`${API_ORIGIN}${item.thumbnailUrl}`}
            alt={item.title}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="grid grid-cols-8 gap-0.5 opacity-5 w-full h-full p-2">
              {Array.from({ length: 56 }).map((_, i) => <div key={i} className="bg-white rounded-sm" />)}
            </div>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent z-10" />
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center group-hover:bg-white/30 group-hover:scale-110 transition-all duration-200 shadow-2xl">
            <svg className="w-9 h-9 text-white ml-1.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>
        <div className="absolute bottom-4 right-4 z-20">
          <span className="bg-black/70 backdrop-blur-sm text-white text-xs font-mono font-bold px-2.5 py-1 rounded-md">{formatDuration(item.totalDurationSeconds || 0)}</span>
        </div>
        <div className="absolute bottom-4 left-4 z-20">
          <span className="bg-black/60 text-neutral-300 text-[10px] font-mono px-2.5 py-1 rounded-md">{item.totalSegments} segments</span>
        </div>
      </div>
      <div className="px-6 pt-4 pb-5 space-y-3">
        <div>
          <h2 className={`font-bold text-lg leading-snug ${text}`}>{item.title}</h2>
          {item.description && <p className={`text-sm mt-1 leading-relaxed line-clamp-2 ${textMuted}`}>{item.description}</p>}
        </div>
        <VerifPills item={item} />
        <div className={`flex items-center justify-between pt-3 border-t ${isDark ? "border-neutral-800" : "border-neutral-100"}`}>
          <button onClick={() => onPlay(item)} className="flex items-center gap-2 text-sm font-semibold text-blue-400 hover:text-blue-300 transition-colors">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            Watch Now
          </button>
          <button onClick={() => navigate(`/video/${item.videoId || item.id}`)} className={`text-xs font-mono transition-colors ${textMuted} hover:text-blue-400`}>
            View Details ↗
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Image Post Card ──────────────────────────────────────
function ImagePostCard({ item, onOpen, isDark }) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const imgSrc = buildGatewayUrl(item.ipfsCid);
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const cardBg = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";
  const text = isDark ? "text-white" : "text-neutral-900";
  return (
    <article className={`rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-lg ${cardBg}`}>
      <div className="flex items-center gap-3 px-6 pt-5 pb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-fuchsia-700 flex items-center justify-center text-[11px] font-black text-white flex-shrink-0">TS</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${text}`}>TrustStream News</span>
            <span className="text-[8px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded uppercase tracking-wide">Verified</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded border text-purple-400 border-purple-800/30 bg-purple-950/20 font-mono">🖼 IMAGE</span>
          </div>
          <p className={`text-[11px] mt-0.5 ${textMuted}`}>{timeAgo(item.registeredAt)}</p>
        </div>
      </div>
      <div onClick={() => onOpen(item)} className="relative cursor-pointer bg-neutral-950 group">
        {imgSrc && !imgError ? (
          <img
            src={imgSrc}
            alt={item.title}
            className="w-full object-contain group-hover:opacity-95 transition-opacity duration-200"
            style={{ maxHeight: "85vh", minHeight: "320px" }}
            onError={() => setImgError(true)}
          />
        ) : item.ipfsStatus === "uploading" || item.ipfsStatus === "pending" ? (
          <div className="h-80 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 rounded-full border-t-2 border-purple-400 animate-spin" />
            <p className={`text-xs font-mono ${textMuted}`}>Uploading to IPFS…</p>
          </div>
        ) : (
          <div className="h-80 flex flex-col items-center justify-center gap-2">
            <span className="text-5xl">🖼️</span>
            <p className={`text-xs font-mono ${textMuted}`}>Image not yet available</p>
          </div>
        )}
        {imgSrc && !imgError && (
          <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="bg-black/70 backdrop-blur-sm text-white text-[10px] font-mono px-2.5 py-1 rounded-md">click to expand ⤢</span>
          </div>
        )}
      </div>
      <div className="px-6 pt-4 pb-5 space-y-3">
        <div>
          <h2 className={`font-bold text-lg leading-snug ${text}`}>{item.title}</h2>
          {item.description && <p className={`text-sm mt-1 leading-relaxed line-clamp-2 ${textMuted}`}>{item.description}</p>}
        </div>
        <VerifPills item={item} />
        <div className={`flex items-center justify-between pt-3 border-t ${isDark ? "border-neutral-800" : "border-neutral-100"}`}>
          {imgSrc && !imgError ? (
            <a href={imgSrc} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-semibold text-purple-400 hover:text-purple-300 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open on IPFS
            </a>
          ) : <span />}
          <button onClick={() => navigate(`/image/${item.imageId}`)} className={`text-xs font-mono ml-auto transition-colors ${textMuted} hover:text-purple-400`}>
            View Details ↗
          </button>
        </div>
      </div>
    </article>
  );
}

// ─── Main ─────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { key: "all", label: "All Status" },
  { key: "verified", label: "Verified" },
  { key: "disputed", label: "Disputed" },
  { key: "revoked", label: "Revoked" },
];

export default function Home() {
  const { isDark } = useTheme();
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ all: 0, video: 0, image: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [mediaType, setMediaType] = useState("all");
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [playingItem, setPlayingItem] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Debounce the search box so every keystroke doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchPage = useCallback((pageNum, { append } = {}) => {
    const setBusy = append ? setLoadingMore : setLoading;
    setBusy(true);
    return feedAPI
      .getFeed({ search, mediaType, status, page: pageNum, limit: 10 })
      .then((res) => {
        const data = res.data || {};
        setItems((prev) => (append ? [...prev, ...(data.feed || [])] : data.feed || []));
        setCounts(data.counts || { all: 0, video: 0, image: 0 });
        setHasMore(Boolean(data.hasMore));
        setPage(pageNum);
      })
      .catch(console.error)
      .finally(() => setBusy(false));
  }, [search, mediaType, status]);

  // Any filter/search change resets back to page 1.
  useEffect(() => { fetchPage(1); }, [fetchPage]);

  const videoCount = counts.video;
  const imageCount = counts.image;

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";

  if (loading) {
    return (
      <div className={`min-h-screen ${bg}`}>
        <Navbar />
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className={`rounded-2xl border p-5 space-y-3 ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl animate-pulse ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`} />
                <div className="space-y-1.5 flex-1">
                  <div className={`h-3 w-32 rounded animate-pulse ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`} />
                  <div className={`h-2 w-16 rounded animate-pulse ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`} />
                </div>
              </div>
              <div className={`rounded-xl animate-pulse ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`} style={{ aspectRatio: "16/9" }} />
              <div className={`h-4 w-3/4 rounded animate-pulse ${isDark ? "bg-neutral-800" : "bg-neutral-200"}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />
      {playingItem && <VideoModal item={playingItem} onClose={() => setPlayingItem(null)} isDark={isDark} />}
      {previewImage && <ImageLightbox item={previewImage} onClose={() => setPreviewImage(null)} isDark={isDark} />}

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        {/* Search bar */}
        <div className={`rounded-2xl border px-4 py-3 flex items-center gap-2.5 ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
          <svg className={`w-4 h-4 flex-shrink-0 ${textMuted}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by title or description…"
            className={`flex-1 bg-transparent outline-none text-sm ${text} placeholder:${textMuted}`}
          />
          {searchInput && (
            <button onClick={() => setSearchInput("")} className={`text-xs ${textMuted} hover:text-red-400`}>✕</button>
          )}
        </div>

        {/* Filter bar */}
        <div className={`rounded-2xl border px-5 py-3 flex flex-wrap items-center gap-3 ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_6px_#ef4444]" />
            <span className={`text-[10px] font-bold uppercase tracking-widest ${textMuted}`}>Live Feed</span>
          </div>
          <div className={`flex gap-1 rounded-lg p-0.5 flex-1 min-w-[220px] max-w-[280px] ${isDark ? "bg-neutral-800" : "bg-neutral-100"}`}>
            {[
              { key: "all", label: `All (${counts.all})` },
              { key: "video", label: `Video (${videoCount})` },
              { key: "image", label: `Image (${imageCount})` },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setMediaType(key)}
                className={`flex-1 text-[10px] font-mono py-1.5 rounded-md transition-all ${mediaType === key ? (isDark ? "bg-white/10 text-white" : "bg-white text-neutral-900 shadow-sm") : textMuted}`}>
                {label}
              </button>
            ))}
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={`text-[10px] font-mono rounded-lg px-2.5 py-1.5 border outline-none ${isDark ? "bg-neutral-800 border-neutral-700 text-neutral-300" : "bg-neutral-100 border-neutral-200 text-neutral-700"}`}
          >
            {STATUS_OPTIONS.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Empty */}
        {!loading && items.length === 0 && (
          <div className={`rounded-2xl border p-12 text-center space-y-4 ${isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200"}`}>
            <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center text-3xl mx-auto ${isDark ? "bg-neutral-800 border-neutral-700" : "bg-neutral-100 border-neutral-200"}`}>📡</div>
            <div>
              <p className={`font-semibold ${text}`}>No content found</p>
              <p className={`text-sm mt-1 ${textMuted}`}>
                {search || mediaType !== "all" || status !== "all" ? "Try a different search or filter" : "Sync from blockchain or check back later"}
              </p>
            </div>
          </div>
        )}

        {/* Cards */}
        {items.map((item) => {
          const key = item.videoId || item.imageId || item.id;
          return item.mediaType === "image"
            ? <ImagePostCard key={key} item={item} onOpen={setPreviewImage} isDark={isDark} />
            : <VideoPostCard key={key} item={item} onPlay={setPlayingItem} isDark={isDark} />;
        })}

        {hasMore && (
          <button onClick={() => fetchPage(page + 1, { append: true })} disabled={loadingMore}
            className={`w-full py-3 rounded-2xl border text-sm font-semibold transition-all disabled:opacity-50 ${isDark ? "bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white" : "bg-white border-neutral-200 text-neutral-500 hover:text-neutral-900"}`}>
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        )}
      </div>
    </div>
  );
}
