// middleware/auth.js - Updated with DYNAMIC Branch Mapping
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Permissions from '../models/Permissions.js';
import Branch from '../models/Branch.js';
import { hasPermission, checkMultiplePermissions, hasAnyPermission } from '../utils/permissionHelpers.js';
import { roleHasPermission } from '../utils/permissionSync.js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Function to get JWT secret key
export const getSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET_KEY or JWT_SECRET is not defined in .env');
  }
  return secret;
};

// =========================
// HELPER FUNCTIONS FOR BRANCH MAPPING - DYNAMIC VERSION
// =========================

/**
 * Get default branch from database (dynamic fallback)
 */
export const getDefaultBranch = async () => {
  try {
    // Try multiple strategies to find a default branch
    const defaultBranch = await Branch.findOne({
      status: 'ACTIVE'
    })
    .sort({ 
      branchType: 1, // Prefer MAIN branches
      organizationCode: 1, 
      branchCode: 1 
    })
    .lean();

    return defaultBranch;
  } catch (error) {
    console.error('Error fetching default branch:', error.message);
    return null;
  }
};

/**
 * Get branch information by branchCode
 */
export const getBranchByCode = async (branchCode) => {
  try {
    if (!branchCode) return null;
    
    const branch = await Branch.findOne({ 
      branchCode: branchCode.toString().padStart(3, '0')
    }).lean();
    
    return branch;
  } catch (error) {
    console.error('Error fetching branch:', error.message);
    return null;
  }
};

/**
 * DYNAMIC: Map user's business unit to branch information with dynamic fallbacks
 */
