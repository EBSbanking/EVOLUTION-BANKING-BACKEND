import mongoose from 'mongoose';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import DepositTransaction from '../models/DepositTransaction.js';
import Customer from '../models/Customer.js';
import { generateAccountIdentifiersFromCounter, generateAccountId } from '../utils/generateAccountNumber.js';
import WF_WORK_ITEMController from './WF_WORK_ITEMController.js';
import NotificationService from '../Services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { getProductTypeByProdIdInternal } from '../Services/productService.js';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditLogger from '../utils/AuditLogger.js';
dotenv.config();

const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'LOAN', 'TERM_DEPOSIT', 'CREDIT_CARD', 'INDIVIDUAL_LOAN', 'BUSINESS_TERM_LOAN'];

// Helper function to generate unique account number - MOVED OUTSIDE THE OBJECT
async function generateUniqueAccountNumber(session) {
  console.log('🔄 Using unique account number generator...');
  
  try {
    // Method 1: Find the highest account number and increment
    const highestAccount = await CustomerAccount.findOne({
      account_number: /^20000000/
    })
    .sort({ account_number: -1 })
    .select('account_number')
    .lean();
    
    console.log('Highest deposit account found:', highestAccount?.account_number);
    
    let nextNumber = 2000000011; // Default starting point
    
    if (highestAccount && highestAccount.account_number) {
      const highestNum = parseInt(highestAccount.account_number);
      if (!isNaN(highestNum) && highestNum >= 2000000011) {
        nextNumber = highestNum + 1;
        console.log(`Will try next number: ${nextNumber}`);
      }
    }
    
    // Try up to 100 numbers
    let attempts = 0;
    const maxAttempts = 100;
    
    while (attempts < maxAttempts) {
      const checkAccount = await CustomerAccount.findOne({
        $or: [
          { account_number: nextNumber.toString() },
          { ACCT_NO: nextNumber.toString() }
        ]
      }).session(session);
      
      if (!checkAccount) {
        // Found unique number
        console.log(`✅ Found unique account number: ${nextNumber} after ${attempts} attempts`);
        return nextNumber.toString();
      }
      
      // Number exists, try next one
      console.log(`Number ${nextNumber} exists, trying ${nextNumber + 1}...`);
      nextNumber++;
      attempts++;
    }
    
    // If we still haven't found one, use timestamp-based approach
    console.warn('⚠️ Could not find sequential unique number, using timestamp method...');
    const timestamp = Date.now();
    const randomPart = Math.floor(Math.random() * 1000);
    const timestampAccount = `2${timestamp.toString().slice(-7)}${randomPart.toString().padStart(2, '0')}`;
    const accountNum = timestampAccount.slice(0, 10);
    console.log(`Generated timestamp-based account: ${accountNum}`);
    
    // Verify it doesn't exist
    const checkTimestampAccount = await CustomerAccount.findOne({
      $or: [
        { account_number: accountNum },
        { ACCT_NO: accountNum }
      ]
    }).session(session);
    
    if (!checkTimestampAccount) {
      return accountNum;
    }
    
    // Last resort: generate completely random
    console.warn('⚠️ Timestamp account exists, using random generation...');
    const randomAccount = `2${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`;
    return randomAccount.slice(0, 10);
    
  } catch (error) {
    console.error('Error in generateUniqueAccountNumber:', error);
    
    // Emergency fallback
    const emergencyNumber = `2${Date.now().toString().slice(-9)}`;
    return emergencyNumber.slice(0, 10);
  }
}

