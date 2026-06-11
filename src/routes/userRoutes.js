// userRoutes.js
import express from 'express';
import asyncHandler from 'express-async-handler';
import {
  registerUser,
  getClientIpController,
  updateUser,
  deactivateUser,
  activateUser,
  getUserByEmployerNumber,
  getAllUsers,
  getUserConfig,
  simpleResetPassword,
  getUserPermissions,
  getUserProfile,
  validatePermission,
  validatePermissions,
  login,
  forceResetPassword,
  debugUserCheck,
  verifyAdministratorPermissions,
  unlockUser,
  unlockMultipleUsers,
  getLockedUsers,
  resetAllLockedUsers,
  getUserLockStatus,
  forceLockUser,
  unlockForceLockedUser,
  resetUser,
  clearUserCaches,
  getUserSessionInfo,
  getBUSummary,
  getUsersByBU_ID,
  enableUser,
  getUserTableInfo,
  getUsersByRoleId
} from '../controllers/userController.js';
import verifyToken from '../middlewares/verifyToken.js';
import { checkPermission, checkAdminRole } from '../middlewares/rolePermissionMiddleware.js';
import { dbHealthCheck } from '../middlewares/dbHealthCheck.js';
import User from '../models/User.js';
import Permissions from '../models/Permissions.js';
import { ROLE_MAPPING, syncPermissions, getRoleWithPermissions } from '../constants/roleMapping.js';
import DepositTransaction from '../models/DepositTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';
import { getTransaction } from '../models/index.js';
// In authRoutes.js and userRoutes.js, change imports to:
import { 
  checkLicenseForUserCreation,
  checkLicenseForRoute 
} from '../middlewares/licenseMiddleware.js';

import { protect, isAdmin } from '../middlewares/authMiddleware.js';
import { getLoginPolicy, updateLoginPolicy } from '../controllers/LoginPolicyController.js';
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
      PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS,
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
// CHANGED: Added license check for user creation
router.post('/users/register', checkLicenseForUserCreation, registerUser);
router.get('/users/get-ip', getClientIpController);

// Debug routes (temporary - remove in production)
router.post('/debug-check', debugUserCheck);
router.post('/force-reset-password', forceResetPassword);

// 🔐 Authentication required routes (no specific permissions needed)
// CHANGED: Added license check for routes
router.get('/users/config', verifyToken, checkLicenseForRoute, getUserConfig);
router.get('/user/permissions', verifyToken, checkLicenseForRoute, getUserPermissions);
router.get('/user/profile', verifyToken, checkLicenseForRoute, getUserProfile);
router.post('/user/validate-permission', verifyToken, checkLicenseForRoute, validatePermission);
router.post('/user/validate-permissions', verifyToken, checkLicenseForRoute, validatePermissions);

// ✅ Get users by Business Unit ID with filtering and pagination
// CHANGED: Added license check
router.get('/:bu_id/users', verifyToken, checkLicenseForRoute, getUsersByBU_ID);

// ✅ Get Business Unit summary and statistics
// CHANGED: Added license check
router.get('/:bu_id/summary', verifyToken, checkLicenseForRoute, getBUSummary);

// CHANGED: Added license check
router.put('/enable/:identifier', verifyToken, checkLicenseForRoute, enableUser);
router.get('/table-info', verifyToken, checkLicenseForRoute, getUserTableInfo);
router.get('/users/by-role-id/:roleId', verifyToken, checkLicenseForRoute, getUsersByRoleId);

// 🔐 Session Management Routes
// CHANGED: Added license check
router.post('/user/reset-session', verifyToken, checkLicenseForRoute, resetUser);
router.get('/user/session-info', verifyToken, checkLicenseForRoute, getUserSessionInfo);
router.post('/admin/clear-user-caches/:user_name?', verifyToken, checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS), checkLicenseForRoute, clearUserCaches);

