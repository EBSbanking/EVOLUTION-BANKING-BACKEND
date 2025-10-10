// utils/generateLoanAccountId.js
import Counter from '../models/Counter.js';
import Transaction from '../models/Transaction.js';
import generateSerialNumber from './generateSerialNumber.js';
import { getProductTypeByProdIdInternal } from '../services/productService.js'; // ✅ Correct import path

// ✅ Account prefix logic based on product type - UPDATED
export function getPrefixForProductType(productType) {
  const typeStr = String(productType).toUpperCase().trim();

  switch (typeStr) {
    case 'BUSINESS TERM LOAN':
    case 'BUSINESS_TERM_LOAN':
      return '300';
    case 'INDIVIDUAL LOAN':
    case 'INDIVIDUAL_LOAN':
      return '301';
    case 'CONSUMER LOAN':
    case 'CONSUMER_LOAN':
      return '302';
    case 'MORTGAGE':
      return '303';
    case 'AUTO LOAN':
    case 'AUTO_LOAN':
      return '304';
    case 'PERSONAL LOAN':
    case 'PERSONAL_LOAN':
      return '305';
    case 'EDUCATION LOAN':
    case 'EDUCATION_LOAN':
      return '306';
    case 'CREDIT CARD':
    case 'CREDIT_CARD':
      return '307';
    case 'LINE OF CREDIT':
    case 'LINE_OF_CREDIT':
      return '308';
    case 'SME LOAN':
    case 'SME_LOAN':
      return '309';
    case 'GENERAL LOAN':
    case 'GENERAL_LOAN':
      return '399';
    default:
      return '399'; // fallback prefix
  }
}

// ✅ Generate 10-digit loan account number using product type
export const generateLoanAccountNumberByProdId = async (PROD_ID) => {
  // Use service to fetch product mapping
  const productMapping = await getProductTypeByProdIdInternal(PROD_ID);
  const productType = productMapping.PROD_CAT_TY || productMapping.PROD_DESC || '';
  const prefix = getPrefixForProductType(productType);

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

// ✅ Alias for clarity
export const generateLoanAccountIdByProduct = generateLoanAccountNumberByProdId;

// ✅ Fallback account number (timestamp-based, guaranteed 10-digit string)
export const generateAccountNumber = () => {
  const now = Date.now().toString();
  return now.slice(-10); // e.g. "8723456789"
};

// ✅ Generate unique 13-digit transaction ID (with session check)
export const generateTransactionId = async (session) => {
  let TRANSACTION_ID = generateSerialNumber(13);

  while (await Transaction.findOne({ TRANSACTION_ID }).session(session)) {
    TRANSACTION_ID = generateSerialNumber(13);
  }

  return TRANSACTION_ID;
};

// ✅ Export all together
export default {
  getPrefixForProductType,
  generateLoanAccountNumberByProdId,
  generateLoanAccountIdByProduct,
  generateAccountNumber,
  generateTransactionId
};