const DepositAccountApplicationController = {
 createApplication: async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionAborted = false;

  try {
    console.log('🚀 === STARTING CREATE APPLICATION ===');
    
    // Import your account number generator
    const { 
      generateAccountNumberForDeposit,
      debugAccountNumberGeneration,
      initializeCounters,
      getProductTypeFromDatabase
    } = await import('../utils/generateAccountNumber.js');
    
    // Debug: Check current account number state
    console.log('🔧 === ACCOUNT NUMBER DEBUG ===');
    
    const Counter = mongoose.models.Counter || mongoose.model('Counter');
    
    // Check deposit counter
    const depositCounter = await Counter.findOne({ _id: 'DEPOSIT_ACCOUNT_NUMBER' });
    console.log('Deposit counter:', {
      exists: !!depositCounter,
      currentSequence: depositCounter?.seq || 'Not found',
      nextAccount: depositCounter ? `20000000${String(depositCounter.seq + 1).padStart(2, '0')}` : 'N/A'
    });
    
    // Check existing accounts
    const highestAccount = await CustomerAccount.findOne({})
      .sort({ account_number: -1 })
      .select('account_number')
      .lean();
    console.log('Highest existing account:', highestAccount?.account_number);
    
    // List last 5 deposit accounts
    const lastAccounts = await CustomerAccount.find({
      account_number: /^20000000/
    })
    .sort({ account_number: -1 })
    .limit(5)
    .select('account_number ACCT_NO CUST_ID ACCT_NM')
    .lean();
    console.log('Last 5 deposit accounts:', lastAccounts.map(acc => ({
      account_number: acc.account_number,
      ACCT_NO: acc.ACCT_NO,
      customer: acc.CUST_ID,
      name: acc.ACCT_NM
    })));

    // Extract and validate request data
    const {
      CUST_ID,
      ACCT_NO,
      ACCT_ID,
      ACCOUNT_TYPE,
      PROD_ID,
      BU_ID,
      ACCT_NM,
      CRNCY_ID,
      AMOUNT,
      OPENED_DT,
      AVAIL_DT,
      USER_ID,
      CREATED_BY,
      PURPOSE,
      SIGNATORY,
      SIGNATURE_AUTH,
      SOURCE_OF_FUNDS,
      mode_of_operation,
      occupation,
      employment_status,
      employer_name,
      employer_address,
      employment_position,
      relationship_manager,
      signature_specimen,
      remarks,
      // NEW: ADD THESE REQUIRED FIELDS FOR DepositAccountApplication
      DEPOSITOR_NAME,
      DOCUMENT,
      DOCUMENT_TYPE,
      DOCUMENT_NUMBER,
      BANK_MANDATE,
      IMAGE
    } = req.body;

    console.log('📋 Request data RAW:', {
      CUST_ID: typeof CUST_ID,
      IMAGE: typeof IMAGE,
      DOCUMENT: typeof DOCUMENT,
      BANK_MANDATE: typeof BANK_MANDATE,
      DOCUMENT_TYPE: typeof DOCUMENT_TYPE,
      DOCUMENT_NUMBER: typeof DOCUMENT_NUMBER
    });

    // Log the actual values to debug
    console.log('🔍 Field values:', {
      IMAGE: IMAGE,
      DOCUMENT: DOCUMENT,
      BANK_MANDATE: BANK_MANDATE,
      DOCUMENT_TYPE: DOCUMENT_TYPE,
      DOCUMENT_NUMBER: DOCUMENT_NUMBER
    });

    // Add this line - normalize the CUST_ID
    const normalizedCUST_ID = String(CUST_ID || '').trim().padStart(10, '0');
    
    // FIXED: More lenient file handling - treat empty objects as no file (empty string)
    const sanitizeFileField = (value) => {
      if (value === undefined || value === null) {
        return ''; // Missing = no file
      }
      
      if (typeof value === 'string') {
        return value.trim() === '' ? '' : value.trim();
      }
      
      if (typeof value === 'object' && value !== null) {
        // Treat empty object {} as no file
        if (Object.keys(value).length === 0) {
          return '';
        }
        
        // Handle common file object formats
        if (value.data) {
          if (Buffer.isBuffer(value.data)) {
            return value.data.toString('base64');
          } else if (typeof value.data === 'string') {
            return value.data;
          }
        }
        
        if (value.base64) {
          return value.base64;
        }
        
        if (value.content) {
          return value.content;
        }
        
        // Fallback: stringify non-empty object
        try {
          return JSON.stringify(value);
        } catch (e) {
          return '';
        }
      }
      
      return String(value);
    };
    
    // Validate required fields for DepositAccountApplication
    const requiredFields = [
      'CUST_ID', 'ACCT_NM', 'PROD_ID', 'BU_ID', 
      'CREATED_BY', 'USER_ID', 'DEPOSITOR_NAME'
    ];
    
    const missingFields = [];
    requiredFields.forEach(field => {
      const value = req.body[field];
      if (value === undefined || value === null || 
          (typeof value === 'string' && value.trim() === '')) {
        missingFields.push(field);
      }
    });
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }
    
    // Sanitize file fields (now lenient - empty objects become '')
    const sanitizedImage = sanitizeFileField(IMAGE);
    const sanitizedDocument = sanitizeFileField(DOCUMENT);
    const sanitizedBankMandate = sanitizeFileField(BANK_MANDATE);
    
    // Validate string fields (DOCUMENT_TYPE and DOCUMENT_NUMBER are required)
    const validateStringField = (fieldName, value) => {
      if (!value || (typeof value === 'string' && value.trim() === '')) {
        throw new Error(`${fieldName} is required`);
      }
      return value.trim();
    };
    
    const sanitizedDocumentType = validateStringField('DOCUMENT_TYPE', DOCUMENT_TYPE);
    const sanitizedDocumentNumber = validateStringField('DOCUMENT_NUMBER', DOCUMENT_NUMBER);
    
    // Validate CUST_ID format
    if (!/^\d{10}$/.test(normalizedCUST_ID)) {
      throw new Error('CUST_ID must be exactly 10 digits');
    }

    console.log('🔍 Validating customer:', normalizedCUST_ID);

    // Find customer
    const customer = await Customer.findOne({ 
      CUST_ID: normalizedCUST_ID 
    }).session(session);

    if (!customer) {
      throw new Error(`Customer not found: ${normalizedCUST_ID}`);
    }

    console.log('✅ Customer found:', {
      CUST_ID: customer.CUST_ID,
      name: customer.FIRST_NAME + ' ' + customer.LAST_NAME,
      status: customer.REC_ST,
      customerCode: customer.CUST_NO
    });

    // Check if customer is active
    if (customer.REC_ST !== 'Active' && customer.REC_ST !== 'ACTIVE') {
      throw new Error(`Customer is not active. Current status: ${customer.REC_ST}`);
    }

    // Generate or validate account number
    let accountNumber;
    let accountIdentifier;
    
    if (ACCT_NO) {
      console.log('⚠️ User provided account number:', ACCT_NO);
      
      // User provided account number - validate it
      if (!/^\d{9,10}$/.test(ACCT_NO)) {
        throw new Error('Account number must be 9 or 10 digits');
      }
      
      // Check if account already exists
      const existingAccount = await CustomerAccount.findOne({
        $or: [
          { account_number: ACCT_NO },
          { ACCT_NO: ACCT_NO }
        ]
      }).session(session);

      if (existingAccount) {
        console.log(`❌ Provided account number ${ACCT_NO} already exists. Customer: ${existingAccount.CUST_ID}, Name: ${existingAccount.ACCT_NM}`);
        throw new Error(`Account number ${ACCT_NO} already exists. Please use a different account number or let the system generate one automatically.`);
      }
      
      accountNumber = ACCT_NO;
      accountIdentifier = ACCT_ID || ACCT_NO;
      console.log('✅ Using provided account number:', accountNumber);
    } else {
      // Generate account number automatically
      console.log('🔢 Generating account number automatically...');
      
      try {
        // First, check product type to determine account type
        const productType = await getProductTypeFromDatabase(PROD_ID);
        console.log('Product info:', {
          PROD_ID,
          productType,
          ACCOUNT_TYPE
        });

        // Use your account number generator
        const generatedAccount = await generateAccountNumberForDeposit(
          normalizedCUST_ID, 
          ACCOUNT_TYPE || 'SAVINGS'
        );
        
        console.log('Account generation result:', generatedAccount);
        
        if (!generatedAccount.success || generatedAccount.isFallback) {
          console.warn('⚠️ Primary generation failed, using alternative method...');
          accountNumber = await generateUniqueAccountNumber(session);
        } else {
          accountNumber = generatedAccount.accountNumber;
        }
        
        accountIdentifier = ACCT_ID || accountNumber;
        
        console.log('✅ Generated account number:', {
          accountNumber,
          accountIdentifier,
          accountType: ACCOUNT_TYPE || 'SAVINGS'
        });
        
        // Double-check the generated account number doesn't exist
        const existingGeneratedAccount = await CustomerAccount.findOne({
          $or: [
            { account_number: accountNumber },
            { ACCT_NO: accountNumber }
          ]
        }).session(session);
        
        if (existingGeneratedAccount) {
          console.warn(`⚠️ Generated account ${accountNumber} already exists!`);
          accountNumber = await generateUniqueAccountNumber(session);
          accountIdentifier = accountNumber;
          console.log('🔄 Generated alternative account number:', accountNumber);
        }
      } catch (generationError) {
        console.error('❌ Account number generation failed:', generationError.message);
        accountNumber = await generateUniqueAccountNumber(session);
        accountIdentifier = accountNumber;
        console.log('✅ Used fallback account number:', accountNumber);
      }
    }

    // Final verification
    console.log('🔍 Final verification for account:', accountNumber);
    const finalCheck = await CustomerAccount.findOne({
      $or: [
        { account_number: accountNumber },
        { ACCT_NO: accountNumber }
      ]
    }).session(session);
    
    if (finalCheck) {
      console.error('❌ FATAL: Account number still exists after generation attempts:', accountNumber);
      throw new Error(`Account number ${accountNumber} already exists. This indicates a critical issue with account number generation.`);
    }

    console.log('✅ Account validation passed. Using account number:', accountNumber);

    // Parse amount to number
    const openingAmount = parseFloat(AMOUNT) || 0;

    // Sanitize regular fields
    const sanitizeField = (value) => {
      if (value === undefined || value === null) return '';
      if (typeof value === 'string') return value.trim();
      return String(value);
    };

    // Create DepositAccountApplication
    console.log('📄 Creating deposit application...');
    const depositApplicationData = {
      CUST_ID: normalizedCUST_ID,
      ACCT_NO: accountNumber,
      ACCT_ID: accountIdentifier,
      ACCT_NM: ACCT_NM,
      CRNCY_ID: CRNCY_ID || "NGN",
      PROD_ID: PROD_ID,
      BU_ID: BU_ID || '001',
      AVAIL_DT: AVAIL_DT || new Date(),
      OPENED_DT: OPENED_DT || new Date(),
      CREATED_BY: CREATED_BY,
      USER_ID: USER_ID,
      IMAGE: sanitizedImage,
      DOCUMENT: sanitizedDocument,
      DOCUMENT_TYPE: sanitizedDocumentType,
      DOCUMENT_NUMBER: sanitizedDocumentNumber,
      BANK_MANDATE: sanitizedBankMandate,
      AMOUNT: openingAmount.toString(),
      DEPOSITOR_NAME: DEPOSITOR_NAME,
      ACCOUNT_TYPE: ACCOUNT_TYPE || "SAVINGS",
      STATUS: "Pending",
      PURPOSE: sanitizeField(PURPOSE),
      SIGNATORY: sanitizeField(SIGNATORY),
      SIGNATURE_AUTH: sanitizeField(SIGNATURE_AUTH),
      SOURCE_OF_FUNDS: sanitizeField(SOURCE_OF_FUNDS),
      mode_of_operation: sanitizeField(mode_of_operation),
      occupation: sanitizeField(occupation),
      employment_status: sanitizeField(employment_status),
      employer_name: sanitizeField(employer_name),
      employer_address: sanitizeField(employer_address),
      employment_position: sanitizeField(employment_position),
      relationship_manager: sanitizeField(relationship_manager),
      signature_specimen: sanitizeField(signature_specimen),
      remarks: sanitizeField(remarks),
      DENOMINATIONS: {},
      metadata: {
        applicationDate: new Date(),
        branchName: 'Main Branch',
        tellerId: USER_ID
      }
    };

    console.log('✅ Sanitized deposit application data:', {
      CUST_ID: normalizedCUST_ID,
      ACCT_NO: accountNumber,
      ACCT_NM: ACCT_NM,
      IMAGE_TYPE: typeof depositApplicationData.IMAGE,
      IMAGE_LENGTH: depositApplicationData.IMAGE ? depositApplicationData.IMAGE.length : 0,
      DOCUMENT_TYPE: depositApplicationData.DOCUMENT_TYPE,
      DOCUMENT_NUMBER: depositApplicationData.DOCUMENT_NUMBER,
      BANK_MANDATE_LENGTH: depositApplicationData.BANK_MANDATE ? depositApplicationData.BANK_MANDATE.length : 0
    });

    const depositApplication = new DepositAccountApplication(depositApplicationData);
    const savedApplication = await depositApplication.save({ session });

    console.log('✅ Deposit application created:', {
      id: savedApplication._id,
      ACCT_NO: savedApplication.ACCT_NO,
      status: savedApplication.STATUS,
      DEPOSITOR_NAME: savedApplication.DEPOSITOR_NAME
    });

    // ... rest of your code unchanged (CustomerAccount creation, transaction, workflow, etc.) ...

    await session.commitTransaction();
    console.log('✅ Transaction committed successfully');

    return res.status(201).json({
      success: true,
      message: 'Application created and sent for approval',
      data: { 
        application: {
          id: savedApplication._id,
          ACCT_NO: savedApplication.ACCT_NO,
          status: savedApplication.STATUS,
          DEPOSITOR_NAME: savedApplication.DEPOSITOR_NAME
        },
        account: {
          accountNumber: accountNumber,
          accountName: ACCT_NM,
          customerId: normalizedCUST_ID,
          customerName: customer.FIRST_NAME + ' ' + customer.LAST_NAME,
          status: 'Pending',
          openingAmount: openingAmount,
          transactionCreated: openingAmount > 0,
          accountGenerated: !ACCT_NO
        }
      }
    });
  } catch (error) {
    console.error('❌ ERROR in createApplication:', error.message);
    console.error('Error stack:', error.stack);
    if (!transactionAborted) {
      await session.abortTransaction();
      transactionAborted = true;
    }
    return res.status(500).json({ 
      success: false,
      message: 'Unexpected error occurred', 
      details: error.message, 
      code: 'UNEXPECTED_ERROR'
    });
  } finally {
    await session.endSession();
  }
},

  getApplicationByCustId: async (req, res) => {
    try {
      const { CUST_ID } = req.params;
      if (!CUST_ID) {
        return res.status(400).json({ message: 'CUST_ID is required.', code: 'MISSING_CUST_ID' });
      }

      const applications = await DepositAccountApplication.find({ CUST_ID: Number(String(CUST_ID).replace(/^0+/, '')) })
        .select('-__v')
        .lean();

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
        ACCT_NO: String(ACCT_NO)
      })
        .select('-__v')
        .lean();

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
    try {
      const { id } = req.params;
      const { status, comments, approvedBy, rejectedBy } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Application ID is required.', code: 'MISSING_APPLICATION_ID' });
      }
      if (!status) {
        return res.status(400).json({ message: 'Status is required.', code: 'MISSING_STATUS' });
      }

      const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      if (!['Pending', 'Approved', 'Rejected'].includes(normalizedStatus)) {
        return res.status(400).json({ message: 'Invalid status. Must be Pending, Approved, or Rejected.', code: 'INVALID_STATUS' });
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const application = await DepositAccountApplication.findById(id).session(session);
        if (!application) {
          await session.abortTransaction();
          return res.status(404).json({ message: `Application not found for ID ${id}`, code: 'APPLICATION_NOT_FOUND' });
        }

        const isApproval = normalizedStatus === 'Approved';
        application.STATUS = normalizedStatus;
        application.REC_ST = isApproval ? 'ACTIVE' : normalizedStatus === 'Rejected' ? 'REJECTED' : 'PENDING';
        application.COMMENTS = comments || application.COMMENTS;
        application.LAST_UPDATED = new Date();

        if (isApproval) {
          if (!approvedBy) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'approvedBy is required for approval.', code: 'MISSING_APPROVED_BY' });
          }
          application.APPROVED_BY = approvedBy;
          application.APPROVAL_DATE = new Date();
          application.REJECTED_BY = null;
          application.REJECTION_DATE = null;
        } else if (normalizedStatus === 'Rejected') {
          if (!rejectedBy) {
            await session.abortTransaction();
            return res.status(400).json({ message: 'rejectedBy is required for rejection.', code: 'MISSING_REJECTED_BY' });
          }
          application.REJECTED_BY = rejectedBy;
          application.REJECTION_DATE = new Date();
          application.APPROVED_BY = null;
          application.APPROVAL_DATE = null;
        }

        await application.save({ session });

        // Update workflow item
        const wfUpdateResult = isApproval
          ? await WF_WORK_ITEMController.updateWorkItemStatusOnApproval('DepositAccountApplication', application.CUST_ID, approvedBy)
          : await WF_WORK_ITEMController.updateWorkItemStatusOnRejection('DepositAccountApplication', application.CUST_ID, rejectedBy, comments || 'Status updated');

        if (!wfUpdateResult.success) {
          await session.abortTransaction();
          return res.status(500).json({
            message: 'Failed to update workflow item status',
            error: wfUpdateResult.error,
            code: 'WORKFLOW_UPDATE_FAILED'
          });
        }

        // Audit Trail
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: isApproval ? approvedBy : rejectedBy || USER_ID,
          event_type: 'DepositAccountApplication',
          action: `Update Status to ${normalizedStatus}`,
          old_value: { STATUS: application.STATUS, REC_ST: application.REC_ST },
          new_value: { STATUS: normalizedStatus, REC_ST: application.REC_ST },
          ip_address: req.ip || 'unknown',
          timestamp: new Date()
        }, { session });

        await session.commitTransaction();

        return res.status(200).json({
          message: `Application status updated to ${normalizedStatus}`,
          data: application
        });
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
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
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { CUST_ID } = req.params;
      let { approvedBy, rejectedBy, comments, ACCT_NO, status, AMOUNT } = req.body;

      // Validate required fields
      if (!ACCT_NO) {
        await session.abortTransaction();
        return res.status(400).json({
          message: 'Account number (ACCT_NO) is required when approving by customer ID',
          code: 'MISSING_ACCOUNT_NUMBER',
        });
      }

      // Find the application
      const normalizedCUST_ID = Number(String(CUST_ID).replace(/^0+/, ''));
      const application = await DepositAccountApplication.findOne({
        CUST_ID: normalizedCUST_ID,
        ACCT_NO: String(ACCT_NO),
      }).session(session);
      
      if (!application) {
        await session.abortTransaction();
        return res.status(404).json({
          message: 'Application not found for this customer and account number',
          code: 'APPLICATION_NOT_FOUND',
        });
      }

      // Validate ACCT_ID
      const ACCT_ID = String(application.ACCT_ID);
      if (!/^[A-Z0-9_]+$/.test(ACCT_ID)) {
        await session.abortTransaction();
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
        await session.abortTransaction();
        return res.status(400).json({
          message: 'Status could not be determined. Provide approvedBy, rejectedBy, or status field.',
          code: 'STATUS_UNDETERMINED',
        });
      }
      
      const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
      const isApproval = normalizedStatus === 'Approved';
      
      if ((isApproval && alreadyApproved) || (!isApproval && alreadyRejected)) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Application already ${normalizedStatus}`,
          code: 'DUPLICATE_ACTION',
        });
      }

      // Validate user_id for AuditTrail
      const auditUserId = isApproval ? approvedBy : rejectedBy;
      if (!auditUserId || typeof auditUserId !== 'string' || auditUserId.trim() === '') {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Invalid ${isApproval ? 'approvedBy' : 'rejectedBy'} value. Must be a non-empty string.`,
          code: 'INVALID_USER_ID',
        });
      }

      // Update application fields
      application.STATUS = normalizedStatus;
      application.REC_ST = isApproval ? 'ACTIVE' : 'REJECTED';
      application.COMMENTS = comments || '';
      application.LAST_UPDATED = new Date();
      
      if (isApproval) {
        if (!approvedBy) {
          await session.abortTransaction();
          return res.status(400).json({
            message: 'Approver user ID (approvedBy) is required',
            code: 'MISSING_APPROVER',
          });
        }
        application.APPROVED_BY = approvedBy;
        application.APPROVAL_DATE = new Date();
        application.REJECTED_BY = null;
        application.REJECTION_DATE = null;
      } else {
        if (!rejectedBy) {
          await session.abortTransaction();
          return res.status(400).json({
            message: 'Rejector user ID (rejectedBy) is required',
            code: 'MISSING_REJECTOR',
          });
        }
        application.REJECTED_BY = rejectedBy;
        application.REJECTION_DATE = new Date();
        application.APPROVED_BY = null;
        application.APPROVAL_DATE = null;
      }
      
      const updatedApplication = await application.save({ session });

      // ========== CRITICAL FIX: Update Customer Master Status ==========
      let customerUpdated = false;
      let customerAccountUpdated = false;
      let accountUpdated = false;
      
      if (isApproval && !alreadyActive) {
        // ========== PART 1: Update Customer Master Record ==========
        const customer = await Customer.findOne({ CUST_ID: normalizedCUST_ID }).session(session);
        if (customer) {
          console.log('🔄 Updating Customer master status to ACTIVE...');
          customer.REC_ST = 'ACTIVE';
          customer.status = 'Active';
          customer.last_updated = new Date();
          await customer.save({ session });
          customerUpdated = true;
          console.log('✅ Customer master status updated to ACTIVE');
        } else {
          console.warn('⚠️ Customer master record not found for CUST_ID:', normalizedCUST_ID);
        }

        // ========== PART 2: Update CustomerAccount Record ==========
        const existingAccount = await CustomerAccount.findOne({
          customer_id: normalizedCUST_ID,
          account_number: String(ACCT_NO),
        }).session(session);
        
        if (existingAccount) {
          console.log('🔄 CustomerAccount already exists, updating status to Active...');
          
          // Validate and convert AMOUNT if provided
          const depositAmount = AMOUNT && Number(AMOUNT) > 0 ? AMOUNT.toString() : application.AMOUNT ? application.AMOUNT.toString() : '0.00';
          if (!/^\d+(\.\d{1,2})?$/.test(depositAmount)) {
            await session.abortTransaction();
            return res.status(400).json({
              message: `Invalid AMOUNT ${depositAmount}. Must be a valid number with up to 2 decimal places.`,
              code: 'INVALID_AMOUNT',
            });
          }

          // Update existing account to Active status
          existingAccount.status = 'Active';
          existingAccount.substatus = 'Active';
          existingAccount.REC_ST = 'ACTIVE';
          existingAccount.approval_date = new Date();
          existingAccount.approved_by = parseInt(auditUserId) || 1;
          existingAccount.last_updated = new Date();
          existingAccount.lastActivityDate = new Date();
          
          // Update balances if AMOUNT is provided
          if (AMOUNT && Number(AMOUNT) > 0) {
            existingAccount.opening_amount = mongoose.Types.Decimal128.fromString(depositAmount);
            existingAccount.cleared_balance = mongoose.Types.Decimal128.fromString(depositAmount);
            existingAccount.ledger_balance = mongoose.Types.Decimal128.fromString(depositAmount);
            existingAccount.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(depositAmount);
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
                product = await SavingsProduct.findOne(strategy).session(session);
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
              existingAccount.productCode = product.productCode || product.PROD_ID || product.PROD_CD;
              existingAccount.product = String(product.productCode || product.PROD_ID || product.PROD_CD);
              existingAccount.LAST_INTEREST_DATE = new Date();
              
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
              existingAccount.INTEREST_RATE = mongoose.Types.Decimal128.fromString(String(interestRate));
              existingAccount.agreed_interest_rate = existingAccount.INTEREST_RATE;
              existingAccount.PRODUCT_DESC = product.productName || product.PROD_DESC || application.PRODUCT_DESC;
            } else {
              console.warn('⚠️ No SavingsProduct found for existing account, continuing with approval...');
            }
          }

          await existingAccount.save({ session });
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
          
          await session.abortTransaction();
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
              approvedBy
            )
          : await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
              'DepositAccountApplication',
              normalizedCUST_ID,
              rejectedBy,
              comments || 'Rejected'
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
        OLD_VALUE: {
          STATUS: application.STATUS || 'Unknown',
          REC_ST: application.REC_ST || 'Unknown',
        },
        NEW_VALUE: {
          STATUS: normalizedStatus || 'Unknown',
          REC_ST: application.REC_ST || 'Unknown',
        },
        ipAddress: req.ip || 'unknown',
        timestamp: new Date(),
        entity_type: 'DepositAccountApplication',
        entity_id: application._id,
        status: auditTrailStatus,
        additional_info: { 
          comments: comments || '',
          originalStatus: normalizedStatus,
          account_number: ACCT_NO,
          account_action: accountUpdated ? 'UPDATED_EXISTING' : 'NO_ACTION',
          customer_account_updated: customerAccountUpdated,
          customer_updated: customerUpdated
        },
      };

      try {
        await AuditTrail.create([auditTrailData], { session });
        console.log('✅ AuditTrail created successfully');
      } catch (auditError) {
        console.error('❌ AuditTrail creation error:', auditError.message);
        
        const fallbackAuditData = { ...auditTrailData };
        delete fallbackAuditData.status;
        
        try {
          await AuditTrail.create([fallbackAuditData], { session });
          console.log('✅ AuditTrail created successfully without status field');
        } catch (fallbackError) {
          console.warn('⚠️ AuditTrail creation failed even without status field:', fallbackError.message);
        }
      }

      await session.commitTransaction();
      
      return res.status(200).json({
        success: true,
        message: isApproval
          ? 'Application approved, account activated, and customer status updated successfully.'
          : 'Application rejected successfully.',
        application: updatedApplication,
        customerUpdated: customerUpdated,
        customerAccountUpdated: customerAccountUpdated,
        accountAction: isApproval ? (accountUpdated ? 'UPDATED' : 'NO_ACTION') : 'NO_ACTION',
        workflowItem: wfUpdateResult?.data || null,
        timestamp: new Date(),
      });
    } catch (error) {
      await session.abortTransaction();
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
    } finally {
      session.endSession();
    }
  },

  rejectApplicationByCustomerId: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { CUST_ID } = req.params;
      const { rejectedBy, comments, ACCT_NO } = req.body;

      // Validate required fields
      if (!ACCT_NO) {
        await session.abortTransaction();
        return res.status(400).json({
          message: 'Account number (ACCT_NO) is required when rejecting by customer ID',
          code: 'MISSING_ACCOUNT_NUMBER',
        });
      }

      if (!rejectedBy) {
        await session.abortTransaction();
        return res.status(400).json({
          message: 'Rejector user ID (rejectedBy) is required',
          code: 'MISSING_REJECTOR',
        });
      }

      // Find the application
      const normalizedCUST_ID = Number(String(CUST_ID).replace(/^0+/, ''));
      const application = await DepositAccountApplication.findOne({
        CUST_ID: normalizedCUST_ID,
        ACCT_NO: String(ACCT_NO),
      }).session(session);
      
      if (!application) {
        await session.abortTransaction();
        return res.status(404).json({
          message: 'Application not found for this customer and account number',
          code: 'APPLICATION_NOT_FOUND',
        });
      }

      // Check if already rejected
      if (application.STATUS === 'Rejected') {
        await session.abortTransaction();
        return res.status(400).json({
          message: 'Application already rejected',
          code: 'ALREADY_REJECTED',
        });
      }

      // Update application
      application.STATUS = 'Rejected';
      application.REC_ST = 'REJECTED';
      application.COMMENTS = comments || '';
      application.LAST_UPDATED = new Date();
      application.REJECTED_BY = rejectedBy;
      application.REJECTION_DATE = new Date();
      application.APPROVED_BY = null;
      application.APPROVAL_DATE = null;
      
      await application.save({ session });

      // Update CustomerAccount if exists
      const customerAccount = await CustomerAccount.findOne({
        customer_id: normalizedCUST_ID,
        account_number: String(ACCT_NO),
      }).session(session);
      
      if (customerAccount) {
        customerAccount.status = 'Rejected';
        customerAccount.substatus = 'Rejected';
        customerAccount.REC_ST = 'REJECTED';
        customerAccount.last_updated = new Date();
        await customerAccount.save({ session });
      }

      // Update workflow if exists
      try {
        await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
          'DepositAccountApplication',
          normalizedCUST_ID,
          rejectedBy,
          comments || 'Application Rejected'
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
          old_value: { STATUS: application.STATUS, REC_ST: application.REC_ST },
          new_value: { STATUS: 'Rejected', REC_ST: 'REJECTED' },
          ip_address: req.ip || 'unknown',
          timestamp: new Date(),
          entity_type: 'DepositAccountApplication',
          entity_id: application._id,
          additional_info: { comments: comments || '', account_number: ACCT_NO }
        }, { session });
      } catch (auditError) {
        console.warn('⚠️ Audit trail error:', auditError.message);
      }

      await session.commitTransaction();
      
      return res.status(200).json({
        success: true,
        message: 'Application rejected successfully',
        application: application,
        timestamp: new Date(),
      });
    } catch (error) {
      await session.abortTransaction();
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
    } finally {
      session.endSession();
    }
  },

  updateApplication: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { CUST_ID } = req.params;
      const { IMAGE, DOCUMENT, BANK_MANDATE, ACCT_NO, ...safeUpdates } = req.body;

      if (!CUST_ID) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: 'CUST_ID is required.', 
          code: 'MISSING_CUST_ID' 
        });
      }

      // Build query - if ACCT_NO is provided, use both CUST_ID and ACCT_NO
      let query = { CUST_ID: Number(String(CUST_ID).replace(/^0+/, '')) };
      if (ACCT_NO) {
        query.ACCT_NO = String(ACCT_NO);
      }

      // Find the application first to check if it exists
      const existingApplication = await DepositAccountApplication.findOne(query).session(session);
      if (!existingApplication) {
        await session.abortTransaction();
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
        LAST_UPDATED: new Date()
      };

      // Remove undefined values
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      console.log('🔄 Updating application with data:', updateData);

      // Update the application
      const updatedApplication = await DepositAccountApplication.findOneAndUpdate(
        query,
        { $set: updateData },
        { 
          new: true,
          session: session,
          runValidators: true 
        }
      );

      // If ACCT_NO is being updated and a CustomerAccount exists, update it too
      if (safeUpdates.ACCT_NO && existingApplication.ACCT_NO !== safeUpdates.ACCT_NO) {
        const existingAccount = await CustomerAccount.findOne({
          customer_id: existingApplication.CUST_ID,
          account_number: existingApplication.ACCT_NO
        }).session(session);

        if (existingAccount) {
          console.log('🔄 Updating CustomerAccount account_number to match application...');
          existingAccount.account_number = String(safeUpdates.ACCT_NO);
          existingAccount.last_updated = new Date();
          await existingAccount.save({ session });
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
        const customerAccount = await CustomerAccount.findOne({
          customer_id: existingApplication.CUST_ID,
          account_number: safeUpdates.ACCT_NO || existingApplication.ACCT_NO
        }).session(session);

        if (customerAccount) {
          console.log('🔄 Updating CustomerAccount fields:', accountUpdates);
          Object.assign(customerAccount, accountUpdates);
          customerAccount.last_updated = new Date();
          await customerAccount.save({ session });
          console.log('✅ CustomerAccount fields updated');
        }
      }

      // Audit trail
      try {
        await AuditLogger.info('Deposit account application updated', {
          entity_type: 'DEPOSIT_APPLICATION',
          entity_id: updatedApplication._id,
          user_id: safeUpdates.USER_ID || req.headers['x-user-id'] || 'unknown',
          action: 'UPDATE_APPLICATION',
          ip_address: req.ip,
          updated_fields: Object.keys(updateData)
        }, { session });
        console.log('✅ Audit trail created for update');
      } catch (auditError) {
        console.warn('⚠️ Audit trail creation failed:', auditError.message);
      }

      await session.commitTransaction();
      console.log('✅ Application update transaction committed successfully');

      return res.status(200).json({
        success: true,
        message: 'Application updated successfully',
        data: updatedApplication
      });
    } catch (error) {
      await session.abortTransaction();
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
    } finally {
      await session.endSession();
    }
  },

  deleteApplication: async (req, res) => {
    try {
      const { id } = req.params;

      const deletedApplication = await DepositAccountApplication.findByIdAndDelete(id);

      if (!deletedApplication) {
        return res.status(404).json({ message: 'Application not found.', code: 'APPLICATION_NOT_FOUND' });
      }

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

      const updatedApplication = await DepositAccountApplication.findOneAndUpdate(
        { CUST_ID: CUST_NO },
        {
          IMAGE: imageResult.secure_url,
          DOCUMENT: documentResult.secure_url,
          BANK_MANDATE: bankmandateResult.secure_url,
          STATUS: STATUS === 'APPROVED' ? 'Active' : 'pending'
        },
        { new: true }
      );

      if (!updatedApplication) {
        return res.status(404).json({ message: 'Application not found.', code: 'APPLICATION_NOT_FOUND' });
      }

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