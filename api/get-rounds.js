const { getRounds } = require("../controllers/RoundsController");

module.exports = async (req, res) => {
  await getRounds(req, res);
};
