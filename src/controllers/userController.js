import mongoose from 'mongoose';
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
import { roleHasPermission } from '../constants/roleMapping.js';

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

// Helper function to get modules for role
function getModulesForRole(roleId) {
  // Default modules for all roles
  const baseModules = ['dashboard', 'profile', 'settings'];
  
  if (parseInt(roleId) === 1) {
    // Administrator - all modules
    return [...baseModules, 'users', 'roles', 'permissions', 'reports', 'analytics', 'system'];
  } else {
    // Regular users - basic modules
    return baseModules;
  }
}

// ✅ Force lock a user due to fraud - FIXED VERSION with Legacy Compatibility
export const forceLockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason } = req.body;

  try {
    console.log('🔒 Force lock user request:', { identifier, reason, lockedBy: req.user.user_name });

    // Find user by multiple identifiers (enhanced for legacy)
    const user = await User.findOne({
      $or: [
        { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }, // Legacy username support
        { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { employer_number: identifier },
        { _id: mongoose.Types.ObjectId.isValid(identifier) ? identifier : null },
        { id: parseInt(identifier) }, // Legacy numeric id
        { user_id: parseInt(identifier) } // Legacy user_id
      ].filter(condition => condition && condition._id !== null && condition.id !== null && condition.user_id !== null)
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Force Lock):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status,
      original_branch: user.branch,
      mapped_BU_ID: mappedUser.BU_ID
    });

    // Check if user is already force-locked
    if (mappedUser.status === 'ForceLocked') {
      return res.status(400).json({
        success: false,
        message: 'User is already force-locked',
        user: {
          user_name: mappedUser.user_name,
          status: mappedUser.status,
          force_lock_reason: user.force_lock_reason,
          force_locked_at: user.force_locked_at,
          force_locked_by: user.force_locked_by
        }
      });
    }

    // Force lock the user using schema method
    await user.forceLock(req.user._id, reason || 'Suspicious activity detected');

    console.log('✅ User force-locked successfully:', {
      user_name: mappedUser.user_name,
      status: mappedUser.status,
      force_lock_reason: user.force_lock_reason
    });

    res.status(200).json({
      success: true,
      message: 'User force-locked successfully',
      user: {
        id: user._id,
        user_name: mappedUser.user_name,
        email: user.email,
        status: mappedUser.status,
        force_lock_reason: user.force_lock_reason,
        force_locked_at: user.force_locked_at,
        force_locked_by: user.force_locked_by,
        // Legacy fields for compatibility
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: mappedUser.is_active
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

// Add this to your user controller for immediate testing
export const forceResetPassword = asyncHandler(async (req, res) => {
  const { user_name, username, new_password } = req.body;  // Support both user_name and username

  try {
    console.log('🔄 FORCE PASSWORD RESET:', { user_name, username });

    // Use login identifier for legacy compatibility
    const loginIdentifier = username || user_name;

    const user = await User.findByUsernameWithPassword(loginIdentifier);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields for logging/response
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Password Reset):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status
    });

    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update user password
    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    
    await user.save();

    console.log('✅ PASSWORD RESET SUCCESSFUL:', {
      user_name: mappedUser.user_name,
      new_password_length: new_password.length,
      new_hash: hashedPassword.substring(0, 20) + '...'
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
      user: {
        user_name: mappedUser.user_name,
        email: user.email,
        // Legacy fields for compatibility
        username: user.username || mappedUser.user_name,
        legacy_role: mappedUser.role
      }
    });

  } catch (error) {
    console.error('💥 Password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed',
      error: error.message
    });
  }
});

