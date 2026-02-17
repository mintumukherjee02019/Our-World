const express = require("express");
const auth = require("../middleware/auth");
const Society = require("../models/society.model");

const router = express.Router();
router.use(auth);

router.get("/", async (req, res) => {
  const query = {};
  if (req.query.status) query.status = req.query.status;
  const items = await Society.find(query).sort({ createdAt: -1 }).lean();
  return res.json({ items });
});

router.get("/:societyId", async (req, res) => {
  const societyId = Number(req.params.societyId);
  const filter = Number.isNaN(societyId) ? { _id: req.params.societyId } : { societyId };
  const item = await Society.findOne(filter).lean();
  if (!item) return res.status(404).json({ message: "Society not found" });
  return res.json({ item });
});

router.post("/", async (req, res) => {
  const required = ["name"];
  for (const field of required) {
    if (!req.body[field]) return res.status(400).json({ message: `${field} is required` });
  }
  const item = await Society.create({
    name: req.body.name,
    status: req.body.status || "pending",
    phone: req.body.phone,
    email: req.body.email,
    address: req.body.address,
    city: req.body.city,
    district: req.body.district,
    state: req.body.state,
    country: req.body.country,
    pincode: req.body.pincode,
  });
  return res.status(201).json({ message: "Society created", item });
});

router.put("/:societyId", async (req, res) => {
  const societyId = Number(req.params.societyId);
  const filter = Number.isNaN(societyId) ? { _id: req.params.societyId } : { societyId };
  const allowed = ["name", "status", "phone", "email", "address", "city", "district", "state", "country", "pincode"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const item = await Society.findOneAndUpdate(filter, update, { new: true, runValidators: true }).lean();
  if (!item) return res.status(404).json({ message: "Society not found" });
  return res.json({ message: "Society updated", item });
});

router.delete("/:societyId", async (req, res) => {
  const societyId = Number(req.params.societyId);
  const filter = Number.isNaN(societyId) ? { _id: req.params.societyId } : { societyId };
  const item = await Society.findOneAndDelete(filter).lean();
  if (!item) return res.status(404).json({ message: "Society not found" });
  return res.json({ message: "Society deleted", item });
});

module.exports = router;

