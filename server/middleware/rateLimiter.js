const rateLimit = require('express-rate-limit');

// Rate limiters use module-level state (their MemoryStore), which
// Node's require cache shares across every test file in a Jest run —
// not just within one file. Without this skip, running the full test
// suite would eventually trip these limiters on requests that have
// nothing to do with the test actually being rate-limited.
let skipLogCount = 0;
const skipInTests = () => {
  const result = process.env.NODE_ENV === 'test';
  if (skipLogCount < 5) {
    console.log(`[RATE-LIMITER DEBUG] skipInTests() called — NODE_ENV="${process.env.NODE_ENV}" — skip=${result}`);
    skipLogCount++;
  }
  return result;
};

// For all general routes — 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTests,
  message: {
    success: false,
    message: 'Too many requests. Please try again after 15 minutes.',
  },
});

// For emergency request route — very strict, 5 per minute
const emergencyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  skip: skipInTests,
  message: {
    success: false,
    message: 'Too many emergency requests. If this is real, please call 108.',
  },
});

// For login/register — stops password guessing attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipInTests,
  message: {
    success: false,
    message: 'Too many attempts. Please try again after 15 minutes.',
  },
});

module.exports = { generalLimiter, emergencyLimiter, authLimiter };