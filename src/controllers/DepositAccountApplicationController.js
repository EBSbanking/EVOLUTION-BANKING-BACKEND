// controllers/DepositAccountApplicationController.js
import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize'; // ADD THIS IMPORT
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';

// Import models
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import DepositTransaction from '../models/DepositTransaction.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import SavingsProduct from '../models/SavingsProduct.js';
import Counter from '../models/Counter.js';

// IMPORTANT: Fix the Customer import
// Try importing Customer model - if it fails, we'll use raw queries
let Customer;
try {
  // Try to import the Customer model
  const CustomerModule = await import('../models/Customer.js');
  Customer = CustomerModule.default;
  
  // Check if it's a valid Sequelize model
  if (!Customer || typeof Customer.findOne !== 'function') {
    console.warn('⚠️ Customer model imported but findOne is not a function');
    Customer = null; // Set to null to use raw queries
  }
} catch (error) {
  console.warn('⚠️ Could not import Customer model, will use raw queries:', error.message);
  Customer = null;
}

import { generateAccountIdentifiersFromCounter, generateAccountId } from '../utils/generateAccountNumber.js';
import WF_WORK_ITEMController from './WF_WORK_ITEMController.js';
import NotificationService from '../Services/NotificationService.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { getProductTypeByProdIdInternal } from '../Services/productService.js';
import AuditLogger from '../utils/AuditLogger.js';

dotenv.config();

const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'LOAN', 'TERM_DEPOSIT', 'CREDIT_CARD', 'INDIVIDUAL_LOAN', 'BUSINESS_TERM_LOAN'];


// Helper function to find customer with fallback - CORRECTED VERSION
// Helper function to find customer with fallback - FIXED VERSION
const findCustomer = async (CUST_ID, transaction = null) => {
  try {
    console.log(`🔍 Looking for customer: ${CUST_ID}`);
    
    // First, normalize the CUST_ID
    const normalizedCUST_ID = String(CUST_ID || '').trim();
    
    console.log('✅ Using direct raw query...');
    
    // FIX: Use different syntax for raw query
    const queryResult = await sequelize.query(
      `SELECT * FROM customers WHERE CUST_ID = ?`,
      {
        replacements: [normalizedCUST_ID],
        type: QueryTypes.SELECT,
        transaction,
        plain: true // This returns a single object instead of array
      }
    );
    
    console.log('📊 Query result type:', typeof queryResult);
    console.log('📊 Query result keys:', queryResult ? Object.keys(queryResult) : 'null');
    
    // FIX: Handle different return formats
    let customerData = null;
    
    if (queryResult) {
      if (Array.isArray(queryResult)) {
        // If it's an array, take first element
        customerData = queryResult.length > 0 ? queryResult[0] : null;
      } else if (typeof queryResult === 'object' && queryResult !== null) {
        // If it's already an object, use it directly
        customerData = queryResult;
      }
    }
    
    if (customerData) {
      console.log(`✅✅✅ CUSTOMER FOUND: ${customerData.CUST_ID}`);
      console.log('📋 Customer name:', `${customerData.FIRST_NAME} ${customerData.LAST_NAME}`);
      
      // Return an object that mimics Sequelize model
      return {
        dataValues: customerData,
        ...customerData,
        toJSON: () => customerData,
        get: (key) => customerData[key],
        CUST_ID: customerData.CUST_ID,
        FIRST_NAME: customerData.FIRST_NAME,
        LAST_NAME: customerData.LAST_NAME,
        REC_ST: customerData.REC_ST,
        CUST_NO: customerData.CUST_NO,
        id: customerData.id
      };
    }
    
    console.log(`❌ Customer not found: ${normalizedCUST_ID}`);
    return null;
    
  } catch (error) {
    console.error('❌ Error in findCustomer helper:', error);
    return null;
  }
};

// Add these helper functions at the top of your controller file
async function getProductTypeFromDatabase(PROD_ID) {
  try {
    // Example implementation - adjust based on your database structure
    const product = await SavingsProduct.findOne({
      where: {
        [Op.or]: [
          { PROD_ID: PROD_ID },
          { productCode: PROD_ID },
          { PROD_CD: PROD_ID }
        ],
        REC_ST: 'A'
      }
    });
    
    if (!product) {
      console.warn(`Product not found for PROD_ID: ${PROD_ID}`);
      return 'SAVINGS';
    }
    
    return product.productType || product.PROD_TYPE || product.accountType || 'SAVINGS';
  } catch (error) {
    console.error('Error getting product type:', error);
    return 'SAVINGS';
  }
}

async function generateUniqueAccountNumber(transaction) {
  try {
    // Generate a random 10-digit account number starting with 2
    const randomDigits = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
    const accountNumber = `2${randomDigits}`;
    
    // Check if it already exists
    const existingAccount = await CustomerAccount.findOne({
      where: { account_number: accountNumber },
      attributes: ['id', 'account_number'],
      transaction
    });
    
    // If it exists, generate another one (with recursion limit)
    if (existingAccount) {
      console.log(`Account ${accountNumber} exists, generating new one...`);
      return await generateUniqueAccountNumber(transaction);
    }
    
    return accountNumber;
  } catch (error) {
    console.error('Error in generateUniqueAccountNumber:', error);
    // Fallback: timestamp-based account number
    const timestamp = Date.now() % 10000000000;
    return `2${timestamp.toString().padStart(9, '0')}`;
  }
}


