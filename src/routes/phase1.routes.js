const express = require("express");
const mongoose = require("mongoose");
const auth = require("../middleware/auth");
const User = require("../models/user.model");
const { getLiveStore, createId, nowIso } = require("../data/phase1-store");
const { persistPhase1State } = require("../services/phase1-state.service");
const { verifyOtpTokenForMobile } = require("../services/otp.service");

const router = express.Router();
router.use(auth);

const getStoreRoot = () => getLiveStore();

const getScopedSocietyId = (req) => {
  if (Number.isFinite(Number(req.selectedSocietyId))) {
    return Number(req.selectedSocietyId);
  }
  const tokenSocietyIds = Array.isArray(req.user?.societyIds)
    ? req.user.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  return tokenSocietyIds.length > 0 ? tokenSocietyIds[0] : null;
};

const getStore = (req) => {
  const root = getStoreRoot();
  const scopedSocietyId = getScopedSocietyId(req);
  if (!Number.isFinite(scopedSocietyId)) {
    return root;
  }

  if (!root.societyStores || typeof root.societyStores !== "object") {
    root.societyStores = {};
  }

  const key = String(scopedSocietyId);
  if (!root.societyStores[key]) {
    const seeded = JSON.parse(JSON.stringify(root));
    delete seeded.societyStores;
    root.societyStores[key] = seeded;
  }

  return root.societyStores[key];
};
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

const resolveCreatorUserId = (req) => {
  if (Number.isFinite(Number(req.user?.userId))) {
    return Number(req.user.userId);
  }
  const id = String(req.user?.id || "").trim();
  if (id.startsWith("u_")) {
    const parsed = Number(id.slice(2));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const resolveCreatorSocietyId = (req) => {
  if (Number.isFinite(Number(req.selectedSocietyId))) {
    return Number(req.selectedSocietyId);
  }
  const tokenSocietyIds = Array.isArray(req.user?.societyIds)
    ? req.user.societyIds.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  return tokenSocietyIds.length > 0 ? tokenSocietyIds[0] : null;
};

const buildCreationAudit = (req) => ({
  createdByUserId: resolveCreatorUserId(req),
  createdBySocietyId: resolveCreatorSocietyId(req),
});

const normalizeStatusValue = (value) => String(value || "").trim().toLowerCase();

const buildBookingApprovalAuditEntry = (req, action) => ({
  action,
  byUserId: resolveCreatorUserId(req),
  byName: String(req.user?.name || "").trim() || "Unknown admin",
  actedAt: nowIso(),
});

const normalizeComplaintStatus = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "inprogress" || raw === "in progress") return "In Progress";
  if (raw === "resolved") return "Resolved";
  if (raw === "open" || raw === "todo" || raw === "to do") return "To Do";
  return "To Do";
};

const isAdminRequest = async (req) => {
  const roleFromToken = String(req.user?.role || "").trim().toLowerCase();
  if (roleFromToken === "admin") return true;
  const userFilter = req.user?.userId
    ? { userId: Number(req.user.userId) }
    : req.user?.mobile
      ? { phone: String(req.user.mobile).trim() }
      : null;
  if (!userFilter) return false;
  const user = await User.findOne(userFilter).select("role").lean();
  return String(user?.role || "").trim().toLowerCase() === "admin";
};

const mapComplaintForResponse = (req, complaint = {}) => {
  const likes = Array.isArray(complaint.likes)
    ? complaint.likes.map((v) => String(v).trim()).filter(Boolean)
    : [];
  const comments = Array.isArray(complaint.comments) ? complaint.comments : [];
  const currentUserId = String(req.user?.id || "").trim();
  return {
    ...complaint,
    status: normalizeComplaintStatus(complaint.status),
    filedByName: String(
      complaint.filedByName || complaint.createdByName || complaint.assignedTo || "Resident"
    ).trim(),
    likeCount: likes.length,
    likedByCurrentUser: currentUserId ? likes.includes(currentUserId) : false,
    commentsCount: comments.length,
  };
};

