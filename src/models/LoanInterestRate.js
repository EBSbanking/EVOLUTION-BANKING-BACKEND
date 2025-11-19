import mongoose from 'mongoose';

const LoanInterestRateSchema = new mongoose.Schema({
    // Product and Rate Identification
    PROD_ID: { 
        type: Number, 
        required: true,
        index: true 
    },
    INDEX_RATE_ID: { 
        type: Number, 
        required: true 
    },
    LOAN_PROUD_INT_ID: { 
        type: String, 
        unique: true, 
        required: true 
    },

    // Interest Calculation Configuration
    RATE_TY: { 
        type: String, 
        required: true,
        enum: ['FIXED', 'VARIABLE', 'TIERED'],
        default: 'FIXED'
    },
    INT_TY: {
        type: String,
        required: true,
        enum: ['SIMPLE', 'COMPOUND'],
        default: 'COMPOUND'
    },
    ACCRUAL_BASIS_TY: { 
        type: String, 
        required: true,
        enum: ['ACTUAL/360', 'ACTUAL/365', '30/360', 'BUSINESS/252'],
        default: 'ACTUAL/360'
    },
    ACCRUAL_FREQ_CD: { 
        type: String, 
        required: true,
        enum: ['DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
        default: 'DAILY'
    },
    ACCRUAL_FREQ_VALUE: { 
        type: Number, 
        required: true,
        default: 1  // 1 day for daily accrual
    },

    // Rate Values
    FIXED_RATE: { 
        type: Number, 
        required: function() { return this.RATE_TY === 'FIXED'; }
    },
    ABSOLUTE_RATE: { 
        type: Number, 
        required: true  // Always store the effective rate
    },
    MARGIN_RATE: {
        type: Number,
        default: 0  // For variable rates (BASE_RATE + MARGIN_RATE)
    },

    // Capitalization and Amortization
    CAPITALIZE_INT_FG: { 
        type: Boolean, 
        default: false 
    },
    AMORTIZED: { 
        type: Boolean, 
        default: false 
    },
    CAPITALIZE_ACCT_ST: { 
        type: String,
        enum: ['PENDING', 'CAPITALIZED', 'REJECTED'],
        default: 'PENDING'
    },

    // Accrual Tracking (Added for daily accruals)
    DAILY_ACCRUAL_CONFIG: {
        GL_ACCOUNT: {
            type: String,
            required: true,
            default: ''  // Default interest receivable GL
        },
        POSTING_FREQUENCY: {
            type: String,
            enum: ['EOD', 'EOM', 'EOQ'],
            default: 'EOD'
        }
    },

    // Rate Change Rules
    RATE_CHANGE_ALLOWED: { 
        type: Boolean, 
        default: false 
    },
    RATE_CHANGE_NOTICE_DAYS: {
        type: Number,
        default: 30
    },

    // System Metadata
    EFFECTIVE_DT: { 
        type: Date, 
        required: true,
        default: Date.now 
    },
    EXPIRY_DT: {
        type: Date
    },
    VERSION: { 
        type: Number, 
        default: 1 
    },
    STATUS: { 
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'PENDING'],
        default: 'ACTIVE'
    },

    // Audit Fields
    CREATED_BY: { 
        type: String, 
        required: true 
    },
    LAST_MODIFIED_BY: {
        type: String
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual for formatted rate description
LoanInterestRateSchema.statics.calculateDailyInterest = function(principal, rate, days, accrualBasis) {
  // Add input validation
  if (typeof principal !== 'number' || isNaN(principal)) {
    throw new Error(`Invalid principal amount: ${principal}`);
  }
  if (typeof rate !== 'number' || isNaN(rate)) {
    throw new Error(`Invalid interest rate: ${rate}`);
  }
  if (typeof days !== 'number' || isNaN(days) || days <= 0) {
    throw new Error(`Invalid day count: ${days}`);
  }
  if (!['ACTUAL/360', 'ACTUAL/365'].includes(accrualBasis)) {
    throw new Error(`Invalid accrual basis: ${accrualBasis}`);
  }

  const basisDivisor = accrualBasis === 'ACTUAL/360' ? 360 : 365;
  const dailyInterest = (principal * rate * days) / (100 * basisDivisor);
  
  // Ensure we return a valid number
  if (isNaN(dailyInterest)) {
    throw new Error(`Calculation produced NaN: principal=${principal}, rate=${rate}, days=${days}`);
  }
  
  return dailyInterest;
};

const LoanInterestRate = mongoose.model('LoanInterestRate', LoanInterestRateSchema);

export default LoanInterestRate;
