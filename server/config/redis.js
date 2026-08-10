const Redis = require("ioredis");

const redis = new Redis(process.env.REDIS_URL, {
  retryStrategy(times) {
    // IMPORTANT: never permanently give up. The old version returned
    // `null` after 10 tries, which puts ioredis in a terminal "end"
    // state it can NEVER recover from on its own — every command after
    // that point throws "Connection is closed." forever, until the
    // whole server process restarts. On Render's free tier, the
    // server spins down when idle and back up on the next request —
    // that gap is exactly when this retry budget was getting burned
    // through, leaving Redis dead for the rest of the process's life.
    // Capping the delay (not the attempt count) keeps retrying forever
    // with a sane backoff instead.
    const delay = Math.min(times * 200, 3000);
    if (times % 5 === 0) {
      console.warn(`⚠️  Redis retry #${times} in ${delay}ms (still trying, will not give up)`);
    }
    return delay;
  },
  maxRetriesPerRequest: 3, // a single command fails fast (doesn't hang the request)...
  commandTimeout: 5000,    // ...while the background connection keeps retrying forever above
  keyPrefix: "swiftaid:",
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("ready", () => console.log("✅ Redis ready"));
redis.on("error", (err) => console.error(`❌ Redis error: ${err.message}`));
redis.on("close", () => console.warn("⚠️  Redis connection closed"));
redis.on("end", () => {
  // With the retryStrategy above this should no longer be reachable
  // in normal operation, but as a last-resort safety net: force a
  // fresh connection attempt rather than staying dead silently.
  console.error("❌ Redis connection ended — forcing reconnect...");
  setTimeout(() => {
    redis.connect().catch((err) => console.error(`❌ Redis manual reconnect failed: ${err.message}`));
  }, 1000);
});

module.exports = redis;