// 👤 User Management Routes (using unified permission middleware)
// CHANGED: Added license check
router.patch(
  '/users/deactivate/:userId',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  deactivateUser
);

// CHANGED: Added license check
router.patch(
  '/users/activate/:userId',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  activateUser
);

// 🔐 Administrator permission verification route
// CHANGED: Added license check
router.get(
  '/user/verify-admin-permissions',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  verifyAdministratorPermissions
);

// 🔐 Password management - FIXED ROUTE
// CHANGED: Added license check
router.post('/reset-password', verifyToken, dbHealthCheck, checkLicenseForRoute, simpleResetPassword);

// 👤 User management (admin permissions required)
// CHANGED: Added license check
router.put(
  '/users/:userId',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  updateUser
);

// CHANGED: Added license check
  router.get('/by-employer/:employer_number',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  getUserByEmployerNumber
);

// CHANGED: Added license check
router.get(
  '/users',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  getAllUsers
);

// 🔓 User unlock routes
// CHANGED: Added license check
router.patch(
  '/users/unlock/:identifier',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  unlockUser
);

// CHANGED: Added license check
router.post(
  '/users/unlock-multiple',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  unlockMultipleUsers
);

// CHANGED: Added license check
router.get(
  '/users/locked',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  getLockedUsers
);

// CHANGED: Added license check
router.post(
  '/users/reset-all-locked',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  resetAllLockedUsers
);

// CHANGED: Added license check
router.get(
  '/users/lock-status/:identifier',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  getUserLockStatus
);

// 🔒 Force lock/unlock routes (admin only)
// CHANGED: Added license check
router.patch(
  '/users/force-lock/:identifier',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  forceLockUser
);

// CHANGED: Added license check
router.patch(
  '/users/force-unlock/:identifier',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  unlockForceLockedUser
);

// 🔐 Protected route with admin verification
// CHANGED: Added license check
router.get(
  '/users/protected-route',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
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
            resetSession: '/user/reset-session',
            sessionInfo: '/user/session-info',
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
// CHANGED: Added license check
router.get(
  '/admin/system-status',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    res.json({
      success: true,
      message: 'System administration access granted',
      systemInfo: {
        status: 'Operational',
        adminUser: req.user.user_name,
        timestamp: new Date().toISOString(),
        sessionEndpoints: {
          resetSession: '/user/reset-session',
          sessionInfo: '/user/session-info',
          clearCaches: '/admin/clear-user-caches/:user_name?',
        },
      },
    });
  })
);

