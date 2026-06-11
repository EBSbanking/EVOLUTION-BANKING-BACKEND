// src/middleware/authMiddleware.js - FINAL (permissions removed from JWT)
import jwt from 'jsonwebtoken';
import { initializeModels, getModel } from '../models/index.js';

// Helper to get JWT secret
export const getSecretKey = () => {
  return process.env.JWT_SECRET || process.env.JWT_SECRET_KEY || 'your-fallback-secret-key-change-in-production';
};

// Alias for backward compatibility
export const getJWTSecret = getSecretKey;

// ==================== AUTHENTICATION MIDDLEWARE ====================

export const protect = async (req, res, next) => {
  try {
    let token;
    console.log('📝 Headers received:', req.headers);

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
      console.log('✅ Token extracted:', token ? token.substring(0, 50) + '...' : 'No token');
    }

    if (!token) {
      console.log('❌ No token found in headers');
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route. No token provided.',
        code: 'NO_TOKEN'
      });
    }

    try {
      const secretKey = getSecretKey();
      console.log('🔑 Using secret key:', secretKey ? 'Secret key exists' : 'No secret key!');
      
      const decoded = jwt.verify(token, secretKey);
      console.log('🔍 Decoded JWT successfully:', decoded);

      // Set req.user from decoded token
      req.user = {
        id: decoded.userId || decoded.id,
        userId: decoded.userId || decoded.id,
        username: decoded.user_name || decoded.username,
        user_name: decoded.user_name || decoded.username,
        email: decoded.email,
        role: decoded.role,
        roleId: decoded.roleId,
        BU_ROLE_ID: decoded.BU_ROLE_ID || decoded.bu_role_id,
        bu_id: decoded.bu_id || decoded.BU_ID || decoded.business_unit_id,
        isAdmin: decoded.isAdmin || (decoded.BU_ROLE_ID === '1' || decoded.BU_ROLE_ID === 1),
        accessibleBusinessUnits: decoded.accessibleBusinessUnits || []
      };

      console.log('✅ User authenticated:', req.user.id, req.user.username);
      next();
      
    } catch (jwtError) {
      console.error('JWT Verification Error:', jwtError.message);
      console.error('JWT Error Name:', jwtError.name);
      console.error('Token used:', token);
      
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

// ==================== ROLE AUTHORIZATION MIDDLEWARE ====================

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

    // ✅ FIX: Flatten the roles array (handle nested arrays)
    let allowedRoles = [];
    const flattenRoles = (arr) => {
      for (const item of arr) {
        if (Array.isArray(item)) {
          flattenRoles(item);
        } else {
          allowedRoles.push(item);
        }
      }
    };
    flattenRoles(roles);
    
    console.log('🔍 Authorization check - User:', {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      BU_ROLE_ID: req.user.BU_ROLE_ID,
      bu_id: req.user.bu_id,
      isAdmin: req.user.isAdmin,
      requiredRoles: allowedRoles
    });

    // Admin bypass
    if (req.user.isAdmin === true) {
      console.log('✅ User is admin (isAdmin flag), granting access');
      return next();
    }

    // BU_ROLE_ID 1 bypass
    const buRoleId = req.user.BU_ROLE_ID;
    if (buRoleId === '1' || buRoleId === 1) {
      console.log('✅ User has BU_ROLE_ID === 1, granting access');
      return next();
    }

    // ✅ Normalize role names for comparison
    const normalizeRole = (role) => {
      if (!role) return '';
      return String(role).toUpperCase().replace(/ /g, '_');
    };

    const normalizedUserRole = normalizeRole(req.user.role);
    
    // Check if any allowed role matches the normalized user role
    const hasAccess = allowedRoles.some(allowedRole => {
      const normalizedAllowed = normalizeRole(allowedRole);
      return normalizedAllowed === normalizedUserRole;
    });

    if (hasAccess) {
      console.log(`✅ User role "${req.user.role}" normalized to "${normalizedUserRole}" matches allowed roles`);
      return next();
    }

    // Also check BU_ROLE_ID mapping as fallback
    if (buRoleId) {
      const roleMapping = {
        '1': 'Administrator',
        '2': 'SuperAdmin',
        '3': 'Manager',
        '4': 'Supervisor',
        '5': 'RelationshipOfficer',
        '6': 'Teller',
        '7': 'CreditOfficer',
        '19': 'BRANCH_MANAGER'
      };
      const mappedRole = roleMapping[String(buRoleId)];
      if (mappedRole && allowedRoles.some(allowed => normalizeRole(allowed) === normalizeRole(mappedRole))) {
        console.log(`✅ User BU_ROLE_ID "${buRoleId}" maps to allowed role "${mappedRole}"`);
        return next();
      }
    }

    console.log(`❌ Access denied. User role: "${req.user.role}" (BU_ROLE_ID: ${buRoleId})`);
    return res.status(403).json({
      success: false,
      message: `User role "${req.user.role}" (ID: ${buRoleId}) is not authorized to access this route. Required roles: ${allowedRoles.join(', ')}`,
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  };
};

// ==================== PERMISSION MIDDLEWARES ====================

export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required', code: 'NO_AUTH' });
      }

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
      res.status(500).json({ success: false, message: 'Permission validation failed', code: 'PERMISSION_CHECK_ERROR' });
    }
  };
};

