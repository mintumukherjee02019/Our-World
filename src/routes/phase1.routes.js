const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const User = require("../models/user.model");
const { getLiveStore, createId, nowIso } = require("../data/phase1-store");
const { persistPhase1State } = require("../services/phase1-state.service");
const { verifyOtpTokenForMobile } = require("../services/otp.service");

const router = express.Router();
router.use(auth);

const getStore = () => getLiveStore();
const parseBool = (value, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true";
};

const touch = (item) => {
  item.updatedAt = nowIso();
  return item;
};

const removeById = (list, id) => {
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const [removed] = list.splice(index, 1);
  return removed;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;

const resolveUserFilterFromToken = (tokenUser = {}) => {
  if (Number.isFinite(Number(tokenUser.userId))) {
    return { userId: Number(tokenUser.userId) };
  }
  const id = String(tokenUser.id || "").trim();
  const userIdFromPrefixedId = id.startsWith("u_") ? Number(id.slice(2)) : NaN;
  if (Number.isFinite(userIdFromPrefixedId)) {
    return { userId: userIdFromPrefixedId };
  }
  if (mongoose.Types.ObjectId.isValid(id)) {
    return { _id: id };
  }
  return null;
};

const getBase64Payload = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  const base64 = text.includes(",") ? text.split(",").pop() : text;
  return String(base64 || "").trim();
};

const getDecodedByteSize = (base64Value = "") => {
  try {
    return Buffer.from(base64Value, "base64").length;
  } catch (_) {
    return 0;
  }
};

// Dashboard
router.get("/dashboard", (req, res) => {
  const store = getStore();
  const pendingPayments = store.payments.filter((p) => p.status === "Pending").length;
  const openComplaints = store.complaints.filter((c) => c.status === "Open").length;
  const activeNotices = store.notices.length;
  const bookings = store.amenityBookings.length;
  return res.json({
    stats: { pendingPayments, openComplaints, activeNotices, bookings },
  });
});

// Notices CRUD
router.get("/notices", (req, res) => {
  const store = getStore();
  const category = req.query.category;
  let notices = store.notices;
  if (category && category !== "All") {
    notices = notices.filter((n) => n.category.toLowerCase() === String(category).toLowerCase());
  }
  return res.json({ items: notices });
});

