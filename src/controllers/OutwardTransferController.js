// controllers/outwardTransferController.js
import outwardTransferService from '../services/outwardTransferService.js';
import { feeCalculator } from './transferFeeController.js';
import logger from '../utils/logger.js';

export const outwardTransferController = {
  /**
   * Initiate outward transfer
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
        metadata
      } = req.body;

      // Validate required fields
      if (!amount || !beneficiary?.account || !beneficiary?.bankCode || !remitter?.account) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields'
        });
      }

      // Pre-calculate fees for preview
      const feePreview = await feeCalculator.calculateTransferFees(
        amount,
        transferType || 'NIP',
        channel || 'API',
        { currencyId, customerTier }
      );

      // If this is just a fee inquiry, return fees without processing
      if (req.query.preview === 'true') {
        return res.status(200).json({
          success: true,
          preview: true,
          data: feePreview.data
        });
      }

      // Process the actual transfer
      const result = await outwardTransferService.initiateTransfer({
        amount,
        beneficiary,
        remitter,
        transferType,
        channel,
        currencyId,
        customerTier,
        userId: req.user?.userId,
        metadata
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
   * Check transfer status
   */
  async checkStatus(req, res) {
    try {
      const { reference } = req.params;
      
      const transfer = await OutwardFundsTransfer.findOne({
        where: { XFER_REF: reference }
      });

      if (!transfer) {
        return res.status(404).json({
          success: false,
          error: 'Transfer not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: transfer.getSummary()
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
   * Get fee estimate
   */
  async estimateFees(req, res) {
    try {
      const { amount, transferType, channel, currencyId, customerTier } = req.query;

      if (!amount) {
        return res.status(400).json({
          success: false,
          error: 'Amount is required'
        });
      }

      const result = await feeCalculator.calculateTransferFees(
        parseFloat(amount),
        transferType || 'NIP',
        channel || 'API',
        { currencyId, customerTier }
      );

      return res.status(200).json(result);

    } catch (error) {
      logger.error('Fee estimation failed:', error);
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
};