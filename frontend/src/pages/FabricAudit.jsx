import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api, { videoAPI } from "../services/api";
import Navbar from "../components/Navbar";
import { useTheme } from "../context/ThemeContext";

const ORG_ORDER = ["NewsAgency", "Broadcaster", "Auditor"];

const SSE_URL = `${api.defaults.baseURL}/upload/blockchain/fabric-events`;

const STATUS_STYLE = {
  ready: { label: "Committed", dot: "bg-emerald-400", text: "text-emerald-400", border: "border-emerald-500/30" },
  degraded: { label: "Degraded", dot: "bg-amber-400", text: "text-amber-400", border: "border-amber-500/30" },
  skipped: { label: "Skipped", dot: "bg-neutral-400", text: "text-neutral-400", border: "border-neutral-500/30" },
};

function shortHash(hash) {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : hash;
}

function StatBox({ label, value, accent, isDark }) {
  return (
    <div className={`rounded-2xl border px-5 py-4 ${isDark ? "bg-neutral-900/40 border-white/8" : "bg-white border-neutral-200"}`}>
      <p className={`text-[10px] uppercase tracking-widest font-mono ${isDark ? "text-neutral-500" : "text-neutral-500"}`}>
        {label}
      </p>
      <p className={`text-2xl font-bold mt-1 ${accent || (isDark ? "text-white" : "text-neutral-900")}`}>{value}</p>
    </div>
  );
}