export const mapUserToBranch = async (user) => {
  try {
    const businessUnit = user.main_business_unit || user.businessUnit;
    
    // 1. If no business unit, try to find user's default branch dynamically
    if (!businessUnit) {
      console.warn('No business unit found for user:', user.user_name);
      
      // DYNAMIC FALLBACK 1: Try to find any active branch
      const defaultBranch = await getDefaultBranch();
      
      if (defaultBranch) {
        console.log('✅ Using dynamic default branch:', defaultBranch.branchCode);
        return {
          branchCode: defaultBranch.branchCode,
          branchName: defaultBranch.branchName,
          organizationCode: defaultBranch.organizationCode,
          organizationName: defaultBranch.organizationName,
          branchType: defaultBranch.branchType,
          fullBranch: defaultBranch,
          isDynamicFallback: true,
          fallbackReason: 'No business unit assigned'
        };
      }
      
      // DYNAMIC FALLBACK 2: Get the first available branch
      const firstBranch = await Branch.findOne({ status: 'ACTIVE' })
        .sort({ createdAt: 1 })
        .lean();
        
      if (firstBranch) {
        console.log('✅ Using first available branch:', firstBranch.branchCode);
        return {
          branchCode: firstBranch.branchCode,
          branchName: firstBranch.branchName,
          organizationCode: firstBranch.organizationCode,
          organizationName: firstBranch.organizationName,
          branchType: firstBranch.branchType,
          fullBranch: firstBranch,
          isDynamicFallback: true,
          fallbackReason: 'First available branch'
        };
      }
      
      // LAST RESORT: Only use hardcoded if NO branches exist in database
      console.error('❌ No branches found in database, using emergency fallback');
      return {
        branchCode: '000',
        branchName: 'EMERGENCY HEAD OFFICE',
        organizationCode: 1,
        organizationName: 'EMERGENCY ORGANIZATION',
        branchType: 'MAIN',
        isDynamicFallback: true,
        isHardcodedFallback: true,
        fallbackReason: 'No branches in database'
      };
    }

    // 2. Try to find branch by business unit
    let branch = await Branch.findOne({
      $or: [
        { branchCode: businessUnit },
        { branchName: { $regex: businessUnit, $options: 'i' } }
      ],
      status: 'ACTIVE'
    }).lean();

    // 3. If not found, try with padded branch code
    if (!branch && /^\d+$/.test(businessUnit)) {
      const paddedCode = businessUnit.padStart(3, '0');
      branch = await Branch.findOne({ 
        branchCode: paddedCode,
        status: 'ACTIVE' 
      }).lean();
    }

    // 4. If branch found, return it
    if (branch) {
      return {
        branchCode: branch.branchCode,
        branchName: branch.branchName,
        organizationCode: branch.organizationCode,
        organizationName: branch.organizationName,
        branchType: branch.branchType,
        fullBranch: branch,
        isDynamicFallback: false
      };
    }

    // 5. DYNAMIC FALLBACK: Business unit not found, find similar or default branch
    console.warn(`Branch not found for business unit: ${businessUnit}, finding dynamic fallback`);
    
    // Try to find a branch with similar name
    const similarBranch = await Branch.findOne({
      branchName: { $regex: businessUnit.substring(0, 3), $options: 'i' },
      status: 'ACTIVE'
    }).lean();

    if (similarBranch) {
      console.log('✅ Using similar branch as fallback:', similarBranch.branchCode);
      return {
        branchCode: similarBranch.branchCode,
        branchName: similarBranch.branchName,
        organizationCode: similarBranch.organizationCode,
        organizationName: similarBranch.organizationName,
        branchType: similarBranch.branchType,
        fullBranch: similarBranch,
        isDynamicFallback: true,
        fallbackReason: `Similar to ${businessUnit}`
      };
    }

    // Use dynamic default branch
    const dynamicDefault = await getDefaultBranch();
    if (dynamicDefault) {
      console.log('✅ Using dynamic default as fallback for:', businessUnit);
      return {
        branchCode: dynamicDefault.branchCode,
        branchName: dynamicDefault.branchName,
        organizationCode: dynamicDefault.organizationCode,
        organizationName: dynamicDefault.organizationName,
        branchType: dynamicDefault.branchType,
        fullBranch: dynamicDefault,
        isDynamicFallback: true,
        fallbackReason: `Default branch for ${businessUnit}`
      };
    }

    // Final fallback: Use business unit as branch code but mark as dynamic
    console.warn(`Using business unit as branch code with dynamic fallback: ${businessUnit}`);
    return {
      branchCode: businessUnit.padStart(3, '0'),
      branchName: `${businessUnit} (AUTO-ASSIGNED)`,
      organizationCode: 1,
      organizationName: 'DYNAMIC ORGANIZATION',
      branchType: 'MAIN',
      isDynamicFallback: true,
      fallbackReason: 'Auto-assigned from business unit'
    };

  } catch (error) {
    console.error('Error mapping user to branch:', error.message);
    
    // DYNAMIC ERROR FALLBACK: Try to get any branch during error
    try {
      const emergencyBranch = await Branch.findOne({ status: 'ACTIVE' })
        .sort({ createdAt: 1 })
        .limit(1)
        .lean();
        
      if (emergencyBranch) {
        console.log('✅ Using emergency branch during error:', emergencyBranch.branchCode);
        return {
          branchCode: emergencyBranch.branchCode,
          branchName: emergencyBranch.branchName,
          organizationCode: emergencyBranch.organizationCode,
          organizationName: emergencyBranch.organizationName,
          branchType: emergencyBranch.branchType,
          fullBranch: emergencyBranch,
          isDynamicFallback: true,
          isErrorFallback: true,
          fallbackReason: `Error recovery: ${error.message}`
        };
      }
    } catch (fallbackError) {
      console.error('Even emergency fallback failed:', fallbackError.message);
    }
    
    // ABSOLUTE LAST RESORT: Only hardcoded if everything fails
    console.error('❌ All dynamic fallbacks failed, using emergency hardcoded values');
    return {
      branchCode: '999',
      branchName: 'EMERGENCY FALLBACK',
      organizationCode: 999,
      organizationName: 'EMERGENCY SYSTEM',
      branchType: 'MAIN',
      isDynamicFallback: true,
      isHardcodedFallback: true,
      isErrorFallback: true,
      fallbackReason: `Complete system failure: ${error.message}`
    };
  }
};