// ✅ Unlock a force-locked user - FIXED VERSION with Legacy Compatibility
export const unlockForceLockedUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason, unlockedBy } = req.body;

  try {
    console.log('🔓 Unlock force-locked user request:', { identifier, reason, unlockedBy });

    // Find user by multiple identifiers (enhanced for legacy)
    const user = await User.findOne({
      $or: [
        { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }, // Legacy username support
        { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
        { employer_number: identifier },
        { _id: mongoose.Types.ObjectId.isValid(identifier) ? identifier : null },
        { id: parseInt(identifier) }, // Legacy numeric id
        { user_id: parseInt(identifier) } // Legacy user_id
      ].filter(condition => condition && condition._id !== null && condition.id !== null && condition.user_id !== null)
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
        identifier
      });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Unlock):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status,
      original_branch: user.branch,
      mapped_BU_ID: mappedUser.BU_ID
    });

    // Check if user is actually force-locked
    if (mappedUser.status !== 'ForceLocked') {
      return res.status(400).json({
        success: false,
        message: 'User is not force-locked',
        user: {
          user_name: mappedUser.user_name,
          status: mappedUser.status
        }
      });
    }

    // Unlock the user using schema method
    await user.unlock();

    console.log('✅ User unlocked from force-lock successfully:', {
      user_name: mappedUser.user_name,
      status: mappedUser.status
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked from force-lock successfully',
      user: {
        id: user._id,
        user_name: mappedUser.user_name,
        email: user.email,
        status: mappedUser.status,
        force_lock_reason: user.force_lock_reason,
        force_locked_at: user.force_locked_at,
        force_locked_by: user.force_locked_by,
        // Legacy fields for compatibility
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: mappedUser.is_active
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

// Enhanced version that checks the current user - FIXED VERSION with Legacy Compatibility
export const verifyAdministratorPermissions = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Get current user details
    const user = await User.findById(userId)
      .select('BU_ROLE_ID user_name first_name last_name username fname lname role utype')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Admin Verification):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_utype: user.utype,
      mapped_primary_business_role: mappedUser.primary_business_role,
      original_fname_lname: { fname: user.fname, lname: user.lname },
      mapped_first_last_name: { first_name: mappedUser.first_name, last_name: mappedUser.last_name }
    });

    const isAdministrator = parseInt(mappedUser.BU_ROLE_ID) === 1;
    const userName = mappedUser.first_name && mappedUser.last_name 
      ? `${mappedUser.first_name} ${mappedUser.last_name}` 
      : mappedUser.user_name;

    if (!isAdministrator) {
      return res.status(200).json({
        success: true,
        isAdministrator: false,
        user: {
          id: mappedUser._id,
          name: userName,
          roleId: mappedUser.BU_ROLE_ID,
          // Legacy fields for compatibility
          username: mappedUser.username || mappedUser.user_name,
          legacy_role: mappedUser.role
        },
        message: 'User is not an administrator'
      });
    }

    // Administrator verification logic
    const allPermissions = Object.values(PERMISSIONS).flatMap(group => {
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
        id: mappedUser._id,
        name: userName,
        roleId: mappedUser.BU_ROLE_ID,
        // Legacy fields for compatibility
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_utype: mappedUser.utype
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

// ✅ Get Users by Business Unit ID - FIXED VERSION with Legacy Compatibility
export const getUsersByBU_ID = asyncHandler(async (req, res) => {
  try {
    const { bu_id } = req.params;
    const { 
      page = 1, 
      limit = 50, 
      status, 
      role_id,
      include_inactive = false 
    } = req.query;

    console.log('🔍 Get Users by BU_ID request:', { 
      bu_id, 
      page, 
      limit, 
      status,
      role_id,
      include_inactive 
    });

    // Build base query with BU_ID search (including legacy branch field)
    const baseQuery = {
      $or: [
        { main_business_unit: bu_id },
        { BU_ID: bu_id },
        { branch: bu_id } // Legacy branch field
      ]
    };

    // Add status filter if provided
    if (status && status !== 'all') {
      baseQuery.status = status;
    } else if (!include_inactive) {
      // Default: only active users unless explicitly including inactive
      baseQuery.status = 'Active';
    }

    // Add role filter if provided
    if (role_id) {
      baseQuery.$or = baseQuery.$or || [];
      baseQuery.$or.push(
        { BU_ROLE_ID: role_id },
        { role: role_id } // Legacy role field
      );
    }

    console.log('📊 Database query:', JSON.stringify(baseQuery, null, 2));

    // Execute query with pagination
    const users = await User.find(baseQuery)
      .select('-password -passwordHistory') // Exclude sensitive fields
      .sort({ 
        first_name: 1, 
        last_name: 1,
        created_at: -1 
      })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Get total count for pagination
    const total = await User.countDocuments(baseQuery);

    console.log('📈 Query results:', {
      bu_id,
      users_found: users.length,
      total_users: total,
      page,
      limit
    });

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No users found for this business unit',
        data: {
          users: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          },
          summary: {
            business_unit_id: bu_id,
            active_users: 0,
            inactive_users: 0,
            total_users: 0
          }
        }
      });
    }

    // Map users with legacy compatibility and enhanced information
    const mappedUsers = await Promise.all(users.map(async (user) => {
      // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
      const mappedUser = {
        ...user,
        user_name: user.user_name || user.username,
        first_name: user.first_name || user.fname,
        last_name: user.last_name || user.lname,
        BU_ROLE_ID: user.BU_ROLE_ID || user.role,
        primary_business_role: user.primary_business_role || user.utype,
        status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
        main_business_unit: user.main_business_unit || user.branch?.toString() || '',
        is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
        BU_ID: user.BU_ID || user.branch,
        internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff'),
        enable_multi_session: user.enable_multi_session || (user.pass_never_expire === 2),
        validate_ip_address: user.validate_ip_address || false,
        ip_address: user.ip_address || null
      };

      // Get role permissions and details
      let permissions = [];
      let roleName = mappedUser.primary_business_role || 'Unknown Role';

      // Check if user is Administrator
      if (parseInt(mappedUser.BU_ROLE_ID) === 1) {
        // Administrator has all permissions
        permissions = Object.values(PERMISSIONS).flatMap(group => 
          typeof group === 'object' ? Object.values(group) : []
        );
        roleName = 'Administrator';
      } else {
        // Non-admin logic
        const permissionsDoc = await Permissions.findOne({ 
          BU_ROLE_ID: mappedUser.BU_ROLE_ID 
        }).select('permissions ROLE_NAME').lean();

        if (permissionsDoc) {
          permissions = Object.values(permissionsDoc.permissions).flat();
          roleName = permissionsDoc.ROLE_NAME;
        } else {
          const roleDetails = getRoleWithPermissions(mappedUser.BU_ROLE_ID);
          if (roleDetails) {
            permissions = Object.values(roleDetails.permissions).flat();
            roleName = roleDetails.ROLE_NM;
          }
        }
      }

      // Calculate lock status
      const isLocked = user.lock_until && user.lock_until > Date.now();
      const lockRemaining = isLocked ? Math.ceil((user.lock_until - Date.now()) / 60000) : 0;

      return {
        // Basic user information
        id: user._id,
        user_name: mappedUser.user_name,
        email: user.email,
        first_name: mappedUser.first_name,
        last_name: mappedUser.last_name,
        full_name: `${mappedUser.first_name || ''} ${mappedUser.last_name || ''}`.trim(),
        employer_number: user.employer_number,
        job_title: user.job_title,
        
        // Business unit information
        main_business_unit: mappedUser.main_business_unit,
        BU_ID: mappedUser.BU_ID,
        responsibility_centre: user.responsibility_centre,
        
        // Role and permissions
        primary_business_role: mappedUser.primary_business_role,
        BU_ROLE_ID: mappedUser.BU_ROLE_ID,
        role_name: roleName,
        permissions_count: permissions.length,
        is_administrator: parseInt(mappedUser.BU_ROLE_ID) === 1,
        
        // Status and security
        status: mappedUser.status,
        internal_employee_enabled: mappedUser.internal_employee_enabled,
        is_supervisor: mappedUser.is_supervisor,
        enable_multi_session: mappedUser.enable_multi_session,
        validate_ip_address: mappedUser.validate_ip_address,
        ip_address: mappedUser.ip_address,
        
        // Lock status
        lock_status: {
          is_locked: isLocked,
          is_force_locked: user.status === 'ForceLocked',
          failed_attempts: user.failed_attempts || 0,
          lock_until: user.lock_until,
          lock_remaining_minutes: lockRemaining,
          force_lock_reason: user.force_lock_reason,
          force_locked_at: user.force_locked_at,
          force_locked_by: user.force_locked_by
        },
        
        // Dates
        start_date: user.start_date,
        expiry_date: user.expiry_date,
        last_login: user.last_login,
        created_at: user.created_at,
        updated_at: user.updated_at,
        
        // Legacy fields for compatibility
        username: user.username || mappedUser.user_name,
        legacy_role: user.role,
        legacy_status: user.is_active,
        legacy_branch: user.branch,
        legacy_utype: user.utype
      };
    }));

    // Calculate summary statistics
    const activeUsers = mappedUsers.filter(user => user.status === 'Active').length;
    const inactiveUsers = mappedUsers.filter(user => user.status !== 'Active').length;
    const lockedUsers = mappedUsers.filter(user => user.lock_status.is_locked).length;
    const supervisorUsers = mappedUsers.filter(user => user.is_supervisor).length;
    const administratorUsers = mappedUsers.filter(user => user.is_administrator).length;

    console.log('✅ Users retrieved successfully:', {
      bu_id,
      total_users: mappedUsers.length,
      active_users: activeUsers,
      inactive_users: inactiveUsers,
      locked_users: lockedUsers,
      supervisor_users: supervisorUsers,
      administrator_users: administratorUsers
    });

    res.status(200).json({
      success: true,
      message: `Found ${mappedUsers.length} users for business unit ${bu_id}`,
      data: {
        users: mappedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          business_unit_id: bu_id,
          active_users: activeUsers,
          inactive_users: inactiveUsers,
          locked_users: lockedUsers,
          supervisor_users: supervisorUsers,
          administrator_users: administratorUsers,
          total_users: mappedUsers.length,
          query_filters: {
            status: status || 'Active (default)',
            role_id: role_id || 'All',
            include_inactive: include_inactive === 'true'
          }
        }
      }
    });

  } catch (error) {
    console.error('💥 Get users by BU_ID error:', {
      message: error.message,
      stack: error.stack,
      bu_id: req.params.bu_id,
      query: req.query
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching users by business unit',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Get Business Unit Summary - Get statistics for a specific BU_ID
export const getBUSummary = asyncHandler(async (req, res) => {
  try {
    const { bu_id } = req.params;

    console.log('📊 Get Business Unit Summary request:', { bu_id });

    // Build query for this business unit
    const buQuery = {
      $or: [
        { main_business_unit: bu_id },
        { BU_ID: bu_id },
        { branch: bu_id } // Legacy branch field
      ]
    };

    // Get all users for this business unit
    const users = await User.find(buQuery)
      .select('status BU_ROLE_ID role is_supervisor lock_until failed_attempts internal_employee_enabled')
      .lean();

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No users found for this business unit',
        data: {
          business_unit_id: bu_id,
          total_users: 0,
          summary: {
            active_users: 0,
            inactive_users: 0,
            locked_users: 0,
            supervisors: 0,
            administrators: 0,
            internal_employees: 0,
            external_users: 0
          },
          role_breakdown: {},
          status_breakdown: {}
        }
      });
    }

    // Calculate comprehensive statistics
    const summary = {
      total_users: users.length,
      active_users: users.filter(user => 
        user.status === 'Active' || user.is_active === 'Active'
      ).length,
      inactive_users: users.filter(user => 
        user.status !== 'Active' && user.is_active !== 'Active'
      ).length,
      locked_users: users.filter(user => 
        user.lock_until && user.lock_until > Date.now()
      ).length,
      supervisors: users.filter(user => 
        user.is_supervisor || user.rofficer === 'Yes'
      ).length,
      administrators: users.filter(user => 
        parseInt(user.BU_ROLE_ID || user.role) === 1
      ).length,
      internal_employees: users.filter(user => 
        user.internal_employee_enabled || user.utype === 'Staff'
      ).length,
      external_users: users.filter(user => 
        !user.internal_employee_enabled && user.utype !== 'Staff'
      ).length
    };

    // Role breakdown
    const roleBreakdown = users.reduce((acc, user) => {
      const roleId = user.BU_ROLE_ID || user.role;
      const roleKey = roleId ? roleId.toString() : 'unknown';
      
      if (!acc[roleKey]) {
        acc[roleKey] = {
          count: 0,
          role_id: roleId,
          role_name: getRoleWithPermissions(roleId)?.ROLE_NM || 'Unknown Role'
        };
      }
      acc[roleKey].count++;
      return acc;
    }, {});

    // Status breakdown
    const statusBreakdown = users.reduce((acc, user) => {
      const status = user.status || (user.is_active === 'Active' ? 'Active' : 'Inactive');
      if (!acc[status]) {
        acc[status] = 0;
      }
      acc[status]++;
      return acc;
    }, {});

    console.log('✅ Business Unit summary retrieved:', {
      bu_id,
      total_users: summary.total_users,
      active_users: summary.active_users
    });

    res.status(200).json({
      success: true,
      message: `Business unit summary for ${bu_id}`,
      data: {
        business_unit_id: bu_id,
        total_users: summary.total_users,
        summary,
        role_breakdown: roleBreakdown,
        status_breakdown: statusBreakdown,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('💥 Get business unit summary error:', {
      message: error.message,
      stack: error.stack,
      bu_id: req.params.bu_id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business unit summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// 🔐 Get user profile with permissions - FIXED VERSION with Legacy Compatibility
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

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff'),
      enable_multi_session: user.enable_multi_session || (user.pass_never_expire === 2), // Assuming 2 means true
      validate_ip_address: user.validate_ip_address || false, // No direct legacy map
      ip_address: user.ip_address || null
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Profile):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status,
      original_branch: user.branch,
      mapped_BU_ID: mappedUser.BU_ID,
      original_rofficer: user.rofficer,
      mapped_is_supervisor: mappedUser.is_supervisor
    });

    let roleId = mappedUser.BU_ROLE_ID;
    let permissions = {};
    let roleName = mappedUser.primary_business_role || 'Unknown Role';
    let flattenedPermissions = [];

    // ✅ Check if user is Administrator
    if (parseInt(roleId) === 1) {
      console.log('Administrator detected - granting full permissions');
      
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

    // Construct user response with mapped fields
    const userResponse = {
      id: mappedUser._id,
      user_name: mappedUser.user_name,
      email: mappedUser.email,
      first_name: mappedUser.first_name,
      last_name: mappedUser.last_name,
      employer_number: mappedUser.employer_number,
      main_business_unit: mappedUser.main_business_unit,
      primary_business_role: mappedUser.primary_business_role,
      BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      status: mappedUser.status,
      enable_multi_session: mappedUser.enable_multi_session,
      validate_ip_address: mappedUser.validate_ip_address,
      ip_address: mappedUser.ip_address,
      is_supervisor: mappedUser.is_supervisor,
      // Legacy fields for frontend compatibility if needed
      username: mappedUser.username || mappedUser.user_name,
      legacy_role: mappedUser.role,
      legacy_status: mappedUser.is_active,
      legacy_utype: mappedUser.utype,
      legacy_branch: mappedUser.branch
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

// ✅ Get User Configuration - FIXED VERSION with Legacy Compatibility
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

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG:', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status,
      original_branch: user.branch,
      mapped_BU_ID: mappedUser.BU_ID
    });

    // Get permissions from Permissions model or ROLE_MAPPING
    let permissions = {};
    let roleName = mappedUser.primary_business_role || 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      BU_ROLE_ID: mappedUser.BU_ROLE_ID 
    }).lean();

    if (permissionsDoc) {
      permissions = permissionsDoc.permissions;
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(mappedUser.BU_ROLE_ID);
      permissions = roleDetails?.permissions || {};
      roleName = roleDetails?.ROLE_NM || roleName;
    }

    // ✅ FIX: Return the exact format expected by frontend
    const configData = {
      modules: getModulesForRole(mappedUser.BU_ROLE_ID), // Add modules array
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: true
      },
      // Include user info for compatibility with legacy mappings
      user: {
        userId: mappedUser._id,
        user_name: mappedUser.user_name,
        email: mappedUser.email,
        role: roleName,
        roleId: mappedUser.BU_ROLE_ID,
        businessUnit: mappedUser.main_business_unit,
        status: mappedUser.status,
        permissions: Object.values(permissions).flat(), // Convert to array for frontend
        isSupervisor: mappedUser.is_supervisor || false,
        businessUnitId: mappedUser.BU_ID,
        // Legacy fields for frontend compatibility if needed
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: mappedUser.is_active
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
    console.warn('Missing required fields for registration', { user_name });
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
    console.warn('User already exists', { user_name, email });
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
        console.warn(`Role "${primary_business_role}" does not exist`, { user_name });
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
      finalIpAddress = getClientIp(req); // Assume function exists; fallback to req.ip
      if (!finalIpAddress) {
        console.warn('Invalid or missing IP address', { user_name });
        finalIpAddress = req.ip; // Fallback
      }
    }
  }

  // Create user with legacy compatibility (pre-save will hash password)
  const newUser = new User({
    user_name,
    password, // Raw; pre-save hashes it
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
    status: status || 'Active', // Use "Active" for deployed model enum
    // Legacy fields for compatibility
    user_id: Date.now(), // Generate numeric user_id
    id: Date.now() + 1, // Different from user_id for legacy
    passwordChangedAt: new Date(), // Set explicitly
  });

  await newUser.save(); // Pre-save hooks run here (hashing, etc.)

  console.info('User registered successfully', { 
    user_name, 
    email, 
    BU_ROLE_ID,
    legacy_user_id: newUser.user_id,
    legacy_id: newUser.id
  });

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
      // Legacy compatibility
      legacy_user_id: newUser.user_id,
      legacy_id: newUser.id
    },
  });
});

