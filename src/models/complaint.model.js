const mongoose = require("mongoose");

const complaintCommentSchema = new mongoose.Schema(
  {
    byUserId: { type: Number, index: true },
    by: { type: String, trim: true },
    message: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const complaintSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    details: { type: String, required: true, trim: true },
    status: { type: String, default: "Open", index: true },
    assignedTo: { type: String, trim: true },
    createdByUserId: { type: Number, index: true },
    societyId: { type: Number, index: true },
    comments: [complaintCommentSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Complaint", complaintSchema);

