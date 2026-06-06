// ─────────────────────────────────────────────────────────────────
// socket/index.js — Main Socket.io connection handler
// ─────────────────────────────────────────────────────────────────
//
// SOCKET LIFECYCLE:
//   1. Client calls io.connect('http://localhost:5000')
//   2. Server fires 'connection' event → our handler runs
//   3. We register all event listeners for THIS socket
//   4. Client disconnects → 'disconnect' event fires
//
// AUTHENTICATION:
//   We verify the JWT token sent during connection.
//   This ensures only logged-in users can use WebSockets.
//   Token is sent as: io.connect(url, { auth: { token: 'Bearer ...' } })
// ─────────────────────────────────────────────────────────────────

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { handleLocationUpdate } = require('./locationHandler');
const { handleStatusUpdate } = require('./statusHandler');
const { handleHeartbeat, handleDriverDisconnect } = require('./heartbeatHandler');

const registerSocketHandlers = (io) => {

  // ── JWT Authentication Middleware for Socket.io ───────────────
  // Runs BEFORE the 'connection' event — validates token first
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user || !user.isActive) {
        return next(new Error('User not found or inactive'));
      }

      // Attach user to socket — accessible as socket.user everywhere
      socket.user = user;
      next(); // authentication passed

    } catch (error) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection Event ──────────────────────────────────────────
  // Fires when a client successfully connects (after auth passes)
  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.id} | User: ${socket.user.name} | Role: ${socket.user.role}`);

    // ── JOIN TRIP ROOM ────────────────────────────────────────
    // Both patient and driver call this after connecting
    // They both join the same room named after the tripId
    // Events sent to this room reach both of them
    socket.on('join_trip', (data) => {
      const { tripId } = data;
      socket.join(tripId); // join the room
      console.log(`👥 ${socket.user.name} joined trip room: ${tripId}`);

      // Confirm to the client they joined successfully
      socket.emit('joined_trip', {
        tripId,
        message: `Joined trip room successfully`,
      });
    });

    // ── LEAVE TRIP ROOM ───────────────────────────────────────
    socket.on('leave_trip', (data) => {
      const { tripId } = data;
      socket.leave(tripId);
      console.log(`👋 ${socket.user.name} left trip room: ${tripId}`);
    });

    // ── DRIVER: LOCATION UPDATE ───────────────────────────────
    // Driver app emits this every 3 seconds with GPS coordinates
    socket.on('location_update', async (data) => {
      // Only drivers can send location updates
      if (socket.user.role !== 'driver') {
        socket.emit('error', { message: 'Only drivers can send location updates' });
        return;
      }
      await handleLocationUpdate(socket, io, data);
    });

    // ── DRIVER: STATUS UPDATE ─────────────────────────────────
    // Driver updates trip status (accepted, arrived, completed)
    socket.on('status_update', async (data) => {
      if (socket.user.role !== 'driver') {
        socket.emit('error', { message: 'Only drivers can update status' });
        return;
      }
      await handleStatusUpdate(socket, io, data);
    });

    // ── DRIVER: HEARTBEAT ─────────────────────────────────────
    // Driver app sends this every 30s to show they're online
    socket.on('heartbeat', async (data) => {
      await handleHeartbeat(socket, data);
    });

    // ── DISCONNECT ────────────────────────────────────────────
    // Fires when socket connection drops (app closed, network loss)
    socket.on('disconnect', async (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.user.name} | Reason: ${reason}`);

      // If a driver disconnects, mark their ambulance offline
      if (socket.user.role === 'driver' && socket.user.ambulanceId) {
        await handleDriverDisconnect(socket.user.ambulanceId.toString());
      }
    });

    // ── PING (connection test) ────────────────────────────────
    socket.on('ping_server', () => {
      socket.emit('pong_server', {
        message: 'Server is alive 🚑',
        timestamp: new Date().toISOString(),
      });
    });

  });

};

module.exports = { registerSocketHandlers };