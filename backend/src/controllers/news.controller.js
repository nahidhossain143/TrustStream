const news = require("../data/news.data");

exports.getAllNews = (req, res) => {
  res.json(news);
};

exports.getSingleNews = (req, res) => {
  const item = news.find(n => n.id == req.params.id);
  if (!item) {
    return res.status(404).json({ message: "News not found" });
  }
  res.json(item);
};