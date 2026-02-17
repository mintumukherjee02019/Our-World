require("dotenv").config();

const app = require("./app");
const connectDb = require("./config/db");
const { initializePhase1State } = require("./services/phase1-state.service");
const { bootstrapDb } = require("./services/bootstrap-db.service");

const port = process.env.PORT || 5000;

const start = async () => {
  await connectDb();
  await bootstrapDb();
  await initializePhase1State();

  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

start();
