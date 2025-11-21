// routes/GLAccountRoutes.js
import express from 'express';
import GLAccountController from '../controllers/GLAccountController.js';
import { asyncHandler } from "../middlewares/asyncHandler.js";

const router = express.Router();

// ==================== GL ACCOUNT CREATION ROUTES ====================
router.post('/create', asyncHandler(GLAccountController.createGLAccount));
router.post('/dynamic/create', asyncHandler(GLAccountController.createDynamicGLAccount));
router.post('/dynamic/bulk-create', asyncHandler(GLAccountController.createAllDynamicGLAccountsForBranch));
router.post('/clone-branch', asyncHandler(GLAccountController.cloneGLAccountsForBranch));

// ==================== BRANCH MANAGEMENT ROUTES ====================
router.get('/branch/summary/:organizationCode/:branchCode', asyncHandler(GLAccountController.getBranchGLAccountSummary));
router.get('/organization/:organizationCode', asyncHandler(GLAccountController.getOrganizationGLAccounts));
router.get('/inter-branch/:organizationCode', asyncHandler(GLAccountController.getInterBranchAccounts));

// ==================== TEMPLATE & TESTING ROUTES ====================
// router.get('/dynamic/templates', asyncHandler(GLAccountController.getGLAccountTemplates));
// router.get('/dynamic/test/:branchCode', asyncHandler(GLAccountController.testDynamicGLAccounts));

// ==================== TRANSACTION PROCESSING ROUTES ====================
router.post('/ledger-entry', asyncHandler(GLAccountController.createLedgerEntry));
router.post('/transactions/queue', asyncHandler(GLAccountController.queueGLTransaction));
router.post('/transactions/approve/:journalId', asyncHandler(GLAccountController.approveGLTransaction));
router.post('/eod/process', asyncHandler(GLAccountController.processEODGLTransactions));

// ==================== ACCOUNT MANAGEMENT ROUTES ====================
router.get('/list', asyncHandler(GLAccountController.getAllGLAccounts));
router.get('/search', asyncHandler(GLAccountController.searchGLAccounts));
router.get('/:GL_ACCT_NO', asyncHandler(GLAccountController.getGLAccountById));
router.put('/:GL_ACCT_NO', asyncHandler(GLAccountController.updateGLAccount));
router.patch('/:GL_ACCT_NO/status', asyncHandler(GLAccountController.updateGLAccountStatus));
router.delete('/:GL_ACCT_NO', asyncHandler(GLAccountController.deleteGLAccount));

export default router;