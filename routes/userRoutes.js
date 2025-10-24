import express from 'express';
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import {
  registerUser,
  getClientIpController,
  updateUser,
  deactivateUser,
  getUserByEmployerNumber,
  getAllUsers,
  getUserConfig,
  resetPassword,
  getUserPermissions,
  getUserProfile,
  validatePermission,
  validatePermissions,
  login,
  verifyAdministratorPermissions,
  unlockUser,
  unlockMultipleUsers,
  getLockedUsers,
  resetAllLockedUsers,
  getUserLockStatus,
  forceLockUser,
  unlockForceLockedUser,
  resetUser, // ✅ Added new function
  clearUserCaches, // ✅ Added new function
  getUserSessionInfo, // ✅ Added new function
} from '../controllers/userController.js';
import verifyToken from '../middlewares/verifyToken.js';
import { restrictToPermission } from '../middlewares/rbac.js';
import User from '../models/User.js';
import Permissions from '../models/Permissions.js';
import { ROLE_MAPPING, syncPermissions, getRoleWithPermissions } from '../constants/roleMapping.js';
import DepositTransaction from '../models/DepositTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';
import { checkPermissions } from '../constants/roleMapping.js';






const router = express.Router();

// Permission groups derived from TellerDashboard.jsx MODULES
const PERMISSION_GROUPS = [
  {
    group: 'Customer Management',
    permissions: [
      PERMISSIONS.CUSTOMER.CREATE,
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.PROFILE,
      PERMISSIONS.CUSTOMER.UPDATE,
    ],
  },
  {
    group: 'Transactions',
    permissions: [
      PERMISSIONS.TRANSACTION.DEPOSIT,
      PERMISSIONS.TRANSACTION.WITHDRAWAL,
      PERMISSIONS.TRANSACTION.TRANSFER,
      PERMISSIONS.TRANSACTION.OPENING_DEPOSIT,
      PERMISSIONS.TRANSACTION.VIEW_HISTORY,
    ],
  },
  {
    group: 'Dashboard',
    permissions: [
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
      PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
      PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
    ],
  },
  {
    group: 'Accounts',
    permissions: [
      PERMISSIONS.ACCOUNT.DEPOSIT_101,
      PERMISSIONS.ACCOUNT.WITHDRAWAL_102,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
    ],
  },
  {
    group: 'Drawer',
    permissions: [
      PERMISSIONS.DRAWER.VIEW,
      PERMISSIONS.DRAWER.MANAGE,
      PERMISSIONS.DRAWER.RECONCILE,
    ],
  },
  {
    group: 'Reports',
    permissions: [
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.REPORT.TELLER_SUMMARY,
    ],
  },
  {
    group: 'Administration',
    permissions: [
      PERMISSIONS.PERMISSION_MANAGEMENT.MANAGE_PERMISSIONS,
      PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS,
      PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
    ],
  },
];

// Helper function to safely get permissions from a group (flattens if array, returns as-is if object)
const safeGetPermissions = (permissionGroup) => {
  if (Array.isArray(permissionGroup)) {
    return permissionGroup;
  }
  return Object.values(permissionGroup).flat();
};

// ===================================
// Teller Dashboard Statistic
//=======================================




// 🔐 Public routes (no authentication required)
router.post('/users/login', login);
router.post('/users/register', registerUser);
router.get('/users/get-ip', getClientIpController);

// 🔐 Authentication required routes (no specific permissions needed)
router.get('/users/config', verifyToken, getUserConfig); // Updated path to match frontend expectation
router.get('/user/permissions', verifyToken, getUserPermissions);
router.get('/user/profile', verifyToken, getUserProfile);
router.post('/user/validate-permission', verifyToken, validatePermission);
router.post('/user/validate-permissions', verifyToken, validatePermissions);

// 🔐 Session Management Routes (new)
router.post('/user/reset-session', verifyToken, resetUser); // ✅ Reset user session and clear caches
router.get('/user/session-info', verifyToken, getUserSessionInfo); // ✅ Get user session information
router.post('/admin/clear-user-caches/:user_name?', verifyToken, restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS), clearUserCaches); // ✅ Admin: Clear user caches

// 🔐 Administrator permission verification route
router.get(
  '/user/verify-admin-permissions',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  verifyAdministratorPermissions
);

// 🔐 Password management
router.post(
  '/users/reset-password',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  resetPassword
);

