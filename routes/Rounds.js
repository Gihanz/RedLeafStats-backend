const express = require("express");
const router = express.Router();
const { getRounds, syncRounds } = require("../controllers/RoundsController");

router.get("/sync-rounds", syncRounds);
router.get("/rounds", getRounds);  

module.exports = router;
