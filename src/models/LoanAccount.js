// In models/LoanAccount.js - Updated schema
import mongoose from 'mongoose';
import LoanFee from './LoanFee.js';
import logger from '../utils/logger.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';

const loanAccountSchema = new mongoose.Schema(
  {
    loanAccountId: {
      type: Number,
      required: true,
      unique: true,
      default: () => Date.now()
    },
    guarantorDetails: {
      guarantorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Guarantor',
        required: false
      },
      name: { type: String, required: false },
      phone: { type: String, required: false },
      relationship: { type: String, required: false },
      guarantorNumberId: { type: String, required: false },
      email: { type: String },
      address: { type: String },
      status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'ACTIVE', 'REJECTED'],
        default: 'PENDING'
      },
      guaranteedAmount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      }
    },
    HAS_GUARANTOR: {
      type: Boolean,
      default: true
    },
    workItemId: {
      type: Number,
      required: false
    },
    applicationDate: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },
    JOURNAL_ID: {
      type: String,
      required: true
    },
    CUST_ID: {
      type: Number,
      required: true
    },
    ACCT_NM: {
      type: String,
      required: true,
      trim: true
    },
    ACCT_NO: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: function(v) {
          return v && typeof v === 'string' && v.length >= 10;
        },
        message: props => `${props.value} is not a valid loan account number!`
      }
    },
    APPL_ID: {
      type: String,
      required: true
    },
    PRODUCT_TYPE: {
      type: String,
      required: true,
      trim: true,
      enum: [
        'BUSINESS TERM LOAN',
        'INDIVIDUAL LOAN',
        'CONSUMER LOAN',
        'MORTGAGE',
        'AUTO LOAN',
        'PERSONAL LOAN',
        'EDUCATION LOAN',
        'CREDIT CARD',
        'LINE OF CREDIT',
        'SME LOAN',
        'GENERAL LOAN',
        'GROUP_LOAN' // ADDED: Support for group loans
      ]
    },
    PROD_ID: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) {
          const validProdIds = [1, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 399, 400]; // ADDED: 1 for group loans
          return validProdIds.includes(v);
        },
        message: props => `${props.value} is not a valid PROD_ID!`
      }
    },
    CRNCY_ID: {
      type: String,
      required: true,
      default: 'NGN'
    },
    Borrower_address: {
      street: { type: String, required: true },
      state: { type: String, required: true },
      city: { type: String, required: true },
      zipCode: { type: String, required: true },
      country: { type: String, required: true, default: 'Nigeria' }
    },
    BU_ID: {
      type: String,
      required: true
    },
    PRIMARY_OFFICER_ID: {
      type: String,
      required: true
    },
    SECONDARY_OFFICER_ID: {
      type: String
    },
    deductUpfrontInterest: {
      type: Boolean,
      default: false
    },
    partialUpfrontInterest: {
      type: Boolean,
      default: false
    },
    upfrontInterestPercentage: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0,
      max: 100,
      validate: {
        validator: function(v) {
          return !this.partialUpfrontInterest || (v > 0 && v <= 100);
        },
        message: 'Upfront interest percentage must be between 0-100 when partial upfront interest is enabled'
      }
    },
    upfrontInterestDeducted: {
      type: Boolean,
      default: false
    },
    upfrontInterestAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    remainingInterestAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    DISBURSEMENT_LIMIT: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    ACTUAL_DISBURSEMENT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    START_DT: {
      type: Date,
      required: true,
      default: Date.now
    },
    TERM_CD: {
      type: String,
      required: true,
      enum: ['D', 'W', 'M', 'Q', 'Y', 'MONTHLY', 'WEEKLY', 'YEARLY'] // ADDED: Full word values
    },
    TERM_VALUE: {
      type: Number,
      required: true,
      min: 1
    },
    MATURITY_DT: {
      type: Date,
      required: true
    },
    INTEREST_RATE_ID: {
      type: Number, // FIXED: Changed back to Number for legacy numeric IDs
      required: true,
      validate: {
        validator: function(v) {
          return typeof v === 'number' && v > 0;
        },
        message: props => `${props.value} must be a positive number`
      }
    },
    INTEREST_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    dailyAccruals: [{
      date: { type: Date, required: true },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        required: true,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      },
      isCapitalized: { type: Boolean, default: false },
      glPostingId: { type: mongoose.Schema.Types.ObjectId, ref: 'GeneralLedger' }
    }],
    PAYMENT_FREQUENCY: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
      required: true
    },
    NEXT_PAYMENT_DATE: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v instanceof Date;
        },
        message: 'Next payment date must be a valid date'
      }
    },
    LAST_PAYMENT_DATE: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v instanceof Date;
        },
        message: 'Last payment date must be a valid date'
      }
    },
    LAST_PAYMENT_AMOUNT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    LAST_PAYMENT_METHOD: { type: String },
    LOAN_STATUS: {
      type: String,
      enum: ['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'CLOSED', 'WRITTEN_OFF', 'OVERDUE'],
      default: 'PENDING'
    },
    CLOSURE_DATE: { type: Date },
    TOTAL_REPAID_AMOUNT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    OUTSTANDING_PRINCIPAL: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    principalPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    interestPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    feesPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    outstandingBalance: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    TOTAL_INTEREST: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    TOTAL_REPAYMENT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    lateFeePerDay: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    maxLateFee: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      min: 0
    },
    restrictMultipleDisbursements: {
      type: Boolean,
      default: false
    },
    TRANSACTION_ID: { type: String },
    EVENT_ID: { type: String },
    REPAYMENT_SOURCE_ACCOUNT: { type: String },
    REPAYMENT_SCHEDULE_TYPE: { type: String },
    paymentHistory: [{
      date: Date,
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      },
      installmentNo: Number,
      lateFee: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      },
      paymentMethod: String,
      isEarlyPayment: Boolean,
      isOverduePayment: Boolean
    }],
    FEE_DETAILS: {
      processingFee: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      },
      processingFeeGLCode: { type: String },
      totalFees: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      },
      charges: [{
        chargeId: { type: Number },
        chargeCode: { type: String },
        amount: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => parseFloat(v.toString()),
          set: v => mongoose.Types.Decimal128.fromString(v.toString()),
          default: '0.00',
          min: 0
        },
        name: { type: String },
        glAccountCode: { type: String }
      }],
      upfrontInterest: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      },
      upfrontInterestPercentage: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00',
        min: 0
      }
    },
    // NEW FIELDS FOR GROUP LOANS
    groupLoan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GroupLoan',
      required: false
    },
    loanPurpose: {
      type: String,
      required: false
    },
    individualShare: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    installmentAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00',
      min: 0
    },
    numPeriods: {
      type: Number,
      default: 1
    },
    disbursementMethod: {
      type: String,
      enum: ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY'],
      default: 'BANK_TRANSFER'
    },
    rateConfiguration: {
      rateType: { type: String, default: 'FIXED' },
      interestType: { type: String, default: 'COMPOUND' },
      accrualBasisType: { type: String, default: 'ACTUAL/360' },
      accrualFrequency: { type: String, default: 'DAILY' },
      fixedRate: { type: Boolean, default: true }
    }
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: function(doc, ret) {
        const decimalFields = [
          'DISBURSEMENT_LIMIT',
          'ACTUAL_DISBURSEMENT',
          'TOTAL_REPAID_AMOUNT',
          'OUTSTANDING_PRINCIPAL',
          'upfrontInterestAmount',
          'remainingInterestAmount',
          'upfrontInterestPercentage',
          'TOTAL_INTEREST',
          'TOTAL_REPAYMENT',
          'guarantorDetails.guaranteedAmount',
          'principalPaid',
          'interestPaid',
          'feesPaid',
          'outstandingBalance',
          'lateFeePerDay',
          'maxLateFee',
          'LAST_PAYMENT_AMOUNT',
          'FEE_DETAILS.processingFee',
          'FEE_DETAILS.totalFees',
          'FEE_DETAILS.upfrontInterest',
          'FEE_DETAILS.upfrontInterestPercentage',
          'individualShare', // ADDED: For group loans
          'installmentAmount' // ADDED: For group loans
        ];
        decimalFields.forEach(field => {
          const parts = field.split('.');
          if (parts.length === 1) {
            if (ret[field] && typeof ret[field] === 'object') {
              ret[field] = parseFloat(ret[field].toString());
            }
          } else {
            let obj = ret;
            for (let i = 0; i < parts.length - 1; i++) {
              obj = obj[parts[i]] || {};
            }
            const lastKey = parts[parts.length - 1];
            if (obj[lastKey] && typeof obj[lastKey] === 'object') {
              obj[lastKey] = parseFloat(obj[lastKey].toString());
            }
          }
        });
        if (ret.FEE_DETAILS?.charges) {
          ret.FEE_DETAILS.charges = ret.FEE_DETAILS.charges.map(charge => ({
            ...charge,
            amount: charge.amount && typeof charge.amount === 'object' ? parseFloat(charge.amount.toString()) : charge.amount
          }));
        }
        if (ret.paymentHistory) {
          ret.paymentHistory = ret.paymentHistory.map(payment => ({
            ...payment,
            amount: payment.amount && typeof payment.amount === 'object' ? parseFloat(payment.amount.toString()) : payment.amount,
            lateFee: payment.lateFee && typeof payment.lateFee === 'object' ? parseFloat(payment.lateFee.toString()) : payment.lateFee
          }));
        }
        // NEW: Handle dailyAccruals in toJSON
        if (ret.dailyAccruals) {
          ret.dailyAccruals = ret.dailyAccruals.map(accrual => ({
            ...accrual,
            amount: accrual.amount && typeof accrual.amount === 'object' ? parseFloat(accrual.amount.toString()) : accrual.amount
          }));
        }
        if (ret._id) {
          ret._id = ret._id.toString();
        }
        if (ret.Borrower_address) {
          ret.Borrower_address = {
            street: ret.Borrower_address.street,
            state: ret.Borrower_address.state,
            city: ret.Borrower_address.city,
            zipCode: ret.Borrower_address.zipCode,
            country: ret.Borrower_address.country
          };
        }
        return ret;
      }
    },
    toObject: { getters: true, virtuals: true },
    id: false
  }
);

