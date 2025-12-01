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

    // Loan Term Constraints
    MIN_LOAN_TERM_MONTHS: {
        type: Number,
        default: 1
    },
    MAX_LOAN_TERM_MONTHS: {
        type: Number,
        default: 60
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

    // Accrual Tracking (Updated to fix the validation error)
    DAILY_ACCRUAL_CONFIG: {
        GL_ACCOUNT: {
            type: String,
            required: false, // ✅ CHANGED: Made optional to fix validation error
            default: '400100' // ✅ CHANGED: Set proper default value
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

    // Debit/Credit Indicator
    DR_CR_IND: {
        type: String,
        required: true,
        enum: ['DR', 'CR'],
        default: 'DR'
    },

    // Maturity Configuration
    MATURITY_INT_INDEX_ID: {
        type: Number
    },

    // Time Period
    TIME: {
        type: Number,
        default: 12  // Default 12 months
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
    USER_ID: {
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
LoanInterestRateSchema.virtual('rateDescription').get(function() {
    return `${this.RATE_TY} ${this.INT_TY} Interest at ${this.ABSOLUTE_RATE}%`;
});

// Virtual for display name
LoanInterestRateSchema.virtual('displayName').get(function() {
    return `Product ${this.PROD_ID} - ${this.RATE_TY} Rate`;
});

// Index for better query performance
LoanInterestRateSchema.index({ PROD_ID: 1, STATUS: 1 });
LoanInterestRateSchema.index({ EFFECTIVE_DT: 1, EXPIRY_DT: 1 });
LoanInterestRateSchema.index({ RATE_TY: 1, INT_TY: 1 });

// Static method to calculate daily interest
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
    if (!['ACTUAL/360', 'ACTUAL/365', '30/360', 'BUSINESS/252'].includes(accrualBasis)) {
        throw new Error(`Invalid accrual basis: ${accrualBasis}`);
    }

    let basisDivisor;
    switch (accrualBasis) {
        case 'ACTUAL/360':
            basisDivisor = 360;
            break;
        case 'ACTUAL/365':
            basisDivisor = 365;
            break;
        case '30/360':
            basisDivisor = 360; // Standard 30-day months
            break;
        case 'BUSINESS/252':
            basisDivisor = 252; // Business days per year
            break;
        default:
            basisDivisor = 365;
    }

    const dailyInterest = (principal * rate * days) / (100 * basisDivisor);
    
    // Ensure we return a valid number
    if (isNaN(dailyInterest)) {
        throw new Error(`Calculation produced NaN: principal=${principal}, rate=${rate}, days=${days}`);
    }
    
    return parseFloat(dailyInterest.toFixed(4));
};

// Static method to find active rates by product
LoanInterestRateSchema.statics.findActiveByProduct = function(prodId) {
    return this.find({
        PROD_ID: prodId,
        STATUS: 'ACTIVE',
        EFFECTIVE_DT: { $lte: new Date() },
        $or: [
            { EXPIRY_DT: { $exists: false } },
            { EXPIRY_DT: { $gte: new Date() } }
        ]
    }).sort({ EFFECTIVE_DT: -1 });
};

// Instance method to check if rate is currently effective
LoanInterestRateSchema.methods.isCurrentlyEffective = function() {
    const now = new Date();
    return this.STATUS === 'ACTIVE' && 
           this.EFFECTIVE_DT <= now && 
           (!this.EXPIRY_DT || this.EXPIRY_DT >= now);
};

// Middleware to validate rate consistency
LoanInterestRateSchema.pre('save', function(next) {
    // Ensure ABSOLUTE_RATE is set for FIXED rates
    if (this.RATE_TY === 'FIXED' && this.FIXED_RATE) {
        this.ABSOLUTE_RATE = this.FIXED_RATE;
    }
    
    // Validate that effective date is not in the future for active rates
    if (this.STATUS === 'ACTIVE' && this.EFFECTIVE_DT > new Date()) {
        next(new Error('Active rates cannot have future effective dates'));
        return;
    }
    
    next();
});

const LoanInterestRate = mongoose.model('LoanInterestRate', LoanInterestRateSchema);

export default LoanInterestRate;