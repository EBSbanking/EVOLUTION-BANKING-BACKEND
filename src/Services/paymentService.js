// services/paymentService.js
import crypto from 'crypto';
import FlutterwaveController from '../controllers/FlutterwaveController.js';
import DebitCard from '../models/DebitCard.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { sequelize } from '../../config/db.js';
import logger from '../utils/logger.js';
import { recordTransaction } from './transactionHistory.js';
import { processCardTransaction } from './cardTransactionService.js';
import { 
  generateFlutterwaveCardDetails,
  validateCardForFlutterwave,
  formatCardNumberForFlutterwave,
  isValidCardNumber,
  maskCardNumber
} from '../utils/cardGenerator.js';

/**
 * Process payment using an issued card via Flutterwave
 * This integrates your internal card system with Flutterwave
 * 
 * @param {number} cardId - Internal card ID
 * @param {number} amount - Amount to charge
 * @param {string} email - Customer email
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Payment result
 */
export async function processPaymentWithIssuedCard(cardId, amount, email, options = {}) {
  const dbTransaction = await sequelize.transaction();
  
  try {
    // 1. Get the card details from your database
    const card = await DebitCard.findByPk(cardId, {
      include: [{ model: CustomerAccount, as: 'customerAccount' }],
      transaction: dbTransaction,
      lock: true
    });
    
    if (!card) {
      throw new Error('Card not found');
    }
    
    if (!card.customerAccount) {
      throw new Error('Customer account not found');
    }
    
    // 2. Validate card for transaction
    const validity = card.isValidForTransaction(amount);
    if (!validity.valid) {
      throw new Error(validity.reason);
    }
    
    // 3. Check if card is enabled for Flutterwave
    if (!card.flutterwaveEnabled) {
      throw new Error('Card not enabled for Flutterwave payments');
    }
    
    // 4. Decrypt CVV if stored encrypted
    let cvv = null;
    if (card.encryptedCvv) {
      const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error('Card encryption key not configured');
      }
      const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
      cvv = decipher.update(card.encryptedCvv, 'hex', 'utf8') + decipher.final('utf8');
    } else {
      throw new Error('CVV not available for Flutterwave payment');
    }
    
    // 5. Validate card data for Flutterwave
    const cardDataForValidation = {
      card_number: card.cardPan,
      cvv: cvv,
      expiry_month: card.expiryMonth,
      expiry_year: card.expiryYear
    };
    
    const validation = validateCardForFlutterwave(cardDataForValidation);
    if (!validation.valid) {
      throw new Error(`Card validation failed: ${validation.errors.join(', ')}`);
    }
    
    // 6. Prepare Flutterwave payment request
    const paymentData = {
      cardNumber: formatCardNumberForFlutterwave(card.cardPan),
      cvv: cvv,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      email: email || card.customerAccount.email || 'customer@example.com',
      amount: amount,
      currency: options.currency || 'NGN',
      reference: options.reference || `FLW-${Date.now()}-${cardId}`,
      redirectUrl: options.redirectUrl || process.env.FLUTTERWAVE_CALLBACK_URL,
      metadata: {
        card_id: card.id,
        card_last4: card.cardLast4,
        account_number: card.customerAccount.account_number,
        customer_id: card.customerId,
        source: 'evolution_banking',
        internal_transaction: true
      },
      firstName: options.firstName || card.customerAccount.account_name?.split(' ')[0] || 'Customer',
      lastName: options.lastName || card.customerAccount.account_name?.split(' ').slice(1).join(' ') || 'User',
      phone: options.phone || card.customerAccount.phone || '08000000000',
      accountNumber: card.customerAccount.account_number,
      ...options
    };
    
    // 7. Process payment via Flutterwave
    logger.info('💳 Processing Flutterwave payment with issued card:', {
      cardId: card.id,
      cardLast4: card.cardLast4,
      amount,
      email,
      cardScheme: card.cardScheme
    });
    
    // Create a mock request object for FlutterwaveController
    const mockReq = {
      body: paymentData,
      user: { username: 'SYSTEM' }
    };
    
    // Create a mock response object to capture the result
    let paymentResult = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          paymentResult = {
            statusCode: code,
            data: data
          };
        }
      })
    };
    
    // Call Flutterwave controller
    await FlutterwaveController.initializeCardPayment(mockReq, mockRes);
    
    if (!paymentResult || paymentResult.statusCode !== 200) {
      throw new Error(paymentResult?.data?.error || 'Payment initiation failed');
    }
    
    // 8. Record the transaction in your system
    if (paymentResult.data.success) {
      // Update card daily spend
      const today = new Date().toISOString().slice(0, 10);
      await card.update({
        dailySpentToday: parseFloat(card.dailySpentToday || 0) + amount,
        lastResetDate: today,
        lastUsedAt: new Date()
      }, { transaction: dbTransaction });
      
      // Record transaction in your system
      await recordTransaction({
        accountNumber: card.customerAccount.account_number,
        accountId: String(card.customerAccount.id),
        buId: card.customerAccount.bu_id || 1,
        customerId: String(card.customerId),
        accountName: card.customerAccount.account_name,
        amount: amount,
        direction: 'DEBIT',
        transactionType: 'FLUTTERWAVE_PAYMENT',
        reference: paymentData.reference,
        description: `Flutterwave payment using card ${card.cardLast4}`,
        createdBy: 'SYSTEM',
        currency: options.currency || 'NGN',
        metadata: {
          card_id: card.id,
          card_pan_last4: card.cardLast4,
          flutterwave_reference: paymentResult.data.data?.flutterwave_reference,
          payment_link: paymentResult.data.data?.payment_link,
          payment_data: paymentResult.data.data
        },
        existingTransaction: dbTransaction
      });
      
      await dbTransaction.commit();
      
      return {
        success: true,
        message: 'Payment initiated successfully',
        data: {
          reference: paymentData.reference,
          flutterwave_reference: paymentResult.data.data?.flutterwave_reference,
          payment_link: paymentResult.data.data?.payment_link,
          transaction_id: paymentResult.data.data?.transaction_id,
          card_last4: card.cardLast4,
          amount: amount,
          status: paymentResult.data.data?.status || 'PENDING',
          card_scheme: card.cardScheme
        }
      };
    } else {
      await dbTransaction.rollback();
      return {
        success: false,
        message: paymentResult.data.message || 'Payment initiation failed',
        error: paymentResult.data.error
      };
    }
    
  } catch (error) {
    await dbTransaction.rollback();
    logger.error('❌ Payment processing error:', {
      error: error.message,
      cardId,
      amount,
      email
    });
    
    return {
      success: false,
      message: 'Payment processing failed',
      error: error.message
    };
  }
}

