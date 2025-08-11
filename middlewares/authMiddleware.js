import jwt from 'jsonwebtoken';
import Permissions from '../models/Permissions.js';
import User from '../models/User.js';

// Enhanced secret key handling
const getSecretKey = () => {
  const secret = process.env.JWT_SECRET_KEY || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT secret key not configured');
  }
  return secret;
};

// =========================
// 1. Unified Authentication Middleware (Fixed)
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

    // 4. Enhanced user attachment
    req.user = user; // Full user document
    req.authUser = {
      id: user._id,
      user_name: user.user_name,
      role: user.role,
      roles: user.roles || [],
      roleId: user.roleId || user.BU_ROLE_ID || decoded.roleId,
      permissions: decoded.permissions // Preserve original permissions
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

// Rest of your middleware remains the same...

// =========================
// 2. Enhanced Permission Middleware
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

      // Bypass permission checks for super admins
      if (user.roles?.includes('SUPER_ADMIN') || user.role === 'SUPER_ADMIN') {
        return next();
      }

      const userPermissions = await Permissions.findOne({
        BU_ROLE_ID: user.roleId || user.BU_ROLE_ID
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
// 3. Universal Role-based Middleware
// =========================
export const hasRole = (...roles) => {
  return (req, res, next) => {
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
    
    const hasRequired = roles.some(role => 
      userRoles.includes(role) || userRole === role
    );

    if (!hasRequired) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access',
        resolution: `Requires one of these roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// =========================
// 4. Auth + Permissions Shortcut (Enhanced)
// =========================
export const authWithPermissions = (requiredPermissions = {}) => [
  authenticate,
  validatePermission(requiredPermissions)
];

// =========================
// 5. JWT Generator (Enhanced)
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
      roleId: user.BU_ROLE_ID || user.roleId || null
    },
    secretKey,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
  );
};

// =========================
// 6. Optional: Token Refresh Middleware
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

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
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

export default {
  authenticate,
  validatePermission,
  hasRole,
  authWithPermissions,
  generateToken,
  refreshTokenMiddleware
};