import mongoose from 'mongoose'; // Add this line
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
import Permissions from '../models/Permissions.js';
import PERMISSIONS from '../constants/permissions.js';

// Simple IP validation function
const validateIpAddress = (ip) => {
  const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
  return ipRegex.test(ip);
};

// Get client IP from request
const getClientIp = (req) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  return ip && ip !== '::1' ? ip.split(',')[0].trim() : null;
};

// Helper function to get role permissions from ROLE_MAPPING
function getRolePermissionsGrouped(roleId) {
  const roleEntry = Object.values(ROLE_MAPPING).find(role => role.ROLE_ID === roleId);
  return roleEntry ? roleEntry.permissions || {} : {};
}

// Helper function to get role with permissions
function getRoleWithPermissions(roleId) {
  const roleEntry = Object.values(ROLE_MAPPING).find(role => role.ROLE_ID === roleId);
  return roleEntry || { ROLE_NM: 'Unknown', permissions: {} };
}

// ✅ Force lock a user due to fraud
export const forceLockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason } = req.body;

  try {
    console.log('🔒 Force lock user request:', { identifier, reason, lockedBy: req.user.user_name });

    // Find user by multiple identifiers
    const user = await User.findOne({
      $or: [
        { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { employer_number: identifier },
        { _id: Types.ObjectId.isValid(identifier) ? identifier : null }
      ].filter(condition => condition._id !== null) // Remove invalid _id condition
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    // Check if user is already force-locked
    if (user.status === 'ForceLocked') {
      return res.status(400).json({
        success: false,
        message: 'User is already force-locked',
        user: {
          user_name: user.user_name,
          status: user.status,
          force_lock_reason: user.force_lock_reason,
          force_locked_at: user.force_locked_at,
          force_locked_by: user.force_locked_by
        }
      });
    }

    // Force lock the user using schema method
    await user.forceLock(req.user._id, reason || 'Suspicious activity detected');

    console.log('✅ User force-locked successfully:', {
      user_name: user.user_name,
      status: user.status,
      force_lock_reason: user.force_lock_reason
    });

    res.status(200).json({
      success: true,
      message: 'User force-locked successfully',
      user: {
        id: user._id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        force_lock_reason: user.force_lock_reason,
        force_locked_at: user.force_locked_at,
        force_locked_by: user.force_locked_by
      },
      lockDetails: {
        reason: reason || 'Suspicious activity detected',
        timestamp: user.force_locked_at,
        performedBy: req.user.user_name
      }
    });

  } catch (error) {
    console.error('💥 Force lock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error force-locking user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Unlock a force-locked user
export const unlockForceLockedUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason, unlockedBy } = req.body;

  try {
    console.log('🔓 Unlock force-locked user request:', { identifier, reason, unlockedBy });

    // Find user by multiple identifiers
    const user = await User.findOne({
      $or: [
        { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { employer_number: identifier },
        { _id: Types.ObjectId.isValid(identifier) ? identifier : null }
      ].filter(condition => condition._id !== null)
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    // Check if user is actually force-locked
    if (user.status !== 'ForceLocked') {
      return res.status(400).json({
        success: false,
        message: 'User is not force-locked',
        user: {
          user_name: user.user_name,
          status: user.status
        }
      });
    }

    // Unlock the user using schema method
    await user.unlock();

    console.log('✅ User unlocked from force-lock successfully:', {
      user_name: user.user_name,
      status: user.status
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked from force-lock successfully',
      user: {
        id: user._id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        force_lock_reason: user.force_lock_reason,
        force_locked_at: user.force_locked_at,
        force_locked_by: user.force_locked_by
      },
      unlockDetails: {
        reason: reason || 'Manual unlock by administrator',
        timestamp: new Date(),
        performedBy: unlockedBy || req.user.user_name
      }
    });

  } catch (error) {
    console.error('💥 Unlock force-locked user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error unlocking force-locked user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Enhanced version that checks the current user
export const verifyAdministratorPermissions = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Get current user details
    const user = await User.findById(userId)
      .select('BU_ROLE_ID user_name first_name last_name')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isAdministrator = parseInt(user.BU_ROLE_ID) === 1;
    const userName = user.first_name && user.last_name 
      ? `${user.first_name} ${user.last_name}` 
      : user.user_name;

    if (!isAdministrator) {
      return res.status(200).json({
        success: true,
        isAdministrator: false,
        user: {
          id: user._id,
          name: userName,
          roleId: user.BU_ROLE_ID
        },
        message: 'User is not an administrator'
      });
    }

    // Administrator verification logic
    const allPermissions = Object.values(Permission).flatMap(group => {
      if (typeof group === 'object') {
        return Object.values(group);
      }
      return [];
    });

    const permissionsDoc = await Permissions.findOne({ BU_ROLE_ID: 1 }).lean();
    let adminPermissions = [];

    if (permissionsDoc?.permissions) {
      adminPermissions = Object.values(permissionsDoc.permissions).flat();
    } else {
      const rolePermissions = getRolePermissionsGrouped(1);
      adminPermissions = Object.values(rolePermissions).flat();
    }

    const missingPermissions = allPermissions.filter(
      permission => !adminPermissions.includes(permission)
    );

    const hasAllPermissions = missingPermissions.length === 0;

    return res.status(200).json({
      success: true,
      isAdministrator: true,
      hasAllPermissions: hasAllPermissions,
      user: {
        id: user._id,
        name: userName,
        roleId: user.BU_ROLE_ID
      },
      verification: {
        totalSystemPermissions: allPermissions.length,
        adminPermissionsCount: adminPermissions.length,
        missingPermissionsCount: missingPermissions.length,
        missingPermissions: hasAllPermissions ? [] : missingPermissions,
        coveragePercentage: Math.round((adminPermissions.length / allPermissions.length) * 100)
      },
      message: hasAllPermissions 
        ? 'Administrator has full system privileges' 
        : `Administrator has ${adminPermissions.length}/${allPermissions.length} permissions (${Math.round((adminPermissions.length / allPermissions.length) * 100)}% coverage)`
    });

  } catch (error) {
    console.error('Administrator verification error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'Error verifying administrator permissions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔐 Get user permissions
export const getUserPermissions = asyncHandler(async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('BU_ROLE_ID username employer_number user_name')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Try to get permissions from Permissions model first
    let permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: user.BU_ROLE_ID 
    }).lean();

    let permissions = {};
    let roleName = 'Unknown Role';

    if (permissionsDoc) {
      // Use permissions from Permissions model
      permissions = permissionsDoc.permissions;
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      // Fallback to ROLE_MAPPING
      const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
      permissions = roleDetails.permissions;
      roleName = roleDetails.ROLE_NM;
    }

    // Return flattened permissions array for easy client-side checking
    const flattenedPermissions = Object.values(permissions).flat();

    res.json({
      success: true,
      data: flattenedPermissions,
      permissions: permissions,
      roleId: user.BU_ROLE_ID,
      roleName: roleName,
      user: {
        id: user._id,
        username: user.username || user.user_name,
        employerNumber: user.employer_number
      }
    });

  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching permissions'
    });
  }
});

// 🔐 Get user profile with permissions
export const getUserProfile = asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    const user = await User.findById(req.user.userId).select('-password').lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let roleId = user.BU_ROLE_ID;
    let permissions = {};
    let roleName = 'Unknown Role';
    let flattenedPermissions = [];

    // ✅ Check if user is Administrator
    if (parseInt(roleId) === 1) {
      console.log('Administrator detected - granting full permissions');
      
      // Generate all permissions for administrator
      permissions = Object.keys(Permission).reduce((acc, key) => {
        const permissionGroup = Permission[key];
        if (typeof permissionGroup === 'object') {
          const groupPermissions = Object.values(permissionGroup);
          acc[`${key}_ACCESS_LEVEL`] = groupPermissions;
          flattenedPermissions = flattenedPermissions.concat(groupPermissions);
        }
        return acc;
      }, {});
      
      roleName = 'Administrator';
    } else {
      // Non-admin logic
      const permissionsDoc = await Permissions.findOne({ 
        BU_ROLE_ID: roleId 
      }).select('permissions ROLE_NAME').lean();

      if (permissionsDoc) {
        permissions = permissionsDoc.permissions;
        roleName = permissionsDoc.ROLE_NAME;
        flattenedPermissions = Object.values(permissions).flat();
      } else {
        const roleDetails = getRoleWithPermissions(roleId);
        permissions = roleDetails.permissions;
        roleName = roleDetails.ROLE_NM;
        flattenedPermissions = Object.values(permissions).flat();
      }
    }

    // Construct user response
    const userResponse = {
      id: user._id,
      user_name: user.user_name,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      employer_number: user.employer_number,
      main_business_unit: user.main_business_unit,
      primary_business_role: user.primary_business_role,
      BU_ROLE_ID: user.BU_ROLE_ID,
      status: user.status,
      enable_multi_session: user.enable_multi_session,
      validate_ip_address: user.validate_ip_address,
      ip_address: user.ip_address,
      is_supervisor: user.is_supervisor,
    };

    res.json({
      success: true,
      data: {
        user: userResponse,
        permissions: permissions, // Structured permissions
        flattenedPermissions: flattenedPermissions, // Flat array for easy checking
        roleName: roleName,
        roleId: roleId,
        isAdministrator: parseInt(roleId) === 1
      }
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔐 Validate specific permission
export const validatePermission = asyncHandler(async (req, res) => {
  try {
    const { permission } = req.body;

    if (!permission) {
      return res.status(400).json({
        success: false,
        message: 'Permission parameter is required'
      });
    }

    const user = await User.findById(req.user.userId)
      .select('BU_ROLE_ID')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Administrator (roleId: 1) always has all permissions
    if (parseInt(user.BU_ROLE_ID) === 1) {
      return res.json({
        success: true,
        hasPermission: true,
        roleId: user.BU_ROLE_ID,
        isAdministrator: true
      });
    }

    // Get permissions from Permissions model or ROLE_MAPPING
    let userPermissions = [];
    let roleName = 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: user.BU_ROLE_ID 
    }).lean();

    if (permissionsDoc) {
      userPermissions = Object.values(permissionsDoc.permissions).flat();
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
      userPermissions = Object.values(roleDetails.permissions).flat();
      roleName = roleDetails.ROLE_NM;
    }

    const hasPermission = userPermissions.includes(permission);

    res.json({
      success: true,
      hasPermission,
      roleId: user.BU_ROLE_ID,
      roleName: roleName,
      permissionRequested: permission
    });

  } catch (error) {
    console.error('Validate permission error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error validating permission'
    });
  }
});

// 🔐 Validate multiple permissions
export const validatePermissions = asyncHandler(async (req, res) => {
  try {
    const { permissions: requiredPermissions, requireAll = true } = req.body;

    if (!requiredPermissions || !Array.isArray(requiredPermissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions array is required'
      });
    }

    const user = await User.findById(req.user.userId)
      .select('BU_ROLE_ID')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Administrator has all permissions
    if (parseInt(user.BU_ROLE_ID) === 1) {
      const results = requiredPermissions.reduce((acc, perm) => {
        acc[perm] = true;
        return acc;
      }, {});

      return res.json({
        success: true,
        hasAllPermissions: true,
        hasAnyPermission: true,
        results,
        roleId: user.BU_ROLE_ID,
        isAdministrator: true
      });
    }

    // Get permissions from Permissions model or ROLE_MAPPING
    let userPermissions = [];
    let roleName = 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: user.BU_ROLE_ID 
    }).lean();

    if (permissionsDoc) {
      userPermissions = Object.values(permissionsDoc.permissions).flat();
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
      userPermissions = Object.values(roleDetails.permissions).flat();
      roleName = roleDetails.ROLE_NM;
    }

    const results = requiredPermissions.reduce((acc, perm) => {
      acc[perm] = userPermissions.includes(perm);
      return acc;
    }, {});

    const hasAllPermissions = requiredPermissions.every(perm => results[perm]);
    const hasAnyPermission = requiredPermissions.some(perm => results[perm]);

    res.json({
      success: true,
      hasAllPermissions: requireAll ? hasAllPermissions : hasAnyPermission,
      hasAnyPermission,
      results,
      roleId: user.BU_ROLE_ID,
      roleName: roleName,
      userPermissionsCount: userPermissions.length
    });

  } catch (error) {
    console.error('Validate permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error validating permissions'
    });
  }
});

