// models/TermDeposit.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import SavingsProduct from './SavingsProduct.js';

const TermDeposit = sequelize.define('TermDeposit', {
  // Basic Information
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ACCT_NM: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      len: [1, 50]
    }
  },
  ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      is: /^\d{10}$/
    }
  },
  ACCT_ID: {
    type: DataTypes.STRING(6),
    allowNull: false,
    unique: true,
    validate: {
      is: /^\d{6}$/
    }
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
    references: {
      model: 'SavingsProducts',
      key: 'productCode'
    }
  },
  
  // Dates and Terms
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
    allowNull: false,
    validate: {
      min: 1
    }
  },
  LAST_ACCRUAL_DATE: {
    type: DataTypes.DATEONLY
  },
  
  // Amounts
  NOTICE_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    allowNull: false,
    validate: {
      min: 0
    },
    get() {
      const value = this.getDataValue('NOTICE_AMOUNT');
      return value ? parseFloat(value) : 0;
    }
  },
  UPFRONT_INTEREST_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 0,
    validate: {
      min: 0,
      max: 100
    },
    get() {
      const value = this.getDataValue('UPFRONT_INTEREST_RATE');
      return value ? parseFloat(value) : 0;
    }
  },
  UPFRONT_INTEREST_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0,
    validate: {
      min: 0
    },
    get() {
      const value = this.getDataValue('UPFRONT_INTEREST_AMOUNT');
      return value ? parseFloat(value) : 0;
    }
  },
  MATURITY_INTEREST_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0,
    validate: {
      min: 0
    },
    get() {
      const value = this.getDataValue('MATURITY_INTEREST_AMOUNT');
      return value ? parseFloat(value) : 0;
    }
  },
  MATURITY_AMOUNT: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0,
    validate: {
      min: 0
    },
    get() {
      const value = this.getDataValue('MATURITY_AMOUNT');
      return value ? parseFloat(value) : 0;
    }
  },
  ACCRUED_INTEREST: {
    type: DataTypes.DECIMAL(18, 4),
    defaultValue: 0,
    validate: {
      min: 0
    },
    get() {
      const value = this.getDataValue('ACCRUED_INTEREST');
      return value ? parseFloat(value) : 0;
    }
  },
  
  // Officers
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
  
  // Rollover and Settlement Options
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
  
  // Customer Information
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
  
  // Flags
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
  
  // Payment Status
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
  
  // Transaction IDs
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
  
  // Version
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1
    }
  },
  
  // Accrual Information
  ACCRUAL_BASIS: {
    type: DataTypes.INTEGER,
    defaultValue: 365
  },
  
  // INDIVIDUAL GL ACCOUNT FIELDS (populated from SavingsProduct)
  principalBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestIncomeGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestPayableGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestReceivableGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestExpenseGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  withholdingTaxGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  depositChargeReceivableGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  delinquentBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  dormantBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  earmarkedBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  escheatedBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestChequesGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestSuspenseGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  maturityChequesGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  nonAccrualBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  overdrawnBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  preDormantBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  provisionReserveGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  provisionExpenseGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  rejectedCreditSuspenseGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  rejectedDebitSuspenseGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  reservedBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  unclearedBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  writeOffBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  recoveriesGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestCreditGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  interestDebitGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  settlementGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  maturedBalanceGLAccountNo: {
    type: DataTypes.STRING(50)
  },
  
  // Special fields for reference
  INTEREST_GL_ACCT_NO: {
    type: DataTypes.STRING(50)
  },
  INTEREST_PAYABLE_GL_ACCT_NO: {
    type: DataTypes.STRING(50)
  },
  SETTLEMENT_GL_ACCT_NO: {
    type: DataTypes.STRING(50)
  },
  
  // Rate Information from SavingsProduct (JSON)
  rateInformation: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  
  // Settlement Information from SavingsProduct (JSON)
  settlementInformation: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  
  // Accrual Information from SavingsProduct (JSON)
  accrualInformation: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  
  // Charges Setup from SavingsProduct (JSON)
  chargesSetup: {
    type: DataTypes.JSON,
    defaultValue: []
  }
}, {
  tableName: 'term_deposits',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  
  // Getters for decimal fields
  getterMethods: {
    formattedACCT_ID() {
      return this.ACCT_ID ? this.ACCT_ID.padStart(6, '0') : '';
    },
    formattedACCT_NO() {
      return this.ACCT_NO ? this.ACCT_NO.padStart(10, '0') : '';
    }
  },
  
  hooks: {
    beforeCreate: async (termDeposit) => {
      await TermDeposit.populateFromSavingsProduct(termDeposit);
    },
    beforeUpdate: async (termDeposit) => {
      if (termDeposit.changed('productCode')) {
        await TermDeposit.populateFromSavingsProduct(termDeposit);
      }
    },
    afterFind: (results) => {
      if (!results) return;
      
      const processResult = (result) => {
        if (result.dataValues) {
          // Format ACCT_ID and ACCT_NO
          if (result.ACCT_ID) result.ACCT_ID = result.ACCT_ID.toString().padStart(6, '0');
          if (result.ACCT_NO) result.ACCT_NO = result.ACCT_NO.toString().padStart(10, '0');
        }
      };
      
      if (Array.isArray(results)) {
        results.forEach(processResult);
      } else {
        processResult(results);
      }
    }
  }
});

