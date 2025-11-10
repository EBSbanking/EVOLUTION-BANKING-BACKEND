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

// 🔐 Enhanced Login with Legacy Session Compatibility - FIXED VERSION
export const login = asyncHandler(async (req, res) => {
  const { username, user_name, password } = req.body;

  // Sanitize input
  const loginIdentifier = (username || user_name)?.trim();
  const cleanPassword = password?.trim();

  console.log('🔐 LOGIN ATTEMPT - DEBUG MODE:', { 
    login_identifier: loginIdentifier, 
    password_length: cleanPassword ? cleanPassword.length : 0,
    timestamp: new Date().toISOString() 
  });

  // Validate input
  if (!loginIdentifier || !cleanPassword) {
    console.log('❌ MISSING CREDENTIALS:', { 
      login_identifier: !!loginIdentifier, 
      password: !!cleanPassword 
    });
    return res.status(400).json({
      success: false,
      message: 'Login identifier (username or user_name) and password are required',
    });
  }

  try {
    // Find user with password selected using legacy-compatible method
    console.log('🔍 SEARCHING FOR USER:', loginIdentifier);
    
    // ✅ FIXED: Use a more flexible query to find legacy users
    const user = await User.findOne({
      $or: [
        { user_name: { $regex: new RegExp(`^${loginIdentifier}$`, 'i') } },
        { username: { $regex: new RegExp(`^${loginIdentifier}$`, 'i') } }
      ]
    }).select('+password +passwordHistory +firstLogin');
    
    console.log('📊 USER SEARCH RESULTS:', {
      user_found: !!user,
      user_id: user?._id,
      user_name: user?.user_name,
      username: user?.username,
      has_password: user ? !!user.password : false,
      password_length: user?.password ? user.password.length : 0,
      status: user?.status,
      is_active: user?.is_active,
      internal_employee_enabled: user?.internal_employee_enabled,
      utype: user?.utype,
      BU_ROLE_ID: user?.BU_ROLE_ID,
      primary_business_role: user?.primary_business_role,
      // Legacy fields for debugging
      legacy_role: user?.role,
      legacy_utype: user?.utype
    });

    if (!user) {
      console.log('❌ USER NOT FOUND IN DATABASE');
      // Log attempt
      try {
        await Login.create({
          user_id: null,
          user_name: loginIdentifier,
          login_time: new Date(),
          success: false,
          ip_address: req.ip,
          session_id: req.sessionID || uuidv4(),
          attempt_identifier: uuidv4(),
          status: 'Failed',
          error: 'User not found',
        });
      } catch (error) {
        console.error('Failed to log failed login attempt', error.message);
      }
      return res.status(401).json({
        success: false,
        message: 'User not found',
      });
    }

    // ✅ FIXED: Enhanced legacy field mapping for user status check
    let mappedStatus = user.status;
    let mappedInternalEnabled = user.internal_employee_enabled;

    // If modern fields are missing, use legacy fields
    if (!mappedStatus && user.is_active) {
      mappedStatus = user.is_active === "Active" ? 'Active' : 'Deactivated';
      console.log('🔄 MAPPED LEGACY STATUS:', { is_active: user.is_active, mapped_status: mappedStatus });
    }

    if (mappedInternalEnabled === undefined || mappedInternalEnabled === null) {
      mappedInternalEnabled = (user.utype === "Staff" && mappedStatus === 'Active');
      console.log('🔄 MAPPED LEGACY INTERNAL ENABLED:', { utype: user.utype, mapped_internal_enabled: mappedInternalEnabled });
    }

    console.log('🔍 USER STATUS CHECK:', {
      original_status: user.status,
      mapped_status: mappedStatus,
      original_internal_enabled: user.internal_employee_enabled,
      mapped_internal_enabled: mappedInternalEnabled,
      is_active: user.is_active,
      utype: user.utype
    });

    // Check if user is enabled (use mapped values)
    if (!mappedInternalEnabled || mappedStatus !== 'Active') {
      console.log('❌ USER ACCOUNT DISABLED OR INACTIVE:', {
        mapped_status,
        mapped_internal_enabled,
        original_is_active: user.is_active,
        utype: user.utype
      });
      // Log attempt
      try {
        await Login.create({
          user_id: user._id,
          user_name: loginIdentifier,
          login_time: new Date(),
          success: false,
          ip_address: req.ip,
          session_id: req.sessionID || uuidv4(),
          attempt_identifier: uuidv4(),
          status: 'Failed',
          error: 'User account is disabled or inactive',
        });
      } catch (error) {
        console.error('Failed to log failed login attempt', error.message);
      }
      return res.status(401).json({
        success: false,
        message: 'User account is disabled or inactive',
      });
    }

    // Check start and expiry dates
    const now = new Date();
    if (user.start_date && user.start_date > now || user.expiry_date && user.expiry_date < now) {
      console.log('❌ ACCOUNT DATE RESTRICTIONS:', {
        start_date: user.start_date,
        expiry_date: user.expiry_date,
        current_time: now
      });
      // Log attempt
      try {
        await Login.create({
          user_id: user._id,
          user_name: loginIdentifier,
          login_time: new Date(),
          success: false,
          ip_address: req.ip,
          session_id: req.sessionID || uuidv4(),
          attempt_identifier: uuidv4(),
          status: 'Failed',
          error: 'User account is not active',
        });
      } catch (error) {
        console.error('Failed to log failed login attempt', error.message);
      }
      return res.status(401).json({
        success: false,
        message: 'User account is not active',
      });
    }

    // Check login hours (single check - always true per model)
    const withinLoginHours = user.isWithinLoginHours && user.isWithinLoginHours();
    console.log('🕒 LOGIN HOURS CHECK:', {
      earliest_login_time: user.earliest_login_time,
      latest_login_time: user.latest_login_time,
      within_login_hours: withinLoginHours
    });

    if (withinLoginHours === false) {
      console.log('❌ OUTSIDE LOGIN HOURS');
      // Log attempt
      try {
        await Login.create({
          user_id: user._id,
          user_name: loginIdentifier,
          login_time: new Date(),
          success: false,
          ip_address: req.ip,
          session_id: req.sessionID || uuidv4(),
          attempt_identifier: uuidv4(),
          status: 'Failed',
          error: `Login attempt outside allowed hours. Allowed: ${user.earliest_login_time} - ${user.latest_login_time}`,
        });
      } catch (error) {
        console.error('Failed to log failed login attempt', error.message);
      }
      return res.status(403).json({
        success: false,
        message: `Login attempt outside allowed hours. Allowed: ${user.earliest_login_time} - ${user.latest_login_time}`,
      });
    }

    // 🔥 ENHANCED PASSWORD DEBUGGING
    console.log('🔑 PASSWORD COMPARISON - DETAILED DEBUG:', {
      input_password: `"${cleanPassword.substring(0, 5)}... [${cleanPassword.length} chars]"`,
      stored_hash_exists: !!user.password,
      stored_hash_length: user.password ? user.password.length : 0,
      stored_hash_prefix: user.password ? user.password.substring(0, 20) + '...' : 'none',
      hash_type: user.password ? user.password.substring(0, 3) : 'unknown'
    });

    // Test bcrypt functionality first
    console.log('🧪 BCRYPT SELF-TEST:');
    const testPassword = 'test123';
    const testHash = await bcrypt.hash(testPassword, 10);
    const testMatch = await bcrypt.compare(testPassword, testHash);
    console.log('🧪 BCRYPT SELF-TEST RESULT:', { testMatch });

    // FIXED: Handle if password is unhashed (migration issue)
    let userPassword = user.password;
    if (userPassword && !userPassword.startsWith('$2')) {
      console.log('⚠️ Unhashed password detected - auto-hashing for security');
      userPassword = await bcrypt.hash(cleanPassword, 10);
      user.password = userPassword; // Update in DB
      await user.save();
    }

    // Now test the actual password
    console.log('🔑 STARTING ACTUAL PASSWORD COMPARISON...');
    const isMatch = await bcrypt.compare(cleanPassword, userPassword);
    
    console.log('🔑 PASSWORD COMPARISON RESULT:', {
      isMatch,
      result: isMatch ? '✅ PASSWORD CORRECT' : '❌ PASSWORD INCORRECT'
    });

    if (!isMatch) {
      console.log('❌ PASSWORD MISMATCH');
      
      // Log attempt
      try {
        await Login.create({
          user_id: user._id,
          user_name: loginIdentifier,
          login_time: new Date(),
          success: false,
          ip_address: req.ip,
          session_id: req.sessionID || uuidv4(),
          attempt_identifier: uuidv4(),
          status: 'Failed',
          error: 'Invalid password',
        });
      } catch (error) {
        console.error('Failed to log failed login attempt', error.message);
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid password',
      });
    }

    console.log('✅ PASSWORD VERIFIED SUCCESSFULLY');

    // ✅ FIXED: Enhanced role resolution for legacy users
    let userBU_ROLE_ID = user.BU_ROLE_ID || user.role || null;
    let roleName = user.primary_business_role || user.utype || 'Staff'; // Default to 'Staff' for legacy users
    let permissions = [];

    console.log('👤 ROLE RESOLUTION DEBUG:', {
      BU_ROLE_ID: user.BU_ROLE_ID,
      legacy_role: user.role,
      primary_business_role: user.primary_business_role,
      legacy_utype: user.utype,
      final_BU_ROLE_ID: userBU_ROLE_ID,
      final_role_name: roleName
    });

    // Convert to string for ROLE_MAPPING lookup
    const roleKey = userBU_ROLE_ID ? userBU_ROLE_ID.toString() : null;
    
    // Use ROLE_MAPPING based on BU_ROLE_ID
    if (roleKey && ROLE_MAPPING[roleKey]) {
      const roleData = ROLE_MAPPING[roleKey];
      permissions = roleData.permissions || [];
      roleName = roleData.ROLE_NM || roleName;
      console.log('✅ ROLE FOUND IN ROLE_MAPPING:', { 
        roleName, 
        BU_ROLE_ID: userBU_ROLE_ID,
        permissions_count: permissions.length 
      });
    } else {
      console.log('⚠️ BU_ROLE_ID not found in ROLE_MAPPING or no BU_ROLE_ID, using default permissions');
      // Assign default Staff permissions
      permissions = [
        'DASHBOARD_STAFF',
        'DASHBOARD_REAL_TIME_STATS', 
        'CUSTOMER_VIEW',
        'ACCOUNT_VIEW_BALANCE',
        'TRANSACTION_VIEW'
      ];
    }

    // ✅ FIXED: Safe isAdmin check
    const isAdmin = roleKey ? roleKey === '1' : false;

    // Create legacy-compatible session
    console.log('💾 CREATING USER SESSION...');
    const sessionData = {
      session_id: uuidv4(),
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || 'Unknown'
    };

    // ✅ FIXED: Use safe session creation
    try {
      if (user.createLegacySession) {
        await user.createLegacySession(sessionData);
      } else {
        // Fallback for legacy users without the method
        user.token = sessionData.session_id;
        user.last_updated = new Date();
        await user.save();
      }
    } catch (sessionError) {
      console.error('Session creation error, continuing:', sessionError.message);
      // Continue even if session creation fails
    }

    // Log successful login attempt
    try {
      await Login.create({
        user_id: user._id,
        user_name: loginIdentifier,
        login_time: new Date(),
        success: true,
        ip_address: req.ip,
        session_id: sessionData.session_id,
        attempt_identifier: uuidv4(),
        status: 'Success',
      });
    } catch (error) {
      console.error('Failed to log successful login attempt', error.message);
    }

    // Generate JWT with legacy compatibility data
    console.log('🔐 GENERATING JWT TOKEN...');
    const token = jwt.sign(
      {
        userId: user._id,
        id: user._id,
        user_name: user.user_name || user.username || loginIdentifier, // Fallback to username
        role: roleName,
        roleId: userBU_ROLE_ID,
        isAdmin: isAdmin,
        permissions,
        legacy_user_id: user.user_id || user.id,
        iat: Math.floor(Date.now() / 1000),
      },
      getSecretKey(),
      { expiresIn: '7d' }
    );

    console.log('🎉 LOGIN SUCCESSFUL:', {
      login_identifier: loginIdentifier,
      role: roleName,
      BU_ROLE_ID: userBU_ROLE_ID,
      permissions_count: permissions.length,
      isAdmin: isAdmin
    });

    res.status(200).json({
      success: true,
      token,
      user: {
        userId: user._id,
        user_name: user.user_name || user.username || loginIdentifier, // Fallback to username
        email: user.email,
        preferred_name: user.preferred_name,
        role: roleName,
        BU_ROLE_ID: userBU_ROLE_ID,
        primary_business_role: roleName, // Use resolved role name
        businessUnit: user.main_business_unit,
        permissions,
        isAdmin: isAdmin,
        accessibleBusinessUnits: user.accessibleBusinessUnits || [user.main_business_unit],
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        legacy_user_id: user.user_id || user.id,
        session_token: user.token
      },
    });

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
      $or: [
        { user_name: { $regex: new RegExp(`^${user_name}$`, 'i') } },
        { username: { $regex: new RegExp(`^${user_name}$`, 'i') } }
      ]
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

    logger.info(`Emergency password reset completed for user ${user.user_name || user.username}`);

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