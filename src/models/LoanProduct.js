// models/LoanProduct.js - UPDATED WITH PAGINATION PLUGIN
import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const loanProductSchema = new mongoose.Schema(
  {
    // ======================
    // PRODUCT IDENTIFICATION - FIXED
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
    PROD_CD: {
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
        'MONTHLY',
        'ASSET_LOAN',
        'RAPID_CASH_LOAN',
        'STAFF_LOAN',
        'STAFF_SALARY_ADVANCE',
        'GROUP_MONTHLY_LOAN',
        'SOLAR_LOAN',
        'DAILY_LOAN',
        'INDIVIDUAL_LOAN'
      ]
    },
    REPAYMENT_TYPE: {
      type: String,
      required: true,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'BULLET', 'CUSTOM'],
      default: 'MONTHLY'
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
    // BUSINESS UNIT & VISIBILITY - FIXED
    // ======================
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

    // ======================
    // LOAN AMOUNT & TERM CONSTRAINTS
    // ======================
    minAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      default: '0.00'
    },
    maxAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      default: '0.00'
    },
    minTerm: {
      type: Number,
      required: true,
      min: 1
    },
    maxTerm: {
      type: Number,
      required: true,
      min: 1
    },
    TERM_CD: {
      type: String,
      required: true,
      enum: ['D', 'W', 'M', 'Q', 'Y']
    },
    PAYMENT_FREQUENCY: {
      type: String,
      required: true,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']
    },
    MIN_LOAN_TERM_MONTHS: {
      type: Number,
      default: 1
    },
    MAX_LOAN_TERM_MONTHS: {
      type: Number,
      default: 60
    },
    MIN_DURATION_DAYS: {
      type: Number,
      default: 1
    },
    MIN_DURATION_WEEKS: {
      type: Number,
      default: 0
    },
    MIN_DURATION_MONTHS: {
      type: Number,
      default: 1
    },

    // ======================
    // INTEREST RATE FIELDS - FIXED
    // ======================
    LOAN_PROUD_INT_ID: {
      type: String,
      unique: true,
      sparse: true,
      default: function() {
        return `INT_${this.PROD_ID}_${Date.now()}`;
      }
    },
    INDEX_RATE_ID: {
      type: Number,
      default: 1
    },
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
      default: 'ACTUAL/360'
    },
    ACCRUAL_FREQ_CD: {
      type: String,
      default: 'DAILY'
    },
    ACCRUAL_FREQ_VALUE: {
      type: Number,
      default: 1
    },
    DR_CR_IND: {
      type: String,
      default: 'DR'
    },
    MATURITY_INT_INDEX_ID: {
      type: Number,
      default: null
    },
    MIN_RATE_PER_MONTH: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      required: true,
      min: 0,
      max: 100
    },
    MAX_RATE_PER_MONTH: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      required: true,
      min: 0,
      max: 100
    },
    DEFAULT_RATE_PER_MONTH: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      required: true,
      min: 0,
      max: 100
    },
    TOTAL_INTEREST_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      required: true,
      min: 0,
      max: 100
    },
    FIXED_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      min: 0,
      max: 100
    },
    ABSOLUTE_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      min: 0,
      max: 100
    },
    MARGIN_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      default: '0.00'
    },
    rateInformation: {
      rateType: {
        type: String,
        enum: ['FIXED', 'VARIABLE'],
        default: 'FIXED'
      },
      rateStructure: {
        type: String,
        enum: ['FLAT', 'DECLINING_BALANCE'],
        default: 'FLAT'
      },
      indexRate: {
        type: String,
        default: ''
      },
      absoluteRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00')
      },
      fixedRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 6.00,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '6.00'),
        default: '6.00'
      },
      margin: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00')
      },
      minimumRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00')
      },
      maximumRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00')
      },
      effectiveRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 6.00,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '6.00'),
        default: '6.00'
      },
      currentEffectiveDate: {
        type: String,
        default: () => new Date().toISOString().split('T')[0]
      },
      newEffectiveDate: {
        type: String,
        default: ''
      },
      rateChangeFrequency: {
        type: String,
        default: '1 YEAR'
      },
      maximumNumberOfChanges: {
        type: Number,
        default: 99
      }
    },
    interestRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 6.00,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '6.00'),
      default: '6.00'
    },

    // ======================
    // CAPITALIZATION & AMORTIZATION
    // ======================
    CAPITALIZE_INT_FG: {
      type: Boolean,
      default: false
    },
    AMORTIZED: {
      type: Boolean,
      default: true
    },
    REPAYMENT_FREQUENCY: {
      type: String,
      enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL'],
      default: 'MONTHLY'
    },
    CAPITALIZE_ACCT_ST: {
      type: String,
      enum: ['PENDING', 'CAPITALIZED', 'REJECTED'],
      default: 'PENDING'
    },

    // ======================
    // ACCRUAL INFORMATION
    // ======================
    accrualInformation: {
      accrualFrequency: {
        type: String,
        default: '1 DAY'
      },
      accrualBasis: {
        type: String,
        default: 'ACTUAL_DAYS/ACTUAL_DAYS'
      },
      accrualBalanceType: {
        type: String,
        default: 'CURRENT_CLEARED'
      },
      marginBalanceType: {
        type: String,
        default: 'CURRENT_CLEARED'
      },
      skipInterestForIncompletePeriod: {
        type: Boolean,
        default: false
      }
    },
    DAILY_ACCRUAL_CONFIG: {
      GL_ACCOUNT: {
        type: String,
        default: '400100'
      },
      POSTING_FREQUENCY: {
        type: String,
        enum: ['EOD', 'EOM', 'EOQ'],
        default: 'EOD'
      }
    },

    // ======================
    // RATE CHANGE RULES
    // ======================
    RATE_CHANGE_ALLOWED: {
      type: Boolean,
      default: false
    },
    RATE_CHANGE_NOTICE_DAYS: {
      type: Number,
      default: 30
    },

    // ======================
    // TIME PERIOD
    // ======================
    TIME: {
      type: Number,
      default: 12
    },

    // ======================
    // FEE STRUCTURE & CHARGES
    // ======================
    feeStructure: [{
      feeType: {
        type: String,
        enum: ['PROCESSING', 'INSURANCE', 'LATE_PAYMENT', 'OTHER'],
        required: true
      },
      name: {
        type: String,
        required: true
      },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
        default: '0.00'
      },
      isPercentage: {
        type: Boolean,
        default: false
      },
      glAccountCode: {
        type: String,
        default: ''
      },
      appliesTo: {
        type: String,
        enum: ['DISBURSEMENT', 'REPAYMENT', 'BOTH'],
        default: 'DISBURSEMENT'
      },
      isActive: {
        type: Boolean,
        default: true
      }
    }],
    processingFeeRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
      default: '0.00'
    },
    processingFeeGLCode: {
      type: String,
      default: ''
    },
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
    chargesSetup: [{
      chargeType: {
        type: String,
        required: true
      },
      name: {
        type: String,
        required: true
      },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '0.00'),
        default: '0.00'
      },
      glAccountCode: {
        type: String,
        default: ''
      }
    }],

    // ======================
    // GL ACCOUNTS
    // ======================
    branchGLAccounts: [{
      branchCode: {
        type: String,
        required: true,
        trim: true
      },
      branchName: {
        type: String,
        required: true
      },
      loanGLAccount: String,
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
      processingFeeGLCode: String,
      isActive: {
        type: Boolean,
        default: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    defaultGLAccounts: {
      loanGLAccount: {
        type: String,
        required: true
      },
      interestGLAccountNo: {
        type: String,
        default: ''
      },
      interestPayableGLAccountNo: {
        type: String,
        default: ''
      },
      withholdingTaxGLAccountNo: {
        type: String,
        default: ''
      },
      suspenseGLAccountNo: {
        type: String,
        default: ''
      },
      principalGLAccountNo: {
        type: String,
        default: ''
      },
      chargeOffGLAccountNo: {
        type: String,
        default: ''
      },
      loanChargeReceivableGLAccountNo: {
        type: String,
        default: ''
      },
      contingentGLAccountNo: {
        type: String,
        default: ''
      },
      delinquentGLAccountNo: {
        type: String,
        default: ''
      },
      interestIncomeGLAccountNo: {
        type: String,
        default: ''
      },
      interestReceivableGLAccountNo: {
        type: String,
        default: ''
      },
      interestSuspenseGLAccountNo: {
        type: String,
        default: ''
      },
      lateFeeSuspenseGLAccountNo: {
        type: String,
        default: ''
      },
      maturityGLAccountNo: {
        type: String,
        default: ''
      },
      nonAccrualGLAccountNo: {
        type: String,
        default: ''
      },
      nonAccrualInterestOffsetGLAccountNo: {
        type: String,
        default: ''
      },
      nonAccrualInterestReceivableGLAccountNo: {
        type: String,
        default: ''
      },
      provisionReserveGLAccountNo: {
        type: String,
        default: ''
      },
      provisionExpenseGLAccountNo: {
        type: String,
        default: ''
      },
      recoveriesGLAccountNo: {
        type: String,
        default: ''
      },
      repaymentControlGLAccountNo: {
        type: String,
        default: ''
      },
      loanSuspenseGLAccountNo: {
        type: String,
        default: ''
      },
      unappliedFundsGLAccountNo: {
        type: String,
        default: ''
      },
      unclearedBalanceGLAccountNo: {
        type: String,
        default: ''
      },
      unearnedInterestGLAccountNo: {
        type: String,
        default: ''
      },
      interestCreditGLAccountNo: {
        type: String,
        default: ''
      },
      interestDebitGLAccountNo: {
        type: String,
        default: ''
      },
      processingFeeGLCode: {
        type: String,
        default: ''
      }
    },

    // ======================
    // SYSTEM METADATA & STATUS
    // ======================
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
    isActive: {
      type: Boolean,
      default: true
    },

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
    LAST_MODIFIED_BY: {
      type: String,
      default: ''
    },

    // ======================
    // METADATA FOR TRACKING
    // ======================
    metadata: {
      isWildcardProduct: {
        type: Boolean,
        default: false
      },
      totalBranches: {
        type: Number,
        default: 0
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      createdByUser: {
        type: String,
        default: 'SYSTEM'
      }
    }
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: function (doc, ret) {
        const decimalFields = [
          'minAmount', 'maxAmount', 'interestRate', 'processingFeeRate', 'lateFeePerDay', 'maxLateFee',
          'MIN_RATE_PER_MONTH', 'MAX_RATE_PER_MONTH', 'DEFAULT_RATE_PER_MONTH', 'TOTAL_INTEREST_RATE',
          'FIXED_RATE', 'ABSOLUTE_RATE', 'MARGIN_RATE'
        ];

        decimalFields.forEach(field => {
          if (ret[field] && typeof ret[field] === 'object') {
            ret[field] = parseFloat(ret[field].toString());
          }
        });

        if (ret.rateInformation) {
          const rateDecimalFields = ['absoluteRate', 'fixedRate', 'margin', 'minimumRate', 'maximumRate', 'effectiveRate'];
          rateDecimalFields.forEach(field => {
            if (ret.rateInformation[field] && typeof ret.rateInformation[field] === 'object') {
              ret.rateInformation[field] = parseFloat(ret.rateInformation[field].toString());
            }
          });
        }

        if (ret.feeStructure) {
          ret.feeStructure = ret.feeStructure.map(fee => ({
            ...fee,
            amount: fee.amount && typeof fee.amount === 'object' ? parseFloat(fee.amount.toString()) : fee.amount
          }));
        }

        if (ret.chargesSetup) {
          ret.chargesSetup = ret.chargesSetup.map(charge => ({
            ...charge,
            amount: charge.amount && typeof charge.amount === 'object' ? parseFloat(charge.amount.toString()) : charge.amount
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

// Virtual for getMinDurationDisplay
loanProductSchema.virtual('getMinDurationDisplay').get(function() {
  if (this.MIN_DURATION_DAYS === 1 && this.MIN_DURATION_MONTHS === 0) {
    return '1 day';
  } else if (this.MIN_DURATION_WEEKS > 0) {
    return `${this.MIN_DURATION_WEEKS} week${this.MIN_DURATION_WEEKS > 1 ? 's' : ''}`;
  } else if (this.MIN_DURATION_MONTHS > 0) {
    return `${this.MIN_DURATION_MONTHS} month${this.MIN_DURATION_MONTHS > 1 ? 's' : ''}`;
  } else if (this.MIN_DURATION_DAYS > 0) {
    return `${this.MIN_DURATION_DAYS} day${this.MIN_DURATION_DAYS > 1 ? 's' : ''}`;
  }
  return 'N/A';
});

// Static method to get active products
loanProductSchema.statics.findActiveProducts = function() {
  return this.find({ STATUS: 'ACTIVE', isActive: true });
};

// Instance method to get branch details
loanProductSchema.methods.getBranchDetails = async function(branchCode) {
  return this.branchGLAccounts.find(branch => branch.branchCode === branchCode);
};

// Indexes
loanProductSchema.index({ PROD_ID: 1, STATUS: 1 });
loanProductSchema.index({ PRODUCT_TYPE: 1, STATUS: 1 });
loanProductSchema.index({ BU_ID: 1 });
loanProductSchema.index({ PRODUCT_SHORT_NAME: 'text', description: 'text' });

// Pre-save hook
loanProductSchema.pre('save', async function (next) {
  try {
    // Map productCode to PROD_ID and PROD_CD
    if (!this.isModified('PROD_ID') && this.productCode) {
      this.PROD_ID = parseInt(this.productCode, 10) || 1001;
    }
    if (!this.isModified('PROD_CD') && this.productCode) {
      this.PROD_CD = String(this.productCode);
    }

    // Generate LOAN_PROUD_INT_ID if not provided
    if (!this.LOAN_PROUD_INT_ID) {
      this.LOAN_PROUD_INT_ID = `INT_${this.PROD_ID}_${Date.now()}`;
    }

    // Normalize PRODUCT_TYPE
    if (this.PRODUCT_TYPE === 'MONTHLY') {
      this.PRODUCT_TYPE = 'PERSONAL_LOAN';
    }

    // Set default accessibleBUs if not provided
    if (!this.accessibleBUs || this.accessibleBUs.length === 0) {
      this.accessibleBUs = this.BU_ID || [];
    }

    // Set isGlobalProduct based on BU_ID patterns
    if (this.BU_ID && (this.BU_ID.includes('*') || this.isGlobalProduct)) {
      this.isGlobalProduct = true;
      if (!this.BU_ID.includes('*')) {
        this.BU_ID.push('*');
      }
    }

    // Set visibility based on BU_ID patterns
    if (!this.visibility) {
      const hasGlobalWildcard = this.BU_ID && this.BU_ID.includes('*');
      const hasMultipleBUs = this.BU_ID && this.BU_ID.length > 1;

      if (hasGlobalWildcard) {
        this.visibility = 'GLOBAL';
      } else if (hasMultipleBUs) {
        this.visibility = 'SELECTED_BUS';
      } else {
        this.visibility = 'SPECIFIC_BRANCHES';
      }
    }

    // Set metadata
    if (!this.metadata) {
      this.metadata = {};
    }
    this.metadata.isWildcardProduct = this.isGlobalProduct;
    this.metadata.createdAt = this.metadata.createdAt || new Date();
    this.metadata.createdByUser = this.createdBy || 'SYSTEM';

    // Ensure default rate is within min-max range
    const defaultRate = parseFloat(this.DEFAULT_RATE_PER_MONTH.toString());
    const minRate = parseFloat(this.MIN_RATE_PER_MONTH.toString());
    const maxRate = parseFloat(this.MAX_RATE_PER_MONTH.toString());

    if (defaultRate < minRate || defaultRate > maxRate) {
      throw new Error(`Default rate (${defaultRate}%) must be between min (${minRate}%) and max (${maxRate}%) rates`);
    }

    // Set ABSOLUTE_RATE and FIXED_RATE
    if (this.RATE_TY === 'FIXED') {
      this.ABSOLUTE_RATE = this.DEFAULT_RATE_PER_MONTH;
      this.FIXED_RATE = this.DEFAULT_RATE_PER_MONTH;
    }

    // Set accrual frequency based on REPAYMENT_TYPE
    if (!this.ACCRUAL_FREQ_CD) {
      switch(this.REPAYMENT_TYPE) {
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
        default:
          this.ACCRUAL_FREQ_CD = 'DAILY';
          this.ACCRUAL_FREQ_VALUE = 1;
      }
    }

    // Set repayment frequency
    if (!this.REPAYMENT_FREQUENCY) {
      switch(this.REPAYMENT_TYPE) {
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
        default:
          this.REPAYMENT_FREQUENCY = 'MONTHLY';
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

const LoanProduct = mongoose.models.LoanProduct || mongoose.model('LoanProduct', loanProductSchema);

export default LoanProduct;