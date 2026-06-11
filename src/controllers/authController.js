// controllers/authController.js - UPDATED WITH LICENSE INTEGRATION
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateToken as authGenerateToken } from '../middlewares/authMiddleware.js';
import Login from '../models/Login.js';
import { Op } from 'sequelize';
import License from '../models/License.js';
import ActiveSession from '../models/ActiveSession.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Define __filename and __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// License file path
const LICENSE_FILE_PATH = process.env.LICENSE_FILE_PATH || 
  path.join(__dirname, '..', '..', '..', 'CORE_X_FRONTEND', 'build', 'license', 'license.txt');

// ============================================
// LICENSE HELPER FUNCTIONS
// ============================================

// Get active license
const getActiveLicense = async () => {
  try {
    // Read license from file
    if (!fs.existsSync(LICENSE_FILE_PATH)) {
      return null;
    }

    const encryptedKey = fs.readFileSync(LICENSE_FILE_PATH, 'utf8').trim();
    
    if (!encryptedKey) {
      return null;
    }

    // Find in database
    const license = await License.findOne({
      where: { encrypted_key: encryptedKey }
    });

    return license;
  } catch (error) {
    console.error('Error getting active license:', error);
    return null;
  }
};

// Check if license allows new session
const checkLicenseSessionLimit = async () => {
  const license = await getActiveLicense();
  
  if (!license) {
    throw new Error('No active license found');
  }

  if (license.isExpired()) {
    throw new Error('License has expired');
  }

  // Check session limit
  const activeSessions = await ActiveSession.count({
    where: { expires_at: { [Op.gt]: new Date() } }
  });

  const maxSessions = license.max_concurrent_sessions || 100;
  if (activeSessions >= maxSessions) {
    throw new Error(`Maximum concurrent sessions reached (${maxSessions}). Try again later.`);
  }

  return license;
};

// Update license session count
const updateLicenseSessionCount = async (increment = true) => {
  try {
    const license = await getActiveLicense();
    if (license) {
      if (increment) {
        await license.incrementSessionCount();
      } else {
        await license.decrementSessionCount();
      }
    }
  } catch (error) {
    console.error('Error updating license session count:', error);
  }
};

// Check user limit for user creation
const checkLicenseUserLimit = async () => {
  const license = await getActiveLicense();
  
  if (!license) {
    throw new Error('No active license found');
  }

  if (license.isExpired()) {
    throw new Error('License has expired');
  }

  // Check user count
  const activeUsers = await User.count({
    where: { status: 'Active' }
  });

  if (license.max_users && activeUsers >= license.max_users) {
    throw new Error(`Maximum user limit reached (${license.max_users}). Upgrade your license.`);
  }

  return license;
};

// ============================================
// EXISTING HELPER FUNCTIONS
// ============================================

// Function to generate and save reset token
const generateResetToken = async (user) => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenExpire = Date.now() + 3600 * 1000; // 1 hour from now

  user.reset_token = resetToken;
  user.reset_token_expire = resetTokenExpire;
  await user.save();

  return resetToken;
};

// Function to generate temporary token for password change
const generateTempToken = async (userId) => {
  const tempToken = crypto.randomBytes(32).toString('hex');
  const tempTokenExpire = Date.now() + 600 * 1000; // 10 minutes from now
  
  // Store temp token in user record
  const user = await User.findByPk(userId);
  if (user) {
    user.temp_password_token = tempToken;
    user.temp_token_expire = tempTokenExpire;
    await user.save();
  }
  
  return tempToken;
};

// Validate password strength
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

  if (password.length < minLength) {
    return { valid: false, message: `Password must be at least ${minLength} characters long` };
  }
  if (!hasUpperCase) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!hasLowerCase) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!hasNumbers) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  if (!hasSpecialChar) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }

  return { valid: true, message: 'Password is strong' };
};

