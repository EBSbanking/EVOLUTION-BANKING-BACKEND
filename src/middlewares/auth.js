// src/middleware/auth.js - COMPLETE FIXED VERSION

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { Op } from 'sequelize';

// ✅ FIXED: Import from roleConstants
import { ROLES, ROLE_NAMES } from '../utils/roleConstants.js';

// ✅ FIXED: Import from roleMapping with default import
import roleMapping from '../constants/roleMapping.js';

// Extract what we need from roleMapping
const { ROLE_MAPPING, roleHasPermission } = roleMapping;

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// ==================== HELPER FUNCTIONS ====================
const getSecretKey = () => {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT_SECRET or JWT_SECRET_KEY not defined in .env file');
  }
  return secret;
};

// ==================== AUTHENTICATE MIDDLEWARE ====================
export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        details: 'Missing or invalid Authorization header. Use: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getSecretKey());
    console.log('🔍 Decoded token:', decoded);

    const userId = decoded.userId || decoded.id || decoded.user_id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        details: 'Token does not contain a user identifier',
      });
    }

    // Determine model's primary key column
    const primaryKey = User.primaryKeyAttribute || 'id';
    console.log(`🔍 Using primary key: ${primaryKey}`);

    // Try to find user with BusinessRole association
    let user = null;
    try {
      const BusinessRole = (await import('../models/BusinessRole.js')).default;
      
      user = await User.findOne({
        where: { [primaryKey]: userId },
        attributes: { 
          exclude: ['password'] 
        },
        include: [{
          model: BusinessRole,
          as: 'businessRole',
          attributes: [
            'BU_ID', 
            'ROLE_NM', 
            'ROLE_ID', 
            'BUSINESS_UNIT', 
            'SUPERVISOR_FG', 
            'ALLOW_TXN_POSTING_FG',
            'REC_ST'
          ]
        }]
      });
    } catch (assocError) {
      console.log('⚠️ BusinessRole association not available, falling back to direct query:', assocError.message);
      user = await User.findOne({
        where: { [primaryKey]: userId },
        attributes: { exclude: ['password'] }
      });
    }

    // Fallback if not found
    if (!user) {
      console.log(`⚠️ User not found with primary key '${primaryKey}', trying alternatives...`);
      user = await User.findOne({
        where: {
          [Op.or]: [
            { id: userId },
            { user_id: userId },
            { userId: userId }
          ]
        },
        attributes: { exclude: ['password'] }
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        details: 'The account associated with this token no longer exists',
      });
    }

    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Account deactivated',
        details: 'Your account has been deactivated. Contact administrator.',
      });
    }

    // Convert to plain object
    const userPlain = user.toJSON ? user.toJSON() : user;
    
    // Get BU_ID - try multiple sources
    let BU_ID = null;
    let businessRole = null;
    
    if (user.businessRole) {
      businessRole = user.businessRole;
      BU_ID = businessRole.BU_ID;
      console.log(`✅ Found BU_ID from business role: ${BU_ID}`);
    } else if (userPlain.BU_ROLE_ID) {
      console.log(`⚠️ Fetching business role manually for BU_ROLE_ID: ${userPlain.BU_ROLE_ID}`);
      try {
        const BusinessRole = (await import('../models/BusinessRole.js')).default;
        const br = await BusinessRole.findOne({
          where: { 
            ROLE_ID: userPlain.BU_ROLE_ID,
            REC_ST: 'Active'
          }
        });
        if (br) {
          BU_ID = br.BU_ID;
          businessRole = br;
          console.log(`✅ Found BU_ID from business role (manual): ${BU_ID}`);
        } else {
          console.log(`⚠️ No active business role found for ROLE_ID: ${userPlain.BU_ROLE_ID}`);
        }
      } catch (err) {
        console.log('⚠️ Could not fetch business role:', err.message);
      }
    }
    
    // Check if user is admin using ROLES constant
    const isAdmin = parseInt(userPlain.BU_ROLE_ID) === ROLES.ADMINISTRATOR || 
                    userPlain.roleId === ROLES.ADMINISTRATOR || 
                    userPlain.role_id === ROLES.ADMINISTRATOR ||
                    userPlain.primary_business_role === 'Administrator' ||
                    userPlain.role === 'Administrator' ||
                    userPlain.roleName === 'Administrator';
    
    if (isAdmin && !BU_ID) {
      BU_ID = 1;
      console.log(`✅ Admin user detected, setting BU_ID to 1`);
    }

    // Get role from multiple sources
    let roleId = parseInt(decoded.roleId) || 
                 parseInt(decoded.role_id) || 
                 parseInt(userPlain.role_id) || 
                 parseInt(userPlain.BU_ROLE_ID) ||
                 parseInt(userPlain.roleId);

    let roleName = decoded.role || 
                   decoded.roleName || 
                   decoded.role_name ||
                   userPlain.role || 
                   userPlain.roleName || 
                   userPlain.role_name || 
                   userPlain.primary_role || 
                   userPlain.primary_business_role || 
                   userPlain.ROLE_NM || 
                   'Staff';

    // If roleId is NaN but we have a role name, try to get ID from ROLE_MAPPING
    if (isNaN(roleId) && roleName) {
      const foundRole = Object.values(ROLE_MAPPING || {}).find(r => 
        r.ROLE_NM === roleName || 
        r.ROLE_NM?.toLowerCase() === roleName?.toLowerCase()
      );
      if (foundRole) {
        roleId = foundRole.id;
        console.log(`✅ Found role ID ${roleId} from role name ${roleName}`);
      }
    }

    // If roleId is valid but roleName is missing, get name from ROLE_MAPPING
    if (!isNaN(roleId) && !roleName) {
      const foundRole = ROLE_MAPPING ? ROLE_MAPPING[roleId] : null;
      if (foundRole) {
        roleName = foundRole.ROLE_NM;
        console.log(`✅ Found role name ${roleName} from role ID ${roleId}`);
      } else if (ROLE_NAMES[roleId]) {
        roleName = ROLE_NAMES[roleId];
        console.log(`✅ Found role name ${roleName} from ROLE_NAMES`);
      }
    }

    console.log(`🔍 User found: ${userPlain.user_name} (ID: ${userPlain.id || userPlain.user_id})`);
    console.log(`🔍 User Role ID: ${roleId}`);
    console.log(`🔍 User Role Name: ${roleName}`);
    console.log(`🔍 User BU_ID: ${BU_ID}`);
    console.log(`🔍 Is Admin: ${isAdmin}`);

    // Attach user to request
    req.user = {
      ...userPlain,
      roleId: roleId,
      roleName: roleName,
      BU_ID: BU_ID,
      businessRole: businessRole,
      isAdmin: isAdmin || roleId === ROLES.ADMINISTRATOR || roleName === 'Administrator',
      isSupervisor: businessRole?.SUPERVISOR_FG === 'Y' || false,
      canPostTransactions: businessRole?.ALLOW_TXN_POSTING_FG === 'Y' || false,
      userId: userPlain.id || userPlain.user_id || userId
    };

    console.log(`✅ Authenticated user: ${userPlain.user_name}, Role: ${roleName} (${roleId}), BU_ID: ${BU_ID}`);

    next();
  } catch (error) {
    console.error('❌ Authentication Error:', error);
    let status = 401;
    let message = 'Invalid token';

    if (error.name === 'TokenExpiredError') {
      status = 401;
      message = 'Token expired';
    } else if (error.name === 'JsonWebTokenError') {
      message = 'Malformed or invalid token';
    } else if (error.name === 'NotBeforeError') {
      message = 'Token not active yet';
    }

    return res.status(status).json({
      success: false,
      message,
      details: error.message,
    });
  }
};

