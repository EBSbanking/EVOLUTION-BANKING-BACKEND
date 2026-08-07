// routes/GLAccountRoutes.js
import express from 'express';
import GLAccountController from '../controllers/GLAccountController.js';
import { asyncHandler } from "../middlewares/asyncHandler.js";

const router = express.Router();

// ==================== DIAGNOSTIC ROUTES ====================
router.get('/diagnose', asyncHandler(GLAccountController.diagnoseDatabase));

// ==================== GL ACCOUNT CREATION ROUTES ====================
router.post('/create', asyncHandler(GLAccountController.createGLAccount));
router.post('/coa-aligned/create', asyncHandler(GLAccountController.createCOAAlignedGLAccount));

// ==================== LEDGER TRANSACTION ROUTES ====================
router.post('/ledger-entry', asyncHandler(GLAccountController.createLedgerEntry));

// ==================== UTILITY ROUTES ====================
router.post('/validate-account-class', (req, res) => {
  try {
    const { accountClass, accountType } = req.body;
    const result = GLAccountController.validateAccountClassType(accountClass, accountType);
    res.json({ success: true, message: 'Account class validated', accountClass: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/get-account-type-code', (req, res) => {
  try {
    const { accountType } = req.body;
    const code = GLAccountController.getAccountTypeCode(accountType);
    res.json({ success: true, accountType, code });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/get-coa-balance-type', (req, res) => {
  try {
    const { accountClass, accountType } = req.body;
    const balanceType = GLAccountController.getCOABalanceType(accountClass, accountType);
    res.json({ success: true, accountClass, accountType, balanceType });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
  
});

// ==================== COA-ALIGNED ACCOUNT RETRIEVAL ROUTES ====================
// Get a COA-aligned GL account by GL code (param)
router.get('/coa-accounts/:glcode', asyncHandler(GLAccountController.getCOAAlignedAccount));

// Get by query parameter (supports ?glcode=... or ?accountId=...)
router.get('/coa-accounts', asyncHandler(GLAccountController.getCOAAlignedAccount));

// ✅ Update Chart of Account (supports hierarchy, posting rules, flags, and GLAccount sync)
router.put('/chart-of-accounts/:id', asyncHandler(GLAccountController.updateAccount));

// ==================== HEALTH CHECK ROUTES ====================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'GL Account Controller is working',
    endpoints: [
      { method: 'POST', path: '/api/gl-accounts/create', description: 'Create GL Account' },
      { method: 'POST', path: '/api/gl-accounts/coa-aligned/create', description: 'Create COA-aligned GL Account' },
      { method: 'POST', path: '/api/gl-accounts/ledger-entry', description: 'Create Ledger Entry' },
      { method: 'GET', path: '/api/gl-accounts/coa-accounts/:glcode', description: 'Get COA-aligned account by GL code' },
      { method: 'GET', path: '/api/gl-accounts/coa-accounts?glcode=...', description: 'Get COA-aligned account via query' },
      { method: 'GET', path: '/api/gl-accounts/diagnose', description: 'Diagnose Database' },
       { method: 'PUT', path: '/api/gl-accounts/chart-of-accounts/:id', description: 'Update Chart of Account (modify GL account)' }
    ]
  });
});

export default router;