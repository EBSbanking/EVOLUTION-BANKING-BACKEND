// models/LoanProduct.js - CORRECTED VERSION
import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const loanProductSchema = new mongoose.Schema(
  {
    // ======================
    // PRODUCT IDENTIFICATION
    // ======================
    PROD_ID: {
      type: Number,
      required: true,
      unique: true,
      index: true,
      validate: {
        validator: function (v) {
          return !isNaN(v) && v > 0;
        },
        message: props => `${props.value} is not a valid PROD_ID! Must be a positive number`
      }
    },
    productCode: {
      type: String,
      required: true,
      unique: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    PRODUCT_SHORT_NAME: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true
    },
    description: {
      type: String,
      trim: true
    },
    PRODUCT_TYPE: {
      type: String,
      required: true,
      enum: [
        'BUSINESS_TERM_LOAN',
        'INDIVIDUAL_LOAN',
        'CONSUMER_LOAN',
        'MORTGAGE',
        'AUTO_LOAN',
        'PERSONAL_LOAN',
        'EDUCATION_LOAN',
        'CREDIT_CARD',
        'LINE_OF_CREDIT',
        'SME_LOAN',
        'GENERAL_LOAN',
        'GROUP_LOAN',
        'MICRO_LOAN',
        'AGRI_LOAN',
        'HOUSING_LOAN',
        'VEHICLE_LOAN'
      ]
    },

    // ======================
    // ✅ SINGLE SOURCE OF TRUTH: REFERENCE TO LoanInterestRate
    // ======================
    LOAN_INTEREST_RATE_ID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanInterestRate',
      required: true,
      index: true
    },

    // Alternative reference by business key (optional)
    LOAN_PROUD_INT_ID: {
      type: String,
      ref: 'LoanInterestRate',
      field: 'LOAN_PROUD_INT_ID'
    },

    // ======================
    // PRODUCT-SPECIFIC CONFIGURATION (NOT DUPLICATED FROM INTEREST RATE)
    // ======================
    
    // Loan Amount Constraints (Product-specific)
    minAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      required: true,
      default: '0.00'
    },
    maxAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      required: true,
      default: '0.00'
    },

    // Loan Term Constraints (Product-specific boundaries)
    // These can override or complement the interest rate's terms
    MIN_LOAN_TERM_VALUE: {
      type: Number,
      min: 1,
      default: 1
    },
    MAX_LOAN_TERM_VALUE: {
      type: Number,
      min: 1,
      default: 60
    },
    LOAN_TERM_TYPE: {
      type: String,
      enum: ['DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'],
      default: 'MONTHS'
    },

    // Business Unit Configuration
    BU_ID: {
      type: [String],
      required: true,
      default: function() {
        return this.isGlobalProduct ? ['*'] : [];
      }
    },
    isGlobalProduct: {
      type: Boolean,
      default: false
    },
    accessibleBUs: {
      type: [String],
      default: function() {
        return this.BU_ID || [];
      }
    },
    visibility: {
      type: String,
      enum: ['GLOBAL', 'SELECTED_BUS', 'SPECIFIC_BRANCHES'],
      default: 'SELECTED_BUS'
    },

    // Payment Configuration (Product-specific)
    REPAYMENT_TYPE: {
      type: String,
      required: true,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'BULLET', 'CUSTOM'],
      default: 'MONTHLY'
    },
    PAYMENT_FREQUENCY: {
      type: String,
      required: true,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
      default: 'MONTHLY'
    },
    TERM_CD: {
      type: String,
      required: true,
      enum: ['D', 'W', 'M', 'Q', 'Y']
    },
    CRNCY_ID: {
      type: String,
      required: true,
      default: 'NGN'
    },
    allowedCurrencies: [{
      type: String,
      default: 'NGN'
    }],

    // ======================
    // GL ACCOUNTS (Product-specific)
    // ======================
    defaultGLAccounts: {
      loanGLAccount: {
        type: String,
        required: true
      },
      interestGLAccountNo: String,
      interestPayableGLAccountNo: String,
      withholdingTaxGLAccountNo: String,
      suspenseGLAccountNo: String,
      principalGLAccountNo: String,
      chargeOffGLAccountNo: String,
      loanChargeReceivableGLAccountNo: String,
      contingentGLAccountNo: String,
      delinquentGLAccountNo: String,
      interestIncomeGLAccountNo: String,
      interestReceivableGLAccountNo: String,
      interestSuspenseGLAccountNo: String,
      lateFeeSuspenseGLAccountNo: String,
      maturityGLAccountNo: String,
      nonAccrualGLAccountNo: String,
      nonAccrualInterestOffsetGLAccountNo: String,
      nonAccrualInterestReceivableGLAccountNo: String,
      provisionReserveGLAccountNo: String,
      provisionExpenseGLAccountNo: String,
      recoveriesGLAccountNo: String,
      repaymentControlGLAccountNo: String,
      loanSuspenseGLAccountNo: String,
      unappliedFundsGLAccountNo: String,
      unclearedBalanceGLAccountNo: String,
      unearnedInterestGLAccountNo: String,
      interestCreditGLAccountNo: String,
      interestDebitGLAccountNo: String,
      processingFeeGLCode: String
    },

    branchGLAccounts: [{
      branchCode: { type: String, required: true },
      branchName: { type: String, required: true },
      loanGLAccount: String,
      interestGLAccountNo: String,
      // ... other GL accounts
      isActive: { type: Boolean, default: true },
      createdAt: { type: Date, default: Date.now }
    }],

    // ======================
    // FEE STRUCTURE (Product-specific)
    // ======================
    feeStructure: [{
      feeType: {
        type: String,
        enum: ['PROCESSING', 'INSURANCE', 'LATE_PAYMENT', 'OTHER'],
        required: true
      },
      name: { type: String, required: true },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
        default: '0.00'
      },
      isPercentage: { type: Boolean, default: false },
      glAccountCode: { type: String, default: '' },
      appliesTo: {
        type: String,
        enum: ['DISBURSEMENT', 'REPAYMENT', 'BOTH'],
        default: 'DISBURSEMENT'
      },
      isActive: { type: Boolean, default: true }
    }],

    processingFeeRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      default: '0.00'
    },
    processingFeeGLCode: { type: String, default: '' },
    lateFeePerDay: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      default: '0.00'
    },
    maxLateFee: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00')
    },

    // ======================
    // SYSTEM METADATA & STATUS
    // ======================
    EFFECTIVE_DT: {
      type: Date,
      required: true,
      default: Date.now
    },
    EXPIRY_DT: Date,
    VERSION: { type: Number, default: 1 },
    STATUS: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE', 'PENDING'],
      default: 'ACTIVE'
    },
    isActive: { type: Boolean, default: true },

    // ======================
    // AUDIT FIELDS
    // ======================
    createdBy: {
      type: String,
      required: true,
      default: 'SYSTEM'
    },
    USER_ID: {
      type: String,
      required: true,
      default: 'SYSTEM'
    },
    LAST_MODIFIED_BY: { type: String, default: '' },

    // ======================
    // METADATA
    // ======================
    metadata: {
      isWildcardProduct: { type: Boolean, default: false },
      totalBranches: { type: Number, default: 0 },
      createdAt: { type: Date, default: Date.now },
      createdByUser: { type: String, default: 'SYSTEM' }
    }
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: function (doc, ret) {
        // Convert Decimal128 fields
        const decimalFields = ['minAmount', 'maxAmount', 'processingFeeRate', 'lateFeePerDay', 'maxLateFee'];
        decimalFields.forEach(field => {
          if (ret[field] && typeof ret[field] === 'object') {
            ret[field] = parseFloat(ret[field].toString());
          }
        });

        // Convert fee amounts
        if (ret.feeStructure) {
          ret.feeStructure = ret.feeStructure.map(fee => ({
            ...fee,
            amount: fee.amount && typeof fee.amount === 'object' ? parseFloat(fee.amount.toString()) : fee.amount
          }));
        }

        return ret;
      }
    },
    toObject: { getters: true, virtuals: true }
  }
);