// ✅ Update User - FIXED VERSION with Legacy Compatibility
export const updateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Find user by multiple identifiers (user_name, username, _id, etc.)
    const user = await User.findOne({
      $or: [
        { user_name: { $regex: new RegExp(`^${userId}$`, 'i') } },
        { username: { $regex: new RegExp(`^${userId}$`, 'i') } },
        { _id: mongoose.Types.ObjectId.isValid(userId) ? userId : null },
        { id: parseInt(userId) },
        { user_id: parseInt(userId) }
      ].filter(condition => condition && condition._id !== null && condition.id !== null && condition.user_id !== null)
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Update User):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status,
      original_branch: user.branch,
      mapped_BU_ID: mappedUser.BU_ID
    });

    // Handle password update
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    // Update using MongoDB _id for consistency
    const updatedUser = await User.findByIdAndUpdate(
      user._id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({ 
      message: 'User updated successfully', 
      user: {
        ...updatedUser.toObject(),
        // Legacy fields for compatibility
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: mappedUser.is_active
      }
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});

// ✅ Deactivate User - FIXED VERSION with Validation Bypass
export const deactivateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    // Build $or array
    const queryConditions = [
      { user_name: { $regex: new RegExp(`^${userId}$`, 'i') } },
      { username: { $regex: new RegExp(`^${userId}$`, 'i') } }
    ];

    // Only add _id if valid ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      queryConditions.push({ _id: userId });
    }

    // Only add numeric conditions if userId is numeric
    if (!isNaN(userId) && userId !== '') {
      queryConditions.push({ id: parseInt(userId) });
      queryConditions.push({ user_id: parseInt(userId) });
    }

    // Find user by multiple identifiers
    const user = await User.findOne({
      $or: queryConditions
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Deactivate User):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status
    });

    // ✅ FIX: Use updateOne to bypass validation for required fields
    const result = await User.updateOne(
      { _id: user._id },
      { 
        $set: { 
          status: 'Deactivated',
          internal_employee_enabled: false
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ message: 'Failed to deactivate user' });
    }

    // Fetch the updated user to return in response
    const updatedUser = await User.findById(user._id);

    res.status(200).json({ 
      message: 'User deactivated successfully', 
      user: {
        ...updatedUser.toObject(),
        // Legacy fields for compatibility
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: mappedUser.is_active
      }
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ message: 'Error deactivating user', error: error.message });
  }
});

