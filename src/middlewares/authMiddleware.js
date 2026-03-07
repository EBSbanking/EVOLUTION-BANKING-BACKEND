// src/middleware/authMiddleware.js - COMPLETE UPDATED VERSION WITH ALL EXPORTS
import jwt from 'jsonwebtoken';
import { initializeModels, getModel } from '../models/index.js';

// Helper to get JWT secret
export const getSecretKey = () => {
  return process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || 'your-fallback-secret-key-change-in-production';
};

// Alias for backward compatibility
export const getJWTSecret = getSecretKey;

// ==================== AUTHENTICATION MIDDLEWARE ====================

// src/middleware/authMiddleware.js - UPDATED protect function
export const protect = async (req, res, next) => {
  try {
    let token;

    // Check if token exists in headers
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Also check for token in cookies
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    try {
      // Verify token
      const decoded = jwt.verify(token, getSecretKey());
      console.log('🔍 Decoded JWT:', decoded);
      
      // CRITICAL FIX: Set req.user from decoded token FIRST
      // This ensures authorize middleware can access it immediately
      req.user = {
        id: decoded.userId || decoded.id,
        userId: decoded.userId || decoded.id,
        username: decoded.user_name || decoded.username,
        user_name: decoded.user_name || decoded.username,
        email: decoded.email,
        role: decoded.role,
        roleId: decoded.roleId,
        BU_ROLE_ID: decoded.BU_ROLE_ID || decoded.bu_role_id,
        isAdmin: decoded.isAdmin || (decoded.BU_ROLE_ID === '1' || decoded.BU_ROLE_ID === 1),
        permissions: decoded.permissions || [],
        accessibleBusinessUnits: decoded.accessibleBusinessUnits || []
      };
      
      console.log('✅ req.user set from token:', {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role,
        BU_ROLE_ID: req.user.BU_ROLE_ID,
        isAdmin: req.user.isAdmin
      });

      // Try to get additional info from database
      try {
        const models = await initializeModels();
        const User = getModel('User');
        
        if (User) {
          const dbUser = await User.findByPk(req.user.id, {
            attributes: { exclude: ['password', 'password_hash'] }
          });
          
          if (dbUser) {
            // Merge database info with token info
            req.user = {
              ...req.user,
              ...dbUser.toJSON(),
              // Ensure critical fields from token take precedence
              role: req.user.role || dbUser.role,
              BU_ROLE_ID: req.user.BU_ROLE_ID || dbUser.BU_ROLE_ID,
              isAdmin: req.user.isAdmin || (dbUser.BU_ROLE_ID === '1' || dbUser.BU_ROLE_ID === 1)
            };
            console.log('✅ Database user info merged');
          }
        }
      } catch (dbError) {
        console.warn('⚠️ Could not fetch user from DB, using token info only:', dbError.message);
        // Continue with token info only
      }

      // For backward compatibility
      req.authUser = req.user;
      req.userId = req.user.id;
      req.userRole = req.user.role;

      console.log(`✅ User authenticated: ${req.user.username} (ID: ${req.user.id}, Role: ${req.user.role}, BU_ROLE_ID: ${req.user.BU_ROLE_ID})`);
      
      next();
    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError.message);
      
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please login again.',
          code: 'TOKEN_EXPIRED'
        });
      }
      
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Invalid token format',
          code: 'INVALID_TOKEN'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token',
        code: 'INVALID_AUTH'
      });
    }
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error in authentication',
      code: 'AUTH_SERVER_ERROR'
    });
  }
};

// ==================== ROLE AUTHORIZATION MIDDLEWARE ====================

// src/middleware/authMiddleware.js - UPDATED authorize function
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      console.error('❌ No user object in request');
      return res.status(401).json({
        success: false,
        message: 'Not authorized. User not authenticated.',
        code: 'NO_USER'
      });
    }

    console.log('🔍 Authorization check - User:', {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      BU_ROLE_ID: req.user.BU_ROLE_ID,
      isAdmin: req.user.isAdmin,
      requiredRoles: roles
    });

    // Check if user is admin via isAdmin flag
    if (req.user.isAdmin === true) {
      console.log('✅ User is admin (isAdmin flag), granting access');
      return next();
    }

    // Check if user has BU_ROLE_ID === 1 (Administrator)
    const buRoleId = req.user.BU_ROLE_ID;
    if (buRoleId === '1' || buRoleId === 1) {
      console.log('✅ User has BU_ROLE_ID === 1, granting access');
      return next();
    }

    // Check if user role is in allowed roles
    const userRole = req.user.role;
    if (userRole && roles.includes(userRole)) {
      console.log(`✅ User role "${userRole}" is in allowed roles`);
      return next();
    }

    // Check if BU_ROLE_ID corresponds to an allowed role
    if (buRoleId) {
      // Map BU_ROLE_ID to role names
      const roleMapping = {
        '1': 'Administrator',
        '2': 'SuperAdmin',
        '3': 'Manager',
        '4': 'Supervisor',
        '5': 'RelationshipOfficer',
        '6': 'Teller',
        '7': 'CreditOfficer'
      };
      
      const mappedRole = roleMapping[String(buRoleId)];
      if (mappedRole && roles.includes(mappedRole)) {
        console.log(`✅ User BU_ROLE_ID "${buRoleId}" maps to allowed role "${mappedRole}"`);
        return next();
      }
    }

    console.log(`❌ Access denied. User role: "${userRole}" (BU_ROLE_ID: ${buRoleId})`);
    
    return res.status(403).json({
      success: false,
      message: `User role "${userRole}" (ID: ${buRoleId}) is not authorized to access this route. Required roles: ${roles.join(', ')}`,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  };
};