// =========================
// 1. Unified Authentication Middleware (Enhanced with DYNAMIC Branch Mapping)
// =========================
export const authenticate = async (req, res, next) => {
  // ✅ ADDED: Early check for required parameters
  if (!req || !res) {
    console.error('❌ Authentication middleware called without req/res objects');
    // If this is during import/initialization, just return next
    if (typeof next === 'function') {
      return next();
    }
    return;
  }

  try {
    // 1. Get token from headers
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        resolution: 'Include valid JWT token in Authorization header as "Bearer <token>"'
      });
    }

    const token = authHeader.split(' ')[1];

    // 2. Verify token with proper secret
    const decoded = jwt.verify(token, getSecretKey());

    // 3. Verify user still exists
    const user = await User.findOne({
      $or: [
        { _id: decoded.id || decoded._id || decoded.userId },
        { user_name: decoded.user_name }
      ]
    }).select('-password');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User account not found',
        resolution: 'Token might be for a deleted account'
      });
    }

    // 4. ✅ CRITICAL: Map user to branch information DYNAMICALLY
    const branchInfo = await mapUserToBranch(user);
    
    // 5. Get user permissions from database
    let userPermissions = null;
    const roleId = user.BU_ROLE_ID || decoded.roleId;
    
    if (roleId) {
      userPermissions = await Permissions.findOne({ BU_ROLE_ID: roleId }).lean();
    }

    // 6. Enhanced user attachment with branch mapping
    req.user = user;
    req.authUser = {
      id: user._id,
      user_name: user.user_name,
      role: user.primary_business_role,
      roles: user.roles || [],
      roleId: user.BU_ROLE_ID,
      permissions: userPermissions,
      
      // ✅ DYNAMIC BRANCH MAPPING
      businessUnit: branchInfo.branchCode,
      branchCode: branchInfo.branchCode,
      branchName: branchInfo.branchName,
      organizationCode: branchInfo.organizationCode,
      organizationName: branchInfo.organizationName,
      branchType: branchInfo.branchType,
      
      // Backward compatibility
      bu_id: branchInfo.branchCode,
      accessibleBusinessUnits: [branchInfo.branchCode],
      
      BU_ROLE_ID: user.BU_ROLE_ID,
      isAdmin: user.BU_ROLE_ID === 1,
      userId: user._id.toString(),
      
      // Additional fields
      email: user.email,
      internal_employee_enabled: user.internal_employee_enabled,
      status: user.status,
      
      // Full branch information with fallback metadata
      branchInfo: branchInfo.fullBranch || branchInfo,
      isBranchFallback: branchInfo.isDynamicFallback || false,
      fallbackReason: branchInfo.fallbackReason || null
    };

    // 7. Log dynamic branch assignment
    if (branchInfo.isDynamicFallback) {
      console.log('🔄 Dynamic branch assignment:', {
        user: req.authUser.user_name,
        assignedBranch: req.authUser.branchCode,
        reason: branchInfo.fallbackReason,
        originalBusinessUnit: user.main_business_unit
      });
    } else {
      console.log('✅ User authenticated with direct branch mapping:', {
        user: req.authUser.user_name,
        branchCode: req.authUser.branchCode,
        branchName: req.authUser.branchName
      });
    }

    // 8. Attach permission checking methods
    req.hasPermission = (permission) => {
      if (userPermissions) {
        return hasPermission(userPermissions, permission);
      }
      return false;
    };

    req.checkMultiplePermissions = (permissions) => {
      if (userPermissions) {
        return checkMultiplePermissions(userPermissions, permissions);
      }
      return false;
    };

    req.hasAnyPermission = (permissions) => {
      if (userPermissions) {
        return hasAnyPermission(userPermissions, permissions);
      }
      return false;
    };

    next();
  } catch (error) {
    // ✅ ENHANCED: Check if res exists before using it
    if (!res || typeof res.status !== 'function') {
      console.error('❌ Authentication error but res object is unavailable:', error.message);
      if (typeof next === 'function') {
        return next(error);
      }
      return;
    }

    // Enhanced error handling
    let status = 401;
    let message = 'Authentication failed';
    let resolution = 'Provide a valid authentication token';
    
    if (error.name === 'TokenExpiredError') {
      status = 403;
      message = 'Session expired';
      resolution = 'Please login again';
    } else if (error.message.includes('secret')) {
      message = 'Server configuration error';
      resolution = 'Contact system administrator';
      console.error('JWT Secret Key Error:', error.message);
    }

    res.status(status).json({ 
      success: false,
      message,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      resolution
    });
  }
};

