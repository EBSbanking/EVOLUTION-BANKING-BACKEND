import Counter from '../models/Counter.js';
import Transaction from '../models/Transaction.js';
import generateSerialNumber from './generateSerialNumber.js';
import { getProductTypeOnly } from '../Services/productService.js'; // ✅ Corrected path

// ✅ Account prefix logic based on product type
export function getPrefixForProductType(productType) {
  const typeStr = String(productType).toUpperCase().trim();

  switch (typeStr) {
    case 'BUSINESS TERM LOAN':
    case 'BUSINESS_TERM_LOAN':
      return '300';
    case 'SME LOAN':
    case 'SME_LOAN':
      return '301';
    case 'CONSUMER LOAN':
    case 'CONSUMER_LOAN':
    case 'INDIVIDUAL LOAN':
    case 'INDIVIDUAL_LOAN':
      return '302';
    default:
      return '399'; // fallback prefix
  }
}

// ✅ Generate 10-digit loan account number using product type
export const generateLoanAccountNumberByProdId = async (PROD_ID) => {
  const productType = await getProductTypeOnly(PROD_ID); // e.g., "SME_LOAN"
  const prefix = getPrefixForProductType(productType);   // e.g., "301"
  const counterId = `ACCT_NO_${prefix}`;

  const result = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const sequence = result.seq.toString().padStart(7, '0'); // "0000001"
  const accountNumber = `${prefix}${sequence}`;            // "3010000001"

  if (!/^\d{10}$/.test(accountNumber)) {
    throw new Error(`Invalid account number format: ${accountNumber}`);
  }

  return accountNumber;
};

// Alias
export const generateLoanAccountIdByProduct = generateLoanAccountNumberByProdId;

// ✅ Fallback account number (based on timestamp)
export const generateAccountNumber = () => {
  return Number(Date.now()).slice(-10); // e.g., "8723456789"
};

// ✅ Generate unique 13-digit transaction ID
export const generateTransactionId = async (session) => {
  let TRANSACTION_ID = generateSerialNumber(13);

  while (await Transaction.findOne({ TRANSACTION_ID }).session(session)) {
    TRANSACTION_ID = generateSerialNumber(13);
  }

  return TRANSACTION_ID;
};

export default {generateTransactionId};