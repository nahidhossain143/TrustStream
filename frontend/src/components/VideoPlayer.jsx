import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";
import { generateSHA256 } from "../utils/hash";

export default function VideoPlayer({ videoId, onVerify }) {
  const videoRef = useRef(null);
  const [currentSegment, setCurrentSegment] = useState(null);
  
  // Track the segment currently visible on the player
  const activeSegmentRef = useRef(null);
  
  // Store verification results from background downloads
  const verificationCache = useRef({});

  useEffect(() => {
    if (!videoId) return;
    const video = videoRef.current;
    if (!video) return;

    const playlistUrl = `http://localhost:3001/streams/${videoId}/playlist.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

      // 1. Background Download & Verification
      hls.on(Hls.Events.FRAG_LOADED, async (event, data) => {
        const segmentIndex = data.frag.sn; // sequential number: 0, 1, 2...
        
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
            storedHash:          verifyRes.data.storedHash,
            blockchainVerified:  bc ? bc.hashMatch : null,
            fullyEndorsed:       bc ? bc.fullyEndorsed : null,
            endorsementCount:    bc ? bc.endorsementCount : null,
          };
          
          const status = verifyRes.data.isMatch ? "verified" : "tampered";

          // Save the result in cache
          verificationCache.current[segmentIndex] = { status, data: resultData };

          // If this segment is currently playing on screen, update UI immediately
          if (activeSegmentRef.current === segmentIndex) {
            onVerify(status, resultData);
          }

        } catch (err) {
          console.error("Verification error:", err);
          verificationCache.current[segmentIndex] = { status: "tampered", data: { segmentIndex } };
          
          if (activeSegmentRef.current === segmentIndex) {
            onVerify("tampered", { segmentIndex });
          }
        }
      });

      // 2. Playback Sync (Triggered when the player actually moves to a new segment)
      hls.on(Hls.Events.FRAG_CHANGED, (event, data) => {
        const playingIndex = data.frag.sn;
        
        activeSegmentRef.current = playingIndex;
        setCurrentSegment(playingIndex);

        const cachedResult = verificationCache.current[playingIndex];
        
        if (cachedResult) {
           // If already verified in the background, show the cached result
           onVerify(cachedResult.status, cachedResult.data);
        } else {
           // If it has not finished verifying yet, show the checking state
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