// routes/autoReclassificationRoutes.js
import express from 'express';
import {
  createReclassification,
  getAllReclassifications,
  getReclassificationById,
  getReclassificationByProductCode,
  updateReclassification,
  patchReclassification,
  deleteReclassification,
  reactivateReclassification,
  getReclassificationsByCriteria,
  validateReclassification,
  getReclassificationStats,
  applyReclassificationToLoan,
  bulkUpdateReclassifications
} from '../controllers/AutoReclassifyInformationController.js';

const router = express.Router();

// REMOVED: router.use(authenticate);

// Public routes (read-only)
router.get('/', getAllReclassifications);
router.get('/stats', getReclassificationStats);
router.get('/validate', validateReclassification);
router.get('/criteria', getReclassificationsByCriteria);
router.get('/product/:prod_cd', getReclassificationByProductCode);
router.get('/:id', getReclassificationById);

// Admin routes (require admin role)
router.post('/', createReclassification);
router.put('/:id', updateReclassification);
router.patch('/:id', patchReclassification);
router.delete('/:id', deleteReclassification);
router.patch('/:id/reactivate', reactivateReclassification);

// Special operation routes
router.post('/apply-to-loan', applyReclassificationToLoan);
router.post('/bulk-update', bulkUpdateReclassifications);

export default router;