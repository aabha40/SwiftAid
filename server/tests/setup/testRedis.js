// ─────────────────────────────────────────────────────────────────
// tests/setup/testRedis.js — Clean the Redis geo pool between tests
// ─────────────────────────────────────────────────────────────────
//
// Reuses your existing dev Redis instance (no separate test Redis
// needed) — geo-matching tests just need the ambulance geo pool key
// cleared between tests so leftover ambulances from one test don't
// silently get "found" by the next test.

const redis = require('../../config/redis');
const { REDIS_KEYS } = require('../../utils/constants');

const clearGeoPool = async () => {
  await redis.del(REDIS_KEYS.AMBULANCE_GEO);
};

const closeRedis = async () => {
  await redis.quit();
};

module.exports = { clearGeoPool, closeRedis };