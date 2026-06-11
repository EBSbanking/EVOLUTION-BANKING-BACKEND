// routes/CustomerRoutes.js - COMPLETE FIXED VERSION WITH DEBUG LOGGING AND SEARCH

// ========== DEBUG IMPORTS ==========
console.log('🔍 ========== LOADING CUSTOMER ROUTES ==========');
console.log('🔍 File: CustomerRoutes.js');

try {
  console.log('  ⏳ Importing express...');
  const express = await import('express');
  console.log('  ✅ express loaded');
} catch (e) {
  console.error('  ❌ Error loading express:', e.message);
}

try {
  console.log('  ⏳ Importing path...');
  const path = await import('path');
  console.log('  ✅ path loaded');
} catch (e) {
  console.error('  ❌ Error loading path:', e.message);
}

try {
  console.log('  ⏳ Importing xlsx...');
  const XLSX = await import('xlsx');
  console.log('  ✅ xlsx loaded');
} catch (e) {
  console.error('  ❌ Error loading xlsx:', e.message);
}

try {
  console.log('  ⏳ Importing csvtojson...');
  const csv = await import('csvtojson');
  console.log('  ✅ csvtojson loaded');
} catch (e) {
  console.error('  ❌ Error loading csvtojson:', e.message);
}

try {
  console.log('  ⏳ Importing url utilities...');
  const { fileURLToPath } = await import('url');
  const { dirname } = await import('path');
  console.log('  ✅ url utilities loaded');
} catch (e) {
  console.error('  ❌ Error loading url utilities:', e.message);
}

try {
  console.log('  ⏳ Importing Sequelize operators...');
  const { Op } = await import('sequelize');
  console.log('  ✅ Sequelize Op loaded');
} catch (e) {
  console.error('  ❌ Error loading Sequelize Op:', e.message);
}

try {
  console.log('  ⏳ Importing Customer model...');
  const CustomerModule = await import('../models/Customer.js');
  const Customer = CustomerModule.default;
  console.log('  ✅ Customer model loaded');
} catch (e) {
  console.error('  ❌ Error loading Customer model:', e.message);
  console.error('  ❌ Stack:', e.stack);
}

try {
  console.log('  ⏳ Importing CustomerController...');
  const controllerModule = await import('../controllers/CustomerController.js');
  const {
    getAllCustomers,
    getCustomerById,
    deactivateCustomer,
    approveCustomer,
    getPendingCustomers,
    updateCustomer,
    rejectCustomer,
    batchUploadCustomers,
    searchCustomers
  } = controllerModule;
  console.log('  ✅ CustomerController loaded');
  console.log('  📋 Controller functions:', Object.keys(controllerModule).join(', '));
} catch (e) {
  console.error('  ❌ Error loading CustomerController:', e.message);
  console.error('  ❌ Stack:', e.stack);
}

try {
  console.log('  ⏳ Importing generateCustomerNumber...');
  const generateModule = await import('../utils/generateCustomerNumber.js');
  const { generateCustomerNumber } = generateModule;
  console.log('  ✅ generateCustomerNumber loaded');
} catch (e) {
  console.error('  ❌ Error loading generateCustomerNumber:', e.message);
  console.error('  ❌ Stack:', e.stack);
}

console.log('🔍 ========== ALL IMPORTS ATTEMPTED ==========');

// ========== ACTUAL ROUTER CODE ==========
import express from 'express';
import path from 'path';
import XLSX from 'xlsx';
import csv from 'csvtojson';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Op } from 'sequelize';
import Customer from '../models/Customer.js';
import {
  getAllCustomers,
  getCustomerById,
  deactivateCustomer,
  approveCustomer,
  getPendingCustomers,
  updateCustomer,
  rejectCustomer,
  batchUploadCustomers,
  searchCustomers
} from '../controllers/CustomerController.js';
import { generateCustomerNumber } from '../utils/generateCustomerNumber.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

console.log('🔍 Router instance created');