/**
 * Generate a test card for Flutterwave payments
 * Useful for testing and development
 * 
 * @param {string} scheme - Card scheme (VERVE, VISA, MASTERCARD, AMEX, DISCOVER)
 * @param {string} cardHolderName - Name on card
 * @returns {Promise<Object>} Generated card details
 */
export async function generateTestCardForFlutterwave(scheme = 'VISA', cardHolderName = 'Test Customer') {
  try {
    logger.info('🔐 Generating test card for Flutterwave:', { scheme, cardHolderName });
    
    // Generate complete card details
    const cardDetails = await generateFlutterwaveCardDetails(scheme, cardHolderName);
    
    // Validate the generated card
    const validation = validateCardForFlutterwave({
      card_number: cardDetails.card_number,
      cvv: cardDetails.cvv,
      expiry_month: cardDetails.expiry_month,
      expiry_year: cardDetails.expiry_year
    });
    
    if (!validation.valid) {
      throw new Error(`Generated card validation failed: ${validation.errors.join(', ')}`);
    }
    
    logger.info('✅ Test card generated successfully:', {
      scheme: cardDetails.scheme,
      last4: cardDetails.last4,
      expiry: cardDetails.expiry_formatted
    });
    
    return {
      success: true,
      data: {
        card_number: cardDetails.card_number,
        masked_card: maskCardNumber(cardDetails.card_number),
        cvv: cardDetails.cvv,
        expiry_month: cardDetails.expiry_month,
        expiry_year: cardDetails.expiry_year,
        expiry_formatted: cardDetails.expiry_formatted,
        card_holder_name: cardDetails.card_holder_name,
        bin: cardDetails.bin,
        last4: cardDetails.last4,
        scheme: cardDetails.scheme,
        is_valid: validation.valid
      }
    };
    
  } catch (error) {
    logger.error('❌ Failed to generate test card:', {
      error: error.message,
      scheme
    });
    throw error;
  }
}

/**
 * Process payment with a generated test card
 * Useful for testing Flutterwave integration
 * 
 * @param {number} amount - Amount to charge
 * @param {string} email - Customer email
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Payment result
 */
