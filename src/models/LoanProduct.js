import mongoose from 'mongoose';

const loanProductSchema = new mongoose.Schema(
  {
    PROD_ID: {
      type: Number,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          const validProdIds = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309,399, 400, 499];
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
        'GENERAL LOAN',
        'GROUP_LOAN'
      ]
    },
    CRNCY_ID: {
      type: String,
      required: true,
      default: 'NGN'
    },
    
    // BU_ID with wildcard support for multiple business units
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
    
    // Product visibility settings
    isGlobalProduct: {
      type: Boolean,
      default: false
    },
    
    // Track which BUs can access this product
    accessibleBUs: {
      type: [String],
      default: function() {
        return this.BU_ID || [];
      }
    },
    
    // Product visibility level
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

    // NEW: Branch-specific GL Accounts
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
      // GL Accounts for this branch
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
      
      // Status
      isActive: {
        type: Boolean,
        default: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],

    // RENAMED: Default GL Accounts (fallback)
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

    // Fee Structure
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
    // Charges Setup
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

        // Transform branchGLAccounts decimal fields
        if (ret.branchGLAccounts) {
          ret.branchGLAccounts = ret.branchGLAccounts.map(branch => {
            const transformedBranch = { ...branch };
            // Add any decimal transformations if needed for branch-specific amounts
            return transformedBranch;
          });
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

// Pre-save Hook
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
    const validProdIds = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 399, 400, 499];
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

    // Validate that defaultGLAccounts has required loanGLAccount
    if (!this.defaultGLAccounts || !this.defaultGLAccounts.loanGLAccount) {
      throw new Error('Default loan GL account is required');
    }

    // Validate branchGLAccounts structure
    if (this.branchGLAccounts && Array.isArray(this.branchGLAccounts)) {
      for (const branchAccount of this.branchGLAccounts) {
        if (!branchAccount.branchCode || !branchAccount.branchName) {
          throw new Error('Each branch GL account must have branchCode and branchName');
        }
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Static method to get GL account for a specific branch
loanProductSchema.statics.getBranchGLAccount = function(productId, branchCode, accountType) {
  return this.findOne({ PROD_ID: productId }).then(product => {
    if (!product) {
      throw new Error(`Loan product ${productId} not found`);
    }

    // Try to find branch-specific account first
    const branchAccount = product.branchGLAccounts?.find(
      account => account.branchCode === branchCode && account.isActive
    );
    
    if (branchAccount && branchAccount[accountType]) {
      return branchAccount[accountType];
    }
    
    // Fall back to default account
    return product.defaultGLAccounts?.[accountType];
  });
};

// Instance method to get GL account for a specific branch
loanProductSchema.methods.getGLAccountForBranch = function(branchCode, accountType) {
  // Try to find branch-specific account first
  const branchAccount = this.branchGLAccounts?.find(
    account => account.branchCode === branchCode && account.isActive
  );
  
  if (branchAccount && branchAccount[accountType]) {
    return branchAccount[accountType];
  }
  
  // Fall back to default account
  return this.defaultGLAccounts?.[accountType];
};

// Instance method to add or update branch GL accounts
loanProductSchema.methods.updateBranchGLAccounts = function(branchCode, branchName, glAccounts) {
  if (!this.branchGLAccounts) {
    this.branchGLAccounts = [];
  }

  const existingIndex = this.branchGLAccounts.findIndex(
    account => account.branchCode === branchCode
  );

  const branchGLAccount = {
    branchCode,
    branchName,
    ...glAccounts,
    isActive: true,
    createdAt: existingIndex === -1 ? new Date() : this.branchGLAccounts[existingIndex].createdAt
  };

  if (existingIndex === -1) {
    this.branchGLAccounts.push(branchGLAccount);
  } else {
    this.branchGLAccounts[existingIndex] = branchGLAccount;
  }

  return this.save();
};

const LoanProduct = mongoose.models.LoanProduct || mongoose.model('LoanProduct', loanProductSchema);

export default LoanProduct;