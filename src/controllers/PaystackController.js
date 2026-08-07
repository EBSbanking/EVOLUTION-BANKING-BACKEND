// src/controllers/PaystackController.js
import axios from 'axios';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import logger from '../utils/logger.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PaystackTransaction from '../models/PaystackTransaction.js';
import InwardTransferService from '../services/InwardTransferService.js';

class PaystackController {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    this.baseUrl = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
    this.callbackUrl = process.env.PAYSTACK_CALLBACK_URL || 'https://your-domain.com/api/paystack/callback';
  }

  /**
   * Initialize a Paystack transaction
   * POST /api/paystack/initialize
   */
  async initializeTransaction(req, res) {
    try {
      const {
        email,
        amount,
        currency = 'NGN',
        reference,
        callbackUrl,
        metadata = {},
        firstName,
        lastName,
        phone,
        customerCode,
        accountNumber
      } = req.body;

      // Validate required fields
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required'
        });
      }

      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid amount is required'
        });
      }

      // Check if customer account exists
      let customerAccount = null;
      if (accountNumber) {
        customerAccount = await CustomerAccount.findOne({
          where: { account_number: accountNumber }
        });

        if (!customerAccount) {
          return res.status(404).json({
            success: false,
            message: `Customer account ${accountNumber} not found`
          });
        }
      }

      // Generate reference if not provided
      const transactionReference = reference || `PAY-${uuidv4().substring(0, 16)}`;

      // Amount in kobo (smallest currency unit)
      const amountInKobo = Math.round(amount * 100);

      // Prepare metadata
      const enhancedMetadata = {
        ...metadata,
        customer_account: accountNumber,
        customer_email: email,
        customer_code: customerCode,
        first_name: firstName,
        last_name: lastName,
        phone: phone,
        transaction_reference: transactionReference,
        source: 'evolution_banking',
        timestamp: new Date().toISOString()
      };

      // Prepare Paystack API request
      const payload = {
        email: email,
        amount: amountInKobo,
        currency: currency,
        reference: transactionReference,
        callback_url: callbackUrl || this.callbackUrl,
        metadata: enhancedMetadata,
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
        subaccount: process.env.PAYSTACK_SUBACCOUNT_CODE,
        transaction_charge: 0,
        bearer: 'account'
      };

      // Add customer details if provided
      if (firstName) payload.first_name = firstName;
      if (lastName) payload.last_name = lastName;
      if (phone) payload.phone = phone;

      // Make request to Paystack
      const response = await axios.post(
        `${this.baseUrl}/transaction/initialize`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const { data } = response.data;

      // Save transaction record
      const transaction = await PaystackTransaction.create({
        transaction_reference: transactionReference,
        paystack_reference: data.reference,
        paystack_access_code: data.access_code,
        email: email,
        amount: amount,
        currency: currency,
        status: 'PENDING',
        metadata: enhancedMetadata,
        customer_account: accountNumber,
        customer_code: customerCode,
        authorization_url: data.authorization_url,
        callback_url: callbackUrl || this.callbackUrl,
        initiated_at: new Date()
      });

      logger.info('Paystack transaction initialized', {
        reference: transactionReference,
        email,
        amount,
        access_code: data.access_code
      });

      return res.status(200).json({
        success: true,
        message: 'Transaction initialized successfully',
        data: {
          reference: transactionReference,
          access_code: data.access_code,
          authorization_url: data.authorization_url,
          transaction_id: transaction.id,
          reference_id: data.reference
        }
      });

    } catch (error) {
      logger.error('Paystack initialization error:', {
        error: error.message,
        response: error.response?.data,
        body: req.body
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to initialize transaction',
        error: error.response?.data?.message || error.message
      });
    }
  }

  /**
   * Verify Paystack transaction
   * GET /api/paystack/verify/:reference
   */
  async verifyTransaction(req, res) {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Transaction reference is required'
        });
      }

      // Find transaction record
      const transaction = await PaystackTransaction.findOne({
        where: { 
          [require('sequelize').Op.or]: [
            { transaction_reference: reference },
            { paystack_reference: reference }
          ]
        }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: `Transaction ${reference} not found`
        });
      }

      // Verify with Paystack
      const response = await axios.get(
        `${this.baseUrl}/transaction/verify/${transaction.paystack_reference}`,
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`
          }
        }
      );

      const { data } = response.data;

      // Update transaction record
      await transaction.update({
        status: data.status,
        gateway_response: data.gateway_response,
        channel: data.channel,
        transaction_date: data.transaction_date,
        paid_at: data.paid_at,
        amount: data.amount / 100,
        fees: data.fees / 100,
        customer_code: data.customer?.customer_code,
        paystack_data: data
      });

      logger.info('Paystack transaction verified', {
        reference: transaction.transaction_reference,
        status: data.status,
        amount: data.amount / 100
      });

      return res.status(200).json({
        success: true,
        message: 'Transaction verified successfully',
        data: {
          reference: transaction.transaction_reference,
          paystack_reference: transaction.paystack_reference,
          status: data.status,
          amount: data.amount / 100,
          currency: data.currency,
          channel: data.channel,
          paid_at: data.paid_at,
          customer: data.customer,
          metadata: data.metadata
        }
      });

    } catch (error) {
      logger.error('Paystack verification error:', {
        error: error.message,
        reference: req.params.reference
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to verify transaction',
        error: error.response?.data?.message || error.message
      });
    }
  }

  /**
   * Handle Paystack Webhook
   * POST /api/paystack/webhook
   */
  async handleWebhook(req, res) {
    try {
      // Verify signature
      const signature = req.headers['x-paystack-signature'];
      const hash = crypto.createHmac('sha512', this.secretKey)
        .update(JSON.stringify(req.body))
        .digest('hex');

      if (hash !== signature) {
        logger.warn('Invalid Paystack signature', { signature, hash });
        return res.status(401).json({
          success: false,
          message: 'Invalid signature'
        });
      }

      const event = req.body;
      logger.info('Paystack webhook received', { 
        event: event.event,
        reference: event.data?.reference 
      });

      // Handle different event types
      switch (event.event) {
        case 'charge.success':
          await this.handleChargeSuccess(event.data);
          break;

        case 'charge.failed':
          await this.handleChargeFailed(event.data);
          break;

        case 'charge.pending':
          await this.handleChargePending(event.data);
          break;

        case 'transfer.success':
          await this.handleTransferSuccess(event.data);
          break;

        case 'transfer.failed':
          await this.handleTransferFailed(event.data);
          break;

        default:
          logger.info('Unhandled Paystack webhook event', { event: event.event });
      }

      // Always return 200 to acknowledge receipt
      return res.status(200).json({
        success: true,
        message: 'Webhook processed'
      });

    } catch (error) {
      logger.error('Paystack webhook error:', {
        error: error.message,
        body: req.body
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to process webhook'
      });
    }
  }

  /**
   * Handle successful charge
   */
  async handleChargeSuccess(data) {
    const transaction = await PaystackTransaction.findOne({
      where: { paystack_reference: data.reference }
    });

    if (!transaction) {
      logger.warn('Transaction not found for webhook', { reference: data.reference });
      return;
    }

    // Update transaction
    await transaction.update({
      status: 'SUCCESS',
      gateway_response: data.gateway_response,
      channel: data.channel,
      paid_at: data.paid_at,
      amount: data.amount / 100,
      fees: data.fees / 100,
      paystack_data: data,
      webhook_processed_at: new Date()
    });

    logger.info('Paystack charge successful', {
      reference: transaction.transaction_reference,
      amount: data.amount / 100,
      customer: data.customer?.email
    });

    // If there's a customer account, process the inward transfer
    if (transaction.customer_account) {
      await this.processInwardTransfer(transaction, data);
    }

    // Trigger any additional business logic
    await this.triggerPostPaymentActions(transaction, data);
  }

  /**
   * Handle failed charge
   */
  async handleChargeFailed(data) {
    const transaction = await PaystackTransaction.findOne({
      where: { paystack_reference: data.reference }
    });

    if (!transaction) {
      logger.warn('Transaction not found for webhook', { reference: data.reference });
      return;
    }

    await transaction.update({
      status: 'FAILED',
      gateway_response: data.gateway_response,
      paystack_data: data,
      webhook_processed_at: new Date(),
      failure_reason: data.gateway_response || 'Payment failed'
    });

    logger.info('Paystack charge failed', {
      reference: transaction.transaction_reference,
      reason: data.gateway_response
    });
  }

  /**
   * Handle pending charge
   */
  async handleChargePending(data) {
    const transaction = await PaystackTransaction.findOne({
      where: { paystack_reference: data.reference }
    });

    if (!transaction) {
      logger.warn('Transaction not found for webhook', { reference: data.reference });
      return;
    }

    await transaction.update({
      status: 'PENDING',
      gateway_response: data.gateway_response,
      paystack_data: data,
      webhook_processed_at: new Date()
    });

    logger.info('Paystack charge pending', {
      reference: transaction.transaction_reference
    });
  }

  /**
   * Handle transfer success
   */
  async handleTransferSuccess(data) {
    logger.info('Paystack transfer successful', { 
      reference: data.reference,
      amount: data.amount / 100,
      recipient: data.recipient?.details?.account_number
    });
  }

  /**
   * Handle transfer failed
   */
  async handleTransferFailed(data) {
    logger.info('Paystack transfer failed', { 
      reference: data.reference,
      reason: data.reason
    });
  }

  /**
   * Process inward transfer from Paystack payment
   * ✅ Updated to use InwardTransferService
   */
  async processInwardTransfer(transaction, paystackData) {
    try {
      // Get the customer account
      const customerAccount = await CustomerAccount.findOne({
        where: { account_number: transaction.customer_account }
      });

      if (!customerAccount) {
        logger.warn('Customer account not found for transfer', {
          account: transaction.customer_account
        });
        return;
      }

      // Build remitter name from customer data
      const customer = paystackData.customer || {};
      const remitterName = [customer.first_name, customer.last_name]
        .filter(Boolean)
        .join(' ') || customer.email || 'Paystack Customer';

      // ✅ Use the shared InwardTransferService
      const result = await InwardTransferService.processInwardTransfer({
        source: 'PAYSTACK',
        transferRef: transaction.transaction_reference,
        amount: transaction.amount,
        beneficiaryAccount: customerAccount.account_number,
        beneficiaryName: customerAccount.account_name,
        remitterName: remitterName,
        remitterAccount: paystackData.reference,
        remitterBank: 'Paystack',
        narration: `Paystack payment: ${transaction.transaction_reference}`,
        transactionRef: transaction.paystack_reference,
        metadata: {
          paystack_data: paystackData,
          channel: paystackData.channel,
          payment_type: paystackData.channel,
          customer_email: customer.email
        },
        customerId: null,
        autoMatch: true
      });

      if (result.success) {
        // Update PaystackTransaction with the inward transfer ID
        await transaction.update({
          inward_transfer_id: result.inward_transfer_id,
          processed_at: new Date(),
          customer_matched_by: result.matched_by
        });

        logger.info('✅ Inward transfer processed from Paystack', {
          reference: transaction.transaction_reference,
          amount: transaction.amount,
          customer: result.customer_name,
          matched_by: result.matched_by,
          inward_transfer_id: result.inward_transfer_id
        });

        return result;
      } else {
        // Update PaystackTransaction with pending status
        await transaction.update({
          status: 'PENDING_MATCHING',
          pending_transfer_id: result.pending_id,
          processed_at: new Date()
        });

        logger.warn('⚠️ Paystack transfer pending matching', {
          reference: transaction.transaction_reference,
          pending_id: result.pending_id,
          amount: transaction.amount
        });

        return result;
      }

    } catch (error) {
      logger.error('Failed to process inward transfer from Paystack:', {
        error: error.message,
        transaction: transaction.transaction_reference
      });
      throw error;
    }
  }

  /**
   * Trigger post-payment actions (notifications, email, etc.)
   */
  async triggerPostPaymentActions(transaction, paystackData) {
    try {
      // Send notification
      // Send email
      // Update customer dashboard
      // Trigger any business logic
      
      logger.info('Post-payment actions triggered', {
        reference: transaction.transaction_reference
      });

    } catch (error) {
      logger.error('Failed to trigger post-payment actions:', {
        error: error.message,
        reference: transaction.transaction_reference
      });
    }
  }

  /**
   * Get transaction status
   * GET /api/paystack/status/:reference
   */
  async getTransactionStatus(req, res) {
    try {
      const { reference } = req.params;

      const transaction = await PaystackTransaction.findOne({
        where: { 
          [require('sequelize').Op.or]: [
            { transaction_reference: reference },
            { paystack_reference: reference }
          ]
        }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: `Transaction ${reference} not found`
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          reference: transaction.transaction_reference,
          status: transaction.status,
          amount: transaction.amount,
          currency: transaction.currency,
          email: transaction.email,
          paid_at: transaction.paid_at,
          channel: transaction.channel,
          gateway_response: transaction.gateway_response,
          metadata: transaction.metadata,
          inward_transfer_id: transaction.inward_transfer_id,
          created_at: transaction.createdAt
        }
      });

    } catch (error) {
      logger.error('Status check error:', {
        error: error.message,
        reference: req.params.reference
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get transaction status'
      });
    }
  }

  /**
   * List transactions
   * GET /api/paystack/transactions
   */
  async listTransactions(req, res) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        status, 
        email,
        startDate,
        endDate 
      } = req.query;

      const where = {};
      
      if (status) where.status = status;
      if (email) where.email = email;
      
      if (startDate && endDate) {
        where.initiated_at = {
          [require('sequelize').Op.between]: [new Date(startDate), new Date(endDate)]
        };
      } else if (startDate) {
        where.initiated_at = {
          [require('sequelize').Op.gte]: new Date(startDate)
        };
      } else if (endDate) {
        where.initiated_at = {
          [require('sequelize').Op.lte]: new Date(endDate)
        };
      }

      const offset = (page - 1) * limit;

      const { count, rows } = await PaystackTransaction.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        data: {
          transactions: rows,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          }
        }
      });

    } catch (error) {
      logger.error('List transactions error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to list transactions'
      });
    }
  }

  /**
   * Refund a transaction
   * POST /api/paystack/refund/:reference
   */
  async refundTransaction(req, res) {
    try {
      const { reference } = req.params;
      const { reason } = req.body;

      const transaction = await PaystackTransaction.findOne({
        where: { transaction_reference: reference }
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: `Transaction ${reference} not found`
        });
      }

      if (transaction.status !== 'SUCCESS') {
        return res.status(400).json({
          success: false,
          message: 'Only successful transactions can be refunded'
        });
      }

      // Call Paystack refund API
      const response = await axios.post(
        `${this.baseUrl}/refund`,
        {
          transaction: transaction.paystack_reference,
          amount: Math.round(transaction.amount * 100),
          currency: transaction.currency || 'NGN',
          reason: reason || 'Customer request'
        },
        {
          headers: {
            'Authorization': `Bearer ${this.secretKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Update transaction
      await transaction.update({
        status: 'REFUNDED',
        refund_data: response.data.data,
        refund_date: new Date(),
        refund_reason: reason || 'Customer request'
      });

      logger.info('Transaction refunded', {
        reference: transaction.transaction_reference,
        amount: transaction.amount
      });

      return res.status(200).json({
        success: true,
        message: 'Transaction refunded successfully',
        data: {
          reference: transaction.transaction_reference,
          refund_reference: response.data.data?.reference,
          amount: transaction.amount,
          status: 'REFUNDED'
        }
      });

    } catch (error) {
      logger.error('Refund error:', {
        error: error.message,
        reference: req.params.reference
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to refund transaction',
        error: error.response?.data?.message || error.message
      });
    }
  }
}

export default new PaystackController();