// Function to log login attempts
const logLoginAttempt = async (user_id, username, ip_address, user_agent, status, error, error_code = null, session_id = null, password_changed = false) => {
  try {
    await Login.create({
      user_id: user_id,
      user_name: username,
      username: username,
      ip_address: ip_address,
      user_agent: user_agent,
      session_id: session_id,
      status: status,
      success: status === 'Success',
      error: error,
      error_code: error_code,
      attempt_identifier: username,
      login_type: 'password',
      device_type: 'unknown',
      location_data: {},
      failed_attempts_count: status === 'Failed' ? 1 : 0,
      password_changed: password_changed
    });
  } catch (error) {
    console.error('Error logging login attempt:', error);
  }
};

// Generate session token
const generateSessionToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// ============================================
// UPDATED LOGIN FUNCTION WITH LICENSE CHECKS
// ============================================

// Updated Login Function with license validation
// Updated loginUser function in authController.js
const loginUser = async (req, res) => {
  const { user_name, password } = req.body;

  // Get client information
  const ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const user_agent = req.headers['user-agent'];
  const session_id = req.sessionID;

  try {
    // ✅ 1. CHECK LICENSE FIRST
    try {
      await checkLicenseSessionLimit();
    } catch (licenseError) {
      await logLoginAttempt(null, user_name, ip_address, user_agent, 'Failed', licenseError.message, 'LICENSE_ERROR');
      return res.status(403).json({ 
        success: false, 
        message: licenseError.message,
        code: 'LICENSE_ERROR'
      });
    }

    // ✅ 2. FIND USER
    const user = await User.findOne({ 
      where: { user_name: user_name },
      attributes: { include: ['password', 'default_password', 'passwordHistory', 'temp_password_token', 'temp_token_expire'] }
    });

    if (!user) {
      await logLoginAttempt(null, user_name, ip_address, user_agent, 'Failed', 'User not found', 'USER_NOT_FOUND');
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // ✅ 3. CHECK IF ACCOUNT IS LOCKED
    if (user.lock_until && user.lock_until > new Date()) {
      await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 'Failed', 'Account is locked', 'ACCOUNT_LOCKED');
      return res.status(401).json({ 
        success: false, 
        message: "Account is locked. Please try again later." 
      });
    }

    // ✅ 4. VERIFY PASSWORD
    const isMatch = await bcrypt.compare(password, user.password);
    const isDefaultPassword = user.default_password 
      ? await bcrypt.compare(password, user.default_password)
      : false;

    // First-time login check
    const isFirstLogin = isDefaultPassword || 
                         (user.passwordChangedAt === null && user.is_first_login === true);

    if (!isMatch && !isDefaultPassword) {
      user.failed_attempts = (user.failed_attempts || 0) + 1;
      if (user.failed_attempts >= 5) {
        user.lock_until = new Date(Date.now() + 30 * 60 * 1000);
      }
      await user.save();
      
      await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 'Failed', 'Invalid password', 'INVALID_PASSWORD');
      
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // ✅ 5. CHECK LOGIN HOURS
    const isWithinHours = await user.isWithinLoginHours();
    if (!isWithinHours) {
      const canBypass = await user.canBypassLoginHours();
      if (!canBypass) {
        await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 'Failed', 'Outside login hours', 'OUTSIDE_LOGIN_HOURS');
        return res.status(403).json({
          success: false,
          message: 'Login not allowed at this time. Please try again during login hours.',
          code: 'OUTSIDE_LOGIN_HOURS'
        });
      }
    }

    // ✅ 6. RESET FAILED ATTEMPTS ON SUCCESSFUL LOGIN
    user.failed_attempts = 0;
    user.lock_until = null;
    user.last_login = new Date();
    await user.save();

    // ✅ 7. GET LICENSE INFO FOR RESPONSE
    const license = await getActiveLicense();
    const licenseInfo = license ? {
      type: license.license_type,
      expires: license.expires,
      max_users: license.max_users,
      max_sessions: license.max_concurrent_sessions || 100
    } : null;

    // ✅ 8. CHECK FOR PASSWORD CHANGE REQUIRED
    if (isFirstLogin) {
      const tempToken = await generateTempToken(user.id);
      
      await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 
        'Success', 'First login - password change required', 'FIRST_LOGIN_REQUIRED', session_id, false);
      
      const userData = {
        userId: user.id,
        user_name: user.user_name,
        email: user.email || '',
        BU_ROLE_ID: user.BU_ROLE_ID,
        businessUnit: user.businessUnit,
        accessibleBusinessUnits: user.accessibleBusinessUnits || [],
        permissions: user.permissions,
        isAdmin: user.isAdmin,
        primary_business_role: user.primary_business_role,
        licenseInfo
      };

      return res.status(200).json({ 
        success: true, 
        message: "Login successful. Please change your default password.", 
        requires_password_change: true,
        temp_token: tempToken,
        user: userData,
        reason: isDefaultPassword ? 'default_password' : 'first_login'
      });
    }

    // ✅ 9. CHECK IF PASSWORD HAS EXPIRED
    if (user.password_expiry_date && new Date() > user.password_expiry_date) {
      const tempToken = await generateTempToken(user.id);
      
      await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 
        'Success', 'Password expired - change required', 'PASSWORD_EXPIRED', session_id, false);
      
      const userData = {
        userId: user.id,
        user_name: user.user_name,
        email: user.email || '',
        BU_ROLE_ID: user.BU_ROLE_ID,
        businessUnit: user.businessUnit,
        accessibleBusinessUnits: user.accessibleBusinessUnits || [],
        permissions: user.permissions,
        isAdmin: user.isAdmin,
        primary_business_role: user.primary_business_role,
        licenseInfo
      };

      return res.status(200).json({ 
        success: true, 
        message: "Your password has expired. Please change it.", 
        requires_password_change: true,
        temp_token: tempToken,
        user: userData,
        reason: 'password_expired'
      });
    }

    // ✅ 10. CREATE ACTIVE SESSION WITH LICENSE TRACKING
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await ActiveSession.create({
      user_id: user.id,
      session_token: sessionToken,
      ip_address: ip_address,
      user_agent: user_agent,
      login_time: new Date(),
      expires_at: expiresAt
    });

    // ✅ 11. INCREMENT LICENSE SESSION COUNT
    await updateLicenseSessionCount(true);

    // ✅ 12. GENERATE JWT TOKEN - FIXED TO USE CORRECT SECRET
    const JWT_SECRET = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
    
    // Create payload that matches what authMiddleware expects
    const tokenPayload = {
      id: user.id,
      userId: user.id,
      username: user.user_name,
      user_name: user.user_name,
      email: user.email || '',
      role: user.primary_business_role || user.role || 'cashier',
      BU_ROLE_ID: user.BU_ROLE_ID || '5',
      bu_id: user.businessUnit || user.bu_id || '001',
      staff_id: user.staff_id || user.user_name,
      isAdmin: user.isAdmin || false
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    // ✅ 13. TRACK SESSION IN USER MODEL
    user.current_sessions = [...(user.current_sessions || []), {
      token,
      ip: ip_address,
      userAgent: user_agent,
      loginTime: new Date(),
      expires: expiresAt
    }].slice(-10);

    // ✅ 14. ADD TO LOGIN HISTORY
    user.login_history = [...(user.login_history || []), {
      ip: ip_address,
      userAgent: user_agent,
      loginTime: new Date(),
      success: true
    }].slice(-50);

    await user.save();

    // ✅ 15. LOG SUCCESSFUL LOGIN
    await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 
      'Success', null, null, session_id, false);

    // ✅ 16. PREPARE USER DATA WITH LICENSE INFO
    const userData = {
      userId: user.id,
      user_name: user.user_name,
      email: user.email || '',
      BU_ROLE_ID: user.BU_ROLE_ID,
      businessUnit: user.businessUnit,
      accessibleBusinessUnits: user.accessibleBusinessUnits || [],
      permissions: user.permissions,
      isAdmin: user.isAdmin,
      primary_business_role: user.primary_business_role,
      tokenIssuedAt: new Date(),
      tokenExpiresAt: expiresAt,
      licenseInfo: {
        ...licenseInfo,
        activeSessions: await ActiveSession.count({ where: { expires_at: { [Op.gt]: new Date() } } }),
        activeUsers: await User.count({ where: { status: 'Active' } })
      }
    };

    // ✅ 17. RETURN SUCCESS RESPONSE
    res.status(200).json({ 
      success: true, 
      message: "Login successful", 
      token, 
      user: userData,
      requires_password_change: false
    });
  } catch (error) {
    console.error("Error logging in:", error);
    await logLoginAttempt(null, user_name, ip_address, user_agent, 'Failed', error.message, 'SYSTEM_ERROR');
    res.status(500).json({ 
      success: false, 
      message: "Error logging in", 
      error: error.message 
    });
  }
};

