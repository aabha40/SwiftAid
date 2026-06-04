const AuditLog = require("../models/AuditLog");

const log = async ({
  actorId = null,
  actorRole = "system",
  action,
  resourceId = null,
  resourceType = null,
  details = {},
  ipAddress = null,
}) => {
  try {
    await AuditLog.create({
      actorId,
      actorRole,
      action,
      resourceId,
      resourceType,
      details,
      ipAddress,
    });
  } catch (error) {
    // Never crash the app because of a logging failure
    console.error(`⚠️  Audit log failed for "${action}": ${error.message}`);
  }
};

module.exports = { log };
