// services/accountService.js
import Counter from '../models/Counter.js';
import { getProductTypeByProdIdInternal } from '../controllers/ProductTypeMappingController.js';

// Example of existing imports and constants
const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_ID_LENGTH = 6;

// Existing generateAccountNumber function
export async function generateAccountNumber(accountType) {
  const prefixMap = {
    'ACCT_LOAN': '300',
    'ACCT_TERM_DEPOSIT': '200',
    'ACCT_SAVINGS': '100'
  };

  if (!prefixMap[accountType]) {
    throw new Error(`Invalid account type: ${accountType}`);
  }

  const counter = await Counter.findByIdAndUpdate(
    accountType,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const prefix = prefixMap[accountType];
  const paddedSequence = String(counter.seq).padStart(7, '0');
  return `${prefix}${paddedSequence}`;
}

// ✅ Add this function here
export async function generateAccountNumberByProdId(prodId) {
  const product = await getProductTypeByProdIdInternal(prodId);

  // Use PROD_CAT_TY or PROD_DESC
  const productType = (product.PROD_CAT_TY || product.PROD_DESC || '').toUpperCase();

  const productConfig = {
    'LOAN': 'ACCT_LOAN',
    'TERM_DEPOSIT': 'ACCT_TERM_DEPOSIT',
    'SAVINGS': 'ACCT_SAVINGS'
  };

  const accountType = productConfig[productType];
  if (!accountType) throw new Error(`Invalid product type: ${productType}`);

  const accountNumber = await generateAccountNumber(accountType);
  return {
    numericValue: parseInt(accountNumber),
    formattedString: accountNumber
  };
}
