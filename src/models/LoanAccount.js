import mongoose from 'mongoose';
import LoanFee from './LoanFee.js';
import logger from '../utils/logger.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';

// Utility functions for safe Decimal128 handling
const safeDecimalGetter = (v) => {
  if (!v) return 0;
  try {
    return typeof v === 'object' && v.toString ? parseFloat(v.toString()) : parseFloat(v);
  } catch (error) {
    logger.warn(`Error in decimal getter: ${error.message}`, { value: v });
    return 0;
  }
};

const safeDecimalSetter = (v) => {
  if (!v && v !== 0) return mongoose.Types.Decimal128.fromString('0.00');
  try {
    return mongoose.Types.Decimal128.fromString(v.toString());
  } catch (error) {
    logger.warn(`Error in decimal setter: ${error.message}`, { value: v });
    return mongoose.Types.Decimal128.fromString('0.00');
  }
};

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
        get: safeDecimalGetter,
        set: safeDecimalSetter,
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
        'PERSONAL_LOAN',
        'BUSINESS_LOAN', 
        'MORTGAGE_LOAN',
        'AUTO_LOAN',
        'EDUCATION_LOAN',
        'CONSUMER_LOAN',
        'SME_LOAN',
        'AGRICULTURAL_LOAN',
        'DAILY_LOAN',
        'WEEKLY_LOAN',
        'GROUP_LOAN',
        'MONTHLY_LOAN',
        'GROUP_MONTHLY_LOAN',
        'ASSET_LOAN',
        'SOLAR_LOAN',
        'RAPID_CASH_LOAN',
        'STAFF_SALARY_ADVANCE',
        'STAFF_LOAN',
        'INDIVIDUAL_LOAN',
        'CORPORATE_LOAN',
        'OVERDRAFT',
        'HOME_IMPROVEMENT_LOAN',
        'SMALL_MEDIUM_ENTERPRISE_LOAN',
        'SCHOOL_IMPROVEMENT_LOAN',
        'AGRICULTURE_LOAN',
      ]
    },
    PROD_ID: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) {
          const validProdIds = [
            1, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 
            310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 399, 400
          ];
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
      get: safeDecimalGetter,
      set: safeDecimalSetter,
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
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    remainingInterestAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    DISBURSEMENT_LIMIT: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    ACTUAL_DISBURSEMENT: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
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
      enum: ['D', 'W', 'M', 'Q', 'Y', 'MONTHLY', 'WEEKLY', 'YEARLY']
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
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    dailyAccruals: [{
      date: { type: Date, required: true },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        required: true,
        get: safeDecimalGetter,
        set: safeDecimalSetter,
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
      get: safeDecimalGetter,
      set: safeDecimalSetter,
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
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    OUTSTANDING_PRINCIPAL: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    principalPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    interestPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    feesPaid: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    outstandingBalance: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    TOTAL_INTEREST: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    TOTAL_REPAYMENT: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    lateFeePerDay: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    maxLateFee: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
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
        get: safeDecimalGetter,
        set: safeDecimalSetter,
        default: '0.00',
        min: 0
      },
      installmentNo: Number,
      lateFee: {
        type: mongoose.Schema.Types.Decimal128,
        get: safeDecimalGetter,
        set: safeDecimalSetter,
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
        get: safeDecimalGetter,
        set: safeDecimalSetter,
        default: '0.00',
        min: 0
      },
      processingFeeGLCode: { type: String },
      totalFees: {
        type: mongoose.Schema.Types.Decimal128,
        get: safeDecimalGetter,
        set: safeDecimalSetter,
        default: '0.00',
        min: 0
      },
      charges: [{
        chargeId: { type: Number },
        chargeCode: { type: String },
        amount: {
          type: mongoose.Schema.Types.Decimal128,
          get: safeDecimalGetter,
          set: safeDecimalSetter,
          default: '0.00',
          min: 0
        },
        name: { type: String },
        glAccountCode: { type: String }
      }],
      upfrontInterest: {
        type: mongoose.Schema.Types.Decimal128,
        get: safeDecimalGetter,
        set: safeDecimalSetter,
        default: '0.00',
        min: 0
      },
      upfrontInterestPercentage: {
        type: mongoose.Schema.Types.Decimal128,
        get: safeDecimalGetter,
        set: safeDecimalSetter,
        default: '0.00',
        min: 0
      }
    },
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
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    installmentAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
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
    },
    total_repayment: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    outstanding_balance: {
      type: mongoose.Schema.Types.Decimal128,
      get: safeDecimalGetter,
      set: safeDecimalSetter,
      default: '0.00',
      min: 0
    },
    CLOSED_DATE: {
      type: Date
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
          'individualShare',
          'installmentAmount',
          'total_repayment',
          'outstanding_balance'
        ];
        
        decimalFields.forEach(field => {
          const parts = field.split('.');
          if (parts.length === 1) {
            if (ret[field] && typeof ret[field] === 'object') {
              try {
                ret[field] = parseFloat(ret[field].toString());
              } catch (error) {
                logger.warn(`Error parsing decimal field ${field}: ${error.message}`);
                ret[field] = 0;
              }
            } else if (ret[field] === undefined || ret[field] === null) {
              ret[field] = 0;
            }
          } else {
            let obj = ret;
            for (let i = 0; i < parts.length - 1; i++) {
              if (!obj || typeof obj !== 'object') {
                obj = {};
                break;
              }
              if (!obj[parts[i]]) {
                obj[parts[i]] = {};
              }
              obj = obj[parts[i]];
            }
            const lastKey = parts[parts.length - 1];
            if (obj && obj[lastKey] && typeof obj[lastKey] === 'object') {
              try {
                obj[lastKey] = parseFloat(obj[lastKey].toString());
              } catch (error) {
                logger.warn(`Error parsing nested decimal field ${field}: ${error.message}`);
                obj[lastKey] = 0;
              }
            } else if (obj && (obj[lastKey] === undefined || obj[lastKey] === null)) {
              obj[lastKey] = 0;
            }
          }
        });
        
        if (ret.FEE_DETAILS?.charges) {
          ret.FEE_DETAILS.charges = ret.FEE_DETAILS.charges.map(charge => ({
            ...charge,
            amount: charge.amount && typeof charge.amount === 'object' ? 
              (() => {
                try {
                  return parseFloat(charge.amount.toString());
                } catch (error) {
                  logger.warn(`Error parsing charge amount: ${error.message}`);
                  return 0;
                }
              })() : 
              charge.amount || 0
          }));
        }
        
        if (ret.paymentHistory) {
          ret.paymentHistory = ret.paymentHistory.map(payment => ({
            ...payment,
            amount: payment.amount && typeof payment.amount === 'object' ? 
              (() => {
                try {
                  return parseFloat(payment.amount.toString());
                } catch (error) {
                  logger.warn(`Error parsing payment amount: ${error.message}`);
                  return 0;
                }
              })() : 
              payment.amount || 0,
            lateFee: payment.lateFee && typeof payment.lateFee === 'object' ? 
              (() => {
                try {
                  return parseFloat(payment.lateFee.toString());
                } catch (error) {
                  logger.warn(`Error parsing payment lateFee: ${error.message}`);
                  return 0;
                }
              })() : 
              payment.lateFee || 0
          }));
        }
        
        if (ret.dailyAccruals) {
          ret.dailyAccruals = ret.dailyAccruals.map(accrual => ({
            ...accrual,
            amount: accrual.amount && typeof accrual.amount === 'object' ? 
              (() => {
                try {
                  return parseFloat(accrual.amount.toString());
                } catch (error) {
                  logger.warn(`Error parsing accrual amount: ${error.message}`);
                  return 0;
                }
              })() : 
              accrual.amount || 0
          }));
        }
        
        if (ret._id) {
          ret._id = ret._id.toString();
        }
        
        if (ret.Borrower_address) {
          ret.Borrower_address = {
            street: ret.Borrower_address.street || '',
            state: ret.Borrower_address.state || '',
            city: ret.Borrower_address.city || '',
            zipCode: ret.Borrower_address.zipCode || '',
            country: ret.Borrower_address.country || 'Nigeria'
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
  try {
    if (!this.MATURITY_DT || !(this.MATURITY_DT instanceof Date)) return null;
    const maturityDate = new Date(this.MATURITY_DT);
    const currentDate = new Date();
    return Math.ceil((maturityDate - currentDate) / (1000 * 60 * 60 * 24));
  } catch (error) {
    logger.warn(`Error calculating daysToMaturity: ${error.message}`);
    return null;
  }
});

