import mongoose from 'mongoose';
import SavingsProduct from '../models/SavingsProduct.js';

const TermDepositSchema = new mongoose.Schema(
  {
    ACCT_NM: {
      type: String,
      maxlength: 50,
      required: true,
      trim: true,
    },
    ACCT_NO: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: v => /^\d{10}$/.test(v),
        message: props => `${props.value} is not a valid 10-digit account number`,
      },
    },
    ACCT_ID: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: v => /^\d{6}$/.test(v),
        message: "ACCT_ID must be exactly 6 digits",
      },
    },
    CUST_ID: {
      type: String,
      required: true,
    },
    BU_ID: {
      type: String,
      required: true,
    },
    CRNCY_ID: {
      type: String,
      required: true,
    },
    productCode: {
      type: Number,
      required: true,
      ref: 'SavingsProduct',
      validate: {
        validator: async function(v) {
          const product = await SavingsProduct.findOne({ productCode: v });
          return !!product;
        },
        message: props => `Invalid productCode: ${props.value}. No matching SavingsProduct found.`,
      },
    },
    START_DT: {
      type: Date,
      required: true,
    },
    MATURITY_DT: {
      type: Date,
      required: true,
    },
    TERM: {
      type: Number,
      required: true,
      min: 1,
    },
    NOTICE_AMOUNT: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      min: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    PRIMARY_OFFICER: {
      type: String,
      required: true,
    },
    PRIMARY_OFFICER_ID: {
      type: String,
      required: true,
    },
    SECONDARY_OFFICER_ID: {
      type: String,
    },
    ROLLOVER_OPT_CD: {
      type: String,
      required: true,
    },
    ROLLOVER_TYPE: {
      type: String,
      enum: ['NONE', 'PRINCIPAL_ONLY', 'INTEREST_ONLY', 'PRINCIPAL_AND_INTEREST'],
      default: 'NONE',
      required: true,
    },
    INT_SETLMNT_OPTION_CD: {
      type: String,
      enum: ['ACCOUNT', 'GL'],
      required: true,
    },
    SETTLEMENT_ACCOUNT: {
      type: String,
      required: true,
    },
    PRINCIPAL_SETTLEMENT_METHOD: {
      type: String,
      enum: ['ACCOUNT', 'GL'],
      required: true,
    },
    CUST_NM: {
      type: String,
      required: true,
      trim: true,
    },
    OPENING_RSN_ID: {
      type: String,
    },
    MKT_CAMPAIGN_REF: {
      type: String,
    },
    AUTO_CLOSE_ON_EXPIRY_FG: {
      type: Boolean,
      default: false,
    },
    ALLOW_MULTIPLE_FD: {
      type: Boolean,
      default: false,
    },
    UPFRONT_INTEREST_PAYMENT: {
      type: Boolean,
      default: false,
    },
    PARTIAL_INTEREST_PAYMENT: {
      type: Boolean,
      default: false,
    },
    UPFRONT_INTEREST_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      min: 0,
      max: 100,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    UPFRONT_INTEREST_AMOUNT: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      min: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    MATURITY_INTEREST_AMOUNT: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      min: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    MATURITY_AMOUNT: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      min: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    INTEREST_PAYMENT_STATUS: {
      type: String,
      enum: ['PENDING', 'PARTIALLY_PAID', 'PAID'],
      default: 'PENDING',
    },
    SETTLEMENT_STATUS: {
      type: String,
      enum: ['ACTIVE', 'CLOSED', 'COMPLETED', 'TERMINATED'],
      default: 'ACTIVE',
    },
    GL_INTEREST_PAYMENT_TXN_ID: {
      type: String,
      default: null,
    },
    GL_SETTLEMENT_TXN_ID: {
      type: String,
      default: null,
    },
    CUSTOMER_INTEREST_PAYMENT_TXN_ID: {
      type: String,
      default: null,
    },
    CUSTOMER_SETTLEMENT_TXN_ID: {
      type: String,
      default: null,
    },
    ACCRUED_INTEREST: {
      type: mongoose.Schema.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString("0.00"),
      min: 0,
      get: v => (v ? parseFloat(v.toString()) : 0),
    },
    VERSION_NO: {
      type: Number,
      required: true,
      min: 1,
    },
    // GL Accounts (from SavingsProduct)
    depositChargeReceivableGLAccountNo: {
      type: String,
      required: true,
    },
    delinquentBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    dormantBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    earmarkedBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    escheatedBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    interestChequesGLAccountNo: {
      type: String,
      required: true,
    },
    interestExpenseGLAccountNo: {
      type: String,
      required: true,
    },
    interestIncomeGLAccountNo: {
      type: String,
      required: true,
    },
    interestPayableGLAccountNo: {
      type: String,
      required: true,
    },
    interestReceivableGLAccountNo: {
      type: String,
      required: true,
    },
    interestSuspenseGLAccountNo: {
      type: String,
      required: true,
    },
    maturedBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    maturityChequesGLAccountNo: {
      type: String,
      required: true,
    },
    nonAccrualBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    overdrawnBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    preDormantBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    principalBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    provisionReserveGLAccountNo: {
      type: String,
      required: true,
    },
    provisionExpenseGLAccountNo: {
      type: String,
      required: true,
    },
    rejectedCreditSuspenseGLAccountNo: {
      type: String,
      required: true,
    },
    rejectedDebitSuspenseGLAccountNo: {
      type: String,
      required: true,
    },
    reservedBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    unclearedBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    writeOffBalanceGLAccountNo: {
      type: String,
      required: true,
    },
    recoveriesGLAccountNo: {
      type: String,
      required: true,
    },
    interestCreditGLAccountNo: {
      type: String,
      required: true,
    },
    interestDebitGLAccountNo: {
      type: String,
      required: true,
    },
    INTEREST_GL_ACCT_NO: {
      type: String,
      required: true,
    },
    INTEREST_PAYABLE_GL_ACCT_NO: {
      type: String,
      required: true,
    },
    SETTLEMENT_GL_ACCT_NO: {
      type: String,
      required: true,
    },
    // Rate Information
    rateInformation: {
      rateType: {
        type: String,
        enum: ['FIXED', 'VARIABLE'],
        required: true,
      },
      rateStructure: {
        type: String,
        enum: ['FLAT', 'DECLINING_BALANCE'],
        required: true,
      },
      indexRate: {
        type: String,
      },
      absoluteRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => (v ? parseFloat(v.toString()) : null),
      },
      fixedRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => (v ? parseFloat(v.toString()) : 0),
        required: true,
        min: 0,
      },
      margin: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => (v ? parseFloat(v.toString()) : 0),
        default: mongoose.Types.Decimal128.fromString("0.00"),
      },
      minimumRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => (v ? parseFloat(v.toString()) : null),
      },
      maximumRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => (v ? parseFloat(v.toString()) : null),
      },
      effectiveRate: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => (v ? parseFloat(v.toString()) : 0),
        required: true,
      },
      currentEffectiveDate: {
        type: String,
        required: true,
      },
      newEffectiveDate: {
        type: String,
      },
      rateChangeFrequency: {
        type: String,
        default: '1 YEAR',
      },
      maximumNumberOfChanges: {
        type: Number,
        default: 99,
      },
    },
    // Settlement Information
    settlementInformation: {
      settlementFrequency: {
        type: String,
        required: true,
      },
      applicableAccountStatusOption: {
        type: String,
        enum: ['ACTIVE_ONLY', 'ALL'],
        default: 'ACTIVE_ONLY',
      },
      settlementMethod: {
        type: String,
        default: 'DEFAULT',
      },
      settlementAccountType: {
        type: String,
        enum: ['OWN_ACCOUNT', 'OTHER_ACCOUNT', 'CHEQUE'],
        default: 'OWN_ACCOUNT',
      },
    },
    // Accrual Information
    accrualInformation: {
      accrualFrequency: {
        type: String,
        default: '1 DAY',
      },
      accrualBasis: {
        type: String,
        enum: ['ACT/360', 'ACT/365', 'ACT/366', 'ACTUAL_DAYS/ACTUAL_DAYS'],
        required: true,
      },
      accrualBalanceType: {
        type: String,
        default: 'CURRENT_CLEARED',
      },
      marginBalanceType: {
        type: String,
        default: 'CURRENT_CLEARED',
      },
      skipInterestForIncompletePeriod: {
        type: Boolean,
        default: false,
      },
    },
    // Charges Setup
    chargesSetup: [{
      chargeType: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        required: true,
        get: v => (v ? parseFloat(v.toString()) : 0),
      },
      glAccountCode: {
        type: String,
        required: true,
      },
    }],
  },
  {
    collection: 'TermDeposit',
    timestamps: true,
    toJSON: {
      getters: true,
      transform: (doc, ret) => {
        ['NOTICE_AMOUNT', 'UPFRONT_INTEREST_RATE', 'UPFRONT_INTEREST_AMOUNT', 'MATURITY_INTEREST_AMOUNT', 'MATURITY_AMOUNT', 'ACCRUED_INTEREST'].forEach(field => {
          if (ret[field] && typeof ret[field] === 'object') {
            ret[field] = parseFloat(ret[field].toString());
          }
        });
        ['rateInformation.absoluteRate', 'rateInformation.fixedRate', 'rateInformation.margin', 'rateInformation.minimumRate', 'rateInformation.maximumRate', 'rateInformation.effectiveRate'].forEach(field => {
          if (ret.rateInformation && ret.rateInformation[field.split('.')[1]] && typeof ret.rateInformation[field.split('.')[1]] === 'object') {
            ret.rateInformation[field.split('.')[1]] = parseFloat(ret.rateInformation[field.split('.')[1]].toString());
          }
        });
        if (ret.ACCT_ID) ret.ACCT_ID = ret.ACCT_ID.toString().padStart(6, '0');
        if (ret.ACCT_NO) ret.ACCT_NO = ret.ACCT_NO.toString().padStart(10, '0');
        return ret;
      },
    },
  }
);

