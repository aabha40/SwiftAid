const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      console.error(`❌ MongoDB error: ${err.message}`);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected');
    });

    // Sync available ambulances back to Redis after server restart
    await syncAmbulancesToRedis();

  } catch (error) {
    console.error(`❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

// Re-adds all 'available' ambulances to Redis geo pool on startup
// Fixes the problem of Redis losing data when server restarts
const syncAmbulancesToRedis = async () => {
  try {
    // We need to wait a moment for models to be registered
    setTimeout(async () => {
      const Ambulance = require('../models/Ambulance');
      const redis = require('./redis');
      const { AMBULANCE_STATUS, REDIS_KEYS } = require('../utils/constants');

      const availableAmbulances = await Ambulance.find({
        status: AMBULANCE_STATUS.AVAILABLE,
        'location.coordinates': { $ne: [0, 0] },
      });

      if (availableAmbulances.length === 0) {
        console.log('ℹ️  No available ambulances to sync to Redis');
        return;
      }

      for (const ambulance of availableAmbulances) {
        const [lng, lat] = ambulance.location.coordinates;
        await redis.geoadd(
          REDIS_KEYS.AMBULANCE_GEO,
          lng, lat,
          ambulance._id.toString()
        );
      }

      console.log(`✅ Synced ${availableAmbulances.length} ambulance(s) to Redis geo pool`);
    }, 2000); // wait 2s for everything to load

  } catch (error) {
    console.error(`⚠️  Redis sync failed: ${error.message}`);
  }
};

module.exports = connectDB;