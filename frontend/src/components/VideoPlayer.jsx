import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";
import { generateSHA256 } from "../utils/hash";

export default function VideoPlayer({ videoId, onVerify }) {
  const videoRef = useRef(null);
  const [currentSegment, setCurrentSegment] = useState(null);
  const activeSegmentRef = useRef(null);
  const verificationCache = useRef({});

  useEffect(() => {
    if (!videoId) return;
    const video = videoRef.current;
    if (!video) return;

    const playlistUrl = `http://localhost:3001/streams/${videoId}/playlist.m3u8`;

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
            blockchainVerified: bc ? bc.hashMatch : null,
            fullyEndorsed: bc ? bc.fullyEndorsed : null,
            endorsementCount: bc ? bc.endorsementCount : null,
          };

          const status = verifyRes.data.isMatch ? "verified" : "tampered";
          verificationCache.current[segmentIndex] = { status, data: resultData };

          if (activeSegmentRef.current === segmentIndex) {
            onVerify(status, resultData);
          }
        } catch (err) {
          console.error("Verification error:", err);
          verificationCache.current[segmentIndex] = {
            status: "tampered",
            data: { segmentIndex },
          };

          if (activeSegmentRef.current === segmentIndex) {
            onVerify("tampered", { segmentIndex });
          }
        }
      });

      hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
        const playingIndex = data.frag.sn;

        activeSegmentRef.current = playingIndex;
        setCurrentSegment(playingIndex);

        const cachedResult = verificationCache.current[playingIndex];

        if (cachedResult) {
          onVerify(cachedResult.status, cachedResult.data);
        } else {
          onVerify("checking", { segmentIndex: playingIndex });
        }
      });

      return () => hls.destroy();
    } else {
      video.src = playlistUrl;
    }
  }, [videoId]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      className="w-full rounded-xl bg-black"
    />
  );
}