// 🔐 Permission testing and debugging routes
// CHANGED: Added license check
router.get(
  '/user/permissions/debug',
  verifyToken,
  checkPermission(PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS),
  checkLicenseForRoute,
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

// 🔐 Role and permission management routes
// CHANGED: Added license check
router.get(
  '/roles',
  verifyToken,
  checkPermission(PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS),
  checkLicenseForRoute,
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

// CHANGED: Added license check
router.get(
  '/permissions/groups',
  verifyToken,
  checkPermission(PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS),
  checkLicenseForRoute,
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

// CHANGED: Added license check
router.get(
  '/roles/:roleId/permissions',
  verifyToken,
  checkPermission(PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS),
  checkLicenseForRoute,
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
      res.json({ success: true, data: Object.values(permissions).flat() });
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


// GET current policy (any authenticated user)
router.get('/login-policy', protect, getLoginPolicy);

// PUT update policy (admin only)
router.put('/login-policy', protect, isAdmin, updateLoginPolicy);


// Update user's login hours (user can update their own)
router.patch('/users/login-hours', verifyToken, checkLicenseForRoute, asyncHandler(async (req, res) => {
  try {
    const { earliest_login_time, latest_login_time } = req.body;
    
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (earliest_login_time && !timeRegex.test(earliest_login_time)) {
      return res.status(400).json({ success: false, message: 'Earliest login time must be in HH:MM format (24-hour)' });
    }
    if (latest_login_time && !timeRegex.test(latest_login_time)) {
      return res.status(400).json({ success: false, message: 'Latest login time must be in HH:MM format (24-hour)' });
    }

    const updateData = {};
    if (earliest_login_time) updateData.earliest_login_time = earliest_login_time;
    if (latest_login_time) updateData.latest_login_time = latest_login_time;

    // Find user by ID or username from token
    let user;
    if (req.user.id) {
      user = await User.findByPk(req.user.id);
    }
    if (!user && req.user.name) {
      user = await User.findOne({
        where: {
          [Op.or]: [
            { user_name: req.user.name },
            { username: req.user.name },
            { employer_number: req.user.name }
          ]
        }
      });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await user.update(updateData);
    
    res.json({
      success: true,
      message: 'Login hours updated successfully',
      data: {
        earliest_login_time: user.earliest_login_time,
        latest_login_time: user.latest_login_time
      }
    });
    
  } catch (error) {
    console.error('Error updating login hours:', error);
    res.status(500).json({ success: false, message: error.message });
  }
}));

// ADMIN: Get all users with their login hours (for the management table)
// CHANGED: Added license check
router.get(
  '/admin/users/login-hours',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
      const users = await User.findAll({
        attributes: [
          'id',
          'user_name',
          'username',
          'first_name',
          'last_name',
          'email',
          'earliest_login_time',
          'latest_login_time',
          'status',
          'BU_ROLE_ID',
          'main_business_unit'
        ],
        order: [['user_name', 'ASC']]
      });

      res.json({
        success: true,
        data: users.map(user => user.get({ plain: true }))
      });
    } catch (error) {
      logger.error('Error fetching users login hours', {
        error: error.message,
        stack: error.stack,
        adminUser: req.user?.user_name
      });
      res.status(500).json({
        success: false,
        message: 'Failed to fetch users'
      });
    }
  })
);

// ADMIN: Update a specific user's login hours
// CHANGED: Added license check
router.patch(
  '/admin/users/:userId/login-hours',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
      const { userId } = req.params;
      const { earliest_login_time, latest_login_time } = req.body;

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

      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      await user.update({
        earliest_login_time: earliest_login_time || '00:00:00',
        latest_login_time: latest_login_time || '23:59:59'
      });

      res.json({
        success: true,
        message: 'Login hours updated successfully',
        data: {
          id: user.id,
          user_name: user.user_name,
          earliest_login_time: user.earliest_login_time,
          latest_login_time: user.latest_login_time
        }
      });
    } catch (error) {
      logger.error('Error updating user login hours', {
        error: error.message,
        stack: error.stack,
        userId: req.params.userId,
        adminUser: req.user?.user_name
      });
      res.status(500).json({
        success: false,
        message: 'Failed to update login hours'
      });
    }
  })
);

