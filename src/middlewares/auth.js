// src/middleware/auth.js - FINAL PRODUCTION-READY VERSION
import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // Sequelize User model
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Get JWT secret safely
const getSecretKey = () => {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT_SECRET or JWT_SECRET_KEY not defined in .env file');
  }
  return secret;
};

// Main authentication middleware
export const authenticate = async (req, res, next) => {
  try {
    // Extract token from Authorization header (Bearer <token>)
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        details: 'Missing or invalid Authorization header. Use: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, getSecretKey());

    // Find user in database (exclude password)
    const user = await User.findOne({
      where: { id: decoded.id }, // Adjust if your user ID field is different (e.g., user_id)
      attributes: { exclude: ['password'] },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        details: 'The account associated with this token no longer exists',
      });
    }

    // Optional: Check if user is active
    if (user.status !== 'Active') {
      return res.status(403).json({
        success: false,
        message: 'Account deactivated',
        details: 'Your account has been deactivated. Contact administrator.',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
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

// Role-based authorization middleware
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user.role || req.user.primary_role || req.user.primary_business_role;

    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'Role not found on user',
        details: 'User object missing role information',
      });
    }

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        details: `Requires one of the following roles: ${allowedRoles.join(', ')}. Current: ${userRole}`,
      });
    }

    next();
  };
};

// Permission-based authorization (more flexible)
export const authorizePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const hasPermission = await req.user.hasPermission?.(permission);

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions',
          details: `Missing required permission: ${permission}`,
        });
      }

      next();
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Permission check failed',
        error: error.message,
      });
    }
  };
};

// Admin-only shortcut
export const adminOnly = authorize('Administrator', 'System Admin');

// Export everything
export default {
  authenticate,
  authorize,
  authorizePermission,
  adminOnly,
  getSecretKey,
};