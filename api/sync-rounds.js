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

    for (const round of data.rounds) {
      const id = round.drawNumber || round.date || Math.random().toString();
      const docRef = db.collection("ee_rounds").doc(String(id));
      const existing = await docRef.get();

      if (!existing.exists) {
        await docRef.set(round);
        savedCount++;
        console.log(`✅ Saved round: ${id}`);
      } else {
        skippedCount++;
        console.log(`⏭️ Skipped duplicate round: ${id}`);
      }
    }

    console.log("🟢 Sync complete");
    console.log(`🔢 Saved: ${savedCount} | Skipped: ${skippedCount} | Total: ${data.rounds.length}`);

    res.status(200).json({
      message: "Rounds sync complete",
      saved: savedCount,
      skipped: skippedCount,
      total: data.rounds.length,
    });
  } catch (err) {
    console.error("❌ Sync error:", err.message);
    res.status(500).json({ error: "Failed to sync rounds." });
  }
};
