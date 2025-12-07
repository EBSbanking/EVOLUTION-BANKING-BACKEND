// models/LoanInterestRate.js - Updated version
import mongoose from 'mongoose';

const LoanInterestRateSchema = new mongoose.Schema({
    // Product and Rate Identification
    PROD_ID: { 
        type: Number, 
        required: true,
        index: true 
    },
    PRODUCT_NAME: {
        type: String,
        required: true,
        trim: true
    },
    PRODUCT_SHORT_NAME: {
        type: String,
        required: true,
        trim: true,
        uppercase: true
    },
    PRODUCT_TYPE: {
        type: String,
        required: true,
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'BULLET', 'CUSTOM'],
        default: 'MONTHLY'
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
        default: 'SIMPLE'
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
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
        default: 'DAILY'
    },
    ACCRUAL_FREQ_VALUE: { 
        type: Number, 
        required: true,
        default: 1
    },

    // Rate Values - Based on your product table
    MIN_RATE_PER_MONTH: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        description: "Minimum interest rate per month (%)"
    },
    MAX_RATE_PER_MONTH: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        description: "Maximum interest rate per month (%)"
    },
    DEFAULT_RATE_PER_MONTH: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        description: "Default interest rate per month (%)"
    },
    TOTAL_INTEREST_RATE: {
        type: Number,
        required: true,
        min: 0,
        max: 100,
        description: "Total interest rate for the loan term (%)"
    },
    
    // For FIXED rates (simplified from your original)
    FIXED_RATE: { 
        type: Number,
        min: 0,
        max: 100
    },
    ABSOLUTE_RATE: { 
        type: Number,
        min: 0,
        max: 100
    },
    MARGIN_RATE: {
        type: Number,
        default: 0
    },

    // Loan Term Constraints
    MIN_DURATION_DAYS: {
        type: Number,
        default: 1,
        description: "Minimum duration in days"
    },
    MIN_DURATION_WEEKS: {
        type: Number,
        default: 0,
        description: "Minimum duration in weeks"
    },
    MIN_DURATION_MONTHS: {
        type: Number,
        default: 1,
        description: "Minimum duration in months"
    },
    MAX_DURATION_MONTHS: {
        type: Number,
        default: 60
    },

    // Loan Amount Constraints
    MIN_LOAN_AMOUNT: {
        type: Number,
        default: 0
    },
    MAX_LOAN_AMOUNT: {
        type: Number,
        default: 1000000000
    },

    // Capitalization and Amortization
    CAPITALIZE_INT_FG: { 
        type: Boolean, 
        default: false 
    },
    CAPITALIZE_ACCT_ST: {
  type: String,
  enum: ['PENDING', 'CAPITALIZED', 'REJECTED'],
  default: 'PENDING'
},
LAST_MODIFIED_BY: String,
    AMORTIZED: { 
        type: Boolean, 
        default: true 
    },
    REPAYMENT_FREQUENCY: {
        type: String,
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
        default: 'MONTHLY'
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

    // Time Period
    TIME: {
        type: Number,
        default: 12
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
    return `${this.PRODUCT_NAME} (${this.PRODUCT_SHORT_NAME}) - ${this.DEFAULT_RATE_PER_MONTH}% per month`;
});

// Virtual for display name
LoanInterestRateSchema.virtual('displayName').get(function() {
    return `${this.PRODUCT_NAME} - ${this.PRODUCT_TYPE} Loan`;
});

// Virtual for daily rate calculation
LoanInterestRateSchema.virtual('dailyRate').get(function() {
    // Convert monthly rate to daily rate (assuming 30 days per month)
    return (this.DEFAULT_RATE_PER_MONTH / 30).toFixed(4);
});

// Virtual for weekly rate calculation
LoanInterestRateSchema.virtual('weeklyRate').get(function() {
    // Convert monthly rate to weekly rate (assuming 4 weeks per month)
    return (this.DEFAULT_RATE_PER_MONTH / 4).toFixed(4);
});