export async function processPaymentWithGeneratedCard(amount, email, options = {}) {
  try {
    // Generate a test card
    const cardResult = await generateTestCardForFlutterwave(
      options.scheme || 'VISA',
      options.cardHolderName || 'Test Customer'
    );
    
    if (!cardResult.success) {
      throw new Error('Failed to generate test card');
    }
    
    const card = cardResult.data;
    
    logger.info('💳 Processing payment with generated test card:', {
      scheme: card.scheme,
      last4: card.last4,
      amount,
      email
    });
    
    // Prepare payment data
    const paymentData = {
      cardNumber: card.card_number,
      cvv: card.cvv,
      expiryMonth: card.expiry_month,
      expiryYear: card.expiry_year,
      email: email,
      amount: amount,
      currency: options.currency || 'NGN',
      reference: options.reference || `TEST-${Date.now()}`,
      redirectUrl: options.redirectUrl || process.env.FLUTTERWAVE_CALLBACK_URL,
      firstName: options.firstName || 'Test',
      lastName: options.lastName || 'Customer',
      phone: options.phone || '08000000000',
      metadata: {
        source: 'test_payment',
        card_scheme: card.scheme,
        test_generated: true
      }
    };
    
    // Create mock request and response
    const mockReq = {
      body: paymentData,
      user: { username: 'TEST_SYSTEM' }
    };
    
    let paymentResult = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          paymentResult = {
            statusCode: code,
            data: data
          };
        }
      })
    };
    
    // Process payment
    await FlutterwaveController.initializeCardPayment(mockReq, mockRes);
    
    if (!paymentResult || paymentResult.statusCode !== 200) {
      throw new Error(paymentResult?.data?.error || 'Payment initiation failed');
    }
    
    return {
      success: true,
      message: 'Test payment initiated successfully',
      data: {
        ...paymentResult.data.data,
        test_card: {
          scheme: card.scheme,
          last4: card.last4,
          masked_card: card.masked_card
        }
      }
    };
    
  } catch (error) {
    logger.error('❌ Test payment failed:', {
      error: error.message,
      amount,
      email
    });
    
    return {
      success: false,
      message: 'Test payment failed',
      error: error.message
    };
  }
}

/**
 * Get card details for Flutterwave payment
 * Decrypts CVV if needed
 */
export async function getCardForFlutterwave(cardId) {
  try {
    const card = await DebitCard.findByPk(cardId, {
      include: [{ model: CustomerAccount, as: 'customerAccount' }]
    });
    
    if (!card) {
      throw new Error('Card not found');
    }
    
    if (!card.flutterwaveEnabled) {
      throw new Error('Card not enabled for Flutterwave payments');
    }
    
    // Decrypt CVV if it was stored encrypted
    let cvv = null;
    if (card.encryptedCvv) {
      const encryptionKey = process.env.CARD_ENCRYPTION_KEY;
      if (!encryptionKey) {
        throw new Error('Card encryption key not configured');
      }
      const decipher = crypto.createDecipher('aes-256-cbc', encryptionKey);
      cvv = decipher.update(card.encryptedCvv, 'hex', 'utf8') + decipher.final('utf8');
    } else {
      throw new Error('CVV not available for Flutterwave payment');
    }
    
    return {
      cardNumber: card.cardPan,
      cvv: cvv,
      expiryMonth: card.expiryMonth,
      expiryYear: card.expiryYear,
      cardId: card.id,
      accountNumber: card.account_number,
      customerId: card.customerId,
      email: card.customerAccount?.email || 'customer@example.com',
      cardLast4: card.cardLast4,
      cardHolderName: card.cardHolderName,
      cardScheme: card.cardScheme
    };
    
  } catch (error) {
    logger.error('❌ Error getting card for Flutterwave:', {
      error: error.message,
      cardId
    });
    throw error;
  }
}

/**
 * Check if a card is valid for Flutterwave payments
 */
export async function isCardFlutterwaveEnabled(cardId) {
  try {
    const card = await DebitCard.findByPk(cardId, {
      attributes: ['flutterwaveEnabled', 'cardStatus', 'expiryMonth', 'expiryYear']
    });
    
    if (!card) {
      return { enabled: false, reason: 'Card not found' };
    }
    
    // Check if card is active and not expired
    const now = new Date();
    const expiryDate = new Date(parseInt(card.expiryYear), parseInt(card.expiryMonth) - 1);
    const isExpired = now > expiryDate;
    const isActive = card.cardStatus === 'ACTIVE' || card.cardStatus === 'ISSUED';
    
    return {
      enabled: card.flutterwaveEnabled && isActive && !isExpired,
      flutterwaveEnabled: card.flutterwaveEnabled,
      isActive: isActive,
      isExpired: isExpired,
      reason: !card.flutterwaveEnabled ? 'Card not enabled for Flutterwave' :
              !isActive ? `Card status: ${card.cardStatus}` :
              isExpired ? 'Card has expired' :
              'Card is valid for Flutterwave payments'
    };
    
  } catch (error) {
    logger.error('❌ Error checking card Flutterwave status:', {
      error: error.message,
      cardId
    });
    return { enabled: false, reason: error.message };
  }
}

