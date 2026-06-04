const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Ambulance routes — coming in Phase 2' });
});

module.exports = router;