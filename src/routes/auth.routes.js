const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

router.post("/request-otp", (req, res) => {
  const { mobile } = req.body;
  if (!mobile || String(mobile).length < 10) {
    return res.status(400).json({ message: "Valid mobile number is required" });
  }

  return res.json({
    message: "OTP sent successfully",
    otpSent: true,
  });
});

router.post("/verify-otp", (req, res) => {
  const { mobile, otp } = req.body;
  const expectedOtp = process.env.FAKE_OTP || "123456";

  if (!mobile || !otp) {
    return res.status(400).json({ message: "Mobile and OTP are required" });
  }

  if (String(otp) !== String(expectedOtp)) {
    return res.status(401).json({ message: "Invalid OTP" });
  }

  const user = {
    id: "u_1001",
    name: "Abhishek",
    mobile: String(mobile),
    societyName: "Skyline Apartments",
    tower: "Tower B",
    flat: "1204",
  };

  const token = jwt.sign(user, process.env.JWT_SECRET || "dev-secret", {
    expiresIn: "7d",
  });

  return res.json({
    message: "Login successful",
    token,
    user,
  });
});

router.post("/google", (req, res) => {
  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  const user = {
    id: "u_google_1001",
    name: name || "Google User",
    email: String(email),
    societyName: "Skyline Apartments",
    tower: "Tower B",
    flat: "1204",
  };

  const token = jwt.sign(user, process.env.JWT_SECRET || "dev-secret", {
    expiresIn: "7d",
  });

  return res.json({
    message: "Google login successful",
    token,
    user,
  });
});

module.exports = router;
