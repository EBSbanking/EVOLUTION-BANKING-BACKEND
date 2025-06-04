// In TermDepositRoutes.js
import express from 'express';
import { 
  createTermDeposit,
  getAllTermDeposits,
  getTermDepositById,
  updateTermDeposit,
  deleteTermDeposit
 
} from '../controllers/TermDepositController.js'; // Correct import for named exports



const router = express.Router();

// Define routes
router.post('/', createTermDeposit); // Use the imported function directly
router.get('/', getAllTermDeposits); // Use the imported function directly
router.get('/:id', getTermDepositById); // Use the imported function directly
router.put('/:id', updateTermDeposit); // Use the imported function directly
router.delete('/:id', deleteTermDeposit); // Use the imported function directly

export default router;
