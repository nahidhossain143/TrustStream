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
      <div className="mt-4 space-y-2">
        <div className="inline-flex items-center gap-2 bg-green-600/20 text-green-400 px-4 py-2 rounded-full border border-green-600/30 text-sm font-medium">
          🛡️ Segment {details?.segmentIndex ?? ""} — Authentic & Verified
        </div>
        {details?.clientHash && (
          <div className="text-xs text-gray-500 font-mono break-all bg-gray-900 px-3 py-2 rounded-lg">
            Hash: {details.clientHash}
          </div>
        )}
      </div>
    );
  }

  // ❌ Tampered
  if (verified === "tampered") {
    return (
      <div className="mt-4 space-y-2">
        <div className="inline-flex items-center gap-2 bg-red-600/20 text-red-400 px-4 py-2 rounded-full border border-red-600/30 text-sm font-medium">
          ⚠️ Segment {details?.segmentIndex ?? ""} — Integrity Failed!
        </div>
        {details && (
          <div className="text-xs text-gray-500 font-mono bg-gray-900 px-3 py-2 rounded-lg space-y-1">
            <p className="break-all">Got:      {details.clientHash}</p>
            <p className="break-all">Expected: {details.storedHash}</p>
          </div>
        )}
      </div>
    );
  }

  // null — not started yet
  return null;
}