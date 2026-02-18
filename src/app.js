const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const featuresRoutes = require("./routes/features.routes");
const phase1Routes = require("./routes/phase1.routes");
const societiesRoutes = require("./routes/societies.routes");
const usersRoutes = require("./routes/users.routes");
const membershipsRoutes = require("./routes/memberships.routes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "our-world-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/features", featuresRoutes);
app.use("/api/phase1", phase1Routes);
app.use("/api/societies", societiesRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/memberships", membershipsRoutes);

module.exports = app;
