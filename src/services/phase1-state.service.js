const mongoose = require("mongoose");
const Phase1State = require("../models/phase1State.model");
const { defaultPhase1Store, setLiveStore, getLiveStore } = require("../data/phase1-store");

const STATE_KEY = "default";

const clone = (value) => JSON.parse(JSON.stringify(value));

const initializePhase1State = async () => {
  if (mongoose.connection.readyState !== 1) {
    setLiveStore(clone(defaultPhase1Store));
    return;
  }

  let state = await Phase1State.findOne({ key: STATE_KEY }).lean();
  if (!state) {
    state = await Phase1State.create({
      key: STATE_KEY,
      data: clone(defaultPhase1Store),
    });
  }
  setLiveStore(clone(state.data));
};

const persistPhase1State = async () => {
  if (mongoose.connection.readyState !== 1) return;
  await Phase1State.updateOne(
    { key: STATE_KEY },
    { $set: { data: clone(getLiveStore()) } },
    { upsert: true }
  );
};

module.exports = {
  initializePhase1State,
  persistPhase1State,
};

