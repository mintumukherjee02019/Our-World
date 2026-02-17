const mongoose = require("mongoose");

const phase1StateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    data: { type: Object, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Phase1State", phase1StateSchema);

