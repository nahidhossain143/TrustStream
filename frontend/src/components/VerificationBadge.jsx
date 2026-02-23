export default function VerificationBadge({ verified, details }) {
  // 🔄 Checking
  if (verified === "checking") {
    return (
      <div className="mt-4 inline-flex items-center gap-2 bg-yellow-600/20 text-yellow-400 px-4 py-2 rounded-full border border-yellow-600/30 text-sm font-medium animate-pulse">
        ⏳ Verifying Segment Integrity...
      </div>
    );
  }

  // ✅ Verified
  if (verified === "verified") {
    return (
      <div className="mt-4 space-y-3">

        {/* Main badge */}
        <div className="inline-flex items-center gap-2 bg-green-600/20 text-green-400 px-4 py-2 rounded-full border border-green-600/30 text-sm font-medium">
          🛡️ Segment {details?.segmentIndex ?? ""} — Authentic & Verified
        </div>

        {/* Verification sources */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-green-900/20 border border-green-700/30 px-3 py-1.5 rounded-lg text-xs text-green-400">
            🗄️ Database <span className="text-green-300 font-semibold">✓ Match</span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            details?.blockchainVerified === true
              ? "bg-blue-900/20 border-blue-700/30 text-blue-400"
              : details?.blockchainVerified === false
              ? "bg-red-900/20 border-red-700/30 text-red-400"
              : "bg-gray-800 border-gray-700 text-gray-500"
          }`}>
            ⛓️ Blockchain{" "}
            <span className="font-semibold ml-1">
              {details?.blockchainVerified === true
                ? `✓ Verified`
                : details?.blockchainVerified === false
                ? "✗ Mismatch"
                : "⏳ Checking..."}
            </span>
            {details?.endorsementCount > 0 && (
              <span className="ml-1.5 bg-blue-800/40 px-1.5 py-0.5 rounded text-blue-300">
                {details.endorsementCount}/3 orgs
              </span>
            )}
          </div>
        </div>

        {/* Hash display */}
        {details?.clientHash && (
          <div className="text-xs text-gray-500 font-mono break-all bg-gray-900/80 px-3 py-2 rounded-lg border border-gray-800">
            <span className="text-gray-600">SHA-256: </span>
            <span className="text-green-500">{details.clientHash}</span>
          </div>
        )}
      </div>
    );
  }

  // ❌ Tampered
  if (verified === "tampered") {
    return (
      <div className="mt-4 space-y-3">

        {/* Main badge */}
        <div className="inline-flex items-center gap-2 bg-red-600/20 text-red-400 px-4 py-2 rounded-full border border-red-600/30 text-sm font-medium">
          ⚠️ Segment {details?.segmentIndex ?? ""} — Integrity Failed!
        </div>

        {/* Verification sources */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-red-900/20 border border-red-700/30 px-3 py-1.5 rounded-lg text-xs text-red-400">
            🗄️ Database <span className="font-semibold">✗ Mismatch</span>
          </div>
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            details?.blockchainVerified === false
              ? "bg-red-900/20 border-red-700/30 text-red-400"
              : "bg-gray-800 border-gray-700 text-gray-500"
          }`}>
            ⛓️ Blockchain{" "}
            <span className="font-semibold">
              {details?.blockchainVerified === false ? "✗ Mismatch" : "⏳ Checking..."}
            </span>
          </div>
        </div>

        {/* Hash comparison */}
        {details && (
          <div className="text-xs font-mono bg-gray-900/80 px-3 py-2 rounded-lg border border-red-900/30 space-y-1">
            <p className="break-all">
              <span className="text-gray-600">Got:      </span>
              <span className="text-red-400">{details.clientHash}</span>
            </p>
            <p className="break-all">
              <span className="text-gray-600">Expected: </span>
              <span className="text-blue-400">{details.storedHash}</span>
            </p>
          </div>
        )}
      </div>
    );
  }

  return null;
}