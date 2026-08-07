// src/routes/CollateralRoutes.js
import express from 'express';
import {
  createCollateral,
  getAllCollateral,
  getPendingApprovalsByBranch, // ✅ FIXED: Use correct function name
  approveBranchCollateral,
  rejectBranchCollateral,
  getCollateralById,
  getCollateralByCustomer,
  getCollateralByLoan,
  getCollateralByBranch,
  updateCollateralById,
updateCollateralByBranch,
  deleteCollateralById,
  deleteCollateralbybranch,
  getNDICCollateralSummary,
  getCollateralStats,
  bulkCreateCollateral,
  approveCollateral, // ✅ ADDED: Individual approve
  rejectCollateral   // ✅ ADDED: Individual reject
} from '../controllers/CollateralController.js';
import { protect, authorize, isAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Define approval officer roles
const APPROVAL_OFFICER_ROLES = [
  'Branch Manager',
  'Branch Operation Supervisor', 
  'Head of Credit',
  'Internal Control Manager',
  'Internal Control Officer',
  'Chief Operation Officer',
  'Chief Financial Officer',
  'Chief Executive Officer',
  'Internal Audit Manager',
  'Senior Financial Accountant',
  'Financial Accountant Manager',
  'Loan Processing Supervisor',
  'Administrator',
  'SuperAdmin',
  'SystemAdmin'
];

// ==========================================
// ALL ROUTES - Require authentication
// ==========================================

// POST /api/admin/collateral - Create new collateral
router.post('/', protect, createCollateral);

// GET /api/admin/collateral - Get all collateral with filters
router.get('/', protect, getAllCollateral);

// GET /api/admin/collateral/stats - Get statistics
router.get('/stats', protect, getCollateralStats);

// GET /api/admin/collateral/:id - Get by ID
router.get('/:id', protect, getCollateralById);

// GET /api/admin/collateral/branch/:buId - Get by branch
router.get('/branch/:buId', protect, getCollateralByBranch);

// PUT /api/admin/collateral/:id - Update
router.put('/:id', protect, updateCollateralById);

// DELETE /api/admin/collateral/:id - Soft delete
router.delete('/:id', protect, deleteCollateralById);

// ==========================================
// APPROVAL WORKFLOW ROUTES - Approval Officers only
// ==========================================

// GET /api/admin/collateral/branch/:buId/pending - Get pending approvals for a branch
router.get('/branch/:buId/pending', protect, authorize(APPROVAL_OFFICER_ROLES), getPendingApprovalsByBranch);

// POST /api/admin/collateral/branch/:buId/approve - Approve all pending for a branch
router.post('/branch/:buId/approve', protect, authorize(APPROVAL_OFFICER_ROLES), approveBranchCollateral);

// POST /api/admin/collateral/branch/:buId/reject - Reject all pending for a branch
router.post('/branch/:buId/reject', protect, authorize(APPROVAL_OFFICER_ROLES), rejectBranchCollateral);

// DELETE /api/admin/collateral/branch/:buId - Delete all collateral for a branch
router.delete('/branch/:buId', protect, deleteCollateralbybranch);

// PUT /api/admin/collateral/branch/:buId - Update all collateral for a branch
router.put('/branch/:buId', protect, updateCollateralByBranch);

// ==========================================
// INDIVIDUAL APPROVAL ROUTES (by collateral ID)
// ==========================================

// POST /api/admin/collateral/:id/approve - Approve individual collateral
router.post('/:id/approve', protect, authorize(APPROVAL_OFFICER_ROLES), approveCollateral);

// POST /api/admin/collateral/:id/reject - Reject individual collateral
router.post('/:id/reject', protect, authorize(APPROVAL_OFFICER_ROLES), rejectCollateral);

// ==========================================
// LOOKUP ROUTES - Any authenticated user
// ==========================================

// GET /api/admin/collateral/customer/:customerId - By customer
router.get('/customer/:customerId', protect, getCollateralByCustomer);

// GET /api/admin/collateral/loan/:loanAccountNo - By loan
router.get('/loan/:loanAccountNo', protect, getCollateralByLoan);

// GET /api/admin/collateral/loan/:loanAccountNo/ndic-summary - NDIC summary
router.get('/loan/:loanAccountNo/ndic-summary', protect, getNDICCollateralSummary);

// ==========================================
// BULK OPERATIONS - Admin only
// ==========================================

// POST /api/admin/collateral/bulk - Bulk create (Admin only)
router.post('/bulk', protect, isAdmin, bulkCreateCollateral);

export default router;