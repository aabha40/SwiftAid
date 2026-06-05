// ─────────────────────────────────────────────────────────────────
// services/geoMatch.js — Find nearest available ambulance
// ─────────────────────────────────────────────────────────────────
//
// HOW REDIS GEO WORKS:
//   Redis stores locations using a data structure called a
//   "sorted set" where each member's score is a geohash
//   (a number that encodes lat/lng). This lets Redis do
//   radius searches extremely fast — O(N+log(M)) time.
//
//   Commands we use:
//   GEOADD  key lng lat member  → add/update a location
//   GEOSEARCH key FROMMEMBER/FROMLONLAT → find nearby members
// ─────────────────────────────────────────────────────────────────

const redis = require("../config/redis");
const Ambulance = require("../models/Ambulance");
const {
  REDIS_KEYS,
  TIMEOUTS,
  AMBULANCE_STATUS,
} = require("../utils/constants");

// ── Find nearest available ambulance ─────────────────────────────
// lng, lat = patient's location
// Returns the nearest ambulance document or null if none found
const findNearestAmbulance = async (lng, lat) => {
  // Try increasing radius until we find an ambulance
  // Start at 10km, expand to 20km, then 50km
  const radii = [
    TIMEOUTS.GEO_SEARCH_RADIUS_KM, // 10km
    TIMEOUTS.GEO_SEARCH_RADIUS_KM * 2, // 20km
    TIMEOUTS.GEO_MAX_RADIUS_KM, // 50km
  ];

  for (const radius of radii) {
    console.log(`🔍 Searching for ambulance within ${radius}km...`);

    // GEOSEARCH — finds all members within radius km from given point
    // Returns array of: [ [ambulanceId, distance], ... ] sorted by distance
    const results = await redis.call(
      "GEOSEARCH",
      REDIS_KEYS.AMBULANCE_GEO, // the key where ambulance locations are stored
      "FROMLONLAT",
      lng,
      lat, // search from this point
      "BYRADIUS",
      radius,
      "km", // within this radius
      "ASC", // sort nearest first
      "COUNT",
      10, // return max 10 results
      "WITHCOORD", // include coordinates in response
      "WITHDIST", // include distance in response
    );

    if (!results || results.length === 0) {
      console.log(
        `⚠️  No ambulances found within ${radius}km, expanding search...`,
      );
      continue; // try next larger radius
    }

    // results looks like:
    // [ ['ambulanceId1', '2.34', ['81.62', '21.25']], ['ambulanceId2', '5.67', ...] ]
    // Index 0 = ambulance ID, Index 1 = distance in km, Index 2 = coordinates

    // Try each ambulance in order of distance (nearest first)
    for (const result of results) {
      const ambulanceId = result[0];
      const distanceKm = parseFloat(result[1]);

      // Try to atomically claim this ambulance
      // This prevents two simultaneous requests from getting the same ambulance
      const claimed = await claimAmbulance(ambulanceId);

      if (claimed) {
        // Fetch full ambulance details from MongoDB
        const ambulance = await Ambulance.findById(ambulanceId).populate(
          "driverId",
          "name phone fcmToken",
        );

        console.log(
          `✅ Ambulance ${ambulance.vehicleNumber} claimed at ${distanceKm}km`,
        );
        return { ambulance, distanceKm };
      }
      // If not claimed, someone else got it — try the next nearest
    }
  }

  // No ambulance found within any radius
  console.log("❌ No available ambulances found in any radius");
  return null;
};

// ── Atomically claim an ambulance ────────────────────────────────
// Uses Redis SET NX (set if not exists) as a distributed lock
// Only ONE request can claim an ambulance at a time
// Returns true if successfully claimed, false if already claimed
const claimAmbulance = async (ambulanceId) => {
  const lockKey = `lock:ambulance:${ambulanceId}`;

  // SET key value NX EX seconds
  // NX = only set if key does NOT exist (atomic check-and-set)
  // EX 30 = auto-expire after 30 seconds (in case of crash)
  // Returns 'OK' if set successfully, null if key already existed
  const result = await redis.set(lockKey, "locked", "NX", "EX", 30);

  if (result === "OK") {
    // We got the lock — remove ambulance from available geo pool
    // So it won't be matched to other requests
    await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulanceId);
    return true;
  }

  return false; // Someone else claimed it first
};

// ── Release ambulance claim (used if assignment fails) ────────────
const releaseAmbulance = async (ambulanceId, lng, lat) => {
  const lockKey = `lock:ambulance:${ambulanceId}`;

  // Delete the lock
  await redis.del(lockKey);

  // Add back to geo pool if location provided
  if (lng && lat) {
    await redis.geoadd(REDIS_KEYS.AMBULANCE_GEO, lng, lat, ambulanceId);
  }
};

// ── Update ambulance location in Redis ───────────────────────────
// Called by the WebSocket handler in Phase 4 every 3 seconds
const updateAmbulanceLocation = async (ambulanceId, lng, lat) => {
  await redis.geoadd(REDIS_KEYS.AMBULANCE_GEO, lng, lat, ambulanceId);
};

module.exports = {
  findNearestAmbulance,
  claimAmbulance,
  releaseAmbulance,
  updateAmbulanceLocation,
};