loanAccountSchema.virtual('nextAccrualDate').get(function () {
  try {
    if (!this.dailyAccruals || this.dailyAccruals.length === 0) {
      return this.START_DT || new Date();
    }
    
    const lastAccrual = this.dailyAccruals[this.dailyAccruals.length - 1];
    if (!lastAccrual || !lastAccrual.date) {
      return this.START_DT || new Date();
    }
    
    const nextDate = new Date(lastAccrual.date);
    nextDate.setDate(nextDate.getDate() + 1);
    return nextDate;
  } catch (error) {
    logger.warn(`Error calculating nextAccrualDate: ${error.message}`);
    return this.START_DT || new Date();
  }
});

loanAccountSchema.virtual('totalOutstanding').get(function () {
  try {
    const principal = this.OUTSTANDING_PRINCIPAL ? 
      safeDecimalGetter(this.OUTSTANDING_PRINCIPAL) : 0;
    
    const totalInterest = this.TOTAL_INTEREST ?
      safeDecimalGetter(this.TOTAL_INTEREST) : 0;
    
    const interestPaid = this.interestPaid ?
      safeDecimalGetter(this.interestPaid) : 0;
    
    const interest = totalInterest - interestPaid;
    return principal + Math.max(0, interest);
  } catch (error) {
    logger.warn(`Error calculating totalOutstanding: ${error.message}`);
    return 0;
  }
});

