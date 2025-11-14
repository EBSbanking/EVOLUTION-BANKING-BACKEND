import mongoose from 'mongoose';
import { v2 as cloudinaryV2 } from 'cloudinary';
import dotenv from 'dotenv';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import CustomerAccount from '../models/CustomerAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import DepositTransaction from '../models/DepositTransaction.js';
import Customer from '../models/Customer.js';
import { generateAccountIdentifiersFromCounter, generateNUBAN, generateAccountNumberByProdId, generateAccountId } from '../utils/generateAccountNumber.js';
import WF_WORK_ITEMController from './WF_WORK_ITEMController.js';
import NotificationService from '../Services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { getProductTypeByProdIdInternal } from '../Services/productService.js';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditLogger from '../utils/AuditLogger.js'; // Add this import

dotenv.config();

const VALID_ACCOUNT_TYPES = ['SAVINGS', 'CURRENT', 'LOAN', 'TERM_DEPOSIT', 'CREDIT_CARD', 'INDIVIDUAL_LOAN', 'BUSINESS_TERM_LOAN'];

const DepositAccountApplicationController = {
createApplication: async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionAborted = false;

  try {
    const USER_ID = req.body.USER_ID || req.headers['x-user-id'];
    if (!USER_ID) {
      transactionAborted = true;
      await session.abortTransaction();
      return res.status(400).json({ message: 'USER_ID is required to create workflow item', code: 'MISSING_USER_ID' });
    }

    // Safety checks
    if (!cloudinaryV2?.uploader?.upload) throw new Error('Cloudinary uploader not available. Check cloudinary config.');
    if (!DepositAccountApplication) throw new Error('DepositAccountApplication model not available.');
    if (!CustomerAccount) throw new Error('CustomerAccount model not available.');
    if (!Customer) throw new Error('Customer model not available.');

    const {
      CUST_ID, ACCT_NM, CRNCY_ID, PROD_ID, BU_ID,
      AVAIL_DT, OPENED_DT,
      CREATED_BY, DOCUMENT_TYPE,
      DOCUMENT_NUMBER, CREATED_AT, TRANSACTION_DATE,
      AMOUNT, DEPOSITOR_NAME, ACCT_NO: REQUEST_ACCT_NO, ACCT_ID: REQUEST_ACCT_ID,
      DENOMINATIONS, ACCOUNT_TYPE
    } = req.body;

    console.log('📝 Received form data:', {
      CUST_ID, ACCT_NM, CRNCY_ID, PROD_ID, BU_ID,
      AVAIL_DT, OPENED_DT, CREATED_BY, DOCUMENT_TYPE,
      DOCUMENT_NUMBER, AMOUNT, DEPOSITOR_NAME
    });

    // Validate required fields
    if (!CUST_ID || !ACCT_NM || !CRNCY_ID || !PROD_ID || !BU_ID) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'CUST_ID, ACCT_NM, CRNCY_ID, PROD_ID, and BU_ID are required.', 
        code: 'MISSING_REQUIRED_FIELDS' 
      });
    }

    // Validate REQUEST_ACCT_ID if provided
    if (REQUEST_ACCT_ID && !/^\d{6}$/.test(String(REQUEST_ACCT_ID))) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `REQUEST_ACCT_ID ${REQUEST_ACCT_ID} must be exactly 6 digits.`, 
        code: 'INVALID_REQUEST_ACCT_ID' 
      });
    }

    // Debug: Check what files are received
    console.log('📁 Files received:', {
      hasFiles: !!req.files,
      filesKeys: req.files ? Object.keys(req.files) : 'No files',
      filesStructure: req.files ? JSON.stringify(req.files, null, 2) : 'No files'
    });

    // Check if customer exists
    const customer = await Customer.findOne({ CUST_ID: String(CUST_ID) }).session(session);
    if (!customer) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Customer does not exist for CUST_ID ${CUST_ID}`, 
        code: 'CUSTOMER_NOT_FOUND' 
      });
    }

    console.log('✅ Customer found:', {
      CUST_ID: customer.CUST_ID,
      CUST_NM: customer.CUST_NM,
      BU_ID: customer.BU_ID
    });

    const normalizedCUST_ID = Number(String(CUST_ID).replace(/^0+/, ''));

    // Product type
    const mapping = await getProductTypeByProdIdInternal(PROD_ID);
    if (!mapping?.PRODUCT_TYPE) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Invalid or missing product type for PROD_ID ${PROD_ID}`, 
        code: 'INVALID_PRODUCT' 
      });
    }
    const productType = mapping.PRODUCT_TYPE.toUpperCase();

    console.log('✅ Product type:', productType);

    // Existing active account check - Updated to use new schema fields
    const existingAccount = await CustomerAccount.findOne({
      customer_id: normalizedCUST_ID,
      product: String(PROD_ID),
      status: 'Active'
    }).session(session);
    if (existingAccount) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Customer already has a valid ${productType} account with account number: ${existingAccount.account_number}`, 
        code: 'ACCOUNT_ALREADY_EXISTS' 
      });
    }

    // FIXED: Enhanced file upload validation
    if (!req.files) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'No files uploaded. IMAGE, DOCUMENT, and BANK_MANDATE files are required.', 
        code: 'MISSING_FILES' 
      });
    }

    // FIXED: Better file extraction logic
    const extractFile = (fileKey) => {
      // Try different possible file structures
      if (req.files[fileKey]) {
        return Array.isArray(req.files[fileKey]) ? req.files[fileKey][0] : req.files[fileKey];
      }
      
      // Check if files are nested under a 'files' object
      if (req.files.files && req.files.files[fileKey]) {
        return Array.isArray(req.files.files[fileKey]) ? req.files.files[fileKey][0] : req.files.files[fileKey];
      }
      
      // Check if files are in an array format
      if (Array.isArray(req.files)) {
        const file = req.files.find(f => f.fieldname === fileKey);
        if (file) return file;
      }
      
      return null;
    };

    const imageFile = extractFile('IMAGE');
    const documentFile = extractFile('DOCUMENT');
    const bankMandateFile = extractFile('BANK_MANDATE');

    console.log('🔍 Extracted files:', {
      imageFile: imageFile ? { 
        name: imageFile.name, 
        size: imageFile.size, 
        tempFilePath: imageFile.tempFilePath,
        path: imageFile.path,
        filepath: imageFile.filepath
      } : 'NOT FOUND',
      documentFile: documentFile ? { 
        name: documentFile.name, 
        size: documentFile.size, 
        tempFilePath: documentFile.tempFilePath,
        path: documentFile.path,
        filepath: documentFile.filepath
      } : 'NOT FOUND',
      bankMandateFile: bankMandateFile ? { 
        name: bankMandateFile.name, 
        size: bankMandateFile.size, 
        tempFilePath: bankMandateFile.tempFilePath,
        path: bankMandateFile.path,
        filepath: bankMandateFile.filepath
      } : 'NOT FOUND'
    });

    if (!imageFile || !documentFile || !bankMandateFile) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'IMAGE, DOCUMENT, and BANK_MANDATE files are required.', 
        code: 'MISSING_FILES',
        missingFiles: {
          IMAGE: !imageFile,
          DOCUMENT: !documentFile,
          BANK_MANDATE: !bankMandateFile
        },
        availableFiles: Object.keys(req.files)
      });
    }

    // FIXED: Enhanced upload helper with better file path handling
    const upload = async (file, folder, fileType) => {
      try {
        console.log(`📤 Uploading ${fileType}:`, {
          name: file.name,
          size: file.size,
          mimetype: file.mimetype,
          tempFilePath: file.tempFilePath,
          path: file.path,
          filepath: file.filepath
        });

        // FIXED: Handle different file path scenarios
        let filePath;
        
        if (file.tempFilePath) {
          filePath = file.tempFilePath;
          console.log(`✅ Using tempFilePath: ${filePath}`);
        } else if (file.path) {
          filePath = file.path;
          console.log(`✅ Using path: ${filePath}`);
        } else if (file.filepath) {
          filePath = file.filepath;
          console.log(`✅ Using filepath: ${filePath}`);
        } else {
          // If no path is available, try buffer upload
          console.log('⚠️ No file path found, attempting buffer upload...');
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

        // Validate file path exists
        if (!filePath) {
          throw new Error(`File path is undefined for ${fileType}`);
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

    console.log('🚀 Starting file uploads to Cloudinary...');
    
    const [IMAGE, DOCUMENT, BANK_MANDATE] = await Promise.all([
      upload(imageFile, 'IMAGE', 'IMAGE'),
      upload(documentFile, 'DOCUMENT', 'DOCUMENT'),
      upload(bankMandateFile, 'BANK_MANDATE', 'BANK_MANDATE')
    ]);

    console.log('✅ All files uploaded to Cloudinary');

    // Generate identifiers
    let ACCT_NO, ACCT_ID;
    if (['INDIVIDUAL_LOAN', 'TERM_DEPOSIT', 'SAVINGS'].includes(productType)) {
      const accountNumber = await generateAccountNumberByProdId(PROD_ID);
      ACCT_NO = accountNumber.formattedString;
      const rawAcctId = REQUEST_ACCT_ID || await generateAccountId();
      ACCT_ID = String(rawAcctId).padStart(6, '0');
    } else {
      const identifiers = await generateAccountIdentifiersFromCounter('10');
      ACCT_NO = identifiers.ACCT_NO;
      const rawAcctId = REQUEST_ACCT_ID || identifiers.ACCT_ID.replace(/^10/, '');
      ACCT_ID = String(rawAcctId).padStart(6, '0');
    }

    // ✅ Validate ACCT_ID
    if (!/^\d{6}$/.test(ACCT_ID)) {
      await session.abortTransaction();
      throw new Error(`Generated ACCT_ID ${ACCT_ID} is invalid. Must be exactly 6 digits.`);
    }

    console.log('✅ Generated identifiers:', { ACCT_ID, ACCT_NO });

    // Validate denominations if provided
    if (AMOUNT && DEPOSITOR_NAME && DENOMINATIONS) {
      const denominationSum = Object.entries(DENOMINATIONS).reduce((sum, [denom, count]) => sum + Number(denom) * Number(count), 0);
      if (Number(AMOUNT) !== denominationSum) {
        await session.abortTransaction();
        return res.status(400).json({ 
          message: `AMOUNT ${AMOUNT} must match the sum of denominations (${denominationSum})`, 
          code: 'DENOMINATION_MISMATCH' 
        });
      }
    }

    // Save Deposit Application
    const newApp = new DepositAccountApplication({
      CUST_ID: normalizedCUST_ID,
      ACCT_ID,
      ACCT_NO: String(ACCT_NO),
      ACCT_NM,
      CRNCY_ID,
      PROD_ID,
      BU_ID: String(BU_ID).padStart(3, '0'),
      AVAIL_DT,
      OPENED_DT,
      CREATED_BY,
      USER_ID,
      DOCUMENT_TYPE,
      DOCUMENT_NUMBER,
      CREATED_AT: CREATED_AT || Date.now(),
      IMAGE,
      DOCUMENT,
      BANK_MANDATE,
      STATUS: 'Pending',
      DENOMINATIONS,
      ACCOUNT_TYPE: ACCOUNT_TYPE || productType
    });
    
    const savedApplication = await newApp.save({ session });
    console.log('✅ Deposit application saved:', savedApplication._id);

    // UPDATED: Create CustomerAccount with BOTH old and new schema fields for compatibility
    console.log('🔄 Creating CustomerAccount with dual schema support...');
    let savedCustomerAccount = null;
    try {
      const customerAccountData = {
        // === CORE IDENTIFIERS - BOTH SCHEMAS ===
        customer_id: normalizedCUST_ID,
        CUST_ID: normalizedCUST_ID, // Add old schema field for compatibility
        
        account_number: String(ACCT_NO),
        ACCT_NO: String(ACCT_NO), // Old schema field
        ACCT_ID: ACCT_ID,
        
        // === PRODUCT INFORMATION ===
        product_type: (ACCOUNT_TYPE || productType).toLowerCase(),
        product: String(PROD_ID),
        PRODUCT_DESC: `Deposit Account for ${ACCT_NM}`,
        productCode: String(PROD_ID),
        
        // === BRANCH & RELATIONSHIP ===
        branch: parseInt(String(BU_ID).padStart(3, '0'), 10),
        BU_ID: String(BU_ID).padStart(3, '0'),
        primary_relationship_manager: 1,
        
        // === ACCOUNT INFORMATION ===
        ACCOUNT_TYPE: ACCOUNT_TYPE || productType,
        ACCT_NM: ACCT_NM,
        CRNCY_ID: CRNCY_ID,
        currency: CRNCY_ID || 'NGN',
        
        // === BALANCES - Use Decimal128 consistently ===
        opening_amount: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        cleared_balance: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        ledger_balance: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        AVAILABLE_BALANCE: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        
        // === DATES ===
        creation_date: new Date(),
        last_updated: new Date(),
        application_date: new Date(),
        creation_datetime: new Date(),
        lastActivityDate: new Date(),
        OPENED_DT: OPENED_DT || new Date(),
        AVAIL_DT: AVAIL_DT || new Date(),
        
        // === STATUS ===
        status: 'Pending',
        REC_ST: 'N', // Using valid check constraint value
        substatus: 'Pending',
        
        // === USER & CREATION ===
        created_by: parseInt(USER_ID) || 1,
        CREATED_BY: CREATED_BY || USER_ID,
        customer_code: customer.CUST_ID?.toString(),
        
        // === ONLINE & ALERTS ===
        online_enabled: true,
        sms_alert: 'No',
        email_alert: 'No',
        
        // === DEFAULTS ===
        auto_approve: false,
        isfirst: 0,
        disbursement_method: 'Cheque',
        
        // === INTEREST - Use Decimal128 consistently ===
        INTEREST_RATE: mongoose.Types.Decimal128.fromString('0.00'),
        ACCRUED_INTEREST: mongoose.Types.Decimal128.fromString('0.00'),
        agreed_interest_rate: mongoose.Types.Decimal128.fromString('0.00'),
        
        // === TRANSACTION PERMISSIONS ===
        DR_ALLOWED: true,
        CR_ALLOWED: true,
        isOverdraftAllowed: false,
        overdraftLimit: mongoose.Types.Decimal128.fromString('0.00')
      };

      const customerAccount = new CustomerAccount(customerAccountData);
      savedCustomerAccount = await customerAccount.save({ session });
      
      console.log('✅ Customer account created successfully with dual schema:', {
        account_number: savedCustomerAccount.account_number,
        ACCT_NO: savedCustomerAccount.ACCT_NO,
        customer_id: savedCustomerAccount.customer_id,
        CUST_ID: savedCustomerAccount.CUST_ID,
        _id: savedCustomerAccount._id,
        status: savedCustomerAccount.status
      });

      // VERIFY: Immediately check if account can be retrieved with both field names
      const verifiedWithAccountNumber = await CustomerAccount.findOne({
        account_number: String(ACCT_NO)
      }).session(session);

      const verifiedWithACCT_NO = await CustomerAccount.findOne({
        ACCT_NO: String(ACCT_NO)
      }).session(session);

      if (!verifiedWithAccountNumber && !verifiedWithACCT_NO) {
        throw new Error(`CustomerAccount verification failed - account ${ACCT_NO} not found with any field name`);
      }

      console.log('✅ Customer account verified with both field names:', {
        with_account_number: !!verifiedWithAccountNumber,
        with_ACCT_NO: !!verifiedWithACCT_NO
      });

    } catch (accountError) {
      console.error('❌ Customer account creation FAILED:', accountError);
      throw new Error(`Failed to create customer account: ${accountError.message}`);
    }

    // UPDATED: Workflow creation with better error handling
    try {
      const WORK_ITEM_ID = Date.now();
      const EVENT_ID = Date.now() + 1;
      const ITEM_REF_NO = Date.now() + 2;

      const workflowItem = new WF_WORK_ITEM({
        WORK_ITEM_ID: WORK_ITEM_ID,
        EVENT_ID: EVENT_ID,
        ITEM_REF_NO: ITEM_REF_NO,
        ITEM_CLASS_NM: 'DepositAccountApplication',
        ITEM_VALUE: ACCT_ID,
        ITEM_DESC: `Deposit Account Application for ${ACCT_NM}`,
        ITEM_TYPE: 'ACCOUNT_OPENING',
        ITEM_BU_ID: parseInt(String(BU_ID).padStart(3, '0'), 10),
        CUST_ID: normalizedCUST_ID,
        BU_ID: parseInt(String(BU_ID).padStart(3, '0'), 10),
        WAIT_ST: 'PENDING',
        REC_ST: 'P',
        STATUS: 'PENDING',
        processId: 1001,
        currentStep: 1,
        QUEUE_ID: 2001,
        createdBy: USER_ID,
        assignedTo: USER_ID,
        entityId: savedApplication._id.toString(),
        CREATED_AT: new Date(),
        UPDATED_AT: new Date(),
        ASSIGNED_DATE: new Date(),
        PRIORITY: 'MEDIUM',
        DUE_DATE: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        ESCALATION_LEVEL: 0
      });

      await workflowItem.save({ session });
      console.log('✅ Workflow item created with ID:', WORK_ITEM_ID);
    } catch (wfError) {
      console.warn('⚠️ Workflow item creation failed, but continuing with application:', wfError.message);
    }

    // UPDATED: Create deposit transaction if amount provided
    if (AMOUNT && DEPOSITOR_NAME) {
      try {
        if (DENOMINATIONS) {
          const denominationSum = Object.entries(DENOMINATIONS).reduce((sum, [denom, count]) => sum + Number(denom) * Number(count), 0);
          if (Number(AMOUNT) !== denominationSum) {
            console.warn('⚠️ AMOUNT does not match denominations sum, skipping deposit transaction');
          } else {
            const depositTransaction = new DepositTransaction({
              CUST_ID: normalizedCUST_ID,
              ACCT_ID,
              ACCT_NO: String(ACCT_NO),
              TRANSACTION_DATE: TRANSACTION_DATE || new Date(),
              AMOUNT: Number(AMOUNT),
              DEPOSITOR_NAME,
              DENOMINATIONS,
              CREATED_BY,
              CREATED_AT: new Date(),
              STATUS: 'Pending'
            });
            await depositTransaction.save({ session });
            console.log('✅ Deposit transaction created with denominations');
          }
        } else {
          const depositTransaction = new DepositTransaction({
            CUST_ID: normalizedCUST_ID,
            ACCT_ID,
            ACCT_NO: String(ACCT_NO),
            TRANSACTION_DATE: TRANSACTION_DATE || new Date(),
            AMOUNT: Number(AMOUNT),
            DEPOSITOR_NAME,
            CREATED_BY,
            CREATED_AT: new Date(),
            STATUS: 'Pending'
          });
          await depositTransaction.save({ session });
          console.log('✅ Deposit transaction created without denominations');
        }
      } catch (txError) {
        console.warn('⚠️ Deposit transaction creation failed, but continuing:', txError.message);
      }
    }

    // UPDATED: Audit trail
    try {
      await AuditLogger.info('Deposit account application created', {
        entity_type: 'DEPOSIT_APPLICATION',
        entity_id: savedApplication._id,
        user_id: USER_ID,
        action: 'CREATE_APPLICATION',
        ip_address: req.ip,
        account_number: ACCT_NO,
        customer_id: normalizedCUST_ID
      }, { session });
      console.log('✅ Audit trail created');
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed:', auditError.message);
    }

    await session.commitTransaction();
    console.log('✅ Transaction committed successfully');

    // FINAL VERIFICATION: Check if account is retrievable outside transaction with both field names
    const finalCheckWithAccountNumber = await CustomerAccount.findOne({ account_number: String(ACCT_NO) });
    const finalCheckWithACCT_NO = await CustomerAccount.findOne({ ACCT_NO: String(ACCT_NO) });
    
    console.log('🔍 Final account verification:', {
      with_account_number: !!finalCheckWithAccountNumber,
      with_ACCT_NO: !!finalCheckWithACCT_NO,
      account_number: finalCheckWithAccountNumber?.account_number,
      ACCT_NO: finalCheckWithACCT_NO?.ACCT_NO,
      status: finalCheckWithAccountNumber?.status || finalCheckWithACCT_NO?.status
    });
    
    return res.status(201).json({
      message: 'Application created and sent for approval',
      data: { 
        application: savedApplication,
        customerAccount: {
          account_number: savedCustomerAccount.account_number,
          ACCT_NO: savedCustomerAccount.ACCT_NO,
          customer_id: savedCustomerAccount.customer_id,
          CUST_ID: savedCustomerAccount.CUST_ID,
          status: savedCustomerAccount.status,
          _id: savedCustomerAccount._id
        }
      },
      approvalUrl: `/api/deposit-account-application/approve/${ACCT_ID}`,
      accountNumber: ACCT_NO,
      verification: {
        retrievableWithAccountNumber: !!finalCheckWithAccountNumber,
        retrievableWithACCT_NO: !!finalCheckWithACCT_NO
      }
    });
  } catch (error) {
    console.error('❌ ERROR in createApplication:', error);
    if (!transactionAborted) {
      await session.abortTransaction();
    }
    return res.status(500).json({ 
      message: 'Unexpected error occurred', 
      details: error.message, 
      code: 'UNEXPECTED_ERROR',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
    const ACCT_ID = String(application.ACCT_ID).padStart(6, '0');
    if (!/^\d{6}$/.test(ACCT_ID)) {
      await session.abortTransaction();
      return res.status(400).json({
        message: `Invalid ACCT_ID ${application.ACCT_ID}. Must be exactly 6 digits.`,
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

    // Handle account update for approvals - UPDATED: Now updates existing account instead of creating new one
    let existingAccount = null;
    let accountUpdated = false;
    
    if (isApproval && !alreadyActive) {
      // Check if account already exists using new schema fields
      existingAccount = await CustomerAccount.findOne({
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
        console.log('✅ Existing CustomerAccount updated to Active status');
        
      } else {
        // Account doesn't exist, create new one (this should not happen with your current flow)
        console.log('⚠️ No existing CustomerAccount found, creating new one...');
        
        // ... (keep the existing account creation code here as fallback)
        // This part should ideally not be reached since createApplication already creates the account
        
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'No CustomerAccount found to approve. Please ensure the account was created during application submission.',
          code: 'ACCOUNT_NOT_FOUND',
        });
      }
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
        account_action: accountUpdated ? 'UPDATED_EXISTING' : 'NO_ACTION'
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
        ? 'Application approved and account activated successfully.'
        : 'Application rejected successfully.',
      application: updatedApplication,
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

    if (!rejectedBy || typeof rejectedBy !== 'string' || rejectedBy.trim() === '') {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Rejector user ID (rejectedBy) is required and must be a non-empty string',
        code: 'MISSING_REJECTOR',
      });
    }

    if (!ACCT_NO) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Account number (ACCT_NO) is required when rejecting by customer ID',
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

    // Check if already rejected
    if (application.STATUS === 'Rejected') {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Application already rejected',
        code: 'DUPLICATE_ACTION',
      });
    }

    // Update application status to rejected
    application.STATUS = 'Rejected';
    application.REC_ST = 'REJECTED';
    application.COMMENTS = comments || '';
    application.REJECTED_BY = rejectedBy;
    application.REJECTION_DATE = new Date();
    application.LAST_UPDATED = new Date();
    application.APPROVED_BY = null;
    application.APPROVAL_DATE = null;

    const updatedApplication = await application.save({ session });

    // Also update the CustomerAccount status to Rejected if it exists
    let accountUpdated = false;
    const existingAccount = await CustomerAccount.findOne({
      customer_id: normalizedCUST_ID,
      account_number: String(ACCT_NO),
    }).session(session);
    
    if (existingAccount) {
      console.log('🔄 CustomerAccount exists, updating status to Rejected...');
      existingAccount.status = 'Rejected';
      existingAccount.substatus = 'Rejected';
      existingAccount.REC_ST = 'REJECTED';
      existingAccount.last_updated = new Date();
      existingAccount.lastActivityDate = new Date();
      
      await existingAccount.save({ session });
      accountUpdated = true;
      console.log('✅ CustomerAccount updated to Rejected status');
    }

    // Workflow update for rejection
    let wfUpdateResult;
    try {
      wfUpdateResult = await WF_WORK_ITEMController.updateWorkItemStatusOnRejection(
        'DepositAccountApplication',
        normalizedCUST_ID,
        rejectedBy,
        comments || 'Rejected'
      );
      if (!wfUpdateResult.success) {
        console.warn('⚠️ Workflow update failed, but proceeding with application rejection:', wfUpdateResult.error);
      }
    } catch (wfError) {
      console.warn('⚠️ Non-critical workflow update error:', wfError.message);
    }

    // FIXED: Audit Trail with valid status values
    const auditTrailData = {
      event_id: Date.now(),
      USER_ID: rejectedBy,
      EVENT_TYPE: 'DepositAccountApplication',
      ACTION: 'Reject Application',
      OLD_VALUE: {
        STATUS: application.STATUS || 'Unknown',
        REC_ST: application.REC_ST || 'Unknown',
      },
      NEW_VALUE: {
        STATUS: 'Rejected',
        REC_ST: 'REJECTED',
      },
      ipAddress: req.ip || 'unknown',
      timestamp: new Date(),
      entity_type: 'DepositAccountApplication',
      entity_id: application._id,
      status: 'REJECTED',
      additional_info: { 
        comments: comments || '',
        account_number: ACCT_NO,
        account_action: accountUpdated ? 'UPDATED_EXISTING' : 'NO_ACTION'
      },
    };

    try {
      await AuditTrail.create([auditTrailData], { session });
      console.log('✅ AuditTrail created successfully for rejection');
    } catch (auditError) {
      console.error('❌ AuditTrail creation error:', auditError.message);
      
      // Fallback without status field
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
      message: 'Application rejected successfully.',
      application: updatedApplication,
      accountAction: accountUpdated ? 'UPDATED' : 'NO_ACTION',
      workflowItem: wfUpdateResult?.data || null,
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
      code: 'REJECTION_ERROR',
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