export const requireAllPermissions = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required', code: 'NO_AUTH' });
      }
      const roleId = req.user.role_id || req.user.bu_role_id;
      if (roleId === 1) return next();

      const userPermissions = req.user.permissions || [];
      const missing = permissions.filter(p => !userPermissions.includes(p));
      if (missing.length > 0) {
        return res.status(403).json({
          success: false,
          message: `Missing required permissions: ${missing.join(', ')}`,
          code: 'MISSING_PERMISSIONS'
        });
      }
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ success: false, message: 'Permission validation failed', code: 'PERMISSION_CHECK_ERROR' });
    }
  };
};

export const requireAnyPermission = (...permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required', code: 'NO_AUTH' });
      }
      const roleId = req.user.role_id || req.user.bu_role_id;
      if (roleId === 1) return next();

      const userPermissions = req.user.permissions || [];
      const hasAny = permissions.some(p => userPermissions.includes(p));
      if (!hasAny) {
        return res.status(403).json({
          success: false,
          message: `Requires at least one of these permissions: ${permissions.join(', ')}`,
          code: 'NO_MATCHING_PERMISSIONS'
        });
      }
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ success: false, message: 'Permission validation failed', code: 'PERMISSION_CHECK_ERROR' });
    }
  };
};

// ==================== VALIDATE PERMISSION MIDDLEWARE ====================

export const validatePermission = (requiredPermissions = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user && !req.authUser) {
        return res.status(401).json({ success: false, message: 'Authentication required', resolution: 'This endpoint requires prior authentication' });
      }
      const user = req.user || req.authUser;
      const roleId = user.BU_ROLE_ID || user.roleId;
      if (parseInt(roleId) === 1) return next();

      if (typeof requiredPermissions === 'string') {
        const userPermissions = user.permissions || [];
        if (!userPermissions.includes(requiredPermissions)) {
          return res.status(403).json({ success: false, message: `Missing permission: ${requiredPermissions}`, resolution: 'Contact your administrator to request this permission' });
        }
        return next();
      }

      if (Array.isArray(requiredPermissions)) {
        const userPermissions = user.permissions || [];
        const missing = requiredPermissions.filter(p => !userPermissions.includes(p));
        if (missing.length > 0) {
          return res.status(403).json({ success: false, message: `Missing required permissions: ${missing.join(', ')}`, resolution: 'Contact your administrator to request these permissions' });
        }
        return next();
      }
      next();
    } catch (error) {
      console.error('Permission validation error:', error.message);
      res.status(500).json({ success: false, message: 'Permission validation failed', error: error.message, resolution: 'Try again later or contact support' });
    }
  };
};

// ==================== LOGIN POLICY MIDDLEWARE ====================
// ==================== ADMIN MIDDLEWARE ====================
export const isAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required',
      code: 'NO_AUTH'
    });
  }

  // Check if user has admin privileges
  const isUserAdmin = req.user.isAdmin === true ||
                      req.user.BU_ROLE_ID === '1' ||
                      req.user.BU_ROLE_ID === 1 ||
                      req.user.role === 'Administrator';

  if (isUserAdmin) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Admin access required',
    code: 'ADMIN_ONLY'
  });
};



// ==================== TOKEN VALIDATION ====================

export const validateToken = (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }
    const decoded = jwt.verify(token, getSecretKey());
    req.tokenData = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ==================== WEBHOOK AUTHENTICATION ====================

export const authenticateWebhook = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    const webhookSecret = process.env.WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.warn('⚠️ WEBHOOK_SECRET not configured, skipping webhook authentication');
      return next();
    }
    if (!apiKey) {
      if (req.headers['x-nip-signature'] || req.headers['stripe-signature'] || req.headers['paypal-transmission-sig'] || req.headers['x-webhook-signature']) {
        return next();
      }
      return res.status(401).json({ success: false, message: 'No authentication provided', code: 'NO_AUTH' });
    }
    if (apiKey !== webhookSecret) {
      return res.status(403).json({ success: false, message: 'Invalid API key', code: 'INVALID_API_KEY' });
    }
    next();
  } catch (error) {
    console.error('Webhook authentication error:', error);
    return res.status(500).json({ success: false, message: 'Webhook authentication failed', code: 'AUTH_ERROR' });
  }
};

// ==================== TOKEN GENERATION (permissions removed) ====================

export const generateToken = (user) => {
  const payload = {
    id: user.id,
    userId: user.id,
    username: user.username || user.email,
    user_name: user.username || user.email,
    email: user.email,
    role: user.role,
    role_id: user.role_id || user.bu_role_id,
    bu_id: user.bu_id || user.BU_ID || user.business_unit_id,
    BU_ID: user.bu_id || user.BU_ID || user.business_unit_id,
    business_unit_id: user.bu_id || user.BU_ID || user.business_unit_id,
    BU_ROLE_ID: user.BU_ROLE_ID || user.bu_role_id,
    business_unit: user.business_unit,
    isAdmin: user.isAdmin || (user.BU_ROLE_ID === '1' || user.BU_ROLE_ID === 1)
    // ✅ permissions REMOVED – token stays small
  };

  console.log('🔑 Generating token with payload:', {
    id: payload.id,
    username: payload.username,
    bu_id: payload.bu_id,
    BU_ROLE_ID: payload.BU_ROLE_ID
  });

  return jwt.sign(payload, getSecretKey(), {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// ==================== ALIASES ====================

export const authenticate = protect;
export const hasRole = authorize;
export const auth = protect;

export default {
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
  authenticateWebhook,
  authenticate,
  hasRole,
  auth,
  isAdmin
};