// Virtual for annual rate calculation
LoanInterestRateSchema.virtual('annualRate').get(function() {
    // Convert monthly rate to annual rate
    return (this.DEFAULT_RATE_PER_MONTH * 12).toFixed(2);
});

// Index for better query performance
LoanInterestRateSchema.index({ PROD_ID: 1, STATUS: 1 });
LoanInterestRateSchema.index({ PRODUCT_SHORT_NAME: 1, STATUS: 1 });
LoanInterestRateSchema.index({ EFFECTIVE_DT: 1, EXPIRY_DT: 1 });
LoanInterestRateSchema.index({ PRODUCT_TYPE: 1 });

// Static method to calculate interest for a loan
LoanInterestRateSchema.statics.calculateInterest = function(productType, principal, rate, duration, durationUnit) {
    let annualRate, periodRate, periods;
    
    // Convert rate to decimal
    const rateDecimal = rate / 100;
    
    switch(productType.toUpperCase()) {
        case 'DAILY':
            periodRate = rateDecimal / 30; // Daily rate from monthly rate
            periods = duration;
            break;
        case 'WEEKLY':
            periodRate = rateDecimal / 4; // Weekly rate from monthly rate
            periods = duration;
            break;
        case 'MONTHLY':
            periodRate = rateDecimal;
            periods = duration;
            break;
        case 'BULLET':
            // Bullet payment - interest for entire term
            periodRate = rateDecimal;
            periods = 1;
            break;
        default:
            periodRate = rateDecimal;
            periods = duration;
    }
    
    // Simple interest calculation
    const interest = principal * periodRate * periods;
    return parseFloat(interest.toFixed(2));
};

// Static method to calculate repayment schedule
LoanInterestRateSchema.statics.calculateRepaymentSchedule = function(productType, principal, rate, duration, durationUnit) {
    const schedule = [];
    const interest = this.calculateInterest(productType, principal, rate, duration, durationUnit);
    const totalAmount = principal + interest;
    
    switch(productType.toUpperCase()) {
        case 'DAILY':
            // Daily repayments
            const dailyPayment = totalAmount / duration;
            for (let i = 1; i <= duration; i++) {
                schedule.push({
                    installmentNumber: i,
                    dueDate: i, // days from now
                    principalPayment: principal / duration,
                    interestPayment: interest / duration,
                    totalPayment: dailyPayment
                });
            }
            break;
            
        case 'WEEKLY':
            // Weekly repayments
            const weeklyPayment = totalAmount / duration;
            for (let i = 1; i <= duration; i++) {
                schedule.push({
                    installmentNumber: i,
                    dueDate: i * 7, // weeks in days
                    principalPayment: principal / duration,
                    interestPayment: interest / duration,
                    totalPayment: weeklyPayment
                });
            }
            break;
            
        case 'MONTHLY':
            // Monthly repayments
            const monthlyPayment = totalAmount / duration;
            for (let i = 1; i <= duration; i++) {
                schedule.push({
                    installmentNumber: i,
                    dueDate: i * 30, // months in days (approx)
                    principalPayment: principal / duration,
                    interestPayment: interest / duration,
                    totalPayment: monthlyPayment
                });
            }
            break;
            
        case 'BULLET':
            // Single bullet payment
            schedule.push({
                installmentNumber: 1,
                dueDate: duration, // at the end of term
                principalPayment: principal,
                interestPayment: interest,
                totalPayment: totalAmount
            });
            break;
    }
    
    return schedule;
};

// Static method to find active rate by product short name
LoanInterestRateSchema.statics.findByProductShortName = function(shortName) {
    return this.findOne({
        PRODUCT_SHORT_NAME: shortName.toUpperCase(),
        STATUS: 'ACTIVE',
        EFFECTIVE_DT: { $lte: new Date() },
        $or: [
            { EXPIRY_DT: { $exists: false } },
            { EXPIRY_DT: { $gte: new Date() } }
        ]
    }).sort({ EFFECTIVE_DT: -1 });
};

