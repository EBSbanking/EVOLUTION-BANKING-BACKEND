import express from 'express';
import {
  createCustomer,
  getAllCustomer,
  getCustomerById,
  updateWorkflowStatus,
  deactivateCustomer,
  approveCustomer,
  getPendingCustomers,
  updateCustomer 
} from '../controllers/CustomerController.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';

const router = express.Router();

// Customer Creation & Approval Routes
router.post('/customers', createCustomer); // Create new customer (pending approval)
router.put('/customer/approve/:custId', approveCustomer); // Approve customer creation
router.put('/customers/:CUST_ID', updateCustomer);

// Customer Data Routes
router.get('/customers', getAllCustomer); // Get all customers
router.get('/customers/pending', getPendingCustomers); // Get only pending customers
router.get('/customers/:CUST_ID', getCustomerById); // Get specific customer

// Customer Status Management Routes
router.put('/customers/:CUST_ID/status', updateWorkflowStatus); // Update workflow status
router.patch('/customers/:CUST_ID/deactivate', deactivateCustomer); // Deactivate customer

// Utility Routes
router.get('/generateCustomerNumber', (req, res) => {
  try {
    const { paddedCUST_ID, paddedCUST_NO } = generateCustomerNumber();
    res.status(200).json({ 
      CUST_ID: paddedCUST_ID, 
      CUST_NO: paddedCUST_NO 
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error generating customer number', 
      error: error.message 
    });
  }
});

export default router;
