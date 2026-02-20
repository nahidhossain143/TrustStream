const express = require("express");
const router = express.Router();
const controller = require("../controllers/news.controller");

router.get("/", controller.getAllNews);
router.get("/:id", controller.getSingleNews);

module.exports = router;