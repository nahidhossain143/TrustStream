import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { timelineAPI } from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

function TimelineItem({ event, isDark, isLast }) {
  const color =
    event.category === "register"
      ? "blue"
      : event.category === "endorsement"
      ? "emerald"
      : event.category === "ipfs"
      ? "orange"
      : event.category === "c2pa"
      ? "violet"
      : event.category === "tamper"
      ? "amber"
      : event.category === "revoked" || event.category === "disputed" || event.category === "failed"
      ? "red"
      : "neutral";

  const dotClass = {
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
    orange: "bg-orange-500",
    violet: "bg-violet-500",
    amber: "bg-amber-500",
    red: "bg-red-500",
    neutral: "bg-neutral-500",
  }[color];

  return (
    <div className="relative pl-8">
      {!isLast && (
        <div className={`absolute left-[7px] top-4 bottom-[-18px] w-px ${isDark ? "bg-white/10" : "bg-neutral-200"}`} />
      )}
      <div className={`absolute left-0 top-3 w-3.5 h-3.5 rounded-full ${dotClass}`} />

      <div className={`rounded-xl border p-4 ${
        isDark ? "bg-neutral-900/50 border-white/10" : "bg-white border-neutral-200"
      }`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <p className={`text-sm font-semibold ${isDark ? "text-white" : "text-neutral-900"}`}>
              {event.title}
            </p>
            <p className={`text-[11px] mt-1 ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
              {event.timestampIso ? new Date(event.timestampIso).toLocaleString() : "No timestamp"}
            </p>
          </div>

          <span className={`text-[9px] font-mono uppercase rounded-full border px-2 py-0.5 ${
            isDark ? "border-white/10 text-neutral-400" : "border-neutral-200 text-neutral-500"
          }`}>
            {event.category}
          </span>
        </div>

        <div className={`mt-3 grid gap-2 text-[10px] font-mono ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
          <p>Action: {event.action}</p>
          <p>Org: {event.orgName || "Unknown"}</p>
          <p>Actor: {event.actor || "Local catalog"}</p>
          {event.segmentIndex !== undefined && event.segmentIndex !== null && <p>Segment: {event.segmentIndex}</p>}
          {event.txHash && (
            <a
              href={event.etherscanUrl || `https://sepolia.etherscan.io/tx/${event.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-blue-400 hover:underline break-all"
            >
              TX: {event.txHash}
            </a>
          )}
          {event.note && <p>{event.note}</p>}
        </div>
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const { isDark } = useTheme();
  const { kind, id } = useParams();
  const navigate = useNavigate();

  const [timeline, setTimeline] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mediaKind = kind || "video";

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    timelineAPI
      .getTimeline(mediaKind, id)
      .then((res) => {
        setTimeline(res.data);
        setError(null);
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Timeline not found");
      })
      .finally(() => setLoading(false));
  }, [mediaKind, id]);

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-50";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";
  const cardBg = isDark ? "bg-neutral-900/40 border-white/8" : "bg-white border-neutral-200";

  if (loading) {
    return (
      <div className={`min-h-screen ${bg}`}>
        <Navbar />
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-10 h-10 rounded-full border border-cyan-500/20 border-t-cyan-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !timeline) {
    return (
      <div className={`min-h-screen ${bg} ${text}`}>
        <Navbar />
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-lg font-semibold">{error || "Timeline not found"}</p>
            <button onClick={() => navigate("/")} className="mt-3 text-cyan-400 hover:underline text-sm">
              Back to feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  const events = timeline.events || [];

  return (
    <div className={`min-h-screen ${bg} ${text}`}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <button
          onClick={() => navigate(-1)}
          className={`text-[11px] font-mono ${textMuted} hover:text-cyan-400`}
        >
          ← Back
        </button>

        <div className={`rounded-2xl border p-6 ${cardBg}`}>
          <p className={`text-[10px] uppercase tracking-widest font-mono ${textMuted}`}>
            Immutable Audit Trail
          </p>
          <h1 className="text-2xl font-bold mt-2">{timeline.title || id}</h1>
          <p className={`text-sm mt-1 ${textMuted}`}>
            {mediaKind.toUpperCase()} lifecycle reconstructed from blockchain logs and local provenance records.
          </p>

          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-[10px] font-semibold rounded-full border px-2.5 py-1 border-cyan-500/30 text-cyan-400">
              {timeline.summary?.totalEvents || 0} Events
            </span>
            <span className="text-[10px] font-semibold rounded-full border px-2.5 py-1 border-emerald-500/30 text-emerald-400">
              Status: {timeline.summary?.finalStatus || "Unknown"}
            </span>
            {timeline.source === "local-fallback" && (
              <span className="text-[10px] font-semibold rounded-full border px-2.5 py-1 border-amber-500/30 text-amber-400">
                Local fallback
              </span>
            )}
            {timeline.summary?.hasRevocation && (
              <span className="text-[10px] font-semibold rounded-full border px-2.5 py-1 border-red-500/30 text-red-400">
                Revoked
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {events.length ? (
            events.map((event, index) => (
              <TimelineItem
                key={event.id || `${event.action}-${index}`}
                event={event}
                isDark={isDark}
                isLast={index === events.length - 1}
              />
            ))
          ) : (
            <div className={`rounded-2xl border p-6 text-center ${cardBg}`}>
              <p className={textMuted}>No timeline events found yet.</p>
            </div>
          )}
        </div>

        {timeline.immutabilityNotice && (
          <div className={`rounded-2xl border px-6 py-5 ${
            isDark ? "bg-amber-950/10 border-amber-800/25" : "bg-amber-50 border-amber-200"
          }`}>
            <p className={`text-sm font-semibold ${isDark ? "text-amber-400" : "text-amber-700"}`}>
              Immutability Proof
            </p>
            <p className={`text-[11px] leading-relaxed mt-1 ${isDark ? "text-amber-400/70" : "text-amber-600"}`}>
              {timeline.immutabilityNotice}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}