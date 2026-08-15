// utils/cardGenerator.js
import { sequelize } from '../../config/db.js';
import { getModel, initializeModels } from '../models/index.js';
import binService from '../services/binService.js';

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
 * Calculate Luhn check digit for a card number (alternative implementation)
 */
function calculateLuhnCheckDigit(number) {
  let sum = 0;
  let alternate = true;
  
  // Iterate from right to left
  for (let i = number.length - 1; i >= 0; i--) {
    let digit = parseInt(number[i], 10);
    if (alternate) {
      digit *= 2;
      if (digit > 9) {
        digit = digit - 9;
      }
    }
    sum += digit;
    alternate = !alternate;
  }
  
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit.toString();
}

/**
 * Generate a sequential, Luhn-valid card number (PAN) using BIN mapping
 * @param {string} binInput - BIN prefix or scheme name (VERVE, VISA, etc.)
 * @param {number} length - Total card number length (default 16)
 * @param {object} transaction - Optional Sequelize transaction
 * @returns {Promise<string>} - Valid card number
 */
export async function generateCardNumber(binInput = 'VERVE', length = 16, transaction = null) {
  try {
    let bin = binInput;
    let binMapping = null;

    // Check if input is a scheme name
    const schemeBinMap = {
      'VERVE': '506099',
      'VISA': '4',
      'MASTERCARD': '5',
      'AMEX': '34',
      'DISCOVER': '6'
    };

    // If it's a scheme name, use scheme mapping
    if (schemeBinMap[binInput.toUpperCase()]) {
      bin = schemeBinMap[binInput.toUpperCase()];
      console.log(`🔁 Mapped scheme ${binInput} to BIN prefix: ${bin}`);
    }

    // Try to get BIN from database mapping
    try {
      const mapping = await binService.getBINMappingWithFallback(bin, transaction);
      if (mapping) {
        binMapping = mapping;
        // Use prepaid_bin if available and is_prepaid
        if (mapping.is_prepaid && mapping.prepaid_bin) {
          bin = mapping.prepaid_bin;
        } else if (mapping.bank_bin) {
          bin = mapping.bank_bin;
        } else {
          bin = mapping.bin;
        }
        console.log(`✅ Using BIN from mapping: ${bin} (${mapping.bank_name})`);
      }
    } catch (error) {
      console.warn('⚠️ Could not get BIN from mapping, using fallback:', error.message);
    }

    // Ensure BIN is at least 6 digits
    let paddedBin = bin;
    if (paddedBin.length < 6) {
      const randomDigits = Math.floor(Math.random() * Math.pow(10, 6 - paddedBin.length))
        .toString()
        .padStart(6 - paddedBin.length, '0');
      paddedBin = paddedBin + randomDigits;
    }
    paddedBin = paddedBin.slice(0, 6);

    console.log(`🔢 Using BIN: ${paddedBin} (original: ${binInput})`);

    let CardCounter = getModel('CardCounter');
    if (!CardCounter) {
      await initializeModels();
      CardCounter = getModel('CardCounter');
      if (!CardCounter) throw new Error('CardCounter model still not loaded');
    }

    let [record] = await CardCounter.findOrCreate({
      where: { bin: paddedBin },
      defaults: { last_sequence: 0 },
      transaction
    });
    await record.increment('last_sequence', { transaction });
    await record.reload({ transaction });
    const sequence = record.last_sequence;

    const maxSeqDigits = length - paddedBin.length - 1;
    const seqStr = sequence.toString().padStart(maxSeqDigits, '0');
    const partialPan = paddedBin + seqStr;
    const checksum = calculateLuhnChecksum(partialPan);
    const pan = partialPan + checksum;
    
    console.log(`✅ Generated card number: ${maskCardNumber(pan)}`);
    return pan;
  } catch (error) {
    console.error('Sequential PAN generation failed, using fallback:', error);
    return generateRandomCardNumber(binInput, length);
  }
}

/**
 * Generate a random card number (fallback) with BIN mapping
 */