// ✅ Get User Configuration - FIXED VERSION
export const getUserConfig = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing JWT token' });
    }

    const user = await User.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get permissions from Permissions model or ROLE_MAPPING
    let permissions = {};
    let roleName = 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: user.BU_ROLE_ID 
    }).lean();

    if (permissionsDoc) {
      permissions = permissionsDoc.permissions;
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
      permissions = roleDetails?.permissions || {};
      roleName = roleDetails?.ROLE_NM || 'Unknown Role';
    }

    // ✅ FIX: Return the exact format expected by frontend
    const configData = {
      modules: getModulesForRole(user.BU_ROLE_ID), // Add modules array
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: true
      },
      // Include user info for compatibility
      user: {
        userId: user._id,
        user_name: user.user_name,
        email: user.email,
        role: roleName,
        roleId: user.BU_ROLE_ID,
        businessUnit: user.main_business_unit,
        status: user.status,
        permissions: Object.values(permissions).flat(), // Convert to array for frontend
        isSupervisor: user.is_supervisor || false,
        businessUnitId: user.BU_ID,
      }
    };

    // ✅ Remove the wrapper object and return directly
    res.status(200).json(configData);
  } catch (error) {
    console.error('Error fetching user config:', error.message, { stack: error.stack });
    
    // ✅ Return fallback config in expected format
    const fallbackConfig = {
      modules: [],
      preferences: { theme: 'light' },
      user: {
        user_name: 'Unknown',
        role: 'Unknown',
        permissions: []
      }
    };
    
    res.status(200).json(fallbackConfig);
  }
});

