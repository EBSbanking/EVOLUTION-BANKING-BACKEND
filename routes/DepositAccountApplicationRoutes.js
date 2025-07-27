// routes/depositAccountApplicationRoutes.js
import express from 'express';
import DepositAccountApplicationController from '../controllers/DepositAccountApplicationController.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';

const router = express.Router();

// Application Creation
router.post('/create', DepositAccountApplicationController.createApplication);

// Generate Account Number by Product ID (Query Param: ?prodId=123)
router.get('/generate-account-number', async (req, res) => {
  try {
    const { prodId } = req.query;
    if (!prodId) {
      return res.status(400).json({ message: 'prodId query parameter is required.' });
    }

    const ACCT_NO = await generateLoanAccountNumberByProdId(prodId);
    res.status(200).json({ ACCT_NO });
  } catch (error) {
    console.error('Error occurred:', error);
    res.status(500).json({ message: 'Internal Server Error', error: error.message });
  }
});

// Application Retrieval
router.get('/customer/:CUST_ID', DepositAccountApplicationController.getApplicationByCustId);
router.get('/account/:ACCT_NO', DepositAccountApplicationController.getApplicationByACCT_NO);

// Application Status Management
router.put('/approve/customer/:CUST_ID', DepositAccountApplicationController.approveApplicationByCustomerId);
router.put('/reject/customer/:CUST_ID', DepositAccountApplicationController.rejectApplicationByCustomerId);
router.put('/status/:id', DepositAccountApplicationController.updateApplicationStatus);

// Application Updates
router.put('/:CUST_ID', DepositAccountApplicationController.updateApplication);

// Application Deletion
router.delete('/:id', DepositAccountApplicationController.deleteApplication);

export default router;
