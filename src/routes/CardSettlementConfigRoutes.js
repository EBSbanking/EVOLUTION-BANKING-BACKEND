// src/routes/cardSettlementConfigRoutes.js
import express from 'express';
import {
  getConfig,
  updateConfig,
  fundAccount,
  withdrawFromAccount,
  getBalance
} from '../controllers/cardSettlementConfigController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Custom middleware to allow specific roles
const authorizeRoles = (...allowedRoleIds) => {
  return (req, res, next) => {
    const userRoleId = req.user?.BU_ROLE_ID || req.user?.roleId || req.user?.role_id;
    if (!userRoleId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied – user role not found'
      });
    }
    if (allowedRoleIds.map(id => Number(id)).includes(Number(userRoleId))) {
      return next();
    }
    return res.status(403).json({
      success: false,
      message: `Access denied – role ${userRoleId} not authorized`
    });
  };
};

// All routes require authentication
router.use(protect);

// Get config (auto‑create if missing) – accessible by any authenticated user
router.get('/card-settlement-config', getConfig);
router.get('/card-settlement/balance', getBalance);

// Operations that require specific roles: Admin (1), Financial Accountant (12), Channel Manager (37)
const settlementAllowedRoles = [1, 12, 37];
router.put('/card-settlement-config', authorizeRoles(...settlementAllowedRoles), updateConfig);
router.post('/card-settlement/fund', authorizeRoles(...settlementAllowedRoles), fundAccount);
router.post('/card-settlement/withdraw', authorizeRoles(...settlementAllowedRoles), withdrawFromAccount);

export default router;