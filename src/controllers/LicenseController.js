import CryptoJS from 'crypto-js';
import License from '../models/License.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// --- Define __filename and __dirname for ES modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Better: Use environment variable for license file path
const LICENSE_FILE_PATH = process.env.LICENSE_FILE_PATH || 
  path.join(__dirname, '..', '..', '..', 'CORE_X_FRONTEND', 'build', 'license', 'license.txt');

// ✅ Rate limiting storage (in-memory, for simple implementation)
// Note: For production, use Redis or a database instead
const validationAttempts = new Map();

// ✅ Clean up old attempts periodically
setInterval(() => {
  const now = Date.now();
  const fifteenMinutes = 15 * 60 * 1000;
  
  for (const [ip, attempts] of validationAttempts.entries()) {
    const validAttempts = attempts.filter(time => now - time < fifteenMinutes);
    if (validAttempts.length === 0) {
      validationAttempts.delete(ip);
    } else {
      validationAttempts.set(ip, validAttempts);
    }
  }
}, 10 * 60 * 1000); // Clean every 10 minutes

// ✅ Ensure license directory exists
const ensureLicenseDirectory = () => {
  const licenseDir = path.dirname(LICENSE_FILE_PATH);
  if (!fs.existsSync(licenseDir)) {
    fs.mkdirSync(licenseDir, { recursive: true });
    console.log(`Created license directory: ${licenseDir}`);
  }
};

// ✅ Validate license data before encryption
const validateLicenseData = (data) => {
  const errors = [];
  
  if (!data.expires) {
    errors.push('Expiration date is required');
  } else {
    const expiryDate = new Date(data.expires);
    if (isNaN(expiryDate.getTime())) {
      errors.push('Invalid expiration date format');
    } else if (expiryDate <= new Date()) {
      errors.push('Expiration date must be in the future');
    }
  }
  
  if (!data.issued_to || data.issued_to.trim().length === 0) {
    errors.push('Issued to field is required');
  }
  
  if (!data.license_type || data.license_type.trim().length === 0) {
    errors.push('License type is required');
  }
  
  return errors;
};

