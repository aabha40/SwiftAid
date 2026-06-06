require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');

// ── Config imports ────────────────────────────────────────────────
const connectDB = require('./config/db');
const redis = require('./config/redis');
const { initSocket } = require('./config/socket');
const { initFirebase } = require('./config/firebase');
const { registerSocketHandlers } = require('./socket/index');

// ── Middleware imports ────────────────────────────────────────────
const { generalLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

// ── Route imports ─────────────────────────────────────────────────
const authRoutes      = require('./routes/auth');
const ambulanceRoutes = require('./routes/ambulance');
const hospitalRoutes  = require('./routes/hospital');
const requestRoutes   = require('./routes/request');
const adminRoutes     = require('./routes/admin');

// ── Connect to databases ──────────────────────────────────────────
connectDB();
initFirebase();

// ── Create Express app ────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Initialise Socket.io ──────────────────────────────────────────
const io = initSocket(server);
registerSocketHandlers(io);

// ── Security middleware ───────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rate limiting ─────────────────────────────────────────────────
app.use('/api', generalLimiter);

// ── Body parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Request logging ───────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── Health check ──────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'SwiftAid server is running 🚑',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── Routes ────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/ambulances', ambulanceRoutes);
app.use('/api/hospitals',  hospitalRoutes);
app.use('/api/requests',   requestRoutes);
app.use('/api/admin',      adminRoutes);

// ── 404 handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found.`,
  });
});

// ── Global error handler — must be last ───────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚑 SwiftAid server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health\n`);
});

module.exports = { app, server };