// Helper function for error handling
const handleError = (res, error, defaultMessage = 'An error occurred') => {
  console.error(error);
  const statusCode = error.message.includes('not found') ? 404 : 500;
  res.status(statusCode).json({ 
    message: defaultMessage,
    error: error.message 
  });
};

console.log('🔍 Helper functions defined');

// ============================================
// ✅ CUSTOMER SEARCH ROUTES
// ============================================

/**
 * Search customers
 * @route GET /api/customer/search
 * @access Public or Protected (adjust as needed)
 */
router.get('/search', async (req, res) => {
  console.log('🔍 Search customers endpoint called');
  console.log('📊 Search query:', req.query);
  
  try {
    // Accept both 'q' and 'name' as search parameters
    const searchTerm = req.query.q || req.query.name;
    const { field, exact } = req.query;
    
    if (!searchTerm) {
      console.log('❌ No search term provided');
      return res.status(400).json({
        success: false,
        message: 'Search query is required (use q or name parameter)'
      });
    }
    
    console.log(`🔍 Searching for: "${searchTerm}"`);
    
    let whereClause = {};
    
    // Define searchable fields
    const searchFields = [
      'CUST_ID', 
      'CUST_NO', 
      'FIRST_NAME', 
      'LAST_NAME', 
      'CUST_NM', 
      'EMAIL_ADDRESS', 
      'PHONE_NO', 
      'BVN', 
      'NIN'
    ];
    
    if (field && field !== 'all' && searchFields.includes(field)) {
      // Search in specific field
      if (exact === 'true') {
        whereClause[field] = searchTerm;
      } else {
        whereClause[field] = { [Op.like]: `%${searchTerm}%` };
      }
    } else {
      // Search in all fields
      whereClause = {
        [Op.or]: searchFields.map(searchField => ({
          [searchField]: exact === 'true' ? searchTerm : { [Op.like]: `%${searchTerm}%` }
        }))
      };
    }
    
    console.log('🔍 Where clause:', JSON.stringify(whereClause, null, 2));
    
    const customers = await Customer.findAll({
      where: whereClause,
      attributes: [
        'CUST_ID', 
        'CUST_NO', 
        'FIRST_NAME', 
        'LAST_NAME', 
        'CUST_NM', 
        'EMAIL_ADDRESS', 
        'PHONE_NO', 
        'BVN', 
        'NIN',
        'HOME_ADDRESS',
        'BU_ID',
        'STATUS',
        'CREATED_AT',
        'UPDATED_AT'
      ],
      limit: 50,
      order: [['CREATED_AT', 'DESC']],
      include: []
    });
    
    console.log(`✅ Found ${customers.length} customers matching "${searchTerm}"`);
    
    res.json({
      success: true,
      count: customers.length,
      query: searchTerm,
      field: field || 'all',
      exact: exact === 'true',
      data: customers.map(c => c.toJSON ? c.toJSON() : c)
    });
    
  } catch (error) {
    console.error('❌ Error searching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search customers',
      error: error.message
    });
  }
});

/**
 * Advanced customer search with pagination
 * @route POST /api/customers/search/advanced
 */
