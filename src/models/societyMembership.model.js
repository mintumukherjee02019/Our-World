const mongoose = require("mongoose");
const { USER_ROLES, SOCIETY_ROLES } = require("../constants/roles");
const Society = require("./society.model");
const User = require("./user.model");
const { getNextSequence } = require("../services/id-sequence.service");

const MEMBERSHIP_STATUSES = ["active", "inactive", "pending"];

const societyMembershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    society: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Society",
      required: true,
      index: true,
    },
    userId: {
      type: Number,
      required: true,
      index: true,
    },
    societyId: {
      type: Number,
      required: true,
      index: true,
    },
    societyUserId: {
      type: Number,
      required: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: "member",
      index: true,
    },
    societyRole: {
      type: String,
      enum: SOCIETY_ROLES,
      default: "society member",
      index: true,
    },
    status: {
      type: String,
      enum: MEMBERSHIP_STATUSES,
      default: "active",
      index: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

societyMembershipSchema.index({ user: 1, society: 1 }, { unique: true });
societyMembershipSchema.index({ society: 1, societyUserId: 1 }, { unique: true });

societyMembershipSchema.pre("validate", async function membershipPreValidate() {
  if (!this.isNew) return;

  const [society, user] = await Promise.all([
    Society.findById(this.society).select("societyId status").lean(),
    User.findById(this.user).select("userId").lean(),
  ]);

  if (!society) throw new Error("Society not found");
  if (society.status !== "approved" || !society.societyId) {
    throw new Error("Society must be approved before adding members");
  }
  if (!user) throw new Error("User not found");

  this.societyId = society.societyId;
  this.userId = user.userId;

  if (!this.societyUserId) {
    const seqKey = `society_${society.societyId}_member_seq`;
    this.societyUserId = await getNextSequence(seqKey, 1);
  }
});

societyMembershipSchema.post("save", async function membershipPostSave() {
  await User.updateOne(
    { _id: this.user },
    {
      $addToSet: { societyIds: this.societyId },
      $set: { role: this.role },
    }
  );
});

societyMembershipSchema.post("findOneAndDelete", async function membershipPostDelete(doc) {
  if (!doc) return;
  const hasMembership = await this.model.exists({
    user: doc.user,
    societyId: doc.societyId,
  });
  if (!hasMembership) {
    await User.updateOne({ _id: doc.user }, { $pull: { societyIds: doc.societyId } });
  }
});

module.exports = mongoose.model("SocietyMembership", societyMembershipSchema);
