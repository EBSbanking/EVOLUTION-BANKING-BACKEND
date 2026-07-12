// routes/TermDepositRoutes.js - UPDATED WITH ALL METHODS

import express from 'express';
import { 
  createTermDeposit,
  getAllTermDeposits,
  getTermDepositById,
  updateTermDeposit,
  deleteTermDeposit,
  settleMaturedTermDeposit,
  earlyTerminateTermDeposit,
  getTermDepositsByStatus,
  getTermDepositsByCustomer,
  getInterestDistributions,
  accrueDailyInterest,
  approveTermDepositByBU_ID,
  rejectTermDepositByBU_ID,
  getPendingTermDepositsByBU_ID
} from '../controllers/TermDepositController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// ============================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================

// Create term deposit
router.post('/', createTermDeposit);

// ============================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================

// ========== MANAGER APPROVAL ROUTES ==========

// ✅ APPROVE - Multiple method support
// Approve by ACCT_NO (body parameter)
router.put('/approve', authenticate, approveTermDepositByBU_ID);
router.patch('/approve', authenticate, approveTermDepositByBU_ID);
router.post('/approve', authenticate, approveTermDepositByBU_ID);

// Approve by ID (URL parameter)
router.put('/:id/approve', authenticate, approveTermDepositByBU_ID);
router.patch('/:id/approve', authenticate, approveTermDepositByBU_ID);
router.post('/:id/approve', authenticate, approveTermDepositByBU_ID);

// ✅ REJECT - Multiple method support
// Reject by ACCT_NO (body parameter)
router.put('/reject', authenticate, rejectTermDepositByBU_ID);
router.patch('/reject', authenticate, rejectTermDepositByBU_ID);
router.post('/reject', authenticate, rejectTermDepositByBU_ID);

// Reject by ID (URL parameter)
router.put('/:id/reject', authenticate, rejectTermDepositByBU_ID);
router.patch('/:id/reject', authenticate, rejectTermDepositByBU_ID);
router.post('/:id/reject', authenticate, rejectTermDepositByBU_ID);

// Get pending term deposits for a specific branch
router.get('/pending/branch/:BU_ID', authenticate, getPendingTermDepositsByBU_ID);

// Get pending term deposits for the manager's own branch
router.get('/pending/my-branch', authenticate, getPendingTermDepositsByBU_ID);

// ========== SYSTEM/ADMIN ROUTES ==========

// Daily interest accrual (cron job or manual trigger)
router.post('/accrue-interest', authenticate, accrueDailyInterest);

// Settle matured term deposit
router.post('/:id/settle', authenticate, settleMaturedTermDeposit);

// Early terminate term deposit
router.post('/:id/terminate', authenticate, earlyTerminateTermDeposit);

// ========== GET ROUTES ==========

// Get all term deposits (with pagination and filtering)
router.get('/', authenticate, getAllTermDeposits);

// Get term deposits by status
router.get('/status/:status', authenticate, getTermDepositsByStatus);

// Get term deposits by customer
router.get('/customer/:custId', authenticate, getTermDepositsByCustomer);

// Get single term deposit by ID (with distributions)
router.get('/:id', authenticate, getTermDepositById);

// Get interest distributions for a term deposit
router.get('/:id/distributions', authenticate, getInterestDistributions);

// ========== UPDATE & DELETE ROUTES ==========

// Update term deposit
router.put('/:id', authenticate, updateTermDeposit);
router.patch('/:id', authenticate, updateTermDeposit);

// Delete term deposit (soft delete or hard delete)
router.delete('/:id', authenticate, deleteTermDeposit);

export default router;