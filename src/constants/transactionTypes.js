// constants/transactionTypes.js

// Core Banking Transactions
const CORE_TX_TYPES = [
  'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'DEBIT', 'CREDIT',
  'ADJUSTMENT', 'REVERSAL', 'CHARGE', 'REFUND', 
  'INTEREST_CREDIT', 'DIVIDEND', 'FEE'
];

// Loan Transactions
const LOAN_TX_TYPES = [
  'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT', 'LOAN_INTEREST',
  'LOAN_FEE', 'LOAN_PENALTY', 'LOAN_REFINANCE', 'LOAN_WRITEOFF',
  'LOAN_RECOVERY', 'LOAN_RESCHEDULE', 'LOAN_ADJUSTMENT',
  'LOAN_PROCESSING_FEE', 'LOAN_LIABILITY'
];

// Investment Transactions
const INVESTMENT_TX_TYPES = [
  'INVESTMENT_BUY', 'INVESTMENT_SELL', 'INVESTMENT_DIVIDEND',
  'INVESTMENT_INTEREST', 'INVESTMENT_FEE'
];

// Card Transactions
const CARD_TX_TYPES = [
  'CARD_PURCHASE', 'CARD_CASH_ADVANCE', 'CARD_PAYMENT',
  'CARD_FEE', 'CARD_REWARD', 'CARD_CHARGEBACK'
];

// Digital Transactions
const DIGITAL_TX_TYPES = [
  'MOBILE_PAYMENT', 'ONLINE_TRANSFER', 'BILL_PAYMENT',
  'QR_PAYMENT', 'P2P_TRANSFER'
];

// Special Transaction Types
const SPECIAL_TX_TYPES = [
  'FOREIGN_EXCHANGE', 'BANK_CHARGE', 'TAX_PAYMENT',
  'ESCROW', 'SETTLEMENT', 'CORRESPONDENT',
  'NOSTRO', 'VOSTRO'
];

// Thrift Transactions
const THRIFT_TX_TYPES = [
  'THRIFT_OPENING', 'THRIFT_COLLECTION', 'THRIFT_WITHDRAWAL', 'BANK_PAYMENT'
];

// Processing Fee Transaction
const PROCESSING_FEE_TYPES = [
  'PROCESSING_FEE'
];

// General Transaction Types
const GENERAL_TX_TYPES = ['DEPOSIT', 'WITHDRAWAL', 'FOREIGN_EXCHANGE', 'TRANSFER', 'DEBIT', 'CREDIT', 'FEE'];

// Get all available transaction types
const getAllTransactionTypes = () => [
  ...new Set([
    ...CORE_TX_TYPES,
    ...LOAN_TX_TYPES,
    ...INVESTMENT_TX_TYPES,
    ...CARD_TX_TYPES,
    ...DIGITAL_TX_TYPES,
    ...SPECIAL_TX_TYPES,
    ...THRIFT_TX_TYPES,
    ...PROCESSING_FEE_TYPES,
    ...GENERAL_TX_TYPES
  ])
];

// Investment Account Transactions
const INVESTMENT_ACCOUNT_TX_TYPES = [
  ...INVESTMENT_TX_TYPES,
  ...CORE_TX_TYPES.filter(type =>
    ['TRANSFER', 'DEBIT', 'CREDIT', 'FEE'].includes(type)
  )
];

// Loan Account Transactions
const LOAN_ACCOUNT_TX_TYPES = [...LOAN_TX_TYPES];

// Export everything
export {
  CORE_TX_TYPES,
  LOAN_TX_TYPES,
  INVESTMENT_TX_TYPES,
  CARD_TX_TYPES,
  DIGITAL_TX_TYPES,
  SPECIAL_TX_TYPES,
  THRIFT_TX_TYPES,
  PROCESSING_FEE_TYPES,
  INVESTMENT_ACCOUNT_TX_TYPES,
  LOAN_ACCOUNT_TX_TYPES,
  GENERAL_TX_TYPES,
  getAllTransactionTypes
};

// Export everything together for easy default import
const allTransactionTypes = {
  CORE_TX_TYPES,
  LOAN_TX_TYPES,
  INVESTMENT_TX_TYPES,
  CARD_TX_TYPES,
  DIGITAL_TX_TYPES,
  SPECIAL_TX_TYPES,
  THRIFT_TX_TYPES,
  PROCESSING_FEE_TYPES,
  INVESTMENT_ACCOUNT_TX_TYPES,
  LOAN_ACCOUNT_TX_TYPES,
  GENERAL_TX_TYPES,
  getAllTransactionTypes
};

export default allTransactionTypes;