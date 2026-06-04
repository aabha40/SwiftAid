const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auditLogger = require("../services/auditLogger");

// Create a JWT token for a user
const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  });
};

// Send token + user data in response
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user);
  const userData = user.toObject();
  delete userData.password;

  res.status(statusCode).json({
    success: true,
    token,
    user: userData,
  });
};

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, phone, password, role } = req.body;

    // Nobody can self-register as super admin
    if (role === "super_admin") {
      return res.status(403).json({
        success: false,
        message: "Cannot self-register as super admin.",
      });
    }

    const user = await User.create({ name, email, phone, password, role });

    await auditLogger.log({
      actorId: user._id,
      actorRole: user.role,
      action: "USER_REGISTERED",
      resourceId: user._id,
      resourceType: "User",
      details: { email, role },
      ipAddress: req.ip,
    });

    sendTokenResponse(user, 201, res);
  } catch (error) {
    next(error);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password.",
      });
    }

    // Need password here so we use .select('+password')
    const user = await User.findOne({ email }).select("+password");

    // Always say "Invalid credentials" — never reveal which part is wrong
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: "Account deactivated. Contact support.",
      });
    }

    await auditLogger.log({
      actorId: user._id,
      actorRole: user.role,
      action: "USER_LOGIN",
      resourceId: user._id,
      resourceType: "User",
      ipAddress: req.ip,
    });

    sendTokenResponse(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// GET /api/auth/me
const getMe = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/auth/fcm-token
const updateFcmToken = async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    res.status(200).json({ success: true, message: "FCM token updated." });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, getMe, updateFcmToken };
