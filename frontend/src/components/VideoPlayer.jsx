import { useEffect, useRef } from "react";
import Hls from "hls.js";
import api from "../services/api";
import { generateSHA256 } from "../utils/hash";

export default function VideoPlayer({ videoId, playlistUrl, onVerify }) {
  const videoRef = useRef(null);
  const activeSegmentRef = useRef(null);
  const verificationCache = useRef({});
  const onVerifyRef = useRef(onVerify);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    if (!videoId || !playlistUrl) return;
    const video = videoRef.current;
    if (!video) return;

    verificationCache.current = {};
    activeSegmentRef.current = null;

    if (Hls.isSupported()) {
      const hls = new Hls({
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
      });

      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

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

          const bc = verifyRes.data.blockchain;
          const c2paData = verifyRes.data.c2pa;

          const resultData = {
            segmentIndex,
            clientHash,
            storedHash: verifyRes.data.storedHash,
            ipfsCid: verifyRes.data.ipfsCid,
            ipfsUrl: verifyRes.data.ipfsUrl,

            // Blockchain
            blockchainAvailable: bc ? bc.available : false,
            blockchainVerified: bc ? bc.hashMatch : null,
            blockchainError: bc?.error || null,
            fullyEndorsed: bc ? bc.fullyEndorsed : null,
            endorsementCount: bc ? bc.endorsementCount : null,

            // C2PA
            c2pa: c2paData
              ? {
                  signed: c2paData.signed || false,
                  valid: c2paData.valid || false,
                  instanceId: c2paData.instanceId || null,
                  manifestHash: c2paData.manifestHash || null,
                  signedAt: c2paData.signedAt || null,
                  signer: c2paData.signer || null,
                  algorithm: c2paData.algorithm || null,
                  assertionsCount: c2paData.assertionsCount || 0,
                  error: c2paData.error || null,
                }
              : null,
          };

          const status = verifyRes.data.isMatch ? "verified" : "tampered";
          verificationCache.current[segmentIndex] = { status, data: resultData };

          if (activeSegmentRef.current === segmentIndex) {
            onVerifyRef.current(status, resultData);
          }
        } catch (err) {
          console.error("Verification error:", err);
          const errorData = {
            segmentIndex,
            blockchainAvailable: false,
            blockchainError: "Verification service temporarily unavailable",
            c2pa: null,
          };
          verificationCache.current[segmentIndex] = { status: "warning", data: errorData };

          if (activeSegmentRef.current === segmentIndex) {
            onVerifyRef.current("warning", errorData);
          }
        }
      });

      hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
        const playingIndex = data.frag.sn;
        activeSegmentRef.current = playingIndex;
        const cachedResult = verificationCache.current[playingIndex];

        if (cachedResult) {
          onVerifyRef.current(cachedResult.status, cachedResult.data);
        } else {
          onVerifyRef.current("checking", { segmentIndex: playingIndex });
        }
      });

      return () => hls.destroy();
    }

    video.src = playlistUrl;
  }, [videoId, playlistUrl]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      className="w-full rounded-xl bg-black"
    />
  );
}