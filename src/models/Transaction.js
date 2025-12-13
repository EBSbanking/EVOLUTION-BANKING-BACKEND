// models/Transaction.js - UPDATED VERSION
import mongoose from 'mongoose';
import { getAllTransactionTypes } from '../constants/transactionTypes.js';

const TransactionSchema = new mongoose.Schema(
  {
    ACCT_NO: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
      index: true,
    },
    ACCT_ID: {
      type: String,
      required: [true, 'Account ID is required'],
      trim: true,
      index: true,
    },
    BU_ID: {
      type: Number,
      required: [true, 'Business Unit ID is required'],
    },
    CUST_ID: {
      type: String,
      required: [true, 'Customer ID is required'],
      trim: true,
    },
    ACCT_NM: {
      type: String,
      required: [true, 'Account name is required'],
      trim: true,
    },
    AMOUNT: {
      type: mongoose.Schema.Types.Decimal128, // Changed from Number to Decimal128
      required: [true, 'Amount is required'],
      set: (v) => mongoose.Types.Decimal128.fromString(v.toString()),
      get: (v) => parseFloat(v.toString())
    },
    transactionDirection: {
      type: String,
      enum: ['CREDIT', 'DEBIT'],
      required: true,
      default: 'CREDIT'
    },
    TRANSACTIONDATE: {
      type: Date,
      required: [true, 'Transaction date is required'],
      default: Date.now,
      index: true,
    },
    TRANSACTION_TYPE: {
      type: String,
      enum: {
        values: getAllTransactionTypes(),
        message: '{VALUE} is not a valid transaction type',
      },
      uppercase: true,
      required: [true, 'Transaction type is required'],
      index: true,
    },
    TRANSACTION_ID: {
      type: Number,
      required: [true, 'Transaction ID is required'],
      unique: true,
      index: true,
    },
    transactionId: {
      type: String,
      // Leave it plain
    },
    EVENT_ID: {
      type: Number,
      required: [true, 'Event ID is required'],
      index: true,
    },
    TRAN_JOURNAL_ID: {
      type: String,
      required: [true, 'Journal ID is required'],
    },
    REFERENCE: {
      type: String,
      unique: true,
      required: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    currency: {
      type: String,
      default: 'NGN',
      uppercase: true,
      enum: ['NGN', 'USD', 'GBP', 'EUR'],
    },
    createdBy: {
      type: String,
      required: [true, 'Creator ID is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ['PENDING', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'REVERSED'],
        message: '{VALUE} is not a valid status',
      },
      default: 'PENDING',
      index: true,
    },
    FLAGGED_FOR_AML: {
      type: Boolean,
      default: false,
    },
    AML_REASON: {
      type: String,
      default: '',
      trim: true,
    },
    AML_THRESHOLD_USED: {
      type: Number,
      default: 0,
    },
    APPROVAL_NOTES: {
      type: String,
      default: '',
      trim: true,
    },
    APPROVED_BY: {
      type: String,
      default: null,
    },
    APPROVAL_DATE: {
      type: Date,
      default: null,
    },
    REJECTION_NOTES: {
      type: String,
      default: '',
      trim: true,
    },
    REJECTED_BY: {
      type: String,
      default: null,
    },
    REJECTION_DATE: {
      type: Date,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        delete ret._id;
        return ret;
      },
    },
    toObject: { virtuals: true },
    collection: 'transactions',
  }
);

// =========================
// VIRTUAL FIELDS
// =========================

TransactionSchema.virtual('formattedAmount').get(function () {
  const amount = parseFloat(this.AMOUNT.toString());
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency || 'NGN',
  }).format(amount);
});

TransactionSchema.virtual('formattedDate').get(function () {
  return this.TRANSACTIONDATE.toLocaleString();
});

TransactionSchema.virtual('actualAmount').get(function () {
  const amount = parseFloat(this.AMOUNT.toString());
  return this.transactionDirection === 'DEBIT' ? -amount : amount;
});

TransactionSchema.virtual('formattedActualAmount').get(function () {
  const amount = parseFloat(this.AMOUNT.toString());
  const actualAmount = this.transactionDirection === 'DEBIT' ? -amount : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency || 'NGN',
  }).format(actualAmount);
});

// =========================
// PRE-VALIDATE HOOK - UPDATED
// =========================

