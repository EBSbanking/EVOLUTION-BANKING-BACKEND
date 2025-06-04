import express from 'express';
import {
  createCustomer,
  getAllCustomer,
  getCustomerById,
  updateWorkflowStatus,
  deactivateCustomer,
} from '../controllers/CustomerController.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';  // Import the function

const router = express.Router();

// POST: Create a new customer
router.post('/customers', createCustomer); 

// GET: Get all customers
router.get('/customers', getAllCustomer);

// GET: Get a customer by CUST_ID
router.get('/customers/:CUST_ID', getCustomerById);

// PUT: Update a customer by CUST_ID
router.put('/customers/:CUST_ID', updateWorkflowStatus);

// PATCH: Deactivate a customer account by CUST_ID
router.patch('/customers/:CUST_ID', deactivateCustomer);

// GET: Generate customer number (for testing or preview)
router.get('/generateCustomerNumber', (req, res) => {
  try {
    const { paddedCUST_ID, paddedCUST_NO } = generateCustomerNumber();  // Generate IDs
    res.status(200).json({ CUST_ID: paddedCUST_ID, CUST_NO: paddedCUST_NO });  // Return the generated customer numbers
  } catch (error) {
    res.status(500).json({ message: 'Error generating customer number', error: error.message });
  }
});

export default router;
