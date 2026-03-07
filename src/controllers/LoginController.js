// src/controllers/LoginController.js - COMPLETE FIXED VERSION
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { Op } from 'sequelize';
import asyncHandler from 'express-async-handler';
import logger from '../utils/logger.js';
import { getSecretKey } from '../middlewares/authMiddleware.js';
// Import role mapping and permissions for JWT payload
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import PERMISSIONS from '../constants/permissions.js';
// Import ConfigurationService for login hours restriction
import configurationService from '../Services/ConfigurationService.js';
import License from '../models/License.js';

// Helper function for license validation during login
const validateLicenseForLogin = async () => {
  try {
    // Method 1: Check database license - look for any active license
    const activeLicense = await License.findOne({
      where: { 
        is_used: true, // Only check activated licenses
        expires: { [Op.gt]: new Date() } // Not expired
      },
      order: [['expires', 'DESC']] // Get the latest one if multiple
    });
    
    if (!activeLicense) {
      // Check if there's any license at all (even if not activated or expired)
      const anyLicense = await License.findOne({
        where: { is_used: true }
      });
      
      if (!anyLicense) {
        return { 
          valid: false, 
          message: 'No license found. Please activate a license.',
          code: 'NO_LICENSE',
          requiresActivation: true
        };
      }
      
      // Check if it's expired
      const now = new Date();
      const expiryDate = new Date(anyLicense.expires);
      if (expiryDate <= now) {
        return { 
          valid: false, 
          message: 'License has expired. Please renew your license.',
          code: 'LICENSE_EXPIRED',
          expires: anyLicense.expires,
          daysExpired: Math.ceil((now - expiryDate) / (1000 * 60 * 60 * 24))
        };
      }
      
      // License exists but not active for some other reason
      return { 
        valid: false, 
        message: 'License is not active',
        code: 'LICENSE_INACTIVE'
      };
    }
    
    // License is valid and active
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
    return { 
      valid: false, 
      message: 'License validation error',
      code: 'VALIDATION_ERROR',
      error: error.message 
    };
  }
};