TransactionSchema.pre('validate', async function (next) {
  console.log('Pre-validate hook - Checking IDs:', { 
    TRANSACTION_ID: this.TRANSACTION_ID, 
    EVENT_ID: this.EVENT_ID, 
    TRAN_JOURNAL_ID: this.TRAN_JOURNAL_ID,
    REFERENCE: this.REFERENCE
  });

  // Only auto-generate if IDs are not provided
  if (this.isNew) {
    try {
      // Check if IDs were already provided (e.g., from generateTransactionIds())
      const hasProvidedIds = this.TRANSACTION_ID && this.EVENT_ID && this.TRAN_JOURNAL_ID && this.REFERENCE;
      
      if (!hasProvidedIds) {
        console.log('Auto-generating transaction IDs...');
        
        // Get the next available TRANSACTION_ID
        const lastTransaction = await this.constructor.findOne({})
          .sort({ TRANSACTION_ID: -1 })
          .select('TRANSACTION_ID')
          .lean();
        
        let nextTransactionId = 1;
        if (lastTransaction && lastTransaction.TRANSACTION_ID) {
          nextTransactionId = Number(lastTransaction.TRANSACTION_ID) + 1;
        }
        
        const timestamp = Date.now();
        const randomSuffix = Math.floor(Math.random() * 1000);
        
        // Generate identifiers only if not provided
        if (!this.TRANSACTION_ID) {
          this.TRANSACTION_ID = nextTransactionId;
        }
        if (!this.EVENT_ID) {
          this.EVENT_ID = nextTransactionId;
        }
        if (!this.TRAN_JOURNAL_ID) {
          this.TRAN_JOURNAL_ID = `JRN${timestamp}${randomSuffix}`;
        }
        if (!this.REFERENCE) {
          this.REFERENCE = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
        }
        if (!this.transactionId) {
          this.transactionId = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
        }
        
        console.log('Auto-generated IDs:', { 
          TRANSACTION_ID: this.TRANSACTION_ID,
          EVENT_ID: this.EVENT_ID,
          TRAN_JOURNAL_ID: this.TRAN_JOURNAL_ID,
          REFERENCE: this.REFERENCE
        });
      } else {
        console.log('Using provided IDs:', { 
          TRANSACTION_ID: this.TRANSACTION_ID,
          EVENT_ID: this.EVENT_ID,
          TRAN_JOURNAL_ID: this.TRAN_JOURNAL_ID,
          REFERENCE: this.REFERENCE
        });
      }
    } catch (error) {
      console.error('Error in pre-validate hook:', error);
      // Continue with defaults
      const timestamp = Date.now();
      const fallbackId = Number(timestamp.toString().slice(-9));
      
      if (!this.TRANSACTION_ID) this.TRANSACTION_ID = fallbackId;
      if (!this.EVENT_ID) this.EVENT_ID = fallbackId;
      if (!this.TRAN_JOURNAL_ID) this.TRAN_JOURNAL_ID = `JRN${timestamp}`;
      if (!this.REFERENCE) this.REFERENCE = `TXN${fallbackId}`;
      if (!this.transactionId) this.transactionId = `TXN${fallbackId}`;
    }
  }
  
  next();
});

// =========================
// STATIC METHODS
// =========================

TransactionSchema.statics.findByAccount = function (accountId) {
  return this.find({
    $or: [{ ACCT_ID: accountId }, { ACCT_NO: accountId }],
  }).sort({ TRANSACTIONDATE: -1 });
};

TransactionSchema.statics.findRecentByCustomer = function (customerId, limit = 10) {
  return this.find({ CUST_ID: customerId }).sort({ TRANSACTIONDATE: -1 }).limit(limit);
};

// Helper to generate transaction IDs
TransactionSchema.statics.generateTransactionIds = function () {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  
  // You can implement your own logic here
  // For now, using simple timestamp-based IDs
  const TRANSACTION_ID = Number(timestamp.toString().slice(-9));
  
  return {
    TRANSACTION_ID: TRANSACTION_ID,
    EVENT_ID: TRANSACTION_ID,
    JOURNAL_ID: `JRN${timestamp}${randomSuffix}`,
    TRAN_JOURNAL_ID: `TJ${timestamp}${randomSuffix}`,
    transactionId: `TXN${TRANSACTION_ID}`
  };
};

// =========================
// INDEXES
// =========================

// Compound indexes for better query performance
TransactionSchema.index({ ACCT_NO: 1, TRANSACTIONDATE: -1 });
TransactionSchema.index({ CUST_ID: 1, status: 1 });
TransactionSchema.index({ TRANSACTIONDATE: -1, status: 1 });

const Transaction = mongoose.model('Transaction', TransactionSchema);

export { TransactionSchema, Transaction };
export default Transaction;