// Static method to populate from SavingsProduct
TermDeposit.populateFromSavingsProduct = async function(termDeposit) {
  try {
    const product = await SavingsProduct.findOne({
      where: { productCode: termDeposit.productCode }
    });
    
    if (!product) {
      throw new Error(`No SavingsProduct found for productCode: ${termDeposit.productCode}`);
    }

    // Get all GL accounts from product using getAllGLAccounts method
    // If SavingsProduct doesn't have getAllGLAccounts, use the glFields approach
    let glAccounts = {};
    
    if (typeof product.getAllGLAccounts === 'function') {
      glAccounts = product.getAllGLAccounts();
    } else {
      // Fallback to individual fields
      const glFields = [
        'depositChargeReceivableGLAccountNo',
        'delinquentBalanceGLAccountNo',
        'dormantBalanceGLAccountNo',
        'earmarkedBalanceGLAccountNo',
        'escheatedBalanceGLAccountNo',
        'interestChequesGLAccountNo',
        'interestExpenseGLAccountNo',
        'interestIncomeGLAccountNo',
        'interestPayableGLAccountNo',
        'interestReceivableGLAccountNo',
        'interestSuspenseGLAccountNo',
        'maturedBalanceGLAccountNo',
        'maturityChequesGLAccountNo',
        'nonAccrualBalanceGLAccountNo',
        'overdrawnBalanceGLAccountNo',
        'preDormantBalanceGLAccountNo',
        'principalBalanceGLAccountNo',
        'provisionReserveGLAccountNo',
        'provisionExpenseGLAccountNo',
        'rejectedCreditSuspenseGLAccountNo',
        'rejectedDebitSuspenseGLAccountNo',
        'reservedBalanceGLAccountNo',
        'unclearedBalanceGLAccountNo',
        'writeOffBalanceGLAccountNo',
        'recoveriesGLAccountNo',
        'interestCreditGLAccountNo',
        'interestDebitGLAccountNo',
        'settlementGLAccountNo',
        'withholdingTaxGLAccountNo'
      ];
      
      glFields.forEach(field => {
        glAccounts[field] = product[field] || '';
      });
    }
    
    // Populate individual GL account fields
    Object.keys(glAccounts).forEach(field => {
      termDeposit[field] = glAccounts[field];
    });
    
    // Set special reference fields
    termDeposit.INTEREST_GL_ACCT_NO = glAccounts.interestIncomeGLAccountNo || glAccounts.interestGLAccountNo || '';
    termDeposit.INTEREST_PAYABLE_GL_ACCT_NO = glAccounts.interestPayableGLAccountNo || '';
    termDeposit.SETTLEMENT_GL_ACCT_NO = glAccounts.principalBalanceGLAccountNo || glAccounts.settlementGLAccountNo || '';
    
    // Populate rate information (if available in product)
    if (product.rateInformation) {
      termDeposit.rateInformation = {
        rateType: termDeposit.RATE_TYPE || product.rateInformation?.rateType || 'FIXED',
        rateStructure: termDeposit.RATE_PATTERN || product.rateInformation?.rateStructure || 'FLAT',
        indexRate: product.rateInformation?.indexRate,
        absoluteRate: termDeposit.ABSOLUTE_RATE_INTEREST || product.rateInformation?.absoluteRate || 0,
        fixedRate: termDeposit.FIXED_RATE || product.rateInformation?.fixedRate || 0,
        margin: termDeposit.MARGIN_RATE || product.rateInformation?.margin || 0,
        minimumRate: product.rateInformation?.minimumRate,
        maximumRate: product.rateInformation?.maximumRate,
        effectiveRate: termDeposit.EFFECTIVE_RATE || product.rateInformation?.effectiveRate || 0,
        currentEffectiveDate: termDeposit.EFFECTIVE_DATE ? 
          termDeposit.EFFECTIVE_DATE.toISOString().split('T')[0] : 
          product.rateInformation?.currentEffectiveDate || new Date().toISOString().split('T')[0],
        newEffectiveDate: product.rateInformation?.newEffectiveDate,
        rateChangeFrequency: product.rateInformation?.rateChangeFrequency || '1 YEAR',
        maximumNumberOfChanges: product.rateInformation?.maximumNumberOfChanges || 99
      };
    }
    
    // Populate settlement information (if available in product)
    if (product.settlementInformation) {
      termDeposit.settlementInformation = {
        settlementFrequency: termDeposit.SETTLEMENT_FREQUENCY || 
          product.settlementInformation?.settlementFrequency || 'AT_MATURITY',
        applicableAccountStatusOption: product.settlementInformation?.applicableAccountStatusOption || 'ACTIVE_ONLY',
        settlementMethod: product.settlementInformation?.settlementMethod || 'DEFAULT',
        settlementAccountType: product.settlementInformation?.settlementAccountType || 'OWN_ACCOUNT'
      };
    }
    
    // Populate accrual information (if available in product)
    if (product.accrualInformation) {
      termDeposit.accrualInformation = {
        accrualFrequency: product.accrualInformation?.accrualFrequency || '1 DAY',
        accrualBasis: termDeposit.ACCRUAL_BASIS || product.accrualInformation?.accrualBasis || 'ACT/365',
        accrualBalanceType: product.accrualInformation?.accrualBalanceType || 'CURRENT_CLEARED',
        marginBalanceType: product.accrualInformation?.marginBalanceType || 'CURRENT_CLEARED',
        skipInterestForIncompletePeriod: product.accrualInformation?.skipInterestForIncompletePeriod || false
      };
    }
    
    // Populate charges setup (if available in product)
    if (product.chargesSetup) {
      termDeposit.chargesSetup = product.chargesSetup || [];
    }
    
  } catch (error) {
    console.error('Error populating TermDeposit from SavingsProduct:', error.message);
    throw error;
  }
};

