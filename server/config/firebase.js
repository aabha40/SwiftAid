// ─────────────────────────────────────────────────────────────────
// config/firebase.js — Firebase Admin SDK setup
// ─────────────────────────────────────────────────────────────────
//
// Firebase Admin SDK runs on YOUR SERVER (not the phone app).
// It has special privileges to send notifications to any device.
//
// The phone app uses Firebase Client SDK (we'll add in Phase 6).
// The phone app registers with Firebase and gets a unique FCM token.
// Your server uses that token to send notifications to that specific device.
//
// FLOW:
//   1. User opens app → app registers with Firebase → gets FCM token
//   2. App sends FCM token to our server → we save it in User.fcmToken
//   3. When event happens → our server sends notification using that token
// ─────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');

let firebaseInitialised = false;

const initFirebase = () => {
  // Don't initialise twice
  if (firebaseInitialised) return;

  // Check if credentials exist in .env
  if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
    console.warn('⚠️  Firebase credentials not found in .env — push notifications disabled');
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace \\n with actual newlines — .env stores \n as literal string
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });

    firebaseInitialised = true;
    console.log('✅ Firebase Admin SDK initialised');
  } catch (error) {
    console.error(`❌ Firebase init failed: ${error.message}`);
  }
};

// Check if Firebase is ready to use
const isFirebaseReady = () => firebaseInitialised;

module.exports = { initFirebase, isFirebaseReady };