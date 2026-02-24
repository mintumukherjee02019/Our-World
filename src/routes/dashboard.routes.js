const express = require("express");
const auth = require("../middleware/auth");
const dashboardPayload = require("../data/dashboard");
const User = require("../models/user.model");
const Society = require("../models/society.model");

const router = express.Router();

const formatSocietyAddress = (society) => {
  const parts = [
    society.address,
    society.city,
    society.district,
    society.state,
    society.country,
    society.pincode,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return parts.join(", ");
};

router.get("/", auth, async (req, res) => {
  const residentName = String(
    req.user?.name || dashboardPayload.header.residentName || ""
  ).trim();

  let societyIds = Array.isArray(req.user?.societyIds)
    ? req.user.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];

  const userFilter = req.user?.userId
    ? { userId: Number(req.user.userId) }
    : req.user?.mobile
      ? { phone: String(req.user.mobile).trim() }
      : null;

  if (userFilter) {
    const user = await User.findOne(userFilter).select("societyIds").lean();
    if (user && Array.isArray(user.societyIds)) {
      societyIds = user.societyIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id));
    }
  }

  const societiesFromDb = societyIds.length
    ? await Society.find({ societyId: { $in: societyIds } })
        .select("societyId name address city district state country pincode")
        .lean()
    : [];

  const societyMap = new Map(
    societiesFromDb
      .filter((society) => Number.isFinite(Number(society.societyId)))
      .map((society) => [Number(society.societyId), society])
  );

  const orderedSocieties = societyIds
    .map((id) => societyMap.get(id))
    .filter(Boolean)
    .map((society) => ({
      societyId: Number(society.societyId),
      name: String(society.name || dashboardPayload.header.societyName),
      address: formatSocietyAddress(society) || dashboardPayload.header.address,
    }));

  const selectedSociety = orderedSocieties.find(
    (society) => Number(society.societyId) === Number(req.selectedSocietyId)
  ) || orderedSocieties[0];
  const dashboard = {
    ...dashboardPayload,
    header: {
      ...dashboardPayload.header,
      residentName: residentName || dashboardPayload.header.residentName,
      societyName: selectedSociety?.name || dashboardPayload.header.societyName,
      address: selectedSociety?.address || dashboardPayload.header.address,
      selectedSocietyId: selectedSociety?.societyId || null,
      societies:
        orderedSocieties.length > 0
          ? orderedSocieties
          : [
              {
                societyId: null,
                name: dashboardPayload.header.societyName,
                address: dashboardPayload.header.address,
              },
            ],
    },
  };

  return res.json({
    user: req.user,
    dashboard,
  });
});

module.exports = router;
