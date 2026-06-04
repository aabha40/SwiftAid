const ROLES = {
  PATIENT: "patient",
  DRIVER: "driver",
  HOSPITAL_ADMIN: "hospital_admin",
  SUPER_ADMIN: "super_admin",
};

const AMBULANCE_STATUS = {
  AVAILABLE: "available",
  BUSY: "busy",
  OFFLINE: "offline",
};

const REQUEST_STATUS = {
  PENDING: "pending",
  ASSIGNED: "assigned",
  ACCEPTED: "accepted",
  EN_ROUTE: "en_route",
  ARRIVED: "arrived",
  HOSPITAL_BOUND: "hospital_bound",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  FAILED: "failed",
};

const EMERGENCY_TYPE = {
  CARDIAC: "cardiac",
  TRAUMA: "trauma",
  RESPIRATORY: "respiratory",
  GENERAL: "general",
  NON_EMERGENCY: "non_emergency",
};

const PRIORITY_SCORES = {
  cardiac: 100,
  trauma: 80,
  respiratory: 70,
  general: 50,
  non_emergency: 10,
};

const REDIS_KEYS = {
  AMBULANCE_GEO: "ambulance:geo",
  REQUEST_QUEUE: "request:priority_queue",
  DRIVER_HEARTBEAT: (driverId) => `driver:heartbeat:${driverId}`,
  RATE_LIMIT: (ip) => `rate:${ip}`,
};

const TIMEOUTS = {
  DRIVER_ACCEPT_MS: 30000,
  HEARTBEAT_TTL_SEC: 90,
  HEARTBEAT_INTERVAL_MS: 30000,
  GEO_SEARCH_RADIUS_KM: 10,
  GEO_MAX_RADIUS_KM: 50,
  HOSPITAL_SEARCH_RADIUS_KM: 20,
};

module.exports = {
  ROLES,
  AMBULANCE_STATUS,
  REQUEST_STATUS,
  EMERGENCY_TYPE,
  PRIORITY_SCORES,
  REDIS_KEYS,
  TIMEOUTS,
};
