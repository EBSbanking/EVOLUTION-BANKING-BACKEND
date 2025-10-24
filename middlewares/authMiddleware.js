import jwt from 'jsonwebtoken';
import Permissions from '../models/Permissions.js';
import User from '../models/User.js';
import { hasPermission, checkMultiplePermissions, hasAnyPermission } from '../utils/permissionHelpers.js';
import { roleHasPermission } from '../utils/permissionSync.js';

// Enhanced secret key handling
export const getSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT secret key not configured');
  }
  return secret;
};

// =========================
// 1. Unified Authentication Middleware (Enhanced)
// =========================
export const authenticate = async (req, res, next) => {
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

    // 4. Get user permissions from database
    let userPermissions = null;
    const roleId = user.roleId || user.BU_ROLE_ID || decoded.roleId;
    
    if (roleId) {
      userPermissions = await Permissions.findOne({ BU_ROLE_ID: roleId }).lean();
    }

    // 5. Enhanced user attachment with new permission system
    req.user = user; // Full user document
    req.authUser = {
      id: user._id,
      user_name: user.user_name,
      role: user.role,
      roles: user.roles || [],
      roleId: roleId,
      permissions: userPermissions, // Database permissions
      // ✅ ADDED: Critical fields for teller routes
      businessUnit: user.businessUnit,
      accessibleBusinessUnits: user.accessibleBusinessUnits || [],
      BU_ROLE_ID: roleId,
      isAdmin: user.isAdmin,
      userId: user._id.toString(), // For backward compatibility
      // Additional fields for compatibility
      bu_id: user.businessUnit, // Alias for businessUnit
      primary_business_role: user.primary_business_role,
      email: user.email
    };

    // 6. Attach permission checking methods to request for easy access
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
// 2. Enhanced Permission Middleware (Updated for new system)
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
      const roleId = user.roleId || user.BU_ROLE_ID;

      // Bypass permission checks for super admins (roleId 1)
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
      const userRole = user.role;
      const userRoleId = user.roleId || user.BU_ROLE_ID;
      
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
      const roleId = user.roleId || user.BU_ROLE_ID;

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
      const roleId = user.roleId || user.BU_ROLE_ID;

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
      const roleId = user.roleId || user.BU_ROLE_ID;

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
// 6. JWT Generator (Enhanced - CRITICAL UPDATE)
// =========================
export const generateToken = (user) => {
  if (!user || !user._id) {
    throw new Error('Invalid user object for token generation');
  }

  return jwt.sign(
    {
      id: user._id,
      user_name: user.user_name,
      role: user.role,
      roles: user.roles || [],
      roleId: user.BU_ROLE_ID || user.roleId || null,
      // ✅ CRITICAL: Added all fields needed for teller routes
      businessUnit: user.businessUnit,
      accessibleBusinessUnits: user.accessibleBusinessUnits || [],
      BU_ROLE_ID: user.BU_ROLE_ID,
      permissions: user.permissions,
      isAdmin: user.isAdmin,
      primary_business_role: user.primary_business_role,
      email: user.email,
      // Backward compatibility aliases
      userId: user._id.toString(),
      bu_id: user.businessUnit
    },
    getSecretKey(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } // Extended for development
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

// Add this to your authMiddleware.js or create a debug route
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
// 9. Teller-specific Authentication (Enhanced Compatibility) - FIXED VERSION
// =========================
export const tellerAuthenticate = async (req, res, next) => {
  try {
    await authenticate(req, res, () => {
      // Ensure all required fields for teller routes are available
      const user = req.user; // This is the full user document from database
      const authUser = req.authUser; // This is the auth user object
      
      console.log('🔍 tellerAuthenticate - Database User:', {
        businessUnit: user?.businessUnit,
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
        businessUnit: user?.businessUnit || authUser?.businessUnit || 'RELIEF BRANCH', // ✅ FALLBACK
        bu_id: user?.businessUnit || authUser?.businessUnit || 'RELIEF BRANCH', // ✅ FALLBACK
        permissions: authUser?.permissions || user?.permissions,
        accessibleBusinessUnits: user?.accessibleBusinessUnits || authUser?.accessibleBusinessUnits || ['RELIEF BRANCH'],
        isAdmin: authUser?.isAdmin || user?.isAdmin,
        role: authUser?.role || user?.role,
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
  tellerAuthenticate // ✅ Added for teller routes
};