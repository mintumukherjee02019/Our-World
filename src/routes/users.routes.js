const express = require("express");
const auth = require("../middleware/auth");
const User = require("../models/user.model");
const SocietyMembership = require("../models/societyMembership.model");

const router = express.Router();
router.use(auth);

router.get("/", async (req, res) => {
  const query = {};
  if (req.query.role) query.role = req.query.role;
  if (req.query.phone) query.phone = req.query.phone;
  if (req.query.email) query.email = String(req.query.email).toLowerCase();
  const items = await User.find(query).sort({ createdAt: -1 }).lean();
  return res.json({ items });
});

router.get("/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const filter = Number.isNaN(userId) ? { _id: req.params.userId } : { userId };
  const item = await User.findOne(filter).lean();
  if (!item) return res.status(404).json({ message: "User not found" });
  return res.json({ item });
});

router.post("/", async (req, res) => {
  const required = ["fullName", "phone"];
  for (const field of required) {
    if (!req.body[field]) return res.status(400).json({ message: `${field} is required` });
  }
  const item = await User.create({
    fullName: req.body.fullName,
    phone: req.body.phone,
    email: req.body.email,
    role: req.body.role || "member",
    isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
  });
  return res.status(201).json({ message: "User created", item });
});

router.put("/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const filter = Number.isNaN(userId) ? { _id: req.params.userId } : { userId };
  const allowed = ["fullName", "phone", "email", "role", "isActive", "lastLoginAt"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const item = await User.findOneAndUpdate(filter, update, { returnDocument: "after", runValidators: true }).lean();
  if (!item) return res.status(404).json({ message: "User not found" });
  return res.json({ message: "User updated", item });
});

router.delete("/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const filter = Number.isNaN(userId) ? { _id: req.params.userId } : { userId };
  const item = await User.findOneAndDelete(filter).lean();
  if (!item) return res.status(404).json({ message: "User not found" });
  await SocietyMembership.deleteMany({ userId: item.userId });
  return res.json({ message: "User deleted", item });
});

module.exports = router;

