// generateLicense.js
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import CryptoJS from 'crypto-js';
import License from './models/License.js';

dotenv.config();

const generateLicense = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const licenseData = {
      expires: '2025-12-31T23:59:59Z',
      issued_to: 'Client Name',
      license_type: 'Standard'
    };

    const secret = process.env.LICENSE_SECRET;
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(licenseData), secret).toString();

    const license = new License({
      expires: licenseData.expires,
      issued_to: licenseData.issued_to,
      license_type: licenseData.license_type,
      encrypted_key: encrypted
    });

    await license.save();
    console.log('✅ License saved to DB:\n', encrypted);
    mongoose.connection.close();
  } catch (err) {
    console.error('❌ License generation failed:', err);
    process.exit(1);
  }
};

generateLicense();
