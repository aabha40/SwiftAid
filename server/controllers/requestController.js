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
const { classifyEmergency } = require('../services/aiTriage');
const { assignAmbulanceToRequest } = require('../services/dispatch');
const auditLogger = require('../services/auditLogger');
const { REQUEST_STATUS, AMBULANCE_STATUS } = require('../utils/constants');

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

    // ── STEP 1: AI triage — classify severity from description ────
    // Has its own 3s timeout + fallback to static PRIORITY_SCORES,
    // so this can never hang or fail the request flow.
    const triage = await classifyEmergency(description, emergencyType);

    // ── STEP 2: Create the emergency request in MongoDB ───────────
    // Status starts as PENDING
    // priorityScore is auto-set by the pre-save hook, then overridden
    // by the AI triage score (or left as-is if triage fell back).
    const emergencyRequest = await EmergencyRequest.create({
      patientId: req.user._id,
      pickupLocation: {
        type: 'Point',
        coordinates: [lng, lat],
      },
      emergencyType,
      description: description || '',
      status: REQUEST_STATUS.PENDING,
      priorityScore: triage.priorityScore,
      aiSeverityLevel: triage.severityLevel,
      aiSuspectedCondition: triage.suspectedCondition,
      aiReasoning: triage.reasoning,
      firstAidSteps: triage.firstAidSteps,
      aiTriageSource: triage.source,
    });

    console.log(`\n🚨 Emergency: ${emergencyRequest._id} | ${emergencyType.toUpperCase()} | Priority: ${emergencyRequest.priorityScore} | AI severity: ${triage.severityLevel} (${triage.source})`);

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
      // No ambulance available RIGHT NOW — request stays PENDING
      // and un-assigned, which makes it a "queued" request. It will
      // automatically be picked up by tryDispatchQueuedRequest()
      // the moment any ambulance becomes available, ordered by
      // priorityScore (AI-refined severity first, then wait time).
      //
      // IMPORTANT: we still tell the patient to call 108. A software
      // queue is a best-effort improvement, not a substitute for the
      // real emergency line — never let the UI imply otherwise.
      console.log(`⏳ No ambulance available — request ${emergencyRequest._id} queued at priority ${emergencyRequest.priorityScore}`);

      return res.status(202).json({
        success: true,
        queued: true,
        message: 'No ambulance available immediately. You have been placed in the priority queue and will be matched as soon as one is free. If this is life-threatening, please also call 108 now.',
        data: {
          requestId: emergencyRequest._id,
          priorityScore: emergencyRequest.priorityScore,
          aiTriage: {
            severityLevel: triage.severityLevel,
            suspectedCondition: triage.suspectedCondition,
            firstAidSteps: triage.firstAidSteps,
            source: triage.source,
          },
        },
      });
    }

    const { ambulance, distanceKm } = matchResult;
    claimedAmbulanceId = ambulance._id.toString(); // track for cleanup on error

    // ── STEP 3: Mark ambulance BUSY, then run the shared assignment ─
    // flow (hospital match, ETA, Trip creation, notifications, and
    // pushing first-aid instructions over Socket.io). This is the
    // exact same function tryDispatchQueuedRequest() uses when a
    // freed-up ambulance is matched to a WAITING patient instead —
    // one code path, so the two flows can never drift apart.
    await Ambulance.findByIdAndUpdate(ambulance._id, { status: AMBULANCE_STATUS.BUSY });

    const { trip, hospitalResult, etaMinutes } = await assignAmbulanceToRequest(
      emergencyRequest,
      ambulance,
      distanceKm,
      triage
    );

    // ── Send response to patient ────────────────────────────────────
    claimedAmbulanceId = null; // assignment successful — no cleanup needed

    res.status(201).json({
      success: true,
      message: 'Ambulance assigned successfully!',
      data: {
        requestId: emergencyRequest._id,
        tripId: trip._id,
        status: REQUEST_STATUS.ASSIGNED,
        priorityScore: emergencyRequest.priorityScore,
        aiTriage: {
          severityLevel: triage.severityLevel,
          suspectedCondition: triage.suspectedCondition,
          firstAidSteps: triage.firstAidSteps,
          source: triage.source, // 'ai' or 'fallback' — useful to show in demo
        },
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
              latitude: hospitalResult.hospital.location.coordinates[1],
              longitude: hospitalResult.hospital.location.coordinates[0],
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

        // ── Check the priority queue before this ambulance sits idle ──
        // If a patient is waiting nearby, tryDispatchQueuedRequest()
        // re-claims it and assigns it to the highest-priority one.
        // If nobody's waiting, it's a no-op and stays available normally.
        const { tryDispatchQueuedRequest } = require('../services/dispatch');
        tryDispatchQueuedRequest(ambulance._id).catch((err) =>
          console.error(`❌ tryDispatchQueuedRequest failed: ${err.message}`)
        );
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