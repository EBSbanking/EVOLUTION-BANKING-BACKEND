// models/LoanInterestRate.js - COMPLETE FIXED VERSION
import mongoose from 'mongoose';

const LoanInterestRateSchema = new mongoose.Schema({
    // ========== ADD THIS FIELD ==========
    LOAN_PROUD_INT_ID: {
        type: Number,
        unique: true,
        sparse: true, // CRITICAL: Allows multiple null values
        index: true,
        description: "Legacy product interest ID",
        default: null
    },
    // ====================================
    
    // Product Identification
    name: {
        type: String,
        required: true,
        trim: true,
        description: "Descriptive name for the interest rate"
    },
    description: {
        type: String,
        trim: true
    },
    code: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        description: "Unique code for the interest rate"
    },
    
    // Rate Configuration
    RATE_TYPE: {
        type: String,
        required: true,
        enum: ['FIXED', 'VARIABLE', 'TIERED', 'PROMOTIONAL', 'INTRODUCTORY'],
        default: 'FIXED',
        description: "Type of interest rate"
    },
    INTEREST_TYPE: {
        type: String,
        required: true,
        enum: ['SIMPLE', 'COMPOUND'],
        default: 'SIMPLE',
        description: "Interest calculation type"
    },
    CALCULATION_METHOD: {
        type: String,
        required: true,
        enum: ['FLAT', 'REDUCING_BALANCE', 'RULE_OF_78'],
        default: 'FLAT',
        description: "Method for calculating interest"
    },
    
    // Rate Values (Monthly rates for consistency)
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
    ANNUAL_PERCENTAGE_RATE: {
        type: Number,
        min: 0,
        max: 1000,
        description: "Annual Percentage Rate (%)"
    },
    
    // For variable rates - references RateIndex
    INDEX_RATE_ID: {
        type: Number,
        ref: 'RateIndex',
        required: function() {
            return this.RATE_TYPE === 'VARIABLE';
        },
        description: "Reference to market index rate for variable rates"
    },
    MARGIN_RATE: {
        type: Number,
        default: 0,
        min: -100,
        max: 100,
        description: "Margin to add/subtract from index rate (%)"
    },
    SPREAD_RATE: {
        type: Number,
        default: 0,
        min: -100,
        max: 100,
        description: "Additional spread over index + margin (%)"
    },
    
    // Term Configuration
    MIN_TERM_VALUE: {
        type: Number,
        required: true,
        min: 1,
        description: "Minimum loan term value"
    },
    MAX_TERM_VALUE: {
        type: Number,
        required: true,
        min: 1,
        description: "Maximum loan term value"
    },
    TERM_TYPE: {
        type: String,
        required: true,
        enum: ['DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'],
        default: 'MONTHS',
        description: "Unit for term values"
    },
    
    // Accrual Configuration
    ACCRUAL_BASIS: {
        type: String,
        required: true,
        enum: ['ACTUAL/360', 'ACTUAL/365', '30/360', 'BUSINESS/252'],
        default: 'ACTUAL/360',
        description: "Day count convention for interest accrual"
    },
    ACCRUAL_FREQUENCY: {
        type: String,
        required: true,
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
        default: 'DAILY',
        description: "Frequency of interest accrual"
    },
    
    // Loan Amount Constraints
    MIN_LOAN_AMOUNT: {
        type: mongoose.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString('0.00'),
        get: v => parseFloat(v.toString())
    },
    MAX_LOAN_AMOUNT: {
        type: mongoose.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString('1000000000.00'),
        get: v => parseFloat(v.toString())
    },
    
    // Capitalization
    CAPITALIZE_INTEREST: {
        type: Boolean,
        default: false,
        description: "Whether to capitalize unpaid interest"
    },
    COMPOUNDING_FREQUENCY: {
        type: String,
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
        default: 'MONTHLY'
    },
    CAPITALIZATION_STATUS: {
        type: String,
        enum: ['PENDING', 'CAPITALIZED', 'REJECTED'],
        default: 'PENDING'
    },
    
    // Amortization
    AMORTIZED: {
        type: Boolean,
        default: true,
        description: "Whether loan is amortized"
    },
    REPAYMENT_FREQUENCY: {
        type: String,
        enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'BULLET'],
        default: 'MONTHLY'
    },
    
    // Rate Change Rules
    RATE_CHANGE_ALLOWED: {
        type: Boolean,
        default: false,
        description: "Whether rate changes are allowed after loan disbursement"
    },
    RATE_CHANGE_NOTICE_DAYS: {
        type: Number,
        default: 30,
        min: 0,
        description: "Notice period required for rate changes (days)"
    },
    MAX_RATE_CHANGES: {
        type: Number,
        default: 1,
        min: 0,
        description: "Maximum number of rate changes allowed"
    },
    
    // Fees
    ORIGINATION_FEE_RATE: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        description: "Origination fee as percentage of loan amount"
    },
    PROCESSING_FEE_FIXED: {
        type: mongoose.Types.Decimal128,
        default: mongoose.Types.Decimal128.fromString('0.00'),
        get: v => parseFloat(v.toString())
    },
    LATE_PAYMENT_PENALTY_RATE: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        description: "Late payment penalty rate (%)"
    },
    EARLY_REPAYMENT_PENALTY_RATE: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
        description: "Early repayment penalty rate (%)"
    },
    
    // Tiered Rates (for TIERED rate type)
    TIERED_RATES: [{
        minAmount: {
            type: mongoose.Types.Decimal128,
            required: true,
            get: v => parseFloat(v.toString())
        },
        maxAmount: {
            type: mongoose.Types.Decimal128,
            get: v => v ? parseFloat(v.toString()) : null
        },
        rate: {
            type: Number,
            required: true,
            min: 0,
            max: 100
        }
    }],
    
    // Effective Dates
    EFFECTIVE_DATE: {
        type: Date,
        required: true,
        default: Date.now,
        description: "Date when this rate becomes effective"
    },
    EXPIRY_DATE: {
        type: Date,
        description: "Date when this rate expires"
    },
    
    // Status
    STATUS: {
        type: String,
        enum: ['ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'EXPIRED', 'DELETED'],
        default: 'DRAFT'
    },
    
    // Audit Fields
    CREATED_BY: {
        type: String,
        required: true
    },
    CREATED_AT: {
        type: Date,
        default: Date.now
    },
    UPDATED_BY: {
        type: String
    },
    UPDATED_AT: {
        type: Date,
        default: Date.now
    },
    LAST_UPDATED_BY: {
        type: String
    },
    
    // Metadata
    VERSION: {
        type: String,
        default: '1.0'
    },
    TAGS: [{
        type: String,
        trim: true
    }],
    NOTES: {
        type: String,
        trim: true
    },
    IS_ACTIVE: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { 
        virtuals: true,
        getters: true,
        transform: function(doc, ret) {
            // Convert Decimal128 to regular numbers for JSON output
            if (ret.MIN_LOAN_AMOUNT) ret.MIN_LOAN_AMOUNT = parseFloat(ret.MIN_LOAN_AMOUNT.toString());
            if (ret.MAX_LOAN_AMOUNT) ret.MAX_LOAN_AMOUNT = parseFloat(ret.MAX_LOAN_AMOUNT.toString());
            if (ret.PROCESSING_FEE_FIXED) ret.PROCESSING_FEE_FIXED = parseFloat(ret.PROCESSING_FEE_FIXED.toString());
            
            // Remove internal fields
            delete ret.__v;
            return ret;
        }
    },
    toObject: { 
        virtuals: true,
        getters: true 
    }
});

