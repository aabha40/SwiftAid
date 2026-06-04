const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmergencyRequest",
      required: true,
    },
    ambulanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ambulance",
      required: true,
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      default: null,
    },
    timeline: {
      requestedAt: { type: Date, default: Date.now },
      assignedAt: { type: Date, default: null },
      acceptedAt: { type: Date, default: null },
      arrivedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
    },
    estimatedArrivalMinutes: { type: Number, default: null },
    distanceKm: { type: Number, default: null },
  },
  { timestamps: true },
);

const Trip = mongoose.model("Trip", tripSchema);
module.exports = Trip;
