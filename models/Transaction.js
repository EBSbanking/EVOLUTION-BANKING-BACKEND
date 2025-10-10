
import mongoose from 'mongoose';
import { getAllTransactionTypes } from '../constants/transactionTypes.js';
import { generateWorkflowIdentifiers } from '../utils/generateWorkflowIdentifiers.js';

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
      type: Number,
      required: [true, 'Amount is required'],
      min: [0, 'Amount cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2)),
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
    },
    EVENT_ID: {
      type: Number,
      required: [true, 'Event ID is required'],
    },
    TRAN_JOURNAL_ID: {
      type: String,
      required: [true, 'Journal ID is required'],
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
        delete ret.reference;
        return ret;
      },
    },
    toObject: { virtuals: true },
    collection: 'transactions',
  }
);

// Virtual for formatted amount
TransactionSchema.virtual('formattedAmount').get(function () {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: this.currency || 'NGN',
  }).format(this.AMOUNT);
});

// Virtual for formatted date
TransactionSchema.virtual('formattedDate').get(function () {
  return this.TRANSACTIONDATE.toLocaleString();
});

// Static method to find transactions by account
TransactionSchema.statics.findByAccount = function (accountId) {
  return this.find({
    $or: [{ ACCT_ID: accountId }, { ACCT_NO: accountId }],
  }).sort({ TRANSACTIONDATE: -1 });
};

// Static method to find recent transactions by customer
TransactionSchema.statics.findRecentByCustomer = function (customerId, limit = 10) {
  return this.find({ CUST_ID: customerId }).sort({ TRANSACTIONDATE: -1 }).limit(limit);
};

// Pre-validate hook to generate IDs
TransactionSchema.pre('validate', async function (next) {
  console.log('Pre-validate hook:', { TRANSACTION_ID: this.TRANSACTION_ID, EVENT_ID: this.EVENT_ID, TRAN_JOURNAL_ID: this.TRAN_JOURNAL_ID });
  if (!this.TRANSACTION_ID || !this.EVENT_ID || !this.TRAN_JOURNAL_ID) {
    const identifiers = await generateWorkflowIdentifiers();
    this.TRANSACTION_ID = identifiers.TRANSACTION_ID;
    this.EVENT_ID = identifiers.EVENT_ID;
    this.TRAN_JOURNAL_ID = identifiers.JOURNAL_ID;
    console.log('Generated identifiers in pre-validate:', identifiers);
  }
  next();
});

// Pre-save hook to prevent unwanted fields
TransactionSchema.pre('save', function (next) {
  console.log('Pre-save hook:', { reference: this.reference });
  if (this.reference !== undefined) {
    delete this.reference;
  }
  next();
});

// Static method to drop transactionId_1 index
TransactionSchema.statics.dropTransactionIdIndex = async function () {
  try {
    const indexes = await this.collection.getIndexes();
    if (indexes['transactionId_1']) {
      await this.collection.dropIndex('transactionId_1');
      console.log('Dropped transactionId_1 index');
    }
  } catch (error) {
    if (error.codeName === 'IndexNotFound') {
      console.log('transactionId_1 index not found, no action needed');
    } else {
      console.error('Error dropping transactionId_1 index:', error.message);
    }
  }
};

// Run index cleanup on schema registration
TransactionSchema.post('init', async function () {
  await this.model('Transaction').dropTransactionIdIndex();
});

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;
