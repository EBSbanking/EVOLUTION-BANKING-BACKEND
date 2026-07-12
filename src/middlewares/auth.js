// src/middleware/auth.js - FIXED WITH PROPER ERROR HANDLING

import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import dotenv from 'dotenv';
import path from 'path';
import { Op } from 'sequelize';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const getSecretKey = () => {
  const secret = process.env.JWT_SECRET || process.env.JWT_SECRET_KEY;
  if (!secret) {
    throw new Error('JWT_SECRET or JWT_SECRET_KEY not defined in .env file');
  }
  return secret;
};

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

    // ✅ Try to find user with BusinessRole association
    let user = null;
    try {
      // Dynamically import BusinessRole to avoid circular dependency
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
      // Fallback: Find user without association
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

    // ✅ Convert to plain object
    const userPlain = user.toJSON ? user.toJSON() : user;
    
    // ✅ Get BU_ID - try multiple sources
    let BU_ID = null;
    let businessRole = null;
    
    // Check if businessRole is attached
    if (user.businessRole) {
      businessRole = user.businessRole;
      BU_ID = businessRole.BU_ID;
      console.log(`✅ Found BU_ID from business role: ${BU_ID}`);
    } else if (userPlain.BU_ROLE_ID) {
      // Try to fetch business role manually
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
    
    // ✅ If still no BU_ID, check if user is admin (ROLE_ID = 1)
    const isAdmin = parseInt(userPlain.BU_ROLE_ID) === 1 || 
                    userPlain.roleId === 1 || 
                    userPlain.role_id === 1 ||
                    userPlain.primary_business_role === 'Administrator';
    
    // For admin users, set BU_ID to 1 if not found
    if (isAdmin && !BU_ID) {
      BU_ID = 1;
      console.log(`✅ Admin user detected, setting BU_ID to 1`);
    }

    console.log(`🔍 User found: ${userPlain.user_name} (ID: ${userPlain.id || userPlain.user_id})`);
    console.log(`🔍 User BU_ROLE_ID: ${userPlain.BU_ROLE_ID}`);
    console.log(`🔍 User BU_ID: ${BU_ID}`);
    console.log(`🔍 Is Admin: ${isAdmin}`);

    // ✅ Attach user to request
    req.user = userPlain;
    req.user.roleId = parseInt(decoded.roleId) || parseInt(decoded.role_id) || parseInt(userPlain.role_id) || parseInt(userPlain.BU_ROLE_ID);
    req.user.roleName = decoded.role || userPlain.role || userPlain.primary_role || userPlain.role_name || userPlain.primary_business_role || 'Staff';
    req.user.BU_ID = BU_ID;
    req.user.businessRole = businessRole;
    req.user.isAdmin = isAdmin;
    req.user.isSupervisor = businessRole?.SUPERVISOR_FG === 'Y' || false;
    req.user.canPostTransactions = businessRole?.ALLOW_TXN_POSTING_FG === 'Y' || false;

    console.log(`✅ Authenticated user: ${userPlain.user_name}, BU_ID: ${req.user.BU_ID}, isAdmin: ${req.user.isAdmin}`);

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

// ==================== AUTHORIZE (Role-based) ====================
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user.roleName || req.user.role || req.user.primary_role || req.user.primary_business_role;
    if (!userRole) {
      return res.status(403).json({
        success: false,
        message: 'Role not found on user',
      });
    }
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
        details: `Requires one of: ${allowedRoles.join(', ')}. Current: ${userRole}`,
      });
    }
    next();
  };
};

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

// ==================== IS ADMIN ====================
export const isAdmin = (req, res, next) => {
  const roleId = parseInt(req.user?.roleId || req.user?.role_id || req.user?.BU_ROLE_ID);
  const roleName = req.user?.roleName || req.user?.role || req.user?.primary_role || req.user?.role_name || req.user?.primary_business_role;

  if (roleId === 1 || roleName === 'Administrator' || roleName === 'System Admin' || req.user?.isAdmin === true) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Admin access required.',
    details: 'This operation is restricted to administrators.',
  });
};

export const adminOnly = authorize('Administrator', 'System Admin');

export default {
  authenticate,
  authorize,
  authorizePermission,
  isAdmin,
  adminOnly,
  getSecretKey,
};