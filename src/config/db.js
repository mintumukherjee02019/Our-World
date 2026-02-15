const mongoose = require("mongoose");

const connectDb = async () => {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.warn("MONGODB_URI is not set. Running without DB connection.");
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.log("MongoDB connected");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
  }
};

module.exports = connectDb;