const resolveBookingRequesterFilter = (booking = {}) => {
  if (Number.isFinite(Number(booking.createdByUserId))) {
    return { userId: Number(booking.createdByUserId) };
  }

  const requestedBy = String(booking.requestedBy || "").trim();
  if (!requestedBy) return null;

  if (requestedBy.startsWith("u_")) {
    const parsed = Number(requestedBy.slice(2));
    if (Number.isFinite(parsed)) {
      return { userId: parsed };
    }
  }

  const numericRequestedBy = Number(requestedBy);
  if (Number.isFinite(numericRequestedBy)) {
    return { userId: numericRequestedBy };
  }

  if (mongoose.Types.ObjectId.isValid(requestedBy)) {
    return { _id: requestedBy };
  }

  return null;
};

const attachBookingRequesterDetails = async (booking = {}) => {
  const requesterFilter = resolveBookingRequesterFilter(booking);
  let user = null;

  if (requesterFilter) {
    user = await User.findOne(requesterFilter)
      .select("userId fullName phone residenceDetails flat")
      .lean();
  }

  return {
    ...booking,
    requestedByUserId:
      user?.userId ??
      (Number.isFinite(Number(booking.createdByUserId))
        ? Number(booking.createdByUserId)
        : null),
    requestedByName: user?.fullName || "",
    requestedByPhone: user?.phone || "",
    requestedByAddress: user?.residenceDetails || user?.flat || "",
  };
};

const attachPaymentCreatorDetails = async (payment = {}) => {
  let user = null;
  if (Number.isFinite(Number(payment.createdByUserId))) {
    user = await User.findOne({ userId: Number(payment.createdByUserId) })
      .select("userId fullName")
      .lean();
  }
  const normalizedType = String(payment.type || "").trim().toLowerCase();
  const isMiscType = normalizedType === "misc amount" || normalizedType === "other amount";
  const normalizedAssigneeScope = String(
    payment.assigneeScope || (isMiscType ? "all" : "")
  )
    .trim()
    .toLowerCase();

  return {
    ...payment,
    createdByUserId:
      user?.userId ??
      (Number.isFinite(Number(payment.createdByUserId))
        ? Number(payment.createdByUserId)
        : null),
    createdByName:
      String(user?.fullName || payment.createdByName || "").trim(),
    assigneeScope: normalizedAssigneeScope,
    assigneeUserIds: Array.isArray(payment.assigneeUserIds)
      ? payment.assigneeUserIds.map((value) => String(value).trim()).filter(Boolean)
      : [],
    assigneeNames: Array.isArray(payment.assigneeNames)
      ? payment.assigneeNames.map((value) => String(value).trim()).filter(Boolean)
      : [],
  };
};

// Dashboard
router.get("/dashboard", (req, res) => {
  const store = getStore(req);
  const pendingPayments = store.payments.filter((p) => p.status === "Pending").length;
  const openComplaints = store.complaints.filter((c) => c.status === "Open").length;
  const activeNotices = store.notices.length;
  const bookings = store.amenityBookings.length;
  return res.json({
    stats: { pendingPayments, openComplaints, activeNotices, bookings },
  });
});

// Society updates CRUD
router.get(["/society-updates", "/notices"], (req, res) => {
  const store = getStore(req);
  const category = req.query.category;
  let notices = store.notices;
  if (category && category !== "All") {
    notices = notices.filter((n) => n.category.toLowerCase() === String(category).toLowerCase());
  }
  return res.json({ items: notices });
});

router.get(["/society-updates/:id", "/notices/:id"], (req, res) => {
  const item = getStore(req).notices.find((n) => n.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Society update not found" });
  return res.json({ item });
});

router.post(["/society-updates", "/notices"], async (req, res) => {
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
    ...buildCreationAudit(req),
  };
  getStore(req).notices.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Society update created", item });
});