// ==================== VIRTUALS ====================

// Virtual for term conversion to months
LoanInterestRateSchema.virtual('MIN_TERM_MONTHS').get(function() {
    return this.convertToMonths(this.MIN_TERM_VALUE, this.TERM_TYPE);
});

// Virtual for max term in months
LoanInterestRateSchema.virtual('MAX_TERM_MONTHS').get(function() {
    return this.convertToMonths(this.MAX_TERM_VALUE, this.TERM_TYPE);
});

// Virtual for formatted term range
LoanInterestRateSchema.virtual('termRange').get(function() {
    return `${this.MIN_TERM_VALUE} - ${this.MAX_TERM_VALUE} ${this.TERM_TYPE}`;
});

// Virtual for annual rate
LoanInterestRateSchema.virtual('annualRate').get(function() {
    return (this.DEFAULT_RATE_PER_MONTH * 12).toFixed(2);
});

// Virtual for effective rate (includes margin for variable rates)
LoanInterestRateSchema.virtual('effectiveRate').get(function() {
    if (this.RATE_TYPE === 'VARIABLE' && this.INDEX_RATE_ID) {
        // This would need to fetch the current index rate
        // For now, return default rate
        return this.DEFAULT_RATE_PER_MONTH;
    }
    return this.DEFAULT_RATE_PER_MONTH;
});

