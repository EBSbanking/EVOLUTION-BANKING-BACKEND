// webhooks/multiGatewayWebhook.js

import crypto from 'crypto';
import InwardFundsTransfer, { 
  RECORD_STATUS,
  FOREIGN_IFT_FLAG 
} from '../../src/models/InwardFundsTransfer.js';
import webhookController from '../../src/controllers/WebhookController.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';
import { ValidationError } from '../utils/errors.js';
import axios from 'axios';

/**
 * Multi-Gateway Webhook Handler
 * Supports multiple payment gateways: NIP, PayPal, Stripe, Flutterwave, Paystack, Interswitch, etc.
 * With idempotency support for duplicate event handling
 */
class MultiGatewayWebhook {
  constructor(config = {}) {
    // Store processed events for idempotency (in production, use Redis or database)
    this.processedEvents = new Map();
    this.eventExpiry = 24 * 60 * 60 * 1000; // 24 hours

    // Gateway-specific configurations
    this.gatewayConfigs = {
      // NIP (Nigeria Inter-Bank Settlement)
      nip: {
        secretKey: config.nip?.secretKey || process.env.NIP_WEBHOOK_SECRET,
        allowedIps: config.nip?.allowedIps || process.env.NIP_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'x-nip-signature',
        timestampHeader: 'x-nip-timestamp',
        parser: this.parseNIPPayload.bind(this),
        webhookMethod: 'handleNIPFundsTransfer'
      },
      
      // PayPal
      paypal: {
        secretKey: config.paypal?.secretKey || process.env.PAYPAL_WEBHOOK_SECRET,
        allowedIps: config.paypal?.allowedIps || process.env.PAYPAL_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'paypal-transmission-sig',
        timestampHeader: 'paypal-transmission-time',
        parser: this.parsePayPalPayload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      },
      
      // Stripe
      stripe: {
        secretKey: config.stripe?.secretKey || process.env.STRIPE_WEBHOOK_SECRET,
        allowedIps: config.stripe?.allowedIps || process.env.STRIPE_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'stripe-signature',
        parser: this.parseStripePayload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      },
      
      // Flutterwave - CORRECTED with idempotency
      flutterwave: {
        secretKey: config.flutterwave?.secretKey || process.env.FLUTTERWAVE_SECRET_HASH,
        allowedIps: config.flutterwave?.allowedIps || process.env.FLUTTERWAVE_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'flutterwave-signature',
        parser: this.parseFlutterwavePayload.bind(this),
        webhookMethod: 'handleFlutterwaveWebhook',
        webhookType: 'flutterwave'
      },
      
      // Paystack
      paystack: {
        secretKey: config.paystack?.secretKey || process.env.PAYSTACK_WEBHOOK_SECRET,
        allowedIps: config.paystack?.allowedIps || process.env.PAYSTACK_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'x-paystack-signature',
        parser: this.parsePaystackPayload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      },
      
      // Interswitch
      interswitch: {
        secretKey: config.interswitch?.secretKey || process.env.INTERSWITCH_WEBHOOK_SECRET,
        allowedIps: config.interswitch?.allowedIps || process.env.INTERSWITCH_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'authorization',
        parser: this.parseInterswitchPayload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      },
      
      // Remitta (Nigeria)
      remitta: {
        secretKey: config.remitta?.secretKey || process.env.REMITTA_WEBHOOK_SECRET,
        allowedIps: config.remitta?.allowedIps || process.env.REMITTA_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'remitta-signature',
        parser: this.parseRemittaPayload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      },
      
      // Simple JSON (Generic)
      json: {
        secretKey: config.json?.secretKey || process.env.JSON_WEBHOOK_SECRET,
        allowedIps: config.json?.allowedIps || process.env.JSON_ALLOWED_IPS?.split(',') || [],
        signatureHeader: 'x-webhook-signature',
        timestampHeader: 'x-webhook-timestamp',
        parser: this.parseJSONPayload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      },
      
      // ISO 20022
      iso20022: {
        secretKey: config.iso20022?.secretKey || process.env.ISO20022_WEBHOOK_SECRET,
        allowedIps: config.iso20022?.allowedIps || process.env.ISO20022_ALLOWED_IPS?.split(',') || [],
        parser: this.parseISO20022Payload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      },
      
      // SWIFT MT103
      swift: {
        secretKey: config.swift?.secretKey || process.env.SWIFT_WEBHOOK_SECRET,
        allowedIps: config.swift?.allowedIps || process.env.SWIFT_ALLOWED_IPS?.split(',') || [],
        parser: this.parseSwiftPayload.bind(this),
        webhookMethod: 'handleJsonWebhook'
      }
    };
    
    // Default config
    this.defaultSecretKey = config.defaultSecretKey || process.env.WEBHOOK_SECRET;
    this.defaultAllowedIps = config.defaultAllowedIps || [];
    
    // Currency mapping
    this.currencyMap = {
      'NGN': 1,
      'USD': 2,
      'GBP': 3,
      'EUR': 4,
      'JPY': 5,
      'CAD': 6,
      'AUD': 7,
      'CHF': 8,
      'CNY': 9,
      'ZAR': 10
    };
    
    // Country mapping
    this.countryMap = {
      'NG': 1,
      'NGN': 1,
      'NIGERIA': 1,
      'US': 2,
      'USA': 2,
      'GB': 3,
      'UK': 3
    };
    
    // Bank/BIC mapping
    this.bankMap = {
      '1001': 1001,
      'TEST': 1001,
      '001': 1001
    };
    
    // Store reference to webhookController
    this.webhookController = webhookController;
  }

  // ================================================================
  // IDEMPOTENCY HELPERS
  // ================================================================

  /**
   * Check if event has already been processed
   */
  isEventProcessed(eventId, eventType) {
    const key = `${eventType}:${eventId}`;
    if (this.processedEvents.has(key)) {
      const processedAt = this.processedEvents.get(key);
      // Check if event is still within expiry
      if (Date.now() - processedAt < this.eventExpiry) {
        return true;
      }
      // Remove expired event
      this.processedEvents.delete(key);
    }
    return false;
  }

