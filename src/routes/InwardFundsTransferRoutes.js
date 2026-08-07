// src/routes/InwardTransferRoutes.js
import express from 'express';
import InwardTransferService from '../services/InwardTransferService.js';
import { authenticate } from '../middlewares/authMiddleware.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ================================================================
// ✅ HEALTH CHECK
// ================================================================
router.get('/webhook/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Inward Funds Transfer Webhook is healthy',
    timestamp: new Date().toISOString(),
    service: 'inward-funds-webhook',
    version: '2.0.0'
  });
});

// ================================================================
// ✅ WEBHOOK - Main entry point for incoming transfers
// ================================================================
router.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    logger.info('📥 Received inward funds webhook:', {
      source: payload.source || 'unknown',
      transfers: Array.isArray(payload) ? payload.length : 1
    });

    // Handle array of transfers or single transfer
    const transfers = Array.isArray(payload) ? payload : [payload];
    const results = [];

    for (const transferData of transfers) {
      try {
        // Extract transfer details
        const beneficiaryAccount = transferData.beneficiaryAccount || 
                                  transferData.beneficiary?.account || 
                                  transferData.BENEFICIARY_ACCT;
        
        const amount = parseFloat(transferData.amount || 
                                 transferData.xferAmt || 
                                 transferData.XFER_AMT || 
                                 0);
        
        const remitterName = transferData.remitterName || 
                            transferData.remitter?.name || 
                            transferData.REMITTER_NM || 
                            'Unknown';
        
        const remitterAccount = transferData.remitterAccount || 
                               transferData.remitter?.accountNo || 
                               transferData.REMITTER_ACCT_NO;
        
        const remitterBank = transferData.remitterBank || 
                            transferData.remitter?.bankName || 
                            transferData.REMITTER_BANK_NM || 
                            'Unknown Bank';
        
        const narration = transferData.narration || 
                         transferData.ADDTL_INSTRUCTION1 || 
                         '';
        
        const transactionRef = transferData.transactionRef || 
                              transferData.xferRef || 
                              transferData.XFER_REF || 
                              `TRF-${Date.now()}`;
        
        const source = transferData.source || transferData.gateway || 'EXTERNAL_BANK';

        // ✅ Use the shared InwardTransferService
        const result = await InwardTransferService.processInwardTransfer({
          source: source,
          transferRef: transactionRef,
          amount: amount,
          beneficiaryAccount: beneficiaryAccount,
          beneficiaryName: transferData.beneficiaryName || transferData.BENEFICIARY_NM,
          remitterName: remitterName,
          remitterAccount: remitterAccount,
          remitterBank: remitterBank,
          narration: narration,
          transactionRef: transactionRef,
          metadata: {
            original_payload: transferData,
            source: source
          },
          customerId: transferData.customerId || null,
          autoMatch: true
        });

        results.push({
          success: result.success,
          reference: transactionRef,
          amount: amount,
          ...(result.success ? {
            customer_id: result.customer_id,
            customer_name: result.customer_name,
            evolution_account: result.evolution_account,
            matched_by: result.matched_by,
            inward_transfer_id: result.inward_transfer_id,
            pending_inward_id: result.pending_inward_id
          } : {
            pending_id: result.pending_transfer_id || result.pending_id,
            message: result.message,
            source: source
          })
        });

      } catch (transferError) {
        logger.error('❌ Error processing individual transfer:', {
          error: transferError.message,
          transferData: transferData
        });
        
        results.push({
          success: false,
          reference: transferData.transactionRef || transferData.xferRef || 'unknown',
          error: transferError.message
        });
      }
    }

    // Check if all transfers failed
    const allFailed = results.every(r => !r.success);
    
    if (allFailed) {
      return res.status(400).json({
        success: false,
        message: 'All transfers failed',
        results: results
      });
    }

    return res.status(201).json({
      success: true,
      message: `Processed ${results.length} transfers`,
      results: results
    });

  } catch (error) {
    logger.error('❌ Error processing inward funds webhook:', {
      error: error.message,
      stack: error.stack
    });
    
    return res.status(500).json({
      success: false,
      error: {
        message: error.message,
        type: error.name,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      }
    });
  }
});

