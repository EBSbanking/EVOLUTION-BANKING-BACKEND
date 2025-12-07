// routes/groupRoutes.js - Express Routes for Group Controller
import { Router } from 'express';
import {
  createGroup,
  getGroups,
  addMemberToGroup,
  createGroupLoanApplication,

  repayGroupLoan,
  getGroupLoan,
  approveGroupLoan,
  rejectGroupLoan,
  getPendingCreditApplications,
  getApprovedCreditApplications, 
  getRejectedCreditApplications ,
  getGroupLoanPortfolio,
  getGroupRepaymentCollectionSheet,
  submitGroupCollections 
} from '../controllers/GroupController.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import {  disburseGroupLoan} from '../Services/processGroupLoanDisbursement.js'

const router = Router();

// 🧩 Group management routes
router.post('/groups', authenticate, createGroup);
router.get('/groups', authenticate, getGroups);
router.post('/groups/:groupCode/members', authenticate, addMemberToGroup);

// 💰 Group loan management routes
router.post('/group-loans', authenticate, createGroupLoanApplication);
router.post('/group-loans/:id/disbursement', authenticate, disburseGroupLoan);
// routes/groupLoanRoutes.js
router.post('/group-loans/:groupLoanId/repayment', authenticate, repayGroupLoan);

// Add this route to your group routes
router.get('/group-loans/portfolio', authenticate,  getGroupLoanPortfolio);

// ✅ Credit applications routes - FIXED: Placed BEFORE parameterized routes
router.get('/group-loans/pending-credit-applications', authenticate, getPendingCreditApplications);
router.get('/group-loans/approved-credit-applications', authenticate, getApprovedCreditApplications); // ✅ Added
router.get('/group-loans/rejected-credit-applications', authenticate, getRejectedCreditApplications); // ✅ Added

// Parameterized routes (placed AFTER specific routes to avoid catching literals as params)
router.get('/group-loans/:id', authenticate, getGroupLoan);
router.patch('/group-loans/:id/approve', authenticate, approveGroupLoan);
router.patch('/group-loans/:id/reject', authenticate, rejectGroupLoan);

// //Group collection sheet route
// router.get('/collection-sheet/:groupId', authenticate, getGroupRepaymentCollectionSheet);
router.post('/submit-collections', authenticate, submitGroupCollections);

// routes/loanCollectionRoutes.js - Add this route

/**
 * @route GET /api/collections/group-repayment/:groupId
 * @description Get comprehensive repayment collection sheet for a group loan
 * @param {string} groupId - Group loan ID
 * @query {boolean} [includeHistory] - Include payment history (true/false)
 * @query {string} [startDate] - Start date for history filter (YYYY-MM-DD)
 * @query {string} [endDate] - End date for history filter (YYYY-MM-DD)
 * @returns {Object} Group repayment collection sheet with detailed member status
 */
router.get('/group-repayment/:groupId', authenticate, getGroupRepaymentCollectionSheet);


export default router;