router.get("/notices/:id", (req, res) => {
  const item = getStore().notices.find((n) => n.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Notice not found" });
  return res.json({ item });
});

router.post("/notices", async (req, res) => {
  const { title, category, content, priority, pinned, attachments } = req.body;
  if (!title || !category || !content) {
    return res.status(400).json({ message: "title, category, content are required" });
  }
  const item = {
    id: createId("n"),
    title,
    category,
    content,
    priority: priority || "Normal",
    postedBy: req.user.name || "Society Admin",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    pinned: parseBool(pinned, false),
    attachments: Array.isArray(attachments) ? attachments : [],
    readBy: [],
  };
  getStore().notices.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Notice created", item });
});

router.put("/notices/:id", async (req, res) => {
  const item = getStore().notices.find((n) => n.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Notice not found" });
  const allowed = ["title", "category", "content", "priority", "pinned", "attachments"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) {
      item[key] = key === "pinned" ? parseBool(req.body[key], item.pinned) : req.body[key];
    }
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Notice updated", item });
});

router.delete("/notices/:id", async (req, res) => {
  const removed = removeById(getStore().notices, req.params.id);
  if (!removed) return res.status(404).json({ message: "Notice not found" });
  await persistPhase1State();
  return res.json({ message: "Notice deleted", item: removed });
});

router.post("/notices/:id/read", async (req, res) => {
  const notice = getStore().notices.find((n) => n.id === req.params.id);
  if (!notice) return res.status(404).json({ message: "Notice not found" });
  if (!notice.readBy.includes(req.user.id)) notice.readBy.push(req.user.id);
  touch(notice);
  await persistPhase1State();
  return res.json({ message: "Marked as read", item: notice });
});

// Payments CRUD + pay + receipt
router.get("/payments", (req, res) => {
  return res.json({ items: getStore().payments });
});

router.get("/payments/:id", (req, res) => {
  const item = getStore().payments.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Payment not found" });
  return res.json({ item });
});

router.post("/payments", async (req, res) => {
  const { type, amount, month, dueDate, status } = req.body;
  if (!type || amount === undefined || !month) {
    return res.status(400).json({ message: "type, amount, month are required" });
  }
  const item = {
    id: createId("p"),
    type,
    amount: Number(amount),
    month,
    dueDate: dueDate || null,
    status: status || "Pending",
    paidAt: null,
    transactionRef: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().payments.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Payment created", item });
});

router.put("/payments/:id", async (req, res) => {
  const item = getStore().payments.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Payment not found" });
  const allowed = ["type", "amount", "month", "dueDate", "status"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) item[key] = key === "amount" ? Number(req.body[key]) : req.body[key];
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Payment updated", item });
});

router.delete("/payments/:id", async (req, res) => {
  const removed = removeById(getStore().payments, req.params.id);
  if (!removed) return res.status(404).json({ message: "Payment not found" });
  await persistPhase1State();
  return res.json({ message: "Payment deleted", item: removed });
});

router.post("/payments/:id/pay", async (req, res) => {
  const payment = getStore().payments.find((p) => p.id === req.params.id);
  if (!payment) return res.status(404).json({ message: "Payment not found" });
  payment.status = "Paid";
  payment.paidAt = nowIso();
  payment.transactionRef = `TXN-OW-${Math.floor(Math.random() * 1e5)}`;
  touch(payment);
  await persistPhase1State();
  return res.json({ message: "Payment successful", item: payment });
});

router.get("/payments/:id/receipt", (req, res) => {
  const payment = getStore().payments.find((p) => p.id === req.params.id);
  if (!payment) return res.status(404).json({ message: "Payment not found" });
  return res.json({
    receipt: {
      receiptNo: `RCPT-${payment.id.toUpperCase()}`,
      amount: payment.amount,
      paidAt: payment.paidAt,
      transactionRef: payment.transactionRef,
      month: payment.month,
      type: payment.type,
    },
  });
});

// Complaints CRUD + comments CRUD
router.get("/complaints", (req, res) => {
  const status = req.query.status;
  let items = getStore().complaints;
  if (status && status !== "All") {
    items = items.filter((c) => c.status.toLowerCase() === String(status).toLowerCase());
  }
  return res.json({ items });
});

router.get("/complaints/:id", (req, res) => {
  const item = getStore().complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  return res.json({ item });
});

router.post("/complaints", async (req, res) => {
  const { title, category, details, assignedTo, status } = req.body;
  if (!title || !category || !details) {
    return res.status(400).json({ message: "title, category, details are required" });
  }
  const item = {
    id: createId("c"),
    title,
    category,
    details,
    status: status || "Open",
    assignedTo: assignedTo || "Pending Assignment",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: req.user.id,
    comments: [],
  };
  getStore().complaints.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Complaint submitted", item });
});

router.put("/complaints/:id", async (req, res) => {
  const item = getStore().complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  const allowed = ["title", "category", "details", "status", "assignedTo"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Complaint updated", item });
});

router.patch("/complaints/:id/status", async (req, res) => {
  const item = getStore().complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  if (!req.body.status) return res.status(400).json({ message: "status is required" });
  item.status = req.body.status;
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Complaint status updated", item });
});

router.delete("/complaints/:id", async (req, res) => {
  const removed = removeById(getStore().complaints, req.params.id);
  if (!removed) return res.status(404).json({ message: "Complaint not found" });
  await persistPhase1State();
  return res.json({ message: "Complaint deleted", item: removed });
});

router.get("/complaints/:id/comments", (req, res) => {
  const item = getStore().complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  return res.json({ items: item.comments || [] });
});

router.post("/complaints/:id/comments", async (req, res) => {
  const item = getStore().complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  const { message } = req.body;
  if (!message) return res.status(400).json({ message: "message is required" });
  const comment = {
    id: createId("cc"),
    by: req.user.name || "Resident",
    byUserId: req.user.id,
    message,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  item.comments.push(comment);
  touch(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Comment added", item: comment });
});

router.put("/complaints/:id/comments/:commentId", async (req, res) => {
  const complaint = getStore().complaints.find((c) => c.id === req.params.id);
  if (!complaint) return res.status(404).json({ message: "Complaint not found" });
  const comment = (complaint.comments || []).find((c) => c.id === req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (!req.body.message) return res.status(400).json({ message: "message is required" });
  comment.message = req.body.message;
  comment.updatedAt = nowIso();
  touch(complaint);
  await persistPhase1State();
  return res.json({ message: "Comment updated", item: comment });
});

router.delete("/complaints/:id/comments/:commentId", async (req, res) => {
  const complaint = getStore().complaints.find((c) => c.id === req.params.id);
  if (!complaint) return res.status(404).json({ message: "Complaint not found" });
  const removed = removeById(complaint.comments || [], req.params.commentId);
  if (!removed) return res.status(404).json({ message: "Comment not found" });
  touch(complaint);
  await persistPhase1State();
  return res.json({ message: "Comment deleted", item: removed });
});

// Polls CRUD + vote
router.get("/polls", (req, res) => {
  return res.json({ items: getStore().polls });
});

router.get("/polls/:id", (req, res) => {
  const item = getStore().polls.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Poll not found" });
  return res.json({ item });
});

router.post("/polls", async (req, res) => {
  const { question, options, active } = req.body;
  if (!question || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ message: "question and at least 2 options are required" });
  }
  const item = {
    id: createId("poll"),
    question,
    options: options.map((opt) => ({
      id: createId("opt"),
      label: String(opt.label || opt).trim(),
      votes: Number(opt.votes || 0),
    })),
    active: parseBool(active, true),
    votedUserIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().polls.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Poll created", item });
});

router.put("/polls/:id", async (req, res) => {
  const item = getStore().polls.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Poll not found" });
  if (req.body.question !== undefined) item.question = req.body.question;
  if (req.body.active !== undefined) item.active = parseBool(req.body.active, item.active);
  if (Array.isArray(req.body.options) && req.body.options.length >= 2) {
    item.options = req.body.options.map((opt) => ({
      id: opt.id || createId("opt"),
      label: String(opt.label || "").trim(),
      votes: Number(opt.votes || 0),
    }));
  }
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Poll updated", item });
});

router.delete("/polls/:id", async (req, res) => {
  const removed = removeById(getStore().polls, req.params.id);
  if (!removed) return res.status(404).json({ message: "Poll not found" });
  await persistPhase1State();
  return res.json({ message: "Poll deleted", item: removed });
});

router.post("/polls/:id/vote", async (req, res) => {
  const poll = getStore().polls.find((p) => p.id === req.params.id);
  if (!poll) return res.status(404).json({ message: "Poll not found" });
  const { optionId } = req.body;
  const option = poll.options.find((o) => o.id === optionId);
  if (!option) return res.status(400).json({ message: "Invalid option" });
  if (poll.votedUserIds.includes(req.user.id)) {
    return res.status(409).json({ message: "Already voted" });
  }
  option.votes += 1;
  poll.votedUserIds.push(req.user.id);
  touch(poll);
  await persistPhase1State();
  return res.json({ message: "Vote submitted", item: poll });
});

// Events CRUD + RSVP
router.get("/events", (req, res) => {
  return res.json({ items: getStore().events });
});

router.get("/events/:id", (req, res) => {
  const item = getStore().events.find((e) => e.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Event not found" });
  return res.json({ item });
});

router.post("/events", async (req, res) => {
  const { title, date, time, venue, description } = req.body;
  if (!title || !date || !time || !venue) {
    return res.status(400).json({ message: "title, date, time, venue are required" });
  }
  const item = {
    id: createId("e"),
    title,
    date,
    time,
    venue,
    description: description || "",
    rsvpCount: 0,
    userRsvp: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().events.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Event created", item });
});

router.put("/events/:id", async (req, res) => {
  const item = getStore().events.find((e) => e.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Event not found" });
  const allowed = ["title", "date", "time", "venue", "description", "rsvpCount", "userRsvp"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) {
      item[key] = key === "userRsvp" ? parseBool(req.body[key], item.userRsvp) : req.body[key];
    }
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Event updated", item });
});

router.delete("/events/:id", async (req, res) => {
  const removed = removeById(getStore().events, req.params.id);
  if (!removed) return res.status(404).json({ message: "Event not found" });
  await persistPhase1State();
  return res.json({ message: "Event deleted", item: removed });
});

router.post("/events/:id/rsvp", async (req, res) => {
  const event = getStore().events.find((e) => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: "Event not found" });
  if (!event.userRsvp) {
    event.userRsvp = true;
    event.rsvpCount += 1;
    touch(event);
    await persistPhase1State();
  }
  return res.json({ message: "RSVP confirmed", item: event });
});

// Amenity bookings CRUD
router.get("/bookings", (req, res) => {
  return res.json({ items: getStore().amenityBookings });
});

router.get("/bookings/:id", (req, res) => {
  const item = getStore().amenityBookings.find((b) => b.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Booking not found" });
  return res.json({ item });
});

router.post("/bookings", async (req, res) => {
  const { amenity, date, slot, status } = req.body;
  if (!amenity || !date || !slot) {
    return res.status(400).json({ message: "amenity, date, slot are required" });
  }
  const item = {
    id: createId("b"),
    amenity,
    date,
    slot,
    status: status || "Pending Approval",
    requestedBy: req.user.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().amenityBookings.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Booking request submitted", item });
});

router.put("/bookings/:id", async (req, res) => {
  const item = getStore().amenityBookings.find((b) => b.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Booking not found" });
  const allowed = ["amenity", "date", "slot", "status"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Booking updated", item });
});

router.delete("/bookings/:id", async (req, res) => {
  const removed = removeById(getStore().amenityBookings, req.params.id);
  if (!removed) return res.status(404).json({ message: "Booking not found" });
  await persistPhase1State();
  return res.json({ message: "Booking deleted", item: removed });
});

// Documents CRUD
router.get("/documents", (req, res) => {
  return res.json({ items: getStore().documents });
});

router.get("/documents/:id", (req, res) => {
  const item = getStore().documents.find((d) => d.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Document not found" });
  return res.json({ item });
});

router.post("/documents", async (req, res) => {
  const { title, category, fileType, url } = req.body;
  if (!title || !category || !fileType || !url) {
    return res.status(400).json({ message: "title, category, fileType, url are required" });
  }
  const item = {
    id: createId("d"),
    title,
    category,
    fileType,
    url,
    uploadedAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().documents.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Document created", item });
});

router.put("/documents/:id", async (req, res) => {
  const item = getStore().documents.find((d) => d.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Document not found" });
  const allowed = ["title", "category", "fileType", "url"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Document updated", item });
});

router.delete("/documents/:id", async (req, res) => {
  const removed = removeById(getStore().documents, req.params.id);
  if (!removed) return res.status(404).json({ message: "Document not found" });
  await persistPhase1State();
  return res.json({ message: "Document deleted", item: removed });
});

// Chat users CRUD
router.get("/chat/users", (req, res) => {
  const query = String(req.query.q || "").toLowerCase();
  let users = getStore().chats.users;
  if (query) users = users.filter((u) => u.name.toLowerCase().includes(query));
  return res.json({ items: users });
});

router.post("/chat/users", async (req, res) => {
  const { name, phone, online } = req.body;
  if (!name || !phone) return res.status(400).json({ message: "name and phone are required" });
  const item = {
    id: createId("u"),
    name,
    phone,
    online: parseBool(online, false),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().chats.users.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Chat user created", item });
});

router.put("/chat/users/:id", async (req, res) => {
  const item = getStore().chats.users.find((u) => u.id === req.params.id);
  if (!item) return res.status(404).json({ message: "User not found" });
  const allowed = ["name", "phone", "online"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) {
      item[key] = key === "online" ? parseBool(req.body[key], item.online) : req.body[key];
    }
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Chat user updated", item });
});

router.delete("/chat/users/:id", async (req, res) => {
  const removed = removeById(getStore().chats.users, req.params.id);
  if (!removed) return res.status(404).json({ message: "User not found" });
  getStore().chats.threads.forEach((thread) => {
    thread.members = (thread.members || []).filter((memberId) => memberId !== req.params.id);
    thread.messages = (thread.messages || []).filter((m) => m.by !== req.params.id);
    touch(thread);
  });
  await persistPhase1State();
  return res.json({ message: "Chat user deleted", item: removed });
});

// Chat threads/messages CRUD
router.get("/chat/threads", (req, res) => {
  return res.json({ items: getStore().chats.threads });
});

router.get("/chat/threads/:id", (req, res) => {
  const item = getStore().chats.threads.find((t) => t.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Thread not found" });
  return res.json({ item });
});

router.post("/chat/threads", async (req, res) => {
  const { name, memberIds, type } = req.body;
  if (!name || !Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ message: "name and memberIds are required" });
  }
  const thread = {
    id: createId("t"),
    type: type || "group",
    name,
    members: [req.user.id, ...new Set(memberIds)],
    messages: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().chats.threads.unshift(thread);
  await persistPhase1State();
  return res.status(201).json({ message: "Thread created", item: thread });
});

router.put("/chat/threads/:id", async (req, res) => {
  const item = getStore().chats.threads.find((t) => t.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Thread not found" });
  const allowed = ["name", "type", "memberIds"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) {
      if (key === "memberIds" && Array.isArray(req.body.memberIds)) {
        item.members = [req.user.id, ...new Set(req.body.memberIds)];
      } else {
        item[key] = req.body[key];
      }
    }
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Thread updated", item });
});

router.delete("/chat/threads/:id", async (req, res) => {
  const removed = removeById(getStore().chats.threads, req.params.id);
  if (!removed) return res.status(404).json({ message: "Thread not found" });
  await persistPhase1State();
  return res.json({ message: "Thread deleted", item: removed });
});

router.get("/chat/threads/:id/messages", (req, res) => {
  const thread = getStore().chats.threads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: "Thread not found" });
  return res.json({ items: thread.messages || [] });
});

router.post("/chat/threads/:id/messages", async (req, res) => {
  const thread = getStore().chats.threads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: "Thread not found" });
  const { text } = req.body;
  if (!text) return res.status(400).json({ message: "text is required" });
  const message = {
    id: createId("m"),
    by: req.user.id,
    text,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  thread.messages.push(message);
  touch(thread);
  await persistPhase1State();
  return res.status(201).json({ message: "Message sent", item: message });
});

router.put("/chat/threads/:id/messages/:messageId", async (req, res) => {
  const thread = getStore().chats.threads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: "Thread not found" });
  const message = (thread.messages || []).find((m) => m.id === req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  if (!req.body.text) return res.status(400).json({ message: "text is required" });
  message.text = req.body.text;
  message.updatedAt = nowIso();
  touch(thread);
  await persistPhase1State();
  return res.json({ message: "Message updated", item: message });
});

router.delete("/chat/threads/:id/messages/:messageId", async (req, res) => {
  const thread = getStore().chats.threads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: "Thread not found" });
  const removed = removeById(thread.messages || [], req.params.messageId);
  if (!removed) return res.status(404).json({ message: "Message not found" });
  touch(thread);
  await persistPhase1State();
  return res.json({ message: "Message deleted", item: removed });
});

// Profile CRUD (+ family members CRUD)
router.get("/profile", async (req, res) => {
  const userFilter = resolveUserFilterFromToken(req.user);
  if (!userFilter) {
    return res.status(401).json({ message: "Unauthorized user identity" });
  }

  const user = await User.findOne(userFilter).lean();
  if (!user) {
    return res.status(404).json({ message: "Profile not found" });
  }

  const fallbackProfile = getStore().profile || {};
  const item = {
    id: user.userId ? `u_${user.userId}` : String(user._id),
    name: user.fullName || "",
    flat: user.flat || "",
    residenceDetails: user.residenceDetails || "",
    about: user.about || "",
    phone: user.phone || "",
    email: user.email || "",
    emergencyContactName: user.emergencyContactName || "",
    emergencyContactPhone: user.emergencyContactPhone || "",
    profilePhoto: user.profilePhoto || "",
    familyMembers: fallbackProfile.familyMembers || [],
  };
  return res.json({ item });
});

router.put("/profile", async (req, res) => {
  const userFilter = resolveUserFilterFromToken(req.user);
  if (!userFilter) {
    return res.status(401).json({ message: "Unauthorized user identity" });
  }

  const existingUser = await User.findOne(userFilter).lean();
  if (!existingUser) {
    return res.status(404).json({ message: "Profile not found" });
  }

  const normalized = {
    name:
      req.body.name !== undefined
        ? String(req.body.name || "").trim()
        : undefined,
    residenceDetails:
      req.body.residenceDetails !== undefined
        ? String(req.body.residenceDetails || "").trim()
        : undefined,
    about:
      req.body.about !== undefined ? String(req.body.about || "").trim() : undefined,
    phone:
      req.body.phone !== undefined
        ? String(req.body.phone || "").trim()
        : undefined,
    email:
      req.body.email !== undefined
        ? String(req.body.email || "").trim().toLowerCase()
        : undefined,
    emergencyContactName:
      req.body.emergencyContactName !== undefined
        ? String(req.body.emergencyContactName || "").trim()
        : undefined,
    emergencyContactPhone:
      req.body.emergencyContactPhone !== undefined
        ? String(req.body.emergencyContactPhone || "").trim()
        : undefined,
    profilePhoto:
      req.body.profilePhoto !== undefined
        ? String(req.body.profilePhoto || "").trim()
        : undefined,
    phoneOtpToken:
      req.body.phoneOtpToken !== undefined
        ? String(req.body.phoneOtpToken || "").trim()
        : undefined,
  };

  if (normalized.email !== undefined && normalized.email && !emailPattern.test(normalized.email)) {
    return res.status(400).json({ message: "Invalid email" });
  }

  if (normalized.phone !== undefined && normalized.phone && !/^\d{10}$/.test(normalized.phone)) {
    return res.status(400).json({ message: "phone must be a 10 digit number" });
  }

  if (
    normalized.emergencyContactPhone !== undefined &&
    normalized.emergencyContactPhone &&
    !/^\d{10}$/.test(normalized.emergencyContactPhone)
  ) {
    return res.status(400).json({ message: "emergencyContactPhone must be a 10 digit number" });
  }

  if (normalized.profilePhoto !== undefined && normalized.profilePhoto) {
    const base64Payload = getBase64Payload(normalized.profilePhoto);
    const bytes = getDecodedByteSize(base64Payload);
    if (!bytes) {
      return res.status(400).json({ message: "Invalid profile photo data" });
    }
    if (bytes > MAX_PROFILE_PHOTO_BYTES) {
      return res.status(400).json({ message: "photo size is 2mb allowed" });
    }
  }

  if (
    normalized.phone !== undefined &&
    normalized.phone &&
    normalized.phone !== String(existingUser.phone || "")
  ) {
    if (!normalized.phoneOtpToken) {
      return res.status(400).json({
        code: "PHONE_OTP_REQUIRED",
        message: "OTP verification is required to update phone number",
      });
    }

    try {
      verifyOtpTokenForMobile({
        token: normalized.phoneOtpToken,
        mobile: normalized.phone,
      });
    } catch (error) {
      return res.status(400).json({
        code: "PHONE_OTP_INVALID",
        message: "Invalid or expired phone OTP verification",
      });
    }

    const duplicatePhone = await User.findOne({
      phone: normalized.phone,
      _id: { $ne: existingUser._id },
    }).lean();
    if (duplicatePhone) {
      return res.status(409).json({ message: "Phone already exists" });
    }
  }

  if (normalized.email !== undefined && normalized.email) {
    const duplicateEmail = await User.findOne({
      email: normalized.email,
      _id: { $ne: existingUser._id },
    }).lean();
    if (duplicateEmail) {
      return res.status(409).json({ message: "Email already exists" });
    }
  }

  const update = {};
  if (normalized.name !== undefined) update.fullName = normalized.name;
  if (normalized.residenceDetails !== undefined) {
    update.residenceDetails = normalized.residenceDetails;
  }
  if (normalized.about !== undefined) {
    update.about = normalized.about;
  }
  if (normalized.phone !== undefined) update.phone = normalized.phone;
  if (normalized.email !== undefined) update.email = normalized.email;
  if (normalized.emergencyContactName !== undefined) {
    update.emergencyContactName = normalized.emergencyContactName;
  }
  if (normalized.emergencyContactPhone !== undefined) {
    update.emergencyContactPhone = normalized.emergencyContactPhone;
  }
  if (normalized.profilePhoto !== undefined) {
    update.profilePhoto = normalized.profilePhoto;
  }

  const updatedUser = await User.findOneAndUpdate(
    userFilter,
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!updatedUser) {
    return res.status(404).json({ message: "Profile not found" });
  }

  const profile = getStore().profile;
  profile.name = updatedUser.fullName || profile.name;
  profile.flat = updatedUser.flat || "";
  profile.residenceDetails = updatedUser.residenceDetails || "";
  profile.about = updatedUser.about || "";
  profile.phone = updatedUser.phone || profile.phone;
  profile.email = updatedUser.email || profile.email;
  profile.emergencyContactName = updatedUser.emergencyContactName || "";
  profile.emergencyContactPhone = updatedUser.emergencyContactPhone || "";
  profile.profilePhoto = updatedUser.profilePhoto || "";
  touch(profile);
  await persistPhase1State();
  return res.json({
    message: "Profile updated",
    item: {
      id: updatedUser.userId ? `u_${updatedUser.userId}` : String(updatedUser._id),
      name: updatedUser.fullName || "",
      flat: updatedUser.flat || "",
      residenceDetails: updatedUser.residenceDetails || "",
      about: updatedUser.about || "",
      phone: updatedUser.phone || "",
      email: updatedUser.email || "",
      emergencyContactName: updatedUser.emergencyContactName || "",
      emergencyContactPhone: updatedUser.emergencyContactPhone || "",
      profilePhoto: updatedUser.profilePhoto || "",
      familyMembers: profile.familyMembers || [],
    },
  });
});

router.get("/profile/family", (req, res) => {
  return res.json({ items: getStore().profile.familyMembers || [] });
});

router.post("/profile/family", async (req, res) => {
  const { name, relation, phone } = req.body;
  if (!name || !relation || !phone) {
    return res.status(400).json({ message: "name, relation, phone are required" });
  }
  const member = {
    id: createId("fm"),
    name,
    relation,
    phone,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  getStore().profile.familyMembers.push(member);
  touch(getStore().profile);
  await persistPhase1State();
  return res.status(201).json({ message: "Family member added", item: member });
});

router.put("/profile/family/:id", async (req, res) => {
  const member = (getStore().profile.familyMembers || []).find((fm) => fm.id === req.params.id);
  if (!member) return res.status(404).json({ message: "Family member not found" });
  const allowed = ["name", "relation", "phone"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) member[key] = req.body[key];
  });
  member.updatedAt = nowIso();
  touch(getStore().profile);
  await persistPhase1State();
  return res.json({ message: "Family member updated", item: member });
});

router.delete("/profile/family/:id", async (req, res) => {
  const removed = removeById(getStore().profile.familyMembers || [], req.params.id);
  if (!removed) return res.status(404).json({ message: "Family member not found" });
  touch(getStore().profile);
  await persistPhase1State();
  return res.json({ message: "Family member deleted", item: removed });
});

// Feature requests CRUD
router.get("/feature-requests", (req, res) => {
  return res.json({ items: getStore().featureRequests });
});

router.get("/feature-requests/:id", (req, res) => {
  const item = getStore().featureRequests.find((f) => f.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Feature request not found" });
  return res.json({ item });
});

router.post("/feature-requests", async (req, res) => {
  const { title, description, attachmentUrl, status } = req.body;
  if (!title || !description) {
    return res.status(400).json({ message: "title and description are required" });
  }
  const item = {
    id: createId("fr"),
    title,
    description,
    status: status || "Submitted",
    attachmentUrl: attachmentUrl || null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: req.user.id,
  };
  getStore().featureRequests.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Feature request submitted", item });
});

router.put("/feature-requests/:id", async (req, res) => {
  const item = getStore().featureRequests.find((f) => f.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Feature request not found" });
  const allowed = ["title", "description", "attachmentUrl", "status"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) item[key] = req.body[key];
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Feature request updated", item });
});

router.delete("/feature-requests/:id", async (req, res) => {
  const removed = removeById(getStore().featureRequests, req.params.id);
  if (!removed) return res.status(404).json({ message: "Feature request not found" });
  await persistPhase1State();
  return res.json({ message: "Feature request deleted", item: removed });
});

module.exports = router;
