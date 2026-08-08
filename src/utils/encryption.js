// utils/encryption.js
import crypto from 'crypto';

// ============================================
// V3 3DES ENCRYPTION (Flutterwave V3 API)
// ============================================

/**
 * Get V3 3DES encryption key from environment
 */
const getV3EncryptionKey = () => {
  const key = process.env.FLW_SANDBOX_ENCRYPTION_KEY || 
              process.env.FLUTTERWAVE_ENCRYPTION_KEY;
  
  if (!key) {
    console.warn('⚠️ No V3 3DES encryption key found in environment');
    return null;
  }
  return key;
};

/**
 * Generate a 12-character nonce for V3 3DES
 * @returns {string} 12-character hex string
 */
export function generateV3Nonce() {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * Encrypt a field using V3 3DES (Flutterwave V3 API)
 * Uses: DES-EDE3-CBC (3DES)
 * 
 * @param {string} value - The value to encrypt
 * @param {string} nonce - 12-character nonce
 * @returns {string} Base64 encrypted value
 */
export function encryptV3_3DES(value, nonce) {
  if (!value) return null;
  
  try {
    const encryptionKey = getV3EncryptionKey();
    if (!encryptionKey) {
      throw new Error('V3 3DES encryption key not found');
    }

    // V3 uses 3DES with 24-byte key
    const keyBuffer = Buffer.alloc(24);
    const sourceKey = Buffer.from(encryptionKey, 'utf8');
    sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));
    
    // IV is first 8 characters of nonce
    const iv = Buffer.from(nonce.slice(0, 8), 'utf8');
    
    const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
    let encrypted = cipher.update(String(value), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return encrypted;
  } catch (error) {
    console.error('❌ V3 3DES encryption error:', error.message);
    return null;
  }
}

/**
 * Decrypt a field using V3 3DES (Flutterwave V3 API)
 * 
 * @param {string} encryptedData - Base64 encrypted data
 * @param {string} nonce - 12-character nonce used for encryption
 * @returns {string} Decrypted value
 */
export function decryptV3_3DES(encryptedData, nonce) {
  if (!encryptedData) return null;
  
  try {
    const encryptionKey = getV3EncryptionKey();
    if (!encryptionKey) {
      throw new Error('V3 3DES encryption key not found');
    }

    const keyBuffer = Buffer.alloc(24);
    const sourceKey = Buffer.from(encryptionKey, 'utf8');
    sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));
    
    const iv = Buffer.from(nonce.slice(0, 8), 'utf8');
    const decipher = crypto.createDecipheriv('des-ede3-cbc', keyBuffer, iv);
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('❌ V3 3DES decryption error:', error.message);
    return null;
  }
}

/**
 * Encrypt CVV using V3 3DES (Flutterwave V3 API)
 * 
 * @param {string} cvv - The CVV to encrypt (3-4 digits)
 * @returns {Object} { encrypted: string, nonce: string }
 */
export function encryptCVVForFlutterwaveV3(cvv) {
  try {
    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      console.warn('⚠️ Invalid CVV format:', cvv);
      return null;
    }

    const encryptionKey = getV3EncryptionKey();
    if (!encryptionKey) {
      console.warn('⚠️ No V3 3DES encryption key found');
      return null;
    }

    // Generate 12-character nonce (6 bytes hex)
    const nonce = generateV3Nonce();
    
    // V3 3DES encryption
    const keyBuffer = Buffer.alloc(24);
    const sourceKey = Buffer.from(encryptionKey, 'utf8');
    sourceKey.copy(keyBuffer, 0, 0, Math.min(sourceKey.length, 24));
    const iv = Buffer.from(nonce.slice(0, 8), 'utf8');
    const cipher = crypto.createCipheriv('des-ede3-cbc', keyBuffer, iv);
    let encrypted = cipher.update(String(cvv), 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    return {
      encrypted: encrypted,    // Base64 encrypted CVV
      nonce: nonce             // 12-character hex nonce
    };
  } catch (error) {
    console.error('❌ V3 CVV encryption failed:', error.message);
    return null;
  }
}

// ============================================
// DEV AES-256-GCM ENCRYPTION (Developer Sandbox)
// ============================================

/**
 * Get Dev AES encryption key from environment
 */
