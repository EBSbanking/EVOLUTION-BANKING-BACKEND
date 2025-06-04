import express from 'express';
import { 
    createWithdrawalTransaction, 
    createCustomerAccounts, 
    getTransactionByRefNo, 
    getTransactionsByAcctNoOrWorkItemId,  
    getPendingApprovals, 
    processApprovedWorkflowItem, 
    rejectWorkflowItem, 
    getWorkflowItemWithTransaction,
    getAllWithdrawalTransactions
} from '../controllers/withdrawalController.js';

const router = express.Router();

// Route for creating a withdrawal transaction and returning only the transaction reference number
router.post('/withdrawals', createWithdrawalTransaction);

// Route for creating multiple customer accounts
router.post('/accounts', createCustomerAccounts);

// Route for fetching a transaction by reference number
router.get('/:acctNo/refs', getTransactionByRefNo);

// Route for fetching all transactions by account number
router.get('/transactions/:acctNo/:workItemId?', getTransactionsByAcctNoOrWorkItemId);

// Route to fetch all pending approvals
router.get('/pending-approvals', getPendingApprovals);

// Route to approve a specific workflow item by ID
router.post('/workflow/approve/:workItemId', processApprovedWorkflowItem);

// Route to reject a specific workflow item by ID
router.post('/workflow/reject/:workItemId', rejectWorkflowItem);

// Route to get the details of a specific workflow item by ID
router.get('/workflow/:workItemId', getWorkflowItemWithTransaction);

router.get('/withdrawal-transactions', getAllWithdrawalTransactions);

export default router;
