const { syncRounds } = require("../controllers/RoundsController");

module.exports = async (req, res) => {
  await syncRounds(req, res);
};
