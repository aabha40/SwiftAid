// ─────────────────────────────────────────────────────────────────
// scripts/seedDemo.js — One ambulance + two patients, for testing
// the AI triage + priority queue locally without clicking through
// the UI every time.
//
// USAGE:
//   node scripts/seedDemo.js
//
// Run this from inside the server/ folder (same place you run
// `npm run dev` from), so it can find your .env and models.
//
// SAFE TO RUN MULTIPLE TIMES — it deletes any previous demo data
// with these exact emails/vehicle numbers before recreating them,
// so you can re-run it fresh before every demo/test.
// ─────────────────────────────────────────────────────────────────

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const EmergencyRequest = require('../models/EmergencyRequest');
const Trip = require('../models/Trip');
const redis = require('../config/redis');
const { REDIS_KEYS } = require('../utils/constants');

// All demo entities use this coordinate as a rough center point
// (Raipur, Chhattisgarh) — patients and the ambulance are placed a
// few hundred meters apart so they're realistically "nearby".
const CENTER = { lng: 81.6296, lat: 21.2514 };

const jitter = (base, meters) => base + (Math.random() - 0.5) * (meters / 111000);

const DEMO_EMAILS = ['demo.driver@swiftaid.test', 'demo.patienta@swiftaid.test', 'demo.patientb@swiftaid.test'];
const DEMO_VEHICLE = 'CG04-DEMO-01';
const DEMO_HOSPITAL = 'Demo General Hospital';

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');

  // ── Clean up any previous demo data ───────────────────────────
  // IMPORTANT: capture old patient/driver IDs BEFORE deleting the
  // Users, so we can also delete any EmergencyRequest/Trip docs that
  // reference them. Otherwise a leftover PENDING request from a
  // previous run stays in the priority queue with a patientId
  // pointing at a now-deleted user — which breaks Trip creation the
  // next time the queue tries to dispatch to it.
  const oldUsers = await User.find({ email: { $in: DEMO_EMAILS } }, '_id');
  const oldUserIds = oldUsers.map((u) => u._id);

  if (oldUserIds.length > 0) {
    await EmergencyRequest.deleteMany({ patientId: { $in: oldUserIds } });
    await Trip.deleteMany({ patientId: { $in: oldUserIds } });
  }

  await User.deleteMany({ email: { $in: DEMO_EMAILS } });
  await Ambulance.deleteMany({ vehicleNumber: DEMO_VEHICLE });
  await Hospital.deleteMany({ name: DEMO_HOSPITAL });
  console.log('🧹 Cleared previous demo data (if any)');

  // ── Create driver ───────────────────────────────────────────────
  const driver = await User.create({
    name: 'Demo Driver',
    email: 'demo.driver@swiftaid.test',
    phone: '9876500001',
    password: 'password123',
    role: 'driver',
  });

  // ── Create ambulance, AVAILABLE, assigned to driver ─────────────
  const ambulanceCoords = [jitter(CENTER.lng, 300), jitter(CENTER.lat, 300)];

  const ambulance = await Ambulance.create({
    vehicleNumber: DEMO_VEHICLE,
    driverId: driver._id,
    status: 'available',
    ambulanceType: 'advanced',
    location: {
      type: 'Point',
      coordinates: ambulanceCoords,
    },
  });

  driver.ambulanceId = ambulance._id;
  await driver.save();

  // ── Add to Redis geo pool ────────────────────────────────────────
  // THIS is the step that matters for findNearestAmbulance() to
  // actually find it — an ambulance existing in MongoDB with
  // status='available' is NOT enough on its own. In the real app,
  // this happens automatically when a driver calls PATCH
  // /api/ambulances/status with status=available. Since this script
  // writes to MongoDB directly (bypassing that endpoint), we have to
  // do this step ourselves.
  await redis.geoadd(
    REDIS_KEYS.AMBULANCE_GEO,
    ambulanceCoords[0],
    ambulanceCoords[1],
    ambulance._id.toString()
  );
  console.log(`📍 Ambulance added to Redis geo pool (${ambulanceCoords[0].toFixed(4)}, ${ambulanceCoords[1].toFixed(4)})`);

  // ── Create two patients ──────────────────────────────────────────
  const patientA = await User.create({
    name: 'Demo Patient A (urgent)',
    email: 'demo.patienta@swiftaid.test',
    phone: '9876500002',
    password: 'password123',
    role: 'patient',
  });

  const patientB = await User.create({
    name: 'Demo Patient B (mild)',
    email: 'demo.patientb@swiftaid.test',
    phone: '9876500003',
    password: 'password123',
    role: 'patient',
  });

  // ── Create one hospital nearby (optional but makes the flow complete) ─
  const hospital = await Hospital.create({
    name: DEMO_HOSPITAL,
    registrationNumber: 'DEMO-REG-0001',
    phone: '9876500099',
    location: {
      type: 'Point',
      coordinates: [jitter(CENTER.lng, 800), jitter(CENTER.lat, 800)],
    },
    address: {
      street: 'Demo Street',
      city: 'Raipur',
      state: 'Chhattisgarh',
      pincode: '492001',
    },
    totalBeds: 20,
    availableBeds: 5,
    emergencyCapacity: { total: 5, available: 5 },
    specialties: ['cardiology', 'trauma', 'general'],
  }).catch((err) => {
    // If your Hospital schema has additional required fields beyond
    // what's here, this logs why and the demo still works fine
    // without a hospital match — findBestHospital() just returns null.
    console.warn(`⚠️  Hospital creation skipped: ${err.message}`);
    return null;
  });

  // ── Print everything the demo script / manual testing needs ────
  console.log('\n✅ Demo data ready:\n');
  console.log('DRIVER   ', driver.email, '/ password123');
  console.log('AMBULANCE', ambulance.vehicleNumber, '(available, near center point)');
  console.log('PATIENT A', patientA.email, '/ password123  ← submit URGENT request with this one');
  console.log('PATIENT B', patientB.email, '/ password123  ← submit MILD request with this one (should queue)');
  if (hospital) console.log('HOSPITAL ', hospital.name);
  console.log(`\nAll located near lng=${CENTER.lng}, lat=${CENTER.lat} (Raipur) — use coordinates close to this for patient requests.\n`);

  await mongoose.disconnect();
  redis.disconnect();
};

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});