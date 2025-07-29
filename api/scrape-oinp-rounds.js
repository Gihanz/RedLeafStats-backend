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
    const drawYearToDraws = {};
    const drawYearToSummary = {};

    $("h2").each((_, h2) => {
      const headingText = $(h2).text().trim();
      const match = headingText.match(/Invitations to apply issued in (\d{4})/);
      if (!match) return;

      const year = match[1];

      // Get summary (ul right after h2)
      const $ul = $(h2).next("ul");
      const summary = {};
      $ul.find("li").each((_, li) => {
        const text = $(li).text().trim();
        const [label, value] = text.split("—").map(s => s.trim());
        if (label && value) {
          summary[label] = parseInt(value.replace(/,/g, ""), 10);
        }
      });
      drawYearToSummary[year] = summary;

      // Now find tables between this h2 and next h2
      let $next = $(h2).next();
      while ($next.length && !$next.is("h2")) {
        if ($next.is("table")) {
          const headers = [];
          $next.find("thead tr th").each((_, th) => {
            headers.push($(th).text().trim().toLowerCase().replace(/\s+/g, "_"));
          });

          $next.find("tbody tr").each((_, tr) => {
            const cells = $(tr).find("td");
            if (cells.length !== headers.length) return;

            const draw = {};
            cells.each((i, td) => {
              draw[headers[i]] = $(td).text().trim();
            });

            // Stream name from closest previous h3/h4 before this table
            const stream = $next.prevAll("h3, h4").first().text().trim() || "Unknown Stream";
            if (!drawYearToDraws[year]) drawYearToDraws[year] = [];
            draw.stream = stream;
            drawYearToDraws[year].push(draw);
          });
        }

        $next = $next.next();
      }
    });

    for (const [year, draws] of Object.entries(drawYearToDraws)) {
      const yearRef = db.collection("oinp_rounds").doc(year);

      for (const draw of draws) {
        const streamRef = yearRef.collection(draw.stream);
        const drawCopy = { ...draw };
        delete drawCopy.createdAt;

        // Generate a hash based on draw contents
        const hashId = crypto
          .createHash("md5")
          .update(JSON.stringify(drawCopy))
          .digest("hex");

        const existingDoc = await streamRef.doc(hashId).get();
        if (existingDoc.exists) {
          console.log(`⏩ Skipped duplicate: ${draw.date_issued} [${draw.stream}]`);
        } else {
          await streamRef.doc(hashId).set({
            ...draw,
            createdAt: new Date(),
          });
          inserted.push({ ...draw, id: hashId });
          console.log(`✅ Added: ${draw.date_issued} [${draw.stream}]`);
        }
      }

      // Save summary under the same year doc
      if (drawYearToSummary[year]) {
        await yearRef.collection("summary").doc("totals").set({
          ...drawYearToSummary[year],
          updatedAt: new Date(),
        });
        console.log(`📊 Summary saved for year ${year}`);
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
