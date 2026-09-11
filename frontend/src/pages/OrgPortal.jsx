import { useCallback, useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { createOrgPortalAPI, API_ORIGIN } from "../services/api";
import { useTheme } from "../context/ThemeContext";

// Shared implementation for both /broadcaster and /auditor - same workflow,
// same UI, only the org identity, label, and next-stage copy differ. Each
// instance gets its own sessionStorage key so logging into one doesn't
// grant the other (they really are different Fabric identities on the
// backend - see fabric.service.js's per-org connections).
export default function OrgPortal({ org, orgLabel, accentColor, nextStageLabel }) {
  const { isDark } = useTheme();
  const api = createOrgPortalAPI(org);
  const sessionKey = `truststream-${org}-passcode`;

  const [passcode, setPasscode] = useState("");
  const [authed, setAuthed] = useState(() => Boolean(sessionStorage.getItem(sessionKey)));
  const [loginError, setLoginError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actioningId, setActioningId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const cardBg = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";

  const fetchPending = useCallback(() => {
    const storedPasscode = sessionStorage.getItem(sessionKey);
    if (!storedPasscode) return;
    setLoading(true);
    setError(null);
    api.getPending(storedPasscode)
      .then((res) => setItems(res.data?.items || []))
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem(sessionKey);
          setAuthed(false);
        } else {
          setError(err.response?.data?.error || err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [org]);

  useEffect(() => {
    if (authed) fetchPending();
  }, [authed, fetchPending]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      await api.login(passcode);
      sessionStorage.setItem(sessionKey, passcode);
      setAuthed(true);
    } catch (err) {
      setLoginError(err.response?.data?.error || "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem(sessionKey);
    setAuthed(false);
    setItems([]);
  };

  const handleApprove = async (item) => {
    const storedPasscode = sessionStorage.getItem(sessionKey);
    setActioningId(`${item.mediaType}:${item.mediaId}`);
    try {
      await api.approve(storedPasscode, item.mediaType, item.mediaId);
      setItems((prev) => prev.filter((i) => i.mediaId !== item.mediaId));
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActioningId(null);
    }
  };

  const handleReject = async (item) => {
    const storedPasscode = sessionStorage.getItem(sessionKey);
    setActioningId(`${item.mediaType}:${item.mediaId}`);
    try {
      await api.reject(storedPasscode, item.mediaType, item.mediaId, rejectReason);
      setItems((prev) => prev.filter((i) => i.mediaId !== item.mediaId));
      setRejectingId(null);
      setRejectReason("");
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActioningId(null);
    }
  };

  if (!authed) {
    return (
      <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
        <Navbar />
        <div className="max-w-sm mx-auto px-4 py-20">
          <div className={`rounded-2xl border p-6 ${cardBg}`}>
            <h1 className="text-lg font-bold mb-1">{orgLabel} Portal</h1>
            <p className={`text-xs mb-5 ${textMuted}`}>Enter the shared access passcode to review pending submissions.</p>
            <form onSubmit={handleLogin} className="space-y-3">
              <input
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Passcode"
                autoFocus
                className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none ${isDark ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-50 border-neutral-200 text-neutral-900"}`}
              />
              {loginError && <p className="text-xs text-red-400">✗ {loginError}</p>}
              <button
                type="submit"
                disabled={loggingIn || !passcode}
                className="w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-colors disabled:opacity-50"
                style={{ background: accentColor }}
              >
                {loggingIn ? "Checking…" : `Log in as ${orgLabel}`}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${bg} ${text} transition-colors duration-300`}>
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">{orgLabel} Approval Queue</h1>
            <p className={`text-xs mt-0.5 ${textMuted}`}>
              {items.length} item{items.length === 1 ? "" : "s"} awaiting your review. Approving moves each one to {nextStageLabel}.
            </p>
          </div>
          <button onClick={handleLogout} className={`text-xs font-mono ${textMuted} hover:text-red-400`}>
            Log out
          </button>
        </div>

        {error && (
          <div className={`rounded-2xl border p-4 text-sm ${isDark ? "bg-red-950/20 border-red-800/30 text-red-400" : "bg-red-50 border-red-200 text-red-700"}`}>
            ✗ {error}
          </div>
        )}

        {loading && (
          <div className={`rounded-2xl border p-10 text-center ${cardBg}`}>
            <div className="w-6 h-6 rounded-full border-t-2 mx-auto animate-spin" style={{ borderColor: accentColor }} />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className={`rounded-2xl border p-10 text-center ${cardBg}`}>
            <span className="text-3xl block mb-2">✅</span>
            <p className={`text-sm ${textMuted}`}>Nothing waiting on you right now.</p>
          </div>
        )}

        {items.map((item) => {
          const key = `${item.mediaType}:${item.mediaId}`;
          const isActing = actioningId === key;
          const isRejecting = rejectingId === key;
          return (
            <div key={key} className={`rounded-2xl border p-4 ${cardBg}`}>
              <div className="flex gap-3">
                {item.thumbnailUrl ? (
                  <img src={`${API_ORIGIN}${item.thumbnailUrl}`} alt="" className="w-20 h-20 rounded-xl object-cover flex-shrink-0" />
                ) : (
                  <div className={`w-20 h-20 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${isDark ? "bg-neutral-800" : "bg-neutral-100"}`}>
                    {item.mediaType === "video" ? "🎬" : "🖼️"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${isDark ? "border-neutral-700 text-neutral-400" : "border-neutral-200 text-neutral-500"}`}>
                      {item.mediaType.toUpperCase()}
                    </span>
                    <span className={`text-[9px] font-mono ${textMuted}`}>{new Date(item.createdAt).toLocaleString()}</span>
                  </div>
                  <h3 className="font-semibold text-sm mt-1 truncate">{item.title}</h3>
                  {item.description && <p className={`text-xs mt-0.5 line-clamp-2 ${textMuted}`}>{item.description}</p>}
                  <a href={item.detailUrl} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-blue-400 hover:text-blue-300 mt-1 inline-block">
                    View full details ↗
                  </a>
                </div>
              </div>

              {isRejecting ? (
                <div className="mt-3 space-y-2">
                  <input
                    type="text"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason for rejection (optional)"
                    className={`w-full rounded-lg border px-3 py-2 text-xs outline-none ${isDark ? "bg-neutral-800 border-neutral-700" : "bg-neutral-50 border-neutral-200"}`}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReject(item)}
                      disabled={isActing}
                      className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {isActing ? "Rejecting…" : "Confirm Reject"}
                    </button>
                    <button
                      onClick={() => { setRejectingId(null); setRejectReason(""); }}
                      className={`flex-1 py-2 rounded-lg border text-xs font-semibold ${isDark ? "border-neutral-700 text-neutral-300" : "border-neutral-200 text-neutral-600"}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleApprove(item)}
                    disabled={isActing}
                    className="flex-1 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
                    style={{ background: accentColor }}
                  >
                    {isActing ? "Approving…" : `✓ Approve → ${nextStageLabel}`}
                  </button>
                  <button
                    onClick={() => setRejectingId(key)}
                    disabled={isActing}
                    className={`px-4 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50 ${isDark ? "border-neutral-700 text-neutral-300 hover:border-red-500 hover:text-red-400" : "border-neutral-200 text-neutral-600 hover:border-red-400 hover:text-red-600"}`}
                  >
                    ✗ Reject
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
