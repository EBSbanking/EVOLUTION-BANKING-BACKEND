// scripts/fix-card-cvv-standalone.js
import dotenv from 'dotenv';
dotenv.config();

import db from '../src/models/index.js';
import crypto from 'crypto';

const { DebitCard } = db;

// ======================================================
// Standalone encryption/decryption functions
// ======================================================

const ENCRYPTION_KEY = process.env.FLW_SANDBOX_DEV_ENCRYPTION_KEY || 
                       process.env.FLW_DEV_ENCRYPTION_KEY ||
                       process.env.FLW_ENCRYPTION_KEY;

function encryptCVVForStorage(cvv) {
    if (!cvv) return null;
    
    try {
        const key = Buffer.from(ENCRYPTION_KEY, "base64");
        
        if (key.length !== 32) {
            throw new Error(`Key must be 32 bytes (256 bits). Got ${key.length} bytes`);
        }

        // Generate random IV
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        
        // Encrypt the CVV
        let encrypted = cipher.update(cvv, 'utf8');
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        
        // Combine IV + encrypted data
        const result = Buffer.concat([iv, encrypted]);
        
        return result.toString('base64');
    } catch (error) {
        console.error('❌ CVV storage encryption error:', error.message);
        return null;
    }
}

function decryptStoredCVV(encryptedValue) {
    if (!encryptedValue) return null;
    
    try {
        const key = Buffer.from(ENCRYPTION_KEY, "base64");
        
        if (key.length !== 32) {
            throw new Error(`Key must be 32 bytes (256 bits). Got ${key.length} bytes`);
        }

        const encryptedBuffer = Buffer.from(encryptedValue, 'base64');
        
        if (encryptedBuffer.length < 16) {
            console.warn('⚠️ Encrypted data too short:', encryptedBuffer.length, 'bytes');
            return null;
        }

        // Extract IV (first 16 bytes)
        const iv = encryptedBuffer.slice(0, 16);
        const ciphertext = encryptedBuffer.slice(16);
        
        // Decrypt using AES-256-CBC
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(ciphertext);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        const result = decrypted.toString('utf8');
        
        if (result && /^\d{3,4}$/.test(result.trim())) {
            return result.trim();
        }
        return null;
    } catch (error) {
        console.error('❌ Stored CVV decryption error:', error.message);
        return null;
    }
}

// ======================================================
// Main function
// ======================================================

async function fixCardCVV() {
    try {
        console.log('\n========================================');
        console.log('🔧 Fix Card CVV Encryption');
        console.log('========================================\n');

        console.log('🔑 Using Encryption Key:', ENCRYPTION_KEY.substring(0, 20) + '...');
        console.log('');

        const cardId = 13;
        const testCVV = '123';

        // Get the card
        const card = await DebitCard.findByPk(cardId);
        if (!card) {
            console.log('❌ Card not found');
            return;
        }

        console.log('📋 Current Card Details:');
        console.log('  ID:', card.id);
        console.log('  Last4:', card.cardLast4);
        console.log('  Current Encrypted CVV:', card.encryptedCvv);
        console.log('  Current CVV Hash:', card.cvvHash);
        console.log('');

        // Encrypt CVV using AES-256-CBC
        console.log('🔐 Encrypting CVV with AES-256-CBC...');
        const encryptedCVV = encryptCVVForStorage(testCVV);
        
        if (!encryptedCVV) {
            console.log('❌ Encryption failed');
            return;
        }
        
        // Hash the CVV
        const cvvHash = crypto.createHash('sha256').update(testCVV).digest('hex');

        console.log('  Encrypted CVV:', encryptedCVV);
        console.log('  CVV Hash:', cvvHash);
        console.log('');

        // Verify decryption works
        console.log('🔍 Verifying decryption...');
        const decrypted = decryptStoredCVV(encryptedCVV);
        console.log('  Decrypted:', decrypted);
        console.log('  Match:', decrypted === testCVV ? '✅ YES!' : '❌ NO');
        console.log('');

        if (decrypted !== testCVV) {
            console.log('❌ Encryption/decryption test failed!');
            return;
        }

        // Update the card
        console.log('💾 Updating card...');
        await card.update({
            encryptedCvv: encryptedCVV,
            cvvHash: cvvHash
        });

        console.log('✅ Card updated successfully!');
        console.log('  New Encrypted CVV:', card.encryptedCvv);
        console.log('  New CVV Hash:', card.cvvHash);
        console.log('');

        // Final verification from database
        console.log('🔍 Final verification from database...');
        const updatedCard = await DebitCard.findByPk(cardId);
        const finalDecrypted = decryptStoredCVV(updatedCard.encryptedCvv);
        console.log('  Decrypted CVV:', finalDecrypted);
        console.log('  CVV matches:', finalDecrypted === testCVV ? '✅ YES!' : '❌ NO');

        console.log('\n========================================');
        console.log('✅ Card CVV fixed successfully!');
        console.log('  Card ID:', card.id);
        console.log('  Card Last4:', card.cardLast4);
        console.log('  CVV (test):', testCVV);
        console.log('  Encrypted CVV (new):', updatedCard.encryptedCvv);
        console.log('========================================\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await db.sequelize?.close();
    }
}

// Run the script
console.log('🚀 Starting CVV fix...\n');
fixCardCVV();