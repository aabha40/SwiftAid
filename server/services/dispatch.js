// ─────────────────────────────────────────────────────────────────
// services/dispatch.js — Shared assignment logic + priority queue
// ─────────────────────────────────────────────────────────────────
//
// WHY THIS FILE EXISTS:
//   Two different moments need to "assign ambulance X to request Y":
//     1. A patient just requested one and we found one immediately
//        (createRequest, synchronous, has req/res)
//     2. An ambulance just became free (trip completed, or driver
//        went online) and there are patients WAITING in the queue
//        (async, triggered from a status update, no req/res)
//   Both paths do the identical set of steps — find hospital, calc
//   ETA, create Trip, decrement beds, notify, push first-aid.
//   This file has that logic ONCE so it can't drift out of sync.
//
// THE QUEUE ITSELF:
//   There is no separate queue data structure. A "queued" request
//   is simply an EmergencyRequest with status=PENDING and
//   assignedAmbulanceId=null. The pickupLocation 2dsphere index
//   (already on the model) lets us find waiting patients near a
//   newly-freed ambulance without scanning the whole collection.
// ─────────────────────────────────────────────────────────────────

const EmergencyRequest = require('../models/EmergencyRequest');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const Trip = require('../models/Trip');
const User = require('../models/User');
const redis = require('../config/redis');
const { getIO } = require('../config/socket');
const { findBestHospital, haversineDistance } = require('./hospitalScore');
const { calculateETA } = require('./eta');
const auditLogger = require('./auditLogger');
const { REDIS_KEYS, TIMEOUTS, REQUEST_STATUS, AMBULANCE_STATUS } = require('../utils/constants');
const {
  notifyPatientAmbulanceAssigned,
  notifyDriverNewRequest,
  notifyHospitalIncomingPatient,
} = require('./notification');

// ── Assign a specific ambulance to a specific request ──────────────
// Caller is responsible for making sure `ambulance` is actually
// claimed/BUSY before calling this — this function does the
// "what happens after we've decided who's going" part only.
//
// Returns { trip, hospitalResult, etaMinutes, distanceKm }
const assignAmbulanceToRequest = async (emergencyRequest, ambulance, distanceKm, triage) => {
  const { lng, lat } = {
    lng: emergencyRequest.pickupLocation.coordinates[0],
    lat: emergencyRequest.pickupLocation.coordinates[1],
  };

  // ── Find best hospital ──────────────────────────────────────────
  const hospitalResult = await findBestHospital(lng, lat, emergencyRequest.emergencyType);

  // ── Calculate ETA ───────────────────────────────────────────────
  const etaMinutes = calculateETA(distanceKm);

  // ── Update the emergency request ────────────────────────────────
  emergencyRequest.status = REQUEST_STATUS.ASSIGNED;
  emergencyRequest.assignedAmbulanceId = ambulance._id;
  emergencyRequest.assignedHospitalId = hospitalResult?.hospital?._id || null;
  emergencyRequest.assignmentAttempts += 1;
  await emergencyRequest.save();

  // ── Create the Trip record ──────────────────────────────────────
  const trip = await Trip.create({
    requestId: emergencyRequest._id,
    ambulanceId: ambulance._id,
    patientId: emergencyRequest.patientId,
    hospitalId: hospitalResult?.hospital?._id || null,
    estimatedArrivalMinutes: etaMinutes,
    distanceKm: parseFloat(distanceKm.toFixed(2)),
    timeline: {
      requestedAt: emergencyRequest.createdAt,
      assignedAt: new Date(),
    },
  });

  await Ambulance.findByIdAndUpdate(ambulance._id, { currentTripId: trip._id });

  // ── Decrement hospital bed count ────────────────────────────────
  if (hospitalResult?.hospital?._id) {
    await Hospital.findByIdAndUpdate(hospitalResult.hospital._id, {
      $inc: { availableBeds: -1, 'emergencyCapacity.available': -1 },
    });
  }

  // ── Push first-aid instructions over Socket.io ──────────────────
  if (triage?.firstAidSteps?.length > 0) {
    try {
      getIO().to(trip._id.toString()).emit('first_aid_instructions', {
        tripId: trip._id.toString(),
        severityLevel: triage.severityLevel,
        suspectedCondition: triage.suspectedCondition,
        steps: triage.firstAidSteps,
      });
    } catch (socketError) {
      console.error(`⚠️  Could not emit first_aid_instructions: ${socketError.message}`);
    }
  }

  // ── Notifications ────────────────────────────────────────────────
  const patient = emergencyRequest.patientId?.fcmToken
    ? emergencyRequest.patientId
    : await User.findById(emergencyRequest.patientId);

  if (patient?.fcmToken) {
    await notifyPatientAmbulanceAssigned(patient.fcmToken, {
      vehicleNumber: ambulance.vehicleNumber,
      etaMinutes,
      driverName: ambulance.driverId?.name || 'Driver',
      tripId: trip._id.toString(),
    });
  }

  if (ambulance.driverId?.fcmToken) {
    await notifyDriverNewRequest(ambulance.driverId.fcmToken, {
      requestId: emergencyRequest._id.toString(),
      emergencyType: emergencyRequest.emergencyType,
      distanceKm: parseFloat(distanceKm.toFixed(2)),
    });
  }

  if (hospitalResult?.hospital?.adminId) {
    const hospitalAdmin = await User.findById(hospitalResult.hospital.adminId);
    if (hospitalAdmin?.fcmToken) {
      await notifyHospitalIncomingPatient(hospitalAdmin.fcmToken, {
        emergencyType: emergencyRequest.emergencyType,
        etaMinutes,
        tripId: trip._id.toString(),
      });
    }
  }

  await auditLogger.log({
    actorId: emergencyRequest.patientId,
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
      viaQueue: !!emergencyRequest.__wasQueued,
    },
  });

  console.log(`✅ Assigned: ${ambulance.vehicleNumber} → Request ${emergencyRequest._id} | ${distanceKm.toFixed(2)}km | ETA: ${etaMinutes} mins`);

  return { trip, hospitalResult, etaMinutes };
};