// Virtual for rate description
LoanInterestRateSchema.virtual('rateDescription').get(function() {
    let desc = `${this.name}: ${this.DEFAULT_RATE_PER_MONTH}% per month`;
    
    if (this.RATE_TYPE === 'VARIABLE') {
        desc += ` (Variable - based on index + ${this.MARGIN_RATE}% margin)`;
    }
    
    return desc;
});

// ==================== METHODS ====================

// Instance method to convert term to months
LoanInterestRateSchema.methods.convertToMonths = function(value, fromType = null) {
    const type = fromType || this.TERM_TYPE;
    
    switch(type.toUpperCase()) {
        case 'DAYS':
            return Math.ceil(value / 30.44); // Average days in month
        case 'WEEKS':
            return Math.ceil(value / 4.345); // Average weeks in month
        case 'MONTHS':
            return value;
        case 'QUARTERS':
            return value * 3;
        case 'YEARS':
            return value * 12;
        default:
            return value;
    }
};

// Instance method to convert months to specific term type
LoanInterestRateSchema.methods.convertFromMonths = function(months, toType = null) {
    const type = toType || this.TERM_TYPE;
    
    switch(type.toUpperCase()) {
        case 'DAYS':
            return Math.ceil(months * 30.44);
        case 'WEEKS':
            return Math.ceil(months * 4.345);
        case 'MONTHS':
            return months;
        case 'QUARTERS':
            return Math.ceil(months / 3);
        case 'YEARS':
            return Math.ceil(months / 12);
        default:
            return months;
    }
};