// Add pagination plugin
loanProductSchema.plugin(mongoosePaginate);

// ======================
// VIRTUAL FIELDS
// ======================

// Virtual for term range display
loanProductSchema.virtual('termRange').get(function() {
  return `${this.MIN_LOAN_TERM_VALUE} - ${this.MAX_LOAN_TERM_VALUE} ${this.LOAN_TERM_TYPE}`;
});

// Virtual to get populated interest rate data
loanProductSchema.virtual('interestRateDetails').get(async function() {
  if (this.populated('LOAN_INTEREST_RATE_ID')) {
    return this.LOAN_INTEREST_RATE_ID;
  }
  // This would need to be populated in queries
  return null;
});

// ======================
// INSTANCE METHODS
// ======================

// Validate loan application with interest rate
loanProductSchema.methods.validateLoanApplication = async function(amount, termValue, termType = null) {
  const errors = [];
  
  // Validate amount against product limits
  const amountNum = parseFloat(amount);
  const minAmount = this.minAmount ? parseFloat(this.minAmount.toString()) : 0;
  const maxAmount = this.maxAmount ? parseFloat(this.maxAmount.toString()) : 999999999;
  
  if (amountNum < minAmount) {
    errors.push(`Amount (${amountNum}) is below product minimum (${minAmount})`);
  }
  if (amountNum > maxAmount) {
    errors.push(`Amount (${amountNum}) exceeds product maximum (${maxAmount})`);
  }
  
  // Validate term against product boundaries
  const actualTermType = termType || this.LOAN_TERM_TYPE;
  const termValueNum = parseInt(termValue);
  
  if (actualTermType !== this.LOAN_TERM_TYPE) {
    errors.push(`Term type (${actualTermType}) does not match product term type (${this.LOAN_TERM_TYPE})`);
  } else {
    const minTerm = this.MIN_LOAN_TERM_VALUE || 1;
    const maxTerm = this.MAX_LOAN_TERM_VALUE || 60;
    
    if (termValueNum < minTerm) {
      errors.push(`Term value (${termValueNum}) is below product minimum (${minTerm})`);
    }
    if (termValueNum > maxTerm) {
      errors.push(`Term value (${termValueNum}) exceeds product maximum (${maxTerm})`);
    }
  }
  
  // If we have the interest rate populated, validate against it too
  if (this.LOAN_INTEREST_RATE_ID && typeof this.LOAN_INTEREST_RATE_ID === 'object') {
    const interestRate = this.LOAN_INTEREST_RATE_ID;
    
    // Validate term against interest rate limits
    if (actualTermType !== interestRate.LOAN_TERM_TYPE) {
      errors.push(`Term type (${actualTermType}) does not match interest rate term type (${interestRate.LOAN_TERM_TYPE})`);
    } else {
      const interestMinTerm = interestRate.MIN_LOAN_TERM_VALUE;
      const interestMaxTerm = interestRate.MAX_LOAN_TERM_VALUE;
      
      if (termValueNum < interestMinTerm) {
        errors.push(`Term value (${termValueNum}) is below interest rate minimum (${interestMinTerm})`);
      }
      if (termValueNum > interestMaxTerm) {
        errors.push(`Term value (${termValueNum}) exceeds interest rate maximum (${interestMaxTerm})`);
      }
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
};

// ======================
// STATIC METHODS
// ======================

// Find active products with populated interest rates
loanProductSchema.statics.findActiveProducts = function() {
  return this.find({ STATUS: 'ACTIVE', isActive: true })
    .populate('LOAN_INTEREST_RATE_ID')
    .sort({ name: 1 });
};

// Find products by term type with interest rates
loanProductSchema.statics.findByTermType = function(termType, status = 'ACTIVE') {
  return this.find({
    LOAN_TERM_TYPE: termType.toUpperCase(),
    STATUS: status,
    isActive: true
  })
  .populate('LOAN_INTEREST_RATE_ID')
  .sort({ name: 1 });
};

// ======================
// PRE-SAVE HOOK
// ======================
loanProductSchema.pre('save', async function (next) {
  try {
    // Generate PROD_ID from productCode if not provided
    if (!this.PROD_ID && this.productCode) {
      this.PROD_ID = parseInt(this.productCode, 10) || Date.now() % 100000;
    }

    // Validate that referenced interest rate exists
    if (this.LOAN_INTEREST_RATE_ID) {
      const interestRate = await mongoose.model('LoanInterestRate').findById(this.LOAN_INTEREST_RATE_ID);
      if (!interestRate) {
        throw new Error(`Referenced interest rate with ID ${this.LOAN_INTEREST_RATE_ID} not found`);
      }
      
      // Set LOAN_PROUD_INT_ID from interest rate for easier reference
      if (!this.LOAN_PROUD_INT_ID && interestRate.LOAN_PROUD_INT_ID) {
        this.LOAN_PROUD_INT_ID = interestRate.LOAN_PROUD_INT_ID;
      }
      
      // Set PRODUCT_SHORT_NAME from interest rate if not set
      if (!this.PRODUCT_SHORT_NAME && interestRate.PRODUCT_SHORT_NAME) {
        this.PRODUCT_SHORT_NAME = interestRate.PRODUCT_SHORT_NAME;
      }
    }

    // Set TERM_CD based on LOAN_TERM_TYPE
    if (!this.TERM_CD) {
      switch(this.LOAN_TERM_TYPE) {
        case 'DAYS': this.TERM_CD = 'D'; break;
        case 'WEEKS': this.TERM_CD = 'W'; break;
        case 'MONTHS': this.TERM_CD = 'M'; break;
        case 'QUARTERS': this.TERM_CD = 'Q'; break;
        case 'YEARS': this.TERM_CD = 'Y'; break;
        default: this.TERM_CD = 'M';
      }
    }

    // Set PAYMENT_FREQUENCY based on LOAN_TERM_TYPE if not set
    if (!this.PAYMENT_FREQUENCY) {
      switch(this.LOAN_TERM_TYPE) {
        case 'DAYS': this.PAYMENT_FREQUENCY = 'DAILY'; break;
        case 'WEEKS': this.PAYMENT_FREQUENCY = 'WEEKLY'; break;
        case 'MONTHS':
        case 'QUARTERS':
        case 'YEARS':
          this.PAYMENT_FREQUENCY = 'MONTHLY'; break;
        default: this.PAYMENT_FREQUENCY = 'MONTHLY';
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ======================
// INDEXES
// ======================
loanProductSchema.index({ PROD_ID: 1, STATUS: 1 });
loanProductSchema.index({ PRODUCT_TYPE: 1, STATUS: 1 });
loanProductSchema.index({ LOAN_TERM_TYPE: 1, STATUS: 1 });
loanProductSchema.index({ LOAN_INTEREST_RATE_ID: 1 });
loanProductSchema.index({ BU_ID: 1 });
loanProductSchema.index({ PRODUCT_SHORT_NAME: 'text', description: 'text', name: 'text' });

const LoanProduct = mongoose.models.LoanProduct || mongoose.model('LoanProduct', loanProductSchema);

export default LoanProduct;