// =========================
// 2. Enhanced Permission Middleware (Updated for new model)
// =========================
export const validatePermission = (requiredPermissions = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user && !req.authUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required',
          resolution: 'This endpoint requires prior authentication'
        });
      }

      const user = req.user || req.authUser;
      const roleId = user.BU_ROLE_ID || user.roleId;

      // Bypass permission checks for super admins (BU_ROLE_ID 1)
      if (parseInt(roleId) === 1) {
        return next();
      }

      // NEW: Support for string-based permissions (backward compatible)
      if (typeof requiredPermissions === 'string') {
        // Single permission check using new system
        const hasPerm = await roleHasPermission(roleId, requiredPermissions);
        if (!hasPerm) {
          return res.status(403).json({
            success: false,
            message: `Missing permission: ${requiredPermissions}`,
            resolution: 'Contact your administrator to request this permission'
          });
        }
        return next();
      }

      // NEW: Support for array of permissions (all required)
      if (Array.isArray(requiredPermissions)) {
        for (const permission of requiredPermissions) {
          const hasPerm = await roleHasPermission(roleId, permission);
          if (!hasPerm) {
            return res.status(403).json({
              success: false,
              message: `Missing permission: ${permission}`,
              resolution: 'Contact your administrator to request this permission'
            });
          }
        }
        return next();
      }

      // OLD: Object-based permission structure (backward compatible)
      if (Object.keys(requiredPermissions).length > 0) {
        const userPermissions = await Permissions.findOne({
          BU_ROLE_ID: roleId
        }).lean();

        if (!userPermissions) {
          return res.status(403).json({ 
            success: false,
            message: 'No permissions assigned to your role',
            resolution: 'Contact your administrator to get permissions assigned'
          });
        }

        // Check each required permission group
        for (const [group, perms] of Object.entries(requiredPermissions)) {
          const field = `${group}_ACCESS_LEVEL`;
          const allowed = userPermissions[field] || [];

          const missing = perms.filter(p => !allowed.includes(p));
          if (missing.length > 0) {
            return res.status(403).json({
              success: false,
              message: `Missing ${group} permissions: ${missing.join(', ')}`,
              resolution: 'Contact your administrator to request these permissions'
            });
          }
        }
      }

      next();
    } catch (error) {
      console.error('Permission validation error:', error.message);
      res.status(500).json({ 
        success: false,
        message: 'Permission validation failed',
        error: error.message,
        resolution: 'Try again later or contact support'
      });
    }
  };
};

// =========================
// 3. Universal Role-based Middleware (Enhanced)
// =========================
export const hasRole = (...roles) => {
  return async (req, res, next) => {
    try {
      if (!req.user && !req.authUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required',
          resolution: 'This endpoint requires prior authentication'
        });
      }

      const user = req.user || req.authUser;
      const userRoles = user.roles || [];
      const userRole = user.primary_business_role;
      const userRoleId = user.BU_ROLE_ID || user.roleId;
      
      // Check numeric role IDs
      const hasRequiredById = roles.some(role => {
        if (typeof role === 'number') {
          return parseInt(userRoleId) === role;
        }
        return false;
      });

      // Check string role names
      const hasRequiredByName = roles.some(role => {
        if (typeof role === 'string') {
          return userRoles.includes(role) || userRole === role;
        }
        return false;
      });

      if (!hasRequiredById && !hasRequiredByName) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access',
          resolution: `Requires one of these roles: ${roles.join(', ')}`
        });
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Role validation failed',
        error: error.message
      });
    }
  };
};

// =========================
// 4. New Permission Middleware (Simplified)
// =========================
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user && !req.authUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required'
        });
      }

      const user = req.user || req.authUser;
      const roleId = user.BU_ROLE_ID || user.roleId;

      // Super admin bypass
      if (parseInt(roleId) === 1) {
        return next();
      }

      const hasPerm = await roleHasPermission(roleId, permission);
      if (!hasPerm) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions. Required: ${permission}`
        });
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

export const requireAllPermissions = (permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user && !req.authUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required'
        });
      }

      const user = req.user || req.authUser;
      const roleId = user.BU_ROLE_ID || user.roleId;

      // Super admin bypass
      if (parseInt(roleId) === 1) {
        return next();
      }

      for (const permission of permissions) {
        const hasPerm = await roleHasPermission(roleId, permission);
        if (!hasPerm) {
          return res.status(403).json({
            success: false,
            message: `Insufficient permissions. Missing: ${permission}`
          });
        }
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

export const requireAnyPermission = (permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user && !req.authUser) {
        return res.status(401).json({ 
          success: false,
          message: 'Authentication required'
        });
      }

      const user = req.user || req.authUser;
      const roleId = user.BU_ROLE_ID || user.roleId;

      // Super admin bypass
      if (parseInt(roleId) === 1) {
        return next();
      }

      for (const permission of permissions) {
        const hasPerm = await roleHasPermission(roleId, permission);
        if (hasPerm) {
          return next();
        }
      }

      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Requires one of: ${permissions.join(', ')}`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

// =========================
// 5. Auth + Permissions Shortcut (Enhanced)
// =========================
export const authWithPermissions = (requiredPermissions = {}) => [
  authenticate,
  validatePermission(requiredPermissions)
];

