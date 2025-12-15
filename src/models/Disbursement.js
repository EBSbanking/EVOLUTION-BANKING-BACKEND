import mongoose from 'mongoose';
import logger from '../utils/logger.js';

const loanDisbursementSchema = new mongoose.Schema({
  // ==================== CORE REQUIRED FIELDS ====================
  ACCT_NO: {
    type: String,
    required: [true, 'Account number is required'],
    index: true,
    minlength: [10, 'Account number must be at least 10 characters']
  },
  INTEREST_RATE: {
    type: mongoose.Schema.Types.Decimal128,
    required: [true, 'Interest rate is required'],
    min: [0, 'Interest rate cannot be negative'],
    max: [100, 'Interest rate cannot exceed 100%'],
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },
  TERM_VALUE: {
    type: Number,
    required: [true, 'Term value is required'],
    min: [1, 'Term value must be at least 1']
  },
  TERM_CD: {
    type: String,
    required: [true, 'Term code is required'],
    enum: ['D', 'W', 'BW', 'M', 'Q', 'Y', 'DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    uppercase: true
  },
  AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    required: [true, 'Disbursement amount is required'],
    min: [0, 'Amount cannot be negative'],
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },
  CUST_ID: {
    type: String,
    required: [true, 'Customer ID is required'],
    index: true
  },
  APPL_ID: {
    type: String,
    required: [true, 'Application ID is required'],
    unique: true,
    trim: true
  },

  // ==================== CALCULATION FIELDS ====================
  CALCULATION_METHOD: {
    type: String,
    required: true,
    enum: ['FLAT_RATE', 'REDUCING_BALANCE', 'FIXED_RATE', 'EMI'],
    default: 'REDUCING_BALANCE'
  },
  PAYMENT_FREQUENCY: {
    type: String,
    required: true,
    enum: ['DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY'],
    default: 'MONTHLY'
  },
  EMI_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    required: false, // Calculated in controller or pre-save
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },
  TOTAL_INTEREST: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },
  TOTAL_REPAYMENT: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },

  // ==================== INTEREST CONFIGURATION ====================
  INTEREST_CONFIGURATION: {
    INTEREST_TYPE: {
      type: String,
      enum: ['FIXED', 'VARIABLE', 'TIERED', 'FIXED_RATE', 'VARIABLE_RATE', 'SIMPLE', 'COMPOUND'],
      default: 'COMPOUND'
    },
    CALCULATION_METHOD: {
      type: String,
      enum: ['DECLINING_BALANCE', 'REDUCING_BALANCE', 'FLAT_RATE', 'COMPOUND', 'DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'],
      default: 'REDUCING_BALANCE'
    },
    INTEREST_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
    },
    RATE_TYPE: {
      type: String,
      enum: ['FIXED', 'FLOATING', 'TIERED', 'REDUCING'],
      default: 'REDUCING'
    },
    IS_TERM_BASED_RATE: {
      type: Boolean,
      default: false
    },
    ACCRUAL_BASIS: String,
    ACCRUAL_FREQUENCY: String
  },

  // ==================== REFERENCES ====================
  LOAN_ACCOUNT_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: [true, 'Loan account reference is required']
  },
  CREDIT_APPLICATION_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CreditApplication',
    required: false // Optional but usually present
  },
  GUARANTOR_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guarantor',
    required: [true, 'Guarantor is required (can be fallback)']
  },
  REPAYMENT_SCHEDULE_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RepaymentSchedule'
  },

  // ==================== LOAN DETAILS (with safe defaults in controller) ====================
  PROD_ID: {
    type: Number,
    required: [true, 'Product ID is required']
  },
  PRODUCT_TYPE: {
    type: String,
    required: [true, 'Product type is required'],
    enum: ['INDIVIDUAL_LOAN', 'BUSINESS_LOAN', 'MORTGAGE', 'PERSONAL_LOAN', 'AUTO_LOAN', 'EDUCATION_LOAN']
  },
  ACCT_NM: {
    type: String,
    required: [true, 'Account name is required']
  },
  CRNCY_ID: {
    type: String,
    default: 'NGN'
  },
  BU_ID: {
    type: String,
    required: [true, 'Business unit ID is required']
  },
  PRIMARY_OFFICER_ID: {
    type: String,
    required: [true, 'Primary officer ID is required']
  },
  REPAY_SRC_ACCT_NO: {
    type: String,
    required: [true, 'Repayment source account is required']
  },
  START_DT: {
    type: Date,
    required: [true, 'Loan start date is required']
  },
  MATURITY_DT: {
    type: Date,
    required: [true, 'Maturity date is required']
  },
  LOAN_CYCLE: {
    type: Number,
    default: 1
  },

  // ==================== DISBURSEMENT DETAILS ====================
  DISBURSEMENT_DATE: {
    type: Date,
    default: Date.now
  },
  FEES_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },
  UPFRONT_INTEREST_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },
  NET_DISBURSEMENT_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => mongoose.Types.Decimal128.fromString((v || 0).toString())
  },
  STATUS: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'EXECUTED', 'DISBURSED', 'REJECTED', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
    uppercase: true
  },
  DISBURSEMENT_TYPE: {
    type: String,
    enum: ['CUSTOMER_ACCOUNT', 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'MOBILE_MONEY'],
    default: 'CUSTOMER_ACCOUNT'
  },

  // ==================== WORKFLOW & IDs ====================
  TRANSACTION_ID: {
    type: String,
    required: true
  },
  EVENT_ID: {
    type: String,
    required: true
  },
  JOURNAL_ID: String,
  TRANSACTION_REFERENCE: {
    type: String,
    unique: true,
    sparse: true
  },

  // ==================== USER FIELDS ====================
  CREATED_BY: {
    type: String,
    required: true
  },
  APPROVED_BY: String,
  APPROVAL_DATE: Date,
  EXECUTED_BY: String,
  EXECUTION_DATE: Date,
  DISBURSED_BY: String,

  // Optional notes
  REMARKS: { type: String, maxlength: 500 },
  FAILURE_REASON: String,
  CANCELLATION_REASON: String,
  TRANSACTION_NOTES: { type: String, maxlength: 1000 },

  // Optional extra info
  Borrower_address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: { type: String, default: 'Nigeria' }
  },
  REPAYMENT_SCHEDULE: {
    type: Array,
    default: []
  }
}, {
  timestamps: true,
  toJSON: { getters: true, transform: transformToJSON },
  toObject: { getters: true }
});

