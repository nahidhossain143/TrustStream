require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const uploadRoutes = require("./routes/upload.routes");
const { startFabricEventListener } = require("./services/fabric.service");

const app = express();

// Render (and most PaaS hosts) sit behind a reverse proxy - without this,
// express-rate-limit and req.ip both see the proxy's IP for every request
// instead of the real client, which breaks per-client rate limiting.
app.set("trust proxy", 1);

// Security headers. CSP is aimed at HTML-rendering apps and this is a pure
// JSON API + static file server (no server-rendered HTML), so it's off to
// avoid false-positive breakage; crossOriginResourcePolicy is relaxed to
// "cross-origin" because the frontend (a different origin) loads /streams
// and /thumbnails assets directly (hls.js segment fetches, <img> tags).
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// CORS: restrict to known frontend origin(s) in production. Falls back to
// wide-open only for local dev convenience when FRONTEND_ORIGIN isn't set.
const allowedOrigins = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

if (allowedOrigins.length === 0) {
  console.warn("[server] FRONTEND_ORIGIN not set - CORS is wide open (*). Set it before deploying.");
}

app.use(cors({
  origin: allowedOrigins.length > 0 ? allowedOrigins : "*",
}));
app.use(express.json());

// --- Render Storage Setup ---
// Render-এর হার্ডড্রাইভ থেকে যেন ভিডিওগুলো প্লে হয়
const storageRoot = process.env.STORAGE_PATH || path.join(__dirname, "../");
const streamsDir = path.join(storageRoot, "public/streams");
const thumbnailsDir = path.join(storageRoot, "public/thumbnails");
// ----------------------------

// Serve local HLS stream files from the persistent disk
app.use("/streams", express.static(streamsDir));
// Serve uploaded video thumbnails (poster images shown before playback)
app.use("/thumbnails", express.static(thumbnailsDir));

// Root Health Check (Render এ Cannot GET / এরর ঠিক করার জন্য)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "online",
    service: "TrustStream API",
    message: "Backend is running securely on Render."
  });
});

// Existing health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "TrustStream backend running" });
});

// API routes
app.use("/api/upload", uploadRoutes);

// 404 for anything else under /api
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Global error handler - last-resort JSON response instead of Express's
// default HTML stack trace. Route handlers already catch their own errors
// almost everywhere; this only fires for something unexpected slipping
// through (a thrown error in synchronous middleware, a malformed body, etc).
app.use((err, req, res, next) => {
  console.error("[server] unhandled error:", err);
  if (res.headersSent) return next(err);
  // Multer errors (bad file type from a route's fileFilter, size limit
  // exceeded, etc) are the client's fault, not a server fault - surface
  // them as 400s with their actual message instead of a generic 500.
  const isMulterOrUploadError = err.name === "MulterError" || /file|image|video/i.test(err.message || "");
  const status = err.status || err.statusCode || (isMulterOrUploadError ? 400 : 500);
  res.status(status).json({ error: status === 500 ? "Internal server error" : err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Subscribes to the channel once at boot and reconnects on its own; the
  // server stays up regardless of whether Fabric is reachable.
  startFabricEventListener();
});