// =========================
// 6. JWT Generator (Enhanced - Updated for new model)
// =========================
export const generateToken = (user) => {
  if (!user || !user._id) {
    throw new Error('Invalid user object for token generation');
  }

  return jwt.sign(
    {
      id: user._id,
      user_name: user.user_name,
      role: user.primary_business_role,
      roles: user.roles || [],
      roleId: user.BU_ROLE_ID,
      businessUnit: user.main_business_unit,
      accessibleBusinessUnits: user.accessibleBusinessUnits || [user.main_business_unit],
      BU_ROLE_ID: user.BU_ROLE_ID,
      permissions: user.permissions,
      isAdmin: user.BU_ROLE_ID === 1,
      primary_business_role: user.primary_business_role,
      email: user.email,
      // Backward compatibility aliases
      userId: user._id.toString(),
      bu_id: user.main_business_unit
    },
    getSecretKey(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// =========================
// 7. Simple Auth Check Middleware
// =========================
export const requireAuth = (req, res, next) => {
  if (!req.user && !req.authUser) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  next();
};

// =========================
// 8. Optional: Token Refresh Middleware
// =========================
export const refreshTokenMiddleware = async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.headers['x-refresh-token'];
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || getSecretKey());
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new access token
    const newAccessToken = generateToken(user);
    res.set('x-access-token', newAccessToken);
    req.user = user;
    next();
  } catch (error) {
    res.status(403).json({
      success: false,
      message: 'Invalid refresh token',
      error: error.message
    });
  }
};

// =========================
// 9. Debug Token Middleware
// =========================
export const debugToken = async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getSecretKey());
    
    console.log('🔍 JWT Token Contents:', JSON.stringify(decoded, null, 2));
    
    res.json({
      success: true,
      tokenContents: decoded,
      missingFields: {
        businessUnit: !decoded.businessUnit,
        BU_ROLE_ID: !decoded.BU_ROLE_ID,
        accessibleBusinessUnits: !decoded.accessibleBusinessUnits
      }
    });
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token',
      error: error.message 
    });
  }
};

// =========================
// 10. Teller-specific Authentication (Enhanced Compatibility)
// =========================
export const tellerAuthenticate = async (req, res, next) => {
  try {
    await authenticate(req, res, () => {
      // Ensure all required fields for teller routes are available
      const user = req.user; // Full user document from database
      const authUser = req.authUser; // Auth user object
      
      console.log('🔍 tellerAuthenticate - Database User:', {
        businessUnit: user?.main_business_unit,
        BU_ROLE_ID: user?.BU_ROLE_ID
      });
      
      console.log('🔍 tellerAuthenticate - Auth User:', {
        businessUnit: authUser?.businessUnit,
        BU_ROLE_ID: authUser?.BU_ROLE_ID
      });

      // ✅ SET req.user WITH FALLBACK VALUES
      req.user = {
        userId: authUser?.id || user?._id?.toString(),
        user_name: authUser?.user_name || user?.user_name,
        BU_ROLE_ID: authUser?.BU_ROLE_ID || user?.BU_ROLE_ID || 29,
        businessUnit: user?.main_business_unit || authUser?.businessUnit || 'RELIEF BRANCH',
        bu_id: user?.main_business_unit || authUser?.businessUnit || 'RELIEF BRANCH',
        permissions: authUser?.permissions || user?.permissions,
        accessibleBusinessUnits: user?.accessibleBusinessUnits || authUser?.accessibleBusinessUnits || ['RELIEF BRANCH'],
        isAdmin: authUser?.isAdmin || user?.isAdmin,
        role: authUser?.role || user?.primary_business_role,
        email: user?.email,
        primary_business_role: user?.primary_business_role
      };
      
      console.log('🔍 Final req.user for teller routes:', {
        businessUnit: req.user.businessUnit,
        bu_id: req.user.bu_id,
        BU_ROLE_ID: req.user.BU_ROLE_ID
      });
      
      next();
    });
  } catch (error) {
    next(error);
  }
};

// =========================
// EXPORTS
// =========================
export default {
  authenticate,
  validatePermission,
  hasRole,
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireAuth,
  authWithPermissions,
  generateToken,
  refreshTokenMiddleware,
  tellerAuthenticate,
  getBranchByCode,
  mapUserToBranch,
  getDefaultBranch,
  debugToken
};