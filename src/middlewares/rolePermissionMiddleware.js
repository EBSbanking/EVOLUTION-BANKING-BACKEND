// middleware/rolePermissionMiddleware.js
import { roleHasPermission } from '../services/permissionService.js';
import { PERMISSIONS } from '../constants/permissions.js';

// For teller dashboard using role-based permissions
export const checkTellerDashboardAccess = async (req, res, next) => {
  try {
    const { roleId, role } = req.user; // Check both roleId and role
    
    console.log('🔐 Checking teller dashboard access:', { roleId, role });

    if (!roleId) {
      return res.status(401).json({
        success: false,
        message: "User role ID not found"
      });
    }

    // Check for REAL_TIME_STATS permission using role-based system
    const hasPermission = await roleHasPermission(roleId, PERMISSIONS.DASHBOARD.REAL_TIME_STATS);
    
    console.log('📊 Permission check result:', {
      roleId,
      role,
      requiredPermission: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
      hasPermission
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: "Access denied: Insufficient permissions to view teller dashboard"
      });
    }
    
    next();
  } catch (error) {
    console.error('❌ Permission check error:', error);
    return res.status(500).json({
      success: false,
      message: "Error checking permissions"
    });
  }
};

// Generic role-based permission middleware
export const requireRolePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const { roleId } = req.user;
      
      if (!roleId) {
        return res.status(401).json({
          success: false,
          message: "User role ID not found"
        });
      }

      const hasPermission = await roleHasPermission(roleId, permission);
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: `Access denied: Required permission ${permission}`
        });
      }
      
      next();
    } catch (error) {
      console.error('Role permission middleware error:', error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions"
      });
    }
  };
};

// Enhanced authorizeRoles that also checks permissions
export const authorizeRolesWithPermissions = (roles, requiredPermission = null) => {
  return async (req, res, next) => {
    try {
      // First check role access
      if (!req.user || !req.user.role) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: No user role found'
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have access to this role'
        });
      }

      // Then check specific permission if provided
      if (requiredPermission && req.user.roleId) {
        const hasPermission = await roleHasPermission(req.user.roleId, requiredPermission);
        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            message: `Forbidden: Missing required permission ${requiredPermission}`
          });
        }
      }

      next();
    } catch (error) {
      console.error('Authorize roles with permissions error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking access'
      });
    }
  };
};