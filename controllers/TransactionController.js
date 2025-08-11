import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import DepositAccountSummary from '../models/DepositAccountSummary.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { GENERAL_TX_TYPES, LOAN_TX_TYPES } from '../constants/transactionTypes.js';
import AMLThreshold from '../models/AMLThreshold.js';
import { startTransactionSession } from '../config/db.js';
import { checkSanctionList } from '../utils/checkSanctionList.js';
import AML from '../models/AML.js'; 
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import { logAuditTrail } from '../utils/AuditLogger.js';
import NotificationService from '../services/NotificationService.js';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';


/* ---------- Helpers ---------- */
const generateSerialNumber = (len) => {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
};

// ✅ Helper: Check if transaction exceeds dynamic AML threshold
const shouldFlagForAML = async (transactionType, amount) => {
  const rule = await AMLThreshold.findOne({ transaction_type: transactionType, active: true });
  return rule && amount >= rule.threshold_amount;
};


// AML Compliance Check Helper Function
const checkAMLCompliance = async ({ 
  transactionType, 
  amount, 
  currency, 
  accountType, 
  destinationCountry, 
  restrictedCountries, 
  custId 
}, session, userId, ipAddress) => {
  const { EVENT_ID } = generateWorkflowIdentifiers();

  try {
    // Get customer AML record
    const amlRecord = await AML.findOne({ CUST_ID: custId }).session(session);
    
    if (!amlRecord) {
      await logAuditTrail(
        'AML_CHECK',
        EVENT_ID,
        userId || 'system',
        'AML_RECORD_NOT_FOUND',
        null,
        { custId, result: 'No AML record found' },
        ipAddress
      );
      return {
        requiresManualReview: true,
        reason: 'No AML record found for customer',
        isFlagged: true,
        flags: ['MISSING_AML_RECORD'],
        threshold: amount,
        amlDetails: {
          customerType: 'Unknown',
          riskLevel: 'high',
          lastVerified: null
        }
      };
    }

    // 1. First check if customer is PEP (regardless of amount)
    if (amlRecord.IS_PEP) {
      await logAuditTrail(
        'AML_CHECK',
        EVENT_ID,
        userId || 'system',
        'PEP_CUSTOMER',
        null,
        { 
          custId, 
          result: 'PEP customer',
          pepDetails: amlRecord.PEP_DETAILS 
        },
        ipAddress
      );
      
      return {
        requiresManualReview: true,
        reason: 'PEP customer',
        isFlagged: true,
        flags: ['PEP'],
        threshold: 0,  // PEP flag is independent of amount
        sanctionDetails: null,
        amlDetails: {
          customerType: 'PEP',
          riskLevel: 'high',
          lastVerified: amlRecord.lastVerifiedDate,
          pepDetails: amlRecord.PEP_DETAILS
        }
      };
    }

    // 2. Then check sanction match (more severe than PEP)
    if (amlRecord.SANCTION_MATCH) {
      await logAuditTrail(
        'AML_CHECK',
        EVENT_ID,
        userId || 'system',
        'SANCTION_MATCH',
        null,
        { 
          custId, 
          result: 'Sanction match found',
          details: amlRecord.SANCTION_DETAILS 
        },
        ipAddress
      );
      
      return {
        requiresManualReview: true,
        reason: 'Sanction match found',
        isFlagged: true,
        flags: ['SANCTION_MATCH'],
        threshold: amount,
        sanctionDetails: amlRecord.SANCTION_DETAILS,
        amlDetails: {
          customerType: 'Sanctioned',
          riskLevel: 'critical',
          lastVerified: amlRecord.lastVerifiedDate
        }
      };
    }

    // 3. Check against restricted countries
    const isRestrictedCountry = destinationCountry && 
      restrictedCountries.includes(destinationCountry.toUpperCase());
    
    if (isRestrictedCountry) {
      await logAuditTrail(
        'AML_CHECK',
        EVENT_ID,
        userId || 'system',
        'RESTRICTED_COUNTRY',
        null,
        { 
          custId,
          destinationCountry,
          restrictedCountries,
          result: `Restricted destination country: ${destinationCountry}`
        },
        ipAddress
      );
      
      return {
        requiresManualReview: true,
        reason: `Restricted destination country: ${destinationCountry}`,
        isFlagged: true,
        flags: ['RESTRICTED_COUNTRY'],
        threshold: amount,
        amlDetails: {
          customerType: 'Regular',
          riskLevel: 'high',
          lastVerified: amlRecord.lastVerifiedDate
        }
      };
    }

    // 4. Then check amount thresholds (only if not PEP or Sanctioned)
    const thresholds = await AMLThreshold.findOne().sort({ createdAt: -1 });
    const highRiskThreshold = thresholds?.highRisk || 5000000;
    const mediumRiskThreshold = thresholds?.mediumRisk || 1000000;
    
    if (amount >= highRiskThreshold) {
      await logAuditTrail(
        'AML_CHECK',
        EVENT_ID,
        userId || 'system',
        'HIGH_VALUE_TRANSACTION',
        null,
        { 
          custId,
          amount,
          currency,
          threshold: highRiskThreshold,
          result: `Amount exceeds high risk threshold (${currency}${highRiskThreshold})`
        },
        ipAddress
      );
      
      return {
        requiresManualReview: true,
        reason: `Amount exceeds high risk threshold (${currency}${highRiskThreshold})`,
        isFlagged: true,
        flags: ['HIGH_VALUE_TRANSACTION'],
        threshold: highRiskThreshold,
        amlDetails: {
          customerType: 'Regular',
          riskLevel: 'high',
          lastVerified: amlRecord.lastVerifiedDate
        }
      };
    } else if (amount >= mediumRiskThreshold) {
      await logAuditTrail(
        'AML_CHECK',
        EVENT_ID,
        userId || 'system',
        'MEDIUM_VALUE_TRANSACTION',
        null,
        { 
          custId,
          amount,
          currency,
          threshold: mediumRiskThreshold,
          result: `Amount exceeds medium risk threshold (${currency}${mediumRiskThreshold})`
        },
        ipAddress
      );
      
      return {
        requiresManualReview: false,
        reason: `Amount exceeds medium risk threshold (${currency}${mediumRiskThreshold})`,
        isFlagged: true,
        flags: ['MEDIUM_VALUE_TRANSACTION'],
        threshold: mediumRiskThreshold,
        amlDetails: {
          customerType: 'Regular',
          riskLevel: 'medium',
          lastVerified: amlRecord.lastVerifiedDate
        }
      };
    }

    // Clean transaction
    await logAuditTrail(
      'AML_CHECK',
      EVENT_ID,
      userId || 'system',
      'AML_CLEAR',
      null,
      { 
        custId,
        amount,
        currency,
        result: 'Transaction cleared AML checks'
      },
      ipAddress
    );
    
    return {
      requiresManualReview: false,
      isFlagged: false,
      threshold: mediumRiskThreshold,
      amlDetails: {
        customerType: 'Regular',
        riskLevel: 'low',
        lastVerified: amlRecord.lastVerifiedDate
      }
    };

  } catch (error) {
    console.error('AML Compliance Check Error:', error);
    await logAuditTrail(
      'AML_CHECK',
      EVENT_ID,
      userId || 'system',
      'AML_CHECK_FAILED',
      null,
      { 
        custId,
        error: error.message,
        result: 'AML check failed'
      },
      ipAddress
    );
    throw error;
  }
};

