// models/SavingsProduct.js
import mongoose from 'mongoose';

const savingsProductSchema = new mongoose.Schema({
  productCode: {
    type: Number,
    required: true,
    unique: true
  },
  productName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  productDescription: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  // GL Accounts - Defined at product level only
  glAccounts: {
    principalBalance: {
      type: String,
      required: true,
      validate: {
        validator: v => /^\d+$/.test(v),
        message: 'Principal balance GL account must contain only digits'
      }
    },
    interestIncome: {
      type: String,
      required: true,
      validate: {
        validator: v => /^\d+$/.test(v),
        message: 'Interest income GL account must contain only digits'
      }
    },
    interestPayable: {
      type: String,
      required: true,
      validate: {
        validator: v => /^\d+$/.test(v),
        message: 'Interest payable GL account must contain only digits'
      }
    },
    withholdingTax: {
      type: String,
      required: true,
      validate: {
        validator: v => /^\d+$/.test(v),
        message: 'Withholding tax GL account must contain only digits'
      }
    },
    interestExpense: {
      type: String,
      validate: {
        validator: v => !v || /^\d+$/.test(v),
        message: 'Interest expense GL account must contain only digits'
      }
    },
    depositChargeReceivable: {
      type: String,
      validate: {
        validator: v => !v || /^\d+$/.test(v),
        message: 'Deposit charge receivable GL account must contain only digits'
      }
    }
  },
  // Product configuration
  interestRate: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: v => (v ? parseFloat(v.toString()) : 0)
  },
  minimumBalance: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: v => (v ? parseFloat(v.toString()) : 0)
  },
  maximumBalance: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => (v ? parseFloat(v.toString()) : null)
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
    indexRate: {
      type: String,
      required: false
    },
    absoluteRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : null),
      required: false
    },
    fixedRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : 6),
      default: mongoose.Types.Decimal128.fromString("6.00")
    },
    margin: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : null),
      required: false
    },
    minimumRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : null),
      required: false
    },
    maximumRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : null),
      required: false
    },
    effectiveRate: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => (v ? parseFloat(v.toString()) : 6.00),
      default: mongoose.Types.Decimal128.fromString("6.00")
    },
    currentEffectiveDate: {
      type: String,
      default: '2024-05-31'
    },
    newEffectiveDate: {
      type: String,
      required: false
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
  // Settlement Information
  settlementInformation: {
    settlementFrequency: {
      type: String,
      default: 'LAST_DAY_OF_MONTH'
    },
    applicableAccountStatusOption: {
      type: String,
      enum: ['ACTIVE_ONLY', 'ALL'],
      default: 'ACTIVE_ONLY'
    },
    settlementMethod: {
      type: String,
      default: 'DEFAULT'
    },
    settlementAccountType: {
      type: String,
      enum: ['OWN_ACCOUNT', 'OTHER_ACCOUNT', 'CHEQUE'],
      default: 'OWN_ACCOUNT'
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
      required: true,
      get: v => (v ? parseFloat(v.toString()) : 0)
    },
    glAccountCode: {
      type: String,
      required: true,
      validate: {
        validator: v => /^\d+$/.test(v),
        message: 'Charge GL account code must contain only digits'
      }
    }
  }],
  // Product status
  REC_ST: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'],
    default: 'ACTIVE',
    uppercase: true
  },
  CURRENCY: {
    type: String,
    default: 'NGN'
  },
  CREATED_BY: {
    type: String,
    default: 'system'
  }
}, {
  timestamps: true,
  toJSON: {
    getters: true,
    transform: (doc, ret) => {
      // Convert Decimal128 to numbers in JSON output
      ['interestRate', 'minimumBalance', 'maximumBalance'].forEach(field => {
        if (ret[field] && typeof ret[field] === 'object') {
          ret[field] = parseFloat(ret[field].toString());
        }
      });
      return ret;
    }
  }
});

// Index for frequently queried fields
savingsProductSchema.index({ productCode: 1 });
savingsProductSchema.index({ REC_ST: 1 });

const SavingsProduct = mongoose.models.SavingsProduct || 
  mongoose.model('SavingsProduct', savingsProductSchema);

export default SavingsProduct;