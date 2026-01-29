// src/routes/PermissionRoutes.js - COMPLETE UPDATED VERSION
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
  requireAnyPermission,
  requireRole,
  createPermissionGuard,
  bypassPermissions,
  checkPermissionWithCache,
  checkAnyPermissionWithCache,
  checkAllPermissionsWithCache
} from '../utils/permissionHelpers.js';
import { roleHasPermission } from '../utils/permissionSync.js';
import { MODULE_PERMISSIONS } from '../constants/roleMapping.js';

const router = express.Router();

// ====================
// ADMIN PERMISSION MANAGEMENT ROUTES
// ====================

// Apply authentication to all permission routes
router.use(authenticate);

// Middleware to check if user has admin or permission management role
const requireAdminOrPermissionManager = async (req, res, next) => {
  try {
    const userRole = req.user?.roleId || req.user?.role_id;
    
    if (!userRole) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Check if user has admin permissions
    const hasAdminPermission = await roleHasPermission(userRole, 'MANAGE_SYSTEM_CONFIG');
    const hasPermissionManagerPermission = await roleHasPermission(userRole, 'ASSIGN_ROLES');
    
    if (!hasAdminPermission && !hasPermissionManagerPermission) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions. Admin or Permission Manager role required.'
      });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({
      success: false,
      message: 'Permission check failed',
      error: error.message
    });
  }
};

// Apply role check to all admin routes
router.use('/admin', requireAdminOrPermissionManager);

// Sync Permissions Route - Admin only
router.post('/admin/sync',
  checkAllPermissionsWithCache(['MANAGE_SYSTEM_CONFIG', 'UPDATE_PERMISSIONS']),
  syncPermissions
);

// User Role Data Routes
router.get('/admin/user/:userId',
  checkPermissionWithCache('VIEW_PERMISSIONS'),
  getUserRoleData
);

router.get('/admin/user/:userId/permission/:permission',
  checkPermissionWithCache('VIEW_PERMISSIONS'),
  checkUserPermission
);

// Permission Management Routes
router.post('/admin/roles',
  checkPermissionWithCache('CREATE_PERMISSION'),
  createPermissionForRole
);

router.get('/admin/roles',
  checkPermissionWithCache('VIEW_PERMISSIONS'),
  listAllRoles
);

router.get('/admin/roles/:roleId',
  checkPermissionWithCache('VIEW_PERMISSIONS'),
  getPermissionsForRole
);

router.put('/admin/roles/:roleId',
  checkPermissionWithCache('UPDATE_PERMISSIONS'),
  updatePermissionsForRole
);

router.patch('/admin/roles/:roleId',
  checkPermissionWithCache('UPDATE_PERMISSIONS'),
  patchPermissionsForRole
);

router.post('/admin/roles/clone',
  checkAllPermissionsWithCache(['CREATE_PERMISSION', 'UPDATE_PERMISSIONS']),
  cloneRolePermissions
);

