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
  if (req.query.societyId !== undefined) {
    const societyId = Number(req.query.societyId);
    if (Number.isNaN(societyId)) {
      return res.status(400).json({ message: "societyId must be a number" });
    }
    query.societyIds = societyId;
  } else if (Number.isFinite(Number(req.selectedSocietyId))) {
    query.societyIds = Number(req.selectedSocietyId);
  }
  const items = await User.find(query).sort({ createdAt: -1 }).lean();
  return res.json({ items });
});

router.get("/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const filter = Number.isNaN(userId) ? { _id: req.params.userId } : { userId };
  const item = await User.findOne(filter).lean();
  if (!item) return res.status(404).json({ message: "User not found" });
  if (
    Number.isFinite(Number(req.selectedSocietyId)) &&
    !((item.societyIds || []).map((id) => Number(id)).includes(Number(req.selectedSocietyId)))
  ) {
    return res.status(404).json({ message: "User not found" });
  }
  return res.json({ item });
});

router.post("/", async (req, res) => {
  const required = ["fullName", "phone"];
  for (const field of required) {
    if (!req.body[field]) return res.status(400).json({ message: `${field} is required` });
  }
  const normalizedPhone = String(req.body.phone).trim();
  const normalizedEmail = req.body.email ? String(req.body.email).trim().toLowerCase() : "";
  const normalizedName = String(req.body.fullName).trim();

  if (!/^\d{10}$/.test(normalizedPhone)) {
    return res.status(400).json({ message: "phone must be a 10 digit number" });
  }

  if (normalizedEmail) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email" });
    }
  }

  const existingPhone = await User.findOne({ phone: normalizedPhone }).lean();
  if (existingPhone) {
    return res.status(409).json({ message: "Phone already exists" });
  }
  if (normalizedEmail) {
    const existingEmail = await User.findOne({ email: normalizedEmail }).lean();
    if (existingEmail) {
      return res.status(409).json({ message: "Email already exists" });
    }
  }

  const requestedSocietyIds = Array.isArray(req.body.societyIds)
    ? req.body.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const selectedSocietyId = Number.isFinite(Number(req.selectedSocietyId))
    ? Number(req.selectedSocietyId)
    : null;
  const tokenSocietyIds = Array.isArray(req.user?.societyIds)
    ? req.user.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const normalizedSocietyIds = requestedSocietyIds.length > 0
    ? requestedSocietyIds
    : selectedSocietyId !== null
      ? [selectedSocietyId]
      : tokenSocietyIds;

  try {
    const item = await User.create({
      fullName: normalizedName,
      phone: normalizedPhone,
      email: normalizedEmail || undefined,
      role: req.body.role || "member",
      societyRole: req.body.societyRole,
      societyIds: normalizedSocietyIds,
      isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
    });
    return res.status(201).json({ message: "User created", item });
  } catch (error) {
    if (error && error.code === 11000) {
      return res.status(409).json({ message: "User already exists" });
    }
    return res.status(500).json({ message: "Unable to create user" });
  }
});

router.put("/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const filter = Number.isNaN(userId) ? { _id: req.params.userId } : { userId };
  const allowed = ["fullName", "phone", "email", "role", "societyRole", "isActive", "lastLoginAt"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const existing = await User.findOne(filter).lean();
  if (!existing) return res.status(404).json({ message: "User not found" });
  if (
    Number.isFinite(Number(req.selectedSocietyId)) &&
    !((existing.societyIds || []).map((id) => Number(id)).includes(Number(req.selectedSocietyId)))
  ) {
    return res.status(404).json({ message: "User not found" });
  }
  const item = await User.findOneAndUpdate(filter, update, { returnDocument: "after", runValidators: true }).lean();
  if (!item) return res.status(404).json({ message: "User not found" });
  return res.json({ message: "User updated", item });
});

router.delete("/:userId", async (req, res) => {
  const userId = Number(req.params.userId);
  const filter = Number.isNaN(userId) ? { _id: req.params.userId } : { userId };
  const existing = await User.findOne(filter).lean();
  if (!existing) return res.status(404).json({ message: "User not found" });
  if (
    Number.isFinite(Number(req.selectedSocietyId)) &&
    !((existing.societyIds || []).map((id) => Number(id)).includes(Number(req.selectedSocietyId)))
  ) {
    return res.status(404).json({ message: "User not found" });
  }
  const item = await User.findOneAndDelete(filter).lean();
  if (!item) return res.status(404).json({ message: "User not found" });
  await SocietyMembership.deleteMany({ userId: item.userId });
  return res.json({ message: "User deleted", item });
});

module.exports = router;
