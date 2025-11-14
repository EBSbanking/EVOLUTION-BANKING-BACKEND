// models/SavingsProduct.js - CONSOLIDATED MODEL
import mongoose from 'mongoose';

const rateInformationSchema = new mongoose.Schema({
  rateType: {
    type: String,
    enum: ['FIXED', 'FLOATING', 'VARIABLE'],
    default: 'FIXED',
  },
  fixedRate: {
    type: mongoose.Types.Decimal128,
    required: function () { return this.rateType === 'FIXED'; },
    min: [0, 'Fixed rate cannot be negative'],
    get: v => v ? parseFloat(v.toString()) : 0
  },
  marginRate: {
    type: mongoose.Types.Decimal128,
    required: function () { return this.rateType === 'FLOATING'; },
    min: [0, 'Margin rate cannot be negative'],
    get: v => v ? parseFloat(v.toString()) : 0
  },
  effectiveRate: {
    type: mongoose.Types.Decimal128,
    required: true,
    min: [0, 'Effective rate cannot be negative'],
    get: v => v ? parseFloat(v.toString()) : 0
  },
  effectiveDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  rateStructure: {
    type: String,
    enum: ['FLAT', 'DECLINING_BALANCE', 'TIERED'],
    default: 'FLAT'
  },
  minimumRate: {
    type: mongoose.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : null
  },
  maximumRate: {
    type: mongoose.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : null
  }
}, { 
  _id: false,
  toJSON: { getters: true }
});

const settlementInformationSchema = new mongoose.Schema({
  settlementFrequency: {
    type: String,
    enum: ['UPFRONT', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'MATURITY', 'LAST_DAY_OF_MONTH'],
    default: 'MONTHLY',
  },
  principalSettlementMethod: {
    type: String,
    enum: ['ACCOUNT', 'GL', 'CHECK', 'OWN_ACCOUNT', 'OTHER_ACCOUNT', 'CHEQUE'],
    default: 'ACCOUNT',
  },
  interestSettlementMethod: {
    type: String,
    enum: ['ACCOUNT', 'GL', 'CHECK', 'OWN_ACCOUNT', 'OTHER_ACCOUNT', 'CHEQUE'],
    default: 'ACCOUNT',
  },
  settlementGLAccountNo: {
    type: String,
    default: '1-01-001-001-001-1',
  },
  applicableAccountStatusOption: {
    type: String,
    enum: ['ACTIVE_ONLY', 'ALL'],
    default: 'ACTIVE_ONLY'
  }
}, { _id: false });

const accrualInformationSchema = new mongoose.Schema({
  accrualBasis: {
    type: String,
    enum: ['ACT/360', 'ACT/365', '30/360', 'ACTUAL_DAYS/ACTUAL_DAYS'],
    default: 'ACT/365',
  },
  accrualStartDate: {
    type: Date,
    default: Date.now
  },
  accrualFrequency: {
    type: String,
    enum: ['DAILY', 'MONTHLY', 'QUARTERLY'],
    default: 'DAILY',
  },
  accrualBalanceType: {
    type: String,
    default: 'CURRENT_CLEARED'
  },
  skipInterestForIncompletePeriod: {
    type: Boolean,
    default: false
  }
}, { _id: false });

const chargesSetupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  chargeType: {
    type: String,
    required: true,
    enum: ['FLAT', 'PERCENTAGE', 'MAINTENANCE', 'TRANSACTION']
  },
  amount: {
    type: mongoose.Types.Decimal128,
    required: true,
    min: [0, 'Charge amount cannot be negative'],
    get: v => v ? parseFloat(v.toString()) : 0
  },
  glAccountCode: {
    type: String,
    required: true,
    validate: {
      validator: v => /^\d+$/.test(v),
      message: 'GL account code must contain only digits'
    }
  },
  frequency: {
    type: String,
    enum: ['ONE_TIME', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'],
    default: 'ONE_TIME'
  }
}, { 
  _id: false,
  toJSON: { getters: true }
});

