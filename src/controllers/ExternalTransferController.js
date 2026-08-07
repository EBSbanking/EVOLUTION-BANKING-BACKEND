// src/controllers/ExternalTransferController.js
import { Op } from 'sequelize';
import Customer from '../models/Customer.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PaymentReference from '../models/PaymentReference.js';
import PendingTransfer from '../models/PendingTransfer.js';
import InwardFundsTransfer, { RECORD_STATUS } from '../models/InwardFundsTransfer.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import InwardTransferService from '../services/InwardTransferService.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

class ExternalTransferController {

  /**
   * Generate Customer Code
   * Format: EVO-XXXXX
   */
  generateCustomerCode() {
    const random = Math.floor(10000 + Math.random() * 90000);
    return `EVO-${random}`;
  }

  /**
   * Generate Payment Reference
   * Format: INV-YYYY-XXXX
   */
  generatePaymentReference() {
    const year = new Date().getFullYear();
    const random = Math.floor(1000 + Math.random() * 9000);
    return `INV-${year}-${random}`;
  }

  /**
   * Process incoming transfer from external bank
   * POST /api/external-transfers/webhook
   * 
   * Expected payload:
   * {
   *   sender_account: '1234567890',
   *   sender_name: 'John Doe',
   *   sender_bank: 'First Bank',
   *   beneficiary_account: '2411498601',
   *   amount: 500000,
   *   narration: 'EVO-12345 INV-2024-001 John Doe',
   *   transaction_ref: 'FBN-2024-001',
   *   transaction_date: '2024-01-15T10:30:00Z'
   * }
   */
  async processExternalTransfer(req, res) {
    try {
      const transferData = req.body;
      
      // Validate required fields
      if (!transferData.amount || transferData.amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      if (!transferData.beneficiary_account) {
        return res.status(400).json({
          success: false,
          message: 'Beneficiary account is required'
        });
      }

      logger.info('📥 Processing external bank transfer:', {
        sender: transferData.sender_name,
        amount: transferData.amount,
        bank: transferData.sender_bank,
        narration: transferData.narration
      });

      // ✅ Use the shared InwardTransferService
      const result = await InwardTransferService.processInwardTransfer({
        source: transferData.sender_bank || 'EXTERNAL_BANK',
        transferRef: transferData.transaction_ref,
        amount: transferData.amount,
        beneficiaryAccount: transferData.beneficiary_account,
        beneficiaryName: null,
        remitterName: transferData.sender_name,
        remitterAccount: transferData.sender_account,
        remitterBank: transferData.sender_bank,
        narration: transferData.narration,
        transactionRef: transferData.transaction_ref,
        metadata: {
          sender_account: transferData.sender_account,
          sender_bank: transferData.sender_bank,
          transaction_date: transferData.transaction_date,
          full_request: transferData
        },
        customerId: null,
        autoMatch: true
      });

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: `Transfer of ₦${transferData.amount.toLocaleString()} credited successfully`,
          data: {
            customer_id: result.customer_id,
            customer_name: result.customer_name,
            evolution_account: result.evolution_account,
            amount: result.amount,
            new_balance: result.new_balance,
            matched_by: result.matched_by,
            inward_transfer_id: result.inward_transfer_id,
            transaction_ref: transferData.transaction_ref
          }
        });
      } else {
        return res.status(202).json({
          success: false,
          message: result.message,
          pending_id: result.pending_id,
          data: {
            amount: transferData.amount,
            sender_name: transferData.sender_name,
            sender_bank: transferData.sender_bank,
            transaction_ref: transferData.transaction_ref,
            pending_id: result.pending_id
          },
          instructions: 'Ensure narration includes customer code (EVO-XXXXX) or reference (INV-YYYY-XXXX)'
        });
      }

    } catch (error) {
      logger.error('❌ Error processing external transfer:', {
        error: error.message,
        stack: error.stack,
        body: req.body
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to process external transfer',
        error: error.message
      });
    }
  }

  /**
   * Generate payment reference for a customer
   * POST /api/external-transfers/generate-reference
   */
  async generatePaymentReference(req, res) {
    try {
      const { customer_id, amount, description } = req.body;

      if (!customer_id) {
        return res.status(400).json({
          success: false,
          message: 'customer_id is required'
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      const customer = await Customer.findByPk(customer_id);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Find customer's Evolution account
      const account = await CustomerAccount.findOne({
        where: { CUST_ID: customer.CUST_ID }
      });

      if (!account) {
        return res.status(404).json({
          success: false,
          message: 'Customer account not found'
        });
      }

      // Ensure customer has a customer code
      if (!customer.customer_code) {
        customer.customer_code = this.generateCustomerCode();
        await customer.save();
      }

      // Generate unique reference
      const referenceNumber = this.generatePaymentReference();
      
      const reference = await PaymentReference.create({
        reference_number: referenceNumber,
        customer_id: customer.id,
        customer_account: account.account_number,
        amount: amount,
        description: description || `Payment to Evolution Banking`,
        status: 'PENDING',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      });

      return res.status(200).json({
        success: true,
        data: {
          reference: reference.reference_number,
          customer_code: customer.customer_code,
          evolution_account: account.account_number,
          amount: reference.amount,
          description: reference.description,
          expires_at: reference.expires_at,
          instructions: {
            beneficiary: 'Evolution Banking',
            account_number: account.account_number,
            bank: 'Any Bank (First Bank, UBA, GTBank, Access, Zenith, etc.)',
            amount: reference.amount,
            narration: `${customer.customer_code} ${reference.reference_number}`,
            note: 'Use the narration exactly as shown for automatic credit'
          }
        }
      });

    } catch (error) {
      console.error('Error generating reference:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate payment reference',
        error: error.message
      });
    }
  }

  /**
   * Manual matching endpoint for account officers
   * POST /api/external-transfers/match/:pending_id
   */
  async matchPendingTransfer(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { pending_id } = req.params;
      const { customer_id, notes } = req.body;

      if (!customer_id) {
        return res.status(400).json({
          success: false,
          message: 'customer_id is required'
        });
      }

      const pending = await PendingTransfer.findByPk(pending_id);
      if (!pending) {
        return res.status(404).json({
          success: false,
          message: 'Pending transfer not found'
        });
      }

      if (pending.status !== 'PENDING_MATCHING') {
        return res.status(400).json({
          success: false,
          message: `Transfer is already ${pending.status}`
        });
      }

      const customer = await Customer.findByPk(customer_id);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // ✅ Use the shared InwardTransferService
      const result = await InwardTransferService.processInwardTransfer({
        source: pending.sender_bank || 'MANUAL_MATCH',
        transferRef: pending.transaction_ref,
        amount: pending.amount,
        beneficiaryAccount: pending.beneficiary_account,
        beneficiaryName: null,
        remitterName: pending.sender_name,
        remitterAccount: pending.sender_account,
        remitterBank: pending.sender_bank,
        narration: pending.narration,
        transactionRef: pending.transaction_ref,
        metadata: {
          original_pending_id: pending.id,
          matched_manually: true,
          notes: notes
        },
        customerId: customer.id,
        autoMatch: false // Customer already identified
      });

      if (result.success) {
        // Update pending status
        await pending.update({
          status: 'MATCHED',
          matched_to_customer_id: customer.id,
          matched_at: new Date(),
          matched_by: req.user?.username || req.user?.id || 'MANUAL_MATCH',
          notes: notes || `Matched to customer ${customer.getFullName()} (${customer.CUST_ID})`
        }, { transaction });

        await transaction.commit();

        logger.info('✅ Pending transfer matched manually:', {
          pending_id: pending.id,
          customer: customer.getFullName(),
          amount: pending.amount,
          matched_by: req.user?.username || 'MANUAL_MATCH'
        });

        return res.status(200).json({
          success: true,
          message: `Transfer matched to customer ${customer.getFullName()} and credited successfully`,
          data: {
            pending_id: pending.id,
            customer_id: customer.id,
            customer_name: customer.getFullName(),
            customer_code: customer.customer_code,
            amount: pending.amount,
            evolution_account: customer.evolution_account_number,
            new_balance: result.new_balance,
            matched_at: pending.matched_at,
            matched_by: pending.matched_by,
            inward_transfer_id: result.inward_transfer_id
          }
        });
      } else {
        await transaction.rollback();
        return res.status(500).json({
          success: false,
          message: 'Failed to process transfer',
          error: result.message
        });
      }

    } catch (error) {
      await transaction.rollback();
      logger.error('Error matching pending transfer:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to match pending transfer',
        error: error.message
      });
    }
  }

  /**
   * Get pending transfers
   * GET /api/external-transfers/pending
   */
  async getPendingTransfers(req, res) {
    try {
      const { 
        status = 'PENDING_MATCHING', 
        page = 1, 
        limit = 50,
        startDate,
        endDate,
        search
      } = req.query;

      const offset = (page - 1) * limit;
      const where = {};

      if (status) {
        where.status = status;
      }

      if (startDate && endDate) {
        where.created_at = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      } else if (startDate) {
        where.created_at = {
          [Op.gte]: new Date(startDate)
        };
      } else if (endDate) {
        where.created_at = {
          [Op.lte]: new Date(endDate)
        };
      }

      if (search) {
        where[Op.or] = [
          { sender_name: { [Op.like]: `%${search}%` } },
          { sender_account: { [Op.like]: `%${search}%` } },
          { narration: { [Op.like]: `%${search}%` } },
          { transaction_ref: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows } = await PendingTransfer.findAndCountAll({
        where,
        offset,
        limit: parseInt(limit),
        order: [['created_at', 'DESC']]
      });

      // Get summary statistics
      const summary = await PendingTransfer.findAll({
        where: { status: 'PENDING_MATCHING' },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalPending'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
        ],
        raw: true
      });

      return res.status(200).json({
        success: true,
        data: rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        summary: {
          pending_count: parseInt(summary[0]?.totalPending) || 0,
          pending_amount: parseFloat(summary[0]?.totalAmount) || 0
        }
      });

    } catch (error) {
      logger.error('Error fetching pending transfers:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch pending transfers',
        error: error.message
      });
    }
  }

  /**
   * Get transfer by reference
   * GET /api/external-transfers/reference/:reference
   */
  async getTransferByReference(req, res) {
    try {
      const { reference } = req.params;

      // Check in pending transfers
      const pending = await PendingTransfer.findOne({
        where: { transaction_ref: reference }
      });

      if (pending) {
        return res.status(200).json({
          success: true,
          data: pending,
          source: 'pending'
        });
      }

      // Check in inward funds transfers
      const inward = await InwardFundsTransfer.findOne({
        where: { XFER_REF: reference }
      });

      if (inward) {
        return res.status(200).json({
          success: true,
          data: inward,
          source: 'inward'
        });
      }

      return res.status(404).json({
        success: false,
        message: `Transfer with reference ${reference} not found`
      });

    } catch (error) {
      logger.error('Error fetching transfer:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transfer',
        error: error.message
      });
    }
  }

  /**
   * Get customer transfer history
   * GET /api/external-transfers/customer/:customer_id/history
   */
  async getCustomerTransferHistory(req, res) {
    try {
      const { customer_id } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const customer = await Customer.findByPk(customer_id);
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      const offset = (page - 1) * limit;

      // Get inward transfers for this customer
      const { count, rows } = await InwardFundsTransfer.findAndCountAll({
        where: {
          BENEFICIARY_ACCT: customer.evolution_account_number
        },
        offset,
        limit: parseInt(limit),
        order: [['CREATE_DT', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        data: {
          customer: {
            id: customer.id,
            name: customer.getFullName(),
            customer_code: customer.customer_code,
            evolution_account: customer.evolution_account_number
          },
          transfers: rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching customer transfer history:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch customer transfer history',
        error: error.message
      });
    }
  }

  /**
   * Get transfer statistics
   * GET /api/external-transfers/stats
   */
  async getTransferStats(req, res) {
    try {
      const { startDate, endDate } = req.query;

      const where = {};
      if (startDate && endDate) {
        where.CREATE_DT = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      } else if (startDate) {
        where.CREATE_DT = { [Op.gte]: new Date(startDate) };
      } else if (endDate) {
        where.CREATE_DT = { [Op.lte]: new Date(endDate) };
      }

      // Get inward transfers stats
      const inwardStats = await InwardFundsTransfer.findOne({
        where,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('INWD_FUNDS_XFER_ID')), 'totalTransfers'],
          [sequelize.fn('SUM', sequelize.col('XFER_AMT')), 'totalAmount'],
          [sequelize.fn('AVG', sequelize.col('XFER_AMT')), 'averageAmount']
        ],
        raw: true
      });

      // Get pending transfers count
      const pendingCount = await PendingTransfer.count({
        where: { status: 'PENDING_MATCHING' }
      });

      // Get transfers by bank
      const bankStats = await InwardFundsTransfer.findAll({
        where,
        attributes: [
          'REMITTER_BANK_NM',
          [sequelize.fn('COUNT', sequelize.col('INWD_FUNDS_XFER_ID')), 'count'],
          [sequelize.fn('SUM', sequelize.col('XFER_AMT')), 'totalAmount']
        ],
        group: ['REMITTER_BANK_NM'],
        raw: true
      });

      return res.status(200).json({
        success: true,
        data: {
          total_transfers: parseInt(inwardStats?.totalTransfers) || 0,
          total_amount: parseFloat(inwardStats?.totalAmount) || 0,
          average_amount: parseFloat(inwardStats?.averageAmount) || 0,
          pending_matching: pendingCount,
          by_bank: bankStats
        }
      });

    } catch (error) {
      logger.error('Error fetching transfer stats:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch transfer statistics',
        error: error.message
      });
    }
  }
}

export default new ExternalTransferController();