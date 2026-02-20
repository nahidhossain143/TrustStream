const express = require("express");
const cors = require("cors");

const newsRoutes = require("./routes/news.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ message: "Backend running 🚀" });
});

app.use("/api/news", newsRoutes);

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});