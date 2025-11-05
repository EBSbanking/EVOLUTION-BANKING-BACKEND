import express from 'express';
import {
  createDepositSearch,
  getAllDepositSearches,
  getDepositSearchByAccount,
  updateDepositSearch,
  deleteDepositSearch
} from '../controllers/DepositSearchController.js';  // Adjust the import path if necessary

const router = express.Router();

// Define the POST route for creating a new deposit search
router.post('/depositsearches', createDepositSearch);

// Define the GET route for retrieving all deposit searches
router.get('/depositsearches', getAllDepositSearches);

// Define the GET route for retrieving a deposit search by account number
router.get('/depositsearches/:ACCT_NO', getDepositSearchByAccount);

// Define the PUT route for updating a deposit search by account number
router.put('/depositsearches/:ACCT_NO', updateDepositSearch);

// Define the DELETE route for deleting a deposit search by account number
router.delete('/depositsearches/:ACCT_NO', deleteDepositSearch);

export default router;
