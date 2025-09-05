const syncEE = require("./sync-ee-rounds");
const syncOINP = require("./scrape-oinp-rounds");

module.exports = async (req, res) => {
  console.log("🚀 Starting combined sync job...");

  try {
    // Run them one after the other
    const [eeResult, oinpResult] = await Promise.all([
      syncEE(req, res, true),
      syncOINP(req, res, true), 
    ]);

    console.log("✅ Combined sync complete");

    return res.status(200).json({
      message: "All sync jobs completed",
      ee: eeResult,
      oinp: oinpResult,
    });
  } catch (err) {
    console.error("❌ Combined sync error:", err.message);
    return res.status(500).json({ error: "Failed combined sync" });
  }
};