const glAccountsSchema = new mongoose.Schema({
  principalBalance: {
    type: String,
    required: true,
    validate: {
      validator: v => /^\d+$/.test(v),
      message: 'Principal balance GL account must contain only digits'
    },
    default: '1001001001'
  },
  interestIncome: {
    type: String,
    required: true,
    validate: {
      validator: v => /^\d+$/.test(v),
      message: 'Interest income GL account must contain only digits'
    },
    default: '1001001002'
  },
  interestPayable: {
    type: String,
    required: true,
    validate: {
      validator: v => /^\d+$/.test(v),
      message: 'Interest payable GL account must contain only digits'
    },
    default: '1001001003'
  },
  withholdingTax: {
    type: String,
    required: true,
    validate: {
      validator: v => /^\d+$/.test(v),
      message: 'Withholding tax GL account must contain only digits'
    },
    default: '1001001004'
  },
  interestReceivable: {
    type: String,
    validate: {
      validator: v => !v || /^\d+$/.test(v),
      message: 'Interest receivable GL account must contain only digits'
    },
    default: '1001001005'
  },
  interestExpense: {
    type: String,
    validate: {
      validator: v => !v || /^\d+$/.test(v),
      message: 'Interest expense GL account must contain only digits'
    }
  }
}, { 
  _id: false
});

const savingsProductSchema = new mongoose.Schema({
  // ✅ CORE IDENTIFIERS - FIXED: ADDED SETTER TO PREVENT NaN CAST ERRORS
  PROD_ID: {
    type: Number,
    required: true,
    set: function(v) {
      // Setter to prevent NaN or invalid values from being casted - reset to undefined to trigger default/pre-save
      if (v == null || isNaN(v) || v <= 0) {
        console.warn(`⚠️ Invalid PROD_ID detected (${v}), resetting to trigger auto-generation`);
        return undefined;
      }
      return Number(v); // Ensure it's a number
    },
    // No default here - handled in async pre-save for sequential generation
    min: [1, 'PROD_ID must be at least 1']
  },
  
  productCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
    // Removed: index: true - duplicate with schema.index below
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
  
  productType: {
    type: String,
    required: true,
    enum: ['SAVINGS', 'TERM_DEPOSIT', 'CURRENT', 'FIXED_DEPOSIT'],
    default: 'SAVINGS'
  },
  
  // ✅ FINANCIAL CONFIGURATION
  interestRate: {
    type: mongoose.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: v => v ? parseFloat(v.toString()) : 0
  },
  
  minimumBalance: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: v => v ? parseFloat(v.toString()) : 0
  },
  
  maximumBalance: {
    type: mongoose.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : null
  },
  
  // ✅ STRUCTURED CONFIGURATION
  rateInformation: {
    type: rateInformationSchema,
    default: () => ({
      rateType: 'FIXED',
      fixedRate: mongoose.Types.Decimal128.fromString('0.5'),
      effectiveRate: mongoose.Types.Decimal128.fromString('0.5'),
      effectiveDate: new Date(),
      rateStructure: 'FLAT'
    })
  },
  
  settlementInformation: {
    type: settlementInformationSchema,
    default: () => ({
      settlementFrequency: 'MONTHLY',
      principalSettlementMethod: 'ACCOUNT',
      interestSettlementMethod: 'ACCOUNT',
      settlementGLAccountNo: '1-01-001-001-001-1',
      applicableAccountStatusOption: 'ACTIVE_ONLY'
    })
  },
  
  accrualInformation: {
    type: accrualInformationSchema,
    default: () => ({
      accrualBasis: 'ACT/365',
      accrualStartDate: new Date(),
      accrualFrequency: 'DAILY',
      accrualBalanceType: 'CURRENT_CLEARED',
      skipInterestForIncompletePeriod: false
    })
  },
  
  chargesSetup: {
    type: [chargesSetupSchema],
    default: []
  },
  
  glAccounts: {
    type: glAccountsSchema,
    default: () => ({
      principalBalance: '1001001001',
      interestIncome: '1001001002',
      interestPayable: '1001001003',
      withholdingTax: '1001001004',
      interestReceivable: '1001001005'
    })
  },
  
  // ✅ BUSINESS UNIT & CURRENCY
  CRNCY_ID: {
    type: String,
    required: true,
    enum: ['NGN', 'USD', 'EUR', 'GBP'],
    default: 'NGN'
  },
  
  BU_ID: {
    type: [String],
    required: true,
    default: ['001']
  },
  
  CURRENCY: {
    type: String,
    default: 'NGN'
  },
  
  // ✅ PRODUCT VISIBILITY & ACCESS - FIXED: STATIC DEFAULT TO AVOID NULL ACCESS DURING UPSERT
  isGlobalProduct: {
    type: Boolean,
    default: false
  },
  
  accessibleBUs: {
    type: [String],
    default: ['001']  // Static default - sync in pre-save if needed
  },
  
  visibility: {
    type: String,
    enum: ['GLOBAL', 'SELECTED_BUS', 'SPECIFIC_BRANCHES'],
    default: 'SELECTED_BUS'
  },
  
  // ✅ LEGACY FIELDS FOR COMPATIBILITY
  PROD_CD: {
    type: String,
    trim: true,
    uppercase: true
  },
  
  PROD_DESC: {
    type: String,
    trim: true
  },
  
  PRODUCT_TYPE: {
    type: String,
    enum: ['SAVINGS', 'TERM_DEPOSIT', 'CURRENT', 'FIXED_DEPOSIT']
  },
  
  START_DT: { 
    type: Date, 
    default: Date.now 
  },
  
  // ✅ STATUS & AUDIT FIELDS
  REC_ST: {
    type: String,
    default: 'A',
    enum: ['A', 'I', 'ACTIVE', 'INACTIVE', 'DISCONTINUED'],
    uppercase: true
  },
  
  CREATED_BY: {
    type: String,
    default: 'system'
  }

}, {
  timestamps: true,
  toJSON: { 
    getters: true,
    virtuals: true,
    transform: function(doc, ret) {
      // Convert Decimal128 to numbers in JSON output
      const decimalFields = [
        'interestRate', 'minimumBalance', 'maximumBalance'
      ];
      
      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'object') {
          ret[field] = parseFloat(ret[field].toString());
        }
      });
      
      // Convert rate information decimals
      if (ret.rateInformation) {
        ['fixedRate', 'marginRate', 'effectiveRate', 'minimumRate', 'maximumRate'].forEach(field => {
          if (ret.rateInformation[field] && typeof ret.rateInformation[field] === 'object') {
            ret.rateInformation[field] = parseFloat(ret.rateInformation[field].toString());
          }
        });
      }
      
      // Convert charges amounts
      if (ret.chargesSetup && Array.isArray(ret.chargesSetup)) {
        ret.chargesSetup.forEach(charge => {
          if (charge.amount && typeof charge.amount === 'object') {
            charge.amount = parseFloat(charge.amount.toString());
          }
        });
      }
      
      return ret;
    }
  }
});

