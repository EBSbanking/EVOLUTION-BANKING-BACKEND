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
    get: v => (v ? parseFloat(v.toString()).toFixed(2) : '0.00'),
  },
  marginRate: {
    type: mongoose.Types.Decimal128,
    required: function () { return this.rateType === 'FLOATING'; },
    min: [0, 'Margin rate cannot be negative'],
    get: v => (v ? parseFloat(v.toString()).toFixed(2) : '0.00'),
  },
  effectiveRate: {
    type: mongoose.Types.Decimal128,
    required: true,
    min: [0, 'Effective rate cannot be negative'],
    get: v => (v ? parseFloat(v.toString()).toFixed(2) : '0.00'),
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
    enum: ['ACCOUNT', 'GL'],
    required: true,
  },
  interestSettlementMethod: {
    type: String,
    enum: ['ACCOUNT', 'GL'],
    required: true,
  },
  settlementGLAccountNo: {
    type: String,
    required: true,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
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
  CHRG_ID: {
    type: Number,
    required: false
  },
  CHRG_CD: {
    type: String,
    required: false
  },
  chargeType: {
    type: String,
    enum: ['FLAT', 'PERCENTAGE'],
    required: true,
  },
  chargeAmount: {
    type: mongoose.Types.Decimal128,
    required: true,
    min: [0, 'Charge amount cannot be negative'],
    get: v => parseFloat(v.toString()).toFixed(2),
  },
  chargeGLAccountNo: {
    type: String,
    required: true,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  chargeName: {
    type: String,
    required: false
  },
  status: {
    type: String,
    required: false
  },
  TIER_TY: {
    type: String,
    required: false
  },
  BAL_ACTION_CD: {
    type: String,
    required: false
  },
  VERSION_NO: {
    type: Number,
    required: false
  },
  USER_ID: {
    type: String,
    required: false
  },
  CREATED_BY: {
    type: String,
    required: false
  }
});

const savingsProductSchema = new mongoose.Schema({
  PROD_ID: {
    type: Number,
    required: true,
    unique: true,
    validate: {
      validator: function (v) {
        return typeof v === 'number' && v > 0;
      },
      message: props => `${props.value} is not a valid PROD_ID! Must be a positive number.`
    }
  },
  PROD_CD: {
    type: String,
    required: false
  },
  PROD_DESC: {
    type: String,
    required: false
  },
  PRODUCT_TYPE: {
    type: String,
    enum: ['SAVINGS', 'TERM_DEPOSIT'],
    required: true,
  },
  productCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  productName: {
    type: String,
    required: true,
    trim: true,
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
  START_DT: {
    type: Date,
    default: Date.now
  },
  REC_ST: {
    type: String,
    default: 'A'
  },
  CREATED_BY: {
    type: String,
    default: 'system'
  },
  BU_ID: {
    type: String,
    required: true,
    match: [/^\d{3}$/, 'BU_ID must be a 3-digit string'],
  },
  
  // Additional fields
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

  rateInformation: rateInformationSchema,
  settlementInformation: settlementInformationSchema,
  accrualInformation: accrualInformationSchema,
  chargesSetup: chargesSetupSchema,
  
  // GL Account Fields
  principalBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestPayableGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  withholdingTaxGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  depositChargeReceivableGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  delinquentBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  dormantBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  earmarkedBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  escheatedBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestChequesGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestExpenseGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestIncomeGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestReceivableGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestSuspenseGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  maturedBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  maturityChequesGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  nonAccrualBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  overdrawnBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  preDormantBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  provisionReserveGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  provisionExpenseGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  rejectedCreditSuspenseGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  rejectedDebitSuspenseGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  reservedBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  unclearedBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  writeOffBalanceGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  recoveriesGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestCreditGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
  interestDebitGLAccountNo: {
    type: String,
    required: false,
    match: [/^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}$/, 'Invalid GL account number format'],
  },
}, {
  timestamps: true // This automatically adds createdAt and updatedAt
});

// Indexes
savingsProductSchema.index({ PROD_ID: 1 }, { unique: true });
savingsProductSchema.index({ productCode: 1 }, { unique: true });

// ✅ CORRECTED EXPORT - Check if model already exists before creating
const SavingsProduct = mongoose.models.SavingsProduct || mongoose.model('SavingsProduct', savingsProductSchema);

export default SavingsProduct;