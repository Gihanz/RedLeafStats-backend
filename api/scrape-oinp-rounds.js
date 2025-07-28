const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    // Support both h2 and h3 headers
    const drawSections = $("h2:contains('Date issued'), h3:contains('Date issued')").toArray();
    console.log(`🔍 Found ${drawSections.length} draw sections`);

    const newRounds = [];

    for (const section of drawSections) {
      const drawBlock = $(section).nextUntil("h2, h3");
      const titleText = $(section).text();
      const dateMatch = titleText.match(/Date issued\s+(.+)/i);
      const drawDateRaw = dateMatch ? dateMatch[1].trim() : null;

      if (!drawDateRaw) {
        console.log("❌ Skipping: couldn't extract draw date from heading:", titleText);
        continue;
      }

      console.log(`🗓️ Draw heading: ${titleText}`);
      console.log(`📅 Parsed date: ${drawDateRaw}`);

      const drawDate = new Date(drawDateRaw);
      const drawId = drawDate.toISOString().split("T")[0]; // e.g. 2025-06-06

      // 🔒 Prevent overwriting existing
      const existing = await db.collection("oinp_rounds").doc(drawId).get();
      if (existing.exists) {
        console.log(`⏩ Skipping existing draw: ${drawId}`);
        continue;
      }

      const table = drawBlock.filter("table").first();
      if (!table || table.length === 0) {
        console.log(`⚠️ No table found under ${drawId}`);
        continue;
      }

      const rows = $(table).find("tbody tr");
      const entries = [];

      rows.each((_, row) => {
        const cells = $(row).find("td").toArray().map((td) => $(td).text().trim());

        if (cells.length >= 4) {
          entries.push({
            stream: cells[0],
            date_profiles_created: cells[1],
            score_range: cells[2],
            invitations_issued: parseInt(cells[3].replace(/[^\d]/g, ""), 10),
            notes: cells[4] || "",
          });
        }
      });

      if (entries.length > 0) {
        await db.collection("oinp_rounds").doc(drawId).set({
          drawDate: drawDateRaw,
          createdAt: new Date(),
          entries,
        });

        newRounds.push({ drawId, entriesCount: entries.length });
        console.log(`✅ Saved new draw: ${drawId} (${entries.length} entries)`);
      } else {
        console.log(`⚠️ No valid entries found in table for ${drawId}`);
      }
    }

    return res.status(200).json({
      message: "OINP rounds scrape completed",
      newDrawsAdded: newRounds.length,
      draws: newRounds,
    });
  } catch (err) {
    console.error("❌ Scrape error:", err.message);
    return res.status(500).json({ error: "Failed to scrape OINP rounds." });
  }
};
