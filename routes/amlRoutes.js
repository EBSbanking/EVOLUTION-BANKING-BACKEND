// routes/amlRoutes.js
import express from 'express';
import {
  upsertAML,
  updateAMLByCustId,
  getAMLByCustId,
  getAllAMLRecords,
  deleteAMLByCustId,
  approveAML
} from '../controllers/AMLController.js';

const router = express.Router();

/**
 * @route   POST /api/aml/upsert
 * @desc    Create or update AML by CUST_ID with workflow
 */
router.post('/upsert', upsertAML);

/**
 * @route   PUT /api/aml/update/:custId
 * @desc    Update AML record by CUST_ID only (no insert)
 */
router.put('/update/:custId', updateAMLByCustId);

/**
 * @route   POST /api/aml/approve
 * @desc    Approve AML record by CUST_ID
 */
router.post('/approve', approveAML);


/**
 * @route   GET /api/aml/:custId
 * @desc    Get AML record by CUST_ID
 */
router.get('/:custId', getAMLByCustId);

/**
 * @route   GET /api/aml
 * @desc    Get all AML records
 */
router.get('/', getAllAMLRecords);

/**
 * @route   DELETE /api/aml/:custId
 * @desc    Delete AML record by CUST_ID
 */
router.delete('/:custId', deleteAMLByCustId);

export default router;
