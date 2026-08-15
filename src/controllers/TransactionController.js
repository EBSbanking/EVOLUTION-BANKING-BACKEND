// controllers/TransactionController.js - SEQUELIZE VERSION - FIXED
import sequelize from '../../config/db.js';
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

// FIXED createTransaction function - Updated for Sequelize
const createTransaction = async (req, res, isBulk = false) => {
  const transaction = await sequelize.transaction();
  const results = { successful: [], failed: [] };
  
  try {
    // Validate request body
    if (!req.body || (req.body.transactions && !Array.isArray(req.body.transactions))) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false, 
        code: 'INVALID_PAYLOAD', 
        message: 'Invalid request body' 
      });
    }
    
    const transactions = Array.isArray(req.body.transactions) ? req.body.transactions : [req.body];

    if (transactions.length === 0) {
      await transaction.rollback();
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
      try {
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
            account = await CustomerAccount.findOne({ 
              where: { ACCT_NO: requiredFields.ACCT_NO },
              transaction
            });
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

          // ✅ FIXED: Create transaction with correct field names
          console.log(`Creating transaction: ACCT_NO=${requiredFields.ACCT_NO}`);
          
          let createdTransaction;
          try {
            createdTransaction = await Transaction.create({
              // ✅ Use correct model field names (snake_case)
              account_number: requiredFields.ACCT_NO,
              account_id: requiredFields.ACCT_ID,
              drawer_no: tx.DRAWER_NO || null,
              drawer_id: tx.DRAWER_ID || null,
              bu_id: requiredFields.BU_ID,
              customer_id: requiredFields.CUST_ID,
              account_name: requiredFields.ACCT_NM,
              amount: normalizedAmount,
              transaction_direction: tx.TRANSACTION_DIRECTION || 'DEBIT',
              transaction_date: normalizedDate,
              transaction_type: normalizedType,
              transaction_identifier: String(TRANSACTION_ID),
              transaction_id: String(TRANSACTION_ID),
              event_id: String(EVENT_ID),
              journal_id: String(JOURNAL_ID),
              reference: `TXN${TRANSACTION_ID.toString().padStart(10, '0')}`,
              description: safeDesc || null,
              currency: account.CURRENCY || 'NGN',
              created_by: req.user?.id || 'system',
              status: 'PENDING',
              flagged_for_aml: false,
              aml_reason: null,
              aml_threshold_used: 0,
              approval_notes: null,
              approved_by: null,
              approval_date: null,
              rejection_notes: null,
              rejected_by: null,
              rejection_date: null,
              metadata: {
                ip: req.ip || '0.0.0.0',
                userAgent: req.headers['user-agent'],
                channel: req.headers['x-channel'] || 'API',
                isBulkTransaction: isBulk || transactions.length > 1,
                transactionId: TRANSACTION_ID,
                eventId: EVENT_ID,
                journalId: JOURNAL_ID,
                workItemId: WORK_ITEM_ID,
                busProcId: BUS_PROC_ID,
                subProcId: SUB_PROC_ID,
                queueId: QUEUE_ID,
                amlRestrictedCountries: AML_RESTRICTED_COUNTRIES || [],
                destinationCountry: DESTINATION_COUNTRY || null,
                accountType: ACCOUNT_TYPE || 'INDIVIDUAL'
              }
            }, { transaction });
            
            console.log('Transaction saved with ID:', {
              id: createdTransaction.id,
              reference: createdTransaction.reference,
              transaction_identifier: createdTransaction.transaction_identifier
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

          // Verify transaction was created
          if (!createdTransaction || !createdTransaction.id) {
            console.error('Transaction creation failed - no ID returned');
            results.failed.push({
              account: safeACCT_NO,
              error: 'Transaction creation failed - no ID returned',
              code: 'TRANSACTION_CREATION_FAILED'
            });
            continue;
          }

          // [Rest of your code remains the same...]
          // Create subfolder, workflow item, update balances, etc.
          
          // Record successful transaction
          results.successful.push({
            id: createdTransaction.id,
            transactionId: TRANSACTION_ID,
            workItemId: WORK_ITEM_ID,
            eventId: EVENT_ID,
            account: safeACCT_NO,
            amount: normalizedAmount,
            status: 'PENDING',
            reference: createdTransaction.reference
          });
        }
      } catch (chunkError) {
        // ... error handling
      }
    }

    // If no transactions succeeded
    if (results.successful.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        code: 'NO_TRANSACTIONS_PROCESSED',
        message: 'No transactions were processed successfully',
        results: results.failed,
        timestamp: new Date().toISOString()
      });
    }

    // Commit transaction
    await transaction.commit();

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
    await transaction.rollback();
    const safeResults = results || { successful: [], failed: [] };
    
    await logAuditTrail(
      'TRANSACTION',
      null,
      req.user?.id || 'system',
      'TRANSACTION_FAILED',
      null,
      {
        error: error.message,
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

// Debug imports to verify they are defined
console.log('Transaction Controller loaded:', {
  Transaction: !!Transaction,
  WF_WORK_ITEM: !!WF_WORK_ITEM,
  logAuditTrail: !!logAuditTrail,
  generateWorkflowIdentifiers: !!generateWorkflowIdentifiers,
  NotificationService: !!NotificationService
});

export const approveTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // Validate req.body
    if (!req.body || typeof req.body !== 'object') {
      await transaction.rollback();
      throw new Error('Request body is missing or invalid');
    }

    // Generate identifiers
    const identifiers = await generateWorkflowIdentifiers();
    const EVENT_ID = identifiers.EVENT_ID || 'UNKNOWN';
    const JOURNAL_ID = identifiers.JOURNAL_ID || 'UNKNOWN';
    console.log('Generated identifiers:', { EVENT_ID, JOURNAL_ID });

    // Validate generated EVENT_ID
    if (!EVENT_ID || EVENT_ID === 'UNKNOWN') {
      await transaction.rollback();
      throw new Error('Failed to generate valid EVENT_ID');
    }

    const { workItemId, transactionId, approvalStatus, approvalNotes = '' } = req.body;
    const approverId = req.user?.id || 'system';

    // Validate input
    if (!workItemId || !transactionId || !approvalStatus) {
      await transaction.rollback();
      throw new Error('Transaction ID, Work Item ID, and approval status are required');
    }

    // Convert transactionId to number if it's a string
    const numericTransactionId = typeof transactionId === 'string'
      ? parseInt(transactionId, 10)
      : transactionId;

    if (isNaN(numericTransactionId) || numericTransactionId <= 0) {
      await transaction.rollback();
      throw new Error('Invalid Transaction ID');
    }

    if (!['APPROVED', 'REJECTED'].includes(approvalStatus)) {
      await transaction.rollback();
      throw new Error('Approval status must be either APPROVED or REJECTED');
    }

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
      id: numericTransactionId,
      status: ['PENDING', 'PENDING_APPROVAL']
    });

    // Find transaction by numeric id
    const transactionRecord = await Transaction.findOne({
      where: {
        id: numericTransactionId,
        status: { [sequelize.Op.in]: ['PENDING', 'PENDING_APPROVAL'] }
      },
      transaction
    });

    if (!transactionRecord) {
      await transaction.rollback();
      throw new Error(`Pending transaction not found for ID ${numericTransactionId}`);
    }

    // Debug work item query
    console.log('Finding work item with:', { WORK_ITEM_ID: workItemId });

    // Find work item
    const workItem = await WF_WORK_ITEM.findOne({
      where: { WORK_ITEM_ID: workItemId },
      transaction
    });

    if (!workItem) {
      await transaction.rollback();
      throw new Error(`Work item with ID ${workItemId} not found`);
    }

    // Verify work item matches transaction (using id)
    if (workItem.entityId?.toString() !== transactionRecord.id.toString()) {
      await transaction.rollback();
      throw new Error('Work item does not match the transaction');
    }

    // Update transaction and work item based on approval status
    if (approvalStatus === 'APPROVED') {
      transactionRecord.REC_ST = 'ACTIVE';
      transactionRecord.status = 'COMPLETED';
      transactionRecord.APPROVAL_NOTES = approvalNotes;
      transactionRecord.APPROVED_BY = approverId;
      transactionRecord.APPROVAL_DATE = new Date();

      workItem.status = 'COMPLETED';
      workItem.REC_ST = 'ACTIVE';
      workItem.updatedAt = new Date();
    } else {
      transactionRecord.status = 'REJECTED';
      transactionRecord.REJECTION_NOTES = approvalNotes;
      transactionRecord.REJECTED_BY = approverId;
      transactionRecord.REJECTION_DATE = new Date();

      workItem.status = 'REJECTED';
      workItem.REC_ST = 'REJECTED';
      workItem.updatedAt = new Date();
    }

    // Save both transaction and work item
    await transactionRecord.save({ transaction });
    await workItem.save({ transaction });

    // Send notification
    try {
      console.log('Sending notification with:', {
        ROLE_ID: workItem.assignedTo || 'COMPLIANCE_OFFICER',
        WORK_ITEM_ID: workItemId,
        EVENT_ID,
        CUST_ID: transactionRecord.CUST_ID
      });
      await NotificationService.send({
        ROLE_ID: workItem.assignedTo || 'COMPLIANCE_OFFICER',
        message: `Transaction ${approvalStatus.toLowerCase()}: ${transactionRecord.TRANSACTION_TYPE} of ${transactionRecord.AMOUNT} for ${transactionRecord.ACCT_NM}`,
        WORK_ITEM_ID: workItemId,
        EVENT_ID,
        CUST_ID: transactionRecord.CUST_ID,
        status: approvalStatus.toLowerCase(),
        notificationType: 'system',
        metadata: {
          transactionId: numericTransactionId,
          amount: transactionRecord.AMOUNT,
          account: transactionRecord.ACCT_NO,
          approvalStatus,
          approvalNotes,
          eventId: EVENT_ID
        }
      }, { transaction });
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
        amount: transactionRecord.AMOUNT,
        account: transactionRecord.ACCT_NO
      },
      req.ip || '::1',
      'GENERAL',
      { source: 'approveTransaction' }
    );

    await transaction.commit();

    return res.status(200).json({
      success: true,
      code: `TRANSACTION_${approvalStatus}`,
      message: `Transaction ${approvalStatus.toLowerCase()} successfully`,
      data: {
        transactionId: transactionRecord.id,
        status: transactionRecord.status,
        recordStatus: transactionRecord.REC_ST,
        workItemId,
        workItemStatus: workItem.status,
        workItemRecordStatus: workItem.REC_ST,
        amount: transactionRecord.AMOUNT,
        approvalDate: new Date().toISOString(),
        approvedBy: approverId,
        journalId: JOURNAL_ID
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    await transaction.rollback();
    
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
  const transaction = await sequelize.transaction();
  
  try {
    const { transactions } = req.body;
    const userId = req.user?.id || 'system';

    // Validate input format
    if (!Array.isArray(transactions)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        code: 'INVALID_INPUT',
        message: 'Transactions must be an array',
        timestamp: new Date().toISOString()
      });
    }

    // Validate batch size
    if (transactions.length > 100) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        code: 'BULK_LIMIT_EXCEEDED',
        message: 'Maximum 100 transactions allowed per bulk request',
        timestamp: new Date().toISOString()
      });
    }

    const results = [];
    const errors = [];
    const batchId = (await generateWorkflowIdentifiers()).EVENT_ID; // Generate batch ID

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
              batchId
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
      await transaction.rollback();
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
    await transaction.commit();

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
    await transaction.rollback();
    
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

