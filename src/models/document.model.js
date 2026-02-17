const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true, index: true },
    fileType: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    societyId: { type: Number, index: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Document", documentSchema);

