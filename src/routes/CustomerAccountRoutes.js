// src/routes/CustomerAccountRoutes.js
import express from 'express';
import { 
  createCustomerAccount, 
  getAllCustomerAccounts, 
  updateCustomerAccount, 
  deleteCustomerAccount,
  getCustomerAccountByCUST_ID,
  updateDormantAccounts,
  searchCustomersByName,
  getAccountByNumber,
  activateCustomerAccount, 
  bulkActivateAccounts, 
  getAccountActivationHistory 
} from '../controllers/CustomerAccountController.js';


import logger from '../utils/logger.js'; 
import AuditTrail from '../models/AuditTrail.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { Op } from 'sequelize';

const router = express.Router();

// Debug endpoint
router.get('/debug-all-accounts', async (req, res) => {
  try {
    const accounts = await CustomerAccount.findAll();
    res.json({ total: accounts.length, sample: accounts.slice(0, 5).map(a => a.toJSON()) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Main routes
router.get('/accounts/:accountNumber', getAccountByNumber);
// To accept path parameter:
// For path parameters: /api/customers-account/Dera
router.get('/customers-account/search/:name', searchCustomersByName);

router.post('/accounts', createCustomerAccount);
router.get('/accounts', getAllCustomerAccounts);
router.put('/accounts/:ACCT_NO', updateCustomerAccount);
router.delete('/accounts/:ACCT_NO', deleteCustomerAccount);
router.get('/customer/:CUST_ID', getCustomerAccountByCUST_ID);

// Activation routes
router.patch('/accounts/:ACCT_NO/activate', activateCustomerAccount);
router.post('/accounts/bulk-activate', bulkActivateAccounts);
router.get('/accounts/:ACCT_NO/activation-history', getAccountActivationHistory);



// Transaction history — Fixed with Sequelize syntax
router.get('/transactions/:ACCT_NO', async (req, res) => {
  const { ACCT_NO } = req.params;

  if (!/^\d{10}$/.test(ACCT_NO)) {
    return res.status(400).json({ success: false, message: 'Invalid account number format' });
  }

  try {
    const transactions = await AuditTrail.findAll({
      where: {
        account_no: ACCT_NO,
        event_type: { [Op.in]: ['TRANSACTION_DR', 'TRANSACTION_CR'] }
      },
      order: [['timestamp', 'DESC']],
    });

    res.json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    logger.error('Transaction history fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});




// Dormant accounts update — direct function call
router.post('/system/update-dormant', updateDormantAccounts);

// Remove or comment out complex savings reports until models are stable
// router.get('/savings-reports', ...);
// router.get('/savings-dashboard-metrics', ...);

export default router;