// ==================== AUTHORIZE MIDDLEWARE ====================
// export const authorize = (...allowedRoles) => {
//   return (req, res, next) => {
//     // Get user role from request
//     const userRoleId = req.user?.roleId;
//     const userRoleName = req.user?.roleName || req.user?.role || req.user?.primary_role || req.user?.role_name || req.user?.primary_business_role;
    
//     console.log('🔍 ========== AUTHORIZE DEBUG ==========');
//     console.log('🔍 User Role ID:', userRoleId);
//     console.log('🔍 User Role Name:', userRoleName);
//     console.log('🔍 Allowed Roles:', allowedRoles);
    
//     // If no user, deny access
//     if (!req.user) {
//       return res.status(401).json({
//         success: false,
//         message: 'Authentication required',
//         details: 'User not authenticated'
//       });
//     }

//     // Normalize allowed roles - convert everything to IDs and names
//     const allowedIds = new Set();
//     const allowedNames = new Set();
    
//     for (const role of allowedRoles) {
//       // If it's a number, add as ID
//       if (typeof role === 'number') {
//         allowedIds.add(role);
//         // Also get the name from ROLE_NAMES
//         const roleName = ROLE_NAMES[role];
//         if (roleName) {
//           allowedNames.add(roleName);
//           allowedNames.add(roleName.toLowerCase());
//         }
//       }
//       // If it's a string
//       else if (typeof role === 'string') {
//         // Check if it's a numeric string
//         if (!isNaN(role)) {
//           const numRole = parseInt(role);
//           allowedIds.add(numRole);
//           const roleName = ROLE_NAMES[numRole];
//           if (roleName) {
//             allowedNames.add(roleName);
//             allowedNames.add(roleName.toLowerCase());
//           }
//         } else {
//           // It's a role name
//           allowedNames.add(role);
//           allowedNames.add(role.toLowerCase());
//           // Try to find the ID from ROLE_NAMES
//           for (const [id, name] of Object.entries(ROLE_NAMES)) {
//             if (name.toLowerCase() === role.toLowerCase()) {
//               allowedIds.add(parseInt(id));
//               break;
//             }
//           }
//         }
//       }
//     }