// Admin: Update any user's login hours
// CHANGED: Added license check
router.patch('/users/:userId/login-hours', verifyToken, checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS), checkLicenseForRoute, asyncHandler(async (req, res) => {
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

// CHANGED: Added license check
router.put(
  '/roles/:roleId/permissions',
  verifyToken,
  checkPermission(PERMISSIONS.PERMISSION_MANAGEMENT.UPDATE_PERMISSIONS),
  checkLicenseForRoute,
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

// CHANGED: Added license check
router.post(
  '/permissions/sync',
  verifyToken,
  checkPermission(PERMISSIONS.PERMISSION_MANAGEMENT.UPDATE_PERMISSIONS),
  checkLicenseForRoute,
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

// 🔐 Credit Officer statistics route
router.get(
  '/users/credit-officer/today-stats',
  verifyToken,
  checkPermission(PERMISSIONS.DASHBOARD.CREDIT_OFFICER_DASHBOARD),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
      let responsibilityCentre = req.user.main_business_unit || req.user.businessUnit || 'Wethral';
      
      if (!responsibilityCentre) {
        return res.status(400).json({
          success: false,
          error: 'Responsibility centre not found for user',
        });
      }

      const Transaction = db.Transaction;
      const { Op } = db.Sequelize;
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get today's stats using Sequelize
      const stats = await Transaction.findOne({
        where: {
          BU_ID: responsibilityCentre,
          TRANSACTIONDATE: {
            [Op.gte]: today,
            [Op.lt]: tomorrow
          },
          status: 'COMPLETED'
        },
        attributes: [
          [db.Sequelize.fn('COUNT', db.Sequelize.col('id')), 'totalTransactions'],
          [db.Sequelize.fn('COUNT', db.Sequelize.fn('DISTINCT', db.Sequelize.col('customer_id'))), 'uniqueCustomers'],
          [db.Sequelize.fn('SUM', db.Sequelize.col('amount')), 'totalVolume'],
          [db.Sequelize.fn('SUM', 
            db.Sequelize.literal(`CASE WHEN transaction_type = 'LOAN_DISBURSEMENT' THEN amount ELSE 0 END`)
          ), 'loanDisbursements'],
        ]
      });

      const result = {
        customers: parseInt(stats.dataValues.uniqueCustomers) || 0,
        accountsOpened: 0, // This might come from a different model
        kycVerifications: 0, // This might come from a different model
        loanFees: parseFloat(stats.dataValues.loanDisbursements) || 0,
        totalTransactions: parseInt(stats.dataValues.totalTransactions) || 0,
        totalVolume: parseFloat(stats.dataValues.totalVolume) || 0
      };

      res.status(200).json({
        success: true,
        data: result,
        message: 'Credit Officer statistics retrieved successfully'
      });

    } catch (error) {
      logger.error('Error in credit-officer stats endpoint', {
        message: error.message,
        stack: error.stack,
      });
      
      res.status(500).json({
        success: false,
        error: 'Failed to fetch statistics',
        message: error.message,
      });
    }
  })
);

// 🔐 Credit Officer recent activities route
// CHANGED: Added license check
router.get(
  '/users/credit-officer/recent-activities',
  verifyToken,
  checkPermission(PERMISSIONS.DASHBOARD.CREDIT_OFFICER_DASHBOARD),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
      logger.info('Credit Officer recent activities endpoint hit', {
        userId: req.user.userId,
        user_name: req.user.user_name,
      });

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

// 🔐 Manager today stats route
// CHANGED: Added license check
router.get(
  '/users/manager/today-stats',
  verifyToken,
  checkPermission(PERMISSIONS.DASHBOARD.MANAGER_DASHBOARD),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
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

// 🔐 Manager recent approvals route
// CHANGED: Added license check
router.get(
  '/users/manager/recent-approvals',
  verifyToken,
  checkPermission(PERMISSIONS.DASHBOARD.MANAGER_DASHBOARD),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
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

// 🔐 Auth logout route
// CHANGED: Added license check
router.post('/auth/logout', verifyToken, checkLicenseForRoute, asyncHandler(async (req, res) => {
  try {
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

// 🔐 Users approve route
// CHANGED: Added license check
router.get(
  '/users/approve/:id',
  verifyToken,
  checkPermission(PERMISSIONS.APPROVAL.CUSTOMER_RELATED),
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      if (!id || id === 'undefined') {
        return res.status(400).json({ success: false, error: 'Invalid approval ID provided' });
      }
      const approval = { id, status: 'pending' };

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

// 🔐 Protected route: Get authenticated user details - UPDATED FOR SEQUELIZE
// CHANGED: Added license check
router.get(
  '/me',
  verifyToken,
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
      console.log('🔍 /me endpoint - User from token:', req.user);
      
      if (!req.user || !req.user.userId) {
        console.log('❌ Missing userId in token:', {
          hasUser: !!req.user,
          hasUserId: !!req.user?.userId,
          userId: req.user?.userId,
          userKeys: req.user ? Object.keys(req.user) : null
        });
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid or missing user ID in token'
        });
      }

      console.log('🔍 Searching for user with ID:', req.user.userId);
      
      const user = await User.findByPk(req.user.userId);
      if (!user) {
        console.log('❌ User not found with ID:', req.user.userId);
        return res.status(404).json({ 
          success: false, 
          message: 'User not found'
        });
      }

      const userData = user.get({ plain: true });
      console.log('✅ User found:', {
        id: userData.id,
        user_name: userData.user_name,
        email: userData.email,
        BU_ROLE_ID: userData.BU_ROLE_ID,
        primary_business_role: userData.primary_business_role,
        status: userData.status
      });

      // Get permissions
      let permissions = {};
      let roleName = userData.primary_business_role || 'Unknown Role';
      let flattenedPermissions = [];

      // Check if user is Administrator
      if (parseInt(userData.BU_ROLE_ID) === 1) {
        console.log('👑 Administrator detected');
        
        permissions = Object.keys(PERMISSIONS).reduce((acc, key) => {
          const permissionGroup = PERMISSIONS[key];
          if (typeof permissionGroup === 'object') {
            const groupPermissions = Object.values(permissionGroup);
            acc[`${key}_ACCESS_LEVEL`] = groupPermissions;
            flattenedPermissions = flattenedPermissions.concat(groupPermissions);
          }
          return acc;
        }, {});
        
        roleName = 'Administrator';
      } else {
        // Non-admin logic
        const permissionsDoc = await Permissions.findOne({ 
          where: { BU_ROLE_ID: userData.BU_ROLE_ID }
        });

        if (permissionsDoc) {
          permissions = permissionsDoc.permissions;
          roleName = permissionsDoc.ROLE_NAME;
          flattenedPermissions = Object.values(permissions).flat();
        } else {
          const roleDetails = getRoleWithPermissions(userData.BU_ROLE_ID);
          if (roleDetails) {
            permissions = roleDetails.permissions;
            roleName = roleDetails.ROLE_NM;
            flattenedPermissions = Object.values(permissions).flat();
          } else {
            permissions = {
              DASHBOARD_ACCESS_LEVEL: [PERMISSIONS.DASHBOARD.VIEW],
              CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW]
            };
            roleName = userData.primary_business_role || 'User';
            flattenedPermissions = Object.values(permissions).flat();
          }
        }
      }

      const accessibleBusinessUnits = userData.accessibleBusinessUnits || 
                                     [userData.main_business_unit || 'Wethral'];

      console.log('✅ User permissions resolved:', {
        roleName,
        permissionsCount: flattenedPermissions.length,
        isAdmin: parseInt(userData.BU_ROLE_ID) === 1
      });

      res.status(200).json({
        success: true,
        message: 'Authenticated user details',
        user: {
          userId: userData.id,
          user_name: userData.user_name,
          email: userData.email,
          role: roleName,
          BU_ROLE_ID: userData.BU_ROLE_ID,
          primary_business_role: userData.primary_business_role,
          businessUnit: userData.main_business_unit || 'Wethral',
          permissions: flattenedPermissions,
          isAdmin: parseInt(userData.BU_ROLE_ID) === 1,
          isSupervisor: userData.is_supervisor || false,
          accessibleBusinessUnits,
          status: userData.status,
          tokenIssuedAt: req.user.iat ? new Date(req.user.iat * 1000).toISOString() : null,
          tokenExpiresAt: req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null
        },
        sessionEndpoints: {
          resetSession: '/user/reset-session',
          sessionInfo: '/user/session-info',
        },
        debug: {
          userIdType: typeof req.user.userId,
          tokenContains: Object.keys(req.user)
        }
      });
    } catch (error) {
      console.error('💥 Error in /me endpoint:', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.userId,
        reqUser: req.user ? Object.keys(req.user) : null,
      });
      
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        timestamp: new Date().toISOString()
      });
    }
  })
);

export default router;