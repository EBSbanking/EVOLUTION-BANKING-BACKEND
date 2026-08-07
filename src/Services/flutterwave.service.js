// src/Services/flutterwave.service.js
import axios from "axios";
import crypto from "crypto";
import config from "../../config/flutterwave.js";

// ======================================================
// CONFIGURATION - Use V3 API (with Secret Key)
// ======================================================

const BASE_URL = config.FLW_BASE_URL || "https://api.flutterwave.com/v3";
const SECRET_KEY = config.FLW_SECRET_KEY || config.FLW_SANDBOX_SECRET_KEY;
const ENCRYPTION_KEY = config.FLW_ENCRYPTION_KEY || config.FLW_SANDBOX_ENCRYPTION_KEY;

console.log('🔧 Flutterwave Service initialized with:', {
    baseUrl: BASE_URL,
    hasSecretKey: !!SECRET_KEY,
    hasEncryptionKey: !!ENCRYPTION_KEY,
    encryptionKeyLength: ENCRYPTION_KEY?.length || 0,
    environment: config.FLW_IS_PROD ? 'PRODUCTION' : 'SANDBOX',
    apiType: 'V3 API (3DES Encryption)'
});

// Validate configuration
if (!SECRET_KEY) {
    console.error('❌ Missing Flutterwave Secret Key!');
    console.error('Please set FLW_SANDBOX_SECRET_KEY or FLUTTERWAVE_SECRET_KEY in .env');
}

if (!ENCRYPTION_KEY) {
    console.error('❌ Missing Flutterwave Encryption Key!');
    console.error('Please set FLW_SANDBOX_ENCRYPTION_KEY or FLUTTERWAVE_ENCRYPTION_KEY in .env');
}

// ======================================================
// FUNCTIONS
// ======================================================

/**
 * Generate a 12-character nonce for 3DES encryption.
 * Flutterwave V3 requires the same nonce for all encrypted fields.
 * @returns {string} 12-character hex string
 */
function generateNonce() {
    return crypto.randomBytes(6).toString('hex'); // 12 characters
}

/**
 * Encrypt a value using 3DES-EDE-CBC (for Flutterwave V3 API)
 * 
 * @param {string} value - The value to encrypt
 * @param {string} nonce - 12-character nonce
 * @returns {string} Base64 encrypted string
 */
function encryptField(value, nonce) {
    if (!value) return null;
    
    try {
        // For V3 API, the encryption key is a plain string (3DES key)
        // Example: FLWSECK_TEST2b0f7be79965
        const keyString = ENCRYPTION_KEY;
        
        // 3DES key must be 24 bytes (192 bits)
        const keyBuffer = Buffer.alloc(24);
        const sourceKey = Buffer.from(keyString, 'utf8');
        sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));
        
        // ⚠️ IMPORTANT: IV must be exactly 8 bytes for 3DES
        // Use first 8 characters of nonce (nonce is 12 chars)
        const iv = Buffer.from(nonce.slice(0, 8), 'utf8');
        
        // Create 3DES-EDE-CBC cipher
        const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
        
        let encrypted = cipher.update(String(value), 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        return encrypted;
    } catch (error) {
        console.error('❌ Encryption error:', error.message);
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

/**
 * Decrypt a value using 3DES-EDE-CBC (for stored CVV)
 * This handles the format: IV(8 bytes) + ciphertext
 * Note: For V3 API, stored data is encrypted with 3DES
 */
function decryptStoredCVV(encryptedValue) {
    if (!encryptedValue) return null;
    
    try {
        // 3DES key must be 24 bytes
        const keyBuffer = Buffer.alloc(24);
        const sourceKey = Buffer.from(ENCRYPTION_KEY, 'utf8');
        sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));
        
        const encryptedBuffer = Buffer.from(encryptedValue, 'base64');
        
        // The data should be at least 8 bytes (IV) + some ciphertext
        if (encryptedBuffer.length < 8) {
            console.warn('⚠️ Encrypted data too short:', encryptedBuffer.length, 'bytes');
            return null;
        }

        // Extract IV (first 8 bytes)
        const iv = encryptedBuffer.slice(0, 8);
        const ciphertext = encryptedBuffer.slice(8);
        
        // Decrypt using 3DES-EDE-CBC
        const decipher = crypto.createDecipheriv('des-ede3-cbc', keyBuffer, iv);
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        const result = decrypted.toString('utf8');
        
        // Verify it looks like a CVV (3-4 digits)
        if (result && /^\d{3,4}$/.test(result.trim())) {
            return result.trim();
        }
        return null;
    } catch (error) {
        console.error('❌ Stored CVV decryption error:', error.message);
        return null;
    }
}