// Super Admin Only Routes
const requireSuperAdmin = async (req, res, next) => {
  try {
    const userRole = req.user?.roleId || req.user?.role_id;
    
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

router.delete('/admin/roles/:roleId',
  requireSuperAdmin,
  checkAllPermissionsWithCache(['MANAGE_SYSTEM_CONFIG', 'UPDATE_PERMISSIONS']),
  deleteRolePermissions
);

// ====================
// GENERAL PERMISSION-PROTECTED ROUTES
// ====================

// Dashboard routes
router.get('/dashboard', 
  checkPermissionWithCache(MODULE_PERMISSIONS.VIEW_DASHBOARD || 'VIEW_DASHBOARD'), 
  (req, res) => {
    res.json({ 
      success: true, 
      message: 'Dashboard access granted',
      user: { id: req.user?.id, role: req.user?.roleId }
    });
});

// Vault routes using cache-based permissions
router.get('/vaults', 
  checkPermissionWithCache(MODULE_PERMISSIONS.VIEW_VAULTS || 'VIEW_VAULTS'), 
  (req, res) => {
    res.json({ 
      success: true, 
      message: 'Vault access granted' 
    });
});

router.post('/vaults', 
  checkPermissionWithCache(MODULE_PERMISSIONS.CREATE_VAULT || 'CREATE_VAULT'), 
  (req, res) => {
    res.json({ 
      success: true, 
      message: 'Vault creation granted' 
    });
});

// Transaction routes
router.get('/transactions', 
  checkAnyPermissionWithCache([
    MODULE_PERMISSIONS.VIEW_TRANSACTIONS || 'VIEW_TRANSACTIONS',
    MODULE_PERMISSIONS.VIEW_RECENT_TRANSACTIONS || 'VIEW_RECENT_TRANSACTIONS'
  ]), 
  (req, res) => {
    res.json({ 
      success: true, 
      message: 'Transaction access granted' 
    });
});

// Loan repayment routes
router.post('/loan/repayment', 
  checkAllPermissionsWithCache([
    MODULE_PERMISSIONS.MANUAL_LOAN_REPAYMENT || 'MANUAL_LOAN_REPAYMENT',
    MODULE_PERMISSIONS.PROCESS_LOAN_REPAYMENT || 'PROCESS_LOAN_REPAYMENT'
  ]), 
  (req, res) => {
    res.json({ 
      success: true, 
      message: 'Loan repayment access granted' 
    });
});

// Role-based routes using the old system (backward compatibility)
router.get('/admin/reports', 
  requireRole(['Administrator', 'Manager']), 
  (req, res) => {
    res.json({ 
      success: true, 
      message: 'Admin reports access granted' 
    });
});

// Custom permission guard example
const vaultGuard = createPermissionGuard({
  permissions: [
    MODULE_PERMISSIONS.VIEW_VAULTS || 'VIEW_VAULTS', 
    MODULE_PERMISSIONS.MANAGE_VAULT_ACCESS || 'MANAGE_VAULT_ACCESS'
  ],
  roles: ['VAULT_MANAGER', 'BRANCH_MANAGER'],
  requireAll: false
});

router.get('/vault/secure', vaultGuard, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Secure vault access granted' 
  });
});

// ====================
// PERMISSION TESTING & DEBUG ROUTES
// ====================

// Permission test endpoint
router.get('/test/permission/:permission', 
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id;
      const permission = req.params.permission;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const { default: permissionCache } = await import('../utils/permissionCache.js');
      const hasPermission = await permissionCache.checkPermission(userId, permission);
      
      res.json({
        success: true,
        userId,
        permission,
        hasPermission,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
});

// User permissions debug endpoint
router.get('/debug/user-permissions',
  authenticate,
  async (req, res) => {
    try {
      const userId = req.user?.id || req.user?._id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const { default: permissionCache } = await import('../utils/permissionCache.js');
      const permissions = await permissionCache.getUserPermissions(userId);
      
      res.json({
        success: true,
        userId,
        permissionsCount: permissions.length,
        permissions: permissions.slice(0, 20), // First 20 only
        allPermissions: permissions
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
});

// Cache status endpoint
router.get('/debug/cache-status',
  authenticate,
  async (req, res) => {
    try {
      const { default: permissionCache } = await import('../utils/permissionCache.js');
      
      const roles = Array.from(permissionCache.roles.values()).map(role => ({
        id: role.id,
        name: role.name,
        permissionsCount: role.permissions?.length || 0,
        source: role.source
      }));
      
      res.json({
        success: true,
        cacheInitialized: permissionCache.initialized,
        useDatabase: permissionCache.useDatabase,
        totalRoles: permissionCache.roles.size,
        roles: roles
      });
      
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
});

// Development bypass route (only in development)
if (process.env.NODE_ENV === 'development') {
  router.get('/test/bypass', bypassPermissions(), (req, res) => {
    res.json({ 
      success: true, 
      message: 'Bypass route accessed',
      environment: 'development'
    });
  });
  
  // Force cache refresh
  router.post('/debug/refresh-cache', 
    authenticate,
    async (req, res) => {
      try {
        const { default: permissionCache } = await import('../utils/permissionCache.js');
        await permissionCache.refresh();
        
        res.json({
          success: true,
          message: 'Permission cache refreshed',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message
        });
      }
  });
}

// ====================
// HEALTH CHECK ROUTES
// ====================

router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Permission Management API',
    status: 'operational',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Permission system health check
router.get('/health/permissions', async (req, res) => {
  try {
    const { default: permissionCache } = await import('../utils/permissionCache.js');
    
    const health = {
      success: true,
      cache: {
        initialized: permissionCache.initialized,
        roleCount: permissionCache.roles.size,
        databaseConnected: permissionCache.useDatabase
      },
      timestamp: new Date().toISOString()
    };
    
    res.json(health);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Permission system health check failed',
      error: error.message
    });
  }
});

export default router;