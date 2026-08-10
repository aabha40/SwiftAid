// ─────────────────────────────────────────────────────────────────
// scripts/runDemo.js — Drives the full AI-triage + priority-queue
// flow through your real HTTP API, so you can watch it happen
// without manually logging into two browser windows every time.
//
// PREREQUISITE: run `node scripts/seedDemo.js` first, and make sure
// your server (`npm run dev`) is already running in another terminal.
//
// USAGE:
//   node scripts/runDemo.js
// ─────────────────────────────────────────────────────────────────

const BASE_URL = process.env.DEMO_BASE_URL || 'http://localhost:5000/api';
const CENTER = { lng: 81.6296, lat: 21.2514 };

const log = (label, data) => {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 50 - label.length))}`);
  console.log(JSON.stringify(data, null, 2));
};

const login = async (email, password) => {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  return data.token || data.data?.token; // adjust if your sendTokenResponse shape differs
};

const submitRequest = async (token, { emergencyType, description, lng, lat }) => {
  const res = await fetch(`${BASE_URL}/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ emergencyType, description, longitude: lng, latitude: lat }),
  });
  const data = await res.json();
  return { status: res.status, data };
};

const updateRequestStatus = async (token, requestId, status) => {
  const res = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });
  return { status: res.status, data: await res.json() };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = async () => {
  console.log('🔐 Logging in demo accounts...');
  const tokenA = await login('demo.patienta@swiftaid.test', 'password123');
  const tokenB = await login('demo.patientb@swiftaid.test', 'password123');
  const tokenDriver = await login('demo.driver@swiftaid.test', 'password123');
  console.log('✅ All three logged in');

  // ── Patient A: urgent request — should grab the one ambulance ──
  const reqA = await submitRequest(tokenA, {
    emergencyType: 'cardiac',
    description: 'chest pain, sweating, can\'t breathe',
    lng: CENTER.lng + 0.001,
    lat: CENTER.lat + 0.001,
  });
  log('Patient A (urgent) submitted', reqA);

  if (reqA.status !== 201) {
    console.error('\n❌ Expected Patient A to get an ambulance immediately (201). Check that the seed script ran and the demo ambulance is AVAILABLE.');
    return;
  }

  // ── Patient B: mild request, submitted right after — should queue ──
  const reqB = await submitRequest(tokenB, {
    emergencyType: 'trauma',
    description: 'sprained ankle, minor pain, can still walk',
    lng: CENTER.lng - 0.001,
    lat: CENTER.lat - 0.001,
  });
  log('Patient B (mild) submitted', reqB);

  if (reqB.status === 202 && reqB.data.queued) {
    console.log('\n✅ Patient B correctly QUEUED (202) — priority score:', reqB.data.data.priorityScore);
  } else {
    console.warn('\n⚠️  Expected Patient B to be queued (202). Got status', reqB.status, '— if there was more than one ambulance available, this is expected instead.');
  }

  await wait(1000);

  // ── Driver completes Patient A's trip → should trigger queue drain ──
  console.log('\n🚑 Marking Patient A\'s trip as COMPLETED (this should free the ambulance and auto-dispatch it to Patient B)...');
  const completeResult = await updateRequestStatus(tokenDriver, reqA.data.data.requestId, 'completed');
  log('Trip completion result', completeResult);

  // Give the async tryDispatchQueuedRequest() a moment to run
  await wait(1500);

  // ── Check Patient B's request — should now be ASSIGNED ──────────
  const checkB = await fetch(`${BASE_URL}/requests/${reqB.data.data.requestId}`, {
    headers: { Authorization: `Bearer ${tokenB}` },
  }).then((r) => r.json());

  log('Patient B\'s request status AFTER queue drain', checkB);

  if (checkB.request?.status === 'assigned') {
    console.log('\n🎉 SUCCESS — Patient B was automatically matched to the freed ambulance via the priority queue.');
  } else {
    console.log('\n⚠️  Patient B is not yet assigned — check your server terminal for the "📋 Dispatching queued request" log line, or re-run after a few seconds.');
  }
};

run().catch((err) => {
  console.error('\n❌ Demo script failed:', err.message);
  process.exit(1);
});