// ✅ FIXED: ASYNC PRE-SAVE FOR SEQUENTIAL PROD_ID GENERATION (PREVENTS NaN & ENSURES UNIQUENESS)
savingsProductSchema.pre('save', async function(next) {
  // Only auto-generate for new documents
  if (!this.isNew) {
    // Still sync accessibleBUs for updates
    this._syncAccessibleBUs();
    return next();
  }

  // If PROD_ID is already set and valid (after setter), skip
  if (this.PROD_ID && !isNaN(this.PROD_ID) && this.PROD_ID > 0) {
    console.log(`✅ PROD_ID already valid: ${this.PROD_ID}`);
    // Set legacy fields and other logic below
  } else {
    try {
      // Generate sequential ID starting from 1000
      this.PROD_ID = await this.constructor.getNextProdId();
      console.log(`🔄 Auto-generated sequential PROD_ID: ${this.PROD_ID}`);
    } catch (error) {
      console.error('❌ Error generating PROD_ID:', error);
      // Emergency fallback
      this.PROD_ID = 1000;
      console.log(`🔄 Fallback PROD_ID: ${this.PROD_ID}`);
    }
  }

  // ✅ Set legacy fields for compatibility if not provided
  if (!this.PROD_CD && this.productCode) {
    this.PROD_CD = this.productCode;
  }
  if (!this.PROD_DESC && this.productDescription) {
    this.PROD_DESC = this.productDescription;
  }
  if (!this.PRODUCT_TYPE && this.productType) {
    this.PRODUCT_TYPE = this.productType;
  }
  if (!this.CURRENCY && this.CRNCY_ID) {
    this.CURRENCY = this.CRNCY_ID;
  }
  
  // ✅ Ensure arrays are properly set
  if (!this.BU_ID || this.BU_ID.length === 0) {
    this.BU_ID = ['001'];
  }
  
  // ✅ Sync accessibleBUs based on BU_ID (safe now that BU_ID is set)
  this._syncAccessibleBUs();
  
  // ✅ Final sanity check (should never hit)
  if (!this.PROD_ID || isNaN(this.PROD_ID) || this.PROD_ID <= 0) {
    console.error('❌ CRITICAL: PROD_ID still invalid - emergency override');
    this.PROD_ID = 1000;
  }
  
  console.log(`🎯 FINAL PROD_ID: ${this.PROD_ID}`);
  next();
});

