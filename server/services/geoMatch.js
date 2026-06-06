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
//   GEOADD      key lng lat member  → add/update a location
//   GEOSEARCH   key FROMLONLAT ...  → find nearby (Redis 6.2+)
//   GEORADIUS   key lng lat radius  → find nearby (older Redis)
//
// WHY TWO COMMANDS?
//   GEOSEARCH is the modern command (Redis 6.2+).
//   Memurai on Windows may use an older Redis version
//   that only supports GEORADIUS. We try GEOSEARCH first,
//   fall back to GEORADIUS if it fails.
// ─────────────────────────────────────────────────────────────────

const redis = require("../config/redis");
const Ambulance = require("../models/Ambulance");
const { REDIS_KEYS, TIMEOUTS, AMBULANCE_STATUS } = require("../utils/constants");

// ── Find nearest available ambulance ─────────────────────────────
// lng, lat = patient's location
// Returns { ambulance, distanceKm } or null if none found
const findNearestAmbulance = async (lng, lat) => {
  // Try increasing radius until we find an ambulance
  const radii = [
    TIMEOUTS.GEO_SEARCH_RADIUS_KM,       // 10km — first try
    TIMEOUTS.GEO_SEARCH_RADIUS_KM * 2,   // 20km — second try
    TIMEOUTS.GEO_MAX_RADIUS_KM,          // 50km — last resort
  ];

  for (const radius of radii) {
    console.log(`🔍 Searching for ambulance within ${radius}km...`);

    // Run geo query with fallback for Redis version compatibility
    const results = await runGeoSearch(lng, lat, radius);

    if (!results || results.length === 0) {
      console.log(`⚠️  No ambulances found within ${radius}km, expanding...`);
      continue;
    }

    // results format:
    // [ ['ambulanceId1', '2.34', ['81.62', '21.25']], ... ]
    // Index 0 = ambulance ID
    // Index 1 = distance in km
    // Index 2 = [longitude, latitude]

    // Try each ambulance nearest first
    for (const result of results) {
      const ambulanceId = result[0];
      const distanceKm = parseFloat(result[1]);

      // Skip if distance is invalid
      if (isNaN(distanceKm)) continue;

      // Atomically claim this ambulance
      // Prevents two simultaneous requests from getting the same ambulance
      const claimed = await claimAmbulance(ambulanceId);

      if (claimed) {
        // Fetch full ambulance details from MongoDB
        const ambulance = await Ambulance.findById(ambulanceId)
          .populate("driverId", "name phone fcmToken");

        // Safety check — ambulance might have been deleted from MongoDB
        if (!ambulance) {
          console.warn(`⚠️  Ambulance ${ambulanceId} found in Redis but not in MongoDB — skipping`);
          await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulanceId); // clean up stale Redis entry
          continue;
        }

        // Double check ambulance is actually available in MongoDB
        // Redis and MongoDB can get out of sync in edge cases
        if (ambulance.status === AMBULANCE_STATUS.BUSY) {
          console.warn(`⚠️  Ambulance ${ambulance.vehicleNumber} is BUSY in MongoDB but was in Redis pool — cleaning up`);
          await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulanceId);
          continue;
        }

        console.log(`✅ Ambulance ${ambulance.vehicleNumber} claimed at ${distanceKm.toFixed(2)}km`);
        return { ambulance, distanceKm };
      }

      // Not claimed — someone else got it, try next nearest
      console.log(`⏭️  Ambulance ${ambulanceId} already claimed, trying next...`);
    }
  }

  console.log("❌ No available ambulances found in any radius");
  return null;
};

