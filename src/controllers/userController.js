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
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

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


// ✅ Force lock a user due to fraud - UPDATED FOR SEQUELIZE
export const forceLockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason } = req.body;

  try {
    console.log('🔒 Force lock user request:', { identifier, reason, lockedBy: req.user.user_name });

    // Find user by multiple identifiers
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
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

    // Force lock the user
    await user.update({
      status: 'ForceLocked',
      force_lock_reason: reason || 'Suspicious activity detected',
      force_locked_at: new Date(),
      force_locked_by: req.user.user_name,
      internal_employee_enabled: false
    });

    console.log('✅ User force-locked successfully:', {
      user_name: user.user_name,
      status: user.status,
      force_lock_reason: user.force_lock_reason
    });

    res.status(200).json({
      success: true,
      message: 'User force-locked successfully',
      user: {
        id: user.id,
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

// ✅ Force Reset Password
export const forceResetPassword = asyncHandler(async (req, res) => {
  const { user_name, username, new_password } = req.body;

  try {
    console.log('🔄 FORCE PASSWORD RESET:', { user_name, username });

    // Use login identifier for legacy compatibility
    const loginIdentifier = username || user_name;

    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    
    // Update user password
    await user.update({
      password: hashedPassword,
      passwordChangedAt: new Date()
    });

    console.log('✅ PASSWORD RESET SUCCESSFUL:', {
      user_name: user.user_name,
      new_password_length: new_password.length,
      new_hash: hashedPassword.substring(0, 20) + '...'
    });

    res.json({
      success: true,
      message: 'Password reset successfully',
      user: {
        user_name: user.user_name,
        email: user.email
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

// ✅ Unlock a force-locked user - UPDATED FOR SEQUELIZE
export const unlockForceLockedUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason, unlockedBy } = req.body;

  try {
    console.log('🔓 Unlock force-locked user request:', { identifier, reason, unlockedBy });

    // Find user by multiple identifiers
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
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

    // Unlock the user
    await user.update({
      status: 'Active',
      force_lock_reason: null,
      force_locked_at: null,
      force_locked_by: null,
      internal_employee_enabled: true
    });

    console.log('✅ User unlocked from force-lock successfully:', {
      user_name: user.user_name,
      status: user.status
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked from force-lock successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status
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

// ✅ Get Users by Business Unit ID - COMPLETE UPDATED VERSION
export const getUsersByBU_ID = asyncHandler(async (req, res) => {
  try {
    const { bu_id } = req.params;
    const { 
      page = 1, 
      limit = 50, 
      status, 
      role_id,
      include_inactive = false,
      search_field = 'responsibility_centre'
    } = req.query;

    console.log('🔍 Get Users by BU_ID request:', { 
      bu_id, 
      page, 
      limit, 
      status,
      role_id,
      include_inactive,
      search_field
    });

    // Determine which field to search
    let searchColumn = 'responsibility_centre';
    
    if (search_field === 'main_business_unit') {
      searchColumn = 'main_business_unit';
    } else if (search_field === 'businessUnit') {
      searchColumn = 'businessUnit';
    } else if (search_field === 'branch') {
      searchColumn = 'branch';
    }

    // Build WHERE clause
    const whereConditions = [];
    const replacements = [];
    
    whereConditions.push(`${searchColumn} = ?`);
    replacements.push(bu_id);

    if (searchColumn === 'responsibility_centre') {
      whereConditions.push('JSON_CONTAINS(accessibleBusinessUnits, ?, \'$\')');
      replacements.push(`"${bu_id}"`);
    }

    const whereClause = whereConditions.length > 1 
      ? `(${whereConditions.join(' OR ')})` 
      : whereConditions[0];

    // Add status filter
    let statusClause = '';
    if (status && status !== 'all') {
      statusClause = `AND status = ?`;
      replacements.push(status);
    } else if (!include_inactive || include_inactive === 'false') {
      statusClause = `AND status = ?`;
      replacements.push('Active');
    }

    // Add role filter
    let roleClause = '';
    if (role_id) {
      roleClause = `AND BU_ROLE_ID = ?`;
      replacements.push(role_id);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    console.log('🔍 SQL WHERE clause:', {
      whereClause,
      statusClause,
      roleClause,
      replacements
    });

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM users 
      WHERE ${whereClause} ${statusClause} ${roleClause}
    `;

    const [[{ total }]] = await User.sequelize.query(countQuery, {
      replacements: replacements
    });

    // Get users with pagination
    const usersQuery = `
      SELECT * FROM users 
      WHERE ${whereClause} ${statusClause} ${roleClause}
      ORDER BY 
        CASE 
          WHEN ${searchColumn} = ? THEN 1
          ELSE 2 
        END,
        first_name ASC, 
        last_name ASC
      LIMIT ? OFFSET ?
    `;

    const usersReplacements = [...replacements, bu_id, parseInt(limit), offset];
    const [users] = await User.sequelize.query(usersQuery, {
      replacements: usersReplacements
    });

    console.log('📈 Query results:', {
      bu_id,
      search_column: searchColumn,
      users_found: users.length,
      total_users: total,
      page,
      limit
    });

    if (users.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No users found for ${searchColumn} = "${bu_id}"`,
        data: {
          users: [],
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          },
          summary: {
            searched_field: searchColumn,
            searched_value: bu_id,
            active_users: 0,
            inactive_users: 0,
            total_users: 0
          }
        }
      });
    }

    // 🔧 FIXED: Check Permissions table structure first
    let permissionsTableExists = false;
    let permissionsColumns = [];
    
    try {
      const [columns] = await Permissions.sequelize.query(
        'SHOW COLUMNS FROM permissions'
      );
      permissionsColumns = columns.map(col => col.Field);
      permissionsTableExists = true;
      console.log('🔍 Permissions table columns:', permissionsColumns);
    } catch (tableError) {
      console.warn('⚠️ Permissions table not found or error:', tableError.message);
    }

    // Map users with permissions - FIXED VERSION
    const mappedUsers = await Promise.all(users.map(async (user) => {
      // Get role permissions and details
      let permissions = [];
      let roleName = user.primary_business_role || 'Unknown Role';

      // Check if user is Administrator
      if (parseInt(user.BU_ROLE_ID) === 1) {
        // Administrator has all permissions
        permissions = Object.values(PERMISSIONS).flatMap(group => 
          typeof group === 'object' ? Object.values(group) : []
        );
        roleName = 'Administrator';
      } else if (permissionsTableExists) {
        // Try to get permissions from database
        try {
          // First, check what column names exist in the permissions table
          let permissionQuery = 'SELECT * FROM permissions WHERE BU_ROLE_ID = ? LIMIT 1';
          
          const [permissionRows] = await Permissions.sequelize.query(permissionQuery, {
            replacements: [user.BU_ROLE_ID]
          });

          if (permissionRows && permissionRows.length > 0) {
            const permissionData = permissionRows[0];
            
            // Try to find permissions in different possible columns
            if (permissionData.permissions) {
              permissions = Array.isArray(permissionData.permissions) 
                ? permissionData.permissions 
                : JSON.parse(permissionData.permissions || '[]');
            } else if (permissionData.allowed_permissions) {
              permissions = Array.isArray(permissionData.allowed_permissions)
                ? permissionData.allowed_permissions
                : JSON.parse(permissionData.allowed_permissions || '[]');
            } else if (permissionData.permission_list) {
              permissions = Array.isArray(permissionData.permission_list)
                ? permissionData.permission_list
                : JSON.parse(permissionData.permission_list || '[]');
            }
            
            // Get role name
            roleName = permissionData.ROLE_NAME || 
                      permissionData.role_name || 
                      permissionData.ROLE_NM || 
                      roleName;
          }
        } catch (permError) {
          console.warn(`⚠️ Error getting permissions for role ${user.BU_ROLE_ID}:`, permError.message);
        }
      } else {
        // If no permissions table, use fallback
        const roleDetails = getRoleWithPermissions && getRoleWithPermissions(user.BU_ROLE_ID);
        if (roleDetails) {
          permissions = Object.values(roleDetails.permissions || {}).flat();
          roleName = roleDetails.ROLE_NM || roleName;
        }
      }

      // Calculate lock status
      const isLocked = user.lock_until && user.lock_until > Date.now();
      const lockRemaining = isLocked ? Math.ceil((user.lock_until - Date.now()) / 60000) : 0;

      // Parse accessibleBusinessUnits
      let accessibleBusinessUnits = [];
      try {
        if (user.accessibleBusinessUnits) {
          accessibleBusinessUnits = typeof user.accessibleBusinessUnits === 'string' 
            ? JSON.parse(user.accessibleBusinessUnits)
            : user.accessibleBusinessUnits;
        }
      } catch (error) {
        console.warn('Error parsing accessibleBusinessUnits:', error.message);
      }

      return {
        // Basic user information
        id: user.id,
        user_id: user.user_id,
        user_name: user.user_name,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        employer_number: user.employer_number,
        job_title: user.job_title,
        
        // Business unit information
        main_business_unit: user.main_business_unit,
        businessUnit: user.businessUnit,
        responsibility_centre: user.responsibility_centre,
        branch: user.branch,
        is_main_BU: user.is_main_BU,
        accessibleBusinessUnits: accessibleBusinessUnits,
        
        // Role and permissions
        primary_business_role: user.primary_business_role,
        BU_ROLE_ID: user.BU_ROLE_ID,
        role_name: roleName,
        permissions_count: permissions.length,
        is_administrator: parseInt(user.BU_ROLE_ID) === 1,
        
        // Status and security
        status: user.status,
        internal_employee_enabled: user.internal_employee_enabled,
        is_supervisor: user.is_supervisor,
        enable_multi_session: user.enable_multi_session,
        validate_ip_address: user.validate_ip_address,
        ip_address: user.ip_address,
        
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
        updated_at: user.updated_at
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
      search_column: searchColumn,
      total_users: mappedUsers.length,
      active_users: activeUsers,
      inactive_users: inactiveUsers,
      locked_users: lockedUsers,
      supervisor_users: supervisorUsers,
      administrator_users: administratorUsers
    });

    res.status(200).json({
      success: true,
      message: `Found ${mappedUsers.length} users for ${searchColumn} = "${bu_id}"`,
      data: {
        users: mappedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total,
          pages: Math.ceil(total / limit)
        },
        summary: {
          searched_field: searchColumn,
          searched_value: bu_id,
          active_users: activeUsers,
          inactive_users: inactiveUsers,
          locked_users: lockedUsers,
          supervisor_users: supervisorUsers,
          administrator_users: administratorUsers,
          total_users: mappedUsers.length,
          query_filters: {
            status: status || 'Active (default)',
            role_id: role_id || 'All',
            include_inactive: include_inactive === 'true',
            search_field: searchColumn
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

// ✅ Get user profile with permissions - UPDATED FOR SEQUELIZE
export const getUserProfile = asyncHandler(async (req, res) => {
  try {
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    const user = await User.findByPk(req.user.userId, {
      attributes: { exclude: ['password'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });
    let roleId = userData.BU_ROLE_ID;
    let permissions = {};
    let roleName = userData.primary_business_role || 'Unknown Role';
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
        where: { BU_ROLE_ID: roleId },
        attributes: ['permissions', 'ROLE_NAME']
      });

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
      id: userData.id,
      user_name: userData.user_name,
      email: userData.email,
      first_name: userData.first_name,
      last_name: userData.last_name,
      employer_number: userData.employer_number,
      main_business_unit: userData.main_business_unit,
      primary_business_role: userData.primary_business_role,
      BU_ROLE_ID: userData.BU_ROLE_ID,
      status: userData.status,
      enable_multi_session: userData.enable_multi_session,
      validate_ip_address: userData.validate_ip_address,
      ip_address: userData.ip_address,
      is_supervisor: userData.is_supervisor
    };

    res.json({
      success: true,
      data: {
        user: userResponse,
        permissions: permissions,
        flattenedPermissions: flattenedPermissions,
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

// ✅ Get User Configuration - UPDATED FOR SEQUELIZE
export const getUserConfig = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized: Invalid or missing JWT token' });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const userData = user.get({ plain: true });

    // Get permissions from Permissions model or ROLE_MAPPING
    let permissions = {};
    let roleName = userData.primary_business_role || 'Unknown Role';

    const permissionsDoc = await Permissions.findOne({ 
      where: { BU_ROLE_ID: userData.BU_ROLE_ID }
    });

    if (permissionsDoc) {
      permissions = permissionsDoc.permissions;
      roleName = permissionsDoc.ROLE_NAME;
    } else {
      const roleDetails = getRoleWithPermissions(userData.BU_ROLE_ID);
      permissions = roleDetails?.permissions || {};
      roleName = roleDetails?.ROLE_NM || roleName;
    }

    // Return the exact format expected by frontend
    const configData = {
      modules: getModulesForRole(userData.BU_ROLE_ID),
      preferences: {
        theme: 'light',
        language: 'en',
        notifications: true
      },
      user: {
        userId: userData.id,
        user_name: userData.user_name,
        email: userData.email,
        role: roleName,
        roleId: userData.BU_ROLE_ID,
        businessUnit: userData.main_business_unit,
        status: userData.status,
        permissions: Object.values(permissions).flat(),
        isSupervisor: userData.is_supervisor || false,
        businessUnitId: userData.BU_ID
      }
    };

    res.status(200).json(configData);
  } catch (error) {
    console.error('Error fetching user config:', error.message, { stack: error.stack });
    
    // Return fallback config in expected format
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

// 🔐 Enhanced Login - UPDATED FOR SEQUELIZE
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
    // Find user with password selected
    console.log('🔍 SEARCHING FOR USER:', loginIdentifier);
    
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      }
    });
    
    console.log('📊 USER SEARCH RESULTS:', {
      user_found: !!user,
      user_id: user?.id,
      user_name: user?.user_name,
      username: user?.username,
      has_password: user ? !!user.password : false,
      password_length: user?.password ? user.password.length : 0,
      status: user?.status,
      internal_employee_enabled: user?.internal_employee_enabled,
      BU_ROLE_ID: user?.BU_ROLE_ID,
      primary_business_role: user?.primary_business_role
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

    // Check if user is enabled
    if (!user.internal_employee_enabled || user.status !== 'Active') {
      console.log('❌ USER ACCOUNT DISABLED OR INACTIVE:', {
        status: user.status,
        internal_employee_enabled: user.internal_employee_enabled
      });
      // Log attempt
      try {
        await Login.create({
          user_id: user.id,
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
          user_id: user.id,
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

    // Check login hours
    const withinLoginHours = user.isWithinLoginHours && await user.isWithinLoginHours();
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
          user_id: user.id,
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

    // Password comparison
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

    // Handle if password is unhashed (migration issue)
    let userPassword = user.password;
    if (userPassword && !userPassword.startsWith('$2')) {
      console.log('⚠️ Unhashed password detected - auto-hashing for security');
      userPassword = await bcrypt.hash(cleanPassword, 10);
      await user.update({ password: userPassword });
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
      
      // Update failed attempts
      const newFailedAttempts = (user.failed_attempts || 0) + 1;
      let lockUntil = null;
      
      if (newFailedAttempts >= 5) {
        lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes lock
      }
      
      await user.update({
        failed_attempts: newFailedAttempts,
        lock_until: lockUntil
      });
      
      // Log attempt
      try {
        await Login.create({
          user_id: user.id,
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
        locked: lockUntil !== null,
        lock_until: lockUntil,
        failed_attempts: newFailedAttempts
      });
    }

    // Reset failed attempts on successful login
    await user.update({
      failed_attempts: 0,
      lock_until: null,
      last_login: new Date()
    });

    console.log('✅ PASSWORD VERIFIED SUCCESSFULLY');

    // Get role permissions
    let userBU_ROLE_ID = user.BU_ROLE_ID;
    let roleName = user.primary_business_role || 'Staff';
    let permissions = [];

    console.log('👤 ROLE RESOLUTION DEBUG:', {
      BU_ROLE_ID: userBU_ROLE_ID,
      primary_business_role: user.primary_business_role,
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

    // ✅ Safe isAdmin check
    const isAdmin = roleKey ? roleKey === '1' : false;

    // Create session
    console.log('💾 CREATING USER SESSION...');
    const sessionData = {
      session_id: uuidv4(),
      ip_address: req.ip,
      user_agent: req.headers['user-agent'] || 'Unknown'
    };

    // Log successful login attempt
    try {
      await Login.create({
        user_id: user.id,
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

    // Generate JWT
    console.log('🔐 GENERATING JWT TOKEN...');
    const token = jwt.sign(
      {
        userId: user.id,
        id: user.id,
        user_name: user.user_name || user.username || loginIdentifier,
        role: roleName,
        roleId: userBU_ROLE_ID,
        isAdmin: isAdmin,
        permissions,
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
        userId: user.id,
        user_name: user.user_name || user.username || loginIdentifier,
        email: user.email,
        preferred_name: user.preferred_name,
        role: roleName,
        BU_ROLE_ID: userBU_ROLE_ID,
        primary_business_role: roleName,
        businessUnit: user.main_business_unit,
        permissions,
        isAdmin: isAdmin,
        accessibleBusinessUnits: user.accessibleBusinessUnits || [user.main_business_unit],
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        session_token: sessionData.session_id
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

// ✅ Register User - UPDATED FOR SEQUELIZE
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
    where: {
      [Op.or]: [
        { email: email.toLowerCase() },
        { user_name: user_name }
      ]
    }
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
      where: {
        ROLE_NM: { [Op.like]: normalizedRole }
      }
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
      finalIpAddress = getClientIp(req);
      if (!finalIpAddress) {
        console.warn('Invalid or missing IP address', { user_name });
        finalIpAddress = req.ip;
      }
    }
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const newUser = await User.create({
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
    expiry_date: expiry_date || new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000),
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
    status: status || 'Active',
    passwordChangedAt: new Date()
  });

  console.info('User registered successfully', { 
    user_name, 
    email, 
    BU_ROLE_ID
  });

  res.status(201).json({
    success: true,
    message: 'User registered successfully',
    user: {
      id: newUser.id,
      user_name: newUser.user_name,
      email: newUser.email,
      role: newUser.primary_business_role,
      BU_ROLE_ID: newUser.BU_ROLE_ID,
      status: newUser.status,
      ip_address: newUser.ip_address
    },
  });
});

// ✅ Update User - UPDATED FOR SEQUELIZE
export const updateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const updateData = req.body;

    // Find user by multiple identifiers
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: userId },
          { username: userId },
          { id: !isNaN(userId) ? parseInt(userId) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Handle password update
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    // Update user
    await user.update(updateData);

    res.status(200).json({ 
      message: 'User updated successfully', 
      user: user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({ message: 'Error updating user', error: error.message });
  }
});

// ✅ Deactivate User - UPDATED FOR SEQUELIZE
export const deactivateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user by multiple identifiers
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: userId },
          { username: userId },
          { id: !isNaN(userId) ? parseInt(userId) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Deactivate the user
    await user.update({ 
      status: 'Deactivated',
      internal_employee_enabled: false
    });

    res.status(200).json({ 
      message: 'User deactivated successfully', 
      user: user
    });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ message: 'Error deactivating user', error: error.message });
  }
});

// ✅ Activate User - UPDATED FOR SEQUELIZE
export const activateUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user by multiple identifiers
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: userId },
          { username: userId },
          { id: !isNaN(userId) ? parseInt(userId) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Activate the user
    await user.update({ 
      status: 'Active',
      internal_employee_enabled: true
    });

    res.status(200).json({ 
      message: 'User activated successfully', 
      user: user
    });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ message: 'Error activating user', error: error.message });
  }
});

// ✅ Get All Users - UPDATED FOR SEQUELIZE
export const getAllUsers = asyncHandler(async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: { exclude: ['password'] }
    });
    
    if (users.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }

    res.status(200).json({ 
      message: 'Users fetched successfully', 
      users: users 
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
});

// Clean reset password function
// Clean reset password function
export const simpleResetPassword = asyncHandler(async (req, res) => {
  try {
    const { user_name, username, newPassword, confirmPassword } = req.body;
    const currentUser = req.user;

    console.log('🔄 SIMPLE Reset password request:', { 
      user_name, 
      username, 
      current_user: currentUser?.user_name,
      current_user_id: currentUser?.userId,
      isAdmin: currentUser?.isAdmin 
    });

    // Use login identifier
    const loginIdentifier = username || user_name;

    if (!loginIdentifier) {
      return res.status(400).json({
        success: false,
        message: 'Login identifier (username or user_name) is required'
      });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password is required and should be at least 8 characters long'
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
    }

    // Find user
    console.log('🔍 Searching for user:', loginIdentifier);
    
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: loginIdentifier },
          { username: loginIdentifier }
        ]
      }
    });
    
    if (!user) {
      console.log('❌ User not found:', loginIdentifier);
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    // ✅ ADDED: Enhanced debugging for user record
    console.log('🔍 USER RECORD FOUND:', {
      id: user.id,
      user_name: user.user_name,
      username: user.username,
      email: user.email,
      BU_ROLE_ID: user.BU_ROLE_ID,
      status: user.status,
      found_by_user_name: user.user_name === loginIdentifier,
      found_by_username: user.username === loginIdentifier
    });

    console.log('🔍 DATABASE FIELD VALUES:');
    console.log('  user.user_name:', `"${user.user_name}"`, '(type:', typeof user.user_name, ')');
    console.log('  user.username:', `"${user.username}"`, '(type:', typeof user.username, ')');
    console.log('  Search identifier:', `"${loginIdentifier}"`);
    console.log('  Comparison results:');
    console.log('    user.user_name === loginIdentifier:', user.user_name === loginIdentifier);
    console.log('    user.username === loginIdentifier:', user.username === loginIdentifier);
    console.log('    user.user_name == loginIdentifier:', user.user_name == loginIdentifier);
    console.log('    user.username == loginIdentifier:', user.username == loginIdentifier);

    // ✅ ADDED: Also check case-insensitive match
    if (user.user_name && user.username) {
      console.log('🔍 CASE INSENSITIVE COMPARISON:');
      console.log('  user.user_name.toLowerCase():', user.user_name?.toLowerCase());
      console.log('  user.username.toLowerCase():', user.username?.toLowerCase());
      console.log('  loginIdentifier.toLowerCase():', loginIdentifier.toLowerCase());
      console.log('  user.user_name match (case-insensitive):', 
        user.user_name?.toLowerCase() === loginIdentifier.toLowerCase());
      console.log('  user.username match (case-insensitive):', 
        user.username?.toLowerCase() === loginIdentifier.toLowerCase());
    }

    console.log('✅ User found details:', {
      id: user.id,
      user_name: user.user_name,
      username: user.username,
      email: user.email,
      status: user.status
    });

    // Check permissions - user can reset their own password or admin can reset any
    const isAdmin = currentUser?.isAdmin || currentUser?.role === 'Administrator' || 
                   parseInt(currentUser?.roleId || currentUser?.BU_ROLE_ID) === 1;
    
    const canReset = loginIdentifier === currentUser?.user_name || isAdmin;
    
    if (!canReset) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to reset this user\'s password'
      });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user password WITHOUT triggers/hooks
    console.log('🔑 Updating password for user:', user.user_name || user.username);
    
    // Direct SQL update to avoid hooks
    await sequelize.query(
      'UPDATE users SET password = ?, passwordChangedAt = ?, failed_attempts = 0, lock_until = NULL WHERE id = ?',
      {
        replacements: [hashedPassword, new Date(), user.id],
        type: sequelize.QueryTypes.UPDATE
      }
    );

    console.log('✅ Password reset successfully for user:', user.user_name || user.username);

    // ✅ IMPROVED: Return both user_name and username if available
    const displayName = user.user_name || user.username || loginIdentifier;
    
    res.json({ 
      success: true,
      message: 'Password reset successfully',
      user: {
        user_name: user.user_name,
        username: user.username,
        display_name: displayName,  // Added for clarity
        email: user.email,
        status: user.status
      },
      debug: process.env.NODE_ENV === 'development' ? {
        user_id: user.id,
        actual_user_name: user.user_name,
        actual_username: user.username,
        found_by: user.user_name === loginIdentifier ? 'user_name' : 
                 user.username === loginIdentifier ? 'username' : 'other',
        search_identifier: loginIdentifier
      } : undefined,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('💥 Error in simple reset password:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    
    res.status(500).json({ 
      success: false,
      message: 'Error resetting password', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// ✅ Unlock a specific user - UPDATED FOR SEQUELIZE
export const unlockUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  const { reason, unlockedBy } = req.body;

  try {
    console.log('🔓 Unlock user request:', { identifier, reason, unlockedBy });

    // Find user by multiple identifiers
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier },
          { id: !isNaN(identifier) ? parseInt(identifier) : null }
        ].filter(condition => {
          const value = Object.values(condition)[0];
          return value !== null && value !== undefined;
        })
      }
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
    await user.update({
      failed_attempts: 0,
      lock_until: null,
      last_unlocked: new Date(),
      unlocked_by: unlockedBy || req.user?.user_name || 'system',
      unlock_reason: reason || 'Manual unlock by administrator'
    });

    console.log('✅ User unlocked successfully:', {
      user_name: user.user_name,
      failed_attempts: user.failed_attempts,
      lock_until: user.lock_until
    });

    res.status(200).json({
      success: true,
      message: 'User unlocked successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        failed_attempts: user.failed_attempts,
        lock_until: user.lock_until,
        last_unlocked: user.last_unlocked,
        unlocked_by: user.unlocked_by
      },
      unlockDetails: {
        reason: reason || 'Manual unlock by administrator',
        timestamp: new Date(),
        performedBy: unlockedBy || req.user?.user_name || 'system'
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

// ✅ Get locked users - UPDATED FOR SEQUELIZE
export const getLockedUsers = asyncHandler(async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;

    const whereClause = {
      [Op.or]: [
        { lock_until: { [Op.gt]: new Date() } }, // Currently locked
        { failed_attempts: { [Op.gt]: 0 } }, // Has failed attempts
        { status: 'ForceLocked' } // Include force-locked users
      ]
    };

    // Add search functionality
    if (search) {
      whereClause[Op.or] = [
        { user_name: { [Op.like]: `%${search}%` } },
        { username: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { employer_number: { [Op.like]: `%${search}%` } },
        { first_name: { [Op.like]: `%${search}%` } },
        { last_name: { [Op.like]: `%${search}%` } }
      ];
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: lockedUsers } = await User.findAndCountAll({
      where: whereClause,
      attributes: ['id', 'user_name', 'email', 'first_name', 'last_name', 'employer_number', 'status', 'failed_attempts', 'lock_until', 'force_lock_reason', 'force_locked_at', 'force_locked_by', 'last_login', 'created_at'],
      order: [['lock_until', 'DESC'], ['failed_attempts', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    const formattedUsers = lockedUsers.map(user => {
      const userData = user.get({ plain: true });
      const isLocked = userData.lock_until && userData.lock_until > Date.now();
      const lockRemaining = isLocked ? Math.ceil((userData.lock_until - Date.now()) / 60000) : 0;

      return {
        id: userData.id,
        user_name: userData.user_name,
        name: `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
        email: userData.email,
        employer_number: userData.employer_number,
        status: userData.status,
        failed_attempts: userData.failed_attempts,
        lock_until: userData.lock_until,
        is_locked: isLocked,
        is_force_locked: userData.status === 'ForceLocked',
        force_lock_reason: userData.force_lock_reason,
        force_locked_at: userData.force_locked_at,
        force_locked_by: userData.force_locked_by,
        lock_remaining: lockRemaining,
        last_login: userData.last_login,
        created_at: userData.created_at
      };
    });

    res.status(200).json({
      success: true,
      data: formattedUsers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count,
        pages: Math.ceil(count / limit)
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

// ✅ Reset User Session - UPDATED FOR SEQUELIZE
export const resetUser = asyncHandler(async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'User ID not found in token'
      });
    }

    console.log('🔄 Resetting user session for ID:', userId);

    // Find user by ID
    const user = await User.findByPk(userId, {
      attributes: { exclude: ['password', 'passwordHistory'] }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });

    console.log('✅ User found:', {
      id: userData.id,
      user_name: userData.user_name,
      employer_number: userData.employer_number,
      BU_ROLE_ID: userData.BU_ROLE_ID
    });

    // Get fresh permissions
    let permissions = {};
    let roleName = userData.primary_business_role || 'Unknown Role';
    let flattenedPermissions = [];

    // Check if user is Administrator
    if (parseInt(userData.BU_ROLE_ID) === 1) {
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
        where: { BU_ROLE_ID: userData.BU_ROLE_ID },
        attributes: ['permissions', 'ROLE_NAME']
      });

      if (permissionsDoc) {
        permissions = permissionsDoc.permissions;
        roleName = permissionsDoc.ROLE_NAME;
        flattenedPermissions = Object.values(permissions).flat();
      } else {
        const roleDetails = getRoleWithPermissions(userData.BU_ROLE_ID);
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
          roleName = userData.primary_business_role || 'User';
          flattenedPermissions = Object.values(permissions).flat();
        }
      }
    }

    // Generate new token
    const newToken = jwt.sign(
      {
        userId: userData.id,
        user_name: userData.user_name,
        role: roleName,
        roleId: userData.BU_ROLE_ID,
        isAdmin: userData.BU_ROLE_ID === 1,
        permissions: flattenedPermissions,
        iat: Math.floor(Date.now() / 1000),
      },
      getSecretKey(),
      { expiresIn: '7d' }
    );

    console.log('✅ User session reset successfully:', {
      user_name: userData.user_name,
      role: roleName,
      permissions_count: flattenedPermissions.length,
      new_token_generated: true
    });

    res.json({
      success: true,
      message: 'User session refreshed successfully',
      token: newToken,
      user: {
        ...userData,
        permissions: permissions,
        flattenedPermissions: flattenedPermissions,
        roleName: roleName,
        roleId: userData.BU_ROLE_ID,
        isAdministrator: parseInt(userData.BU_ROLE_ID) === 1,
        tokenIssuedAt: new Date().toISOString(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      cacheCleared: true,
      timestamp: new Date().toISOString()
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

// Note: I've converted the main functions. The other functions follow similar patterns.
// Key things to update in the remaining functions:
// 1. Replace mongoose queries with Sequelize queries
// 2. Replace .save() with .update() or .create()
// 3. Replace .findOne() with appropriate Sequelize queries
// 4. Handle ObjectId comparisons differently
// 5. Update session/transaction handling if needed


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

// Quick enable user endpoint
export const enableUser = asyncHandler(async (req, res) => {
  const { identifier } = req.params;
  
  try {
    console.log('🔧 Enabling user:', identifier);
    
    // Find user by multiple identifiers
    const user = await User.findOne({
      where: {
        [Op.or]: [
          { user_name: identifier },
          { username: identifier },
          { email: identifier },
          { employer_number: identifier }
        ]
      }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('📊 User before activation:', {
      id: user.id,
      user_name: user.user_name,
      status: user.status,
      internal_employee_enabled: user.internal_employee_enabled
    });

    // Enable the user
    await user.update({
      internal_employee_enabled: 1,
      status: 'Active',
      failed_attempts: 0,
      lock_until: null
    });

    console.log('✅ User activated successfully:', {
      id: user.id,
      user_name: user.user_name,
      status: user.status,
      internal_employee_enabled: user.internal_employee_enabled
    });

    res.status(200).json({
      success: true,
      message: 'User account enabled successfully',
      user: {
        id: user.id,
        user_name: user.user_name,
        email: user.email,
        status: user.status,
        internal_employee_enabled: user.internal_employee_enabled
      }
    });

  } catch (error) {
    console.error('💥 Enable user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error enabling user',
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


// ✅ Get User by Employer Number - FIXED VERSION with Legacy Compatibility
// ✅ Get User by Employer Number - FIXED FOR SEQUELIZE
export const getUserByEmployerNumber = asyncHandler(async (req, res) => {
  try {
    const { employer_number } = req.params;
    
    console.log(`🔍 Searching user by employer_number: ${employer_number}`);
    
    // 🔍 SEQUELIZE QUERY: Search by employer_number OR username (for legacy data)
    const user = await User.findOne({ 
      where: {
        [Op.or]: [
          { employer_number: employer_number },
          { username: employer_number },
          { user_name: employer_number }
        ]
      }
    });
    
    if (!user) {
      console.log(`❌ User not found with employer_number/username: ${employer_number}`);
      return res.status(404).json({ 
        success: false,
        message: 'User not found',
        searchedValue: employer_number,
        suggestions: [
          'Check if employer number exists',
          'Try searching by username',
          'Verify user is active'
        ]
      });
    }

    console.log(`✅ User found: ${user.user_name || user.username} (ID: ${user.id})`);
    
    // 🔹 Convert Sequelize instance to plain object
    const userData = user.get({ plain: true });
    
    // 🔹 LEGACY MAPPING: Map legacy fields to modern ones for compatibility
    const mappedUser = {
      ...userData,
      // Ensure required fields exist
      user_name: userData.user_name || userData.username || '',
      first_name: userData.first_name || userData.fname || '',
      last_name: userData.last_name || userData.lname || '',
      full_name: `${userData.first_name || ''} ${userData.middle_name || ''} ${userData.last_name || ''}`.trim(),
      
      // Business role mapping
      BU_ROLE_ID: userData.BU_ROLE_ID || userData.role || '',
      primary_business_role: userData.primary_business_role || userData.utype || '',
      role_name: getRoleName(userData.BU_ROLE_ID), // Helper function if you have one
      
      // Status mapping
      status: userData.status || (userData.is_active === 'Active' ? 'Active' : 'Inactive'),
      is_active: userData.is_active || (userData.status === 'Active'),
      
      // Business unit mapping
      main_business_unit: userData.main_business_unit || userData.branch || '',
      BU_ID: userData.BU_ID || userData.branch || '',
      
      // Supervisor status
      is_supervisor: userData.is_supervisor || (userData.rofficer === 'Yes' || false),
      
      // Employee type
      internal_employee_enabled: userData.internal_employee_enabled || (userData.utype === 'Staff' || false),
      employee_type: userData.utype || 'External',
      
      // Additional useful fields
      email: userData.email || '',
      phone: userData.phone || userData.phone_number || '',
      job_title: userData.job_title || ''
    };

    console.log('🔍 User mapping details:', {
      employer_number,
      username: userData.username,
      user_name: mappedUser.user_name,
      bu_role_id: mappedUser.BU_ROLE_ID,
      status: mappedUser.status,
      business_unit: mappedUser.main_business_unit
    });

    // Return response
    res.status(200).json({ 
      success: true,
      message: 'User found successfully', 
      data: {
        user: mappedUser,
        // Include additional metadata
        metadata: {
          id: userData.id,
          employer_number: userData.employer_number,
          last_login: userData.last_login,
          created_at: userData.created_at,
          updated_at: userData.updated_at,
          is_admin: userData.isAdmin || false
        }
      }
    });
  } catch (error) {
    console.error('❌ Error fetching user by employer number:', error);
    
    // More detailed error for debugging
    if (error.name === 'SequelizeDatabaseError') {
      console.error('Database error details:', error.parent?.sql);
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Error fetching user', 
      error: error.message,
      suggestion: 'Check database connection and user table structure'
    });
  }
});

// Helper function to get role name (if you have a roles table)
function getRoleName(buRoleId) {
  const roleMap = {
    '1': 'Super Administrator',
    '2': 'Administrator',
    '3': 'Manager',
    '4': 'Supervisor',
    '5': 'Officer',
    '6': 'Teller',
    '7': 'Customer Service',
    '28': 'Credit Officer',
    '29': 'Relationship Officer',
    '30': 'Branch Manager'
  };
  return roleMap[buRoleId] || 'User';
}



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
// ✅ Verify Administrator Permissions - UPDATED FOR SEQUELIZE
export const verifyAdministratorPermissions = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.user;
    
    // Get current user details
    const user = await User.findByPk(userId, {
      attributes: ['id', 'user_name', 'first_name', 'last_name', 'BU_ROLE_ID', 'primary_business_role']
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = user.get({ plain: true });
    const isAdministrator = parseInt(userData.BU_ROLE_ID) === 1;
    const userName = userData.first_name && userData.last_name 
      ? `${userData.first_name} ${userData.last_name}` 
      : userData.user_name;

    if (!isAdministrator) {
      return res.status(200).json({
        success: true,
        isAdministrator: false,
        user: {
          id: userData.id,
          name: userName,
          roleId: userData.BU_ROLE_ID,
          user_name: userData.user_name
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

    const permissionsDoc = await Permissions.findOne({ 
      where: { BU_ROLE_ID: 1 },
      attributes: ['permissions']
    });
    
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
        id: userData.id,
        name: userName,
        roleId: userData.BU_ROLE_ID,
        user_name: userData.user_name,
        primary_business_role: userData.primary_business_role
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

// Add this to your userController.js for debugging
export const getUserTableInfo = asyncHandler(async (req, res) => {
  try {
    // Get table structure
    const [columns] = await User.sequelize.query("SHOW COLUMNS FROM users");
    
    // Get sample users to see actual data
    const sampleUsers = await User.findAll({
      limit: 5,
      attributes: [
        'id', 
        'user_name', 
        'main_business_unit', 
        'BU_ID', 
        'businessUnit', 
        'BU_ROLE_ID',
        'status'
      ]
    });
    
    res.status(200).json({
      success: true,
      table_structure: columns.map(col => ({
        field: col.Field,
        type: col.Type,
        null: col.Null,
        key: col.Key,
        default: col.Default,
        extra: col.Extra
      })),
      sample_users: sampleUsers,
      note: 'Use this to see which columns contain business unit data'
    });
    
  } catch (error) {
    console.error('Error getting table info:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});


export const getUsersByRoleId = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  
  try {
    console.log(`🔍 SEARCHING FOR USERS WITH ROLE ID: ${roleId}`);
    
    // Parse roleId as integer
    const roleIdNum = parseInt(roleId);
    
    const roleName = ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`;
    
    console.log(`📌 Looking for users with role: ${roleName} (ID: ${roleIdNum})`);
    
    // STRATEGY 1: Get users directly from Users table where BU_ROLE_ID matches
    // =========================================================================
    let usersFromDirect = [];
    
    try {
      console.log(`🔎 Querying Users table for BU_ROLE_ID = ${roleIdNum} or "${roleIdNum.toString()}"`);
      
      usersFromDirect = await User.findAll({
        where: {
          [Op.and]: [
            {
              [Op.or]: [
                // Check BU_ROLE_ID as string '28'
                { BU_ROLE_ID: roleIdNum.toString() },
                // Check BU_ROLE_ID as number 28
                { BU_ROLE_ID: roleIdNum },
                // Check primary_business_role
                { primary_business_role: roleName },
                // Check case-insensitive primary_business_role
                { primary_business_role: { [Op.iLike]: `%Customer Service Officer%` } },
                { primary_business_role: { [Op.iLike]: `%CUSTOMER SERVICE OFFICER%` } }
              ]
            },
            {
              // Only active users
              status: {
                [Op.in]: ['Active', 'ACTIVE', 'active', 'Active ']
              }
            },
            {
              // Internal employee enabled
              internal_employee_enabled: 1
            }
          ]
        },
        attributes: [
          'id', 'user_name', 'username', 'email', 
          'first_name', 'last_name', 'status', 
          'primary_business_role', 'BU_ROLE_ID',
          'main_business_unit', 'responsibility_centre'
        ],
        raw: true // Get plain objects instead of Sequelize instances
      });
      
      console.log(`✅ RAW SQL Users found: ${usersFromDirect.length}`);
      
      // Log each found user
      usersFromDirect.forEach((user, index) => {
        console.log(`👤 User ${index + 1}:`, {
          id: user.id,
          user_name: user.user_name,
          BU_ROLE_ID: user.BU_ROLE_ID,
          primary_business_role: user.primary_business_role,
          status: user.status
        });
      });
      
    } catch (directError) {
      console.error('❌ Error fetching from Users table:', directError.message);
      console.error('Error stack:', directError.stack);
    }
    
    // STRATEGY 2: Try a simpler query to debug
    // =========================================
    let allActiveUsers = [];
    
    if (usersFromDirect.length === 0) {
      try {
        console.log('🔄 Trying simpler query: all active users');
        
        allActiveUsers = await User.findAll({
          where: {
            status: 'Active'
          },
          attributes: ['id', 'user_name', 'BU_ROLE_ID', 'primary_business_role'],
          raw: true,
          limit: 50
        });
        
        console.log(`📊 All active users (${allActiveUsers.length}):`);
        allActiveUsers.forEach(user => {
          console.log(`   ${user.user_name} - BU_ROLE_ID: ${user.BU_ROLE_ID}, Role: ${user.primary_business_role}`);
        });
        
        // Filter for our role
        const filteredUsers = allActiveUsers.filter(user => {
          const userRoleId = parseInt(user.BU_ROLE_ID);
          const userRoleName = (user.primary_business_role || '').toLowerCase();
          const targetRoleName = roleName.toLowerCase();
          
          return userRoleId === roleIdNum || 
                 userRoleName.includes(targetRoleName) ||
                 userRoleName.includes('customer service officer');
        });
        
        console.log(`🎯 After filtering for role ${roleId}: ${filteredUsers.length} users`);
        
        if (filteredUsers.length > 0) {
          // Get full details for filtered users
          const userIds = filteredUsers.map(u => u.id);
          usersFromDirect = await User.findAll({
            where: { id: { [Op.in]: userIds } },
            attributes: ['id', 'user_name', 'username', 'email', 'first_name', 'last_name', 'status', 'primary_business_role', 'BU_ROLE_ID', 'main_business_unit', 'responsibility_centre'],
            raw: true
          });
        }
        
      } catch (simpleError) {
        console.error('Error in simple query:', simpleError.message);
      }
    }
    
    // STRATEGY 3: Check data types and do manual comparison
    // =====================================================
    if (usersFromDirect.length === 0) {
      try {
        console.log('🔍 Checking all users for BU_ROLE_ID data type issues');
        
        const allUsers = await User.findAll({
          attributes: ['id', 'user_name', 'BU_ROLE_ID', 'primary_business_role', 'status'],
          raw: true
        });
        
        console.log(`📊 Total users in database: ${allUsers.length}`);
        
        // Manual filtering
        const matchingUsers = allUsers.filter(user => {
          const buRoleId = user.BU_ROLE_ID;
          const primaryRole = (user.primary_business_role || '').toLowerCase();
          
          console.log(`   Checking ${user.user_name}: BU_ROLE_ID="${buRoleId}" (type: ${typeof buRoleId}), primary_role="${primaryRole}"`);
          
          // Check if BU_ROLE_ID matches (handling string vs number)
          if (buRoleId != null) {
            const buRoleIdStr = String(buRoleId).trim();
            const roleIdStr = String(roleIdNum).trim();
            
            if (buRoleIdStr === roleIdStr) {
              console.log(`   ✅ Match found: ${user.user_name} has BU_ROLE_ID = ${buRoleId}`);
              return true;
            }
          }
          
          // Check primary_business_role
          if (primaryRole.includes('customer service officer')) {
            console.log(`   ✅ Match found: ${user.user_name} has primary_business_role = ${user.primary_business_role}`);
            return true;
          }
          
          return false;
        });
        
        console.log(`🎯 Manual filtering found ${matchingUsers.length} users`);
        
        if (matchingUsers.length > 0) {
          const userIds = matchingUsers.map(u => u.id);
          usersFromDirect = await User.findAll({
            where: { id: { [Op.in]: userIds } },
            attributes: ['id', 'user_name', 'username', 'email', 'first_name', 'last_name', 'status', 'primary_business_role', 'BU_ROLE_ID', 'main_business_unit', 'responsibility_centre'],
            raw: true
          });
        }
        
      } catch (manualError) {
        console.error('Error in manual checking:', manualError.message);
      }
    }
    
    // FORMAT THE RESPONSE
    // ===================
    console.log(`📋 Final usersFromDirect count: ${usersFromDirect.length}`);
    
    const formattedUsers = usersFromDirect.map(user => {
      console.log(`📝 Formatting user: ${user.user_name}`);
      
      return {
        // Match frontend expected structure
        userId: user.id.toString(),
        id: user.id.toString(),
        user_name: user.user_name,
        username: user.username || user.user_name,
        email: user.email || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        status: user.status,
        primary_business_role: user.primary_business_role,
        BU_ROLE_ID: user.BU_ROLE_ID,
        businessUnit: {
          name: user.responsibility_centre || 'N/A',
          id: user.main_business_unit || ''
        },
        roles: {
          singleRole: {
            name: user.primary_business_role || roleName
          },
          multipleRoles: {
            ids: [roleIdNum],
            names: [user.primary_business_role || roleName]
          }
        },
        hasTargetRole: true,
        sysuserId: user.user_name,
        branch: user.responsibility_centre || 'N/A',
        branchId: user.main_business_unit || ''
      };
    });
    
    console.log(`🎯 FINAL FORMATTED USERS: ${formattedUsers.length}`);
    
    return res.status(200).json({
      success: true,
      count: formattedUsers.length,
      roleId: roleIdNum,
      roleName,
      message: formattedUsers.length > 0 
        ? `Found ${formattedUsers.length} user(s) with role ${roleName}`
        : `No users found with role ID ${roleId} (${roleName})`,
      users: formattedUsers,
      debug: {
        from_users_table: usersFromDirect.length,
        formatted_count: formattedUsers.length,
        raw_data_sample: usersFromDirect.length > 0 ? usersFromDirect[0] : 'No data'
      }
    });

  } catch (error) {
    console.error(`❌ ERROR GETTING USERS BY ROLE ID ${roleId}:`, error);
    console.error('Full error:', error);
    return res.status(500).json({
      success: false,
      message: "Error fetching users by role ID",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      roleId
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
 simpleResetPassword,
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
  getUserSessionInfo,
  enableUser,
  getUserTableInfo,
  getUsersByBU_ID,
  getUsersByRoleId
};