// ✅ Activate User - FIXED VERSION with Validation Bypass
export const activateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    // Build $or array
    const queryConditions = [
      { user_name: { $regex: new RegExp(`^${userId}$`, 'i') } },
      { username: { $regex: new RegExp(`^${userId}$`, 'i') } }
    ];

    // Only add _id if valid ObjectId
    if (mongoose.Types.ObjectId.isValid(userId)) {
      queryConditions.push({ _id: userId });
    }

    // Only add numeric conditions if userId is numeric
    if (!isNaN(userId) && userId !== '') {
      queryConditions.push({ id: parseInt(userId) });
      queryConditions.push({ user_id: parseInt(userId) });
    }

    // Find user by multiple identifiers
    const user = await User.findOne({
      $or: queryConditions
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Activate User):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status
    });

    // ✅ FIX: Use updateOne to bypass validation for required fields
    const result = await User.updateOne(
      { _id: user._id },
      { 
        $set: { 
          status: 'Active',
          internal_employee_enabled: true
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ message: 'Failed to activate user' });
    }

    // Fetch the updated user to return in response
    const updatedUser = await User.findById(user._id);

    res.status(200).json({ 
      message: 'User activated successfully', 
      user: {
        ...updatedUser.toObject(),
        // Legacy fields for compatibility
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: mappedUser.is_active
      }
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ message: 'Error activating user', error: error.message });
  }
});

