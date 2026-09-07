import axios from "axios";

// Backend origin (no /api suffix) - for static assets served directly by
// Express (/streams/*, /thumbnails/*), as opposed to the JSON API below.
// Deliberately the single source of truth for this: previously several
// pages hardcoded "http://localhost:3001" directly, which silently broke
// once the frontend and backend deployed to different domains.
export const API_ORIGIN = import.meta.env.VITE_API_URL || "http://localhost:3001";

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
});

export default api;

// ─── Video API ────────────────────────────────────────────
export const videoAPI = {
  getAll: () => api.get("/upload/videos"),
  getOne: (videoId) => api.get(`/upload/videos/${videoId}`),
  getSegments: (videoId) => api.get(`/upload/videos/${videoId}/segments`),
  getC2pa: (videoId, segmentIndex) => api.get(`/upload/c2pa/${videoId}/${segmentIndex}`),
  verify: (body) => api.post("/upload/verify", body),
  verifyFabric: (videoId) => api.post(`/upload/${videoId}/verify-fabric`),
  revoke: (videoId, reason) => api.post(`/upload/${videoId}/revoke`, { reason }),
  reportTamper: (videoId, segmentIndex) =>
    api.post("/upload/report-tamper", { videoId, segmentIndex }),
  clearDispute: (videoId) => api.post(`/upload/${videoId}/clear-dispute`),
  getForensics: (videoId) => api.get(`/upload/videos/${videoId}/forensics`),

  blockchain: {
    getFabricAudit: () => api.get("/upload/blockchain/fabric-audit"),
    getFabricHistory: (kind, id) =>
      api.get(`/upload/blockchain/fabric-history/${kind}/${id}`),
    fabricQuery: (params) =>
      api.get("/upload/blockchain/fabric-query", { params }),
  },
};

// ─── Image API ────────────────────────────────────────────
export const imageAPI = {
  upload: (formData) =>
    api.post("/upload/image", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  getAll: () => api.get("/upload/images"),
  getOne: (imageId) => api.get(`/upload/images/${imageId}`),
  getC2pa: (imageId) => api.get(`/upload/images/${imageId}/c2pa`),
  verify: (body) => api.post("/upload/images/verify", body),
  verifyFabric: (imageId) => api.post(`/upload/images/${imageId}/verify-fabric`),
  revoke: (imageId, reason) =>
    api.post(`/upload/images/${imageId}/revoke`, { reason }),
  reportTamper: (imageId) => api.post("/upload/images/report-tamper", { imageId }),
  clearDispute: (imageId) => api.post(`/upload/images/${imageId}/clear-dispute`),
};

// ─── Public Verify-by-Upload API ──────────────────────────
export const verifyAPI = {
  verifyFile: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return api.post("/upload/public-verify", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  },
};

// ─── Unified Feed API ─────────────────────────────────────
export const feedAPI = {
  // params: { search, mediaType: all|video|image, status: all|verified|disputed|revoked, page, limit }
  getFeed: (params = {}) => api.get("/upload/feed", { params }),
};

// ─── Timeline API ─────────────────────────────────────────
export const timelineAPI = {
  getTimeline: (kind, id) =>
    api.get("/upload/blockchain/revocation-timeline", {
      params: { kind, id },
    }),
};

// ─── Sync API ─────────────────────────────────────────────
export const syncAPI = {
  syncFromBlockchain: () => api.post("/upload/sync-from-blockchain"),
};