// Instance method to validate loan application
LoanInterestRateSchema.methods.validateLoanApplication = function(amount, termValue, termType = null) {
    const errors = [];
    
    // Validate amount
    const amountNum = parseFloat(amount);
    const minAmount = parseFloat(this.MIN_LOAN_AMOUNT.toString() || '0');
    const maxAmount = parseFloat(this.MAX_LOAN_AMOUNT.toString() || '999999999');
    
    if (amountNum < minAmount) {
        errors.push(`Amount (${amountNum}) is below minimum (${minAmount})`);
    }
    if (amountNum > maxAmount) {
        errors.push(`Amount (${amountNum}) exceeds maximum (${maxAmount})`);
    }
    
    // Validate term
    const actualTermType = termType || this.TERM_TYPE;
    if (actualTermType.toUpperCase() !== this.TERM_TYPE.toUpperCase()) {
        errors.push(`Term type (${actualTermType}) does not match product term type (${this.TERM_TYPE})`);
    } else {
        const termValueNum = parseInt(termValue);
        if (termValueNum < this.MIN_TERM_VALUE) {
            errors.push(`Term value (${termValueNum}) is below minimum (${this.MIN_TERM_VALUE})`);
        }
        if (termValueNum > this.MAX_TERM_VALUE) {
            errors.push(`Term value (${termValueNum}) exceeds maximum (${this.MAX_TERM_VALUE})`);
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
};

// Instance method to calculate effective rate for variable loans
LoanInterestRateSchema.methods.getEffectiveRate = async function() {
    if (this.RATE_TYPE === 'VARIABLE' && this.INDEX_RATE_ID) {
        try {
            // Populate the index rate
            await this.populate('INDEX_RATE_ID');
            
            if (this.INDEX_RATE_ID && this.INDEX_RATE_ID.INDEX_RATE) {
                const indexRate = parseFloat(this.INDEX_RATE_ID.INDEX_RATE);
                const marginRate = this.MARGIN_RATE || 0;
                const spreadRate = this.SPREAD_RATE || 0;
                
                // Effective rate = Index rate + Margin + Spread
                return indexRate + marginRate + spreadRate;
            }
        } catch (error) {
            console.error('Error getting effective rate:', error);
        }
    }
    
    // For fixed rates or if index not found, return default rate
    return this.DEFAULT_RATE_PER_MONTH;
};

// Instance method to calculate interest
LoanInterestRateSchema.methods.calculateInterest = function(principal, termValue, termType = null) {
    const principalNum = parseFloat(principal);
    const termValueNum = parseInt(termValue);
    const actualTermType = termType || this.TERM_TYPE;
    
    // Convert term to months for calculation
    const termInMonths = this.convertToMonths(termValueNum, actualTermType);
    const monthlyRate = this.DEFAULT_RATE_PER_MONTH / 100;
    
    let interest;
    
    if (this.INTEREST_TYPE.toUpperCase() === 'SIMPLE') {
        // Simple Interest
        interest = principalNum * monthlyRate * termInMonths;
    } else if (this.INTEREST_TYPE.toUpperCase() === 'COMPOUND') {
        // Compound Interest
        if (this.AMORTIZED) {
            // Amortized loan
            if (monthlyRate === 0) {
                interest = 0;
            } else {
                const rateFactor = Math.pow(1 + monthlyRate, termInMonths);
                const monthlyPayment = principalNum * monthlyRate * rateFactor / (rateFactor - 1);
                const totalPayment = monthlyPayment * termInMonths;
                interest = totalPayment - principalNum;
            }
        } else {
            // Non-amortized (bullet payment)
            interest = principalNum * (Math.pow(1 + monthlyRate, termInMonths) - 1);
        }
    } else {
        // Default to simple interest
        interest = principalNum * monthlyRate * termInMonths;
    }
    
    return parseFloat(interest.toFixed(2));
};

// Instance method to check if rate is currently effective
LoanInterestRateSchema.methods.isCurrentlyEffective = function() {
    const now = new Date();
    return this.STATUS === 'ACTIVE' && 
           this.EFFECTIVE_DATE <= now && 
           (!this.EXPIRY_DATE || this.EXPIRY_DATE >= now);
};

// Instance method to get product summary
LoanInterestRateSchema.methods.getProductSummary = function() {
    return {
        name: this.name,
        code: this.code,
        rateType: this.RATE_TYPE,
        interestType: this.INTEREST_TYPE,
        defaultRate: `${this.DEFAULT_RATE_PER_MONTH}% per month`,
        annualRate: `${this.annualRate}% per year`,
        termRange: this.termRange,
        minAmount: parseFloat(this.MIN_LOAN_AMOUNT.toString()),
        maxAmount: parseFloat(this.MAX_LOAN_AMOUNT.toString()),
        status: this.STATUS
    };
};

// ==================== STATICS ====================

// Static method to find active rates
LoanInterestRateSchema.statics.findActiveRates = function() {
    const now = new Date();
    return this.find({
        STATUS: 'ACTIVE',
        EFFECTIVE_DATE: { $lte: now },
        $or: [
            { EXPIRY_DATE: { $exists: false } },
            { EXPIRY_DATE: { $gte: now } }
        ]
    }).sort({ name: 1 });
};

// Static method to find rates by term type
LoanInterestRateSchema.statics.findByTermType = function(termType, status = 'ACTIVE') {
    return this.find({
        TERM_TYPE: termType.toUpperCase(),
        STATUS: status
    }).sort({ name: 1 });
};

// Static method to find rates by rate type
LoanInterestRateSchema.statics.findByRateType = function(rateType, status = 'ACTIVE') {
    return this.find({
        RATE_TYPE: rateType.toUpperCase(),
        STATUS: status
    }).sort({ name: 1 });
};

// Static method to find rates using specific index
LoanInterestRateSchema.statics.findByIndexRateId = function(indexRateId) {
    return this.find({
        INDEX_RATE_ID: indexRateId,
        RATE_TYPE: 'VARIABLE',
        STATUS: 'ACTIVE'
    }).populate('INDEX_RATE_ID');
};

// ==================== MIDDLEWARE ====================

// Pre-save validation
LoanInterestRateSchema.pre('save', function(next) {
    // Validate default rate is within min-max range
    if (this.DEFAULT_RATE_PER_MONTH < this.MIN_RATE_PER_MONTH || 
        this.DEFAULT_RATE_PER_MONTH > this.MAX_RATE_PER_MONTH) {
        next(new Error(`Default rate (${this.DEFAULT_RATE_PER_MONTH}%) must be between min (${this.MIN_RATE_PER_MONTH}%) and max (${this.MAX_RATE_PER_MONTH}%) rates`));
        return;
    }
    
    // Validate min term is less than or equal to max term
    if (this.MIN_TERM_VALUE > this.MAX_TERM_VALUE) {
        next(new Error(`MIN_TERM_VALUE (${this.MIN_TERM_VALUE}) must be less than or equal to MAX_TERM_VALUE (${this.MAX_TERM_VALUE})`));
        return;
    }
    
    // For variable rates, require INDEX_RATE_ID
    if (this.RATE_TYPE === 'VARIABLE' && !this.INDEX_RATE_ID) {
        next(new Error('INDEX_RATE_ID is required for variable rate loans'));
        return;
    }
    
    // For tiered rates, validate tieredRates array
    if (this.RATE_TYPE === 'TIERED' && (!this.TIERED_RATES || this.TIERED_RATES.length === 0)) {
        next(new Error('TIERED_RATES array is required for tiered rate loans'));
        return;
    }
    
    // Set IS_ACTIVE based on STATUS
    this.IS_ACTIVE = this.STATUS === 'ACTIVE';
    
    // Set updated timestamp
    this.UPDATED_AT = new Date();
    
    next();
});

// Pre-save for variable rates: Set default rate based on index + margin
LoanInterestRateSchema.pre('save', async function(next) {
    if (this.RATE_TYPE === 'VARIABLE' && this.INDEX_RATE_ID && this.isModified('INDEX_RATE_ID')) {
        try {
            // Fetch the index rate
            const RateIndex = mongoose.model('RateIndex');
            const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: this.INDEX_RATE_ID });
            
            if (rateIndex) {
                const indexRate = parseFloat(rateIndex.INDEX_RATE);
                const marginRate = this.MARGIN_RATE || 0;
                const spreadRate = this.SPREAD_RATE || 0;
                
                // Set default rate based on current index
                const effectiveRate = indexRate + marginRate + spreadRate;
                
                // Validate effective rate is within min-max
                if (effectiveRate < this.MIN_RATE_PER_MONTH || effectiveRate > this.MAX_RATE_PER_MONTH) {
                    next(new Error(`Effective rate (${effectiveRate}%) based on index ${indexRate}% + margin ${marginRate}% + spread ${spreadRate}% is outside allowed range (${this.MIN_RATE_PER_MONTH}% - ${this.MAX_RATE_PER_MONTH}%)`));
                    return;
                }
                
                this.DEFAULT_RATE_PER_MONTH = effectiveRate;
            }
        } catch (error) {
            next(error);
            return;
        }
    }
    next();
});

// ==================== INDEXES ====================

// Indexes for better query performance
LoanInterestRateSchema.index({ code: 1 }, { unique: true });
LoanInterestRateSchema.index({ LOAN_PROUD_INT_ID: 1 }, { unique: true, sparse: true }); // Fixed index
LoanInterestRateSchema.index({ STATUS: 1, EFFECTIVE_DATE: 1, EXPIRY_DATE: 1 });
LoanInterestRateSchema.index({ RATE_TYPE: 1, STATUS: 1 });
LoanInterestRateSchema.index({ TERM_TYPE: 1, STATUS: 1 });
LoanInterestRateSchema.index({ INDEX_RATE_ID: 1, STATUS: 1 }); // For variable rates
LoanInterestRateSchema.index({ CREATED_AT: -1 });
LoanInterestRateSchema.index({ UPDATED_AT: -1 });
LoanInterestRateSchema.index({ name: 1 }, { collation: { locale: 'en', strength: 2 } }); // Case-insensitive

const LoanInterestRate = mongoose.model('LoanInterestRate', LoanInterestRateSchema);

export default LoanInterestRate;