const express = require("express");
const auth = require("../middleware/auth");
const featureData = require("../data/feature-data");

const router = express.Router();

router.use(auth);

router.get("/maintenance", (req, res) => {
  res.json({ items: featureData.maintenance });
});

router.get("/visitors", (req, res) => {
  res.json({ items: featureData.visitors });
});

router.get("/notices", (req, res) => {
  res.json({ items: featureData.notices });
});

router.get("/complaints", (req, res) => {
  res.json({ items: featureData.complaints });
});

router.get("/updates", (req, res) => {
  res.json({ items: featureData.updates });
});

router.get("/stats", (req, res) => {
  res.json({ items: featureData.stats });
});

module.exports = router;

