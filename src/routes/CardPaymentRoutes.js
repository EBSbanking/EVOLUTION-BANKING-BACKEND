// src/Routes/cardPayment.routes.js
import express from 'express';
import CardPaymentController from '../Controllers/CardPaymentController.js';
import { authenticate } from '../Middlewares/authmiddleware.js';

const router = express.Router();

// ======================================================
// PUBLIC ROUTES (No authentication required)
// ======================================================

/**
 * @route   POST /api/card-payments/public/charge
 * @desc    Public test endpoint for card charging (REMOVE IN PRODUCTION!)
 * @access  Public
 */
router.post('/public/charge', async (req, res) => {
    try {
        console.log('📤 Public card charge request received');
        
        const { 
            cardNumber, 
            cvv, 
            expiryMonth, 
            expiryYear, 
            email, 
            amount, 
            currency,
            reference,
            redirectUrl
        } = req.body;

        // Validate required fields
        const missingFields = [];
        if (!cardNumber) missingFields.push('cardNumber');
        if (!cvv) missingFields.push('cvv');
        if (!expiryMonth) missingFields.push('expiryMonth');
        if (!expiryYear) missingFields.push('expiryYear');
        if (!email) missingFields.push('email');
        if (!amount) missingFields.push('amount');

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        // Ensure expiryYear is 4 digits
        const formattedExpiryYear = expiryYear.length === 2 ? `20${expiryYear}` : expiryYear;

        console.log('💳 Processing public card charge:', {
            card: cardNumber.slice(0, 6) + '******' + cardNumber.slice(-4),
            amount: Number(amount),
            currency: currency || 'NGN',
            email
        });

        // Import the chargeCard function directly
        const { chargeCard } = await import('../Services/flutterwave.service.js');

        const paymentData = {
            cardNumber: cardNumber.trim(),
            cvv: cvv.trim(),
            expiryMonth: expiryMonth.padStart(2, '0'),
            expiryYear: formattedExpiryYear,
            email: email.trim(),
            amount: Number(amount),
            currency: currency || 'NGN',
            reference: reference || `PUBLIC-${Date.now()}`,
            redirectUrl: redirectUrl || process.env.FLW_CALLBACK_URL || 'http://localhost:3002/api/flutterwave/callback',
            metadata: {
                public_test: true,
                source: 'public_endpoint',
                timestamp: new Date().toISOString()
            }
        };

        const result = await chargeCard(paymentData);

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
        console.error('❌ Public card charge error:', error.message);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Payment processing failed',
            details: error.details || null,
            flutterwave_error: error.response?.data || null
        });
    }
});

// ======================================================
// PROTECTED ROUTES (Authentication required)
// ======================================================

// Apply authentication middleware to all routes below
router.use(authenticate);

/**
 * @route   POST /api/card-payments/charge
 * @desc    Charge a card using stored card ID
 * @access  Private
 * @body    { cardId, amount, currency, email, reference, metadata, pin, cvv }
 */
router.post('/charge', CardPaymentController.chargeCard);

/**
 * @route   GET /api/card-payments/verify/:reference
 * @desc    Verify a card payment
 * @access  Private
 * @param   {string} reference - Transaction reference
 */
router.get('/verify/:reference', CardPaymentController.verifyCardPayment);

/**
 * @route   GET /api/card-payments/card/:cardId
 * @desc    Get card details (masked)
 * @access  Private
 * @param   {number} cardId - Card ID
 */
router.get('/card/:cardId', CardPaymentController.getCardDetails);

/**
 * @route   GET /api/card-payments/customer/:customerId/cards
 * @desc    Get all cards for a customer
 * @access  Private
 * @param   {string} customerId - Customer ID
 */
router.get('/customer/:customerId/cards', CardPaymentController.getCustomerCards);

/**
 * @route   PATCH /api/card-payments/card/:cardId/toggle-flutterwave
 * @desc    Enable/disable Flutterwave for a card
 * @access  Private
 * @param   {number} cardId - Card ID
 * @body    { enabled: boolean }
 */