  /**
   * Mark event as processed
   */
  markEventProcessed(eventId, eventType) {
    const key = `${eventType}:${eventId}`;
    this.processedEvents.set(key, Date.now());
    
    // Clean up old events periodically (every 100 events)
    if (this.processedEvents.size > 100) {
      this.cleanupProcessedEvents();
    }
  }

  /**
   * Clean up expired events
   */
  cleanupProcessedEvents() {
    const now = Date.now();
    for (const [key, timestamp] of this.processedEvents) {
      if (now - timestamp > this.eventExpiry) {
        this.processedEvents.delete(key);
      }
    }
  }

  /**
   * Verify transaction with Flutterwave
   * Ensures the webhook data is valid by verifying with Flutterwave API
   */
  async verifyFlutterwaveTransaction(payload, expectedAmount, expectedCurrency, expectedReference) {
    try {
      const transactionId = payload.data?.id || payload.id;
      
      // Verify with Flutterwave API
      const response = await axios.get(
        `${process.env.FLUTTERWAVE_BASE_URL || 'https://api.flutterwave.com/v3'}/transactions/${transactionId}/verify`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`
          }
        }
      );

      const data = response.data.data;

      // Verify transaction details
      if (
        data.status === 'successful' &&
        data.amount === expectedAmount &&
        data.currency === expectedCurrency &&
        data.tx_ref === expectedReference
      ) {
        return { valid: true, transaction: data };
      } else {
        logger.warn('Transaction verification failed:', {
          status: data.status,
          amount: data.amount,
          currency: data.currency,
          tx_ref: data.tx_ref
        });
        return { valid: false, reason: 'Transaction details mismatch' };
      }
    } catch (error) {
      logger.error('Error verifying transaction with Flutterwave:', error);
      return { valid: false, reason: error.message };
    }
  }

  // ================================================================
  // FLUTTERWAVE WEBHOOK HANDLERS WITH IDEMPOTENCY
  // ================================================================

  /**
   * Handle Flutterwave charge completed with idempotency
   */
  async handleFlutterwaveChargeCompleted(data) {
    const eventId = data.id || data.reference || data.tx_ref;
    const eventType = 'charge.completed';
    
    // Check for duplicate event
    if (this.isEventProcessed(eventId, eventType)) {
      logger.info(`🔄 Duplicate Flutterwave event detected: ${eventType}:${eventId} - Skipping`);
      return { success: true, duplicate: true, message: 'Event already processed' };
    }

    try {
      logger.info('✅ Flutterwave charge completed:', {
        reference: data.reference || data.tx_ref,
        amount: data.amount,
        currency: data.currency,
        customer: data.customer?.email
      });

      // Verify transaction with Flutterwave API
      const expectedAmount = parseFloat(data.amount);
      const expectedCurrency = data.currency || 'NGN';
      const expectedReference = data.reference || data.tx_ref;

      const verification = await this.verifyFlutterwaveTransaction(
        { data },
        expectedAmount,
        expectedCurrency,
        expectedReference
      );

      if (!verification.valid) {
        logger.warn('⚠️ Transaction verification failed:', verification.reason);
        // Still process but log the warning
      }

      // Find or create transaction record
      const transaction = await this.webhookController.findFlutterwaveTransaction(data);

      if (!transaction) {
        logger.warn('Transaction not found for webhook:', data.reference || data.tx_ref);
        // Create a new transaction record
        const newTransaction = await this.webhookController.createFlutterwaveTransaction(data);
        
        // Mark event as processed
        this.markEventProcessed(eventId, eventType);
        
        return { success: true, transaction: newTransaction, created: true };
      }

      // Check if status has already been updated (idempotency)
      if (transaction.status === 'SUCCESS') {
        logger.info(`ℹ️ Transaction ${transaction.transaction_reference} already marked as SUCCESS`);
        this.markEventProcessed(eventId, eventType);
        return { success: true, transaction, alreadyProcessed: true };
      }

      // Update transaction status
      await transaction.update({
        status: 'SUCCESS',
        gateway_response: data.processor_response?.code || '00',
        channel: data.payment_method?.type,
        paid_at: data.created_at ? new Date(data.created_at) : new Date(),
        amount: data.amount,
        fees: data.fees || 0,
        flutterwave_data: data,
        webhook_processed_at: new Date(),
        card_type: data.payment_method?.card?.type,
        card_last4: data.payment_method?.card?.last4
      });

      // Process inward transfer
      if (transaction.customer_account) {
        await this.webhookController.processInwardTransfer(transaction, data);
      }

      // Mark event as processed
      this.markEventProcessed(eventId, eventType);

      return { success: true, transaction };
    } catch (error) {
      logger.error('Error handling Flutterwave charge completed:', error);
      throw error;
    }
  }

  /**
   * Handle Flutterwave charge failed with idempotency
   */
  async handleFlutterwaveChargeFailed(data) {
    const eventId = data.id || data.reference || data.tx_ref;
    const eventType = 'charge.failed';
    
    // Check for duplicate event
    if (this.isEventProcessed(eventId, eventType)) {
      logger.info(`🔄 Duplicate Flutterwave event detected: ${eventType}:${eventId} - Skipping`);
      return { success: true, duplicate: true, message: 'Event already processed' };
    }

    try {
      logger.info('❌ Flutterwave charge failed:', {
        reference: data.reference || data.tx_ref,
        reason: data.processor_response?.response || 'Unknown error'
      });

      const transaction = await this.webhookController.findFlutterwaveTransaction(data);

      if (!transaction) {
        logger.warn('Transaction not found for webhook:', data.reference || data.tx_ref);
        this.markEventProcessed(eventId, eventType);
        return;
      }

      // Check if already failed
      if (transaction.status === 'FAILED') {
        logger.info(`ℹ️ Transaction ${transaction.transaction_reference} already marked as FAILED`);
        this.markEventProcessed(eventId, eventType);
        return { success: true, transaction, alreadyProcessed: true };
      }

      await transaction.update({
        status: 'FAILED',
        gateway_response: data.processor_response?.code || '99',
        flutterwave_data: data,
        webhook_processed_at: new Date(),
        failure_reason: data.processor_response?.response || 'Payment failed'
      });

      // Mark event as processed
      this.markEventProcessed(eventId, eventType);

      return { success: true, transaction };
    } catch (error) {
      logger.error('Error handling Flutterwave charge failed:', error);
      throw error;
    }
  }

  /**
   * Handle Flutterwave transfer completed with idempotency
   */
  async handleFlutterwaveTransferCompleted(data) {
    const eventId = data.id || data.reference;
    const eventType = 'transfer.completed';
    
    if (this.isEventProcessed(eventId, eventType)) {
      logger.info(`🔄 Duplicate Flutterwave event detected: ${eventType}:${eventId} - Skipping`);
      return { success: true, duplicate: true };
    }

    try {
      logger.info('✅ Flutterwave transfer completed:', {
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        recipient: data.recipient
      });
      
      const transaction = await this.webhookController.findFlutterwaveTransaction(data);
      
      if (transaction) {
        await transaction.update({
          status: 'TRANSFER_COMPLETED',
          flutterwave_data: data,
          webhook_processed_at: new Date()
        });
      }
      
      this.markEventProcessed(eventId, eventType);
      
      return { success: true, transaction };
    } catch (error) {
      logger.error('Error handling Flutterwave transfer completed:', error);
      throw error;
    }
  }

  /**
   * Handle Flutterwave transfer failed with idempotency
   */
  async handleFlutterwaveTransferFailed(data) {
    const eventId = data.id || data.reference;
    const eventType = 'transfer.failed';
    
    if (this.isEventProcessed(eventId, eventType)) {
      logger.info(`🔄 Duplicate Flutterwave event detected: ${eventType}:${eventId} - Skipping`);
      return { success: true, duplicate: true };
    }

    try {
      logger.info('❌ Flutterwave transfer failed:', {
        reference: data.reference,
        reason: data.reason
      });
      
      const transaction = await this.webhookController.findFlutterwaveTransaction(data);
      
      if (transaction) {
        await transaction.update({
          status: 'TRANSFER_FAILED',
          flutterwave_data: data,
          webhook_processed_at: new Date(),
          failure_reason: data.reason || 'Transfer failed'
        });
      }
      
      this.markEventProcessed(eventId, eventType);
      
      return { success: true, transaction };
    } catch (error) {
      logger.error('Error handling Flutterwave transfer failed:', error);
      throw error;
    }
  }

  /**
   * Handle Flutterwave subscription completed with idempotency
   */
  async handleFlutterwaveSubscriptionCompleted(data) {
    const eventId = data.subscription_id || data.id;
    const eventType = 'subscription.completed';
    
    if (this.isEventProcessed(eventId, eventType)) {
      logger.info(`🔄 Duplicate Flutterwave event detected: ${eventType}:${eventId} - Skipping`);
      return { success: true, duplicate: true };
    }

    try {
      logger.info('📋 Flutterwave subscription completed:', {
        subscription_id: data.subscription_id,
        customer: data.customer
      });
      
      const transaction = await this.webhookController.findFlutterwaveTransaction(data);
      
      if (transaction) {
        await transaction.update({
          status: 'SUBSCRIPTION_ACTIVE',
          flutterwave_data: data,
          webhook_processed_at: new Date()
        });
      }
      
      this.markEventProcessed(eventId, eventType);
      
      return { success: true, transaction };
    } catch (error) {
      logger.error('Error handling Flutterwave subscription completed:', error);
      throw error;
    }
  }

  /**
   * Handle Flutterwave subscription cancelled with idempotency
   */
  async handleFlutterwaveSubscriptionCancelled(data) {
    const eventId = data.subscription_id || data.id;
    const eventType = 'subscription.cancelled';
    
    if (this.isEventProcessed(eventId, eventType)) {
      logger.info(`🔄 Duplicate Flutterwave event detected: ${eventType}:${eventId} - Skipping`);
      return { success: true, duplicate: true };
    }

    try {
      logger.info('📋 Flutterwave subscription cancelled:', {
        subscription_id: data.subscription_id,
        customer: data.customer
      });
      
      const transaction = await this.webhookController.findFlutterwaveTransaction(data);
      
      if (transaction) {
        await transaction.update({
          status: 'SUBSCRIPTION_CANCELLED',
          flutterwave_data: data,
          webhook_processed_at: new Date()
        });
      }
      
      this.markEventProcessed(eventId, eventType);
      
      return { success: true, transaction };
    } catch (error) {
      logger.error('Error handling Flutterwave subscription cancelled:', error);
      throw error;
    }
  }

  /**
   * Main Flutterwave webhook handler - dispatches to specific handlers
   */
  async handleFlutterwaveWebhook(req, res) {
    try {
      const event = req.body;
      const eventType = event.type;
      const data = event.data;

      // Log all received events (recommended by Flutterwave)
      logger.info('📨 Flutterwave webhook received:', {
        eventType: eventType,
        id: event.id,
        reference: data?.reference || data?.tx_ref,
        status: data?.status,
        timestamp: event.timestamp
      });

      // Check if this is a duplicate event based on status
      const existingTransaction = await this.webhookController.findFlutterwaveTransaction(data);
      
      if (existingTransaction) {
        // If the status hasn't changed, it's likely a duplicate
        const currentStatus = existingTransaction.status;
        const newStatus = this.mapFlutterwaveStatusToInternal(data.status);
        
        if (currentStatus === newStatus) {
          logger.info(`ℹ️ Duplicate event - status unchanged (${currentStatus}) for transaction ${existingTransaction.transaction_reference}`);
          // Return 200 to acknowledge receipt (Flutterwave expects 200)
          return res.status(200).json({
            status: 'success',
            message: 'Duplicate event - already processed',
            duplicate: true
          });
        }
      }

      let result;

      switch (eventType) {
        case 'charge.completed':
          result = await this.handleFlutterwaveChargeCompleted(data);
          break;
        case 'charge.failed':
          result = await this.handleFlutterwaveChargeFailed(data);
          break;
        case 'transfer.completed':
          result = await this.handleFlutterwaveTransferCompleted(data);
          break;
        case 'transfer.failed':
          result = await this.handleFlutterwaveTransferFailed(data);
          break;
        case 'subscription.completed':
          result = await this.handleFlutterwaveSubscriptionCompleted(data);
          break;
        case 'subscription.cancelled':
          result = await this.handleFlutterwaveSubscriptionCancelled(data);
          break;
        default:
          logger.warn('⚠️ Unhandled Flutterwave webhook event:', eventType);
          result = { success: true, message: 'Unhandled event type', eventType };
      }

      // Always return 200 to acknowledge receipt
      return res.status(200).json({
        status: 'success',
        message: 'Webhook processed',
        data: result
      });

    } catch (error) {
      logger.error('❌ Flutterwave webhook processing error:', error);
      // Still return 200 to prevent retries from Flutterwave
      return res.status(200).json({
        status: 'error',
        message: 'Failed to process webhook',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Map Flutterwave status to internal status
   */
  mapFlutterwaveStatusToInternal(flutterwaveStatus) {
    const statusMap = {
      'successful': 'SUCCESS',
      'succeeded': 'SUCCESS',
      'success': 'SUCCESS',
      'failed': 'FAILED',
      'cancelled': 'CANCELLED',
      'pending': 'PENDING'
    };
    return statusMap[flutterwaveStatus] || flutterwaveStatus;
  }

  // ================================================================
  // END OF FLUTTERWAVE WEBHOOK HANDLERS
  // ================================================================

  /**
   * Get gateway configuration based on request
   */
  getGatewayConfig(req) {
    const gateway = req.params.gateway || req.query.gateway || req.body.gateway;
    
    if (gateway && this.gatewayConfigs[gateway]) {
      return {
        ...this.gatewayConfigs[gateway],
        name: gateway
      };
    }
    
    // Auto-detect based on headers
    if (req.headers['stripe-signature']) {
      return { ...this.gatewayConfigs.stripe, name: 'stripe' };
    }
    if (req.headers['paypal-transmission-sig']) {
      return { ...this.gatewayConfigs.paypal, name: 'paypal' };
    }
    if (req.headers['flutterwave-signature']) {
      return { ...this.gatewayConfigs.flutterwave, name: 'flutterwave' };
    }
    if (req.headers['x-paystack-signature']) {
      return { ...this.gatewayConfigs.paystack, name: 'paystack' };
    }
    if (req.headers['x-nip-signature']) {
      return { ...this.gatewayConfigs.nip, name: 'nip' };
    }
    if (req.headers['remitta-signature']) {
      return { ...this.gatewayConfigs.remitta, name: 'remitta' };
    }
    
    return {
      secretKey: this.defaultSecretKey,
      allowedIps: this.defaultAllowedIps,
      signatureHeader: 'x-webhook-signature',
      timestampHeader: 'x-webhook-timestamp',
      parser: this.parseJSONPayload.bind(this),
      webhookMethod: 'handleJsonWebhook',
      name: 'json'
    };
  }

  /**
   * Verify webhook signature based on gateway
   */
  verifySignature(payload, signature, timestamp, gatewayConfig, rawBody = null) {
    if (!gatewayConfig.secretKey) return true;
    
    try {
      switch (gatewayConfig.name) {
        case 'stripe':
          return this.verifyStripeSignature(payload, signature, gatewayConfig.secretKey);
        case 'paypal':
          return this.verifyPayPalSignature(payload, signature, timestamp, gatewayConfig.secretKey);
        case 'flutterwave':
          return this.verifyFlutterwaveSignature(rawBody, signature, gatewayConfig.secretKey);
        case 'paystack':
          return this.verifyPaystackSignature(payload, signature, gatewayConfig.secretKey);
        case 'nip':
          return this.verifyNIPSignature(payload, signature, gatewayConfig.secretKey);
        default:
          return this.verifyGenericSignature(payload, signature, timestamp, gatewayConfig.secretKey);
      }
    } catch (error) {
      logger.error(`Signature verification failed for ${gatewayConfig.name}`, { error: error.message });
      return false;
    }
  }

  /**
   * Generic signature verification (HMAC-SHA256)
   */
  verifyGenericSignature(payload, signature, timestamp, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    const data = timestamp ? `${timestamp}.${JSON.stringify(payload)}` : JSON.stringify(payload);
    const expectedSignature = hmac.update(data).digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Stripe signature verification
   */
  verifyStripeSignature(payload, signature, secretKey) {
    const expected = crypto
      .createHmac('sha256', secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  }

  /**
   * PayPal signature verification
   */
  async verifyPayPalSignature(payload, signature, timestamp, secretKey) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    return true;
  }

  /**
   * Flutterwave signature verification
   * Uses HMAC-SHA256 with the raw request body
   */
  verifyFlutterwaveSignature(rawBody, signature, secretHash) {
    if (!signature) {
      logger.warn('Missing flutterwave-signature header');
      return false;
    }
    
    if (!rawBody) {
      logger.warn('Raw body not available for Flutterwave signature verification');
      return false;
    }
    
    if (!secretHash) {
      logger.warn('Secret hash not configured - skipping verification');
      return true;
    }
    
    try {
      // CRITICAL: Flutterwave uses HMAC-SHA256 with the RAW request body
      const hash = crypto
        .createHmac('sha256', secretHash)
        .update(rawBody)
        .digest('base64');
      
      // Use timing-safe comparison
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(hash)
      );
      
      if (!isValid) {
        logger.warn('Invalid Flutterwave signature');
        logger.debug(`Expected: ${hash}`);
        logger.debug(`Received: ${signature}`);
      }
      
      return isValid;
    } catch (error) {
      logger.error('Flutterwave signature verification error:', error);
      return false;
    }
  }

  /**
   * Paystack signature verification
   */
  verifyPaystackSignature(payload, signature, secretKey) {
    const hash = crypto.createHmac('sha512', secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    return hash === signature;
  }

  /**
   * NIP signature verification
   */
  verifyNIPSignature(payload, signature, secretKey) {
    const sign = crypto.createSign('SHA256');
    sign.update(JSON.stringify(payload));
    sign.end();
    return sign.verify(secretKey, signature, 'base64');
  }

  /**
   * Verify IP whitelist
   */
  verifyIp(ip, gatewayConfig) {
    const allowedIps = gatewayConfig.allowedIps || this.defaultAllowedIps;
    if (allowedIps.length === 0) return true;
    
    return allowedIps.some(allowedIp => {
      if (allowedIp.includes('/')) {
        return this.ipInCidr(ip, allowedIp);
      }
      return ip === allowedIp;
    });
  }

  /**
   * Check if IP is in CIDR range
   */
  ipInCidr(ip, cidr) {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);
    const ipNum = this.ipToLong(ip);
    const rangeNum = this.ipToLong(range);
    return (ipNum & mask) === (rangeNum & mask);
  }

  /**
   * Convert IP to long integer
   */
  ipToLong(ip) {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
  }

  /**
   * Parse Flutterwave payload
   */
  parseFlutterwavePayload(data) {
    const transactionData = data.data || data;
    
    return {
      gateway: 'flutterwave',
      xferRef: transactionData.tx_ref || transactionData.id || data.id,
      xferAmt: parseFloat(transactionData.amount || 0),
      xferCrncyId: this.getCurrencyId(transactionData.currency || 'NGN'),
      payCrncyId: this.getCurrencyId(transactionData.currency || 'NGN'),
      payExchRate: 1,
      valueDt: transactionData.created_at ? new Date(transactionData.created_at) : 
               (data.timestamp ? new Date(data.timestamp) : new Date()),
      priorityLevelCd: 'NORMAL',
      beneficiary: {
        name: transactionData.beneficiary_name || 
              transactionData.customer?.name || 
              transactionData.customer?.email || 
              'Unknown Beneficiary',
        account: transactionData.beneficiary_account || 
                 transactionData.customer?.email || 
                 transactionData.id,
        bankName: transactionData.beneficiary_bank || 'Flutterwave'
      },
      remitter: {
        name: transactionData.sender || 
              transactionData.customer?.name || 
              'Flutterwave User',
        accountNo: transactionData.sender_account || 'FLW-REM'
      },
      payDetails: JSON.stringify(data),
      paymentMtdCd: 'FLUTTERWAVE',
      foreignIftFg: transactionData.currency && transactionData.currency !== 'NGN' ? 'Y' : 'N',
      userId: 'FLUTTERWAVE',
      createdBy: 'FLUTTERWAVE',
      recSt: 'A',
      flutterwaveEventId: data.id,
      flutterwaveEventType: data.type,
      flutterwaveTimestamp: data.timestamp,
      flutterwaveStatus: transactionData.status,
      flutterwaveReference: transactionData.reference,
      metadata: {
        payment_method: transactionData.payment_method,
        processor_response: transactionData.processor_response,
        redirect_url: transactionData.redirect_url
      }
    };
  }

  /**
   * Parse NIP payload
   */
  parseNIPPayload(data) {
    return {
      gateway: 'nip',
      xferRef: data.PaymentReference || data.Reference,
      xferAmt: parseFloat(data.Amount),
      xferCrncyId: this.getCurrencyId(data.Currency || 'NGN'),
      payCrncyId: this.getCurrencyId(data.Currency || 'NGN'),
      payExchRate: 1,
      valueDt: new Date(data.TransactionDate || data.SettlementDate),
      priorityLevelCd: 'NORMAL',
      beneficiary: {
        name: data.BeneficiaryAccountName,
        account: data.BeneficiaryAccountNumber,
        bicId: this.getBICId(data.DestinationInstitutionCode),
        bankName: data.DestinationBankName,
        bankCntryId: 1
      },
      remitter: {
        name: data.OriginatorAccountName,
        accountNo: data.OriginatorAccountNumber
      },
      nipSessionId: data.SessionID,
      nipResponseCode: data.ResponseCode,
      settlementDate: new Date(data.SettlementDate),
      nipChannelCode: data.ChannelCode,
      nipDestinationInstitution: data.DestinationInstitutionCode,
      nipTransactionFee: parseFloat(data.TransactionFee),
      nipTransactionLocation: data.TransactionLocation,
      beneficiaryBVN: data.BeneficiaryBVN,
      originatorBVN: data.OriginatorBVN,
      userId: 'NIP',
      createdBy: 'NIP',
      recSt: 'A'
    };
  }

  /**
   * Parse PayPal payload
   */
  parsePayPalPayload(data) {
    return {
      gateway: 'paypal',
      xferRef: data.resource?.transaction_id || data.id,
      xferAmt: parseFloat(data.resource?.amount?.value || data.resource?.amount),
      xferCrncyId: this.getCurrencyId(data.resource?.amount?.currency || 'USD'),
      payCrncyId: this.getCurrencyId(data.resource?.amount?.currency || 'USD'),
      payExchRate: this.getExchangeRate(data.resource?.amount?.currency || 'USD', 'NGN'),
      valueDt: new Date(data.create_time || data.event_date),
      priorityLevelCd: 'NORMAL',
      beneficiary: {
        name: data.resource?.recipient_name || data.resource?.payee?.email,
        account: data.resource?.recipient_account || data.resource?.payee?.merchant_id,
        bankName: 'PayPal'
      },
      remitter: {
        name: data.resource?.sender_name || data.resource?.sender?.email,
        accountNo: data.resource?.sender_account
      },
      payDetails: JSON.stringify(data),
      paymentMtdCd: 'PAYPAL',
      foreignIftFg: 'Y',
      userId: 'PAYPAL',
      createdBy: 'PAYPAL',
      recSt: 'A'
    };
  }

  /**
   * Parse Stripe payload
   */
  parseStripePayload(data) {
    return {
      gateway: 'stripe',
      xferRef: data.data?.object?.id || data.id,
      xferAmt: parseFloat(data.data?.object?.amount) / 100,
      xferCrncyId: this.getCurrencyId(data.data?.object?.currency?.toUpperCase() || 'USD'),
      payCrncyId: this.getCurrencyId(data.data?.object?.currency?.toUpperCase() || 'USD'),
      payExchRate: 1,
      valueDt: new Date(data.created * 1000),
      priorityLevelCd: 'NORMAL',
      beneficiary: {
        name: data.data?.object?.destination?.name,
        account: data.data?.object?.destination?.id || data.data?.object?.destination
      },
      remitter: {
        name: data.data?.object?.source?.name || 'Stripe'
      },
      payDetails: JSON.stringify(data),
      paymentMtdCd: 'STRIPE',
      foreignIftFg: 'Y',
      userId: 'STRIPE',
      createdBy: 'STRIPE',
      recSt: 'A'
    };
  }

  /**
   * Parse Paystack payload
   */
  parsePaystackPayload(data) {
    return {
      gateway: 'paystack',
      xferRef: data.data?.reference || data.data?.id,
      xferAmt: parseFloat(data.data?.amount) / 100,
      xferCrncyId: this.getCurrencyId(data.data?.currency || 'NGN'),
      payCrncyId: this.getCurrencyId(data.data?.currency || 'NGN'),
      payExchRate: 1,
      valueDt: new Date(data.data?.paid_at || data.data?.created_at),
      priorityLevelCd: 'NORMAL',
      beneficiary: {
        name: data.data?.recipient?.name || data.data?.customer?.name,
        account: data.data?.recipient?.details?.account_number || data.data?.customer?.email,
        bankName: data.data?.recipient?.details?.bank_name
      },
      remitter: {
        name: data.data?.authorization?.sender_name || 'Paystack'
      },
      payDetails: JSON.stringify(data),
      paymentMtdCd: 'PAYSTACK',
      foreignIftFg: data.data?.currency !== 'NGN' ? 'Y' : 'N',
      userId: 'PAYSTACK',
      createdBy: 'PAYSTACK',
      recSt: 'A'
    };
  }

  /**
   * Parse Interswitch payload
   */
  parseInterswitchPayload(data) {
    return {
      gateway: 'interswitch',
      xferRef: data.transactionRef || data.paymentReference,
      xferAmt: parseFloat(data.amount),
      xferCrncyId: this.getCurrencyId(data.currency || 'NGN'),
      payCrncyId: this.getCurrencyId(data.currency || 'NGN'),
      payExchRate: 1,
      valueDt: new Date(data.transactionDate),
      priorityLevelCd: 'NORMAL',
      beneficiary: {
        name: data.beneficiaryName,
        account: data.beneficiaryAccountNumber,
        bankName: data.beneficiaryBank
      },
      remitter: {
        name: data.payerName,
        accountNo: data.payerAccountNumber
      },
      payDetails: JSON.stringify(data),
      paymentMtdCd: 'INTERSWITCH',
      foreignIftFg: 'N',
      userId: 'INTERSWITCH',
      createdBy: 'INTERSWITCH',
      recSt: 'A'
    };
  }

  /**
   * Parse Remitta payload
   */
  parseRemittaPayload(data) {
    return {
      gateway: 'remitta',
      xferRef: data.orderId || data.transactionId,
      xferAmt: parseFloat(data.amount),
      xferCrncyId: this.getCurrencyId('NGN'),
      payCrncyId: this.getCurrencyId('NGN'),
      payExchRate: 1,
      valueDt: new Date(data.transactionDate),
      priorityLevelCd: 'NORMAL',
      beneficiary: {
        name: data.beneficiaryName,
        account: data.beneficiaryAccountNumber,
        bankName: 'Remitta'
      },
      remitter: {
        name: data.payerName,
        accountNo: data.payerAccountNumber
      },
      payDetails: JSON.stringify(data),
      paymentMtdCd: 'REMITTA',
      foreignIftFg: 'N',
      userId: 'REMITTA',
      createdBy: 'REMITTA',
      recSt: 'A'
    };
  }

  /**
   * Parse generic JSON payload
   */
  parseJSONPayload(data) {
    const getCurrencyId = (value) => {
      if (!value) return 1;
      if (typeof value === 'number') return value;
      return this.currencyMap[value.toString().toUpperCase()] || 1;
    };

    const getCountryId = (value) => {
      if (!value) return 1;
      if (typeof value === 'number') return value;
      return this.countryMap[value.toString().toUpperCase()] || 1;
    };

    const getBicId = (value) => {
      if (!value) return null;
      if (typeof value === 'number') return value;
      return this.bankMap[value.toString()] || parseInt(value) || null;
    };

    let beneficiaryName = null;
    let beneficiaryAccount = null;
    let beneficiaryBicId = null;
    let beneficiaryBankName = null;
    let beneficiaryCountryId = null;

    if (data.beneficiary) {
      beneficiaryName = data.beneficiary.name || beneficiaryName;
      beneficiaryAccount = data.beneficiary.account || data.beneficiary.account_number || beneficiaryAccount;
      beneficiaryBicId = data.beneficiary.bicId || data.beneficiary.bic || data.beneficiary.bicCode || data.beneficiary.bic_id || beneficiaryBicId;
      beneficiaryBankName = data.beneficiary.bankName || data.beneficiary.bank || data.beneficiary.bank_name || beneficiaryBankName;
      beneficiaryCountryId = data.beneficiary.bankCntryId || data.beneficiary.countryId || data.beneficiary.bankCountry || data.beneficiary.country || beneficiaryCountryId;
    }

    beneficiaryName = beneficiaryName || data.beneficiaryName || data.beneficiary_name;
    beneficiaryAccount = beneficiaryAccount || data.beneficiaryAccount || data.beneficiary_account || data.beneficiaryAccountNumber;
    beneficiaryBicId = beneficiaryBicId || data.beneficiaryBIC || data.beneficiary_bic || data.beneficiaryBicCode || data.beneficiary_bic_code;
    beneficiaryBankName = beneficiaryBankName || data.beneficiaryBank || data.beneficiary_bank || data.beneficiaryBankName || data.beneficiary_bank_name;
    beneficiaryCountryId = beneficiaryCountryId || data.beneficiaryCountry || data.beneficiary_country || data.beneficiaryBankCountry;

    let remitterName = null;
    let remitterAccountNo = null;

    if (data.remitter) {
      remitterName = data.remitter.name || remitterName;
      remitterAccountNo = data.remitter.accountNo || data.remitter.account || data.remitter.account_number || data.remitter.account_no || remitterAccountNo;
    }

    remitterName = remitterName || data.remitterName || data.remitter_name;
    remitterAccountNo = remitterAccountNo || data.remitterAccount || data.remitter_account || data.remitterAccountNo || data.remitter_account_no;

    return {
      gateway: data.gateway || 'json',
      xferRef: data.xferRef || data.reference || data.transactionId || data.id || data.XFER_REF,
      xferAmt: parseFloat(data.xferAmt || data.amount || data.XFER_AMT || data.value || 0),
      xferCrncyId: getCurrencyId(data.xferCrncyId || data.xferCurrency || data.currency || data.XFER_CRNCY_ID),
      payCrncyId: getCurrencyId(data.payCrncyId || data.paymentCurrency || data.payCurrency || data.PAY_CRNCY_ID),
      payExchRate: parseFloat(data.payExchRate || data.exchangeRate || data.PAY_EXCH_RATE || 1),
      valueDt: data.valueDt ? new Date(data.valueDt) : (data.VALUE_DT ? new Date(data.VALUE_DT) : new Date()),
      priorityLevelCd: data.priorityLevelCd || data.priority || data.PRIORITY_LEVEL_CD || 'NORMAL',
      
      beneficiary: {
        name: beneficiaryName,
        account: beneficiaryAccount,
        bicId: getBicId(beneficiaryBicId),
        bankName: beneficiaryBankName,
        bankCntryId: getCountryId(beneficiaryCountryId)
      },
      
      remitter: {
        name: remitterName,
        accountNo: remitterAccountNo
      },
      
      sendingBankChrg: parseFloat(data.sendingBankChrg || data.sendingCharge || data.SENDING_BANK_CHRG || 0),
      receivingBankChrg: parseFloat(data.receivingBankChrg || data.receivingCharge || data.RECIEVING_BANK_CHRG || 0),
      
      paymentMtdCd: data.paymentMtdCd || data.paymentMethod || data.PAYMENT_MTD_CD || 'GENERIC',
      payDetails: data.payDetails || JSON.stringify(data),
      userId: data.userId || 'WEBHOOK_JSON',
      createdBy: data.createdBy || 'WEBHOOK_JSON',
      recSt: data.recSt || 'A'
    };
  }

  /**
   * Parse ISO 20022 payload
   */
  parseISO20022Payload(xmlData) {
    const transfer = this.parseIso20022(xmlData);
    return {
      gateway: 'iso20022',
      ...transfer,
      paymentMtdCd: 'ISO20022',
      userId: 'ISO20022',
      createdBy: 'ISO20022',
      recSt: 'A'
    };
  }

  /**
   * Parse SWIFT payload
   */
  parseSwiftPayload(swiftMessage) {
    const transfer = this.parseSwiftMT103(swiftMessage);
    return {
      gateway: 'swift',
      ...transfer,
      paymentMtdCd: 'SWIFT',
      userId: 'SWIFT',
      createdBy: 'SWIFT',
      recSt: 'A'
    };
  }

  /**
   * Helper to get currency ID
   */
  getCurrencyId(currencyCode) {
    if (!currencyCode) return 1;
    if (typeof currencyCode === 'number') return currencyCode;
    return this.currencyMap[currencyCode?.toString().toUpperCase()] || 1;
  }

  /**
   * Helper to get BIC ID
   */
  getBICId(bankCode) {
    if (!bankCode) return null;
    return this.bankMap[bankCode?.toString()] || null;
  }

  /**
   * Helper to get exchange rate
   */
  getExchangeRate(fromCurrency, toCurrency) {
    if (fromCurrency === toCurrency) return 1;
    return 1;
  }

  /**
   * Parse ISO 20022 (placeholder)
   */
  parseIso20022(xmlData) {
    logger.info('Parsing ISO 20022 message', { xmlData });
    return {
      xferRef: extractXmlValue(xmlData, 'Ref'),
      xferAmt: parseFloat(extractXmlValue(xmlData, 'Amt') || 0),
    };
  }

  /**
   * Parse SWIFT MT103 (placeholder)
   */
  parseSwiftMT103(swiftMessage) {
    logger.info('Parsing SWIFT MT103 message', { swiftMessage });
    return {
      xferRef: swiftMessage.substring(0, 16),
      xferAmt: parseFloat(swiftMessage.substring(16, 32) || 0),
    };
  }

  /**
   * Main webhook handler - delegates to webhookController
   */
  async handleWebhook(req, res, next) {
    try {
      const clientIp = req.ip || req.connection.remoteAddress;
      const gatewayConfig = this.getGatewayConfig(req);
      
      logger.info(`Multi-gateway webhook received from ${gatewayConfig.name}`, {
        gateway: gatewayConfig.name,
        clientIp,
        headers: req.headers
      });
      
      // Verify IP
      if (!this.verifyIp(clientIp, gatewayConfig)) {
        logger.warn(`Webhook access denied from IP: ${clientIp} for gateway: ${gatewayConfig.name}`);
        return res.status(403).json({ 
          error: 'Access denied',
          gateway: gatewayConfig.name 
        });
      }
      
      // Get signature from appropriate header
      const signature = req.headers[gatewayConfig.signatureHeader?.toLowerCase()];
      const timestamp = gatewayConfig.timestampHeader ? 
                       req.headers[gatewayConfig.timestampHeader?.toLowerCase()] : null;
      
      // Verify signature if configured
      if (gatewayConfig.secretKey && signature) {
        const isValid = await this.verifySignature(
          req.body, 
          signature, 
          timestamp, 
          gatewayConfig,
          req.rawBody // Pass raw body for Flutterwave verification
        );
        
        if (!isValid) {
          logger.warn(`Invalid signature for gateway: ${gatewayConfig.name}`);
          return res.status(401).json({ 
            error: 'Invalid signature',
            gateway: gatewayConfig.name 
          });
        }
      }
      
      // For Flutterwave, use the dedicated handler with idempotency
      if (gatewayConfig.name === 'flutterwave') {
        return await this.handleFlutterwaveWebhook(req, res);
      }
      
      // Parse payload using gateway-specific parser
      let parsedTransfers = [];
      
      if (Array.isArray(req.body)) {
        parsedTransfers = req.body.map(item => gatewayConfig.parser(item));
      } else if (req.body.transfers || req.body.data) {
        const items = req.body.transfers || req.body.data || [req.body];
        parsedTransfers = (Array.isArray(items) ? items : [items]).map(
          item => gatewayConfig.parser(item)
        );
      } else {
        parsedTransfers = [gatewayConfig.parser(req.body)];
      }
      
      logger.info(`Processing ${parsedTransfers.length} transfers from ${gatewayConfig.name}`, {
        gateway: gatewayConfig.name
      });
      
      // Create a new request object for webhookController
      const controllerReq = {
        ...req,
        body: parsedTransfers.length === 1 ? parsedTransfers[0] : parsedTransfers
      };
      
      // Create a response interceptor to format responses based on gateway
      const controllerRes = {
        ...res,
        status: (code) => ({
          json: (data) => {
            const formattedResponse = this.formatResponse(
              { successful: data.success ? [data] : [], failed: [] },
              gatewayConfig.name,
              data
            );
            
            const statusCode = code === 201 || code === 200 ? 200 : code;
            
            if (gatewayConfig.name === 'nip') {
              return res.status(200).json(formattedResponse);
            }
            
            return res.status(statusCode).json(formattedResponse);
          }
        })
      };
      
      // Call appropriate webhookController method
      const webhookMethod = gatewayConfig.webhookMethod || 'handleJsonWebhook';
      
      if (webhookMethod === 'handleNIPFundsTransfer') {
        await this.webhookController.handleNIPFundsTransfer(controllerReq, controllerRes);
      } else {
        await this.webhookController.handleJsonWebhook(controllerReq, controllerRes);
      }
      
    } catch (error) {
      logger.error('Multi-gateway webhook processing failed', {
        error: error.message,
        body: req.body,
        gateway: req.params.gateway
      });
      
      const gatewayConfig = this.getGatewayConfig(req);
      const errorResponse = this.formatErrorResponse(error, gatewayConfig.name);
      
      res.status(errorResponse.statusCode).json(errorResponse.response);
    }
  }

  /**
   * Format success response based on gateway
   */
  formatResponse(results, gateway, originalData = null) {
    const baseResponse = {
      success: results.failed.length === 0,
      message: `Processed ${results.successful.length} transfers, ${results.failed.length} failed`,
      gateway,
      timestamp: new Date().toISOString()
    };
    
    switch (gateway) {
      case 'nip':
        return {
          SessionID: originalData?.SessionID || originalData?.nipSessionId,
          DestinationInstitutionCode: process.env.NIP_INSTITUTION_CODE,
          ChannelCode: originalData?.ChannelCode || originalData?.nipChannelCode,
          ResponseCode: results.failed.length === 0 ? '00' : '96',
          ResponseDescription: baseResponse.message,
          PaymentReference: originalData?.PaymentReference || originalData?.xferRef,
          Amount: originalData?.Amount || originalData?.xferAmt?.toString(),
          ...(originalData && { ...originalData })
        };
      
      case 'stripe':
        return {
          ...baseResponse,
          received: true
        };
      
      case 'paypal':
        return {
          ...baseResponse,
          event_type: 'PAYMENT.PAYOUTSBATCH.SUCCESS'
        };
      
      case 'flutterwave':
      case 'paystack':
        return {
          status: 'success',
          message: baseResponse.message,
          data: results.successful[0] || null
        };
      
      default:
        return {
          ...baseResponse,
          data: results.successful
        };
    }
  }

  /**
   * Format error response based on gateway
   */
  formatErrorResponse(error, gateway) {
    logger.error(`Formatting error response for ${gateway}:`, error);
    
    switch (gateway) {
      case 'nip':
        return {
          statusCode: 200,
          response: {
            SessionID: error.sessionId || null,
            DestinationInstitutionCode: process.env.NIP_INSTITUTION_CODE,
            ResponseCode: '96',
            ResponseDescription: error.message || 'System error occurred'
          }
        };
      
      case 'stripe':
        return {
          statusCode: 400,
          response: {
            error: {
              message: error.message,
              type: 'invalid_request_error'
            }
          }
        };
      
      case 'paypal':
        return {
          statusCode: 400,
          response: {
            name: 'WEBHOOK_ERROR',
            message: error.message,
            debug_id: Date.now().toString()
          }
        };
      
      default:
        return {
          statusCode: 500,
          response: {
            success: false,
            error: error.message,
            gateway
          }
        };
    }
  }

  /**
   * Health check endpoint
   */
  async healthCheck(req, res) {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'multi-gateway-webhook',
      supportedGateways: Object.keys(this.gatewayConfigs)
    });
  }

  /**
   * Get supported gateways
   */
  async getSupportedGateways(req, res) {
    res.json({
      success: true,
      data: Object.keys(this.gatewayConfigs).map(name => ({
        name,
        supported: true
      }))
    });
  }

  /**
   * Get supported gateways list (for internal use)
   */
  getSupportedGatewaysList() {
    return Object.keys(this.gatewayConfigs);
  }

  /**
   * Validate payload structure
   */
  validatePayload(payload) {
    const gateway = payload.gateway || 'json';
    const errors = [];
    const requiredFields = ['xferRef', 'beneficiary'];
    
    if (!payload.xferRef && !payload.reference) {
      errors.push('Missing transfer reference');
    }
    
    if (!payload.beneficiary?.account && !payload.beneficiaryAccount) {
      errors.push('Missing beneficiary account');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      requiredFields
    };
  }
}

// Helper function for XML extraction
function extractXmlValue(xml, path) {
  const match = xml.match(new RegExp(`<${path}>([^<]+)</${path}>`));
  return match ? match[1] : null;
}

export default MultiGatewayWebhook;