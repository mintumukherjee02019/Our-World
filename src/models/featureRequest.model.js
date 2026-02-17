const mongoose = require("mongoose");

const featureRequestSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    status: { type: String, default: "Submitted", index: true },
    attachmentUrl: { type: String, trim: true },
    createdByUserId: { type: Number, index: true },
    societyId: { type: Number, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("FeatureRequest", featureRequestSchema);

