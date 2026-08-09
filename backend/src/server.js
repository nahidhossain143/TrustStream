require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const uploadRoutes = require("./routes/upload.routes");
const { router: authRoutes } = require("./routes/auth.routes");
const { startFabricEventListener } = require("./services/fabric.service");

const app = express();

// Render থেকে ফ্রন্টএন্ড যেন এক্সেস পায় সেজন্য CORS ওপেন করে দেওয়া হলো
app.use(cors({
  origin: '*'
}));
app.use(express.json());

// --- Render Storage Setup ---
// Render-এর হার্ডড্রাইভ থেকে যেন ভিডিওগুলো প্লে হয়
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
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Subscribes to the channel once at boot and reconnects on its own; the
  // server stays up regardless of whether Fabric is reachable.
  startFabricEventListener();
});