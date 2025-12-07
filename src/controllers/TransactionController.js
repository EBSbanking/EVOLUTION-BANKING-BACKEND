// controllers/TransactionController.js - FIXED VERSION
import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { getAllTransactionTypes } from '../constants/transactionTypes.js';
import AMLThreshold from '../models/AMLThreshold.js';
import { checkSanctionList } from '../utils/checkSanctionList.js';
import AML from '../models/AML.js';
import NotificationService from '../Services/NotificationService.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import logAuditTrail from '../utils/auditHelper.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';
import { createRootSubfolder } from './SubfolderController.js';

// FIXED createTransaction function - Updated section
const createTransaction = async (req, res) => {
  const results = { successful: [], failed: [] };
  try {
    // Validate request body
    if (!req.body || (req.body.transactions && !Array.isArray(req.body.transactions))) {
      return res.status(400).json({ 
        success: false, 
        code: 'INVALID_PAYLOAD', 
        message: 'Invalid request body' 
      });
    }
    
    const transactions = Array.isArray(req.body.transactions) ? req.body.transactions : [req.body];

    if (transactions.length === 0) {
      return res.status(400).json({ 
        success: false, 
        code: 'EMPTY_TRANSACTIONS', 
        message: 'No transactions provided' 
      });
    }

    // Log batch start
    await logAuditTrail(
      'TRANSACTION_BATCH',
      null,
      req.user?.id || 'system',
      'BATCH_PROCESS_START',
      null,
      { 
        transactionCount: transactions.length, 
        timestamp: new Date().toISOString() 
      },
      req.ip || '0.0.0.0',
      'GENERAL',
      { source: 'createTransaction' }
    );

    // Process in chunks
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

          // CRITICAL FIX: Clean up any temp_ transactionId from input
          if (tx.transactionId && tx.transactionId.startsWith('temp_')) {
            console.warn('Removing temp_ transactionId from input:', tx.transactionId);
            delete tx.transactionId;
          }

          // Safe string handling
          const safeACCT_NO = ACCT_NO ? String(ACCT_NO).trim() : null;
          const safeACCT_ID = ACCT_ID ? String(ACCT_ID).trim() : null;
          const safeCUST_ID = CUST_ID ? String(CUST_ID).trim() : null;
          const safeACCT_NM = ACCT_NM ? String(ACCT_NM).trim() : null;
          const safeRef = reference ? String(reference).trim() : '';
          const safeDesc = description ? String(description).trim() : '';

          // Generate unique identifiers
          let identifiers;
          try {
            identifiers = await generateWorkflowIdentifiers();
            console.log(`Generated identifiers for ACCT_NO=${safeACCT_NO}:`, identifiers);
          } catch (idError) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'IDENTIFIER_GENERATION_FAILED',
              null,
              {
                account: safeACCT_NO,
                error: idError.message,
                code: 'IDENTIFIER_GENERATION_FAILED'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
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

          // Validate TRANSACTION_ID
          if (!TRANSACTION_ID || !Number.isInteger(TRANSACTION_ID) || TRANSACTION_ID <= 0) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'INVALID_TRANSACTION_ID',
              null,
              {
                account: safeACCT_NO,
                transactionId: TRANSACTION_ID,
                code: 'INVALID_TRANSACTION_ID'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Generated TRANSACTION_ID is invalid: ${TRANSACTION_ID}`,
              code: 'INVALID_TRANSACTION_ID'
            });
            continue;
          }

          // Normalize input data
          const normalizedType = TRANSACTION_TYPE ? String(TRANSACTION_TYPE).toUpperCase() : null;
          const normalizedBU_ID = BU_ID !== undefined ? Number(BU_ID) : null;
          let normalizedAmount;
          let normalizedDate;
          try {
            normalizedAmount = parseFloat(AMOUNT);
            if (isNaN(normalizedAmount)) throw new Error('Invalid amount');
            normalizedDate = TRANSACTIONDATE ? new Date(TRANSACTIONDATE) : new Date();
            if (isNaN(normalizedDate.getTime())) throw new Error('Invalid transaction date');
          } catch (error) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'INVALID_INPUT',
              null,
              {
                account: safeACCT_NO,
                error: error.message,
                code: error.message.includes('amount') ? 'INVALID_AMOUNT' : 'INVALID_DATE'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: error.message,
              code: error.message.includes('amount') ? 'INVALID_AMOUNT' : 'INVALID_DATE'
            });
            continue;
          }

          // Validate required fields
          const requiredFields = {
            ACCT_NO: safeACCT_NO,
            ACCT_ID: safeACCT_ID,
            BU_ID: normalizedBU_ID,
            CUST_ID: safeCUST_ID,
            ACCT_NM: safeACCT_NM,
            AMOUNT: normalizedAmount,
            TRANSACTION_TYPE: normalizedType
          };
          
          const missingFields = Object.entries(requiredFields)
            .filter(([_, value]) => !value)
            .map(([key]) => key);
            
          if (missingFields.length > 0) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'MISSING_FIELDS',
              null,
              {
                account: safeACCT_NO,
                missingFields,
                code: 'MISSING_FIELDS'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Missing required fields: ${missingFields.join(', ')}`,
              code: 'MISSING_FIELDS'
            });
            continue;
          }

          // Validate transaction type
          if (!normalizedType || !getAllTransactionTypes().includes(normalizedType)) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'INVALID_TRANSACTION_TYPE',
              null,
              {
                account: safeACCT_NO,
                type: normalizedType,
                validTypes: getAllTransactionTypes(),
                code: 'INVALID_TRANSACTION_TYPE'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Invalid transaction type: ${normalizedType}. Valid types: ${getAllTransactionTypes().join(', ')}`,
              code: 'INVALID_TRANSACTION_TYPE'
            });
            continue;
          }

          // Find and validate account
          let account;
          try {
            account = await CustomerAccount.findOne({ ACCT_NO: requiredFields.ACCT_NO })
              .select('LEDGER_BAL AVAILABLE_BALANCE REC_ST CURRENCY ACCT_TYPE')
              .session(session);
            if (!account) throw new Error('Account not found');
          } catch (error) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'ACCOUNT_NOT_FOUND',
              null,
              {
                account: safeACCT_NO,
                error: error.message,
                code: 'ACCOUNT_NOT_FOUND'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Account ${requiredFields.ACCT_NO} not found: ${error.message}`,
              code: 'ACCOUNT_NOT_FOUND'
            });
            continue;
          }

          // Check account status
          if (account.REC_ST && account.REC_ST !== 'ACTIVE') {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'ACCOUNT_INACTIVE',
              null,
              {
                account: safeACCT_NO,
                status: account.REC_ST,
                code: 'ACCOUNT_INACTIVE'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Account ${requiredFields.ACCT_NO} is ${account.REC_ST}`,
              code: 'ACCOUNT_INACTIVE'
            });
            continue;
          }

          // CRITICAL: Create transaction WITHOUT transactionId field
          // The model's pre-validate hook will generate it from TRANSACTION_ID
          console.log(`Creating transaction: TRANSACTION_ID=${TRANSACTION_ID}, ACCT_NO=${requiredFields.ACCT_NO}`);
          
          let transaction;
          try {
            transaction = new Transaction({
              ACCT_NO: requiredFields.ACCT_NO,
              ACCT_ID: requiredFields.ACCT_ID,
              BU_ID: requiredFields.BU_ID,
              CUST_ID: requiredFields.CUST_ID,
              ACCT_NM: requiredFields.ACCT_NM,
              AMOUNT: normalizedAmount,
              TRANSACTIONDATE: normalizedDate,
              TRANSACTION_TYPE: normalizedType,
              TRANSACTION_ID: TRANSACTION_ID, // Will be used to generate transactionId
              EVENT_ID: EVENT_ID,
              TRAN_JOURNAL_ID: JOURNAL_ID,
              REFERENCE: `TXN${TRANSACTION_ID.toString().padStart(10, '0')}`, // Generate reference
              description: safeDesc,
              currency: account.CURRENCY || 'NGN',
              createdBy: req.user?.id || 'system',
              status: 'PENDING',
              // DO NOT set transactionId here - let model generate it
              metadata: {
                ip: req.ip || '0.0.0.0',
                userAgent: req.headers['user-agent'],
                channel: req.headers['x-channel'] || 'API',
                isBulkTransaction
              }
            });
            
            await transaction.save({ session });
            
            console.log('Transaction saved with IDs:', {
              TRANSACTION_ID: transaction.TRANSACTION_ID,
              transactionId: transaction.transactionId, // Should be generated by model
              REFERENCE: transaction.REFERENCE
            });
            
          } catch (saveError) {
            console.error(`Transaction save failed for ACCT_NO=${requiredFields.ACCT_NO}:`, saveError);
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'TRANSACTION_SAVE_FAILED',
              null,
              {
                account: safeACCT_NO,
                error: saveError.message,
                code: 'TRANSACTION_SAVE_FAILED'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to save transaction: ${saveError.message}`,
              code: 'TRANSACTION_SAVE_FAILED'
            });
            continue;
          }

          // Verify transactionId was generated correctly
          if (!transaction.transactionId || transaction.transactionId.startsWith('temp_')) {
            console.error('TransactionId was not generated properly:', transaction.transactionId);
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'TRANSACTION_ID_GENERATION_FAILED',
              null,
              {
                account: safeACCT_NO,
                transactionId: transaction.transactionId,
                expected: `TXN${TRANSACTION_ID.toString().padStart(10, '0')}`,
                code: 'TRANSACTION_ID_GENERATION_FAILED'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: 'Transaction ID generation failed',
              code: 'TRANSACTION_ID_GENERATION_FAILED'
            });
            continue;
          }

          // Create subfolder for the transaction
          try {
            const subfolder = await createRootSubfolder(TRANSACTION_ID, {
              GL_ACCT_NO: requiredFields.ACCT_NO,
              createdBy: req.user?.id || 'system',
              description: safeDesc || `${normalizedType} Subfolder`
            }, { session });
            console.log(`Created subfolder for transaction ${TRANSACTION_ID}:`, subfolder);
          } catch (subfolderError) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'SUBFOLDER_CREATION_FAILED',
              null,
              {
                account: safeACCT_NO,
                error: subfolderError.message,
                code: 'SUBFOLDER_CREATION_FAILED'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to create subfolder: ${subfolderError.message}`,
              code: 'SUBFOLDER_CREATION_FAILED'
            });
            continue;
          }

          // Create workflow item
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
                customerName: requiredFields.ACCT_NM
              }
            });
            
            await newWorkItem.save({ session });
            
            // Send notification
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
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'WORKFLOW_ITEM_CREATION_FAILED',
              null,
              {
                account: safeACCT_NO,
                error: workItemError.message,
                code: 'WORKFLOW_ITEM_CREATION_FAILED'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to create workflow item: ${workItemError.message}`,
              code: 'WORKFLOW_ITEM_CREATION_FAILED'
            });
            continue;
          }

          // Update account balances
          try {
            const amountMultiplier = {
              CREDIT: 1,
              DEBIT: -1,
              REVERSAL: -1,
              ADJUSTMENT: 1
            }[normalizedType.toUpperCase()] || -1;
            
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
            
            await CustomerAccount.updateOne(
              { ACCT_NO: requiredFields.ACCT_NO }, 
              balanceUpdate, 
              { session }
            );
          } catch (updateError) {
            await logAuditTrail(
              'TRANSACTION',
              null,
              req.user?.id || 'system',
              'BALANCE_UPDATE_FAILED',
              null,
              {
                account: safeACCT_NO,
                error: updateError.message,
                code: 'BALANCE_UPDATE_FAILED'
              },
              req.ip || '0.0.0.0',
              'GENERAL',
              { source: 'createTransaction' }
            );
            results.failed.push({
              account: safeACCT_NO,
              error: `Failed to update account balances: ${updateError.message}`,
              code: 'BALANCE_UPDATE_FAILED'
            });
            continue;
          }

          // Record successful transaction
          results.successful.push({
            transactionId: TRANSACTION_ID,
            transactionIdString: transaction.transactionId, // The proper string ID
            workItemId: WORK_ITEM_ID,
            eventId: EVENT_ID,
            account: safeACCT_NO,
            amount: normalizedAmount,
            status: 'PENDING',
            reference: transaction.REFERENCE
          });
        }

        // Commit transaction for this chunk
        if (results.successful.length > 0) {
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
        await logAuditTrail(
          'TRANSACTION',
          null,
          req.user?.id || 'system',
          'CHUNK_PROCESS_FAILED',
          null,
          {
            error: chunkError.message,
            code: 'CHUNK_PROCESS_FAILED'
          },
          req.ip || '0.0.0.0',
          'GENERAL',
          { source: 'createTransaction' }
        );
        results.failed.push({
          account: 'BATCH_CHUNK',
          error: `Failed to process transaction chunk: ${chunkError.message}`,
          code: 'CHUNK_PROCESS_FAILED'
        });
      } finally {
        await session.endSession();
      }
    }

    // If no transactions succeeded
    if (results.successful.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'NO_TRANSACTIONS_PROCESSED',
        message: 'No transactions were processed successfully',
        results: results.failed,
        timestamp: new Date().toISOString()
      });
    }

    // Log successful transactions
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
          transactionIdString: success.transactionIdString,
          eventId: success.eventId
        },
        req.ip || '0.0.0.0',
        'GENERAL',
        { source: 'createTransaction' }
      );
    }

    // Return response
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
        stack: error.stack
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

// Rest of the controller functions remain the same...
// (approveTransaction, createBulkTransactions, getAllTransactions, etc.)





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


export {
  createTransaction,
  
  
 

 
};
