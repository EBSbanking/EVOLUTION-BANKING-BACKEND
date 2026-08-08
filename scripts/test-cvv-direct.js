// scripts/test-encryption.js
import { encryptCVV, decryptCVV, checkEncryptionStatus } from '../utils/encryption.js';

console.log('🔐 Testing Encryption');
console.log('========================================\n');

// Check status
const status = checkEncryptionStatus();
console.log('📋 Encryption Status:', status);

// Encrypt
const cvv = '123';
console.log(`📋 CVV: ${cvv}`);

const result = encryptCVV(cvv);
if (result) {
  console.log(`✅ Encrypted: ${result.encrypted}`);
  console.log(`✅ Nonce: ${result.nonce}`);
  console.log(`✅ Method: ${result.method}`);
  
  // Decrypt
  const decrypted = decryptCVV(result.encrypted, result.nonce);
  console.log(`✅ Decrypted: ${decrypted}`);
  console.log(`✅ Match: ${cvv === decrypted ? 'YES! 🎉' : 'NO ❌'}`);
}

console.log('\n========================================\n');