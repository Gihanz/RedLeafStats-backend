const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const roundsRoute = require("./routes/Rounds");
const noticesRoute = require("./routes/Notices"); // Import the new notices route
const { syncRounds } = require("./controllers/RoundsController");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", roundsRoute);
app.use("/api/notices", noticesRoute); // Add the notices routes

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // ⏰ Auto-sync once daily at 3:00 AM for rounds
  cron.schedule("0 3 * * *", async () => {
    console.log("⏰ Auto-syncing rounds...");
    try {
      await syncRounds(
        { method: "GET" }, 
        { 
          status: () => ({
            json: (msg) => console.log("✔️ Sync done via cron:", msg),
          }),
        }
      );
    } catch (err) {
      console.error("❌ Cron sync failed:", err.message);
    }
  });

  // ⏰ Auto-scrape notices daily at 4:00 AM
  cron.schedule("0 4 * * *", async () => {
    console.log("⏰ Auto-scraping notices...");
    try {
      await fetchNotices(); // Call your scraping function to fetch the latest notices
    } catch (err) {
      console.error("❌ Cron scrape failed:", err.message);
    }
  });
});

// Scraping notices function (example)
async function fetchNotices() {
  const axios = require("axios");
  const cheerio = require("cheerio");
  const db = require("./lib/firestore");

  try {
    // URL to scrape
    const url = "https://www.canada.ca/en/immigration-refugees-citizenship/news/notices.html";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // Extract content inside the <main> tag
    const mainContent = $("main").html();

    if (!mainContent) {
      throw new Error("No content found inside <main> tag.");
    }

    console.log("✅ Scraped content from notices page");

    // Optionally, save the scraped content to Firestore
    const noticesRef = db.collection("notices").doc("latest");
    await noticesRef.set({ content: mainContent, scrapedAt: new Date() });

    console.log("✅ Saved scraped notices to Firestore");
  } catch (err) {
    console.error("❌ Error during auto scrape:", err.message);
  }
}
