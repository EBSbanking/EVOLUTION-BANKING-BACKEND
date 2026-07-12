import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import { getSecretKey } from '../middlewares/authMiddleware.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import PERMISSIONS from '../constants/permissions.js';
import configurationService from '../Services/ConfigurationService.js';
import { getUser, getLicense, getPermissions, initializeModels } from '../models/index.js';
import LoginPolicy from '../models/LoginPolicy.js';
import sequelize from '../../config/db.js';

let User = null;
let LicenseModel = null;
let PermissionsModel = null;
let modelsReady = false;
let initPromise = null;

const PASSWORD_VALIDITY_DAYS = 60; // 2 months

const ensureModels = async () => {
  if (modelsReady && User && typeof User.findOne === 'function') {
    return { User, License: LicenseModel, Permissions: PermissionsModel };
  }
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      console.log('🚀 Initializing models (once) for LoginController...');
      await initializeModels();
      User = getUser();
      LicenseModel = getLicense();
      PermissionsModel = getPermissions();
      if (!User || typeof User.findOne !== 'function') {
        throw new Error('User model not properly initialized');
      }
      modelsReady = true;
      console.log('✅ Models ready for LoginController');
      return { User, License: LicenseModel, Permissions: PermissionsModel };
    } catch (error) {
      console.error('❌ Failed to initialize models:', error);
      throw error;
    }
  })();
  return initPromise;
};


const validateLicenseForLogin = async () => {
  try {
    if (!LicenseModel || typeof LicenseModel.findOne !== 'function') {
      console.log('⚠️ License model not available, skipping license check');
      return { valid: true, license: { id: 1, max_users: 999999 } };
    }
    const activeLicense = await LicenseModel.findOne({
      where: { is_used: true, expires: { [Op.gt]: new Date() } },
      order: [['expires', 'DESC']]
    });
    if (!activeLicense) {
      return { valid: true, license: { id: 1, max_users: 999999 } };
    }
    return { 
      valid: true,
      license: {
        id: activeLicense.id,
        issued_to: activeLicense.issued_to,
        license_type: activeLicense.license_type,
        expires: activeLicense.expires,
        max_users: activeLicense.max_users,
        max_branches: activeLicense.max_branches
      }
    };
  } catch (error) {
    console.error('License validation error:', error);
    return { valid: true, license: { id: 1, max_users: 999999 } };
  }
};

