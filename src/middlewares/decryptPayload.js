// src/middleware/decryptPayload.js
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// Configuration
const CONFIG = {
  ALGORITHM: 'aes-256-cbc',
  KEY_SIZE: 32, // 32 bytes for AES-256
  IV_SIZE: 16, // 16 bytes for AES-CBC
  HMAC_ALGORITHM: 'sha256'
};

// Key Manager Utility Class
class KeyManager {
  static generateKey() {
    return crypto.randomBytes(CONFIG.KEY_SIZE).toString('base64');
  }
  
  static validateKey(base64Key, expectedSize = CONFIG.KEY_SIZE) {
    if (!base64Key || typeof base64Key !== 'string') {
      return { valid: false, error: 'Key must be a string' };
    }
    
    const trimmed = base64Key.trim();
    
    // Basic base64 validation
    const base64Regex = /^[A-Za-z0-9+/]+=*$/;
    if (!base64Regex.test(trimmed)) {
      return { valid: false, error: 'Invalid base64 characters' };
    }
    
    try {
      const key = Buffer.from(trimmed, 'base64');
      
      if (expectedSize && key.length !== expectedSize) {
        return { 
          valid: false, 
          error: `Key must be ${expectedSize} bytes, got ${key.length}` 
        };
      }
      
      return { valid: true, key };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

// Ensure encryption keys exist before anything else
function ensureEncryptionKeys() {
  const required = ['ENCRYPTION_PRIMARY_KEY', 'ENCRYPTION_SECONDARY_KEY'];
  const missing = required.filter(key => !process.env[key] || process.env[key].trim() === '');
  
  if (missing.length > 0) {
    console.warn('⚠️ Missing encryption keys. Generating temporary ones...');
    
    missing.forEach(key => {
      const newKey = KeyManager.generateKey();
      process.env[key] = newKey;
      console.log(`🔑 Generated ${key}: ${newKey.substring(0, 20)}...`);
    });
    
    console.log('💡 Add these to your .env file for production use');
  }
}

// Call this before anything else
ensureEncryptionKeys();

class DecryptionError extends Error {
  constructor(message, errorCode, details = {}) {
    super(message);
    this.name = 'DecryptionError';
    this.errorCode = errorCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

class DecryptionMiddleware {
  constructor() {
    this.keys = {};
    this.initializeKeys();
    
    console.log('Decryption middleware initialized:', {
      hasPrimaryKey: !!this.keys.primary,
      hasSecondaryKey: !!this.keys.secondary,
      isDevelopmentMode: this.keys.developmentMode || false
    });
  }

  initializeKeys() {
    const requiredKeys = [
      { name: 'PRIMARY_KEY', isPrimary: true },
      { name: 'SECONDARY_KEY', isPrimary: false }
    ];
    
    let developmentMode = false;
    
    for (const { name, isPrimary } of requiredKeys) {
      const envKey = process.env[`ENCRYPTION_${name}`];
      
      if (envKey) {
        const validation = KeyManager.validateKey(
          envKey, 
          isPrimary ? CONFIG.KEY_SIZE : undefined
        );
        
        if (validation.valid) {
          this.keys[name.toLowerCase().replace('_key', '')] = validation.key;
        } else {
          console.warn(`⚠️ Invalid ${name}: ${validation.error}`);
          developmentMode = true;
        }
      } else {
        console.warn(`⚠️ ${name} not found in environment`);
        developmentMode = true;
      }
    }
    
    // Generate development keys if needed
    if (developmentMode || !this.keys.primary || !this.keys.secondary) {
      console.warn('🔑 Generating development keys (NOT FOR PRODUCTION USE)');
      this.keys.primary = crypto.randomBytes(CONFIG.KEY_SIZE);
      this.keys.secondary = crypto.randomBytes(CONFIG.KEY_SIZE);
      this.keys.developmentMode = true;
    }
  }

  /**
   * Getter for primary key
   */
  get primaryKey() {
    return this.keys.primary;
  }

  /**
   * Getter for secondary key
   */
  get secondaryKey() {
    return this.keys.secondary;
  }

  /**
   * Validate base64 string
   */
  isValidBase64(str) {
    if (typeof str !== 'string') return false;
    
    try {
      const base64Regex = /^[A-Za-z0-9+/]+=*$/;
      if (!base64Regex.test(str)) return false;
      
      const decoded = Buffer.from(str, 'base64');
      const reEncoded = Buffer.from(decoded).toString('base64');
      return reEncoded === str;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verify HMAC signature
   */
  verifySignature(encryptedData, signature, key) {
    try {
      const hmac = crypto.createHmac(CONFIG.HMAC_ALGORITHM, key);
      hmac.update(encryptedData);
      const calculatedSignature = hmac.digest('hex');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(calculatedSignature, 'hex')
      );
    } catch (error) {
      throw new DecryptionError(
        'Signature verification failed',
        'SIGNATURE_VERIFICATION_FAILED',
        { originalError: error.message }
      );
    }
  }

  /**
   * Decrypt payload
   */
  decryptPayload(encryptedData, iv) {
    try {
      // Parse base64 strings
      const encryptedBytes = Buffer.from(encryptedData, 'base64');
      const ivBytes = Buffer.from(iv, 'base64');

      // Validate IV size
      if (ivBytes.length !== CONFIG.IV_SIZE) {
        throw new DecryptionError(
          `Invalid IV size: expected ${CONFIG.IV_SIZE} bytes, got ${ivBytes.length}`,
          'INVALID_IV_SIZE'
        );
      }

      // Create decipher
      const decipher = crypto.createDecipheriv(
        CONFIG.ALGORITHM,
        this.primaryKey,
        ivBytes
      );

      // Decrypt
      let decrypted = decipher.update(encryptedBytes);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      // Parse JSON
      const decryptedString = decrypted.toString('utf8');
      const parsedData = JSON.parse(decryptedString);

      return parsedData;
    } catch (error) {
      if (error instanceof DecryptionError) {
        throw error;
      }
      
      throw new DecryptionError(
        'Decryption failed',
        'DECRYPTION_FAILED',
        { 
          originalError: error.message,
          step: error instanceof SyntaxError ? 'JSON parsing' : 'decryption'
        }
      );
    }
  }

  /**
   * Main middleware handler
   */
  handler = async (req, res, next) => {
    const startTime = Date.now();
    const requestId = crypto.randomBytes(8).toString('hex');

    console.log(`[${requestId}] Decryption middleware processing request`, {
      method: req.method,
      path: req.path,
      contentType: req.headers['content-type'],
      bodyKeys: req.body ? Object.keys(req.body) : 'no body'
    });

    try {
      // Skip decryption for non-POST requests or specific endpoints
      if (req.method !== 'POST' || req.path.includes('/health') || req.path.includes('/status')) {
        console.log(`[${requestId}] Skipping decryption for ${req.method} ${req.path}`);
        return next();
      }

      // Check for empty body
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new DecryptionError(
          'Empty payload received',
          'EMPTY_PAYLOAD',
          { requestId }
        );
      }

      const { encryptedData, signature, iv } = req.body;

      // Validate required fields
      if (!encryptedData || !signature || !iv) {
        const missingFields = [];
        if (!encryptedData) missingFields.push('encryptedData');
        if (!signature) missingFields.push('signature');
        if (!iv) missingFields.push('iv');

        throw new DecryptionError(
          'Missing required encryption fields',
          'MISSING_ENCRYPTION_FIELDS',
          { 
            missingFields,
            receivedFields: Object.keys(req.body),
            requestId
          }
        );
      }

      // Validate base64 format
      [encryptedData, iv].forEach((field, index) => {
        if (!this.isValidBase64(field)) {
          const fieldName = ['encryptedData', 'iv'][index];
          throw new DecryptionError(
            `Invalid base64 format for ${fieldName}`,
            'INVALID_BASE64',
            { fieldName, requestId }
          );
        }
      });

      // Verify signature
      if (!this.verifySignature(encryptedData, signature, this.secondaryKey)) {
        throw new DecryptionError(
          'HMAC signature verification failed - data may have been tampered with',
          'SIGNATURE_MISMATCH',
          { requestId }
        );
      }

      // Decrypt payload
      const decryptedData = this.decryptPayload(encryptedData, iv);

      // Validate decrypted data structure
      if (!decryptedData || typeof decryptedData !== 'object') {
        throw new DecryptionError(
          'Decrypted data is not a valid object',
          'INVALID_DECRYPTED_DATA',
          { 
            type: typeof decryptedData,
            requestId 
          }
        );
      }

      // Attach decrypted data to request
      req.decryptedData = decryptedData;
      req.encryptionMetadata = {
        requestId,
        decryptionTime: Date.now() - startTime,
        verifiedAt: new Date().toISOString(),
        developmentMode: this.keys.developmentMode || false
      };

      console.log(`[${requestId}] Decryption successful`, {
        decryptionTime: Date.now() - startTime,
        dataKeys: Object.keys(decryptedData),
        requestId,
        developmentMode: this.keys.developmentMode || false
      });

      next();

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      console.error(`[${requestId}] Decryption failed`, {
        error: error.message,
        errorCode: error.errorCode,
        details: error.details,
        processingTime,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        developmentMode: this.keys.developmentMode || false
      });

      // Send appropriate error response
      const statusCode = error.errorCode === 'EMPTY_PAYLOAD' ? 400 : 400;
      
      res.status(statusCode).json({
        success: false,
        error: {
          message: error.message,
          code: error.errorCode || 'DECRYPTION_ERROR',
          requestId,
          timestamp: error.timestamp || new Date().toISOString(),
          developmentMode: this.keys.developmentMode || false,
          ...(process.env.NODE_ENV === 'development' && { details: error.details })
        }
      });
    }
  };

  /**
   * Test endpoint for encryption/decryption
   */
  testHandler = async (req, res) => {
    try {
      // This endpoint allows testing the encryption/decryption
      const testData = {
        message: 'Test encryption/decryption',
        timestamp: Date.now(),
        test: true
      };

      // Encrypt test data
      const iv = crypto.randomBytes(CONFIG.IV_SIZE);
      const cipher = crypto.createCipheriv(CONFIG.ALGORITHM, this.primaryKey, iv);
      let encrypted = cipher.update(JSON.stringify(testData), 'utf8', 'base64');
      encrypted += cipher.final('base64');

      // Create signature
      const hmac = crypto.createHmac(CONFIG.HMAC_ALGORITHM, this.secondaryKey);
      hmac.update(encrypted);
      const signature = hmac.digest('hex');

      res.json({
        success: true,
        test: 'encryption_test',
        encryptedPayload: {
          encryptedData: encrypted,
          iv: iv.toString('base64'),
          signature
        },
        decrypted: testData,
        developmentMode: this.keys.developmentMode || false
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        developmentMode: this.keys.developmentMode || false
      });
    }
  };
}

// Create singleton instance
const decryptionMiddleware = new DecryptionMiddleware();

// Export middleware
export const decryptPayload = decryptionMiddleware.handler;
export const encryptionTest = decryptionMiddleware.testHandler;

// Export for direct use
export { DecryptionError };
export default decryptPayload;