const getDevEncryptionKey = () => {
  const key = process.env.FLW_SANDBOX_DEV_ENCRYPTION_KEY || 
              process.env.FLUTTERWAVE_DEV_ENCRYPTION_KEY;
  
  if (!key) {
    console.warn('⚠️ No Dev AES encryption key found in environment');
    return null;
  }
  return key;
};

/**
 * Generate a nonce for Dev AES-256-GCM
 * @returns {string} Base64 encoded nonce
 */
export function generateDevNonce() {
  return crypto.randomBytes(12).toString('base64');
}

/**
 * Encrypt a field using Dev AES-256-GCM
 * ✅ FIXED: Properly stores IV + encrypted data + auth tag
 * 
 * @param {string} value - The value to encrypt
 * @param {string} nonce - Base64 encoded nonce (IV)
 * @returns {Object} { encrypted: string, nonce: string }
 */
export function encryptDevAES(value, nonce) {
  if (!value) return null;
  
  try {
    const encryptionKey = getDevEncryptionKey();
    if (!encryptionKey) {
      throw new Error('Dev AES encryption key not found');
    }

    const key = Buffer.from(encryptionKey, 'base64');
    if (key.length !== 32) {
      throw new Error(`Key must be 32 bytes, got ${key.length}`);
    }

    // Use the provided nonce as IV
    const iv = Buffer.from(nonce, 'base64');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    let encrypted = cipher.update(value, 'utf8');
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();
    
    // ✅ FIX: Combine encrypted data + auth tag
    const combined = Buffer.concat([encrypted, authTag]);
    
    return {
      encrypted: combined.toString('base64'),  // Base64 encoded combined data
      nonce: nonce                             // Base64 encoded IV
    };
  } catch (error) {
    console.error('❌ Dev AES encryption error:', error.message);
    return null;
  }
}

/**
 * Decrypt a field using Dev AES-256-GCM
 * ✅ FIXED: Properly extracts IV, encrypted data, and auth tag
 * 
 * @param {string} encryptedData - Base64 encrypted data (combined + auth tag)
 * @param {string} nonce - Base64 encoded nonce (IV) used for encryption
 * @returns {string} Decrypted value
 */
export function decryptDevAES(encryptedData, nonce) {
  if (!encryptedData) return null;
  
  try {
    const encryptionKey = getDevEncryptionKey();
    if (!encryptionKey) {
      throw new Error('Dev AES encryption key not found');
    }

    const key = Buffer.from(encryptionKey, 'base64');
    if (key.length !== 32) {
      throw new Error(`Key must be 32 bytes, got ${key.length}`);
    }

    // Decode the combined data
    const combined = Buffer.from(encryptedData, 'base64');
    
    // AES-GCM auth tag is 16 bytes
    const authTagLength = 16;
    if (combined.length < authTagLength) {
      throw new Error('Encrypted data too short');
    }
    
    // Extract auth tag (last 16 bytes) and encrypted data (rest)
    const authTag = combined.subarray(combined.length - authTagLength);
    const encrypted = combined.subarray(0, combined.length - authTagLength);
    
    // Use the nonce as IV
    const iv = Buffer.from(nonce, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('❌ Dev AES decryption error:', error.message);
    return null;
  }
}

/**
 * Encrypt CVV using Dev AES-256-GCM
 * 
 * @param {string} cvv - The CVV to encrypt (3-4 digits)
 * @returns {Object} { encrypted: string, nonce: string }
 */
export function encryptCVVForDev(cvv) {
  try {
    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      console.warn('⚠️ Invalid CVV format:', cvv);
      return null;
    }

    const encryptionKey = getDevEncryptionKey();
    if (!encryptionKey) {
      console.warn('⚠️ No Dev AES encryption key found');
      return null;
    }

    const nonce = generateDevNonce();
    return encryptDevAES(cvv, nonce);
  } catch (error) {
    console.error('❌ Dev AES CVV encryption failed:', error.message);
    return null;
  }
}

// ============================================
// UNIFIED CVV ENCRYPTION (Auto-detect)
// ============================================

/**
 * Encrypt CVV using the appropriate method based on available keys
 * Prefers V3 3DES if available, otherwise uses Dev AES
 * 
 * @param {string} cvv - The CVV to encrypt (3-4 digits)
 * @returns {Object} { encrypted: string, nonce: string, method: string }
 */
