// utils/flutterwaveWebhook.js

import crypto from 'crypto';

/**
 * Verify Flutterwave webhook signature
 * 
 * @param {string|Buffer} rawBody - The raw request body (string or Buffer)
 * @param {string} signature - The flutterwave-signature header value
 * @param {string} secretHash - Your webhook secret hash from Flutterwave dashboard
 * @returns {boolean} True if signature is valid
 */
export function isValidFlutterwaveWebhook(rawBody, signature, secretHash) {
  if (!rawBody) {
    console.error('Raw body is required for Flutterwave webhook verification');
    return false;
  }

  if (!signature) {
    console.error('Missing flutterwave-signature header');
    return false;
  }

  if (!secretHash) {
    console.warn('Secret hash not configured - skipping verification');
    return true; // Skip verification if no secret hash is set
  }

  try {
    // Ensure rawBody is a string
    const bodyString = typeof rawBody === 'string' 
      ? rawBody 
      : rawBody.toString();

    // CRITICAL: Flutterwave uses HMAC-SHA256 with the RAW request body
    const hash = crypto
      .createHmac('sha256', secretHash)
      .update(bodyString)
      .digest('base64');

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(hash)
    );
  } catch (error) {
    console.error('Flutterwave signature verification error:', error);
    return false;
  }
}

/**
 * Express middleware for Flutterwave webhook verification
 */
export function verifyFlutterwaveWebhook(req, res, next) {
  const signature = req.headers['flutterwave-signature'];
  const secretHash = process.env.FLUTTERWAVE_SECRET_HASH;
  
  // Store raw body for verification
  if (!req.rawBody) {
    req.rawBody = req.body ? JSON.stringify(req.body) : '';
  }

  // Skip verification if no signature or no secret hash
  if (!signature) {
    console.warn('Missing flutterwave-signature header - skipping verification');
    return next();
  }

  if (!secretHash) {
    console.warn('Secret hash not configured - skipping verification');
    return next();
  }

  const isValid = isValidFlutterwaveWebhook(req.rawBody, signature, secretHash);

  if (!isValid) {
    console.error('Invalid Flutterwave webhook signature');
    return res.status(401).json({
      status: 'error',
      message: 'Invalid signature'
    });
  }

  console.log('✅ Flutterwave webhook signature verified');
  next();
}

