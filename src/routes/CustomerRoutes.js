import express from 'express';
import Customer from '../models/Customer.js';
import {
  getAllCustomer,
  getCustomerById,
  deactivateCustomer,
  approveCustomer,
  getPendingCustomers,
  updateCustomer,
  rejectCustomer,
  batchUploadCustomers
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

// Add this to your CustomerRoutes.js
router.post('/debug-file-structure', (req, res) => {
  try {
    console.log('🔍 Debug - Full req.files structure:', req.files);
    console.log('🔍 Debug - req.files keys:', Object.keys(req.files || {}));
    
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        filesAvailable: Object.keys(req.files || {})
      });
    }

    const file = req.files.customersFile;
    
    console.log('🔍 Debug - File object structure:');
    console.log('   - File keys:', Object.keys(file));
    console.log('   - name:', file.name);
    console.log('   - size:', file.size);
    console.log('   - mimetype:', file.mimetype);
    console.log('   - md5:', file.md5);
    console.log('   - data type:', typeof file.data);
    console.log('   - data length:', file.data?.length);
    console.log('   - is buffer:', Buffer.isBuffer(file.data));
    console.log('   - tempFilePath:', file.tempFilePath);
    
    // Try different ways to access the file data
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
    console.error('Debug error:', error);
    res.status(500).json({
      success: false,
      message: 'Debug failed',
      error: error.message
    });
  }
});


// Test endpoint using express-fileupload - UPDATED
router.post('/test-upload', (req, res) => {
  try {
    console.log('📁 Test upload - Files received:', req.files ? Object.keys(req.files) : 'None');
    
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
    
    console.log('🔍 File details:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      dataType: typeof file.data,
      dataLength: file.data?.length,
      isBuffer: Buffer.isBuffer(file.data),
      tempFilePath: file.tempFilePath,
      useTempFiles: file.tempFilePath ? 'YES' : 'NO'
    });

    // Validate file type
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
      // File is stored as temp file
      const fs = require('fs');
      const stats = fs.statSync(file.tempFilePath);
      dataLength = stats.size;
    } else if (Buffer.isBuffer(file.data)) {
      // File is stored in memory
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
    console.error('Test upload error:', error);
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

// Main batch upload endpoint using express-fileupload - UPDATED
router.post('/batch-upload', async (req, res) => {
  try {
    console.log('📁 Batch upload - Files received:', req.files ? Object.keys(req.files) : 'None');
    
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
    
    console.log('🔍 File object keys:', Object.keys(file));
    console.log('📊 File details:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      dataType: typeof file.data,
      dataLength: file.data?.length,
      isBuffer: Buffer.isBuffer(file.data),
      tempFilePath: file.tempFilePath,
      useTempFiles: file.tempFilePath ? 'YES' : 'NO'
    });

    // Validate file type
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

    // Handle file data based on storage method
    if (file.tempFilePath) {
      // File is stored as temporary file - read from disk
      console.log('📂 Reading from temp file:', file.tempFilePath);
      const fs = await import('fs');
      try {
        fileBuffer = fs.readFileSync(file.tempFilePath);
        console.log('✅ Successfully read temp file, buffer length:', fileBuffer.length);
        
        // Clean up temp file
        fs.unlinkSync(file.tempFilePath);
        console.log('✅ Temp file cleaned up');
      } catch (error) {
        console.error('❌ Error reading temp file:', error);
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
      // File is stored in memory as buffer
      fileBuffer = file.data;
      console.log('✅ Using memory buffer, length:', fileBuffer.length);
    } else {
      // No accessible file data
      console.error('❌ No accessible file data found');
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

    console.log('🔄 Processing file with buffer length:', fileBuffer.length);

    // Process the file buffer using your existing service
    const result = await batchUploadCustomers(fileBuffer);
    
    console.log('✅ Batch upload result:', result);

    // Ensure response has all required fields
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
    console.error('❌ Batch upload route error:', error);
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

// Add this to your CustomerRoutes.js
router.get('/batch-template', (req, res) => {
  try {
    // Dynamic template structure based on your customer schema
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
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template structure'
    });
  }
});

// CREATE CUSTOMER
router.post('/customers', async (req, res) => {
  try {
    const { buId } = req.query;
    
    if (buId && isNaN(parseInt(buId))) {
      return res.status(400).json({ message: 'Invalid Business Unit ID' });
    }

    let generatedNumbers = {};
    if (buId) {
      generatedNumbers = await generateCustomerNumber(parseInt(buId));
    }

    const newCustomer = new Customer({
      ...req.body,
      ...generatedNumbers,
      STATUS: 'PENDING'
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

router.put('/approve/:customerId', approveCustomer);
router.put('/reject/:customerId', rejectCustomer);

// DEACTIVATE CUSTOMER
router.patch('/customers/:CUST_ID/deactivate', deactivateCustomer);

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