// ============================================
// LOGOUT FUNCTION WITH LICENSE TRACKING
// ============================================

const logoutUser = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const userId = req.user?.userId;
    
    if (!token && !userId) {
      return res.status(400).json({
        success: false,
        message: 'No token or user ID provided'
      });
    }

    let user;
    
    // If we have a user ID from token, find the user
    if (userId) {
      user = await User.findByPk(userId);
    } 
    // Otherwise try to find by token in current_sessions
    else if (token) {
      user = await User.findOne({
        where: {
          current_sessions: {
            [Op.like]: `%${token}%`
          }
        }
      });
    }

    if (user) {
      // Remove token from current_sessions
      if (user.current_sessions && Array.isArray(user.current_sessions)) {
        user.current_sessions = user.current_sessions.filter(
          session => session.token !== token
        );
        await user.save();
      }

      // Delete from ActiveSession table
      await ActiveSession.destroy({
        where: { 
          [Op.or]: [
            { session_token: token },
            { user_id: userId }
          ]
        }
      });

      // Decrement license session count
      await updateLicenseSessionCount(false);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

// ============================================
// EXISTING PASSWORD CHANGE FUNCTIONS (UPDATED)
// ============================================

// Controller for changing password (for first-time login and regular changes)
const changePassword = async (req, res) => {
  const { user_id, old_password, new_password, temp_token } = req.body;

  try {
    const user = await User.findByPk(user_id, {
      attributes: { include: ['password', 'default_password', 'passwordHistory', 'temp_password_token', 'temp_token_expire'] }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // If using temp token (for first login/forced change), skip old password check
    if (temp_token) {
      // Validate temp token
      if (user.temp_password_token !== temp_token || 
          !user.temp_token_expire || 
          user.temp_token_expire < Date.now()) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired token'
        });
      }
    } else {
      // Regular password change - check old password
      const isOldPasswordValid = await bcrypt.compare(old_password, user.password);
      if (!isOldPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }
    }

    // Password strength validation
    const passwordValidation = validatePasswordStrength(new_password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Check if new password is same as current
    const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as current password'
      });
    }

    // Check if new password is same as default password
    if (user.default_password) {
      const isSameAsDefault = await bcrypt.compare(new_password, user.default_password);
      if (isSameAsDefault) {
        return res.status(400).json({
          success: false,
          message: 'New password cannot be the same as default password'
        });
      }
    }

    // Check password history for reuse (keep last 5 passwords)
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      for (const oldHash of user.passwordHistory) {
        const isPrevious = await bcrypt.compare(new_password, oldHash);
        if (isPrevious) {
          return res.status(400).json({
            success: false,
            message: 'Cannot reuse previous passwords'
          });
        }
      }
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update password history (keep last 5)
    const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

    // Update user
    user.password = hashedPassword;
    user.passwordHistory = updatedHistory;
    user.passwordChangedAt = new Date();
    user.is_first_login = false;
    user.temp_password_token = null;
    user.temp_token_expire = null;
    
    // Set password expiry (e.g., 90 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 90);
    user.password_expiry_date = expiryDate;
    
    await user.save();

    // Generate new token after password change
    const token = authGenerateToken(user);

    // Log the password change in login history
    const ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const user_agent = req.headers['user-agent'];
    await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 
      'Success', 'Password changed', null, req.sessionID, true);

    // Enhanced user data response
    const userData = {
      userId: user.id,
      user_name: user.user_name,
      email: user.email || '',
      BU_ROLE_ID: user.BU_ROLE_ID,
      businessUnit: user.businessUnit,
      accessibleBusinessUnits: user.accessibleBusinessUnits || [],
      permissions: user.permissions,
      isAdmin: user.isAdmin,
      primary_business_role: user.primary_business_role
    };

    res.status(200).json({ 
      success: true, 
      message: "Password changed successfully", 
      token,
      user: userData
    });
  } catch (error) {
    console.error("Error changing password:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error changing password", 
      error: error.message 
    });
  }
};