router.patch('/card/:cardId/toggle-flutterwave', CardPaymentController.toggleFlutterwave);

/**
 * @route   GET /api/card-payments/card/:cardId/test-cvv
 * @desc    Test CVV decryption (debugging only)
 * @access  Private (Admin only in production)
 * @param   {number} cardId - Card ID
 */
router.get('/card/:cardId/test-cvv', CardPaymentController.testCVVDecryption);

// ======================================================
// FLUTTERWAVE DIRECT CHARGE (Using card details directly)
// ======================================================

/**
 * @route   POST /api/card-payments/direct-charge
 * @desc    Direct card charge using card details (for API integrations)
 * @access  Private
 * @body    { cardNumber, cvv, expiryMonth, expiryYear, email, amount, currency, reference, redirectUrl }
 */
router.post('/direct-charge', async (req, res) => {
    try {
        console.log('📤 Direct card charge request received');
        
        const { 
            cardNumber, 
            cvv, 
            expiryMonth, 
            expiryYear, 
            email, 
            amount, 
            currency,
            reference,
            redirectUrl,
            metadata = {}
        } = req.body;

        // Validate required fields
        const missingFields = [];
        if (!cardNumber) missingFields.push('cardNumber');
        if (!cvv) missingFields.push('cvv');
        if (!expiryMonth) missingFields.push('expiryMonth');
        if (!expiryYear) missingFields.push('expiryYear');
        if (!email) missingFields.push('email');
        if (!amount) missingFields.push('amount');

        if (missingFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missingFields.join(', ')}`
            });
        }

        // Ensure expiryYear is 4 digits
        const formattedExpiryYear = expiryYear.length === 2 ? `20${expiryYear}` : expiryYear;

        console.log('💳 Processing direct card charge:', {
            card: cardNumber.slice(0, 6) + '******' + cardNumber.slice(-4),
            amount: Number(amount),
            currency: currency || 'NGN',
            email
        });

        // Import the chargeCard function
        const { chargeCard } = await import('../Services/flutterwave.service.js');

        const paymentData = {
            cardNumber: cardNumber.trim(),
            cvv: cvv.trim(),
            expiryMonth: expiryMonth.padStart(2, '0'),
            expiryYear: formattedExpiryYear,
            email: email.trim(),
            amount: Number(amount),
            currency: currency || 'NGN',
            reference: reference || `DIRECT-${Date.now()}`,
            redirectUrl: redirectUrl || process.env.FLW_CALLBACK_URL || 'http://localhost:3002/api/flutterwave/callback',
            metadata: {
                ...metadata,
                source: 'direct_charge_endpoint',
                user_id: req.user?.id || 'system',
                timestamp: new Date().toISOString()
            }
        };

        const result = await chargeCard(paymentData);

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
        console.error('❌ Direct card charge error:', error.message);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Payment processing failed',
            details: error.details || null,
            flutterwave_error: error.response?.data || null
        });
    }
});

// ======================================================
// FLUTTERWAVE TRANSACTION MANAGEMENT
// ======================================================

/**
 * @route   GET /api/card-payments/transactions
 * @desc    List Flutterwave transactions
 * @access  Private (Admin only)
 * @query   { page, limit, status, email }
 */
router.get('/transactions', async (req, res) => {
    try {
        const { page, limit, status, email } = req.query;
        
        const { listTransactions } = await import('../Services/flutterwave.service.js');
        
        const result = await listTransactions({
            page: page || 1,
            limit: limit || 20,
            status: status || undefined,
            email: email || undefined
        });

        return res.status(200).json({
            success: true,
            data: result.data
        });

    } catch (error) {
        console.error('❌ List transactions error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to list transactions'
        });
    }
});

/**
 * @route   GET /api/card-payments/health
 * @desc    Flutterwave health check
 * @access  Public
 */
router.get('/health', async (req, res) => {
    try {
        const { healthCheck } = await import('../Services/flutterwave.service.js');
        
        const result = await healthCheck();

        return res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ Health check error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Health check failed'
        });
    }
});

export default router;