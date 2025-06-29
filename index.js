const express = require("express");
const cors = require("cors");
const cron = require("node-cron");

const roundsRoute = require("./routes/Rounds");
const { syncRounds } = require("./controllers/RoundsController");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use("/api", roundsRoute);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);

  // ⏰ Auto-sync once daily at 3:00 AM
  cron.schedule("0 3 * * *", async () => {
    console.log("⏰ Auto-syncing rounds...");
    try {
      await syncRounds(
        { method: "GET" }, 
        { 
          status: () => ({
            json: (msg) => console.log("✔️ Sync done via cron:", msg),
          }),
        }
      );
    } catch (err) {
      console.error("❌ Cron sync failed:", err.message);
    }
  });
});