router.put(["/society-updates/:id", "/notices/:id"], async (req, res) => {
  const item = getStore(req).notices.find((n) => n.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Society update not found" });
  const allowed = ["title", "category", "content", "priority", "pinned", "attachments"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) {
      item[key] = key === "pinned" ? parseBool(req.body[key], item.pinned) : req.body[key];
    }
  });
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Society update updated", item });
});

router.delete(["/society-updates/:id", "/notices/:id"], async (req, res) => {
  const removed = removeById(getStore(req).notices, req.params.id);
  if (!removed) return res.status(404).json({ message: "Society update not found" });
  await persistPhase1State();
  return res.json({ message: "Society update deleted", item: removed });
});

router.post(["/society-updates/:id/read", "/notices/:id/read"], async (req, res) => {
  const notice = getStore(req).notices.find((n) => n.id === req.params.id);
  if (!notice) return res.status(404).json({ message: "Society update not found" });
  if (!notice.readBy.includes(req.user.id)) notice.readBy.push(req.user.id);
  touch(notice);
  await persistPhase1State();
  return res.json({ message: "Marked as read", item: notice });
});

// Payments CRUD + pay + receipt
router.get("/payments", async (req, res) => {
  const typeFilter = String(req.query.type || "").trim().toLowerCase();
  const yearFilter = String(req.query.year || "").trim();
  let source = getStore(req).payments;
  if (typeFilter) {
    source = source.filter(
      (payment) => String(payment.type || "").trim().toLowerCase() === typeFilter
    );
  }
  if (yearFilter) {
    source = source.filter((payment) =>
      String(payment.month || "").trim().startsWith(`${yearFilter}-`)
    );
  }
  const items = await Promise.all(
    source.map((payment) => attachPaymentCreatorDetails(payment))
  );
  return res.json({ items });
});

router.get("/payments/maintenance-years", (req, res) => {
  const years = Array.from(
    new Set(
      getStore(req)
        .payments.filter(
          (payment) => String(payment.type || "").trim().toLowerCase() === "maintenance"
        )
        .map((payment) => String(payment.month || "").trim())
        .filter((month) => /^\d{4}-\d{2}$/.test(month))
        .map((month) => Number(month.slice(0, 4)))
        .filter((year) => Number.isFinite(year))
    )
  ).sort((a, b) => a - b);
  return res.json({ years });
});

router.get("/payments/:id", async (req, res) => {
  const item = getStore(req).payments.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Payment not found" });
  return res.json({ item: await attachPaymentCreatorDetails(item) });
});

