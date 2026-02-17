const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
  {
    byUserId: { type: Number, index: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

const chatThreadSchema = new mongoose.Schema(
  {
    type: { type: String, default: "group", trim: true },
    name: { type: String, required: true, trim: true },
    memberUserIds: [{ type: Number, index: true }],
    messages: [chatMessageSchema],
    societyId: { type: Number, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatThread", chatThreadSchema);

