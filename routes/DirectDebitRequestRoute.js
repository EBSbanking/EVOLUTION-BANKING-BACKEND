// routes/DirectDebitRequestRoute.js
import express from 'express';
import { 
  createDirectDebitRequest, 
  getAllDirectDebitRequests, 
  deleteDirectDebitRequest 
} from '../controllers/DirectDebitRequestController.js'; // Import the correct functions

const router = express.Router();

// Route for creating a new Direct Debit Request
router.post('/', createDirectDebitRequest);

// Route for getting all Direct Debit Requests
router.get('/', getAllDirectDebitRequests);

// Route for deleting a Direct Debit Request by ID
router.delete('/:id', deleteDirectDebitRequest);

export default router;
