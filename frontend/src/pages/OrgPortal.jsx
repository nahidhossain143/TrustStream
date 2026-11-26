import { useCallback, useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import { createOrgPortalAPI, API_ORIGIN } from "../services/api";
import { useTheme } from "../context/ThemeContext";

// One badge in a pending item's integrity-check row (Hash / Fabric / C2PA).
function CheckPill({ label, ok, isDark }) {
  const cls = ok
    ? (isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700")
    : (isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700");
  return (
    <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${cls}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

// The Auditor's Independent Audit: one line per check with its evidence.
// ok === null means the check could not be completed, not that it failed.
function AuditPanel({ entry, isDark }) {
  const muted = "text-neutral-500";
  return (
    <div className={`mt-3 rounded-lg border p-2.5 ${isDark ? "border-neutral-800" : "border-neutral-200"}`}>
      <p className="text-[11px] font-semibold mb-1.5">Independent Audit</p>
      {(!entry || entry.status === "checking") && (
        <p className={`text-[11px] ${muted}`}>⏳ Downloading from IPFS and checking the ledger history…</p>
      )}
      {entry?.status === "error" && <p className="text-[11px] text-red-400">⚠ Audit failed: {entry.error}</p>}
      {entry?.status === "done" && (
        <ul className="space-y-1">
          {entry.result.checks.map((c) => (
            <li key={c.id} className="text-[11px] flex gap-1.5">
              <span className={c.ok === true ? "text-emerald-500" : c.ok === false ? "text-red-500" : "text-amber-500"}>
                {c.ok === true ? "✓" : c.ok === false ? "✗" : "?"}
              </span>
              <span>
                <span className="font-semibold">{c.label}:</span> <span className={muted}>{c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Shared implementation for both /broadcaster and /auditor - same workflow,
// same UI, but the Auditor additionally gets the Independent Audit. Each
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
  // Per-item integrity check results, keyed by "mediaType:mediaId" -
  // {status: "checking"|"done"|"error", result, error}. Runs automatically
  // for every pending item so Broadcaster/Auditor see an objective
  // hash/Fabric/C2PA signal instead of approving on title + thumbnail alone.
  const [checks, setChecks] = useState({});
  // Item awaiting the "Approve Anyway" confirmation because its check failed.
  const [confirmingId, setConfirmingId] = useState(null);
  const [reportingId, setReportingId] = useState(null);
  // Independent Audit results (Auditor only), same keys as checks.
  const [audits, setAudits] = useState({});
  const isAuditor = org === "auditor";

  const bg = isDark ? "bg-[#080808]" : "bg-neutral-100";
  const text = isDark ? "text-white" : "text-neutral-900";
  const textMuted = isDark ? "text-neutral-500" : "text-neutral-400";
  const cardBg = isDark ? "bg-neutral-900 border-neutral-800" : "bg-white border-neutral-200";

  const runChecks = useCallback((pendingItems, storedPasscode) => {
    setChecks((prev) => {
      const next = { ...prev };
      pendingItems.forEach((item) => {
        next[`${item.mediaType}:${item.mediaId}`] = { status: "checking" };
      });
      return next;
    });

    pendingItems.forEach((item) => {
      const key = `${item.mediaType}:${item.mediaId}`;
      api.check(storedPasscode, item.mediaType, item.mediaId)
        .then((res) => {
          setChecks((prev) => ({ ...prev, [key]: { status: "done", result: res.data } }));
        })
        .catch((err) => {
          setChecks((prev) => ({
            ...prev,
            [key]: { status: "error", error: err.response?.data?.error || err.message },
          }));
        });
    });
  }, []);

  const runAudits = useCallback((pendingItems, storedPasscode) => {
    pendingItems.forEach((item) => {
      const key = `${item.mediaType}:${item.mediaId}`;
      const save = (value) => setAudits((prev) => ({ ...prev, [key]: value }));
      save({ status: "checking" });
      api.audit(storedPasscode, item.mediaType, item.mediaId)
        .then((res) => save({ status: "done", result: res.data }))
        .catch((err) => save({ status: "error", error: err.response?.data?.error || err.message }));
    });
  }, []);

  const fetchPending = useCallback(() => {
    const storedPasscode = sessionStorage.getItem(sessionKey);
    if (!storedPasscode) return;
    setLoading(true);
    setError(null);
    api.getPending(storedPasscode)
      .then((res) => {
        const pendingItems = res.data?.items || [];
        setItems(pendingItems);
        runChecks(pendingItems, storedPasscode);
        if (isAuditor) runAudits(pendingItems, storedPasscode);
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          sessionStorage.removeItem(sessionKey);
          setAuthed(false);
        } else {
          setError(err.response?.data?.error || err.message);
        }
      })
      .finally(() => setLoading(false));
  }, [org, runChecks, runAudits]);

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
    setChecks({});
    setAudits({});
  };

  const doApprove = async (item) => {
    const storedPasscode = sessionStorage.getItem(sessionKey);
    setActioningId(`${item.mediaType}:${item.mediaId}`);
    try {
      await api.approve(storedPasscode, item.mediaType, item.mediaId);
      setItems((prev) => prev.filter((i) => i.mediaId !== item.mediaId));
      setConfirmingId(null);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setActioningId(null);
    }
  };

  // The check runs automatically per item (see runChecks); a failed or
  // still-in-flight check doesn't block Approve outright, but routes
  // through a second "Approve Anyway" confirmation so the org can't
  // rubber-stamp past a red flag by accident.
  const handleApprove = (item) => {
    const key = `${item.mediaType}:${item.mediaId}`;
    const check = checks[key];
    const audit = audits[key];
    const passed = check?.status === "done" && check.result?.passed === true
      && (!isAuditor || (audit?.status === "done" && audit.result?.passed === true));
    if (!passed) {
      setConfirmingId(key);
      return;
    }
    doApprove(item);
  };

  // A failed check shouldn't end in a bare "Reject" - the org files the
  // evidence. The backend assembles the report (every signal, what failed,
  // the ledger record at review time); this just saves it.
  const downloadReport = async (item) => {
    const storedPasscode = sessionStorage.getItem(sessionKey);
    const key = `${item.mediaType}:${item.mediaId}`;
    setReportingId(key);
    try {
      const res = await api.report(storedPasscode, item.mediaType, item.mediaId);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `truststream-${org}-review-${item.mediaType}-${item.mediaId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setReportingId(null);
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
          const isConfirming = confirmingId === key;
          const checkEntry = checks[key];
          const checkResult = checkEntry?.status === "done" ? checkEntry.result : null;
          const auditEntry = audits[key];
          const isAuditing = isAuditor && (!auditEntry || auditEntry.status === "checking");
          const isChecking = !checkEntry || checkEntry.status === "checking";
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

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {isChecking && (
                  <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${isDark ? "bg-neutral-800 text-neutral-400" : "bg-neutral-100 text-neutral-500"}`}>
                    ⏳ Verifying hash + Fabric + C2PA + forensics…
                  </span>
                )}
                {checkEntry?.status === "error" && (
                  <span className={`text-[10px] font-mono px-2 py-1 rounded-full ${isDark ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700"}`}>
                    ⚠ Check failed: {checkEntry.error}
                  </span>
                )}
                {checkResult && (
                  <>
                    <CheckPill label="Hash" ok={checkResult.hash?.fileIntact === true} isDark={isDark} />
                    <CheckPill
                      label={checkResult.fabric?.agreement ? `Fabric (${checkResult.fabric.agreement})` : "Fabric"}
                      ok={checkResult.fabric?.valid === true}
                      isDark={isDark}
                    />
                    <CheckPill label="C2PA" ok={checkResult.c2pa?.signed === true && checkResult.c2pa?.valid === true} isDark={isDark} />
                    <CheckPill
                      label={checkResult.forensics?.label ? `Forensics: ${checkResult.forensics.label}` : "Forensics"}
                      ok={checkResult.forensics?.label === "Authentic"}
                      isDark={isDark}
                    />
                    <button
                      onClick={() => downloadReport(item)}
                      disabled={reportingId === key}
                      className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-colors disabled:opacity-50 ${
                        checkResult.passed
                          ? (isDark ? "border-neutral-700 text-neutral-400 hover:text-neutral-200" : "border-neutral-200 text-neutral-500 hover:text-neutral-700")
                          : (isDark ? "border-amber-700/50 text-amber-400 hover:border-amber-500" : "border-amber-300 text-amber-700 hover:border-amber-500")
                      }`}
                    >
                      {reportingId === key ? "…" : "⬇ Report"}
                    </button>
                  </>
                )}
              </div>

              {isAuditor && <AuditPanel entry={auditEntry} isDark={isDark} />}

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
              ) : isConfirming ? (
                <div className="mt-3 space-y-2">
                  <div className={`rounded-lg border p-2.5 text-xs ${isDark ? "bg-amber-950/20 border-amber-800/30 text-amber-400" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
                    ⚠ {checkEntry?.status === "error"
                      ? "The integrity check couldn't complete for this item."
                      : `This item did not pass every automatic check${isAuditor ? " or the Independent Audit" : ""}.`} Approve only if you've verified it another way.
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => doApprove(item)}
                      disabled={isActing}
                      className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      {isActing ? "Approving…" : "Approve Anyway"}
                    </button>
                    <button
                      onClick={() => downloadReport(item)}
                      disabled={isActing || reportingId === key}
                      className={`flex-1 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50 ${isDark ? "border-amber-700/50 text-amber-400" : "border-amber-300 text-amber-700"}`}
                    >
                      {reportingId === key ? "Generating…" : "⬇ Generate report"}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      disabled={isActing}
                      className={`flex-1 py-2 rounded-lg border text-xs font-semibold disabled:opacity-50 ${isDark ? "border-neutral-700 text-neutral-300" : "border-neutral-200 text-neutral-600"}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleApprove(item)}
                    disabled={isActing || isChecking || isAuditing}
                    className="flex-1 py-2 rounded-lg text-white text-xs font-semibold disabled:opacity-50"
                    style={{ background: accentColor }}
                  >
                    {isActing ? "Approving…" : isChecking || isAuditing ? "Checking…" : `✓ Approve → ${nextStageLabel}`}
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