router.post('/search/advanced', async (req, res) => {
  console.log('🔍 Advanced search endpoint called');
  console.log('📊 Search body:', req.body);
  
  try {
    const { 
      searchTerm,
      fields = [],
      exact = false,
      page = 1,
      limit = 20,
      sortBy = 'CREATED_AT',
      sortOrder = 'DESC'
    } = req.body;
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: 'Search term is required'
      });
    }
    
    const allSearchableFields = ['CUST_ID', 'CUST_NO', 'FIRST_NAME', 'LAST_NAME', 'CUST_NM', 'EMAIL_ADDRESS', 'PHONE_NO', 'BVN', 'NIN'];
    const searchableFields = fields.length > 0 
      ? fields.filter(f => allSearchableFields.includes(f))
      : allSearchableFields;
    
    let whereClause = {};
    
    if (exact) {
      whereClause = {
        [Op.or]: searchableFields.map(field => ({
          [field]: searchTerm
        }))
      };
    } else {
      whereClause = {
        [Op.or]: searchableFields.map(field => ({
          [field]: { [Op.like]: `%${searchTerm}%` }
        }))
      };
    }
    
    const offset = (page - 1) * limit;
    
    const { count, rows } = await Customer.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [[sortBy, sortOrder]]
    });
    
    console.log(`✅ Advanced search found ${count} total customers, returning ${rows.length}`);
    
    res.json({
      success: true,
      data: {
        customers: rows.map(c => c.toJSON ? c.toJSON() : c),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / limit)
        }
      },
      searchCriteria: {
        term: searchTerm,
        fields: searchableFields,
        exact
      }
    });
    
  } catch (error) {
    console.error('❌ Error in advanced search:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform advanced search',
      error: error.message
    });
  }
});

/**
 * Quick search by customer number or name (optimized for dropdown/autocomplete)
 * @route GET /api/customers/search/quick
 */
router.get('/search/quick', async (req, res) => {
  console.log('🔍 Quick search endpoint called');
  
  try {
    const { term } = req.query;
    
    if (!term || term.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters'
      });
    }
    
    const customers = await Customer.findAll({
      where: {
        [Op.or]: [
          { CUST_NO: { [Op.like]: `%${term}%` } },
          { CUST_NM: { [Op.like]: `%${term}%` } },
          { FIRST_NAME: { [Op.like]: `%${term}%` } },
          { LAST_NAME: { [Op.like]: `%${term}%` } }
        ]
      },
      limit: 10,
      attributes: ['CUST_ID', 'CUST_NO', 'CUST_NM', 'FIRST_NAME', 'LAST_NAME', 'EMAIL_ADDRESS', 'PHONE_NO']
    });
    
    res.json({
      success: true,
      count: customers.length,
      data: customers
    });
    
  } catch (error) {
    console.error('❌ Error in quick search:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform quick search',
      error: error.message
    });
  }
});

// ============================================
// EXISTING ROUTES
// ============================================

