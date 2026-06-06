// ─────────────────────────────────────────────────────────────────
// services/notification.js — Send push notifications via FCM
// ─────────────────────────────────────────────────────────────────
//
// HOW FCM TOKENS WORK:
//   Every device/browser that installs your app gets a unique FCM token.
//   Think of it like a phone number for push notifications.
//   We store this token in User.fcmToken when user logs in.
//   When we want to notify them, we send to their token.
//
// NOTIFICATION TYPES:
//   1. sendToDevice(token, title, body, data)
//      → sends to one specific device
//   2. sendToMultiple(tokens[], title, body, data)
//      → sends to multiple devices at once
// ─────────────────────────────────────────────────────────────────

const admin = require('firebase-admin');
const { isFirebaseReady } = require('../config/firebase');

// ── Send notification to a single device ─────────────────────────
const sendToDevice = async (fcmToken, title, body, data = {}) => {
  // If Firebase not set up, just log and return
  // This way the app works even without Firebase configured
  if (!isFirebaseReady()) {
    console.log(`📱 [NOTIFICATION - Firebase not configured]`);
    console.log(`   To: ${fcmToken ? fcmToken.substring(0, 20) + '...' : 'No token'}`);
    console.log(`   Title: ${title}`);
    console.log(`   Body: ${body}`);
    return { success: false, reason: 'Firebase not configured' };
  }

  if (!fcmToken) {
    console.warn('⚠️  No FCM token provided — cannot send notification');
    return { success: false, reason: 'No FCM token' };
  }

  try {
    const message = {
      token: fcmToken,

      // notification = what appears in the phone's notification tray
      notification: {
        title,
        body,
      },

      // data = extra info your app can read silently (doesn't show as notification)
      // Useful for updating app state without showing a popup
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      },

      // Android-specific settings
      android: {
        priority: 'high', // wake up the device even if it's sleeping
        notification: {
          sound: 'default',
          channelId: 'swiftaid_emergency', // notification channel for Android 8+
          priority: 'max',
          defaultVibrateTimings: true,
        },
      },

      // Apple (iOS) settings
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log(`✅ Notification sent: ${title}`);
    return { success: true, messageId: response };

  } catch (error) {
    // FCM token might be expired/invalid — log but don't crash
    console.error(`❌ Notification failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ── Send to multiple devices at once ─────────────────────────────
const sendToMultiple = async (fcmTokens, title, body, data = {}) => {
  if (!isFirebaseReady()) {
    console.log(`📱 [MULTI-NOTIFICATION - Firebase not configured] Title: ${title}`);
    return { success: false, reason: 'Firebase not configured' };
  }

  // Filter out null/empty tokens
  const validTokens = fcmTokens.filter(Boolean);
  if (validTokens.length === 0) return { success: false, reason: 'No valid tokens' };

  try {
    const message = {
      tokens: validTokens,
      notification: { title, body },
      data: {
        ...Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
      },
      android: { priority: 'high' },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log(`✅ Multi-notification sent: ${response.successCount} success, ${response.failureCount} failed`);
    return { success: true, response };

  } catch (error) {
    console.error(`❌ Multi-notification failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ─────────────────────────────────────────────────────────────────
// Pre-built notification templates for SwiftAid events
// Call these instead of sendToDevice directly — keeps messages consistent
// ─────────────────────────────────────────────────────────────────

const notifyPatientAmbulanceAssigned = async (patientFcmToken, ambulanceData) => {
  return sendToDevice(
    patientFcmToken,
    '🚑 Ambulance is on the way!',
    `${ambulanceData.vehicleNumber} assigned. ETA: ${ambulanceData.etaMinutes} minutes. Driver: ${ambulanceData.driverName}`,
    {
      type: 'AMBULANCE_ASSIGNED',
      vehicleNumber: ambulanceData.vehicleNumber,
      etaMinutes: String(ambulanceData.etaMinutes),
      tripId: ambulanceData.tripId,
    }
  );
};

const notifyPatientStatusUpdate = async (patientFcmToken, status, message) => {
  const titles = {
    accepted:       '✅ Driver accepted your request',
    en_route:       '🚀 Ambulance is on the way',
    arrived:        '📍 Ambulance has arrived!',
    hospital_bound: '🏥 On the way to hospital',
    completed:      '✅ Trip completed',
  };

  return sendToDevice(
    patientFcmToken,
    titles[status] || 'Status Update',
    message,
    { type: 'STATUS_UPDATE', status }
  );
};

const notifyDriverNewRequest = async (driverFcmToken, requestData) => {
  return sendToDevice(
    driverFcmToken,
    '🚨 New Emergency Request!',
    `${requestData.emergencyType.toUpperCase()} case — ${requestData.distanceKm}km away. Respond within 30 seconds.`,
    {
      type: 'NEW_REQUEST',
      requestId: requestData.requestId,
      emergencyType: requestData.emergencyType,
      distanceKm: String(requestData.distanceKm),
    }
  );
};

const notifyHospitalIncomingPatient = async (hospitalAdminFcmToken, patientData) => {
  return sendToDevice(
    hospitalAdminFcmToken,
    '🏥 Incoming Patient',
    `${patientData.emergencyType.toUpperCase()} patient arriving in ~${patientData.etaMinutes} minutes`,
    {
      type: 'INCOMING_PATIENT',
      emergencyType: patientData.emergencyType,
      etaMinutes: String(patientData.etaMinutes),
      tripId: patientData.tripId,
    }
  );
};

module.exports = {
  sendToDevice,
  sendToMultiple,
  notifyPatientAmbulanceAssigned,
  notifyPatientStatusUpdate,
  notifyDriverNewRequest,
  notifyHospitalIncomingPatient,
};