import mongoose from 'mongoose';

const rateInformationSchema = new mongoose.Schema({
  rateType: {
    type: String,
    enum: ['FIXED', 'FLOATING'],
    default: 'FIXED',
    required: true,
  },
  fixedRate: {
    type: mongoose.Types.Decimal128,
    required: function () { return this.rateType === 'FIXED'; },
    min: [0, 'Fixed rate cannot be negative'],
  },
  marginRate: {
    type: mongoose.Types.Decimal128,
    required: function () { return this.rateType === 'FLOATING'; },
    min: [0, 'Margin rate cannot be negative'],
  },
  effectiveRate: {
    type: mongoose.Types.Decimal128,
    required: true,
    min: [0, 'Effective rate cannot be negative'],
  },
  effectiveDate: {
    type: Date,
    required: true,
  },
});

const settlementInformationSchema = new mongoose.Schema({
  settlementFrequency: {
    type: String,
    enum: ['UPFRONT', 'MONTHLY', 'QUARTERLY', 'ANNUALLY', 'MATURITY'],
    required: true,
  },
  principalSettlementMethod: {
    type: String,
    enum: ['ACCOUNT', 'GL', 'CHECK'],
    required: true,
  },
  interestSettlementMethod: {
    type: String,
    enum: ['ACCOUNT', 'GL', 'CHECK'],
    required: true,
  },
  settlementGLAccountNo: {
    type: String,
    required: true,
  },
});

const accrualInformationSchema = new mongoose.Schema({
  accrualBasis: {
    type: String,
    enum: ['ACT/360', 'ACT/365', '30/360'],
    required: true,
  },
  accrualStartDate: {
    type: Date,
    required: true,
  },
  accrualFrequency: {
    type: String,
    enum: ['DAILY', 'MONTHLY', 'QUARTERLY'],
    required: true,
  },
});

const chargesSetupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  amount: {
    type: mongoose.Types.Decimal128,
    required: true,
    min: [0, 'Charge amount cannot be negative'],
  },
  glAccountCode: {
    type: String,
    required: true
  },
  chargeType: {
    type: String,
    enum: ['FLAT', 'PERCENTAGE'],
    required: true,
  },
  // Optional fields
  CHRG_ID: Number,
  CHRG_CD: String,
  chargeGLAccountNo: String,
  chargeName: String,
  status: String,
  TIER_TY: String,
  BAL_ACTION_CD: String,
  VERSION_NO: Number,
  USER_ID: String,
  CREATED_BY: String
}, { strict: false });

const glAccountsSchema = new mongoose.Schema({
  principalBalance: {
    type: String,
    required: true
  },
  interestIncome: {
    type: String,
    required: true
  },
  interestPayable: {
    type: String,
    required: true
  },
  withholdingTax: {
    type: String,
    required: true
  }
}, { 
  _id: false,
  strict: false 
});

const savingsProductSchema = new mongoose.Schema({
  PROD_ID: {
    type: Number,
    required: true,
    unique: true,
  },
  productCode: {
    type: String,
    required: true,
    unique: true,
  },
  productName: {
    type: String,
    required: true,
  },
  productDescription: {
    type: String,
    required: true,
  },
  productType: {
    type: String,
    enum: ['SAVINGS', 'TERM_DEPOSIT'],
    required: true,
  },
  CRNCY_ID: {
    type: String,
    required: true,
    enum: ['NGN', 'USD', 'EUR', 'GBP'],
  },
  
  // UPDATED: BU_ID as array to support multiple business units
 // UPDATED: BU_ID as array to support multiple business units, patterns, and global products
// In your SavingsProduct model (models/SavingsProduct.js)
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
      const invalidBUs = buIds.filter(buId => !validBuPattern.test(buId));
      
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

  // Optional fields
  PROD_CD: String,
  PROD_DESC: String,
  PRODUCT_TYPE: String,
  START_DT: { type: Date, default: Date.now },
  REC_ST: { type: String, default: 'A' },
  CREATED_BY: { type: String, default: 'system' },
  VERSION_NO: String,
  PROD_CAT_TY: String,
  PROD_DESIGN_ID: Number,
  MIN_AGE_YEAR: Number,
  USER_ID: String,
  STMNT_FREQ_CD: String,
  STMNT_FREQ_VALUE: Number,
  ACCT_CYCLE_CD: String,
  ACCT_CYCLE_VALUE: Number,
  ACCT_AUTH_BUS_PROD_ID: Number,

  // Core structured data
  rateInformation: rateInformationSchema,
  settlementInformation: settlementInformationSchema,
  accrualInformation: accrualInformationSchema,
  chargesSetup: [chargesSetupSchema],
  glAccounts: glAccountsSchema,

}, {
  timestamps: true,
  strict: false
});

// Clear any existing model and create new one
delete mongoose.connection.models['SavingsProduct'];
const SavingsProduct = mongoose.model('SavingsProduct', savingsProductSchema);

export default SavingsProduct;