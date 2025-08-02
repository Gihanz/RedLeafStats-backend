const db = require("../lib/firestore");

module.exports = async (req, res) => {
  try {
    const snapshot = await db.collection("ee_rounds").orderBy("drawNumber", "desc").get();

    const rounds = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(rounds);
  } catch (err) {
    console.error("❌ Failed to fetch rounds:", err.message);
    res.status(500).json({ error: "Failed to fetch rounds" });
  }
};