// ================================================================
// ✅ GET PENDING INWARD TRANSACTIONS (for Operations)
// ================================================================
router.get('/pending', authenticate, async (req, res) => {
  try {
    const { status = 'PENDING', page = 1, limit = 50, startDate, endDate } = req.query;

    const result = await InwardTransferService.getPendingInwardTransactions({
      status,
      page: parseInt(page),
      limit: parseInt(limit),
      startDate,
      endDate
    });

    return res.status(200).json(result);

  } catch (error) {
    logger.error('Error fetching pending transfers:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending transfers',
      error: error.message
    });
  }
});

// ================================================================
// ✅ PROCESS PENDING INWARD TRANSACTION
// ================================================================
router.post('/process/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId = req.user?.username || 'SYSTEM' } = req.body;

    const result = await InwardTransferService.processPendingInward(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Pending inward transaction processed successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error processing pending inward transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process pending inward transaction',
      error: error.message
    });
  }
});

// ================================================================
// ✅ MATCH PENDING INWARD TRANSACTION TO CUSTOMER
// ================================================================
router.post('/match/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_id, matched_by = req.user?.username || 'MANUAL_MATCH' } = req.body;

    if (!customer_id) {
      return res.status(400).json({
        success: false,
        message: 'customer_id is required'
      });
    }

    const result = await InwardTransferService.matchPendingInwardToCustomer(
      id,
      customer_id,
      matched_by
    );

    return res.status(200).json({
      success: true,
      message: 'Pending inward transaction matched to customer successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error matching pending inward transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to match pending inward transaction',
      error: error.message
    });
  }
});

// ================================================================
// ✅ REJECT PENDING INWARD TRANSACTION
// ================================================================
router.post('/reject/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, rejected_by = req.user?.username || 'SYSTEM' } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const result = await InwardTransferService.rejectPendingInward(id, reason, rejected_by);

    return res.status(200).json({
      success: true,
      message: 'Pending inward transaction rejected successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error rejecting pending inward transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject pending inward transaction',
      error: error.message
    });
  }
});

// ================================================================
// ✅ GET TRANSFER BY REFERENCE
// ================================================================
router.get('/reference/:reference', authenticate, async (req, res) => {
  try {
    const { reference } = req.params;

    const result = await InwardTransferService.getInwardTransferByReference(reference);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Transfer with reference ${reference} not found`
      });
    }

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Error fetching transfer by reference:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transfer',
      error: error.message
    });
  }
});

// ================================================================
// ✅ GET CUSTOMER TRANSFER HISTORY
// ================================================================
router.get('/customer/:customer_id/history', authenticate, async (req, res) => {
  try {
    const { customer_id } = req.params;
    const { page = 1, limit = 50 } = req.query;

    // This would need to be implemented in InwardTransferService
    // For now, we'll use the existing ExternalTransferController method
    const ExternalTransferController = (await import('../controllers/ExternalTransferController.js')).default;
    req.params.customer_id = customer_id;
    req.query.page = page;
    req.query.limit = limit;
    return await ExternalTransferController.getCustomerTransferHistory(req, res);

  } catch (error) {
    logger.error('Error fetching customer transfer history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch customer transfer history',
      error: error.message
    });
  }
});

// ================================================================
// ✅ GET TRANSFER STATISTICS
// ================================================================
router.get('/statistics', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    // This would need to be implemented in InwardTransferService
    // For now, we'll use the existing ExternalTransferController method
    const ExternalTransferController = (await import('../controllers/ExternalTransferController.js')).default;
    req.query.startDate = startDate;
    req.query.endDate = endDate;
    return await ExternalTransferController.getTransferStats(req, res);

  } catch (error) {
    logger.error('Error fetching statistics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

export default router;