export function generateRandomCardNumber(binInput = 'VERVE', length = 16) {
  const schemeBinMap = {
    'VERVE': '506099',
    'VISA': '4',
    'MASTERCARD': '5',
    'AMEX': '34',
    'DISCOVER': '6'
  };
  
  let bin = binInput;
  if (schemeBinMap[binInput.toUpperCase()]) {
    bin = schemeBinMap[binInput.toUpperCase()];
  }
  
  // Ensure BIN has at least 1 digit
  if (!bin || bin.length === 0) {
    bin = '506099';
  }
  
  // Pad to at least 6 digits
  let paddedBin = bin;
  if (paddedBin.length < 6) {
    const randomDigits = Math.floor(Math.random() * Math.pow(10, 6 - paddedBin.length))
      .toString()
      .padStart(6 - paddedBin.length, '0');
    paddedBin = paddedBin + randomDigits;
  }
  paddedBin = paddedBin.slice(0, 6);
  
  if (paddedBin.length < 6) {
    throw new Error('BIN must be at least 6 digits');
  }
  if (length < 8 || length > 19) {
    throw new Error('Card length must be between 8 and 19');
  }

  const remainingLength = length - paddedBin.length - 1;
  let randomDigits = '';
  for (let i = 0; i < remainingLength; i++) {
    randomDigits += Math.floor(Math.random() * 10).toString();
  }
  const partialNumber = paddedBin + randomDigits;
  const checksum = calculateLuhnChecksum(partialNumber);
  const pan = partialNumber + checksum;
  
  console.log(`⚠️ Generated fallback card number: ${maskCardNumber(pan)}`);
  return pan;
}

/**
 * Validate a complete card number using Luhn algorithm
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
 * Mask card number for display
 * @param {string} cardNumber - Card number to mask
 * @param {number} showLast - Number of digits to show (default 4)
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
 */
export function generateCVV(digits = 3) {
  if (digits !== 3 && digits !== 4) throw new Error('CVV must be 3 or 4 digits');
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
}

/**
 * Generate expiry date (MM/YY format)
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

// ================================================================
// ✅ FLUTTERWAVE-SPECIFIC CARD UTILITIES
// ================================================================

/**
 * Supported BINs for Flutterwave payments
 * These are common BINs that work well with Flutterwave
 */
export const FLUTTERWAVE_SUPPORTED_BINS = {
  VERVE: ['506099', '506103', '507878', '650000'],
  VISA: ['411111', '401288', '422222', '453201', '491748'],
  MASTERCARD: ['512345', '513456', '514567', '515678', '516789', '517890', '518901', '519012', '520123', '521234'],
  AMEX: ['340000', '370000'],
  DISCOVER: ['601100', '601111', '601120', '601140', '601170']
};

/**
 * Get a random supported BIN for a card scheme
 * @param {string} scheme - 'VERVE', 'VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'
 * @returns {string} - BIN for the scheme
 */
export function getRandomBINForScheme(scheme = 'VERVE') {
  const upperScheme = scheme.toUpperCase();
  const bins = FLUTTERWAVE_SUPPORTED_BINS[upperScheme] || FLUTTERWAVE_SUPPORTED_BINS.VERVE;
  return bins[Math.floor(Math.random() * bins.length)];
}

/**
 * Get the default BIN for a card scheme
 * @param {string} scheme - 'VERVE', 'VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'
 * @returns {string} - Default BIN for the scheme
 */
export function getDefaultBINForScheme(scheme = 'VERVE') {
  const schemeBinMap = {
    'VERVE': '506099',
    'VISA': '4',
    'MASTERCARD': '5',
    'AMEX': '34',
    'DISCOVER': '6'
  };
  return schemeBinMap[scheme.toUpperCase()] || '506099';
}

/**
 * Generate a card number specifically for Flutterwave payments
 * Uses supported BINs and ensures Luhn validity
 * @param {string} scheme - Card scheme (VERVE, VISA, MASTERCARD, AMEX, DISCOVER)
 * @param {number} length - Total card length (default 16)
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<Object>} - Card details including PAN, BIN, and scheme
 */
export async function generateFlutterwaveCardNumber(scheme = 'VERVE', length = 16, transaction = null) {
  const bin = getRandomBINForScheme(scheme);
  const pan = await generateCardNumber(bin, length, transaction);
  
  return {
    pan,
    bin,
    scheme: scheme.toUpperCase(),
    last4: pan.slice(-4),
    isValid: isValidCardNumber(pan)
  };
}

/**
 * Generate complete card details ready for Flutterwave
 * @param {string} scheme - Card scheme
 * @param {string} cardHolderName - Name on card
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<Object>} - Complete card details
 */
