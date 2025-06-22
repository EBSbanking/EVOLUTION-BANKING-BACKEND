// routes/depositAccountApplicationRoutes.js
import express from 'express';
import DepositAccountApplicationController from '../controllers/DepositAccountApplicationController.js';
import { generateAccountIdentifiers } from '../utils/generateAccountNumber.js';

const router = express.Router();

// Application Creation & Generation
router.post('/create', DepositAccountApplicationController.createApplication);
router.get('/generate-account-number', (req, res) => {
  try {
    const { ACCT_NO, ACCT_ID } = generateAccountIdentifiers();
    res.status(200).json({ ACCT_NO, ACCT_ID });
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