// ✅ Generate license and return downloadable .txt
export const generateLicense = async (req, res) => {
  try {
    const { expires, issued_to, license_type } = req.body;

    // Validate required fields
    if (!expires || !issued_to || !license_type) {
      return res.status(400).json({ 
        message: 'All fields are required',
        required_fields: ['expires', 'issued_to', 'license_type']
      });
    }

    // Validate data format
    const validationErrors = validateLicenseData(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    const licenseData = { 
      expires, 
      issued_to: issued_to.trim(), 
      license_type: license_type.trim() 
    };

    // Get secret from environment (required)
    const secret = process.env.LICENSE_SECRET;
    if (!secret) {
      console.error('LICENSE_SECRET environment variable is not set');
      return res.status(500).json({ 
        message: 'Server configuration error',
        error: 'License secret not configured'
      });
    }

    // Encrypt the license data
    const encrypted = CryptoJS.AES.encrypt(
      JSON.stringify(licenseData), 
      secret
    ).toString();

    // Save to database
    const license = new License({
      ...licenseData,
      encrypted_key: encrypted,
      created_at: new Date()
    });

    await license.save();

    // Set response headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename=license.txt');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-License-ID', license._id);
    
    res.status(200).send(encrypted);
    
  } catch (error) {
    console.error('License generation error:', error);
    res.status(500).json({
      message: 'Error generating license',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ✅ Rate limiting check function
const checkRateLimit = (ip) => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxAttempts = 10;
  
  if (!validationAttempts.has(ip)) {
    validationAttempts.set(ip, []);
  }
  
  const attempts = validationAttempts.get(ip);
  const validAttempts = attempts.filter(time => now - time < windowMs);
  
  if (validAttempts.length >= maxAttempts) {
    return {
      limited: true,
      retryAfter: Math.ceil((validAttempts[0] + windowMs - now) / 1000 / 60), // minutes
      attempts: validAttempts.length
    };
  }
  
  validAttempts.push(now);
  validationAttempts.set(ip, validAttempts);
  
  return {
    limited: false,
    attempts: validAttempts.length
  };
};

// ✅ Validate license
export const validateLicenseFile = async (req, res) => {
  try {
    // Check rate limiting
    const clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const rateLimit = checkRateLimit(clientIp);
    
    if (rateLimit.limited) {
      return res.status(429).json({
        message: 'Too many validation attempts',
        error: 'Rate limit exceeded',
        details: {
          maxAttempts: 10,
          window: '15 minutes',
          retryAfter: `${rateLimit.retryAfter} minutes`,
          attempts: rateLimit.attempts
        }
      });
    }

    let encrypted_key;

    // Handle file upload or direct key
    if (req.file) {
      if (req.file.size === 0) {
        return res.status(400).json({ message: 'License file is empty' });
      }
      encrypted_key = req.file.buffer.toString('utf8').trim();
    } else if (req.body.encryptedKey) {
      encrypted_key = req.body.encryptedKey.trim();
    } else {
      return res.status(400).json({ 
        message: 'Either license file or encrypted key must be provided',
        usage: {
          fileUpload: 'Use multipart/form-data with "licenseFile" field',
          directKey: 'Or send JSON with { "encryptedKey": "..." }'
        }
      });
    }

    if (!encrypted_key) {
      return res.status(400).json({ message: 'License content is empty' });
    }

    // Get secret from environment
    const secret = process.env.LICENSE_SECRET;
    if (!secret) {
      return res.status(500).json({ 
        message: 'Server configuration error',
        error: 'License secret not configured'
      });
    }

    // Decrypt the license
    let decryptedData;
    try {
      const bytes = CryptoJS.AES.decrypt(encrypted_key, secret);
      decryptedData = bytes.toString(CryptoJS.enc.Utf8);
    } catch (decryptError) {
      return res.status(401).json({ 
        message: 'Failed to decrypt license',
        error: 'Invalid encryption or secret key'
      });
    }

    if (!decryptedData) {
      return res.status(401).json({ 
        message: 'Invalid or tampered license key',
        reasons: [
          'Incorrect secret key used for decryption',
          'Corrupted license data',
          'Invalid encryption format'
        ]
      });
    }

    // Parse decrypted data
    let licenseData;
    try {
      licenseData = JSON.parse(decryptedData);
    } catch (parseError) {
      return res.status(400).json({ 
        message: 'Failed to parse license data',
        error: 'Invalid JSON format in license'
      });
    }

    // Validate required fields
    const requiredFields = ['expires', 'issued_to', 'license_type'];
    const missingFields = requiredFields.filter(field => !licenseData[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: 'Invalid license format',
        missingFields
      });
    }

    // Check expiration
    const now = new Date();
    const expiryDate = new Date(licenseData.expires);

    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({ 
        message: 'Invalid expiration date in license'
      });
    }

    if (now > expiryDate) {
      return res.status(403).json({
        message: 'License has expired',
        details: {
          expiredOn: licenseData.expires,
          now: now.toISOString(),
          daysExpired: Math.floor((now - expiryDate) / (1000 * 60 * 60 * 24))
        }
      });
    }

    // Check if license exists in database
    const existingLicense = await License.findOne({ encrypted_key });

    // Save license to file system
    try {
      ensureLicenseDirectory();
      fs.writeFileSync(LICENSE_FILE_PATH, encrypted_key, 'utf8');
    } catch (fileError) {
      console.error('Failed to write license file:', fileError);
      // Don't fail the request if file writing fails, just log it
    }

    // Update or create license record
    await License.updateOne(
      { encrypted_key },
      {
        $set: {
          ...licenseData,
          is_used: true,
          used_at: new Date(),
          last_validated: new Date(),
          created_at: existingLicense?.created_at || new Date()
        }
      },
      { upsert: true }
    );

    return res.status(200).json({
      message: 'License is valid',
      license: {
        issued_to: licenseData.issued_to,
        license_type: licenseData.license_type,
        expires: licenseData.expires
      },
      validity: {
        expires: licenseData.expires,
        daysRemaining: Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24))
      },
      metadata: {
        validated_at: new Date().toISOString(),
        license_id: existingLicense?._id,
        rateLimit: {
          attempts: rateLimit.attempts,
          remaining: 10 - rateLimit.attempts
        }
      }
    });
    
  } catch (error) {
    console.error('License validation error:', error);
    return res.status(500).json({
      message: 'Failed to validate license',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ✅ Get license details
export const getLicenseDetails = async (req, res) => {
  const { encryptedKey } = req.body;

  if (!encryptedKey) {
    return res.status(400).json({ 
      message: "Encrypted license key is required in body",
      example: { encryptedKey: "your-encrypted-key-here" }
    });
  }

  try {
    const license = await License.findOne({ encrypted_key: encryptedKey });

    if (!license) {
      return res.status(404).json({ 
        message: "License not found",
        suggestion: "Try validating the license first"
      });
    }

    const now = new Date();
    const expiryDate = new Date(license.expires);
    const daysRemaining = Math.max(
      Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24)),
      0
    );

    const isExpired = now > expiryDate;
    const isValid = !isExpired && license.is_used;

    res.json({
      success: true,
      license: {
        issued_to: license.issued_to,
        license_type: license.license_type,
        expires: license.expires,
        created_at: license.created_at,
        is_used: license.is_used,
        used_at: license.used_at,
        last_validated: license.last_validated
      },
      status: {
        isValid,
        isExpired,
        isUsed: license.is_used,
        daysRemaining,
        expiresIn: `${daysRemaining} days`
      },
      validation: {
        last_validated: license.last_validated,
        total_validations: license.validation_count || 0
      }
    });
  } catch (err) {
    console.error("Error fetching license details:", err);
    res.status(500).json({ 
      message: "Server error while fetching license details",
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Check if license exists on server
export const checkLicenseExists = async (req, res) => {
  try {
    // Ensure license directory exists
    ensureLicenseDirectory();
    
    const licenseExists = fs.existsSync(LICENSE_FILE_PATH);
    
    if (!licenseExists) {
      return res.status(404).json({
        message: 'No license file found on server',
        licenseFile: LICENSE_FILE_PATH,
        exists: false
      });
    }

    // Read and validate the license file
    const encrypted_key = fs.readFileSync(LICENSE_FILE_PATH, 'utf8').trim();
    
    if (!encrypted_key) {
      return res.status(400).json({
        message: 'License file exists but is empty',
        licenseFile: LICENSE_FILE_PATH,
        exists: true,
        valid: false
      });
    }

    // Check in database
    const dbLicense = await License.findOne({ encrypted_key });
    
    res.json({
      message: 'License found on server',
      exists: true,
      valid: !!dbLicense,
      license: dbLicense ? {
        issued_to: dbLicense.issued_to,
        expires: dbLicense.expires,
        is_used: dbLicense.is_used
      } : null,
      fileInfo: {
        path: LICENSE_FILE_PATH,
        size: fs.statSync(LICENSE_FILE_PATH).size,
        lastModified: fs.statSync(LICENSE_FILE_PATH).mtime
      }
    });
    
  } catch (error) {
    console.error('Error checking license:', error);
    res.status(500).json({
      message: 'Error checking license',
      error: error.message
    });
  }
};