// ============================================
// LOGIN FUNCTION with POLICY & PASSWORD EXPIRY
// ============================================
// ============================================
// LOGIN FUNCTION with POLICY & PASSWORD EXPIRY - FIXED
// ============================================
export const login = asyncHandler(async (req, res) => {
  const { username, user_name, password } = req.body;
  const loginIdentifier = (username || user_name)?.trim();
  const cleanPassword = password?.trim();

  console.log('🔐 LOGIN ATTEMPT:', {
    login_identifier: loginIdentifier,
    password_length: cleanPassword?.length || 0,
    timestamp: new Date().toISOString()
  });

  if (!loginIdentifier || !cleanPassword) {
    return res.status(400).json({
      success: false,
      message: 'Login identifier and password are required',
    });
  }

  try {
    await ensureModels();
    if (!User || typeof User.findOne !== 'function') {
      return res.status(503).json({
        success: false,
        message: 'Service temporarily unavailable. Please try again.',
        retryAfter: 5
      });
    }

    // Find user (include password fields)
    const user = await User.findOne({
      where: { [Op.or]: [{ user_name: loginIdentifier }, { username: loginIdentifier }] },
      attributes: { include: ['password', 'default_password'] },
      raw: true
    });

    if (!user) {
      console.log('❌ USER NOT FOUND');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        remainingAttempts: 5
      });
    }

    console.log('📊 USER FOUND:', {
      user_id: user.id,
      user_name: user.user_name,
      status: user.status,
      has_password: !!user.password,
      has_default_password: !!user.default_password,
      is_first_login: user.is_first_login,
      BU_ROLE_ID: user.BU_ROLE_ID
    });

    if (user.status !== 'Active') {
      return res.status(401).json({
        success: false,
        message: 'User account is disabled or inactive',
      });
    }

    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      const lockTime = Math.ceil((new Date(user.lock_until) - new Date()) / 60000);
      return res.status(401).json({
        success: false,
        message: `Account is locked. Try again in ${lockTime} minutes.`,
        lock_until: user.lock_until
      });
    }

    // ========== PASSWORD VALIDATION ==========
    let isPasswordMatch = false;

    if (user.password && user.password.length > 0) {
      if (!user.password.startsWith('$2')) {
        console.error('❌ Stored password is not a bcrypt hash – login rejected');
        return res.status(401).json({
          success: false,
          message: 'Authentication error. Please contact administrator.',
          code: 'INVALID_PASSWORD_HASH'
        });
      }
      try {
        isPasswordMatch = await bcrypt.compare(cleanPassword, user.password);
        console.log('🔑 BCRYPT COMPARE RESULT:', isPasswordMatch);
      } catch (bcryptError) {
        console.error('❌ BCRYPT COMPARE ERROR:', bcryptError.message);
        return res.status(401).json({
          success: false,
          message: 'Authentication error. Please try again later.',
          code: 'BCRYPT_ERROR'
        });
      }
    }
    else if (user.is_first_login && user.default_password && user.default_password.length > 0) {
      console.log('🔑 CHECKING DEFAULT PASSWORD (first login)...');
      try {
        isPasswordMatch = await bcrypt.compare(cleanPassword, user.default_password);
        console.log('🔑 DEFAULT PASSWORD MATCH:', isPasswordMatch);
      } catch (defaultError) {
        console.error('❌ DEFAULT PASSWORD COMPARE ERROR:', defaultError.message);
        isPasswordMatch = false;
      }
    }
    else {
      console.error('❌ No password hash and no default password – login rejected');
      return res.status(401).json({
        success: false,
        message: 'Account not properly configured. Please contact administrator.',
        code: 'NO_PASSWORD_HASH'
      });
    }

    if (!isPasswordMatch) {
      console.log('❌ PASSWORD MISMATCH');
      const newFailedAttempts = (user.failed_attempts || 0) + 1;
      let lockUntil = null;
      if (newFailedAttempts >= 5) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        console.log('🔒 LOCKING ACCOUNT');
      }
      await User.update({
        failed_attempts: newFailedAttempts,
        lock_until: lockUntil
      }, { where: { id: user.id } });
      return res.status(401).json({
        success: false,
        message: 'Invalid username or password',
        remainingAttempts: 5 - newFailedAttempts,
        locked: lockUntil !== null,
        lock_until: lockUntil
      });
    }

    // ========== FIRST LOGIN WITH DEFAULT PASSWORD – FORCE PASSWORD CHANGE ==========
    if (user.is_first_login && user.default_password && isPasswordMatch) {
      console.log('✅ First login with default password – forcing password change');
      const tempToken = jwt.sign(
        {
          userId: user.id,
          purpose: 'password_change',
          type: 'temp'
        },
        getSecretKey() || process.env.JWT_SECRET,
        { expiresIn: '1h' }
      );
      return res.status(200).json({
        success: false,
        requiresPasswordChange: true,
        message: 'First login. Please set a new password to continue.',
        tempToken,
        redirectTo: '/first-time-password',
        user: {
          userId: user.id,
          user_name: user.user_name,
          name: user.preferred_name || user.user_name
        }
      });
    }

    // If password is correct and not first login, continue normal login flow
    console.log('✅ PASSWORD VERIFIED SUCCESSFULLY');

    // ========== GLOBAL LOGIN HOURS POLICY ENFORCEMENT ==========
    try {
      const policy = await LoginPolicy.findOne();
      if (policy && policy.enabled === true) {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const [earliestHour, earliestMinute] = policy.earliest_login_time.split(':').map(Number);
        const [latestHour, latestMinute] = policy.latest_login_time.split(':').map(Number);
        const earliestMinutes = earliestHour * 60 + earliestMinute;
        const latestMinutes = latestHour * 60 + latestMinute;

        const isAdminUser = parseInt(user.BU_ROLE_ID) === 1;
        if (!isAdminUser && (currentMinutes < earliestMinutes || currentMinutes > latestMinutes)) {
          console.log(`🚫 LOGIN BLOCKED by policy: ${currentMinutes} min, window ${earliestMinutes}-${latestMinutes}`);
          return res.status(403).json({
            success: false,
            message: `Login allowed only between ${policy.earliest_login_time.slice(0,5)} and ${policy.latest_login_time.slice(0,5)}.`,
            code: 'LOGIN_HOURS_RESTRICTED'
          });
        }
        console.log(`✅ Login allowed – within policy window ${policy.earliest_login_time.slice(0,5)}-${policy.latest_login_time.slice(0,5)}`);
      } else {
        console.log('ℹ️ Login policy not enabled, skipping restriction');
      }
    } catch (policyError) {
      console.error('⚠️ Failed to check login policy:', policyError);
    }

    // ========== LICENSE VALIDATION - FIXED ==========
    // ✅ Check if user is ADMIN (BU_ROLE_ID = 1) - bypass license check
    const isAdmin = parseInt(user.BU_ROLE_ID) === 1;
    
    if (!isAdmin) {
      console.log('🔍 CHECKING LICENSE VALIDITY FOR NON-ADMIN USER...');
      try {
        const licenseCheck = await validateLicenseForLogin();
        if (!licenseCheck || !licenseCheck.valid) {
          let statusCode = 403;
          if (licenseCheck?.code === 'NO_LICENSE') statusCode = 404;
          if (licenseCheck?.code === 'LICENSE_EXPIRED') statusCode = 410;
          return res.status(statusCode).json({
            success: false,
            message: licenseCheck?.message || 'License validation failed',
            code: licenseCheck?.code || 'LICENSE_ERROR',
            details: licenseCheck?.details || {}
          });
        }
        console.log('✅ LICENSE VALID');
      } catch (licenseError) {
        console.error('⚠️ License validation error:', licenseError.message);
        // ✅ Allow login even if license check fails (graceful degradation)
        console.log('⚠️ License validation failed but allowing login (graceful degradation)');
      }
    } else {
      console.log('✅ ADMIN USER - SKIPPING LICENSE CHECK');
    }

    // Reset failed attempts and update last login
    await User.update({
      failed_attempts: 0,
      lock_until: null,
      last_login: new Date()
    }, { where: { id: user.id } });

    // ✅ FIX: Explicitly include force_password_change and password_expiry_date
    const updatedUser = await User.findByPk(user.id, {
      attributes: { include: ['force_password_change', 'password_expiry_date'] }
    });
    
    const isAdminUser = parseInt(updatedUser.BU_ROLE_ID) === 1;
    let roleName = updatedUser.primary_business_role || (isAdminUser ? 'Administrator' : 'Staff');

    let permissions = [];
    if (isAdminUser) {
      permissions = Object.values(PERMISSIONS).flatMap(g => typeof g === 'object' ? Object.values(g) : []);
    } else {
      const roleKey = updatedUser.BU_ROLE_ID?.toString();
      if (roleKey && ROLE_MAPPING[roleKey]) {
        roleName = ROLE_MAPPING[roleKey].ROLE_NM || roleName;
        permissions = ROLE_MAPPING[roleKey].permissions || [];
      } else {
        permissions = ['DASHBOARD_STAFF', 'DASHBOARD_REAL_TIME_STATS', 'CUSTOMER_VIEW', 'ACCOUNT_VIEW_BALANCE', 'TRANSACTION_VIEW'];
      }
    }

    // ✅ DEBUG: Log the value of force_password_change
    console.log('🔍 DEBUG force_password_change value:', updatedUser.force_password_change, 'type:', typeof updatedUser.force_password_change);
    console.log('🔍 DEBUG password_expiry_date:', updatedUser.password_expiry_date);

    // Check if password change is required (forced flag, or expired)
    let requiresPasswordChange = false;
    let tempToken = null;
    if (!isAdminUser) {
      const isExpired = updatedUser.password_expiry_date && new Date() > new Date(updatedUser.password_expiry_date);
      requiresPasswordChange = updatedUser.force_password_change || isExpired;
      console.log('🔍 DEBUG requiresPasswordChange:', requiresPasswordChange);
      
      // ✅ For admin‑forced password change, generate a temporary token (same as first login)
      if (requiresPasswordChange && updatedUser.force_password_change) {
        console.log('🔍 DEBUG Generating tempToken for forced password change');
        tempToken = jwt.sign(
          {
            userId: updatedUser.id,
            purpose: 'password_change',
            type: 'temp',
            isForced: true
          },
          getSecretKey() || process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );
      }
    }

    // If forced change, send back a response similar to first login (no full JWT)
    if (tempToken) {
      console.log('✅ Forced password change – returning tempToken, redirect to first-time-password');
      return res.status(200).json({
        success: false,
        requiresPasswordChange: true,
        message: 'Your password has been reset by admin. Please set a new password to continue.',
        tempToken,
        redirectTo: '/first-time-password',
        user: {
          userId: updatedUser.id,
          user_name: updatedUser.user_name,
          name: updatedUser.preferred_name || updatedUser.user_name
        }
      });
    }

    // Normal login – generate full JWT
    const token = jwt.sign(
      {
        userId: updatedUser.id,
        id: updatedUser.id,
        user_name: updatedUser.user_name || updatedUser.username || loginIdentifier,
        email: updatedUser.email,
        preferred_name: updatedUser.preferred_name || null,
        role: roleName,
        roleId: updatedUser.BU_ROLE_ID,
        BU_ROLE_ID: updatedUser.BU_ROLE_ID,
        isAdmin: isAdminUser,
        businessUnit: updatedUser.main_business_unit || 'Wethral',
        accessibleBusinessUnits: [updatedUser.main_business_unit || 'Wethral'],
        iat: Math.floor(Date.now() / 1000)
      },
      getSecretKey() || process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    let redirectTo = '/business-role';
    if (!isAdminUser && requiresPasswordChange) redirectTo = '/change-password';

    const response = {
      success: true,
      token,
      user: {
        userId: updatedUser.id,
        user_name: updatedUser.user_name || updatedUser.username || loginIdentifier,
        email: updatedUser.email,
        preferred_name: updatedUser.preferred_name || null,
        role: roleName,
        BU_ROLE_ID: updatedUser.BU_ROLE_ID,
        primary_business_role: updatedUser.primary_business_role || roleName,
        businessUnit: updatedUser.main_business_unit || 'Wethral',
        isAdmin: isAdminUser,
        is_first_login: updatedUser.is_first_login,
        force_password_change: updatedUser.force_password_change,
        requiresPasswordChange: requiresPasswordChange,
        permissions: permissions,
        accessibleBusinessUnits: [updatedUser.main_business_unit || 'Wethral'],
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7*24*60*60*1000).toISOString()
      },
      license: null, // License info removed for admin
      redirectTo: redirectTo,
      message: 'Login successful'
    };
    res.status(200).json(response);
  } catch (error) {
    console.error('💥 LOGIN PROCESS ERROR:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export const changeFirstLoginPassword = asyncHandler(async (req, res) => {
  console.time('changeFirstLoginPassword');
  const { tempToken, user_name, newPassword, confirmPassword } = req.body;

  // --- Validation (fast) ---
  if (!newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'Password must be 8+ chars with uppercase, lowercase, number, and special character'
    });
  }

  try {
    console.time('ensureModels');
    await ensureModels();
    console.timeEnd('ensureModels');  // should be ~0ms after first call

    let userId;
    if (tempToken) {
      console.time('verifyToken');
      let decoded;
      try {
        decoded = jwt.verify(tempToken, getSecretKey() || process.env.JWT_SECRET);
      } catch (err) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
      }
      console.timeEnd('verifyToken');
      if (decoded.purpose !== 'password_change') {
        return res.status(403).json({ success: false, message: 'Invalid token purpose' });
      }
      userId = decoded.userId;
    } else if (user_name) {
      console.time('findUserByName');
      const user = await User.findOne({ where: { user_name } });
      console.timeEnd('findUserByName');
      if (!user) return res.status(404).json({ success: false, message: 'User not found' });
      userId = user.id;
    } else {
      return res.status(400).json({ success: false, message: 'Either tempToken or user_name required' });
    }

    console.time('findUserById');
    const user = await User.findByPk(userId);
    console.timeEnd('findUserById');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (!user.is_first_login && !user.force_password_change) {
      return res.status(400).json({ success: false, message: 'Password already changed. Please login.' });
    }

    // Hash password (bcrypt)
    console.time('bcrypt.hash');
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    console.timeEnd('bcrypt.hash');

    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + PASSWORD_VALIDITY_DAYS);

    // ⚡ OPTIMIZATION: Use raw SQL to bypass Sequelize hooks (much faster)
    console.time('rawUpdate');
    const [updateResult] = await sequelize.query(
      `UPDATE users
       SET
         password = :hashed,
         default_password = NULL,
         is_first_login = 0,
         force_password_change = 0,
         passwordChangedAt = :now,
         password_expiry_date = :expiry,
         failed_attempts = 0,
         lock_until = NULL
       WHERE id = :id`,
      {
        replacements: {
          hashed: hashedNewPassword,
          now: new Date(),
          expiry: newExpiryDate,
          id: user.id
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );
    console.timeEnd('rawUpdate');

    console.log(`Password updated for user ${user.user_name} (affected rows: ${updateResult})`);

    // Generate JWT (fast)
    console.time('generateJWT');
    const isAdmin = parseInt(user.BU_ROLE_ID) === 1;
    let roleName = user.primary_business_role || (isAdmin ? 'Administrator' : 'Staff');
    let permissions = [];
    if (isAdmin) {
      permissions = Object.values(PERMISSIONS).flatMap(g => typeof g === 'object' ? Object.values(g) : []);
    } else {
      const roleKey = user.BU_ROLE_ID?.toString();
      if (roleKey && ROLE_MAPPING[roleKey]) {
        roleName = ROLE_MAPPING[roleKey].ROLE_NM || roleName;
        permissions = ROLE_MAPPING[roleKey].permissions || [];
      } else {
        permissions = ['DASHBOARD_STAFF', 'DASHBOARD_REAL_TIME_STATS', 'CUSTOMER_VIEW', 'ACCOUNT_VIEW_BALANCE', 'TRANSACTION_VIEW'];
      }
    }

    const token = jwt.sign(
      {
        userId: user.id,
        id: user.id,
        user_name: user.user_name || user.username,
        email: user.email,
        preferred_name: user.preferred_name || null,
        role: roleName,
        roleId: user.BU_ROLE_ID,
        BU_ROLE_ID: user.BU_ROLE_ID,
        isAdmin: isAdmin,
        businessUnit: user.main_business_unit || 'Wethral',
        accessibleBusinessUnits: [user.main_business_unit || 'Wethral'],
        iat: Math.floor(Date.now() / 1000)
      },
      getSecretKey() || process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    console.timeEnd('generateJWT');

    console.timeEnd('changeFirstLoginPassword');
    return res.json({
      success: true,
      message: 'Password set successfully. You can now log in.',
      token,
      redirectTo: '/business-role',
      user: {
        userId: user.id,
        user_name: user.user_name || user.username,
        email: user.email,
        preferred_name: user.preferred_name || null,
        role: roleName,
        BU_ROLE_ID: user.BU_ROLE_ID,
        primary_business_role: user.primary_business_role || roleName,
        businessUnit: user.main_business_unit || 'Wethral',
        isAdmin: isAdmin,
        is_first_login: false,
        force_password_change: false,
        requiresPasswordChange: false,
        permissions: permissions,
        accessibleBusinessUnits: [user.main_business_unit || 'Wethral']
      }
    });
  } catch (error) {
    console.error('💥 PASSWORD CHANGE ERROR:', error);
    return res.status(500).json({ success: false, message: 'Failed to set password' });
  }
});
// ============================================
// REGULAR PASSWORD CHANGE (with current password)
// ============================================
export const changePassword = asyncHandler(async (req, res) => {
  const { user_name, currentPassword, newPassword, confirmPassword } = req.body;
  if (!user_name || !currentPassword || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'Password must be 8+ chars with uppercase, lowercase, number, and special character'
    });
  }

  try {
    await ensureModels();
    if (!User) return res.status(503).json({ success: false, message: 'Service unavailable' });

    const user = await User.findOne({
      where: { [Op.or]: [{ user_name }, { username: user_name }] },
      attributes: { include: ['password'] }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.status !== 'Active') {
      return res.status(401).json({ success: false, message: 'User account is disabled or inactive' });
    }

    let isCurrentPasswordValid = false;
    if (user.password) {
      isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    }
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + PASSWORD_VALIDITY_DAYS);

    await user.update({
      password: hashedNewPassword,
      default_password: null,
      failed_attempts: 0,
      lock_until: null,
      passwordChangedAt: new Date(),
      password_expiry_date: newExpiryDate,
      is_first_login: false,
      force_password_change: false
    });

    logger.info(`Password changed for user: ${user.user_name || user.username}`);
    res.json({ 
      success: true, 
      message: 'Password changed successfully',
      password_expiry_date: newExpiryDate,
      days_until_expiry: PASSWORD_VALIDITY_DAYS
    });
  } catch (error) {
    console.error('💥 PASSWORD CHANGE ERROR:', error);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

// ============================================
// EMERGENCY PASSWORD RESET (admin only)
// ============================================
export const emergencyPasswordReset = asyncHandler(async (req, res) => {
  console.log('🔥 emergencyPasswordReset called with body:', req.body);
  const { user_name, new_password, confirm_password } = req.body;

  if (!user_name || !new_password || !confirm_password) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }
  if (new_password !== confirm_password) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(new_password)) {
    return res.status(400).json({
      success: false,
      message: 'Password must be 8+ chars with uppercase, lowercase, number, and special character'
    });
  }

  try {
    await ensureModels();
    if (!User) return res.status(503).json({ success: false, message: 'User model not ready' });

    const [user] = await sequelize.query(
      `SELECT id, user_name, is_first_login, default_password IS NOT NULL as has_default
       FROM users
       WHERE user_name = :user_name OR username = :user_name OR email = :user_name
       LIMIT 1`,
      { replacements: { user_name }, type: sequelize.QueryTypes.SELECT }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    console.log('📊 User before reset:', {
      id: user.id,
      is_first_login: user.is_first_login,
      has_default: user.has_default
    });

    const hashed = await bcrypt.hash(new_password, 10);
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + PASSWORD_VALIDITY_DAYS);
    const expiryStr = newExpiryDate.toISOString().slice(0, 19).replace('T', ' ');
    const nowStr = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const [updateResult] = await sequelize.query(
      `UPDATE users
       SET
         password = :hashed,
         default_password = NULL,
         failed_attempts = 0,
         lock_until = NULL,
         passwordChangedAt = :now,
         password_expiry_date = :expiry,
         is_first_login = 0,
         force_password_change = 1
       WHERE id = :id`,
      {
        replacements: {
          hashed,
          now: nowStr,
          expiry: expiryStr,
          id: user.id
        }
      }
    );

    console.log('✅ SQL update result (affected rows):', updateResult);

    // Verify the update by fetching the user again
    const [updatedUserCheck] = await sequelize.query(
      `SELECT force_password_change FROM users WHERE id = :id`,
      { replacements: { id: user.id }, type: sequelize.QueryTypes.SELECT }
    );
    console.log('✅ Force password change after update:', updatedUserCheck?.force_password_change);

    logger.info(`Emergency password reset for ${user.user_name}`);
    res.json({ success: true, message: 'Password reset successfully. User must change password on next login.' });
  } catch (error) {
    console.error('💥 Emergency reset error:', error);
    res.status(500).json({ success: false, message: 'Reset failed', error: error.message });
  }
});