/**
 * Decrypt a value encrypted with 3DES-EDE-CBC (for testing/debugging)
 * This handles the format: encrypted_data (Base64)
 */
function decryptField(encryptedValue, nonce) {
    if (!encryptedValue) return null;
    
    try {
        // 3DES key must be 24 bytes
        const keyBuffer = Buffer.alloc(24);
        const sourceKey = Buffer.from(ENCRYPTION_KEY, 'utf8');
        sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));
        
        const encryptedBuffer = Buffer.from(encryptedValue, 'base64');
        
        // ⚠️ IMPORTANT: IV must be exactly 8 bytes for 3DES
        // Use first 8 characters of nonce (nonce is 12 chars)
        const iv = Buffer.from(nonce.slice(0, 8), 'utf8');
        
        // Decrypt using 3DES-EDE-CBC
        const decipher = crypto.createDecipheriv('des-ede3-cbc', keyBuffer, iv);
        let decrypted = decipher.update(encryptedBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('❌ Decryption error:', error.message);
        return null;
    }
}

/**
 * Encrypt CVV for storage using 3DES-EDE-CBC with IV prepended
 * This matches the V3 API encryption: IV(8 bytes) + ciphertext
 */
function encryptCVVForStorage(cvv) {
    if (!cvv) return null;
    
    try {
        // 3DES key must be 24 bytes
        const keyBuffer = Buffer.alloc(24);
        const sourceKey = Buffer.from(ENCRYPTION_KEY, 'utf8');
        sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));

        // Generate random IV (8 bytes for 3DES)
        const iv = crypto.randomBytes(8);
        const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
        
        // Encrypt the CVV
        let encrypted = cipher.update(cvv, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        // Combine IV + encrypted data
        const result = Buffer.concat([iv, encrypted]);
        
        return result.toString('base64');
    } catch (error) {
        console.error('❌ CVV storage encryption error:', error.message);
        return null;
    }
}

/**
 * Charge a card using Flutterwave V3 API
 * 
 * @param {Object} body - Payment details
 * @param {string} body.cardNumber - Card number (full PAN)
 * @param {string} body.cvv - CVV (plaintext)
 * @param {string} body.expiryMonth - Expiry month (MM)
 * @param {string} body.expiryYear - Expiry year (YYYY)
 * @param {string} body.email - Customer email
 * @param {number} body.amount - Amount to charge
 * @param {string} body.currency - Currency code (default: NGN)
 * @param {string} body.reference - Unique transaction reference
 * @param {string} body.redirectUrl - Redirect URL after payment
 * @param {Object} body.metadata - Additional metadata
 * @param {string} body.pin - PIN for PIN-authenticated transactions (optional)
 * @param {string} body.storedEncryptedCVV - Stored encrypted CVV (optional)
 * @returns {Promise<Object>} Flutterwave response
 */
