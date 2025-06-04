import express from 'express';
import {
  createInterestRate,
  getAllInterestRates,
  getInterestRate,
  updateInterestRate,
  deleteInterestRate
} from '../controllers/LoanInterestRateController.js';

const router = express.Router();

// Define routes and associate them with controller methods
router.post('/', createInterestRate); // Create a new interest rate
router.get('/interest-loan', getAllInterestRates); // Get all interest rates
router.get('/interest-loan/:PROD_ID', (req, res, next) => {
  console.log('Received GET request for', req.params);  // Log the parameters
  next();  // Proceed to the controller
}, getInterestRate);
router.put('/interest-loan/:PROD_ID/:INDEX_RATE_ID', updateInterestRate); // Update an interest rate by ID
router.delete('/interest-loan/:PROD_ID/:INDEX_RATE_ID', deleteInterestRate); // Delete an interest rate by ID

export default router;