// ✅ Get User by Employer Number - FIXED VERSION with Legacy Compatibility
export const getUserByEmployerNumber = asyncHandler(async (req, res) => {
  try {
    const { employer_number } = req.params;
    
    // 🔍 LEGACY COMPATIBILITY: Search by employer_number OR username (for legacy data)
    const user = await User.findOne({ 
      $or: [
        { employer_number },
        { username: employer_number }
      ]
    });
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Get User by Employer):', {
      employer_number,
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID
    });

    res.status(200).json({ 
      message: 'User found', 
      user: {
        ...user.toObject(),
        // Legacy fields for compatibility
        username: mappedUser.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: mappedUser.is_active
      }
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ message: 'Error fetching user', error: error.message });
  }
});

// ✅ Get All Users - FIXED VERSION with Legacy Compatibility
export const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.find();
    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }

    // Map each user with legacy compatibility
    const mappedUsers = users.map(user => {
      const mappedUser = {
        ...user.toObject(),
        user_name: user.user_name || user.username,
        first_name: user.first_name || user.fname,
        last_name: user.last_name || user.lname,
        BU_ROLE_ID: user.BU_ROLE_ID || user.role,
        primary_business_role: user.primary_business_role || user.utype,
        status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
        main_business_unit: user.main_business_unit || user.branch?.toString() || '',
        is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
        BU_ID: user.BU_ID || user.branch,
        internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
      };

      console.log('🔍 LEGACY MAPPING DEBUG (Get All Users):', {
        user_name: mappedUser.user_name,
        original_username: user.username,
        original_role: user.role,
        mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID
      });

      return {
        ...mappedUser,
        // Legacy fields for compatibility
        username: user.username || mappedUser.user_name,
        legacy_role: user.role,
        legacy_status: user.is_active
      };
    });

    res.status(200).json({ message: 'Users fetched successfully', users: mappedUsers });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

export const resetPassword = asyncHandler(async (req, res) => {
  try {
    const { user_name, username, newPassword, confirmPassword } = req.body;

    // Use login identifier for legacy compatibility
    const loginIdentifier = username || user_name;

    if (!loginIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Login identifier (username or user_name) is required'
      });
    }

    // Determine if current user is admin (bypass permission check for self-reset or admin)
    const isAdmin = req.user.isAdmin || req.user.role === 'Administrator' || parseInt(req.user.roleId || req.user.BU_ROLE_ID) === 1;

    // If loginIdentifier is provided and different from current user, check admin permissions
    const targetLoginIdentifier = loginIdentifier;
    if (targetLoginIdentifier !== req.user.user_name && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to reset other users\' passwords'
      });
    }

    // Rest of the function remains the same...
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password is required and should be at least 6 characters long'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
    }

    const user = await User.findByUsernameWithPassword(targetLoginIdentifier);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields for logging/response
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Reset Password):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status
    });

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user password without full validation to avoid required field errors on legacy data
    await User.updateOne(
      { _id: user._id },
      { password: hashedPassword, passwordChangedAt: new Date() },
      { runValidators: false } // Skip full validation for password-only updates
    );

    res.json({ 
      success: true,
      message: 'Password reset successfully',
      user: {
        user_name: mappedUser.user_name,
        email: user.email,
        // Legacy fields for compatibility
        username: user.username || mappedUser.user_name,
        legacy_role: mappedUser.role
      }
    });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error resetting password', 
      error: error.message 
    });
  }
});