//     console.log('🔍 Allowed IDs:', [...allowedIds]);
//     console.log('🔍 Allowed Names:', [...allowedNames]);

//     // Check if user has access
//     let hasAccess = false;
//     let matchedBy = '';

//     // Check by ID
//     if (userRoleId && allowedIds.has(userRoleId)) {
//       hasAccess = true;
//       matchedBy = `role ID ${userRoleId}`;
//     }
    
//     // Check by name
//     if (!hasAccess && userRoleName) {
//       if (allowedNames.has(userRoleName) || allowedNames.has(userRoleName.toLowerCase())) {
//         hasAccess = true;
//         matchedBy = `role name "${userRoleName}"`;
//       }
//     }

//     // Check if user is Admin (role ID 1 or name Administrator)
//     if (!hasAccess && (userRoleId === ROLES.ADMINISTRATOR || userRoleName === 'Administrator' || userRoleName?.toLowerCase() === 'administrator')) {
//       if (allowedIds.has(ROLES.ADMINISTRATOR) || allowedNames.has('Administrator') || allowedNames.has('administrator')) {
//         hasAccess = true;
//         matchedBy = 'Administrator (auto-granted)';
//       }
//     }

//     // If no access, deny with detailed message
//     if (!hasAccess) {
//       // Build a readable list of required roles
//       const requiredList = [...allowedNames, ...allowedIds].join(', ');
      
//       return res.status(403).json({
//         success: false,
//         message: 'Access denied',
//         details: `Requires one of: ${requiredList}. Current: ${userRoleName || userRoleId || 'Unknown'}`,
//       });
//     }

//     console.log(`✅ Authorization successful: ${userRoleName} (${userRoleId}) matched by ${matchedBy}`);
//     console.log('🔍 ========================================');
    
//     next();
//   };
// };

// In src/middlewares/auth.js - Update the authorize function

export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    // Get user role from request
    const userRoleId = req.user?.roleId;
    const userRoleName = req.user?.roleName || req.user?.role || req.user?.primary_role || req.user?.role_name || req.user?.primary_business_role;
    
    // If no user, deny access
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        details: 'User not authenticated'
      });
    }

    // Flatten the allowedRoles array (in case someone passes an array)
    let flattenedRoles = [];
    for (const role of allowedRoles) {
      if (Array.isArray(role)) {
        flattenedRoles = flattenedRoles.concat(role);
      } else {
        flattenedRoles.push(role);
      }
    }

    // Normalize allowed roles - convert everything to IDs and names
    const allowedIds = new Set();
    const allowedNames = new Set();
    
    for (const role of flattenedRoles) {
      // If it's a number, add as ID
      if (typeof role === 'number') {
        allowedIds.add(role);
        // Also get the name from ROLE_NAMES
        const roleName = ROLE_NAMES[role];
        if (roleName) {
          allowedNames.add(roleName);
          allowedNames.add(roleName.toLowerCase());
        }
      }
      // If it's a string
      else if (typeof role === 'string') {
        // Check if it's a numeric string
        if (!isNaN(role)) {
          const numRole = parseInt(role);
          allowedIds.add(numRole);
          const roleName = ROLE_NAMES[numRole];
          if (roleName) {
            allowedNames.add(roleName);
            allowedNames.add(roleName.toLowerCase());
          }
        } else {
          // It's a role name
          allowedNames.add(role);
          allowedNames.add(role.toLowerCase());
          // Try to find the ID from ROLE_NAMES
          for (const [id, name] of Object.entries(ROLE_NAMES)) {
            if (name.toLowerCase() === role.toLowerCase()) {
              allowedIds.add(parseInt(id));
              break;
            }
          }
        }
      }
    }

    console.log('🔍 Allowed IDs:', [...allowedIds]);
    console.log('🔍 Allowed Names:', [...allowedNames]);

    // Check if user has access
    let hasAccess = false;
    let matchedBy = '';

    // Check by ID
    if (userRoleId && allowedIds.has(userRoleId)) {
      hasAccess = true;
      matchedBy = `role ID ${userRoleId}`;
    }
    
    // Check by name
    if (!hasAccess && userRoleName) {
      if (allowedNames.has(userRoleName) || allowedNames.has(userRoleName.toLowerCase())) {
        hasAccess = true;
        matchedBy = `role name "${userRoleName}"`;
      }
    }

    // Check if user is Admin (role ID 1 or name Administrator)
    if (!hasAccess && (userRoleId === ROLES.ADMINISTRATOR || userRoleName === 'Administrator' || userRoleName?.toLowerCase() === 'administrator')) {
      if (allowedIds.has(ROLES.ADMINISTRATOR) || allowedNames.has('Administrator') || allowedNames.has('administrator')) {
        hasAccess = true;
        matchedBy = 'Administrator (auto-granted)';
      }
    }

    // If no access, deny with detailed message
    if (!hasAccess) {
      // Build a readable list of required roles
      const requiredList = [...allowedNames, ...allowedIds].join(', ');
      
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        details: `Requires one of: ${requiredList}. Current: ${userRoleName || userRoleId || 'Unknown'}`,
      });
    }

    console.log(`✅ Authorization successful: ${userRoleName} (${userRoleId}) matched by ${matchedBy}`);
    
    next();
  };
};