router.post("/payments", async (req, res) => {
  const { type, amount, month, dueDate, status, assigneeScope, assigneeUserIds, assigneeNames } =
    req.body;
  if (!type || amount === undefined) {
    return res.status(400).json({ message: "type and amount are required" });
  }
  const normalizedType = String(type || "").trim().toLowerCase();
  const isMaintenance = normalizedType === "maintenance";
  const isMiscType = normalizedType === "other amount" || normalizedType === "misc amount";
  let normalizedMonth = String(month || "").trim();
  if (isMaintenance && !normalizedMonth) {
    return res.status(400).json({ message: "month is required for maintenance" });
  }
  if (!isMaintenance) {
    if (!dueDate) {
      return res.status(400).json({ message: "dueDate is required for misc amount" });
    }
    const due = new Date(String(dueDate));
    if (Number.isNaN(due.getTime())) {
      return res.status(400).json({ message: "dueDate must be valid" });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due <= today) {
      return res.status(400).json({ message: "dueDate must be a future date" });
    }
    if (!normalizedMonth) {
      normalizedMonth = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  if (normalizedType === "maintenance") {
    const duplicate = getStore(req).payments.find(
      (payment) =>
        String(payment.type || "").trim().toLowerCase() === "maintenance" &&
        String(payment.month || "").trim() === normalizedMonth
    );
    if (duplicate) {
      return res.status(409).json({
        message: "Maintenance record already exists for this month. Please update it.",
      });
    }
  }
  const item = {
    id: createId("p"),
    type: isMiscType ? "Misc Amount" : type,
    amount: Number(amount),
    month: normalizedMonth,
    dueDate: dueDate || null,
    status: status || "Pending",
    assigneeScope: String(assigneeScope || "all").trim().toLowerCase(),
    assigneeUserIds: Array.isArray(assigneeUserIds)
      ? assigneeUserIds.map((value) => String(value).trim()).filter(Boolean)
      : [],
    assigneeNames: Array.isArray(assigneeNames)
      ? assigneeNames.map((value) => String(value).trim()).filter(Boolean)
      : [],
    paidAt: null,
    transactionRef: null,
    createdByName: String(req.user?.name || "").trim(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...buildCreationAudit(req),
  };
  getStore(req).payments.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Payment created", item });
});

router.put("/payments/:id", async (req, res) => {
  const item = getStore(req).payments.find((p) => p.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Payment not found" });
  const nextType = req.body.type !== undefined ? req.body.type : item.type;
  const nextTypeNormalized = String(nextType || "").trim().toLowerCase();
  const isMaintenance = nextTypeNormalized === "maintenance";
  const isMiscType = nextTypeNormalized === "other amount" || nextTypeNormalized === "misc amount";
  const nextMonth = req.body.month !== undefined ? req.body.month : item.month;
  const nextDueDate = req.body.dueDate !== undefined ? req.body.dueDate : item.dueDate;
  if (!isMaintenance) {
    if (!nextDueDate) {
      return res.status(400).json({ message: "dueDate is required for misc amount" });
    }
    const due = new Date(String(nextDueDate));
    if (Number.isNaN(due.getTime())) {
      return res.status(400).json({ message: "dueDate must be valid" });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (due <= today) {
      return res.status(400).json({ message: "dueDate must be a future date" });
    }
  }
  if (
    isMaintenance &&
    String(nextMonth || "").trim()
  ) {
    const duplicate = getStore(req).payments.find(
      (payment) =>
        payment.id !== item.id &&
        String(payment.type || "").trim().toLowerCase() === "maintenance" &&
        String(payment.month || "").trim() === String(nextMonth || "").trim()
    );
    if (duplicate) {
      return res.status(409).json({
        message: "Maintenance record already exists for this month. Please update it.",
      });
    }
  }
  const allowed = ["type", "amount", "month", "dueDate", "status"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) item[key] = key === "amount" ? Number(req.body[key]) : req.body[key];
  });
  if (!isMaintenance && !String(item.month || "").trim() && item.dueDate) {
    const due = new Date(String(item.dueDate));
    if (!Number.isNaN(due.getTime())) {
      item.month = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}`;
    }
  }
  if (isMiscType && req.body.type !== undefined) {
    item.type = "Misc Amount";
  }
  if (req.body.assigneeScope !== undefined) {
    item.assigneeScope = String(req.body.assigneeScope || "all").trim().toLowerCase();
  }
  if (req.body.assigneeUserIds !== undefined) {
    item.assigneeUserIds = Array.isArray(req.body.assigneeUserIds)
      ? req.body.assigneeUserIds.map((value) => String(value).trim()).filter(Boolean)
      : [];
  }
  if (req.body.assigneeNames !== undefined) {
    item.assigneeNames = Array.isArray(req.body.assigneeNames)
      ? req.body.assigneeNames.map((value) => String(value).trim()).filter(Boolean)
      : [];
  }
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Payment updated", item });
});

router.delete("/payments/:id", async (req, res) => {
  const removed = removeById(getStore(req).payments, req.params.id);
  if (!removed) return res.status(404).json({ message: "Payment not found" });
  await persistPhase1State();
  return res.json({ message: "Payment deleted", item: removed });
});

router.post("/payments/:id/pay", async (req, res) => {
  const payment = getStore(req).payments.find((p) => p.id === req.params.id);
  if (!payment) return res.status(404).json({ message: "Payment not found" });
  payment.status = "Paid";
  payment.paidAt = nowIso();
  payment.transactionRef = `TXN-OW-${Math.floor(Math.random() * 1e5)}`;
  touch(payment);
  await persistPhase1State();
  return res.json({ message: "Payment successful", item: payment });
});

router.get("/payments/:id/receipt", (req, res) => {
  const payment = getStore(req).payments.find((p) => p.id === req.params.id);
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
  let items = [...getStore(req).complaints];
  if (status && status !== "All") {
    const normalizedStatus = normalizeComplaintStatus(status);
    items = items.filter((c) => normalizeComplaintStatus(c.status) === normalizedStatus);
  }
  items.sort((a, b) => {
    const aTime = Date.parse(a.createdAt || "") || 0;
    const bTime = Date.parse(b.createdAt || "") || 0;
    return bTime - aTime;
  });
  return res.json({ items: items.map((item) => mapComplaintForResponse(req, item)) });
});

router.get("/complaints/:id", (req, res) => {
  const item = getStore(req).complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  return res.json({ item: mapComplaintForResponse(req, item) });
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
    status: normalizeComplaintStatus(status || "To Do"),
    assignedTo: assignedTo || "Pending Assignment",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: req.user.id,
    createdByName: String(req.user?.name || "").trim(),
    filedByName: String(req.user?.name || "").trim() || "Resident",
    likes: [],
    resolutionComment: "",
    resolutionUpdatedAt: null,
    resolutionUpdatedBy: "",
    comments: [],
    ...buildCreationAudit(req),
  };
  getStore(req).complaints.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Complaint submitted", item: mapComplaintForResponse(req, item) });
});

router.put("/complaints/:id", async (req, res) => {
  const item = getStore(req).complaints.find((c) => c.id === req.params.id);
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
  const isAdmin = await isAdminRequest(req);
  if (!isAdmin) {
    return res.status(403).json({ message: "Only admin can update complaint status" });
  }
  const item = getStore(req).complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  if (!req.body.status) return res.status(400).json({ message: "status is required" });
  item.status = normalizeComplaintStatus(req.body.status);
  if (req.body.resolutionComment !== undefined) {
    const resolutionComment = String(req.body.resolutionComment || "").trim();
    item.resolutionComment = resolutionComment;
    item.resolutionUpdatedAt = nowIso();
    item.resolutionUpdatedBy = String(req.user?.name || "").trim() || "Admin";
    if (resolutionComment) {
      if (!Array.isArray(item.comments)) item.comments = [];
      item.comments.push({
        id: createId("cc"),
        by: item.resolutionUpdatedBy,
        byUserId: req.user.id,
        message: resolutionComment,
        type: "resolution",
        createdAt: nowIso(),
        updatedAt: nowIso(),
        ...buildCreationAudit(req),
      });
    }
  }
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Complaint status updated", item: mapComplaintForResponse(req, item) });
});

router.delete("/complaints/:id", async (req, res) => {
  const removed = removeById(getStore(req).complaints, req.params.id);
  if (!removed) return res.status(404).json({ message: "Complaint not found" });
  await persistPhase1State();
  return res.json({ message: "Complaint deleted", item: removed });
});

router.get("/complaints/:id/comments", (req, res) => {
  const item = getStore(req).complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  return res.json({ items: item.comments || [] });
});

router.post("/complaints/:id/comments", async (req, res) => {
  const item = getStore(req).complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  const { message, type } = req.body;
  if (!message) return res.status(400).json({ message: "message is required" });
  const commentType = String(type || "comment").trim().toLowerCase();
  if (commentType === "resolution") {
    const isAdmin = await isAdminRequest(req);
    if (!isAdmin) {
      return res.status(403).json({ message: "Only admin can add resolution comment" });
    }
  }
  const comment = {
    id: createId("cc"),
    by: req.user.name || "Resident",
    byUserId: req.user.id,
    message,
    type: commentType === "resolution" ? "resolution" : "comment",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...buildCreationAudit(req),
  };
  item.comments.push(comment);
  touch(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Comment added", item: comment });
});

router.post("/complaints/:id/like", async (req, res) => {
  const item = getStore(req).complaints.find((c) => c.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Complaint not found" });
  if (!Array.isArray(item.likes)) item.likes = [];
  const userId = String(req.user?.id || "").trim();
  if (!userId) return res.status(400).json({ message: "Unable to resolve user id" });
  const index = item.likes.findIndex((id) => String(id).trim() === userId);
  if (index >= 0) {
    item.likes.splice(index, 1);
  } else {
    item.likes.push(userId);
  }
  touch(item);
  await persistPhase1State();
  return res.json({
    message: "Like updated",
    item: mapComplaintForResponse(req, item),
  });
});

router.put("/complaints/:id/comments/:commentId", async (req, res) => {
  const complaint = getStore(req).complaints.find((c) => c.id === req.params.id);
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
  const complaint = getStore(req).complaints.find((c) => c.id === req.params.id);
  if (!complaint) return res.status(404).json({ message: "Complaint not found" });
  const removed = removeById(complaint.comments || [], req.params.commentId);
  if (!removed) return res.status(404).json({ message: "Comment not found" });
  touch(complaint);
  await persistPhase1State();
  return res.json({ message: "Comment deleted", item: removed });
});

// Polls CRUD + vote
router.get("/polls", (req, res) => {
  return res.json({ items: getStore(req).polls });
});

router.get("/polls/:id", (req, res) => {
  const item = getStore(req).polls.find((p) => p.id === req.params.id);
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
    ...buildCreationAudit(req),
  };
  getStore(req).polls.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Poll created", item });
});

router.put("/polls/:id", async (req, res) => {
  const item = getStore(req).polls.find((p) => p.id === req.params.id);
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
  const removed = removeById(getStore(req).polls, req.params.id);
  if (!removed) return res.status(404).json({ message: "Poll not found" });
  await persistPhase1State();
  return res.json({ message: "Poll deleted", item: removed });
});

router.post("/polls/:id/vote", async (req, res) => {
  const poll = getStore(req).polls.find((p) => p.id === req.params.id);
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
  return res.json({ items: getStore(req).events });
});

router.get("/events/:id", (req, res) => {
  const item = getStore(req).events.find((e) => e.id === req.params.id);
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
    ...buildCreationAudit(req),
  };
  getStore(req).events.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Event created", item });
});

router.put("/events/:id", async (req, res) => {
  const item = getStore(req).events.find((e) => e.id === req.params.id);
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
  const removed = removeById(getStore(req).events, req.params.id);
  if (!removed) return res.status(404).json({ message: "Event not found" });
  await persistPhase1State();
  return res.json({ message: "Event deleted", item: removed });
});

router.post("/events/:id/rsvp", async (req, res) => {
  const event = getStore(req).events.find((e) => e.id === req.params.id);
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
router.get("/bookings", async (req, res) => {
  const items = await Promise.all(
    getStore(req).amenityBookings.map((booking) =>
      attachBookingRequesterDetails(booking)
    )
  );
  return res.json({ items });
});

router.get("/bookings/:id", async (req, res) => {
  const item = getStore(req).amenityBookings.find((b) => b.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Booking not found" });
  return res.json({ item: await attachBookingRequesterDetails(item) });
});

router.post("/bookings", async (req, res) => {
  const {
    amenity,
    date,
    slot,
    status,
    fromTime,
    toTime,
    amountPerDay,
    isBookingRequest,
    requiresBooking,
  } = req.body;
  if (!amenity || (!slot && !(fromTime && toTime))) {
    return res.status(400).json({
      message: "amenity and slot (or fromTime + toTime) are required",
    });
  }
  const normalizedFrom = fromTime ? String(fromTime).trim() : "";
  const normalizedTo = toTime ? String(toTime).trim() : "";
  const resolvedSlot = slot
    ? String(slot).trim()
    : normalizedFrom && normalizedTo
      ? `${normalizedFrom} - ${normalizedTo}`
      : "";
  const item = {
    id: createId("b"),
    amenity,
    date: date || "",
    slot: resolvedSlot,
    fromTime: normalizedFrom,
    toTime: normalizedTo,
    amountPerDay:
      amountPerDay === undefined || amountPerDay === null || amountPerDay === ""
        ? null
        : Number(amountPerDay),
    status: status || "Pending Approval",
    isBookingRequest: parseBool(isBookingRequest, false),
    requiresBooking: parseBool(requiresBooking, false),
    requestedBy: req.user.id,
    approvalAudit: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...buildCreationAudit(req),
  };
  getStore(req).amenityBookings.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Booking request submitted", item });
});

router.put("/bookings/:id", async (req, res) => {
  const item = getStore(req).amenityBookings.find((b) => b.id === req.params.id);
  if (!item) return res.status(404).json({ message: "Booking not found" });
  const previousStatus = normalizeStatusValue(item.status);
  const allowed = [
    "amenity",
    "date",
    "slot",
    "status",
    "fromTime",
    "toTime",
    "amountPerDay",
    "isBookingRequest",
    "requiresBooking",
  ];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) {
      if (key === "amountPerDay") {
        item[key] = Number(req.body[key]);
      } else if (key === "isBookingRequest" || key === "requiresBooking") {
        item[key] = parseBool(req.body[key], item[key] === true);
      } else {
        item[key] = req.body[key];
      }
    }
  });
  const incomingStatusDefined = req.body.status !== undefined;
  const nextStatus = incomingStatusDefined
    ? normalizeStatusValue(req.body.status)
    : previousStatus;
  if (item.isBookingRequest && incomingStatusDefined && nextStatus !== previousStatus) {
    if (!Array.isArray(item.approvalAudit)) {
      item.approvalAudit = [];
    }
    if (nextStatus === "approved") {
      item.approvalAudit.push(buildBookingApprovalAuditEntry(req, "approved"));
    } else if (previousStatus === "approved" && nextStatus !== "approved") {
      item.approvalAudit.push(buildBookingApprovalAuditEntry(req, "unapproved"));
    }
  }
  if (!item.slot && item.fromTime && item.toTime) {
    item.slot = `${item.fromTime} - ${item.toTime}`;
  }
  touch(item);
  await persistPhase1State();
  return res.json({ message: "Booking updated", item });
});

router.delete("/bookings/:id", async (req, res) => {
  const removed = removeById(getStore(req).amenityBookings, req.params.id);
  if (!removed) return res.status(404).json({ message: "Booking not found" });
  await persistPhase1State();
  return res.json({ message: "Booking deleted", item: removed });
});

// Documents CRUD
router.get("/documents", (req, res) => {
  return res.json({ items: getStore(req).documents });
});

router.get("/documents/:id", (req, res) => {
  const item = getStore(req).documents.find((d) => d.id === req.params.id);
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
    ...buildCreationAudit(req),
  };
  getStore(req).documents.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Document created", item });
});

router.put("/documents/:id", async (req, res) => {
  const item = getStore(req).documents.find((d) => d.id === req.params.id);
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
  const removed = removeById(getStore(req).documents, req.params.id);
  if (!removed) return res.status(404).json({ message: "Document not found" });
  await persistPhase1State();
  return res.json({ message: "Document deleted", item: removed });
});

// Chat users CRUD
router.get("/chat/users", (req, res) => {
  const query = String(req.query.q || "").toLowerCase();
  let users = getStore(req).chats.users;
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
    ...buildCreationAudit(req),
  };
  getStore(req).chats.users.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Chat user created", item });
});

router.put("/chat/users/:id", async (req, res) => {
  const item = getStore(req).chats.users.find((u) => u.id === req.params.id);
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
  const removed = removeById(getStore(req).chats.users, req.params.id);
  if (!removed) return res.status(404).json({ message: "User not found" });
  getStore(req).chats.threads.forEach((thread) => {
    thread.members = (thread.members || []).filter((memberId) => memberId !== req.params.id);
    thread.messages = (thread.messages || []).filter((m) => m.by !== req.params.id);
    touch(thread);
  });
  await persistPhase1State();
  return res.json({ message: "Chat user deleted", item: removed });
});

// Chat threads/messages CRUD
router.get("/chat/threads", (req, res) => {
  return res.json({ items: getStore(req).chats.threads });
});

router.get("/chat/threads/:id", (req, res) => {
  const item = getStore(req).chats.threads.find((t) => t.id === req.params.id);
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
    ...buildCreationAudit(req),
  };
  getStore(req).chats.threads.unshift(thread);
  await persistPhase1State();
  return res.status(201).json({ message: "Thread created", item: thread });
});

router.put("/chat/threads/:id", async (req, res) => {
  const item = getStore(req).chats.threads.find((t) => t.id === req.params.id);
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
  const removed = removeById(getStore(req).chats.threads, req.params.id);
  if (!removed) return res.status(404).json({ message: "Thread not found" });
  await persistPhase1State();
  return res.json({ message: "Thread deleted", item: removed });
});

router.get("/chat/threads/:id/messages", (req, res) => {
  const thread = getStore(req).chats.threads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: "Thread not found" });
  return res.json({ items: thread.messages || [] });
});

router.post("/chat/threads/:id/messages", async (req, res) => {
  const thread = getStore(req).chats.threads.find((t) => t.id === req.params.id);
  if (!thread) return res.status(404).json({ message: "Thread not found" });
  const { text } = req.body;
  if (!text) return res.status(400).json({ message: "text is required" });
  const message = {
    id: createId("m"),
    by: req.user.id,
    text,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    ...buildCreationAudit(req),
  };
  thread.messages.push(message);
  touch(thread);
  await persistPhase1State();
  return res.status(201).json({ message: "Message sent", item: message });
});

router.put("/chat/threads/:id/messages/:messageId", async (req, res) => {
  const thread = getStore(req).chats.threads.find((t) => t.id === req.params.id);
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
  const thread = getStore(req).chats.threads.find((t) => t.id === req.params.id);
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

  const fallbackProfile = getStore(req).profile || {};
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

  const profile = getStore(req).profile;
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
  return res.json({ items: getStore(req).profile.familyMembers || [] });
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
    ...buildCreationAudit(req),
  };
  getStore(req).profile.familyMembers.push(member);
  touch(getStore(req).profile);
  await persistPhase1State();
  return res.status(201).json({ message: "Family member added", item: member });
});

router.put("/profile/family/:id", async (req, res) => {
  const member = (getStore(req).profile.familyMembers || []).find((fm) => fm.id === req.params.id);
  if (!member) return res.status(404).json({ message: "Family member not found" });
  const allowed = ["name", "relation", "phone"];
  allowed.forEach((key) => {
    if (req.body[key] !== undefined) member[key] = req.body[key];
  });
  member.updatedAt = nowIso();
  touch(getStore(req).profile);
  await persistPhase1State();
  return res.json({ message: "Family member updated", item: member });
});

router.delete("/profile/family/:id", async (req, res) => {
  const removed = removeById(getStore(req).profile.familyMembers || [], req.params.id);
  if (!removed) return res.status(404).json({ message: "Family member not found" });
  touch(getStore(req).profile);
  await persistPhase1State();
  return res.json({ message: "Family member deleted", item: removed });
});

// Feature requests CRUD
router.get("/feature-requests", (req, res) => {
  return res.json({ items: getStore(req).featureRequests });
});

router.get("/feature-requests/:id", (req, res) => {
  const item = getStore(req).featureRequests.find((f) => f.id === req.params.id);
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
    ...buildCreationAudit(req),
  };
  getStore(req).featureRequests.unshift(item);
  await persistPhase1State();
  return res.status(201).json({ message: "Feature request submitted", item });
});

router.put("/feature-requests/:id", async (req, res) => {
  const item = getStore(req).featureRequests.find((f) => f.id === req.params.id);
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
  const removed = removeById(getStore(req).featureRequests, req.params.id);
  if (!removed) return res.status(404).json({ message: "Feature request not found" });
  await persistPhase1State();
  return res.json({ message: "Feature request deleted", item: removed });
});

module.exports = router;

