const mongoose = require("mongoose");
const { getNextSequence } = require("../services/id-sequence.service");

const SOCIETY_STATUSES = ["pending", "approved", "rejected", "suspended"];

const societySchema = new mongoose.Schema(
  {
    registrationId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },
    societyId: {
      type: Number,
      unique: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: SOCIETY_STATUSES,
      default: "pending",
      index: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    district: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
      default: "India",
    },
    pincode: {
      type: String,
      trim: true,
    },
    approvedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

societySchema.pre("save", async function societyPreSave() {
  if (!this.societyId) {
    this.societyId = await getNextSequence("society_id_seq", 1000);
  }
  if (this.status === "approved") {
    this.approvedAt = this.approvedAt || new Date();
  }
});

societySchema.pre("findOneAndUpdate", async function societyPreUpdate() {
  const update = this.getUpdate() || {};
  const nextStatus = update.status || (update.$set && update.$set.status);
  if (nextStatus !== "approved") return;

  const currentDoc = await this.model.findOne(this.getQuery()).select("societyId approvedAt").lean();
  if (!currentDoc || currentDoc.societyId) return;

  const societyId = await getNextSequence("society_id_seq", 1000);
  if (!update.$set) update.$set = {};
  update.$set.societyId = societyId;
  update.$set.approvedAt = currentDoc.approvedAt || new Date();
  this.setUpdate(update);
});

module.exports = mongoose.model("Society", societySchema);
