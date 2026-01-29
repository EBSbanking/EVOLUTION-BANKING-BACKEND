import express from 'express';
import asyncHandler from 'express-async-handler';
import { login, emergencyPasswordReset, testConfigService } from '../controllers/LoginController.js';
import verifyToken from '../middlewares/verifyToken.js';
import { restrictToPermission } from '../middlewares/rbac.js';
import User from '../models/User.js';
import Permissions from '../models/Permissions.js';
import { ROLE_MAPPING, getRoleWithPermissions } from '../constants/roleMapping.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Helper: Validate numeric ID
const isValidId = (id) => {
  if (!id) return false;
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0;
};

// Helper: Get accessible business units
const getAccessibleBusinessUnits = (userData, reqUser) => {
  if (userData.accessibleBusinessUnits && Array.isArray(userData.accessibleBusinessUnits)) {
    return userData.accessibleBusinessUnits;
  }
  if (reqUser?.accessibleBusinessUnits && Array.isArray(reqUser.accessibleBusinessUnits)) {
    return reqUser.accessibleBusinessUnits;
  }
  return [userData.main_business_unit || reqUser?.main_business_unit || 'Wethral'];
};

// ✅ Public: Login
router.post('/login', login);

// ✅ Public: Logout (simpler version without audit trail to avoid errors)
router.post('/logout', (req, res) => {
  try {
    // Extract token from Authorization header or request body
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    const { refreshToken, accessToken } = req.body;
    
    const accessTokenToInvalidate = tokenFromHeader || accessToken;
    
    // Log the logout action
    logger.info('User logged out (public endpoint)', {
      logoutTime: new Date().toISOString(),
      hasAccessToken: !!accessTokenToInvalidate,
      hasRefreshToken: !!refreshToken,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress
    });
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {
        logoutTime: new Date().toISOString(),
        accessTokenInvalidated: !!accessTokenToInvalidate,
        refreshTokenInvalidated: !!refreshToken,
        note: 'Client should clear tokens from storage'
      }
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

// ✅ Protected: Logout with authentication (fixed without audit trail errors)
router.post('/logout-protected', verifyToken, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader && authHeader.split(' ')[1];
    
    // Log the logout action with user info
    logger.info('Authenticated user logged out', {
      userId: req.user?.userId,
      username: req.user?.user_name,
      logoutTime: new Date().toISOString(),
      hasRefreshToken: !!refreshToken,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress
    });
    
    // Simple success response without audit trail to avoid errors
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {
        userId: req.user?.userId,
        username: req.user?.user_name,
        logoutTime: new Date().toISOString(),
        accessTokenInvalidated: !!accessToken,
        refreshTokenInvalidated: !!refreshToken,
        sessionEnded: true
      }
    });
  } catch (error) {
    logger.error('Protected logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

// ✅ Protected: Get authenticated user details (/me)
router.get(
  '/me',
  verifyToken,
  asyncHandler(async (req, res) => {
    try {
      // Validate user ID from token
      if (!req.user || !req.user.userId || !isValidId(req.user.userId)) {
        logger.warn('Invalid or missing userId in /me', {
          userId: req.user?.userId,
          tokenKeys: req.user ? Object.keys(req.user) : null
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid or missing user ID in token'
        });
      }

      // Fetch user using Sequelize
      const user = await User.findByPk(req.user.userId);
      if (!user) {
        logger.warn('User not found in /me', { userId: req.user.userId });
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const userData = user.get({ plain: true });

      // Resolve BU_ROLE_ID
      let BU_ROLE_ID = userData.BU_ROLE_ID?.toString();
      if (!BU_ROLE_ID && userData.role) {
        const roleMap = Object.fromEntries(
          Object.values(ROLE_MAPPING).map(r => [r.ROLE_NM, r.id.toString()])
        );
        BU_ROLE_ID = roleMap[userData.role] || '29'; // Fallback to Teller
      }
      BU_ROLE_ID = BU_ROLE_ID || req.user.roleId?.toString() || '29';

      // Resolve permissions
      let permissions = userData.permissions || {};
      let roleName = userData.primary_business_role || 'Staff';

      if (Object.keys(permissions).length === 0 && BU_ROLE_ID !== '0') {
        const permDoc = await Permissions.findOne({
          where: { BU_ROLE_ID: parseInt(BU_ROLE_ID) }
        });

        if (permDoc) {
          permissions = permDoc.permissions || {};
          roleName = permDoc.ROLE_NAME || roleName;
        } else {
          const roleDetails = getRoleWithPermissions(BU_ROLE_ID);
          if (roleDetails) {
            permissions = roleDetails.permissions || {};
            roleName = roleDetails.ROLE_NM || roleName;
          } else {
            // Default Teller permissions
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

      const isAdmin = userData.isAdmin || req.user.isAdmin || BU_ROLE_ID === '1';
      const accessibleBusinessUnits = getAccessibleBusinessUnits(userData, req.user);

      // Token timestamps
      const tokenIssuedAt = req.user.iat ? new Date(req.user.iat * 1000).toISOString() : null;
      const tokenExpiresAt = req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null;

      logger.info('Authenticated user details fetched', {
        userId: userData.id,
        user_name: userData.user_name,
        role: roleName,
        isAdmin,
        permissionsCount: Object.keys(permissions).length
      });

      res.json({
        success: true,
        message: 'Authenticated user details',
        user: {
          userId: userData.id,
          user_name: userData.user_name || userData.username,
          email: userData.email || req.user.email || '',
          role: roleName,
          BU_ROLE_ID,
          primary_business_role: userData.primary_business_role || roleName,
          businessUnit: userData.main_business_unit || req.user.businessUnit || 'Wethral',
          permissions,
          isAdmin,
          accessibleBusinessUnits,
          tokenIssuedAt,
          tokenExpiresAt,
          first_name: userData.first_name,
          last_name: userData.last_name,
          status: userData.status,
          employer_number: userData.employer_number
        },
        sessionInfo: {
          authenticated: true,
          timestamp: new Date().toISOString(),
          userAgent: req.headers['user-agent']
        }
      });
    } catch (error) {
      logger.error('Error in /me endpoint', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.userId
      });
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  })
);

// ✅ Public: Emergency password reset (no auth required - careful in production!)
router.post('/emergency-reset', emergencyPasswordReset);

// ✅ NEW: Test Configuration Service (for debugging login hours)
router.get('/test-config', testConfigService);

export default router;