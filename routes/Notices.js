const express = require("express");
const router = express.Router();
const { scrapeNotices, getNotices } = require("../controllers/NoticesController");

// Route to trigger scraping
router.get("/scrape", scrapeNotices);

// Route to get the latest scraped notices from Firestore
router.get("/latest", getNotices);

module.exports = router;
