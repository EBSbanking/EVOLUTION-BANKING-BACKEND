// src/routes/InwardTransferRoutes.js
import express from 'express';
import InwardFundsTransfer, { RECORD_STATUS } from '../models/InwardFundsTransfer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Health check endpoint
router.get('/webhook/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Inward Funds Transfer Webhook is healthy',
    timestamp: new Date().toISOString(),
    service: 'inward-funds-webhook'
  });
});

// Webhook endpoint for receiving transfers
router.post('/webhook', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const payload = req.body;
    logger.info('📥 Received inward funds webhook:', payload);

    // Handle array of transfers or single transfer
    const transfers = payload.transfers || [payload];
    const results = [];

    for (const transferData of transfers) {
      // Use the static mapper method to prepare the data
      const preparedData = InwardFundsTransfer.mapWebhookData(transferData);
      
      // 🔴 CRITICAL DEBUG - Log the prepared data
      console.log('\n🔴🔴🔴 DEBUG - Data being sent to create():');
      console.log('Keys present:', Object.keys(preparedData));
      console.log('XFER_REF present:', preparedData.XFER_REF ? 'YES' : 'NO');
      console.log('XFER_REF value:', preparedData.XFER_REF);
      console.log('INWD_FUNDS_XFER_ID present:', preparedData.INWD_FUNDS_XFER_ID ? 'YES' : 'NO');
      console.log('Number of fields:', Object.keys(preparedData).length);
      console.log('First 10 keys:', Object.keys(preparedData).slice(0, 10));
      console.log('🔴🔴🔴 END DEBUG\n');

      // ============ NEW CODE: Find customer account ============
      const customerAccount = await CustomerAccount.findOne({
        where: { account_number: preparedData.BENEFICIARY_ACCT },
        transaction
      });

      if (!customerAccount) {
        throw new Error(`Customer account not found: ${preparedData.BENEFICIARY_ACCT}`);
      }

      // Capture previous balances for audit
      const previousBalances = {
        current: parseFloat(customerAccount.current_balance) || 0,
        ledger: parseFloat(customerAccount.ledger_balance) || 0,
        cleared: parseFloat(customerAccount.cleared_balance) || 0,
        available: parseFloat(customerAccount.available_balance) || 0
      };

      const transferAmount = parseFloat(preparedData.XFER_AMT) || 0;

      // ============ STEP 1: Create Inward Funds Transfer with ACTIVE status ============
      const transferRecord = await InwardFundsTransfer.create({
        ...preparedData,
        REC_ST: 'A'  // Set to ACTIVE instead of PENDING
      }, { transaction });

      logger.info(`✅ Created inward transfer: ${transferRecord.INWD_FUNDS_XFER_ID} (Status: ACTIVE)`);

      // ============ STEP 2: Update Customer Account balances ============
      await customerAccount.update({
        current_balance: sequelize.literal(`current_balance + ${transferAmount}`),
        ledger_balance: sequelize.literal(`ledger_balance + ${transferAmount}`),
        cleared_balance: sequelize.literal(`cleared_balance + ${transferAmount}`),
        available_balance: sequelize.literal(`available_balance + ${transferAmount}`),
        last_transaction_date: new Date(),
        status: 'ACTIVE'
      }, { transaction });

      logger.info(`✅ Updated customer account: ${customerAccount.account_number}`);

      // ============ STEP 3: Create Pending GL Transaction ============
      const pendingGLTransaction = await PendingGLTransaction.create({
        JOURNAL_ID: `JNL-${transferRecord.INWD_FUNDS_XFER_ID}-${Date.now()}`,
        TRANSACTION_ID: `GL-${transferRecord.INWD_FUNDS_XFER_ID}-${Date.now()}`,
        GL_ACCT_NO: customerAccount.gl_account_number || customerAccount.account_number,
        TRANSACTION_TYPE: 'CR',
        AMOUNT: transferAmount,
        CREATED_BY: 'WEBHOOK',
        SUB_LEDGER_NO: '000',
        SEG_NO: 1,
        ACCT_DESC: `Inward Transfer: ${preparedData.REMITTER_NM || 'Unknown'} - ${preparedData.XFER_REF}`,
        BAL_CD: '01',
        GL_ACCT_CAT: 'LIABILITY',
        CURRENCY_CODE: 'NGN',
        EXCHANGE_RATE: 1,
        REFERENCE_ID: preparedData.XFER_REF,
        STATUS: 'PENDING',  // PENDING for OS processing
        
        // Balance tracking
        PREVIOUS_BALANCE: previousBalances.current,
        PREVIOUS_LEDGER_BALANCE: previousBalances.ledger,
        PREVIOUS_CLEARED_BALANCE: previousBalances.cleared,
        PREVIOUS_AVAILABLE_BALANCE: previousBalances.available,
        
        BALANCE_AFTER: previousBalances.current + transferAmount,
        LEDGER_BALANCE_AFTER: previousBalances.ledger + transferAmount,
        CLEARED_BALANCE_AFTER: previousBalances.cleared + transferAmount,
        AVAILABLE_BALANCE_AFTER: previousBalances.available + transferAmount,
        
        // References
        INWD_FUNDS_XFER_ID: transferRecord.INWD_FUNDS_XFER_ID,
        XFER_REF: preparedData.XFER_REF,
        NARRATION: preparedData.ADDTL_INSTRUCTION1 || `Credit from ${preparedData.REMITTER_NM || 'Unknown'}`,
        IS_REVERSAL: false,
        
        // Balance impact summary
        BALANCE_IMPACT: JSON.stringify({
          previous: previousBalances,
          after: {
            current: previousBalances.current + transferAmount,
            ledger: previousBalances.ledger + transferAmount,
            cleared: previousBalances.cleared + transferAmount,
            available: previousBalances.available + transferAmount
          },
          change: {
            current: transferAmount,
            ledger: transferAmount,
            cleared: transferAmount,
            available: transferAmount
          },
          transaction_type: 'CR',
          source: 'INWARD_WEBHOOK'
        })
      }, { transaction });

      logger.info(`✅ Created Pending GL Transaction: ${pendingGLTransaction.TRANSACTION_ID} (Status: PENDING)`);

      // ============ Update results with customer account info ============
      results.push({
        id: transferRecord.INWD_FUNDS_XFER_ID,
        reference: transferRecord.XFER_REF,
        status: transferRecord.REC_ST,
        beneficiaryAccount: transferRecord.BENEFICIARY_ACCT,
        amount: transferRecord.XFER_AMT,
        customerAccount: {
          number: customerAccount.account_number,
          previousBalance: previousBalances.available,
          newBalance: previousBalances.available + transferAmount,
          change: transferAmount
        },
        glTransactionStatus: 'PENDING'
      });
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: `Processed ${results.length} transfers successfully`,
      data: results
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('❌ Error processing inward funds webhook:', error);
    
    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        type: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});