// ✅ Get Client IP Address
export const getClientIpController = asyncHandler(async (req, res) => {
  try {
    console.log('Processing getClientIpController request:', { headers: req.headers });
    const ip = getClientIp(req);
    if (!ip) {
      return res.status(400).json({
        success: false,
        message: 'Could not determine client IP address.',
      });
    }
    res.status(200).json({
      success: true,
      message: 'Client IP address retrieved successfully',
      ip_address: ip,
    });
  } catch (error) {
    console.error('Error in getClientIpController:', error.message, {
      headers: req.headers,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message,
    });
  }
});



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
      userId: user._id,  // 🔥 UPDATED: Added 'userId' to match /me endpoint expectations
      id: user._id,      // Keep 'id' for backward compatibility if needed
      user_name: user.user_name,
      role: roleName,
      roleId: user.BU_ROLE_ID,
      isAdmin: user.BU_ROLE_ID === 1,
      permissions,
      iat: Math.floor(Date.now() / 1000),  // 🔥 UPDATED: Added issued-at timestamp for better auditing
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
      preferred_name: user.preferred_name,
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



export const registerUser = asyncHandler(async (req, res) => {
  const {
    user_name,
    password,
    employer_number,
    first_name,
    last_name,
    middle_name,
    preferred_name,
    job_title,
    email,
    customer_number,
    main_business_unit,
    responsibility_centre,
    primary_business_role,
    BU_ROLE_ID,
    start_date,
    expiry_date,
    earliest_login_time,
    latest_login_time,
    internal_employee_enabled,
    relationship_officer,
    enable_multi_session,
    validate_ip_address = false,
    note,
    ip_address,
    is_supervisor,
    is_main_BU,
    status,
  } = req.body;

  // Validate required fields
  if (!user_name || !password || !email || !main_business_unit || !responsibility_centre || !primary_business_role || !BU_ROLE_ID) {
    logger.warn('Missing required fields for registration', { user_name });
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: user_name, password, email, main_business_unit, responsibility_centre, primary_business_role, BU_ROLE_ID',
    });
  }

  // Check for existing user
  const existingUser = await User.findOne({
    $or: [
      { email: new RegExp(`^${email}$`, 'i') },
      { user_name: new RegExp(`^${user_name}$`, 'i') },
    ],
  });

  if (existingUser) {
    logger.warn('User already exists', { user_name, email });
    return res.status(409).json({
      success: false,
      message: 'User already exists',
    });
  }

  // Validate role
  let roleExists = null;
  if (primary_business_role) {
    const normalizedRole = primary_business_role.toLowerCase().replace(/\s+/g, ' ').trim();
    roleExists = await UserRole.findOne({
      ROLE_NM: { $regex: new RegExp(`^${normalizedRole}$`, 'i') },
    });

    if (!roleExists) {
      const mappingEntry = Object.values(ROLE_MAPPING).find(
        role => role.ROLE_NM.toLowerCase() === normalizedRole
      );
      if (!mappingEntry) {
        logger.warn(`Role "${primary_business_role}" does not exist`, { user_name });
        return res.status(400).json({
          success: false,
          message: `Role "${primary_business_role}" does not exist`,
        });
      }
      roleExists = { ROLE_NM: mappingEntry.ROLE_NM, ROLE_ID: mappingEntry.id };
    }
  }

  // Validate IP address
  let finalIpAddress = ip_address || null;
  if (validate_ip_address) {
    if (!ip_address || !validateIpAddress(ip_address)) {
      finalIpAddress = getClientIp(req);
      if (!finalIpAddress) {
        logger.warn('Invalid or missing IP address', { user_name });
        return res.status(400).json({
          success: false,
          message: 'Invalid or missing IP address, and could not determine client IP',
        });
      }
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const newUser = new User({
    user_name,
    password: hashedPassword,
    employer_number,
    first_name,
    last_name,
    middle_name,
    preferred_name,
    job_title,
    email,
    customer_number,
    main_business_unit,
    responsibility_centre,
    primary_business_role: roleExists ? roleExists.ROLE_NM : primary_business_role,
    BU_ROLE_ID: BU_ROLE_ID || (roleExists ? roleExists.ROLE_ID : null),
    start_date: start_date || new Date(),
    expiry_date: expiry_date || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000), // Default 5 years
    earliest_login_time: earliest_login_time || '00:00',
    latest_login_time: latest_login_time || '23:59',
    internal_employee_enabled: internal_employee_enabled !== undefined ? internal_employee_enabled : true,
    relationship_officer,
    enable_multi_session: enable_multi_session !== undefined ? enable_multi_session : false,
    validate_ip_address,
    note,
    ip_address: finalIpAddress,
    is_supervisor,
    is_main_BU,
    status: status || 'active',
    passwordChangedAt: new Date(),
  });

  await newUser.save();

  logger.info('User registered successfully', { user_name, email, BU_ROLE_ID });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: newUser._id,
      user_name: newUser.user_name,
      email: newUser.email,
      role: newUser.primary_business_role,
      BU_ROLE_ID: newUser.BU_ROLE_ID,
      status: newUser.status,
      ip_address: newUser.ip_address,
    },
  });
});
// ✅ Update User
export const updateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    const user = await User.findOne({ user_name: userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    const updatedUser = await User.findOneAndUpdate({ user_name: userId }, updateData, { new: true });
    res.status(200).json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});

