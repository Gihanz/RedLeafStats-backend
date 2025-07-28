const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const drawSections = $("h3:contains('Date issued')").toArray();
    const rounds = [];

    for (const section of drawSections) {
      const drawBlock = $(section).nextUntil("h3");

      const titleText = $(section).text();
      const dateMatch = titleText.match(/Date issued\s+(.+)/i);
      const drawDateRaw = dateMatch ? dateMatch[1].trim() : null;

      if (!drawDateRaw) continue;

      const drawDate = new Date(drawDateRaw);
      const drawId = drawDate.toISOString().split("T")[0]; // e.g. 2025-06-06

      // Find the table in the section
      const table = drawBlock.filter("table").first();
      if (!table || table.length === 0) continue;

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
        const ref = db.collection("oinp_rounds").doc(drawId);
        await ref.set({
          drawDate: drawDateRaw,
          createdAt: new Date(),
          entries,
        });

        rounds.push({ drawId, entriesCount: entries.length });
        console.log(`✅ Saved draw ${drawId} with ${entries.length} entries`);
      }
    }

    return res.status(200).json({
      message: "OINP rounds scraped and stored successfully",
      totalRounds: rounds.length,
      rounds,
    });
  } catch (err) {
    console.error("❌ Scrape error:", err.message);
    return res.status(500).json({ error: "Failed to scrape OINP rounds." });
  }
};