export const createTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction({ readPreference: 'primary' });

  let account, amlCheck;

  try {
    const {
      ACCT_NO,
      ACCT_ID,
      BU_ID,
      CUST_ID,
      ACCT_NM,
      AMOUNT,
      TRANSACTIONDATE,
      TRANSACTION_TYPE,
      reference = '',
      description = '',
      AML_RESTRICTED_COUNTRIES = [],
      DESTINATION_COUNTRY = null,
      ACCOUNT_TYPE = 'INDIVIDUAL',
      isBulkTransaction = false
    } = req.body;

    // Remove AML_THRESHOLD if present in request
    if ('AML_THRESHOLD' in req.body) {
      delete req.body.AML_THRESHOLD;
    }

    // Normalize input data
    const normalizedType = TRANSACTION_TYPE ? String(TRANSACTION_TYPE).toUpperCase() : null;
    const normalizedBU_ID = BU_ID !== undefined ? (typeof BU_ID === 'number' ? BU_ID.toString() : BU_ID) : null;

    // Validate and parse amount
    let normalizedAmount;
    try {
      normalizedAmount = parseFloat(AMOUNT);
      if (isNaN(normalizedAmount)) throw new Error('Invalid amount');
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({ 
        success: false, 
        code: 'INVALID_AMOUNT', 
        message: 'Amount must be a valid number', 
        timestamp: new Date().toISOString() 
      });
    }

    // Validate required fields
    const requiredFields = {
      ACCT_NO: ACCT_NO ? String(ACCT_NO).trim() : null,
      ACCT_ID: ACCT_ID ? String(ACCT_ID).trim() : null,
      BU_ID: normalizedBU_ID,
      CUST_ID: CUST_ID ? String(CUST_ID).trim() : null,
      ACCT_NM: ACCT_NM ? String(ACCT_NM).trim() : null,
      AMOUNT: normalizedAmount,
      TRANSACTION_TYPE: normalizedType
    };

    const missingFields = Object.entries(requiredFields).filter(([_, value]) => !value).map(([key]) => key);
    if (missingFields.length > 0) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({ 
        success: false, 
        code: 'INVALID_INPUT', 
        message: `Missing required fields: ${missingFields.join(', ')}`, 
        timestamp: new Date().toISOString() 
      });
    }

    // Validate transaction type
    if (!normalizedType || !GENERAL_TX_TYPES.includes(normalizedType)) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({ 
        success: false, 
        code: 'INVALID_TRANSACTION_TYPE', 
        message: `Invalid transaction type. Valid types: ${GENERAL_TX_TYPES.join(', ')}`, 
        timestamp: new Date().toISOString() 
      });
    }

    // Validate amount range
    if (normalizedAmount <= 0 || normalizedAmount > 1000000000) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({ 
        success: false, 
        code: 'INVALID_AMOUNT', 
        message: 'Amount must be between ₦0.01 and ₦1,000,000,000', 
        timestamp: new Date().toISOString() 
      });
    }

    // Find and validate account
    try {
      account = await CustomerAccount.findOne({ ACCT_NO: requiredFields.ACCT_NO })
        .select('LEDGER_BAL AVAILABLE_BALANCE REC_ST CURRENCY ACCT_TYPE DAILY_TRANSACTION_COUNT DAILY_TRANSACTION_LIMIT')
        .session(session);

      if (!account) throw new Error('Account not found');
    } catch (error) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({ 
        success: false, 
        code: 'ACCOUNT_NOT_FOUND', 
        message: `Account ${requiredFields.ACCT_NO} not found or error occurred`, 
        timestamp: new Date().toISOString() 
      });
    }

    // Check account status
    if (account.REC_ST && account.REC_ST !== 'ACTIVE') {
      await session.abortTransaction();
      await session.endSession();
      return res.status(403).json({ 
        success: false, 
        code: 'ACCOUNT_INACTIVE', 
        message: `Account ${requiredFields.ACCT_NO} is ${account.REC_ST}`, 
        timestamp: new Date().toISOString() 
      });
    }

    // Generate all workflow identifiers
    const {
      TRANSACTION_ID,
      EVENT_ID,
      JOURNAL_ID,
      WORK_ITEM_ID,
      BUS_PROC_ID,
      SUB_PROC_ID,
      QUEUE_ID
    } = generateWorkflowIdentifiers();

    // Log transaction initiation
    await logAuditTrail(
      'TRANSACTION_INIT', 
      EVENT_ID, 
      req.user?.id || 'system', 
      'TRANSACTION_STARTED', 
      null, 
      {
        account: requiredFields.ACCT_NO,
        amount: normalizedAmount,
        type: normalizedType,
        isBulk: isBulkTransaction,
        transactionId: TRANSACTION_ID
      }, 
      req.ip
    );

    // Perform sanction check
    try {
      const sanctionCheck = await checkSanctionList(null, null, requiredFields.ACCT_NM);

      if (sanctionCheck.isSanctioned) {
        await logAuditTrail(
          'SANCTION_CHECK', 
          EVENT_ID, 
          req.user?.id || 'system', 
          'SANCTION_MATCH', 
          null, 
          {
            account: requiredFields.ACCT_NO,
            customerName: requiredFields.ACCT_NM,
            details: sanctionCheck.sanctionDetails,
            transactionId: TRANSACTION_ID
          }, 
          req.ip
        );

        await session.abortTransaction();
        await session.endSession();
        return res.status(403).json({ 
          success: false, 
          code: 'SANCTIONED_CUSTOMER', 
          message: 'Customer appears on sanction list', 
          sanctionDetails: sanctionCheck.sanctionDetails, 
          timestamp: new Date().toISOString() 
        });
      }

      // Perform AML compliance check
      amlCheck = await checkAMLCompliance({
        transactionType: normalizedType,
        amount: normalizedAmount,
        currency: account.CURRENCY || 'NGN',
        accountType: account.ACCT_TYPE || ACCOUNT_TYPE,
        destinationCountry: DESTINATION_COUNTRY,
        restrictedCountries: AML_RESTRICTED_COUNTRIES,
        custId: requiredFields.CUST_ID
      }, session, req.user?.id, req.ip);
    } catch (amlError) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(500).json({ 
        success: false, 
        code: 'AML_CHECK_FAILED', 
        message: 'Failed to perform AML compliance check', 
        error: amlError.message, 
        timestamp: new Date().toISOString() 
      });
    }

    // Create and save transaction record
    let transaction;
    try {
      transaction = new Transaction({
        ACCT_NO: requiredFields.ACCT_NO,
        ACCT_ID: requiredFields.ACCT_ID,
        BU_ID: requiredFields.BU_ID,
        CUST_ID: requiredFields.CUST_ID,
        ACCT_NM: requiredFields.ACCT_NM,
        AMOUNT: normalizedAmount,
        TRANSACTIONDATE: TRANSACTIONDATE ? new Date(TRANSACTIONDATE) : new Date(),
        TRANSACTION_TYPE: normalizedType,
        TRANSACTION_ID: TRANSACTION_ID,
        EVENT_ID: EVENT_ID,
        TRAN_JOURNAL_ID: JOURNAL_ID,
        reference,
        description,
        currency: account.CURRENCY || 'NGN',
        createdBy: req.user?.id || 'system',
        status: 'PENDING',
        FLAGGED_FOR_AML: amlCheck.isFlagged || false,
        AML_REASON: amlCheck.reason || null,
        AML_THRESHOLD_USED: amlCheck.threshold || 0,
        metadata: {
          ip: req.ip,
          userAgent: req.headers['user-agent'],
          channel: req.headers['x-channel'] || 'API',
          amlCheck: {
            flags: amlCheck.flags || [],
            restrictedCountriesChecked: AML_RESTRICTED_COUNTRIES || [],
            destinationCountry: DESTINATION_COUNTRY || null
          },
          sanctionCheck: {
            checkedAt: new Date().toISOString(),
            isSanctioned: false
          },
          isBulkTransaction
        }
      });

      await transaction.save({ session });
    } catch (saveError) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(500).json({ 
        success: false, 
        code: 'TRANSACTION_SAVE_FAILED', 
        message: 'Failed to save transaction record', 
        error: saveError.message, 
        timestamp: new Date().toISOString() 
      });
    }

    // Create workflow item
    try {
      const newWorkItem = new WF_WORK_ITEM({
        WORK_ITEM_ID,
        BUS_PROC_ID,
        SUB_PROC_ID,
        QUEUE_ID,
        ITEM_VALUE: Buffer.from(String(normalizedAmount)).toString('base64'),
        ITEM_DESC: `${normalizedType} Transaction for ${requiredFields.ACCT_NM}`,
        ITEM_CLASS_NM: 'TRANSACTION',
        EVENT_ID,
        CUST_ID: requiredFields.CUST_ID,
        REC_ST: 'PENDING',
        VERSION: 1,
        ROW_TS: new Date(),
        USER_ID: req.user?.id || 'system',
        BU_ID: requiredFields.BU_ID,
        CREATE_DT: new Date(),
        SYS_CREATE_TS: new Date(),
        WAIT_ST: 'PENDING',
        ITEM_REF_NO: TRANSACTION_ID,
        ITEM_BU_ID: requiredFields.BU_ID,
        ITEM_TYPE: 'TRANSACTION',
        ITEM_ID: transaction._id,
        TARGET_USER_ROLE_ID: 'COMPLIANCE_OFFICER',
        metadata: {
          transactionType: normalizedType,
          amount: normalizedAmount,
          accountNumber: requiredFields.ACCT_NO,
          customerName: requiredFields.ACCT_NM,
          flaggedForAML: amlCheck.isFlagged || false
        }
      });

      await newWorkItem.save({ session });

      await NotificationService.send({
        ROLE_ID: 'COMPLIANCE_OFFICER',
        message: `New transaction requires approval: ${normalizedType} of ${normalizedAmount} for ${requiredFields.ACCT_NM}`,
        WORK_ITEM_ID,
        EVENT_ID,
        CUST_ID: requiredFields.CUST_ID,
        metadata: {
          transactionId: TRANSACTION_ID,
          amount: normalizedAmount,
          account: requiredFields.ACCT_NO
        }
      });

    } catch (workItemError) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(500).json({ 
        success: false, 
        code: 'WORKFLOW_ITEM_CREATION_FAILED', 
        message: 'Failed to create workflow item', 
        error: workItemError.message, 
        timestamp: new Date().toISOString() 
      });
    }

    // Prepare balance update
    const amountMultiplier = {
  CREDIT: 1,
  DEBIT: -1,
  REVERSAL: -1,  // Example of future-proofing
  ADJUSTMENT: 1   // (hypothetical)
}[normalizedType.toUpperCase()] || -1; // Default to debit-like behavior

