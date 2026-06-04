const express = require('express');
const router = express.Router();

const {
  getAllUsers,
  getAllAmbulances,
  getAllHospitals,
  getStats,
  toggleUserStatus,
} = require('../controllers/adminController');

const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// All admin routes require super_admin role
router.use(protect, authorize('super_admin'));

router.get('/users', getAllUsers);
router.get('/ambulances', getAllAmbulances);
router.get('/hospitals', getAllHospitals);
router.get('/stats', getStats);
router.patch('/users/:id/toggle', toggleUserStatus);

module.exports = router;