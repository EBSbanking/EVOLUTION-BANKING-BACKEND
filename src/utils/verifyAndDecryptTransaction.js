import crypto from 'crypto';

export function verifyAndDecryptTransaction(payload) {
  try {
    // Validate input structure
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid payload format');
    }

    const { encryptedData, signature, iv } = payload;

    // Check for required fields
    if (!encryptedData || !signature || !iv) {
      throw new Error('Missing required fields in encrypted payload');
    }

    // Validate environment variables
    if (!process.env.PRIMARY_KEY || !process.env.SECONDARY_KEY) {
      throw new Error('Encryption keys not configured');
    }

    // Prepare keys with validation
    const primaryKey = validateKey(process.env.PRIMARY_KEY, 'PRIMARY_KEY');
    const secondaryKey = validateKey(process.env.SECONDARY_KEY, 'SECONDARY_KEY');

    // Verify HMAC signature (constant-time comparison)
    const hmac = crypto.createHmac('sha256', secondaryKey);
    hmac.update(encryptedData);
    const expectedSignature = hmac.digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(signature, 'hex')
    )) {
      throw new Error('Signature verification failed - possible tampering');
    }

    // Decrypt the payload
    const ivBuffer = Buffer.from(iv, 'base64');
    if (ivBuffer.length !== 16) {
      throw new Error('Invalid IV length - must be 16 bytes');
    }

    const decipher = crypto.createDecipheriv('aes-256-cbc', primaryKey, ivBuffer);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Parse and return the decrypted data
    return JSON.parse(decrypted);

  } catch (error) {
    console.error('Decryption failed:', error.message);
    throw new Error(`Payload verification/decryption failed: ${error.message}`);
  }
}

// Helper function to validate and prepare keys
function validateKey(base64Key, keyName) {
  try {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== 32) {
      throw new Error(`Invalid ${keyName} length - must be 32 bytes`);
    }
    return key;
  } catch (err) {
    throw new Error(`Invalid ${keyName} format: ${err.message}`);
  }
}