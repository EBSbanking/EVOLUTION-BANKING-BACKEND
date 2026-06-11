// src/middleware/decryptPayload.js
import crypto from "crypto";

const CONFIG = {
  ALGORITHM: 'aes-256-cbc',
  KEY_SIZE: 32,
  IV_SIZE: 16,
  HMAC_ALGORITHM: 'sha256'
};

let primaryKey, secondaryKey;

try {
  if (process.env.ENCRYPTION_PRIMARY_KEY) {
    primaryKey = Buffer.from(process.env.ENCRYPTION_PRIMARY_KEY, 'base64');
  } else {
    primaryKey = crypto.randomBytes(CONFIG.KEY_SIZE);
  }
  
  if (process.env.ENCRYPTION_SECONDARY_KEY) {
    secondaryKey = Buffer.from(process.env.ENCRYPTION_SECONDARY_KEY, 'base64');
  } else {
    secondaryKey = crypto.randomBytes(CONFIG.KEY_SIZE);
  }
} catch (error) {
  primaryKey = crypto.randomBytes(CONFIG.KEY_SIZE);
  secondaryKey = crypto.randomBytes(CONFIG.KEY_SIZE);
}

function isValidBase64(str) {
  if (typeof str !== 'string') return false;
  const base64Regex = /^[A-Za-z0-9+/]+=*$/;
  return base64Regex.test(str);
}

function verifySignature(encryptedData, signature) {
  try {
    const hmac = crypto.createHmac(CONFIG.HMAC_ALGORITHM, secondaryKey);
    hmac.update(encryptedData);
    const expectedSignature = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    return false;
  }
}

function decryptPayloadData(encryptedData, iv) {
  const encryptedBytes = Buffer.from(encryptedData, 'base64');
  const ivBytes = Buffer.from(iv, 'base64');
  const decipher = crypto.createDecipheriv(CONFIG.ALGORITHM, primaryKey, ivBytes);
  let decrypted = decipher.update(encryptedBytes);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return JSON.parse(decrypted.toString('utf8'));
}

// Main middleware - defined as a regular function, not async arrow
async function decryptPayload(req, res, next) {
  console.log('🔐 DecryptPayload middleware');
  
  // ✅ UPDATED: Added /user-role to skip paths
  const skipPaths = [
    '/health', 
    '/status', 
    '/login', 
    '/customer/search', 
    '/system-date',
    '/user-role'  // ← ADD THIS LINE to skip user-role endpoints
  ];
  
  if (req.method !== 'POST' || skipPaths.some(path => req.path.includes(path))) {
    console.log(`🔐 Skipping decryption for: ${req.method} ${req.path}`);
    return next();
  }
  
  if (!req.body || Object.keys(req.body).length === 0) {
    return next();
  }
  
  // If it's already a plain object (not encrypted), skip decryption
  if (req.body.USER_ID || req.body.user_id || req.body.ACCT_NO || req.body.account_number) {
    console.log(`🔐 Request already in plain format for: ${req.path}`);
    req.decrypted = false;
    return next();
  }
  
  const { encryptedData, signature, iv } = req.body;
  
  if (!encryptedData || !signature || !iv) {
    req.decrypted = false;
    return next();
  }
  
  try {
    if (!isValidBase64(encryptedData) || !isValidBase64(iv)) {
      throw new Error('Invalid base64 format');
    }
    
    if (!verifySignature(encryptedData, signature)) {
      throw new Error('Signature verification failed');
    }
    
    const decryptedData = decryptPayloadData(encryptedData, iv);
    req.body = decryptedData;
    req.decrypted = true;
    next();
  } catch (error) {
    console.error('Decryption error:', error.message);
    return res.status(400).json({
      success: false,
      message: 'Decryption failed: ' + error.message
    });
  }
}

// Ensure default export exists
export default decryptPayload;

// Also export as named for compatibility
export { decryptPayload };