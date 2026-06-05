const express = require("express");
const router = express.Router();

const {
  createRequest,
  getMyRequests,
  getRequestById,
  updateRequestStatus,
} = require("../controllers/requestController");

const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/rbac");
const { emergencyLimiter } = require("../middleware/rateLimiter");

// Patient creates emergency request — rate limited (max 5/min)
router.post(
  "/",
  protect,
  authorize("patient"),
  emergencyLimiter,
  createRequest,
);

// Patient sees their own requests
router.get("/my", protect, authorize("patient"), getMyRequests);

// Anyone logged in can view a specific request
router.get("/:id", protect, getRequestById);

// Driver updates trip status
router.patch("/:id/status", protect, authorize("driver"), updateRequestStatus);

module.exports = router;
