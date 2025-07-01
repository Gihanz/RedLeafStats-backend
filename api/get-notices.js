const db = require("../lib/firestore");

module.exports = async (req, res) => {
  try {
    const doc = await db.collection("notices").doc("latest").get();

    if (!doc.exists) {
      console.warn("⚠️ No notices found in Firestore.");
      return res.status(404).json({ error: "No notices found." });
    }

    res.status(200).json(doc.data());
  } catch (err) {
    console.error("❌ Failed to fetch notices:", err.message);
    res.status(500).json({ error: "Failed to fetch notices." });
  }
};
