import CryptoJS from 'crypto-js';
import License from '../models/License.js';
import path from 'path';
import fs from 'fs'
import { fileURLToPath } from 'url'; // 1. IMPORT fileURLToPath

// --- Define replacements for __filename and __dirname ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Calculate the absolute path to the license file.
// The '../' moves up from 'backend' to 'app' directory,
// then down into 'frontend/build/license'.
const LICENSE_FILE_PATH = path.join(
  __dirname, 
  '..', // Move up from /backend/routes (or wherever script is) to /app
  'CORE_X_FRONTEND', 
  'build', 
  'license', 
  'license.txt'
);

// ✅ Generate license and return downloadable .txt
export const generateLicense = async (req, res) => {
  try {
    const { expires, issued_to, license_type } = req.body;

    if (!expires || !issued_to || !license_type) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const licenseData = { expires, issued_to, license_type };
    const secret = process.env.LICENSE_SECRET || 'your-secret-key';

    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(licenseData), secret).toString();

    const license = new License({
      ...licenseData,
      encrypted_key: encrypted
    });

    await license.save();

    res.setHeader('Content-Disposition', 'attachment; filename=license.txt');
    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(encrypted);
  } catch (error) {
    res.status(500).json({
      message: 'Error generating license',
      error: error.message
    });
  }
};

// ✅ Validate license
export const validateLicenseFile = async (req, res) => {
  try {
    let encrypted_key;

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

    const secret = process.env.LICENSE_SECRET || 'your-secret-key';
    const bytes = CryptoJS.AES.decrypt(encrypted_key, secret);
    const decryptedData = bytes.toString(CryptoJS.enc.Utf8);

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

    let licenseData;
    try {
      licenseData = JSON.parse(decryptedData);
    } catch (e) {
      return res.status(400).json({ 
        message: 'Failed to parse license data',
        error: e.message,
        decryptedData
      });
    }

    const requiredFields = ['expires', 'issued_to', 'license_type'];
    const missingFields = requiredFields.filter(field => !licenseData[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({ 
        message: 'Invalid license format',
        missingFields,
        receivedLicense: licenseData
      });
    }

    const now = new Date();
    const expiryDate = new Date(licenseData.expires);

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

    // Check if license exists and has been used
    const existing = await License.findOne({ encrypted_key });

    if (existing && existing.is_used) {
      return res.status(409).json({
        message: 'This license key has already been used. Please acquire a new license.',
        issued_to: existing.issued_to,
        used_at: existing.used_at
      });
    }

    // Save or update usage
    await License.updateOne(
      { encrypted_key },
      {
        $set: {
          ...licenseData,
          is_used: true,
          used_at: new Date(),
          created_at: existing?.created_at || new Date()
        }
      },
      { upsert: true }
    );
    fs.writeFileSync(LICENSE_FILE_PATH, encrypted_key, 'utf8');

    return res.status(200).json({
      message: 'License is valid',
      license: licenseData,
      encrypted_key,
      validity: {
        expires: licenseData.expires,
        daysRemaining: Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24))
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
    return res.status(400).json({ message: "Encrypted license key is required in body" });
  }

  try {
    const license = await License.findOne({ encrypted_key: encryptedKey });

    if (!license) {
      return res.status(404).json({ message: "License not found" });
    }

    const expiresIn = Math.ceil(
      (new Date(license.expires) - new Date()) / (1000 * 60 * 60 * 24)
    );

    res.json({
      license: {
        issued_to: license.issued_to,
        license_type: license.license_type,
        expires: license.expires,
        created_at: license.created_at,
        encrypted_key: license.encrypted_key,
        is_used: license.is_used,
        used_at: license.used_at
      },
      validity: {
        daysRemaining: Math.max(expiresIn, 0),
      },
    });
  } catch (err) {
    console.error("Error fetching license:", err);
    res.status(500).json({ message: "Server error" });
  }
};
