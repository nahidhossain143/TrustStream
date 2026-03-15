import { useTheme } from "../context/ThemeContext";

// ─── C2PA Badge ──────────────────────────────────────────
function C2PABadge({ c2pa, isDark }) {
  if (!c2pa) return null;

  if (!c2pa.signed) {
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
        isDark ? "bg-neutral-900 border-neutral-800 text-neutral-600" : "bg-neutral-100 border-neutral-200 text-neutral-400"
      }`}>
        📋 C2PA <span className="font-semibold ml-1">Pending</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
      c2pa.valid
        ? isDark
          ? "bg-violet-900/20 border-violet-700/30 text-violet-400"
          : "bg-violet-50 border-violet-200 text-violet-600"
        : isDark
        ? "bg-red-900/20 border-red-700/30 text-red-400"
        : "bg-red-50 border-red-200 text-red-600"
    }`}>
      📋 C2PA{" "}
      <span className="font-semibold ml-1">
        {c2pa.valid ? "✓ Valid" : "✗ Invalid"}
      </span>
      {c2pa.assertionsCount > 0 && (
        <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] ${
          isDark ? "bg-violet-800/40 text-violet-300" : "bg-violet-100 text-violet-600"
        }`}>
          {c2pa.assertionsCount} assertions
        </span>
      )}
    </div>
  );
}

// ─── C2PA Detail Panel ───────────────────────────────────
function C2PADetailPanel({ c2pa, isDark }) {
  if (!c2pa?.signed) return null;

  const card = isDark
    ? "bg-neutral-950 border-neutral-800"
    : "bg-white border-neutral-200";

  const textMuted = isDark ? "text-neutral-600" : "text-neutral-400";
  const panelBg = isDark ? "bg-violet-950/20 border-violet-800/30" : "bg-violet-50 border-violet-200";

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${panelBg}`}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-violet-500 uppercase tracking-widest flex-1">
          <span>📋</span>
          <span>C2PA Provenance Manifest</span>
          <div className="flex-1 h-px bg-violet-800/40 ml-1" />
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${
          c2pa.valid
            ? isDark
              ? "bg-violet-900/40 text-violet-300 border-violet-700/40"
              : "bg-violet-100 text-violet-700 border-violet-200"
            : isDark
            ? "bg-red-900/40 text-red-300 border-red-700/40"
            : "bg-red-100 text-red-700 border-red-200"
        }`}>
          {c2pa.valid ? "SIGNATURE VALID" : "SIGNATURE INVALID"}
        </span>
      </div>

      {/* Instance ID */}
      {c2pa.instanceId && (
        <div className={`rounded-lg px-3 py-2 border ${card}`}>
          <p className={`text-[9px] uppercase tracking-widest font-mono mb-1 ${textMuted}`}>Instance ID</p>
          <p className="font-mono text-[10px] text-violet-500 break-all">{c2pa.instanceId}</p>
        </div>
      )}

      {/* Assertions grid */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Hash Binding",    icon: "🔒", value: "c2pa.hash.data",          color: "text-emerald-500" },
          { label: "Actions",         icon: "⚡", value: "c2pa.actions",             color: "text-blue-500" },
          { label: "Claim Generator", icon: "🏭", value: "c2pa.claim_generator",     color: "text-violet-500" },
          { label: "Creative Work",   icon: "🎬", value: "schema-org",               color: "text-orange-500" },
          { label: "Ingredient",      icon: "🧬", value: "c2pa.ingredient",          color: "text-cyan-500" },
          { label: "Timestamp",       icon: "⏰", value: "c2pa.timestamp",           color: "text-yellow-500" },
          { label: "Consortium",      icon: "🏢", value: "truststream.consortium",   color: "text-pink-500" },
          { label: "Chain Hash",      icon: "⛓️", value: "truststream.chain_hash",   color: "text-indigo-500" },
        ].map(({ label, icon, value, color }) => (
          <div key={value} className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${card}`}>
            <span className="text-[11px]">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className={`text-[9px] font-semibold ${color}`}>{label}</p>
              <p className={`text-[8px] font-mono truncate ${textMuted}`}>{value}</p>
            </div>
            <span className="text-[9px] text-emerald-500 flex-shrink-0">✓</span>
          </div>
        ))}
      </div>

      {/* Signer + Algorithm */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-lg p-2.5 border ${card}`}>
          <p className={`text-[9px] uppercase tracking-widest font-mono mb-1 ${textMuted}`}>Signer</p>
          <p className="font-mono text-[10px] text-violet-500">{c2pa.signer || "NewsAgency"}</p>
        </div>
        <div className={`rounded-lg p-2.5 border ${card}`}>
          <p className={`text-[9px] uppercase tracking-widest font-mono mb-1 ${textMuted}`}>Algorithm</p>
          <p className="font-mono text-[10px] text-violet-500">{c2pa.algorithm || "HMAC-SHA256"}</p>
        </div>
      </div>

      {/* Manifest Hash */}
      {c2pa.manifestHash && (
        <div className={`rounded-lg px-3 py-2 border ${card}`}>
          <p className={`text-[9px] uppercase tracking-widest font-mono mb-1 ${textMuted}`}>Manifest Hash</p>
          <p className="font-mono text-[10px] text-violet-400/80 break-all">{c2pa.manifestHash}</p>
        </div>
      )}

      {/* Error */}
      {!c2pa.valid && c2pa.error && (
        <div className={`rounded-lg px-3 py-2 border ${isDark ? "bg-red-950/20 border-red-800/30" : "bg-red-50 border-red-200"}`}>
          <p className="text-[10px] text-red-500">{c2pa.error}</p>
        </div>
      )}

      <p className={`text-[9px] font-mono ${textMuted}`}>
        C2PA Spec v2.2 • 8 assertions • Sidecar manifest (.c2pa)
      </p>
    </div>
  );
}

// ─── Main VerificationBadge ──────────────────────────────
export default function VerificationBadge({ verified, details }) {
  const { isDark } = useTheme();

  const textMuted = isDark ? "text-neutral-500" : "text-neutral-500";

  if (verified === "checking") {
    return (
      <div className="mt-4 inline-flex items-center gap-2 bg-yellow-600/20 text-yellow-500 px-4 py-2 rounded-full border border-yellow-600/30 text-sm font-medium animate-pulse">
        ⏳ Verifying segment integrity...
      </div>
    );
  }

  if (verified === "warning") {
    return (
      <div className="mt-4 space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-600/20 text-amber-500 px-4 py-2 rounded-full border border-amber-500/30 text-sm font-medium">
          ⚠️ Segment {details?.segmentIndex ?? ""} — Verification delayed
        </div>
        <div className={`text-xs px-3 py-2 rounded-lg border ${
          isDark ? "text-amber-200/80 bg-amber-950/30 border-amber-700/30" : "text-amber-700 bg-amber-50 border-amber-200"
        }`}>
          {details?.blockchainError || "Verification endpoint temporarily unavailable."}
        </div>
      </div>
    );
  }

  if (verified === "verified") {
    return (
      <div className="mt-4 space-y-3">
        {/* Main badge */}
        <div className="inline-flex items-center gap-2 bg-green-600/20 text-green-500 px-4 py-2 rounded-full border border-green-600/30 text-sm font-medium">
          🛡️ Segment {details?.segmentIndex ?? ""} — Authentic & Verified
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Local Hash */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            isDark ? "bg-green-900/20 border-green-700/30 text-green-400" : "bg-green-50 border-green-200 text-green-700"
          }`}>
            🧾 Local Hash <span className="font-semibold ml-1">✓ Match</span>
          </div>

          {/* Blockchain */}
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            details?.blockchainAvailable && details?.blockchainVerified === true
              ? isDark ? "bg-blue-900/20 border-blue-700/30 text-blue-400" : "bg-blue-50 border-blue-200 text-blue-700"
              : details?.blockchainAvailable && details?.blockchainVerified === false
              ? isDark ? "bg-red-900/20 border-red-700/30 text-red-400" : "bg-red-50 border-red-200 text-red-600"
              : isDark ? "bg-neutral-800 border-neutral-700 text-neutral-500" : "bg-neutral-100 border-neutral-200 text-neutral-400"
          }`}>
            ⛓️ Blockchain{" "}
            <span className="font-semibold ml-1">
              {details?.blockchainAvailable && details?.blockchainVerified === true
                ? "✓ Verified"
                : details?.blockchainAvailable && details?.blockchainVerified === false
                ? "✗ Mismatch"
                : "Pending"}
            </span>
            {details?.endorsementCount > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[9px] ${
                isDark ? "bg-blue-800/40 text-blue-300" : "bg-blue-100 text-blue-600"
              }`}>
                {details.endorsementCount}/3 orgs
              </span>
            )}
          </div>

          {/* IPFS */}
          {details?.ipfsCid && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
              isDark ? "bg-orange-900/20 border-orange-700/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-600"
            }`}>
              📌 IPFS <span className="font-semibold ml-1">CID Available</span>
            </div>
          )}

          {/* C2PA */}
          <C2PABadge c2pa={details?.c2pa} isDark={isDark} />
        </div>

        {/* SHA-256 */}
        {details?.clientHash && (
          <div className={`text-xs font-mono break-all px-3 py-2 rounded-lg border ${
            isDark ? "text-neutral-500 bg-neutral-900/80 border-neutral-800" : "text-neutral-500 bg-neutral-100 border-neutral-200"
          }`}>
            <span className={textMuted}>SHA-256: </span>
            <span className="text-green-500">{details.clientHash}</span>
          </div>
        )}

        {/* C2PA Detail */}
        <C2PADetailPanel c2pa={details?.c2pa} isDark={isDark} />

        {details?.blockchainError && (
          <div className={`text-xs px-3 py-2 rounded-lg border ${
            isDark ? "text-neutral-400 bg-neutral-900/80 border-neutral-800" : "text-neutral-500 bg-neutral-100 border-neutral-200"
          }`}>
            Blockchain note: {details.blockchainError}
          </div>
        )}
      </div>
    );
  }

  if (verified === "tampered") {
    return (
      <div className="mt-4 space-y-3">
        {/* Main badge */}
        <div className="inline-flex items-center gap-2 bg-red-600/20 text-red-500 px-4 py-2 rounded-full border border-red-600/30 text-sm font-medium">
          ⚠️ Segment {details?.segmentIndex ?? ""} — Integrity Failed!
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            isDark ? "bg-red-900/20 border-red-700/30 text-red-400" : "bg-red-50 border-red-200 text-red-600"
          }`}>
            🧾 Local Hash <span className="font-semibold ml-1">✗ Mismatch</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            isDark ? "bg-red-900/20 border-red-700/30 text-red-400" : "bg-red-50 border-red-200 text-red-600"
          }`}>
            ⛓️ Blockchain{" "}
            <span className="font-semibold ml-1">
              {details?.blockchainAvailable && details?.blockchainVerified === false ? "✗ Mismatch" : "Pending"}
            </span>
          </div>

          {details?.ipfsCid && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
              isDark ? "bg-orange-900/20 border-orange-700/30 text-orange-400" : "bg-orange-50 border-orange-200 text-orange-600"
            }`}>
              📌 IPFS <span className="font-semibold ml-1">Proof Available</span>
            </div>
          )}

          <C2PABadge c2pa={details?.c2pa} isDark={isDark} />
        </div>

        {/* Hash mismatch */}
        {details && (
          <div className={`text-xs font-mono px-3 py-2 rounded-lg border space-y-1 ${
            isDark ? "bg-neutral-900/80 border-red-900/30" : "bg-red-50 border-red-200"
          }`}>
            <p className="break-all">
              <span className={textMuted}>Got:      </span>
              <span className="text-red-500">{details.clientHash}</span>
            </p>
            <p className="break-all">
              <span className={textMuted}>Expected: </span>
              <span className="text-blue-500">{details.storedHash}</span>
            </p>
          </div>
        )}

        <C2PADetailPanel c2pa={details?.c2pa} isDark={isDark} />

        {details?.blockchainError && (
          <div className={`text-xs px-3 py-2 rounded-lg border ${
            isDark ? "text-neutral-400 bg-neutral-900/80 border-neutral-800" : "text-neutral-500 bg-neutral-100 border-neutral-200"
          }`}>
            Blockchain note: {details.blockchainError}
          </div>
        )}
      </div>
    );
  }

  return null;
}