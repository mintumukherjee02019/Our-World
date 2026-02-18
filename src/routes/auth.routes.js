const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const Society = require("../models/society.model");
const User = require("../models/user.model");
const { getNextSequence } = require("../services/id-sequence.service");
const {
  sendOtp,
  verifyOtp,
  verifyOtpTokenForMobile,
  issueRegistrationOtpToken,
} = require("../services/otp.service");

const router = express.Router();

const ensureApprovedSocietyId = async (society) => {
  if (society?.societyId) {
    return Number(society.societyId);
  }

  const nextSocietyId = await getNextSequence("society_id_seq", 1000);
  const updated = await Society.findOneAndUpdate(
    {
      _id: society._id,
      $or: [{ societyId: { $exists: false } }, { societyId: null }],
    },
    {
      $set: { societyId: nextSocietyId, approvedAt: new Date() },
    },
    { new: true }
  )
    .select("societyId")
    .lean();

  if (updated?.societyId) {
    return Number(updated.societyId);
  }

  const fresh = await Society.findById(society._id).select("societyId").lean();
  return fresh?.societyId ? Number(fresh.societyId) : null;
};

const hasApprovedSocietyAccess = async (user) => {
  const societyIds = Array.isArray(user?.societyIds)
    ? user.societyIds.filter((id) => Number.isFinite(Number(id))).map(Number)
    : [];
  if (societyIds.length === 0) {
    return { allowed: false, normalizedSocietyIds: [] };
  }

  const approvedBySocietyId = await Society.find({
    societyId: { $in: societyIds },
    status: "approved",
  })
    .select("societyId")
    .lean();

  const approvedByRegistrationId = await Society.find({
    registrationId: { $in: societyIds },
    status: "approved",
  })
    .select("_id societyId registrationId")
    .lean();

  const normalizedSet = new Set(
    approvedBySocietyId
      .map((s) => Number(s.societyId))
      .filter((id) => Number.isFinite(id))
  );

  for (const society of approvedByRegistrationId) {
    const ensuredSocietyId = await ensureApprovedSocietyId(society);
    if (Number.isFinite(ensuredSocietyId)) {
      normalizedSet.add(ensuredSocietyId);
    }
  }

  const normalizedSocietyIds = Array.from(normalizedSet);
  if (!normalizedSocietyIds.length) {
    return { allowed: false, normalizedSocietyIds: [] };
  }

  const existing = Array.isArray(user?.societyIds)
    ? user.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  const sameLength = existing.length === normalizedSocietyIds.length;
  const sameValues = sameLength && normalizedSocietyIds.every((id) => existing.includes(id));
  if (!sameValues && user?._id) {
    await User.updateOne(
      { _id: user._id },
      { $set: { societyIds: normalizedSocietyIds } }
    );
  }

  return { allowed: true, normalizedSocietyIds };
};