// Pre-save hook: Populate fields from SavingsProduct
TermDepositSchema.pre('save', async function (next) {
  try {
    const product = await SavingsProduct.findOne({ productCode: this.productCode });
    if (!product) {
      throw new Error(`No SavingsProduct found for productCode: ${this.productCode}`);
    }

    // Populate GL accounts
    this.depositChargeReceivableGLAccountNo = product.depositChargeReceivableGLAccountNo;
    this.delinquentBalanceGLAccountNo = product.delinquentBalanceGLAccountNo;
    this.dormantBalanceGLAccountNo = product.dormantBalanceGLAccountNo;
    this.earmarkedBalanceGLAccountNo = product.earmarkedBalanceGLAccountNo;
    this.escheatedBalanceGLAccountNo = product.escheatedBalanceGLAccountNo;
    this.interestChequesGLAccountNo = product.interestChequesGLAccountNo;
    this.interestExpenseGLAccountNo = product.interestExpenseGLAccountNo;
    this.interestIncomeGLAccountNo = product.interestIncomeGLAccountNo;
    this.interestPayableGLAccountNo = product.interestPayableGLAccountNo;
    this.interestReceivableGLAccountNo = product.interestReceivableGLAccountNo;
    this.interestSuspenseGLAccountNo = product.interestSuspenseGLAccountNo;
    this.maturedBalanceGLAccountNo = product.maturedBalanceGLAccountNo;
    this.maturityChequesGLAccountNo = product.maturityChequesGLAccountNo;
    this.nonAccrualBalanceGLAccountNo = product.nonAccrualBalanceGLAccountNo;
    this.overdrawnBalanceGLAccountNo = product.overdrawnBalanceGLAccountNo;
    this.preDormantBalanceGLAccountNo = product.preDormantBalanceGLAccountNo;
    this.principalBalanceGLAccountNo = product.principalBalanceGLAccountNo;
    this.provisionReserveGLAccountNo = product.provisionReserveGLAccountNo;
    this.provisionExpenseGLAccountNo = product.provisionExpenseGLAccountNo;
    this.rejectedCreditSuspenseGLAccountNo = product.rejectedCreditSuspenseGLAccountNo;
    this.rejectedDebitSuspenseGLAccountNo = product.rejectedDebitSuspenseGLAccountNo;
    this.reservedBalanceGLAccountNo = product.reservedBalanceGLAccountNo;
    this.unclearedBalanceGLAccountNo = product.unclearedBalanceGLAccountNo;
    this.writeOffBalanceGLAccountNo = product.writeOffBalanceGLAccountNo;
    this.recoveriesGLAccountNo = product.recoveriesGLAccountNo;
    this.interestCreditGLAccountNo = product.interestCreditGLAccountNo;
    this.interestDebitGLAccountNo = product.interestDebitGLAccountNo;
    this.INTEREST_GL_ACCT_NO = product.interestIncomeGLAccountNo || product.interestGLAccountNo;
    this.INTEREST_PAYABLE_GL_ACCT_NO = product.interestPayableGLAccountNo;
    this.SETTLEMENT_GL_ACCT_NO = product.principalBalanceGLAccountNo || product.settlementGLAccountNo;

    // Populate product-specific fields
    this.rateInformation = {
      rateType: this.RATE_TYPE || product.rateInformation.rateType,
      rateStructure: this.RATE_PATTERN || product.rateInformation.rateStructure,
      indexRate: product.rateInformation.indexRate,
      absoluteRate: this.ABSOLUTE_RATE_INTEREST ? mongoose.Types.Decimal128.fromString(this.ABSOLUTE_RATE_INTEREST.toString()) : product.rateInformation.absoluteRate,
      fixedRate: this.FIXED_RATE ? mongoose.Types.Decimal128.fromString(this.FIXED_RATE.toString()) : product.rateInformation.fixedRate,
      margin: this.MARGIN_RATE ? mongoose.Types.Decimal128.fromString(this.MARGIN_RATE.toString()) : product.rateInformation.margin,
      minimumRate: product.rateInformation.minimumRate,
      maximumRate: product.rateInformation.maximumRate,
      effectiveRate: this.EFFECTIVE_RATE ? mongoose.Types.Decimal128.fromString(this.EFFECTIVE_RATE.toString()) : product.rateInformation.effectiveRate,
      currentEffectiveDate: this.EFFECTIVE_DATE ? this.EFFECTIVE_DATE.toISOString().split('T')[0] : product.rateInformation.currentEffectiveDate,
      newEffectiveDate: product.rateInformation.newEffectiveDate,
      rateChangeFrequency: product.rateInformation.rateChangeFrequency,
      maximumNumberOfChanges: product.rateInformation.maximumNumberOfChanges,
    };
    this.settlementInformation = {
      settlementFrequency: this.SETTLEMENT_FREQUENCY || product.settlementInformation.settlementFrequency,
      applicableAccountStatusOption: product.settlementInformation.applicableAccountStatusOption,
      settlementMethod: product.settlementInformation.settlementMethod,
      settlementAccountType: product.settlementInformation.settlementAccountType,
    };
    this.accrualInformation = {
      accrualFrequency: product.accrualInformation.accrualFrequency,
      accrualBasis: this.ACCRUAL_BASIS || product.accrualInformation.accrualBasis,
      accrualBalanceType: product.accrualInformation.accrualBalanceType,
      marginBalanceType: product.accrualInformation.marginBalanceType,
      skipInterestForIncompletePeriod: product.accrualInformation.skipInterestForIncompletePeriod,
    };
    this.chargesSetup = product.chargesSetup;

    next();
  } catch (err) {
    console.error('Error in TermDeposit pre-save hook:', err.message);
    next(err);
  }
});

const TermDeposit = mongoose.model('TermDeposit', TermDepositSchema);
export default TermDeposit;