// Static method to get all active products
LoanInterestRateSchema.statics.getAllActiveProducts = function() {
    return this.find({
        STATUS: 'ACTIVE',
        EFFECTIVE_DT: { $lte: new Date() },
        $or: [
            { EXPIRY_DT: { $exists: false } },
            { EXPIRY_DT: { $gte: new Date() } }
        ]
    }).sort({ PRODUCT_NAME: 1 });
};

// Instance method to check if rate is currently effective
LoanInterestRateSchema.methods.isCurrentlyEffective = function() {
    const now = new Date();
    return this.STATUS === 'ACTIVE' && 
           this.EFFECTIVE_DT <= now && 
           (!this.EXPIRY_DT || this.EXPIRY_DT >= now);
};

// Instance method to get product summary
LoanInterestRateSchema.methods.getProductSummary = function() {
    return {
        productId: this.PROD_ID,
        productName: this.PRODUCT_NAME,
        shortName: this.PRODUCT_SHORT_NAME,
        productType: this.PRODUCT_TYPE,
        defaultRate: `${this.DEFAULT_RATE_PER_MONTH}% per month`,
        minRate: `${this.MIN_RATE_PER_MONTH}% per month`,
        maxRate: `${this.MAX_RATE_PER_MONTH}% per month`,
        totalInterestRate: `${this.TOTAL_INTEREST_RATE}%`,
        minDuration: this.getMinDurationDisplay(),
        status: this.STATUS
    };
};

// Instance method to get minimum duration display
LoanInterestRateSchema.methods.getMinDurationDisplay = function() {
    switch(this.PRODUCT_TYPE) {
        case 'DAILY':
            return `${this.MIN_DURATION_DAYS} Days`;
        case 'WEEKLY':
            return `${this.MIN_DURATION_WEEKS} Weeks`;
        case 'MONTHLY':
        case 'BULLET':
            return `${this.MIN_DURATION_MONTHS} Months`;
        default:
            return `${this.MIN_DURATION_MONTHS} Months`;
    }
};

// Middleware to validate rate consistency
LoanInterestRateSchema.pre('save', function(next) {
    // Ensure default rate is within min-max range
    if (this.DEFAULT_RATE_PER_MONTH < this.MIN_RATE_PER_MONTH || 
        this.DEFAULT_RATE_PER_MONTH > this.MAX_RATE_PER_MONTH) {
        next(new Error(`Default rate (${this.DEFAULT_RATE_PER_MONTH}%) must be between min (${this.MIN_RATE_PER_MONTH}%) and max (${this.MAX_RATE_PER_MONTH}%) rates`));
        return;
    }
    
    // Set ABSOLUTE_RATE based on product type
    if (this.RATE_TY === 'FIXED') {
        this.ABSOLUTE_RATE = this.DEFAULT_RATE_PER_MONTH;
        this.FIXED_RATE = this.DEFAULT_RATE_PER_MONTH;
    }
    
    // Set accrual frequency based on product type
    switch(this.PRODUCT_TYPE) {
        case 'DAILY':
            this.ACCRUAL_FREQ_CD = 'DAILY';
            this.ACCRUAL_FREQ_VALUE = 1;
            break;
        case 'WEEKLY':
            this.ACCRUAL_FREQ_CD = 'WEEKLY';
            this.ACCRUAL_FREQ_VALUE = 7;
            break;
        case 'MONTHLY':
        case 'BULLET':
            this.ACCRUAL_FREQ_CD = 'MONTHLY';
            this.ACCRUAL_FREQ_VALUE = 30;
            break;
    }
    
    // Set repayment frequency based on product type
    switch(this.PRODUCT_TYPE) {
        case 'DAILY':
            this.REPAYMENT_FREQUENCY = 'DAILY';
            break;
        case 'WEEKLY':
            this.REPAYMENT_FREQUENCY = 'WEEKLY';
            break;
        case 'MONTHLY':
        case 'BULLET':
            this.REPAYMENT_FREQUENCY = 'MONTHLY';
            break;
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