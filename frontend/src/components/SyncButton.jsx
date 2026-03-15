import { useState } from "react";
import api from "../services/api";

export default function SyncButton({ onSyncComplete }) {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await api.post("/upload/sync-from-blockchain");
      setResult(res.data);
      if (onSyncComplete) onSyncComplete();
    } catch (err) {
      setResult({ error: err.response?.data?.error || err.message });
    }
    setSyncing(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleSync}
        disabled={syncing}
        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-all w-full justify-center"
      >
        <span>{syncing ? "⏳" : "🔄"}</span>
        {syncing ? "Syncing from Blockchain + IPFS..." : "Sync from Blockchain"}
      </button>

      {result && !result.error && (
        <div className="text-[10px] font-mono bg-neutral-900 border border-neutral-800 rounded-lg p-2.5 space-y-1">
          <p className="text-emerald-400 mb-1">{result.message}</p>
          {result.synced?.map((v) => (
            <p key={v.videoId} className="text-neutral-500">
              {v.status === "synced" ? "✅" : "⏭️"} {v.title}
              {v.source && (
                <span className={`ml-1 ${v.source === "blockchain+ipfs" ? "text-orange-400" : "text-neutral-600"}`}>
                  ({v.source === "blockchain+ipfs" ? "⛓️+📌" : "⛓️ only"})
                </span>
              )}
            </p>
          ))}
          {result.failed?.map((v) => (
            <p key={v.videoId} className="text-red-400">
              ❌ {v.videoId.slice(0, 8)}...: {v.error}
            </p>
          ))}
        </div>
      )}

      {result?.error && (
        <p className="text-[10px] text-red-400 font-mono bg-red-950/20 border border-red-900/30 rounded-lg p-2">
          ❌ {result.error}
        </p>
      )}
    </div>
  );
}