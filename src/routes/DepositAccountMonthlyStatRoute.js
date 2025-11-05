import express from 'express';
import {
  createMonthlyStat,
  getAllMonthlyStats,
  getMonthlyStatById,
  updateMonthlyStat,
  deleteMonthlyStat
} from '../controllers/DepositAccountMonthlyStatController.js';

const router = express.Router();

// Routes for Deposit Account Monthly Stat
router.post('/', createMonthlyStat); // Create
router.get('/', getAllMonthlyStats); // Get All
router.get('/:id', getMonthlyStatById); // Get by ID
router.put('/:id', updateMonthlyStat); // Update by ID
router.delete('/:id', deleteMonthlyStat); // Delete by ID

export default router;
