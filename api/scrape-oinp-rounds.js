const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const db = require("../lib/firestore"); // your Firestore instance

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const inserted = [];

    $("h2").each((_, h2) => {
      const headingText = $(h2).text().trim();
      const match = headingText.match(/Invitations to apply issued in (\d{4})/);
      if (!match) return;

      const year = match[1];

      let $next = $(h2).next();
      while ($next.length && !$next.is("h2")) {
        if ($next.is("table")) {
          const headers = [];
          $next.find("thead tr th").each((_, th) => {
            headers.push(
              $(th).text().trim().toLowerCase().replace(/\s+/g, "_")
            );
          });

          $next.find("tbody tr").each((_, tr) => {
            const cells = $(tr).find("td");
            if (cells.length !== headers.length) return;

            const draw = {};
            cells.each((i, td) => {
              draw[headers[i]] = $(td).text().trim();
            });

            const stream = $next.prevAll("h3, h4").first().text().trim() || "Unknown Stream";
            draw.stream = stream;
            draw.year = parseInt(year, 10);
            draw.createdAt = new Date();

            // Generate a hash based on core draw contents (excluding createdAt)
            const drawForHash = { ...draw };
            delete drawForHash.createdAt;
            const hashId = crypto
              .createHash("md5")
              .update(JSON.stringify(drawForHash))
              .digest("hex");

            draw.id = hashId; // Optional: store ID inside doc

            // Insert into flat collection: oinp_rounds
            inserted.push({ ...draw, id: hashId });
          });
        }

        $next = $next.next();
      }
    });

    // Save all new draws to Firestore
    let addedCount = 0;
    for (const draw of inserted) {
      const ref = db.collection("oinp_rounds").doc(draw.id);
      const existing = await ref.get();
      if (existing.exists) {
        console.log(`⏩ Skipped existing draw ${draw.date_issued} [${draw.stream}]`);
        continue;
      }
      await ref.set(draw);
      addedCount++;
      console.log(`✅ Added draw ${draw.date_issued} [${draw.stream}]`);
    }

    return res.status(200).json({
      message: "OINP rounds scraped and stored",
      newDrawsAdded: addedCount,
      totalScraped: inserted.length,
    });
  } catch (err) {
    console.error("❌ Scraping error:", err.message);
    return res.status(500).json({ error: "Failed to scrape OINP draws" });
  }
};
