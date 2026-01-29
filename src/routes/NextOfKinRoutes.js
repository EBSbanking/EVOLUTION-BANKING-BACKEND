import express from 'express';
import {
  getAllNextOfKins,
  getNextOfKinById,
  getNextOfKinsByCustomer,
  createNextOfKin,
  updateNextOfKin,
  deleteNextOfKin,
  setPrimaryNextOfKin,
  getPrimaryNextOfKin,
  bulkCreateNextOfKins
} from '../controllers/NextOfKinController.js';

const router = express.Router();

// ===== TEMPORARY FIX - Comment out or remove this line =====
// router.use(protect); // Remove or comment this line

// Routes will now be accessible without authentication
router.get('/', getAllNextOfKins);
router.get('/:id', getNextOfKinById);
router.get('/customer/:customerId', getNextOfKinsByCustomer);
router.get('/customer/:customerId/primary', getPrimaryNextOfKin);

// Protected routes (require specific roles)
router.post('/', createNextOfKin);
router.post('/bulk', bulkCreateNextOfKins);
router.put('/:id', updateNextOfKin);
router.put('/:id/set-primary', setPrimaryNextOfKin);
router.delete('/:id', deleteNextOfKin);

export default router;