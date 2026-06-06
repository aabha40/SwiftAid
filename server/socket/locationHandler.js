// ─────────────────────────────────────────────────────────────────
// socket/locationHandler.js — Driver GPS location updates
// ─────────────────────────────────────────────────────────────────
//
// EVENT FLOW:
//   Driver app (every 3s):
//     socket.emit('location_update', { tripId, longitude, latitude })
//
//   Server receives it here:
//     → updates Redis
//     → updates MongoDB
//     → broadcasts to trip room:
//         io.to(tripId).emit('ambulance_location', { longitude, latitude, etaMinutes })
//
//   Patient app receives 'ambulance_location':
//     → moves the ambulance pin on the map
// ─────────────────────────────────────────────────────────────────

const Ambulance = require('../models/Ambulance');
const Trip = require('../models/Trip');
const { updateAmbulanceLocation } = require('../services/geoMatch');
const { calculateETA } = require('../services/eta');
const { haversineDistance } = require('../services/hospitalScore');

const handleLocationUpdate = async (socket, io, data) => {
  try {
    const { tripId, longitude, latitude, ambulanceId } = data;

    if (!tripId || !longitude || !latitude || !ambulanceId) {
      socket.emit('error', { message: 'Missing required fields for location update' });
      return;
    }

    const lng = parseFloat(longitude);
    const lat = parseFloat(latitude);

    // ── Update Redis geo pool ─────────────────────────────────────
    // Even though ambulance is BUSY, we still update its location in Redis
    // so when it becomes available again, its position is accurate
    await updateAmbulanceLocation(ambulanceId, lng, lat);

    // ── Update MongoDB ────────────────────────────────────────────
    // Update the ambulance's last known position permanently
    await Ambulance.findByIdAndUpdate(ambulanceId, {
      location: { type: 'Point', coordinates: [lng, lat] },
      lastActiveAt: new Date(),
    });

    // ── Get trip details to calculate ETA ─────────────────────────
    const trip = await Trip.findById(tripId)
      .populate('requestId', 'pickupLocation');

    let etaMinutes = null;

    if (trip && trip.requestId) {
      // Get patient's pickup location
      const patientLng = trip.requestId.pickupLocation.coordinates[0];
      const patientLat = trip.requestId.pickupLocation.coordinates[1];

      // Calculate current distance from ambulance to patient
      const currentDistanceKm = haversineDistance(lat, lng, patientLat, patientLng);

      // Recalculate ETA based on current position
      etaMinutes = calculateETA(currentDistanceKm);

      // Update ETA in trip document
      await Trip.findByIdAndUpdate(tripId, {
        estimatedArrivalMinutes: etaMinutes,
      });
    }

    // ── Broadcast to trip room ────────────────────────────────────
    // io.to(tripId) = send to ALL sockets that joined room 'tripId'
    // This includes the patient and any other watchers
    io.to(tripId).emit('ambulance_location', {
      tripId,
      ambulanceId,
      longitude: lng,
      latitude: lat,
      etaMinutes,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error(`❌ Location update error: ${error.message}`);
    socket.emit('error', { message: 'Failed to update location' });
  }
};

module.exports = { handleLocationUpdate };