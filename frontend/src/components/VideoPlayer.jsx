import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";
import { generateSHA256 } from "../utils/hash";

// ─── Tamper Warning Overlay ───────────────────────────────
function TamperOverlay({ segmentIndex, onDismiss }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="max-w-sm w-full mx-4 rounded-2xl border border-red-500/40 bg-red-950/60 p-6 text-center space-y-4 shadow-2xl shadow-red-900/40">
        {/* Icon */}
        <div className="w-14 h-14 rounded-full bg-red-500/20 border-2 border-red-500/40 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>

        <div>
          <h3 className="text-red-400 font-bold text-base">Integrity Violation Detected</h3>
          <p className="text-red-300/70 text-xs mt-1 font-mono">
            Segment {String(segmentIndex).padStart(3, "0")} — hash mismatch
          </p>
        </div>

        <p className="text-neutral-400 text-xs leading-relaxed">
          This video segment does not match its blockchain-stored hash.
          It may have been altered after publication.
          A tamper alert has been reported on-chain.
        </p>

        <div className="flex gap-2">
          <button
            onClick={onDismiss}
            className="flex-1 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 text-xs font-semibold transition-all"
          >
            Continue anyway
          </button>
          <a
            href="/"
            className="flex-1 py-2 rounded-xl bg-red-600/80 hover:bg-red-500/80 text-white text-xs font-semibold transition-all flex items-center justify-center"
          >
            Leave stream
          </a>
        </div>
      </div>
    </div>
  );
}

// ─── Main VideoPlayer ─────────────────────────────────────
export default function VideoPlayer({ videoId, playlistUrl, posterUrl, onVerify }) {
  const videoRef = useRef(null);
  const activeSegmentRef = useRef(null);
  const verificationCache = useRef({});
  const reportedTampers = useRef(new Set()); // avoid duplicate reports
  const onVerifyRef = useRef(onVerify);

  const [tamperedSegment, setTamperedSegment] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  // ─── Auto report tamper on-chain ─────────────────────────
  const reportTamperOnChain = async (segmentIndex, clientHash, storedHash) => {
    if (!videoId || reportedTampers.current.has(segmentIndex)) return;
    reportedTampers.current.add(segmentIndex);

    try {
      await api.post("/upload/report-tamper", {
        videoId,
        segmentIndex,
        evidence: `Hash mismatch detected by viewer. Browser computed: ${clientHash}. Stored: ${storedHash}`,
      });
      console.warn(`⚠️ Tamper reported to Fabric ledger: seg ${segmentIndex}`);
    } catch (err) {
      console.error("Failed to report tamper:", err.message);
    }
  };

  useEffect(() => {
    if (!videoId || !playlistUrl) return;
    const video = videoRef.current;
    if (!video) return;

    verificationCache.current = {};
    reportedTampers.current = new Set();
    activeSegmentRef.current = null;
    setTamperedSegment(null);
    setShowOverlay(false);

    if (!Hls.isSupported()) {
      video.src = playlistUrl;
      return;
    }

    const hls = new Hls({ xhrSetup: (xhr) => { xhr.withCredentials = false; } });
    hls.loadSource(playlistUrl);
    hls.attachMedia(video);

    // ─── Segment loaded → verify ──────────────────────────
    hls.on(Hls.Events.FRAG_LOADED, async (event, data) => {
      const segmentIndex = data.frag.sn;
      try {
        const buffer = data.payload;
        const clientHash = await generateSHA256(buffer);

        const verifyRes = await api.post("/upload/verify", {
          videoId,
          segmentIndex,
          clientHash,
        });

        const c2paData = verifyRes.data.c2pa;
        const isMatch = verifyRes.data.isMatch;

        const resultData = {
          segmentIndex,
          clientHash,
          storedHash: verifyRes.data.storedHash,
          ipfsCid: verifyRes.data.ipfsCid,
          ipfsUrl: verifyRes.data.ipfsUrl,
          c2pa: c2paData ? {
            signed: c2paData.signed || false,
            valid: c2paData.valid || false,
            instanceId: c2paData.instanceId || null,
            manifestHash: c2paData.manifestHash || null,
            signedAt: c2paData.signedAt || null,
            signer: c2paData.signer || null,
            algorithm: c2paData.algorithm || null,
            assertionsCount: c2paData.assertionsCount || 0,
            error: c2paData.error || null,
          } : null,
        };

        const status = isMatch ? "verified" : "tampered";
        verificationCache.current[segmentIndex] = { status, data: resultData };

        // ─── Tamper detected ──────────────────────────────
        if (!isMatch) {
          // 1. Pause video
          video.pause();

          // 2. Show overlay
          setTamperedSegment(segmentIndex);
          setShowOverlay(true);

          // 3. Report on-chain automatically
          await reportTamperOnChain(
            segmentIndex,
            clientHash,
            verifyRes.data.storedHash
          );
        }

        if (activeSegmentRef.current === segmentIndex) {
          onVerifyRef.current(status, resultData);
        }

      } catch (err) {
        console.error("Verification error:", err);
        const errorData = {
          segmentIndex,
          verifyError: "Verification service temporarily unavailable",
          c2pa: null,
        };
        verificationCache.current[segmentIndex] = { status: "warning", data: errorData };
        if (activeSegmentRef.current === segmentIndex) {
          onVerifyRef.current("warning", errorData);
        }
      }
    });

    // ─── Segment changed → update badge ──────────────────
    hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
      const playingIndex = data.frag.sn;
      activeSegmentRef.current = playingIndex;
      const cached = verificationCache.current[playingIndex];
      if (cached) {
        onVerifyRef.current(cached.status, cached.data);
      } else {
        onVerifyRef.current("checking", { segmentIndex: playingIndex });
      }
    });

    return () => hls.destroy();
  }, [videoId, playlistUrl]);

  const handleDismissOverlay = () => {
    setShowOverlay(false);
    videoRef.current?.play();
  };

  return (
    <div className="relative w-full h-full">
      <video
        ref={videoRef}
        controls
        autoPlay
        poster={posterUrl || undefined}
        className="w-full h-full rounded-xl bg-black"
      />

      {/* Tamper Warning Overlay */}
      {showOverlay && tamperedSegment !== null && (
        <TamperOverlay
          segmentIndex={tamperedSegment}
          onDismiss={handleDismissOverlay}
        />
      )}
    </div>
  );
}