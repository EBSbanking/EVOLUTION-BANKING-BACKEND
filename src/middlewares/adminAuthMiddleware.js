// src/middlewares/adminAuthMiddleware.js
import jwt from 'jsonwebtoken';
import AdminUser from '../models/AdminUser.js';

// ======================
// ROLE MAPPING (Directly defined to avoid import issues)
// ======================
const ROLE_MAPPING = {
  1: { id: 1, ROLE_NM: 'Administrator' },
  2: { id: 2, ROLE_NM: 'Head Banking Services' },
  3: { id: 3, ROLE_NM: 'Loan Processing Officer' },
  4: { id: 4, ROLE_NM: 'Senior Financial Accountant' },
  5: { id: 5, ROLE_NM: 'Internal Control Officer' },
  6: { id: 6, ROLE_NM: 'Internal Control Manager' },
  7: { id: 7, ROLE_NM: 'Head of Credit' },
  8: { id: 8, ROLE_NM: 'Internal Audit Manager' },
  9: { id: 9, ROLE_NM: 'Head Human Resources' },
  10: { id: 10, ROLE_NM: 'Human Resource Officer' },
  11: { id: 11, ROLE_NM: 'IT Manager' },
  12: { id: 12, ROLE_NM: 'Financial Accountant' },
  13: { id: 13, ROLE_NM: 'Financial Accountant Manager' },
  14: { id: 14, ROLE_NM: 'Chief Financial Officer' },
  15: { id: 15, ROLE_NM: 'Chief Executive Officer' },
  16: { id: 16, ROLE_NM: 'Treasurer' },
  17: { id: 17, ROLE_NM: 'Loan Processing Supervisor' },
  18: { id: 18, ROLE_NM: 'Senior Financial Accountant' },
  19: { id: 19, ROLE_NM: 'Branch Manager' },
  20: { id: 20, ROLE_NM: 'Branch Operation Supervisor' },
  21: { id: 21, ROLE_NM: 'Chief Operation Officer' },
  22: { id: 22, ROLE_NM: 'Marketing Manager' },
  23: { id: 23, ROLE_NM: 'Payment and Reconciliation USD' },
  24: { id: 24, ROLE_NM: 'EOD Operator' },
  25: { id: 25, ROLE_NM: 'Recovery Officer' },
  26: { id: 26, ROLE_NM: 'Relationship Development Officer' },
  27: { id: 27, ROLE_NM: 'Customer Relationship Officer' },
  28: { id: 28, ROLE_NM: 'Customer Service Officer' },
  29: { id: 29, ROLE_NM: 'Teller' },
  30: { id: 30, ROLE_NM: 'Head Teller' },
  31: { id: 31, ROLE_NM: 'Customer Relationship Supervisor' },
  32: { id: 32, ROLE_NM: 'Recovery Team Lead' },
  33: { id: 33, ROLE_NM: 'Business Analyst' },
  34: { id: 34, ROLE_NM: 'Credit Risk Analyst' },
  35: { id: 35, ROLE_NM: 'Head of Digital Banking' },
  36: { id: 36, ROLE_NM: 'Agency Banking Officer' },
  37: { id: 37, ROLE_NM: 'Channel Manager' },
};

// Cache for roles to avoid repeated database queries
let cachedRoles = null;
let rolesLoaded = false;

/**
 * Get fallback roles from ROLE_MAPPING
 */
const getFallbackRoles = () => {
  try {
    const roles = Object.entries(ROLE_MAPPING).map(([id, role]) => ({
      role_id: parseInt(id),
      role_name: role.ROLE_NM ? role.ROLE_NM.toLowerCase().replace(/\s+/g, '_') : `role_${id}`,
      description: role.ROLE_NM || `Role ${id}`,
      active: 1,
      created_at: new Date(),
      updated_at: new Date()
    }));
    console.log(`ℹ️ Using ${roles.length} fallback roles from ROLE_MAPPING`);
    return roles;
  } catch (error) {
    console.error('❌ Failed to get fallback roles:', error.message);
    return [
      { role_id: 1, role_name: 'administrator', description: 'Administrator', active: 1 },
      { role_id: 2, role_name: 'manager', description: 'Manager', active: 1 },
      { role_id: 3, role_name: 'user', description: 'User', active: 1 }
    ];
  }
};

