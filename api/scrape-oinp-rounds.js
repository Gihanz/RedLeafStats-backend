const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

// Utility to normalize text
const clean = (v = "") => v.trim().replace(/\s+/g, " ");

module.exports = async (req, res) => {
  console.log("🌐 Starting OINP scrape...");

  const url =
    "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";

  try {
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const scraped = [];

    // Parse each year section
    $("h2").each((_, h2) => {
      const heading = clean($(h2).text());
      const match = heading.match(/Invitations to apply issued in (\d{4})/);
      if (!match) return;

      const year = parseInt(match[1], 10);
      let $next = $(h2).next();

      // Summary UL (rarely useful)
      if ($next.is("ul")) {
        const items = $next
          .find("li")
          .map((_, li) => clean($(li).text()))
          .get();

        if (items.length) {
          scraped.push({
            year,
            document_type: "summary",
            stream: "N/A",
            summary_items: items,
          });
        }

        $next = $next.next();
      }

      // Tables (draws)
      while ($next.length && !$next.is("h2")) {
        if ($next.is("table")) {
          const headers = $next
            .find("thead tr th")
            .map((_, th) => clean($(th).text().toLowerCase().replace(/\s+/g, "_")))
            .get();

          const stream =
            clean($next.prevAll("h3, h4").first().text()) || "Unknown Stream";

          $next.find("tbody tr").each((_, tr) => {
            const cells = $(tr).find("td");
            if (!cells.length) return;

            const draw = {};
            cells.each((i, td) => {
              draw[headers[i]] = clean($(td).text());
            });

            // Mandatory fields
            draw.stream = stream;
            draw.year = year;
            draw.document_type = "draw";

            scraped.push(draw);
          });
        }

        $next = $next.next();
      }
    });

    console.log(`📦 Parsed ${scraped.length} records from HTML`);

    let added = 0;
    let updated = 0;
    let emailed = 0;
    let skipped = 0;

    for (const row of scraped) {
      if (row.document_type !== "draw") continue;

      const dateIssued = row.date_issued || row.date;
      if (!dateIssued) {
        console.warn("⚠️ Missing date_issued for row, skipping", row);
        continue;
      }

      // Stable ID: Year + Date (streams rarely collide per day)
      const id = `${row.year}-${dateIssued}`.toLowerCase().replace(/\s+/g, "_");

      const ref = db.collection("oinp_rounds").doc(id);
      const snapshot = await ref.get();
      const exists = snapshot.exists;
      const prev = snapshot.data();

      const baseDoc = {
        ...row,
        id,
        createdAt: exists ? prev.createdAt : new Date(),
        updatedAt: exists ? new Date() : null,
        notified: exists ? prev.notified ?? false : false,
      };

      if (!exists) {
        await ref.set(baseDoc);
        added++;
        console.log(`🆕 Added draw: ${id}`);
      } else {
        const changed =
          JSON.stringify({ ...prev, notified: undefined }) !==
          JSON.stringify({ ...baseDoc, notified: undefined });

        if (changed) {
          await ref.update({
            ...baseDoc,
            updatedAt: new Date(),
          });
          updated++;
          console.log(`♻️ Updated draw: ${id}`);
        } else {
          skipped++;
        }
      }

      // Re-evaluate the saved doc
      const doc = (await ref.get()).data();

      // Email only if it's a new draw and unnotified
      if (doc.document_type === "draw" && !doc.notified) {
        try {
          await axios.post(
            `${process.env.BASE_URL}/api/send-oinp-draw-email`,
            {
              stream: doc.stream,
              dateIssued: doc.date_issued || "Unknown Date",
              scoreRange: doc.score_range || "N/A",
              invitationsIssued:
                doc.number_of_invitations_issued || doc.number_of_invitations || "N/A",
            }
          );

          await ref.update({ notified: true });
          emailed++;
          console.log(`📧 Email sent + marked notified for ${id}`);
        } catch (err) {
          console.error(`⚠️ Email failed for ${id}`, err.message);
        }
      } else {
        skipped++;
      }
    }

    return res.status(200).json({
      message: "OINP rounds scraped and synced",
      stats: {
        added,
        updated,
        emailed,
        skipped,
        totalScraped: scraped.length,
      },
    });
  } catch (err) {
    console.error("❌ Scrape error:", err);
    return res.status(500).json({
      error: "Scrape failed",
      details: err.message,
    });
  }
};
