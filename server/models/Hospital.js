const mongoose = require("mongoose");

const hospitalSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    registrationNumber: { type: String, required: true, unique: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] },
    },
    address: {
      street: String,
      city: String,
      state: String,
      pincode: String,
    },
    phone: { type: String, required: true },
    totalBeds: { type: Number, required: true, min: 0 },
    availableBeds: { type: Number, required: true, min: 0 },
    emergencyCapacity: {
      total: { type: Number, default: 0 },
      available: { type: Number, default: 0 },
    },
    specialties: [
      {
        type: String,
        enum: [
          "cardiology",
          "trauma",
          "neurology",
          "orthopedics",
          "pediatrics",
          "burns",
          "maternity",
          "general",
        ],
      },
    ],
    isAcceptingEmergencies: { type: Boolean, default: true },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

hospitalSchema.index({ location: "2dsphere" });

const Hospital = mongoose.model("Hospital", hospitalSchema);
module.exports = Hospital;
