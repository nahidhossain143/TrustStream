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
          const resultData = {
            segmentIndex,
            clientHash,
            storedHash: verifyRes.data.storedHash,
            ipfsCid: verifyRes.data.ipfsCid,
            ipfsUrl: verifyRes.data.ipfsUrl,
            blockchainAvailable: bc ? bc.available : false,
            blockchainVerified: bc ? bc.hashMatch : null,
            blockchainError: bc?.error || null,
            fullyEndorsed: bc ? bc.fullyEndorsed : null,
            endorsementCount: bc ? bc.endorsementCount : null,
          };

          const status = verifyRes.data.isMatch ? "verified" : "tampered";
          verificationCache.current[segmentIndex] = { status, data: resultData };

          if (activeSegmentRef.current === segmentIndex) {
            onVerifyRef.current(status, resultData);
          }
        } catch (err) {
          console.error("Verification error:", err);

          verificationCache.current[segmentIndex] = {
            status: "warning",
            data: {
              segmentIndex,
              blockchainAvailable: false,
              blockchainError: "Verification service temporarily unavailable",
            },
          };

          if (activeSegmentRef.current === segmentIndex) {
            onVerifyRef.current("warning", {
              segmentIndex,
              blockchainAvailable: false,
              blockchainError: "Verification service temporarily unavailable",
            });
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