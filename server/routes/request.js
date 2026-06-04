const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ success: true, message: 'Request routes — coming in Phase 3' });
});

module.exports = router;