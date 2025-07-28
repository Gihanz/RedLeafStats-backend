const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const newDraws = [];

    $("table").each((_, table) => {
      const headers = [];
      const rows = [];

      $(table)
        .find("thead tr th")
        .each((_, th) => {
          headers.push($(th).text().trim().toLowerCase().replace(/\s+/g, "_"));
        });

      $(table)
        .find("tbody tr")
        .each((_, tr) => {
          const cells = $(tr).find("td");
          if (cells.length !== headers.length) return;

          const draw = {};
          cells.each((i, td) => {
            draw[headers[i]] = $(td).text().trim();
          });

          if (draw.date_issued) {
            draw.drawId = draw.date_issued.replace(/[^a-zA-Z0-9]/g, "-"); // safe ID
            rows.push(draw);
          }
        });

      newDraws.push(...rows);
    });

    console.log(`🔍 Found ${newDraws.length} draws in tables`);

    const inserted = [];

    for (const draw of newDraws) {
      const ref = db.collection("oinp_rounds").doc(draw.drawId);
      const existing = await ref.get();

      if (!existing.exists) {
        await ref.set({
          ...draw,
          createdAt: new Date(),
        });
        inserted.push(draw);
        console.log(`✅ New draw added: ${draw.drawId}`);
      } else {
        console.log(`⏩ Draw already exists: ${draw.drawId}`);
      }
    }

    return res.status(200).json({
      message: "OINP rounds scrape completed",
      newDrawsAdded: inserted.length,
      draws: inserted,
    });
  } catch (err) {
    console.error("❌ Error scraping OINP rounds:", err.message);
    return res.status(500).json({ error: "Failed to scrape OINP rounds" });
  }
};
