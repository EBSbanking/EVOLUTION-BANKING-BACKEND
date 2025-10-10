import express from 'express';
import asyncHandler from 'express-async-handler';
import rateLimit from 'express-rate-limit';
import { restrictToPermission } from '../middlewares/rbac.js';
import {
  upsertAML,
  updateAMLByCustId,
  getAMLByCustId,
  getAllAMLRecords,
  deleteAMLByCustId,
  approveAML
} from '../controllers/AMLController.js';

const router = express.Router();

const amlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requests per IP
});

router.use(amlLimiter);

/**
 * @route   POST /api/banking/aml/upsert
 * @desc    Create or update AML record by CUST_ID with workflow
 * @access  CONFIGURE_AML
 */
router.post('/upsert', restrictToPermission('configureAML'), asyncHandler(upsertAML));

/**
 * @route   PUT /api/banking/aml/update/:custId
 * @desc    Update AML record by CUST_ID only (no insert)
 * @access  CONFIGURE_AML
 */
router.put('/update/:custId', restrictToPermission('configureAML'), asyncHandler(updateAMLByCustId));

/**
 * @route   POST /api/banking/aml/approve
 * @desc    Approve AML record by CUST_ID
 * @access  APPROVE_AML
 */
router.post('/approve', restrictToPermission('amlApproval'), asyncHandler(approveAML));

/**
 * @route   GET /api/banking/aml/:custId
 * @desc    Get AML record by CUST_ID
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/:custId', restrictToPermission('amlThreshold'), asyncHandler(getAMLByCustId));

/**
 * @route   GET /api/banking/aml
 * @desc    Get all AML records
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/', restrictToPermission('amlThreshold'), asyncHandler(getAllAMLRecords));

/**
 * @route   DELETE /api/banking/aml/:custId
 * @desc    Delete AML record by CUST_ID
 * @access  CONFIGURE_AML
 */
router.delete('/:custId', restrictToPermission('configureAML'), asyncHandler(deleteAMLByCustId));

export default router;