// services/eta.js — Estimate arrival time
//
// Formula: time = distance / speed
// We assume ambulance average speed = 40 km/h in city traffic
// In Phase 4 we can improve this with real road distance via OSRM API

const calculateETA = (distanceKm) => {
  const AVERAGE_SPEED_KMH = 40; // average ambulance speed in Indian city traffic
  const timeHours = distanceKm / AVERAGE_SPEED_KMH;
  const timeMinutes = Math.ceil(timeHours * 60); // round up — always better to overestimate
  return timeMinutes;
};

module.exports = { calculateETA };