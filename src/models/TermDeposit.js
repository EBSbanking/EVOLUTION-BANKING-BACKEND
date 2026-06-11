// models/TermDeposit.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SavingsProduct from './SavingsProduct.js';

const TermDeposit = sequelize.define('TermDeposit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ACCT_NM: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  ACCT_ID: {
    type: DataTypes.STRING(6),
    allowNull: false,
    unique: true
  },
  CUST_ID: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  BU_ID: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  CRNCY_ID: {
    type: DataTypes.STRING(10),
    allowNull: false
  },
  productCode: {
    type: DataTypes.INTEGER,
    allowNull: false,
    
  },
  START_DT: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  MATURITY_DT: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  TERM: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  LAST_ACCRUAL_DATE: {
    type: DataTypes.DATEONLY
  },
  NOTICE_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    allowNull: false,
    defaultValue: 0
  },
  UPFRONT_INTEREST_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 0
  },
  UPFRONT_INTEREST_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  },
  MATURITY_INTEREST_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  },
  MATURITY_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  },
  ACCRUED_INTEREST: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0
  },
  PRIMARY_OFFICER: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  PRIMARY_OFFICER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  SECONDARY_OFFICER_ID: {
    type: DataTypes.STRING(50)
  },
  ROLLOVER_OPT_CD: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  ROLLOVER_TYPE: {
    type: DataTypes.ENUM('NONE', 'PRINCIPAL_ONLY', 'INTEREST_ONLY', 'PRINCIPAL_AND_INTEREST'),
    defaultValue: 'NONE',
    allowNull: false
  },
  INT_SETLMNT_OPTION_CD: {
    type: DataTypes.ENUM('ACCOUNT', 'GL'),
    allowNull: false
  },
  SETTLEMENT_ACCOUNT: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  PRINCIPAL_SETTLEMENT_METHOD: {
    type: DataTypes.ENUM('ACCOUNT', 'GL'),
    allowNull: false
  },
  CUST_NM: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  OPENING_RSN_ID: {
    type: DataTypes.STRING(50)
  },
  MKT_CAMPAIGN_REF: {
    type: DataTypes.STRING(100)
  },
  AUTO_CLOSE_ON_EXPIRY_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  ALLOW_MULTIPLE_FD: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  UPFRONT_INTEREST_PAYMENT: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  PARTIAL_INTEREST_PAYMENT: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  INTEREST_PAYMENT_STATUS: {
    type: DataTypes.ENUM('PENDING', 'PARTIALLY_PAID', 'PAID'),
    defaultValue: 'PENDING'
  },
  SETTLEMENT_STATUS: {
    type: DataTypes.ENUM('ACTIVE', 'CLOSED', 'COMPLETED', 'TERMINATED'),
    defaultValue: 'ACTIVE'
  },
  STATUS: {
    type: DataTypes.ENUM('ACTIVE', 'MATURED', 'CLOSED', 'PENDING'),
    defaultValue: 'PENDING'
  },
  GL_INTEREST_PAYMENT_TXN_ID: {
    type: DataTypes.STRING(100)
  },
  GL_SETTLEMENT_TXN_ID: {
    type: DataTypes.STRING(100)
  },
  CUSTOMER_INTEREST_PAYMENT_TXN_ID: {
    type: DataTypes.STRING(100)
  },
  CUSTOMER_SETTLEMENT_TXN_ID: {
    type: DataTypes.STRING(100)
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  ACCRUAL_BASIS: {
    type: DataTypes.INTEGER,
    defaultValue: 365
  },
  
  // ========== GL ACCOUNT FIELDS – changed to TEXT ==========
  principalBalanceGLAccountNo: { type: DataTypes.TEXT },
  interestIncomeGLAccountNo: { type: DataTypes.TEXT },
  interestPayableGLAccountNo: { type: DataTypes.TEXT },
  interestReceivableGLAccountNo: { type: DataTypes.TEXT },
  interestExpenseGLAccountNo: { type: DataTypes.TEXT },
  withholdingTaxGLAccountNo: { type: DataTypes.TEXT },
  depositChargeReceivableGLAccountNo: { type: DataTypes.TEXT },
  delinquentBalanceGLAccountNo: { type: DataTypes.TEXT },
  dormantBalanceGLAccountNo: { type: DataTypes.TEXT },
  earmarkedBalanceGLAccountNo: { type: DataTypes.TEXT },
  escheatedBalanceGLAccountNo: { type: DataTypes.TEXT },
  interestChequesGLAccountNo: { type: DataTypes.TEXT },
  interestSuspenseGLAccountNo: { type: DataTypes.TEXT },
  maturityChequesGLAccountNo: { type: DataTypes.TEXT },
  nonAccrualBalanceGLAccountNo: { type: DataTypes.TEXT },
  overdrawnBalanceGLAccountNo: { type: DataTypes.TEXT },
  preDormantBalanceGLAccountNo: { type: DataTypes.TEXT },
  provisionReserveGLAccountNo: { type: DataTypes.TEXT },
  provisionExpenseGLAccountNo: { type: DataTypes.TEXT },
  rejectedCreditSuspenseGLAccountNo: { type: DataTypes.TEXT },
  rejectedDebitSuspenseGLAccountNo: { type: DataTypes.TEXT },
  reservedBalanceGLAccountNo: { type: DataTypes.TEXT },
  unclearedBalanceGLAccountNo: { type: DataTypes.TEXT },
  writeOffBalanceGLAccountNo: { type: DataTypes.TEXT },
  recoveriesGLAccountNo: { type: DataTypes.TEXT },
  interestCreditGLAccountNo: { type: DataTypes.TEXT },
  interestDebitGLAccountNo: { type: DataTypes.TEXT },
  settlementGLAccountNo: { type: DataTypes.TEXT },
  maturedBalanceGLAccountNo: { type: DataTypes.TEXT },
  INTEREST_GL_ACCT_NO: { type: DataTypes.TEXT },
  INTEREST_PAYABLE_GL_ACCT_NO: { type: DataTypes.TEXT },
  SETTLEMENT_GL_ACCT_NO: { type: DataTypes.TEXT },
  
  // JSON fields – keep as JSON (works fine)
  rateInformation: { type: DataTypes.JSON, defaultValue: {} },
  settlementInformation: { type: DataTypes.JSON, defaultValue: {} },
  accrualInformation: { type: DataTypes.JSON, defaultValue: {} },
  chargesSetup: { type: DataTypes.JSON, defaultValue: [] }
}, {
  tableName: 'term_deposits',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  underscored: false,           // ✅ exact column names as attribute names
  hooks: {
    beforeCreate: async (termDeposit) => {
      await TermDeposit.populateFromSavingsProduct(termDeposit);
    },
    beforeUpdate: async (termDeposit) => {
      if (termDeposit.changed('productCode')) {
        await TermDeposit.populateFromSavingsProduct(termDeposit);
      }
    }
  }
});

// Keep your existing static methods and associations unchanged
// (they already use the attribute names defined above)

TermDeposit.populateFromSavingsProduct = async function(termDeposit) {
  // ... your existing implementation (unchanged)
};

TermDeposit.associate = (models) => {
  TermDeposit.belongsTo(models.SavingsProduct, {
    foreignKey: 'productCode',
    targetKey: 'productCode',
    as: 'savingsProduct'
  });
};

TermDeposit.prototype.getAllGLAccounts = function() {
  return {
    principalBalanceGLAccountNo: this.principalBalanceGLAccountNo,
    // ... etc.
  };
};

export default TermDeposit;