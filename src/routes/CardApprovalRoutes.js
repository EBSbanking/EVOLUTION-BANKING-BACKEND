// routes/cardApprovalRoutes.js - UPDATED TO MATCH FRONTEND
import express from 'express';
import {
  requestCardIssuance,
  approveCardRequest,
  rejectCardRequest,
  getPendingApprovals,
  getApprovalRequestStatus,
  getMyRequests,
  cancelRequest,
  issueCardDirectly,
  getRequestHistory,
  getApprovalStatistics,
  updateWorkflowConfig,
  getWorkflowConfigs,
  getApprovalQueue
} from '../controllers/CardApprovalController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { ROLES } from '../utils/roleConstants.js';

const router = express.Router();

// ==================== All routes require authentication ====================
router.use(authenticate);

// ==================== Approval Endpoints (matches frontend) ====================

/**
 * @route   GET /api/card-approvals/approvals/pending
 * @desc    Get pending approvals
 * @access  Authorized users
 */
router.get('/approvals/pending', getPendingApprovals);

/**
 * @route   POST /api/card-approvals/approvals/:requestId/approve
 * @desc    Approve a card request
 * @access  Authorized users
 */
router.post('/approvals/:requestId/approve', approveCardRequest);

/**
 * @route   POST /api/card-approvals/approvals/:requestId/reject
 * @desc    Reject a card request
 * @access  Authorized users
 */
router.post('/approvals/:requestId/reject', rejectCardRequest);

/**
 * @route   GET /api/card-approvals/approvals/statistics
 * @desc    Get approval statistics
 * @access  Admin, CEO
 */
router.get('/approvals/statistics', getApprovalStatistics);

/**
 * @route   GET /api/card-approvals/approvals/:requestId/history
 * @desc    Get request history
 * @access  Owner or admin
 */
router.get('/approvals/:requestId/history', getRequestHistory);

/**
 * @route   GET /api/card-approvals/approvals/queue
 * @desc    Get approval queue
 * @access  Admin, CEO
 */
router.get('/approvals/queue', getApprovalQueue);

/**
 * @route   GET /api/card-approvals/approvals/:requestId/status
 * @desc    Get request status
 * @access  Owner or admin
 */
router.get('/approvals/:requestId/status', getApprovalRequestStatus);

// ==================== Workflow Configuration ====================

/**
 * @route   GET /api/card-approvals/workflow-configs
 * @desc    Get workflow configurations
 * @access  Admin, CEO
 */
router.get('/workflow-configs', getWorkflowConfigs);

/**
 * @route   PUT /api/card-approvals/workflow-configs/:configId
 * @desc    Update workflow configuration
 * @access  Admin, CEO
 */
router.put('/workflow-configs/:configId', updateWorkflowConfig);

// ==================== My Requests ====================

/**
 * @route   GET /api/card-approvals/requests/my-requests
 * @desc    Get user's own requests
 * @access  Authenticated users
 */
router.get('/requests/my-requests', getMyRequests);

/**
 * @route   PUT /api/card-approvals/requests/:requestId/cancel
 * @desc    Cancel a request
 * @access  Owner only
 */
router.put('/requests/:requestId/cancel', cancelRequest);

// ==================== Direct Issuance (Bypass Approval) ====================

/**
 * @route   POST /api/card-approvals/cards/issue-direct
 * @desc    Direct card issuance (bypasses approval)
 * @access  Admin, CEO, Head Banking Services
 */
router.post(
  '/cards/issue-direct',
  authorize(ROLES.ADMINISTRATOR, ROLES.CHIEF_EXECUTIVE_OFFICER, ROLES.HEAD_BANKING_SERVICES),
  issueCardDirectly
);

/**
 * @route   POST /api/card-approvals/cards/request-issuance
 * @desc    Request card issuance (approval workflow)
 * @access  All authenticated users
 */
router.post('/cards/request-issuance', requestCardIssuance);

export default router;