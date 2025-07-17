const axios = require("axios");
const db = require("../lib/firestore");

module.exports = async (req, res) => {
  console.log("📡 Starting sync of IRCC rounds...");

  try {
    const response = await axios.get(
      "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json"
    );

    const data = response.data;

    if (!data || !Array.isArray(data.rounds)) {
      console.error("⚠️ Invalid or missing 'rounds' array in response");
      return res.status(400).json({ error: "Invalid or missing 'rounds' array in data" });
    }

    console.log(`📥 Fetched ${data.rounds.length} rounds from IRCC`);

    let savedCount = 0;
    let skippedCount = 0;
    let emailedCount = 0;

    for (const round of data.rounds) {
      const id = String(round.drawNumber || round.date || Math.random().toString());
      const docRef = db.collection("ee_rounds").doc(id);
      const existing = await docRef.get();

      if (!existing.exists) {
        // ➕ Create new document
        await docRef.set(round);
        savedCount++;
        console.log(`✅ Saved round: ${id}`);
      }

      const docData = (await docRef.get()).data();

      // 🔍 Check if notification was already sent
      if (!docData?.notified) {
        try {
          await axios.post(`${process.env.BASE_URL}/api/send-draw-email`, {
            drawname: round.drawName || "Unknown Draw",
            drawdate: round.drawDate || "Unknown date",
            drawcrs: round.drawCRS || "N/A",
            drawsize: round.drawSize || "N/A",
          });

          // ✅ Mark as notified
          await docRef.update({ notified: true });
          emailedCount++;
          console.log(`📧 Email sent and marked notified for round ${id}`);
        } catch (emailErr) {
          console.error(`⚠️ Failed to send email for draw ${id}:`, emailErr.message);
        }
      } else {
        skippedCount++;
        console.log(`⏭️ Skipped (already notified) round: ${id}`);
      }
    }

    console.log("🟢 Sync complete");
    console.log(`🔢 Saved: ${savedCount} | Skipped: ${skippedCount} | Emailed: ${emailedCount}`);

    res.status(200).json({
      message: "Rounds sync complete",
      saved: savedCount,
      skipped: skippedCount,
      emailed: emailedCount,
      total: data.rounds.length,
    });
  } catch (err) {
    console.error("❌ Sync error:", err.message);
    res.status(500).json({ error: "Failed to sync rounds." });
  }
};
