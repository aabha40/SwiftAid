// ─────────────────────────────────────────────────────────────────
// tests/integration/auth.test.js — Real HTTP requests against the
// actual Express app + a real (test) database, via supertest.
// ─────────────────────────────────────────────────────────────────

const request = require('supertest');
const createApp = require('../../app');
const { connect, clearDatabase, closeDatabase } = require('../setup/testDb');
const { closeRedis } = require('../setup/testRedis');

const app = createApp();

beforeAll(async () => {
  await connect();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await closeDatabase();
  await closeRedis();
});

const validPatient = {
  name: 'Test Patient',
  email: 'patient@test.com',
  phone: '9000000001',
  password: 'password123',
  role: 'patient',
};

describe('POST /api/auth/register', () => {
  test('registers a new patient and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send(validPatient);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(validPatient.email);
    expect(res.body.user.password).toBeUndefined(); // never leak the hash
  });

  test('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validPatient);
    const res = await request(app).post('/api/auth/register').send(validPatient);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/already exists/i);
  });

  test('refuses to let anyone self-register as super_admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validPatient, email: 'sneaky@test.com', role: 'super_admin' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send(validPatient);
  });

  test('logs in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validPatient.email, password: validPatient.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('rejects an incorrect password without revealing which part was wrong', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validPatient.email, password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/invalid email or password/i);
  });

  test('rejects a login for an email that was never registered', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@test.com', password: 'whatever123' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  test('rejects a request with no token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejects a garbage/invalid token', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });

  test('returns the current user with a valid token', async () => {
    const registerRes = await request(app).post('/api/auth/register').send(validPatient);
    const token = registerRes.body.token;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(validPatient.email);
  });
});