import express from 'express';
import { 
  createTermDeposit,
  getAllTermDeposits,
  getTermDepositById,
  updateTermDeposit,
  deleteTermDeposit,
  settleMaturedTermDeposit,
  earlyTerminateTermDeposit
} from '../controllers/TermDepositController.js';

const router = express.Router();

// Define routes
router.post('/create', createTermDeposit);
router.get('/create', getAllTermDeposits);
router.get('/:id', getTermDepositById);
router.put('/:id', updateTermDeposit);
router.delete('/:id', deleteTermDeposit);
router.post('/settle/:id', settleMaturedTermDeposit);
router.post('/terminate/:id', earlyTerminateTermDeposit);

export default router;