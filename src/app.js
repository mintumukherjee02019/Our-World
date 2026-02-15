const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const dashboardRoutes = require("./routes/dashboard.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "our-world-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/dashboard", dashboardRoutes);

module.exports = app;

