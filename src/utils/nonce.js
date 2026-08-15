// src/utils/nonceGenerator.js
import crypto from 'crypto';

/**
 * Generate a 12-character nonce using crypto.randomBytes
 * @returns {string} A 12-character nonce string
 */
export function generateNonce() {
    return crypto.randomBytes(12).toString('hex').substring(0, 12);
}

/**
 * Generate a nonce with timestamp for uniqueness
 * @returns {string} A nonce with timestamp
 */
export function generateNonceWithTimestamp() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString('hex');
    return `${timestamp}-${random}`;
}

/**
 * Generate multiple nonces
 * @param {number} count - Number of nonces to generate
 * @returns {string[]} Array of nonces
 */
export function generateNonces(count = 1) {
    const nonces = [];
    for (let i = 0; i < count; i++) {
        nonces.push(generateNonce());
    }
    return nonces;
}

// Default export for convenience
export default {
    generateNonce,
    generateNonceWithTimestamp,
    generateNonces
};