// Virtual Fields
loanAccountSchema.virtual('daysToMaturity').get(function () {
  if (!this.MATURITY_DT || !(this.MATURITY_DT instanceof Date)) return null;
  return Math.ceil((this.MATURITY_DT - new Date()) / (1000 * 60 * 60 * 24));
});

loanAccountSchema.virtual('nextAccrualDate').get(function () {
  if (!this.dailyAccruals || this.dailyAccruals.length === 0) return this.START_DT;
  const lastAccrual = this.dailyAccruals[this.dailyAccruals.length - 1].date;
  return lastAccrual ? new Date(lastAccrual.setDate(lastAccrual.getDate() + 1)) : this.START_DT;
});

// Instance Methods
loanAccountSchema.methods.isOverdue = function() {
  if (!this.NEXT_PAYMENT_DATE || !(this.NEXT_PAYMENT_DATE instanceof Date) || this.LOAN_STATUS !== 'ACTIVE') {
    return false;
  }
  return this.NEXT_PAYMENT_DATE < new Date();
};

loanAccountSchema.methods.getDaysOverdue = function() {
  if (!this.isOverdue() || !this.NEXT_PAYMENT_DATE) return 0;
  return Math.ceil((new Date() - this.NEXT_PAYMENT_DATE) / (1000 * 60 * 60 * 24));
};

