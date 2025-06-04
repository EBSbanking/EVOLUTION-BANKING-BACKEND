import express from 'express';
import { 
    createCustomerAccount, 
    getAllCustomerAccounts, 
    getCustomerAccountById, 
    updateCustomerAccount, 
    deleteCustomerAccount 
} from '../controllers/CustomerAccountController.js';

const router = express.Router();

// Customer Account Routes
router.post('/accounts', createCustomerAccount); // Create customer account
router.get('/accounts', getAllCustomerAccounts); // Get all customer accounts
router.get('/accounts/:ACCT_NO', getCustomerAccountById); // Get customer account by ACCT_NO
router.put('/accounts/:ACCT_NO', updateCustomerAccount); // Update customer account by ACCT_NO
router.delete('/accounts/:ACCT_NO', deleteCustomerAccount); // Delete customer account by ACCT_NO

export default router;
