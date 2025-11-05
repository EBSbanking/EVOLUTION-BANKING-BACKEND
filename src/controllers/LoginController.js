import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Login from '../models/Login.js';
import UserRole from '../models/UserRole.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import { getSecretKey } from '../middlewares/authMiddleware.js';
import { v4 as uuidv4 } from 'uuid';

export const login = asyncHandler(async (req, res) => {
  const { user_name, password } = req.body;

  logger.info('Login attempt', { user_name, timestamp: new Date().toISOString() });

  // Validate input
  if (!user_name || !password) {
    logger.warn('Missing required fields', { user_name });
    return res.status(400).json({
      success: false,
      message: 'user_name and password are required',
    });
  }

  // Find user with password selected
  const user = await User.findByUsernameWithPassword(user_name);
  if (!user) {
    logger.warn('User not found', { user_name });
    try {
      await Login.create({
        user_id: null,
        user_name,
        login_time: new Date(),
        success: false,
        ip_address: req.ip,
        session_id: req.sessionID || uuidv4(),
        attempt_identifier: uuidv4(),
        status: 'Failed',
        error: 'User not found',
      });
    } catch (error) {
      logger.error('Failed to log failed login attempt', { error: error.message });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  logger.info('User found', {
    user_name,
    internal_employee_enabled: user.internal_employee_enabled,
    start_date: user.start_date,
    expiry_date: user.expiry_date,
    earliest_login_time: user.earliest_login_time,
    latest_login_time: user.latest_login_time,
  });

  // Check if user is enabled
  if (!user.internal_employee_enabled) {
    logger.warn(`Login attempt failed: User ${user_name} is disabled`, {
      internal_employee_enabled: user.internal_employee_enabled,
    });
    try {
      await Login.create({
        user_id: user._id,
        user_name,
        login_time: new Date(),
        success: false,
        ip_address: req.ip,
        session_id: req.sessionID || uuidv4(),
        attempt_identifier: uuidv4(),
        status: 'Failed',
        error: 'User account is disabled',
      });
    } catch (error) {
      logger.error('Failed to log failed login attempt', { error: error.message });
    }
    return res.status(401).json({
      success: false,
      message: 'User account is disabled',
    });
  }

  // Check start and expiry dates
  const now = new Date();
  if (user.start_date > now || user.expiry_date < now) {
    logger.warn(`Login attempt failed: User ${user_name} account is not active`, {
      start_date: user.start_date,
      expiry_date: user.expiry_date,
      now,
    });
    try {
      await Login.create({
        user_id: user._id,
        user_name,
        login_time: new Date(),
        success: false,
        ip_address: req.ip,
        session_id: req.sessionID || uuidv4(),
        attempt_identifier: uuidv4(),
        status: 'Failed',
        error: 'User account is not active',
      });
    } catch (error) {
      logger.error('Failed to log failed login attempt', { error: error.message });
    }
    return res.status(401).json({
      success: false,
      message: 'User account is not active',
    });
  }

  // 🔹 NEW: Check login hours using the model method
  if (!user.isWithinLoginHours()) {
    logger.warn(`Login attempt failed: User ${user_name} login outside allowed hours`, {
      earliest_login_time: user.earliest_login_time,
      latest_login_time: user.latest_login_time,
      currentTime: new Date().toTimeString().split(' ')[0].substring(0, 5),
    });
    try {
      await Login.create({
        user_id: user._id,
        user_name,
        login_time: new Date(),
        success: false,
        ip_address: req.ip,
        session_id: req.sessionID || uuidv4(),
        attempt_identifier: uuidv4(),
        status: 'Failed',
        error: `Login attempt outside allowed hours. Allowed: ${user.earliest_login_time} - ${user.latest_login_time}`,
      });
    } catch (error) {
      logger.error('Failed to log failed login attempt', { error: error.message });
    }
    return res.status(403).json({
      success: false,
      message: `Login attempt outside allowed hours. Allowed: ${user.earliest_login_time} - ${user.latest_login_time}`,
    });
  }

  // Debug password comparison
  logger.info(`Comparing password for ${user_name}`, {
    password,
    hash: user.password ? '***' : 'null',
  });
  
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    logger.warn(`Invalid password for user ${user_name}`);
    try {
      await Login.create({
        user_id: user._id,
        user_name,
        login_time: new Date(),
        success: false,
        ip_address: req.ip,
        session_id: req.sessionID || uuidv4(),
        attempt_identifier: uuidv4(),
        status: 'Failed',
        error: 'Invalid password',
      });
    } catch (error) {
      logger.error('Failed to log failed login attempt', { error: error.message });
    }
    return res.status(401).json({
      success: false,
      message: 'Invalid credentials',
    });
  }

  // Fetch user role and permissions
  const userRole = await UserRole.findOne({
    USER_ID: user_name,
    BU_ID: user.responsibility_centre,
    USER_ROLE_ID: user.BU_ROLE_ID,
  }).lean();

  let permissions = [];
  let roleName = user.primary_business_role || 'Unknown Role';
  if (userRole) {
    permissions = userRole.permissions || [];
    roleName = userRole.ROLE_NM || roleName;
  } else {
    // Fallback to ROLE_MAPPING
    const roleData = Object.values(ROLE_MAPPING).find(
      role => role.id.toString() === user.BU_ROLE_ID.toString()
    );
    if (roleData) {
      permissions = roleData.permissions || [];
      roleName = roleData.ROLE_NM;
    }
  }

  logger.info('User role fetched', { user_name, roleName, permissions });

  // Log successful login attempt
  try {
    await Login.create({
      user_id: user._id,
      user_name,
      login_time: new Date(),
      success: true,
      ip_address: req.ip,
      session_id: req.sessionID || uuidv4(),
      attempt_identifier: uuidv4(),
      status: 'Success', // Fixed to match schema enum
    });
  } catch (error) {
    logger.error('Failed to log successful login attempt', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }

  // Generate JWT
  const token = jwt.sign(
    {
      id: user._id,
      user_name: user.user_name,
      role: roleName,
      roleId: user.BU_ROLE_ID,
      isAdmin: user.BU_ROLE_ID === 1,
      permissions,
    },
    getSecretKey(),
    { expiresIn: '7d' }
  );

  logger.info(`User ${user_name} logged in successfully`, {
    BU_ROLE_ID: user.BU_ROLE_ID,
    roleName,
    permissions,
  });

  res.json({
    success: true,
    token,
    user: {
      userId: user._id,
      user_name: user.user_name,
      email: user.email,
      role: roleName,
      BU_ROLE_ID: user.BU_ROLE_ID,
      primary_business_role: user.primary_business_role,
      businessUnit: user.main_business_unit,
      permissions,
      isAdmin: user.BU_ROLE_ID === 1,
      accessibleBusinessUnits: user.accessibleBusinessUnits || [user.main_business_unit],
      tokenIssuedAt: new Date().toISOString(),
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  });
});

export const emergencyPasswordReset = asyncHandler(async (req, res) => {
  const { user_name, new_password, confirm_password } = req.body;

  if (!user_name || !new_password || !confirm_password) {
    return res.status(400).json({
      success: false,
      message: 'Username, new password and confirm password are required',
    });
  }

  // Check if passwords match
  if (new_password !== confirm_password) {
    return res.status(400).json({
      success: false,
      message: 'New password and confirm password do not match',
    });
  }

  // Password strength validation
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(new_password)) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    });
  }

  try {
    const user = await User.findOne({
      user_name: { $regex: new RegExp(`^${user_name}$`, 'i') },
    }).select('+password +passwordHistory');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if new password is same as current
    const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as the current password',
      });
    }

    // Check password history for reuse
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      for (const oldHash of user.passwordHistory) {
        const isPrevious = await bcrypt.compare(new_password, oldHash);
        if (isPrevious) {
          return res.status(400).json({
            success: false,
            message: 'Cannot reuse previous passwords',
          });
        }
      }
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password history (keep last 5, including current before update)
    const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

    // Update user
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          password: hashedPassword,
          passwordHistory: updatedHistory,
          failed_attempts: 0,
          lock_until: null,
          passwordChangedAt: new Date(),
        },
      }
    );

    logger.info(`Emergency password reset completed for user ${user.user_name}`);

    res.status(200).json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Emergency password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed',
    });
  }
});

export default { login, emergencyPasswordReset };