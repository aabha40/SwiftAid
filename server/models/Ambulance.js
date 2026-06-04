const mongoose = require("mongoose");
const { AMBULANCE_STATUS } = require("../utils/constants");

const ambulanceSchema = new mongoose.Schema(
  {
    vehicleNumber: {
      type: String,
      required: [true, "Vehicle number is required"],
      unique: true,
      uppercase: true,
      trim: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(AMBULANCE_STATUS),
      default: AMBULANCE_STATUS.OFFLINE,
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },
    ambulanceType: {
      type: String,
      enum: ["basic", "advanced", "cardiac", "neonatal"],
      default: "basic",
    },
    currentTripId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
    },
    totalTripsCompleted: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: null },
  },
  { timestamps: true },
);

ambulanceSchema.index({ location: "2dsphere" });
ambulanceSchema.index({ status: 1, location: "2dsphere" });

const Ambulance = mongoose.model("Ambulance", ambulanceSchema);
module.exports = Ambulance;