// ==================== PERMISSION MIDDLEWARES ====================

export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NO_AUTH'
        });
      }

      // Super admin bypass (role ID 1)
      const roleId = req.user.role_id || req.user.bu_role_id;
      if (roleId === 1) {
        return next();
      }

      const userPermissions = req.user.permissions || [];
      
      if (!userPermissions.includes(permission)) {
        return res.status(403).json({
          success: false,
          message: `Missing required permission: ${permission}`,
          code: 'MISSING_PERMISSION'
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission validation failed',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

export const requireAllPermissions = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NO_AUTH'
        });
      }

      // Super admin bypass (role ID 1)
      const roleId = req.user.role_id || req.user.bu_role_id;
      if (roleId === 1) {
        return next();
      }

      const userPermissions = req.user.permissions || [];
      const missingPermissions = permissions.filter(p => !userPermissions.includes(p));
      
      if (missingPermissions.length > 0) {
        return res.status(403).json({
          success: false,
          message: `Missing required permissions: ${missingPermissions.join(', ')}`,
          code: 'MISSING_PERMISSIONS'
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission validation failed',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

export const requireAnyPermission = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
          code: 'NO_AUTH'
        });
      }

      // Super admin bypass (role ID 1)
      const roleId = req.user.role_id || req.user.bu_role_id;
      if (roleId === 1) {
        return next();
      }

      const userPermissions = req.user.permissions || [];
      const hasAnyPermission = permissions.some(p => userPermissions.includes(p));
      
      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: `Requires at least one of these permissions: ${permissions.join(', ')}`,
          code: 'NO_MATCHING_PERMISSIONS'
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission validation failed',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

// ==================== VALIDATE PERMISSION MIDDLEWARE ====================

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

      // Support for string-based permissions
      if (typeof requiredPermissions === 'string') {
        // For simple string permissions, use requirePermission logic
        const userPermissions = user.permissions || [];
        if (!userPermissions.includes(requiredPermissions)) {
          return res.status(403).json({
            success: false,
            message: `Missing permission: ${requiredPermissions}`,
            resolution: 'Contact your administrator to request this permission'
          });
        }
        return next();
      }

      // Support for array of permissions (all required)
      if (Array.isArray(requiredPermissions)) {
        const userPermissions = user.permissions || [];
        const missingPermissions = requiredPermissions.filter(p => !userPermissions.includes(p));
        
        if (missingPermissions.length > 0) {
          return res.status(403).json({
            success: false,
            message: `Missing required permissions: ${missingPermissions.join(', ')}`,
            resolution: 'Contact your administrator to request these permissions'
          });
        }
        return next();
      }

      // Object-based permission structure (backward compatible)
      if (Object.keys(requiredPermissions).length > 0) {
        // Placeholder for object-based permissions
        // You can implement this based on your specific permission structure
        console.warn('Object-based permissions validation not fully implemented');
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

// ==================== ALIASES FOR COMPATIBILITY ====================

// Aliases for code expecting "authenticate" and "hasRole"
export const authenticate = protect;
export const hasRole = authorize;

// Alias for backward compatibility
export const auth = protect;

// ==================== TOKEN VALIDATION ====================

export const validateToken = (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const decoded = jwt.verify(token, getSecretKey());
    req.tokenData = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }
};


// Add this to your authMiddleware.js
export const authenticateWebhook = (req, res, next) => {
  try {
    // Simple API key validation for webhooks
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    const webhookSecret = process.env.WEBHOOK_SECRET;
    
    // If no webhook secret is configured, skip authentication (development mode)
    if (!webhookSecret) {
      console.warn('⚠️ WEBHOOK_SECRET not configured, skipping webhook authentication');
      return next();
    }
    
    // If no API key provided, check for signature headers
    if (!apiKey) {
      // Check for signature headers (NIP, Stripe, etc.)
      if (req.headers['x-nip-signature'] || 
          req.headers['stripe-signature'] || 
          req.headers['paypal-transmission-sig'] ||
          req.headers['x-webhook-signature']) {
        // Let the individual webhook handlers verify signatures
        return next();
      }
      
      return res.status(401).json({
        success: false,
        message: 'No authentication provided',
        code: 'NO_AUTH'
      });
    }
    
    // Simple API key validation
    if (apiKey !== webhookSecret) {
      return res.status(403).json({
        success: false,
        message: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
    }
    
    next();
  } catch (error) {
    console.error('Webhook authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Webhook authentication failed',
      code: 'AUTH_ERROR'
    });
  }
};


// ==================== TOKEN GENERATION ====================

export const generateToken = (user) => {
  const payload = {
    id: user.id,
    username: user.username || user.email,
    email: user.email,
    role: user.role,
    role_id: user.role_id || user.bu_role_id,
    business_unit: user.business_unit,
    permissions: user.permissions || []
  };

  return jwt.sign(payload, getSecretKey(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// ==================== DEFAULT EXPORT ====================

export default {
  // Main exports
  protect,
  authorize,
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  validatePermission,
  validateToken,
  generateToken,
  getSecretKey,
  getJWTSecret,
  
  // Aliases
  authenticate: protect,
  hasRole: authorize,
  auth: protect,
  
  // Also include the aliases in the default export
  authenticate,
  hasRole,
  validatePermission,
  authenticateWebhook, // Add this line
  authenticateWebhook // Add this line
};