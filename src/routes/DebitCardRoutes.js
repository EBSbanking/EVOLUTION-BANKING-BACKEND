import express from 'express';
import {
  issueCard,
  cardPurchase,
  getCustomerCards,
  setDailyLimit,
  setPerTransactionLimit,
  setCardPin,
  blockCard,
  unblockCard,
  getCardTransactionHistory
} from '../controllers/DebitCardController.js';

const router = express.Router();

router.post('/cards/issue', issueCard);
router.post('/cards/transaction', cardPurchase);
router.get('/cards/customer/:customerId', getCustomerCards);
router.put('/cards/daily-limit', setDailyLimit);
router.put('/cards/per-transaction-limit', setPerTransactionLimit);
router.post('/cards/set-pin', setCardPin);
router.post('/cards/block', blockCard);
router.post('/cards/unblock', unblockCard);
router.get('/cards/transactions', getCardTransactionHistory);

export default router;