// ── Run geo search with Redis version fallback ────────────────────
// Tries GEOSEARCH (Redis 6.2+) first
// Falls back to GEORADIUS (older Redis / Memurai) if needed
const runGeoSearch = async (lng, lat, radius) => {
  try {
    // GEOSEARCH — modern Redis 6.2+ command
    const results = await redis.call(
      "GEOSEARCH",
      REDIS_KEYS.AMBULANCE_GEO,
      "FROMLONLAT", lng, lat,
      "BYRADIUS", radius, "km",
      "ASC",
      "COUNT", 10,
      "WITHCOORD",
      "WITHDIST"
    );
    return results;

  } catch (geoSearchError) {
    // GEOSEARCH failed — try older GEORADIUS command
    console.warn(`⚠️  GEOSEARCH not supported, trying GEORADIUS...`);

    try {
      const results = await redis.georadius(
        REDIS_KEYS.AMBULANCE_GEO,
        lng, lat,
        radius, "km",
        "ASC",
        "COUNT", 10,
        "WITHCOORD",
        "WITHDIST"
      );
      return results;

    } catch (geoRadiusError) {
      console.error(`❌ Both geo queries failed: ${geoRadiusError.message}`);
      return [];
    }
  }
};

// ── Atomically claim an ambulance ────────────────────────────────
// Uses Redis SET NX (set if not exists) as a distributed lock.
// Only ONE request can claim an ambulance at a time.
//
// HOW IT WORKS:
//   SET key value NX EX 30
//   NX = only set if key does NOT already exist
//   EX 30 = auto-delete after 30 seconds (prevents stuck locks on crash)
//   Returns 'OK' if we got the lock, null if someone else has it
//
// Returns true if claimed, false if already taken
const claimAmbulance = async (ambulanceId) => {
  try {
    const lockKey = `lock:ambulance:${ambulanceId}`;

    const result = await redis.set(lockKey, "locked", "NX", "EX", 30);

    if (result === "OK") {
      // We got the lock — remove from geo pool so no one else matches it
      await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulanceId);
      return true;
    }

    return false; // Lock already exists — someone else claimed it

  } catch (error) {
    console.error(`❌ claimAmbulance error: ${error.message}`);
    return false;
  }
};

// ── Release ambulance claim ───────────────────────────────────────
// Called when:
//   1. Assignment fails mid-flow (error cleanup)
//   2. Driver rejects a request (Phase 4 enhancement)
//
// Deletes the Redis lock and optionally adds back to geo pool
const releaseAmbulance = async (ambulanceId, lng, lat) => {
  try {
    const lockKey = `lock:ambulance:${ambulanceId}`;

    // Remove the lock
    await redis.del(lockKey);

    // Add back to geo pool only if valid location provided
    if (lng && lat && !isNaN(parseFloat(lng)) && !isNaN(parseFloat(lat))) {
      await redis.geoadd(
        REDIS_KEYS.AMBULANCE_GEO,
        parseFloat(lng),
        parseFloat(lat),
        ambulanceId
      );
      console.log(`🔓 Ambulance ${ambulanceId} released back to geo pool`);
    } else {
      console.log(`🔓 Ambulance ${ambulanceId} lock released (not added to geo pool — no location)`);
    }

  } catch (error) {
    console.error(`❌ releaseAmbulance error: ${error.message}`);
  }
};

// ── Update ambulance location in Redis ───────────────────────────
// Called by WebSocket location handler every 3 seconds
// Updates the ambulance's position in the geo pool
const updateAmbulanceLocation = async (ambulanceId, lng, lat) => {
  try {
    if (!ambulanceId || isNaN(parseFloat(lng)) || isNaN(parseFloat(lat))) {
      console.warn(`⚠️  updateAmbulanceLocation: invalid params`);
      return;
    }

    await redis.geoadd(
      REDIS_KEYS.AMBULANCE_GEO,
      parseFloat(lng),
      parseFloat(lat),
      ambulanceId
    );

  } catch (error) {
    console.error(`❌ updateAmbulanceLocation error: ${error.message}`);
  }
};

module.exports = {
  findNearestAmbulance,
  claimAmbulance,
  releaseAmbulance,
  updateAmbulanceLocation,
};