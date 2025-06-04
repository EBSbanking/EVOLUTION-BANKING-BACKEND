import express from 'express';
import {
  createDepositAccountHistory,
  getDepositAccountHistories,
  getDepositAccountHistoryById,
  updateDepositAccountHistory,
  deleteDepositAccountHistory,
  getDepositAccountHistoriesPaginated,
} from '../controllers/DepositAccountHistoryController.js';

const router = express.Router();

// Routes
// Create a new deposit account history
router.post('/', createDepositAccountHistory);

// Get deposit account histories, optionally by ACCT_NO
router.get('/', getDepositAccountHistories); // This will handle filtering by ACCT_NO if provided in query params

// Get a specific deposit account history by its ID
router.get('/:id', getDepositAccountHistoryById);

// Update a specific deposit account history record by its ID
router.put('/:id', updateDepositAccountHistory);

// Delete a specific deposit account history record by its ID
router.delete('/:id', deleteDepositAccountHistory);

// Optionally, add a route for paginated results if needed
// Example: /api/deposit-account-history/paginated?page=1&limit=10
router.get('/paginated', getDepositAccountHistoriesPaginated);

export default router;
