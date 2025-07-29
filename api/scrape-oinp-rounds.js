const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore"); // make sure this is your initialized Firestore instance

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const allDraws = [];

    $("table").each((_, table) => {
      const headers = [];

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

          // Infer stream name from previous heading (above the table)
          const stream = $(table).prevAll("h2, h3, h4").first().text().trim();
          if (stream && draw.date_issued) {
            draw.stream = stream;
            allDraws.push(draw);
          }
        });
    });

    console.log(`🔍 Found ${allDraws.length} draws`);

    const inserted = [];

    for (const draw of allDraws) {
      const drawYear = draw.date_issued.split(" ").pop(); // last word of date e.g., "2025"
      const streamRef = db
        .collection("oinp_rounds")
        .doc(drawYear)
        .collection(draw.stream);

      // Prevent duplicates by checking if same date_issued already exists
      const snapshot = await streamRef
        .where("date_issued", "==", draw.date_issued)
        .get();

      const alreadyExists = !snapshot.empty;

      if (!alreadyExists) {
        await streamRef.add({
          ...draw,
          createdAt: new Date(),
        });
        inserted.push(draw);
        console.log(`✅ Added: ${draw.date_issued} [${draw.stream}]`);
      } else {
        console.log(`⏩ Skipped duplicate: ${draw.date_issued} [${draw.stream}]`);
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