const balanceUpdate = {
  $inc: {
    LEDGER_BAL: normalizedAmount * amountMultiplier,
    AVAILABLE_BALANCE: normalizedAmount * amountMultiplier,
    CLEARED_BAL: normalizedAmount * amountMultiplier,
    DAILY_TRANSACTION_COUNT: 1
  },
  $set: {
    LAST_TRANSACTION_DATE: new Date(),
    UPDATED_AT: new Date()
  }
};
    // Update account balances
    try {
      await CustomerAccount.updateOne({ ACCT_NO: requiredFields.ACCT_NO }, balanceUpdate, { session });
    } catch (updateError) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(500).json({ 
        success: false, 
        code: 'BALANCE_UPDATE_FAILED', 
        message: 'Failed to update account balances', 
        timestamp: new Date().toISOString() 
      });
    }

    // Commit transaction
    await session.commitTransaction();
    await session.endSession();

    // Return success response
    return res.status(201).json({
      success: true,
      code: 'TRANSACTION_SUCCESS',
      message: 'Transaction processed successfully',
      data: {
        transactionId: TRANSACTION_ID,
        workItemId: WORK_ITEM_ID,
        amount: normalizedAmount,
        status: 'PENDING',
        amlDetails: {
          flagged: amlCheck?.isFlagged || false,
          reason: amlCheck?.reason || null,
          thresholdUsed: amlCheck?.threshold || 0,
          flags: amlCheck?.flags || []
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    // Error handling
    try {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error('Failed to abort transaction:', abortError);
    }

    console.error('Transaction Error:', error.message, error.stack);
    return res.status(500).json({ 
      success: false, 
      code: 'TRANSACTION_FAILED', 
      message: 'Failed to process transaction', 
      error: error.message, 
      timestamp: new Date().toISOString() 
    });
  } finally {
    try {
      await session.endSession();
    } catch (endSessionError) {
      console.error('Failed to end session:', endSessionError);
    }
  }
};


// New function to approve pending transactions
export const approveTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  const { EVENT_ID, JOURNAL_ID } = generateWorkflowIdentifiers();

  try {
    const { workItemId, transactionId, approvalStatus, approvalNotes = '' } = req.body;
    const approverId = req.user?.id || 'system';

    // Convert transactionId to number if it's a string
    const numericTransactionId = typeof transactionId === 'string' 
      ? parseInt(transactionId, 10)
      : transactionId;

    // Validate input
    if (!numericTransactionId || !workItemId || !approvalStatus) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        success: false,
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'Transaction ID, Work Item ID and approval status are required',
        timestamp: new Date().toISOString()
      });
    }

    if (!['APPROVED', 'REJECTED'].includes(approvalStatus)) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        success: false,
        code: 'INVALID_APPROVAL_STATUS',
        message: 'Approval status must be either APPROVED or REJECTED',
        timestamp: new Date().toISOString()
      });
    }

    // Find work item
    const workItem = await WF_WORK_ITEM.findOne({
      WORK_ITEM_ID: workItemId
    }).session(session);

    if (!workItem) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        success: false,
        code: 'WORK_ITEM_NOT_FOUND',
        message: `Work item with ID ${workItemId} not found`,
        timestamp: new Date().toISOString()
      });
    }

    // Find transaction by numeric TRANSACTION_ID
    const transaction = await Transaction.findOne({
      TRANSACTION_ID: numericTransactionId,
      status: { $in: ['PENDING', 'PENDING_APPROVAL'] }
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(404).json({
        success: false,
        code: 'TRANSACTION_NOT_FOUND',
        message: `Pending transaction not found for ID ${numericTransactionId}`,
        timestamp: new Date().toISOString()
      });
    }

    // Verify work item matches transaction (using ObjectId)
    if (workItem.ITEM_ID?.toString() !== transaction._id.toString()) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        success: false,
        code: 'WORK_ITEM_MISMATCH',
        message: 'Work item does not match the transaction',
        details: {
          workItemEntityId: workItem.ITEM_ID?.toString(),
          transactionObjectId: transaction._id.toString(),
          transactionNumericId: transaction.TRANSACTION_ID
        },
        timestamp: new Date().toISOString()
      });
    }

    // Update transaction and work item based on approval status
    if (approvalStatus === 'APPROVED') {
      // Update transaction to ACTIVE and COMPLETED
      transaction.REC_ST = 'ACTIVE';
      transaction.status = 'COMPLETED';
      transaction.APPROVAL_NOTES = approvalNotes;
      transaction.APPROVED_BY = approverId;
      transaction.APPROVAL_DATE = new Date();
      
      // Update work item
      workItem.status = 'COMPLETED';
      workItem.REC_ST = 'ACTIVE';
      workItem.updatedAt = new Date();
    } else {
      // REJECTED case
      transaction.status = 'REJECTED';
      transaction.REJECTION_NOTES = approvalNotes;
      transaction.REJECTED_BY = approverId;
      transaction.REJECTION_DATE = new Date();
      
      // Update work item
      workItem.status = 'REJECTED';
      workItem.REC_ST = 'REJECTED';
      workItem.updatedAt = new Date();
    }

    // Save both transaction and work item
    await transaction.save({ session });
    await workItem.save({ session });

    await session.commitTransaction();
    await session.endSession();

    return res.status(200).json({
      success: true,
      code: `TRANSACTION_${approvalStatus}`,
      message: `Transaction ${approvalStatus.toLowerCase()} successfully`,
      data: {
        transactionId: transaction.TRANSACTION_ID,
        status: transaction.status,
        recordStatus: transaction.REC_ST,
        workItemId,
        workItemStatus: workItem.status,
        workItemRecordStatus: workItem.REC_ST,
        amount: transaction.AMOUNT,
        approvalDate: new Date().toISOString(),
        approvedBy: approverId,
        journalId: transaction.TRAN_JOURNAL_ID
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    try {
      if (session.inTransaction()) await session.abortTransaction();
    } catch (abortError) {
      console.error('Failed to abort transaction:', abortError);
    } finally {
      await session.endSession();
    }

    console.error('Transaction approval error:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      code: 'APPROVAL_PROCESS_FAILED',
      message: 'Failed to process transaction approval',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// New function for bulk transaction creation
export const createBulkTransactions = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactions } = req.body;
    const userId = req.user?.id || 'system';

    // Validate input format
    if (!Array.isArray(transactions)) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'Transactions must be an array',
        timestamp: new Date().toISOString()
      });
    }

    // Validate batch size
    if (transactions.length > 100) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        success: false,
        code: 'BULK_LIMIT_EXCEEDED',
        message: 'Maximum 100 transactions allowed per bulk request',
        timestamp: new Date().toISOString()
      });
    }

    const results = [];
    const errors = [];
    const batchId = generateWorkflowIdentifiers().EVENT_ID; // Generate batch ID

    // Process transactions with concurrency control
    const processingQueue = [];
    const MAX_CONCURRENT = 5; // Process 5 transactions at a time
    let activeProcesses = 0;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      
      // Validate each transaction structure
      if (!tx.ACCT_NO || !tx.AMOUNT || !tx.TRANSACTION_TYPE) {
        errors.push({
          success: false,
          index: i,
          error: {
            code: 'INVALID_TRANSACTION',
            message: 'Missing required fields (ACCT_NO, AMOUNT, or TRANSACTION_TYPE)'
          }
        });
        continue;
      }

      // Queue the transaction processing
      processingQueue.push(async () => {
        try {
          const mockReq = {
            body: {
              ...tx,
              isBulkTransaction: true,
              batchId // Include batch ID for tracking
            },
            user: req.user,
            ip: req.ip,
            headers: req.headers
          };

          // Create a mock response handler
          let responseData;
          const mockRes = {
            status: (code) => ({
              json: (data) => {
                responseData = { status: code, data };
                if (code >= 200 && code < 300) {
                  results.push({
                    success: true,
                    index: i,
                    data: {
                      ...data.data,
                      batchId
                    }
                  });
                } else {
                  errors.push({
                    success: false,
                    index: i,
                    error: {
                      ...data,
                      batchId
                    }
                  });
                }
              }
            })
          };

          // Process the transaction
          await createTransaction(mockReq, mockRes, true);
          
          return responseData;
        } catch (error) {
          errors.push({
            success: false,
            index: i,
            error: {
              message: error.message,
              code: 'BULK_ITEM_ERROR',
              batchId
            }
          });
          return null;
        } finally {
          activeProcesses--;
        }
      });
    }

    // Process the queue with controlled concurrency
    while (processingQueue.length > 0) {
      if (activeProcesses < MAX_CONCURRENT) {
        activeProcesses++;
        const processFn = processingQueue.shift();
        await processFn();
      } else {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Log batch processing result
    await logAuditTrail(
      'BULK_TRANSACTION', 
      batchId, 
      userId, 
      'BATCH_PROCESSED', 
      null, 
      {
        total: transactions.length,
        success: results.length,
        failed: errors.length,
        batchId
      }, 
      req.ip
    );

    // Determine response based on results
    if (results.length === 0 && errors.length > 0) {
      await session.abortTransaction();
      await session.endSession();
      return res.status(400).json({
        success: false,
        code: 'BULK_TRANSACTION_FAILED',
        message: 'All transactions failed',
        batchId,
        errors,
        timestamp: new Date().toISOString()
      });
    }

    // Commit if at least one transaction succeeded
    await session.commitTransaction();
    await session.endSession();

    return res.status(207).json({
      success: true,
      code: errors.length > 0 ? 'BULK_TRANSACTION_PARTIAL' : 'BULK_TRANSACTION_SUCCESS',
      message: errors.length > 0 
        ? 'Bulk transaction processed with some errors' 
        : 'All transactions processed successfully',
      batchId,
      total: transactions.length,
      successful: results.length,
      failed: errors.length,
      results,
      errors,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    try {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
    } catch (abortError) {
      console.error('Failed to abort transaction:', abortError);
    }

    await session.endSession();

    console.error('Bulk Transaction Error:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      code: 'BULK_TRANSACTION_FAILED',
      message: 'Failed to process bulk transactions',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Helper functions
async function updateDepositAccountSummaryForDebit(acctNo, amount, session) {
  const summary = await DepositAccountSummary.findOne({ ACCT_NO: acctNo }).session(session);
  if (!summary) throw new Error(`Deposit account summary not found for account ${acctNo}`);

  if (summary.LEDGER_BAL < amount) {
    throw new Error('Insufficient funds in deposit account summary');
  }

  summary.LEDGER_BAL -= amount;
  summary.CLEARED_BAL -= amount;
  summary.LAST_TRANSACTION_DATE = new Date();
  await summary.save({ session });
}

async function updateDepositAccountSummaryForCredit(acctNo, acctId, amount, session) {
  let summary = await DepositAccountSummary.findOne({ ACCT_NO: acctNo }).session(session);
  
  if (!summary) {
    summary = new DepositAccountSummary({
      ACCT_NO: acctNo,
      ACCT_ID: acctId,
      LEDGER_BAL: amount,
      CLEARED_BAL: amount,
      LAST_TRANSACTION_DATE: new Date()
    });
  } else {
    summary.LEDGER_BAL += amount;
    summary.CLEARED_BAL += amount;
    summary.LAST_TRANSACTION_DATE = new Date();
  }
  
  await summary.save({ session });
}

async function updateLoanAccountSummary(acctNo, amount, session) {
  // Placeholder for actual loan account update logic
  // In a real implementation, you would:
  // 1. Find the loan account
  // 2. Update the principal/disbursed amount or repayment balance
  // 3. Save the changes
  
  console.log(`Loan account ${acctNo} updated by ${amount}`);
  // Implement actual loan account update logic here
};

// ... (rest of the controller methods remain the same)

export const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const query = {};
    
    if (type) query.TRANSACTION_TYPE = type.toUpperCase();
    if (status) query.status = status.toUpperCase();

    const transactions = await Transaction.find(query)
      .sort({ TRANSACTIONDATE: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Transaction.countDocuments(query);

    return res.status(200).json({
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalTransactions: count
    });
  } catch (err) {
    return res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      requestId: req.id || 'none'
    });
  }
};

export const getTransactionByAcctNo = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { ACCT_NO } = req.params;

    const transactions = await Transaction.find({ ACCT_NO })
      .sort({ TRANSACTIONDATE: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Transaction.countDocuments({ ACCT_NO });

    if (!transactions.length) {
      return res.status(404).json({ 
        message: 'No transactions found for this account',
        account: ACCT_NO
      });
    }

    return res.status(200).json({
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalTransactions: count
    });
  } catch (err) {
    return res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      requestId: req.id || 'none'
    });
  }
};



export const deleteTransaction = async (req, res) => {
  const session = await mongoose.startSession({
    readPreference: 'primary', // ⬅️ Required for transactions
    readConcern: { level: 'majority' },
    writeConcern: { w: 'majority' }
  });

  session.startTransaction();

  try {
    const transaction = await Transaction.findOne({ TRANSACTION_ID: req.params.id }).session(session);
    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Reverse the transaction impact if needed
    if (transaction.status === 'COMPLETED') {
      const amount = transaction.AMOUNT;
      const isDebit = transaction.TRANSACTION_TYPE === 'DEBIT';
      const isCredit = transaction.TRANSACTION_TYPE === 'CREDIT';
      const ACCT_NO = transaction.ACCT_NO;

      if (isDebit) {
        await updateDepositAccountSummaryForCredit(ACCT_NO, transaction.ACCT_ID, amount, session);
        await CustomerAccount.updateOne(
          { ACCT_NO },
          {
            $inc: {
              LEDGER_BAL: amount,
              CLEARED_BAL: amount,
              AVAILABLE_BALANCE: amount
            }
          },
          { session }
        );
      } else if (isCredit) {
        await updateDepositAccountSummaryForDebit(ACCT_NO, amount, session);
        await CustomerAccount.updateOne(
          { ACCT_NO },
          {
            $inc: {
              LEDGER_BAL: -amount,
              CLEARED_BAL: -amount,
              AVAILABLE_BALANCE: -amount
            }
          },
          { session }
        );
      }
    }

    await Transaction.deleteOne({ TRANSACTION_ID: req.params.id }).session(session);
    await session.commitTransaction();

    return res.status(200).json({ message: 'Transaction deleted successfully' });

  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      requestId: req.id || 'none'
    });
  } finally {
    session.endSession();
  }
};


export default {
  createTransaction,
  getAllTransactions,
  getTransactionByAcctNo,
  deleteTransaction
};