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

// ==================== COA-ALIGNED ACCOUNT ROUTES ====================
router.post('/coa-aligned/create', asyncHandler(GLAccountController.createCOAAlignedGLAccount));
router.post('/coa/migrate', asyncHandler(GLAccountController.migrateToCOAStructure));
router.get('/coa/structure/:organizationCode', asyncHandler(GLAccountController.getCOAStructure));

// ==================== BRANCH MANAGEMENT ROUTES ====================
router.get('/branch/summary/:organizationCode/:branchCode', asyncHandler(GLAccountController.getBranchGLAccountSummary));
router.get('/organization/:organizationCode', asyncHandler(GLAccountController.getOrganizationGLAccounts));
router.get('/inter-branch/:organizationCode', asyncHandler(GLAccountController.getInterBranchAccounts));

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


// GL Account Activation Routes
router.post('/initialize-activate', (GLAccountController.initializeAndActivateGLAccounts));
router.get('/activation-status', (GLAccountController.getGLActivationStatus));
router.post('/activate-specific', (GLAccountController.activateSpecificGLAccounts));
router.post('/force-reactivate', (GLAccountController.forceReactivateGLAccounts));
router.get('/by-number/:GL_ACCT_NO', asyncHandler(GLAccountController.getGLAccountByNumber));

router.put('/coa/update/:GL_ACCT_NO', asyncHandler(GLAccountController.updateCOA));
router.put('/coa/bulk-update', asyncHandler(GLAccountController.bulkUpdateCOA));
router.get('/coa/settings/:organizationCode', asyncHandler(GLAccountController.getCOASettings));

export default router;