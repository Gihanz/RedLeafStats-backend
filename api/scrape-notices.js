const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of IRCC notices...");

  try {
    const url = "https://www.canada.ca/en/immigration-refugees-citizenship/news/notices.html";

    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const mainContent = $("main").html();

    if (!mainContent) {
      console.warn("⚠️ No content found inside <main> tag.");
      return res.status(404).json({ error: "No content found on notices page." });
    }

    console.log("✅ Scraped notices content");

    const scrapedAt = new Date();

    const ref = db.collection("notices").doc("latest");
    await ref.set({ content: mainContent, scrapedAt });

    console.log("📦 Saved notices to Firestore");

    return res.status(200).json({
      message: "Scraped and saved successfully",
      scrapedAt,
    });
  } catch (err) {
    console.error("❌ Scrape error:", err.message);
    return res.status(500).json({ error: "Failed to scrape notices." });
  }
};
