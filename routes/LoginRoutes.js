import express from 'express';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler'; // ✅ Fix here
import { login, emergencyPasswordReset } from '../controllers/LoginController.js';
import verifyToken from '../middlewares/verifyToken.js';
import { restrictToPermission } from '../middlewares/rbac.js';
import User from '../models/User.js';
import Permissions from '../models/Permissions.js';
import { ROLE_MAPPING, syncPermissions, getRoleWithPermissions } from '../constants/roleMapping.js';
import DepositTransaction from '../models/DepositTransaction.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';


const router = express.Router();

// ✅ Public route: Login
router.post('/login', login);

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
      const BU_ROLE_ID = user.BU_ROLE_ID || roleToIdMap[user.role] || req.user.roleId || '29'; // Default to Teller

      // Fetch permissions
      let permissions = user.permissions || {};
      let roleName = user.role || 'Unknown Role';
      if (Object.keys(permissions).length === 0 && BU_ROLE_ID !== '0') {
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
          permissions,
          isAdmin: user.isAdmin || req.user.isAdmin || BU_ROLE_ID === '1',
          accessibleBusinessUnits,
          tokenIssuedAt,
          tokenExpiresAt,
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

router.post('/emergency-reset', emergencyPasswordReset );


export default router;
