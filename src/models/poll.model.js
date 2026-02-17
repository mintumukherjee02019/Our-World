const mongoose = require("mongoose");

const pollOptionSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    votes: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
);

const pollSchema = new mongoose.Schema(
  {
    question: { type: String, required: true, trim: true },
    options: { type: [pollOptionSchema], default: [] },
    active: { type: Boolean, default: true, index: true },
    votedUserIds: [{ type: Number, index: true }],
    societyId: { type: Number, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Poll", pollSchema);

