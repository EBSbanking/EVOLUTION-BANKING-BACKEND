// Analytics.js
import express from 'express';
const router = express.Router();

// Import controller functions
import {
  getAllBusinessUnits,
  getTotalCustomerCount,
  getTotalCustomerCountByBU,
  getTotalCustomerAccountCount,
  getTotalCustomerAccountCountByBU,
  getTotalLoanAccountCount,
  getTotalLoanAccountCountByBU
} from '../controllers/AnalyticsController.js'; // Adjust path if needed

// Define routes for each analytics function
router.get('/business-units', getAllBusinessUnits);
router.get('/customers/total', getTotalCustomerCount);
router.get('/customers/total/:businessUnit', getTotalCustomerCountByBU);
router.get('/customer-accounts/total', getTotalCustomerAccountCount);
router.get('/customer-accounts/total/:businessUnit', getTotalCustomerAccountCountByBU);
router.get('/loan-accounts/total', getTotalLoanAccountCount);
router.get('/loan-accounts/total/:businessUnit', getTotalLoanAccountCountByBU);

export default router;