// 👤 User management (admin permissions required)
router.put(
  '/users/:userId',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  updateUser
);
router.patch(
  '/users/deactivate/:userId',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  deactivateUser
);
router.get(
  '/users/by-employer/:employer_number',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  getUserByEmployerNumber
);
router.get(
  '/users',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  getAllUsers
);

// 🔐 Protected route with admin verification
router.get(
  '/users/protected-route',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  asyncHandler(async (req, res) => {
    try {
      const { userId, user_name, BU_ROLE_ID, role } = req.user;
      const isAdmin = parseInt(BU_ROLE_ID) === 1;

      res.json({
        success: true,
        message: 'Access granted to protected route',
        user: {
          userId,
          user_name,
          businessUnit: req.user.main_business_unit || 'Wethral',
          role,
          BU_ROLE_ID,
          isAdministrator: isAdmin,
        },
        permissions: {
          isAdministrator: isAdmin,
          endpoints: {
            getPermissions: '/user/permissions',
            getProfile: '/user/profile',
            validateSingle: '/user/validate-permission',
            validateMultiple: '/user/validate-permissions',
            verifyAdmin: '/user/verify-admin-permissions',
            resetSession: '/user/reset-session', // ✅ Added new endpoint
            sessionInfo: '/user/session-info', // ✅ Added new endpoint
          },
        },
      });
    } catch (error) {
      logger.error('Error in protected route', {
        error: error.message,
        userId: req.user?.userId,
        stack: error.stack,
      });
      res.status(500).json({ success: false, message: 'Error processing request' });
    }
  })
);

// 🔐 System administration routes (administrator only)
router.get(
  '/admin/system-status',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      message: 'System administration access granted',
      systemInfo: {
        status: 'Operational',
        adminUser: req.user.user_name,
        timestamp: new Date().toISOString(),
        sessionEndpoints: { // ✅ Added session management info
          resetSession: '/user/reset-session',
          sessionInfo: '/user/session-info',
          clearCaches: '/admin/clear-user-caches/:user_name?',
        },
      },
    });
  })
);

// 🔐 Permission testing and debugging routes
router.get(
  '/user/permissions/debug',
  verifyToken,
  restrictToPermission(PERMISSIONS.PERMISSION_MANAGEMENT.MANAGE_PERMISSIONS),
  asyncHandler(async (req, res) => {
    try {
      const { BU_ROLE_ID, user_name } = req.user;
      const isAdmin = parseInt(BU_ROLE_ID) === 1;
      const permissionsDoc = await Permissions.findOne({ BU_ROLE_ID }).lean();

      res.json({
        success: true,
        debugInfo: {
          user: user_name,
          roleId: BU_ROLE_ID,
          isAdministrator: isAdmin,
          permissionsCount: permissionsDoc ? Object.keys(permissionsDoc.permissions).length : 0,
          permissionsStructure: permissionsDoc ? permissionsDoc.permissions : null,
          adminHasAllPermissions: isAdmin,
        },
      });
    } catch (error) {
      logger.error('Error fetching debug information', {
        error: error.message,
        userId: req.user?.userId,
        stack: error.stack,
      });
      res.status(500).json({ success: false, message: 'Error fetching debug information' });
    }
  })
);

// 🔓 User unlock routes
router.patch(
  '/users/unlock/:identifier',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  unlockUser
);
router.post(
  '/users/unlock-multiple',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  unlockMultipleUsers
);
router.get(
  '/users/locked',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  getLockedUsers
);
router.post(
  '/users/reset-all-locked',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  resetAllLockedUsers
);
router.get(
  '/users/lock-status/:identifier',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  getUserLockStatus
);
router.patch(
  '/users/force-lock/:identifier',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  forceLockUser
);
router.patch(
  '/users/force-unlock/:identifier',
  verifyToken,
  restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  unlockForceLockedUser
);

