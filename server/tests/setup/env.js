// ─────────────────────────────────────────────────────────────────
// tests/setup/env.js — Loaded automatically before every test file
// (wired via "setupFiles" in package.json's jest config)
// ─────────────────────────────────────────────────────────────────
//
// Loads .env.test instead of your real .env — this is what keeps
// tests from ever touching your real production/dev database or
// costing you real API credits.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env.test') });
process.env.NODE_ENV = 'test';