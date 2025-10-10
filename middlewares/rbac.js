// middleware/rbac.js
import asyncHandler from 'express-async-handler';
import { roleHasPermission, MODULE_PERMISSIONS } from '../constants/roleMapping.js';

export const restrictToPermission = (moduleKey) => asyncHandler(async (req, res, next) => {
  try {
    // Get the required permission for the module
    const permission = MODULE_PERMISSIONS[moduleKey];
    if (!permission) {
      return res.status(400).json({
        success: false,
        message: `No permission defined for module ${moduleKey}`,
        errorCode: 'INVALID_MODULE_KEY',
      });
    }

    // Get user role ID from JWT (set by verifyToken)
    const userRoleId = req.user?.roleId || req.user?.role;
    if (!userRoleId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Role ID not found in JWT',
        errorCode: 'MISSING_ROLE_ID',
      });
    }

    // Check if the role has the required permission
    const hasPermission = await roleHasPermission(userRoleId, permission);
    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: Insufficient permissions',
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        requiredPermission: permission,
      });
    }

    next();
  } catch (error) {
    console.error('RBAC middleware error:', error.message, {
      moduleKey,
      userId: req.user?.userId,
      roleId: req.user?.role,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errorCode: 'RBAC_ERROR',
      error: error.message,
    });
  }
});

export default restrictToPermission;