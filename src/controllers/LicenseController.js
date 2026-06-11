// controllers/licenseController.js - FIXED VERSION
import CryptoJS from 'crypto-js';
import License from '../models/License.js';
import LicenseValidation from '../models/LicenseValidation.js'; // Optional
import { Op } from 'sequelize';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import logger from '../utils/logger.js';

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
  
  // Validate license_type enum
  const validTypes = ['TRIAL', 'STANDARD', 'ENTERPRISE', 'CUSTOM'];
  if (data.license_type && !validTypes.includes(data.license_type.toUpperCase())) {
    errors.push(`License type must be one of: ${validTypes.join(', ')}`);
  }
  
  return errors;
};


// ✅ Decrypt and validate license with validation tracking
// controllers/licenseController.js - Updated validateLicense with auto-activation

export const validateLicense = async (req, res) => {
  try {
    const { license_key, client_ip, user_agent, client_info } = req.body;

    if (!license_key || license_key.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'License key is required'
      });
    }

    console.log('🔍 Validating license key...');
    console.log('Key length:', license_key.length);

    const secret = process.env.LICENSE_SECRET || 'default-secret-key-change-me';
    let decryptedData;
    let licenseId = null;
    let alreadyActivated = false;
    let activationPerformed = false;

    // 1. Decrypt the license key
    try {
      const bytes = CryptoJS.AES.decrypt(license_key, secret);
      const decryptedText = bytes.toString(CryptoJS.enc.Utf8);
      if (!decryptedText) {
        throw new Error('Empty decryption result');
      }
      decryptedData = JSON.parse(decryptedText);
      console.log('✅ Successfully decrypted license data:', decryptedData);
    } catch (err) {
      console.error('❌ Decryption/parsing error:', err.message);
      // Record failed validation attempt
      await LicenseValidation.create({
        license_id: 0,
        client_ip: client_ip || req.ip,
        user_agent: user_agent || req.headers['user-agent'],
        result: 'INVALID',
        details: { reason: 'Decryption/parsing failed', error: err.message }
      }).catch(e => console.error('Failed to create validation record:', e));

      return res.status(400).json({
        success: false,
        message: 'Invalid license key or wrong secret'
      });
    }

    // 2. Validate decrypted data structure
    const validationErrors = validateLicenseData(decryptedData);
    if (validationErrors.length > 0) {
      await LicenseValidation.create({
        license_id: 0,
        client_ip: client_ip || req.ip,
        user_agent: user_agent || req.headers['user-agent'],
        result: 'INVALID',
        details: { errors: validationErrors }
      }).catch(() => {});

      return res.status(400).json({
        success: false,
        message: 'License data validation failed',
        errors: validationErrors
      });
    }

    // 3. Find license in database
    const license = await License.findOne({
      where: { encrypted_key: license_key }
    });

    if (!license) {
      await LicenseValidation.create({
        license_id: 0,
        client_ip: client_ip || req.ip,
        user_agent: user_agent || req.headers['user-agent'],
        result: 'NOT_FOUND',
        details: { decryptedData }
      }).catch(() => {});

      return res.status(404).json({
        success: false,
        message: 'License not found in database',
        decryptedData,
        note: 'License is valid but not registered in system'
      });
    }

    licenseId = license.id;

    // 4. Check expiration
    const expiryDate = new Date(license.expires);
    const now = new Date();

    if (expiryDate <= now) {
      const daysExpired = Math.ceil((now - expiryDate) / (1000 * 60 * 60 * 24));
      await LicenseValidation.create({
        license_id: licenseId,
        client_ip: client_ip || req.ip,
        user_agent: user_agent || req.headers['user-agent'],
        result: 'EXPIRED',
        details: { expires: license.expires, daysExpired, isUsed: license.is_used }
      }).catch(() => {});

      return res.status(410).json({
        success: false,
        message: 'License has expired',
        expires: license.expires,
        daysExpired
      });
    }

    // 5. If license is already used, we still consider it valid (for login)
    if (license.is_used) {
      alreadyActivated = true;
      console.log('⚠️ License already activated (used)');
    } else {
      // Activate the license (set is_used = true)
      await license.update({
        is_used: true,
        used_at: now,
        client_ip: client_ip || null,
        client_info: client_info ? JSON.stringify(client_info) : null,
        updated_at: now
      });
      activationPerformed = true;
      console.log('✅ License activated successfully');
    }

    // 6. Record validation attempt (SUCCESS)
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    await LicenseValidation.create({
      license_id: licenseId,
      client_ip: client_ip || req.ip,
      user_agent: user_agent || req.headers['user-agent'],
      result: 'SUCCESS',
      details: {
        status: alreadyActivated ? 'ALREADY_ACTIVATED' : 'ACTIVATED',
        expires: license.expires,
        daysRemaining,
        maxUsers: license.max_users,
        maxBranches: license.max_branches,
        activationPerformed
      }
    }).catch(() => {});

    // 7. Return success response
    return res.status(200).json({
      success: true,
      message: alreadyActivated ? 'License already activated' : 'License validated and activated successfully',
      alreadyActivated,
      activated: !alreadyActivated,
      data: {
        licenseId: license.id,
        issuedTo: license.issued_to,
        licenseType: license.license_type,
        expires: license.expires,
        daysRemaining,
        maxUsers: license.max_users,
        maxBranches: license.max_branches,
        features: license.features
          ? (typeof license.features === 'string' ? JSON.parse(license.features) : license.features)
          : {},
        isUsed: license.is_used,
        usedAt: license.used_at,
        createdAt: license.created_at
      }
    });

  } catch (error) {
    console.error('❌ License validation error:', error);

    // Record the error in validation table
    try {
      await LicenseValidation.create({
        license_id: 0,
        client_ip: req.ip,
        user_agent: req.headers['user-agent'],
        result: 'ERROR',
        details: { error: error.message, stack: error.stack }
      });
    } catch (e) {
      console.error('Failed to create error validation record:', e);
    }

    return res.status(500).json({
      success: false,
      message: 'Error validating license',
      error: error.message
    });
  }
};


