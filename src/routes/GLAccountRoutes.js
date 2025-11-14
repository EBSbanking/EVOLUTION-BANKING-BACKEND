// routes/GLAccountRoutes.js
import express from 'express';
import GLAccountController from '../controllers/GLAccountController.js';
import { asyncHandler } from "../middlewares/asyncHandler.js";

const router = express.Router();

// Working routes (functions that exist in your controller)
router.post('/create', asyncHandler(GLAccountController.createGLAccount));
router.post('/dynamic/create', asyncHandler(GLAccountController.createDynamicGLAccount));
router.post('/dynamic/bulk-create', asyncHandler(GLAccountController.createAllDynamicGLAccountsForBranch));
router.get('/dynamic/templates', asyncHandler(GLAccountController.getGLAccountTemplates));
router.get('/dynamic/test/:branchCode', asyncHandler(GLAccountController.testDynamicGLAccounts));
router.post('/eod/process', asyncHandler(GLAccountController.processEODGLTransactions));
router.post('/transactions/queue', asyncHandler(GLAccountController.queueGLTransaction));
router.post('/ledger-entry', asyncHandler(GLAccountController.createLedgerEntry));

// Comment out routes that reference missing functions for now
// router.get('/list', asyncHandler(GLAccountController.getAllGLAccounts));
// router.get('/:GL_ACCT_NO', asyncHandler(GLAccountController.getGLAccountById));
// router.put('/:GL_ACCT_NO', asyncHandler(GLAccountController.updateGLAccount));
// router.delete('/:GL_ACCT_NO', asyncHandler(GLAccountController.deleteGLAccount));
// router.get('/subfolders/:parentId', asyncHandler(GLAccountController.fetchSubfolders));
// router.post('/subfolders', asyncHandler(GLAccountController.createSubfolder));

export default router;