// ============================================
// GET PASSWORD STATUS (days left, expiry date, etc.)
// ============================================
export const getPasswordStatus = asyncHandler(async (req, res) => {
  const userId = req.user?.id || req.params.userId;
  if (!userId) {
    return res.status(400).json({ success: false, message: 'User ID required' });
  }

  try {
    await ensureModels();
    const user = await User.findByPk(userId, {
      attributes: ['id', 'is_first_login', 'force_password_change', 'password_expiry_date', 'passwordChangedAt']
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const now = new Date();
    const expiryDate = user.password_expiry_date ? new Date(user.password_expiry_date) : null;
    let daysUntilExpiry = null;
    let isExpired = false;
    if (expiryDate) {
      const diff = expiryDate - now;
      daysUntilExpiry = Math.ceil(diff / (1000 * 60 * 60 * 24));
      isExpired = daysUntilExpiry <= 0;
    }

    const requiresChange = user.is_first_login || user.force_password_change || isExpired;

    res.status(200).json({
      success: true,
      data: {
        isFirstLogin: user.is_first_login,
        forcePasswordChange: user.force_password_change,
        passwordExpiryDate: expiryDate,
        passwordChangedAt: user.passwordChangedAt,
        daysUntilExpiry: daysUntilExpiry,
        isExpired: isExpired,
        requiresPasswordChange: requiresChange,
        validityDays: PASSWORD_VALIDITY_DAYS
      }
    });
  } catch (error) {
    console.error('Error fetching password status:', error);
    res.status(500).json({ success: false, message: 'Failed to get password status' });
  }
});

// ============================================
// SESSION MANAGEMENT
// ============================================
export const clearUserSession = async (req, res) => {
  const { user_id, user_name } = req.body;
  console.log('📝 clearUserSession called:', { user_id, user_name });
  if (!user_id && !user_name) {
    return res.status(400).json({ success: false, message: 'user_id or user_name is required' });
  }
  try {
    if (!User) {
      return res.status(200).json({
        success: true,
        message: `Session cleared for user: ${user_id || user_name}`,
        clearedAt: new Date().toISOString(),
        note: 'Model not available but session cleared'
      });
    }
    let targetUser = null;
    if (user_id) {
      if (!isNaN(user_id)) targetUser = await User.findByPk(parseInt(user_id));
      if (!targetUser) {
        targetUser = await User.findOne({ where: { [Op.or]: [{ user_name: user_id }, { username: user_id }, { email: user_id }] } });
      }
    }
    if (!targetUser && user_name) {
      targetUser = await User.findOne({ where: { [Op.or]: [{ user_name }, { username: user_name }, { email: user_name }] } });
    }
    if (targetUser) {
      console.log(`✅ User found: ID=${targetUser.id}, Name=${targetUser.user_name || targetUser.username}`);
      try {
        const currentVersion = targetUser.token_version || 0;
        await targetUser.update({ token_version: currentVersion + 1 });
        console.log(`✅ Token version updated`);
      } catch (updateError) {
        if (targetUser.session_token) await targetUser.update({ session_token: null });
        if (targetUser.token) await targetUser.update({ token: null });
      }
      return res.status(200).json({ success: true, message: `Session cleared for user: ${targetUser.user_name || targetUser.username}`, userId: targetUser.id, clearedAt: new Date().toISOString() });
    }
    console.log(`⚠️ User not found in database: ${user_id || user_name}`);
    return res.status(200).json({ success: true, message: `Session cleared for user: ${user_id || user_name}`, clearedAt: new Date().toISOString(), note: 'User not found in database, but frontend session cleared' });
  } catch (error) {
    console.error('❌ Clear session error:', error);
    return res.status(200).json({ success: true, message: `Session cleared for user: ${user_id || user_name}`, clearedAt: new Date().toISOString(), note: 'Backend error occurred but frontend will clear session' });
  }
};

export const clearAllUserSessions = async (req, res) => {
  if (!req.user?.isAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  try {
    if (!User) {
      return res.status(200).json({ success: true, message: 'All user sessions cleared (simulated)', clearedAt: new Date().toISOString() });
    }
    const users = await User.findAll();
    let updatedCount = 0;
    for (const user of users) {
      try {
        await user.update({ token_version: (user.token_version || 0) + 1 });
        updatedCount++;
      } catch (e) {}
    }
    logger.info(`Cleared sessions for ${updatedCount} users`);
    res.json({ success: true, message: `Cleared sessions for ${updatedCount} users`, data: { users_affected: updatedCount, cleared_at: new Date().toISOString() } });
  } catch (error) {
    console.error('Clear all sessions error:', error);
    res.status(200).json({ success: true, message: 'Session cleared (with errors)', clearedAt: new Date().toISOString() });
  }
};

// ============================================
// TEST CONFIG SERVICE
// ============================================
export const testConfigService = asyncHandler(async (req, res) => {
  try {
    if (!configurationService.initialized) await configurationService.initialize();
    const restrictionEnabled = await configurationService.get('login.enable_hours_restriction', false);
    const defaultEarliest = await configurationService.get('login.default_earliest_time', '08:00:00');
    const defaultLatest = await configurationService.get('login.default_latest_time', '18:00:00');
    const allowOverride = await configurationService.get('login.allow_admin_override', true);
    const overrideRoles = await configurationService.get('login.override_roles', ['Administrator']);
    const loginHoursConfig = await configurationService.getLoginHours();
    const canBypass = await configurationService.canBypassLoginHours(['Administrator']);
    res.json({
      success: true,
      message: 'Configuration service test completed',
      data: {
        initialized: configurationService.initialized,
        restriction_enabled: restrictionEnabled,
        default_earliest: defaultEarliest,
        default_latest: defaultLatest,
        allow_admin_override: allowOverride,
        override_roles: overrideRoles,
        full_login_hours_config: loginHoursConfig,
        admin_bypass_test: canBypass
      }
    });
  } catch (error) {
    console.error('❌ Configuration service test failed:', error);
    res.status(500).json({ success: false, message: 'Configuration service test failed', error: error.message });
  }
});

// ============================================
// EXPORTS
// ============================================
export default { 
  login, 
  changePassword,
  changeFirstLoginPassword,
  emergencyPasswordReset, 
  getPasswordStatus,
  testConfigService,
  clearUserSession,
  clearAllUserSessions
};