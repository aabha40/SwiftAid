const User = require('../models/User');
const Ambulance = require('../models/Ambulance');
const Hospital = require('../models/Hospital');
const EmergencyRequest = require('../models/EmergencyRequest');

// GET /api/admin/users
const getAllUsers = async (req, res, next) => {
  try {
    // Query parameter filtering — GET /api/admin/users?role=driver
    const filter = {};
    if (req.query.role) filter.role = req.query.role;

    const users = await User.find(filter).select('-password');

    res.status(200).json({
      success: true,
      count: users.length,
      users,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/ambulances
const getAllAmbulances = async (req, res, next) => {
  try {
    const filter = {};
    // Filter by status — GET /api/admin/ambulances?status=available
    if (req.query.status) filter.status = req.query.status;

    const ambulances = await Ambulance.find(filter)
      .populate('driverId', 'name phone email');

    res.status(200).json({
      success: true,
      count: ambulances.length,
      ambulances,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/hospitals
const getAllHospitals = async (req, res, next) => {
  try {
    const hospitals = await Hospital.find()
      .populate('adminId', 'name email phone');

    res.status(200).json({
      success: true,
      count: hospitals.length,
      hospitals,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/stats
// Dashboard summary — counts of everything
const getStats = async (req, res, next) => {
  try {
    // Run all queries in parallel using Promise.all
    // Instead of waiting for each one to finish before starting the next,
    // all 4 queries run at the same time — much faster
    const [
      totalUsers,
      totalAmbulances,
      availableAmbulances,
      totalHospitals,
      activeRequests,
    ] = await Promise.all([
      User.countDocuments(),
      Ambulance.countDocuments(),
      Ambulance.countDocuments({ status: 'available' }),
      Hospital.countDocuments(),
      EmergencyRequest.countDocuments({ status: { $in: ['pending', 'assigned', 'accepted', 'en_route'] } }),
    ]);

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalAmbulances,
        availableAmbulances,
        busyAmbulances: totalAmbulances - availableAmbulances,
        totalHospitals,
        activeRequests,
      },
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/users/:id/toggle
// Activate or deactivate a user account
const toggleUserStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.status(200).json({
      success: true,
      message: `User account ${user.isActive ? 'activated' : 'deactivated'}.`,
      isActive: user.isActive,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllUsers,
  getAllAmbulances,
  getAllHospitals,
  getStats,
  toggleUserStatus,
};