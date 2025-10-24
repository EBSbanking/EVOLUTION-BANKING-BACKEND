import mongoose from 'mongoose';

const LoanAccountDetailsSchema = new mongoose.Schema({
  // ===== CORE ACCOUNT IDENTIFICATION =====
  ACCT_NO: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: function(v) {
        return /^[A-Z0-9]{10,20}$/.test(v);
      },
      message: props => `${props.value} is not a valid account number!`
    }
  },
  CUST_ID: {
    type: String,
    required: true,
    ref: 'Customer',
    index: true
  },
  CUST_NM: {
    type: String,
    required: true,
    trim: true
  },
  PROD_ID: {
    type: String,
    required: true,
    ref: 'Product'
  },
  APPL_ID: {
    type: String,
    required: true,
    index: true,
    unique: true
  },
  CRNCY_ID: {
    type: String,
    required: true,
    default: 'NGN'
  },
  BU_ID: {
    type: String,
    required: true
  },
  PRIMARY_OFFICER_ID: {
    type: String,
    required: true
  },
  SECONDARY_OFFICER_ID: String,
  creditReference: {
    type: String,
    maxlength: 50
  },
  loanCycle: {
    type: Number,
    min: 1,
    max: 10,
    default: 1
  },

  // ===== LOAN TERMS & DISBURSEMENT =====
  START_DT: {
    type: Date,
    required: true,
    default: Date.now
  },
  MATURITY_DT: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        return v > this.START_DT;
      },
      message: 'Maturity date must be after start date'
    }
  },
  TERM_CD: {
    type: String,
    required: true,
    enum: ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    default: 'MONTHLY'
  },
  TERM_VALUE: {
    type: Number,
    required: true,
    min: 1,
    max: 360,
    comment: 'Loan term in months for monthly, weeks for weekly, etc.'
  },
  DISBURSEMENT_DATE: Date,
  DISBURSEMENT_LIMIT: Number,
  TRANSACTION_TYPE: {
    type: String,
    enum: ['CASH', 'TRANSFER', 'CHECK', 'WIRE', null],
    default: null
  },
  fundingAcctNo: String,
  REPAY_SRC_ACCT_NO: String,

  // ===== INTEREST RATES =====
  INTEREST_RATE: {
    type: Number,
    required: true,
    min: 0,
    max: 100,
    get: v => parseFloat(v.toFixed(4))
  },
  INDEX_RATE_ID: String,
  accruedInterest: {
    type: Number,
    default: 0.00,
    get: v => parseFloat(v.toFixed(2))
  },
  lastAccrualAmount: {
    type: Number,
    default: 0.00,
    get: v => parseFloat(v.toFixed(2))
  },
  averageDailyAccrualInterestRate: {
    type: Number,
    min: 0,
    max: 100,
    get: v => v ? parseFloat(v.toFixed(6)) : null
  },

  // ===== FINANCIAL BALANCES =====
  LOAN_AMOUNT: {
    type: Number,
    required: true,
    min: 0,
    get: v => parseFloat(v.toFixed(2))
  },
  OUTSTANDING_BALANCE: {
    type: Number,
    default: 0,
    get: v => parseFloat(v.toFixed(2))
  },
  AVAILABLE_BALANCE: {
    type: Number,
    default: 0,
    get: v => parseFloat(v.toFixed(2))
  },
  LEDGER_BALANCE: {
    type: Number,
    default: 0,
    get: v => parseFloat(v.toFixed(2))
  },
  CLEARED_BALANCE: {
    type: Number,
    default: 0,
    get: v => parseFloat(v.toFixed(2))
  },
  payOffBalance: {
    type: Number,
    default: 0.00,
    get: v => parseFloat(v.toFixed(2))
  },
  provision: {
    type: Number,
    default: 0.00,
    min: 0,
    get: v => parseFloat(v.toFixed(2))
  },
  equalPeriodicPaymentAmount: {
    type: Number,
    get: v => v ? parseFloat(v.toFixed(2)) : null
  },

  // ===== STATUS & TRACKING =====
  STATUS: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'CLOSED', 'DELINQUENT', 'DEFAULTED', 'WRITTEN_OFF'],
    default: 'PENDING'
  },
  LOAN_STATUS: {
    type: String,
    enum: ['APPLICATION', 'APPROVED', 'DISBURSED', 'REPAYING', 'CLOSED', 'DEFAULTED'],
    default: 'APPLICATION'
  },
  APPROVAL_STATUS: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING'
  },
  lastSettlementDate: Date,
  nextSettlementDate: Date,

  // ===== AUDIT FIELDS =====
  CREATED_BY: {
    type: String,
    required: true
  },
  CREATED_AT: {
    type: Date,
    default: Date.now
  },
  lastModifiedBy: String,
  lastModifiedAt: Date
}, {
  timestamps: true,
  versionKey: false,
  toJSON: { getters: true, virtuals: true },
  toObject: { getters: true, virtuals: true }
});

// Virtual Fields
LoanAccountDetailsSchema.virtual('remainingTerm').get(function() {
  const months = (this.MATURITY_DT - new Date()) / (1000 * 60 * 60 * 24 * 30);
  return Math.max(0, Math.ceil(months));
});

LoanAccountDetailsSchema.virtual('daysPastDue').get(function() {
  if (!this.nextSettlementDate || !['DELINQUENT', 'DEFAULTED'].includes(this.STATUS)) return 0;
  return Math.floor((new Date() - this.nextSettlementDate) / (1000 * 60 * 60 * 24));
});

// Pre-save Hooks
LoanAccountDetailsSchema.pre('save', function(next) {
  // Auto-calculate payoff balance
  this.payOffBalance = parseFloat((this.LEDGER_BALANCE + this.accruedInterest).toFixed(2));
  
  // Update last modified timestamp
  this.lastModifiedAt = new Date();
  
  // Ensure consistent statuses
  if (this.LOAN_STATUS === 'DISBURSED' && this.STATUS === 'APPROVED') {
    this.STATUS = 'ACTIVE';
  }
  
  next();
});

// Indexes
// LoanAccountDetailsSchema.index({ CUST_ID: 1, STATUS: 1 });
// LoanAccountDetailsSchema.index({ PROD_ID: 1, STATUS: 1 });
// LoanAccountDetailsSchema.index({ MATURITY_DT: 1 });
// LoanAccountDetailsSchema.index({ nextSettlementDate: 1 });
// LoanAccountDetailsSchema.index({ APPL_ID: 1 }, { unique: true });

// Static Methods
LoanAccountDetailsSchema.statics.findByStatus = function(status) {
  return this.find({ STATUS: status });
};

// Instance Methods
LoanAccountDetailsSchema.methods.calculateNextPayment = function() {
  // Implementation for calculating next payment based on repayment frequency
  // This would use TERM_CD and lastSettlementDate to determine next payment date and amount
};

const LoanAccountDetails = mongoose.model('LoanAccountDetails', LoanAccountDetailsSchema);

export default LoanAccountDetails;