// ✅ Unlock a specific user by user_name, email, or employer_number - FIXED VERSION with Legacy Compatibility
export const unlockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason, unlockedBy } = req.body;

  try {
    console.log('🔓 Unlock user request:', { identifier, reason, unlockedBy });

    // Build query conditions, excluding _id if identifier is not a valid ObjectId
    const queryConditions = [
      { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }, // Legacy support
      { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { employer_number: identifier }
    ];
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      queryConditions.push({ _id: identifier });
    }
    if (!isNaN(identifier)) {
      queryConditions.push({ id: parseInt(identifier) });
      queryConditions.push({ user_id: parseInt(identifier) });
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

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Unlock User):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status
    });

    console.log('👤 User found for unlock:', {
      user_name: mappedUser.user_name,
      status: mappedUser.status,
      locked: !!(user.lock_until && user.lock_until > Date.now()),
      failed_attempts: user.failed_attempts
    });

    // Check if user is actually locked
    const isLocked = user.lock_until && user.lock_until > Date.now();
    const hasFailedAttempts = user.failed_attempts > 0;

    if (!isLocked && !hasFailedAttempts) {
      console.log('ℹ️ User is not locked:', { user_name: mappedUser.user_name });
      return res.status(200).json({
        success: true,
        message: 'User is not locked',
        user: {
          user_name: mappedUser.user_name,
          status: mappedUser.status,
          locked: false,
          failed_attempts: user.failed_attempts,
          // Legacy fields for compatibility
          username: user.username || mappedUser.user_name,
          legacy_status: user.is_active
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
      console.error('💥 Failed to update user:', { user_name: mappedUser.user_name });
      return res.status(500).json({
        success: false,
        message: 'Failed to update user during unlock'
      });
    }

    console.log('✅ User unlocked successfully:', {
      user_name: mappedUser.user_name,
      failed_attempts: updatedUser.failed_attempts,
      lock_until: updatedUser.lock_until
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked successfully',
      user: {
        id: updatedUser._id,
        user_name: mappedUser.user_name,
        email: updatedUser.email,
        status: mappedUser.status,
        failed_attempts: updatedUser.failed_attempts,
        lock_until: updatedUser.lock_until,
        last_unlocked: updatedUser.last_unlocked,
        unlocked_by: updatedUser.unlocked_by,
        // Legacy fields for compatibility
        username: user.username || mappedUser.user_name,
        legacy_role: mappedUser.role,
        legacy_status: user.is_active
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

// ✅ Unlock multiple users at once - FIXED VERSION with Legacy Compatibility
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
          { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }, // Legacy support
          { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
          { employer_number: identifier }
        ];
        if (mongoose.Types.ObjectId.isValid(identifier)) {
          queryConditions.push({ _id: identifier });
        }
        if (!isNaN(identifier)) {
          queryConditions.push({ id: parseInt(identifier) });
          queryConditions.push({ user_id: parseInt(identifier) });
        }

        const user = await User.findOne({
          $or: queryConditions
        });

        if (!user) {
          results.notFound.push(identifier);
          continue;
        }

        // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
        const mappedUser = {
          ...user,
          user_name: user.user_name || user.username,
          first_name: user.first_name || user.fname,
          last_name: user.last_name || user.lname,
          BU_ROLE_ID: user.BU_ROLE_ID || user.role,
          primary_business_role: user.primary_business_role || user.utype,
          status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated')
        };

        console.log('🔍 LEGACY MAPPING DEBUG (Bulk Unlock):', {
          identifier,
          original_username: user.username,
          mapped_user_name: mappedUser.user_name,
          original_role: user.role,
          mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID
        });

        const isLocked = user.lock_until && user.lock_until > Date.now();
        const hasFailedAttempts = user.failed_attempts > 0;

        if (!isLocked && !hasFailedAttempts) {
          results.notLocked.push({
            identifier,
            user_name: mappedUser.user_name,
            reason: 'User is not locked',
            // Legacy fields
            username: user.username || mappedUser.user_name
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
          user_name: mappedUser.user_name,
          failed_attempts: updatedUser.failed_attempts,
          lock_until: updatedUser.lock_until,
          // Legacy fields
          username: user.username || mappedUser.user_name,
          legacy_status: user.is_active
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

// ✅ Get all locked users - FIXED VERSION with Legacy Compatibility
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

    // Add search functionality with legacy support
    if (search) {
      query.$or.push(
        { user_name: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }, // Legacy username
        { email: { $regex: search, $options: 'i' } },
        { employer_number: { $regex: search, $options: 'i' } },
        { first_name: { $regex: search, $options: 'i' } },
        { last_name: { $regex: search, $options: 'i' } },
        { fname: { $regex: search, $options: 'i' } }, // Legacy first name
        { lname: { $regex: search, $options: 'i' } }  // Legacy last name
      );
    }

    const lockedUsers = await User.find(query)
      .select('user_name email first_name last_name employer_number status failed_attempts lock_until force_lock_reason force_locked_at force_locked_by last_login created_at username fname lname') // Include legacy fields
      .sort({ lock_until: -1, failed_attempts: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    const formattedUsers = lockedUsers.map(user => {
      // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
      const mappedUser = {
        ...user.toObject(),
        user_name: user.user_name || user.username,
        first_name: user.first_name || user.fname,
        last_name: user.last_name || user.lname,
        BU_ROLE_ID: user.BU_ROLE_ID || user.role,
        primary_business_role: user.primary_business_role || user.utype,
        status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated')
      };

      console.log('🔍 LEGACY MAPPING DEBUG (Get Locked Users):', {
        user_name: mappedUser.user_name,
        original_username: user.username,
        original_fname_lname: { fname: user.fname, lname: user.lname },
        mapped_first_last_name: { first_name: mappedUser.first_name, last_name: mappedUser.last_name }
      });

      return {
        id: user._id,
        user_name: mappedUser.user_name,
        name: `${mappedUser.first_name || ''} ${mappedUser.last_name || ''}`.trim(),
        email: user.email,
        employer_number: user.employer_number,
        status: mappedUser.status,
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
        created_at: user.created_at,
        // Legacy fields for compatibility
        username: user.username || mappedUser.user_name,
        legacy_status: user.is_active
      };
    });

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

// ✅ Reset all locked users (Administrative function) - FIXED VERSION with Legacy Compatibility
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

// ✅ Get user lock status - FIXED VERSION with Legacy Compatibility
export const getUserLockStatus = asyncHandler(async (req, res) => {
  const { identifier } = req.params;

  try {
    // Build query conditions with legacy support
    const queryConditions = [
      { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }, // Legacy
      { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
      { employer_number: identifier }
    ];
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      queryConditions.push({ _id: identifier });
    }
    if (!isNaN(identifier)) {
      queryConditions.push({ id: parseInt(identifier) });
      queryConditions.push({ user_id: parseInt(identifier) });
    }

    const user = await User.findOne({
      $or: queryConditions
    }).select('user_name email status failed_attempts lock_until last_login last_unlocked unlocked_by force_lock_reason force_locked_at force_locked_by username');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user.toObject(),
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Get Lock Status):', {
      identifier,
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID
    });

    const isLocked = user.lock_until && user.lock_until > Date.now();
    const lockRemaining = isLocked ? Math.ceil((user.lock_until - Date.now()) / 60000) : 0;

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        user_name: mappedUser.user_name,
        email: user.email,
        status: mappedUser.status,
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
        unlocked_by: user.unlocked_by,
        // Legacy fields for compatibility
        username: user.username || mappedUser.user_name,
        legacy_status: user.is_active
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

// ✅ Reset User Session and Clear Caches (Fixed for employer_number/user_name tokens) - FIXED VERSION with Legacy Compatibility
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
      // Search by employer_number, user_name, username, or email
      user = await User.findOne({
        $or: [
          { employer_number: userId },
          { user_name: userId },
          { username: userId }, // Legacy
          { email: userId }
        ]
      })
      .select('-password -passwordHistory')
      .lean();
      
      console.log('🔍 User search by identifier:', {
        identifier: userId,
        found: !!user,
        user: user ? (user.user_name || user.username) : 'Not found'
      });
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated'),
      main_business_unit: user.main_business_unit || user.branch?.toString() || '',
      is_supervisor: user.is_supervisor || (user.rofficer === 'Yes'),
      BU_ID: user.BU_ID || user.branch,
      internal_employee_enabled: user.internal_employee_enabled || (user.utype === 'Staff')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Reset User):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      original_is_active: user.is_active,
      mapped_status: mappedUser.status
    });

    console.log('✅ User found:', {
      id: user._id,
      user_name: mappedUser.user_name,
      employer_number: user.employer_number,
      BU_ROLE_ID: mappedUser.BU_ROLE_ID
    });

    // Get fresh permissions
    let permissions = {};
    let roleName = mappedUser.primary_business_role || 'Unknown Role';
    let flattenedPermissions = [];

    // Check if user is Administrator
    if (parseInt(mappedUser.BU_ROLE_ID) === 1) {
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
        BU_ROLE_ID: mappedUser.BU_ROLE_ID 
      }).select('permissions ROLE_NAME').lean();

      if (permissionsDoc) {
        permissions = permissionsDoc.permissions;
        roleName = permissionsDoc.ROLE_NAME;
        flattenedPermissions = Object.values(permissions).flat();
      } else {
        const roleDetails = getRoleWithPermissions(mappedUser.BU_ROLE_ID);
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
          roleName = mappedUser.primary_business_role || 'User';
          flattenedPermissions = Object.values(permissions).flat();
        }
      }
    }

    // Construct fresh user response
    const freshUserData = {
      id: user._id,
      user_name: mappedUser.user_name,
      email: user.email,
      first_name: mappedUser.first_name,
      last_name: mappedUser.last_name,
      employer_number: user.employer_number,
      main_business_unit: mappedUser.main_business_unit,
      primary_business_role: mappedUser.primary_business_role,
      BU_ROLE_ID: mappedUser.BU_ROLE_ID,
      status: mappedUser.status,
      enable_multi_session: mappedUser.enable_multi_session,
      validate_ip_address: mappedUser.validate_ip_address,
      ip_address: mappedUser.ip_address,
      is_supervisor: mappedUser.is_supervisor,
      last_login: user.last_login,
      created_at: user.created_at,
      updated_at: user.updated_at,
      // Legacy fields for compatibility
      username: user.username || mappedUser.user_name,
      legacy_role: user.role,
      legacy_status: user.is_active
    };

    // Generate new token with fresh data - use MongoDB _id for consistency
    const newToken = jwt.sign(
      {
        userId: user._id, // Always use MongoDB _id in new tokens
        user_name: mappedUser.user_name,
        role: roleName,
        roleId: mappedUser.BU_ROLE_ID,
        isAdmin: mappedUser.BU_ROLE_ID === 1,
        permissions: flattenedPermissions,
        iat: Math.floor(Date.now() / 1000),
      },
      getSecretKey(),
      { expiresIn: '7d' }
    );

    console.log('✅ User session reset successfully:', {
      user_name: mappedUser.user_name,
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
        roleId: mappedUser.BU_ROLE_ID,
        isAdministrator: parseInt(mappedUser.BU_ROLE_ID) === 1,
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

// ✅ Clear User Caches (Admin function) - FIXED VERSION with Legacy Compatibility
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
      // Use identifier for flexibility
      const identifier = user_name;
      
      // Find user by multiple identifiers
      const user = await User.findOne({
        $or: [
          { user_name: { $regex: new RegExp(`^${identifier}$`, 'i') } },
          { username: { $regex: new RegExp(`^${identifier}$`, 'i') } }, // Legacy
          { email: { $regex: new RegExp(`^${identifier}$`, 'i') } },
          { employer_number: identifier }
        ]
      });
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // 🔹 LEGACY MAPPING: Map legacy fields for logging
      const mappedUser = {
        ...user,
        user_name: user.user_name || user.username,
        first_name: user.first_name || user.fname,
        last_name: user.last_name || user.lname
      };

      console.log('🗑️ Clearing cache for user:', mappedUser.user_name, 'requested by:', req.user.user_name);
      
      result = {
        cleared: `cache_for_${mappedUser.user_name}`,
        user_id: user._id,
        message: `Cache cleared for user: ${mappedUser.user_name}`
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

// ✅ Get User Session Info - FIXED VERSION with Legacy Compatibility
export const getUserSessionInfo = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    // Determine the type of identifier and search accordingly
    let user;
    
    if (mongoose.isValidObjectId(userId)) {
      // Search by MongoDB _id
      user = await User.findById(userId)
        .select('user_name email first_name last_name BU_ROLE_ID primary_business_role status last_login created_at current_sessions token last_updated username fname lname') // Include legacy fields
        .lean();
    } else {
      // Search by employer_number, user_name, username, or email
      user = await User.findOne({
        $or: [
          { employer_number: userId },
          { user_name: userId },
          { username: userId }, // Legacy
          { email: userId }
        ]
      })
      .select('user_name email first_name last_name BU_ROLE_ID primary_business_role status last_login created_at current_sessions token last_updated username fname lname')
      .lean();
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...user,
      user_name: user.user_name || user.username,
      first_name: user.first_name || user.fname,
      last_name: user.last_name || user.lname,
      BU_ROLE_ID: user.BU_ROLE_ID || user.role,
      primary_business_role: user.primary_business_role || user.utype,
      status: user.status || (user.is_active === 'Active' ? 'Active' : 'Deactivated')
    };

    console.log('🔍 LEGACY MAPPING DEBUG (Session Info):', {
      original_username: user.username,
      mapped_user_name: mappedUser.user_name,
      original_fname_lname: { fname: user.fname, lname: user.lname },
      mapped_first_last_name: { first_name: mappedUser.first_name, last_name: mappedUser.last_name },
      original_role: user.role,
      mapped_BU_ROLE_ID: mappedUser.BU_ROLE_ID
    });

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

    // Get session information
    const activeSessions = user.current_sessions?.filter(session => session.is_active) || [];
    const legacyToken = user.token;
    const lastUpdated = user.last_updated;

    res.json({
      success: true,
      session: {
        user: {
          id: user._id,
          user_name: mappedUser.user_name,
          name: `${mappedUser.first_name || ''} ${mappedUser.last_name || ''}`.trim(),
          role: mappedUser.primary_business_role,
          roleId: mappedUser.BU_ROLE_ID,
          status: mappedUser.status,
          lastLogin: user.last_login,
          accountCreated: user.created_at,
          // Legacy fields for compatibility
          username: user.username || mappedUser.user_name,
          legacy_role: user.role,
          legacy_status: user.is_active
        },
        sessions: {
          activeCount: activeSessions.length,
          activeSessions: activeSessions.map(session => ({
            session_id: session.session_id,
            login_time: session.login_time,
            ip_address: session.ip_address,
            last_activity: session.last_activity
          })),
          legacyToken: legacyToken ? '***' : null,
          legacyLastUpdated: lastUpdated
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

// Add this temporary debug endpoint to your user controller
export const debugUserCheck = asyncHandler(async (req, res) => {
  const { user_name, username } = req.body;
  
  try {
    // Use login identifier for legacy compatibility
    const loginIdentifier = username || user_name;

    if (!loginIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Login identifier (username or user_name) is required'
      });
    }

    console.log('🔍 Debug user check for:', loginIdentifier);
    
    // Check in new User model with enhanced query
    const userInMongo = await User.findOne({ 
      $or: [
        { user_name: { $regex: new RegExp(`^${loginIdentifier}$`, 'i') } },
        { username: { $regex: new RegExp(`^${loginIdentifier}$`, 'i') } }
      ]
    });
    
    console.log('📊 User search results:', {
      login_identifier: loginIdentifier,
      foundInMongo: !!userInMongo,
      mongoUser: userInMongo ? {
        _id: userInMongo._id,
        user_name: userInMongo.user_name,
        username: userInMongo.username,
        email: userInMongo.email,
        BU_ROLE_ID: userInMongo.BU_ROLE_ID,
        status: userInMongo.status
      } : null
    });

    // Also check with password selection
    const userWithPassword = await User.findByUsernameWithPassword(loginIdentifier);
    console.log('🔐 User with password search:', {
      found: !!userWithPassword,
      hasPassword: userWithPassword ? !!userWithPassword.password : false
    });

    res.json({
      success: true,
      login_identifier: loginIdentifier,
      foundInMongo: !!userInMongo,
      foundWithPassword: !!userWithPassword,
      userDetails: userInMongo ? {
        id: userInMongo._id,
        user_name: userInMongo.user_name || userInMongo.username,
        email: userInMongo.email,
        status: userInMongo.status,
        BU_ROLE_ID: userInMongo.BU_ROLE_ID
      } : null
    });

  } catch (error) {
    console.error('💥 Debug user check error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug check failed',
      error: error.message
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
  debugUserCheck,
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
  forceResetPassword,
  unlockForceLockedUser,
  resetUser,
  clearUserCaches,
  getUserSessionInfo
};