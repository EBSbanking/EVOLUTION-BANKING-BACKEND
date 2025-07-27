import express from 'express';
import CreditApplicationController from '../controllers/CreditApplicationController.js';
import LoanContractController from '../controllers/LoanContractFormController.js';
import CreditApplication from '../models/CreditApplication.js'; // adjust path as needed


const router = express.Router();

// Credit Application Routes

// Create a new credit application
router.post('/credit-applications', CreditApplicationController.createCreditApplication);

// Get all credit applications
router.get('/credit-applications', CreditApplicationController.getAllCreditApplicationsWithWorkItems);

// Get credit application by APPL_ID
router.get('/applid/:applId', CreditApplicationController.getCreditApplicationByApplId);

// Get credit application by MongoDB ID
router.get('/id/:id', CreditApplicationController.getCreditApplicationByIdRaw);

// Get credit application by ACCT_NO
router.get('/credit-applications/:acctNo', CreditApplicationController.getCreditApplicationByAcctNo);

// Update credit application by MongoDB ID
router.put('/credit-applications/:applId(*)', CreditApplicationController.updateCreditApplication);

// Delete credit application by MongoDB ID
router.delete('/:applId', CreditApplicationController.deleteCreditApplication);

router.get('/customer/:custId', CreditApplicationController.getCreditApplicationByCustId);


// ✅ Approve a credit application
router.put('/approve', CreditApplicationController.approveCreditApplication);

// ✅ Reject a credit application
router.put('/reject', CreditApplicationController.rejectCreditApplication);

// Get identifier for a credit application (ACCT_NO | APPL_ID | REF_NO)

router.get('/identifier', async (req, res) => {
  try {
    const [acctNo, applId, refNo] = await Promise.all([
      CreditApplication.generateAcctNo(),
      CreditApplication.generateApplId(),
      CreditApplication.generateRefNo(),
    ]);

    res.json({
      ACCT_NO: acctNo,
      APPL_ID: applId,
      REF_NO: refNo,
    });
  } catch (error) {
    res.status(500).json({ message: "Error generating identifier", error: error.message });
  }
});


// Get loan contract by loan contract number
router.get('/loancontract/:loanContractNo', async (req, res) => {
  try {
    const { loanContractNo } = req.params;
    const contract = await LoanContractController.getLoanContract(loanContractNo);
    if (!contract) {
      return res.status(404).json({ message: 'Loan contract not found' });
    }
    res.status(200).json(contract);
  } catch (error) {
    console.error('Error fetching loan contract:', error);
    res.status(500).json({ message: 'Error fetching loan contract', error: error.message });
  }
});

export default router;