// 🔐 Role and permission management routes
router.get(
  '/roles',
  verifyToken,
  restrictToPermission(PERMISSIONS.PERMISSION_MANAGEMENT.MANAGE_PERMISSIONS),
  asyncHandler(async (req, res) => {
    try {
      const dbRoles = await Permissions.find().lean();
      const roles = dbRoles.length > 0
        ? dbRoles.map((role) => ({
            id: parseInt(role.BU_ROLE_ID),
            ROLE_NM: role.ROLE_NAME,
            description: ROLE_MAPPING[role.BU_ROLE_ID]?.description || '',
          }))
        : Object.entries(ROLE_MAPPING).map(([id, role]) => ({
            id: parseInt(id),
            ROLE_NM: role.ROLE_NM,
            description: role.description || '',
          }));

      res.json({ success: true, roles });
    } catch (error) {
      logger.error('Error fetching roles', {
        error: error.message,
        userId: req.user?.userId,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to fetch roles' });
    }
  })
);

router.get(
  '/permissions/groups',
  verifyToken,
  restrictToPermission(PERMISSIONS.PERMISSION_MANAGEMENT.MANAGE_PERMISSIONS),
  asyncHandler(async (req, res) => {
    try {
      const groups = PERMISSION_GROUPS.reduce((acc, group) => {
        acc[`${group.group.toUpperCase().replace(/\s+/g, '_')}_ACCESS_LEVEL`] = group.permissions;
        return acc;
      }, {});

      res.json({ success: true, groups });
    } catch (error) {
      logger.error('Error fetching permission groups', {
        error: error.message,
        userId: req.user?.userId,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to fetch permission groups' });
    }
  })
);

router.get(
  '/roles/:roleId/permissions',
  verifyToken,
  restrictToPermission(PERMISSIONS.PERMISSION_MANAGEMENT.MANAGE_PERMISSIONS),
  asyncHandler(async (req, res) => {
    try {
      const { roleId } = req.params;

      // Special handling for admin role (1) - grant all permissions grouped by category
      if (roleId === '1') {
        const adminPermissions = Object.keys(PERMISSIONS).reduce((acc, key) => {
          const permissionGroup = PERMISSIONS[key];
          if (typeof permissionGroup === 'object') {
            acc[`${key}_ACCESS_LEVEL`] = safeGetPermissions(permissionGroup);
          }
          return acc;
        }, {});
        return res.json({ success: true, data: adminPermissions });
      }

      const dbPermissions = await Permissions.findOne({ BU_ROLE_ID: roleId }).lean();
      if (!dbPermissions && !ROLE_MAPPING[roleId]) {
        return res.status(404).json({ success: false, error: 'Role not found' });
      }

      const permissions = dbPermissions?.permissions || ROLE_MAPPING[roleId]?.permissions || {};
      res.json({ success: true, data: Object.values(permissions).flat() }); // Flatten to array for frontend compatibility
    } catch (error) {
      logger.error('Error fetching role permissions', {
        error: error.message,
        userId: req.user?.userId,
        roleId: req.params.roleId,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to fetch role permissions' });
    }
  })
);

// Get user's current login hours
router.get('/users/login-hours', verifyToken, asyncHandler(async (req, res) => { // Added verifyToken
  try {
    const user = await User.findById(req.user.id);
    
    res.json({
      success: true,
      data: {
        earliest_login_time: user.earliest_login_time,
        latest_login_time: user.latest_login_time
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}));

// Update user's login hours (user can update their own)
router.patch('/users/login-hours', verifyToken, asyncHandler(async (req, res) => { // Added verifyToken
  try {
    const { earliest_login_time, latest_login_time } = req.body; // Fixed variable names
    
    // Validate time format
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (earliest_login_time && !timeRegex.test(earliest_login_time)) {
      return res.status(400).json({
        success: false,
        message: 'Earliest login time must be in HH:MM format (24-hour)'
      });
    }
    
    if (latest_login_time && !timeRegex.test(latest_login_time)) {
      return res.status(400).json({
        success: false,
        message: 'Latest login time must be in HH:MM format (24-hour)'
      });
    }
    
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { 
        earliest_login_time: earliest_login_time || "00:00",
        latest_login_time: latest_login_time || "23:59"
      },
      { new: true, runValidators: true }
    );
    
    res.json({
      success: true,
      message: 'Login hours updated successfully',
      data: {
        earliest_login_time: user.earliest_login_time,
        latest_login_time: user.latest_login_time
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}));

// Admin: Update any user's login hours
router.patch('/users/:userId/login-hours', verifyToken, restrictToPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS), asyncHandler(async (req, res) => { // Added verifyToken and permission
  try {
    const { userId } = req.params;
    const { earliest_login_time, latest_login_time } = req.body;
    
    const user = await User.findByIdAndUpdate(
      userId,
      { 
        earliest_login_time: earliest_login_time || "00:00",
        latest_login_time: latest_login_time || "23:59"
      },
      { new: true, runValidators: true }
    );
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Login hours updated successfully',
      data: {
        user_name: user.user_name,
        earliest_login_time: user.earliest_login_time,
        latest_login_time: user.latest_login_time
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}));

router.put(
  '/roles/:roleId/permissions',
  verifyToken,
  restrictToPermission(PERMISSIONS.PERMISSION_MANAGEMENT.MANAGE_PERMISSIONS),
  asyncHandler(async (req, res) => {
    try {
      const { roleId } = req.params;
      const { permissions } = req.body;

      if (!ROLE_MAPPING[roleId] && !(await Permissions.findOne({ BU_ROLE_ID: roleId }))) {
        return res.status(404).json({ success: false, error: 'Role not found' });
      }

      const validPermissions = PERMISSION_GROUPS.flatMap((group) => group.permissions);
      const invalidPermissions = Object.values(permissions).flat().filter((p) => !validPermissions.includes(p));
      if (invalidPermissions.length > 0) {
        return res.status(400).json({ success: false, error: `Invalid permissions: ${invalidPermissions.join(', ')}` });
      }

      const updatedPermissions = await Permissions.findOneAndUpdate(
        { BU_ROLE_ID: roleId },
        {
          BU_ROLE_ID: roleId,
          ROLE_NAME: ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`,
          permissions,
        },
        { upsert: true, new: true }
      );

      if (ROLE_MAPPING[roleId]) {
        ROLE_MAPPING[roleId].permissions = permissions;
      }

      await User.updateMany(
        { BU_ROLE_ID: roleId },
        { $set: { permissions } }
      );

      res.json({ success: true, message: 'Permissions updated successfully' });
    } catch (error) {
      logger.error('Error updating role permissions', {
        error: error.message,
        userId: req.user?.userId,
        roleId: req.params.roleId,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to update permissions' });
    }
  })
);

router.post(
  '/permissions/sync',
  verifyToken,
  restrictToPermission(PERMISSIONS.PERMISSION_MANAGEMENT.MANAGE_PERMISSIONS),
  asyncHandler(async (req, res) => {
    try {
      await syncPermissions();
      res.json({ success: true, message: 'Permissions synchronized successfully' });
    } catch (error) {
      logger.error('Error syncing permissions', {
        error: error.message,
        userId: req.user?.userId,
        stack: error.stack,
      });
      res.status(500).json({ success: false, error: 'Failed to sync permissions' });
    }
  })
);

// 🔐 Credit Officer statistics route (new - to fix 404)
router.get(
  '/users/credit-officer/today-stats',
  verifyToken,
  restrictToPermission(PERMISSIONS.DASHBOARD.CREDIT_OFFICER_DASHBOARD),
  asyncHandler(async (req, res) => {
    try {
      logger.info('Credit Officer stats endpoint hit', {
        userId: req.user.userId,
        user_name: req.user.user_name,
        BU_ROLE_ID: req.user.BU_ROLE_ID,
      });

      let responsibilityCentre = req.user.main_business_unit || req.user.businessUnit || 'Wethral';
      if (!responsibilityCentre) {
        logger.warn('No responsibility centre found', {
          userId: req.user.userId,
          user_name: req.user.user_name,
          availableFields: Object.keys(req.user),
        });
        return res.status(400).json({
          success: false,
          error: 'Responsibility centre not found for user',
          debug: {
            userId: req.user.userId,
            user_name: req.user.user_name,
            BU_ROLE_ID: req.user.BU_ROLE_ID,
            role: req.user.role,
            isAdmin: req.user.isAdmin,
            availableFields: Object.keys(req.user),
          },
        });
      }

      logger.info('Using responsibility centre', { responsibilityCentre });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // TODO: Implement real DB queries for credit-officer metrics (e.g., customers created, accounts opened, KYC verified, loan fees)
      // For now, use fallback/demo data as in frontend
      const stats = {
        customers: 12, // e.g., COUNT(customers) WHERE created_by = user_name AND date = today
        accountsOpened: 4,
        kycVerifications: 7,
        loanFees: 45000,
      };

      res.status(200).json({
        success: true,
        data: stats,
        message: 'Credit Officer statistics retrieved successfully',
        debug: {
          user: req.user.user_name,
          responsibility_centre: responsibilityCentre,
          fieldSource: 'main_business_unit',
        },
      });
    } catch (error) {
      logger.error('Error in credit-officer stats endpoint', {
        message: error.message,
        stack: error.stack,
        userId: req.user?.userId,
        user_name: req.user?.user_name,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        message: error.message,
      });
    }
  })
);

// 🔐 Credit Officer recent activities route (new - to fix 404)
router.get(
  '/users/credit-officer/recent-activities',
  verifyToken,
  restrictToPermission(PERMISSIONS.DASHBOARD.CREDIT_OFFICER_DASHBOARD),
  asyncHandler(async (req, res) => {
    try {
      logger.info('Credit Officer recent activities endpoint hit', {
        userId: req.user.userId,
        user_name: req.user.user_name,
      });

      // TODO: Query DB for last 10 activities by user (e.g., from audit logs or activity table)
      // For now, use demo data as in frontend
      const activities = [
        { id: 1, type: 'Customer Created', customer: 'John Doe', time: '10:30 AM', status: 'completed', amount: 0 },
        { id: 2, type: 'KYC Verified', customer: 'Jane Smith', time: '11:15 AM', status: 'completed', amount: 0 },
        { id: 3, type: 'Account Opened', customer: 'Mike Johnson', time: '11:45 AM', status: 'completed', amount: 5000 },
        { id: 4, type: 'Loan Fee Created', customer: 'Sarah Wilson', time: '12:20 PM', status: 'pending', amount: 2500 },
      ];

      res.status(200).json({
        success: true,
        data: activities,
        message: 'Recent activities retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in credit-officer recent activities endpoint', {
        message: error.message,
        stack: error.stack,
        userId: req.user?.userId,
        user_name: req.user?.user_name,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch recent activities',
        message: error.message,
      });
    }
  })
);

// 🔐 Manager today stats route (new - to fix 404)
router.get(
  '/users/manager/today-stats',
  verifyToken,
  restrictToPermission(PERMISSIONS.DASHBOARD.VIEW_MANAGER_DASHBOARD),
  asyncHandler(async (req, res) => {
    try {
      // TODO: Implement manager-specific stats (e.g., approvals, rejections)
      // For now, demo data
      const stats = {
        approvals: 5,
        rejections: 2,
      };

      res.status(200).json({
        success: true,
        data: stats,
        message: 'Manager statistics retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in manager stats endpoint', {
        message: error.message,
        stack: error.stack,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        message: error.message,
      });
    }
  })
);

// 🔐 Manager recent approvals route (new - to fix 404)
router.get(
  '/users/manager/recent-approvals',
  verifyToken,
  restrictToPermission(PERMISSIONS.DASHBOARD.VIEW_MANAGER_DASHBOARD),
  asyncHandler(async (req, res) => {
    try {
      // TODO: Query recent approvals
      // For now, empty array
      const approvals = [];

      res.status(200).json({
        success: true,
        data: approvals,
        message: 'Recent approvals retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in manager recent approvals endpoint', {
        message: error.message,
        stack: error.stack,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch recent approvals',
        message: error.message,
      });
    }
  })
);

// 🔐 Auth logout route (new - to fix 404; simple response, invalidate in middleware if needed)
router.post('/auth/logout', verifyToken, asyncHandler(async (req, res) => {
  try {
    // TODO: Invalidate token (e.g., blacklist in Redis)
    logger.info('User logged out', { userId: req.user.userId, user_name: req.user.user_name });
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Error in logout endpoint', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.userId,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to logout',
      message: error.message,
    });
  }
}));

// 🔐 Users approve route (new - to fix undefined/404)
router.get(
  '/users/approve/:id',
  verifyToken,
  restrictToPermission(PERMISSIONS.APPROVAL.CUSTOMER_RELATED),
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || id === 'undefined') {
        return res.status(400).json({ success: false, error: 'Invalid approval ID provided' });
      }
      // TODO: Fetch approval by ID from DB
      const approval = { id, status: 'pending' }; // Demo

      res.status(200).json({
        success: true,
        data: approval,
        message: 'Approval details retrieved successfully',
      });
    } catch (error) {
      logger.error('Error in users/approve endpoint', {
        message: error.message,
        stack: error.stack,
        approvalId: req.params.id,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to fetch approval',
        message: error.message,
      });
    }
  })
);

// 🔐 Account balances route
router.get(
  '/accounts/balances',
  verifyToken,
  restrictToPermission(PERMISSIONS.ACCOUNT.VIEW_BALANCE),
  asyncHandler(async (req, res) => {
    try {
      const { userId, user_name, main_business_unit } = req.user;
      logger.info('Fetching account balances', { userId, user_name });

      const accounts = await CustomerAccount.find({
        businessUnit: main_business_unit || 'Wethral',
        status: 'active',
      }).lean();

      if (!accounts || accounts.length === 0) {
        logger.info('No accounts found', { userId, businessUnit: main_business_unit });
        return res.status(200).json({
          success: true,
          message: 'No accounts found',
          data: [],
        });
      }

      const balances = accounts.map(account => ({
        accountId: account._id, // Fixed: was CustomerAccount._id
        accountNumber: account.accountNumber,
        customerId: account.customerId,
        balance: account.balance || 0,
        currency: account.currency || 'NGN',
        lastUpdated: account.updatedAt || account.createdAt,
      }));

      res.status(200).json({
        success: true,
        message: 'Account balances retrieved successfully',
        data: balances,
      });
    } catch (error) {
      logger.error('Error in accounts/balances endpoint', {
        error: error.message,
        userId: req.user?.userId,
        stack: error.stack,
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch account balances',
        error: error.message,
      });
    }
  })
);

// 🔐 Protected route: Get authenticated user details
router.get(
  '/me',
  verifyToken,
  asyncHandler(async (req, res) => {
    try {
      // Validate req.user and userId
      if (!req.user || !req.user.userId || !mongoose.isValidObjectId(req.user.userId)) {
        logger.warn('Invalid or missing userId in /me endpoint', {
          userId: req.user?.userId,
          reqUser: req.user ? Object.keys(req.user) : null,
        });
        return res.status(401).json({ success: false, message: 'Invalid or missing user ID in token' });
      }

      // Fetch user from database
      const user = await User.findById(req.user.userId).lean();
      if (!user) {
        logger.warn('User not found in /me endpoint', { userId: req.user.userId });
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Map role names to BU_ROLE_ID using ROLE_MAPPING
      const roleToIdMap = Object.fromEntries(
        Object.values(ROLE_MAPPING).map(role => [role.ROLE_NM, role.id.toString()])
      );
      let BU_ROLE_ID = user.BU_ROLE_ID || roleToIdMap[user.role] || req.user.roleId || '29'; // Default to Teller

      // Special handling for admin role (1) - grant all permissions grouped by category
      let permissions = user.permissions || {};
      let roleName = user.role || 'Unknown Role';
      if (BU_ROLE_ID === '1') {
        permissions = Object.keys(PERMISSIONS).reduce((acc, key) => {
          const permissionGroup = PERMISSIONS[key];
          if (typeof permissionGroup === 'object') {
            acc[`${key}_ACCESS_LEVEL`] = safeGetPermissions(permissionGroup);
          }
          return acc;
        }, {});
        roleName = 'Administrator';
      } else if (Object.keys(permissions).length === 1 && BU_ROLE_ID !== '0') {
        const permissionsDoc = await Permissions.findOne({ BU_ROLE_ID }).lean();
        if (permissionsDoc) {
          permissions = permissionsDoc.permissions;
          roleName = permissionsDoc.ROLE_NAME;
        } else {
          try {
            const roleDetails = getRoleWithPermissions(BU_ROLE_ID);
            if (roleDetails) {
              permissions = roleDetails.permissions || {};
              roleName = roleDetails.ROLE_NM || roleName;
            } else {
              logger.warn('Role not found in ROLE_MAPPING, applying Teller fallback', { BU_ROLE_ID });
              permissions = {
                DASHBOARD_ACCESS_LEVEL: [
                  PERMISSIONS.DASHBOARD.VIEW,
                  PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
                  PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
                  PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
                ],
                ACCOUNT_ACCESS_LEVEL: [
                  PERMISSIONS.ACCOUNT.DEPOSIT_101,
                  PERMISSIONS.ACCOUNT.WITHDRAWAL_102,
                  PERMISSIONS.ACCOUNT.VIEW_BALANCE,
                  PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
                ],
                TRANSACTION_ACCESS_LEVEL: [
                  PERMISSIONS.TRANSACTION.DEPOSIT,
                  PERMISSIONS.TRANSACTION.WITHDRAWAL,
                  PERMISSIONS.TRANSACTION.TRANSFER,
                  PERMISSIONS.TRANSACTION.OPENING_DEPOSIT,
                  PERMISSIONS.TRANSACTION.VIEW_HISTORY,
                ],
                CUSTOMER_ACCESS_LEVEL: [
                  PERMISSIONS.CUSTOMER.VIEW,
                  PERMISSIONS.CUSTOMER.UPDATE,
                  PERMISSIONS.CUSTOMER.PROFILE,
                ],
                DRAWER_ACCESS_LEVEL: [
                  PERMISSIONS.DRAWER.VIEW,
                  PERMISSIONS.DRAWER.MANAGE,
                  PERMISSIONS.DRAWER.RECONCILE,
                ],
                REPORT_ACCESS_LEVEL: [
                  PERMISSIONS.REPORT.VIEW,
                  PERMISSIONS.REPORT.TELLER_SUMMARY,
                ],
              };
              roleName = 'Teller';
            }
          } catch (roleError) {
            logger.warn('Error in getRoleWithPermissions, applying Teller fallback', {
              BU_ROLE_ID,
              error: roleError.message,
            });
            permissions = {
              DASHBOARD_ACCESS_LEVEL: [
                PERMISSIONS.DASHBOARD.VIEW,
                PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
                PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
                PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
              ],
              ACCOUNT_ACCESS_LEVEL: [
                PERMISSIONS.ACCOUNT.DEPOSIT_101,
                PERMISSIONS.ACCOUNT.WITHDRAWAL_102,
                PERMISSIONS.ACCOUNT.VIEW_BALANCE,
                PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
              ],
              TRANSACTION_ACCESS_LEVEL: [
                PERMISSIONS.TRANSACTION.DEPOSIT,
                PERMISSIONS.TRANSACTION.WITHDRAWAL,
                PERMISSIONS.TRANSACTION.TRANSFER,
                PERMISSIONS.TRANSACTION.OPENING_DEPOSIT,
                PERMISSIONS.TRANSACTION.VIEW_HISTORY,
              ],
              CUSTOMER_ACCESS_LEVEL: [
                PERMISSIONS.CUSTOMER.VIEW,
                PERMISSIONS.CUSTOMER.UPDATE,
                PERMISSIONS.CUSTOMER.PROFILE,
              ],
              DRAWER_ACCESS_LEVEL: [
                PERMISSIONS.DRAWER.VIEW,
                PERMISSIONS.DRAWER.MANAGE,
                PERMISSIONS.DRAWER.RECONCILE,
              ],
              REPORT_ACCESS_LEVEL: [
                PERMISSIONS.REPORT.VIEW,
                PERMISSIONS.REPORT.TELLER_SUMMARY,
              ],
            };
            roleName = 'Teller';
          }
        }
      }

      logger.info('User permissions fetched in /me', {
        user_name: user.user_name,
        BU_ROLE_ID,
        roleName,
        permissions: JSON.stringify(permissions),
      });

      const accessibleBusinessUnits = user.accessibleBusinessUnits || req.user.accessibleBusinessUnits || ['Wethral'];

      // Safely parse token timestamps
      let tokenIssuedAt = null;
      let tokenExpiresAt = null;

      try {
        tokenIssuedAt = req.user.iat ? new Date(req.user.iat * 1000).toISOString() : null;
      } catch (e) {
        logger.warn('Invalid iat in token', { iat: req.user.iat });
      }

      try {
        tokenExpiresAt = req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null;
      } catch (e) {
        logger.warn('Invalid exp in token', { exp: req.user.exp });
      }

      res.status(200).json({
        success: true,
        message: 'Authenticated user details',
        user: {
          userId: user._id,
          user_name: user.user_name,
          email: user.email || req.user.email || '',
          role: roleName,
          BU_ROLE_ID,
          primary_business_role: user.primary_business_role || roleName,
          businessUnit: user.main_business_unit || req.user.main_business_unit || 'Wethral',
          permissions: Object.values(permissions).flat(), // Flatten for frontend hasPermission checks
          isAdmin: user.isAdmin || req.user.isAdmin || BU_ROLE_ID === '1',
          accessibleBusinessUnits,
          tokenIssuedAt,
          tokenExpiresAt,
        },
        sessionEndpoints: { // ✅ Added session management endpoints info
          resetSession: '/user/reset-session',
          sessionInfo: '/user/session-info',
        },
      });
    } catch (error) {
      logger.error('Error in /me endpoint', {
        error: error.message,
        userId: req.user?.userId,
        stack: error.stack,
        reqUser: req.user ? Object.keys(req.user) : null,
      });
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: error.message,
      });
    }
  })
);

export default router;