// src/utils/permissionHelpers.js - FIXED bypassPermissions function
import { getAllPermissions, isValidPermission } from '../constants/permissions.js';
import { getUser, getUserRole, getRole } from '../models/index.js';

// In-memory cache for permissions
const permissionCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Helper function to get the Role model
const getRoleModel = () => {
  try {
    // Try to get Role from models
    const Role = getRole ? getRole() : null;
    if (Role) return Role;
    
    // Fallback: try to import it directly
    console.warn('getRole() not found, trying alternative approach');
    return null;
  } catch (error) {
    console.warn('Error getting Role model:', error.message);
    return null;
  }
};

// ====================
// CACHE FUNCTIONS
// ====================

/**
 * Get cache key for user permissions
 * @param {number} userId - User ID
 * @returns {string} Cache key
 */
const getCacheKey = (userId) => `user:${userId}:permissions`;

/**
 * Cache user permissions
 * @param {number} userId - User ID
 * @param {Array} permissions - User permissions
 */
const cachePermissions = (userId, permissions) => {
  const cacheKey = getCacheKey(userId);
  permissionCache.set(cacheKey, {
    permissions,
    timestamp: Date.now()
  });
};

/**
 * Get cached permissions for user
 * @param {number} userId - User ID
 * @returns {Array|null} Cached permissions or null
 */
const getCachedPermissions = (userId) => {
  const cacheKey = getCacheKey(userId);
  const cached = permissionCache.get(cacheKey);
  
  if (!cached) return null;
  
  // Check if cache is expired
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    permissionCache.delete(cacheKey);
    return null;
  }
  
  return cached.permissions;
};

/**
 * Clear cache for specific user
 * @param {number} userId - User ID
 */
export const clearUserPermissionCache = (userId) => {
  const cacheKey = getCacheKey(userId);
  permissionCache.delete(cacheKey);
};

/**
 * Clear all permission cache
 */
export const clearAllPermissionCache = () => {
  permissionCache.clear();
};

// ====================
// BYPASS PERMISSIONS - FIXED VERSION
// ====================

/**
 * Check if permissions should be bypassed (for development/admin purposes)
 * When called with no arguments, returns middleware function
 * When called with req argument, returns boolean
 */
export function bypassPermissions(reqOrOptions) {
  // If called with no arguments or as a function factory
  if (reqOrOptions === undefined || reqOrOptions === null) {
    // Return middleware function
    return (req, res, next) => {
      // Check for bypass conditions
      if (process.env.NODE_ENV === 'development' && process.env.BYPASS_PERMISSIONS === 'true') {
        console.warn('⚠️ Permissions bypassed in development mode');
        return next();
      }
      
      // Check admin role
      const user = req.user || req.session?.user || {};
      if (user.roles && Array.isArray(user.roles)) {
        const adminRoles = ['Administrator', 'Super Admin', 'Admin', 'SUPERUSER'];
        const hasAdminRole = user.roles.some(role => 
          adminRoles.includes(role) || adminRoles.includes(role?.name)
        );
        if (hasAdminRole) {
          return next();
        }
      }
      
      // Check bypass header
      const bypassHeader = req.headers['x-bypass-permissions'];
      if (bypassHeader === process.env.BYPASS_PERMISSIONS_TOKEN) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'Permission bypass not allowed'
      });
    };
  }
  
  // If called with req object, return boolean
  if (typeof reqOrOptions === 'object' && reqOrOptions !== null) {
    const req = reqOrOptions;
    
    // Check for development mode bypass
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_PERMISSIONS === 'true') {
      return true;
    }
    
    const user = req.user || req.session?.user || {};
    if (user.roles && Array.isArray(user.roles)) {
      const adminRoles = ['Administrator', 'Super Admin', 'Admin', 'SUPERUSER'];
      const hasAdminRole = user.roles.some(role => 
        adminRoles.includes(role) || adminRoles.includes(role?.name)
      );
      if (hasAdminRole) {
        return true;
      }
    }
    
    const bypassHeader = req.headers['x-bypass-permissions'];
    if (bypassHeader === process.env.BYPASS_PERMISSIONS_TOKEN) {
      return true;
    }
    
    return false;
  }
  
  // Default case
  return false;
}

// ====================
// CORE PERMISSION CHECKING FUNCTIONS
// ====================

