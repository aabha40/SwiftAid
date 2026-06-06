// ─────────────────────────────────────────────────────────────────
// config/socket.js — Socket.io server setup
// ─────────────────────────────────────────────────────────────────
//
// WHY EXPORT getIO()?
//   Socket.io needs the HTTP server to attach to — which is created
//   in index.js. But other files (controllers, services) also need
//   to emit events. Instead of passing io everywhere as a parameter,
//   we store it here and export a getter.
//   Any file can do: const { getIO } = require('../config/socket')
//   then: getIO().to('room').emit('event', data)
// ─────────────────────────────────────────────────────────────────

const { Server } = require('socket.io');

let io; // stored here, accessible anywhere via getIO()

const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    // CORS settings — allow our React frontend to connect
    cors: {
      origin: '*', // In production: set to your frontend domain
      methods: ['GET', 'POST'],
    },

    // pingTimeout: how long to wait for a pong before disconnecting (ms)
    // pingInterval: how often to ping the client to check connection (ms)
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  console.log('✅ Socket.io initialised');
  return io;
};

// Call this anywhere to get the socket.io instance
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialised. Call initSocket() first.');
  }
  return io;
};

module.exports = { initSocket, getIO };