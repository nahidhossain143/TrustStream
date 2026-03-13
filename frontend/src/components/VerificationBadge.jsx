export default function VerificationBadge({ verified, details }) {
  if (verified === "checking") {
    return (
      <div className="mt-4 inline-flex items-center gap-2 bg-yellow-600/20 text-yellow-400 px-4 py-2 rounded-full border border-yellow-600/30 text-sm font-medium animate-pulse">
        ⏳ Verifying segment integrity...
      </div>
    );
  }

  if (verified === "warning") {
    return (
      <div className="mt-4 space-y-3">
        <div className="inline-flex items-center gap-2 bg-amber-600/20 text-amber-300 px-4 py-2 rounded-full border border-amber-500/30 text-sm font-medium">
          ⚠️ Segment {details?.segmentIndex ?? ""} — Playback continuing, verification delayed
        </div>
        <div className="text-xs text-amber-200/80 bg-amber-950/30 border border-amber-700/30 px-3 py-2 rounded-lg">
          {details?.blockchainError || "Verification endpoint is temporarily unavailable."}
        </div>
      </div>
    );
  }

  if (verified === "verified") {
    return (
      <div className="mt-4 space-y-3">
        <div className="inline-flex items-center gap-2 bg-green-600/20 text-green-400 px-4 py-2 rounded-full border border-green-600/30 text-sm font-medium">
          🛡️ Segment {details?.segmentIndex ?? ""} — Authentic & Verified
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-green-900/20 border border-green-700/30 px-3 py-1.5 rounded-lg text-xs text-green-400">
            🧾 Local Hash <span className="text-green-300 font-semibold">✓ Match</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            details?.blockchainAvailable && details?.blockchainVerified === true
              ? "bg-blue-900/20 border-blue-700/30 text-blue-400"
              : details?.blockchainAvailable && details?.blockchainVerified === false
              ? "bg-red-900/20 border-red-700/30 text-red-400"
              : "bg-gray-800 border-gray-700 text-gray-400"
          }`}>
            ⛓️ Blockchain{" "}
            <span className="font-semibold ml-1">
              {details?.blockchainAvailable && details?.blockchainVerified === true
                ? "✓ Verified"
                : details?.blockchainAvailable && details?.blockchainVerified === false
                ? "✗ Mismatch"
                : "Pending / Unavailable"}
            </span>
            {details?.endorsementCount > 0 && (
              <span className="ml-1.5 bg-blue-800/40 px-1.5 py-0.5 rounded text-blue-300">
                {details.endorsementCount}/3 orgs
              </span>
            )}
          </div>

          {details?.ipfsCid && (
            <div className="flex items-center gap-1.5 bg-orange-900/20 border border-orange-700/30 px-3 py-1.5 rounded-lg text-xs text-orange-400">
              📌 IPFS <span className="text-orange-300 font-semibold">CID Available</span>
            </div>
          )}
        </div>

        {details?.clientHash && (
          <div className="text-xs text-gray-500 font-mono break-all bg-gray-900/80 px-3 py-2 rounded-lg border border-gray-800">
            <span className="text-gray-600">SHA-256: </span>
            <span className="text-green-500">{details.clientHash}</span>
          </div>
        )}

        {details?.blockchainError && (
          <div className="text-xs text-gray-400 bg-gray-900/80 px-3 py-2 rounded-lg border border-gray-800">
            Blockchain note: {details.blockchainError}
          </div>
        )}
      </div>
    );
  }

  if (verified === "tampered") {
    return (
      <div className="mt-4 space-y-3">
        <div className="inline-flex items-center gap-2 bg-red-600/20 text-red-400 px-4 py-2 rounded-full border border-red-600/30 text-sm font-medium">
          ⚠️ Segment {details?.segmentIndex ?? ""} — Integrity Failed!
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-red-900/20 border border-red-700/30 px-3 py-1.5 rounded-lg text-xs text-red-400">
            🧾 Local Hash <span className="font-semibold">✗ Mismatch</span>
          </div>

          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border ${
            details?.blockchainAvailable && details?.blockchainVerified === false
              ? "bg-red-900/20 border-red-700/30 text-red-400"
              : "bg-gray-800 border-gray-700 text-gray-400"
          }`}>
            ⛓️ Blockchain{" "}
            <span className="font-semibold">
              {details?.blockchainAvailable && details?.blockchainVerified === false
                ? "✗ Mismatch"
                : "Pending / Unavailable"}
            </span>
          </div>

          {details?.ipfsCid && (
            <div className="flex items-center gap-1.5 bg-orange-900/20 border border-orange-700/30 px-3 py-1.5 rounded-lg text-xs text-orange-400">
              📌 IPFS <span className="font-semibold">Proof Available</span>
            </div>
          )}
        </div>

        {details && (
          <div className="text-xs font-mono bg-gray-900/80 px-3 py-2 rounded-lg border border-red-900/30 space-y-1">
            <p className="break-all">
              <span className="text-gray-600">Got: </span>
              <span className="text-red-400">{details.clientHash}</span>
            </p>
            <p className="break-all">
              <span className="text-gray-600">Expected: </span>
              <span className="text-blue-400">{details.storedHash}</span>
            </p>
          </div>
        )}

        {details?.blockchainError && (
          <div className="text-xs text-gray-400 bg-gray-900/80 px-3 py-2 rounded-lg border border-gray-800">
            Blockchain note: {details.blockchainError}
          </div>
        )}
      </div>
    );
  }

  return null;
}