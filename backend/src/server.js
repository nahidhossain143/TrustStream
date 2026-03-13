require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const newsRoutes = require("./routes/news.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/streams", express.static(path.join(__dirname, "../public/streams")));

app.get("/health", (req, res) => {
  res.json({ message: "Backend running" });
});

app.use("/api/news", newsRoutes);
app.use("/api/upload", uploadRoutes);

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});