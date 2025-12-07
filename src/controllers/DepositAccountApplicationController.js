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

const DepositAccountApplicationController = {
createApplication: async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  let transactionAborted = false;

  try {
    console.log('🚀 === STARTING CREATE APPLICATION ===');
    
    // ... (existing validation code remains the same) ...

    // Create CustomerAccount
    console.log('💾 Creating customer account...');
    try {
      const customerAccountData = {
        customer_id: Number(normalizedCUST_ID),
        CUST_ID: Number(normalizedCUST_ID),
        
        account_number: String(ACCT_NO),
        ACCT_NO: String(ACCT_NO),
        ACCT_ID: ACCT_ID,
        
        product_type: (ACCOUNT_TYPE || 'SAVINGS').toLowerCase(),
        product: String(PROD_ID),
        PRODUCT_DESC: `Deposit Account for ${ACCT_NM}`,
        productCode: String(PROD_ID),
        
        branch: parseInt(String(BU_ID).padStart(3, '0'), 10),
        BU_ID: String(BU_ID).padStart(3, '0'),
        primary_relationship_manager: 1,
        
        ACCOUNT_TYPE: ACCOUNT_TYPE || 'SAVINGS',
        ACCT_NM: ACCT_NM,
        CRNCY_ID: CRNCY_ID,
        currency: CRNCY_ID || 'NGN',
        
        opening_amount: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        cleared_balance: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        ledger_balance: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        AVAILABLE_BALANCE: AMOUNT ? mongoose.Types.Decimal128.fromString(AMOUNT.toString()) : mongoose.Types.Decimal128.fromString('0.00'),
        
        creation_date: new Date(),
        last_updated: new Date(),
        application_date: new Date(),
        creation_datetime: new Date(),
        lastActivityDate: new Date(),
        OPENED_DT: OPENED_DT || new Date(),
        AVAIL_DT: AVAIL_DT || new Date(),
        
        // CRITICAL FIX: Set both status fields properly
        status: 'Pending', // This matches the enum ["Active", "Closed", "Pending", "Rejected"]
        substatus: 'Pending',
        REC_ST: 'PENDING', // This is what's missing! Set it to PENDING
        
        created_by: parseInt(USER_ID) || 1,
        CREATED_BY: CREATED_BY || USER_ID,
        customer_code: customer.CUST_ID?.toString(),
        
        online_enabled: true,
        sms_alert: 'No',
        email_alert: 'No',
        
        auto_approve: false,
        isfirst: 0,
        disbursement_method: 'Cheque',
        
        INTEREST_RATE: mongoose.Types.Decimal128.fromString('0.00'),
        ACCRUED_INTEREST: mongoose.Types.Decimal128.fromString('0.00'),
        agreed_interest_rate: mongoose.Types.Decimal128.fromString('0.00'),
        
        DR_ALLOWED: true,
        CR_ALLOWED: true,
        isOverdraftAllowed: false,
        overdraftLimit: mongoose.Types.Decimal128.fromString('0.00')
      };

      const customerAccount = new CustomerAccount(customerAccountData);
      const savedCustomerAccount = await customerAccount.save({ session });
      
      console.log('✅ Customer account created successfully:', {
        account_number: savedCustomerAccount.account_number,
        customer_id: savedCustomerAccount.customer_id,
        status: savedCustomerAccount.status,
        REC_ST: savedCustomerAccount.REC_ST // Log this to verify
      });

    } catch (accountError) {
      console.error('❌ Customer account creation FAILED:', accountError.message);
      throw new Error(`Failed to create customer account: ${accountError.message}`);
    }

    await session.commitTransaction();
    console.log('✅ Transaction committed successfully');

    return res.status(201).json({
      success: true,
      message: 'Application created and sent for approval',
      data: { 
        application: savedApplication
      },
      accountNumber: ACCT_NO
    });
  } catch (error) {
    console.error('❌ ERROR in createApplication:', error.message);
    if (!transactionAborted) {
      await session.abortTransaction();
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
    // ========== END CRITICAL FIX ==========

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