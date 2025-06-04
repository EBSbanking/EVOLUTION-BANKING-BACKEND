// routes/depositAccountApplicationRoutes.js
import express from 'express';
import DepositAccountApplicationController from '../controllers/DepositAccountApplicationController.js'; // Ensure the correct import path
import { generateAccountIdentifiers } from '../utils/generateAccountNumber.js';

const router = express.Router();

// Route to create a deposit account application
router.post('/create', DepositAccountApplicationController.createApplication);

// Route to get all deposit account applications
router.get('/create', DepositAccountApplicationController.getDepositAccountApplication);

// Route to get a deposit account application by Account Number
router.get('/account/:ACCT_NO', DepositAccountApplicationController.getApplicationByACCT_NO);

// Route to update a deposit account application by ID
router.put('/:id', DepositAccountApplicationController.updateApplication);

// Route to delete a deposit account application by ID
router.delete('/:id', DepositAccountApplicationController.deleteApplication);

// Route to generate a new account number
// Route to generate account numbers
router.get('/generate-account-number', (req, res) => {
    try {
      // Call generateAccountIdentifiers directly
      const { ACCT_NO, ACCT_ID } = generateAccountIdentifiers();
      res.status(200).json({ ACCT_NO, ACCT_ID });
    } catch (error) {
      console.error('Error occurred:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  });

export default router;
