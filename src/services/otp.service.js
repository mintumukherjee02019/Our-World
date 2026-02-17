const jwt = require("jsonwebtoken");

const OTP_MODE = (process.env.OTP_MODE || "mock").toLowerCase();
const MOCK_OTP = process.env.FAKE_OTP || "123456";
const OTP_COOLDOWN_MS = 60 * 1000;
const OTP_WINDOW_MS = 30 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 3;
const OTP_REG_TOKEN_TTL = process.env.OTP_REG_TOKEN_TTL || "30m";

const otpAttemptStore = new Map();

const isValidMobile = (mobile) => /^\d{10}$/.test(String(mobile || ""));
const isValidDeviceId = (deviceId) => String(deviceId || "").trim().length >= 6;

const getStoreKey = ({ deviceId, mobile }) => `${String(deviceId).trim()}::${String(mobile).trim()}`;

const cleanupAndGetState = ({ deviceId, mobile }) => {
  const now = Date.now();
  const key = getStoreKey({ deviceId, mobile });
  const current = otpAttemptStore.get(key);

  if (!current) {
    return { key, now, state: null };
  }

  if (now - current.windowStartedAt >= OTP_WINDOW_MS) {
    otpAttemptStore.delete(key);
    return { key, now, state: null };
  }

  return { key, now, state: current };
};

const sendOtp = async ({ mobile, deviceId }) => {
  if (!isValidMobile(mobile)) {
    const error = new Error("Valid mobile number is required");
    error.code = "INVALID_MOBILE";
    throw error;
  }
  if (!isValidDeviceId(deviceId)) {
    const error = new Error("Valid device id is required");
    error.code = "INVALID_DEVICE_ID";
    throw error;
  }

  const { key, now, state } = cleanupAndGetState({ deviceId, mobile });

  if (state && now - state.lastSentAt < OTP_COOLDOWN_MS) {
    const error = new Error("Please wait before requesting OTP again");
    error.code = "OTP_COOLDOWN";
    error.retryAfterSeconds = Math.ceil((OTP_COOLDOWN_MS - (now - state.lastSentAt)) / 1000);
    throw error;
  }

  if (state && state.attempts >= OTP_MAX_ATTEMPTS) {
    const error = new Error("Maximum OTP requests reached");
    error.code = "OTP_MAX_ATTEMPTS";
    error.retryAfterSeconds = Math.ceil((OTP_WINDOW_MS - (now - state.windowStartedAt)) / 1000);
    throw error;
  }

  if (OTP_MODE === "mock") {
    const next = state
      ? {
          attempts: state.attempts + 1,
          windowStartedAt: state.windowStartedAt,
          lastSentAt: now,
        }
      : {
          attempts: 1,
          windowStartedAt: now,
          lastSentAt: now,
        };
    otpAttemptStore.set(key, next);
    return {
      otpSent: true,
      provider: "mock",
      attemptsUsed: next.attempts,
      attemptsRemaining: Math.max(OTP_MAX_ATTEMPTS - next.attempts, 0),
      resetInSeconds: Math.ceil((OTP_WINDOW_MS - (now - next.windowStartedAt)) / 1000),
      cooldownSeconds: Math.ceil(OTP_COOLDOWN_MS / 1000),
    };
  }

  // Placeholder for SMS gateway integration.
  // Replace this block with provider SDK/API call (Twilio, MSG91, etc).
  // Keep the same return shape so routes do not change.
  throw Object.assign(new Error("SMS gateway not configured"), {
    code: "SMS_GATEWAY_NOT_CONFIGURED",
  });
};

const verifyOtp = async ({ mobile, otp }) => {
  if (!isValidMobile(mobile)) {
    const error = new Error("Valid mobile number is required");
    error.code = "INVALID_MOBILE";
    throw error;
  }

  if (!otp) {
    const error = new Error("OTP is required");
    error.code = "OTP_REQUIRED";
    throw error;
  }

  if (OTP_MODE === "mock") {
    if (String(otp) !== String(MOCK_OTP)) {
      const error = new Error("Invalid OTP");
      error.code = "INVALID_OTP";
      throw error;
    }
    return { verified: true };
  }

  // Placeholder for SMS gateway verification.
  // Should return a signed token after provider-side OTP verification succeeds.
  throw Object.assign(new Error("SMS gateway not configured"), {
    code: "SMS_GATEWAY_NOT_CONFIGURED",
  });
};

const verifyOtpTokenForMobile = ({ token, mobile }) => {
  if (!token) {
    const error = new Error("OTP verification token is required");
    error.code = "OTP_TOKEN_REQUIRED";
    throw error;
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
  } catch (_) {
    const error = new Error("Invalid or expired OTP verification");
    error.code = "INVALID_OTP_TOKEN";
    throw error;
  }

  if (payload.type !== "otp_registration") {
    const error = new Error("Invalid OTP verification token type");
    error.code = "INVALID_OTP_TOKEN";
    throw error;
  }

  if (String(payload.mobile || "") !== String(mobile)) {
    const error = new Error("Mobile number verification failed");
    error.code = "OTP_MISMATCH";
    throw error;
  }

  return payload;
};

const issueRegistrationOtpToken = ({ mobile }) =>
  jwt.sign(
    {
      type: "otp_registration",
      mobile: String(mobile || "").trim(),
    },
    process.env.JWT_SECRET || "dev-secret",
    {
      expiresIn: OTP_REG_TOKEN_TTL,
    }
  );

module.exports = {
  sendOtp,
  verifyOtp,
  verifyOtpTokenForMobile,
  issueRegistrationOtpToken,
};
