const jwt = require("jsonwebtoken");

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    req.user = payload;

    const selectedSocietyHeader = req.headers["x-society-id"];
    if (selectedSocietyHeader !== undefined) {
      const selectedSocietyId = Number(selectedSocietyHeader);
      if (!Number.isFinite(selectedSocietyId)) {
        return res.status(400).json({ message: "x-society-id must be a number" });
      }
      const allowedSocietyIds = Array.isArray(payload?.societyIds)
        ? payload.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      if (allowedSocietyIds.length > 0 && !allowedSocietyIds.includes(selectedSocietyId)) {
        return res.status(403).json({ message: "Selected society is not allowed for this user" });
      }
      req.selectedSocietyId = selectedSocietyId;
    } else {
      const allowedSocietyIds = Array.isArray(payload?.societyIds)
        ? payload.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
        : [];
      req.selectedSocietyId = allowedSocietyIds.length > 0 ? allowedSocietyIds[0] : null;
    }

    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = auth;