async function chargeCard(body) {
    try {
        // Get the CVV - either plaintext or decrypt from stored
        let cvv = body.cvv;
        
        // If CVV is not provided but we have stored encrypted CVV, decrypt it
        if (!cvv && body.storedEncryptedCVV) {
            console.log('🔐 Decrypting stored CVV...');
            cvv = decryptStoredCVV(body.storedEncryptedCVV);
            if (!cvv) {
                throw new Error('Failed to decrypt stored CVV');
            }
            console.log('✅ CVV decrypted successfully');
        }
        
        // Ensure we have a CVV
        if (!cvv) {
            throw new Error('CVV is required for payment');
        }

        // Generate a single nonce for all fields
        const nonce = generateNonce();
        
        // Encrypt each field individually with the same nonce using 3DES
        const encryptedCardNumber = encryptField(body.cardNumber, nonce);
        const encryptedCvv = encryptField(cvv, nonce);
        const encryptedExpiryMonth = encryptField(body.expiryMonth.padStart(2, '0'), nonce);
        const encryptedExpiryYear = encryptField(body.expiryYear, nonce);
        
        // If PIN is provided, encrypt it too
        let encryptedPin = null;
        if (body.pin) {
            encryptedPin = encryptField(body.pin, nonce);
        }

        // ✅ V3 API: Use /v3/payments endpoint for card payment
        const transactionReference = body.reference || `FLW-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        const paymentPayload = {
            tx_ref: transactionReference,
            amount: Number(body.amount),
            currency: body.currency || 'NGN',
            redirect_url: body.redirectUrl || config.FLW_CALLBACK_URL || 'http://localhost:3002/api/flutterwave/callback',
            payment_options: 'card',
            meta: {
                ...body.metadata,
                source: 'evolution_banking',
                timestamp: new Date().toISOString(),
                customer_email: body.email
            },
            customer: {
                email: body.email,
                name: body.metadata?.customer_name || 'Customer',
                phonenumber: body.metadata?.phone || '08000000000'
            },
            card: {
                encrypted_card_number: encryptedCardNumber,
                encrypted_expiry_month: encryptedExpiryMonth,
                encrypted_expiry_year: encryptedExpiryYear,
                encrypted_cvv: encryptedCvv,
                nonce: nonce
            }
        };

        // Add PIN if provided
        if (encryptedPin) {
            paymentPayload.card.encrypted_pin = encryptedPin;
        }

        console.log('📤 Flutterwave V3 Payment Request:', {
            url: `${BASE_URL}/payments`,
            reference: transactionReference,
            amount: body.amount,
            currency: body.currency,
            email: body.email,
            hasCardNumber: !!encryptedCardNumber,
            hasCvv: !!encryptedCvv,
            hasExpiryMonth: !!encryptedExpiryMonth,
            hasExpiryYear: !!encryptedExpiryYear,
            hasPin: !!encryptedPin
        });

        // ✅ Step 1: Create payment (tokenize and charge in one step)
        const paymentResponse = await axios.post(
            `${BASE_URL}/payments`,
            paymentPayload,
            {
                headers: {
                    'Authorization': `Bearer ${SECRET_KEY}`,
                    'Content-Type': 'application/json',
                    'X-Trace-Id': `trace-${Date.now()}`,
                    'X-Idempotency-Key': `idemp-${Date.now()}-${Math.random().toString(36).substring(7)}`
                },
                timeout: 30000
            }
        );

        console.log('📥 Payment Response:', {
            status: paymentResponse.status,
            hasData: !!paymentResponse.data,
            responseStatus: paymentResponse.data?.status,
            message: paymentResponse.data?.message,
            reference: paymentResponse.data?.data?.reference,
            flutterwaveRef: paymentResponse.data?.data?.id,
            transactionStatus: paymentResponse.data?.data?.status
        });

        // Check if payment was successful
        if (!paymentResponse.data || paymentResponse.data.status !== 'success') {
            const errorMsg = paymentResponse.data?.message || 'Payment initiation failed';
            console.error('❌ Payment failed:', errorMsg);
            console.error('Full Response:', JSON.stringify(paymentResponse.data, null, 2));
            throw new Error(errorMsg);
        }

        const paymentData = paymentResponse.data.data;

        return {
            success: true,
            data: paymentData,
            reference: transactionReference,
            payment_method_id: paymentData?.payment_method_id || paymentData?.id
        };

    } catch (error) {
        console.error('❌ Flutterwave charge error:', {
            message: error.message,
            status: error.response?.status,
            response: error.response?.data,
            stack: error.stack
        });

        // Extract meaningful error message
        let errorMessage = error.message;
        let errorDetails = null;

        if (error.response?.data) {
            const fwError = error.response.data;
            errorDetails = fwError;
            
            if (fwError.error) {
                errorMessage = fwError.error.message || fwError.message || errorMessage;
            } else if (fwError.message) {
                errorMessage = fwError.message;
            }
            
            // Handle validation errors
            if (fwError.validation_errors && fwError.validation_errors.length > 0) {
                errorMessage = fwError.validation_errors.map(e => `${e.field_name}: ${e.message}`).join('; ');
            }
        }

        // Throw enhanced error
        const enhancedError = new Error(errorMessage);
        enhancedError.status = error.response?.status || 500;
        enhancedError.details = errorDetails;
        enhancedError.originalError = error;
        throw enhancedError;
    }
}

/**
 * Verify a Flutterwave transaction
 * 
 * @param {string} reference - Transaction reference
 * @returns {Promise<Object>} Verification result
 */
async function verifyTransaction(reference) {
    try {
        const response = await axios.get(
            `${BASE_URL}/transactions/${reference}/verify`,
            {
                headers: {
                    'Authorization': `Bearer ${SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return {
            success: true,
            data: response.data?.data || response.data
        };
    } catch (error) {
        console.error('❌ Verification error:', error.message);
        throw error;
    }
}

/**
 * Refund a Flutterwave transaction
 * 
 * @param {string} reference - Transaction reference
 * @param {number} amount - Amount to refund (optional)
 * @param {string} reason - Refund reason (optional)
 * @returns {Promise<Object>} Refund result
 */
async function refundTransaction(reference, amount, reason) {
    try {
        const payload = {};
        if (amount) payload.amount = amount;
        if (reason) payload.reason = reason;

        const response = await axios.post(
            `${BASE_URL}/transactions/${reference}/refund`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return {
            success: true,
            data: response.data?.data || response.data
        };
    } catch (error) {
        console.error('❌ Refund error:', error.message);
        throw error;
    }
}

/**
 * Get transaction status
 * 
 * @param {string} reference - Transaction reference
 * @returns {Promise<Object>} Transaction status
 */
async function getTransactionStatus(reference) {
    try {
        const response = await axios.get(
            `${BASE_URL}/transactions/${reference}`,
            {
                headers: {
                    'Authorization': `Bearer ${SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return {
            success: true,
            data: response.data?.data || response.data
        };
    } catch (error) {
        console.error('❌ Status check error:', error.message);
        throw error;
    }
}

/**
 * List transactions
 * 
 * @param {Object} params - Query parameters
 * @param {number} params.page - Page number
 * @param {number} params.limit - Items per page
 * @param {string} params.status - Filter by status
 * @param {string} params.email - Filter by customer email
 * @returns {Promise<Object>} List of transactions
 */
async function listTransactions(params = {}) {
    try {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.append('page', params.page);
        if (params.limit) queryParams.append('limit', params.limit);
        if (params.status) queryParams.append('status', params.status);
        if (params.email) queryParams.append('email', params.email);

        const url = `${BASE_URL}/transactions${queryParams.toString() ? '?' + queryParams.toString() : ''}`;

        const response = await axios.get(
            url,
            {
                headers: {
                    'Authorization': `Bearer ${SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            }
        );

        return {
            success: true,
            data: response.data?.data || response.data
        };
    } catch (error) {
        console.error('❌ List transactions error:', error.message);
        throw error;
    }
}

/**
 * Health check for Flutterwave API
 * Verifies that the API is reachable and the secret key is valid
 * 
 * @returns {Promise<Object>} Health status
 */
async function healthCheck() {
    try {
        // Check if we have the required configuration
        if (!BASE_URL) {
            return {
                success: false,
                status: 'unhealthy',
                message: 'Flutterwave BASE_URL is not configured',
                error: 'Missing BASE_URL configuration'
            };
        }

        if (!SECRET_KEY) {
            return {
                success: false,
                status: 'unhealthy',
                message: 'Flutterwave SECRET_KEY is not configured',
                error: 'Missing SECRET_KEY configuration'
            };
        }

        // Try to make a simple request to verify connectivity
        const response = await axios.get(
            `${BASE_URL}/banks/NG`,
            {
                headers: {
                    'Authorization': `Bearer ${SECRET_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            }
        );

        return {
            success: true,
            status: 'healthy',
            message: 'Flutterwave V3 API is reachable',
            environment: config.FLW_IS_PROD ? 'PRODUCTION' : 'SANDBOX',
            baseUrl: BASE_URL,
            hasSecretKey: !!SECRET_KEY,
            hasEncryptionKey: !!ENCRYPTION_KEY,
            apiType: 'V3 API (3DES)'
        };
    } catch (error) {
        console.error('❌ Health check error:', {
            message: error.message,
            status: error.response?.status,
            code: error.code
        });

        let status = 'unhealthy';
        let message = 'Flutterwave API health check failed';
        
        if (error.response?.status === 401) {
            status = 'degraded';
            message = 'Flutterwave API is reachable but authentication failed. Check your SECRET_KEY.';
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
            status = 'unhealthy';
            message = 'Flutterwave API is not reachable. Check your BASE_URL and network connectivity.';
        } else if (error.response?.status) {
            status = 'degraded';
            message = `Flutterwave API returned status ${error.response.status}`;
        }

        return {
            success: false,
            status: status,
            message: message,
            error: error.message,
            details: {
                baseUrl: BASE_URL,
                hasSecretKey: !!SECRET_KEY,
                hasEncryptionKey: !!ENCRYPTION_KEY,
                statusCode: error.response?.status,
                code: error.code
            }
        };
    }
}

// ======================================================
// EXPORTS
// ======================================================

export {
    chargeCard,
    verifyTransaction,
    refundTransaction,
    getTransactionStatus,
    listTransactions,
    healthCheck,
    generateNonce,
    encryptField,
    decryptField,
    decryptStoredCVV,
    encryptCVVForStorage
};