// ✅ Activate license
export const activateLicense = async (req, res) => {
  try {
    const { license_key, client_ip, user_agent, client_info } = req.body;
    
    if (!license_key) {
      return res.status(400).json({
        success: false,
        message: 'License key is required'
      });
    }
    
    console.log('🔐 Attempting to activate license...');
    
    // Find license in database
    const license = await License.findOne({
      where: { encrypted_key: license_key }
    });
    
    if (!license) {
      console.log('❌ License not found');
      return res.status(404).json({
        success: false,
        message: 'License not found in database'
      });
    }
    
    console.log('✅ Found license:', {
      id: license.id,
      issuedTo: license.issued_to,
      isUsed: license.is_used,
      expires: license.expires
    });
    
    // Check if already used
    if (license.is_used) {
      console.log('⚠️ License already activated');
      
      // Create validation record for already activated license
      try {
        await LicenseValidation.create({
          license_id: license.id,
          client_ip: client_ip || req.ip || 'unknown',
          client_info: JSON.stringify({
            user_agent: user_agent || req.headers['user-agent'],
            action: 'activation_attempt',
            status: 'already_activated',
            timestamp: new Date().toISOString(),
            ...(client_info || {})
          })
        });
        console.log('📝 Created validation record for already activated license');
      } catch (valErr) {
        console.error('Failed to create validation record:', valErr.message);
      }
      
      return res.status(409).json({
        success: false,
        message: 'License already activated',
        activatedAt: license.used_at,
        licenseId: license.id
      });
    }
    
    // Check if expired
    const now = new Date();
    const expiryDate = new Date(license.expires);
    
    if (expiryDate <= now) {
      console.log('⚠️ License expired');
      
      // Create validation record for expired license
      try {
        await LicenseValidation.create({
          license_id: license.id,
          client_ip: client_ip || req.ip || 'unknown',
          client_info: JSON.stringify({
            user_agent: user_agent || req.headers['user-agent'],
            action: 'activation_attempt',
            status: 'expired',
            expires: license.expires,
            timestamp: new Date().toISOString(),
            ...(client_info || {})
          })
        });
        console.log('📝 Created validation record for expired license');
      } catch (valErr) {
        console.error('Failed to create validation record:', valErr.message);
      }
      
      return res.status(410).json({
        success: false,
        message: 'License has expired',
        expires: license.expires
      });
    }
    
    // Activate the license
    await license.update({
      is_used: true,
      used_at: now,
      client_ip: client_ip || null,
      client_info: client_info ? JSON.stringify(client_info) : null,
      updated_at: now
    });
    
    console.log('✅ License activated successfully');
    
    // ✅ CREATE VALIDATION RECORD
    let validationRecordId = null;
    let validationError = null;
    
    try {
      console.log('📝 Creating validation record...');
      
      const validationRecord = await LicenseValidation.create({
        license_id: license.id,
        client_ip: client_ip || req.ip || 'unknown',
        client_info: JSON.stringify({
          user_agent: user_agent || req.headers['user-agent'],
          action: 'activation',
          status: 'activated',
          activated_at: now.toISOString(),
          expires: license.expires,
          max_users: license.max_users,
          max_branches: license.max_branches,
          features: license.features ? 
            (typeof license.features === 'string' 
              ? JSON.parse(license.features) 
              : license.features) 
            : {},
          ...(client_info || {})
        })
      });
      
      validationRecordId = validationRecord.id;
      console.log('✅ Validation record created with ID:', validationRecordId);
      
    } catch (validationErr) {
      console.error('❌ Failed to create validation record:', validationErr.message);
      console.error('Validation error stack:', validationErr.stack);
      validationError = validationErr.message;
    }
    
    return res.status(200).json({
      success: true,
      message: 'License activated successfully',
      data: {
        licenseId: license.id,
        issuedTo: license.issued_to,
        licenseType: license.license_type,
        expires: license.expires,
        activatedAt: now,
        maxUsers: license.max_users,
        maxBranches: license.max_branches,
        features: license.features ? 
          (typeof license.features === 'string' 
            ? JSON.parse(license.features) 
            : license.features) 
          : {},
        validationRecorded: !!validationRecordId,
        validationRecordId: validationRecordId,
        validationError: validationError
      }
    });
    
  } catch (error) {
    console.error('❌ License activation error:', error.message);
    console.error('Error stack:', error.stack);
    
    // Try to create validation record even for errors
    try {
      await LicenseValidation.create({
        license_id: 0, // 0 indicates unknown license
        client_ip: req.ip || 'unknown',
        client_info: JSON.stringify({
          user_agent: req.headers['user-agent'],
          action: 'activation_error',
          error: error.message,
          timestamp: new Date().toISOString()
        })
      });
    } catch (valErr) {
      console.error('Also failed to create error validation record:', valErr.message);
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error activating license',
      error: error.message
    });
  }
};


