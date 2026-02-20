export default function VerificationBadge({ verified }) {
  return verified ? (
    <div className="mt-6 inline-flex items-center gap-2 bg-green-600/20 text-green-400 px-4 py-2 rounded-full border border-green-600/30 text-sm font-medium">
      🛡 Verified by Blockchain
    </div>
  ) : (
    <div className="mt-6 inline-flex items-center gap-2 bg-red-600/20 text-red-400 px-4 py-2 rounded-full border border-red-600/30 text-sm font-medium">
      ⚠ Integrity Not Confirmed
    </div>
  );
}