import mongoose from 'mongoose';
import LoanFee from './LoanFee.js';
import logger from '../utils/logger.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';

const loanAccountSchema = new mongoose.Schema(
  {
    // Custom Numeric ID Field
    loanAccountId: {
      type: Number,
      required: true,
      unique: true,
      default: () => Date.now() // Auto-generate
    },
    guarantorDetails: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      relationship: { type: String, required: true },
      guarantorNumberId: { type: String, required: true },
      email: { type: String }, // optional
      address: { type: String } // optional
    },
    applicationDate: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now },

    JOURNAL_ID: {
      type: String,
      required: true,
      
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
      uppercase: true
    },
    PROD_ID: {
      type: Number,
      required: true
    },
    CRNCY_ID: {
      type: String,
      required: true,
      uppercase: true,
      default: 'NGN'
    },

    // Operational Fields
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

    // Upfront Interest Fields
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
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00'),
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
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    remainingInterestAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },

    // Financial Fields
    DISBURSEMENT_LIMIT: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      min: 0,
      validate: {
        validator: v => v !== null,
        message: 'Disbursement limit cannot be null'
      }
    },
    ACTUAL_DISBURSEMENT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },

    // Term Information
    START_DT: {
      type: Date,
      required: true,
      default: Date.now
    },
    TERM_CD: {
      type: String,
      required: true,
      enum: ['D', 'W', 'M', 'Q', 'Y'],
      uppercase: true
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

    // Interest Configuration
    INTEREST_RATE_ID: {
      type: Number,
      required: true
    },
    INTEREST_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },

    // Daily Accrual Tracking
    dailyAccruals: [{
      date: {
        type: Date,
        required: true
      },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        required: true,
        get: v => v ? parseFloat(v.toString()) : 0,
        default: mongoose.Types.Decimal128.fromString('0.00')
      },
      isCapitalized: {
        type: Boolean,
        default: false
      },
      glPostingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'GeneralLedger'
      }
    }],

    // Payment Tracking
    PAYMENT_FREQUENCY: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
      uppercase: true
    },
    NEXT_PAYMENT_DATE: {
      type: Date,
      validate: {
        validator: function(v) {
          return !v || v instanceof Date;
        },
        message: 'Payment date must be a valid date'
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

    // Status Fields
    LOAN_STATUS: {
      type: String,
      enum: ['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'CLOSED', 'WRITTEN_OFF', 'OVERDUE'],
      default: 'PENDING',
      uppercase: true
    },
    CLOSED_DT: {
      type: Date
    },

    // Financial Tracking
    TOTAL_REPAID_AMOUNT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    OUTSTANDING_PRINCIPAL: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    LEDGER_BALANCE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    CLEARED_BALANCE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    TOTAL_INTEREST: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    TOTAL_REPAYMENT: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00')
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
          'TOTAL_REPAYMENT'
        ];
        
        decimalFields.forEach(field => {
          if (ret[field] && typeof ret[field] === 'object') {
            ret[field] = parseFloat(ret[field].toString());
          }
        });
        
        if (ret._id) {
          ret._id = ret._id.toString();
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
    disbursedAmount: parseFloat(this.ACTUAL_DISBURSEMENT.toString()),
    repaymentSchedule: this.generateRepaymentSchedule()
  };
};

loanAccountSchema.methods.generateRepaymentSchedule = function() {
  if (!this.PAYMENT_FREQUENCY || !this.START_DT || !this.MATURITY_DT) return null;
  
  const schedule = [];
  let currentDate = new Date(this.START_DT);
  const principal = parseFloat(this.DISBURSEMENT_LIMIT.toString());
  const totalInterest = parseFloat(this.TOTAL_INTEREST.toString());
  const upfrontInterest = parseFloat(this.upfrontInterestAmount.toString());
  const remainingInterest = totalInterest - upfrontInterest;
  
  // Calculate number of payments based on frequency
  let paymentCount = 0;
  switch(this.PAYMENT_FREQUENCY) {
    case 'MONTHLY':
      paymentCount = this.TERM_CD === 'M' ? this.TERM_VALUE : 
                   this.TERM_CD === 'Y' ? this.TERM_VALUE * 12 : 1;
      break;
    case 'WEEKLY':
      paymentCount = this.TERM_CD === 'W' ? this.TERM_VALUE :
                   this.TERM_CD === 'M' ? this.TERM_VALUE * 4 :
                   this.TERM_CD === 'Y' ? this.TERM_VALUE * 52 : 1;
      break;
    case 'DAILY':
      paymentCount = this.TERM_CD === 'D' ? this.TERM_VALUE :
                   this.TERM_CD === 'W' ? 7 :
                   this.TERM_CD === 'M' ? 30 :
                   this.TERM_CD === 'Y' ? 365 : 1;
      break;
    case 'QUARTERLY':
      paymentCount = this.TERM_CD === 'Q' ? this.TERM_VALUE :
                   this.TERM_CD === 'Y' ? this.TERM_VALUE * 4 : 1;
      break;
    case 'YEARLY':
      paymentCount = this.TERM_CD === 'Y' ? this.TERM_VALUE : 1;
      break;
  }
  
  // Generate schedule
  for (let i = 1; i <= paymentCount; i++) {
    const isLastPayment = i === paymentCount;
    const interestPayment = isLastPayment ? remainingInterest : remainingInterest / paymentCount;
    const principalPayment = isLastPayment ? principal : 0;
    
    schedule.push({
      paymentNumber: i,
      dueDate: new Date(currentDate),
      principal: principalPayment,
      interest: interestPayment,
      totalPayment: principalPayment + interestPayment
    });
    
    // Increment date based on frequency
    switch(this.PAYMENT_FREQUENCY) {
      case 'MONTHLY': currentDate.setMonth(currentDate.getMonth() + 1); break;
      case 'WEEKLY': currentDate.setDate(currentDate.getDate() + 7); break;
      case 'DAILY': currentDate.setDate(currentDate.getDate() + 1); break;
      case 'QUARTERLY': currentDate.setMonth(currentDate.getMonth() + 3); break;
      case 'YEARLY': currentDate.setFullYear(currentDate.getFullYear() + 1); break;
    }
  }
  
  return schedule;
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
  
  if (this.partialUpfrontInterest && this.upfrontInterestPercentage <= 0) {
    this.invalidate('upfrontInterestPercentage',
      'Upfront interest percentage must be greater than 0 for partial upfront interest');
  }
  
  next();
});

