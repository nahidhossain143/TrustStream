const express = require("express");
const cors = require("cors");
const path = require("path");

const newsRoutes = require("./routes/news.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// 🔥 Static HLS Streaming Folder
app.use(
  "/streams",
  express.static(path.join(__dirname, "../public/streams"))
);

// Health check
app.get("/health", (req, res) => {
  res.json({ message: "Backend running 🚀" });
});

// API Routes
app.use("/api/news", newsRoutes);
app.use("/api/upload", uploadRoutes);

// Start Server (ALWAYS LAST)
const PORT = 3001;
require('dotenv').config();
const db = require('./config/db');

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});