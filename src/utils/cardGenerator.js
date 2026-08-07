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
 * Generate a sequential, Luhn-valid card number (PAN) using a database counter.
 * Falls back to random generation if the database fails.
 * @param {string} bin - Bank Identification Number (first 6 digits, e.g., '506099')
 * @param {number} length - Total card number length (default 16)
 * @param {object} transaction - Optional Sequelize transaction
 * @returns {Promise<string>} - Valid card number
 */
export async function generateCardNumber(bin = '506099', length = 16, transaction = null) {
  try {
    // ✅ Validate BIN - it can be a scheme name or a numeric BIN
    let binPrefix = bin;
    
    // If BIN is a scheme name (VERVE, VISA, etc.), map it to a BIN
    const schemeBinMap = {
      'VERVE': '506099',
      'VISA': '4',
      'MASTERCARD': '5',
      'AMEX': '34',
      'DISCOVER': '6'
    };
    
    // Check if the input is a scheme name (uppercase)
    if (schemeBinMap[binPrefix.toUpperCase()]) {
      binPrefix = schemeBinMap[binPrefix.toUpperCase()];
      console.log(`🔁 Mapped scheme ${bin} to BIN prefix: ${binPrefix}`);
    }
    
    // Ensure BIN prefix is valid
    if (!binPrefix || binPrefix.length === 0) {
      throw new Error('BIN prefix is required');
    }
    
    // Handle short BINs (VISA: '4', Mastercard: '5', AMEX: '34', Discover: '6')
    // Pad to 6 digits with random digits
    let paddedBin = binPrefix;
    if (paddedBin.length < 6) {
      const randomDigits = Math.floor(Math.random() * Math.pow(10, 6 - paddedBin.length))
        .toString()
        .padStart(6 - paddedBin.length, '0');
      paddedBin = paddedBin + randomDigits;
    }
    
    // Ensure BIN is exactly 6 digits
    paddedBin = paddedBin.slice(0, 6);
    
    console.log(`🔢 Using BIN: ${paddedBin} (original: ${bin})`);
    
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
    return generateRandomCardNumber(bin, length);
  }
}

/**
 * Generate a random card number (fallback)
 * @param {string} binPrefix - The BIN prefix or scheme name
 * @param {number} length - Total card length (default 16)
 * @returns {string} - Valid card number
 */
export function generateRandomCardNumber(binPrefix = '506099', length = 16) {
  // Map scheme names to BIN prefixes
  const schemeBinMap = {
    'VERVE': '506099',
    'VISA': '4',
    'MASTERCARD': '5',
    'AMEX': '34',
    'DISCOVER': '6'
  };
  
  let bin = binPrefix;
  if (schemeBinMap[binPrefix.toUpperCase()]) {
    bin = schemeBinMap[binPrefix.toUpperCase()];
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
// EXPORTS
// ================================================================

export default {
  generateCardNumber,
  generateRandomCardNumber,
  calculateLuhnChecksum,
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
  validateCardForFlutterwave
};