function EndorsementRow({ entry, isDark, isNew }) {
  const [showRaw, setShowRaw] = useState(false);
  const status = STATUS_STYLE[entry.fabricStatus] || STATUS_STYLE.skipped;
  const cardBg = isNew
    ? isDark
      ? "bg-cyan-950/30 border-cyan-500/40"
      : "bg-cyan-50 border-cyan-300"
    : entry.revoked
    ? isDark
      ? "bg-red-950/20 border-red-800/40 hover:bg-red-950/30"
      : "bg-red-50 border-red-200 hover:bg-red-100"
    : entry.disputed
    ? isDark
      ? "bg-amber-950/20 border-amber-800/40 hover:bg-amber-950/30"
      : "bg-amber-50 border-amber-200 hover:bg-amber-100"
    : isDark
    ? "bg-neutral-900/40 border-white/8 hover:bg-neutral-900/70"
    : "bg-white border-neutral-200 hover:bg-neutral-50";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";

  const toggleRaw = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowRaw((v) => !v);
  };

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 transition-colors duration-700 ${cardBg}`}>
      <Link to={entry.mediaType === "video" ? `/video/${entry.id}` : `/image/${entry.id}`} className="block">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[9px] font-mono uppercase rounded-full border px-2 py-0.5 ${isDark ? "border-white/10 text-neutral-400" : "border-neutral-200 text-neutral-500"}`}>
                {entry.mediaType}
              </span>
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full border px-2 py-0.5 ${status.border} ${status.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
              {entry.disputed && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-amber-500 text-white">
                  ⚠ Disputed
                </span>
              )}
              {entry.revoked && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-red-600 text-white">
                  Revoked
                </span>
              )}
              {isNew && (
                <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 bg-cyan-500 text-white">
                  <span className="w-1 h-1 rounded-full bg-white animate-pulse" />
                  Just committed
                </span>
              )}
            </div>
            <p className={`font-semibold mt-2 truncate ${isDark ? "text-white" : "text-neutral-900"}`}>{entry.title}</p>
            <p className={`text-[11px] font-mono mt-1 ${textMuted}`}>
              {entry.registeredAt ? new Date(entry.registeredAt).toLocaleString() : "No timestamp"}
              {entry.createdByOrg && <> · submitted by {entry.createdByOrg}</>}
            </p>
          </div>

          <p className={`text-[11px] font-mono ${textMuted} shrink-0`} title={entry.proofHash || ""}>
            {shortHash(entry.proofHash)}
          </p>
        </div>

        {entry.fabricStatus === "ready" && entry.endorsements && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {ORG_ORDER.map((org) => {
              const endorsed = entry.endorsements?.[org];
              const peer = entry.endorsingPeers?.[org];
              return (
                <div
                  key={org}
                  className={`rounded-xl border px-3 py-2 flex items-center justify-between gap-2 ${
                    endorsed
                      ? isDark ? "border-emerald-700/30 bg-emerald-950/20" : "border-emerald-200 bg-emerald-50"
                      : isDark ? "border-white/8 bg-neutral-900/40" : "border-neutral-200 bg-neutral-50"
                  }`}
                >
                  <span className={`text-[11px] font-semibold ${endorsed ? (isDark ? "text-emerald-400" : "text-emerald-700") : textMuted}`}>
                    {org}
                  </span>
                  <span className={`text-[10px] font-mono ${textMuted}`}>
                    {endorsed ? `via ${peer ? peer.split(".")[0] : "?"}` : "pending"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {entry.txId && (
          <p className={`mt-3 text-[10px] font-mono break-all ${textMuted}`}>
            TX: {entry.txId}{entry.blockNumber != null && ` · Block: ${entry.blockNumber}`}
          </p>
        )}

        {entry.disputed && (
          <p className={`mt-3 text-[11px] font-mono ${isDark ? "text-amber-400/90" : "text-amber-700"}`}>
            Reporting orgs: {Object.keys(entry.tamperReports || {}).join(", ") || "—"}
          </p>
        )}

        {entry.revoked && (
          <p className={`mt-3 text-[11px] font-mono ${isDark ? "text-red-400/90" : "text-red-700"}`}>
            Endorsement withdrawn
            {entry.revokedAt && ` on ${new Date(entry.revokedAt).toLocaleString()}`}
            {entry.revocationReason && ` — ${entry.revocationReason}`}
          </p>
        )}

        {entry.fabricStatus !== "ready" && entry.fabricError && (
          <p className={`mt-3 text-[11px] font-mono ${isDark ? "text-amber-400/80" : "text-amber-600"}`}>
            {entry.fabricError}
          </p>
        )}
      </Link>

      {entry.rawProof && (
        <div className={`mt-4 pt-3 border-t ${isDark ? "border-white/8" : "border-neutral-200"}`}>
          <button
            onClick={toggleRaw}
            className={`text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border transition-colors ${
              isDark ? "border-white/10 text-neutral-400 hover:border-white/20" : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
            }`}
          >
            {showRaw ? "▾ Hide raw ledger JSON" : "▸ View raw ledger JSON"}
          </button>

          {showRaw && (
            <pre className={`mt-2 rounded-xl p-3 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap break-all ${
              isDark ? "bg-neutral-950 border border-white/8 text-neutral-300" : "bg-neutral-50 border border-neutral-200 text-neutral-700"
            }`}>
              {JSON.stringify(entry.rawProof, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function FabricAudit() {
  const { isDark } = useTheme();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [live, setLive] = useState(false);
  const [newIds, setNewIds] = useState(() => new Set());
  const highlightTimers = useRef([]);

  useEffect(() => {
    setLoading(true);
    videoAPI.blockchain
      .getFabricAudit()
      .then((res) => {
        setData(res.data);
        setError(null);
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Could not load Fabric audit log");
      })
      .finally(() => setLoading(false));
  }, []);

  // Live updates: the backend pushes a MediaRegistered event the moment a block
  // commits on the channel. The event payload is deliberately small, so we use
  // it as a signal to refetch rather than trying to splice a partial row in.
  useEffect(() => {
    const source = new EventSource(SSE_URL);

    source.addEventListener("ready", () => setLive(true));

    // The event fires the instant the block commits, but this dashboard reads
    // the local catalog, which the route writes a moment later once the Fabric
    // call returns. Refetch again shortly after so the row shows up with its
    // endorsement details rather than mid-write.
    const onLedgerChange = (message, { highlight }) => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return;
      }

      const refetch = () =>
        videoAPI.blockchain
          .getFabricAudit()
          .then((res) => setData(res.data))
          .catch(() => {});

      refetch();
      highlightTimers.current.push(setTimeout(refetch, 1500));
      highlightTimers.current.push(setTimeout(refetch, 4000));

      if (!highlight) return;

      setNewIds((prev) => new Set(prev).add(payload.mediaId));

      // Let the highlight fade so the row settles in with the rest.
      highlightTimers.current.push(
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            next.delete(payload.mediaId);
            return next;
          });
        }, 15000)
      );
    };

    source.addEventListener("MediaRegistered", (m) =>
      onLedgerChange(m, { highlight: true })
    );
    // Revocations get no "just committed" highlight -- the red revoked styling
    // is the signal, and flagging it as new would read as good news.
    source.addEventListener("MediaRevoked", (m) =>
      onLedgerChange(m, { highlight: false })
    );

    // EventSource retries on its own; this only reflects the current state.
    source.onerror = () => setLive(false);

    return () => {
      source.close();
      highlightTimers.current.forEach(clearTimeout);
      highlightTimers.current = [];
    };
  }, []);

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

  if (error) {
    return (
      <div className={`min-h-screen ${bg} ${text}`}>
        <Navbar />
        <div className="min-h-[60vh] flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-lg font-semibold">{error}</p>
            <button onClick={() => navigate("/")} className="mt-3 text-cyan-400 hover:underline text-sm">
              Back to feed
            </button>
          </div>
        </div>
      </div>
    );
  }

  const entries = data?.entries || [];
  const filtered =
    filter === "all"
      ? entries
      : filter === "revoked"
      ? entries.filter((e) => e.revoked)
      : filter === "disputed"
      ? entries.filter((e) => e.disputed)
      : entries.filter((e) => e.fabricStatus === filter);
  const summary = data?.summary || { total: 0, ready: 0, degraded: 0, skipped: 0, disputed: 0 };
  const revokedCount = entries.filter((e) => e.revoked).length;

  return (
    <div className={`min-h-screen ${bg} ${text}`}>
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className={`rounded-2xl border p-6 ${cardBg}`}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <p className={`text-[10px] uppercase tracking-widest font-mono ${textMuted}`}>
              Hyperledger Fabric · 3-Org Consortium
            </p>

            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-semibold rounded-full border px-2.5 py-1 ${
                live
                  ? "border-emerald-500/40 text-emerald-400"
                  : isDark
                  ? "border-white/10 text-neutral-500"
                  : "border-neutral-200 text-neutral-400"
              }`}
              title={
                live
                  ? "Subscribed to chaincode events — new registrations appear instantly"
                  : "Not receiving chaincode events"
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  live ? "bg-emerald-400 animate-pulse" : "bg-neutral-500"
                }`}
              />
              {live ? "Live" : "Offline"}
            </span>
          </div>

          <h1 className="text-2xl font-bold mt-2">Fabric Audit Dashboard</h1>
          <p className={`text-sm mt-1 ${textMuted}`}>
            Every media proof written to the mychannel ledger — AND(NewsAgency, Broadcaster, Auditor) endorsement, per-org, per-peer.
          </p>
          {live && (
            <p className={`text-[11px] font-mono mt-2 ${textMuted}`}>
              Listening for chaincode events — new registrations appear here the moment their block commits.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatBox label="Total Records" value={summary.total} isDark={isDark} />
          <StatBox label="Committed" value={summary.ready} accent="text-emerald-400" isDark={isDark} />
          <StatBox label="Disputed" value={summary.disputed} accent="text-amber-400" isDark={isDark} />
          <StatBox label="Revoked" value={revokedCount} accent="text-red-400" isDark={isDark} />
          <StatBox label="Degraded" value={summary.degraded} accent="text-amber-400" isDark={isDark} />
        </div>

        <div className="flex flex-wrap gap-2">
          {["all", "ready", "disputed", "revoked", "degraded", "skipped"].map((key) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[11px] font-mono uppercase rounded-full border px-3 py-1.5 transition-colors ${
                filter === key
                  ? "border-cyan-500/40 text-cyan-400 bg-cyan-950/20"
                  : isDark
                  ? "border-white/10 text-neutral-400 hover:border-white/20"
                  : "border-neutral-200 text-neutral-500 hover:border-neutral-300"
              }`}
            >
              {key}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filtered.length ? (
            filtered.map((entry) => (
              <EndorsementRow
                key={`${entry.mediaType}-${entry.id}`}
                entry={entry}
                isDark={isDark}
                isNew={newIds.has(entry.id)}
              />
            ))
          ) : (
            <div className={`rounded-2xl border p-6 text-center ${cardBg}`}>
              <p className={textMuted}>No Fabric ledger records match this filter yet.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
