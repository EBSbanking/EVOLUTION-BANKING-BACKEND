// src/controllers/transferFeeController.js
import TransferFeeCharge, { 
  FEE_TYPE, 
  FEE_APPLICATION, 
  CHARGE_BEARER, 
  FEE_STATUS,
  FEE_FREQUENCY 
} from '../models/TransferFeeCharge.js';
import logger from '../utils/logger.js';

// Fee calculation service
export const feeCalculator = {
  /**
   * Calculate fees for a transfer
   * @param {number} amount - Transfer amount
   * @param {string} transferType - Type of transfer (LOCAL, INTERNATIONAL, NIP, SWIFT)
   * @param {string} channel - Channel (WEB, MOBILE, USSD, BRANCH, API)
   * @param {object} options - Additional options (currencyId, customerTier, includeVat)
   * @returns {Promise<object>} Calculated fees
   */
  async calculateTransferFees(amount, transferType, channel, options = {}) {
    try {
      const { currencyId = null, customerTier = null, includeVat = true } = options;
      
      // Find all applicable fees
      const fees = await TransferFeeCharge.findAllApplicableFees(
        amount, 
        transferType, 
        channel, 
        currencyId, 
        customerTier
      );
      
      // Calculate totals
      let totalSenderFees = 0;
      let totalReceiverFees = 0;
      let totalVat = 0;
      
      const feeBreakdown = fees.map(fee => {
        const feeItem = {
          feeId: fee.feeId,
          feeCode: fee.feeCode,
          feeName: fee.feeName,
          feeType: fee.feeType,
          baseFee: fee.breakdown.baseFee,
          vat: fee.breakdown.vat,
          total: fee.breakdown.total,
          chargeBearer: fee.chargeBearer
        };
        
        // Add to totals based on charge bearer
        if (fee.chargeBearer === CHARGE_BEARER.SENDER) {
          totalSenderFees += fee.breakdown.total;
        } else if (fee.chargeBearer === CHARGE_BEARER.RECEIVER) {
          totalReceiverFees += fee.breakdown.total;
        } else if (fee.chargeBearer === CHARGE_BEARER.SHARED) {
          // For shared fees, split between sender and receiver
          totalSenderFees += fee.breakdown.total / 2;
          totalReceiverFees += fee.breakdown.total / 2;
        }
        
        if (includeVat) {
          totalVat += fee.breakdown.vat;
        }
        
        return feeItem;
      });
      
      return {
        success: true,
        data: {
          amount,
          transferType,
          channel,
          fees: feeBreakdown,
          totals: {
            senderFees: totalSenderFees,
            receiverFees: totalReceiverFees,
            totalVat,
            grandTotal: totalSenderFees + totalReceiverFees
          },
          summary: {
            senderPays: totalSenderFees,
            receiverPays: totalReceiverFees,
            totalDebitAmount: amount + totalSenderFees,
            totalCreditAmount: amount - totalReceiverFees
          }
        }
      };
    } catch (error) {
      logger.error('Error calculating transfer fees:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Calculate fee for a specific fee code
   * @param {string} feeCode - Fee code
   * @param {number} amount - Transfer amount
   * @param {string} transferType - Transfer type
   * @param {string} channel - Channel
   * @returns {Promise<object>} Calculated fee
   */
  async calculateSpecificFee(feeCode, amount, transferType, channel) {
    try {
      const fee = await TransferFeeCharge.findOne({
        where: {
          FEE_CODE: feeCode,
          FEE_STATUS: FEE_STATUS.ACTIVE
        }
      });
      
      if (!fee) {
        return {
          success: false,
          error: 'Fee not found or inactive'
        };
      }
      
      const result = fee.calculateFee(amount, transferType, channel);
      
      return {
        success: true,
        data: {
          feeId: result.feeId,
          feeCode: result.feeCode,
          feeName: result.feeName,
          feeType: result.feeType,
          baseFee: result.breakdown.baseFee,
          vat: result.breakdown.vat,
          total: result.breakdown.total,
          chargeBearer: result.chargeBearer
        }
      };
    } catch (error) {
      logger.error('Error calculating specific fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// CRUD operations for fee management
export const feeManagement = {
  /**
   * Create a new fee configuration
   */
  async createFee(feeData, userId) {
    try {
      const fee = await TransferFeeCharge.create({
        ...feeData,
        CREATED_BY: userId,
        CREATED_DATE: new Date()
      });
      
      return {
        success: true,
        data: fee,
        message: 'Fee created successfully'
      };
    } catch (error) {
      logger.error('Error creating fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Update an existing fee configuration
   */
  async updateFee(feeId, feeData, userId) {
    try {
      const fee = await TransferFeeCharge.findByPk(feeId);
      
      if (!fee) {
        return {
          success: false,
          error: 'Fee not found'
        };
      }
      
      await fee.update({
        ...feeData,
        MODIFIED_BY: userId,
        MODIFIED_DATE: new Date()
      });
      
      return {
        success: true,
        data: fee,
        message: 'Fee updated successfully'
      };
    } catch (error) {
      logger.error('Error updating fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Get fee by ID
   */
  async getFeeById(feeId) {
    try {
      const fee = await TransferFeeCharge.findByPk(feeId);
      
      if (!fee) {
        return {
          success: false,
          error: 'Fee not found'
        };
      }
      
      return {
        success: true,
        data: fee
      };
    } catch (error) {
      logger.error('Error fetching fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Get fee by code
   */
  async getFeeByCode(feeCode) {
    try {
      const fee = await TransferFeeCharge.findOne({
        where: { FEE_CODE: feeCode }
      });
      
      if (!fee) {
        return {
          success: false,
          error: 'Fee not found'
        };
      }
      
      return {
        success: true,
        data: fee
      };
    } catch (error) {
      logger.error('Error fetching fee by code:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Get all fees with optional filters
   */
  async getAllFees(filters = {}) {
    try {
      const whereClause = {};
      
      if (filters.status) whereClause.FEE_STATUS = filters.status;
      if (filters.transferType) whereClause.TRANSFER_TYPE = filters.transferType;
      if (filters.channel) whereClause.CHANNEL = filters.channel;
      if (filters.currencyId) whereClause.CURRENCY_ID = filters.currencyId;
      
      const fees = await TransferFeeCharge.findAll({
        where: whereClause,
        order: [
          ['PRIORITY', 'ASC'],
          ['FEE_CODE', 'ASC']
        ]
      });
      
      return {
        success: true,
        data: fees,
        count: fees.length
      };
    } catch (error) {
      logger.error('Error fetching fees:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Delete/deactivate a fee
   */
  async deleteFee(feeId, userId, permanent = false) {
    try {
      const fee = await TransferFeeCharge.findByPk(feeId);
      
      if (!fee) {
        return {
          success: false,
          error: 'Fee not found'
        };
      }
      
      if (permanent) {
        await fee.destroy();
        return {
          success: true,
          message: 'Fee permanently deleted'
        };
      } else {
        await fee.update({
          FEE_STATUS: FEE_STATUS.INACTIVE,
          MODIFIED_BY: userId,
          MODIFIED_DATE: new Date()
        });
        
        return {
          success: true,
          message: 'Fee deactivated successfully'
        };
      }
    } catch (error) {
      logger.error('Error deleting fee:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
  
  /**
   * Bulk import fees
   */
  async bulkImportFees(feesData, userId) {
    try {
      const created = [];
      const errors = [];
      
      for (const feeData of feesData) {
        try {
          const fee = await TransferFeeCharge.create({
            ...feeData,
            CREATED_BY: userId,
            CREATED_DATE: new Date()
          });
          created.push(fee);
        } catch (error) {
          errors.push({
            data: feeData,
            error: error.message
          });
        }
      }
      
      return {
        success: true,
        data: {
          created: created.length,
          failed: errors.length,
          errors
        },
        message: `Successfully imported ${created.length} fees`
      };
    } catch (error) {
      logger.error('Error bulk importing fees:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
};

// Express route handlers
export const transferFeeHandlers = {
  /**
   * Calculate fees for a transfer
   */
  async calculateFees(req, res) {
    try {
      const { amount, transferType, channel, currencyId, customerTier, includeVat } = req.body;
      
      if (!amount || !transferType || !channel) {
        return res.status(400).json({
          success: false,
          error: 'Amount, transferType, and channel are required'
        });
      }
      
      const result = await feeCalculator.calculateTransferFees(
        amount, 
        transferType, 
        channel, 
        { currencyId, customerTier, includeVat }
      );
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error in calculateFees handler:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },
  
  /**
   * Create a new fee
   */
  async createFee(req, res) {
    try {
      const userId = req.user?.userId || 'SYSTEM';
      const result = await feeManagement.createFee(req.body, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      return res.status(201).json(result);
    } catch (error) {
      logger.error('Error in createFee handler:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },
  
  /**
   * Get all fees
   */
  async getAllFees(req, res) {
    try {
      const { status, transferType, channel, currencyId } = req.query;
      
      const result = await feeManagement.getAllFees({
        status,
        transferType,
        channel,
        currencyId
      });
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error in getAllFees handler:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },
  
  /**
   * Get fee by ID
   */
  async getFeeById(req, res) {
    try {
      const { id } = req.params;
      const result = await feeManagement.getFeeById(id);
      
      if (!result.success) {
        return res.status(404).json(result);
      }
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error in getFeeById handler:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },
  
  /**
   * Update fee
   */
  async updateFee(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId || 'SYSTEM';
      
      const result = await feeManagement.updateFee(id, req.body, userId);
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error in updateFee handler:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },
  
  /**
   * Delete/deactivate fee
   */
  async deleteFee(req, res) {
    try {
      const { id } = req.params;
      const { permanent } = req.query;
      const userId = req.user?.userId || 'SYSTEM';
      
      const result = await feeManagement.deleteFee(id, userId, permanent === 'true');
      
      if (!result.success) {
        return res.status(400).json(result);
      }
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error in deleteFee handler:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  },
  
  /**
   * Bulk import fees
   */
  async bulkImportFees(req, res) {
    try {
      const { fees } = req.body;
      const userId = req.user?.userId || 'SYSTEM';
      
      if (!fees || !Array.isArray(fees)) {
        return res.status(400).json({
          success: false,
          error: 'Fees array is required'
        });
      }
      
      const result = await feeManagement.bulkImportFees(fees, userId);
      
      return res.status(200).json(result);
    } catch (error) {
      logger.error('Error in bulkImportFees handler:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }
};

export default {
  feeCalculator,
  feeManagement,
  transferFeeHandlers
};