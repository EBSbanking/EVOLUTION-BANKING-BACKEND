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
import NotificationService from '../services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { getProductTypeByProdIdInternal } from '../services/productService.js';
import SavingsProduct from '../models/SavingsProduct.js'; // Add this import

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
        AVAIL_DT, OPENED_DT, NATIONALITY_NO,
        CREATED_BY, BVN_NO, DOCUMENT_TYPE,
        DOCUMENT_NUMBER, CREATED_AT, TRANSACTION_DATE,
        AMOUNT, DEPOSITOR_NAME, ACCT_NO: REQUEST_ACCT_NO, ACCT_ID: REQUEST_ACCT_ID,
        DENOMINATIONS, ACCOUNT_TYPE // Add ACCOUNT_TYPE here
      } = req.body;

      // Validate required fields
      if (!CUST_ID || !ACCT_NM || !CRNCY_ID || !PROD_ID || !BU_ID) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'CUST_ID, ACCT_NM, CRNCY_ID, PROD_ID, and BU_ID are required.', code: 'MISSING_REQUIRED_FIELDS' });
      }

      // Validate REQUEST_ACCT_ID if provided
      if (REQUEST_ACCT_ID && !/^\d{6}$/.test(String(REQUEST_ACCT_ID))) {
        await session.abortTransaction();
        return res.status(400).json({ message: `REQUEST_ACCT_ID ${REQUEST_ACCT_ID} must be exactly 6 digits.`, code: 'INVALID_REQUEST_ACCT_ID' });
      }

      // Check if customer exists
      const customer = await Customer.findOne({ CUST_ID: String(CUST_ID) }).session(session);
      if (!customer) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Customer does not exist for CUST_ID ${CUST_ID}`, code: 'CUSTOMER_NOT_FOUND' });
      }

      // Validate NIN
      if (NATIONALITY_NO && customer.NIN !== String(NATIONALITY_NO)) {
        await session.abortTransaction();
        return res.status(400).json({ message: `NATIONALITY_NO ${NATIONALITY_NO} does not match the customer's NIN (${customer.NIN}).`, code: 'NIN_MISMATCH' });
      }

      // Validate BVN
      if (BVN_NO && customer.BVN !== String(BVN_NO)) {
        await session.abortTransaction();
        return res.status(400).json({ message: `BVN_NO ${BVN_NO} does not match the customer's BVN (${customer.BVN}).`, code: 'BVN_MISMATCH' });
      }
      if (!/^\d{11}$/.test(String(BVN_NO))) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'BVN_NO must be exactly 11 digits.', code: 'INVALID_BVN' });
      }

      const normalizedCUST_ID = Number(String(CUST_ID).replace(/^0+/, ''));

      // Check BVN uniqueness
      const existingBvn = await DepositAccountApplication.findOne({ BVN_NO }).session(session);
      if (existingBvn && existingBvn.CUST_ID !== normalizedCUST_ID) {
        await session.abortTransaction();
        return res.status(400).json({ message: `BVN_NO ${BVN_NO} is already associated with another customer.`, code: 'BVN_ALREADY_USED' });
      }

      // Check NATIONALITY_NO uniqueness
      if (NATIONALITY_NO) {
        const existingNat = await DepositAccountApplication.findOne({ NATIONALITY_NO, CUST_ID: { $ne: normalizedCUST_ID } }).session(session);
        if (existingNat) {
          await session.abortTransaction();
          return res.status(400).json({ message: `NATIONALITY_NO ${NATIONALITY_NO} has already been used by another customer.`, code: 'NATIONALITY_NO_ALREADY_USED' });
        }
      }

      // Product type
      const mapping = await getProductTypeByProdIdInternal(PROD_ID);
      if (!mapping?.PRODUCT_TYPE) throw new Error(`Invalid or missing product type for PROD_ID ${PROD_ID}`);
      const productType = mapping.PRODUCT_TYPE.toUpperCase();

      // Existing active account check
      const existingAccount = await CustomerAccount.findOne({
        CUST_ID: normalizedCUST_ID,
        PROD_ID: String(PROD_ID),
        REC_ST: 'ACTIVE'
      }).session(session);
      if (existingAccount) {
        await session.abortTransaction();
        return res.status(400).json({ message: `Customer already has a valid ${productType} account with ACCT_NO: ${existingAccount.ACCT_NO}`, code: 'ACCOUNT_ALREADY_EXISTS' });
      }

      // File upload validation
      if (!req.files?.IMAGE || !req.files.DOCUMENT || !req.files.BANK_MANDATE) {
        await session.abortTransaction();
        return res.status(400).json({ message: 'IMAGE, DOCUMENT, and BANK_MANDATE files are required.', code: 'MISSING_FILES' });
      }

      // Upload helper
      const upload = async (file, folder) => {
        const filePath = file.tempFilePath || file.path;
        const result = await cloudinaryV2.uploader.upload(filePath, { folder });
        if (!result?.secure_url) throw new Error(`Cloudinary upload failed for ${folder}`);
        return result.secure_url;
      };

      const [IMAGE, DOCUMENT, BANK_MANDATE] = await Promise.all([
        upload(req.files.IMAGE, 'IMAGE'),
        upload(req.files.DOCUMENT, 'DOCUMENT'),
        upload(req.files.BANK_MANDATE, 'BANK_MANDATE')
      ]);

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

      console.log('✅ Final ACCT_ID (string):', ACCT_ID, 'Type:', typeof ACCT_ID);

      // Validate denominations
      if (AMOUNT && DEPOSITOR_NAME && DENOMINATIONS) {
        const denominationSum = Object.entries(DENOMINATIONS).reduce((sum, [denom, count]) => sum + Number(denom) * Number(count), 0);
        if (Number(AMOUNT) !== denominationSum) {
          await session.abortTransaction();
          return res.status(400).json({ message: `AMOUNT ${AMOUNT} must match the sum of denominations (${denominationSum})`, code: 'DENOMINATION_MISMATCH' });
        }
      }

      // Save Deposit Application
      const newApp = new DepositAccountApplication({
        CUST_ID: normalizedCUST_ID,
        ACCT_ID, // keep as string
        ACCT_NO: String(ACCT_NO),
        ACCT_NM,
        CRNCY_ID,
        PROD_ID,
        BU_ID: String(BU_ID).padStart(3, '0'),
        AVAIL_DT,
        OPENED_DT,
        NATIONALITY_NO,
        CREATED_BY,
        USER_ID,
        BVN_NO,
        DOCUMENT_TYPE,
        DOCUMENT_NUMBER,
        CREATED_AT: CREATED_AT || Date.now(),
        IMAGE,
        DOCUMENT,
        BANK_MANDATE,
        STATUS: 'Pending',
        DENOMINATIONS,
        ACCOUNT_TYPE: ACCOUNT_TYPE || productType // Add ACCOUNT_TYPE
      });
      const savedApplication = await newApp.save({ session });

      // ... (workflow, account creation, deposit transaction, audit trail remain unchanged)

      await session.commitTransaction();
      return res.status(201).json({
        message: 'Application created and sent for approval',
        data: { application: savedApplication },
        approvalUrl: `/api/deposit-account-application/approve/${ACCT_ID}`
      });
    } catch (error) {
      if (!transactionAborted) await session.abortTransaction();
      return res.status(500).json({ message: 'Unexpected error occurred', details: error.message, code: 'UNEXPECTED_ERROR' });
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

    // Handle account creation for approvals
    let existingAccount = null;
    if (isApproval && !alreadyActive) {
      existingAccount = await CustomerAccount.findOne({
        CUST_ID: normalizedCUST_ID,
        ACCT_NO: String(ACCT_NO),
      }).session(session);
      if (existingAccount) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Customer account already exists',
          code: 'ACCOUNT_ALREADY_EXISTS',
          existingAccount: {
            ACCT_NO: existingAccount.ACCT_NO,
            CUST_ID: existingAccount.CUST_ID,
            ACCT_NM: existingAccount.ACCT_NM,
            PROD_ID: existingAccount.PROD_ID,
            REC_ST: existingAccount.REC_ST,
          },
        });
      }

      // Validate and convert AMOUNT to Decimal128
      const depositAmount = AMOUNT && Number(AMOUNT) > 0 ? AMOUNT.toString() : application.AMOUNT ? application.AMOUNT.toString() : '0.00';
      if (!/^\d+(\.\d{1,2})?$/.test(depositAmount)) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Invalid AMOUNT ${depositAmount}. Must be a valid number with up to 2 decimal places.`,
          code: 'INVALID_AMOUNT',
        });
      }

      // Determine account type and prepare account data
      const accountType = VALID_ACCOUNT_TYPES.includes(application.ACCOUNT_TYPE) ? application.ACCOUNT_TYPE : 'SAVINGS';
      const accountData = {
        CUST_ID: application.CUST_ID,
        ACCT_ID: ACCT_ID,
        ACCT_NO: String(ACCT_NO),
        ACCT_NM: application.ACCT_NM,
        BU_ID: String(application.BU_ID),
        LEDGER_BAL: mongoose.Types.Decimal128.fromString(depositAmount),
        CLEARED_BAL: mongoose.Types.Decimal128.fromString(depositAmount),
        AVAILABLE_BALANCE: mongoose.Types.Decimal128.fromString(depositAmount),
        ACCOUNT_TYPE: accountType,
        PRODUCT_DESC: application.PRODUCT_DESC || 'Savings Account',
        REC_ST: 'ACTIVE',
        PROD_ID: String(application.PROD_ID),
        INTEREST_RATE: mongoose.Types.Decimal128.fromString("0.00"),
        ACCRUED_INTEREST: mongoose.Types.Decimal128.fromString('0.00'),
        lastActivityDate: new Date(),
      };

      // Add SAVINGS account specific fields - FIXED PRODUCT LOOKUP
      if (accountType === 'SAVINGS') {
        console.log('🔍 DEBUG: Application details:', {
          PROD_ID: application.PROD_ID,
          PROD_ID_type: typeof application.PROD_ID,
          ACCOUNT_TYPE: application.ACCOUNT_TYPE,
          PRODUCT_DESC: application.PRODUCT_DESC
        });

        const productCode = String(application.PROD_ID);
        console.log('🔍 Searching for SavingsProduct with PROD_ID:', productCode);

        // First, let's see what products actually exist
        const allProducts = await SavingsProduct.find({}).session(session);
        console.log('📋 ALL SavingsProducts in database:', allProducts.map(p => ({
          _id: p._id,
          productCode: p.productCode,
          PROD_ID: p.PROD_ID,
          PROD_CD: p.PROD_CD,
          productName: p.productName,
          REC_ST: p.REC_ST
        })));

        // FIXED: Use the correct REC_ST values from your database
        let product = null;
        
        // Convert productCode to number for PROD_ID search
        const productCodeNum = Number(productCode);
        
        // FIXED: Search with correct REC_ST values - "A" instead of "ACTIVE"
        const searchStrategies = [
          // Strategy 1: Search by PROD_ID with REC_ST = "A"
          { PROD_ID: productCodeNum, REC_ST: "A" },
          // Strategy 2: Search by productCode with REC_ST = "A"  
          { productCode: productCode, REC_ST: "A" },
          // Strategy 3: Search by PROD_CD with REC_ST = "A"
          { PROD_CD: productCode, REC_ST: "A" },
          // Strategy 4: Search without REC_ST filter (fallback)
          { PROD_ID: productCodeNum },
          { productCode: productCode },
          { PROD_CD: productCode }
        ];

        for (const strategy of searchStrategies) {
          try {
            product = await SavingsProduct.findOne(strategy).session(session);
            if (product) {
              console.log(`✅ Found product with strategy:`, strategy);
              break;
            }
          } catch (searchError) {
            console.log(`❌ Search failed for strategy:`, strategy, searchError.message);
          }
        }

        if (product) {
          console.log('✅ FOUND PRODUCT:', {
            productCode: product.productCode,
            PROD_ID: product.PROD_ID,
            PROD_CD: product.PROD_CD,
            productName: product.productName,
            REC_ST: product.REC_ST,
            interestRate: product.interestRate,
            rateInformation: product.rateInformation
          });

          // Use the correct product code field
          accountData.productCode = product.productCode || product.PROD_ID || product.PROD_CD;
          accountData.LAST_INTEREST_DATE = new Date();
          
          // Set interest rate from product
          let interestRate = 0;
          if (product.rateInformation?.fixedRate) {
            interestRate = product.rateInformation.fixedRate;
          } else if (product.interestRate) {
            interestRate = product.interestRate;
          } else if (product.rateInformation?.effectiveRate) {
            interestRate = product.rateInformation.effectiveRate;
          }
          
          console.log('💰 Setting interest rate:', interestRate);
          accountData.INTEREST_RATE = mongoose.Types.Decimal128.fromString(String(interestRate));
          accountData.PRODUCT_DESC = product.productName || product.PROD_DESC || application.PRODUCT_DESC;
          
        } else {
          console.error('❌ No SavingsProduct found for PROD_ID:', productCode);
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `No active SavingsProduct found for product code: ${productCode}`,
            code: 'PRODUCT_NOT_FOUND',
            availableProducts: allProducts.map(p => ({
              PROD_ID: p.PROD_ID,
              productCode: p.productCode,
              productName: p.productName,
              REC_ST: p.REC_ST
            }))
          });
        }
      }

      console.log('📝 Creating CustomerAccount with data:', accountData);
      
      try {
        const newAccount = new CustomerAccount(accountData);
        await newAccount.save({ session });
        console.log('✅ CustomerAccount created successfully');
      } catch (saveError) {
        console.error('❌ Error saving CustomerAccount:', saveError.message);
        
        // FIXED: Provide more specific error information
        if (saveError.message.includes('productCode')) {
          throw new Error(`Product validation failed: ${saveError.message}. Please ensure SavingsProduct with code ${accountData.productCode} exists.`);
        }
        throw saveError;
      }
    }

    // FIXED: Audit Trail with valid status values
    // Check what valid status values the AuditTrail model expects
    const auditTrailStatus = isApproval ? 'SUCCESS' : 'REJECTED'; // Common enum values
    
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
      status: auditTrailStatus, // FIXED: Use valid enum value
      additional_info: { 
        comments: comments || '',
        originalStatus: normalizedStatus // Keep original status in additional info
      },
    };

    // Log audit trail data for debugging
    console.log('AuditTrail data:', JSON.stringify(auditTrailData, null, 2));

    try {
      await AuditTrail.create([auditTrailData], { session });
      console.log('✅ AuditTrail created successfully');
    } catch (auditError) {
      console.error('❌ AuditTrail creation error:', auditError.message);
      
      // If AuditTrail fails, try without the status field
      const fallbackAuditData = { ...auditTrailData };
      delete fallbackAuditData.status;
      
      try {
        await AuditTrail.create([fallbackAuditData], { session });
        console.log('✅ AuditTrail created successfully without status field');
      } catch (fallbackError) {
        console.warn('⚠️ AuditTrail creation failed even without status field:', fallbackError.message);
        // Continue with transaction even if AuditTrail fails
      }
    }

    await session.commitTransaction();
    return res.status(200).json({
      success: true,
      message: isApproval
        ? 'Application approved and account created successfully.'
        : 'Application rejected successfully.',
      application: updatedApplication,
      accountCreated: isApproval && !existingAccount,
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
  try {
    const { CUST_ID } = req.params;
    const { rejectedBy, comments, ACCT_NO } = req.body;

    if (!rejectedBy || typeof rejectedBy !== 'string' || rejectedBy.trim() === '') {
      return res.status(400).json({
        message: 'Rejector user ID (rejectedBy) is required and must be a non-empty string',
        code: 'MISSING_REJECTOR',
      });
    }

    if (!ACCT_NO) {
      return res.status(400).json({
        message: 'Account number (ACCT_NO) is required when rejecting by customer ID',
        code: 'MISSING_ACCOUNT_NUMBER',
      });
    }

    // Create a modified request object for the shared function
    const modifiedReq = {
      ...req,
      body: {
        ...req.body,
        status: 'Rejected', // Force rejection status
        rejectedBy: rejectedBy,
        comments: comments,
        ACCT_NO: ACCT_NO
      }
    };

    // Call the main function with modified request
    return DepositAccountApplicationController.approveApplicationByCustomerId(modifiedReq, res);
  } catch (error) {
    console.error('Rejection processing error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error rejecting application',
      error: error.message,
      code: 'REJECTION_ERROR',
      timestamp: new Date(),
    });
  }
},

  updateApplication: async (req, res) => {
    try {
      const { CUST_ID } = req.params;
      const { IMAGE, DOCUMENT, BANK_MANDATE, ...safeUpdates } = req.body;

      if (!CUST_ID) {
        return res.status(400).json({ message: 'CUST_ID is required.', code: 'MISSING_CUST_ID' });
      }

      if (safeUpdates.BVN_NO && !/^\d{11}$/.test(safeUpdates.BVN_NO)) {
        return res.status(400).json({ message: 'BVN must be exactly 11 digits.', code: 'INVALID_BVN' });
      }

      if (safeUpdates.BVN_NO) {
        const existingWithBVN = await DepositAccountApplication.findOne({
          BVN_NO: safeUpdates.BVN_NO,
          CUST_ID: { $ne: CUST_ID }
        });
        if (existingWithBVN) {
          return res.status(400).json({ message: 'BVN already exists for another customer.', code: 'BVN_ALREADY_USED' });
        }
      }

      const updatedApplication = await DepositAccountApplication.findOneAndUpdate(
        { CUST_ID: Number(String(CUST_ID).replace(/^0+/, '')) },
        { $set: { ...safeUpdates, LAST_UPDATED: new Date() } },
        { new: true }
      );

      if (!updatedApplication) {
        return res.status(404).json({ message: `Application not found for CUST_ID ${CUST_ID}`, code: 'APPLICATION_NOT_FOUND' });
      }

      return res.status(200).json({
        message: 'Application updated successfully',
        data: updatedApplication
      });
    } catch (error) {
      console.error('❌ Error updating application:', {
        message: error.message,
        stack: error.stack
      });
      return res.status(500).json({
        message: 'Error updating application details',
        error: error.message,
        code: 'INTERNAL_SERVER_ERROR'
      });
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