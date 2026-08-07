// scripts/test-payment-method.js
import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import crypto from 'crypto';

const BASE_URL = 'https://api.flutterwave.com/v3';
const SECRET_KEY = 'FLWSECK_TEST-47ced86b1040d569ee3813816a01a0da-X';
const ENCRYPTION_KEY = 'FLWSECK_TEST2b0f7be79965';

function generateNonce() {
    return crypto.randomBytes(6).toString('hex');
}

function encryptField(value, nonce) {
    if (!value) return null;
    try {
        const keyBuffer = Buffer.alloc(24);
        const sourceKey = Buffer.from(ENCRYPTION_KEY, 'utf8');
        sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));
        const iv = Buffer.from(nonce.slice(0, 8), 'utf8');
        const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
        let encrypted = cipher.update(String(value), 'utf8', 'base64');
        encrypted += cipher.final('base64');
        return encrypted;
    } catch (error) {
        console.error('Encryption error:', error.message);
        return null;
    }
}

async function testPaymentMethod() {
    try {
        console.log('\n========================================');
        console.log('🔍 Testing Payment Method API');
        console.log('========================================\n');

        const cardData = {
            cardNumber: "5060990000000057",
            cvv: "123",
            expiryMonth: "08",
            expiryYear: "2029"
        };

        const nonce = generateNonce();
        
        const payload = {
            type: 'card',
            card: {
                encrypted_card_number: encryptField(cardData.cardNumber, nonce),
                encrypted_expiry_month: encryptField(cardData.expiryMonth.padStart(2, '0'), nonce),
                encrypted_expiry_year: encryptField(cardData.expiryYear, nonce),
                encrypted_cvv: encryptField(cardData.cvv, nonce),
                nonce: nonce
            }
        };

        console.log('📤 Request Payload:');
        console.log(JSON.stringify({
            ...payload,
            card: {
                ...payload.card,
                encrypted_card_number: payload.card.encrypted_card_number?.substring(0, 20) + '...',
                encrypted_cvv: payload.card.encrypted_cvv?.substring(0, 20) + '...',
                encrypted_expiry_month: payload.card.encrypted_expiry_month?.substring(0, 20) + '...',
                encrypted_expiry_year: payload.card.encrypted_expiry_year?.substring(0, 20) + '...'
            }
        }, null, 2));
        console.log('');

        console.log('⏳ Calling Flutterwave payment-methods endpoint...');
        const response = await axios.post(
            `${BASE_URL}/payment-methods`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${SECRET_KEY}`,
                    'Content-Type': 'application/json',
                    'X-Trace-Id': `trace-${Date.now()}`
                },
                timeout: 30000
            }
        );

        console.log('\n✅ Response Status:', response.status);
        console.log('\n📊 Full Response:');
        console.log(JSON.stringify(response.data, null, 2));

        // Check for payment method ID
        const paymentMethodId = response.data?.data?.id || response.data?.id;
        console.log('\n🔑 Payment Method ID:', paymentMethodId || '❌ Not found');

        if (paymentMethodId) {
            console.log('\n✅ Payment method created successfully!');
        } else {
            console.log('\n❌ No payment method ID found in response');
            console.log('Available properties:', Object.keys(response.data?.data || response.data || {}));
        }

        console.log('\n========================================\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
        }
        if (error.request) {
            console.error('No response received from server');
        }
    }
}

testPaymentMethod();