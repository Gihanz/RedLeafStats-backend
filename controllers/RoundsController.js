const axios = require("axios");
const db = require("../lib/firestore");

exports.syncRounds = async (req, res) => {
  try {
    console.log("Fetching data...");

    const response = await axios.get(
      "https://www.canada.ca/content/dam/ircc/documents/json/ee_rounds_123_en.json"
    );

    const data = response.data;

    if (!data || !Array.isArray(data.rounds)) {
      throw new Error("Invalid or missing 'rounds' array in data");
    }

    console.log(`Fetched ${data.rounds.length} rounds`);

    for (const round of data.rounds) {
      const id = round.drawNumber || round.date || Math.random().toString();
      const docRef = db.collection("ee_rounds").doc(String(id));
      const existing = await docRef.get();
      if (!existing.exists) {
        await docRef.set(round);
        console.log("✅ Saved:", id);
      } else {
        console.log("⏭️ Skipped duplicate:", id);
      }
    }

    res.status(200).json({ message: `${data.rounds.length} rounds saved.` });
  } catch (err) {
    console.error("❌ Sync error:", err.message);
    res.status(500).json({ error: "Failed to sync rounds." });
  }
};

exports.getRounds = async (req, res) => {
  try {
    const snapshot = await db.collection("ee_rounds").orderBy("drawNumber", "desc").get();

    const rounds = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(rounds);
  } catch (err) {
    console.error("❌ Failed to fetch rounds:", err.message);
    res.status(500).json({ error: "Failed to fetch rounds" });
  }
};