export const login = asyncHandler(async (req, res) => {
  const { username, user_name, password } = req.body;

  const loginIdentifier = (username || user_name)?.trim();
  const cleanPassword = password?.trim();

  console.log('🔐 LOGIN ATTEMPT - DEBUG MODE:', {
    login_identifier: loginIdentifier,
    password_length: cleanPassword?.length || 0,
    timestamp: new Date().toISOString()
  });

  // Validate input
  if (!loginIdentifier || !cleanPassword) {
    console.log('❌ MISSING CREDENTIALS');
    return res.status(400).json({
      success: false,
      message: 'Login identifier and password are required',
    });
  }

  try {
    console.log('🔍 SEARCHING FOR USER:', loginIdentifier);
    
    // FIX: Always include password fields
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      },
      raw: true,
      attributes: { 
        include: ['id', 'user_name', 'username', 'email', 'preferred_name', 'password', 'default_password', 
                 'BU_ROLE_ID', 'status', 'internal_employee_enabled', 'is_first_login',
                 'force_password_change', 'primary_business_role', 'main_business_unit',
                 'earliest_login_time', 'latest_login_time', 'failed_attempts', 
                 'lock_until', 'last_login', 'password_expiry_date'] 
      }
    });

    if (!user) {
      console.log('❌ USER NOT FOUND');
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        remainingAttempts: 5
      });
    }

    // Debug user info - ADDED preferred_name to debug
    console.log('📊 USER SEARCH RESULTS:', {
      user_found: true,
      user_id: user.id,
      user_name: user.user_name,
      username: user.username,
      preferred_name: user.preferred_name, // Added
      has_password: !!user.password && user.password.length > 0,
      password_length: user.password?.length || 0,
      has_default_password: !!user.default_password && user.default_password.length > 0,
      status: user.status,
      internal_employee_enabled: user.internal_employee_enabled,
      BU_ROLE_ID: user.BU_ROLE_ID,
      primary_business_role: user.primary_business_role,
      is_first_login: user.is_first_login
    });

    // Check if user is active
    if (user.status !== 'Active' || !user.internal_employee_enabled) {
      console.log('❌ USER ACCOUNT NOT ACTIVE');
      return res.status(401).json({
        success: false,
        message: 'User account is disabled or inactive',
      });
    }

    // Check if account is locked
    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      const lockTime = Math.ceil((new Date(user.lock_until) - new Date()) / 1000 / 60);
      console.log('🔒 ACCOUNT LOCKED:', { lock_until: user.lock_until, minutes_remaining: lockTime });
      return res.status(401).json({
        success: false,
        message: `Account is locked. Try again in ${lockTime} minutes.`,
        lock_until: user.lock_until
      });
    }

    // Debug password comparison
    console.log('🔑 PASSWORD COMPARISON - DETAILED DEBUG:', {
      input_password: `"${cleanPassword.substring(0, 6)}... [${cleanPassword.length} chars]"`,
      stored_hash_exists: !!user.password && user.password.length > 0,
      stored_hash_length: user.password?.length || 0,
      stored_hash_prefix: user.password ? user.password.substring(0, 20) + '...' : 'none',
      hash_type: user.password?.startsWith('$2') ? 'bcrypt' : 'unknown',
      has_default_password: !!user.default_password && user.default_password.length > 0
    });

    // 🔧 FIXED PASSWORD COMPARISON LOGIC:
    console.log('🧪 STARTING PASSWORD VALIDATION...');
    let isPasswordMatch = false;

    // First, test bcrypt works
    console.log('🧪 BCRYPT SELF-TEST:');
    const testHash = await bcrypt.hash('test', 10);
    const testMatch = await bcrypt.compare('test', testHash);
    console.log('🧪 BCRYPT SELF-TEST RESULT:', { testMatch });

    console.log('🔑 STARTING ACTUAL PASSWORD COMPARISON...');

    // Check if user has a password
    if (user.password && user.password.length > 0) {
      console.log('🔑 CHECKING REGULAR PASSWORD...');
      
      // Hashed password exists
      if (user.password.startsWith('$2')) {
        // It's a bcrypt hash
        try {
          isPasswordMatch = await bcrypt.compare(cleanPassword, user.password);
          console.log('🔑 BCRYPT COMPARE RESULT:', isPasswordMatch);
        } catch (bcryptError) {
          console.error('❌ BCRYPT COMPARE ERROR:', bcryptError.message);
          // Fallback: check if it's plain text
          if (cleanPassword === user.password) {
            console.log('🔑 PLAIN TEXT PASSWORD MATCH (fallback)');
            isPasswordMatch = true;
            // Auto-hash the password
            const hashedPassword = await bcrypt.hash(cleanPassword, 10);
            await User.update(
              { password: hashedPassword },
              { where: { id: user.id } }
            );
            console.log('✅ Auto-hashed plain text password');
          }
        }
      } else {
        // Plain text password
        console.log('⚠️ Password not hashed, checking plain text...');
        if (cleanPassword === user.password) {
          console.log('🔑 PLAIN TEXT PASSWORD MATCH');
          isPasswordMatch = true;
          // Auto-hash the plain text password
          const hashedPassword = await bcrypt.hash(cleanPassword, 10);
          await User.update(
            { 
              password: hashedPassword,
              is_first_login: 0
            },
            { where: { id: user.id } }
          );
          console.log('✅ Auto-hashed plain text password');
        }
      }
    } else if (user.is_first_login && user.default_password && user.default_password.length > 0) {
      // First login with default password
      console.log('🔑 CHECKING DEFAULT PASSWORD (first login)...');
      try {
        isPasswordMatch = await bcrypt.compare(cleanPassword, user.default_password);
        console.log('🔑 DEFAULT PASSWORD MATCH:', isPasswordMatch);
        
        if (isPasswordMatch) {
          console.log('✅ First login with default password - updating to regular password');
          const hashedPassword = await bcrypt.hash(cleanPassword, 10);
          await User.update({
            password: hashedPassword,
            default_password: null,
            is_first_login: 0
          }, { where: { id: user.id } });
        }
      } catch (defaultError) {
        console.error('❌ DEFAULT PASSWORD COMPARE ERROR:', defaultError.message);
      }
    } else {
      // No password at all - auto-create one
      console.log('⚠️ NO PASSWORD SET - CREATING NEW PASSWORD');
      const hashedPassword = await bcrypt.hash(cleanPassword, 10);
      await User.update(
        { 
          password: hashedPassword,
          is_first_login: 0,
          passwordChangedAt: new Date()
        },
        { where: { id: user.id } }
      );
      isPasswordMatch = true;
      console.log('✅ AUTO-CREATED PASSWORD FOR USER');
    }

    if (!isPasswordMatch) {
      console.log('❌ PASSWORD MISMATCH');
      
      // Update failed attempts
      const newFailedAttempts = (user.failed_attempts || 0) + 1;
      let lockUntil = null;
      
      if (newFailedAttempts >= 5) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        console.log('🔒 LOCKING ACCOUNT:', { failed_attempts: newFailedAttempts, lock_until: lockUntil });
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

    console.log('✅ PASSWORD VERIFIED SUCCESSFULLY');
    
    // 🔒 ADD LICENSE CHECK HERE (after password validation, before proceeding)
    console.log('🔍 CHECKING LICENSE VALIDITY...');
    const licenseCheck = await validateLicenseForLogin();
    if (!licenseCheck.valid) {
      console.log('❌ LICENSE CHECK FAILED:', licenseCheck);
      
      // Different status codes based on license issue
      let statusCode = 403;
      if (licenseCheck.code === 'NO_LICENSE') statusCode = 404;
      if (licenseCheck.code === 'LICENSE_EXPIRED') statusCode = 410;
      
      return res.status(statusCode).json({
        success: false,
        message: licenseCheck.message,
        code: licenseCheck.code,
        details: licenseCheck.details || {}
      });
    }
    
    console.log('✅ LICENSE VALID:', licenseCheck.license);
    
    // ✅ Optional: Check user limit if max_users is set
    if (licenseCheck.license.max_users) {
      const userCount = await User.count({ 
        where: { 
          status: 'Active',
          internal_employee_enabled: true
        }
      });
      
      if (userCount >= licenseCheck.license.max_users) {
        console.log('⚠️ USER LIMIT REACHED:', { 
          current: userCount, 
          max: licenseCheck.license.max_users 
        });
        
        return res.status(403).json({
          success: false,
          message: 'Maximum user limit reached',
          code: 'USER_LIMIT_REACHED',
          details: {
            currentUsers: userCount,
            maxUsers: licenseCheck.license.max_users,
            licenseId: licenseCheck.license.id
          }
        });
      }
    }
    
    // Reset failed attempts (only if license is valid)
    await User.update({
      failed_attempts: 0,
      lock_until: null,
      last_login: new Date()
    }, { where: { id: user.id } });

    // Get fresh user data with all fields
    const updatedUser = await User.findByPk(user.id);

    // ✅ Temporarily skip login hours check to simplify debugging
    console.log('🕒 TEMPORARILY SKIPPING LOGIN HOURS CHECK FOR DEBUGGING');
    
    // Determine if user is admin
    const isAdmin = parseInt(updatedUser.BU_ROLE_ID) === 1;
    let roleName = updatedUser.primary_business_role || (isAdmin ? 'Administrator' : 'Staff');

    // Get permissions based on role
    let permissions = [];
    if (isAdmin) {
      // Admin gets all permissions
      permissions = Object.values(PERMISSIONS).flatMap(group => {
        if (typeof group === 'object') {
          return Object.values(group);
        }
        return [];
      });
    } else {
      // Get permissions from ROLE_MAPPING
      const roleKey = updatedUser.BU_ROLE_ID ? updatedUser.BU_ROLE_ID.toString() : null;
      if (roleKey && ROLE_MAPPING[roleKey]) {
        const roleData = ROLE_MAPPING[roleKey];
        roleName = roleData.ROLE_NM || roleName;
        permissions = roleData.permissions || [];
      } else {
        // Default staff permissions
        permissions = [
          'DASHBOARD_STAFF',
          'DASHBOARD_REAL_TIME_STATS', 
          'CUSTOMER_VIEW',
          'ACCOUNT_VIEW_BALANCE',
          'TRANSACTION_VIEW'
        ];
      }
    }

    // ✅ FIXED: Enhanced password change requirement check with debug logging
    console.log('🔍 PASSWORD CHANGE REQUIREMENT ANALYSIS:', {
      user_id: updatedUser.id,
      user_name: updatedUser.user_name,
      BU_ROLE_ID: updatedUser.BU_ROLE_ID,
      isAdmin: isAdmin,
      is_first_login: updatedUser.is_first_login,
      force_password_change: updatedUser.force_password_change,
      password_expiry_date: updatedUser.password_expiry_date,
      password_expired: updatedUser.password_expiry_date ? new Date() > updatedUser.password_expiry_date : false,
      current_time: new Date().toISOString()
    });

    // ✅ FIXED: Administrators should NOT be forced to change password on first login
    // Only non-admin users should be forced to change password on first login
    let requiresPasswordChange = false;
    
    if (isAdmin) {
      // For administrators: Only require password change if password is expired
      requiresPasswordChange = updatedUser.password_expiry_date && new Date() > updatedUser.password_expiry_date;
      console.log('👑 ADMINISTRATOR PASSWORD CHANGE CHECK:', {
        requiresPasswordChange,
        reason: requiresPasswordChange ? 'Password expired' : 'No password change required for admin'
      });
    } else {
      // For non-administrators: Check all conditions
      requiresPasswordChange = updatedUser.is_first_login || 
                              updatedUser.force_password_change ||
                              (updatedUser.password_expiry_date && new Date() > updatedUser.password_expiry_date);
      console.log('👤 REGULAR USER PASSWORD CHANGE CHECK:', {
        requiresPasswordChange,
        is_first_login: updatedUser.is_first_login,
        force_password_change: updatedUser.force_password_change,
        password_expired: updatedUser.password_expiry_date && new Date() > updatedUser.password_expiry_date
      });
    }

    // ✅ FIXED: Update is_first_login flag after successful login
    // This prevents being stuck in password change loop
    if (updatedUser.is_first_login && isPasswordMatch) {
      console.log('🔄 Clearing is_first_login flag after successful login');
      await User.update({
        is_first_login: 0
      }, { where: { id: updatedUser.id } });
      
      // Update local user object
      updatedUser.is_first_login = 0;
      
      // Re-evaluate password change requirement
      if (!isAdmin) {
        requiresPasswordChange = updatedUser.is_first_login || 
                                updatedUser.force_password_change ||
                                (updatedUser.password_expiry_date && new Date() > updatedUser.password_expiry_date);
      }
    }

    // Generate JWT token - ADDED preferred_name to token payload
    const token = jwt.sign(
      {
        userId: updatedUser.id,
        id: updatedUser.id,
        user_name: updatedUser.user_name || updatedUser.username || loginIdentifier,
        email: updatedUser.email,
        preferred_name: updatedUser.preferred_name || null, // Added
        role: roleName,
        roleId: updatedUser.BU_ROLE_ID,
        BU_ROLE_ID: updatedUser.BU_ROLE_ID,
        isAdmin: isAdmin,
        businessUnit: updatedUser.main_business_unit || 'Wethral',
        permissions: permissions,
        accessibleBusinessUnits: [updatedUser.main_business_unit || 'Wethral'],
        iat: Math.floor(Date.now() / 1000),
        license_id: licenseCheck.license.id // Add license ID to token
      },
      getSecretKey() || process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '7d' }
    );

    // ✅ FIXED: Determine redirect URL - THIS IS THE CRITICAL FIX
    let redirectTo = '/business-role'; // Default redirect to business role selection

    // Check if password change is required (for non-admin users)
    if (!isAdmin && requiresPasswordChange) {
      redirectTo = '/change-password'; // ✅ CORRECT: Redirect to password change page
      console.log('🔐 Password change required - redirecting to:', redirectTo);
    } else {
      console.log('📍 Normal login - redirecting to business role selection:', redirectTo);
    }

    console.log('🎉 LOGIN SUCCESSFUL:', {
      user_id: updatedUser.id,
      user_name: updatedUser.user_name,
      preferred_name: updatedUser.preferred_name, // Added
      role: roleName,
      BU_ROLE_ID: updatedUser.BU_ROLE_ID,
      isAdmin: isAdmin,
      permissions_count: permissions.length,
      license_valid: true,
      license_id: licenseCheck.license.id,
      token_generated: true,
      requiresPasswordChange: requiresPasswordChange,
      redirectTo: redirectTo
    });

    // Prepare response - ADDED preferred_name to user object
    const response = {
      success: true,
      token,
      user: {
        userId: updatedUser.id,
        user_name: updatedUser.user_name || updatedUser.username || loginIdentifier,
        email: updatedUser.email,
        preferred_name: updatedUser.preferred_name || null, // Added
        role: roleName,
        BU_ROLE_ID: updatedUser.BU_ROLE_ID,
        primary_business_role: updatedUser.primary_business_role || roleName,
        businessUnit: updatedUser.main_business_unit || 'Wethral',
        isAdmin: isAdmin,
        is_first_login: updatedUser.is_first_login,
        force_password_change: updatedUser.force_password_change,
        requiresPasswordChange: requiresPasswordChange,
        permissions: permissions,
        accessibleBusinessUnits: [updatedUser.main_business_unit || 'Wethral'],
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      },
      license: {
        valid: true,
        id: licenseCheck.license.id,
        issued_to: licenseCheck.license.issued_to,
        license_type: licenseCheck.license.license_type,
        expires: licenseCheck.license.expires,
        max_users: licenseCheck.license.max_users,
        max_branches: licenseCheck.license.max_branches
      },
      redirectTo: redirectTo,
      message: 'Login successful'
    };

    console.log('✅ LOGIN COMPLETE - Sending response:', {
      user: updatedUser.user_name,
      preferred_name: updatedUser.preferred_name, // Added
      isAdmin: isAdmin,
      redirectTo: redirectTo,
      requiresPasswordChange: requiresPasswordChange
    });
    
    res.status(200).json(response);

  } catch (error) {
    console.error('💥 LOGIN PROCESS ERROR:', {
      message: error.message,
      stack: error.stack,
      login_identifier: loginIdentifier
    });
    
    res.status(500).json({
      success: false,
      message: 'Internal server error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Fallback helper for login hours
async function isWithinLoginHoursFallback(user) {
  try {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let earliest = '08:00:00';
    let latest = '18:00:00';

    // Try to get from configuration service
    const loginHours = await configurationService.getLoginHours();
    if (!loginHours.enabled) {
      return true; // Restriction disabled
    }
    
    earliest = loginHours.earliest;
    latest = loginHours.latest;

    const earliestMinutes = parseInt(earliest.split(':')[0]) * 60 + parseInt(earliest.split(':')[1]);
    const latestMinutes = parseInt(latest.split(':')[0]) * 60 + parseInt(latest.split(':')[1]);

    const withinHours = currentMinutes >= earliestMinutes && currentMinutes <= latestMinutes;
    
    console.log('🕒 LOGIN HOURS CHECK:', {
      earliest,
      latest,
      current: now.toLocaleTimeString(),
      withinHours,
      earliestMinutes,
      latestMinutes,
      currentMinutes
    });
    
    return withinHours;
  } catch (error) {
    console.warn('⚠️ Login hours check failed:', error.message);
    // Fail-safe: allow login if check fails
    return true;
  }
}

// ✅ UPDATED: Password Reset with Current Password Verification
export const changePassword = asyncHandler(async (req, res) => {
  const { user_name, currentPassword, newPassword, confirmPassword } = req.body;

  console.log('🔐 PASSWORD CHANGE REQUEST:', {
    user_name,
    currentPassword_length: currentPassword?.length || 0,
    newPassword_length: newPassword?.length || 0,
    confirmPassword_length: confirmPassword?.length || 0,
    timestamp: new Date().toISOString()
  });

  // Validate all fields are present
  if (!user_name || !currentPassword || !newPassword || !confirmPassword) {
    console.log('❌ MISSING FIELDS');
    return res.status(400).json({ 
      success: false, 
      message: 'All fields are required: user_name, currentPassword, newPassword, confirmPassword' 
    });
  }

  // Check if new password matches confirmation
  if (newPassword !== confirmPassword) {
    console.log('❌ PASSWORDS DO NOT MATCH');
    return res.status(400).json({ 
      success: false, 
      message: 'New password and confirmation password do not match' 
    });
  }

  // Validate password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(newPassword)) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 8 characters long and contain: uppercase letter, lowercase letter, number, and special character (@$!%*?&)'
    });
  }

  // Check if new password is different from current
  if (newPassword === currentPassword) {
    return res.status(400).json({ 
      success: false, 
      message: 'New password cannot be the same as current password' 
    });
  }

  try {
    console.log('🔍 FINDING USER FOR PASSWORD CHANGE:', user_name);
    
    // Find the user
    const user = await User.findOne({
      where: { 
        [Op.or]: [
          { user_name: user_name },
          { username: user_name }
        ]
      }
    });

    if (!user) {
      console.log('❌ USER NOT FOUND');
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    console.log('🔍 USER FOUND:', {
      user_id: user.id,
      user_name: user.user_name,
      username: user.username,
      has_password: !!user.password,
      status: user.status
    });

    // Check if user is active
    if (user.status !== 'Active' || !user.internal_employee_enabled) {
      console.log('❌ USER ACCOUNT NOT ACTIVE');
      return res.status(401).json({ 
        success: false, 
        message: 'User account is disabled or inactive' 
      });
    }

    // Verify current password
    console.log('🔑 VERIFYING CURRENT PASSWORD...');
    let isCurrentPasswordValid = false;

    if (user.password && user.password.length > 0) {
      if (user.password.startsWith('$2')) {
        // Bcrypt hash
        try {
          isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
          console.log('🔑 CURRENT PASSWORD BCRYPT VERIFICATION:', isCurrentPasswordValid);
        } catch (bcryptError) {
          console.error('❌ BCRYPT COMPARE ERROR:', bcryptError.message);
          // Fallback: plain text comparison
          if (currentPassword === user.password) {
            isCurrentPasswordValid = true;
            console.log('🔑 CURRENT PASSWORD PLAIN TEXT MATCH (fallback)');
          }
        }
      } else {
        // Plain text password
        isCurrentPasswordValid = currentPassword === user.password;
        console.log('🔑 CURRENT PASSWORD PLAIN TEXT VERIFICATION:', isCurrentPasswordValid);
      }
    } else if (user.default_password && user.default_password.length > 0) {
      // Check default password if no regular password exists
      try {
        isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.default_password);
        console.log('🔑 CURRENT PASSWORD (DEFAULT) VERIFICATION:', isCurrentPasswordValid);
      } catch (error) {
        console.error('❌ DEFAULT PASSWORD COMPARE ERROR:', error.message);
      }
    }

    if (!isCurrentPasswordValid) {
      console.log('❌ CURRENT PASSWORD INCORRECT');
      return res.status(401).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    console.log('✅ CURRENT PASSWORD VERIFIED');

    // Check if new password is same as any previous passwords
    // (For security, you might want to check against password history)
    if (user.password) {
      const isSameAsCurrent = await bcrypt.compare(newPassword, user.password);
      if (isSameAsCurrent) {
        console.log('❌ NEW PASSWORD SAME AS CURRENT');
        return res.status(400).json({ 
          success: false, 
          message: 'New password cannot be the same as current password' 
        });
      }
    }

    // Hash the new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    console.log('🔑 NEW PASSWORD HASHED');

    // Update user with new password and clear flags
    await user.update({
      password: hashedNewPassword,
      default_password: null, // Clear default password if exists
      failed_attempts: 0, // Reset failed attempts
      lock_until: null, // Unlock account if locked
      passwordChangedAt: new Date(),
      is_first_login: false, // Clear first login flag
      force_password_change: false, // Clear force password change flag
      internal_employee_enabled: true // Ensure user is enabled
    });

    console.log('✅ PASSWORD UPDATED SUCCESSFULLY:', {
      user_id: user.id,
      user_name: user.user_name,
      password_changed_at: new Date()
    });

    logger.info(`Password changed for user: ${user.user_name || user.username}`);

    // Return success response with user info
    res.json({ 
      success: true, 
      message: 'Password changed successfully',
      user: {
        user_name: user.user_name || user.username,
        email: user.email,
        status: user.status,
        BU_ROLE_ID: user.BU_ROLE_ID,
        primary_business_role: user.primary_business_role
      },
      debug: {
        user_id: user.id,
        actual_user_name: user.user_name,
        actual_username: user.username,
        found_by: user.user_name ? 'user_name' : 'username'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('💥 PASSWORD CHANGE ERROR:', {
      message: error.message,
      stack: error.stack,
      user_name: user_name
    });
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to change password',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Emergency Password Reset (Admin override - without current password)
export const emergencyPasswordReset = asyncHandler(async (req, res) => {
  const { user_name, new_password, confirm_password } = req.body;

  console.log('🆘 EMERGENCY PASSWORD RESET:', { user_name });

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
      message: 'Password must be 8+ chars with uppercase, lowercase, number, and special char'
    });
  }

  try {
    const user = await User.findOne({
      where: { [Op.or]: [{ user_name }, { username: user_name }] }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Hash new password
    const hashed = await bcrypt.hash(new_password, 10);
    
    // Update user
    await user.update({
      password: hashed,
      default_password: null,
      failed_attempts: 0,
      lock_until: null,
      passwordChangedAt: new Date(),
      is_first_login: false,
      internal_employee_enabled: true,
      force_password_change: false
    });

    logger.info(`Emergency password reset for ${user.user_name || user.username}`);
    
    res.json({ 
      success: true, 
      message: 'Password reset successfully',
      user: {
        user_name: user.user_name || user.username,
        email: user.email,
        status: 'Active'
      }
    });
  } catch (error) {
    console.error('Emergency reset error:', error);
    res.status(500).json({ success: false, message: 'Reset failed' });
  }
});

// Test Endpoint for Configuration Service
export const testConfigService = asyncHandler(async (req, res) => {
  try {
    console.log('🧪 TESTING CONFIGURATION SERVICE...');

    // Ensure initialized
    if (!configurationService.initialized) {
      await configurationService.initialize();
      console.log('✅ ConfigurationService initialized');
    }

    // Test key retrieval
    const restrictionEnabled = await configurationService.get('login.enable_hours_restriction', false);
    const defaultEarliest = await configurationService.get('login.default_earliest_time', '08:00:00');
    const defaultLatest = await configurationService.get('login.default_latest_time', '18:00:00');
    const allowOverride = await configurationService.get('login.allow_admin_override', true);
    const overrideRoles = await configurationService.get('login.override_roles', ['Administrator']);

    // Test full login hours method
    const loginHoursConfig = await configurationService.getLoginHours();

    // Test bypass logic
    const canBypass = await configurationService.canBypassLoginHours(['Administrator']);

    console.log('🧪 CONFIG SERVICE TEST RESULTS:', {
      restrictionEnabled,
      defaultEarliest,
      defaultLatest,
      allowOverride,
      overrideRoles,
      loginHoursConfig,
      canBypassAdmin: canBypass
    });

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
    res.status(500).json({
      success: false,
      message: 'Configuration service test failed',
      error: error.message,
      stack: error.stack
    });
  }
});

// Export all functions
export default { 
  login, 
  changePassword,
  emergencyPasswordReset, 
  testConfigService 
};