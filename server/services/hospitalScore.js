// ─────────────────────────────────────────────────────────────────
// services/hospitalScore.js — Find BEST hospital, not just nearest
// ─────────────────────────────────────────────────────────────────
//
// SCORING FORMULA:
//   score = (bedScore × 0.4) + (distanceScore × 0.4) + (specialtyScore × 0.2)
//
//   bedScore      = availableBeds / totalBeds (0 to 1)
//   distanceScore = 1 - (distance / maxDistance) (closer = higher score)
//   specialtyScore = 1 if hospital has matching specialty, 0 if not
//
// EXAMPLE:
//   Hospital A: 5km away, 10 beds, no cardiac unit  → score 0.61
//   Hospital B: 8km away, 80 beds, has cardiac unit → score 0.74
//   → Patient goes to Hospital B even though it's farther ✅
// ─────────────────────────────────────────────────────────────────

const Hospital = require('../models/Hospital');

// Map emergency type to required specialty
const EMERGENCY_SPECIALTY_MAP = {
  cardiac: 'cardiology',
  trauma: 'trauma',
  respiratory: 'general',
  general: 'general',
  non_emergency: 'general',
};

const findBestHospital = async (lng, lat, emergencyType) => {
  const searchRadiusKm = 20; // search within 20km

  // MongoDB $geoNear / $near query — finds hospitals within radius
  // We use $near with $maxDistance (in meters, so km × 1000)
  const hospitals = await Hospital.find({
    isAcceptingEmergencies: true,  // only hospitals accepting emergencies
    availableBeds: { $gt: 0 },     // $gt = greater than — must have beds
    location: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [parseFloat(lng), parseFloat(lat)],
        },
        $maxDistance: searchRadiusKm * 1000, // MongoDB uses meters
      },
    },
  });

  if (!hospitals || hospitals.length === 0) {
    console.log('⚠️  No hospitals found nearby, expanding search...');

    // Try wider search — 50km
    const fallback = await Hospital.find({
      isAcceptingEmergencies: true,
      availableBeds: { $gt: 0 },
      location: {
        $near: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: 50000,
        },
      },
    });

    if (!fallback || fallback.length === 0) return null;
    return scoredHospitals(fallback, lng, lat, emergencyType)[0];
  }

  const ranked = scoredHospitals(hospitals, lng, lat, emergencyType);

  console.log(`🏥 Best hospital: ${ranked[0].hospital.name} (score: ${ranked[0].score.toFixed(2)})`);
  return ranked[0]; // return the highest scoring hospital
};

// ── Score and rank hospitals ──────────────────────────────────────
const scoredHospitals = (hospitals, lng, lat, emergencyType) => {
  const requiredSpecialty = EMERGENCY_SPECIALTY_MAP[emergencyType] || 'general';
  const MAX_DISTANCE_KM = 50;

  return hospitals
    .map((hospital) => {
      // Calculate straight-line distance using Haversine formula
      const distKm = haversineDistance(
        parseFloat(lat), parseFloat(lng),
        hospital.location.coordinates[1],
        hospital.location.coordinates[0]
      );

      // Bed availability score (0 to 1)
      // More available beds relative to total = higher score
      const bedScore = hospital.totalBeds > 0
        ? hospital.availableBeds / hospital.totalBeds
        : 0;

      // Distance score (0 to 1) — closer is better
      const distanceScore = Math.max(0, 1 - (distKm / MAX_DISTANCE_KM));

      // Specialty match score (0 or 1)
      const specialtyScore = hospital.specialties.includes(requiredSpecialty) ? 1 : 0;

      // Weighted final score
      const score = (bedScore * 0.4) + (distanceScore * 0.4) + (specialtyScore * 0.2);

      return { hospital, score, distKm };
    })
    .sort((a, b) => b.score - a.score); // highest score first
};

// ── Haversine Distance Formula ────────────────────────────────────
// Calculates the straight-line distance between two GPS coordinates
// Returns distance in kilometers
// This is the same formula used by Google Maps for distance calculation
const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const toRad = (deg) => deg * (Math.PI / 180);

module.exports = { findBestHospital };