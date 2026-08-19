// ─────────────────────────────────────────────────────────────────
// tests/integration/requests.test.js — The core dispatch flow,
// tested end-to-end through real HTTP requests.
// ─────────────────────────────────────────────────────────────────
//
// NOTE ON AI TRIAGE: these tests deliberately omit `description` on
// every request. Looking at aiTriage.js's classifyEmergency(), an
// empty description skips the AI call entirely and returns the
// static fallback score immediately. This keeps the test suite fast,
// free (no Groq API calls burned on every CI run), and deterministic
// — the AI classification logic itself is tested separately and
// doesn't need a live network call to verify the dispatch flow works.

const request = require('supertest');
const createApp = require('../../app');
const { connect, clearDatabase, closeDatabase } = require('../setup/testDb');
const { clearGeoPool, closeRedis } = require('../setup/testRedis');
const Ambulance = require('../../models/Ambulance');
const redis = require('../../config/redis');
const { REDIS_KEYS } = require('../../utils/constants');

const app = createApp();

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearDatabase();
  await clearGeoPool();
});

afterAll(async () => {
  await closeDatabase();
  await closeRedis();
});

// ── Test helpers ────────────────────────────────────────────────
const registerAndLogin = async (overrides = {}) => {
  const user = {
    name: 'Test User',
    email: `user${Date.now()}${Math.random()}@test.com`,
    phone: `9${Math.floor(100000000 + Math.random() * 900000000)}`,
    password: 'password123',
    role: 'patient',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(user);
  if (!res.body.token) {
    throw new Error(`registerAndLogin failed: ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, user: res.body.user };
};

// Creates an ambulance in Mongo AND adds it to the Redis geo pool —
// matching exactly what the real "driver goes online" flow does.
// Without both halves, findNearestAmbulance() will never find it
// (this is the exact bug we chased through several debugging rounds
// on the real deployed app — these tests exist partly so a future
// change can't silently reintroduce it).
const seedAvailableAmbulance = async ({ lng = 81.6296, lat = 21.2514 } = {}) => {
  const ambulance = await Ambulance.create({
    vehicleNumber: `TEST-${Date.now()}`,
    status: 'available',
    ambulanceType: 'advanced',
    location: { type: 'Point', coordinates: [lng, lat] },
  });
  await redis.geoadd(REDIS_KEYS.AMBULANCE_GEO, lng, lat, ambulance._id.toString());
  return ambulance;
};

const nearbyPoint = { longitude: 81.6296, latitude: 21.2514 };

describe('POST /api/requests — access control & validation', () => {
  test('rejects an unauthenticated request', async () => {
    const res = await request(app).post('/api/requests').send({ emergencyType: 'cardiac', ...nearbyPoint });
    expect(res.status).toBe(401);
  });

  test('rejects a non-patient role (RBAC)', async () => {
    const { token } = await registerAndLogin({ role: 'driver' });
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ emergencyType: 'cardiac', ...nearbyPoint });

    expect(res.status).toBe(403);
  });

  test('rejects an invalid emergencyType', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ emergencyType: 'not_a_real_type', ...nearbyPoint });

    expect(res.status).toBe(400);
  });

  test('rejects a request missing location', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ emergencyType: 'cardiac' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/requests — dispatch outcomes', () => {
  test('queues the request when no ambulance is available (does not fail it)', async () => {
    const { token } = await registerAndLogin();

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ emergencyType: 'cardiac', ...nearbyPoint });

    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    expect(res.body.data.priorityScore).toBe(100); // cardiac fallback score
  });

  test('assigns immediately when an ambulance is available nearby', async () => {
    await seedAvailableAmbulance();
    const { token } = await registerAndLogin();

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ emergencyType: 'cardiac', ...nearbyPoint });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('assigned');
    expect(res.body.data.ambulance).toBeDefined();
    expect(res.body.data.ambulance.distanceKm).toBeLessThan(1);
  });

  test('a queued higher-priority request outranks a lower one for the same freed ambulance', async () => {
    // Two patients queue while no ambulance exists yet
    const patientLow = await registerAndLogin();
    const patientHigh = await registerAndLogin();

    const lowRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${patientLow.token}`)
      .send({ emergencyType: 'non_emergency', ...nearbyPoint });
    expect(lowRes.status).toBe(202);
    expect(lowRes.body.data.priorityScore).toBe(10);

    const highRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${patientHigh.token}`)
      .send({ emergencyType: 'cardiac', ...nearbyPoint });
    expect(highRes.status).toBe(202);
    expect(highRes.body.data.priorityScore).toBe(100);

    // Sanity check on the ranking itself — this is the property the
    // priority queue depends on, independent of the dispatch-drain
    // timing mechanics (which involve a status transition + a real
    // ambulance and are covered by the manual/production testing
    // already done on the live app).
    expect(highRes.body.data.priorityScore).toBeGreaterThan(lowRes.body.data.priorityScore);
  });
});

describe('GET /api/requests/:id — ownership', () => {
  test('a patient can view their own request', async () => {
    const { token } = await registerAndLogin();
    const createRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token}`)
      .send({ emergencyType: 'general', ...nearbyPoint });

    const res = await request(app)
      .get(`/api/requests/${createRes.body.data.requestId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test('a DIFFERENT patient cannot view someone else\'s request', async () => {
    const owner = await registerAndLogin();
    const snooper = await registerAndLogin();

    const createRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ emergencyType: 'general', ...nearbyPoint });

    const res = await request(app)
      .get(`/api/requests/${createRes.body.data.requestId}`)
      .set('Authorization', `Bearer ${snooper.token}`);

    expect(res.status).toBe(403);
  });

  test('a driver CAN view a request that isn\'t theirs (staff roles coordinate across patients)', async () => {
    const owner = await registerAndLogin();
    const driver = await registerAndLogin({ role: 'driver' });

    const createRes = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ emergencyType: 'general', ...nearbyPoint });

    const res = await request(app)
      .get(`/api/requests/${createRes.body.data.requestId}`)
      .set('Authorization', `Bearer ${driver.token}`);

    expect(res.status).toBe(200);
  });

  test('returns 404 for a request that does not exist', async () => {
    const { token } = await registerAndLogin();
    const res = await request(app)
      .get('/api/requests/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});