export async function generateFlutterwaveCardDetails(scheme = 'VERVE', cardHolderName = 'Card Holder', transaction = null) {
  const { pan, bin, scheme: cardScheme } = await generateFlutterwaveCardNumber(scheme, 16, transaction);
  const cvv = generateCVV(3);
  const expiry = generateExpiryDate(3);
  
  return {
    card_number: pan,
    cvv: cvv,
    expiry_month: expiry.month,
    expiry_year: expiry.year,
    card_holder_name: cardHolderName,
    bin: bin,
    last4: pan.slice(-4),
    scheme: cardScheme,
    expiry_formatted: expiry.formatted
  };
}

/**
 * Format card number for Flutterwave API (remove spaces)
 * @param {string} cardNumber - Card number with or without spaces
 * @returns {string} - Card number without spaces
 */
export function formatCardNumberForFlutterwave(cardNumber) {
  return cardNumber.replace(/\s/g, '');
}

/**
 * Validate card data for Flutterwave payment
 * @param {Object} cardData - Card data object
 * @param {string} cardData.card_number - Card PAN
 * @param {string} cardData.cvv - CVV
 * @param {string} cardData.expiry_month - Expiry month (MM)
 * @param {string} cardData.expiry_year - Expiry year (YYYY)
 * @returns {Object} - Validation result
 */
