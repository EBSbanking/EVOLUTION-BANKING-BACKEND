// src/Controllers/cardPayment.controller.js
import * as flutterwaveService from '../Services/flutterwave.service.js';
import db from '../models/index.js';
import crypto from 'crypto';

const { DebitCard, Customer, CustomerAccount, Transaction } = db;

// ======================================================
// Card Payment Controller
// ======================================================

// ✅ Use the imported decryptStoredCVV from flutterwave.service
// This handles both AES-256-GCM and AES-256-CBC formats

const CardPaymentController = {
    /**
     * Charge a card using Flutterwave
     */
    async chargeCard(req, res) {
        try {
            const {
                cardId,
                amount,
                currency = 'NGN',
                email,
                reference,
                metadata = {},
                pin, // Optional PIN for PIN-authenticated transactions
                cvv // Optional: If user provides CVV directly
            } = req.body;

            // Validate required fields
            if (!cardId) {
                return res.status(400).json({
                    success: false,
                    message: 'Card ID is required'
                });
            }

            if (!amount || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Valid amount is required'
                });
            }

            // Find the card in the database
            const card = await DebitCard.findByPk(cardId, {
                include: [
                    {
                        model: Customer,
                        as: 'customer',
                        attributes: ['CUST_ID', 'CUSTOMER_NAME', 'EMAIL', 'PHONE']
                    },
                    {
                        model: CustomerAccount,
                        as: 'account',
                        attributes: ['id', 'ACCOUNT_NO', 'ACCOUNT_NAME']
                    }
                ]
            });

            if (!card) {
                return res.status(404).json({
                    success: false,
                    message: 'Card not found'
                });
            }

            // Check if card is active
            if (card.card_status !== 'ISSUED' && card.card_status !== 'ACTIVATED') {
                return res.status(400).json({
                    success: false,
                    message: `Card is not active. Current status: ${card.card_status}`
                });
            }

            // Check if Flutterwave is enabled for this card
            if (!card.flutterwave_enabled) {
                return res.status(400).json({
                    success: false,
                    message: 'Card is not enabled for Flutterwave payments'
                });
            }

            // Get customer email
            const customerEmail = email || card.customer?.EMAIL;
            if (!customerEmail) {
                return res.status(400).json({
                    success: false,
                    message: 'Customer email is required'
                });
            }

            // Get the CVV - either from user input or decrypt from storage
            let cvvValue = cvv;
            
            // If CVV not provided by user, try to decrypt from storage
            if (!cvvValue && card.encrypted_cvv) {
                console.log('🔐 Decrypting stored CVV for card:', card.card_last4);
                
                // ✅ Use the imported decryptStoredCVV from flutterwave.service
                // This handles both AES-256-GCM and AES-256-CBC formats
                cvvValue = flutterwaveService.decryptStoredCVV(card.encrypted_cvv);
                
                if (!cvvValue) {
                    return res.status(400).json({
                        success: false,
                        message: 'Unable to decrypt stored CVV. Please provide CVV manually.'
                    });
                }
                
                console.log('✅ CVV decrypted successfully for card:', card.card_last4);
            }

            // If still no CVV, require user input
            if (!cvvValue) {
                return res.status(400).json({
                    success: false,
                    message: 'CVV is required for payment. Please provide it in the request.'
                });
            }

            // Prepare payment data
            const paymentData = {
                cardNumber: card.card_pan,
                cvv: cvvValue,
                expiryMonth: card.expiry_month,
                expiryYear: card.expiry_year,
                email: customerEmail,
                amount: Number(amount),
                currency: currency,
                reference: reference || `CARD-${cardId}-${Date.now()}`,
                redirectUrl: req.body.redirectUrl || process.env.FLW_CALLBACK_URL || process.env.FLW_SANDBOX_DEV_CALLBACK_URL,
                metadata: {
                    ...metadata,
                    card_id: card.id,
                    customer_id: card.customer_id,
                    account_id: card.account_id,
                    card_last4: card.card_last4,
                    card_bin: card.card_bin,
                    card_scheme: card.card_scheme,
                    transaction_type: 'card_payment',
                    cvv_source: cvv ? 'user_provided' : 'stored_decrypted'
                }
            };

            // Add PIN if provided
            if (pin) {
                paymentData.pin = pin;
            }

            console.log('💳 Processing card payment:', {
                cardId: card.id,
                cardLast4: card.card_last4,
                cardScheme: card.card_scheme,
                amount: paymentData.amount,
                currency: paymentData.currency,
                customer: customerEmail,
                cvvSource: paymentData.metadata.cvv_source
            });

            // ✅ Call Flutterwave chargeCard with the payment data
            const result = await flutterwaveService.chargeCard(paymentData);

            // Log the transaction
            try {
                await Transaction.create({
                    TRANSACTION_NO: result.reference,
                    ACCOUNT_NO: card.account?.ACCOUNT_NO || null,
                    AMOUNT: amount,
                    TRANSACTION_TYPE: 'CARD_PAYMENT',
                    NARRATION: `Card payment via Flutterwave - Card ending ${card.card_last4}`,
                    STATUS: 'PENDING',
                    REFERENCE: result.reference,
                    CUSTOMER_NO: card.customer_id,
                    CREATED_BY: req.user?.id || 'system',
                    CHANNEL: 'FLUTTERWAVE',
                    METADATA: {
                        card_id: card.id,
                        flutterwave_ref: result.data?.id,
                        payment_method_id: result.payment_method_id
                    }
                });
            } catch (dbError) {
                console.warn('⚠️ Could not log transaction:', dbError.message);
            }

            // Update card last used timestamp
            try {
                await card.update({
                    last_used_at: new Date()
                });
            } catch (updateError) {
                console.warn('⚠️ Could not update card last_used_at:', updateError.message);
            }

            return res.status(200).json({
                success: true,
                message: 'Payment initiated successfully',
                data: {
                    reference: result.reference,
                    flutterwave_ref: result.data?.id,
                    status: result.data?.status,
                    payment_method_id: result.payment_method_id,
                    requires_auth: !!result.data?.next_action,
                    next_action: result.data?.next_action,
                    redirect_url: result.data?.redirect_url,
                    transaction_details: result.data
                }
            });

        } catch (error) {
            console.error('❌ Card payment error:', error);
            
            return res.status(error.status || 500).json({
                success: false,
                message: error.message || 'Payment processing failed',
                details: error.details || null
            });
        }
    },

    /**
     * Verify card payment
     */
    async verifyCardPayment(req, res) {
        try {
            const { reference } = req.params;

            if (!reference) {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction reference is required'
                });
            }

            const result = await flutterwaveService.verifyTransaction(reference);

            // Update transaction status in database
            try {
                const transaction = await Transaction.findOne({
                    where: { REFERENCE: reference }
                });

                if (transaction) {
                    transaction.STATUS = result.data?.status || 'UNKNOWN';
                    await transaction.save();
                }
            } catch (dbError) {
                console.warn('⚠️ Could not update transaction:', dbError.message);
            }

            return res.status(200).json({
                success: true,
                data: result.data
            });

        } catch (error) {
            console.error('❌ Payment verification error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Verification failed'
            });
        }
    },

    /**
     * Get card details (masked)
     */
    async getCardDetails(req, res) {
        try {
            const { cardId } = req.params;

            const card = await DebitCard.findByPk(cardId, {
                attributes: [
                    'id',
                    'card_pan',
                    'card_holder_name',
                    'expiry_month',
                    'expiry_year',
                    'card_scheme',
                    'card_type',
                    'card_status',
                    'daily_limit',
                    'per_transaction_limit',
                    'is_contactless_enabled',
                    'card_last4',
                    'card_bin',
                    'flutterwave_enabled',
                    'last_used_at',
                    'issued_at',
                    'activated_at'
                ],
                include: [
                    {
                        model: Customer,
                        as: 'customer',
                        attributes: ['CUST_ID', 'CUSTOMER_NAME', 'EMAIL']
                    }
                ]
            });

            if (!card) {
                return res.status(404).json({
                    success: false,
                    message: 'Card not found'
                });
            }

            // Mask PAN - show first 6 and last 4
            const maskedPan = card.card_pan ? 
                `${card.card_pan.substring(0, 6)}******${card.card_pan.slice(-4)}` : 
                null;

            return res.status(200).json({
                success: true,
                data: {
                    ...card.toJSON(),
                    card_pan: maskedPan,
                    // Don't expose CVV or PIN
                    cvv_hash: undefined,
                    encrypted_cvv: undefined,
                    pin_hash: undefined
                }
            });

        } catch (error) {
            console.error('❌ Get card error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve card details'
            });
        }
    },

    /**
     * Get all cards for a customer
     */
    async getCustomerCards(req, res) {
        try {
            const { customerId } = req.params;

            const cards = await DebitCard.findAll({
                where: { customer_id: customerId },
                attributes: [
                    'id',
                    'card_pan',
                    'card_holder_name',
                    'expiry_month',
                    'expiry_year',
                    'card_scheme',
                    'card_type',
                    'card_status',
                    'card_last4',
                    'card_bin',
                    'flutterwave_enabled',
                    'is_contactless_enabled',
                    'last_used_at',
                    'issued_at',
                    'activated_at'
                ],
                order: [['created_at', 'DESC']]
            });

            // Mask PAN for each card
            const maskedCards = cards.map(card => ({
                ...card.toJSON(),
                card_pan: card.card_pan ? 
                    `${card.card_pan.substring(0, 6)}******${card.card_pan.slice(-4)}` : 
                    null
            }));

            return res.status(200).json({
                success: true,
                data: maskedCards
            });

        } catch (error) {
            console.error('❌ Get customer cards error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to retrieve cards'
            });
        }
    },

    /**
     * Enable/disable Flutterwave for a card
     */
    async toggleFlutterwave(req, res) {
        try {
            const { cardId } = req.params;
            const { enabled } = req.body;

            if (typeof enabled !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    message: 'Enabled flag is required (boolean)'
                });
            }

            const card = await DebitCard.findByPk(cardId);

            if (!card) {
                return res.status(404).json({
                    success: false,
                    message: 'Card not found'
                });
            }

            card.flutterwave_enabled = enabled;
            await card.save();

            return res.status(200).json({
                success: true,
                message: `Flutterwave ${enabled ? 'enabled' : 'disabled'} for card`,
                data: {
                    card_id: card.id,
                    card_last4: card.card_last4,
                    flutterwave_enabled: card.flutterwave_enabled
                }
            });

        } catch (error) {
            console.error('❌ Toggle Flutterwave error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'Failed to update card settings'
            });
        }
    },

    /**
     * Test CVV decryption (for debugging only)
     */
    async testCVVDecryption(req, res) {
        try {
            const { cardId } = req.params;

            const card = await DebitCard.findByPk(cardId, {
                attributes: ['id', 'card_last4', 'encrypted_cvv']
            });

            if (!card) {
                return res.status(404).json({
                    success: false,
                    message: 'Card not found'
                });
            }

            if (!card.encrypted_cvv) {
                return res.status(400).json({
                    success: false,
                    message: 'No encrypted CVV found for this card'
                });
            }

            // ✅ Use the imported decryptStoredCVV from flutterwave.service
            const decryptedCVV = flutterwaveService.decryptStoredCVV(card.encrypted_cvv);
            const method = decryptedCVV ? 'AES-256-GCM/CBC (auto-detected)' : 'None';

            return res.status(200).json({
                success: true,
                data: {
                    card_id: card.id,
                    card_last4: card.card_last4,
                    has_encrypted_cvv: !!card.encrypted_cvv,
                    encryption_key_available: !!process.env.FLW_SANDBOX_DEV_ENCRYPTION_KEY,
                    decryption_method: method,
                    decryption_successful: !!decryptedCVV,
                    decrypted_cvv: decryptedCVV ? '***' : null,
                    hint: decryptedCVV ? 'CVV decrypted successfully' : 'Decryption failed'
                }
            });

        } catch (error) {
            console.error('❌ CVV test error:', error);
            return res.status(500).json({
                success: false,
                message: error.message || 'CVV test failed',
                details: error.stack
            });
        }
    }
};

// Export the controller as default
export default CardPaymentController;

// Also export individual functions for backward compatibility
export const {
    chargeCard,
    verifyCardPayment,
    getCardDetails,
    getCustomerCards,
    toggleFlutterwave,
    testCVVDecryption
} = CardPaymentController;