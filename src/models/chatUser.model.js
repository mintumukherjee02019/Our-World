const mongoose = require("mongoose");

const chatUserSchema = new mongoose.Schema(
  {
    userId: { type: Number, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    online: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ChatUser", chatUserSchema);