export function validateCardForFlutterwave(cardData) {
  const errors = [];
  
  // Validate card number
  if (!cardData.card_number) {
    errors.push('Card number is required');
  } else {
    const cleanNumber = formatCardNumberForFlutterwave(cardData.card_number);
    if (!/^\d+$/.test(cleanNumber)) {
      errors.push('Card number must contain only digits');
    } else if (cleanNumber.length < 15 || cleanNumber.length > 19) {
      errors.push('Card number must be between 15 and 19 digits');
    } else if (!isValidCardNumber(cleanNumber)) {
      errors.push('Invalid card number (Luhn check failed)');
    }
  }
  
  // Validate CVV
  if (!cardData.cvv) {
    errors.push('CVV is required');
  } else if (!/^\d{3,4}$/.test(cardData.cvv)) {
    errors.push('CVV must be 3 or 4 digits');
  }
  
  // Validate expiry
  if (!cardData.expiry_month) {
    errors.push('Expiry month is required');
  } else if (!/^(0[1-9]|1[0-2])$/.test(cardData.expiry_month)) {
    errors.push('Expiry month must be between 01 and 12');
  }
  
  if (!cardData.expiry_year) {
    errors.push('Expiry year is required');
  } else if (!/^\d{4}$/.test(cardData.expiry_year)) {
    errors.push('Expiry year must be 4 digits (e.g., 2028)');
  }
  
  // Check if card is expired
  if (cardData.expiry_month && cardData.expiry_year) {
    const now = new Date();
    const expiryDate = new Date(
      parseInt(cardData.expiry_year),
      parseInt(cardData.expiry_month) - 1,
      1
    );
    if (expiryDate < now) {
      errors.push('Card has expired');
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    cleanedData: {
      card_number: cardData.card_number ? formatCardNumberForFlutterwave(cardData.card_number) : null,
      cvv: cardData.cvv,
      expiry_month: cardData.expiry_month,
      expiry_year: cardData.expiry_year
    }
  };
}

// ================================================================
// ✅ BIN MAPPING UTILITIES
// ================================================================

/**
 * Extract BIN from card number (first 6 digits)
 * @param {string} cardNumber - Full card number
 * @returns {string} - First 6 digits (BIN)
 */
export function extractBINFromCardNumber(cardNumber) {
  if (!cardNumber) return null;
  const clean = cardNumber.replace(/\s/g, '');
  return clean.substring(0, 6);
}

/**
 * Get card scheme from BIN
 * @param {string} bin - BIN (first 6 digits)
 * @returns {string} - Card scheme (VERVE, VISA, MASTERCARD, AMEX, DISCOVER, UNKNOWN)
 */
export function getCardSchemeFromBIN(bin) {
  if (!bin) return 'UNKNOWN';
  const binStr = bin.toString().replace(/\s/g, '');
  
  // Check VERVE
  const vervePrefixes = ['506099', '506103', '507878', '650000'];
  if (vervePrefixes.some(prefix => binStr.startsWith(prefix))) {
    return 'VERVE';
  }
  
  // Check VISA
  if (binStr.startsWith('4')) {
    return 'VISA';
  }
  
  // Check MASTERCARD
  if (binStr.startsWith('5') && !binStr.startsWith('50')) {
    return 'MASTERCARD';
  }
  
  // Check AMEX
  if (binStr.startsWith('34') || binStr.startsWith('37')) {
    return 'AMEX';
  }
  
  // Check DISCOVER
  if (binStr.startsWith('6')) {
    return 'DISCOVER';
  }
  
  return 'UNKNOWN';
}

/**
 * Get bank name from BIN (using mapping)
 * @param {string} bin - BIN
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<string>} - Bank name
 */
export async function getBankNameFromBIN(bin, transaction = null) {
  try {
    const mapping = await binService.getBINMapping(bin, transaction);
    return mapping ? mapping.bank_name : null;
  } catch (error) {
    console.error('Error getting bank name from BIN:', error);
    return null;
  }
}

/**
 * Check if BIN is prepaid
 * @param {string} bin - BIN
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<boolean>} - True if prepaid
 */
export async function isPrepaidBIN(bin, transaction = null) {
  try {
    return await binService.isPrepaidBIN(bin, transaction);
  } catch (error) {
    console.error('Error checking prepaid BIN:', error);
    return false;
  }
}

/**
 * Validate card with BIN
 * @param {string} cardNumber - Full card number
 * @param {number} amount - Transaction amount
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<Object>} - Validation result
 */
export async function validateCardWithBIN(cardNumber, amount = 0, transaction = null) {
  try {
    return await binService.validateCardWithBIN(cardNumber, amount, transaction);
  } catch (error) {
    console.error('Error validating card with BIN:', error);
    return { valid: false, error: error.message };
  }
}

/**
 * Generate card with specific BIN mapping
 * @param {string} bankName - Bank name
 * @param {string} cardType - Card type (DEBIT, PREPAID, CREDIT, CHARGE)
 * @param {number} length - Card length
 * @param {object} transaction - Sequelize transaction
 * @returns {Promise<Object>} - Generated card details
 */
export async function generateCardWithBINMapping(bankName, cardType = 'DEBIT', length = 16, transaction = null) {
  try {
    // Find BIN mapping by bank name and card type
    const BINMapping = getModel('BINMapping');
    if (!BINMapping) throw new Error('BINMapping model not loaded');

    const mapping = await BINMapping.findOne({
      where: {
        bank_name: {
          [sequelize.Op.iLike]: `%${bankName}%`
        },
        card_type: cardType,
        is_active: true
      },
      transaction
    });

    if (!mapping) {
      throw new Error(`No BIN mapping found for bank: ${bankName} and card type: ${cardType}`);
    }

    // Generate card number using the BIN
    let binToUse = mapping.bank_bin || mapping.prepaid_bin || mapping.bin;
    const pan = await generateCardNumber(binToUse, length, transaction);

    return {
      pan,
      bin: mapping.bin,
      bank_name: mapping.bank_name,
      card_scheme: mapping.card_scheme,
      card_type: mapping.card_type,
      is_prepaid: mapping.is_prepaid,
      bank_bin: mapping.bank_bin,
      prepaid_bin: mapping.prepaid_bin,
      metadata: mapping.metadata
    };
  } catch (error) {
    console.error('Error generating card with BIN mapping:', error);
    throw error;
  }
}

// ================================================================
// EXPORTS
// ================================================================

export default {
  calculateLuhnChecksum,
  calculateLuhnCheckDigit,
  generateCardNumber,
  generateRandomCardNumber,
  isValidCardNumber,
  maskCardNumber,
  generateCVV,
  generateExpiryDate,
  // Flutterwave utilities
  FLUTTERWAVE_SUPPORTED_BINS,
  getRandomBINForScheme,
  getDefaultBINForScheme,
  generateFlutterwaveCardNumber,
  generateFlutterwaveCardDetails,
  formatCardNumberForFlutterwave,
  validateCardForFlutterwave,
  // BIN Mapping utilities
  extractBINFromCardNumber,
  getCardSchemeFromBIN,
  getBankNameFromBIN,
  isPrepaidBIN,
  validateCardWithBIN,
  generateCardWithBINMapping
};