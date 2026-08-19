const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000);
    if (times % 5 === 0) {
      console.warn(`⚠️  Redis retry #${times} in ${delay}ms (still trying, will not give up)`);
    }
    return delay;
  },
  maxRetriesPerRequest: 3,
  commandTimeout: 5000,
  keyPrefix: "swiftaid:",
});

// ⬇️ ADD THIS: track intentional shutdown so the 'end' handler below
// can tell the difference between "connection dropped unexpectedly"
// and "we called quit() on purpose" (e.g. in tests, or a graceful
// SIGTERM shutdown in production).
let isShuttingDown = false;
const originalQuit = redis.quit.bind(redis);
redis.quit = (...args) => {
  isShuttingDown = true;
  return originalQuit(...args);
};

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("ready", () => console.log("✅ Redis ready"));
redis.on("error", (err) => console.error(`❌ Redis error: ${err.message}`));
redis.on("close", () => console.warn("⚠️  Redis connection closed"));
redis.on("end", () => {
  // ⬇️ CHANGE THIS: bail out early if this was an intentional quit()
  if (isShuttingDown) {
    console.log("🔌 Redis connection closed intentionally.");
    return;
  }
  console.error("❌ Redis connection ended — forcing reconnect...");
  setTimeout(() => {
    redis.connect().catch((err) => console.error(`❌ Redis manual reconnect failed: ${err.message}`));
  }, 1000);
});

module.exports = redis;