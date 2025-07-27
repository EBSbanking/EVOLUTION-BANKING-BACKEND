// models/Transaction.js
import mongoose from 'mongoose';
import { getAllTransactionTypes } from '../constants/transactionTypes.js';


const TransactionSchema = new mongoose.Schema({
  ACCT_ID: {
    type: String,
    required: true
  },
  TRAN_JOURNAL_ID: { 
    type: String, 
    required: true 
  },
  EVENT_ID: { 
    type: String, 
    required: true 
  },
  TRANSACTION_ID: { 
    type: String, 
    required: true 
  },
  OPENED_DATE: { 
    type: Date, 
    default: Date.now 
  },
  BU_ID: { 
    type: Number, 
    required: true 
  },
  CUST_ID: { 
    type: String, 
    required: true 
  },
  ACCT_NM: { 
    type: String, 
    required: true 
  },
  AMOUNT: { 
    type: Number, 
    required: true,
    min: 0
  },
  TRANSACTIONDATE: { 
    type: Date, 
    default: Date.now 
  },
 TRANSACTION_TYPE: { 
  type: String, 
  enum: getAllTransactionTypes(), // ✅ This pulls in ALL valid types including 'LOAN_PROCESSING_FEE'
  uppercase: true,
  required: true,
  index: true
},

  ACCT_NO: { 
    type: String,
    index: true
  },
  debitAccount: { 
    type: String,
    index: true
  },
  creditAccount: { 
    type: String,
    index: true
  },
  reference: { 
    type: String,
    index: true
  },
  timestamp: { 
    type: Date, 
    default: Date.now 
  },
  createdBy: { 
    type: String,
    required: true
  },
  status: { 
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'],
    default: 'PENDING'
  },
  // Additional recommended fields
  currency: {
    type: String,
    default: 'NGN',
    uppercase: true
  },
  description: {
    type: String
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
TransactionSchema.index({ TRANSACTION_ID: 1 });
TransactionSchema.index({ ACCT_ID: 1 });
TransactionSchema.index({ CUST_ID: 1 });
TransactionSchema.index({ TRANSACTIONDATE: -1 });
TransactionSchema.index({ status: 1 });

// Virtual for formatted amount
TransactionSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency || 'NGN'
  }).format(this.AMOUNT);
});

// Pre-save hook for validation
TransactionSchema.pre('save', function(next) {
  if (this.debitAccount && this.creditAccount && this.debitAccount === this.creditAccount) {
    throw new Error('Debit and credit accounts cannot be the same');
  }
  next();
});

// Static methods
TransactionSchema.statics.findByAccount = function(accountId) {
  return this.find({ 
    $or: [
      { ACCT_ID: accountId },
      { ACCT_NO: accountId },
      { debitAccount: accountId },
      { creditAccount: accountId }
    ]
  });
};

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;