// ✅ Generate license and return downloadable .txt
// ✅ Generate license and return downloadable .txt
export const generateLicense = async (req, res) => {
  try {
    console.log('📝 License generation request received');
    
    // Database connection check
    console.log('Database connection test...');
    try {
      const { sequelize } = License.sequelize || {};
      if (sequelize) {
        await sequelize.authenticate();
        console.log('✅ Database connection OK');
      }
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
      return res.status(500).json({
        message: 'Database connection failed',
        error: dbError.message
      });
    }

    const { expires, issued_to, license_type, max_users, max_branches, features } = req.body;
    
    console.log('Request data:', { expires, issued_to, license_type, max_users, max_branches });

    // Validate required fields
    if (!expires || !issued_to || !license_type) {
      return res.status(400).json({ 
        message: 'All fields are required',
        required_fields: ['expires', 'issued_to', 'license_type']
      });
    }

    // Basic validation
    const validationErrors = [];
    
    // Validate expiration date is in the future
    const expiryDate = new Date(expires);
    const now = new Date();
    if (expiryDate <= now) {
      validationErrors.push('Expiration date must be in the future');
    }
    
    // Validate license type
    const validLicenseTypes = ['TRIAL', 'STANDARD', 'ENTERPRISE', 'CUSTOM'];
    if (!validLicenseTypes.includes(license_type.toUpperCase())) {
      validationErrors.push(`License type must be one of: ${validLicenseTypes.join(', ')}`);
    }
    
    // Validate max_users if provided
    if (max_users !== undefined && (typeof max_users !== 'number' || max_users < 1)) {
      validationErrors.push('max_users must be a positive number');
    }
    
    // Validate max_branches if provided
    if (max_branches !== undefined && (typeof max_branches !== 'number' || max_branches < 0)) {
      validationErrors.push('max_branches must be a non-negative number');
    }
    
    // If there are validation errors, return them
    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: validationErrors
      });
    }

    // Prepare license data
    const licenseData = { 
      expires: new Date(expires), 
      issued_to: issued_to.trim(), 
      license_type: license_type.toUpperCase().trim(),
      max_users: max_users || null,
      max_branches: max_branches || null,
      features: features || {}
    };

    console.log('License data prepared:', licenseData);

    // Get secret from environment
    const secret = process.env.LICENSE_SECRET || 'default-secret-key-change-me';
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

    console.log('License encrypted, length:', encrypted.length);

    // Create ONLY the fields that definitely exist in your database
    const createData = {
      issued_to: licenseData.issued_to,
      license_type: licenseData.license_type,
      expires: licenseData.expires,
      encrypted_key: encrypted,
      is_used: false
    };
    
    // Only add optional fields if they have values
    if (licenseData.max_users !== null && licenseData.max_users !== undefined) {
      createData.max_users = licenseData.max_users;
    }
    
    if (licenseData.max_branches !== null && licenseData.max_branches !== undefined) {
      createData.max_branches = licenseData.max_branches;
    }
    
    if (licenseData.features && Object.keys(licenseData.features).length > 0) {
      // Stringify features if it's an object
      createData.features = typeof licenseData.features === 'string' 
        ? licenseData.features 
        : JSON.stringify(licenseData.features);
    }

    console.log('Creating license with data:', createData);

    // Save to database
    const license = await License.create(createData);

    console.log('✅ License saved to database with ID:', license.id);

    // Set response headers for file download
    res.setHeader('Content-Disposition', 'attachment; filename=license.txt');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('X-License-ID', license.id);
    res.setHeader('X-License-Type', license.license_type);
    res.setHeader('X-Expires', license.expires.toISOString());
    
    // Return the encrypted license key
    res.status(200).send(encrypted);
    
  } catch (error) {
    console.error('❌ License generation error:', error.message);
    console.error('Error details:', error);
    
    // Handle specific Sequelize errors
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        message: 'License with this key already exists',
        error: 'Duplicate license key'
      });
    }
    
    // Handle validation errors
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        message: 'Validation error',
        error: error.errors.map(e => e.message).join(', ')
      });
    }
    
    // Provide more detailed error information for database errors
    let errorMessage = error.message;
    let errorDetails = {};
    
    if (error.name === 'SequelizeDatabaseError') {
      errorMessage = 'Database error occurred';
      if (error.parent && error.parent.sqlMessage) {
        errorDetails.sqlMessage = error.parent.sqlMessage;
        errorDetails.sql = error.parent.sql;
      }
      
      // Check if it's a missing column error
      if (error.message && error.message.includes('Unknown column')) {
        errorDetails.suggestion = 'A column in your License model does not exist in the database. Check your database schema.';
      }
    }
    
    res.status(500).json({
      message: 'Error generating license',
      error: errorMessage,
      details: errorDetails,
      suggestion: 'Check your database schema and ensure all columns in the License model exist in the licenses table'
    });
  }
};