// ==================== PERMISSION-BASED AUTHORIZATION ====================
export const authorizePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const userRoleId = req.user?.roleId;
      
      // Admin role has all permissions
      if (userRoleId === ROLES.ADMINISTRATOR) {
        console.log(`✅ Admin role - granting permission: ${permission}`);
        return next();
      }
      
      // Check if user has the required permission
      const hasPermission = roleHasPermission ? await roleHasPermission(userRoleId, permission) : false;
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          details: `Missing required permission: ${permission}`,
        });
      }
      
      console.log(`✅ Permission granted: ${permission} for role ${userRoleId}`);
      next();
    } catch (error) {
      console.error('❌ Permission check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed',
        error: error.message,
      });
    }
  };
};

// ==================== IS ADMIN MIDDLEWARE ====================
export const isAdmin = (req, res, next) => {
  const roleId = parseInt(req.user?.roleId || req.user?.role_id || req.user?.BU_ROLE_ID);
  const roleName = req.user?.roleName || req.user?.role || req.user?.primary_role || req.user?.role_name || req.user?.primary_business_role;

  // Check by ID
  if (roleId === ROLES.ADMINISTRATOR) {
    return next();
  }

  // Check by name
  if (roleName === 'Administrator' || 
      roleName === 'System Admin' || 
      roleName === 'Super Admin' ||
      roleName === 'admin' ||
      roleName?.toLowerCase() === 'administrator' ||
      req.user?.isAdmin === true) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Admin access required',
    details: 'This operation is restricted to administrators.',
  });
};

// ==================== ROLE-BASED HELPER FUNCTIONS ====================
export const hasRole = (user, roleIdOrName) => {
  if (!user) return false;
  
  const userRoleId = user.roleId || user.role_id || user.BU_ROLE_ID;
  const userRoleName = user.roleName || user.role || user.primary_role || user.role_name || user.primary_business_role;
  
  if (typeof roleIdOrName === 'number') {
    return parseInt(userRoleId) === roleIdOrName;
  }
  
  if (typeof roleIdOrName === 'string') {
    if (!isNaN(roleIdOrName)) {
      return parseInt(userRoleId) === parseInt(roleIdOrName);
    }
    return userRoleName === roleIdOrName || userRoleName?.toLowerCase() === roleIdOrName.toLowerCase();
  }
  
  return false;
};

export const isAdminUser = (user) => {
  return hasRole(user, ROLES.ADMINISTRATOR) || hasRole(user, 'Administrator');
};

export const isCEO = (user) => {
  return hasRole(user, ROLES.CHIEF_EXECUTIVE_OFFICER) || hasRole(user, 'Chief Executive Officer') || hasRole(user, 'CEO');
};

// ==================== COMBINED MIDDLEWARES ====================
export const adminOnly = authorize(ROLES.ADMINISTRATOR, 'Administrator', 'System Admin', 'Super Admin');

export const adminOrCEO = authorize(
  ROLES.ADMINISTRATOR,
  ROLES.CHIEF_EXECUTIVE_OFFICER,
  'Administrator',
  'Chief Executive Officer',
  'CEO'
);

// ==================== EXPORTS ====================
export default {
  authenticate,
  authorize,
  authorizePermission,
  isAdmin,
  adminOnly,
  adminOrCEO,
  hasRole,
  isAdminUser,
  isCEO,
  getSecretKey,
};