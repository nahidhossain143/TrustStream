import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import api from "../services/api";
import { generateSHA256 } from "../utils/hash";

export default function VideoPlayer({ videoId, onVerify }) {
  const videoRef = useRef(null);
  const [currentSegment, setCurrentSegment] = useState(null);

  useEffect(() => {
    if (!videoId) return;
    const video = videoRef.current;
    if (!video) return;

    const playlistUrl = `http://localhost:3001/streams/${videoId}/playlist.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.FRAG_LOADED, async (event, data) => {
        try {
          const segmentIndex = data.frag.sn; // sequential number: 0, 1, 2...
          setCurrentSegment(segmentIndex);
          onVerify("checking");

          // 1. Fetch the segment bytes
          const segUrl = `http://localhost:3001/streams/${videoId}/seg_${String(segmentIndex).padStart(3, "0")}.ts`;
          const response = await fetch(segUrl);
          const buffer = await response.arrayBuffer();

          // 2. Compute SHA-256 locally in browser
          const clientHash = await generateSHA256(buffer);

          // 3. Compare with DB hash via backend
          const verifyRes = await api.post("/upload/verify", {
            videoId,
            segmentIndex,
            clientHash,
          });

          onVerify(verifyRes.data.isMatch ? "verified" : "tampered", {
            segmentIndex,
            clientHash,
            storedHash: verifyRes.data.storedHash,
          });

        } catch (err) {
          console.error("Verification error:", err);
          onVerify("tampered");
        }
      });

      return () => hls.destroy();
    } else {
      video.src = `http://localhost:3001/streams/${videoId}/playlist.m3u8`;
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