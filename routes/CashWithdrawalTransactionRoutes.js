import { Router } from 'express';
import { withdraw, getHistory } from '../controllers/CashWithdrawalTransactionController.js';

const router = Router();

// Route for creating a cash withdrawal transaction
router.post('/withdraw', withdraw);

// Route for fetching the withdrawal history
router.get('/history', getHistory);

export default router;