// Get transfer by ID
router.get('/webhook/transfer/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const transfer = await InwardFundsTransfer.findByPk(id);
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    // Get associated GL transactions
    const glTransactions = await PendingGLTransaction.findAll({
      where: { INWD_FUNDS_XFER_ID: id }
    });

    res.json({
      success: true,
      data: {
        transfer: transfer.getSummary ? transfer.getSummary() : transfer.toJSON(),
        glTransactions: glTransactions.map(t => ({
          id: t.TRANSACTION_ID,
          type: t.TRANSACTION_TYPE,
          amount: t.AMOUNT,
          status: t.STATUS,
          account: t.GL_ACCT_NO
        }))
      }
    });

  } catch (error) {
    logger.error('Error fetching transfer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get transfer by reference
router.get('/webhook/reference/:ref', async (req, res) => {
  try {
    const { ref } = req.params;
    
    const transfer = await InwardFundsTransfer.findOne({
      where: { XFER_REF: ref }
    });
    
    if (!transfer) {
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    // Get associated GL transactions
    const glTransactions = await PendingGLTransaction.findAll({
      where: { XFER_REF: ref }
    });

    // Use getSummary if it exists, otherwise return the raw data
    const responseData = transfer.getSummary ? transfer.getSummary() : transfer.toJSON();

    res.json({
      success: true,
      data: {
        ...responseData,
        glTransactions: glTransactions.map(t => ({
          id: t.TRANSACTION_ID,
          type: t.TRANSACTION_TYPE,
          amount: t.AMOUNT,
          status: t.STATUS,
          account: t.GL_ACCT_NO
        }))
      }
    });

  } catch (error) {
    logger.error('Error fetching transfer by reference:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get transfers by beneficiary account
router.get('/webhook/beneficiary/:account', async (req, res) => {
  try {
    const { account } = req.params;
    const { limit = 10, offset = 0 } = req.query;
    
    const transfers = await InwardFundsTransfer.findAndCountAll({
      where: { BENEFICIARY_ACCT: account },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['VALUE_DT', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        total: transfers.count,
        limit: parseInt(limit),
        offset: parseInt(offset),
        transfers: transfers.rows.map(t => t.getSummary ? t.getSummary() : t.toJSON())
      }
    });

  } catch (error) {
    logger.error('Error fetching beneficiary transfers:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Process a pending transfer
router.post('/webhook/process/:id', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { userId = 'SYSTEM' } = req.body;
    
    const transfer = await InwardFundsTransfer.findByPk(id, { transaction });
    
    if (!transfer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Transfer not found'
      });
    }

    if (transfer.REC_ST === 'A') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Transfer is already active'
      });
    }

    // Update status to Active
    transfer.REC_ST = 'A';
    transfer.ROW_TS = new Date();
    transfer.VERSION_NO = (transfer.VERSION_NO || 0) + 1;
    await transfer.save({ transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Transfer processed successfully',
      data: transfer.getSummary ? transfer.getSummary() : transfer.toJSON()
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error processing transfer:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Create a reversal
router.post('/webhook/reversal/:id', async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { reason, userId = 'SYSTEM' } = req.body;
    
    if (!reason) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        error: 'Reversal reason is required'
      });
    }

    const originalTransfer = await InwardFundsTransfer.findByPk(id, { transaction });
    
    if (!originalTransfer) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: 'Original transfer not found'
      });
    }

    // Find customer account
    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: originalTransfer.BENEFICIARY_ACCT },
      transaction
    });

    if (!customerAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        error: `Customer account not found: ${originalTransfer.BENEFICIARY_ACCT}`
      });
    }

    // Capture previous balances
    const previousBalances = {
      current: parseFloat(customerAccount.current_balance) || 0,
      ledger: parseFloat(customerAccount.ledger_balance) || 0,
      cleared: parseFloat(customerAccount.cleared_balance) || 0,
      available: parseFloat(customerAccount.available_balance) || 0
    };

    const reversalAmount = Math.abs(parseFloat(originalTransfer.XFER_AMT));

    // Prepare reversal data
    const reversalData = {
      XFER_REF: `REV-${originalTransfer.XFER_REF}`,
      XFER_AMT: -reversalAmount,
      XFER_CRNCY_ID: originalTransfer.XFER_CRNCY_ID,
      PAY_CRNCY_ID: originalTransfer.PAY_CRNCY_ID,
      PAY_EXCH_RATE: originalTransfer.PAY_EXCH_RATE || 1,
      VALUE_DT: new Date(),
      PRIORITY_LEVEL_CD: originalTransfer.PRIORITY_LEVEL_CD || 'NORMAL',
      BENEFICIARY_NM: originalTransfer.BENEFICIARY_NM,
      BENEFICIARY_ACCT: originalTransfer.BENEFICIARY_ACCT,
      BENEFICIARY_BANK_NM: originalTransfer.BENEFICIARY_BANK_NM,
      BENEFICIARY_BANK_CNTRY_ID: originalTransfer.BENEFICIARY_BANK_CNTRY_ID || 1,
      REMITTER_NM: originalTransfer.REMITTER_NM,
      IS_REVERSAL: true,
      ORIGINAL_XFER_REF: originalTransfer.XFER_REF,
      REVERSAL_REASON: reason,
      REVERSAL_DATE: new Date(),
      REVERSED_BY: userId,
      REC_ST: 'A',
      CREATED_BY: userId,
      USER_ID: userId,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      VERSION_NO: 1
    };

    // Use the mapper to ensure all fields are properly set
    const preparedReversalData = InwardFundsTransfer.mapWebhookData(reversalData);
    
    // Create reversal record
    const reversal = await InwardFundsTransfer.create(preparedReversalData, { transaction });

    // Reverse customer account balances (debit)
    await customerAccount.update({
      current_balance: sequelize.literal(`current_balance - ${reversalAmount}`),
      ledger_balance: sequelize.literal(`ledger_balance - ${reversalAmount}`),
      cleared_balance: sequelize.literal(`cleared_balance - ${reversalAmount}`),
      available_balance: sequelize.literal(`available_balance - ${reversalAmount}`),
      last_transaction_date: new Date()
    }, { transaction });

    // Create reversal Pending GL Transaction
    await PendingGLTransaction.create({
      JOURNAL_ID: `JNL-REV-${reversal.INWD_FUNDS_XFER_ID}`,
      TRANSACTION_ID: `GL-REV-${reversal.INWD_FUNDS_XFER_ID}`,
      GL_ACCT_NO: customerAccount.gl_account_number || customerAccount.account_number,
      TRANSACTION_TYPE: 'DR',
      AMOUNT: reversalAmount,
      CREATED_BY: userId,
      SUB_LEDGER_NO: '000',
      SEG_NO: 1,
      ACCT_DESC: `Reversal: ${reason} - Original: ${originalTransfer.XFER_REF}`,
      BAL_CD: '01',
      GL_ACCT_CAT: 'LIABILITY',
      CURRENCY_CODE: 'NGN',
      EXCHANGE_RATE: 1,
      REFERENCE_ID: reversal.XFER_REF,
      STATUS: 'PENDING',
      
      // Balance tracking
      PREVIOUS_BALANCE: previousBalances.current,
      PREVIOUS_LEDGER_BALANCE: previousBalances.ledger,
      PREVIOUS_CLEARED_BALANCE: previousBalances.cleared,
      PREVIOUS_AVAILABLE_BALANCE: previousBalances.available,
      
      BALANCE_AFTER: previousBalances.current - reversalAmount,
      LEDGER_BALANCE_AFTER: previousBalances.ledger - reversalAmount,
      CLEARED_BALANCE_AFTER: previousBalances.cleared - reversalAmount,
      AVAILABLE_BALANCE_AFTER: previousBalances.available - reversalAmount,
      
      // References
      INWD_FUNDS_XFER_ID: reversal.INWD_FUNDS_XFER_ID,
      XFER_REF: reversal.XFER_REF,
      NARRATION: `Reversal: ${reason}`,
      IS_REVERSAL: true,
      ORIGINAL_TRANSACTION_ID: originalTransfer.XFER_REF,
      
      BALANCE_IMPACT: JSON.stringify({
        previous: previousBalances,
        after: {
          current: previousBalances.current - reversalAmount,
          ledger: previousBalances.ledger - reversalAmount,
          cleared: previousBalances.cleared - reversalAmount,
          available: previousBalances.available - reversalAmount
        },
        change: {
          current: -reversalAmount,
          ledger: -reversalAmount,
          cleared: -reversalAmount,
          available: -reversalAmount
        },
        transaction_type: 'DR',
        source: 'REVERSAL'
      })
    }, { transaction });

    // Update original transfer status
    originalTransfer.REC_ST = 'I'; // Inactive
    originalTransfer.REVERSAL_REASON = reason;
    originalTransfer.REVERSAL_DATE = new Date();
    originalTransfer.REVERSED_BY = userId;
    originalTransfer.ROW_TS = new Date();
    originalTransfer.VERSION_NO = (originalTransfer.VERSION_NO || 0) + 1;
    await originalTransfer.save({ transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Reversal created successfully',
      data: {
        originalTransfer: originalTransfer.getSummary ? originalTransfer.getSummary() : originalTransfer.toJSON(),
        reversal: reversal.getSummary ? reversal.getSummary() : reversal.toJSON(),
        customerAccount: {
          number: customerAccount.account_number,
          previousBalance: previousBalances.available,
          newBalance: previousBalances.available - reversalAmount
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating reversal:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get transfer statistics
router.get('/webhook/statistics', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'startDate and endDate are required'
      });
    }

    // Simple statistics query
    const stats = await InwardFundsTransfer.findAll({
      attributes: [
        'REC_ST',
        [sequelize.fn('COUNT', sequelize.col('INWD_FUNDS_XFER_ID')), 'count'],
        [sequelize.fn('SUM', sequelize.col('XFER_AMT')), 'totalAmount']
      ],
      where: {
        VALUE_DT: {
          [sequelize.Op.between]: [new Date(startDate), new Date(endDate)]
        }
      },
      group: ['REC_ST']
    });

    // Get GL transaction stats
    const glStats = await PendingGLTransaction.findAll({
      attributes: [
        'STATUS',
        [sequelize.fn('COUNT', sequelize.col('TRANSACTION_ID')), 'count'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
      ],
      where: {
        created_at: {
          [sequelize.Op.between]: [new Date(startDate), new Date(endDate)]
        }
      },
      group: ['STATUS']
    });

    res.json({
      success: true,
      data: {
        transfers: stats,
        glTransactions: glStats
      }
    });

  } catch (error) {
    logger.error('Error getting statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;