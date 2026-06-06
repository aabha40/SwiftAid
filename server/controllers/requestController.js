// ─────────────────────────────────────────────────────────────────
// controllers/requestController.js
// The complete emergency request flow
// ─────────────────────────────────────────────────────────────────

const EmergencyRequest = require('../models/EmergencyRequest');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const Trip = require('../models/Trip');
const User = require('../models/User');
const { findNearestAmbulance, releaseAmbulance } = require('../services/geoMatch');
const { findBestHospital } = require('../services/hospitalScore');
const { calculateETA } = require('../services/eta');
const auditLogger = require('../services/auditLogger');
const { REQUEST_STATUS, AMBULANCE_STATUS } = require('../utils/constants');
const {
  notifyPatientAmbulanceAssigned,
  notifyDriverNewRequest,
  notifyHospitalIncomingPatient,
} = require('../services/notification');

// ─────────────────────────────────────────────────────────────────
// POST /api/requests
// Who can use: patient only
// The main flow — patient requests ambulance
// ─────────────────────────────────────────────────────────────────
const createRequest = async (req, res, next) => {
  let claimedAmbulanceId = null; // tracks ambulance for cleanup on error

  try {
    const { emergencyType, longitude, latitude, description } = req.body;

    // ── Validate location ─────────────────────────────────────────
    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Location (longitude and latitude) is required.',
      });
    }

    // ── Validate emergency type ───────────────────────────────────
    const validTypes = ['cardiac', 'trauma', 'respiratory', 'general', 'non_emergency'];
    if (!emergencyType || !validTypes.includes(emergencyType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid emergency type. Must be one of: ${validTypes.join(', ')}`,
      });
    }

    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);

    // ── Validate coordinates are real numbers ─────────────────────
    if (isNaN(lng) || isNaN(lat)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coordinates. Longitude and latitude must be numbers.',
      });
    }

    // ── Validate coordinate ranges ────────────────────────────────
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates out of valid range.',
      });
    }

    // ── STEP 1: Create the emergency request in MongoDB ───────────
    // Status starts as PENDING
    // priorityScore is auto-set by the pre-save hook in EmergencyRequest model
    const emergencyRequest = await EmergencyRequest.create({
      patientId: req.user._id,
      pickupLocation: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      emergencyType,
      description: description || '',
      status: REQUEST_STATUS.PENDING,
    });

    console.log(`\n🚨 Emergency: ${emergencyRequest._id} | ${emergencyType.toUpperCase()} | Priority: ${emergencyRequest.priorityScore}`);

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: 'patient',
      action: 'EMERGENCY_REQUEST_CREATED',
      resourceId: emergencyRequest._id,
      resourceType: 'EmergencyRequest',
      details: { emergencyType, coordinates: [lng, lat] },
      ipAddress: req.ip,
    });

    // ── STEP 2: Find nearest available ambulance via Redis ────────
    const matchResult = await findNearestAmbulance(lng, lat);

    if (!matchResult) {
      // No ambulance found — mark request as failed
      emergencyRequest.status = REQUEST_STATUS.FAILED;
      await emergencyRequest.save();

      return res.status(503).json({
        success: false,
        message: 'No ambulances available right now. Please call 108 immediately.',
        requestId: emergencyRequest._id,
      });
    }

    const { ambulance, distanceKm } = matchResult;
    claimedAmbulanceId = ambulance._id.toString(); // track for cleanup on error

    // ── STEP 3: Find best hospital ────────────────────────────────
    const hospitalResult = await findBestHospital(lng, lat, emergencyType);

    // ── STEP 4: Update ambulance status to BUSY ───────────────────
    await Ambulance.findByIdAndUpdate(ambulance._id, {
      status: AMBULANCE_STATUS.BUSY,
    });

    // ── STEP 5: Calculate ETA ─────────────────────────────────────
    const etaMinutes = calculateETA(distanceKm);

    // ── STEP 6: Update the emergency request ─────────────────────
    emergencyRequest.status = REQUEST_STATUS.ASSIGNED;
    emergencyRequest.assignedAmbulanceId = ambulance._id;
    emergencyRequest.assignedHospitalId = hospitalResult?.hospital?._id || null;
    emergencyRequest.assignmentAttempts += 1;
    await emergencyRequest.save();

    // ── STEP 7: Create a Trip record ──────────────────────────────
    const trip = await Trip.create({
      requestId: emergencyRequest._id,
      ambulanceId: ambulance._id,
      patientId: req.user._id,
      hospitalId: hospitalResult?.hospital?._id || null,
      estimatedArrivalMinutes: etaMinutes,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
      timeline: {
        requestedAt: emergencyRequest.createdAt,
        assignedAt: new Date(),
      },
    });

    // Link trip to ambulance
    await Ambulance.findByIdAndUpdate(ambulance._id, {
      currentTripId: trip._id,
    });

    // ── STEP 8: Decrement hospital bed count ──────────────────────
    // One bed is now reserved for this incoming patient
    if (hospitalResult?.hospital?._id) {
      await Hospital.findByIdAndUpdate(hospitalResult.hospital._id, {
        $inc: {
          availableBeds: -1,
          'emergencyCapacity.available': -1,
        },
      });
      console.log(`🏥 Hospital bed reserved at ${hospitalResult.hospital.name}`);
    }

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: 'patient',
      action: 'AMBULANCE_ASSIGNED',
      resourceId: emergencyRequest._id,
      resourceType: 'EmergencyRequest',
      details: {
        ambulanceId: ambulance._id,
        vehicleNumber: ambulance.vehicleNumber,
        distanceKm: parseFloat(distanceKm.toFixed(2)),
        etaMinutes,
        hospitalName: hospitalResult?.hospital?.name || 'None found',
      },
      ipAddress: req.ip,
    });

    console.log(`✅ Assigned: ${ambulance.vehicleNumber} → Patient | ${distanceKm.toFixed(2)}km | ETA: ${etaMinutes} mins`);

    // ── STEP 9: Send push notifications ──────────────────────────
    // Notify patient — ambulance is coming
    await notifyPatientAmbulanceAssigned(req.user.fcmToken, {
      vehicleNumber: ambulance.vehicleNumber,
      etaMinutes,
      driverName: ambulance.driverId?.name || 'Driver',
      tripId: trip._id.toString(),
    });

    // Notify driver — new request nearby
    if (ambulance.driverId?.fcmToken) {
      await notifyDriverNewRequest(ambulance.driverId.fcmToken, {
        requestId: emergencyRequest._id.toString(),
        emergencyType,
        distanceKm: parseFloat(distanceKm.toFixed(2)),
      });
    }

    // Notify hospital admin — patient is incoming
    if (hospitalResult?.hospital?.adminId) {
      const hospitalAdmin = await User.findById(hospitalResult.hospital.adminId);
      if (hospitalAdmin?.fcmToken) {
        await notifyHospitalIncomingPatient(hospitalAdmin.fcmToken, {
          emergencyType,
          etaMinutes,
          tripId: trip._id.toString(),
        });
      }
    }

    // ── STEP 10: Send response to patient ─────────────────────────
    claimedAmbulanceId = null; // assignment successful — no cleanup needed

    res.status(201).json({
      success: true,
      message: 'Ambulance assigned successfully!',
      data: {
        requestId: emergencyRequest._id,
        tripId: trip._id,
        status: REQUEST_STATUS.ASSIGNED,
        priorityScore: emergencyRequest.priorityScore,
        ambulance: {
          id: ambulance._id,
          vehicleNumber: ambulance.vehicleNumber,
          type: ambulance.ambulanceType,
          distanceKm: parseFloat(distanceKm.toFixed(2)),
          etaMinutes,
          driver: ambulance.driverId
            ? {
                name: ambulance.driverId.name,
                phone: ambulance.driverId.phone,
              }
            : null,
        },
        hospital: hospitalResult
          ? {
              id: hospitalResult.hospital._id,
              name: hospitalResult.hospital.name,
              address: hospitalResult.hospital.address,
              phone: hospitalResult.hospital.phone,
              distanceKm: parseFloat(hospitalResult.distKm.toFixed(2)),
              availableBeds: hospitalResult.hospital.availableBeds,
            }
          : null,
      },
    });

  } catch (error) {
    // ── CLEANUP: Release ambulance if something failed mid-flow ───
    // This prevents ambulances from getting permanently stuck as BUSY
    if (claimedAmbulanceId) {
      try {
        await Ambulance.findByIdAndUpdate(claimedAmbulanceId, {
          status: AMBULANCE_STATUS.AVAILABLE,
          currentTripId: null,
        });
        await releaseAmbulance(claimedAmbulanceId, null, null);
        console.log(`🔄 Released ambulance ${claimedAmbulanceId} after error`);
      } catch (cleanupError) {
        console.error(`❌ Cleanup failed: ${cleanupError.message}`);
      }
    }
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/requests/my
// Who can use: patient only
// Returns all requests made by this patient
// ─────────────────────────────────────────────────────────────────
const getMyRequests = async (req, res, next) => {
  try {
    const requests = await EmergencyRequest.find({ patientId: req.user._id })
      .populate('assignedAmbulanceId', 'vehicleNumber ambulanceType')
      .populate('assignedHospitalId', 'name address phone')
      .sort({ createdAt: -1 }); // newest first

    res.status(200).json({
      success: true,
      count: requests.length,
      requests,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────
// GET /api/requests/:id
// Who can use: patient, driver, hospital_admin, super_admin
// Returns one specific request with full details
// ─────────────────────────────────────────────────────────────────
const getRequestById = async (req, res, next) => {
  try {
    const request = await EmergencyRequest.findById(req.params.id)
      .populate('patientId', 'name phone')
      .populate('assignedAmbulanceId', 'vehicleNumber status location')
      .populate('assignedHospitalId', 'name address phone availableBeds');

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found.',
      });
    }

    res.status(200).json({
      success: true,
      request,
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────
// PATCH /api/requests/:id/status
// Who can use: driver only
// Driver updates trip status (accepted, en_route, arrived, completed)
// ─────────────────────────────────────────────────────────────────
const updateRequestStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const requestId = req.params.id;

    const validStatuses = [
      REQUEST_STATUS.ACCEPTED,
      REQUEST_STATUS.EN_ROUTE,
      REQUEST_STATUS.ARRIVED,
      REQUEST_STATUS.HOSPITAL_BOUND,
      REQUEST_STATUS.COMPLETED,
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Driver can set: ${validStatuses.join(', ')}`,
      });
    }

    const request = await EmergencyRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Request not found.',
      });
    }

    // ── Prevent going backwards in status ────────────────────────
    // Status must progress forward, not backward
    const statusOrder = [
      REQUEST_STATUS.PENDING,
      REQUEST_STATUS.ASSIGNED,
      REQUEST_STATUS.ACCEPTED,
      REQUEST_STATUS.EN_ROUTE,
      REQUEST_STATUS.ARRIVED,
      REQUEST_STATUS.HOSPITAL_BOUND,
      REQUEST_STATUS.COMPLETED,
    ];

    const currentIndex = statusOrder.indexOf(request.status);
    const newIndex = statusOrder.indexOf(status);

    if (newIndex <= currentIndex) {
      return res.status(400).json({
        success: false,
        message: `Cannot change status from '${request.status}' to '${status}'. Status can only move forward.`,
      });
    }

    // ── Update request status ─────────────────────────────────────
    request.status = status;
    await request.save();

    // ── Update trip timeline timestamp ────────────────────────────
    const timelineField = {
      [REQUEST_STATUS.ACCEPTED]:      'timeline.acceptedAt',
      [REQUEST_STATUS.ARRIVED]:       'timeline.arrivedAt',
      [REQUEST_STATUS.COMPLETED]:     'timeline.completedAt',
    };

    if (timelineField[status]) {
      await Trip.findOneAndUpdate(
        { requestId },
        { [timelineField[status]]: new Date() }
      );
    }

    // ── When trip COMPLETED — free ambulance + restore hospital bed ──
    if (status === REQUEST_STATUS.COMPLETED) {
      // Free up the ambulance
      const ambulance = await Ambulance.findById(request.assignedAmbulanceId);
      if (ambulance) {
        ambulance.status = AMBULANCE_STATUS.AVAILABLE;
        ambulance.currentTripId = null;
        ambulance.totalTripsCompleted += 1;
        await ambulance.save();

        // Add ambulance back to Redis geo pool
        const { updateAmbulanceLocation } = require('../services/geoMatch');
        await updateAmbulanceLocation(
          ambulance._id.toString(),
          ambulance.location.coordinates[0],
          ambulance.location.coordinates[1]
        );

        console.log(`🟢 Ambulance ${ambulance.vehicleNumber} is available again`);
      }

      // Restore hospital bed — patient has been delivered
      if (request.assignedHospitalId) {
        await Hospital.findByIdAndUpdate(request.assignedHospitalId, {
          $inc: {
            availableBeds: 1,
            'emergencyCapacity.available': 1,
          },
        });
        console.log(`🏥 Hospital bed restored`);
      }
    }

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: 'driver',
      action: 'REQUEST_STATUS_UPDATED',
      resourceId: requestId,
      resourceType: 'EmergencyRequest',
      details: { newStatus: status },
      ipAddress: req.ip,
    });

    res.status(200).json({
      success: true,
      message: `Status updated to ${status}`,
      status,
    });

  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRequest,
  getMyRequests,
  getRequestById,
  updateRequestStatus,
};