const DepositAccountApplicationController = {
// controllers/DepositAccountApplicationController.js
createApplication: async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    console.log('🚀 === STARTING CREATE APPLICATION (SIMPLIFIED) ===');

    // Extract and validate request data
    let {
      CUST_ID,
      ACCT_NO,
      ACCT_ID,
      ACCOUNT_TYPE,
      PROD_ID,
      BU_ID,
      ACCT_NM,
      CRNCY_ID,
      AMOUNT,
      USER_ID,
      CREATED_BY,
      DEPOSITOR_NAME,
      DOCUMENT_TYPE,
      DOCUMENT_NUMBER,
      NOTES,
      BRANCH_NAME,
      AVAIL_DT,
      OPENED_DT,
      CREATED_AT
    } = req.body;

    // ========== CLEAN ALL FIELDS ==========
    const cleanField = (value) => {
      if (value === undefined || value === null) return '';
      let cleaned = String(value).trim();
      cleaned = cleaned.replace(/^["'\s,]+|["'\s,]+$/g, '');
      return cleaned;
    };

    // Clean all fields
    CUST_ID = cleanField(CUST_ID);
    ACCT_NM = cleanField(ACCT_NM);
    DEPOSITOR_NAME = cleanField(DEPOSITOR_NAME);
    DOCUMENT_TYPE = cleanField(DOCUMENT_TYPE);
    DOCUMENT_NUMBER = cleanField(DOCUMENT_NUMBER);
    AMOUNT = cleanField(AMOUNT);
    PROD_ID = cleanField(PROD_ID);
    BU_ID = cleanField(BU_ID);
    CRNCY_ID = cleanField(CRNCY_ID);
    CREATED_BY = cleanField(CREATED_BY);
    USER_ID = cleanField(USER_ID);
    ACCOUNT_TYPE = cleanField(ACCOUNT_TYPE);
    NOTES = cleanField(NOTES);
    BRANCH_NAME = cleanField(BRANCH_NAME);

    console.log('📋 Cleaned request data:', {
      CUST_ID,
      ACCT_NM,
      DEPOSITOR_NAME,
      DOCUMENT_TYPE,
      PROD_ID,
      BU_ID,
      CREATED_BY,
      USER_ID,
      ACCOUNT_TYPE
    });

    // Normalize CUST_ID
    const normalizedCUST_ID = String(CUST_ID || '').trim().padStart(10, '0');

    // Validate required fields
    const requiredFields = [
      { name: 'CUST_ID', value: CUST_ID },
      { name: 'ACCT_NM', value: ACCT_NM },
      { name: 'PROD_ID', value: PROD_ID },
      { name: 'BU_ID', value: BU_ID },
      { name: 'CREATED_BY', value: CREATED_BY },
      { name: 'USER_ID', value: USER_ID },
      { name: 'DEPOSITOR_NAME', value: DEPOSITOR_NAME }
    ];

    const missingFields = [];
    requiredFields.forEach(field => {
      if (!field.value || field.value.trim() === '') {
        missingFields.push(field.name);
      }
    });

    if (missingFields.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        receivedFields: Object.keys(req.body)
      });
    }

    // Validate CUST_ID format
    if (!/^\d{10}$/.test(normalizedCUST_ID)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `CUST_ID must be exactly 10 digits. Received: "${CUST_ID}" (normalized: "${normalizedCUST_ID}")`
      });
    }

    console.log('🔍 Validating customer:', normalizedCUST_ID);

    // Find customer
    const customer = await findCustomer(normalizedCUST_ID, transaction);

    if (!customer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Customer not found: ${normalizedCUST_ID}`
      });
    }

    console.log('✅ Customer found:', {
      CUST_ID: customer.CUST_ID || customer.cust_id,
      name: (customer.FIRST_NAME || customer.first_name || '') + ' ' + (customer.LAST_NAME || customer.last_name || ''),
      status: customer.REC_ST || customer.rec_st
    });

    // Check if customer is active
    const customerStatus = customer.REC_ST || customer.rec_st;
    if (customerStatus !== 'Active' && customerStatus !== 'ACTIVE') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Customer is not active. Current status: ${customerStatus}`,
        customerId: normalizedCUST_ID
      });
    }

    // ========== GENERATE OR VALIDATE ACCOUNT NUMBER ==========
    let accountNumber;

    if (ACCT_NO) {
      console.log('⚠️ User provided account number:', ACCT_NO);
      
      // Clean the provided account number
      const cleanedACCT_NO = cleanField(ACCT_NO);
      
      // Ensure it's exactly 10 digits
      if (!/^\d{10}$/.test(cleanedACCT_NO)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Account number must be exactly 10 digits'
        });
      }
      
      // Check if account number already exists
      const existingAccount = await CustomerAccount.findOne({
        where: { account_number: cleanedACCT_NO },
        attributes: ['id', 'account_number', 'customer_id'],
        transaction
      });

      if (existingAccount) {
        console.log(`❌ Provided account number ${cleanedACCT_NO} already exists.`);
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: `Account number ${cleanedACCT_NO} already exists.`
        });
      }

      accountNumber = cleanedACCT_NO;
      console.log('✅ Using provided account number:', accountNumber);
    } else {
      // Generate account number automatically - FIXED: Ensure 10 digits
      console.log('🔢 Generating account number automatically...');
      
      const accountTypeUpper = (ACCOUNT_TYPE || 'SAVINGS').toUpperCase();
      const prefix = accountTypeUpper === 'SAVINGS' ? '2' : 
                    accountTypeUpper === 'CURRENT' ? '1' : 
                    accountTypeUpper === 'TERM_DEPOSIT' ? '5' : '3';
      
      // FIXED: Generate ALWAYS 10-digit account number
      const generateAccountNumber = () => {
        // Generate a number between 100000000 and 999999999 (always 9 digits)
        const min = 100000000;
        const max = 999999999;
        const randomDigits = Math.floor(Math.random() * (max - min + 1)) + min;
        
        // This will always be exactly 9 digits
        const randomDigitsStr = randomDigits.toString();
        
        // Prefix + 9 digits = 10 digits
        const accountNumber = `${prefix}${randomDigitsStr}`;
        
        console.log(`Generated: prefix=${prefix}, random=${randomDigitsStr}, account=${accountNumber}, length=${accountNumber.length}`);
        return accountNumber;
      };
      
      // Generate and check for uniqueness
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 15;
      
      while (!isUnique && attempts < maxAttempts) {
        accountNumber = generateAccountNumber();
        attempts++;
        
        console.log(`Attempt ${attempts}: Generated ${accountNumber} (length: ${accountNumber.length})`);
        
        // Validate it's 10 digits
        if (accountNumber.length !== 10) {
          console.warn(`⚠️ Invalid account number length: ${accountNumber.length} digits, regenerating...`);
          continue;
        }
        
        // Validate it's all digits
        if (!/^\d{10}$/.test(accountNumber)) {
          console.warn(`⚠️ Invalid account number format: ${accountNumber}, regenerating...`);
          continue;
        }
        
        const existingAccount = await CustomerAccount.findOne({
          where: { account_number: accountNumber },
          attributes: ['id'],
          transaction
        });
        
        if (!existingAccount) {
          isUnique = true;
          console.log(`✅ Unique account number found: ${accountNumber}`);
        } else {
          console.log(`Account ${accountNumber} exists, generating new one... (attempt ${attempts}/${maxAttempts})`);
        }
      }
      
      if (!isUnique) {
        await transaction.rollback();
        return res.status(500).json({
          success: false,
          message: 'Failed to generate unique account number after multiple attempts'
        });
      }
      
      console.log('✅ Generated unique account number:', accountNumber, `(length: ${accountNumber.length})`);
    }

    // Parse amount
    const openingAmount = parseFloat(AMOUNT) || 0;
    if (isNaN(openingAmount)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid amount: ${AMOUNT}. Must be a valid number.`
      });
    }
    
    if (openingAmount < 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Amount cannot be negative'
      });
    }

    // Handle currency
    const validatedCRNCY_ID = 'NGN'; // Force NGN for model validation

    // ========== CREATE CUSTOMER ACCOUNT ==========
    console.log('📝 Creating CustomerAccount...');
    
    // Generate ACCT_ID
    let finalACCT_ID = ACCT_ID;
    if (!finalACCT_ID) {
      // Generate 6-digit ACCT_ID
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      // Format as 6-digit string
      finalACCT_ID = ((timestamp % 900000) + 100000).toString();
      console.log(`✅ Generated ACCT_ID: ${finalACCT_ID}`);
    }

    // Determine account type
    const accountTypeUpper = (ACCOUNT_TYPE || 'SAVINGS').toUpperCase();
    const validAccountTypes = ['SAVINGS', 'CURRENT', 'TERM_DEPOSIT', 'LOAN'];
    const finalAccountType = validAccountTypes.includes(accountTypeUpper) ? accountTypeUpper : 'SAVINGS';

    // Prepare account data
// In your controller, update the customerAccountData object:
const customerAccountData = {
  // ESSENTIAL FIELDS
  customer_id: parseInt(normalizedCUST_ID),
  customer_code: customer.CUST_NO || customer.cust_no || '',
  account_number: accountNumber,
  product_type: finalAccountType,
  product: PROD_ID || '',
  branch: parseInt(BU_ID) || 1,
  
  // STATUS FIELDS (UPPERCASE)
  REC_ST: 'PENDING',
  ACCOUNT_TYPE: finalAccountType,
  PRODUCT_DESC: `${finalAccountType} Account: ${ACCT_NM}`,
  substatus: 'Pending',
  
  // FINANCIAL FIELDS
  currency: validatedCRNCY_ID,
  opening_amount: openingAmount,
  cleared_balance: openingAmount,
  ledger_balance: openingAmount,
  AVAILABLE_BALANCE: openingAmount,
  
  // INTEREST FIELDS (UPPERCASE)
  INTEREST_RATE: 0.0,
  ACCRUED_INTEREST: 0.0,
  agreed_interest_rate: 0.0,
  
  // FLAGS (mixed case as per database)
  online_enabled: true,
  auto_approve: false,
  sms_alert: 'No',
  email_alert: 'No',
  DR_ALLOWED: true,
  CR_ALLOWED: true,
  isOverdraftAllowed: false,
  
  // USER TRACKING
  created_by: CREATED_BY,
  
  // DATES (mixed case as per database)
  lastActivityDate: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  
  // OTHER
  primary_relationship_manager: 1,
  overdraftLimit: 0.0,
  
  // JSON FIELD (UPPERCASE)
  CURRENCY_COUNT: JSON.stringify({
    'OneThousandNaira': 0,
    'FiveHundredNaira': 0,
    'TwoHundredNaira': 0,
    'OneHundredNaira': 0,
    'FiftyNaira': 0,
    'TwentyNaira': 0,
    'TenNaira': 0,
    'FiveNaira': 0,
    'TOTAL_CURRENCY_COUNT': 0
  })
  
  // REMOVED: opened_dt, AVAIL_DT - these don't exist in your accounts table
};
    console.log('🔍 CustomerAccount data summary:', {
      customer_id: customerAccountData.customer_id,
      account_number: customerAccountData.account_number,
      account_number_length: customerAccountData.account_number.length,
      ACCT_NM: customerAccountData.ACCT_NM,
      ACCOUNT_TYPE: customerAccountData.ACCOUNT_TYPE,
      REC_ST: customerAccountData.REC_ST,
      opening_amount: customerAccountData.opening_amount,
      // Validate the account number
      account_number_is_valid: /^\d{10}$/.test(customerAccountData.account_number)
    });

    // ========== FINAL VALIDATION BEFORE CREATING ==========
    // Validate account number length
    if (!customerAccountData.account_number || customerAccountData.account_number.length !== 10) {
      throw new Error(`Account number must be 10 digits. Got: ${customerAccountData.account_number} (${customerAccountData.account_number?.length || 0} digits)`);
    }

    // Validate it's all digits
    if (!/^\d{10}$/.test(customerAccountData.account_number)) {
      throw new Error(`Account number must contain only digits. Got: ${customerAccountData.account_number}`);
    }

    const customerAccount = await CustomerAccount.create(customerAccountData, { transaction });
    console.log('✅ CustomerAccount created with ID:', customerAccount.id);

    // Create initial deposit transaction if amount > 0
    if (openingAmount > 0) {
      try {
        const depositTransaction = await DepositTransaction.create({
          customer_id: parseInt(normalizedCUST_ID),
          account_number: accountNumber,
          transaction_type: 'OPENING_DEPOSIT',
          amount: openingAmount,
          currency: validatedCRNCY_ID,
          status: 'COMPLETED',
          created_by: CREATED_BY,
          transaction_date: new Date(),
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction });
        console.log('✅ Initial deposit transaction created:', depositTransaction.id);
      } catch (txError) {
        console.warn('⚠️ Deposit transaction creation failed:', txError.message);
      }
    }

    // Create workflow item
    try {
      const workflowData = {
        WORK_ITEM_TYPE: 'AccountApplication',
        ENTITY_ID: normalizedCUST_ID,
        ENTITY_REF: accountNumber,
        STATUS: 'PENDING',
        CREATED_BY: USER_ID,
        ASSIGNED_TO: null,
        PRIORITY: 'NORMAL',
        metadata: JSON.stringify({
          customerName: (customer.FIRST_NAME || '') + ' ' + (customer.LAST_NAME || ''),
          accountNumber: accountNumber,
          accountName: ACCT_NM,
          depositorName: DEPOSITOR_NAME,
          documentType: DOCUMENT_TYPE,
          documentNumber: DOCUMENT_NUMBER,
          amount: openingAmount,
          applicationId: customerAccount.id,
          accountType: finalAccountType,
          branch: BRANCH_NAME || 'Not specified'
        })
      };

      const workflowItem = await WF_WORK_ITEM.create(workflowData, { transaction });
      console.log('✅ Workflow item created:', workflowItem.id);
    } catch (wfError) {
      console.warn('⚠️ Workflow creation failed:', wfError.message);
    }

    // Create audit trail
    try {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: USER_ID,
        event_type: 'CUSTOMER_ACCOUNT_CREATE',
        action: 'Create Account Application',
        old_value: null,
        new_value: JSON.stringify({
          customerId: normalizedCUST_ID,
          accountNumber: accountNumber,
          accountName: ACCT_NM,
          depositorName: DEPOSITOR_NAME,
          documentType: DOCUMENT_TYPE,
          documentNumber: DOCUMENT_NUMBER,
          amount: openingAmount,
          status: 'Pending',
          customerName: (customer.FIRST_NAME || '') + ' ' + (customer.LAST_NAME || ''),
          accountType: finalAccountType,
          productId: PROD_ID
        }),
        ip_address: req.ip || req.headers['x-forwarded-for'] || 'unknown',
        timestamp: new Date(),
        entity_type: 'CustomerAccount',
        entity_id: customerAccount.id,
        status: 'SUCCESS',
        account_no: accountNumber,
        description: `Created ${finalAccountType} account application for customer ${normalizedCUST_ID} (${ACCT_NM})`,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });
      console.log('✅ Audit trail created');
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed:', auditError.message);
    }

    await transaction.commit();
    console.log('✅ Transaction committed successfully');

    return res.status(201).json({
      success: true,
      message: 'Account application created successfully',
      data: {
        application: {
          id: customerAccount.id,
          accountNumber: accountNumber,
          accountName: ACCT_NM,
          depositorName: DEPOSITOR_NAME,
          documentType: DOCUMENT_TYPE,
          documentNumber: DOCUMENT_NUMBER,
          accountType: finalAccountType,
          productId: PROD_ID,
          openingAmount: openingAmount,
          currency: validatedCRNCY_ID,
          status: 'Pending',
          createdAt: new Date(),
          applicationId: finalACCT_ID
        },
        customer: {
          customerId: normalizedCUST_ID,
          customerName: (customer.FIRST_NAME || '') + ' ' + (customer.LAST_NAME || ''),
          customerCode: customer.CUST_NO || customer.cust_no
        },
        account: {
          accountNumber: accountNumber,
          openingAmount: openingAmount,
          currency: validatedCRNCY_ID,
          transactionCreated: openingAmount > 0,
          accountGenerated: !ACCT_NO
        }
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('❌ ERROR in createApplication:', error.message);
    console.error('Error stack:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Error creating account application',
      details: error.message,
      code: 'APPLICATION_ERROR',
      timestamp: new Date().toISOString()
    });
  }
},

  getApplicationByCustId: async (req, res) => {
    try {
      const { CUST_ID } = req.params;
      if (!CUST_ID) {
        return res.status(400).json({ message: 'CUST_ID is required.', code: 'MISSING_CUST_ID' });
      }

      const applications = await DepositAccountApplication.findAll({
        where: { CUST_ID: Number(String(CUST_ID).replace(/^0+/, '')) }
      });

      if (!applications || applications.length === 0) {
        return res.status(404).json({ message: `No applications found for CUST_ID ${CUST_ID}`, code: 'NO_APPLICATIONS_FOUND' });
      }

      return res.status(200).json({
        message: 'Applications retrieved successfully',
        data: applications
      });
    } catch (error) {
      console.error('❌ Error retrieving applications by CUST_ID:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        message: 'Internal Server Error',
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  },

  getApplicationByACCT_NO: async (req, res) => {
    try {
      const { ACCT_NO } = req.params;
      if (!ACCT_NO) {
        return res.status(400).json({ message: 'ACCT_NO is required.', code: 'MISSING_ACCT_NO' });
      }

      const application = await DepositAccountApplication.findOne({
        where: { ACCT_NO: String(ACCT_NO) }
      });

      if (!application) {
        return res.status(404).json({ message: `No application found for ACCT_NO ${ACCT_NO}`, code: 'APPLICATION_NOT_FOUND' });
      }

      return res.status(200).json({
        message: 'Application retrieved successfully',
        data: application
      });
    } catch (error) {
      console.error('❌ Error retrieving application by ACCT_NO:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        message: 'Internal Server Error',
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  },

  updateApplicationStatus: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { id } = req.params;
      const { status, comments, approvedBy, rejectedBy } = req.body;

      if (!id) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Application ID is required.', code: 'MISSING_APPLICATION_ID' });
      }
      if (!status) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Status is required.', code: 'MISSING_STATUS' });
      }

      const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      if (!['Pending', 'Approved', 'Rejected'].includes(normalizedStatus)) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Invalid status. Must be Pending, Approved, or Rejected.', code: 'INVALID_STATUS' });
      }

      const application = await DepositAccountApplication.findByPk(id, { transaction });
      if (!application) {
        await transaction.rollback();
        return res.status(404).json({ message: `Application not found for ID ${id}`, code: 'APPLICATION_NOT_FOUND' });
      }

      const isApproval = normalizedStatus === 'Approved';
      const oldValues = {
        STATUS: application.STATUS,
        REC_ST: application.REC_ST
      };

      // Update application
      const updateData = {
        STATUS: normalizedStatus,
        REC_ST: isApproval ? 'ACTIVE' : normalizedStatus === 'Rejected' ? 'REJECTED' : 'PENDING',
        COMMENTS: comments || application.COMMENTS,
        LAST_UPDATED: new Date(),
        updated_at: new Date()
      };

      if (isApproval) {
        if (!approvedBy) {
          await transaction.rollback();
          return res.status(400).json({ message: 'approvedBy is required for approval.', code: 'MISSING_APPROVED_BY' });
        }
        updateData.APPROVED_BY = approvedBy;
        updateData.APPROVAL_DATE = new Date();
        updateData.REJECTED_BY = null;
        updateData.REJECTION_DATE = null;
      } else if (normalizedStatus === 'Rejected') {
        if (!rejectedBy) {
          await transaction.rollback();
          return res.status(400).json({ message: 'rejectedBy is required for rejection.', code: 'MISSING_REJECTED_BY' });
        }
        updateData.REJECTED_BY = rejectedBy;
        updateData.REJECTION_DATE = new Date();
        updateData.APPROVED_BY = null;
        updateData.APPROVAL_DATE = null;
      }

      await application.update(updateData, { transaction });

      // Update workflow item
      const wfUpdateResult = isApproval
        ? await WF_WORK_ITEMController.updateWorkItemStatusOnApproval('DepositAccountApplication', application.CUST_ID, approvedBy, transaction)
        : await WF_WORK_ITEMController.updateWorkItemStatusOnRejection('DepositAccountApplication', application.CUST_ID, rejectedBy, comments || 'Status updated', transaction);

      if (!wfUpdateResult.success) {
        await transaction.rollback();
        return res.status(500).json({
          message: 'Failed to update workflow item status',
          error: wfUpdateResult.error,
          code: 'WORKFLOW_UPDATE_FAILED'
        });
      }

      // Audit Trail
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: isApproval ? approvedBy : rejectedBy || application.USER_ID,
        event_type: 'DepositAccountApplication',
        action: `Update Status to ${normalizedStatus}`,
        old_value: JSON.stringify(oldValues),
        new_value: JSON.stringify({ STATUS: normalizedStatus, REC_ST: updateData.REC_ST }),
        ip_address: req.ip || 'unknown',
        timestamp: new Date(),
        entity_type: 'DepositAccountApplication',
        entity_id: application.id,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      await transaction.commit();

      return res.status(200).json({
        message: `Application status updated to ${normalizedStatus}`,
        data: application
      });
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error updating application status:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        message: 'Internal Server Error',
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  },

  approveApplicationByCustomerId: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { CUST_ID } = req.params;
      let { approvedBy, rejectedBy, comments, ACCT_NO, status, AMOUNT } = req.body;

      // Validate required fields
      if (!ACCT_NO) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Account number (ACCT_NO) is required when approving by customer ID',
          code: 'MISSING_ACCOUNT_NUMBER',
        });
      }

      // Find the application
      const normalizedCUST_ID = Number(String(CUST_ID).replace(/^0+/, ''));
      const application = await DepositAccountApplication.findOne({
        where: {
          CUST_ID: normalizedCUST_ID,
          ACCT_NO: String(ACCT_NO),
        },
        transaction
      });

      if (!application) {
        await transaction.rollback();
        return res.status(404).json({
          message: 'Application not found for this customer and account number',
          code: 'APPLICATION_NOT_FOUND',
        });
      }

      // Validate ACCT_ID
      const ACCT_ID = String(application.ACCT_ID);
      if (!/^[A-Z0-9_]+$/.test(ACCT_ID)) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Invalid ACCT_ID ${application.ACCT_ID}. Must be alphanumeric with underscores.`,
          code: 'INVALID_ACCT_ID',
        });
      }

      // Determine new status
      const alreadyApproved = application.STATUS === 'Approved';
      const alreadyActive = application.REC_ST === 'ACTIVE';
      const alreadyRejected = application.STATUS === 'Rejected';

      if (!status) {
        status = approvedBy ? 'Approved' : rejectedBy ? 'Rejected' : null;
      }

      if (!status) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Status could not be determined. Provide approvedBy, rejectedBy, or status field.',
          code: 'STATUS_UNDETERMINED',
        });
      }

      const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      const isApproval = normalizedStatus === 'Approved';

      if ((isApproval && alreadyApproved) || (!isApproval && alreadyRejected)) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Application already ${normalizedStatus}`,
          code: 'DUPLICATE_ACTION',
        });
      }

      // Validate user_id for AuditTrail
      const auditUserId = isApproval ? approvedBy : rejectedBy;
      if (!auditUserId || typeof auditUserId !== 'string' || auditUserId.trim() === '') {
        await transaction.rollback();
        return res.status(400).json({
          message: `Invalid ${isApproval ? 'approvedBy' : 'rejectedBy'} value. Must be a non-empty string.`,
          code: 'INVALID_USER_ID',
        });
      }

      // Store old values
      const oldValues = {
        STATUS: application.STATUS,
        REC_ST: application.REC_ST
      };

      // Update application
      const updateData = {
        STATUS: normalizedStatus,
        REC_ST: isApproval ? 'ACTIVE' : 'REJECTED',
        COMMENTS: comments || '',
        LAST_UPDATED: new Date(),
        updated_at: new Date()
      };

      if (isApproval) {
        if (!approvedBy) {
          await transaction.rollback();
          return res.status(400).json({
            message: 'Approver user ID (approvedBy) is required',
            code: 'MISSING_APPROVER',
          });
        }
        updateData.APPROVED_BY = approvedBy;
        updateData.APPROVAL_DATE = new Date();
        updateData.REJECTED_BY = null;
        updateData.REJECTION_DATE = null;
      } else {
        if (!rejectedBy) {
          await transaction.rollback();
          return res.status(400).json({
            message: 'Rejector user ID (rejectedBy) is required',
            code: 'MISSING_REJECTOR',
          });
        }
        updateData.REJECTED_BY = rejectedBy;
        updateData.REJECTION_DATE = new Date();
        updateData.APPROVED_BY = null;
        updateData.APPROVAL_DATE = null;
      }

      await application.update(updateData, { transaction });

      // ========== CRITICAL FIX: Update Customer Master Status ==========
      let customerUpdated = false;
      let customerAccountUpdated = false;
      let accountUpdated = false;

      if (isApproval && !alreadyActive) {
        // ========== PART 1: Update Customer Master Record ==========
        const customer = await Customer.findOne({
          where: { CUST_ID: normalizedCUST_ID },
          transaction
        });
        
        if (customer) {
          console.log('🔄 Updating Customer master status to ACTIVE...');
          await customer.update({
            REC_ST: 'ACTIVE',
            status: 'Active',
            last_updated: new Date()
          }, { transaction });
          customerUpdated = true;
          console.log('✅ Customer master status updated to ACTIVE');
        } else {
          console.warn('⚠️ Customer master record not found for CUST_ID:', normalizedCUST_ID);
        }

        // ========== PART 2: Update CustomerAccount Record ==========
        // FIXED: Use account_number instead of ACCT_NO
        const existingAccount = await CustomerAccount.findOne({
          where: {
            customer_id: normalizedCUST_ID,
            account_number: String(ACCT_NO), // Use account_number field
          },
          attributes: ['id', 'account_number', 'customer_id', 'status', 'REC_ST', 'ACCOUNT_TYPE', 'productCode'],
          transaction
        });

        if (existingAccount) {
          console.log('🔄 CustomerAccount already exists, updating status to Active...');

          // Validate and convert AMOUNT if provided
          const depositAmount = AMOUNT && Number(AMOUNT) > 0 ? AMOUNT.toString() : application.AMOUNT ? application.AMOUNT.toString() : '0.00';
          if (!/^\d+(\.\d{1,2})?$/.test(depositAmount)) {
            await transaction.rollback();
            return res.status(400).json({
              message: `Invalid AMOUNT ${depositAmount}. Must be a valid number with up to 2 decimal places.`,
              code: 'INVALID_AMOUNT',
            });
          }

          // Update existing account to Active status
          const accountUpdateData = {
            status: 'Active',
            substatus: 'Active',
            REC_ST: 'ACTIVE',
            approval_date: new Date(),
            approved_by: parseInt(auditUserId) || 1,
            last_updated: new Date(),
            lastActivityDate: new Date()
          };

          // Update balances if AMOUNT is provided
          if (AMOUNT && Number(AMOUNT) > 0) {
            accountUpdateData.opening_amount = parseFloat(depositAmount);
            accountUpdateData.cleared_balance = parseFloat(depositAmount);
            accountUpdateData.ledger_balance = parseFloat(depositAmount);
            accountUpdateData.AVAILABLE_BALANCE = parseFloat(depositAmount);
          }

          // Handle SAVINGS account specific updates
          if (existingAccount.ACCOUNT_TYPE === 'SAVINGS') {
            const productCode = String(application.PROD_ID);
            console.log('🔍 Searching for SavingsProduct for existing account with PROD_ID:', productCode);

            let product = null;
            const productCodeNum = Number(productCode);

            const searchStrategies = [
              { PROD_ID: productCodeNum, REC_ST: "A" },
              { productCode: productCode, REC_ST: "A" },
              { PROD_CD: productCode, REC_ST: "A" },
              { PROD_ID: productCodeNum },
              { productCode: productCode },
              { PROD_CD: productCode }
            ];

            for (const strategy of searchStrategies) {
              try {
                product = await SavingsProduct.findOne({
                  where: strategy,
                  transaction
                });
                if (product) {
                  console.log(`✅ Found product for existing account with strategy:`, strategy);
                  break;
                }
              } catch (searchError) {
                console.log(`❌ Search failed for strategy:`, strategy, searchError.message);
              }
            }

            if (product) {
              // Update product details
              accountUpdateData.productCode = product.productCode || product.PROD_ID || product.PROD_CD;
              accountUpdateData.product = String(product.productCode || product.PROD_ID || product.PROD_CD);
              accountUpdateData.LAST_INTEREST_DATE = new Date();

              // Set interest rate from product
              let interestRate = 0;
              if (product.rateInformation?.fixedRate) {
                interestRate = product.rateInformation.fixedRate;
              } else if (product.interestRate) {
                interestRate = product.interestRate;
              } else if (product.rateInformation?.effectiveRate) {
                interestRate = product.rateInformation.effectiveRate;
              }

              console.log('💰 Setting interest rate for existing account:', interestRate);
              accountUpdateData.INTEREST_RATE = interestRate;
              accountUpdateData.agreed_interest_rate = interestRate;
              accountUpdateData.PRODUCT_DESC = product.productName || product.PROD_DESC || application.PRODUCT_DESC;
            } else {
              console.warn('⚠️ No SavingsProduct found for existing account, continuing with approval...');
            }
          }

          await existingAccount.update(accountUpdateData, { transaction });
          accountUpdated = true;
          customerAccountUpdated = true;
          console.log('✅ Existing CustomerAccount updated to Active status');

          // Log the updated status for verification
          console.log('📊 CustomerAccount status after update:', {
            status: existingAccount.status,
            REC_ST: existingAccount.REC_ST,
            account_number: existingAccount.account_number
          });

        } else {
          // Account doesn't exist, this shouldn't happen
          console.log('⚠️ No existing CustomerAccount found');

          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'No CustomerAccount found to approve. Please ensure the account was created during application submission.',
            code: 'ACCOUNT_NOT_FOUND',
          });
        }
      }

      // Workflow update with fallback for missing workflow item
      let wfUpdateResult;
      try {
        wfUpdateResult = isApproval
          ? await WF_WORK_ITEMController.updateWorkItemStatusOnApproval(
            'DepositAccountApplication',
            normalizedCUST_ID,
            approvedBy,
            transaction
          )
          : await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
            'DepositAccountApplication',
            normalizedCUST_ID,
            rejectedBy,
            comments || 'Rejected',
            transaction
          );
        if (!wfUpdateResult.success) {
          console.warn('⚠️ Workflow update failed, but proceeding with application update:', wfUpdateResult.error);
        }
      } catch (wfError) {
        console.warn('⚠️ Non-critical workflow update error:', wfError.message);
      }

      // FIXED: Audit Trail with valid status values
      const auditTrailStatus = isApproval ? 'SUCCESS' : 'REJECTED';

      const auditTrailData = {
        event_id: Date.now(),
        USER_ID: auditUserId,
        EVENT_TYPE: 'DepositAccountApplication',
        ACTION: isApproval ? 'Approve Application' : 'Reject Application',
        OLD_VALUE: JSON.stringify(oldValues),
        NEW_VALUE: JSON.stringify({
          STATUS: normalizedStatus || 'Unknown',
          REC_ST: application.REC_ST || 'Unknown',
        }),
        ipAddress: req.ip || 'unknown',
        timestamp: new Date(),
        entity_type: 'DepositAccountApplication',
        entity_id: application.id,
        status: auditTrailStatus,
        additional_info: JSON.stringify({
          comments: comments || '',
          originalStatus: normalizedStatus,
          account_number: ACCT_NO,
          account_action: accountUpdated ? 'UPDATED_EXISTING' : 'NO_ACTION',
          customer_account_updated: customerAccountUpdated,
          customer_updated: customerUpdated
        }),
        created_at: new Date(),
        updated_at: new Date()
      };

      try {
        await AuditTrail.create(auditTrailData, { transaction });
        console.log('✅ AuditTrail created successfully');
      } catch (auditError) {
        console.error('❌ AuditTrail creation error:', auditError.message);
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: isApproval
          ? 'Application approved, account activated, and customer status updated successfully.'
          : 'Application rejected successfully.',
        application: application,
        customerUpdated: customerUpdated,
        customerAccountUpdated: customerAccountUpdated,
        accountAction: isApproval ? (accountUpdated ? 'UPDATED' : 'NO_ACTION') : 'NO_ACTION',
        workflowItem: wfUpdateResult?.data || null,
        timestamp: new Date(),
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Approval processing error:', {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Error processing application',
        error: error.message,
        code: 'PROCESSING_ERROR',
        timestamp: new Date(),
      });
    }
  },

  rejectApplicationByCustomerId: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { CUST_ID } = req.params;
      const { rejectedBy, comments, ACCT_NO } = req.body;

      // Validate required fields
      if (!ACCT_NO) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Account number (ACCT_NO) is required when rejecting by customer ID',
          code: 'MISSING_ACCOUNT_NUMBER',
        });
      }

      if (!rejectedBy) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Rejector user ID (rejectedBy) is required',
          code: 'MISSING_REJECTOR',
        });
      }

      // Find the application
      const normalizedCUST_ID = Number(String(CUST_ID).replace(/^0+/, ''));
      const application = await DepositAccountApplication.findOne({
        where: {
          CUST_ID: normalizedCUST_ID,
          ACCT_NO: String(ACCT_NO),
        },
        transaction
      });

      if (!application) {
        await transaction.rollback();
        return res.status(404).json({
          message: 'Application not found for this customer and account number',
          code: 'APPLICATION_NOT_FOUND',
        });
      }

      // Check if already rejected
      if (application.STATUS === 'Rejected') {
        await transaction.rollback();
        return res.status(400).json({
          message: 'Application already rejected',
          code: 'ALREADY_REJECTED',
        });
      }

      // Update application
      await application.update({
        STATUS: 'Rejected',
        REC_ST: 'REJECTED',
        COMMENTS: comments || '',
        LAST_UPDATED: new Date(),
        REJECTED_BY: rejectedBy,
        REJECTION_DATE: new Date(),
        APPROVED_BY: null,
        APPROVAL_DATE: null,
        updated_at: new Date()
      }, { transaction });

      // FIXED: Update CustomerAccount if exists - use account_number instead of ACCT_NO
      const customerAccount = await CustomerAccount.findOne({
        where: {
          customer_id: normalizedCUST_ID,
          account_number: String(ACCT_NO), // Use account_number field
        },
        attributes: ['id', 'account_number', 'customer_id', 'status', 'REC_ST'],
        transaction
      });

      if (customerAccount) {
        await customerAccount.update({
          status: 'Rejected',
          substatus: 'Rejected',
          REC_ST: 'REJECTED',
          last_updated: new Date()
        }, { transaction });
      }

      // Update workflow if exists
      try {
        await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
          'DepositAccountApplication',
          normalizedCUST_ID,
          rejectedBy,
          comments || 'Application Rejected',
          transaction
        );
      } catch (wfError) {
        console.warn('⚠️ Workflow update error:', wfError.message);
      }

      // Audit Trail
      try {
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: rejectedBy,
          event_type: 'DepositAccountApplication',
          action: 'Reject Application',
          old_value: JSON.stringify({ STATUS: application.STATUS, REC_ST: application.REC_ST }),
          new_value: JSON.stringify({ STATUS: 'Rejected', REC_ST: 'REJECTED' }),
          ip_address: req.ip || 'unknown',
          timestamp: new Date(),
          entity_type: 'DepositAccountApplication',
          entity_id: application.id,
          additional_info: JSON.stringify({ comments: comments || '', account_number: ACCT_NO }),
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction });
      } catch (auditError) {
        console.warn('⚠️ Audit trail error:', auditError.message);
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: 'Application rejected successfully',
        application: application,
        timestamp: new Date(),
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Rejection processing error:', {
        message: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Error rejecting application',
        error: error.message,
        code: 'PROCESSING_ERROR',
        timestamp: new Date(),
      });
    }
  },

  updateApplication: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      const { CUST_ID } = req.params;
      const { IMAGE, DOCUMENT, BANK_MANDATE, ACCT_NO, ...safeUpdates } = req.body;

      if (!CUST_ID) {
        await transaction.rollback();
        return res.status(400).json({
          message: 'CUST_ID is required.',
          code: 'MISSING_CUST_ID'
        });
      }

      // Build query - if ACCT_NO is provided, use both CUST_ID and ACCT_NO
      const where = { CUST_ID: Number(String(CUST_ID).replace(/^0+/, '')) };
      if (ACCT_NO) {
        where.ACCT_NO = String(ACCT_NO);
      }

      // Find the application first to check if it exists
      const existingApplication = await DepositAccountApplication.findOne({
        where,
        transaction
      });
      
      if (!existingApplication) {
        await transaction.rollback();
        return res.status(404).json({
          message: ACCT_NO
            ? `Application not found for CUST_ID ${CUST_ID} and account number ${ACCT_NO}`
            : `Application not found for CUST_ID ${CUST_ID}`,
          code: 'APPLICATION_NOT_FOUND'
        });
      }

      // Handle file uploads if new files are provided
      let cloudinaryUpdates = {};
      if (req.files) {
        console.log('📁 Files received for update:', {
          hasFiles: !!req.files,
          filesKeys: req.files ? Object.keys(req.files) : 'No files'
        });

        // Enhanced file extraction logic (same as createApplication)
        const extractFile = (fileKey) => {
          if (req.files[fileKey]) {
            return Array.isArray(req.files[fileKey]) ? req.files[fileKey][0] : req.files[fileKey];
          }
          if (req.files.files && req.files.files[fileKey]) {
            return Array.isArray(req.files.files[fileKey]) ? req.files.files[fileKey][0] : req.files.files[fileKey];
          }
          if (Array.isArray(req.files)) {
            const file = req.files.find(f => f.fieldname === fileKey);
            if (file) return file;
          }
          return null;
        };

        // Upload helper function (same as createApplication)
        const upload = async (file, folder, fileType) => {
          try {
            console.log(`📤 Uploading ${fileType} for update:`, {
              name: file.name,
              size: file.size,
              mimetype: file.mimetype
            });

            let filePath;
            if (file.tempFilePath) {
              filePath = file.tempFilePath;
            } else if (file.path) {
              filePath = file.path;
            } else if (file.filepath) {
              filePath = file.filepath;
            } else {
              if (file.data) {
                const result = await cloudinaryV2.uploader.upload(`data:${file.mimetype};base64,${file.data.toString('base64')}`, {
                  folder: `PEOPLE CHOICE BANKING DOCUMENT/${folder}`,
                  resource_type: 'auto'
                });
                if (!result?.secure_url) throw new Error(`Cloudinary upload failed for ${fileType}`);
                console.log(`✅ ${fileType} uploaded via buffer:`, result.secure_url);
                return result.secure_url;
              } else {
                throw new Error(`No file path or data available for ${fileType}`);
              }
            }

            const result = await cloudinaryV2.uploader.upload(filePath, {
              folder: `PEOPLE CHOICE BANKING DOCUMENT/${folder}`,
              resource_type: 'auto'
            });

            if (!result?.secure_url) throw new Error(`Cloudinary upload failed for ${fileType}`);
            console.log(`✅ ${fileType} uploaded:`, result.secure_url);
            return result.secure_url;
          } catch (uploadError) {
            console.error(`❌ Cloudinary upload error for ${fileType}:`, uploadError);
            throw new Error(`File upload failed for ${fileType}: ${uploadError.message}`);
          }
        };

        // Upload files that are provided
        const uploadPromises = [];

        const imageFile = extractFile('IMAGE');
        if (imageFile) {
          uploadPromises.push(upload(imageFile, 'IMAGE', 'IMAGE').then(url => {
            cloudinaryUpdates.IMAGE = url;
          }));
        }

        const documentFile = extractFile('DOCUMENT');
        if (documentFile) {
          uploadPromises.push(upload(documentFile, 'DOCUMENT', 'DOCUMENT').then(url => {
            cloudinaryUpdates.DOCUMENT = url;
          }));
        }

        const bankMandateFile = extractFile('BANK_MANDATE');
        if (bankMandateFile) {
          uploadPromises.push(upload(bankMandateFile, 'BANK_MANDATE', 'BANK_MANDATE').then(url => {
            cloudinaryUpdates.BANK_MANDATE = url;
          }));
        }

        // Wait for all uploads to complete
        if (uploadPromises.length > 0) {
          await Promise.all(uploadPromises);
          console.log('✅ All file uploads completed for update');
        }
      }

      // Prepare update data
      const updateData = {
        ...safeUpdates,
        ...cloudinaryUpdates,
        LAST_UPDATED: new Date(),
        updated_at: new Date()
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      console.log('🔄 Updating application with data:', updateData);

      // Update the application
      await existingApplication.update(updateData, { transaction });

      // If ACCT_NO is being updated and a CustomerAccount exists, update it too
      if (safeUpdates.ACCT_NO && existingApplication.ACCT_NO !== safeUpdates.ACCT_NO) {
        // FIXED: Use account_number instead of ACCT_NO in where clause
        const existingAccount = await CustomerAccount.findOne({
          where: {
            customer_id: existingApplication.CUST_ID,
            account_number: existingApplication.ACCT_NO // Use account_number field
          },
          attributes: ['id', 'account_number', 'customer_id'],
          transaction
        });

        if (existingAccount) {
          console.log('🔄 Updating CustomerAccount account_number to match application...');
          await existingAccount.update({
            account_number: String(safeUpdates.ACCT_NO),
            last_updated: new Date()
          }, { transaction });
          console.log('✅ CustomerAccount account_number updated');
        }
      }

      // Update other fields in CustomerAccount if they exist
      const accountUpdates = {};
      if (safeUpdates.ACCT_NM) accountUpdates.ACCT_NM = safeUpdates.ACCT_NM;
      if (safeUpdates.ACCOUNT_TYPE) accountUpdates.ACCOUNT_TYPE = safeUpdates.ACCOUNT_TYPE;
      if (safeUpdates.PROD_ID) {
        accountUpdates.product = String(safeUpdates.PROD_ID);
        accountUpdates.productCode = String(safeUpdates.PROD_ID);
      }
      if (safeUpdates.BU_ID) accountUpdates.branch = parseInt(String(safeUpdates.BU_ID).padStart(3, '0'), 10);

      if (Object.keys(accountUpdates).length > 0) {
        // FIXED: Use account_number instead of ACCT_NO in where clause
        const customerAccount = await CustomerAccount.findOne({
          where: {
            customer_id: existingApplication.CUST_ID,
            account_number: safeUpdates.ACCT_NO || existingApplication.ACCT_NO // Use account_number field
          },
          attributes: ['id', 'account_number', 'customer_id', 'ACCT_NM', 'ACCOUNT_TYPE', 'product', 'productCode', 'branch'],
          transaction
        });

        if (customerAccount) {
          console.log('🔄 Updating CustomerAccount fields:', accountUpdates);
          await customerAccount.update({
            ...accountUpdates,
            last_updated: new Date()
          }, { transaction });
          console.log('✅ CustomerAccount fields updated');
        }
      }

      // Get updated application
      const updatedApplication = await DepositAccountApplication.findByPk(existingApplication.id, { transaction });

      // Audit trail
      try {
        await AuditLogger.info('Deposit account application updated', {
          entity_type: 'DEPOSIT_APPLICATION',
          entity_id: updatedApplication.id,
          user_id: safeUpdates.USER_ID || req.headers['x-user-id'] || 'unknown',
          action: 'UPDATE_APPLICATION',
          ip_address: req.ip,
          updated_fields: Object.keys(updateData)
        }, { transaction });
        console.log('✅ Audit trail created for update');
      } catch (auditError) {
        console.warn('⚠️ Audit trail creation failed:', auditError.message);
      }

      await transaction.commit();
      console.log('✅ Application update transaction committed successfully');

      return res.status(200).json({
        success: true,
        message: 'Application updated successfully',
        data: updatedApplication
      });
    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error updating application:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        success: false,
        message: 'Error updating application details',
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  },

  deleteApplication: async (req, res) => {
    try {
      const { id } = req.params;

      const deletedApplication = await DepositAccountApplication.findByPk(id);
      
      if (!deletedApplication) {
        return res.status(404).json({ message: 'Application not found.', code: 'APPLICATION_NOT_FOUND' });
      }

      await deletedApplication.destroy();

      return res.status(200).json({
        message: 'Application deleted successfully',
        data: deletedApplication
      });
    } catch (error) {
      console.error('❌ Error deleting application:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        message: 'Error deleting application',
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  },

  uploadFileAndUpdateStatus: async (req, res) => {
    try {
      const { CUST_NO, STATUS } = req.body;

      if (!req.files || !req.files.IMAGE || !req.files.DOCUMENT || !req.files.BANK_MANDATE) {
        return res.status(400).json({ message: 'IMAGE, DOCUMENT, and BANK_MANDATE files are required.', code: 'MISSING_FILES' });
      }

      const imageFile = req.files.IMAGE;
      const documentFile = req.files.DOCUMENT;
      const bankmandateFile = req.files.BANK_MANDATE;

      if (imageFile.size > 10 * 1024 * 1024 || documentFile.size > 10 * 1024 * 1024 || bankmandateFile.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: 'File size exceeds 10 MB limit.', code: 'FILE_SIZE_EXCEEDED' });
      }

      let imageResult, documentResult, bankmandateResult;
      try {
        imageResult = await cloudinaryV2.uploader.upload(imageFile.tempFilePath, {
          folder: 'PEOPLE CHOICE BANKING DOCUMENT/IMAGE'
        });
        console.log('Image upload result:', imageResult);
      } catch (error) {
        console.error('Error uploading image:', error);
        throw error;
      }

      try {
        documentResult = await cloudinaryV2.uploader.upload(documentFile.tempFilePath, {
          folder: 'PEOPLE CHOICE BANKING DOCUMENT/DOCUMENT'
        });
        console.log('Document upload result:', documentResult);
      } catch (error) {
        console.error('Error uploading document:', error);
        throw error;
      }

      try {
        bankmandateResult = await cloudinaryV2.uploader.upload(bankmandateFile.tempFilePath, {
          folder: 'PEOPLE CHOICE BANKING DOCUMENT/DOCUMENT'
        });
        console.log('Bank mandate upload result:', bankmandateResult);
      } catch (error) {
        console.error('Error uploading bank mandate:', error);
        throw error;
      }

      const [updatedRows] = await DepositAccountApplication.update(
        {
          IMAGE: imageResult.secure_url,
          DOCUMENT: documentResult.secure_url,
          BANK_MANDATE: bankmandateResult.secure_url,
          STATUS: STATUS === 'APPROVED' ? 'Active' : 'pending',
          updated_at: new Date()
        },
        {
          where: { CUST_ID: CUST_NO },
          returning: true
        }
      );

      if (updatedRows === 0) {
        return res.status(404).json({ message: 'Application not found.', code: 'APPLICATION_NOT_FOUND' });
      }

      const updatedApplication = await DepositAccountApplication.findOne({
        where: { CUST_ID: CUST_NO }
      });

      return res.status(200).json({
        message: 'Application updated successfully',
        data: updatedApplication
      });
    } catch (error) {
      console.error('❌ Error uploading file and updating status:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        message: 'Error uploading file and updating status',
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR'
      });
    }
  }
};

export default DepositAccountApplicationController;