// Debug endpoint
router.post('/debug-file-structure', (req, res) => {
  console.log('🔍 Debug endpoint called');
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

// Test upload endpoint
router.post('/test-upload', (req, res) => {
  console.log('🔍 Test upload endpoint called');
  try {
    console.log('📁 Test upload - Files received:', req.files ? Object.keys(req.files) : 'None');
    
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Field name must be "customersFile"',
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
      isBuffer: Buffer.isBuffer(file.data)
    });

    res.json({
      success: true,
      message: 'File uploaded successfully!',
      file: {
        name: file.name,
        size: file.size,
        type: file.mimetype,
        dataLength: file.data?.length || 0
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

// MAIN BATCH UPLOAD ENDPOINT - FIXED with improved file type detection
router.post('/batch-upload', async (req, res) => {
  console.log('🔍 Batch upload endpoint called');
  try {
    console.log('📁 Batch upload - Files received:', req.files ? Object.keys(req.files) : 'None');
    
    if (!req.files || !req.files.customersFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please select a file with field name "customersFile"',
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: ['No file uploaded']
      });
    }

    const file = req.files.customersFile;
    
    console.log('📊 File details:', {
      name: file.name,
      size: file.size,
      mimetype: file.mimetype,
      dataLength: file.data?.length,
      isBuffer: Buffer.isBuffer(file.data)
    });

    // Check if packages are available
    if (!XLSX || !csv) {
      console.error('❌ Required packages not available');
      return res.status(503).json({
        success: false,
        message: 'File processing libraries not installed',
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: ['Please install xlsx and csvtojson packages']
      });
    }

    console.log('✅ XLSX and csvtojson packages are available');

    let fileBuffer;
    if (Buffer.isBuffer(file.data) && file.data.length > 0) {
      fileBuffer = file.data;
      console.log('✅ Using memory buffer, length:', fileBuffer.length);
    } else {
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

    // IMPROVED FILE TYPE DETECTION
    const fileName = file.name.toLowerCase();
    const fileExt = path.extname(file.name).toLowerCase();
    const mimetype = file.mimetype.toLowerCase();

    console.log('📄 File extension:', fileExt);
    console.log('📄 Full filename:', file.name);
    console.log('📄 Mime type:', mimetype);

    // Determine file type using multiple methods
    let isExcelFile = false;
    let isCsvFile = false;

    // Check by mimetype (most reliable)
    if (mimetype.includes('spreadsheetml') || 
        mimetype.includes('excel') || 
        mimetype.includes('ms-excel') ||
        mimetype.includes('officedocument')) {
      isExcelFile = true;
      console.log('✅ Detected Excel file by mimetype');
    }
    // Check by extension
    else if (fileExt === '.csv' || fileName.includes('.csv')) {
      isCsvFile = true;
      console.log('✅ Detected CSV file by extension');
    }
    // Check by filename pattern (for truncated extensions)
    else if (fileName.includes('.xlsx') || fileName.includes('.xls')) {
      isExcelFile = true;
      console.log('✅ Detected Excel file by filename pattern');
    }
    // If extension is truncated (.lsx), still try to process as Excel
    else if (fileExt === '.lsx' && mimetype.includes('spreadsheet')) {
      isExcelFile = true;
      console.log('✅ Detected truncated Excel file extension, processing as Excel');
    }

    let customers = [];

    try {
      if (isCsvFile) {
        console.log('📄 Processing as CSV file...');
        const csvData = fileBuffer.toString('utf8');
        console.log('CSV data preview (first 200 chars):', csvData.substring(0, 200));
        console.log('CSV line count:', csvData.split('\n').length);
        
        const csvParser = csv();
        customers = await csvParser.fromString(csvData);
        
      } else if (isExcelFile) {
        console.log('📊 Processing as Excel file...');
        console.log('Excel buffer length:', fileBuffer.length);
        
        const workbook = XLSX.read(fileBuffer);
        console.log('Excel sheets:', workbook.SheetNames);
        
        const sheetName = workbook.SheetNames[0];
        customers = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
        
      } else {
        return res.status(400).json({
          success: false,
          message: 'Invalid file type. Please upload only Excel or CSV files',
          total: 0,
          created: 0,
          duplicates: 0,
          failed: 0,
          errors: [
            `Unsupported file type: ${fileExt}`,
            `Mime type: ${mimetype}`,
            'Expected: .xlsx, .xls, or .csv files',
            'Please ensure your file has the correct extension'
          ]
        });
      }

      console.log(`✅ Parsed ${customers.length} rows from file`);
      
      if (customers.length === 0) {
        console.log('⚠️ No data rows found in file');
        return res.status(400).json({
          success: false,
          message: 'No data found in file',
          total: 0,
          created: 0,
          duplicates: 0,
          failed: 0,
          errors: ['The file contains no data rows']
        });
      }

      // Log first row for debugging
      console.log('📋 First row:', JSON.stringify(customers[0], null, 2));
      console.log('📋 First row keys:', Object.keys(customers[0]));

      // Set the parsed customers in req.body
      req.body.customers = customers;
      console.log('✅ Set req.body.customers with', customers.length, 'customers');

      // Call the controller
      return await batchUploadCustomers(req, res);

    } catch (parseError) {
      console.error('❌ Error parsing file:', parseError);
      console.error('Parse error stack:', parseError.stack);
      return res.status(400).json({
        success: false,
        message: 'Failed to parse file',
        total: 0,
        created: 0,
        duplicates: 0,
        failed: 0,
        errors: [`Parse error: ${parseError.message}`]
      });
    }

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

// Batch template endpoint
router.get('/batch-template', (req, res) => {
  console.log('🔍 Batch template endpoint called');
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
    console.error('Error generating template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template structure'
    });
  }
});

// CREATE CUSTOMER - FIXED DATE HANDLING
router.post('/customers', async (req, res) => {
  console.log('🔍 Create customer endpoint called');
  console.log('📋 Request body:', req.body);
  
  try {
    const { buId } = req.query;
    
    if (buId && isNaN(parseInt(buId))) {
      return res.status(400).json({ message: 'Invalid Business Unit ID' });
    }

    let generatedNumbers = {};
    if (buId) {
      generatedNumbers = await generateCustomerNumber(parseInt(buId));
    }

    // Clean up the request body to handle empty strings and invalid dates
    const cleanedBody = { ...req.body };
    
    // List of date fields to validate
    const dateFields = ['BIRTH_DT', 'OPENED_DT', 'REGISTRATION_DT', 'CREATE_DT', 'UPDATED_AT'];
    
    dateFields.forEach(field => {
      if (cleanedBody[field]) {
        // Check if it's a valid date
        const date = new Date(cleanedBody[field]);
        if (isNaN(date.getTime())) {
          // Invalid date, set to null
          console.log(`⚠️ Invalid date for ${field}: ${cleanedBody[field]}, setting to null`);
          cleanedBody[field] = null;
        } else {
          // Valid date, keep it
          cleanedBody[field] = date;
        }
      } else {
        // Empty or undefined, set to null
        cleanedBody[field] = null;
      }
    });

    // Handle empty strings for required fields
    const stringFields = ['ORGANISATION_NM', 'REGISTRATION_ADDRESS'];
    stringFields.forEach(field => {
      if (cleanedBody[field] === '') {
        cleanedBody[field] = null;
      }
    });

    // Combine with generated numbers
    const customerData = {
      ...cleanedBody,
      ...generatedNumbers,
      STATUS: 'PENDING',
      REC_ST: 'PENDING',
      CREATED_AT: new Date(),
      UPDATED_AT: new Date()
    };

    console.log('📝 Customer data to save:', JSON.stringify(customerData, null, 2));

    const newCustomer = await Customer.create(customerData);

    const fullName = `${newCustomer.FIRST_NAME || ''} ${newCustomer.LAST_NAME || ''}`.trim();

    res.status(201).json({
      success: true,
      message: 'Customer created and submitted for approval',
      data: {
        _id: newCustomer.id,
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
    console.error('❌ Error creating customer:', error);
    console.error('❌ Error stack:', error.stack);
    
    // Check for validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({
          field: e.path,
          message: e.message
        }))
      });
    }
    
    handleError(res, error, 'Failed to create customer');
  }
});

// GET ALL CUSTOMERS
router.get('/customers', (req, res) => {
  console.log('🔍 Get all customers endpoint called');
  getAllCustomers(req, res);
});

// GET PENDING CUSTOMERS
router.get('/customers/pending', (req, res) => {
  console.log('🔍 Get pending customers endpoint called');
  getPendingCustomers(req, res);
});

// GET SINGLE CUSTOMER BY ID
router.get('/customers/:CUST_ID', (req, res) => {
  console.log(`🔍 Get customer by ID endpoint called: ${req.params.CUST_ID}`);
  getCustomerById(req, res);
});

// UPDATE CUSTOMER DATA - FIXED DATE HANDLING
router.put('/customers/:CUST_ID', async (req, res) => {
  console.log(`🔍 Update customer endpoint called: ${req.params.CUST_ID}`);
  
  try {
    const customer = await Customer.findOne({ where: { CUST_ID: req.params.CUST_ID } });
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Clean up the request body to handle empty strings and invalid dates
    const cleanedBody = { ...req.body };
    
    // List of date fields to validate
    const dateFields = ['BIRTH_DT', 'OPENED_DT', 'REGISTRATION_DT', 'CREATE_DT'];
    
    dateFields.forEach(field => {
      if (cleanedBody[field]) {
        // Check if it's a valid date
        const date = new Date(cleanedBody[field]);
        if (isNaN(date.getTime())) {
          // Invalid date, set to null
          console.log(`⚠️ Invalid date for ${field}: ${cleanedBody[field]}, setting to null`);
          cleanedBody[field] = null;
        } else {
          // Valid date, keep it
          cleanedBody[field] = date;
        }
      } else {
        // Empty or undefined, set to null
        cleanedBody[field] = null;
      }
    });

    // Handle empty strings for string fields
    const stringFields = ['ORGANISATION_NM', 'REGISTRATION_ADDRESS', 'HOME_ADDRESS', 'EMAIL_ADDRESS'];
    stringFields.forEach(field => {
      if (cleanedBody[field] === '') {
        cleanedBody[field] = null;
      }
    });

    cleanedBody.UPDATED_AT = new Date();

    await customer.update(cleanedBody);

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });
  } catch (error) {
    console.error('❌ Error updating customer:', error);
    
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.errors.map(e => ({
          field: e.path,
          message: e.message
        }))
      });
    }
    
    handleError(res, error, 'Failed to update customer');
  }
});

