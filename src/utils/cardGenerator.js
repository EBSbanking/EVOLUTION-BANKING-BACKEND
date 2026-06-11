// utils/cardGenerator.js
import { getModel, initializeModels } from '../models/index.js';

/**
 * Calculate Luhn checksum digit for a partial card number
 */
export function calculateLuhnChecksum(partialNumber) {
  let sum = 0;
  let shouldDouble = true;
  for (let i = partialNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(partialNumber.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  const checksum = (10 - (sum % 10)) % 10;
  return checksum.toString();
}

/**
 * Generate a sequential, Luhn-valid card number (PAN) using a database counter.
 * Falls back to random generation if the database fails.
 * @param {string} bin - Bank Identification Number (first 6 digits, e.g., '506099')
 * @param {number} length - Total card number length (default 16)
 * @param {object} transaction - Optional Sequelize transaction
 * @returns {Promise<string>} - Valid card number
 */
export async function generateCardNumber(bin = '506099', length = 16, transaction = null) {
  try {
    let CardCounter = getModel('CardCounter');
    if (!CardCounter) {
      // Try to initialize models if not already loaded
      await initializeModels();
      CardCounter = getModel('CardCounter');
      if (!CardCounter) throw new Error('CardCounter model still not loaded');
    }

    // Find or create counter for this BIN
    let [record] = await CardCounter.findOrCreate({
      where: { bin },
      defaults: { last_sequence: 0 },
      transaction
    });
    // Increment sequence atomically
    await record.increment('last_sequence', { transaction });
    await record.reload({ transaction });
    const sequence = record.last_sequence;

    const maxSeqDigits = length - bin.length - 1; // one digit for Luhn checksum
    const seqStr = sequence.toString().padStart(maxSeqDigits, '0');
    const partialPan = bin + seqStr;
    const checksum = calculateLuhnChecksum(partialPan);
    return partialPan + checksum;
  } catch (error) {
    console.error('Sequential PAN generation failed, using fallback:', error);
    return generateRandomCardNumber(bin, length);
  }
}

/**
 * Original random card number generator (fallback)
 * @param {string} bin - BIN
 * @param {number} length - Total length
 * @returns {string} - Random valid PAN
 */
export function generateRandomCardNumber(bin = '506099', length = 16) {
  if (!bin || bin.length < 6) throw new Error('BIN must be at least 6 digits');
  if (length < 8 || length > 19) throw new Error('Card length must be between 8 and 19');

  const binDigits = bin.substring(0, Math.min(bin.length, length - 1));
  const remainingLength = length - binDigits.length - 1;
  let randomDigits = '';
  for (let i = 0; i < remainingLength; i++) {
    randomDigits += Math.floor(Math.random() * 10).toString();
  }
  const partialNumber = binDigits + randomDigits;
  const checksum = calculateLuhnChecksum(partialNumber);
  return partialNumber + checksum;
}

/**
 * Validate a complete card number using Luhn algorithm
 * @param {string} cardNumber - Full card number to validate
 * @returns {boolean} - True if valid
 */
export function isValidCardNumber(cardNumber) {
  if (!cardNumber || !/^\d+$/.test(cardNumber)) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = cardNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cardNumber.charAt(i), 10);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

/**
 * Mask card number for display (e.g., "**** **** **** 1234")
 * @param {string} cardNumber - Full or partial card number
 * @param {number} showLast - Number of digits to show at the end (default 4)
 * @param {string} maskChar - Character to use for masking (default '*')
 * @returns {string} - Masked card number
 */
export function maskCardNumber(cardNumber, showLast = 4, maskChar = '*') {
  if (!cardNumber) return '';
  const str = cardNumber.replace(/\s/g, '');
  if (str.length <= showLast) return str;
  const maskedLength = str.length - showLast;
  const maskedPart = maskChar.repeat(Math.min(maskedLength, 16));
  const visiblePart = str.slice(-showLast);
  const fullMasked = maskedPart + visiblePart;
  const groups = fullMasked.match(/.{1,4}/g);
  return groups ? groups.join(' ') : fullMasked;
}

/**
 * Generate a random CVV (3 or 4 digits)
 * @param {number} digits - Number of digits (default 3)
 * @returns {string} - CVV as string
 */
export function generateCVV(digits = 3) {
  if (digits !== 3 && digits !== 4) throw new Error('CVV must be 3 or 4 digits');
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

/**
 * Generate expiry date (MM/YY format)
 * @param {number} yearsValid - Years from now (default 3)
 * @returns {Object} - { month, year, formatted }
 */
export function generateExpiryDate(yearsValid = 3) {
  const now = new Date();
  const expiryYear = now.getFullYear() + yearsValid;
  const expiryMonth = now.getMonth() + 1;
  return {
    month: expiryMonth.toString().padStart(2, '0'),
    year: expiryYear.toString(),
    formatted: `${expiryMonth.toString().padStart(2, '0')}/${expiryYear.toString().slice(-2)}`
  };
}

// Default export for backward compatibility
export default {
  generateCardNumber,
  generateRandomCardNumber,
  calculateLuhnChecksum,
  isValidCardNumber,
  maskCardNumber,
  generateCVV,
  generateExpiryDate
};