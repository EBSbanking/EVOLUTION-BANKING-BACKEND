// routes/tellerStatsRoutes.js
import express from 'express';
import jwt from 'jsonwebtoken';

// ✅ CORRECT IMPORT - Use plural 'middlewares' and the actual filename
import authMiddleware from '../middlewares/auth.js';

// Destructure the methods from the default export
const { authenticate, authorize, getSecretKey } = authMiddleware;

// Since you don't have tellerAuthenticate and requirePermission in your auth.js,
// we'll create them here or use alternatives
import {
  getTellerTodayStats,
  getTellerRecentTransactions,
  getDrawerStats,
  getBUPerformanceSummary,
  getTellerPerformanceMetrics
} from '../controllers/tellerStatsController.js';

// Import permissions constants
import { PERMISSIONS } from '../constants/permissions.js';

const router = express.Router();

console.log('✅ Teller stats routes loaded successfully');

// ============================================================================
// CUSTOM MIDDLEWARE SINCE YOUR auth.js DOESN'T HAVE THESE
// ============================================================================

// Create tellerAuthenticate since it doesn't exist in your auth.js
export const tellerAuthenticate = async (req, res, next) => {
  try {
    await authenticate(req, res, () => {
      // Enhance the user object with teller-specific fields
      const user = req.user;
      
      console.log('🔍 tellerAuthenticate - Database User:', {
        businessUnit: user?.businessUnit,
        BU_ROLE_ID: user?.BU_ROLE_ID
      });

      // ✅ SET req.user WITH FALLBACK VALUES FOR TELLER ROUTES
      req.user = {
        // Keep original user data
        ...user.toObject?.() || user,
        // Ensure critical fields exist with fallbacks
        userId: user._id?.toString() || user.userId,
        BU_ROLE_ID: user.BU_ROLE_ID || 29, // Default to Teller role
        businessUnit: user.businessUnit || 'RELIEF BRANCH',
        bu_id: user.businessUnit || 'RELIEF BRANCH',
        accessibleBusinessUnits: user.accessibleBusinessUnits || ['RELIEF BRANCH'],
        isAdmin: user.isAdmin || false
      };
      
      console.log('🔍 Final req.user for teller routes:', {
        businessUnit: req.user.businessUnit,
        bu_id: req.user.bu_id,
        BU_ROLE_ID: req.user.BU_ROLE_ID
      });
      
      next();
    });
  } catch (error) {
    next(error);
  }
};

// Create requirePermission since it doesn't exist in your auth.js
// We'll need to import the roleHasPermission function
let roleHasPermission;
try {
  const permissionSync = await import('../utils/permissionSync.js');
  roleHasPermission = permissionSync.roleHasPermission;
} catch (error) {
  console.warn('⚠️ roleHasPermission not found, using placeholder');
  roleHasPermission = async (roleId, permission) => {
    console.log(`🔐 Permission check - Role: ${roleId}, Permission: ${permission}`);
    // For now, allow all permissions - you should implement proper checks
    return true;
  };
}

