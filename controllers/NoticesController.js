const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

// Scrape latest notices from the Canada immigration site
exports.scrapeNotices = async (req, res) => {
  try {
    console.log("Fetching notices...");

    // Target URL for scraping
    const url = "https://www.canada.ca/en/immigration-refugees-citizenship/news/notices.html";

    // Fetch the HTML content of the page
    const { data } = await axios.get(url);

    // Load the HTML using Cheerio
    const $ = cheerio.load(data);

    // Extract the content inside the <main> tag
    const mainContent = $("main").html();

    if (!mainContent) {
      throw new Error("No content found inside <main> tag.");
    }

    console.log("✅ Scraped content from notices page");

    // Optionally, save the scraped content to Firestore
    const noticesRef = db.collection("notices").doc("latest");
    await noticesRef.set({ content: mainContent, scrapedAt: new Date() });

    console.log("✅ Saved scraped notices to Firestore");

    // Return the scraped content as a response
    res.status(200).json({ content: mainContent });
  } catch (err) {
    console.error("❌ Scrape error:", err.message);
    res.status(500).json({ error: "Failed to scrape notices." });
  }
};

// Get the latest notices from Firestore
exports.getNotices = async (req, res) => {
  try {
    const snapshot = await db.collection("notices").doc("latest").get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: "No notices found." });
    }
    res.status(200).json(snapshot.data());
  } catch (err) {
    console.error("❌ Failed to fetch notices:", err.message);
    res.status(500).json({ error: "Failed to fetch notices." });
  }
};
