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

// Thrift Transactions - MAPPED TO EXISTING ENUM VALUES
const THRIFT_TX_TYPES = {
  // Map thrift transaction types to existing ENUM values
  OPENING: 'DEPOSIT',           // Thrift opening = DEPOSIT
  COLLECTION: 'DEPOSIT',        // Regular collection = DEPOSIT  
  WITHDRAWAL: 'WITHDRAWAL',     // Thrift withdrawal = WITHDRAWAL
  BANK_PAYMENT: 'TRANSFER',     // Bank payment = TRANSFER
  
  // Constants for code readability
  THRIFT_OPENING: 'DEPOSIT',
  THRIFT_COLLECTION: 'DEPOSIT',
  THRIFT_WITHDRAWAL: 'WITHDRAWAL'
};

// Processing Fee Transaction
const PROCESSING_FEE_TYPES = [
  'PROCESSING_FEE'
];

// General Transaction Types - ACTUAL DATABASE ENUM VALUES
const GENERAL_TX_TYPES = [
  'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'LOAN_DISBURSEMENT', 
  'LOAN_REPAYMENT', 'FEE_CHARGE', 'INTEREST_CREDIT', 
  'INTEREST_CHARGE', 'PENALTY_CHARGE', 'SALARY_PAYMENT', 
  'BILL_PAYMENT', 'ATM_WITHDRAWAL', 'ONLINE_TRANSFER', 
  'MOBILE_TRANSFER', 'STANDING_ORDER', 'DIRECT_DEBIT', 
  'CHEQUE_DEPOSIT', 'CASH_DEPOSIT', 'CASH_WITHDRAWAL', 
  'REVERSAL', 'ADJUSTMENT', 'REFUND'
];

// Get all available transaction types (actual database ENUM values)
const getAllTransactionTypes = () => [...GENERAL_TX_TYPES];

// Get thrift-specific transaction type
const getThriftTransactionType = (thriftType) => {
  const thriftTypeMap = {
    'THRIFT_OPENING': 'DEPOSIT',
    'THRIFT_COLLECTION': 'DEPOSIT',
    'THRIFT_WITHDRAWAL': 'WITHDRAWAL',
    'BANK_PAYMENT': 'TRANSFER'
  };
  
  return thriftTypeMap[thriftType] || 'DEPOSIT'; // Default to DEPOSIT
};

// Investment Account Transactions
const INVESTMENT_ACCOUNT_TX_TYPES = [
  ...INVESTMENT_TX_TYPES,
  ...GENERAL_TX_TYPES.filter(type =>
    ['TRANSFER', 'DEPOSIT', 'WITHDRAWAL'].includes(type)
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
  getAllTransactionTypes,
  getThriftTransactionType
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
  getAllTransactionTypes,
  getThriftTransactionType
};

export default allTransactionTypes;