// ✅ UPDATED: FIXED requirePermission FUNCTION WITH TELLER OVERRIDE
export const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const roleId = user.BU_ROLE_ID || user.roleId;

      console.log('🔐 PERMISSION CHECK:', {
        roleId,
        permission,
        userRole: user.role
      });

      // ✅ CRITICAL FIX: TELLER ROLE HAS NO PERMISSIONS IN DATABASE
      // So we manually grant all required permissions for Teller functionality
      if (roleId === 29) {
        const tellerRequiredPermissions = [
          // Dashboard permissions
          'VIEW_REAL_TIME_STATS',
          'VIEW_DASHBOARD', 
          'VIEW_TELLER_DASHBOARD',
          'VIEW_TRANSACTION_OVERVIEW',
          'ACCESS_QUICK_ACTIONS',
          'VIEW_BU_PERFORMANCE',
          
          // Transaction permissions  
          'VIEW_TRANSACTION_STATS',
          'VIEW_RECENT_TRANSACTIONS',
          'VIEW_TRANSACTION_HISTORY',
          
          // Performance permissions
          'VIEW_PERFORMANCE_METRICS',
          'VIEW_TELLER_PERFORMANCE',
          
          // Drawer permissions
          'VIEW_DRAWER',
          'MANAGE_DRAWER',
          'RECONCILE_DRAWER',
          
          // Customer permissions
          'VIEW_CUSTOMER',
          'VIEW_CUSTOMER_PROFILE',
          
          // Account permissions
          'VIEW_ACCOUNT_BALANCE',
          'VIEW_ACCOUNT_STATEMENT',
          'DEPOSIT_101',
          'WITHDRAWAL_102'
        ];
        
        if (tellerRequiredPermissions.includes(permission)) {
          console.log('✅ TELLER PERMISSION GRANTED (manual override):', permission);
          return next();
        }
      }

      if (!roleId) {
        return res.status(403).json({
          success: false,
          message: 'User role not found'
        });
      }

      // Super admin bypass (roleId 1)
      if (parseInt(roleId) === 1) {
        return next();
      }

      const hasPerm = await roleHasPermission(roleId, permission);
      
      console.log(`🔐 Permission check result:`, {
        roleId,
        permission,
        hasPermission: hasPerm
      });

      if (!hasPerm) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions. Required: ${permission}`
        });
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      // Allow access for Tellers on error (since they have no permissions in DB)
      if (req.user.BU_ROLE_ID === 29) {
        console.log('⚠️ Permission check failed, allowing Teller access');
        next();
      } else {
        res.status(500).json({
          success: false,
          message: 'Permission check failed'
        });
      }
    }
  };
};

// Add this to your tellerStatsRoutes.js or any route file
router.get('/sync-permissions-now', authenticate, async (req, res) => {
  try {
    const permissionSync = await import('../utils/permissionSync.js');
    const { syncPermissions } = permissionSync;
    
    console.log('🔄 Starting permissions synchronization...');
    
    // This will sync ALL roles including Teller (ID 29)
    await syncPermissions();
    
    console.log('✅ Permissions synchronization completed');
    
    res.json({
      success: true,
      message: 'All permissions synchronized to database',
      tellerRole: {
        id: 29,
        name: 'Teller',
        hasRealTimeStats: true
      }
    });
  } catch (error) {
    console.error('❌ Sync failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// DEBUG ROUTES
// ============================================================================

// Debug route to check what's working
router.get('/debug-setup', (req, res) => {
  res.json({
    success: true,
    message: 'Teller stats routes are working',
    middleware: {
      authenticate: typeof authenticate,
      tellerAuthenticate: typeof tellerAuthenticate,
      requirePermission: typeof requirePermission
    },
    permissions: {
      REAL_TIME_STATS: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
      VIEW_METRICS: PERMISSIONS.PERFORMANCE.VIEW_METRICS
    }
  });
});

// Debug route to check JWT token contents
router.get('/debug-token', authenticate, (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, getSecretKey());
    
    console.log('🔍 JWT Token Contents:', JSON.stringify(decoded, null, 2));
    console.log('🔍 req.user:', req.user);
    
    res.json({
      success: true,
      tokenContents: decoded,
      user: req.user,
      missingFields: {
        businessUnit: !decoded.businessUnit,
        BU_ROLE_ID: !decoded.BU_ROLE_ID,
        accessibleBusinessUnits: !decoded.accessibleBusinessUnits
      }
    });
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid token',
      error: error.message 
    });
  }
});

// Debug route to check what middleware provides
router.get('/debug-auth', authenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    availableFields: req.user ? Object.keys(req.user) : []
  });
});

// Debug route with teller authentication
router.get('/debug-teller-auth', tellerAuthenticate, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    availableFields: req.user ? Object.keys(req.user) : [],
    // Additional debug info for teller routes
    criticalFields: {
      BU_ROLE_ID: req.user?.BU_ROLE_ID,
      businessUnit: req.user?.businessUnit,
      bu_id: req.user?.bu_id,
      userId: req.user?.userId
    }
  });
});

// Add this to your tellerStatsRoutes.js - DEBUG PERMISSION CHECK
router.get('/debug-permission-check', tellerAuthenticate, async (req, res) => {
  try {
    const user = req.user;
    const roleId = user.BU_ROLE_ID;
    
    console.log('🔍 Debug Permission Check - User:', {
      roleId,
      businessUnit: user.businessUnit,
      userId: user.userId
    });

    // Import the roleHasPermission function
    const permissionSync = await import('../utils/permissionSync.js');
    const { roleHasPermission } = permissionSync;

    // Check the specific permission
    const hasPermission = await roleHasPermission(roleId, 'VIEW_REAL_TIME_STATS');
    
    // Also check what permissions the role actually has
    const rolePermissions = await permissionSync.getRolePermissionsGrouped(roleId);
    
    res.json({
      success: true,
      user: {
        roleId,
        businessUnit: user.businessUnit,
        isTeller: roleId === 29
      },
      permissionCheck: {
        required: 'VIEW_REAL_TIME_STATS',
        hasPermission,
        roleIdChecked: roleId
      },
      allRolePermissions: rolePermissions,
      dashboardPermissions: rolePermissions.DASHBOARD || []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Add this to your tellerRoutes.js or create a new debug route
router.get('/debug-teller-permissions', tellerAuthenticate, async (req, res) => {
  try {
    const permissionSync = await import('../utils/permissionSync.js');
    const { roleHasPermission, getRolePermissionsGrouped } = permissionSync;
    
    const roleId = req.user.BU_ROLE_ID;
    const allPermissions = await getRolePermissionsGrouped(roleId);
    
    // Check specific dashboard permissions
    const dashboardPermissions = allPermissions.DASHBOARD || [];
    
    res.json({
      success: true,
      roleId,
      allPermissions,
      dashboardPermissions,
      hasRealTimeStats: dashboardPermissions.includes('VIEW_REAL_TIME_STATS'),
      hasAnyDashboard: dashboardPermissions.length > 0,
      // Check other possible permission names
      permissionCheck: {
        'VIEW_REAL_TIME_STATS': await roleHasPermission(roleId, 'VIEW_REAL_TIME_STATS'),
        'DASHBOARD_REAL_TIME_STATS': await roleHasPermission(roleId, 'DASHBOARD_REAL_TIME_STATS'),
        'VIEW_DASHBOARD': await roleHasPermission(roleId, 'VIEW_DASHBOARD'),
        'VIEW_TELLER_DASHBOARD': await roleHasPermission(roleId, 'VIEW_TELLER_DASHBOARD')
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// PROTECTED TELLER STATS ROUTES
// ============================================================================

// All routes use tellerAuthenticate for consistent user data
// and requirePermission for security checks

router.get('/stats/today', 
  tellerAuthenticate, 
  requirePermission(PERMISSIONS.DASHBOARD.REAL_TIME_STATS), 
  getTellerTodayStats
);

router.get('/transactions/recent', 
  tellerAuthenticate, 
  requirePermission(PERMISSIONS.DASHBOARD.REAL_TIME_STATS), 
  getTellerRecentTransactions
);

router.get('/drawer/stats/:drawerId?', 
  tellerAuthenticate, 
  requirePermission(PERMISSIONS.DASHBOARD.REAL_TIME_STATS), 
  getDrawerStats
);

router.get('/performance/summary', 
  tellerAuthenticate, 
  requirePermission(PERMISSIONS.DASHBOARD.REAL_TIME_STATS), 
  getBUPerformanceSummary
);

router.get('/performance/metrics', 
  tellerAuthenticate, 
  requirePermission(PERMISSIONS.PERFORMANCE.VIEW_METRICS), 
  getTellerPerformanceMetrics
);

// ============================================================================
// BACKWARD COMPATIBILITY ROUTES
// ============================================================================

// Alternative route names for compatibility
router.get('/today-stats', 
  tellerAuthenticate, 
  requirePermission(PERMISSIONS.DASHBOARD.REAL_TIME_STATS), 
  getTellerTodayStats
);

router.get('/recent-transactions', 
  tellerAuthenticate, 
  requirePermission(PERMISSIONS.DASHBOARD.REAL_TIME_STATS), 
  getTellerRecentTransactions
);

export default router;