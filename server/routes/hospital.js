const express = require('express');
const router = express.Router();

const {
  addHospital,
  getAllHospitals,
  getMyHospital,
  updateBeds,
  toggleEmergency,
} = require('../controllers/hospitalController');

const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Super admin adds hospital
router.post('/', protect, authorize('super_admin'), addHospital);

// Super admin sees all hospitals
router.get('/', protect, authorize('super_admin'), getAllHospitals);

// Hospital admin sees their own hospital
router.get('/my', protect, authorize('hospital_admin'), getMyHospital);

// Hospital admin updates bed count — THE MAIN USP
router.patch('/beds', protect, authorize('hospital_admin'), updateBeds);

// Hospital admin toggles emergency acceptance
router.patch('/toggle-emergency', protect, authorize('hospital_admin'), toggleEmergency);

module.exports = router;