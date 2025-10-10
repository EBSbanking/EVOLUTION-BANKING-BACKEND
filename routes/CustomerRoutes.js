import express from 'express';
import Customer from '../models/Customer.js';
import {
  getAllCustomer,
  getCustomerById,
  deactivateCustomer,
  approveCustomer,
  getPendingCustomers,
  updateCustomer,
  rejectCustomer
} from '../controllers/CustomerController.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';

const router = express.Router();

// Helper function for error handling
const handleError = (res, error, defaultMessage = 'An error occurred') => {
  console.error(error);
  const statusCode = error.message.includes('not found') ? 404 : 500;
  res.status(statusCode).json({ 
    message: defaultMessage,
    error: error.message 
  });
};

// CREATE CUSTOMER
router.post('/customers', async (req, res) => {
  try {
    const { buId } = req.query;
    
    // Validate BU_ID if provided
    if (buId && isNaN(parseInt(buId))) {
      return res.status(400).json({ message: 'Invalid Business Unit ID' });
    }

    // Generate customer numbers if BU_ID is provided
    let generatedNumbers = {};
    if (buId) {
      generatedNumbers = await generateCustomerNumber(parseInt(buId));
    }

    const newCustomer = new Customer({
      ...req.body,
      ...generatedNumbers,
      STATUS: 'PENDING' // Default status for new customers
    });

    await newCustomer.save();

    const fullName = `${newCustomer.FIRST_NAME || ''} ${newCustomer.LAST_NAME || ''}`.trim();

    res.status(201).json({
      message: 'Customer created and submitted for approval',
      data: {
        _id: newCustomer._id,
        CUST_ID: newCustomer.CUST_ID,
        CUST_NO: newCustomer.CUST_NO,
        CUST_NM: fullName || 'N/A',
        STATUS: newCustomer.STATUS
      },
      actions: {
        approve: `/api/customer/approve/${newCustomer.CUST_ID}`,
        reject: `/api/customer/reject/${newCustomer.CUST_ID}`
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to create customer');
  }
});

// GET ALL CUSTOMERS
router.get('/customers', getAllCustomer);

// GET PENDING CUSTOMERS
router.get('/customers/pending', getPendingCustomers);

// GET SINGLE CUSTOMER BY ID
router.get('/customers/:CUST_ID', getCustomerById);

// UPDATE CUSTOMER DATA
router.put('/customers/:CUST_ID', updateCustomer);

router.put('/approve/:customerId', approveCustomer); // ✅ This line
router.put('/reject/:customerId', rejectCustomer);

// DEACTIVATE CUSTOMER
router.patch('/customers/:CUST_ID/deactivate', deactivateCustomer);

/**
 * @api {get} /api/customer/generate-customer-number Generate Customer Numbers
 * @apiName GenerateCustomerNumbers
 * @apiGroup Customer
 * 
 * @apiSuccess {Boolean} success Request status
 * @apiSuccess {Object} data Generated numbers
 * @apiSuccess {String} data.customerId 10-digit customer ID
 * @apiSuccess {String} data.customerNumber 10-digit customer number
 */
router.get('/generate-customer-number', async (req, res) => {
  try {
    const { CUST_ID, CUST_NO } = await generateCustomerNumber();
    
    res.status(200).json({
      success: true,
      data: {
        customerId: CUST_ID,
        customerNumber: CUST_NO
      }
    });

  } catch (error) {
    console.error('[Customer Number Generation Error]', error);
    
    const statusCode = error.message.includes('not found') ? 404 : 500;
    const errorMessage = error.message.replace(/^Error: /, '');
    
    res.status(statusCode).json({
      success: false,
      message: 'Failed to generate customer numbers',
      error: errorMessage
    });
  }
});

export default router;