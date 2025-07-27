// scripts/generateLicense.js
import mongoose from 'mongoose';
import License from '../models/License.js'; // Adjust path based on your folder structure
import CryptoJS from 'crypto-js';

const main = async () => {
  await mongoose.connect('mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0'); // Use your actual DB URI

  const licenseData = {
    expires: '2025-12-31T23:59:59Z',
    issued_to: 'Client Name',
    license_type: 'Standard'
  };

  const secret = 'S0me$tr0ng!Encrypt10nK3y2025#';
  const encrypted = CryptoJS.AES.encrypt(JSON.stringify(licenseData), secret).toString();

  const license = new License({
    expires: licenseData.expires,
    issued_to: licenseData.issued_to,
    license_type: licenseData.license_type,
    encrypted_key: encrypted
  });

  await license.save();
  console.log('License saved to DB');
  mongoose.disconnect();
};

main().catch(err => console.error(err));
