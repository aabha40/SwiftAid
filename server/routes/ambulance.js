const express = require('express');
const router = express.Router();

const {
  addAmbulance,
  getAllAmbulances,
  getMyAmbulance,
  updateStatus,
  assignDriver,
} = require('../controllers/ambulanceController');

const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Super admin adds ambulance to fleet
router.post('/', protect, authorize('super_admin'), addAmbulance);

// Super admin sees all ambulances
router.get('/', protect, authorize('super_admin'), getAllAmbulances);

// Driver sees their own ambulance
router.get('/my', protect, authorize('driver'), getMyAmbulance);

// Driver updates their status (available/busy/offline)
router.patch('/status', protect, authorize('driver'), updateStatus);

// Super admin assigns a driver to an ambulance
router.patch('/:id/assign-driver', protect, authorize('super_admin'), assignDriver);

module.exports = router;