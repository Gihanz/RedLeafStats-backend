const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";

    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" }, // help avoid blocking
    });

    const $ = cheerio.load(data);
    const results = [];

    // The page groups draws by year inside div.field__item with h2 as year header
    $(".field__item").each((_, el) => {
      const year = $(el).find("h2").text().trim();
      if (!year) return;

      // Each draw is a list item <li> under that year section
      $(el).find("ul > li").each((_, li) => {
        const text = $(li).text().trim();

        // Example draw text format:
        // "June 6, 2025 — 6 invitations issued for the In-Demand Skills stream."
        const regex = /^(.+?)\s*—\s*(\d+)\s*invitations\s*issued\s*for\s*the\s*(.+?)\s*stream\.?(.*)$/i;
        const match = text.match(regex);

        if (match) {
          const [_, dateStr, invitesStr, stream, notes] = match;

          results.push({
            drawDate: dateStr.trim(),
            invitations_issued: parseInt(invitesStr, 10),
            stream: stream.trim(),
            notes: notes ? notes.trim() : "",
            year,
            rawText: text,
          });
        } else {
          // Fallback if pattern doesn't match, still save raw text for inspection
          results.push({
            drawDate: null,
            invitations_issued: null,
            stream: null,
            notes: "",
            year,
            rawText: text,
          });
        }
      });
    });

    if (results.length === 0) {
      console.log("⚠️ No draws found on the page.");
      return res.status(404).json({ message: "No draws found." });
    }

    let savedCount = 0;

    for (const draw of results) {
      if (!draw.drawDate) {
        console.log("⚠️ Skipping draw with no valid date:", draw.rawText);
        continue;
      }

      const drawId = new Date(draw.drawDate).toISOString().split("T")[0];
      if (!drawId) {
        console.log("⚠️ Invalid date for draw, skipping:", draw.drawDate);
        continue;
      }

      const docRef = db.collection("oinp_rounds").doc(drawId);
      const existing = await docRef.get();
      if (existing.exists) {
        console.log(`⏩ Skipping existing draw: ${drawId}`);
        continue;
      }

      await docRef.set({
        drawDate: draw.drawDate,
        year: draw.year,
        invitations_issued: draw.invitations_issued,
        stream: draw.stream,
        notes: draw.notes,
        createdAt: new Date(),
        rawText: draw.rawText,
      });

      console.log(`✅ Saved new draw: ${drawId}`);
      savedCount++;
    }

    return res.status(200).json({
      message: "OINP rounds scrape completed",
      drawsFound: results.length,
      drawsSaved: savedCount,
    });
  } catch (error) {
    console.error("❌ Scrape failed:", error);
    return res.status(500).json({ error: "Scrape failed" });
  }
};