// ============================================
// EXISTING OTHER FUNCTIONS (KEEP AS IS)
// ============================================

// Controller for resetting user password (forgot password flow)
const resetPassword = async (req, res) => {
  const { reset_token, new_password } = req.body;

  try {
    const user = await User.findOne({ 
      where: { 
        reset_token,
        reset_token_expire: { [Op.gt]: Date.now() }  // Ensure not expired
      },
      attributes: { include: ['password', 'passwordHistory', 'default_password'] }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid or expired reset token" 
      });
    }

    // Password strength validation
    const passwordValidation = validatePasswordStrength(new_password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Check if new password is same as current
    const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as current password'
      });
    }

    // Check if new password is same as default password
    if (user.default_password) {
      const isSameAsDefault = await bcrypt.compare(new_password, user.default_password);
      if (isSameAsDefault) {
        return res.status(400).json({
          success: false,
          message: 'New password cannot be the same as default password'
        });
      }
    }

    // Check password history for reuse
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      for (const oldHash of user.passwordHistory) {
        const isPrevious = await bcrypt.compare(new_password, oldHash);
        if (isPrevious) {
          return res.status(400).json({
            success: false,
            message: 'Cannot reuse previous passwords'
          });
        }
      }
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password history (keep last 5, including current before update)
    const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

    await user.update({
      password: hashedPassword,
      passwordHistory: updatedHistory,
      reset_token: null,
      reset_token_expire: null,
      passwordChangedAt: new Date(),
      is_first_login: false,
      failed_attempts: 0,
      lock_until: null,
      password_expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    });

    // Generate token for immediate login
    const token = authGenerateToken(user);

    // Log the password reset
    const ip_address = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const user_agent = req.headers['user-agent'];
    await logLoginAttempt(user.id, user.user_name, ip_address, user_agent, 
      'Success', 'Password reset via token', null, req.sessionID, true);

    res.status(200).json({ 
      success: true, 
      message: "Password reset successfully", 
      token
    });
  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error resetting password", 
      error: error.message 
    });
  }
};