/**
 * Check a single permission with caching support - RETURNS MIDDLEWARE
 * @param {string} requiredPermission - Required permission
 * @returns {Function} Express middleware
 */
export const checkPermissionWithCache = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Check if permissions should be bypassed
      if (bypassPermissions(req)) {
        return next();
      }
      
      const user = req.user || req.session?.user || {};
      const userId = user.id || user.user_id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      // Try to get permissions from cache first
      let permissions = getCachedPermissions(userId);
      
      if (!permissions) {
        // Cache miss, fetch from database
        permissions = await getUserPermissionsFromDb(userId);
        // Cache the result
        cachePermissions(userId, permissions);
      }
      
      // Check for wildcard permission
      if (permissions.includes('*')) {
        return next();
      }
      
      // Check for specific permission
      if (permissions.includes(requiredPermission) && isValidPermission(requiredPermission)) {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${requiredPermission}`,
        requiredPermission,
        userId
      });
      
    } catch (error) {
      console.error('Permission middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission check failed',
        error: error.message
      });
    }
  };
};

/**
 * Check ANY permissions with caching support - RETURNS MIDDLEWARE
 * @param {Array|string} requiredPermissions - Required permission(s)
 * @returns {Function} Express middleware
 */
export const checkAnyPermissionWithCache = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      // Check if permissions should be bypassed
      if (bypassPermissions(req)) {
        return next();
      }
      
      const user = req.user || req.session?.user || {};
      const userId = user.id || user.user_id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      if (!Array.isArray(requiredPermissions)) {
        requiredPermissions = [requiredPermissions];
      }
      
      // Try to get permissions from cache first
      let permissions = getCachedPermissions(userId);
      
      if (!permissions) {
        // Cache miss, fetch from database
        permissions = await getUserPermissionsFromDb(userId);
        // Cache the result
        cachePermissions(userId, permissions);
      }
      
      // Check for wildcard permission
      if (permissions.includes('*')) {
        return next();
      }
      
      // Check for any of the required permissions
      const hasAnyPermission = requiredPermissions.some(permission => 
        permissions.includes(permission) && isValidPermission(permission)
      );
      
      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions. None of the required permissions found',
          requiredPermissions: requiredPermissions,
          userId: userId
        });
      }
      
      next();
    } catch (error) {
      console.error('Require any permission error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission check failed',
        error: error.message
      });
    }
  };
};

/**
 * Check ALL permissions with caching support - RETURNS MIDDLEWARE
 * @param {Array|string} requiredPermissions - Required permission(s)
 * @returns {Function} Express middleware
 */
export const checkAllPermissionsWithCache = (requiredPermissions) => {
  return async (req, res, next) => {
    try {
      // Check if permissions should be bypassed
      if (bypassPermissions(req)) {
        return next();
      }
      
      const user = req.user || req.session?.user || {};
      const userId = user.id || user.user_id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      if (!Array.isArray(requiredPermissions)) {
        requiredPermissions = [requiredPermissions];
      }
      
      // Validate all permissions first
      const invalidPermissions = requiredPermissions.filter(p => !isValidPermission(p));
      if (invalidPermissions.length > 0) {
        console.warn(`Invalid permissions requested: ${invalidPermissions.join(', ')}`);
        return res.status(400).json({
          success: false,
          message: 'Invalid permissions requested',
          invalidPermissions
        });
      }
      
      // Try to get permissions from cache first
      let permissions = getCachedPermissions(userId);
      
      if (!permissions) {
        // Cache miss, fetch from database
        permissions = await getUserPermissionsFromDb(userId);
        // Cache the result
        cachePermissions(userId, permissions);
      }
      
      // Check if user has wildcard permission
      if (permissions.includes('*')) {
        return next();
      }
      
      // Check if user has all required permissions
      const hasAllPermissions = requiredPermissions.every(permission => 
        permissions.includes(permission)
      );
      
      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions. All required permissions not met',
          requiredPermissions: requiredPermissions,
          userId: userId
        });
      }
      
      next();
    } catch (error) {
      console.error('Error checking all permissions with cache:', error);
      res.status(500).json({
        success: false,
        message: 'Permission check failed',
        error: error.message
      });
    }
  };
};

// ====================
// DATABASE FUNCTIONS
// ====================

/**
 * Get user's roles from database
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of role objects
 */
export async function getUserRolesFromDb(userId) {
  try {
    const User = getUser();
    if (!User) {
      console.warn('User model not initialized');
      return [];
    }
    
    // Try to get user with roles
    const user = await User.findOne({
      where: { id: userId },
      // Include roles if there's an association
      include: [{
        model: getRoleModel(),
        as: 'roles',
        through: { attributes: [] },
        where: { is_active: true },
        required: false
      }]
    });
    
    // If roles association exists, return it
    if (user && user.roles) {
      return user.roles;
    }
    
    // Fallback: Check user's roles field (JSON array)
    if (user && user.roles && Array.isArray(user.roles)) {
      // Return mock role objects based on role names
      return user.roles.map(roleName => ({
        name: roleName,
        code: roleName.toUpperCase(),
        permissions: [] // We'll fetch permissions separately
      }));
    }
    
    return [];
  } catch (error) {
    console.error('Error getting user roles from DB:', error);
    return [];
  }
}

/**
 * Get user's permissions from database (with caching)
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of permission strings
 */
export async function getUserPermissionsFromDb(userId) {
  try {
    // First try to get roles from database
    const roles = await getUserRolesFromDb(userId);
    const allPermissions = new Set();
    
    // For each role, get its permissions
    for (const role of roles) {
      // If role has permissions property (from JSON field)
      if (role.permissions && Array.isArray(role.permissions)) {
        role.permissions.forEach(perm => {
          if (perm === '*') {
            // If wildcard permission, add all system permissions
            getAllPermissions().forEach(p => allPermissions.add(p));
          } else if (isValidPermission(perm)) {
            allPermissions.add(perm);
          }
        });
      } else {
        // Try to get permissions from Role model
        const RoleModel = getRoleModel();
        if (RoleModel && role.id) {
          try {
            const roleWithPerms = await RoleModel.findOne({
              where: { id: role.id, is_active: true }
            });
            
            if (roleWithPerms && roleWithPerms.permissions) {
              const permissions = JSON.parse(roleWithPerms.permissions || '[]');
              permissions.forEach(perm => {
                if (perm === '*') {
                  getAllPermissions().forEach(p => allPermissions.add(p));
                } else if (isValidPermission(perm)) {
                  allPermissions.add(perm);
                }
              });
            }
          } catch (error) {
            console.warn('Error fetching permissions for role:', error.message);
          }
        }
      }
    }
    
    // Also check user's direct permissions field
    try {
      const User = getUser();
      if (User) {
        const user = await User.findOne({
          where: { id: userId },
          attributes: ['permissions']
        });
        
        if (user && user.permissions && Array.isArray(user.permissions)) {
          user.permissions.forEach(perm => {
            if (perm && isValidPermission(perm)) {
              allPermissions.add(perm);
            }
          });
        }
      }
    } catch (error) {
      console.warn('Error fetching user direct permissions:', error.message);
    }
    
    return Array.from(allPermissions);
  } catch (error) {
    console.error('Error getting user permissions from DB:', error);
    return [];
  }
}

// ====================
// LEGACY FUNCTIONS (for backward compatibility)
// ====================

/**
 * Legacy requirePermission function (backward compatibility)
 * @param {string} permission - Required permission
 * @returns {Function} Express middleware
 */
export const requirePermission = (permission) => {
  return checkPermissionWithCache(permission);
};

/**
 * Legacy requireAllPermissions function (backward compatibility)
 * @param {Array|string} permissions - Required permissions
 * @returns {Function} Express middleware
 */
export const requireAllPermissions = (permissions) => {
  return checkAllPermissionsWithCache(permissions);
};

/**
 * Legacy requireAnyPermission function (backward compatibility)
 * @param {Array|string} permissions - Required permissions
 * @returns {Function} Express middleware
 */
export const requireAnyPermission = (permissions) => {
  return checkAnyPermissionWithCache(permissions);
};

/**
 * Legacy requireRole function (backward compatibility)
 * @param {Array|string} requiredRoles - Required roles
 * @returns {Function} Express middleware
 */
export const requireRole = (requiredRoles) => {
  return async (req, res, next) => {
    try {
      // Check if permissions should be bypassed
      if (bypassPermissions(req)) {
        return next();
      }
      
      const user = req.user || req.session?.user || {};
      const userId = user.id || user.user_id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const roles = await getUserRolesFromDb(userId);
      const userRoleNames = roles.map(role => role.name || role.code);
      
      const roleArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
      const hasRole = roleArray.some(roleName => 
        userRoleNames.includes(roleName)
      );
      
      if (!hasRole) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient role privileges',
          requiredRoles: roleArray,
          userId: userId
        });
      }
      
      next();
    } catch (error) {
      console.error('Role middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Role check failed',
        error: error.message
      });
    }
  };
};

/**
 * Legacy createPermissionGuard function (backward compatibility)
 * @param {Object} options - Guard options
 * @returns {Function} Express middleware
 */
export const createPermissionGuard = (options = {}) => {
  const { permissions, roles, requireAll = true } = options;
  
  return async (req, res, next) => {
    try {
      // Check if permissions should be bypassed
      if (bypassPermissions(req)) {
        return next();
      }
      
      const user = req.user || req.session?.user || {};
      const userId = user.id || user.user_id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      // Check roles first if specified
      if (roles && roles.length > 0) {
        const userRoles = await getUserRolesFromDb(userId);
        const userRoleNames = userRoles.map(role => role.name || role.code);
        const hasRequiredRole = roles.some(role => userRoleNames.includes(role));
        
        if (hasRequiredRole) {
          return next();
        }
      }
      
      // Check permissions
      if (permissions && permissions.length > 0) {
        const userPermissions = await getUserPermissionsFromDb(userId);
        
        // Check for wildcard permission
        if (userPermissions.includes('*')) {
          return next();
        }
        
        if (requireAll) {
          const hasAll = permissions.every(permission => 
            userPermissions.includes(permission) && isValidPermission(permission)
          );
          
          if (hasAll) {
            return next();
          }
        } else {
          const hasAny = permissions.some(permission => 
            userPermissions.includes(permission) && isValidPermission(permission)
          );
          
          if (hasAny) {
            return next();
          }
        }
      }
      
      return res.status(403).json({
        success: false,
        message: 'Access denied by permission guard',
        options
      });
      
    } catch (error) {
      console.error('Permission guard error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission check failed',
        error: error.message
      });
    }
  };
};

// ====================
// HELPER FUNCTIONS
// ====================

/**
 * Simple legacy hasPermission function for backward compatibility
 * @param {Array} userPermissions - User's permissions array
 * @param {string} requiredPermission - Required permission
 * @returns {boolean} True if user has permission
 */
export const hasPermission = (userPermissions, requiredPermission) => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }
  
  if (!isValidPermission(requiredPermission)) {
    return false;
  }
  
  return userPermissions.includes(requiredPermission) || userPermissions.includes('*');
};

/**
 * Check if user has a specific permission (with caching)
 * @param {number} userId - User ID
 * @param {string} requiredPermission - Required permission string
 * @returns {Promise<boolean>} True if user has permission
 */
export async function hasPermissionFromDb(userId, requiredPermission) {
  try {
    if (!isValidPermission(requiredPermission)) {
      console.warn(`Permission "${requiredPermission}" is not a valid system permission`);
      return false;
    }
    
    // Try to get permissions from cache first
    let permissions = getCachedPermissions(userId);
    
    if (!permissions) {
      // Cache miss, fetch from database
      permissions = await getUserPermissionsFromDb(userId);
      // Cache the result
      cachePermissions(userId, permissions);
    }
    
    // Check for wildcard permission
    if (permissions.includes('*')) {
      return true;
    }
    
    // Check for specific permission
    return permissions.includes(requiredPermission);
  } catch (error) {
    console.error('Error checking permission from DB:', error);
    return false;
  }
}

/**
 * Check if user has ANY of the required permissions (with caching)
 * @param {number} userId - User ID
 * @param {Array|string} requiredPermissions - Required permission(s)
 * @returns {Promise<boolean>} True if user has at least one permission
 */
export async function hasAnyPermissionFromDb(userId, requiredPermissions) {
  try {
    if (!Array.isArray(requiredPermissions)) {
      requiredPermissions = [requiredPermissions];
    }
    
    // Try to get permissions from cache first
    let permissions = getCachedPermissions(userId);
    
    if (!permissions) {
      // Cache miss, fetch from database
      permissions = await getUserPermissionsFromDb(userId);
      // Cache the result
      cachePermissions(userId, permissions);
    }
    
    // Check for wildcard permission
    if (permissions.includes('*')) {
      return true;
    }
    
    // Check for any of the required permissions
    return requiredPermissions.some(permission => 
      permissions.includes(permission) && isValidPermission(permission)
    );
  } catch (error) {
    console.error('Error in hasAnyPermissionFromDb:', error);
    return false;
  }
}

/**
 * Extract user permissions from request object (with caching)
 * @param {Object} req - Express request object
 * @returns {Promise<Array>} Array of user permissions
 */
export async function extractUserPermissionsFromReq(req) {
  try {
    const user = req.user || req.session?.user || {};
    
    // First check if permissions are already in request
    if (user.permissions && Array.isArray(user.permissions)) {
      return user.permissions;
    }
    
    // Try to get from DB with caching
    if (user.id || user.user_id) {
      const userId = user.id || user.user_id;
      
      // Try cache first
      let permissions = getCachedPermissions(userId);
      
      if (!permissions) {
        // Cache miss, fetch from DB
        permissions = await getUserPermissionsFromDb(userId);
        // Cache the result
        cachePermissions(userId, permissions);
      }
      
      return permissions;
    }
    
    return [];
  } catch (error) {
    console.error('Error extracting user permissions from request:', error);
    return [];
  }
}

// ====================
// UTILITY FUNCTIONS (not middleware)
// ====================

/**
 * Utility function to check all permissions (not middleware)
 * @param {number} userId - User ID
 * @param {Array|string} requiredPermissions - Required permission(s)
 * @returns {Promise<boolean>} True if user has all permissions
 */
export const checkAllPermissionsUtil = async (userId, requiredPermissions) => {
  try {
    if (!Array.isArray(requiredPermissions)) {
      requiredPermissions = [requiredPermissions];
    }
    
    // Validate all permissions first
    const invalidPermissions = requiredPermissions.filter(p => !isValidPermission(p));
    if (invalidPermissions.length > 0) {
      console.warn(`Invalid permissions requested: ${invalidPermissions.join(', ')}`);
      return false;
    }
    
    // Try to get permissions from cache first
    let permissions = getCachedPermissions(userId);
    
    if (!permissions) {
      // Cache miss, fetch from database
      permissions = await getUserPermissionsFromDb(userId);
      // Cache the result
      cachePermissions(userId, permissions);
    }
    
    // Check if user has wildcard permission
    if (permissions.includes('*')) {
      return true;
    }
    
    // Check if user has all required permissions
    return requiredPermissions.every(permission => 
      permissions.includes(permission)
    );
  } catch (error) {
    console.error('Error checking all permissions:', error);
    return false;
  }
};

/**
 * Utility function to check any permissions (not middleware)
 * @param {number} userId - User ID
 * @param {Array|string} requiredPermissions - Required permission(s)
 * @returns {Promise<boolean>} True if user has any of the permissions
 */
export const checkAnyPermissionsUtil = async (userId, requiredPermissions) => {
  try {
    if (!Array.isArray(requiredPermissions)) {
      requiredPermissions = [requiredPermissions];
    }
    
    // Try to get permissions from cache first
    let permissions = getCachedPermissions(userId);
    
    if (!permissions) {
      // Cache miss, fetch from database
      permissions = await getUserPermissionsFromDb(userId);
      // Cache the result
      cachePermissions(userId, permissions);
    }
    
    // Check for wildcard permission
    if (permissions.includes('*')) {
      return true;
    }
    
    // Check for any of the required permissions
    return requiredPermissions.some(permission => 
      permissions.includes(permission) && isValidPermission(permission)
    );
  } catch (error) {
    console.error('Error checking any permissions:', error);
    return false;
  }
};

// ====================
// DEFAULT EXPORT
// ====================

export default {
  // Cache functions
  clearUserPermissionCache,
  clearAllPermissionCache,
  
  // Bypass function
  bypassPermissions,
  
  // Core cached middleware functions
  checkPermissionWithCache,
  checkAnyPermissionWithCache,
  checkAllPermissionsWithCache,
  
  // Utility functions (not middleware)
  checkAllPermissionsUtil,
  checkAnyPermissionsUtil,
  
  // Database functions
  getUserRolesFromDb,
  getUserPermissionsFromDb,
  hasPermissionFromDb,
  hasAnyPermissionFromDb,
  extractUserPermissionsFromReq,
  
  // Legacy functions for backward compatibility
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireRole,
  createPermissionGuard,
  hasPermission
};