// ── Try to dispatch a freshly-available ambulance to the highest- ──
// priority waiting patient nearby. Called whenever an ambulance
// transitions to AVAILABLE (trip completed, or driver comes online).
//
// If nothing is found, the ambulance is left/returned to the Redis
// geo pool exactly as normal — this function is a no-op in the
// common case where there's no backlog.
const tryDispatchQueuedRequest = async (ambulanceId) => {
  // ── Atomically claim the ambulance so a live createRequest() ────
  // racing against us can't grab it mid-way through this check.
  const ambulance = await Ambulance.findOneAndUpdate(
    { _id: ambulanceId, status: AMBULANCE_STATUS.AVAILABLE },
    { status: AMBULANCE_STATUS.BUSY },
    { returnDocument: 'after' }
  ).populate('driverId', 'name phone fcmToken');

  if (!ambulance) return; // already claimed by something else, or offline

  // Pull it out of the Redis geo pool so findNearestAmbulance() can't
  // also match it while we're deciding.
  await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulanceId.toString());

  try {
    const [lng, lat] = ambulance.location.coordinates;
    const radiusKm = TIMEOUTS.GEO_MAX_RADIUS_KM;
    const radiusRadians = radiusKm / 6378.1; // Earth's radius in km

    // Candidates: waiting requests within radius, highest AI/static
    // priority first, oldest wait time as tiebreaker. $geoWithin
    // (not $near) so we control sort order ourselves instead of
    // being forced to sort by distance.
    const candidates = await EmergencyRequest.find({
      status: REQUEST_STATUS.PENDING,
      assignedAmbulanceId: null,
      pickupLocation: {
        $geoWithin: { $centerSphere: [[lng, lat], radiusRadians] },
      },
    })
      .sort({ priorityScore: -1, createdAt: 1 })
      .limit(5)
      .populate('patientId', 'fcmToken');

    if (candidates.length === 0) {
      // Nobody waiting nearby — release the ambulance back to normal service
      await Ambulance.findByIdAndUpdate(ambulanceId, { status: AMBULANCE_STATUS.AVAILABLE });
      await redis.geoadd(REDIS_KEYS.AMBULANCE_GEO, lng, lat, ambulanceId.toString());
      return;
    }

    // Defensive check: skip any candidate whose patientId reference is
    // broken (e.g. the patient account was deleted after the request
    // was created). populate() silently returns null for a dangling
    // ref, and Trip.create() requires patientId, so picking a broken
    // one would crash the whole assignment instead of just skipping it.
    const request = candidates.find((c) => c.patientId != null);

    if (!request) {
      console.warn(`⚠️  All ${candidates.length} queued candidate(s) near ${ambulance.vehicleNumber} have broken patientId references — skipping, releasing ambulance.`);
      await Ambulance.findByIdAndUpdate(ambulanceId, { status: AMBULANCE_STATUS.AVAILABLE });
      await redis.geoadd(REDIS_KEYS.AMBULANCE_GEO, lng, lat, ambulanceId.toString());
      return;
    }

    request.__wasQueued = true;

    const distanceKm = haversineDistance(
      lat, lng,
      request.pickupLocation.coordinates[1],
      request.pickupLocation.coordinates[0]
    );

    console.log(`📋 Dispatching queued request ${request._id} (priority ${request.priorityScore}) to freed ambulance ${ambulance.vehicleNumber}`);

    // Reconstruct the triage payload from stored fields so the
    // patient still gets their first-aid push even though the AI
    // call happened minutes ago, back when the request was created.
    const triage = {
      severityLevel: request.aiSeverityLevel,
      suspectedCondition: request.aiSuspectedCondition,
      firstAidSteps: request.firstAidSteps,
    };

    await assignAmbulanceToRequest(request, ambulance, distanceKm, triage);
  } catch (error) {
    // Something went wrong picking/assigning a queued request —
    // don't strand the ambulance as permanently BUSY over it.
    console.error(`❌ tryDispatchQueuedRequest error: ${error.message}`);
    await Ambulance.findByIdAndUpdate(ambulanceId, { status: AMBULANCE_STATUS.AVAILABLE });
    const [lng, lat] = ambulance.location.coordinates;
    await redis.geoadd(REDIS_KEYS.AMBULANCE_GEO, lng, lat, ambulanceId.toString());
  }
};

module.exports = { assignAmbulanceToRequest, tryDispatchQueuedRequest };