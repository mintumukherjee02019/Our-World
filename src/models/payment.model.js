const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    month: { type: String, required: true, trim: true, index: true },
    dueDate: { type: Date },
    status: { type: String, default: "Pending", index: true },
    paidAt: { type: Date },
    transactionRef: { type: String, trim: true },
    societyId: { type: Number, index: true },
    userId: { type: Number, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);

