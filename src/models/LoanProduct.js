import mongoose from 'mongoose';

const loanProductSchema = new mongoose.Schema(
  {
    PROD_ID: {
      type: Number,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          const validProdIds = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 399];
          return validProdIds.includes(v);
        },
        message: props => `${props.value} is not a valid PROD_ID!`
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
    description: {
      type: String,
      trim: true
    },
    PRODUCT_TYPE: {
      type: String,
      required: true,
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
    CRNCY_ID: {
      type: String,
      required: true,
      default: 'NGN'
    },
    
    // UPDATED: BU_ID with wildcard support for multiple business units
    BU_ID: {
      type: [String],
      required: true,
      validate: {
        validator: function(buIds) {
          if (!Array.isArray(buIds) || buIds.length === 0) {
            return false;
          }
          
          // Valid patterns: 3-digit numbers, wildcards (*, 10*, *01, 1*1)
          const validBuPattern = /^(\d{3}|\*|\d{1,2}\*|\*\d{1,2}|\d\*\d)$/;
          
          return buIds.every(id => validBuPattern.test(id));
        },
        message: 'BU_ID must be an array of valid business unit identifiers. Examples: ["101"], ["101", "102"], ["10*", "2*1"], ["*"]'
      }
    },
    
    // NEW: Product visibility settings
    isGlobalProduct: {
      type: Boolean,
      default: false
    },
    
    // NEW: Track which BUs can access this product
    accessibleBUs: {
      type: [String],
      default: function() {
        return this.BU_ID || [];
      }
    },
    
    // NEW: Product visibility level
    visibility: {
      type: String,
      enum: ['GLOBAL', 'SELECTED_BUS', 'SPECIFIC_BRANCHES'],
      default: 'SELECTED_BUS'
    },

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
    interestRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 6.00,
      set: v => mongoose.Types.Decimal128.fromString(v ? v.toString() : '6.00'),
      default: '6.00'
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: String,
    allowedCurrencies: [{
      type: String,
      default: 'NGN'
    }],
    // GL Accounts (without validation)
    loanGLAccount: {
      type: String,
      required: true
    },
    interestGLAccountNo: {
      type: String
    },
    interestPayableGLAccountNo: {
      type: String
    },
    withholdingTaxGLAccountNo: {
      type: String
    },
    suspenseGLAccountNo: {
      type: String
    },
    principalGLAccountNo: {
      type: String
    },
    chargeOffGLAccountNo: { type: String },
    loanChargeReceivableGLAccountNo: { type: String },
    contingentGLAccountNo: { type: String },
    delinquentGLAccountNo: { type: String },
    interestIncomeGLAccountNo: { type: String },
    interestReceivableGLAccountNo: { type: String },
    interestSuspenseGLAccountNo: { type: String },
    lateFeeSuspenseGLAccountNo: { type: String },
    maturityGLAccountNo: { type: String },
    nonAccrualGLAccountNo: { type: String },
    nonAccrualInterestOffsetGLAccountNo: { type: String },
    nonAccrualInterestReceivableGLAccountNo: { type: String },
    provisionReserveGLAccountNo: { type: String },
    provisionExpenseGLAccountNo: { type: String },
    recoveriesGLAccountNo: { type: String },
    repaymentControlGLAccountNo: { type: String },
    loanSuspenseGLAccountNo: { type: String },
    unappliedFundsGLAccountNo: { type: String },
    unclearedBalanceGLAccountNo: { type: String },
    unearnedInterestGLAccountNo: { type: String },
    interestCreditGLAccountNo: { type: String },
    interestDebitGLAccountNo: { type: String },
    // Fee Structure (without GL validation)
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
        type: String
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
      type: String
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
    // Rate Information
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
      indexRate: String,
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
      newEffectiveDate: String,
      rateChangeFrequency: {
        type: String,
        default: '1 YEAR'
      },
      maximumNumberOfChanges: {
        type: Number,
        default: 99
      }
    },
    // Accrual Information
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
    // Charges Setup (without GL validation)
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
        type: String
      }
    }]
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: function (doc, ret) {
        const decimalFields = [
          'minAmount',
          'maxAmount',
          'interestRate',
          'processingFeeRate',
          'lateFeePerDay',
          'maxLateFee',
          'rateInformation.absoluteRate',
          'rateInformation.fixedRate',
          'rateInformation.margin',
          'rateInformation.minimumRate',
          'rateInformation.maximumRate',
          'rateInformation.effectiveRate'
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

        if (ret._id) {
          ret._id = ret._id.toString();
        }

        return ret;
      }
    },
    toObject: { getters: true, virtuals: true }
  }
);

// Virtual
loanProductSchema.virtual('productId').get(function () {
  return this.PROD_ID;
});

// Pre-save Hook (GL validation removed)
loanProductSchema.pre('save', async function (next) {
  try {
    // Map productCode to PROD_ID and PROD_CD
    if (!this.isModified('PROD_ID') && this.productCode) {
      this.PROD_ID = parseInt(this.productCode, 10);
    }
    if (!this.isModified('PROD_CD') && this.productCode) {
      this.PROD_CD = String(this.productCode);
    }

    // Validate PROD_ID
    const validProdIds = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 399];
    if (!validProdIds.includes(this.PROD_ID)) {
      throw new Error(`${this.PROD_ID} is not a valid PROD_ID!`);
    }

    // Set default accessibleBUs if not provided
    if (!this.accessibleBUs || this.accessibleBUs.length === 0) {
      this.accessibleBUs = this.BU_ID || [];
    }

    // Set isGlobalProduct based on BU_ID patterns
    if (this.BU_ID && this.BU_ID.includes('*')) {
      this.isGlobalProduct = true;
    }

    // Set visibility based on BU_ID patterns
    if (!this.visibility) {
      const hasGlobalWildcard = this.BU_ID && this.BU_ID.includes('*');
      const hasWildcardPatterns = this.BU_ID && this.BU_ID.some(buId => buId.includes('*') && buId !== '*');
      const hasMultipleBUs = this.BU_ID && this.BU_ID.length > 1;

      if (hasGlobalWildcard) {
        this.visibility = 'GLOBAL';
      } else if (hasWildcardPatterns || hasMultipleBUs) {
        this.visibility = 'SELECTED_BUS';
      } else {
        this.visibility = 'SPECIFIC_BRANCHES';
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

const LoanProduct = mongoose.models.LoanProduct || mongoose.model('LoanProduct', loanProductSchema);

export default LoanProduct;