const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: { type: String, default: "system" },
    action: { type: String, required: true },
    resourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    resourceType: { type: String, default: null },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, default: null },
  },
  {
    timestamps: true,
    capped: { size: 104857600, max: 10000 },
  },
);

const AuditLog = mongoose.model("AuditLog", auditLogSchema);
module.exports = AuditLog;
