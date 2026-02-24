const mongoose = require("mongoose");
const { USER_ROLES } = require("../constants/roles");
const { getNextSequence } = require("../services/id-sequence.service");

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      index: true,
    },
    flat: {
      type: String,
      trim: true,
    },
    residenceDetails: {
      type: String,
      trim: true,
    },
    about: {
      type: String,
      trim: true,
    },
    emergencyContactName: {
      type: String,
      trim: true,
    },
    emergencyContactPhone: {
      type: String,
      trim: true,
    },
    profilePhoto: {
      type: String,
      trim: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "member",
      index: true,
    },
    societyRole: {
      type: String,
      trim: true,
    },
    societyIds: [
      {
        type: Number,
        index: true,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

userSchema.pre("save", async function userPreSave() {
  if (!this.userId) {
    this.userId = await getNextSequence("user_id_seq", 1000);
  }
});

module.exports = mongoose.model("User", userSchema);
