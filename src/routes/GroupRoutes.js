// routes/groupRoutes.js - Express Routes for Group Controller
import { Router } from 'express';
import {
  createGroup,
  getGroups,
  addMemberToGroup,
  createGroupLoanApplication,
  disburseGroupLoan,
  repayGroupLoan,
  getGroupLoan,
  approveGroupLoan,
  rejectGroupLoan,
  getPendingCreditApplications,
  getApprovedCreditApplications, 
  getRejectedCreditApplications ,
  getGroupLoanPortfolio 
} from '../controllers/GroupController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

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

export default router;