/**
 * Enable a card for Flutterwave payments
 */
export async function enableCardForFlutterwave(cardId) {
  try {
    const card = await DebitCard.findByPk(cardId);
    
    if (!card) {
      throw new Error('Card not found');
    }
    
    if (card.cardStatus !== 'ACTIVE' && card.cardStatus !== 'ISSUED') {
      throw new Error(`Card must be active or issued to enable Flutterwave (current: ${card.cardStatus})`);
    }
    
    // Check if CVV is encrypted
    if (!card.encryptedCvv) {
      throw new Error('CVV not available for Flutterwave. Card was not issued with Flutterwave support.');
    }
    
    // Check if card is expired
    if (card.isExpired()) {
      throw new Error('Card has expired');
    }
    
    await card.update({
      flutterwaveEnabled: true
    });
    
    logger.info('✅ Card enabled for Flutterwave:', {
      cardId: card.id,
      cardLast4: card.cardLast4
    });
    
    return {
      success: true,
      message: 'Card enabled for Flutterwave payments',
      cardId: card.id,
      cardLast4: card.cardLast4
    };
    
  } catch (error) {
    logger.error('❌ Error enabling card for Flutterwave:', {
      error: error.message,
      cardId
    });
    throw error;
  }
}

/**
 * Disable a card for Flutterwave payments
 */
export async function disableCardForFlutterwave(cardId) {
  try {
    const card = await DebitCard.findByPk(cardId);
    
    if (!card) {
      throw new Error('Card not found');
    }
    
    await card.update({
      flutterwaveEnabled: false
    });
    
    logger.info('✅ Card disabled for Flutterwave:', {
      cardId: card.id,
      cardLast4: card.cardLast4
    });
    
    return {
      success: true,
      message: 'Card disabled for Flutterwave payments',
      cardId: card.id,
      cardLast4: card.cardLast4
    };
    
  } catch (error) {
    logger.error('❌ Error disabling card for Flutterwave:', {
      error: error.message,
      cardId
    });
    throw error;
  }
}

/**
 * Process a Flutterwave webhook event and update internal records
 */
export async function handleFlutterwaveWebhook(eventData) {
  try {
    const { type, data } = eventData;
    
    switch (type) {
      case 'charge.completed':
        await handleChargeCompleted(data);
        break;
      case 'charge.failed':
        await handleChargeFailed(data);
        break;
      default:
        logger.info('Unhandled Flutterwave webhook event:', type);
    }
    
    return { success: true };
    
  } catch (error) {
    logger.error('❌ Error handling Flutterwave webhook:', {
      error: error.message,
      eventData
    });
    throw error;
  }
}

/**
 * Handle successful charge from Flutterwave webhook
 */
async function handleChargeCompleted(data) {
  try {
    const { tx_ref, amount, status, customer, meta } = data;
    
    // Find the internal transaction by reference
    // You would need to store the reference mapping in your database
    
    // Update the internal transaction status
    // This is where you'd update your transaction records
    
    logger.info('✅ Flutterwave charge completed:', {
      reference: tx_ref,
      amount,
      customer: customer?.email
    });
    
  } catch (error) {
    logger.error('❌ Error handling charge completed:', error);
    throw error;
  }
}

/**
 * Handle failed charge from Flutterwave webhook
 */
async function handleChargeFailed(data) {
  try {
    const { tx_ref, amount, status, customer } = data;
    
    // Update the internal transaction status to failed
    
    logger.info('❌ Flutterwave charge failed:', {
      reference: tx_ref,
      amount,
      customer: customer?.email
    });
    
  } catch (error) {
    logger.error('❌ Error handling charge failed:', error);
    throw error;
  }
}

/**
 * Process internal card transaction (using your existing service)
 * This is a wrapper around your existing processCardTransaction
 */
export async function processInternalCardTransaction(cardPan, amount, merchantInfo, txRef, createdBy = 'CARD_SYSTEM') {
  // This uses your existing cardTransactionService
  const result = await processCardTransaction(cardPan, amount, merchantInfo, txRef, createdBy);
  
  if (!result.success) {
    throw new Error(result.error);
  }
  
  return result;
}

export default {
  processPaymentWithIssuedCard,
  generateTestCardForFlutterwave,
  processPaymentWithGeneratedCard,
  getCardForFlutterwave,
  isCardFlutterwaveEnabled,
  enableCardForFlutterwave,
  disableCardForFlutterwave,
  handleFlutterwaveWebhook,
  processInternalCardTransaction
};