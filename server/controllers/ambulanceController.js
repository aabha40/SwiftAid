const Ambulance = require("../models/Ambulance");
const User = require("../models/User");
const redis = require("../config/redis");
const auditLogger = require("../services/auditLogger");
const { AMBULANCE_STATUS, REDIS_KEYS } = require("../utils/constants");

// ─────────────────────────────────────────────────────────
// POST /api/ambulances
// Who can use: super_admin only
// What it does: adds a new ambulance to the fleet
// ─────────────────────────────────────────────────────────
const addAmbulance = async (req, res, next) => {
  try {
    const { vehicleNumber, ambulanceType, driverId } = req.body;

    // If a driverId is provided, check that driver actually exists
    // and has the role 'driver' — you can't assign a patient as a driver
    if (driverId) {
      const driver = await User.findById(driverId);

      if (!driver || driver.role !== "driver") {
        return res.status(400).json({
          success: false,
          message: "Provided driverId does not belong to a valid driver.",
        });
      }

      // Update the driver's user record to link them to this ambulance
      // This creates a two-way link: ambulance knows driver, driver knows ambulance
      await User.findByIdAndUpdate(driverId, { ambulanceId: null });
    }

    const ambulance = await Ambulance.create({
      vehicleNumber,
      ambulanceType,
      driverId: driverId || null,
    });

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: "AMBULANCE_ADDED",
      resourceId: ambulance._id,
      resourceType: "Ambulance",
      details: { vehicleNumber, ambulanceType },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: "Ambulance added to fleet successfully.",
      ambulance,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/ambulances
// Who can use: super_admin only
// What it does: returns all ambulances with driver details
// ─────────────────────────────────────────────────────────
const getAllAmbulances = async (req, res, next) => {
  try {
    // .populate() fetches the full driver document instead of just the ID
    // We only get name, email, phone — not password (select field)
    const ambulances = await Ambulance.find()
      .populate("driverId", "name email phone")
      .populate("currentTripId");

    res.status(200).json({
      success: true,
      count: ambulances.length,
      ambulances,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/ambulances/my
// Who can use: driver only
// What it does: driver sees their own assigned ambulance
// ─────────────────────────────────────────────────────────
const getMyAmbulance = async (req, res, next) => {
  try {
    // req.user is the logged-in driver (set by protect middleware)
    const ambulance = await Ambulance.findOne({ driverId: req.user._id });

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "No ambulance assigned to you yet. Contact admin.",
      });
    }

    res.status(200).json({
      success: true,
      ambulance,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// PATCH /api/ambulances/status
// Who can use: driver only
// What it does: driver updates their ambulance status
//
// THIS IS IMPORTANT — when a driver goes online (available),
// we add them to the Redis geo pool so they can be matched.
// When they go offline, we remove them from Redis.
// ─────────────────────────────────────────────────────────
const updateStatus = async (req, res, next) => {
  try {
    const { status, longitude, latitude } = req.body;

    // Validate the status value
    if (!Object.values(AMBULANCE_STATUS).includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Object.values(AMBULANCE_STATUS).join(", ")}`,
      });
    }

    // Find the ambulance assigned to this driver
    const ambulance = await Ambulance.findOne({ driverId: req.user._id });

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "No ambulance assigned to you.",
      });
    }

    // Update status in MongoDB (permanent record)
    ambulance.status = status;
    ambulance.lastActiveAt = new Date();

    // If location is provided, update it in MongoDB too
    if (longitude && latitude) {
      ambulance.location = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    await ambulance.save();

    // ── Redis geo pool management ──────────────────────────────
    // When driver is AVAILABLE → add to Redis geo pool
    // This is the pool the geo-matching engine searches in Phase 3
    if (status === AMBULANCE_STATUS.AVAILABLE && longitude && latitude) {
      // GEOADD key longitude latitude member
      // member = ambulance ID (so we know which ambulance it is)
      await redis.geoadd(
        REDIS_KEYS.AMBULANCE_GEO,
        parseFloat(longitude),
        parseFloat(latitude),
        ambulance._id.toString(),
      );
      console.log(`📍 Ambulance ${ambulance.vehicleNumber} added to geo pool`);
    }

    // When driver goes OFFLINE or BUSY → remove from Redis geo pool
    // We don't want offline/busy ambulances to be matched to new requests
    if (
      status === AMBULANCE_STATUS.OFFLINE ||
      status === AMBULANCE_STATUS.BUSY
    ) {
      await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulance._id.toString());
      console.log(
        `🔴 Ambulance ${ambulance.vehicleNumber} removed from geo pool`,
      );
    }

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: "driver",
      action: "AMBULANCE_STATUS_UPDATED",
      resourceId: ambulance._id,
      resourceType: "Ambulance",
      details: { oldStatus: ambulance.status, newStatus: status },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Status updated to ${status}`,
      ambulance,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// PATCH /api/ambulances/:id/assign-driver
// Who can use: super_admin only
// What it does: assigns a driver to an ambulance
// ─────────────────────────────────────────────────────────
const assignDriver = async (req, res, next) => {
  try {
    const { driverId } = req.body;
    const ambulanceId = req.params.id;

    const driver = await User.findById(driverId);
    if (!driver || driver.role !== "driver") {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID.",
      });
    }

    const ambulance = await Ambulance.findByIdAndUpdate(
      ambulanceId,
      { driverId },
      { returnDocument: 'after' }, // new:true returns the UPDATED document, not the old one
    );

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "Ambulance not found.",
      });
    }

    // Link ambulance to driver's profile
    await User.findByIdAndUpdate(driverId, { ambulanceId });

    res.status(200).json({
      success: true,
      message: "Driver assigned successfully.",
      ambulance,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addAmbulance,
  getAllAmbulances,
  getMyAmbulance,
  updateStatus,
  assignDriver,
};
