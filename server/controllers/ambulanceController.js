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

    // Validate vehicleNumber is provided
    if (!vehicleNumber) {
      return res.status(400).json({
        success: false,
        message: "Vehicle number is required.",
      });
    }

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

      // Check if driver is already assigned to another ambulance
      const existingAmbulance = await Ambulance.findOne({ driverId });
      if (existingAmbulance) {
        return res.status(400).json({
          success: false,
          message: `Driver is already assigned to ambulance ${existingAmbulance.vehicleNumber}. Unassign them first.`,
        });
      }

      // Link ambulance to driver's profile
      await User.findByIdAndUpdate(driverId, { ambulanceId: null });
      // Note: ambulanceId will be updated after ambulance is created below
    }

    const ambulance = await Ambulance.create({
      vehicleNumber,
      ambulanceType: ambulanceType || "basic",
      driverId: driverId || null,
    });

    // If driver provided, update their ambulanceId with the new ambulance's ID
    if (driverId) {
      await User.findByIdAndUpdate(driverId, { ambulanceId: ambulance._id });
    }

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
    const ambulances = await Ambulance.find()
      .populate("driverId", "name email phone")
      .populate("currentTripId")
      .sort({ createdAt: -1 }); // newest first

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
    const ambulance = await Ambulance.findOne({ driverId: req.user._id })
      .populate("currentTripId");

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
// ─────────────────────────────────────────────────────────
const updateStatus = async (req, res, next) => {
  try {
    const { status, longitude, latitude } = req.body;

    // Validate the status value
    if (!status || !Object.values(AMBULANCE_STATUS).includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${Object.values(AMBULANCE_STATUS).join(", ")}`,
      });
    }

    // Location is required when going AVAILABLE
    if (status === AMBULANCE_STATUS.AVAILABLE && (!longitude || !latitude)) {
      return res.status(400).json({
        success: false,
        message: "Longitude and latitude are required when going available.",
      });
    }

    // Find the ambulance assigned to this driver
    const ambulance = await Ambulance.findOne({ driverId: req.user._id });

    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "No ambulance assigned to you. Contact admin.",
      });
    }

    // ── Prevent BUSY status being set manually ────────────────────
    // BUSY is set automatically by the system when a request is assigned
    // Drivers should only set: available or offline
    if (status === AMBULANCE_STATUS.BUSY) {
      return res.status(400).json({
        success: false,
        message: "Cannot manually set status to busy. This is set automatically by the system.",
      });
    }

    // ── Save previous status for audit log ────────────────────────
    // Must save BEFORE changing ambulance.status
    const previousStatus = ambulance.status;

    // ── Update MongoDB ────────────────────────────────────────────
    ambulance.status = status;
    ambulance.lastActiveAt = new Date();

    if (longitude && latitude) {
      ambulance.location = {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      };
    }

    await ambulance.save();

    // ── Redis geo pool management ─────────────────────────────────
    if (status === AMBULANCE_STATUS.AVAILABLE && longitude && latitude) {
      // Add to Redis geo pool — now matchable for requests
      await redis.geoadd(
        REDIS_KEYS.AMBULANCE_GEO,
        parseFloat(longitude),
        parseFloat(latitude),
        ambulance._id.toString()
      );
      console.log(`📍 Ambulance ${ambulance.vehicleNumber} added to geo pool`);
    }

    if (status === AMBULANCE_STATUS.OFFLINE) {
      // Remove from Redis geo pool — offline ambulances must not be matched
      await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulance._id.toString());
      console.log(`🔴 Ambulance ${ambulance.vehicleNumber} removed from geo pool`);
    }

    // ── Audit log with correct old/new status ─────────────────────
    await auditLogger.log({
      actorId: req.user._id,
      actorRole: "driver",
      action: "AMBULANCE_STATUS_UPDATED",
      resourceId: ambulance._id,
      resourceType: "Ambulance",
      details: { oldStatus: previousStatus, newStatus: status },
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

    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: "driverId is required.",
      });
    }

    // Validate driver exists and has correct role
    const driver = await User.findById(driverId);
    if (!driver || driver.role !== "driver") {
      return res.status(400).json({
        success: false,
        message: "Invalid driver ID or user is not a driver.",
      });
    }

    // Check if driver is already assigned to another ambulance
    const alreadyAssigned = await Ambulance.findOne({
      driverId,
      _id: { $ne: ambulanceId }, // exclude current ambulance
    });

    if (alreadyAssigned) {
      return res.status(400).json({
        success: false,
        message: `Driver already assigned to ambulance ${alreadyAssigned.vehicleNumber}.`,
      });
    }

    // Check ambulance exists
    const ambulance = await Ambulance.findById(ambulanceId);
    if (!ambulance) {
      return res.status(404).json({
        success: false,
        message: "Ambulance not found.",
      });
    }

    // If ambulance had a previous driver, unlink them
    if (ambulance.driverId && ambulance.driverId.toString() !== driverId) {
      await User.findByIdAndUpdate(ambulance.driverId, { ambulanceId: null });
      console.log(`🔄 Unlinked previous driver from ambulance`);
    }

    // Assign new driver to ambulance
    ambulance.driverId = driverId;
    await ambulance.save();

    // Link ambulance to driver's user profile (two-way link)
    await User.findByIdAndUpdate(driverId, { ambulanceId: ambulance._id });

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: "DRIVER_ASSIGNED",
      resourceId: ambulance._id,
      resourceType: "Ambulance",
      details: {
        driverId,
        driverName: driver.name,
        vehicleNumber: ambulance.vehicleNumber,
      },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Driver ${driver.name} assigned to ${ambulance.vehicleNumber} successfully.`,
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