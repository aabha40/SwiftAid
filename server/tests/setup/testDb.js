// ─────────────────────────────────────────────────────────────────
// tests/setup/testDb.js — Connect/clean/close a DEDICATED test DB
// ─────────────────────────────────────────────────────────────────
//
// SAFETY: this refuses to run unless MONGO_URI clearly points at a
// test database (must contain "test" in the name). This is the
// single most important line in this file — without it, a mistake
// in .env.test could point tests at your real dev or production
// database, and clearDatabase() below would wipe it between every
// single test.

const mongoose = require('mongoose');

const connect = async () => {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is not set. Did you create .env.test?');
  }
  if (!uri.includes('test')) {
    throw new Error(
      `Refusing to run tests against "${uri}" — it doesn't look like a test database ` +
      `(no "test" in the name). Point .env.test's MONGO_URI at a dedicated test database, ` +
      `e.g. mongodb://localhost:27017/swiftaid_test`
    );
  }

  await mongoose.connect(uri);
};

// Wipes every collection — run between tests so each test starts
// from a clean, predictable state instead of leaking data sideways.
const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

const closeDatabase = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
};

module.exports = { connect, clearDatabase, closeDatabase };