// ✅ Get license status
export const getLicenseStatusPost = async (req, res) => {
  try {
    const { license_key } = req.body;
    
    if (!license_key) {
      return res.status(400).json({
        success: false,
        message: 'License key is required'
      });
    }
    
    // Use the same logic as getLicenseStatus
    const license = await License.findOne({
      where: { encrypted_key: license_key }
    });
    
    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found'
      });
    }
    
    const now = new Date();
    const expiryDate = new Date(license.expires);
    const isExpired = expiryDate <= now;
    const daysRemaining = isExpired ? 0 : Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    
    return res.status(200).json({
      success: true,
      data: {
        id: license.id,
        issuedTo: license.issued_to,
        licenseType: license.license_type,
        expires: license.expires,
        isExpired: isExpired,
        daysRemaining: daysRemaining,
        isUsed: license.is_used,
        usedAt: license.used_at,
        maxUsers: license.max_users,
        maxBranches: license.max_branches,
        features: license.features ? 
          (typeof license.features === 'string' 
            ? JSON.parse(license.features) 
            : license.features) 
          : {},
        createdAt: license.created_at,
        updatedAt: license.updated_at,
        status: isExpired ? 'EXPIRED' : (license.is_used ? 'ACTIVATED' : 'VALID')
      }
    });
    
  } catch (error) {
    console.error('License status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting license status',
      error: error.message
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
  let licenseRecord = null;
  
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
      // Log failed validation attempt
      await logValidationAttempt(null, clientIp, req.headers['user-agent'], 'INVALID');
      
      return res.status(401).json({ 
        message: 'Failed to decrypt license',
        error: 'Invalid encryption or secret key'
      });
    }

    if (!decryptedData) {
      // Log failed validation attempt
      await logValidationAttempt(null, clientIp, req.headers['user-agent'], 'INVALID');
      
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
      await logValidationAttempt(null, clientIp, req.headers['user-agent'], 'INVALID');
      
      return res.status(400).json({ 
        message: 'Failed to parse license data',
        error: 'Invalid JSON format in license'
      });
    }

    // Validate required fields
    const requiredFields = ['expires', 'issued_to', 'license_type'];
    const missingFields = requiredFields.filter(field => !licenseData[field]);
    if (missingFields.length > 0) {
      await logValidationAttempt(null, clientIp, req.headers['user-agent'], 'INVALID');
      
      return res.status(400).json({ 
        message: 'Invalid license format',
        missingFields
      });
    }

    // Check expiration
    const now = new Date();
    const expiryDate = new Date(licenseData.expires);

    if (isNaN(expiryDate.getTime())) {
      await logValidationAttempt(null, clientIp, req.headers['user-agent'], 'INVALID');
      
      return res.status(400).json({ 
        message: 'Invalid expiration date in license'
      });
    }

    if (now > expiryDate) {
      // Log expired validation attempt
      await logValidationAttempt(null, clientIp, req.headers['user-agent'], 'EXPIRED');
      
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
    licenseRecord = await License.findOne({ 
      where: { encrypted_key: encrypted_key }
    });

    // Save license to file system
    try {
      ensureLicenseDirectory();
      fs.writeFileSync(LICENSE_FILE_PATH, encrypted_key, 'utf8');
    } catch (fileError) {
      console.error('Failed to write license file:', fileError);
      // Don't fail the request if file writing fails, just log it
    }

    // Update or create license record using Sequelize
    if (licenseRecord) {
      // Update existing license
      await licenseRecord.update({
        ...licenseData,
        is_used: true,
        used_at: new Date(),
        last_validated: new Date(),
        validation_count: (licenseRecord.validation_count || 0) + 1,
        client_ip: clientIp
      });
    } else {
      // Create new license record
      licenseRecord = await License.create({
        ...licenseData,
        encrypted_key: encrypted_key,
        is_used: true,
        used_at: new Date(),
        last_validated: new Date(),
        validation_count: 1,
        client_ip: clientIp,
        created_at: new Date()
      });
    }

    // Log successful validation
    await logValidationAttempt(licenseRecord.id, clientIp, req.headers['user-agent'], 'SUCCESS');

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
        license_id: licenseRecord.id,
        rateLimit: {
          attempts: rateLimit.attempts,
          remaining: 10 - rateLimit.attempts
        },
        validation_count: licenseRecord.validation_count
      }
    });
    
  } catch (error) {
    console.error('License validation error:', error);
    
    // Log error validation attempt
    if (licenseRecord) {
      await logValidationAttempt(licenseRecord.id, clientIp, req.headers['user-agent'], 'INVALID');
    }
    
    return res.status(500).json({
      message: 'Failed to validate license',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// ✅ Helper function to log validation attempts (optional)
const logValidationAttempt = async (licenseId, clientIp, userAgent, result) => {
  try {
    if (LicenseValidation) {
      await LicenseValidation.create({
        license_id: licenseId,
        client_ip: clientIp,
        user_agent: userAgent,
        result: result,
        validated_at: new Date(),
        details: JSON.stringify({ timestamp: new Date().toISOString() })
      });
    }
  } catch (error) {
    console.error('Failed to log validation attempt:', error);
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
    const license = await License.findOne({ 
      where: { encrypted_key: encryptedKey }
    });

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
        id: license.id,
        issued_to: license.issued_to,
        license_type: license.license_type,
        expires: license.expires,
        created_at: license.created_at,
        is_used: license.is_used,
        used_at: license.used_at,
        last_validated: license.last_validated,
        validation_count: license.validation_count
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
    const dbLicense = await License.findOne({ 
      where: { encrypted_key: encrypted_key }
    });
    
    res.json({
      message: 'License found on server',
      exists: true,
      valid: !!dbLicense,
      license: dbLicense ? {
        id: dbLicense.id,
        issued_to: dbLicense.issued_to,
        expires: dbLicense.expires,
        is_used: dbLicense.is_used,
        daysRemaining: dbLicense.daysRemaining()
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


// ✅ Delete license (admin only)
export const deleteLicense = async (req, res) => {
  try {
    const { id } = req.params;

    const license = await License.findByPk(id);
    
    if (!license) {
      return res.status(404).json({
        message: 'License not found'
      });
    }

    // Delete license file if it matches this license
    try {
      const fileContent = fs.readFileSync(LICENSE_FILE_PATH, 'utf8').trim();
      if (fileContent === license.encrypted_key) {
        fs.unlinkSync(LICENSE_FILE_PATH);
        console.log('Deleted license file');
      }
    } catch (fileError) {
      // File might not exist, ignore error
    }

    await license.destroy();

    res.json({
      success: true,
      message: 'License deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting license:', error);
    res.status(500).json({
      message: 'Error deleting license',
      error: error.message
    });
  }
};

// ✅ Renew license (extend expiry date)
// export const renewLicense = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { newExpiryDate } = req.body;

//     if (!newExpiryDate) {
//       return res.status(400).json({
//         message: 'New expiry date is required'
//       });
//     }

//     const expiryDate = new Date(newExpiryDate);
//     if (isNaN(expiryDate.getTime()) || expiryDate <= new Date()) {
//       return res.status(400).json({
//         message: 'New expiry date must be a valid future date'
//       });
//     }

//     const license = await License.findByPk(id);
    
//     if (!license) {
//       return res.status(404).json({
//         message: 'License not found'
//       });
//     }

//     // Update the license with new expiry
//     await license.update({
//       expires: expiryDate,
//       updated_at: new Date()
//     });

//     // Regenerate the encrypted key with new expiry date
//     const secret = process.env.LICENSE_SECRET;
//     if (secret) {
//       const licenseData = {
//         expires: expiryDate.toISOString(),
//         issued_to: license.issued_to,
//         license_type: license.license_type
//       };

//       const encrypted = CryptoJS.AES.encrypt(
//         JSON.stringify(licenseData), 
//         secret
//       ).toString();

//       // Update encrypted key
//       await license.update({ encrypted_key: encrypted });

//       // Update license file if it exists
//       try {
//         if (fs.existsSync(LICENSE_FILE_PATH)) {
//           const fileContent = fs.readFileSync(LICENSE_FILE_PATH, 'utf8').trim();
//           if (fileContent === license.encrypted_key) {
//             fs.writeFileSync(LICENSE_FILE_PATH, encrypted, 'utf8');
//           }
//         }
//       } catch (fileError) {
//         console.error('Failed to update license file:', fileError);
//       }
//     }

//     res.json({
//       success: true,
//       message: 'License renewed successfully',
//       license: {
//         id: license.id,
//         issued_to: license.issued_to,
//         license_type: license.license_type,
//         expires: license.expires,
//         previous_expiry: req.body.previousExpiry
//       }
//     });
//   } catch (error) {
//     console.error('Error renewing license:', error);
//     res.status(500).json({
//       message: 'Error renewing license',
//       error: error.message
//     });
//   }
// };

export const validateForLogin = async (req, res) => {
  try {
    const { license_key } = req.body;
    
    if (!license_key) {
      return res.status(400).json({
        success: false,
        message: 'License key is required'
      });
    }

    // Find license in database
    const license = await License.findOne({
      where: { encrypted_key: license_key }
    });

    if (!license) {
      console.log('❌ License not found in database');
      
      return res.status(404).json({
        success: false,
        message: 'License not found in database',
        code: 'LICENSE_NOT_FOUND'
      });
    }
    
    // ... rest of your logic
    
    res.status(200).json({
      success: true,
      message: 'Valid for login'
    });
    
  } catch (error) {
    console.error('❌ License validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error validating license',
      error: error.message,
      code: 'VALIDATION_ERROR'
    });
  }
};

export const renewLicense = async (req, res) => {
  try {
    const { id } = req.params;
    const { newExpiryDate, previousExpiry, reason, renewedBy, notes } = req.body;

    if (!newExpiryDate) {
      return res.status(400).json({
        success: false,
        message: 'New expiry date is required'
      });
    }

    const expiryDate = new Date(newExpiryDate);
    const now = new Date();
    
    if (isNaN(expiryDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format'
      });
    }
    
    if (expiryDate <= now) {
      return res.status(400).json({
        success: false,
        message: 'New expiry date must be in the future'
      });
    }

    // Find the license
    const license = await License.findByPk(id);
    
    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'License not found'
      });
    }

    // Store old values for response
    const oldExpiry = license.expires;
    const oldEncryptedKey = license.encrypted_key;

    // Get secret from environment
    const secret = process.env.LICENSE_SECRET || 'default-secret-key-change-me';
    if (!secret) {
      return res.status(500).json({
        success: false,
        message: 'License secret not configured'
      });
    }

    // Prepare updated license data for encryption
    const licenseData = {
      expires: expiryDate.toISOString(),
      issued_to: license.issued_to,
      license_type: license.license_type,
      max_users: license.max_users,
      max_branches: license.max_branches,
      features: license.features ? 
        (typeof license.features === 'string' 
          ? JSON.parse(license.features) 
          : license.features) 
        : {}
    };

    // Generate new encrypted key
    const newEncryptedKey = CryptoJS.AES.encrypt(
      JSON.stringify(licenseData), 
      secret
    ).toString();

    console.log('🔄 Regenerating license key for renewal:', {
      licenseId: license.id,
      issuedTo: license.issued_to,
      oldExpiry: oldExpiry,
      newExpiry: expiryDate,
      oldKeyLength: oldEncryptedKey?.length,
      newKeyLength: newEncryptedKey.length
    });

    // Update the license with new expiry and new encrypted key
    await license.update({
      expires: expiryDate,
      encrypted_key: newEncryptedKey,
      updated_at: new Date()
    });

    // Log the renewal activity (optional)
    if (reason || renewedBy || notes) {
      console.log('📝 Renewal details:', {
        licenseId: license.id,
        renewedBy: renewedBy,
        reason: reason,
        notes: notes,
        timestamp: new Date().toISOString()
      });
    }

    // Return success response with BOTH old and new keys
    res.status(200).json({
      success: true,
      message: 'License renewed successfully. New encrypted key generated.',
      data: {
        license: {
          id: license.id,
          issued_to: license.issued_to,
          license_type: license.license_type,
          expires: license.expires,
          previous_expiry: previousExpiry || oldExpiry,
          is_used: license.is_used,
          used_at: license.used_at,
          max_users: license.max_users,
          max_branches: license.max_branches,
          features: license.features ? 
            (typeof license.features === 'string' 
              ? JSON.parse(license.features) 
              : license.features) 
            : {}
        },
        keys: {
          old_encrypted_key: oldEncryptedKey,
          new_encrypted_key: newEncryptedKey,
          note: 'Use the new_encrypted_key for validation and activation'
        },
        renewalDetails: {
          reason: reason,
          renewedBy: renewedBy,
          renewalDate: new Date().toISOString()
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error renewing license:', error);
    res.status(500).json({
      success: false,
      message: 'Error renewing license',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// controllers/licenseController.js - Add this function
export const getLicenseUsageDashboard = async (req, res) => {
  try {
    const license = await licenseCheckHelpers.getActiveLicense();
    
    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'No active license found'
      });
    }

    // Get active users count from User model
    const activeUsersCount = await User.count({
      where: { status: 'Active' }
    });

    // Get today's login count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayLogins = await User.count({
      where: {
        last_login: {
          [Op.gte]: today
        }
      }
    });

    // Get active sessions count
    const activeSessions = license.current_session_count || 0;

    res.json({
      success: true,
      license: {
        issued_to: license.issued_to,
        license_type: license.license_type,
        expires: license.expires,
        days_remaining: Math.max(0, Math.floor((new Date(license.expires) - new Date()) / (1000 * 60 * 60 * 24)))
      },
      usage: {
        users: {
          current: activeUsersCount,
          max: license.max_users || 'Unlimited',
          remaining: license.max_users ? license.max_users - activeUsersCount : 'Unlimited',
          percentage: license.max_users ? Math.round((activeUsersCount / license.max_users) * 100) : 0
        },
        sessions: {
          current: activeSessions,
          max: license.max_concurrent_sessions || 100,
          remaining: (license.max_concurrent_sessions || 100) - activeSessions,
          percentage: Math.round((activeSessions / (license.max_concurrent_sessions || 100)) * 100)
        },
        daily_activity: {
          logins_today: todayLogins
        }
      },
      features: license.features || {},
      limits: {
        max_users: license.max_users,
        max_branches: license.max_branches,
        max_concurrent_sessions: license.max_concurrent_sessions || 100
      }
    });

  } catch (error) {
    console.error('Error getting license dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting license usage',
      error: error.message
    });
  }
};


// Add this to your licenseController.js
export const debugValidation = async (req, res) => {
  try {
    console.log('=== DEBUG VALIDATION MODEL ===');
    
    // Test 1: Check if model is imported correctly
    console.log('1. LicenseValidation model exists?', !!LicenseValidation);
    console.log('2. LicenseValidation table name:', LicenseValidation.tableName);
    
    // Test 2: Try to create a test record
    console.log('3. Attempting to create test record...');
    const testData = {
      license_id: 999, // Test ID
      client_ip: '127.0.0.1',
      client_info: JSON.stringify({ test: true, timestamp: new Date().toISOString() })
    };
    
    console.log('4. Test data:', testData);
    
    const testRecord = await LicenseValidation.create(testData);
    console.log('5. ✅ Test record created with ID:', testRecord.id);
    
    // Test 3: Count records
    const count = await LicenseValidation.count();
    console.log('6. Total validation records:', count);
    
    // Test 4: List recent records
    const recent = await LicenseValidation.findAll({
      limit: 5,
      order: [['validation_date', 'DESC']]
    });
    
    console.log('7. Recent records:', recent.map(r => ({
      id: r.id,
      license_id: r.license_id,
      validation_date: r.validation_date,
      client_ip: r.client_ip
    })));
    
    res.status(200).json({
      success: true,
      message: 'Debug test completed',
      testRecordId: testRecord.id,
      totalRecords: count,
      recentRecords: recent
    });
    
  } catch (error) {
    console.error('❌ DEBUG TEST FAILED:', error.message);
    console.error('Error details:', error);
    console.error('Error stack:', error.stack);
    
    // Check if it's a database error
    if (error.name === 'SequelizeDatabaseError') {
      console.error('Database error:', error.parent?.sqlMessage);
      console.error('SQL:', error.parent?.sql);
    }
    
    res.status(500).json({
      success: false,
      message: 'Debug test failed',
      error: error.message,
      sqlMessage: error.parent?.sqlMessage,
      sql: error.parent?.sql
    });
  }
};

// ✅ Check if license exists in database (with or without file)
export const checkLicenseInDatabase = async (req, res) => {
  try {
    const { licenseKey, organizationId, customerId } = req.query;
    
    let whereCondition = {};
    
    // Build where condition based on provided parameters
    if (licenseKey) {
      whereCondition.license_key = licenseKey;
    }
    
    if (organizationId) {
      whereCondition.organization_id = organizationId;
    }
    
    if (customerId) {
      whereCondition.customer_id = customerId;
    }
    
    // If no specific criteria provided, get the most recent active license
    if (Object.keys(whereCondition).length === 0) {
      whereCondition.is_active = true;
    }
    
    // Find license in database
    const license = await License.findOne({
      where: whereCondition,
      order: [['created_at', 'DESC']], // Get the most recent
      include: [
        {
          model: Organization,
          attributes: ['id', 'name', 'code', 'is_active']
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email', 'company_name']
        }
      ]
    });
    
    if (!license) {
      return res.status(404).json({
        success: false,
        message: 'No active license found in database',
        exists: false,
        criteria: whereCondition
      });
    }
    
    // Check if license is expired
    const isExpired = license.expires && new Date(license.expires) < new Date();
    const daysRemaining = license.expires ? 
      Math.ceil((new Date(license.expires) - new Date()) / (1000 * 60 * 60 * 24)) : 
      null;
    
    // Get license features/limits
    let features = {};
    let limits = {};
    
    try {
      if (license.features) {
        features = typeof license.features === 'string' ? 
          JSON.parse(license.features) : license.features;
      }
      
      if (license.limits) {
        limits = typeof license.limits === 'string' ? 
          JSON.parse(license.limits) : license.limits;
      }
    } catch (parseError) {
      console.warn('Error parsing license features/limits:', parseError);
    }
    
    // Check if license file exists on server (optional)
    let fileExists = false;
    let fileInfo = null;
    
    try {
      if (license.encrypted_key) {
        const licenseFilePath = path.join(LICENSE_DIR, `${license.license_key}.lic`);
        fileExists = fs.existsSync(licenseFilePath);
        
        if (fileExists) {
          const stats = fs.statSync(licenseFilePath);
          fileInfo = {
            path: licenseFilePath,
            size: stats.size,
            lastModified: stats.mtime,
            created: stats.birthtime
          };
        }
      }
    } catch (fileError) {
      console.warn('Error checking license file:', fileError);
    }
    
    // Get usage statistics
    const usageStats = await getLicenseUsageStats(license.id);
    
    res.json({
      success: true,
      message: 'License found in database',
      exists: true,
      license: {
        id: license.id,
        license_key: license.license_key,
        license_type: license.license_type,
        issued_to: license.issued_to,
        customer_id: license.customer_id,
        organization_id: license.organization_id,
        issued_at: license.issued_at,
        expires: license.expires,
        is_active: license.is_active,
        is_expired: isExpired,
        days_remaining: daysRemaining,
        max_users: license.max_users,
        max_branches: license.max_branches,
        max_products: license.max_products,
        features: features,
        limits: limits,
        encrypted_key: license.encrypted_key ? '***ENCRYPTED***' : null,
        created_at: license.created_at,
        updated_at: license.updated_at
      },
      organization: license.Organization,
      customer: license.Customer,
      file_info: {
        exists_on_server: fileExists,
        ...fileInfo
      },
      usage_statistics: usageStats,
      validation: {
        is_valid: license.is_active && !isExpired,
        checks: {
          is_active: license.is_active,
          is_expired: isExpired,
          has_organization: !!license.organization_id,
          has_features: Object.keys(features).length > 0,
          file_exists: fileExists
        }
      }
    });
    
  } catch (error) {
    console.error('Error checking license in database:', error);
    res.status(500).json({
      success: false,
      message: 'Error checking license in database',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Helper function to get license usage statistics
const getLicenseUsageStats = async (licenseId) => {
  try {
    // Get active users count
    const activeUsers = await User.count({
      where: {
        license_id: licenseId,
        is_active: true
      }
    });
    
    // Get branches count
    const branchesCount = await Branch.count({
      where: {
        license_id: licenseId,
        is_active: true
      }
    });
    
    // Get products count
    const productsCount = await Product.count({
      where: {
        license_id: licenseId,
        is_active: true
      }
    });
    
    // Get recent activities (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentActivities = await ActivityLog.count({
      where: {
        license_id: licenseId,
        created_at: {
          [Op.gte]: thirtyDaysAgo
        }
      }
    });
    
    return {
      active_users: activeUsers,
      branches: branchesCount,
      products: productsCount,
      recent_activities: recentActivities,
      last_30_days: recentActivities
    };
    
  } catch (error) {
    console.error('Error getting license usage stats:', error);
    return {
      active_users: 0,
      branches: 0,
      products: 0,
      recent_activities: 0,
      last_30_days: 0,
      error: 'Failed to fetch usage statistics'
    };
  }
};



// ✅ Get all licenses (admin only)
export const getAllLicenses = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      is_active, 
      license_type,
      organization_id 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    let whereCondition = {};
    
    if (is_active !== undefined) {
      whereCondition.is_active = is_active === 'true';
    }
    
    if (license_type) {
      whereCondition.license_type = license_type;
    }
    
    if (organization_id) {
      whereCondition.organization_id = organization_id;
    }
    
    const { count, rows: licenses } = await License.findAndCountAll({
      where: whereCondition,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Organization,
          attributes: ['id', 'name', 'code']
        },
        {
          model: Customer,
          attributes: ['id', 'name', 'email']
        }
      ]
    });
    
    // Format response
    const formattedLicenses = licenses.map(license => {
      const isExpired = license.expires && new Date(license.expires) < new Date();
      const daysRemaining = license.expires ? 
        Math.ceil((new Date(license.expires) - new Date()) / (1000 * 60 * 60 * 24)) : 
        null;
      
      return {
        id: license.id,
        license_key: license.license_key,
        license_type: license.license_type,
        issued_to: license.issued_to,
        organization: license.Organization,
        customer: license.Customer,
        issued_at: license.issued_at,
        expires: license.expires,
        is_active: license.is_active,
        is_expired: isExpired,
        days_remaining: daysRemaining,
        max_users: license.max_users,
        max_branches: license.max_branches,
        max_products: license.max_products,
        created_at: license.created_at,
        updated_at: license.updated_at
      };
    });
    
    res.json({
      success: true,
      message: 'Licenses retrieved successfully',
      data: formattedLicenses,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(count / limit)
      }
    });
    
  } catch (error) {
    console.error('Error getting all licenses:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving licenses',
      error: error.message
    });
  }
};