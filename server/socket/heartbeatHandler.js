// ─────────────────────────────────────────────────────────────────
// socket/heartbeatHandler.js — Ambulance offline detection
// ─────────────────────────────────────────────────────────────────
//
// HOW TTL-BASED OFFLINE DETECTION WORKS:
//   Driver sends heartbeat → we SET a Redis key with 90s expiry
//   Driver sends heartbeat → we RESET the 90s timer
//   Driver disconnects  → timer runs out → key expires
//   We check Redis → key gone → mark ambulance OFFLINE
//
// Redis TTL (Time To Live):
//   SET key value EX 90
//   After 90 seconds, Redis automatically DELETES this key.
//   We don't need a cron job — Redis handles expiry natively.
// ─────────────────────────────────────────────────────────────────

const redis = require('../config/redis');
const Ambulance = require('../models/Ambulance');
const { REDIS_KEYS, TIMEOUTS, AMBULANCE_STATUS } = require('../utils/constants');

// Called when driver sends a heartbeat ping
const handleHeartbeat = async (socket, data) => {
  try {
    const { ambulanceId, longitude, latitude } = data;

    if (!ambulanceId) return;

    // Reset the TTL key — driver is alive
    // EX = expire in seconds
    // Every heartbeat resets the 90s countdown
    await redis.set(
      REDIS_KEYS.DRIVER_HEARTBEAT(ambulanceId),
      'alive',
      'EX',
      TIMEOUTS.HEARTBEAT_TTL_SEC // 90 seconds
    );

    // Update last active time in MongoDB
    await Ambulance.findByIdAndUpdate(ambulanceId, {
      lastActiveAt: new Date(),
    });

    // Acknowledge back to driver
    socket.emit('heartbeat_ack', {
      ambulanceId,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error(`❌ Heartbeat error: ${error.message}`);
  }
};

// Called when driver's socket disconnects
// Socket.io fires 'disconnect' event automatically
const handleDriverDisconnect = async (ambulanceId) => {
  try {
    if (!ambulanceId) return;

    console.log(`⚠️  Driver disconnected: ambulance ${ambulanceId}`);

    // Remove heartbeat key from Redis
    await redis.del(REDIS_KEYS.DRIVER_HEARTBEAT(ambulanceId));

    // Mark ambulance as OFFLINE in MongoDB
    const ambulance = await Ambulance.findByIdAndUpdate(
      ambulanceId,
      { status: AMBULANCE_STATUS.OFFLINE },
      { new: true }
    );

    if (ambulance) {
      // Remove from Redis geo pool — offline ambulances
      // should never be matched to new requests
      await redis.zrem(REDIS_KEYS.AMBULANCE_GEO, ambulanceId);
      console.log(`🔴 Ambulance ${ambulance.vehicleNumber} marked OFFLINE`);
    }

  } catch (error) {
    console.error(`❌ Disconnect handler error: ${error.message}`);
  }
};

module.exports = { handleHeartbeat, handleDriverDisconnect };