const express = require("express");
const auth = require("../middleware/auth");
const SocietyMembership = require("../models/societyMembership.model");
const User = require("../models/user.model");
const Society = require("../models/society.model");

const router = express.Router();
router.use(auth);

const resolveUserAndSociety = async (payload = {}) => {
  const userFilter = payload.userId ? { userId: Number(payload.userId) } : { _id: payload.userObjectId };
  const societyFilter = payload.societyId ? { societyId: Number(payload.societyId) } : { _id: payload.societyObjectId };
  const [user, society] = await Promise.all([User.findOne(userFilter), Society.findOne(societyFilter)]);
  return { user, society };
};

router.get("/", async (req, res) => {
  const query = {};
  if (req.query.societyId) query.societyId = Number(req.query.societyId);
  if (req.query.userId) query.userId = Number(req.query.userId);
  if (req.query.role) query.role = req.query.role;
  if (req.query.societyRole) query.societyRole = req.query.societyRole;
  const items = await SocietyMembership.find(query).sort({ createdAt: -1 }).lean();
  return res.json({ items });
});

router.get("/:id", async (req, res) => {
  const item = await SocietyMembership.findById(req.params.id).lean();
  if (!item) return res.status(404).json({ message: "Membership not found" });
  return res.json({ item });
});

router.post("/", async (req, res) => {
  const { userId, societyId, role, societyRole, status } = req.body;
  if (!userId || !societyId) {
    return res.status(400).json({ message: "userId and societyId are required" });
  }
  const { user, society } = await resolveUserAndSociety({ userId, societyId });
  if (!user) return res.status(404).json({ message: "User not found" });
  if (!society) return res.status(404).json({ message: "Society not found" });

  const exists = await SocietyMembership.findOne({ userId: user.userId, societyId: society.societyId }).lean();
  if (exists) return res.status(409).json({ message: "Membership already exists" });

  const item = await SocietyMembership.create({
    user: user._id,
    society: society._id,
    role: role || "member",
    societyRole: societyRole || "society member",
    status: status || "active",
  });
  return res.status(201).json({ message: "Membership created", item });
});

router.put("/:id", async (req, res) => {
  const allowed = ["role", "societyRole", "status"];
  const update = {};
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) update[key] = req.body[key];
  });
  const item = await SocietyMembership.findByIdAndUpdate(req.params.id, update, {
    returnDocument: "after",
    runValidators: true,
  }).lean();
  if (!item) return res.status(404).json({ message: "Membership not found" });
  return res.json({ message: "Membership updated", item });
});

router.delete("/:id", async (req, res) => {
  const item = await SocietyMembership.findByIdAndDelete(req.params.id).lean();
  if (!item) return res.status(404).json({ message: "Membership not found" });
  return res.json({ message: "Membership deleted", item });
});

module.exports = router;

