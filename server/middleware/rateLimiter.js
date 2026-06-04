const rateLimit = require('express-rate-limit');

// For all general routes — 100 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again after 15 minutes.',
  },
});

// For emergency request route — very strict, 5 per minute
const emergencyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: {
    success: false,
    message: 'Too many emergency requests. If this is real, please call 108.',
  },
});

// For login/register — stops password guessing attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Too many attempts. Please try again after 15 minutes.',
  },
});

module.exports = { generalLimiter, emergencyLimiter, authLimiter };