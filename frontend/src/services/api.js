import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL
    ? `${import.meta.env.VITE_API_URL}/api`
    : "http://localhost:3001/api",
});

export default api;

// ─── Video API ────────────────────────────────────────────
export const videoAPI = {
  getAll:       ()                         => api.get("/upload/videos"),
  getOne:       (videoId)                  => api.get(`/upload/videos/${videoId}`),
  getSegments:  (videoId)                  => api.get(`/upload/videos/${videoId}/segments`),
  getC2pa:      (videoId, segmentIndex)    => api.get(`/upload/c2pa/${videoId}/${segmentIndex}`),
  verify:       (body)                     => api.post("/upload/verify", body),
  reportTamper: (videoId, segmentIndex)    => api.post("/upload/report-tamper", { videoId, segmentIndex }),
  getForensics: (videoId)                  => api.get(`/upload/videos/${videoId}/forensics`),

  blockchain: {
    getVideo:        (videoId)                  => api.get(`/upload/blockchain/video/${videoId}`),
    getEndorsements: (videoId, segmentIndex)    => api.get(`/upload/blockchain/endorsements/${videoId}/${segmentIndex}`),
    getSegmentTx:    (videoId, segmentIndex)    => api.get(`/upload/blockchain/segment-tx/${videoId}/${segmentIndex}`),
    getTxLogs:       ()                         => api.get("/upload/blockchain/txlogs"),
    getReceipt:      (txHash)                   => api.get(`/upload/blockchain/receipt/${txHash}`),
    getNetworkStatus: ()                        => api.get("/upload/blockchain/network-status"),
    getWalletBalances: ()                       => api.get("/upload/blockchain/wallet-balances"),
  },
};

// ─── Image API  ← NEW ─────────────────────────────────────
export const imageAPI = {
  // Upload image (multipart/form-data)
  upload: (formData) =>
    api.post("/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getAll:       ()          => api.get("/upload/images"),
  getOne:       (imageId)   => api.get(`/upload/images/${imageId}`),
  getC2pa:      (imageId)   => api.get(`/upload/images/${imageId}/c2pa`),
  verify:       (body)      => api.post("/upload/images/verify", body),
  reportTamper: (imageId)   => api.post("/upload/images/report-tamper", { imageId }),

  blockchain: {
    getImage:        (imageId) => api.get(`/upload/blockchain/image/${imageId}`),
    getEndorsements: (imageId) => api.get(`/upload/blockchain/image/${imageId}/endorsements`),
  },
};

// ─── Unified Feed API  ← NEW ──────────────────────────────
// Returns videos + images sorted by createdAt (newest first)
export const feedAPI = {
  getFeed: () => api.get("/upload/feed"),
};

// ─── Sync API ─────────────────────────────────────────────
export const syncAPI = {
  syncFromBlockchain: () => api.post("/upload/sync-from-blockchain"),
};