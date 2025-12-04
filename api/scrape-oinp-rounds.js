const axios = require("axios");
const cheerio = require("cheerio");
const db = require("../lib/firestore");

// Utility to normalize text
const clean = (v = "") => v.trim().replace(/\s+/g, " ");

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url =
      "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const inserted = [];

    // Iterate through year headings
    $("h2").each((_, h2) => {
      const headingText = clean($(h2).text());
      const match = headingText.match(/Invitations to apply issued in (\d{4})/);
      if (!match) return;

      const year = parseInt(match[1], 10);

      let $next = $(h2).next();

      // --- Process summary list ---
      if ($next.is("ul")) {
        const summaryItems = [];
        $next.find("li").each((_, li) => {
          summaryItems.push(clean($(li).text()));
        });

        if (summaryItems.length > 0) {
          const summary = {
            year,
            stream: "N/A",
            summaryItems,
            document_type: "summary",
            createdAt: new Date(),
            updatedAt: new Date(),
            id: `summary-${year}`, // stable ID per year
          };
          inserted.push(summary);
          console.log(`📘 Parsed summary for year ${year}`);
        }

        $next = $next.next();
      }

      // --- Process draw tables ---
      while ($next.length && !$next.is("h2")) {
        if ($next.is("table")) {
          const headers = $next
            .find("thead tr th")
            .map((_, th) =>
              clean($(th).text().toLowerCase().replace(/\s+/g, "_"))
            )
            .get();

          const stream =
            clean($next.prevAll("h3, h4").first().text()) || "Unknown Stream";

          const isDataTable =
            headers.includes("date_issued") ||
            headers.includes("number_of_invitations");

          $next.find("tbody tr").each((_, tr) => {
            const cells = $(tr).find("td");
            if (!cells.length) return;

            const draw = {};
            cells.each((i, td) => {
              draw[headers[i]] = clean($(td).text());
            });

            draw.stream = stream;
            draw.year = year;
            draw.document_type = isDataTable ? "draw" : "summary";

            // Use stable ID for draws: year + date_issued
            const dateIssued = draw.date_issued || draw.date;
            if (dateIssued) {
              draw.id = `${year}-${dateIssued}`
                .toLowerCase()
                .replace(/\s+/g, "_");
            } else {
              // fallback in case date missing
              draw.id = crypto
                .createHash("md5")
                .update(JSON.stringify(draw))
                .digest("hex");
            }

            inserted.push(draw);
          });
        }

        $next = $next.next();
      }
    });

    console.log(`📦 Parsed total ${inserted.length} records`);

    // --- Upsert into Firestore ---
    let addedCount = 0;
    let updatedCount = 0;
    let emailedCount = 0;
    let skippedCount = 0;

    for (const doc of inserted) {
      const ref = db.collection("oinp_rounds").doc(doc.id);
      const snap = await ref.get();
      const exists = snap.exists;
      const prev = snap.data();

      // --- Summary documents ---
      if (doc.document_type === "summary") {
        if (!exists) {
          await ref.set(doc);
          addedCount++;
          console.log(`📘 Added summary for year ${doc.year}`);
        } else {
          // Only update if summary items changed
          const changed =
            JSON.stringify(prev.summaryItems) !== JSON.stringify(doc.summaryItems);

          if (changed) {
            await ref.update({
              summaryItems: doc.summaryItems,
              updatedAt: new Date(),
            });
            updatedCount++;
            console.log(`♻️ Updated summary for year ${doc.year}`);
          } else {
            skippedCount++;
          }
        }
        continue;
      }

      // --- Draw documents ---
      const baseDoc = {
        ...doc,
        createdAt: exists ? prev.createdAt : new Date(),
        updatedAt: new Date(),
        notified: exists ? prev.notified ?? false : false,
      };

      if (!exists) {
        await ref.set(baseDoc);
        addedCount++;
        console.log(`✅ Added draw ${doc.date_issued || doc.stream} [${doc.stream}]`);
      } else {
        // Only update if content changed (ignoring notified)
        const changed =
          JSON.stringify({ ...prev, notified: undefined }) !==
          JSON.stringify({ ...baseDoc, notified: undefined });

        if (changed) {
          await ref.update(baseDoc);
          updatedCount++;
          console.log(`♻️ Updated draw ${doc.id}`);
        } else {
          skippedCount++;
        }
      }

      // --- Email notification for new draws ---
      const currentDoc = (await ref.get()).data();
      if (currentDoc.document_type === "draw" && !currentDoc.notified) {
        try {
          await axios.post(
            `${process.env.BASE_URL}/api/send-oinp-draw-email`,
            {
              stream: currentDoc.stream,
              dateIssued: currentDoc.date_issued || "Unknown Date",
              scoreRange: currentDoc.score_range || "N/A",
              invitationsIssued:
                currentDoc.number_of_invitations_issued ||
                currentDoc.number_of_invitations ||
                "N/A",
            }
          );

          await ref.update({ notified: true });
          emailedCount++;
          console.log(`📧 Email sent + marked notified for ${doc.id}`);
        } catch (err) {
          console.error(`⚠️ Failed to send email for draw ${doc.id}:`, err.message);
        }
      }
    }

    return res.status(200).json({
      message: "OINP rounds scraped and synced",
      stats: {
        totalScraped: inserted.length,
        added: addedCount,
        updated: updatedCount,
        emailed: emailedCount,
        skipped: skippedCount,
      },
    });
  } catch (err) {
    console.error("❌ Scraping error:", err);
    return res.status(500).json({
      error: "Failed to scrape OINP draws",
      details: err.message,
    });
  }
};
