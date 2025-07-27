import express from 'express';
import {
  createCustomer,
  getAllCustomer,
  getCustomerById,
  updateWorkItemStatusOnApproval,
  updateWorkItemStatusOnRejection,
  deactivateCustomer,
  approveCustomer,
  getPendingCustomers,
  updateCustomer,
  rejectCustomer 
} from '../controllers/CustomerController.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';

const router = express.Router();

// Customer Creation & Approval Routes
router.post('/customers', createCustomer); // Create new customer (pending approval)
router.put('/customer/approve/:custId', approveCustomer); // Approve customer creation
router.put('/customer/reject/:custId', rejectCustomer); // Approve customer creation
router.put('/customers/:CUST_ID', updateCustomer);

// Customer Data Routes
router.get('/customers', getAllCustomer); // Get all customers
router.get('/customers/pending', getPendingCustomers); // Get only pending customers
router.get('/customers/:CUST_ID', getCustomerById); // Get specific customer

// Customer Status Management Routes
router.put('/customers/:CUST_ID/status', updateWorkItemStatusOnApproval); // Update workflow status
router.put('/customers/:CUST_ID/status', updateWorkItemStatusOnRejection);
router.patch('/customers/:CUST_ID/deactivate', deactivateCustomer); // Deactivate customer

router.get('/generate-customer-number', async (req, res) => {
  try {
    const branchCode = req.query.branchCode || '01'; // default to '01' if not passed
    const { CUST_ID, CUST_NO } = await generateCustomerNumber(branchCode); // ✅ await the async function

    res.status(200).json({
      message: 'Generated customer number successfully',
      data: {
        CUST_ID,
        CUST_NO,
      },
    });
  } catch (err) {
    console.error('Error generating customer number:', err);
    res.status(500).json({ message: 'Failed to generate customer number', error: err.message });
  }
});

export default router;