// Instance Methods
loanAccountSchema.methods.isOverdue = function() {
  try {
    if (!this.NEXT_PAYMENT_DATE || 
        !(this.NEXT_PAYMENT_DATE instanceof Date) || 
        isNaN(this.NEXT_PAYMENT_DATE.getTime()) ||
        this.LOAN_STATUS !== 'ACTIVE') {
      return false;
    }
    return this.NEXT_PAYMENT_DATE < new Date();
  } catch (error) {
    logger.warn(`Error in isOverdue method: ${error.message}`);
    return false;
  }
};

loanAccountSchema.methods.getDaysOverdue = function() {
  try {
    if (!this.isOverdue() || !this.NEXT_PAYMENT_DATE) return 0;
    return Math.ceil((new Date() - this.NEXT_PAYMENT_DATE) / (1000 * 60 * 60 * 24));
  } catch (error) {
    logger.warn(`Error in getDaysOverdue method: ${error.message}`);
    return 0;
  }
};

loanAccountSchema.methods.safeDecimalToString = function(fieldName) {
  try {
    const value = this[fieldName];
    if (!value && value !== 0) return '0.00';
    
    if (typeof value === 'object' && value.toString) {
      try {
        return value.toString();
      } catch (error) {
        return '0.00';
      }
    }
    return String(value);
  } catch (error) {
    logger.warn(`Error in safeDecimalToString for ${fieldName}: ${error.message}`);
    return '0.00';
  }
};

loanAccountSchema.methods.getInterestBreakdown = function() {
  try {
    return {
      totalInterest: this.TOTAL_INTEREST ? safeDecimalGetter(this.TOTAL_INTEREST) : 0,
      upfrontInterest: this.upfrontInterestAmount ? safeDecimalGetter(this.upfrontInterestAmount) : 0,
      remainingInterest: this.remainingInterestAmount ? safeDecimalGetter(this.remainingInterestAmount) : 0,
      upfrontPercentage: this.partialUpfrontInterest ?
        (this.upfrontInterestPercentage ? safeDecimalGetter(this.upfrontInterestPercentage) : 0) :
        (this.deductUpfrontInterest ? 100 : 0),
      disbursedAmount: this.ACTUAL_DISBURSEMENT ? safeDecimalGetter(this.ACTUAL_DISBURSEMENT) : 0
    };
  } catch (error) {
    logger.warn(`Error in getInterestBreakdown: ${error.message}`);
    return {
      totalInterest: 0,
      upfrontInterest: 0,
      remainingInterest: 0,
      upfrontPercentage: 0,
      disbursedAmount: 0
    };
  }
};

