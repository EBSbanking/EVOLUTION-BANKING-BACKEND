import express from 'express';
import {
  syncPermissions,
  getUserRoleData,
  checkUserPermission,
  createPermissionForRole,
  listAllRoles,
  getPermissionsForRole,
  cloneRolePermissions,
  updatePermissionsForRole,
  patchPermissionsForRole,
  deleteRolePermissions
} from '../controllers/PermissionsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import { 
  requirePermission, 
  requireAllPermissions, 
  requireAnyPermission 
} from '../utils/permissionHelpers.js';
import { roleHasPermission } from '../utils/permissionSync.js';

const router = express.Router();

// Apply authentication to all permission routes
router.use(authenticate);

// Middleware to check if user has admin or permission management role
const requireAdminOrPermissionManager = async (req, res, next) => {
  try {
    const userRole = req.user?.roleId;
    
    if (!userRole) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user is Administrator (1) or Head Human Resources (9)
    const isAdmin = await roleHasPermission(userRole, 'MANAGE_SYSTEM_CONFIG');
    const isPermissionManager = await roleHasPermission(userRole, 'ASSIGN_ROLES');
    
    if (!isAdmin && !isPermissionManager) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Admin or Permission Manager role required.'
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

// Apply role check to all routes
router.use(requireAdminOrPermissionManager);

// Sync Permissions Route - Admin only
router.post('/sync',
  requireAllPermissions(['MANAGE_SYSTEM_CONFIG', 'UPDATE_PERMISSIONS']),
  syncPermissions
);

// User Role Data Routes
router.get('/user/:userId',
  requirePermission('VIEW_PERMISSIONS'),
  getUserRoleData
);

router.get('/user/:userId/permission/:permission',
  requirePermission('VIEW_PERMISSIONS'),
  checkUserPermission
);

// Permission Management Routes
router.post('/roles',
  requirePermission('CREATE_PERMISSION'),
  createPermissionForRole
);

router.get('/roles',
  requirePermission('VIEW_PERMISSIONS'),
  listAllRoles
);

router.get('/roles/:roleId',
  requirePermission('VIEW_PERMISSIONS'),
  getPermissionsForRole
);

router.put('/roles/:roleId',
  requirePermission('UPDATE_PERMISSIONS'),
  updatePermissionsForRole
);

router.patch('/roles/:roleId',
  requirePermission('UPDATE_PERMISSIONS'),
  patchPermissionsForRole
);

router.post('/roles/clone',
  requireAllPermissions(['CREATE_PERMISSION', 'UPDATE_PERMISSIONS']),
  cloneRolePermissions
);

// System Admin Only Routes - Additional admin check
const requireSuperAdmin = async (req, res, next) => {
  try {
    const userRole = req.user?.roleId;
    
    if (!userRole) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const isSuperAdmin = await roleHasPermission(userRole, 'MANAGE_SYSTEM_CONFIG');
    
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Super Admin access required'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Admin check failed'
    });
  }
};

router.delete('/roles/:roleId',
  requireSuperAdmin,
  requireAllPermissions(['MANAGE_SYSTEM_CONFIG', 'UPDATE_PERMISSIONS']),
  deleteRolePermissions
);

export default router;