// constants/transactionTypes.js

// Core Banking Transactions
export const CORE_TX_TYPES = [
  'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'DEBIT', 'CREDIT',
  'ADJUSTMENT', 'REVERSAL', 'CHARGE', 'REFUND', 
  'INTEREST_CREDIT', 'DIVIDEND', 'FEE'
];

// Loan Transactions
export const LOAN_TX_TYPES = [
  'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'LOAN_INTEREST',
  'LOAN_FEE', 'LOAN_PENALTY', 'LOAN_REFINANCE', 'LOAN_WRITEOFF',
  'LOAN_RECOVERY', 'LOAN_RESCHEDULE', 'LOAN_ADJUSTMENT',
  'LOAN_PROCESSING_FEE', 'LOAN_LIABILITY'
];

// Investment Transactions
export const INVESTMENT_TX_TYPES = [
  'INVESTMENT_BUY', 'INVESTMENT_SELL', 'INVESTMENT_DIVIDEND',
  'INVESTMENT_INTEREST', 'INVESTMENT_FEE'
];

// Card Transactions
export const CARD_TX_TYPES = [
  'CARD_PURCHASE', 'CARD_CASH_ADVANCE', 'CARD_PAYMENT',
  'CARD_FEE', 'CARD_REWARD', 'CARD_CHARGEBACK'
];

// Digital Transactions
export const DIGITAL_TX_TYPES = [
  'MOBILE_PAYMENT', 'ONLINE_TRANSFER', 'BILL_PAYMENT',
  'QR_PAYMENT', 'P2P_TRANSFER'
];

// Special Transaction Types
export const SPECIAL_TX_TYPES = [
  'FOREIGN_EXCHANGE', 'BANK_CHARGE', 'TAX_PAYMENT',
  'ESCROW', 'SETTLEMENT', 'CORRESPONDENT',
  'NOSTRO', 'VOSTRO'
];

// Thrift Transactions
export const THRIFT_TX_TYPES = [
  'THRIFT_OPENING', 'THRIFT_COLLECTION', 'THRIFT_WITHDRAWAL', 'BANK_PAYMENT'
];

// Processing Fee Transaction (Add this missing constant)
export const PROCESSING_FEE_TYPES = [
  'PROCESSING_FEE'
];

// Investment Account Transactions
export const INVESTMENT_ACCOUNT_TX_TYPES = [
  ...INVESTMENT_TX_TYPES,
  ...CORE_TX_TYPES.filter(type =>
    ['TRANSFER', 'DEBIT', 'CREDIT', 'FEE'].includes(type)
  )
];

// Loan Account Transactions
export const LOAN_ACCOUNT_TX_TYPES = [...LOAN_TX_TYPES];

// General Transaction Types
export const GENERAL_TX_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'FOREIGN_EXCHANGE', 'TRANSFER', 'DEBIT', 'CREDIT', 'FEE'];

// Get all available transaction types
export const getAllTransactionTypes = () => [
  ...new Set([
    ...CORE_TX_TYPES,
    ...LOAN_TX_TYPES,
    ...INVESTMENT_TX_TYPES,
    ...CARD_TX_TYPES,
    ...DIGITAL_TX_TYPES,
    ...SPECIAL_TX_TYPES,
    ...THRIFT_TX_TYPES,
    ...PROCESSING_FEE_TYPES, // Fixed: Use PROCESSING_FEE_TYPES instead of PROCESSING_FEE
    ...GENERAL_TX_TYPES
  ])
];

// Export everything together for easy default import
const allTransactionTypes = {
  CORE_TX_TYPES,
  LOAN_TX_TYPES,
  INVESTMENT_TX_TYPES,
  CARD_TX_TYPES,
  DIGITAL_TX_TYPES,
  SPECIAL_TX_TYPES,
  THRIFT_TX_TYPES,
  PROCESSING_FEE_TYPES, // Fixed
  INVESTMENT_ACCOUNT_TX_TYPES,
  LOAN_ACCOUNT_TX_TYPES,
  GENERAL_TX_TYPES,
  getAllTransactionTypes
};

export default allTransactionTypes;