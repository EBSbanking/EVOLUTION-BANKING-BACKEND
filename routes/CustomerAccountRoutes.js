import express from 'express';
import { 
  createCustomerAccount, 
  getAllCustomerAccounts, 
  getCustomerAccountById, 
  updateCustomerAccount, 
  deleteCustomerAccount,
  getCustomerAccountByCUST_ID 
} from '../controllers/CustomerAccountController.js';
import postTransaction from '../Services/postTransaction.js'; // default import
import logger from '../utils/logger.js'; 
import AuditTrail from '../models/AuditTrail.js'; // Make sure the import path is correct

const router = express.Router();

router.post('/accounts', createCustomerAccount);
router.get('/accounts', getAllCustomerAccounts);
router.get('/accounts/:ACCT_NO', getCustomerAccountById);
router.put('/accounts/:ACCT_NO', updateCustomerAccount);
router.delete('/accounts/:ACCT_NO', deleteCustomerAccount);
router.get('/customer/:CUST_ID', getCustomerAccountByCUST_ID);

// Post Transaction
router.post('/transactions', postTransaction);

router.get('/transactions/:ACCT_NO', async (req, res) => {
  const { ACCT_NO } = req.params;
  try {
    if (!/^\d{10}$/.test(ACCT_NO)) {
      return res.status(400).json({ success: false, message: 'ACCT_NO must be a 10-digit number.' });
    }

    const transactions = await AuditTrail.find({
      account_no: ACCT_NO,
      event_type: { $in: ['TRANSACTION_DR', 'TRANSACTION_CR'] },
    }).sort({ timestamp: -1 });

    return res.status(200).json({
      success: true,
      message: 'Transaction history retrieved successfully',
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    // Logging error
    logger.error('Error fetching transaction history:', { 
      error: error.message, 
      stack: error.stack 
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching transaction history',
      error: error.message,
    });
  }
});

export default router;
