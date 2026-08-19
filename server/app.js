// ─────────────────────────────────────────────────────────────────
// app.js — Builds and exports the Express app, with ZERO side effects
// ─────────────────────────────────────────────────────────────────
//
// WHY THIS FILE EXISTS:
//   The original index.js did everything in one file — connected to
//   MongoDB, initialised Firebase, started Socket.io, AND started
//   listening on a port — all as side effects of just requiring the
//   file. That makes it impossible to import the app into a test
//   file with supertest without also spinning up a real server,
//   real DB connection, and real Firebase Admin SDK.
//
//   This file only builds the Express app (routes + middleware) and
//   exports it. Nothing here connects to anything or starts
//   listening — index.js (the real entry point) is responsible for
//   that. Tests import THIS file instead of index.js, so they get a
//   fully-wired app they can hit with supertest, while controlling
//   the database connection themselves (see tests/setup/testDb.js).
// ─────────────────────────────────────────────────────────────────

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes      = require('./routes/auth');
const ambulanceRoutes = require('./routes/ambulance');
const hospitalRoutes  = require('./routes/hospital');
const requestRoutes   = require('./routes/request');
const adminRoutes     = require('./routes/admin');

const createApp = () => {
  const app = express();

  app.use(helmet());
  app.use(cors({
    origin: [
      'http://localhost:3000',
      'https://swift-aid-pi.vercel.app',
    ],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  // Rate limiting — the limiters themselves skip enforcement when
  // NODE_ENV=test (see middleware/rateLimiter.js), so this can stay
  // unconditional here.
  app.use('/api', generalLimiter);

  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
  }

  app.get('/health', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'SwiftAid server is running 🚑',
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth',       authRoutes);
  app.use('/api/ambulances', ambulanceRoutes);
  app.use('/api/hospitals',  hospitalRoutes);
  app.use('/api/requests',   requestRoutes);
  app.use('/api/admin',      adminRoutes);

  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route ${req.originalUrl} not found.`,
    });
  });

  app.use(errorHandler);

  return app;
};

module.exports = createApp;