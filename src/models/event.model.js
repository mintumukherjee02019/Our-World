const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true, index: true },
    time: { type: String, required: true, trim: true },
    venue: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    rsvpCount: { type: Number, default: 0, min: 0 },
    societyId: { type: Number, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Event", eventSchema);

