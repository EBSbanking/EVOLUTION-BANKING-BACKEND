// models/LoanRepaymentTransaction.js
import mongoose from 'mongoose';

const LoanRepaymentTransactionSchema = new mongoose.Schema({
  ACCT_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: true
  },
  ACCT_NO: {
    type: String,
    required: true,
    trim: true
  },
  CUST_ID: {
    type: String,
    required: true,
    trim: true
  },
  TRANSACTION_DATE: {
    type: Date,
    required: true,
    default: Date.now
  },
  TRANSACTION_TYPE: {
    type: String,
    required: true,
    enum: ['REPAYMENT', 'INTEREST', 'PENALTY'],
    default: 'REPAYMENT'
  },
  AMOUNT: {
    type: Number,
    required: true,
    min: 0
  },
  PRINCIPAL_AMOUNT: {
    type: Number,
    required: true,
    min: 0
  },
  INTEREST_AMOUNT: {
    type: Number,
    required: true,
    min: 0
  },
  PAYMENT_METHOD: {
    type: String,
    required: true,
    enum: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY'],
    default: 'CASH'
  },
  TRANSACTION_REFERENCE: {
    type: String,
    required: true,
    trim: true
  },
  REPAYMENT_TYPE: {
    type: String,
    enum: ['INTEREST_FIRST', 'PRINCIPAL_FIRST', 'REPAYMENT', 'FULL_PAYMENT', 'PARTIAL_PAYMENT', 'LOAN'],
    default: 'REPAYMENT'
  },
  IS_INSTALLMENT: {
    type: Boolean,
    default: false
  },
  CREATED_BY: {
    type: String,
    required: true,
    trim: true
  },
  STATUS: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'COMPLETED'
  },
  RECEIPT_NO: {
    type: String,
    trim: true
  }
}, {
  timestamps: true,
  collection: 'loan_repayment_transactions'
});

// Index for better query performance
LoanRepaymentTransactionSchema.index({ ACCT_NO: 1, TRANSACTION_DATE: -1 });
LoanRepaymentTransactionSchema.index({ CUST_ID: 1, TRANSACTION_DATE: -1 });
LoanRepaymentTransactionSchema.index({ TRANSACTION_REFERENCE: 1 }, { unique: true });

export default mongoose.model('LoanRepaymentTransaction', LoanRepaymentTransactionSchema);