// Define associations
TermDeposit.associate = (models) => {
  TermDeposit.belongsTo(models.SavingsProduct, {
    foreignKey: 'productCode',
    targetKey: 'productCode',
    as: 'savingsProduct'
  });
};

// Add helper methods to prototype
TermDeposit.prototype.getAllGLAccounts = function() {
  return {
    principalBalanceGLAccountNo: this.principalBalanceGLAccountNo,
    interestIncomeGLAccountNo: this.interestIncomeGLAccountNo,
    interestPayableGLAccountNo: this.interestPayableGLAccountNo,
    interestReceivableGLAccountNo: this.interestReceivableGLAccountNo,
    interestExpenseGLAccountNo: this.interestExpenseGLAccountNo,
    withholdingTaxGLAccountNo: this.withholdingTaxGLAccountNo,
    depositChargeReceivableGLAccountNo: this.depositChargeReceivableGLAccountNo,
    delinquentBalanceGLAccountNo: this.delinquentBalanceGLAccountNo,
    dormantBalanceGLAccountNo: this.dormantBalanceGLAccountNo,
    earmarkedBalanceGLAccountNo: this.earmarkedBalanceGLAccountNo,
    escheatedBalanceGLAccountNo: this.escheatedBalanceGLAccountNo,
    interestChequesGLAccountNo: this.interestChequesGLAccountNo,
    interestSuspenseGLAccountNo: this.interestSuspenseGLAccountNo,
    maturityChequesGLAccountNo: this.maturityChequesGLAccountNo,
    nonAccrualBalanceGLAccountNo: this.nonAccrualBalanceGLAccountNo,
    overdrawnBalanceGLAccountNo: this.overdrawnBalanceGLAccountNo,
    preDormantBalanceGLAccountNo: this.preDormantBalanceGLAccountNo,
    provisionReserveGLAccountNo: this.provisionReserveGLAccountNo,
    provisionExpenseGLAccountNo: this.provisionExpenseGLAccountNo,
    rejectedCreditSuspenseGLAccountNo: this.rejectedCreditSuspenseGLAccountNo,
    rejectedDebitSuspenseGLAccountNo: this.rejectedDebitSuspenseGLAccountNo,
    reservedBalanceGLAccountNo: this.reservedBalanceGLAccountNo,
    unclearedBalanceGLAccountNo: this.unclearedBalanceGLAccountNo,
    writeOffBalanceGLAccountNo: this.writeOffBalanceGLAccountNo,
    recoveriesGLAccountNo: this.recoveriesGLAccountNo,
    interestCreditGLAccountNo: this.interestCreditGLAccountNo,
    interestDebitGLAccountNo: this.interestDebitGLAccountNo,
    settlementGLAccountNo: this.settlementGLAccountNo,
    maturedBalanceGLAccountNo: this.maturedBalanceGLAccountNo
  };
};

export default TermDeposit;