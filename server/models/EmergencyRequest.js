const mongoose = require('mongoose');
const { REQUEST_STATUS, EMERGENCY_TYPE, PRIORITY_SCORES } = require('../utils/constants');

const emergencyRequestSchema = new mongoose.Schema(
  {
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pickupLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
    pickupAddress: { type: String, default: '' },
    emergencyType: {
      type: String,
      enum: Object.values(EMERGENCY_TYPE),
      required: true,
    },
    priorityScore: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(REQUEST_STATUS),
      default: REQUEST_STATUS.PENDING,
    },
    assignedAmbulanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Ambulance',
      default: null,
    },
    assignedHospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Hospital',
      default: null,
    },
    assignmentAttempts: { type: Number, default: 0 },
    description: { type: String, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

// Auto-set priority score when request is created
emergencyRequestSchema.pre('save', function (next) {
  if (this.isNew) {
    this.priorityScore = PRIORITY_SCORES[this.emergencyType] || 50;
  }
  next();
});

emergencyRequestSchema.index({ pickupLocation: '2dsphere' });
emergencyRequestSchema.index({ status: 1, createdAt: -1 });

const EmergencyRequest = mongoose.model('EmergencyRequest', emergencyRequestSchema);
module.exports = EmergencyRequest;