// Transform function for clean JSON output
function transformToJSON(doc, ret) {
  const decimalFields = [
    'AMOUNT', 'INTEREST_RATE', 'EMI_AMOUNT', 'TOTAL_INTEREST', 'TOTAL_REPAYMENT',
    'FEES_AMOUNT', 'UPFRONT_INTEREST_AMOUNT', 'NET_DISBURSEMENT_AMOUNT',
    'INTEREST_CONFIGURATION.INTEREST_RATE'
  ];

  decimalFields.forEach(field => {
    const keys = field.split('.');
    let obj = ret;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj?.[keys[i]];
    }
    if (obj && typeof obj[keys[keys.length - 1]] === 'object') {
      try {
        obj[keys[keys.length - 1]] = parseFloat(obj[keys[keys.length - 1]].toString());
      } catch (e) {
        obj[keys[keys.length - 1]] = 0;
      }
    }
  });

  const dateFields = ['DISBURSEMENT_DATE', 'APPROVAL_DATE', 'EXECUTION_DATE', 'START_DT', 'MATURITY_DT'];
  dateFields.forEach(field => {
    if (ret[field]) ret[field] = new Date(ret[field]).toISOString();
  });

  delete ret.__v;
  delete ret.updatedAt;
  return ret;
}

// Pre-save hook (kept all your smart logic)
loanDisbursementSchema.pre('save', async function(next) {
  try {
    // EMI calculation fallback
    if (!this.EMI_AMOUNT && this.AMOUNT && this.INTEREST_RATE && this.TERM_VALUE) {
      const principal = parseFloat(this.AMOUNT.toString());
      const annualRate = parseFloat(this.INTEREST_RATE.toString());
      const term = this.TERM_VALUE;
      const method = this.CALCULATION_METHOD || 'REDUCING_BALANCE';

      let emi;
      if (method === 'FLAT_RATE' || method === 'FIXED_RATE') {
        const totalInterest = principal * (annualRate / 100);
        emi = (principal + totalInterest) / term;
      } else {
        const monthlyRate = annualRate / 100 / 12;
        emi = principal * monthlyRate * Math.pow(1 + monthlyRate, term) /
              (Math.pow(1 + monthlyRate, term) - 1);
      }
      this.EMI_AMOUNT = mongoose.Types.Decimal128.fromString(isFinite(emi) ? emi.toFixed(2) : '0.00');
    }

    // Net amount recalculation
    const amount = this.AMOUNT ? parseFloat(this.AMOUNT.toString()) : 0;
    const fees = this.FEES_AMOUNT ? parseFloat(this.FEES_AMOUNT.toString()) : 0;
    const upfront = this.UPFRONT_INTEREST_AMOUNT ? parseFloat(this.UPFRONT_INTEREST_AMOUNT.toString()) : 0;
    const net = amount - fees - upfront;
    this.NET_DISBURSEMENT_AMOUNT = mongoose.Types.Decimal128.fromString(net > 0 ? net.toFixed(2) : '0.00');

    // Auto-set dates on status change
    if (this.isModified('STATUS')) {
      const now = new Date();
      if (this.STATUS === 'APPROVED' && !this.APPROVAL_DATE) this.APPROVAL_DATE = now;
      if ((this.STATUS === 'EXECUTED' || this.STATUS === 'DISBURSED') && !this.EXECUTION_DATE) {
        this.EXECUTION_DATE = now;
        this.DISBURSEMENT_DATE = now;
      }
    }

    // Generate transaction reference if missing
    if (!this.TRANSACTION_REFERENCE && this.isNew) {
      this.TRANSACTION_REFERENCE = `DISB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    next();
  } catch (err) {
    logger.error('LoanDisbursement pre-save error:', err);
    next(err);
  }
});

// Indexes
loanDisbursementSchema.index({ APPL_ID: 1 }, { unique: true });
loanDisbursementSchema.index({ ACCT_NO: 1 });
loanDisbursementSchema.index({ CUST_ID: 1 });
loanDisbursementSchema.index({ LOAN_ACCOUNT_ID: 1 });
loanDisbursementSchema.index({ GUARANTOR_ID: 1 });
loanDisbursementSchema.index({ STATUS: 1, DISBURSEMENT_DATE: -1 });
loanDisbursementSchema.index({ TRANSACTION_ID: 1 });

const LoanDisbursement = mongoose.models.LoanDisbursement || 
  mongoose.model('LoanDisbursement', loanDisbursementSchema);

export default LoanDisbursement;