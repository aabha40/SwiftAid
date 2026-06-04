const Hospital = require("../models/Hospital");
const User = require("../models/User");
const auditLogger = require("../services/auditLogger");

// ─────────────────────────────────────────────────────────
// POST /api/hospitals
// Who can use: super_admin only
// What it does: registers a new hospital in the system
// ─────────────────────────────────────────────────────────
const addHospital = async (req, res, next) => {
  try {
    const {
      name,
      registrationNumber,
      longitude,
      latitude,
      address,
      phone,
      totalBeds,
      availableBeds,
      emergencyCapacity,
      specialties,
      adminId,
    } = req.body;

    // Validate that availableBeds never exceeds totalBeds
    if (availableBeds > totalBeds) {
      return res.status(400).json({
        success: false,
        message: "Available beds cannot exceed total beds.",
      });
    }

    const hospital = await Hospital.create({
      name,
      registrationNumber,
      // Store location in GeoJSON format
      // REMEMBER: coordinates = [longitude, latitude] — longitude FIRST
      location: {
        type: "Point",
        coordinates: [parseFloat(longitude), parseFloat(latitude)],
      },
      address,
      phone,
      totalBeds,
      availableBeds,
      emergencyCapacity,
      specialties,
      adminId: adminId || null,
    });

    // If an adminId is provided, link this hospital to that admin user
    if (adminId) {
      await User.findByIdAndUpdate(adminId, { hospitalId: hospital._id });
    }

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: req.user.role,
      action: "HOSPITAL_ADDED",
      resourceId: hospital._id,
      resourceType: "Hospital",
      details: { name, registrationNumber },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      message: "Hospital added successfully.",
      hospital,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/hospitals
// Who can use: super_admin only
// What it does: returns all hospitals
// ─────────────────────────────────────────────────────────
const getAllHospitals = async (req, res, next) => {
  try {
    const hospitals = await Hospital.find().populate(
      "adminId",
      "name email phone",
    );

    res.status(200).json({
      success: true,
      count: hospitals.length,
      hospitals,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/hospitals/my
// Who can use: hospital_admin only
// What it does: hospital admin sees their own hospital
// ─────────────────────────────────────────────────────────
const getMyHospital = async (req, res, next) => {
  try {
    // req.user.hospitalId was set when super admin linked them
    const hospital = await Hospital.findById(req.user.hospitalId);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "No hospital linked to your account. Contact super admin.",
      });
    }

    res.status(200).json({
      success: true,
      hospital,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// PATCH /api/hospitals/beds
// Who can use: hospital_admin only
// What it does: updates available bed count
//
// THIS IS THE MAIN USP OF SWIFTAID
// Hospital admin updates this in real time as patients arrive/leave
// Our routing algorithm in Phase 5 reads this to pick the best hospital
// ─────────────────────────────────────────────────────────
const updateBeds = async (req, res, next) => {
  try {
    const { availableBeds, emergencyAvailable } = req.body;

    const hospital = await Hospital.findById(req.user.hospitalId);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "No hospital linked to your account.",
      });
    }

    // Validate — can't have more available beds than total beds
    if (availableBeds !== undefined && availableBeds > hospital.totalBeds) {
      return res.status(400).json({
        success: false,
        message: `Available beds (${availableBeds}) cannot exceed total beds (${hospital.totalBeds}).`,
      });
    }

    // Store old values for audit log
    const oldBeds = hospital.availableBeds;
    const oldEmergency = hospital.emergencyCapacity.available;

    // Update the values
    if (availableBeds !== undefined) {
      hospital.availableBeds = availableBeds;
    }

    if (emergencyAvailable !== undefined) {
      hospital.emergencyCapacity.available = emergencyAvailable;
    }

    // Auto-set isAcceptingEmergencies based on bed availability
    // If no beds available → stop accepting emergencies automatically
    hospital.isAcceptingEmergencies = hospital.availableBeds > 0;

    await hospital.save();

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: "hospital_admin",
      action: "HOSPITAL_BEDS_UPDATED",
      resourceId: hospital._id,
      resourceType: "Hospital",
      details: {
        oldAvailableBeds: oldBeds,
        newAvailableBeds: availableBeds,
        oldEmergencyAvailable: oldEmergency,
        newEmergencyAvailable: emergencyAvailable,
      },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: "Bed availability updated.",
      hospital,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────
// PATCH /api/hospitals/:id/toggle-emergency
// Who can use: hospital_admin only
// What it does: manually toggle emergency acceptance on/off
// ─────────────────────────────────────────────────────────
const toggleEmergency = async (req, res, next) => {
  try {
    const hospital = await Hospital.findById(req.user.hospitalId);

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "No hospital linked to your account.",
      });
    }

    // Flip the boolean value
    hospital.isAcceptingEmergencies = !hospital.isAcceptingEmergencies;
    await hospital.save();

    res.status(200).json({
      success: true,
      message: `Emergency acceptance turned ${hospital.isAcceptingEmergencies ? "ON" : "OFF"}`,
      isAcceptingEmergencies: hospital.isAcceptingEmergencies,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addHospital,
  getAllHospitals,
  getMyHospital,
  updateBeds,
  toggleEmergency,
};
