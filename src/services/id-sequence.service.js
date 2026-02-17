const Counter = require("../models/counter.model");

const getNextSequence = async (key, startAt = 1000) => {
  await Counter.updateOne(
    { key },
    {
      $setOnInsert: {
        key,
        value: Number(startAt) - 1,
      },
    },
    {
      upsert: true,
    }
  );

  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { value: 1 } },
    { returnDocument: "after" }
  ).lean();

  return counter.value;
};

module.exports = {
  getNextSequence,
};
