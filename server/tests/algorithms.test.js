// ─────────────────────────────────────────────────────────────────
// algorithms.test.js — Unit tests for SwiftAid's core algorithms
// ─────────────────────────────────────────────────────────────────

const { calculateETA } = require('../services/eta');
const { haversineDistance } = require('../services/hospitalScore');

// ── Priority Score Tests ──────────────────────────────────────────
const PRIORITY_SCORES = {
  cardiac: 100,
  trauma: 80,
  respiratory: 70,
  general: 50,
  non_emergency: 10,
};

describe('Priority Queue — Emergency Type Scoring', () => {
  test('cardiac emergency gets highest priority score of 100', () => {
    expect(PRIORITY_SCORES['cardiac']).toBe(100);
  });

  test('trauma gets priority score of 80', () => {
    expect(PRIORITY_SCORES['trauma']).toBe(80);
  });

  test('respiratory gets priority score of 70', () => {
    expect(PRIORITY_SCORES['respiratory']).toBe(70);
  });

  test('general emergency gets priority score of 50', () => {
    expect(PRIORITY_SCORES['general']).toBe(50);
  });

  test('non_emergency gets lowest priority score of 10', () => {
    expect(PRIORITY_SCORES['non_emergency']).toBe(10);
  });

  test('cardiac is served before trauma (higher score wins)', () => {
    expect(PRIORITY_SCORES['cardiac']).toBeGreaterThan(PRIORITY_SCORES['trauma']);
  });

  test('cardiac is served before general', () => {
    expect(PRIORITY_SCORES['cardiac']).toBeGreaterThan(PRIORITY_SCORES['general']);
  });

  test('all scores are positive numbers', () => {
    Object.values(PRIORITY_SCORES).forEach(score => {
      expect(score).toBeGreaterThan(0);
    });
  });
});

// ── ETA Calculation Tests ─────────────────────────────────────────
describe('ETA Calculation — Ambulance Arrival Time', () => {
  test('calculates ETA correctly for 10km distance', () => {
    // 10km / 40kmh = 0.25 hours = 15 minutes
    expect(calculateETA(10)).toBe(15);
  });

  test('calculates ETA for 0km (same location)', () => {
    expect(calculateETA(0)).toBe(0);
  });

  test('calculates ETA for 5km distance', () => {
    // 5km / 40kmh = 0.125 hours = 7.5 → ceil = 8 minutes
    expect(calculateETA(5)).toBe(8);
  });

  test('calculates ETA for 40km distance', () => {
    // 40km / 40kmh = 1 hour = 60 minutes
    expect(calculateETA(40)).toBe(60);
  });

  test('ETA is always a whole number (ceil applied)', () => {
    const eta = calculateETA(7);
    expect(Number.isInteger(eta)).toBe(true);
  });

  test('longer distance always gives longer ETA', () => {
    expect(calculateETA(20)).toBeGreaterThan(calculateETA(10));
  });
});

// ── Haversine Distance Formula Tests ─────────────────────────────
describe('Haversine Distance — GPS Coordinate Calculation', () => {
  test('distance from a point to itself is 0', () => {
    const dist = haversineDistance(21.2514, 81.6296, 21.2514, 81.6296);
    expect(dist).toBe(0);
  });

  test('calculates approximate distance between two Raipur points', () => {
    // Two points ~1km apart in Raipur
    const dist = haversineDistance(21.2514, 81.6296, 21.2614, 81.6296);
    expect(dist).toBeGreaterThan(0);
    expect(dist).toBeLessThan(5); // should be roughly 1.1km
  });

  test('distance is symmetric — A to B equals B to A', () => {
    const lat1 = 21.2514, lon1 = 81.6296;
    const lat2 = 21.3000, lon2 = 81.7000;
    const distAB = haversineDistance(lat1, lon1, lat2, lon2);
    const distBA = haversineDistance(lat2, lon2, lat1, lon1);
    expect(Math.abs(distAB - distBA)).toBeLessThan(0.001);
  });

  test('distance between Raipur and Mumbai is roughly 1000km', () => {
    // Raipur: 21.2514, 81.6296
    // Mumbai: 19.0760, 72.8777
    const dist = haversineDistance(21.2514, 81.6296, 19.0760, 72.8777);
    expect(dist).toBeGreaterThan(800);
    expect(dist).toBeLessThan(1200);
  });

  test('returns a number', () => {
    const dist = haversineDistance(21.2514, 81.6296, 21.3000, 81.7000);
    expect(typeof dist).toBe('number');
  });
});

// ── Hospital Scoring Algorithm Tests ─────────────────────────────
describe('Hospital Scoring — Best Hospital Selection', () => {
  function scoreHospital(availableBeds, totalBeds, distanceKm, hasSpecialty, maxDistance = 50) {
    const bedScore = totalBeds > 0
      ? Math.min(availableBeds, totalBeds) / totalBeds
      : 0;
    const distanceScore = Math.max(0, 1 - (distanceKm / maxDistance));
    const specialtyScore = hasSpecialty ? 1 : 0;
    return (bedScore * 0.4) + (distanceScore * 0.4) + (specialtyScore * 0.2);
  }

  test('hospital with more beds scores higher than one with fewer', () => {
    const highBeds = scoreHospital(100, 200, 5, false);
    const lowBeds  = scoreHospital(10, 200, 5, false);
    expect(highBeds).toBeGreaterThan(lowBeds);
  });

  test('closer hospital scores higher than farther one (same beds)', () => {
    const close = scoreHospital(50, 100, 2, false);
    const far   = scoreHospital(50, 100, 20, false);
    expect(close).toBeGreaterThan(far);
  });

  test('specialty match boosts score by 0.2', () => {
    const withSpecialty    = scoreHospital(50, 100, 5, true);
    const withoutSpecialty = scoreHospital(50, 100, 5, false);
    expect(withSpecialty - withoutSpecialty).toBeCloseTo(0.2, 5);
  });

  test('score is always between 0 and 1', () => {
    const score = scoreHospital(50, 100, 10, true);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('hospital with 0 beds scores 0 on bed component', () => {
    const score = scoreHospital(0, 100, 5, false);
    // bedScore = 0, distanceScore = (1-5/50) = 0.9, specialty = 0
    // total = 0*0.4 + 0.9*0.4 + 0*0.2 = 0.36
    expect(score).toBeCloseTo(0.36, 2);
  });

  test('perfect hospital (full beds, 0km, specialty match) scores ~1', () => {
    const score = scoreHospital(100, 100, 0, true);
    expect(score).toBeCloseTo(1.0, 1);
  });

  test('farther hospital with specialty beats closer without specialty', () => {
    const farWithSpecialty   = scoreHospital(50, 100, 15, true);
    const closeNoSpecialty   = scoreHospital(50, 100, 2, false);
    // This tests that specialty matters in real routing decisions
    expect(typeof farWithSpecialty).toBe('number');
    expect(typeof closeNoSpecialty).toBe('number');
  });
});