export function encryptCVV(cvv) {
  try {
    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      console.warn('⚠️ Invalid CVV format:', cvv);
      return null;
    }

    // Try V3 3DES first (preferred for production)
    const v3Key = getV3EncryptionKey();
    if (v3Key) {
      const result = encryptCVVForFlutterwaveV3(cvv);
      if (result) {
        return {
          ...result,
          method: 'V3_3DES'
        };
      }
    }

    // Fallback to Dev AES
    const devKey = getDevEncryptionKey();
    if (devKey) {
      const result = encryptCVVForDev(cvv);
      if (result) {
        return {
          ...result,
          method: 'DEV_AES'
        };
      }
    }

    console.warn('⚠️ No encryption method available for CVV');
    return null;
  } catch (error) {
    console.error('❌ CVV encryption failed:', error.message);
    return null;
  }
}

/**
 * Decrypt CVV using the appropriate method
 * 
 * @param {string} encryptedData - The encrypted CVV
 * @param {string} nonce - The nonce used for encryption
 * @param {string} method - Optional method hint ('V3_3DES' or 'DEV_AES')
 * @returns {string} Decrypted CVV
 */
export function decryptCVV(encryptedData, nonce, method = null) {
  try {
    if (!encryptedData) {
      console.warn('⚠️ No encrypted data provided');
      return null;
    }

    // Try V3 3DES first
    if (method === 'V3_3DES' || !method) {
      const v3Key = getV3EncryptionKey();
      if (v3Key && nonce && nonce.length === 12) {
        try {
          const decrypted = decryptV3_3DES(encryptedData, nonce);
          if (decrypted && /^\d{3,4}$/.test(decrypted)) {
            return decrypted;
          }
        } catch (e) {
          // Fall through to next method
        }
      }
    }

    // Try Dev AES
    if (method === 'DEV_AES' || !method) {
      const devKey = getDevEncryptionKey();
      if (devKey && nonce) {
        try {
          const decrypted = decryptDevAES(encryptedData, nonce);
          if (decrypted && /^\d{3,4}$/.test(decrypted)) {
            return decrypted;
          }
        } catch (e) {
          // Fall through
        }
      }
    }

    console.warn('⚠️ Failed to decrypt CVV with available methods');
    return null;
  } catch (error) {
    console.error('❌ CVV decryption error:', error.message);
    return null;
  }
}

// ============================================
// BACKWARD COMPATIBILITY
// ============================================

// Alias for decryptCVV
export const decryptStoredCVV = decryptCVV;

// Alias for decryptCVV (printing)
export const decryptCVVForPrinting = decryptCVV;

// Alias for encryptCVV (backward compatibility)
export const encryptCVVForStorage = encryptCVV;

// ============================================
// KEY MANAGEMENT
// ============================================

/**
 * Generate a new encryption key (32 bytes Base64)
 * @returns {string} Base64 encoded key
 */
export function generateEncryptionKey() {
  const key = crypto.randomBytes(32);
  return key.toString('base64');
}

/**
 * Generate a new V3 3DES key (24 bytes)
 * @returns {string} UTF-8 string key
 */
export function generateV3Key() {
  return crypto.randomBytes(24).toString('utf8');
}

/**
 * Check if encryption is properly configured
 * @returns {Object} Status of encryption configuration
 */
export function checkEncryptionStatus() {
  const v3Key = getV3EncryptionKey();
  const devKey = getDevEncryptionKey();
  
  return {
    v3_3des: {
      configured: !!v3Key,
      keyLength: v3Key ? v3Key.length : 0,
      keyPreview: v3Key ? v3Key.substring(0, 10) + '...' : null
    },
    dev_aes: {
      configured: !!devKey,
      keyLength: devKey ? devKey.length : 0,
      keyPreview: devKey ? devKey.substring(0, 10) + '...' : null
    },
    ready: !!(v3Key || devKey)
  };
}

// ============================================
// EXPORTS
// ============================================

export default {
  // V3 3DES
  generateV3Nonce,
  encryptV3_3DES,
  decryptV3_3DES,
  encryptCVVForFlutterwaveV3,
  
  // Dev AES
  generateDevNonce,
  encryptDevAES,
  decryptDevAES,
  encryptCVVForDev,
  
  // Unified
  encryptCVV,
  decryptCVV,
  decryptStoredCVV,
  decryptCVVForPrinting,
  encryptCVVForStorage,
  
  // Key Management
  generateEncryptionKey,
  generateV3Key,
  checkEncryptionStatus,
};