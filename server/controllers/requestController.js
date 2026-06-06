// ─────────────────────────────────────────────────────────────────
// controllers/requestController.js
// The complete emergency request flow
// ─────────────────────────────────────────────────────────────────

const EmergencyRequest = require('../models/EmergencyRequest');
const Ambulance = require('../models/Ambulance');
const Trip = require('../models/Trip');
const { findNearestAmbulance, releaseAmbulance } = require('../services/geoMatch');
const { findBestHospital } = require('../services/hospitalScore');
const { calculateETA } = require('../services/eta');
const auditLogger = require('../services/auditLogger');
const { REQUEST_STATUS, AMBULANCE_STATUS, TIMEOUTS } = require('../utils/constants');
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
  try {
    const { emergencyType, longitude, latitude, description } = req.body;

    // Basic validation
    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Location (longitude and latitude) is required.',
      });
    }

    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);

    // ── STEP 1: Create the emergency request in MongoDB ───────────
    // Status starts as PENDING
    const emergencyRequest = await EmergencyRequest.create({
      patientId: req.user._id,
      pickupLocation: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      emergencyType,
      description: description || '',
      status: REQUEST_STATUS.PENDING,
      // priorityScore is auto-set by the pre-save hook in the model
    });

    console.log(`🚨 New emergency request: ${emergencyRequest._id} | Type: ${emergencyType} | Priority: ${emergencyRequest.priorityScore}`);

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
      // No ambulance found anywhere — mark as failed
      emergencyRequest.status = REQUEST_STATUS.FAILED;
      await emergencyRequest.save();

      return res.status(503).json({
        success: false,
        message: 'No ambulances available right now. Please call 108 immediately.',
        requestId: emergencyRequest._id,
      });
    }

    const { ambulance, distanceKm } = matchResult;

    // ── STEP 3: Find best hospital ────────────────────────────────
    const hospitalResult = await findBestHospital(lng, lat, emergencyType);

    // ── STEP 4: Update ambulance status to BUSY in MongoDB ────────
    await Ambulance.findByIdAndUpdate(
      ambulance._id,
      {
        status: AMBULANCE_STATUS.BUSY,
        // We'll set currentTripId after creating the trip below
      }
    );

    // ── STEP 5: Calculate ETA ─────────────────────────────────────
    const etaMinutes = calculateETA(distanceKm);

    // ── STEP 6: Update the emergency request ─────────────────────
    emergencyRequest.status = REQUEST_STATUS.ASSIGNED;
    emergencyRequest.assignedAmbulanceId = ambulance._id;
    emergencyRequest.assignedHospitalId = hospitalResult
      ? hospitalResult.hospital._id
      : null;
    emergencyRequest.assignmentAttempts += 1;
    await emergencyRequest.save();

    // ── STEP 7: Create a Trip record ──────────────────────────────
    // Trip tracks the full journey with timestamps
    const trip = await Trip.create({
      requestId: emergencyRequest._id,
      ambulanceId: ambulance._id,
      patientId: req.user._id,
      hospitalId: hospitalResult ? hospitalResult.hospital._id : null,
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

    await auditLogger.log({
      actorId: req.user._id,
      actorRole: 'patient',
      action: 'AMBULANCE_ASSIGNED',
      resourceId: emergencyRequest._id,
      resourceType: 'EmergencyRequest',
      details: {
        ambulanceId: ambulance._id,
        vehicleNumber: ambulance.vehicleNumber,
        distanceKm,
        etaMinutes,
        hospitalName: hospitalResult ? hospitalResult.hospital.name : 'Not assigned',
      },
      ipAddress: req.ip,
    });

    console.log(`✅ Assignment complete: ${ambulance.vehicleNumber} → Patient | ETA: ${etaMinutes} mins`);
    // ── STEP 9: Send push notifications ──────────────────────────
const patient = req.user;

// Notify patient their ambulance is coming
await notifyPatientAmbulanceAssigned(patient.fcmToken, {
  vehicleNumber: ambulance.vehicleNumber,
  etaMinutes,
  driverName: ambulance.driverId?.name || 'Driver',
  tripId: trip._id.toString(),
});

// Notify driver about new request
if (ambulance.driverId?.fcmToken) {
  await notifyDriverNewRequest(ambulance.driverId.fcmToken, {
    requestId: emergencyRequest._id.toString(),
    emergencyType,
    distanceKm: parseFloat(distanceKm.toFixed(2)),
  });
}

// Notify hospital admin about incoming patient
if (hospitalResult?.hospital?.adminId) {
  const User = require('../models/User');
  const hospitalAdmin = await User.findById(hospitalResult.hospital.adminId);
  if (hospitalAdmin?.fcmToken) {
    await notifyHospitalIncomingPatient(hospitalAdmin.fcmToken, {
      emergencyType,
      etaMinutes,
      tripId: trip._id.toString(),
    });
  }
}
    // ── STEP 8: Send response to patient ─────────────────────────
    res.status(201).json({
      success: true,
      message: 'Ambulance assigned successfully!',
      data: {
        requestId: emergencyRequest._id,
        tripId: trip._id,
        status: REQUEST_STATUS.ASSIGNED,
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
            }
          : null,
      },
    });

  } catch (error) {
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

    // Update request status
    request.status = status;
    await request.save();

    // Update trip timeline timestamp for this status
    const timelineField = {
      [REQUEST_STATUS.ACCEPTED]: 'acceptedAt',
      [REQUEST_STATUS.ARRIVED]: 'arrivedAt',
      [REQUEST_STATUS.COMPLETED]: 'completedAt',
    };

    if (timelineField[status]) {
      await Trip.findOneAndUpdate(
        { requestId },
        { [`timeline.${timelineField[status]}`]: new Date() }
      );
    }

    // When trip is COMPLETED — free up the ambulance
    if (status === REQUEST_STATUS.COMPLETED) {
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