loanAccountSchema.methods.getInterestBreakdown = function() {
  return {
    totalInterest: parseFloat(this.TOTAL_INTEREST.toString()),
    upfrontInterest: parseFloat(this.upfrontInterestAmount.toString()),
    remainingInterest: parseFloat(this.remainingInterestAmount.toString()),
    upfrontPercentage: this.partialUpfrontInterest ?
      parseFloat(this.upfrontInterestPercentage.toString()) :
      (this.deductUpfrontInterest ? 100 : 0),
    disbursedAmount: parseFloat(this.ACTUAL_DISBURSEMENT.toString())
  };
};

// Static Methods
loanAccountSchema.statics.findOverdueLoans = async function() {
  try {
    const loans = await this.find({
      LOAN_STATUS: 'ACTIVE',
      NEXT_PAYMENT_DATE: {
        $lt: new Date(),
        $ne: null,
        $exists: true
      }
    }).lean();
    return loans.map(loan => ({
      ...loan,
      isOverdue: true,
      daysOverdue: loan.NEXT_PAYMENT_DATE ?
        Math.ceil((new Date() - loan.NEXT_PAYMENT_DATE) / (1000 * 60 * 60 * 24)) : 0
    }));
  } catch (error) {
    logger.error('Error finding overdue loans:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
    throw error;
  }
};

loanAccountSchema.statics.markLoansAsOverdue = async function() {
  try {
    const result = await this.updateMany(
      {
        LOAN_STATUS: 'ACTIVE',
        NEXT_PAYMENT_DATE: {
          $lt: new Date(),
          $ne: null,
          $exists: true
        }
      },
      { $set: { LOAN_STATUS: 'OVERDUE' } }
    );
    return result;
  } catch (error) {
    logger.error('Error marking loans as overdue:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
    throw error;
  }
};

// Validation Middleware
loanAccountSchema.pre('validate', function(next) {
  if (this.deductUpfrontInterest && this.partialUpfrontInterest) {
    this.invalidate('partialUpfrontInterest',
      'Cannot have both full upfront and partial upfront interest enabled simultaneously');
  }
  if (this.partialUpfrontInterest && parseFloat(this.upfrontInterestPercentage.toString()) <= 0) {
    this.invalidate('upfrontInterestPercentage',
      'Upfront interest percentage must be greater than 0 for partial upfront interest');
  }
  next();
});

// Pre-save Hook
loanAccountSchema.pre('save', async function(next) {
  try {
    if (!this.PROD_ID) {
      throw new Error('Could not determine product ID for this loan');
    }
    logger.debug('Loan Account PROD_ID validation', {
      loanAccountId: this._id,
      PROD_ID: this.PROD_ID,
      timestamp: new Date()
    });
    if (!this.ACCT_NO && this.PROD_ID) {
      this.ACCT_NO = String(await generateLoanAccountNumberByProdId(this.PROD_ID));
    }
    if (!this.loanAccountId && this.ACCT_NO) {
      const numericPart = String(this.ACCT_NO).replace(/\D/g, '');
      this.loanAccountId = parseInt(numericPart, 10) || Date.now();
    }
    // Set default workItemId if not provided
    if (!this.workItemId) {
      this.workItemId = Date.now(); // Use timestamp as default workItemId
    }
    if (this.restrictMultipleDisbursements && ['APPROVED', 'ACTIVE'].includes(this.LOAN_STATUS)) {
      const existingLoan = await this.constructor.findOne({
        CUST_ID: this.CUST_ID,
        PROD_ID: this.PROD_ID,
        LOAN_STATUS: { $in: ['APPROVED', 'ACTIVE'] },
        _id: { $ne: this._id }
      });
      if (existingLoan) {
        const error = new Error(`Customer ${this.CUST_ID} already has an approved or active loan for product ${this.PROD_ID}. Multiple disbursements are restricted.`);
        error.name = 'ValidationError';
        return next(error);
      }
    }
    if (this.isModified('TERM_CD') || this.isModified('TERM_VALUE') || this.isModified('START_DT')) {
      if (!this.TERM_CD || !this.TERM_VALUE || !this.START_DT) {
        throw new Error('TERM_CD, TERM_VALUE, and START_DT are required to compute MATURITY_DT');
      }
      this.MATURITY_DT = calculateMaturityDate(this.START_DT, this.TERM_CD, this.TERM_VALUE);
    }
    // FIXED: Interest calc - Align with EMI (simple interest as placeholder; ideally pull from EMI result)
    if (this.isModified('DISBURSEMENT_LIMIT') ||
        this.isModified('INTEREST_RATE') ||
        this.isModified('TERM_VALUE') ||
        this.isModified('TERM_CD') ||
        this.isModified('deductUpfrontInterest') ||
        this.isModified('partialUpfrontInterest') ||
        this.isModified('upfrontInterestPercentage')) {
      const principal = parseFloat(this.DISBURSEMENT_LIMIT?.toString() || '0');
      const rate = parseFloat(this.INTEREST_RATE?.toString() || '0') / 100;
      if (principal <= 0 || rate <= 0) {
        this.TOTAL_INTEREST = mongoose.Types.Decimal128.fromString('0.00');
      } else {
        const termInYears = this.TERM_CD === 'M' ? this.TERM_VALUE / 12 :
                           this.TERM_CD === 'D' ? this.TERM_VALUE / 365 :
                           this.TERM_CD === 'W' ? this.TERM_VALUE / 52 :
                           this.TERM_CD === 'Q' ? this.TERM_VALUE / 4 :
                           this.TERM_VALUE;
        const totalInterest = principal * rate * termInYears;
        this.TOTAL_INTEREST = mongoose.Types.Decimal128.fromString(totalInterest.toFixed(2));
      }
      // FIXED: Null-safety for upfront/remaining
      const totalInterestNum = parseFloat(this.TOTAL_INTEREST?.toString() || '0');
      if (this.deductUpfrontInterest) {
        this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString(totalInterestNum.toFixed(2));
        this.remainingInterestAmount = mongoose.Types.Decimal128.fromString('0.00');
      } else if (this.partialUpfrontInterest) {
        const percentage = parseFloat(this.upfrontInterestPercentage?.toString() || '0') / 100;
        if (percentage <= 0 || percentage > 1) {
          throw new Error('Upfront interest percentage must be between 0-100%');
        }
        const upfrontAmount = totalInterestNum * percentage;
        this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString(upfrontAmount.toFixed(2));
        this.remainingInterestAmount = mongoose.Types.Decimal128.fromString((totalInterestNum - upfrontAmount).toFixed(2));
      } else {
        this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString('0.00');
        this.remainingInterestAmount = this.TOTAL_INTEREST;
      }
    }
    // Calculate ACTUAL_DISBURSEMENT - FIXED null-safety
    if (this.isModified('DISBURSEMENT_LIMIT') ||
        this.isModified('FEE_DETAILS') ||
        this.isModified('upfrontInterestAmount')) {
      const principal = parseFloat(this.DISBURSEMENT_LIMIT?.toString() || '0');
      const totalFees = parseFloat(this.FEE_DETAILS?.totalFees?.toString() || '0');
      const upfrontInterest = parseFloat(this.upfrontInterestAmount?.toString() || '0');
      const actualDisbursement = principal - totalFees - upfrontInterest;
      if (actualDisbursement < 0) {
        throw new Error('Actual disbursement cannot be negative');
      }
      this.ACTUAL_DISBURSEMENT = mongoose.Types.Decimal128.fromString(actualDisbursement.toFixed(2));
    }
    if (this.isModified('NEXT_PAYMENT_DATE') || this.isModified('LOAN_STATUS')) {
      if (this.isOverdue()) {
        this.LOAN_STATUS = 'OVERDUE';
      }
    }
    this.lastUpdated = new Date();
    next();
  } catch (err) {
    logger.error('Error in loanAccountSchema pre-save hook', {
      message: err.message,
      stack: err.stack,
      ACCT_NO: this.ACCT_NO,
      PROD_ID: this.PROD_ID,
      timestamp: new Date()
    });
    next(err);
  }
});

// Helper Function
function calculateMaturityDate(startDate, termCode, termValue) {
  if (!startDate || !termCode || !termValue) {
    throw new Error('Invalid parameters for maturity date calculation');
  }
  const date = new Date(startDate);
 
  // Handle both short codes and full words
  switch (termCode.toUpperCase()) {
    case 'D':
    case 'DAILY':
      date.setDate(date.getDate() + termValue);
      break;
    case 'W':
    case 'WEEKLY':
      date.setDate(date.getDate() + (7 * termValue));
      break;
    case 'M':
    case 'MONTHLY':
      date.setMonth(date.getMonth() + termValue);
      break;
    case 'Q':
    case 'QUARTERLY':
      date.setMonth(date.getMonth() + (3 * termValue));
      break;
    case 'Y':
    case 'YEARLY':
      date.setFullYear(date.getFullYear() + termValue);
      break;
    default:
      throw new Error(`Invalid term code: ${termCode}`);
  }
  return date;
};

// Add this method to your LoanAccountController.js



const LoanAccount = mongoose.models.LoanAccount ||
  mongoose.model('LoanAccount', loanAccountSchema);

export default LoanAccount;