loanAccountSchema.methods.updateBalances = function(principalAmount, interestAmount, totalAmount) {
  try {
    const principalNum = parseFloat(principalAmount || '0');
    const interestNum = parseFloat(interestAmount || '0');
    const totalNum = parseFloat(totalAmount || '0');
    
    const currentPrincipal = this.OUTSTANDING_PRINCIPAL ? safeDecimalGetter(this.OUTSTANDING_PRINCIPAL) : 0;
    const currentPrincipalPaid = this.principalPaid ? safeDecimalGetter(this.principalPaid) : 0;
    const currentInterestPaid = this.interestPaid ? safeDecimalGetter(this.interestPaid) : 0;
    const currentTotalRepaid = this.TOTAL_REPAID_AMOUNT ? safeDecimalGetter(this.TOTAL_REPAID_AMOUNT) : 0;
    const currentTotalRepayment = this.total_repayment ? safeDecimalGetter(this.total_repayment) : 0;
    const currentOutstandingBalance = this.outstanding_balance ? safeDecimalGetter(this.outstanding_balance) : 0;
    
    this.OUTSTANDING_PRINCIPAL = safeDecimalSetter(
      Math.max(0, currentPrincipal - principalNum).toFixed(2)
    );
    this.principalPaid = safeDecimalSetter(
      (currentPrincipalPaid + principalNum).toFixed(2)
    );
    this.interestPaid = safeDecimalSetter(
      (currentInterestPaid + interestNum).toFixed(2)
    );
    this.TOTAL_REPAID_AMOUNT = safeDecimalSetter(
      (currentTotalRepaid + totalNum).toFixed(2)
    );
    this.total_repayment = safeDecimalSetter(
      (currentTotalRepayment + totalNum).toFixed(2)
    );
    this.outstanding_balance = safeDecimalSetter(
      Math.max(0, currentOutstandingBalance - totalNum).toFixed(2)
    );
    
    // Update loan status if fully paid
    if (safeDecimalGetter(this.OUTSTANDING_PRINCIPAL) <= 0) {
      this.LOAN_STATUS = 'CLOSED';
      this.CLOSURE_DATE = new Date();
      this.CLOSED_DATE = new Date();
    }
  } catch (error) {
    logger.error(`Error in updateBalances: ${error.message}`, { stack: error.stack });
    throw error;
  }
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
    
    return loans.map(loan => {
      try {
        const nextPaymentDate = loan.NEXT_PAYMENT_DATE ? new Date(loan.NEXT_PAYMENT_DATE) : null;
        const daysOverdue = nextPaymentDate ? 
          Math.ceil((new Date() - nextPaymentDate) / (1000 * 60 * 60 * 24)) : 0;
        
        return {
          ...loan,
          isOverdue: true,
          daysOverdue: daysOverdue
        };
      } catch (error) {
        logger.warn(`Error processing loan ${loan._id}: ${error.message}`);
        return {
          ...loan,
          isOverdue: false,
          daysOverdue: 0
        };
      }
    });
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
  try {
    if (this.deductUpfrontInterest && this.partialUpfrontInterest) {
      this.invalidate('partialUpfrontInterest',
        'Cannot have both full upfront and partial upfront interest enabled simultaneously');
    }
    
    if (this.partialUpfrontInterest) {
      const upfrontPercentage = this.upfrontInterestPercentage ? safeDecimalGetter(this.upfrontInterestPercentage) : 0;
      if (upfrontPercentage <= 0) {
        this.invalidate('upfrontInterestPercentage',
          'Upfront interest percentage must be greater than 0 for partial upfront interest');
      }
    }
    
    next();
  } catch (error) {
    logger.error(`Error in pre-validate hook: ${error.message}`);
    next(error);
  }
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
      this.workItemId = Date.now();
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
    
    // Interest calculation
    if (this.isModified('DISBURSEMENT_LIMIT') ||
        this.isModified('INTEREST_RATE') ||
        this.isModified('TERM_VALUE') ||
        this.isModified('TERM_CD') ||
        this.isModified('deductUpfrontInterest') ||
        this.isModified('partialUpfrontInterest') ||
        this.isModified('upfrontInterestPercentage')) {
      
      const principal = this.DISBURSEMENT_LIMIT ? safeDecimalGetter(this.DISBURSEMENT_LIMIT) : 0;
      const rate = this.INTEREST_RATE ? safeDecimalGetter(this.INTEREST_RATE) / 100 : 0;
      
      if (principal <= 0 || rate <= 0) {
        this.TOTAL_INTEREST = safeDecimalSetter('0.00');
      } else {
        const termInYears = this.TERM_CD === 'M' ? this.TERM_VALUE / 12 :
                           this.TERM_CD === 'D' ? this.TERM_VALUE / 365 :
                           this.TERM_CD === 'W' ? this.TERM_VALUE / 52 :
                           this.TERM_CD === 'Q' ? this.TERM_VALUE / 4 :
                           this.TERM_VALUE;
        const totalInterest = principal * rate * termInYears;
        this.TOTAL_INTEREST = safeDecimalSetter(totalInterest.toFixed(2));
      }
      
      const totalInterestNum = this.TOTAL_INTEREST ? safeDecimalGetter(this.TOTAL_INTEREST) : 0;
      
      if (this.deductUpfrontInterest) {
        this.upfrontInterestAmount = safeDecimalSetter(totalInterestNum.toFixed(2));
        this.remainingInterestAmount = safeDecimalSetter('0.00');
      } else if (this.partialUpfrontInterest) {
        const percentage = this.upfrontInterestPercentage ? safeDecimalGetter(this.upfrontInterestPercentage) / 100 : 0;
        if (percentage <= 0 || percentage > 1) {
          throw new Error('Upfront interest percentage must be between 0-100%');
        }
        const upfrontAmount = totalInterestNum * percentage;
        this.upfrontInterestAmount = safeDecimalSetter(upfrontAmount.toFixed(2));
        this.remainingInterestAmount = safeDecimalSetter((totalInterestNum - upfrontAmount).toFixed(2));
      } else {
        this.upfrontInterestAmount = safeDecimalSetter('0.00');
        this.remainingInterestAmount = this.TOTAL_INTEREST;
      }
    }
    
    // Calculate ACTUAL_DISBURSEMENT
    if (this.isModified('DISBURSEMENT_LIMIT') ||
        this.isModified('FEE_DETAILS') ||
        this.isModified('upfrontInterestAmount')) {
      
      const principal = this.DISBURSEMENT_LIMIT ? safeDecimalGetter(this.DISBURSEMENT_LIMIT) : 0;
      const totalFees = this.FEE_DETAILS?.totalFees ? safeDecimalGetter(this.FEE_DETAILS.totalFees) : 0;
      const upfrontInterest = this.upfrontInterestAmount ? safeDecimalGetter(this.upfrontInterestAmount) : 0;
      const actualDisbursement = principal - totalFees - upfrontInterest;
      
      if (actualDisbursement < 0) {
        throw new Error('Actual disbursement cannot be negative');
      }
      this.ACTUAL_DISBURSEMENT = safeDecimalSetter(actualDisbursement.toFixed(2));
    }
    
    // Initialize new fields if not set
    if (!this.total_repayment || safeDecimalGetter(this.total_repayment) === 0) {
      this.total_repayment = safeDecimalSetter('0.00');
    }
    if (!this.outstanding_balance || safeDecimalGetter(this.outstanding_balance) === 0) {
      this.outstanding_balance = this.OUTSTANDING_PRINCIPAL || safeDecimalSetter('0.00');
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
}

const LoanAccount = mongoose.models.LoanAccount ||
  mongoose.model('LoanAccount', loanAccountSchema);

export default LoanAccount;