// Pre-save Hook
loanAccountSchema.pre('save', async function (next) {
  try {
    // Add PROD_ID validation at the start
    const PROD_ID = this.PROD_ID || (this.loanContract && this.loanContract.productDetails?.PROD_ID);
    if (!PROD_ID) {
      throw {
        code: 'MISSING_PRODUCT_ID',
        message: 'Could not determine product ID for this loan',
        status: 400
      };
    }
    
    // Log PROD_ID validation details
    logger.debug('Loan Account PROD_ID validation', {
      loanAccountId: this._id,
      existingPROD_ID: this.PROD_ID,
      contractPROD_ID: this.loanContract?.productDetails?.PROD_ID,
      assignedPROD_ID: PROD_ID
    });

    // Set the validated PROD_ID if it came from loanContract
    if (!this.PROD_ID && PROD_ID) {
      this.PROD_ID = PROD_ID;
    }

    // Generate ACCT_NO based on product ID if not provided
    if (!this.ACCT_NO && this.PROD_ID) {
      this.ACCT_NO = String(await generateLoanAccountNumberByProdId(this.PROD_ID));
    }

    // Set loanAccountId to be the numeric portion of ACCT_NO
    if (!this.loanAccountId && this.ACCT_NO) {
      const numericPart = String(this.ACCT_NO).replace(/\D/g, '');
      this.loanAccountId = parseInt(numericPart, 10) || Date.now();
    }

    // Calculate MATURITY_DT if TERM_CD, TERM_VALUE, or START_DT changed
    if (this.isModified('TERM_CD') || this.isModified('TERM_VALUE') || this.isModified('START_DT')) {
      if (!this.TERM_CD || !this.TERM_VALUE || !this.START_DT) {
        throw new Error('TERM_CD, TERM_VALUE, and START_DT are required to compute MATURITY_DT');
      }
      this.MATURITY_DT = calculateMaturityDate(this.START_DT, this.TERM_CD, this.TERM_VALUE);
    }

    // Calculate interest amounts if relevant fields change
    if (this.isModified('DISBURSEMENT_LIMIT') || 
        this.isModified('INTEREST_RATE') ||
        this.isModified('TERM_VALUE') ||
        this.isModified('TERM_CD') ||
        this.isModified('deductUpfrontInterest') ||
        this.isModified('partialUpfrontInterest') ||
        this.isModified('upfrontInterestPercentage')) {
      
      // Calculate total interest for the loan term
      const principal = parseFloat(this.DISBURSEMENT_LIMIT.toString());
      const rate = parseFloat(this.INTEREST_RATE.toString()) / 100;
      const termInYears = this.TERM_CD === 'M' ? this.TERM_VALUE / 12 :
                         this.TERM_CD === 'D' ? this.TERM_VALUE / 365 :
                         this.TERM_CD === 'W' ? this.TERM_VALUE / 52 :
                         this.TERM_CD === 'Q' ? this.TERM_VALUE / 4 :
                         this.TERM_VALUE; // Years
      
      const totalInterest = principal * rate * termInYears;
      this.TOTAL_INTEREST = mongoose.Types.Decimal128.fromString(totalInterest.toFixed(2));
      
      // Calculate upfront amounts if enabled
      if (this.deductUpfrontInterest) {
        // Full upfront interest
        this.upfrontInterestAmount = this.TOTAL_INTEREST;
        this.remainingInterestAmount = mongoose.Types.Decimal128.fromString('0.00');
      } 
      else if (this.partialUpfrontInterest) {
        // Partial upfront interest
        const percentage = parseFloat(this.upfrontInterestPercentage.toString()) / 100;
        const upfrontAmount = totalInterest * percentage;
        this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString(upfrontAmount.toFixed(2));
        this.remainingInterestAmount = mongoose.Types.Decimal128.fromString((totalInterest - upfrontAmount).toFixed(2));
      }
      else {
        // No upfront interest
        this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString('0.00');
        this.remainingInterestAmount = this.TOTAL_INTEREST;
      }
    }
    
    // Calculate actual disbursement amount
    if (this.isModified('DISBURSEMENT_LIMIT') || 
        this.isModified('upfrontInterestAmount') ||
        this.isModified('partialUpfrontInterest') ||
        this.isModified('deductUpfrontInterest')) {
      
      const principal = parseFloat(this.DISBURSEMENT_LIMIT.toString());
      const upfrontInterest = parseFloat(this.upfrontInterestAmount.toString());
      this.ACTUAL_DISBURSEMENT = mongoose.Types.Decimal128.fromString((principal - upfrontInterest).toFixed(2));
    }

    // Set LOAN_STATUS to OVERDUE if needed
    if (this.isModified('NEXT_PAYMENT_DATE') || this.isModified('LOAN_STATUS')) {
      if (this.isOverdue()) {
        this.LOAN_STATUS = 'OVERDUE';
      }
    }

    // Update lastUpdated timestamp
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