// ✅ Deactivate User
export const deactivateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findOne({ user_name: userId });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.status = 'Deactivated';
    await user.save();

    res.status(200).json({ message: 'User deactivated successfully', user });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ message: 'Error deactivating user', error: error.message });
  }
});

// ✅ Get User by Employer Number
export const getUserByEmployerNumber = asyncHandler(async (req, res) => {
  try {
    const { employer_number } = req.params;
    const user = await User.findOne({ employer_number });
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ message: 'User found', user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
});

// ✅ Get All Users
export const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.find();
    if (users.length === 0) return res.status(404).json({ message: 'No users found' });

    res.status(200).json({ message: 'Users fetched successfully', users });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

// ✅ Reset Password
export const resetPassword = asyncHandler(async (req, res) => {
  try {
    const { user_name, newPassword, confirmPassword } = req.body;

    if (!user_name || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        message: 'New password is required and should be at least 6 characters long'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'Passwords do not match' });
    }

    // Use the new static method
    const user = await User.findByUsernameWithPassword(user_name);

    if (!user) return res.status(404).json({ message: 'User not found' });

    const isSameAsCurrent = await user.correctPassword(newPassword, user.password);
    if (isSameAsCurrent) {
      return res.status(400).json({ message: 'New password cannot be the same as current password' });
    }

    // Check against password history
    if (user.passwordHistory && user.passwordHistory.length > 0) {
      for (const oldHash of user.passwordHistory) {
        const isPrevious = await bcrypt.compare(newPassword, oldHash);
        if (isPrevious) {
          return res.status(400).json({ message: 'Cannot reuse any of your last 5 passwords' });
        }
      }
    }

    // Hash new password and update history
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updatedHistory = [user.password, ...user.passwordHistory.slice(0, 4)];

    // Update user with new password, history, and reset lock fields
    user.password = hashedPassword;
    user.passwordHistory = updatedHistory;
    user.passwordChangedAt = Date.now();
    user.failed_attempts = 0; // Reset failed attempts
    user.lock_until = null; // Clear any temporary lock

    await user.save();
    
    res.status(200).json({ 
      success: true,
      message: 'Password reset successfully' 
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
});

// ✅ Unlock a specific user by user_name, email, or employer_number
export const unlockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason, unlockedBy } = req.body;

  try {
    console.log('🔓 Unlock user request:', { identifier, reason, unlockedBy });

    // Build query conditions, excluding _id if identifier is not a valid ObjectId
    const queryConditions = [
      { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { employer_number: identifier }
    ];
    if (Types.ObjectId.isValid(identifier)) {
      queryConditions.push({ _id: identifier });
    }

    // Find user by multiple identifiers
    const user = await User.findOne({
      $or: queryConditions
    });

    if (!user) {
      console.log('❌ User not found:', { identifier });
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    console.log('👤 User found for unlock:', {
      user_name: user.user_name,
      status: user.status,
      locked: !!(user.lock_until && user.lock_until > Date.now()),
      failed_attempts: user.failed_attempts
    });

    // Check if user is actually locked
    const isLocked = user.lock_until && user.lock_until > Date.now();
    const hasFailedAttempts = user.failed_attempts > 0;

    if (!isLocked && !hasFailedAttempts) {
      console.log('ℹ️ User is not locked:', { user_name: user.user_name });
      return res.status(200).json({
        success: true,
        message: 'User is not locked',
        user: {
          user_name: user.user_name,
          status: user.status,
          locked: false,
          failed_attempts: user.failed_attempts
        }
      });
    }

    // Unlock the user
    const updateData = {
      failed_attempts: 0,
      lock_until: null,
      last_unlocked: new Date(),
      unlocked_by: unlockedBy || req.user?.user_name || 'system',
      unlock_reason: reason || 'Manual unlock by administrator'
    };

    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      { $set: updateData },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      console.error('💥 Failed to update user:', { user_name: user.user_name });
      return res.status(500).json({
        success: false,
        message: 'Failed to update user during unlock'
      });
    }

    console.log('✅ User unlocked successfully:', {
      user_name: updatedUser.user_name,
      failed_attempts: updatedUser.failed_attempts,
      lock_until: updatedUser.lock_until
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked successfully',
      user: {
        id: updatedUser._id,
        user_name: updatedUser.user_name,
        email: updatedUser.email,
        status: updatedUser.status,
        failed_attempts: updatedUser.failed_attempts,
        lock_until: updatedUser.lock_until,
        last_unlocked: updatedUser.last_unlocked,
        unlocked_by: updatedUser.unlocked_by
      },
      unlockDetails: {
        reason: updateData.unlock_reason,
        timestamp: updateData.last_unlocked,
        performedBy: updateData.unlocked_by
      }
    });

  } catch (error) {
    console.error('💥 User unlock error:', {
      message: error.message,
      stack: error.stack,
      identifier
    });
    
    res.status(500).json({
      success: false,
      message: 'Error unlocking user',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Unlock multiple users at once
export const unlockMultipleUsers = asyncHandler(async (req, res) => {
  const { identifiers, reason, unlockedBy } = req.body;

  if (!identifiers || !Array.isArray(identifiers) || identifiers.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Identifiers array is required'
    });
  }

  try {
    console.log('🔓 Unlock multiple users request:', { 
      count: identifiers.length, 
      reason, 
      unlockedBy 
    });

    const results = {
      successful: [],
      notFound: [],
      notLocked: [],
      errors: []
    };

    for (const identifier of identifiers) {
      try {
        // Build query conditions for each identifier
        const queryConditions = [
          { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
          { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
          { employer_number: identifier }
        ];
        if (Types.ObjectId.isValid(identifier)) {
          queryConditions.push({ _id: identifier });
        }

        const user = await User.findOne({
          $or: queryConditions
        });

        if (!user) {
          results.notFound.push(identifier);
          continue;
        }

        const isLocked = user.lock_until && user.lock_until > Date.now();
        const hasFailedAttempts = user.failed_attempts > 0;

        if (!isLocked && !hasFailedAttempts) {
          results.notLocked.push({
            identifier,
            user_name: user.user_name,
            reason: 'User is not locked'
          });
          continue;
        }

        // Unlock the user
        const updatedUser = await User.findByIdAndUpdate(
          user._id,
          {
            $set: {
              failed_attempts: 0,
              lock_until: null,
              last_unlocked: new Date(),
              unlocked_by: unlockedBy || req.user?.user_name || 'system',
              unlock_reason: reason || 'Bulk unlock by administrator'
            }
          },
          { new: true }
        );

        results.successful.push({
          identifier,
          user_name: updatedUser.user_name,
          failed_attempts: updatedUser.failed_attempts,
          lock_until: updatedUser.lock_until
        });

      } catch (error) {
        results.errors.push({
          identifier,
          error: error.message
        });
      }
    }

    console.log('📊 Bulk unlock results:', results);

    res.status(200).json({
      success: true,
      message: `Bulk unlock completed: ${results.successful.length} successful, ${results.notFound.length} not found, ${results.notLocked.length} not locked, ${results.errors.length} errors`,
      results
    });

  } catch (error) {
    console.error('💥 Bulk unlock error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error processing bulk unlock',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Get all locked users
export const getLockedUsers = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;

    const query = {
      $or: [
        { lock_until: { $gt: new Date() } }, // Currently locked
        { failed_attempts: { $gt: 0 } }, // Has failed attempts but might not be locked
        { status: 'ForceLocked' } // Include force-locked users
      ]
    };

    // Add search functionality
    if (search) {
      query.$or.push(
        { user_name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employer_number: { $regex: search, $options: 'i' } },
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } }
      );
    }

    const lockedUsers = await User.find(query)
      .select('user_name email first_name last_name employer_number status failed_attempts lock_until force_lock_reason force_locked_at force_locked_by last_login created_at')
      .sort({ lock_until: -1, failed_attempts: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    const formattedUsers = lockedUsers.map(user => ({
      id: user._id,
      user_name: user.user_name,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      email: user.email,
      employer_number: user.employer_number,
      status: user.status,
      failed_attempts: user.failed_attempts,
      lock_until: user.lock_until,
      is_locked: user.lock_until && user.lock_until > Date.now(),
      is_force_locked: user.status === 'ForceLocked',
      force_lock_reason: user.force_lock_reason,
      force_locked_at: user.force_locked_at,
      force_locked_by: user.force_locked_by,
      lock_remaining: user.lock_until && user.lock_until > Date.now() 
        ? Math.ceil((user.lock_until - Date.now()) / 60000) 
        : 0,
      last_login: user.last_login,
      created_at: user.created_at
    }));

    res.status(200).json({
      success: true,
      data: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      summary: {
        total_locked: formattedUsers.filter(u => u.is_locked).length,
        total_force_locked: formattedUsers.filter(u => u.is_force_locked).length,
        total_with_attempts: formattedUsers.filter(u => u.failed_attempts > 0).length,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Get locked users error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error fetching locked users',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Reset all locked users (Administrative function)
export const resetAllLockedUsers = asyncHandler(async (req, res) => {
  try {
    // Check if requester has admin privileges
    if (req.user?.BU_ROLE_ID !== 1 && req.user?.primary_business_role !== 'Administrator') {
      return res.status(403).json({
        success: false,
        message: 'Administrator privileges required for this operation'
      });
    }

    const { reason } = req.body;

    console.log('🔄 Reset all locked users request by:', req.user.user_name);

    // Find and reset all locked users (including force-locked)
    const result = await User.updateMany(
      {
        $or: [
          { lock_until: { $gt: new Date() } },
          { failed_attempts: { $gt: 0 } },
          { status: 'ForceLocked' }
        ]
      },
      {
        $set: {
          failed_attempts: 0,
          lock_until: null,
          last_unlocked: new Date(),
          unlocked_by: req.user.user_name,
          unlock_reason: reason || 'Mass unlock by administrator',
          status: 'Active',
          force_lock_reason: null,
          force_locked_by: null,
          force_locked_at: null
        }
      }
    );

    console.log('✅ Mass unlock completed:', result);

    res.status(200).json({
      success: true,
      message: `Successfully unlocked ${result.modifiedCount} users`,
      details: {
        modifiedCount: result.modifiedCount,
        timestamp: new Date().toISOString(),
        performedBy: req.user.user_name,
        reason: reason || 'Mass unlock by administrator'
      }
    });

  } catch (error) {
    console.error('💥 Mass unlock error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error performing mass unlock',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Get user lock status
export const getUserLockStatus = asyncHandler(async (req, res) => {
  const { identifier } = req.params;

  try {
    // Build query conditions
    const queryConditions = [
      { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { employer_number: identifier }
    ];
    if (Types.ObjectId.isValid(identifier)) {
      queryConditions.push({ _id: identifier });
    }

    const user = await User.findOne({
      $or: queryConditions
    }).select('user_name email status failed_attempts lock_until last_login last_unlocked unlocked_by force_lock_reason force_locked_at force_locked_by');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isLocked = user.lock_until && user.lock_until > Date.now();
    const lockRemaining = isLocked ? Math.ceil((user.lock_until - Date.now()) / 60000) : 0;

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        lock_status: {
          is_locked: isLocked,
          is_force_locked: user.status === 'ForceLocked',
          failed_attempts: user.failed_attempts,
          lock_until: user.lock_until,
          lock_remaining_minutes: lockRemaining,
          force_lock_reason: user.force_lock_reason,
          force_locked_at: user.force_locked_at,
          force_locked_by: user.force_locked_by,
          can_login: !isLocked && user.status === 'Active'
        },
        last_login: user.last_login,
        last_unlocked: user.last_unlocked,
        unlocked_by: user.unlocked_by
      }
    });

  } catch (error) {
    console.error('💥 Get user lock status error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Error fetching user lock status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Reset User Session and Clear Caches (Fixed for employer_number/user_name tokens)
export const resetUser = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('🔄 Resetting user session for identifier:', userId);

    // Determine the type of identifier and search accordingly
    let user;
    
    if (mongoose.isValidObjectId(userId)) {
      // Search by MongoDB _id
      user = await User.findById(userId)
        .select('-password -passwordHistory')
        .lean();
    } else {
      // Search by employer_number, user_name, or email
      user = await User.findOne({
        $or: [
          { employer_number: userId },
          { user_name: userId },
          { email: userId }
        ]
      })
      .select('-password -passwordHistory')
      .lean();
      
      console.log('🔍 User search by identifier:', {
        identifier: userId,
        found: !!user,
        user: user ? user.user_name : 'Not found'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ User found:', {
      id: user._id,
      user_name: user.user_name,
      employer_number: user.employer_number,
      BU_ROLE_ID: user.BU_ROLE_ID
    });

    // Get fresh permissions
    let permissions = {};
    let roleName = 'Unknown Role';
    let flattenedPermissions = [];

    // Check if user is Administrator
    if (parseInt(user.BU_ROLE_ID) === 1) {
      console.log('🔄 Administrator detected - granting full permissions');
      
      // Generate all permissions for administrator
      permissions = Object.keys(PERMISSIONS).reduce((acc, key) => {
        const permissionGroup = PERMISSIONS[key];
        if (typeof permissionGroup === 'object') {
          const groupPermissions = Object.values(permissionGroup);
          acc[`${key}_ACCESS_LEVEL`] = groupPermissions;
          flattenedPermissions = flattenedPermissions.concat(groupPermissions);
        }
        return acc;
      }, {});
      
      roleName = 'Administrator';
    } else {
      // Non-admin logic
      const permissionsDoc = await Permissions.findOne({ 
        BU_ROLE_ID: user.BU_ROLE_ID 
      }).select('permissions ROLE_NAME').lean();

      if (permissionsDoc) {
        permissions = permissionsDoc.permissions;
        roleName = permissionsDoc.ROLE_NAME;
        flattenedPermissions = Object.values(permissions).flat();
      } else {
        const roleDetails = getRoleWithPermissions(user.BU_ROLE_ID);
        if (roleDetails) {
          permissions = roleDetails.permissions;
          roleName = roleDetails.ROLE_NM;
          flattenedPermissions = Object.values(permissions).flat();
        } else {
          // Fallback permissions
          permissions = {
            DASHBOARD_ACCESS_LEVEL: [PERMISSIONS.DASHBOARD.VIEW],
            CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW]
          };
          roleName = user.primary_business_role || 'User';
          flattenedPermissions = Object.values(permissions).flat();
        }
      }
    }

    // Construct fresh user response
    const freshUserData = {
      id: user._id,
      user_name: user.user_name,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      employer_number: user.employer_number,
      main_business_unit: user.main_business_unit,
      primary_business_role: user.primary_business_role,
      BU_ROLE_ID: user.BU_ROLE_ID,
      status: user.status,
      enable_multi_session: user.enable_multi_session,
      validate_ip_address: user.validate_ip_address,
      ip_address: user.ip_address,
      is_supervisor: user.is_supervisor,
      last_login: user.last_login,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    // Generate new token with fresh data - use MongoDB _id for consistency
    const newToken = jwt.sign(
      {
        userId: user._id, // Always use MongoDB _id in new tokens
        user_name: user.user_name,
        role: roleName,
        roleId: user.BU_ROLE_ID,
        isAdmin: user.BU_ROLE_ID === 1,
        permissions: flattenedPermissions,
        iat: Math.floor(Date.now() / 1000),
      },
      getSecretKey(),
      { expiresIn: '7d' }
    );

    console.log('✅ User session reset successfully:', {
      user_name: user.user_name,
      role: roleName,
      permissions_count: flattenedPermissions.length,
      new_token_generated: true,
      token_uses_id: true
    });

    res.json({
      success: true,
      message: 'User session refreshed successfully',
      token: newToken,
      user: {
        ...freshUserData,
        permissions: permissions,
        flattenedPermissions: flattenedPermissions,
        roleName: roleName,
        roleId: user.BU_ROLE_ID,
        isAdministrator: parseInt(user.BU_ROLE_ID) === 1,
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      cacheCleared: true,
      timestamp: new Date().toISOString(),
      debug: {
        original_identifier: userId,
        new_token_uses: 'mongodb_id'
      }
    });

  } catch (error) {
    console.error('❌ Reset user session error:', {
      message: error.message,
      userId: req.user?.userId,
      stack: error.stack
    });
    
    res.status(500).json({
      success: false,
      message: 'Error resetting user session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Clear User Caches (Admin function)
export const clearUserCaches = asyncHandler(async (req, res) => {
  try {
    const { user_name } = req.params;
    const { clearAll = false } = req.body;

    let result;
    
    if (clearAll) {
      // Clear all user-related caches (simulated - in production you might use Redis)
      console.log('🗑️ Clearing all user caches requested by:', req.user.user_name);
      result = {
        cleared: 'all_user_caches',
        message: 'All user caches cleared (simulated)'
      };
    } else if (user_name) {
      // Clear specific user cache
      console.log('🗑️ Clearing cache for user:', user_name, 'requested by:', req.user.user_name);
      
      // Find user to verify existence
      const user = await User.findOne({ 
        user_name: { $regex: new RegExp(`^${user_name}$`, 'i') } 
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      result = {
        cleared: `cache_for_${user_name}`,
        user_id: user._id,
        message: `Cache cleared for user: ${user_name}`
      };
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either user_name or clearAll parameter is required'
      });
    }

    res.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
      performedBy: req.user.user_name
    });

  } catch (error) {
    console.error('❌ Clear user caches error:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing user caches',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Get User Session Info
export const getUserSessionInfo = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    const user = await User.findById(userId)
      .select('user_name email first_name last_name BU_ROLE_ID primary_business_role status last_login created_at')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Decode token to get issued and expiry info
    const token = req.headers.authorization?.replace('Bearer ', '');
    let tokenInfo = {};
    
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded) {
          tokenInfo = {
            issuedAt: decoded.iat ? new Date(decoded.iat * 1000).toISOString() : null,
            expiresAt: decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null,
            issuedAgo: decoded.iat ? Math.floor((Date.now() - decoded.iat * 1000) / 60000) + ' minutes ago' : null,
            expiresIn: decoded.exp ? Math.floor((decoded.exp * 1000 - Date.now()) / 60000) + ' minutes' : null
          };
        }
      } catch (error) {
        console.warn('Could not decode token for session info');
      }
    }

    res.json({
      success: true,
      session: {
        user: {
          id: user._id,
          user_name: user.user_name,
          name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          role: user.primary_business_role,
          roleId: user.BU_ROLE_ID,
          status: user.status,
          lastLogin: user.last_login,
          accountCreated: user.created_at
        },
        token: tokenInfo,
        currentTime: new Date().toISOString(),
        sessionDuration: user.last_login ? 
          Math.floor((Date.now() - new Date(user.last_login).getTime()) / 60000) + ' minutes' : 
          'Unknown'
      }
    });

  } catch (error) {
    console.error('❌ Get user session info error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user session info',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default {
  registerUser,
  getClientIpController,
  updateUser,
  deactivateUser,
  getUserByEmployerNumber,
  getAllUsers,
  resetPassword,
  getUserConfig,
  login,
  getUserPermissions,
  getUserProfile,
  validatePermission,
  validatePermissions,
  verifyAdministratorPermissions,
  unlockUser,
  unlockMultipleUsers,
  getLockedUsers,
  resetAllLockedUsers,
  getUserLockStatus,
  forceLockUser,
  unlockForceLockedUser
};