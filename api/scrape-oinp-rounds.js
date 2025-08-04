const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const db = require("../lib/firestore"); // Firestore instance

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url = "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const inserted = [];

    // Loop through each h2 tag to find year headers
    $("h2").each((_, h2) => {
      const headingText = $(h2).text().trim();
      const match = headingText.match(/Invitations to apply issued in (\d{4})/);
      if (!match) return;

      const year = match[1];

      let $next = $(h2).next();
      // Process the <ul> summary if it exists right after the h2
      if ($next.is("ul")) {
        // If there's a <ul> under the h2, treat it as a summary and add it
        const summaryItems = [];
        $next.find("li").each((_, li) => {
          summaryItems.push($(li).text().trim());
        });

        if (summaryItems.length > 0) {
          const summary = {
            year,
            stream: "Unknown Stream", // For simplicity, or extract stream if applicable
            summaryItems, // List of items in the summary
            createdAt: new Date(),
            document_type: "summary",
            id: crypto.createHash("md5").update(summaryItems.join(",")).digest("hex"), // Generate a unique ID based on the items
          };
          inserted.push(summary);
          console.log(`✅ Added summary for year ${year}`);
        }
      }

      // Now process the tables (data tables)
      $next = $next.next();
      while ($next.length && !$next.is("h2")) {
        if ($next.is("table")) {
          const headers = [];
          $next.find("thead tr th").each((_, th) => {
            headers.push(
              $(th).text().trim().toLowerCase().replace(/\s+/g, "_")
            );
          });

          const stream = $next.prevAll("h3, h4").first().text().trim() || "Unknown Stream";

          // Flag to check if the table is a data table
          const isDataTable = headers.includes("date_issued") || headers.includes("number_of_invitations");

          // Loop through table rows and extract data
          $next.find("tbody tr").each((_, tr) => {
            const cells = $(tr).find("td");
            if (cells.length !== headers.length) return; // Skip rows with incorrect cell count

            const draw = {};
            cells.each((i, td) => {
              draw[headers[i]] = $(td).text().trim();
            });

            // Add additional fields for all rows (data or summary)
            draw.stream = stream;
            draw.year = parseInt(year, 10);
            draw.createdAt = new Date();
            draw.document_type = isDataTable ? "data" : "summary"; // Determine if it's a data or summary row

            // Generate a hash ID based on the data (excluding createdAt)
            const drawForHash = { ...draw };
            delete drawForHash.createdAt;
            const hashId = crypto
              .createHash("md5")
              .update(JSON.stringify(drawForHash))
              .digest("hex");

            draw.id = hashId;

            inserted.push({ ...draw, id: hashId });
          });
        }

        $next = $next.next();
      }
    });

    let addedCount = 0;
    // Insert the scraped data into Firestore
    for (const draw of inserted) {
      const ref = db.collection("oinp_rounds").doc(draw.id);
      const existing = await ref.get();
      if (existing.exists) {
        console.log(`⏩ Skipped existing draw ${draw.date_issued || draw.stream} [${draw.stream}]`);
        continue;
      }
      await ref.set(draw);
      addedCount++;
      console.log(`✅ Added draw ${draw.date_issued || draw.stream} [${draw.stream}]`);
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