router.put('/approve/:customerId', (req, res) => {
  console.log(`🔍 Approve customer endpoint called: ${req.params.customerId}`);
  approveCustomer(req, res);
});

router.put('/reject/:customerId', (req, res) => {
  console.log(`🔍 Reject customer endpoint called: ${req.params.customerId}`);
  rejectCustomer(req, res);
});

// DEACTIVATE CUSTOMER
router.patch('/customers/:CUST_ID/deactivate', (req, res) => {
  console.log(`🔍 Deactivate customer endpoint called: ${req.params.CUST_ID}`);
  deactivateCustomer(req, res);
});

// 🔥 FIXED: Use the imported generateCustomerNumber function
// This endpoint generates a new customer number
/**
 * Generate customer number
 * @route GET /api/customer/generate-customer-number
 */
router.get('/generate-customer-number', async (req, res) => {
  console.log('🔍 Generate customer number endpoint called');
  console.log('🔍 Query params:', req.query);
  
  try {
    const { buId } = req.query; // Optional BU_ID filter
    console.log('🔢 Generating customer number for BU_ID:', buId || 'all');
    
    // Call the imported utility function
    const result = await generateCustomerNumber();
    
    console.log('✅ Generated result:', result);
    
    res.status(200).json({
      success: true,
      data: {
        customerId: result.CUST_ID,
        customerNumber: result.CUST_NO,
        isFallback: result.isFallback || false
      },
      message: result.isFallback ? 'Customer number generated (fallback mode)' : 'Customer number generated successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Customer Number Generation Error]', error);
    
    // Generate fallback numbers
    const timestamp = Date.now().toString().slice(-8);
    const fallbackId = `CUST${timestamp}`;
    const fallbackNo = `TEMP${timestamp}`;
    
    res.status(200).json({
      success: true,
      data: {
        customerId: fallbackId,
        customerNumber: fallbackNo
      },
      message: 'Customer number generated (fallback mode)',
      timestamp: new Date().toISOString(),
      isFallback: true
    });
  }
});

console.log('🔍 ========== CUSTOMER ROUTES LOADED SUCCESSFULLY ==========');
console.log('🔍 Registered routes:');
console.log('  - GET    /search                    (Search customers)');
console.log('  - POST   /search/advanced            (Advanced search with pagination)');
console.log('  - GET    /search/quick                (Quick search for autocomplete)');
console.log('  - POST   /debug-file-structure');
console.log('  - POST   /test-upload');
console.log('  - POST   /batch-upload');
console.log('  - GET    /batch-template');
console.log('  - POST   /customers');
console.log('  - GET    /customers');
console.log('  - GET    /customers/pending');
console.log('  - GET    /customers/:CUST_ID');
console.log('  - PUT    /customers/:CUST_ID');
console.log('  - PUT    /approve/:customerId');
console.log('  - PUT    /reject/:customerId');
console.log('  - PATCH  /customers/:CUST_ID/deactivate');
console.log('  - GET    /generate-customer-number    (Generate customer number)');

export default router;