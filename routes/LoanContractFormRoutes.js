import express from 'express';
import LoanContractFormController from '../controllers/LoanContractFormController.js';

const router = express.Router();

// POST: Create a new loan contract
router.post('/loan-contracts', LoanContractFormController.createLoanContract);

// GET: Fetch a loan contract by account number
router.get('/loan-contract/by-acct/:acct_no', LoanContractFormController.getLoanContractByAcctNo);


// GET: Fetch all loan contracts (Optional - list view)
router.get('/loan-contracts', async (req, res) => {
    try {
        const contracts = await LoanContractForm.find();
        res.status(200).json(contracts);
    } catch (error) {
        console.error('Error fetching loan contracts:', error);
        res.status(500).json({ message: 'Error fetching loan contracts' });
    }
});

// GET: Fetch a specific loan contract by ID
router.get('/loan-contracts/:id', async (req, res) => {
    try {
        const contract = await LoanContractForm.findById(req.params.id);
        if (!contract) {
            return res.status(404).json({ message: 'Loan contract not found' });
        }
        res.status(200).json(contract);
    } catch (error) {
        console.error('Error fetching loan contract:', error);
        res.status(500).json({ message: 'Error fetching loan contract' });
    }
});

router.get('/loancontract/:id', LoanContractFormController.getLoanContract);

// In your routes file (e.g., loanContractRoutes.js)
router.get('/by-customer/:cust_id', LoanContractFormController.getLoanContractsByCustomerId);

// PUT: Update a specific loan contract by ID
router.put('/loan-contracts/:id', async (req, res) => {
    try {
        const updatedContract = await LoanContractForm.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );

        if (!updatedContract) {
            return res.status(404).json({ message: 'Loan contract not found' });
        }

        res.status(200).json({
            message: 'Loan contract updated successfully',
            updatedContract,
        });
    } catch (error) {
        console.error('Error updating loan contract:', error);
        res.status(500).json({ message: 'Error updating loan contract' });
    }
});

export default router;
