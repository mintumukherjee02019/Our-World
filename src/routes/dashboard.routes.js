const express = require("express");
const auth = require("../middleware/auth");
const dashboardPayload = require("../data/dashboard");

const router = express.Router();

router.get("/", auth, (req, res) => {
  return res.json({
    user: req.user,
    dashboard: dashboardPayload,
  });
});

module.exports = router;

