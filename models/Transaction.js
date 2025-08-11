// models/Transaction.js
import mongoose from 'mongoose';
import { getAllTransactionTypes } from '../constants/transactionTypes.js';

const TransactionSchema = new mongoose.Schema({
  ACCT_ID: {
    type: String,
    required: [true, 'Account ID is required']
  },
  TRAN_JOURNAL_ID: { 
    type: String, 
    required: [true, 'Journal ID is required'],
    default: function() {
      return `JN-${Date.now().toString(36).toUpperCase()}`
    }
  },
  EVENT_ID: { 
    type: String, 
    required: [true, 'Event ID is required'],
    default: function() {
      return `EV-${Date.now().toString(36).toUpperCase()}`
    }
  },
  TRANSACTION_ID: { 
    type: Number, 
    required: [true, 'Transaction ID is required'],
    default: function() {
      return `TX-${Date.now().toString(36).toUpperCase()}`
    }
  },
  OPENED_DATE: { 
    type: Date, 
    default: Date.now 
  },
  BU_ID: { 
    type: Number, 
    required: [true, 'Business Unit ID is required'] 
  },
  CUST_ID: { 
    type: String, 
    required: [true, 'Customer ID is required'] 
  },
  ACCT_NM: { 
    type: String, 
    required: [true, 'Account name is required'],
    trim: true
  },
  AMOUNT: { 
    type: Number, 
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative'],
    set: v => parseFloat(v.toFixed(2)) // Ensure 2 decimal places
  },
  TRANSACTIONDATE: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  TRANSACTION_TYPE: { 
    type: String, 
    enum: {
      values: getAllTransactionTypes(),
      message: '{VALUE} is not a valid transaction type'
    },
    uppercase: true,
    required: [true, 'Transaction type is required'],
    index: true
  },
  ACCT_NO: { 
    type: String,
    required: [true, 'Account number is required'],
    index: true,
    trim: true
  },
  reference: { 
    type: String,
    index: true,
    trim: true
  },
  createdBy: { 
    type: String,
    required: [true, 'Creator ID is required'],
    trim: true
  },
  status: { 
    type: String,
    enum: {
      values: ['PENDING', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'REVERSED'],
      message: '{VALUE} is not a valid status'
    },
    default: 'PENDING',
    index: true
  },
  FLAGGED_FOR_AML: { 
    type: Boolean, 
    default: false 
  },
  AML_REASON: { 
    type: String, 
    default: '',
    trim: true
  },
  AML_THRESHOLD_USED: {
    type: Number,
    default: 0
  },
  currency: {
    type: String,
    default: 'NGN',
    uppercase: true,
    enum: ['NGN', 'USD', 'GBP', 'EUR'] // Add more as needed
  },
  description: {
    type: String,
    trim: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, { 
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret._id;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtuals
TransactionSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency || 'NGN'
  }).format(this.AMOUNT);
});

TransactionSchema.virtual('formattedDate').get(function() {
  return this.TRANSACTIONDATE.toLocaleString();
});


// Static methods
TransactionSchema.statics.findByAccount = function(accountId) {
  return this.find({ 
    $or: [
      { ACCT_ID: accountId },
      { ACCT_NO: accountId }
    ]
  }).sort({ TRANSACTIONDATE: -1 });
};

TransactionSchema.statics.findRecentByCustomer = function(customerId, limit = 10) {
  return this.find({ CUST_ID: customerId })
    .sort({ TRANSACTIONDATE: -1 })
    .limit(limit);
};

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;