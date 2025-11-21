// models/LoanAccountSummary.js
import mongoose from 'mongoose';

const LoanAccountSummarySchema = new mongoose.Schema(
  {
    ACCT_ID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanAccount',
      required: [true, 'Account ID is required'],
      unique: true,
      index: true
    },
    ACCT_NO: {
      type: String,
      required: [true, 'Account number is required'],
      trim: true,
      index: true
    },
    CUST_ID: {
      type: String,
      required: [true, 'Customer ID is required'],
      trim: true,
      index: true
    },
    ORIGINAL_PRINCIPAL: {
      type: Number,
      required: [true, 'Original principal amount is required'],
      min: [0, 'Principal cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2))
    },
    OUTSTANDING_PRINCIPAL: {
      type: Number,
      required: [true, 'Outstanding principal is required'],
      min: [0, 'Outstanding principal cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2))
    },
    TOTAL_INTEREST: {
      type: Number,
      default: 0,
      min: [0, 'Interest cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2))
    },
    PAID_INTEREST: {
      type: Number,
      default: 0,
      min: [0, 'Paid interest cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2))
    },
    TOTAL_REPAYMENT: {
      type: Number,
      default: 0,
      min: [0, 'Total repayment cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2))
    },
    INSTALLMENT_AMOUNT: {
      type: Number,
      required: [true, 'Installment amount is required'],
      min: [0, 'Installment amount cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2))
    },
    PAID_INSTALLMENTS: {
      type: Number,
      default: 0,
      min: [0, 'Paid installments cannot be negative']
    },
    TOTAL_INSTALLMENTS: {
      type: Number,
      required: [true, 'Total installments is required'],
      min: [1, 'Total installments must be at least 1']
    },
    NEXT_PAYMENT_DT: {
      type: Date,
      required: [true, 'Next payment date is required']
    },
    LAST_PAYMENT_DT: {
      type: Date,
      default: null
    },
    LAST_PAYMENT_AMOUNT: {
      type: Number,
      default: 0,
      min: [0, 'Last payment amount cannot be negative'],
      set: (v) => parseFloat(v.toFixed(2))
    },
    MATURITY_DT: {
      type: Date,
      required: [true, 'Maturity date is required']
    },
    START_DT: {
      type: Date,
      required: [true, 'Start date is required']
    },
    PAYMENT_FREQUENCY: {
      type: String,
      enum: {
        values: ['DAILY', 'WEEKLY', 'BI-WEEKLY', 'MONTHLY', 'QUARTERLY'],
        message: '{VALUE} is not a valid payment frequency'
      },
      default: 'MONTHLY',
      uppercase: true
    },
    LOAN_STATUS: {
      type: String,
      enum: {
        values: ['PENDING', 'APPROVED', 'ACTIVE', 'DELINQUENT', 'CLOSED', 'WRITTEN_OFF'],
        message: '{VALUE} is not a valid loan status'
      },
      default: 'PENDING',
      uppercase: true,
      index: true
    },
    DELINQUENT_DAYS: {
      type: Number,
      default: 0,
      min: [0, 'Delinquent days cannot be negative']
    },
    CLEARED_BAL: {
      type: Number,
      default: 0,
      set: (v) => parseFloat(v.toFixed(2))
    },
    CUR_PAYOFF: {
      type: Number,
      default: 0,
      set: (v) => parseFloat(v.toFixed(2))
    },
    LAST_CUST_ACTIVITY_DT: {
      type: Date,
      default: null
    },
    REC_ST: {
      type: String,
      enum: {
        values: ['A', 'I', 'S', 'C'],
        message: '{VALUE} is not a valid record status'
      },
      default: 'A',
      uppercase: true
    },
    CREATED_BY: {
      type: String,
      required: [true, 'Created by is required'],
      trim: true
    },
    UPDATED_BY: {
      type: String,
      trim: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete ret.__v;
        delete ret._id;
        return ret;
      }
    },
    toObject: { virtuals: true },
    collection: 'loan_account_summaries'
  }
);

// Virtual for remaining installments
LoanAccountSummarySchema.virtual('REMAINING_INSTALLMENTS').get(function () {
  return Math.max(0, this.TOTAL_INSTALLMENTS - this.PAID_INSTALLMENTS);
});

// Virtual for total outstanding (principal + interest)
LoanAccountSummarySchema.virtual('TOTAL_OUTSTANDING').get(function () {
  const outstandingInterest = this.TOTAL_INTEREST - this.PAID_INTEREST;
  return this.OUTSTANDING_PRINCIPAL + Math.max(0, outstandingInterest);
});

// Virtual for collection rate
LoanAccountSummarySchema.virtual('COLLECTION_RATE').get(function () {
  if (this.ORIGINAL_PRINCIPAL === 0) return 0;
  const principalPaid = this.ORIGINAL_PRINCIPAL - this.OUTSTANDING_PRINCIPAL;
  return (principalPaid / this.ORIGINAL_PRINCIPAL) * 100;
});

// Virtual for next payment status
LoanAccountSummarySchema.virtual('PAYMENT_STATUS').get(function () {
  if (!this.NEXT_PAYMENT_DT) return 'UNKNOWN';
  
  const today = new Date();
  const nextPayment = new Date(this.NEXT_PAYMENT_DT);
  
  if (nextPayment < today) {
    const daysOverdue = Math.floor((today - nextPayment) / (1000 * 60 * 60 * 24));
    return `OVERDUE_${daysOverdue}DAYS`;
  } else if (nextPayment.toDateString() === today.toDateString()) {
    return 'DUE_TODAY';
  } else {
    return 'UPCOMING';
  }
});

// Static method to find by account number
LoanAccountSummarySchema.statics.findByAccountNumber = function (accountNo) {
  return this.findOne({ ACCT_NO: accountNo });
};

// Static method to find overdue accounts
LoanAccountSummarySchema.statics.findOverdueAccounts = function () {
  const today = new Date();
  return this.find({
    NEXT_PAYMENT_DT: { $lt: today },
    LOAN_STATUS: { $in: ['ACTIVE', 'DELINQUENT'] },
    REC_ST: 'A'
  });
};

// Static method to update summary from transaction
LoanAccountSummarySchema.statics.updateFromTransaction = async function (transaction) {
  if (transaction.TRANSACTION_TYPE !== 'CREDIT') return null;
  
  const summary = await this.findOne({ ACCT_NO: transaction.ACCT_NO });
  if (!summary) return null;
  
  // Update payment details
  summary.LAST_PAYMENT_DT = transaction.TRANSACTIONDATE;
  summary.LAST_PAYMENT_AMOUNT = transaction.AMOUNT;
  summary.TOTAL_REPAYMENT += transaction.AMOUNT;
  summary.PAID_INSTALLMENTS += 1;
  summary.LAST_CUST_ACTIVITY_DT = new Date();
  
  // Calculate next payment date based on frequency
  const nextPayment = new Date(summary.NEXT_PAYMENT_DT);
  switch (summary.PAYMENT_FREQUENCY) {
    case 'WEEKLY':
      nextPayment.setDate(nextPayment.getDate() + 7);
      break;
    case 'BI-WEEKLY':
      nextPayment.setDate(nextPayment.getDate() + 14);
      break;
    case 'MONTHLY':
      nextPayment.setMonth(nextPayment.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextPayment.setMonth(nextPayment.getMonth() + 3);
      break;
    default:
      nextPayment.setMonth(nextPayment.getMonth() + 1);
  }
  
  summary.NEXT_PAYMENT_DT = nextPayment;
  
  // Update loan status
  if (summary.OUTSTANDING_PRINCIPAL <= 0) {
    summary.LOAN_STATUS = 'CLOSED';
  }
  
  return await summary.save();
};

// Pre-save middleware to calculate delinquent days
LoanAccountSummarySchema.pre('save', function (next) {
  if (this.NEXT_PAYMENT_DT && this.LOAN_STATUS === 'ACTIVE') {
    const today = new Date();
    const nextPayment = new Date(this.NEXT_PAYMENT_DT);
    
    if (nextPayment < today) {
      this.DELINQUENT_DAYS = Math.floor((today - nextPayment) / (1000 * 60 * 60 * 24));
      if (this.DELINQUENT_DAYS > 30) {
        this.LOAN_STATUS = 'DELINQUENT';
      }
    } else {
      this.DELINQUENT_DAYS = 0;
    }
  }
  next();
});

// Index for better query performance
LoanAccountSummarySchema.index({ ACCT_NO: 1, REC_ST: 1 });
LoanAccountSummarySchema.index({ CUST_ID: 1, REC_ST: 1 });
LoanAccountSummarySchema.index({ NEXT_PAYMENT_DT: 1, LOAN_STATUS: 1 });
LoanAccountSummarySchema.index({ LOAN_STATUS: 1, REC_ST: 1 });

const LoanAccountSummary = mongoose.model('LoanAccountSummary', LoanAccountSummarySchema);
export default LoanAccountSummary;