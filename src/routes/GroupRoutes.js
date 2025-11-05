// routes/groupRoutes.js - Express Routes for Group Controller
import { Router } from 'express';
import {
  createGroup,
  getGroups, // ✅ added
  addMemberToGroup,
  createGroupLoanApplication,
  disburseGroupLoan,
  repayGroupLoan,
  getGroupLoan,
} from '../controllers/GroupController.js'; // Adjust path if needed
import { authenticate } from '../middlewares/authMiddleware.js'; // Assuming auth middleware exists

const router = Router();

// 🧩 Group management routes
router.post('/groups', authenticate, createGroup); // Create new group
router.get('/groups', authenticate, getGroups); // ✅ Get groups (with search/filter)
router.post('/groups/:groupCode/members', authenticate, addMemberToGroup); // Add member to group

// 💰 Group loan management routes
router.post('/group-loans', authenticate, createGroupLoanApplication); // Create group loan
router.post('/group-loans/:groupLoanId/disbursement', authenticate, disburseGroupLoan); // Disburse loan
router.post('/group-loans/:groupLoanId/repayment', authenticate, repayGroupLoan); // Repay loan
router.get('/group-loans/:groupLoanId', authenticate, getGroupLoan); // Get group loan by ID

export default router;