// Controller to handle password reset request
const requestPasswordReset = async (req, res) => {
  const { user_name } = req.body;

  try {
    const user = await User.findOne({ 
      where: { user_name },
      attributes: { include: ['reset_token', 'reset_token_expire'] }
    });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Check if token already exists and is valid
    if (user.reset_token && user.reset_token_expire > Date.now()) {
      return res.status(400).json({ 
        success: false, 
        message: "Reset token already generated. Please check your email." 
      });
    }

    const resetToken = await generateResetToken(user);
    console.log(`Reset token for user ${user_name}: ${resetToken}`);

    // In production, send email with resetToken; here, return it directly for testing
    res.status(200).json({
      success: true,
      message: 'Reset token generated and sent',
      resetToken: resetToken
    });
  } catch (error) {
    console.error("Error generating reset token:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error generating reset token", 
      error: error.message 
    });
  }
};

// Admin controller to reset a user's password directly
const resetUsers = async (req, res) => {
  const { user_name, new_password } = req.body;

  try {
    const user = await User.findOne({ 
      where: { user_name },
      attributes: { include: ['password', 'passwordHistory', 'default_password'] }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Password strength validation
    const passwordValidation = validatePasswordStrength(new_password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        message: passwordValidation.message
      });
    }

    // Check if new password is same as current
    const isSameAsCurrent = await bcrypt.compare(new_password, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({
        success: false,
        message: 'New password cannot be the same as current password'
      });
    }

    // Check if new password is same as default password
    if (user.default_password) {
      const isSameAsDefault = await bcrypt.compare(new_password, user.default_password);
      if (isSameAsDefault) {
        return res.status(400).json({
          success: false,
          message: 'New password cannot be the same as default password'
        });
      }
    }

    // Check password history for reuse
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      for (const oldHash of user.passwordHistory) {
        const isPrevious = await bcrypt.compare(new_password, oldHash);
        if (isPrevious) {
          return res.status(400).json({
            success: false,
            message: 'Cannot reuse previous passwords'
          });
        }
      }
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update password history
    const updatedHistory = [user.password, ...(user.passwordHistory || []).slice(0, 4)];

    await user.update({
      password: hashedPassword,
      passwordHistory: updatedHistory,
      reset_token: null,
      reset_token_expire: null,
      passwordChangedAt: new Date(),
      is_first_login: false,
      failed_attempts: 0,
      lock_until: null,
      default_password: null,
      password_expiry_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    });

    res.status(200).json({ 
      success: true, 
      message: `Password for ${user_name} reset successfully` 
    });
  } catch (error) {
    console.error("Error resetting user's password:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error resetting password", 
      error: error.message 
    });
  }
};

