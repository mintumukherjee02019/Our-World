const mongoose = require("mongoose");

const noticeSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    priority: { type: String, default: "Normal", trim: true },
    content: { type: String, required: true, trim: true },
    postedBy: { type: String, trim: true },
    pinned: { type: Boolean, default: false, index: true },
    attachments: [{ type: String, trim: true }],
    readBy: [{ type: Number, index: true }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notice", noticeSchema);

