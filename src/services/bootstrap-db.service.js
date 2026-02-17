const mongoose = require("mongoose");
const Society = require("../models/society.model");
const User = require("../models/user.model");
const SocietyMembership = require("../models/societyMembership.model");
const Notice = require("../models/notice.model");
const Complaint = require("../models/complaint.model");
const Payment = require("../models/payment.model");
const Poll = require("../models/poll.model");
const Event = require("../models/event.model");
const AmenityBooking = require("../models/amenityBooking.model");
const Document = require("../models/document.model");
const FeatureRequest = require("../models/featureRequest.model");
const ChatUser = require("../models/chatUser.model");
const ChatThread = require("../models/chatThread.model");

const bootstrapDb = async () => {
  if (mongoose.connection.readyState !== 1) return;

  // Ensure collections exist in MongoDB even before app usage.
  await Promise.all([
    Society.createCollection().catch(() => {}),
    User.createCollection().catch(() => {}),
    SocietyMembership.createCollection().catch(() => {}),
    Notice.createCollection().catch(() => {}),
    Complaint.createCollection().catch(() => {}),
    Payment.createCollection().catch(() => {}),
    Poll.createCollection().catch(() => {}),
    Event.createCollection().catch(() => {}),
    AmenityBooking.createCollection().catch(() => {}),
    Document.createCollection().catch(() => {}),
    FeatureRequest.createCollection().catch(() => {}),
    ChatUser.createCollection().catch(() => {}),
    ChatThread.createCollection().catch(() => {}),
  ]);

  const societyCount = await Society.countDocuments();
  const userCount = await User.countDocuments();
  const membershipCount = await SocietyMembership.countDocuments();

  if (societyCount > 0 || userCount > 0 || membershipCount > 0) return;

  // Seed one approved society and one admin user so collections are visible.
  const society = await Society.create({
    name: "Skyline Apartments",
    status: "approved",
    phone: "9876500000",
    email: "office@skyline.example",
    address: "Tower B, Main Road",
    city: "Kolkata",
    district: "Kolkata",
    state: "West Bengal",
    pincode: "700001",
  });

  const user = await User.create({
    fullName: "Abhishek",
    phone: "9876543210",
    email: "abhishek@example.com",
    role: "admin",
  });

  await SocietyMembership.create({
    user: user._id,
    society: society._id,
    role: "admin",
    societyRole: "secretary",
    status: "active",
  });
};

module.exports = {
  bootstrapDb,
};
