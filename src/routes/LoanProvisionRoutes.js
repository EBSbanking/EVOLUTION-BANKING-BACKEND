import { getProvisionsByLoan, getProvisionSummary, reverseProvision } from '../controllers/LoanProvisionController.js';

router.get('/provisions/loan/:acct_no', getProvisionsByLoan);
router.get('/provisions/summary', getProvisionSummary);
router.post('/provisions/:provisionId/reverse', reverseProvision);