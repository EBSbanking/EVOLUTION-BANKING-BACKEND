// routes/CustomerRoutes.js - COMPLETE UPDATED VERSION WITH BVN & LOAN ROUTES
import express from 'express';
import logger from '../utils/logger.js';
import {
  getAllCustomers,
  getCustomerById,
  deactivateCustomer,
  approveCustomer,
  getPendingCustomers,
  updateCustomer,
  rejectCustomer,
  batchUploadCustomers,
  searchCustomers,
  advancedSearchCustomers,
  createCustomer,
  getCustomerSummary,
  getCustomerSchema,
  // NEW IMPORTS
  getCustomerWithBVN,
  findByBVN,
  updateBVNVerification,
  getCustomerWithLoans,
  checkHasActiveLoan,
  getCustomerFullSummary
} from '../controllers/CustomerController.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';
import { ensureModelsInitialized } from '../middlewares/modelMiddleware.js';
import { initializeModels, getCustomer } from '../models/index.js';

const router = express.Router();

// Initialize models when routes are loaded
let modelsInitialized = false;
const initModels = async () => {
  if (!modelsInitialized) {
    console.log('🔄 Initializing models from CustomerRoutes...');
    await initializeModels();
    modelsInitialized = true;
    console.log('✅ Models initialized from CustomerRoutes');
  }
};

// Call initialization immediately
initModels().catch(err => {
  console.error('❌ Failed to initialize models in CustomerRoutes:', err);
});

// Apply the middleware to all customer routes
router.use(ensureModelsInitialized);

// Helper function for error handling
const handleError = (res, error, defaultMessage = 'An error occurred') => {
  logger.error('Customer Route Error:', { 
    message: error.message,
    customMessage: defaultMessage,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });
  
  const statusCode = error.message.includes('not found') ? 404 : 500;
  res.status(statusCode).json({ 
    message: defaultMessage,
    error: error.message 
  });
};

// ============================================
// CORE CUSTOMER ROUTES
// ============================================

// CREATE CUSTOMER
router.post('/customers', createCustomer);

// GET ALL CUSTOMERS
router.get('/customers', getAllCustomers);

// GET PENDING CUSTOMERS
router.get('/customers/pending', getPendingCustomers);

// GET SINGLE CUSTOMER BY ID
router.get('/customers/:CUST_ID', getCustomerById);

// UPDATE CUSTOMER DATA
router.put('/customers/:CUST_ID', updateCustomer);

// DEACTIVATE CUSTOMER
router.patch('/customers/:CUST_ID/deactivate', deactivateCustomer);

// ============================================
// APPROVAL & REJECTION ROUTES - Multiple URL patterns for flexibility
// ============================================

// APPROVE CUSTOMER - Multiple URL patterns
router.put('/approve/:customerId', approveCustomer);
router.put('/customers/approve/:customerId', approveCustomer);
router.put('/customer/approve/:customerId', approveCustomer);

// REJECT CUSTOMER - Multiple URL patterns
router.put('/reject/:customerId', rejectCustomer);
router.put('/customers/reject/:customerId', rejectCustomer);
router.put('/customer/reject/:customerId', rejectCustomer);

// ============================================
// SEARCH & UTILITY ROUTES
// ============================================

// SEARCH CUSTOMERS
router.get('/search', searchCustomers);

// GET CUSTOMER SCHEMA
router.get('/schema', getCustomerSchema);

// ADVANCED SEARCH CUSTOMERS
router.get('/advanced-search', advancedSearchCustomers);

// DASHBOARD SUMMARY
router.get('/dashboard-summary', getCustomerSummary);