// ✅ NEW HELPER METHOD FOR SYNCING accessibleBUs (CALLED IN PRE-SAVE)
savingsProductSchema.methods._syncAccessibleBUs = function() {
  if (this.BU_ID && Array.isArray(this.BU_ID) && this.BU_ID.length > 0) {
    this.accessibleBUs = this.BU_ID;
  } else {
    this.accessibleBUs = ['001']; // Fallback
  }
  console.log(`🔄 Synced accessibleBUs to: ${JSON.stringify(this.accessibleBUs)}`);
};

// ✅ UPDATED STATIC METHOD: SEQUENTIAL WITH MINIMUM 1000 & BETTER ERROR HANDLING
savingsProductSchema.statics.getNextProdId = async function() {
  try {
    const lastProduct = await this.findOne().sort({ PROD_ID: -1 }).select('PROD_ID');
    if (lastProduct && lastProduct.PROD_ID && !isNaN(lastProduct.PROD_ID) && lastProduct.PROD_ID > 0) {
      const nextId = Number(lastProduct.PROD_ID) + 1;
      console.log(`📊 Sequential next PROD_ID: ${nextId}`);
      return Math.max(nextId, 1000); // Ensure at least 1000
    }
    console.log('📊 No existing products or invalid last ID - starting at 1000');
    return 1000;
  } catch (error) {
    console.error('❌ Error fetching last PROD_ID:', error);
    return 1000; // Safe fallback
  }
};

savingsProductSchema.statics.findByProductCode = function(productCode) {
  return this.findOne({
    $or: [
      { productCode: productCode },
      { PROD_CD: productCode }
    ],
    REC_ST: { $in: ['A', 'ACTIVE'] }
  });
};

savingsProductSchema.statics.getActiveProducts = function() {
  return this.find({
    REC_ST: { $in: ['A', 'ACTIVE'] }
  });
};

// ✅ INSTANCE METHODS
savingsProductSchema.methods.isActive = function() {
  return ['A', 'ACTIVE'].includes(this.REC_ST);
};

savingsProductSchema.methods.cloneForNewBU = function(buId) {
  const cloned = this.toObject();
  delete cloned._id;
  delete cloned.__v;
  cloned.BU_ID = [buId];
  cloned.accessibleBUs = [buId];
  cloned.productCode = `${this.productCode}_${buId}`;
  cloned.PROD_CD = `${this.PROD_CD}_${buId}`;
  return cloned;
};

// ✅ VIRTUAL FIELDS
savingsProductSchema.virtual('displayName').get(function() {
  return `${this.productCode} - ${this.productName}`;
});

savingsProductSchema.virtual('status').get(function() {
  return this.REC_ST === 'A' || this.REC_ST === 'ACTIVE' ? 'Active' : 'Inactive';
});

// ✅ INDEXES FOR PERFORMANCE - FIXED: REMOVED DUPLICATE productCode INDEX
savingsProductSchema.index({ productCode: 1 }, { unique: true });
savingsProductSchema.index({ PROD_ID: 1 }, { unique: true });
savingsProductSchema.index({ REC_ST: 1 });
savingsProductSchema.index({ productType: 1 });
savingsProductSchema.index({ BU_ID: 1 });

// Clear any existing model and create new one
if (mongoose.models.SavingsProduct) {
  delete mongoose.models.SavingsProduct;
}

const SavingsProduct = mongoose.model('SavingsProduct', savingsProductSchema);
export default SavingsProduct;