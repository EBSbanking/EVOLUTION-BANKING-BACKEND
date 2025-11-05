// routes/identifierRoutes.js
import express from 'express';
import {
  generateLoanAccountNumberByProdId,
  generateAccountNumber,
  generateTransactionId
} from '../utils/generateLoanAccountId.js';
import Transaction from '../models/Transaction.js';
import CreditApplication from '../models/CreditApplication.js'; // Import using ES modules

const router = express.Router();

// GET /api/identifiers/account/:prodId
router.get('/account/:prodId', async (req, res) => {
  try {
    const { prodId } = req.params;
    const accountNumber = await generateLoanAccountNumberByProdId(prodId);
    
    res.json({
      success: true,
      identifier: accountNumber,
      type: 'account_number',
      productId: prodId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/identifiers/account
router.get('/account', async (req, res) => {
  try {
    const accountNumber = generateAccountNumber();
    
    res.json({
      success: true,
      identifier: accountNumber,
      type: 'fallback_account_number'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/identifiers/transaction
router.get('/transaction', async (req, res) => {
  try {
    // Note: You'll need to pass a session if using transactions
    const transactionId = await generateTransactionId(null);
    
    res.json({
      success: true,
      identifier: transactionId,
      type: 'transaction_id'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// GET /api/identifiers/credit-application
router.get('/credit-application', async (req, res) => {
  try {
    const applicationId = await CreditApplication.generateApplId();
    
    res.json({
      success: true,
      identifier: applicationId,
      type: 'credit_application_id'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;