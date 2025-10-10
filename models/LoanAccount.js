
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
      guarantorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Guarantor', required: true },
      name: { type: String, required: true },
      phone: { type: String, required: true },
      relationship: { type: String, required: true },
      guarantorNumberId: { type: String, required: true },
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
        default: '0.00'
      }
    },
    HAS_GUARANTOR: {
      type: Boolean,
      default: true
    },
    workItemId: {
      type: Number,
      required: true
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
        'GENERAL LOAN'
      ]
    },
    PROD_ID: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) {
          const validProdIds = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 399];
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
      Street: { type: String, required: true },
      State: { type: String, required: true },
      City: { type: String, required: true },
      ZIPCode: { type: String, required: true },
      Country: { type: String, required: true, default: 'Nigeria' }
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
      default: '0.00'
    },
    remainingInterestAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
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
      default: '0.00'
    },
    START_DT: {
      type: Date,
      required: true,
      default: Date.now
    },
    TERM_CD: {
      type: String,
      required: true,
      enum: ['D', 'W', 'M', 'Q', 'Y']
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
      type: Number,
      required: true
    },
    INTEREST_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    dailyAccruals: [{
      date: { type: Date, required: true },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        required: true,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00'
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
      default: '0.00'
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
      default: '0.00'
    },
    OUTSTANDING_PRINCIPAL: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    principalPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    interestPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    feesPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    outstandingBalance: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    TOTAL_INTEREST: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    TOTAL_REPAYMENT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    lateFeePerDay: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString()),
      default: '0.00'
    },
    maxLateFee: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => parseFloat(v.toString()),
      set: v => mongoose.Types.Decimal128.fromString(v.toString())
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
        default: '0.00'
      },
      installmentNo: Number,
      lateFee: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00'
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
        default: '0.00'
      },
      processingFeeGLCode: { type: String },
      totalFees: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00'
      },
      charges: [{
        chargeId: { type: Number },
        chargeCode: { type: String },
        amount: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => parseFloat(v.toString()),
          set: v => mongoose.Types.Decimal128.fromString(v.toString()),
          default: '0.00'
        },
        name: { type: String },
        glAccountCode: { type: String }
      }],
      upfrontInterest: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00'
      },
      upfrontInterestPercentage: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        default: '0.00'
      }
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
          'FEE_DETAILS.upfrontInterestPercentage'
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

        if (ret._id) {
          ret._id = ret._id.toString();
        }

        if (ret.Borrower_address) {
          ret.Borrower_address = {
            Street: ret.Borrower_address.Street,
            State: ret.Borrower_address.State,
            City: ret.Borrower_address.City,
            ZIPCode: ret.Borrower_address.ZIPCode,
            Country: ret.Borrower_address.Country
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
      throw {
        code: 'MISSING_PRODUCT_ID',
        message: 'Could not determine product ID for this loan',
        status: 400
      };
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

    if (this.isModified('DISBURSEMENT_LIMIT') ||
        this.isModified('INTEREST_RATE') ||
        this.isModified('TERM_VALUE') ||
        this.isModified('TERM_CD') ||
        this.isModified('deductUpfrontInterest') ||
        this.isModified('partialUpfrontInterest') ||
        this.isModified('upfrontInterestPercentage')) {

      const principal = parseFloat(this.DISBURSEMENT_LIMIT.toString());
      const rate = parseFloat(this.INTEREST_RATE.toString()) / 100;
      const termInYears = this.TERM_CD === 'M' ? this.TERM_VALUE / 12 :
                         this.TERM_CD === 'D' ? this.TERM_VALUE / 365 :
                         this.TERM_CD === 'W' ? this.TERM_VALUE / 52 :
                         this.TERM_CD === 'Q' ? this.TERM_VALUE / 4 :
                         this.TERM_VALUE;

      const totalInterest = principal * rate * termInYears;
      this.TOTAL_INTEREST = mongoose.Types.Decimal128.fromString(totalInterest.toFixed(2));

      if (this.deductUpfrontInterest) {
        this.upfrontInterestAmount = this.TOTAL_INTEREST;
        this.remainingInterestAmount = mongoose.Types.Decimal128.fromString('0.00');
      }
      else if (this.partialUpfrontInterest) {
        const percentage = parseFloat(this.upfrontInterestPercentage.toString()) / 100;
        const upfrontAmount = totalInterest * percentage;
        this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString(upfrontAmount.toFixed(2));
        this.remainingInterestAmount = mongoose.Types.Decimal128.fromString((totalInterest - upfrontAmount).toFixed(2));
      }
      else {
        this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString('0.00');
        this.remainingInterestAmount = this.TOTAL_INTEREST;
      }
    }

    // Calculate ACTUAL_DISBURSEMENT
    if (this.isModified('DISBURSEMENT_LIMIT') ||
        this.isModified('FEE_DETAILS') ||
        this.isModified('upfrontInterestAmount')) {

      const principal = parseFloat(this.DISBURSEMENT_LIMIT.toString());
      const totalFees = parseFloat(this.FEE_DETAILS?.totalFees?.toString() || '0');
      const upfrontInterest = parseFloat(this.upfrontInterestAmount.toString());
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
  switch (termCode) {
    case 'D': date.setDate(date.getDate() + termValue); break;
    case 'W': date.setDate(date.getDate() + (7 * termValue)); break;
    case 'M': date.setMonth(date.getMonth() + termValue); break;
    case 'Q': date.setMonth(date.getMonth() + (3 * termValue)); break;
    case 'Y': date.setFullYear(date.getFullYear() + termValue); break;
    default: throw new Error(`Invalid term code: ${termCode}`);
  }
  return date;
}

const LoanAccount = mongoose.models.LoanAccount ||
  mongoose.model('LoanAccount', loanAccountSchema);

export default LoanAccount;
