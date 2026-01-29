// test-encryptor.js
import crypto from 'crypto';
import axios from 'axios';

// Mock encryption function (adjust based on your actual encryption method)
function encryptPayload(payload, secretKey = 'your-secret-key') {
  const text = JSON.stringify(payload);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', 
    crypto.createHash('sha256').update(secretKey).digest(), 
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  
  return {
    encryptedData: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

// Test payload
const testPayload = {
  "ACCT_NO": "2973130168",
  "ACCT_NM": "Dera Tinah Tinah",
  "TRANSACTION_TYPE": "CR",
  "AMOUNT": 5000.00,
  "DESCRIPTION": "Cash Deposit by Self",
  "BUSINESS_UNIT": "103",
  "DEPOSITOR_NAME": "Mary Jane Obioma",
  "DRAWER_ID": "1",
  "CURRENCY_COUNT": {
    "OneThousandNaira": 5,
    "FiveHundredNaira": 0,
    "TwoHundredNaira": 0,
    "OneHundredNaira": 0,
    "FiftyNaira": 0,
    "TwentyNaira": 0,
    "TenNaira": 0,
    "FiveNaira": 0
  }
};

// Encrypt the payload
const encrypted = encryptPayload(testPayload);

// Send to your API
axios.post('http://localhost:5000/api/post-transactions/process-encrypted', encrypted)
  .then(response => {
    console.log('Success:', response.data);
  })
  .catch(error => {
    console.error('Error:', error.response?.data || error.message);
  });