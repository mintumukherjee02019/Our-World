const mongoose = require("mongoose");

const amenityBookingSchema = new mongoose.Schema(
  {
    amenity: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true, index: true },
    slot: { type: String, required: true, trim: true },
    status: { type: String, default: "Pending Approval", index: true },
    requestedByUserId: { type: Number, index: true },
    societyId: { type: Number, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AmenityBooking", amenityBookingSchema);

