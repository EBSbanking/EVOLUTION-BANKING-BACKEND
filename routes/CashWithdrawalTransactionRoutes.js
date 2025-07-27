// routes/withdrawalRoutes.js
import { Router } from 'express';
import { withdraw, getHistory } from '../controllers/CashWithdrawalTransactionController.js';
import decryptPayload from '../middlewares/decryptPayload.js'; // 🔐 Import decryption middleware

const router = Router();

// 🔐 Decrypt and verify before withdrawal
router.post('/withdraw', decryptPayload, withdraw);

// Fetch withdrawal history
router.get('/history', getHistory);

export default router;
