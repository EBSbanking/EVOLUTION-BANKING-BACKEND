import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { getAllTransactionTypes } from '../constants/transactionTypes.js';
import AMLThreshold from '../models/AMLThreshold.js';
import { checkSanctionList } from '../utils/checkSanctionList.js';
import AML from '../models/AML.js';
import NotificationService from '../services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import logAuditTrail from '../utils/auditHelper.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { createRootSubfolder } from './SubfolderController.js';

// Debug imports to verify they are defined
console.log('Imports:', {
  mongoose,
  Transaction,
  CustomerAccount,
  getAllTransactionTypes,
  AMLThreshold,
  checkSanctionList,
  AML,
  NotificationService,
  WF_WORK_ITEM,
  logAuditTrail,
  generateWorkflowIdentifiers,
  createRootSubfolder
});

// Helper: Check if transaction exceeds dynamic AML threshold
const shouldFlagForAML = async (transactionType, amount) => {
  const rule = await AMLThreshold.findOne({ transaction_type: transactionType, active: true });
  return rule && amount >= rule.threshold_amount;
};

// AML Compliance Check Helper Function
export const checkAMLCompliance = async ({
  transactionType,
  amount,
  currency,
  accountType,
  destinationCountry,
  restrictedCountries,
  custId
}, session, userId, ipAddress, eventId) => {
  try {
    if (!eventId) {
      throw new Error('EVENT_ID is not defined in checkAMLCompliance');
    }
    console.log(`checkAMLCompliance: EVENT_ID=${eventId}`);
    const amlRecord = await AML.findOne({ CUST_ID: custId }).session(session);
    
    if (!amlRecord) {
      await logAuditTrail(
        'AML_CHECK',
        null,
        userId || 'system',
        'AML_RECORD_NOT_FOUND',
        null,
        { custId, result: 'No AML record found', eventId },
        ipAddress || '0.0.0.0',
        'GENERAL',
        { source: 'checkAMLCompliance' }
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
    if (amlRecord.IS_PEP) {
      await logAuditTrail(
        'AML_CHECK',
        null,
        userId || 'system',
        'PEP_CUSTOMER',
        null,
        { custId, result: 'PEP customer', pepDetails: amlRecord.PEP_DETAILS, eventId },
        ipAddress || '0.0.0.0',
        'GENERAL',
        { source: 'checkAMLCompliance' }
      );
      return {
        requiresManualReview: true,
        reason: 'PEP customer',
        isFlagged: true,
        flags: ['PEP'],
        threshold: 0,
        sanctionDetails: null,
        amlDetails: {
          customerType: 'PEP',
          riskLevel: 'high',
          lastVerified: amlRecord.lastVerifiedDate,
          pepDetails: amlRecord.PEP_DETAILS
        }
      };
    }
    if (amlRecord.SANCTION_MATCH) {
      await logAuditTrail(
        'AML_CHECK',
        null,
        userId || 'system',
        'SANCTION_MATCH',
        null,
        { custId, result: 'Sanction match found', details: amlRecord.SANCTION_DETAILS, eventId },
        ipAddress || '0.0.0.0',
        'GENERAL',
        { source: 'checkAMLCompliance' }
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
    const isRestrictedCountry = destinationCountry &&
      restrictedCountries.includes(destinationCountry.toUpperCase());
    
    if (isRestrictedCountry) {
      await logAuditTrail(
        'AML_CHECK',
        null,
        userId || 'system',
        'RESTRICTED_COUNTRY',
        null,
        { custId, destinationCountry, restrictedCountries, result: `Restricted destination country: ${destinationCountry}`, eventId },
        ipAddress || '0.0.0.0',
        'GENERAL',
        { source: 'checkAMLCompliance' }
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
    const thresholds = await AMLThreshold.findOne().sort({ createdAt: -1 });
    const highRiskThreshold = thresholds?.highRisk || 5000000;
    const mediumRiskThreshold = thresholds?.mediumRisk || 1000000;
    
    if (amount >= highRiskThreshold) {
      await logAuditTrail(
        'AML_CHECK',
        null,
        userId || 'system',
        'HIGH_VALUE_TRANSACTION',
        null,
        { custId, amount, currency, threshold: highRiskThreshold, result: `Amount exceeds high risk threshold (${currency}${highRiskThreshold})`, eventId },
        ipAddress || '0.0.0.0',
        'GENERAL',
        { source: 'checkAMLCompliance' }
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
        null,
        userId || 'system',
        'MEDIUM_VALUE_TRANSACTION',
        null,
        { custId, amount, currency, threshold: mediumRiskThreshold, result: `Amount exceeds medium risk threshold (${currency}${mediumRiskThreshold})`, eventId },
        ipAddress || '0.0.0.0',
        'GENERAL',
        { source: 'checkAMLCompliance' }
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
    await logAuditTrail(
      'AML_CHECK',
      null,
      userId || 'system',
      'AML_CLEAR',
      null,
      { custId, amount, currency, result: 'Transaction cleared AML checks', eventId },
      ipAddress || '0.0.0.0',
      'GENERAL',
      { source: 'checkAMLCompliance' }
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
    await logAuditTrail(
      'AML_CHECK',
      null,
      userId || 'system',
      'AML_CHECK_FAILED',
      null,
      { custId, error: error.message, result: 'AML check failed', eventId: eventId || 'UNKNOWN' },
      ipAddress || '0.0.0.0',
      'GENERAL',
      { source: 'checkAMLCompliance' }
    );
    throw error;
  }
};

const createTransaction = async (req, res) => {
  const results = { successful: [], failed: [] };
  try {
    // NEW: Safely handle req.body
    if (!req.body || (req.body.transactions && !Array.isArray(req.body.transactions))) {
      return res.status(400).json({ success: false, code: 'INVALID_PAYLOAD', message: 'Invalid request body' });
    }
    const transactions = Array.isArray(req.body.transactions) ? req.body.transactions : [req.body];

    if (transactions.length === 0) {
      return res.status(400).json({ success: false, code: 'EMPTY_TRANSACTIONS', message: 'No transactions provided' });
    }

    // Log the number of transactions being processed
    await logAuditTrail(
      'TRANSACTION_BATCH',
      null,
      req.user?.id || 'system',
      'BATCH_PROCESS_START',
      null,
      { transactionCount: transactions.length, timestamp: new Date().toISOString() },
      req.ip || '0.0.0.0',
      'GENERAL',
      { source: 'createTransaction' }
    );

    // CHANGED: Smaller chunk for safety; make env-configurable if needed
    const CHUNK_SIZE = process.env.TRANSACTION_CHUNK_SIZE || 100;
    const chunks = [];
    for (let i = 0; i < transactions.length; i += CHUNK_SIZE) {
      chunks.push(transactions.slice(i, i + CHUNK_SIZE));
    }

    for (const chunk of chunks) {
      const session = await mongoose.startSession();
      let sessionCommitted = false;
      try {
        await session.startTransaction({ readPreference: 'primary' });

        for (const tx of chunk) {
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
            isBulkTransaction = transactions.length > 1
          } = tx;

          // NEW: Early trim/guard for strings
          const safeACCT_NO = ACCT_NO ? String(ACCT_NO).trim() : null;
          const safeACCT_ID = ACCT_ID ? String(ACCT_ID).trim() : null;
          const safeCUST_ID = CUST_ID ? String(CUST_ID).trim() : null;
          const safeACCT_NM = ACCT_NM ? String(ACCT_NM).trim() : null;
          const safeRef = reference ? String(reference).trim() : '';
          const safeDesc = description ? String(description).trim() : '';

          // Generate unique identifiers for each transaction
          let identifiers;
          try {
            identifiers = await generateWorkflowIdentifiers();
            console.log(`createTransaction: Generated identifiers for ACCT_NO=${safeACCT_NO}:`, identifiers);
          } catch (idError) {
            await logAuditTrail(/* ... same as before ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to generate identifiers: ${idError.message}`,
              code: 'IDENTIFIER_GENERATION_FAILED'
            });
            continue;
          }
          const {
            TRANSACTION_ID,
            WORK_ITEM_ID,
            BUS_PROC_ID,
            SUB_PROC_ID,
            QUEUE_ID,
            EVENT_ID,
            JOURNAL_ID
          } = identifiers;

          // Validate TRANSACTION_ID (unchanged)
          if (TRANSACTION_ID === null || TRANSACTION_ID === undefined || !Number.isInteger(TRANSACTION_ID) || TRANSACTION_ID <= 0) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Generated TRANSACTION_ID is invalid: ${TRANSACTION_ID}`,
              code: 'INVALID_TRANSACTION_ID'
            });
            continue;
          }

          // Remove AML_THRESHOLD if present (unchanged)
          if ('AML_THRESHOLD' in tx) {
            delete tx.AML_THRESHOLD;
          }

          // Normalize input data
          const normalizedType = TRANSACTION_TYPE ? String(TRANSACTION_TYPE).toUpperCase() : null;
          const normalizedBU_ID = BU_ID !== undefined ? Number(BU_ID) : null;
          let normalizedAmount;
          let normalizedDate;
          try {
            normalizedAmount = parseFloat(AMOUNT);
            if (isNaN(normalizedAmount)) throw new Error('Invalid amount');
            // NEW: Validate date
            normalizedDate = TRANSACTIONDATE ? new Date(TRANSACTIONDATE) : new Date();
            if (isNaN(normalizedDate.getTime())) throw new Error('Invalid transaction date');
          } catch (error) {
            await logAuditTrail(/* ... update error.message ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: error.message.includes('amount') ? 'Invalid amount' : 'Invalid transaction date',
              code: error.message.includes('amount') ? 'INVALID_AMOUNT' : 'INVALID_DATE'
            });
            continue;
          }

          // Validate required fields (UPDATED: Use safe vars)
          const requiredFields = {
            ACCT_NO: safeACCT_NO,
            ACCT_ID: safeACCT_ID,
            BU_ID: normalizedBU_ID,
            CUST_ID: safeCUST_ID,
            ACCT_NM: safeACCT_NM,
            AMOUNT: normalizedAmount,
            TRANSACTION_TYPE: normalizedType
          };
          const missingFields = Object.entries(requiredFields).filter(([_, value]) => !value).map(([key]) => key);
          if (missingFields.length > 0) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Missing required fields: ${missingFields.join(', ')}`,
              code: 'INVALID_INPUT'
            });
            continue;
          }

          // Validate transaction type (unchanged)
          if (!normalizedType || !getAllTransactionTypes().includes(normalizedType)) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Invalid transaction type. Valid types: ${getAllTransactionTypes().join(', ')}`,
              code: 'INVALID_TRANSACTION_TYPE'
            });
            continue;
          }

          // Validate amount range (unchanged)
          if (normalizedAmount <= 0 || normalizedAmount > 1000000000) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: 'Amount must be between ₦0.01 and ₦1,000,000,000',
              code: 'INVALID_AMOUNT'
            });
            continue;
          }

          // Find and validate account (unchanged, but log if !account)
          let account;
          try {
            account = await CustomerAccount.findOne({ ACCT_NO: requiredFields.ACCT_NO })
              .select('LEDGER_BAL AVAILABLE_BALANCE REC_ST CURRENCY ACCT_TYPE')
              .session(session);
            if (!account) throw new Error('Account not found');
          } catch (error) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Account ${requiredFields.ACCT_NO} not found or error occurred: ${error.message}`,
              code: 'ACCOUNT_NOT_FOUND'
            });
            continue;
          }

          // Check account status (unchanged)
          if (account.REC_ST && account.REC_ST !== 'ACTIVE') {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Account ${requiredFields.ACCT_NO} is ${account.REC_ST}`,
              code: 'ACCOUNT_INACTIVE'
            });
            continue;
          }

          // Log transaction initiation (UPDATED: Use safe vars, add date)
          await logAuditTrail(
            'TRANSACTION',
            null,
            req.user?.id || 'system',
            'TRANSACTION_STARTED',
            null,
            {
              account: requiredFields.ACCT_NO,
              amount: normalizedAmount,
              type: normalizedType,
              date: normalizedDate.toISOString(),
              isBulkTransaction,
              transactionId: TRANSACTION_ID,
              eventId: EVENT_ID
            },
            req.ip || '0.0.0.0',
            'GENERAL',
            { source: 'createTransaction' }
          );

          // Perform sanction check (ENHANCED: Deeper validation)
          let sanctionCheck;
          try {
            console.log(`checkSanctionList: EVENT_ID=${EVENT_ID}`);
            sanctionCheck = await checkSanctionList(
              null,
              null,
              requiredFields.ACCT_NM,
              req.user?.id || 'system',
              req.ip || '0.0.0.0',
              EVENT_ID
            );
            // NEW: Validate response shape
            if (!sanctionCheck || typeof sanctionCheck !== 'object' || typeof sanctionCheck.isSanctioned !== 'boolean') {
              throw new Error('Invalid sanction check response structure');
            }
            if (sanctionCheck.isSanctioned) {
              await logAuditTrail(/* ... same ... */);
              results.failed.push({
                account: safeACCT_NO,
                error: 'Customer appears on sanction list',
                code: 'SANCTIONED_CUSTOMER',
                sanctionDetails: sanctionCheck.sanctionDetails
              });
              continue;
            }
            await logAuditTrail(/* ... same ... */);
          } catch (sanctionError) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to perform sanction check: ${sanctionError.message}`,
              code: 'SANCTION_CHECK_FAILED',
              details: sanctionError.message
            });
            continue;
          }

          // Perform AML compliance check (ENHANCED: Similar validation)
          let amlCheck;
          try {
            amlCheck = await checkAMLCompliance({
              transactionType: normalizedType,
              amount: normalizedAmount,
              currency: account.CURRENCY || 'NGN',
              accountType: account.ACCT_TYPE || ACCOUNT_TYPE,
              destinationCountry: DESTINATION_COUNTRY,
              restrictedCountries: AML_RESTRICTED_COUNTRIES,
              custId: requiredFields.CUST_ID
            }, session, req.user?.id || 'system', req.ip || '0.0.0.0', EVENT_ID);
            // NEW: Validate response
            if (!amlCheck || typeof amlCheck !== 'object' || typeof amlCheck.isFlagged !== 'boolean') {
              throw new Error('Invalid AML check response structure');
            }
          } catch (amlError) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to perform AML compliance check: ${amlError.message}`,
              code: 'AML_CHECK_FAILED',
              details: amlError.message
            });
            continue;
          }

          // Create and save transaction record (UPDATED: Use normalizedDate, safe vars)
          let transaction;
          try {
            console.log(`Saving transaction: TRANSACTION_ID=${TRANSACTION_ID}, ACCT_NO=${requiredFields.ACCT_NO}`);
            transaction = new Transaction({
              ACCT_NO: requiredFields.ACCT_NO,
              ACCT_ID: requiredFields.ACCT_ID,
              BU_ID: requiredFields.BU_ID,
              CUST_ID: requiredFields.CUST_ID,
              ACCT_NM: requiredFields.ACCT_NM,
              AMOUNT: normalizedAmount,
              TRANSACTIONDATE: normalizedDate,
              TRANSACTION_TYPE: normalizedType,
              TRANSACTION_ID: TRANSACTION_ID,
              EVENT_ID: EVENT_ID,
              TRAN_JOURNAL_ID: JOURNAL_ID,
              reference: safeRef,
              description: safeDesc,
              currency: account.CURRENCY || 'NGN',
              createdBy: req.user?.id || 'system',
              status: 'PENDING',
              FLAGGED_FOR_AML: amlCheck.isFlagged || false,
              AML_REASON: amlCheck.reason || null,
              AML_THRESHOLD_USED: amlCheck.threshold || 0,
              metadata: {
                ip: req.ip || '0.0.0.0',
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
            console.error(`Transaction save failed for ACCT_NO=${requiredFields.ACCT_NO}:`, saveError);
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to save transaction: ${saveError.message}`,
              code: 'TRANSACTION_SAVE_FAILED'
            });
            continue;
          }

          // Create subfolder for the transaction (unchanged)
          try {
            const subfolder = await createRootSubfolder(TRANSACTION_ID, {
              GL_ACCT_NO: requiredFields.ACCT_NO,
              createdBy: req.user?.id || 'system',
              description: safeDesc || `${normalizedType} Subfolder`
            }, { session });
            console.log(`Created subfolder for transaction ${TRANSACTION_ID}:`, subfolder);
          } catch (subfolderError) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to create subfolder: ${subfolderError.message}`,
              code: 'SUBFOLDER_CREATION_FAILED'
            });
            continue;
          }

          // Validate WF_WORK_ITEM model (unchanged)
          if (!WF_WORK_ITEM) {
            await logAuditTrail(/* add log for model missing */);
            results.failed.push({
              account: safeACCT_NO,
              error: 'Workflow model not available',
              code: 'MODEL_NOT_FOUND'
            });
            continue;
          }

          // Check for existing EVENT_ID (unchanged)
          const existingEvent = await WF_WORK_ITEM.findOne({ EVENT_ID }).session(session);
          if (existingEvent) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Event ID ${EVENT_ID} already exists`,
              code: 'DUPLICATE_EVENT_ID'
            });
            continue;
          }

          // Create workflow item (UPDATED: Use safe vars)
          try {
            const newWorkItem = new WF_WORK_ITEM({
              WORK_ITEM_ID,
              processId: BUS_PROC_ID,
              currentStep: SUB_PROC_ID,
              QUEUE_ID,
              entityId: transaction._id,
              entityType: 'TRANSACTION',
              assignedTo: 'COMPLIANCE_OFFICER',
              ITEM_DESC: `${normalizedType} Transaction for ${requiredFields.ACCT_NM}`,
              CUST_ID: requiredFields.CUST_ID,
              REC_ST: 'Active',
              VERSION: 1,
              ROW_TS: new Date(),
              createdBy: req.user?.id || 'system',
              BU_ID: requiredFields.BU_ID,
              CREATE_DT: new Date(),
              SYS_CREATE_TS: new Date(),
              status: 'PENDING',
              ITEM_REF_NO: TRANSACTION_ID,
              ITEM_BU_ID: requiredFields.BU_ID,
              ITEM_TYPE: 'TRANSACTION',
              EVENT_ID,
              JOURNAL_ID,
              TRANSACTION_ID,
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
              status: 'pending',
              notificationType: 'system',
              metadata: {
                transactionId: TRANSACTION_ID,
                amount: normalizedAmount,
                account: requiredFields.ACCT_NO
              }
            }, { session });
          } catch (workItemError) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to create workflow item: ${workItemError.message}`,
              code: 'WORKFLOW_ITEM_CREATION_FAILED'
            });
            continue;
          }

          // Prepare balance update (ENHANCED: Log unknown type)
          const amountMultiplier = {
            CREDIT: 1,
            DEBIT: -1,
            REVERSAL: -1,
            ADJUSTMENT: 1
          }[normalizedType.toUpperCase()] || -1;
          if (amountMultiplier === -1 && !['CREDIT', 'DEBIT', 'REVERSAL', 'ADJUSTMENT'].includes(normalizedType)) {
            console.warn(`Unknown transaction type ${normalizedType} defaulting to debit multiplier`);
          }
          const balanceUpdate = {
            $inc: {
              LEDGER_BAL: normalizedAmount * amountMultiplier,
              AVAILABLE_BALANCE: normalizedAmount * amountMultiplier,
              CLEARED_BAL: normalizedAmount * amountMultiplier
            },
            $set: {
              LAST_TRANSACTION_DATE: new Date(),
              UPDATED_AT: new Date()
            }
          };

          // Update account balances (unchanged)
          try {
            await CustomerAccount.updateOne({ ACCT_NO: requiredFields.ACCT_NO }, balanceUpdate, { session });
          } catch (updateError) {
            await logAuditTrail(/* ... same ... */);
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to update account balances: ${updateError.message}`,
              code: 'BALANCE_UPDATE_FAILED'
            });
            continue;
          }

          // Record successful transaction (UPDATED: Add eventId)
          results.successful.push({
            transactionId: TRANSACTION_ID,
            workItemId: WORK_ITEM_ID,
            eventId: EVENT_ID,  // NEW
            account: safeACCT_NO,
            amount: normalizedAmount,
            status: 'PENDING',
            amlDetails: {
              flagged: amlCheck?.isFlagged || false,
              reason: amlCheck?.reason || null,
              thresholdUsed: amlCheck?.threshold || 0,
              flags: amlCheck?.flags || []
            }
          });
        }

        // Commit transaction for this chunk if there are successful transactions
        if (results.successful.length > 0 || chunk.some(tx => results.successful.some(s => s.account === tx.ACCT_NO))) {  // MINOR: More precise check if needed
          await session.commitTransaction();
          sessionCommitted = true;
        } else {
          await session.abortTransaction();
        }
      } catch (chunkError) {
        if (!sessionCommitted) {
          try {
            await session.abortTransaction();
          } catch (abortError) {
            console.error('Failed to abort transaction:', abortError);
          }
        }
        await logAuditTrail(/* ... same ... */);
        // CHANGED: More specific failed push for chunk errors
        results.failed.push({
          account: 'BATCH_CHUNK',
          error: `Failed to process transaction chunk: ${chunkError.message}`,
          code: 'CHUNK_PROCESS_FAILED',
          details: { chunkIndex: chunks.indexOf(chunk), errorStack: chunkError.stack }
        });
      } finally {
        await session.endSession();
      }
    }

    // If no transactions succeeded, return failure (unchanged)
    if (results.successful.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'NO_TRANSACTIONS_PROCESSED',
        message: 'No transactions were processed successfully',
        results: results.failed,
        timestamp: new Date().toISOString()
      });
    }

    // Log successful transactions (UPDATED: Use eventId from success)
    for (const success of results.successful) {
      await logAuditTrail(
        'TRANSACTION',
        null,
        req.user?.id || 'system',
        'TRANSACTION_SUCCESS',
        null,
        {
          account: success.account,
          amount: success.amount,
          transactionId: success.transactionId,
          eventId: success.eventId  // FIXED: Now available
        },
        req.ip || '0.0.0.0',
        'GENERAL',
        { source: 'createTransaction' }
      );
    }

    // Return response with successful and failed transactions (unchanged)
    return res.status(207).json({
      success: true,
      code: 'TRANSACTIONS_PROCESSED',
      message: `Processed ${results.successful.length} successful and ${results.failed.length} failed transactions`,
      data: {
        successful: results.successful,
        failed: results.failed
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // FIXED: Ensure results is always defined in catch (minor, but safe)
    const safeResults = results || { successful: [], failed: [] };
    await logAuditTrail(
      'TRANSACTION',
      null,
      req.user?.id || 'system',
      'TRANSACTION_FAILED',
      null,
      {
        error: error.message,
        transactionId: 'UNKNOWN',
        eventId: 'UNKNOWN',
        stack: error.stack,
        requestBody: req.body ? JSON.stringify(req.body).substring(0, 1000) : 'EMPTY'  // Truncate for log
      },
      req.ip || '0.0.0.0',
      'GENERAL',
      { source: 'createTransaction' }
    );
    console.error('Transaction Error:', error.message, error.stack);
    return res.status(500).json({
      success: false,
      code: 'TRANSACTION_FAILED',
      message: 'Failed to process transactions',
      error: error.message,
      results: safeResults,
      timestamp: new Date().toISOString()
    });
  }
};

export { createTransaction };


// Debug imports to verify they are defined
console.log('approveTransaction Imports:', {
  mongoose,
  Transaction,
  WF_WORK_ITEM,
  logAuditTrail,
  generateWorkflowIdentifiers,
  NotificationService
});

export const approveTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  let sessionCommitted = false;
  let EVENT_ID = 'UNKNOWN';
  let JOURNAL_ID = 'UNKNOWN';

  try {
    // Validate req.body
    if (!req.body || typeof req.body !== 'object') {
      throw new Error('Request body is missing or invalid');
    }

    // Generate identifiers early to ensure EVENT_ID is available
    const identifiers = await generateWorkflowIdentifiers();
    EVENT_ID = identifiers.EVENT_ID || 'UNKNOWN';
    JOURNAL_ID = identifiers.JOURNAL_ID || 'UNKNOWN';
    console.log('Generated identifiers:', { EVENT_ID, JOURNAL_ID });

    // Validate generated EVENT_ID
    if (!EVENT_ID || EVENT_ID === 'UNKNOWN') {
      throw new Error('Failed to generate valid EVENT_ID');
    }

    const { workItemId, transactionId, approvalStatus, approvalNotes = '' } = req.body;
    const approverId = req.user?.id || 'system';

    // Validate input
    if (!workItemId || !transactionId || !approvalStatus) {
      throw new Error('Transaction ID, Work Item ID, and approval status are required');
    }

    // Convert transactionId to number if it's a string
    const numericTransactionId = typeof transactionId === 'string'
      ? parseInt(transactionId, 10)
      : transactionId;

    if (isNaN(numericTransactionId) || numericTransactionId <= 0) {
      throw new Error('Invalid Transaction ID');
    }

    if (!['APPROVED', 'REJECTED'].includes(approvalStatus)) {
      throw new Error('Approval status must be either APPROVED or REJECTED');
    }

    await session.startTransaction({ readPreference: 'primary' });

    // Log approval attempt
    await logAuditTrail(
      'TRANSACTION_APPROVAL',
      null,
      approverId,
      'APPROVAL_ATTEMPT',
      null,
      {
        workItemId,
        transactionId: numericTransactionId,
        approvalStatus,
        eventId: EVENT_ID,
        journalId: JOURNAL_ID,
        requestBody: req.body
      },
      req.ip || '::1',
      'GENERAL',
      { source: 'approveTransaction' }
    );

    // Debug Transaction.findOne query
    console.log('Finding transaction with:', {
      TRANSACTION_ID: numericTransactionId,
      status: ['PENDING', 'PENDING_APPROVAL']
    });

    // Find transaction by numeric TRANSACTION_ID
    const transaction = await Transaction.findOne({
      TRANSACTION_ID: numericTransactionId,
      status: { $in: ['PENDING', 'PENDING_APPROVAL'] }
    }).session(session);

    if (!transaction) {
      throw new Error(`Pending transaction not found for ID ${numericTransactionId}`);
    }

    // Debug work item query
    console.log('Finding work item with:', { WORK_ITEM_ID: workItemId });

    // Find work item
    const workItem = await WF_WORK_ITEM.findOne({
      WORK_ITEM_ID: workItemId
    }).session(session);

    if (!workItem) {
      throw new Error(`Work item with ID ${workItemId} not found`);
    }

    // Verify work item matches transaction (using ObjectId)
    if (workItem.ITEM_ID?.toString() !== transaction._id.toString()) {
      throw new Error('Work item does not match the transaction');
    }

    // Update transaction and work item based on approval status
    if (approvalStatus === 'APPROVED') {
      transaction.REC_ST = 'ACTIVE';
      transaction.status = 'COMPLETED';
      transaction.APPROVAL_NOTES = approvalNotes;
      transaction.APPROVED_BY = approverId;
      transaction.APPROVAL_DATE = new Date();

      workItem.status = 'COMPLETED';
      workItem.REC_ST = 'ACTIVE';
      workItem.updatedAt = new Date();
    } else {
      transaction.status = 'REJECTED';
      transaction.REJECTION_NOTES = approvalNotes;
      transaction.REJECTED_BY = approverId;
      transaction.REJECTION_DATE = new Date();

      workItem.status = 'REJECTED';
      workItem.REC_ST = 'REJECTED';
      workItem.updatedAt = new Date();
    }

    // Debug saving documents
    console.log('Saving transaction:', transaction);
    console.log('Saving work item:', workItem);

    // Save both transaction and work item
    await transaction.save({ session });
    await workItem.save({ session });

    // Send notification
    try {
      console.log('Sending notification with:', {
        ROLE_ID: workItem.assignedTo || 'COMPLIANCE_OFFICER',
        WORK_ITEM_ID: workItemId,
        EVENT_ID,
        CUST_ID: transaction.CUST_ID
      });
      await NotificationService.send({
        ROLE_ID: workItem.assignedTo || 'COMPLIANCE_OFFICER',
        message: `Transaction ${approvalStatus.toLowerCase()}: ${transaction.TRANSACTION_TYPE} of ${transaction.AMOUNT} for ${transaction.ACCT_NM}`,
        WORK_ITEM_ID: workItemId,
        EVENT_ID,
        CUST_ID: transaction.CUST_ID,
        status: approvalStatus.toLowerCase(),
        notificationType: 'system',
        metadata: {
          transactionId: numericTransactionId,
          amount: transaction.AMOUNT,
          account: transaction.ACCT_NO,
          approvalStatus,
          approvalNotes,
          eventId: EVENT_ID
        }
      }, { session });
    } catch (notificationError) {
      console.error('Notification failed:', {
        error: notificationError.message,
        stack: notificationError.stack,
        workItemId,
        transactionId: numericTransactionId,
        eventId: EVENT_ID
      });
      await logAuditTrail(
        'NOTIFICATION',
        null,
        approverId,
        'NOTIFICATION_FAILED',
        null,
        {
          workItemId,
          transactionId: numericTransactionId,
          error: notificationError.message,
          eventId: EVENT_ID,
          journalId: JOURNAL_ID
        },
        req.ip || '::1',
        'GENERAL',
        { source: 'approveTransaction' }
      );
    }

    // Log successful approval
    await logAuditTrail(
      'TRANSACTION_APPROVAL',
      null,
      approverId,
      `TRANSACTION_${approvalStatus}`,
      null,
      {
        workItemId,
        transactionId: numericTransactionId,
        approvalStatus,
        eventId: EVENT_ID,
        journalId: JOURNAL_ID,
        amount: transaction.AMOUNT,
        account: transaction.ACCT_NO
      },
      req.ip || '::1',
      'GENERAL',
      { source: 'approveTransaction' }
    );

    await session.commitTransaction();
    sessionCommitted = true;

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
        journalId: JOURNAL_ID
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    if (!sessionCommitted && session.inTransaction()) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error('Failed to abort transaction:', {
          error: abortError.message,
          stack: abortError.stack,
          eventId: EVENT_ID,
          journalId: JOURNAL_ID
        });
      }
    }

    const safeBody = req.body || {};
    await logAuditTrail(
      'TRANSACTION_APPROVAL',
      null,
      req.user?.id || 'system',
      'APPROVAL_PROCESS_FAILED',
      null,
      {
        workItemId: safeBody.workItemId || 'UNKNOWN',
        transactionId: safeBody.transactionId || 'UNKNOWN',
        error: error.message,
        eventId: EVENT_ID,
        journalId: JOURNAL_ID,
        requestBody: safeBody,
        stack: error.stack,
        bodyDefined: !!req.body
      },
      req.ip || '::1',
      'GENERAL',
      { source: 'approveTransaction' }
    );

    console.error('Transaction approval error:', {
      error: error.message,
      stack: error.stack,
      body: safeBody,
      bodyDefined: !!req.body,
      eventId: EVENT_ID,
      journalId: JOURNAL_ID,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      code: 'APPROVAL_PROCESS_FAILED',
      message: 'Failed to process transaction approval',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    await session.endSession();
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