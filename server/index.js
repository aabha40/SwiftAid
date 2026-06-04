require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');

const connectDB = require('./config/db');
const redis = require('./config/redis');
const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

const authRoutes      = require('./routes/auth');
const ambulanceRoutes = require('./routes/ambulance');
const hospitalRoutes  = require('./routes/hospital');
const requestRoutes   = require('./routes/request');
const adminRoutes     = require('./routes/admin');

// Connect to MongoDB
connectDB();

const app = express();
const server = http.createServer(app);

// Security headers
app.use(helmet());

// Allow frontend (React) to talk to this server
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting on all /api routes
app.use('/api', generalLimiter);

// Read JSON from request body
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Log every request in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check — no login needed
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SwiftAid server is running 🚑',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// All routes
app.use('/api/auth',       authRoutes);
app.use('/api/ambulances', ambulanceRoutes);
app.use('/api/hospitals',  hospitalRoutes);
app.use('/api/requests',   requestRoutes);
app.use('/api/admin',      adminRoutes);

// 404 — route not found (FIXED: changed '*' to catch-all middleware)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

// Global error handler — must be last
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚑 SwiftAid server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health\n`);
});

module.exports = { app, server };