require("dotenv").config();

const app = require("./app");
const connectDb = require("./config/db");

const port = process.env.PORT || 5000;

connectDb();

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

