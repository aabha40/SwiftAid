require('dotenv').config();

const http = require('http');
const createApp = require('./app');

// ── Config imports ────────────────────────────────────────────────
const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');
const { initFirebase } = require('./config/firebase');
const { registerSocketHandlers } = require('./socket/index');

// ── Connect to databases ──────────────────────────────────────────
connectDB();
initFirebase();

// ── Create Express app + HTTP server ──────────────────────────────
const app = createApp();
const server = http.createServer(app);

// ── Initialise Socket.io ──────────────────────────────────────────
const io = initSocket(server);
registerSocketHandlers(io);

// ── Start server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚑 SwiftAid server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 Health: http://localhost:${PORT}/health\n`);
});

module.exports = { app, server };