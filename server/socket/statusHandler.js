// socket/statusHandler.js — Trip status change events
const EmergencyRequest = require('../models/EmergencyRequest');
const Trip = require('../models/Trip');
const { REQUEST_STATUS } = require('../utils/constants');
const { notifyPatientStatusUpdate } = require('../services/notification');
const User = require('../models/User');

const handleStatusUpdate = async (socket, io, data) => {
  try {
    const { tripId, requestId, status } = data;

    const validStatuses = [
      REQUEST_STATUS.ACCEPTED,
      REQUEST_STATUS.EN_ROUTE,
      REQUEST_STATUS.ARRIVED,
      REQUEST_STATUS.HOSPITAL_BOUND,
      REQUEST_STATUS.COMPLETED,
    ];

    if (!validStatuses.includes(status)) {
      socket.emit('error', { message: `Invalid status: ${status}` });
      return;
    }

    // Update request status in MongoDB
    await EmergencyRequest.findByIdAndUpdate(requestId, { status });

    // Update trip timeline
    const timelineMap = {
      [REQUEST_STATUS.ACCEPTED]:      'timeline.acceptedAt',
      [REQUEST_STATUS.ARRIVED]:       'timeline.arrivedAt',
      [REQUEST_STATUS.COMPLETED]:     'timeline.completedAt',
    };

    if (timelineMap[status]) {
      await Trip.findByIdAndUpdate(tripId, {
        [timelineMap[status]]: new Date(),
      });
    }

    // Broadcast status to everyone in trip room
    // Patient sees: "Driver accepted", "Driver arrived", "En route to hospital"
    io.to(tripId).emit('trip_status_update', {
      tripId,
      requestId,
      status,
      message: getStatusMessage(status),
      timestamp: new Date().toISOString(),
    });

    console.log(`📡 Status broadcast to room ${tripId}: ${status}`);
    // Send push notification to patient about status change
const request = await EmergencyRequest.findById(requestId)
  .populate('patientId', 'fcmToken');

if (request?.patientId?.fcmToken) {
  await notifyPatientStatusUpdate(
    request.patientId.fcmToken,
    status,
    getStatusMessage(status)
  );
}

  } catch (error) {
    console.error(`❌ Status update error: ${error.message}`);
    socket.emit('error', { message: 'Failed to update status' });
  }
};

// Human-readable messages for each status
const getStatusMessage = (status) => {
  const messages = {
    [REQUEST_STATUS.ACCEPTED]:       '🚑 Driver has accepted your request',
    [REQUEST_STATUS.EN_ROUTE]:       '🚀 Ambulance is on the way',
    [REQUEST_STATUS.ARRIVED]:        '📍 Ambulance has arrived at your location',
    [REQUEST_STATUS.HOSPITAL_BOUND]: '🏥 You are being taken to the hospital',
    [REQUEST_STATUS.COMPLETED]:      '✅ Trip completed. Get well soon!',
  };
  return messages[status] || 'Status updated';
};

module.exports = { handleStatusUpdate };