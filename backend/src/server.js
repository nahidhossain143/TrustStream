require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const uploadRoutes = require("./routes/upload.routes");
const { router: authRoutes } = require("./routes/auth.routes");

const app = express();

app.use(cors());
app.use(express.json());

// Serve local HLS stream files
app.use("/streams", express.static(path.join(__dirname, "../public/streams")));

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "TrustStream backend running" });
});

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/upload", uploadRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});