import mongoose from 'mongoose';

const ProductTypeMappingSchema = new mongoose.Schema(
  {
    PROD_ID: {
      type: Number,
      required: true,
      unique: true,
      validate: {
        validator: function (v) {
          // Allow any numeric PROD_ID, or define a broader range
          return typeof v === 'number' && v > 0;
        },
        message: props => `${props.value} is not a valid PROD_ID! Must be a positive number.`
      }
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
        'GROUP_LOAN',
        'SAVINGS',
        'TERM_DEPOSIT'
      ]
    },
    productName: {
      type: String,
      required: true,
      trim: true
    },
    PROD_DESC: {
      type: String,
      required: false
    },
    PROD_CD: {
      type: String,
      required: false
    },
    accountPrefix: {
      type: String,
      required: true,
      validate: {
        validator: function (v) {
          return typeof v === 'string' && v.length >= 2;
        },
        message: props => `${props.value} is not a valid account prefix! Must be at least 2 characters.`
      }
    },
    glAccounts: {
      // Loan-specific GL Accounts
      loanGLAccount: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for loanGLAccount`
        }
      },
      interestGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestGLAccountNo`
        }
      },
      interestPayableGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestPayableGLAccountNo`
        }
      },
      withholdingTaxGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for withholdingTaxGLAccountNo`
        }
      },
      suspenseGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for suspenseGLAccountNo`
        }
      },
      principalGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for principalGLAccountNo`
        }
      },
      chargeOffGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for chargeOffGLAccountNo`
        }
      },
      loanChargeReceivableGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for loanChargeReceivableGLAccountNo`
        }
      },
      contingentGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for contingentGLAccountNo`
        }
      },
      delinquentGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for delinquentGLAccountNo`
        }
      },
      interestIncomeGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestIncomeGLAccountNo`
        }
      },
      interestReceivableGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestReceivableGLAccountNo`
        }
      },
      interestSuspenseGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestSuspenseGLAccountNo`
        }
      },
      lateFeeSuspenseGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for lateFeeSuspenseGLAccountNo`
        }
      },
      maturityGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for maturityGLAccountNo`
        }
      },
      nonAccrualGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for nonAccrualGLAccountNo`
        }
      },
      nonAccrualInterestOffsetGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for nonAccrualInterestOffsetGLAccountNo`
        }
      },
      nonAccrualInterestReceivableGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for nonAccrualInterestReceivableGLAccountNo`
        }
      },
      provisionReserveGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for provisionReserveGLAccountNo`
        }
      },
      provisionExpenseGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for provisionExpenseGLAccountNo`
        }
      },
      recoveriesGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for recoveriesGLAccountNo`
        }
      },
      repaymentControlGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for repaymentControlGLAccountNo`
        }
      },
      loanSuspenseGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for loanSuspenseGLAccountNo`
        }
      },
      unappliedFundsGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for unappliedFundsGLAccountNo`
        }
      },
      unclearedBalanceGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for unclearedBalanceGLAccountNo`
        }
      },
      unearnedInterestGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for unearnedInterestGLAccountNo`
        }
      },
      interestCreditGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestCreditGLAccountNo`
        }
      },
      interestDebitGLAccountNo: { 
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestDebitGLAccountNo`
        }
      },
      
      // Savings/Deposit specific GL Accounts
      principalBalanceGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for principalBalanceGLAccountNo`
        }
      },
      interestExpenseGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for interestExpenseGLAccountNo`
        }
      },
      depositChargeReceivableGLAccountNo: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for depositChargeReceivableGLAccountNo`
        }
      },
      
      // Common GL Accounts
      SETTLEMENT_GL_ACCT_NO: {
        type: String,
        validate: {
          validator: async function (v) {
            if (!v) return true;
            const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: v });
            return !!glAccount;
          },
          message: props => `Invalid GL account number: ${props.value} for SETTLEMENT_GL_ACCT_NO`
        }
      }
    }
  },
  {
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true }
  }
);

// // Indexes
// ProductTypeMappingSchema.index({ PROD_ID: 1 }, { unique: true });

// Pre-save Hook - REMOVED the restrictive PROD_ID validation
ProductTypeMappingSchema.pre('save', async function (next) {
  try {
    // Only validate GL accounts - removed the restrictive PROD_ID validation
    const glFields = [
      'loanGLAccount',
      'interestGLAccountNo',
      'interestPayableGLAccountNo',
      'withholdingTaxGLAccountNo',
      'suspenseGLAccountNo',
      'principalGLAccountNo',
      'chargeOffGLAccountNo',
      'loanChargeReceivableGLAccountNo',
      'contingentGLAccountNo',
      'delinquentGLAccountNo',
      'interestIncomeGLAccountNo',
      'interestReceivableGLAccountNo',
      'interestSuspenseGLAccountNo',
      'lateFeeSuspenseGLAccountNo',
      'maturityGLAccountNo',
      'nonAccrualGLAccountNo',
      'nonAccrualInterestOffsetGLAccountNo',
      'nonAccrualInterestReceivableGLAccountNo',
      'provisionReserveGLAccountNo',
      'provisionExpenseGLAccountNo',
      'recoveriesGLAccountNo',
      'repaymentControlGLAccountNo',
      'loanSuspenseGLAccountNo',
      'unappliedFundsGLAccountNo',
      'unclearedBalanceGLAccountNo',
      'unearnedInterestGLAccountNo',
      'interestCreditGLAccountNo',
      'interestDebitGLAccountNo',
      'principalBalanceGLAccountNo',
      'interestExpenseGLAccountNo',
      'depositChargeReceivableGLAccountNo',
      'SETTLEMENT_GL_ACCT_NO'
    ];

    for (const field of glFields) {
      const value = this.glAccounts ? this.glAccounts[field] : null;
      if (value) {
        const glAccount = await mongoose.model('GLAccount').findOne({ GL_ACCT_NO: value });
        if (!glAccount) {
          throw new Error(`Invalid GL account code: ${value} for ${field}`);
        }
      }
    }

    // Validate PRODUCT_TYPE for loan products
    if (this.PRODUCT_TYPE && (this.PRODUCT_TYPE.includes('LOAN') || this.PRODUCT_TYPE === 'MORTGAGE' || this.PRODUCT_TYPE === 'CREDIT CARD')) {
      if (!this.glAccounts || !this.glAccounts.loanGLAccount) {
        throw new Error('loanGLAccount is required for loan products');
      }
    }

    // Validate PRODUCT_TYPE for savings/deposit products
    if (this.PRODUCT_TYPE && (this.PRODUCT_TYPE === 'SAVINGS' || this.PRODUCT_TYPE === 'TERM_DEPOSIT')) {
      if (!this.glAccounts || !this.glAccounts.principalBalanceGLAccountNo) {
        throw new Error('principalBalanceGLAccountNo is required for savings/deposit products');
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

const ProductTypeMapping = mongoose.models.ProductTypeMapping || mongoose.model('ProductTypeMapping', ProductTypeMappingSchema);

export default ProductTypeMapping;