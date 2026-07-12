// controllers/outwardTransferController.js
import { Op } from 'sequelize';
import outwardTransferService from '../Services/outwardTransferService.js';
import OutwardFundsTransfer from '../models/OutwardFundsTransfer.js';
import logger from '../utils/logger.js';

export const outwardTransferController = {
  /**
   * Initiate a Paystack bank transfer (customer pays to virtual account)
   * POST /api/outward/transfer
   */
  async initiateTransfer(req, res) {
    try {
      const {
        amount,
        beneficiary,
        remitter,
        transferType,
        channel,
        currencyId,
        customerTier,
        metadata,
        buId,
      } = req.body;

      // Validate required fields
      if (!amount || !beneficiary?.account || !beneficiary?.bankCode || !remitter?.account) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: amount, beneficiary.account, beneficiary.bankCode, remitter.account'
        });
      }

      const result = await outwardTransferService.initiateTransfer({
        amount,
        beneficiary,
        remitter,
        transferType: transferType || 'PAYSTACK',
        channel: channel || 'API',
        currencyId,
        customerTier,
        userId: req.user?.id || req.user?.userId || 'system',
        buId: buId || req.user?.buId || null,
        metadata,
      });

      return res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Outward transfer initiation failed:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Approve a pending outward transfer
   * POST /api/outward/transfer/:reference/approve
   */
  async approveTransfer(req, res) {
    try {
      const { reference } = req.params;
      const approverId = req.user?.id || req.user?.userId || 'SYSTEM';

      const result = await outwardTransferService.approveTransfer(reference, approverId);

      return res.status(200).json({
        success: true,
        message: 'Transfer approved and processed successfully',
        data: result.transfer
      });
    } catch (error) {
      logger.error('Approve transfer error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Reject a pending outward transfer
   * POST /api/outward/transfer/:reference/reject
   */
  async rejectTransfer(req, res) {
    try {
      const { reference } = req.params;
      const { reason } = req.body;
      const approverId = req.user?.id || req.user?.userId || 'SYSTEM';

      const result = await outwardTransferService.rejectTransfer(reference, approverId, reason);

      return res.status(200).json({
        success: true,
        message: 'Transfer rejected successfully',
        data: result.transfer
      });
    } catch (error) {
      logger.error('Reject transfer error:', error);
      return res.status(400).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Paystack webhook endpoint
   * POST /api/outward/webhook/paystack
   */
  async handlePaystackWebhook(req, res) {
    const signature = req.headers['x-paystack-signature'];
    try {
      const result = await outwardTransferService.handlePaystackWebhook(req.body, signature);
      // Always respond with 200 to acknowledge receipt
      return res.status(200).json({ status: 'ok', result });
    } catch (error) {
      logger.error('Webhook error:', error);
      // Still return 200 to prevent Paystack from retrying
      return res.status(200).json({ status: 'ignored', error: error.message });
    }
  },

  /**
   * Get transfer status by reference
   * GET /api/outward/transfer/:reference
   */
  async getTransferStatus(req, res) {
    try {
      const { reference } = req.params;
      // Select only columns that exist in the table
      const transfer = await OutwardFundsTransfer.findOne({
        where: { xferRef: reference },
        attributes: [
          'id',
          'xferRef',
          'xferAmt',
          'xferCrncyId',
          'payCrncyId',
          'valueDt',
          'beneficiaryNm',
          'beneficiaryAcct',
          'beneficiaryBankNm',
          'beneficiaryBankCode',
          'remitterNm',
          'remitterAcctNo',
          'sendingBankChrg',
          'receivingBankChrg',
          'nipTransactionFee',
          'totalChrg',
          'netAmtXfered',
          'transactionStatus',
          'recSt',
          'userId',
          'createdBy',
          'paystackReference',
          'paystackVirtualAccount',
          'paystackVirtualAccountName',
          'paystackBankName',
          'paystackBankSlug',
          'paystackExpiresAt',
          'paystackResponse',
          'amountReceived',
          'paystackFee',
          'failureReason',
          'createDt',        // creation date (maps to create_dt)
          'rowTs'            // row timestamp (maps to row_ts)
        ]
      });
      if (!transfer) {
        return res.status(404).json({
          success: false,
          error: 'Transfer not found'
        });
      }
      return res.status(200).json({
        success: true,
        data: transfer
      });
    } catch (error) {
      logger.error('Status check failed:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Get pending transfers (awaiting approval or payment)
   * GET /api/outward/transfers/pending
   */
  async getPendingTransfers(req, res) {
    try {
      const { status } = req.query;
      const where = {};
      if (status) {
        where.transactionStatus = status;
      } else {
        // Default: get all non-final statuses
        where.transactionStatus = {
          [Op.notIn]: ['COMPLETED', 'REJECTED', 'FAILED']
        };
      }
      // Use explicit attributes and order by create_dt (creation date)
      const transfers = await OutwardFundsTransfer.findAll({
        where,
        order: [['createDt', 'DESC']],
        attributes: [
          'id',
          'xferRef',
          'xferAmt',
          'xferCrncyId',
          'payCrncyId',
          'valueDt',
          'beneficiaryNm',
          'beneficiaryAcct',
          'beneficiaryBankNm',
          'beneficiaryBankCode',
          'remitterNm',
          'remitterAcctNo',
          'sendingBankChrg',
          'receivingBankChrg',
          'nipTransactionFee',
          'totalChrg',
          'netAmtXfered',
          'transactionStatus',
          'recSt',
          'userId',
          'createdBy',
          'paystackReference',
          'paystackVirtualAccount',
          'paystackVirtualAccountName',
          'paystackBankName',
          'paystackBankSlug',
          'paystackExpiresAt',
          'paystackResponse',
          'amountReceived',
          'paystackFee',
          'failureReason',
          'createDt',
          'rowTs'
        ]
      });
      return res.status(200).json({
        success: true,
        data: transfers,
        count: transfers.length
      });
    } catch (error) {
      logger.error('Get pending transfers error:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};