/**
 * Load roles from database with fallback to ROLE_MAPPING
 * Updated to match your actual table schema (role_id, role_name)
 */
const loadRoles = async () => {
  // Return cached roles if already loaded successfully
  if (rolesLoaded && cachedRoles) {
    return cachedRoles;
  }

  try {
    let sequelize;
    let QueryTypes;
    
    try {
      const dbModule = await import('../../config/db.js');
      sequelize = dbModule.sequelize || dbModule.default;
      const sequelizeModule = await import('sequelize');
      QueryTypes = sequelizeModule.QueryTypes;
    } catch (importError) {
      console.log('ℹ️ Could not import database modules, using ROLE_MAPPING fallback');
      const fallbackRoles = getFallbackRoles();
      cachedRoles = fallbackRoles;
      rolesLoaded = true;
      return fallbackRoles;
    }

    if (!sequelize) {
      console.log('ℹ️ No database connection, using ROLE_MAPPING fallback');
      const fallbackRoles = getFallbackRoles();
      cachedRoles = fallbackRoles;
      rolesLoaded = true;
      return fallbackRoles;
    }

    let roles = null;

    // Try 1: Query roles_vw view
    try {
      roles = await sequelize.query(
        'SELECT role_id, role_name, description, active, created_at, updated_at FROM roles_vw ORDER BY role_id',
        { type: QueryTypes.SELECT }
      );
      if (roles && roles.length > 0) {
        console.log(`✅ Loaded ${roles.length} roles from roles_vw`);
        cachedRoles = roles;
        rolesLoaded = true;
        return roles;
      }
    } catch (viewError) {
      console.log('ℹ️ roles_vw not found, trying roles table');
    }

    // Try 2: Query roles table with correct column names
    try {
      roles = await sequelize.query(
        'SELECT role_id, role_name, description, active, created_at, updated_at FROM roles ORDER BY role_id',
        { type: QueryTypes.SELECT }
      );
      if (roles && roles.length > 0) {
        console.log(`✅ Loaded ${roles.length} roles from roles table`);
        cachedRoles = roles;
        rolesLoaded = true;
        return roles;
      }
    } catch (tableError) {
      console.log('ℹ️ roles table query failed, using ROLE_MAPPING fallback');
    }

    // If all database queries fail, use ROLE_MAPPING as fallback
    const fallbackRoles = getFallbackRoles();
    cachedRoles = fallbackRoles;
    rolesLoaded = true;
    return fallbackRoles;

  } catch (error) {
    console.error('❌ Failed to load roles:', error.message);
    // Return fallback roles
    const fallbackRoles = getFallbackRoles();
    cachedRoles = fallbackRoles;
    rolesLoaded = true;
    return fallbackRoles;
  }
};

/**
 * Get user roles by role ID
 */
const getUserRoles = async (roleId) => {
  try {
    const roles = await loadRoles();
    if (typeof roleId === 'number') {
      return roles.filter(r => r.role_id === roleId);
    }
    if (typeof roleId === 'string') {
      const roleName = roleId.toLowerCase().replace(/\s+/g, '_');
      return roles.filter(r => r.role_name === roleName || r.role_name === roleId);
    }
    return [];
  } catch (error) {
    console.error('❌ Failed to get user roles:', error.message);
    return [];
  }
};

export const protectAdmin = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1].trim();
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Find admin by username
    const admin = await AdminUser.findOne({
      where: { username: decoded.user_name || decoded.username }
    });

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Not authorized, admin not found' });
    }

    // Load roles (this will handle missing tables gracefully)
    const roles = await loadRoles();
    
    // Get the admin's specific role if they have a roleId
    let userRoles = [];
    if (admin.roleId) {
      userRoles = await getUserRoles(admin.roleId);
    }
    
    // Attach user info to request
    req.user = { 
      id: admin.id, 
      username: admin.username, 
      role: 'admin_console',
      roleId: admin.roleId || null,
      roles: roles, // All available roles in the system
      userRoles: userRoles // User's specific roles
    };
    
    next();
  } catch (error) {
    console.error('Admin auth error:', error.message);
    return res.status(401).json({ success: false, message: 'Not authorized, token invalid' });
  }
};

export const isAdminConsole = (req, res, next) => {
  next();
};

// Export default for backward compatibility
export default {
  protectAdmin,
  isAdminConsole,
  loadRoles,
  getUserRoles
};