router.post("/request-otp", async (req, res) => {
  try {
    const { mobile } = req.body;
    const normalizedMobile = String(mobile || "").trim();
    const existingUser = await User.findOne({ phone: normalizedMobile }).lean();
    if (!existingUser) {
      return res.status(404).json({
        code: "USER_NOT_REGISTERED",
        message: "User is not registered with us",
      });
    }

    const approvedAccess = await hasApprovedSocietyAccess(existingUser);
    if (!approvedAccess.allowed) {
      return res.status(403).json({
        code: "SOCIETY_NOT_APPROVED",
        message: "User society is not approved yet",
      });
    }

    const deviceId = req.headers["x-device-id"];
    const result = await sendOtp({ mobile: normalizedMobile, deviceId });
    return res.json({
      message: "OTP sent successfully",
      otpSent: result.otpSent,
      attemptsRemaining: result.attemptsRemaining,
      cooldownSeconds: result.cooldownSeconds,
      resetInSeconds: result.resetInSeconds,
    });
  } catch (error) {
    if (error.code === "INVALID_MOBILE") {
      return res.status(400).json({ message: "Valid mobile number is required" });
    }
    if (error.code === "INVALID_DEVICE_ID") {
      return res.status(400).json({ message: "Valid device id is required" });
    }
    if (error.code === "OTP_COOLDOWN") {
      return res.status(429).json({
        code: "OTP_COOLDOWN",
        message: "Please wait 1 minute before requesting OTP again",
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    if (error.code === "OTP_MAX_ATTEMPTS") {
      return res.status(429).json({
        code: "OTP_MAX_ATTEMPTS",
        message: "Maximum 3 OTP requests reached. Try again after 30 minutes",
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    if (error.code === "SMS_GATEWAY_NOT_CONFIGURED") {
      return res.status(503).json({ message: "OTP service unavailable" });
    }
    return res.status(500).json({ message: "OTP request failed" });
  }
});

router.post("/request-registration-otp", async (req, res) => {
  try {
    const { mobile } = req.body;
    const normalizedMobile = String(mobile || "").trim();
    const deviceId = req.headers["x-device-id"];
    const result = await sendOtp({ mobile: normalizedMobile, deviceId });
    return res.json({
      message: "OTP sent successfully",
      otpSent: result.otpSent,
      attemptsRemaining: result.attemptsRemaining,
      cooldownSeconds: result.cooldownSeconds,
      resetInSeconds: result.resetInSeconds,
    });
  } catch (error) {
    if (error.code === "INVALID_MOBILE") {
      return res.status(400).json({ message: "Valid mobile number is required" });
    }
    if (error.code === "INVALID_DEVICE_ID") {
      return res.status(400).json({ message: "Valid device id is required" });
    }
    if (error.code === "OTP_COOLDOWN") {
      return res.status(429).json({
        code: "OTP_COOLDOWN",
        message: "Please wait 1 minute before requesting OTP again",
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    if (error.code === "OTP_MAX_ATTEMPTS") {
      return res.status(429).json({
        code: "OTP_MAX_ATTEMPTS",
        message: "Maximum 3 OTP requests reached. Try again after 30 minutes",
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    if (error.code === "SMS_GATEWAY_NOT_CONFIGURED") {
      return res.status(503).json({ message: "OTP service unavailable" });
    }
    return res.status(500).json({ message: "OTP request failed" });
  }
});

router.post("/verify-otp", async (req, res) => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) {
    return res.status(400).json({ message: "Mobile and OTP are required" });
  }

  const normalizedMobile = String(mobile).trim();
  const existingUser = await User.findOne({ phone: normalizedMobile }).lean();
  if (!existingUser) {
    return res.status(404).json({
      code: "USER_NOT_REGISTERED",
      message: "User is not registered with us",
    });
  }

  const approvedAccess = await hasApprovedSocietyAccess(existingUser);
  if (!approvedAccess.allowed) {
    return res.status(403).json({
      code: "SOCIETY_NOT_APPROVED",
      message: "User society is not approved yet",
    });
  }

  try {
    await verifyOtp({ mobile: normalizedMobile, otp });
  } catch (error) {
    if (error.code === "INVALID_MOBILE" || error.code === "OTP_REQUIRED") {
      return res.status(400).json({ message: "Mobile and OTP are required" });
    }
    if (error.code === "INVALID_OTP") {
      return res.status(401).json({ message: "Invalid OTP" });
    }
    if (error.code === "SMS_GATEWAY_NOT_CONFIGURED") {
      return res.status(503).json({ message: "OTP service unavailable" });
    }
    return res.status(500).json({ message: "OTP verification failed" });
  }

  const user = {
    id: existingUser.userId ? `u_${existingUser.userId}` : String(existingUser._id),
    userId: existingUser.userId,
    name: existingUser.fullName,
    mobile: existingUser.phone,
    email: existingUser.email,
    role: existingUser.role,
    societyIds: approvedAccess.normalizedSocietyIds,
  };

  const token = jwt.sign(user, process.env.JWT_SECRET || "dev-secret", {
    expiresIn: "30d",
  });

  await User.updateOne(
    { _id: existingUser._id },
    { $set: { lastLoginAt: new Date() } }
  );

  return res.json({
    message: "Login successful",
    token,
    user,
  });
});

router.post("/verify-registration-otp", async (req, res) => {
  const { mobile, otp } = req.body;
  if (!mobile || !otp) {
    return res.status(400).json({ message: "Mobile and OTP are required" });
  }

  const normalizedMobile = String(mobile).trim();
  try {
    await verifyOtp({ mobile: normalizedMobile, otp });
  } catch (error) {
    if (error.code === "INVALID_MOBILE" || error.code === "OTP_REQUIRED") {
      return res.status(400).json({ message: "Mobile and OTP are required" });
    }
    if (error.code === "INVALID_OTP") {
      return res.status(401).json({ message: "Invalid OTP" });
    }
    if (error.code === "SMS_GATEWAY_NOT_CONFIGURED") {
      return res.status(503).json({ message: "OTP service unavailable" });
    }
    return res.status(500).json({ message: "OTP verification failed" });
  }

  const otpToken = issueRegistrationOtpToken({ mobile: normalizedMobile });
  return res.json({
    message: "OTP verified successfully",
    token: otpToken,
  });
});

router.post("/google", async (req, res) => {
  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail }).lean();
  if (!existingUser) {
    return res.status(404).json({
      code: "USER_NOT_REGISTERED",
      message: "User is not registered with us",
    });
  }

  const approvedAccess = await hasApprovedSocietyAccess(existingUser);
  if (!approvedAccess.allowed) {
    return res.status(403).json({
      code: "SOCIETY_NOT_APPROVED",
      message: "User society is not approved yet",
    });
  }

  const user = {
    id: existingUser.userId ? `u_${existingUser.userId}` : String(existingUser._id),
    userId: existingUser.userId,
    name: existingUser.fullName || name || "Google User",
    email: existingUser.email,
    mobile: existingUser.phone,
    role: existingUser.role,
    societyIds: approvedAccess.normalizedSocietyIds,
  };

  const token = jwt.sign(user, process.env.JWT_SECRET || "dev-secret", {
    expiresIn: "30d",
  });

  await User.updateOne(
    { _id: existingUser._id },
    { $set: { lastLoginAt: new Date() } }
  );

  return res.json({
    message: "Google login successful",
    token,
    user,
  });
});

router.post("/register-society", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      code: "DB_UNAVAILABLE",
      message: "Issue with DB error",
      details: "Database connection is unavailable",
    });
  }

  const requiredFields = [
    "societyName",
    "societyPhone",
    "societyEmail",
    "address",
    "city",
    "district",
    "state",
    "country",
    "pincode",
    "adminFullName",
    "adminPhone",
    "adminEmail",
    "adminRole",
    "otpToken",
  ];

  for (const field of requiredFields) {
    if (!req.body[field] || String(req.body[field]).trim() === "") {
      return res.status(400).json({
        code: "VALIDATION_ERROR",
        message: `Unable to register user due to - ${field} is required`,
      });
    }
  }

  const normalized = {
    societyName: String(req.body.societyName).trim(),
    societyPhone: String(req.body.societyPhone).trim(),
    societyEmail: String(req.body.societyEmail).trim().toLowerCase(),
    merchantId:
      req.body.merchantId === undefined || req.body.merchantId === null
        ? ""
        : String(req.body.merchantId).trim(),
    clientSecret:
      req.body.clientSecret === undefined || req.body.clientSecret === null
        ? ""
        : String(req.body.clientSecret).trim(),
    address: String(req.body.address).trim(),
    city: String(req.body.city).trim(),
    district: String(req.body.district).trim(),
    state: String(req.body.state).trim(),
    country: String(req.body.country).trim(),
    pincode: String(req.body.pincode).trim(),
    adminFullName: String(req.body.adminFullName).trim(),
    adminPhone: String(req.body.adminPhone).trim(),
    adminEmail: String(req.body.adminEmail).trim().toLowerCase(),
    adminRole: String(req.body.adminRole).trim(),
    adminIsActive: req.body.adminIsActive !== undefined ? Boolean(req.body.adminIsActive) : true,
    otpToken: String(req.body.otpToken).trim(),
  };

  if (!/^\d{10}$/.test(normalized.societyPhone)) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Unable to register user due to - societyPhone must be a 10 digit number",
    });
  }

  if (!/^\d{10}$/.test(normalized.adminPhone)) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Unable to register user due to - adminPhone must be a 10 digit number",
    });
  }

  try {
    verifyOtpTokenForMobile({
      token: normalized.otpToken,
      mobile: normalized.adminPhone,
    });
  } catch (error) {
    if (error.code === "OTP_MISMATCH") {
      return res.status(400).json({
        code: "OTP_MISMATCH",
        message: "Unable to register user due to - mobile number verification failed",
      });
    }
    return res.status(401).json({
      code: "OTP_INVALID",
      message: "Unable to register user due to - invalid or expired OTP verification",
    });
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalized.societyEmail)) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Unable to register user due to - societyEmail is invalid",
    });
  }
  if (!emailPattern.test(normalized.adminEmail)) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "Unable to register user due to - adminEmail is invalid",
    });
  }

  let createdSociety;

  try {
    const duplicateSocietyEmail = await Society.findOne({ email: normalized.societyEmail }).lean();
    if (duplicateSocietyEmail) {
      return res.status(409).json({
        code: "DUPLICATE_ENTRY",
        message: "Unable to register user due to - society email already exists",
      });
    }

    const duplicateAdminPhone = await User.findOne({ phone: normalized.adminPhone }).lean();
    if (duplicateAdminPhone) {
      return res.status(409).json({
        code: "DUPLICATE_ENTRY",
        message: "Unable to register user due to - admin phone already exists",
      });
    }

    const duplicateAdminEmail = await User.findOne({ email: normalized.adminEmail }).lean();
    if (duplicateAdminEmail) {
      return res.status(409).json({
        code: "DUPLICATE_ENTRY",
        message: "Unable to register user due to - admin email already exists",
      });
    }

    const registrationId = await getNextSequence("society_registration_seq", 100000);

    createdSociety = await Society.create({
      registrationId,
      name: normalized.societyName,
      status: "pending",
      phone: normalized.societyPhone,
      email: normalized.societyEmail,
      merchantId: normalized.merchantId || undefined,
      clientSecret: normalized.clientSecret || undefined,
      address: normalized.address,
      city: normalized.city,
      district: normalized.district,
      state: normalized.state,
      country: normalized.country,
      pincode: normalized.pincode,
    });

    const user = await User.create({
      fullName: normalized.adminFullName,
      phone: normalized.adminPhone,
      email: normalized.adminEmail,
      role: normalized.adminRole,
      isActive: normalized.adminIsActive,
      societyIds: createdSociety.societyId ? [createdSociety.societyId] : [],
    });

    return res.status(201).json({
      message: "Registration submitted for approval",
      societyRegistrationId: createdSociety.registrationId,
      society: {
        id: createdSociety._id,
        registrationId: createdSociety.registrationId,
        societyId: createdSociety.societyId,
        name: createdSociety.name,
        status: createdSociety.status,
      },
      user: {
        id: user._id,
        userId: user.userId,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    if (createdSociety?._id) {
      await Society.deleteOne({ _id: createdSociety._id });
    }

    if (error && error.code === 11000) {
      const key = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(409).json({
        code: "DUPLICATE_ENTRY",
        message: `Unable to register user due to - duplicate ${key}`,
      });
    }

    return res.status(500).json({
      code: "DB_QUERY_ERROR",
      message: "Issue with DB error",
      details: error.message || "Unknown database query failure",
    });
  }
});

module.exports = router;
