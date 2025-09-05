const axios = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const db = require("../lib/firestore");

module.exports = async (req, res) => {
  console.log("🌐 Starting scrape of OINP rounds...");

  try {
    const url =
      "https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp-invitations-apply";
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const inserted = [];

    $("h2").each((_, h2) => {
      const headingText = $(h2).text().trim();
      const match = headingText.match(/Invitations to apply issued in (\d{4})/);
      if (!match) return;

      const year = match[1];

      let $next = $(h2).next();
      if ($next.is("ul")) {
        const summaryItems = [];
        $next.find("li").each((_, li) => {
          summaryItems.push($(li).text().trim());
        });

        if (summaryItems.length > 0) {
          const summary = {
            year,
            stream: "Unknown Stream",
            summaryItems,
            createdAt: new Date(),
            document_type: "summary",
            id: crypto
              .createHash("md5")
              .update(summaryItems.join(","))
              .digest("hex"),
          };
          inserted.push(summary);
          console.log(`✅ Added summary for year ${year}`);
        }
      }

      // Process draw tables
      $next = $next.next();
      while ($next.length && !$next.is("h2")) {
        if ($next.is("table")) {
          const headers = [];
          $next.find("thead tr th").each((_, th) => {
            headers.push(
              $(th).text().trim().toLowerCase().replace(/\s+/g, "_")
            );
          });

          const stream =
            $next.prevAll("h3, h4").first().text().trim() || "Unknown Stream";

          const isDataTable =
            headers.includes("date_issued") ||
            headers.includes("number_of_invitations");

          $next.find("tbody tr").each((_, tr) => {
            const cells = $(tr).find("td");
            if (cells.length !== headers.length) return;

            const draw = {};
            cells.each((i, td) => {
              draw[headers[i]] = $(td).text().trim();
            });

            draw.stream = stream;
            draw.year = parseInt(year, 10);
            draw.createdAt = new Date();
            draw.document_type = isDataTable ? "draw" : "summary";

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
    let emailedCount = 0;
    let skippedCount = 0;

    for (const draw of inserted) {
      const ref = db.collection("oinp_rounds").doc(draw.id);
      const existing = await ref.get();

      if (!existing.exists) {
        // Add new document with notified flag
        await ref.set({ ...draw, notified: false });
        addedCount++;
        console.log(
          `✅ Added new OINP draw ${draw.date_issued || draw.stream} [${
            draw.stream
          }]`
        );
      }

      const docData = (await ref.get()).data();

      // Only send emails for actual draws, not summaries
      if (docData?.document_type === "draw" && !docData?.notified) {
        try {
          await axios.post(`${process.env.BASE_URL}/api/send-oinp-draw-email`, {
            stream: docData.stream || "Unknown Stream",
            dateIssued: docData.date_issued || "Unknown Date",
            crsRange: docData.crs_range || "N/A",
            issued: docData.number_of_invitations || "N/A",
          });

          await ref.update({ notified: true });
          emailedCount++;
          console.log(`📧 Email sent + marked notified for ${draw.id}`);
        } catch (err) {
          console.error(
            `⚠️ Failed to send email for OINP draw ${draw.id}:`,
            err.message
          );
        }
      } else {
        skippedCount++;
      }
    }

    return res.status(200).json({
      message: "OINP rounds scraped and stored",
      newDrawsAdded: addedCount,
      emailed: emailedCount,
      skipped: skippedCount,
      totalScraped: inserted.length,
    });
  } catch (err) {
    console.error("❌ Scraping error:", err.message);
    return res
      .status(500)
      .json({ error: "Failed to scrape OINP draws" });
  }
};