// Admin Controller: Fetch user details for reset
const fetchUserDetails = async (req, res) => {
  const { user_name } = req.body;

  try {
    const user = await User.findOne({ 
      where: { user_name },
      attributes: { exclude: ['password', 'default_password'] }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "User details fetched successfully", 
      user 
    });
  } catch (error) {
    console.error("Error fetching user details:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error fetching user details", 
      error: error.message 
    });
  }
};

// Controller to reset user login and session
const resetUserLogin = async (req, res) => {
  const { userId } = req.body;

  try {
    // Find user by user_name instead of userId (assuming userId is user_name)
    const user = await User.findOne({ where: { user_name: userId } });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: `User with ID ${userId} not found` 
      });
    }

    // Clear reset token and session data
    user.reset_token = null;
    user.reset_token_expire = null;
    user.temp_password_token = null;
    user.temp_token_expire = null;
    user.failed_attempts = 0;
    user.lock_until = null;
    await user.save();

    // Also clear ActiveSession records for this user
    await ActiveSession.destroy({
      where: { user_id: user.id }
    });

    // Update license session count
    await updateLicenseSessionCount(false);

    res.status(200).json({ 
      success: true, 
      message: "User login reset successfully, session refreshed" 
    });

  } catch (error) {
    console.error("Error resetting user login:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error resetting user login", 
      error: error.message 
    });
  }
};

// Add this to your authController.js temporarily
const debugUserData = async (req, res) => {
  try {
    const user = await User.findOne({ where: { user_name: 'PCO03' } });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    console.log('🔍 User Document Fields:', Object.keys(user.toJSON()));
    console.log('🔍 User Business Unit Data:', {
      businessUnit: user.businessUnit,
      BU_ROLE_ID: user.BU_ROLE_ID,
      accessibleBusinessUnits: user.accessibleBusinessUnits,
      hasBusinessUnit: !!user.businessUnit
    });

    res.json({
      success: true,
      user: user.toJSON(),
      hasBusinessUnit: !!user.businessUnit,
      businessUnit: user.businessUnit
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Controller to validate temp token for password change
const validateTempToken = async (req, res) => {
  const { user_id, temp_token } = req.body;

  try {
    const user = await User.findByPk(user_id, {
      attributes: { include: ['temp_password_token', 'temp_token_expire'] }
    });

    if (!user) {
      return res.status(400).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    if (user.temp_password_token !== temp_token || 
        !user.temp_token_expire || 
        user.temp_token_expire < Date.now()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Token is valid',
      user_name: user.user_name
    });
  } catch (error) {
    console.error("Error validating token:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error validating token", 
      error: error.message 
    });
  }
};

// ============================================
// EXPORT ALL FUNCTIONS
// ============================================

export { 
  loginUser, 
  logoutUser,
  requestPasswordReset, 
  resetPassword, 
  resetUsers, 
  resetUserLogin, 
  fetchUserDetails, 
  debugUserData,
  changePassword,
  validateTempToken,
  getActiveLicense,
  checkLicenseSessionLimit,
  checkLicenseUserLimit
};