export const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const where = {};
    
    if (type) where.TRANSACTION_TYPE = type.toUpperCase();
    if (status) where.status = status.toUpperCase();

    const offset = (page - 1) * limit;

    const transactions = await Transaction.findAll({
      where,
      order: [['TRANSACTIONDATE', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const count = await Transaction.count({ where });

    return res.status(200).json({
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
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

    const offset = (page - 1) * limit;

    const transactions = await Transaction.findAll({
      where: { ACCT_NO },
      order: [['TRANSACTIONDATE', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const count = await Transaction.count({ where: { ACCT_NO } });

    if (!transactions.length) {
      return res.status(404).json({ 
        message: 'No transactions found for this account',
        account: ACCT_NO
      });
    }

    return res.status(200).json({
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
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
  const dbTransaction = await sequelize.transaction();
  
  try {
    const transaction = await Transaction.findOne({ 
      where: { id: req.params.id },
      transaction: dbTransaction
    });
    
    if (!transaction) {
      await dbTransaction.rollback();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Reverse the transaction impact if needed
    if (transaction.status === 'COMPLETED') {
      const amount = transaction.AMOUNT;
      const isDebit = transaction.TRANSACTION_TYPE === 'DEBIT';
      const isCredit = transaction.TRANSACTION_TYPE === 'CREDIT';
      const ACCT_NO = transaction.ACCT_NO;

      // Find the account
      const account = await CustomerAccount.findOne({
        where: { ACCT_NO },
        transaction: dbTransaction
      });

      if (account) {
        if (isDebit) {
          // Reverse debit: add back to account
          await account.update({
            LEDGER_BAL: parseFloat(account.LEDGER_BAL || 0) + amount,
            CLEARED_BAL: parseFloat(account.CLEARED_BAL || 0) + amount,
            AVAILABLE_BALANCE: parseFloat(account.AVAILABLE_BALANCE || 0) + amount
          }, { transaction: dbTransaction });
        } else if (isCredit) {
          // Reverse credit: subtract from account
          await account.update({
            LEDGER_BAL: parseFloat(account.LEDGER_BAL || 0) - amount,
            CLEARED_BAL: parseFloat(account.CLEARED_BAL || 0) - amount,
            AVAILABLE_BALANCE: parseFloat(account.AVAILABLE_BALANCE || 0) - amount
          }, { transaction: dbTransaction });
        }
      }
    }

    await transaction.destroy({ transaction: dbTransaction });
    await dbTransaction.commit();

    return res.status(200).json({ message: 'Transaction deleted successfully' });

  } catch (err) {
    await dbTransaction.rollback();
    return res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      requestId: req.id || 'none'
    });
  }
};

// Helper functions for Sequelize
async function updateDepositAccountSummaryForDebit(acctNo, amount, transaction) {
  const summary = await DepositAccountSummary.findOne({ 
    where: { ACCT_NO: acctNo },
    transaction
  });
  
  if (!summary) throw new Error(`Deposit account summary not found for account ${acctNo}`);

  if (parseFloat(summary.LEDGER_BAL) < amount) {
    throw new Error('Insufficient funds in deposit account summary');
  }

  await summary.update({
    LEDGER_BAL: parseFloat(summary.LEDGER_BAL) - amount,
    CLEARED_BAL: parseFloat(summary.CLEARED_BAL) - amount,
    LAST_TRANSACTION_DATE: new Date()
  }, { transaction });
}

async function updateDepositAccountSummaryForCredit(acctNo, acctId, amount, transaction) {
  let summary = await DepositAccountSummary.findOne({ 
    where: { ACCT_NO: acctNo },
    transaction
  });
  
  if (!summary) {
    summary = await DepositAccountSummary.create({
      ACCT_NO: acctNo,
      ACCT_ID: acctId,
      LEDGER_BAL: amount,
      CLEARED_BAL: amount,
      LAST_TRANSACTION_DATE: new Date()
    }, { transaction });
  } else {
    await summary.update({
      LEDGER_BAL: parseFloat(summary.LEDGER_BAL) + amount,
      CLEARED_BAL: parseFloat(summary.CLEARED_BAL) + amount,
      LAST_TRANSACTION_DATE: new Date()
    }, { transaction });
  }
}

async function updateLoanAccountSummary(acctNo, amount, transaction) {
  // Placeholder for actual loan account update logic
  console.log(`Loan account ${acctNo} updated by ${amount}`);
  // Implement actual loan account update logic here
};

export {
  createTransaction
};