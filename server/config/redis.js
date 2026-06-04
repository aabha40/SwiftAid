const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy(times) {
    if (times > 10) {
      console.error("❌ Redis: max retries reached");
      return null;
    }
    const delay = Math.min(Math.pow(2, times) * 100, 3000);
    console.warn(`⚠️  Redis retry #${times} in ${delay}ms`);
    return delay;
  },
  commandTimeout: 5000,
  keyPrefix: "swiftaid:",
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("ready", () => console.log("✅ Redis ready"));
redis.on("error", (err) => console.error(`❌ Redis error: ${err.message}`));
redis.on("close", () => console.warn("⚠️  Redis connection closed"));

module.exports = redis;