// GENERATE CUSTOMER NUMBER
router.get('/generate-customer-number', async (req, res) => {
  try {
    // Make sure models are initialized
    await initModels();
    
    const { CUST_ID, CUST_NO } = await generateCustomerNumber();
    
    res.status(200).json({
      success: true,
      data: {
        customerId: CUST_ID,
        customerNumber: CUST_NO
      }
    });

  } catch (error) {
    logger.error('[Customer Number Generation Error]', { 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    const statusCode = error.message.includes('not found') ? 404 : 500;
    const errorMessage = error.message.replace(/^Error: /, '');
    
    res.status(statusCode).json({
      success: false,
      message: 'Failed to generate customer numbers',
      error: errorMessage
    });
  }
});

// ============================================
// BVN & VERIFICATION ROUTES (NEW)
// ============================================

/**
 * @route   GET /api/customers/:customerId/bvn
 * @desc    Get customer with BVN details by ID
 * @access  Private
 */
router.get('/customers/:customerId/bvn', getCustomerWithBVN);

/**
 * @route   GET /api/customers/bvn/:bvn
 * @desc    Find customer by BVN number
 * @access  Private
 */
router.get('/customers/bvn/:bvn', findByBVN);

/**
 * @route   PUT /api/customers/:customerId/verify-bvn
 * @desc    Update BVN verification status
 * @access  Private
 */
router.put('/customers/:customerId/verify-bvn', updateBVNVerification);

// ============================================
// LOAN-RELATED CUSTOMER ROUTES (NEW)
// ============================================

/**
 * @route   GET /api/customers/:customerId/loans
 * @desc    Get customer with their loan details
 * @access  Private
 */
router.get('/customers/:customerId/loans', getCustomerWithLoans);

/**
 * @route   GET /api/customers/:customerId/has-active-loan
 * @desc    Check if customer has an active loan
 * @access  Private
 */
router.get('/customers/:customerId/has-active-loan', checkHasActiveLoan);

/**
 * @route   GET /api/customers/:customerId/full-summary
 * @desc    Get customer full summary with BVN and loan status
 * @access  Private
 */
router.get('/customers/:customerId/full-summary', getCustomerFullSummary);

// ============================================
// BATCH UPLOAD & TEMPLATE ROUTES
// ============================================

// BATCH UPLOAD TEMPLATE
router.get('/batch-template', (req, res) => {
  try {
    const templateFields = [
      { name: 'CUST_ID', required: true, type: 'string', description: 'Unique Customer ID (Auto-generated if empty)' },
      { name: 'CUST_NO', required: true, type: 'string', description: 'Customer Number (Auto-generated if empty)' },
      { name: 'TITLE_ID', required: false, type: 'string', description: 'Title (MR, MRS, MS, DR)' },
      { name: 'FIRST_NAME', required: true, type: 'string', description: 'First Name' },
      { name: 'MIDDLE_NAME', required: false, type: 'string', description: 'Middle Name' },
      { name: 'LAST_NAME', required: true, type: 'string', description: 'Last Name' },
      { name: 'CUST_NM', required: false, type: 'string', description: 'Full Name (Auto-generated if empty)' },
      { name: 'HOME_ADDRESS', required: true, type: 'string', description: 'Home Address' },
      { name: 'EMAIL_ADDRESS', required: false, type: 'email', description: 'Email Address' },
      { name: 'BU_ID', required: true, type: 'string', description: 'Business Unit ID' },
      { name: 'MAIDEN_NM', required: false, type: 'string', description: 'Maiden Name' },
      { name: 'BIRTH_DT', required: false, type: 'date', description: 'Birth Date (YYYY-MM-DD)' },
      { name: 'CNTRY_OF_BIRTH_ID', required: false, type: 'string', description: 'Country of Birth (Default: NGA)' },
      { name: 'CUST_CAT', required: false, type: 'string', description: 'Customer Category (Individual, Retail, etc.)' },
      { name: 'CAMPAIGN_ID', required: false, type: 'string', description: 'Campaign ID' },
      { name: 'GENDER_TY', required: false, type: 'string', description: 'Gender (Male, Female)' },
      { name: 'NIN', required: false, type: 'string', description: 'NIN - 11 digits' },
      { name: 'BVN', required: false, type: 'string', description: 'BVN - 11 digits' },
      { name: 'COUNTRY_NM', required: false, type: 'string', description: 'Country Name (Default: Nigeria)' },
      { name: 'STATE', required: false, type: 'string', description: 'State' },
      { name: 'LOCAL_GOV', required: false, type: 'string', description: 'Local Government' },
      { name: 'OPENING_RSN_ID', required: false, type: 'string', description: 'Opening Reason ID' },
      { name: 'OPENED_DT', required: false, type: 'date', description: 'Account Opened Date (YYYY-MM-DD)' },
      { name: 'RESIDENT_CNTRY_ID', required: false, type: 'string', description: 'Resident Country ID (Default: NGA)' },
      { name: 'RISK_CLASS', required: false, type: 'string', description: 'Risk Class (Low, Medium, High)' },
      { name: 'STMNT_FREQ_CD', required: false, type: 'string', description: 'Statement Frequency Code' },
      { name: 'STMNT_FREQ_VALUE', required: false, type: 'number', description: 'Statement Frequency Value' },
      { name: 'CREATED_BY', required: false, type: 'string', description: 'Created By User' },
      { name: 'USER_ID', required: false, type: 'string', description: 'User ID' },
      { name: 'INDUSTRY_ID', required: false, type: 'string', description: 'Industry ID' },
      { name: 'INDUSTRY_CD', required: false, type: 'string', description: 'Industry Code' },
      { name: 'TAX_STATUS', required: false, type: 'string', description: 'Tax Status' },
      { name: 'MARITAL_ST', required: false, type: 'string', description: 'Marital Status' },
      { name: 'TAX_GRP_ID', required: false, type: 'string', description: 'Tax Group ID' },
      { name: 'OPERATIONS_CRNCY_ID', required: false, type: 'string', description: 'Currency ID (Default: NGN)' },
      { name: 'EMP_ST', required: false, type: 'string', description: 'Employment Status' },
      { name: 'ORGANISATION_NM', required: false, type: 'string', description: 'Organization Name' },
      { name: 'REGISTRATION_ADDRESS', required: false, type: 'string', description: 'Registration Address' },
      { name: 'REGISTRATION_DT', required: false, type: 'date', description: 'Registration Date' },
      { name: 'ALERT_DELIVERY_METHOD', required: false, type: 'string', description: 'Alert Delivery Method' },
      { name: 'KYC_LEVEL', required: false, type: 'string', description: 'KYC Level' },
      { name: 'PHONE_NO', required: false, type: 'string', description: 'Phone Number' },
      { name: 'SMS', required: false, type: 'string', description: 'SMS Preference' },
      { name: 'REC_ST', required: false, type: 'string', description: 'Record Status (Pending, Active, Approved, etc.)' },
      { name: 'EVENT_ID', required: false, type: 'string', description: 'Event ID' },
      { name: 'IS_PEP', required: false, type: 'boolean', description: 'Politically Exposed Person (true/false)' },
      { name: 'SANCTION_SCORE', required: false, type: 'number', description: 'Sanction Score' },
      { name: 'DOCUMENT_VERIFICATION_STATUS', required: false, type: 'string', description: 'Document Verification Status' },
      { name: 'NEXTOF_KIN_NM_1', required: false, type: 'string', description: 'Next of Kin 1 Name' },
      { name: 'RELATIONSHIP_1', required: false, type: 'string', description: 'Next of Kin 1 Relationship' },
      { name: 'KIN_PHONE_NO_1', required: false, type: 'string', description: 'Next of Kin 1 Phone' },
      { name: 'KIN_EMAIL_1', required: false, type: 'email', description: 'Next of Kin 1 Email' },
      { name: 'KIN_ADDRESS_1', required: false, type: 'string', description: 'Next of Kin 1 Address' },
      { name: 'NEXTOF_KIN_NM_2', required: false, type: 'string', description: 'Next of Kin 2 Name' },
      { name: 'RELATIONSHIP_2', required: false, type: 'string', description: 'Next of Kin 2 Relationship' },
      { name: 'KIN_PHONE_NO_2', required: false, type: 'string', description: 'Next of Kin 2 Phone' },
      { name: 'KIN_EMAIL_2', required: false, type: 'email', description: 'Next of Kin 2 Email' },
      { name: 'KIN_ADDRESS_2', required: false, type: 'string', description: 'Next of Kin 2 Address' },
      { name: 'NEXTOF_KIN_NM_3', required: false, type: 'string', description: 'Next of Kin 3 Name' },
      { name: 'RELATIONSHIP_3', required: false, type: 'string', description: 'Next of Kin 3 Relationship' },
      { name: 'KIN_PHONE_NO_3', required: false, type: 'string', description: 'Next of Kin 3 Phone' },
      { name: 'KIN_EMAIL_3', required: false, type: 'email', description: 'Next of Kin 3 Email' },
      { name: 'KIN_ADDRESS_3', required: false, type: 'string', description: 'Next of Kin 3 Address' }
    ];

    res.json({
      success: true,
      fields: templateFields,
      schemaVersion: '1.0',
      lastUpdated: new Date().toISOString(),
      instructions: {
        requiredFields: ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'HOME_ADDRESS', 'BU_ID'],
        dateFormat: 'YYYY-MM-DD',
        ninFormat: '11 digits',
        bvnFormat: '11 digits',
        recStValues: ['Pending', 'Active', 'Approved', 'Inactive', 'Closed', 'Suspended', 'Cancelled', 'Rejected']
      }
    });
  } catch (error) {
    logger.error('Error generating template:', { 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      success: false,
      message: 'Failed to generate template structure'
    });
  }
});

// DEBUG FILE STRUCTURE
router.post('/debug-file-structure', (req, res) => {
  try {
    logger.info('🔍 Debug - Full req.files structure:', { files: req.files });
    logger.info('🔍 Debug - req.files keys:', { keys: Object.keys(req.files || {}) });
    
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        filesAvailable: Object.keys(req.files || {})
      });
    }

    const file = req.files.customersFile;
    
    logger.info('🔍 Debug - File object structure:', {
      fileKeys: Object.keys(file),
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      md5: file.md5,
      dataType: typeof file.data,
      dataLength: file.data?.length,
      isBuffer: Buffer.isBuffer(file.data),
      tempFilePath: file.tempFilePath
    });
    
    const dataAccessMethods = {
      'file.data': file.data,
      'file.data (as buffer)': Buffer.isBuffer(file.data) ? file.data : 'Not a buffer',
      'Object.keys(file)': Object.keys(file)
    };

    res.json({
      success: true,
      message: 'File structure analysis',
      fileInfo: {
        name: file.name,
        size: file.size,
        mimetype: file.mimetype,
        dataLength: file.data?.length || 0,
        isBuffer: Buffer.isBuffer(file.data),
        availableKeys: Object.keys(file)
      },
      dataAccessMethods
    });

  } catch (error) {
    logger.error('Debug error:', { 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
});

// TEST UPLOAD ENDPOINT
router.post('/test-upload', (req, res) => {
  try {
    logger.info('📁 Test upload - Files received:', { files: req.files ? Object.keys(req.files) : 'None' });
    
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please ensure: 1) Field name is "customersFile", 2) File is selected, 3) File is not empty',
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: ['No file uploaded']
      });
    }

    const file = req.files.customersFile;
    
    logger.info('🔍 File details:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      dataType: typeof file.data,
      dataLength: file.data?.length,
      isBuffer: Buffer.isBuffer(file.data),
      tempFilePath: file.tempFilePath,
      useTempFiles: file.tempFilePath ? 'YES' : 'NO'
    });

    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ];
    
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Please upload only Excel files. Received: ${file.mimetype}`,
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: [`Invalid file type: ${file.mimetype}`]
      });
    }

    let dataLength = 0;
    if (file.tempFilePath) {
      const fs = require('fs');
      const stats = fs.statSync(file.tempFilePath);
      dataLength = stats.size;
    } else if (Buffer.isBuffer(file.data)) {
      dataLength = file.data.length;
    }

    res.json({
      success: true,
      message: 'File uploaded successfully using express-fileupload!',
      file: {
        name: file.name,
        size: file.size,
        type: file.mimetype,
        dataLength: dataLength,
        storageMethod: file.tempFilePath ? 'tempFile' : 'memoryBuffer',
        tempFilePath: file.tempFilePath || 'None'
      },
      total: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      errors: []
    });
  } catch (error) {
    logger.error('Test upload error:', { 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    res.status(500).json({
      success: false,
      message: 'Upload processing failed',
      error: error.message,
      total: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      errors: [error.message]
    });
  }
});

// MAIN BATCH UPLOAD ENDPOINT
router.post('/batch-upload', async (req, res) => {
  try {
    // Make sure models are initialized
    await initModels();
    
    logger.info('📁 Batch upload - Files received:', { files: req.files ? Object.keys(req.files) : 'None' });
    
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select an Excel file with field name "customersFile"',
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: ['No file uploaded']
      });
    }

    const file = req.files.customersFile;
    
    logger.info('🔍 File object keys:', { keys: Object.keys(file) });
    logger.info('📊 File details:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      dataType: typeof file.data,
      dataLength: file.data?.length,
      isBuffer: Buffer.isBuffer(file.data),
      tempFilePath: file.tempFilePath,
      useTempFiles: file.tempFilePath ? 'YES' : 'NO'
    });

    const allowedMimes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ];
    
    if (!allowedMimes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Please upload only Excel files (.xls, .xlsx)',
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: [`Invalid file type: ${file.mimetype}`]
      });
    }

    let fileBuffer;

    if (file.tempFilePath) {
      logger.info('📂 Reading from temp file:', { tempFilePath: file.tempFilePath });
      const fs = await import('fs');
      try {
        fileBuffer = fs.readFileSync(file.tempFilePath);
        logger.info('✅ Successfully read temp file:', { bufferLength: fileBuffer.length });
        
        fs.unlinkSync(file.tempFilePath);
        logger.info('✅ Temp file cleaned up');
      } catch (error) {
        logger.error('❌ Error reading temp file:', { 
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        });
        return res.status(500).json({
          success: false,
          message: 'Error reading uploaded file',
          total: 0,
          created: 0,
          duplicates: 0,
          failed: 0,
          errors: ['Cannot read file from temporary storage']
        });
      }
    } else if (Buffer.isBuffer(file.data) && file.data.length > 0) {
      fileBuffer = file.data;
      logger.info('✅ Using memory buffer:', { length: fileBuffer.length });
    } else {
      logger.error('❌ No accessible file data found');
      return res.status(400).json({
        success: false,
        message: 'Cannot read file content. The file might be empty or corrupted.',
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: ['Empty file content']
      });
    }

    logger.info('🔄 Processing file with buffer length:', { length: fileBuffer.length });

    const result = await batchUploadCustomers(fileBuffer);
    
    logger.info('✅ Batch upload result:', { result });

    const response = {
      success: result.success || false,
      message: result.message || 'Processing completed',
      total: result.total || 0,
      created: result.created || 0,
      duplicates: result.duplicates || 0,
      failed: result.failed || 0,
      errors: result.errors || []
    };

    return res.status(result.success ? 200 : 400).json(response);

  } catch (error) {
    logger.error('❌ Batch upload route error:', { 
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return res.status(500).json({
      success: false,
      message: 'Internal server error during upload processing',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Processing failed',
      total: 0,
      created: 0,
      duplicates: 0,
      failed: 0,
      errors: [error.message]
    });
  }
});

export default router;