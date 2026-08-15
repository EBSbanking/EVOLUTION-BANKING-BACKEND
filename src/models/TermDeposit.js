// models/TermDeposit.js - COMPLETE FIXED VERSION WITH CUSTOM RATE SUPPORT & REJECTED STATUS
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SavingsProduct from './SavingsProduct.js';

// ============================================================
// EXPORTS FOR STATUS ENUMS
// ============================================================
export const TD_STATUS = {
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  MATURED: 'MATURED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'REJECTED'  // ✅ Added REJECTED status
};

export const INTEREST_PAYMENT_FREQUENCY = {
  AT_MATURITY: 'AT_MATURITY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY'
};

export const PRINCIPAL_DISPOSITION = {
  OWN_ACCOUNT: 'OWN_ACCOUNT',
  OTHER_ACCOUNT: 'OTHER_ACCOUNT'
};

// ============================================================
// HELPER FUNCTIONS FOR INTEREST CALCULATION
// ============================================================

/**
 * Helper: Check if a year is a leap year
 */
const isLeapYear = (year) => {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
};

/**
 * Helper: Get the number of days in a year
 */
const getDaysInYear = (year) => {
  return isLeapYear(year) ? 366 : 365;
};

/**
 * Helper: Calculate actual days between two dates considering leap years
 */
const getActualDaysBetween = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  
  if (start >= end) return 0;
  
  let days = 0;
  const current = new Date(start);
  
  while (current < end) {
    const year = current.getFullYear();
    const daysInYear = getDaysInYear(year);
    const nextYear = new Date(year + 1, 0, 1);
    
    if (end <= nextYear) {
      const diffTime = end.getTime() - current.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      days += diffDays / daysInYear;
      break;
    } else {
      const daysUntilNextYear = Math.ceil((nextYear.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
      days += daysUntilNextYear / daysInYear;
      current.setFullYear(year + 1, 0, 1);
    }
  }
  
  return days;
};

/**
 * Helper: Calculate interest using Actual/365 (Fixed) convention
 */
const calculateInterestActual365 = (principal, rate, days) => {
  return (principal * rate / 100) * (days / 365);
};

/**
 * Helper: Calculate interest using Actual/Actual (ISDA) convention
 */
const calculateInterestActualActual = (principal, rate, startDate, endDate) => {
  const yearFraction = getActualDaysBetween(startDate, endDate);
  return (principal * rate / 100) * yearFraction;
};

// ============================================================
// TERM DEPOSIT MODEL
// ============================================================

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
    type: DataTypes.ENUM('ACTIVE', 'CLOSED', 'COMPLETED', 'TERMINATED', 'REJECTED'),
    defaultValue: 'ACTIVE'
  },
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'ACTIVE', 'MATURED', 'CLOSED', 'CANCELLED', 'REJECTED'),
    defaultValue: 'PENDING',
    allowNull: false
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
  
  // ✅ FIELDS FOR REJECTION
  REJECTED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'User who rejected the term deposit'
  },
  REJECTED_AT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date and time when the term deposit was rejected'
  },
  REJECTED_BU_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'BU_ID of the branch that rejected the term deposit'
  },
  REJECTION_REASON: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for rejection'
  },
  
  // ✅ FIELDS FOR CUSTOM NEGOTIATED INTEREST RATE
  CUSTOM_INTEREST_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: null,
    allowNull: true,
    comment: 'Custom negotiated interest rate (overrides product rate if set)'
  },
  USE_CUSTOM_RATE: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false,
    comment: 'If true, use CUSTOM_INTEREST_RATE instead of product rate'
  },
  
  // ========== GL ACCOUNT FIELDS ==========
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
  
  // JSON fields
  rateInformation: { type: DataTypes.JSON, defaultValue: {} },
  settlementInformation: { type: DataTypes.JSON, defaultValue: {} },
  accrualInformation: { type: DataTypes.JSON, defaultValue: {} },
  chargesSetup: { type: DataTypes.JSON, defaultValue: [] },
  
  // Audit fields
  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  APPROVED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  APPROVED_AT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  APPROVED_BU_ID: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'BU_ID of the branch that approved the term deposit'
  },
  APPROVAL_COMMENTS: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Comments from the approver'
  },
  CLOSED_AT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  TERMINATED_AT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  CREATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  UPDATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'term_deposits',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  underscored: false,
  hooks: {
    beforeCreate: async (termDeposit) => {
      await TermDeposit.populateFromSavingsProduct(termDeposit);
      
      if (!termDeposit.STATUS) {
        termDeposit.STATUS = 'PENDING';
      }
      
      if (!termDeposit.SETTLEMENT_STATUS) {
        termDeposit.SETTLEMENT_STATUS = 'ACTIVE';
      }
      
      // ✅ Calculate interest if not provided
      if (!termDeposit.MATURITY_INTEREST_AMOUNT || parseFloat(termDeposit.MATURITY_INTEREST_AMOUNT) === 0) {
        const calculatedInterest = termDeposit.calculateTotalInterestActual365();
        termDeposit.MATURITY_INTEREST_AMOUNT = calculatedInterest;
        console.log(`✅ Calculated interest for term deposit: ${calculatedInterest}`);
      }
      
      if (!termDeposit.MATURITY_AMOUNT || parseFloat(termDeposit.MATURITY_AMOUNT) === 0) {
        const principal = parseFloat(termDeposit.NOTICE_AMOUNT) || 0;
        const interest = parseFloat(termDeposit.MATURITY_INTEREST_AMOUNT) || 0;
        termDeposit.MATURITY_AMOUNT = principal + interest;
      }
      
      const now = new Date();
      termDeposit.CREATED_AT = now;
      termDeposit.UPDATED_AT = now;
    },
    beforeUpdate: async (termDeposit) => {
      if (termDeposit.changed('productCode')) {
        await TermDeposit.populateFromSavingsProduct(termDeposit);
      }
      
      if (termDeposit.changed('STATUS')) {
        if (termDeposit.STATUS === 'ACTIVE' && !termDeposit.APPROVED_AT) {
          termDeposit.APPROVED_AT = new Date();
        }
        if (termDeposit.STATUS === 'CLOSED' && !termDeposit.CLOSED_AT) {
          termDeposit.CLOSED_AT = new Date();
        }
        if (termDeposit.STATUS === 'REJECTED' && !termDeposit.REJECTED_AT) {
          termDeposit.REJECTED_AT = new Date();
        }
        if (termDeposit.SETTLEMENT_STATUS === 'TERMINATED' && !termDeposit.TERMINATED_AT) {
          termDeposit.TERMINATED_AT = new Date();
        }
      }
      
      termDeposit.UPDATED_AT = new Date();
      
      if (termDeposit.changed('NOTICE_AMOUNT') || termDeposit.changed('MATURITY_INTEREST_AMOUNT')) {
        const principal = parseFloat(termDeposit.NOTICE_AMOUNT) || 0;
        const interest = parseFloat(termDeposit.MATURITY_INTEREST_AMOUNT) || 0;
        termDeposit.MATURITY_AMOUNT = principal + interest;
      }
    }
  }
});

// ============================================================
// STATIC METHODS
// ============================================================

TermDeposit.populateFromSavingsProduct = async function(termDeposit) {
  if (!termDeposit.productCode) return;
  
  try {
    const product = await SavingsProduct.findOne({
      where: { productCode: termDeposit.productCode }
    });
    
    if (!product) {
      throw new Error(`SavingsProduct with productCode ${termDeposit.productCode} not found`);
    }
    
    const glFields = [
      'principalBalanceGLAccountNo',
      'interestIncomeGLAccountNo',
      'interestPayableGLAccountNo',
      'interestReceivableGLAccountNo',
      'interestExpenseGLAccountNo',
      'withholdingTaxGLAccountNo',
      'depositChargeReceivableGLAccountNo',
      'delinquentBalanceGLAccountNo',
      'dormantBalanceGLAccountNo',
      'earmarkedBalanceGLAccountNo',
      'escheatedBalanceGLAccountNo',
      'interestChequesGLAccountNo',
      'interestSuspenseGLAccountNo',
      'maturityChequesGLAccountNo',
      'nonAccrualBalanceGLAccountNo',
      'overdrawnBalanceGLAccountNo',
      'preDormantBalanceGLAccountNo',
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
      'maturedBalanceGLAccountNo'
    ];
    
    for (const field of glFields) {
      if (product[field] && !termDeposit[field]) {
        termDeposit[field] = product[field];
      }
    }
    
    // ✅ Populate rate information and upfront interest rate
    if (product.rateInformation && !termDeposit.rateInformation) {
      termDeposit.rateInformation = product.rateInformation;
      
      // Extract rate from rateInformation
      let rateInfo = product.rateInformation;
      if (typeof rateInfo === 'string') {
        try {
          rateInfo = JSON.parse(rateInfo);
        } catch (e) {
          rateInfo = {};
        }
      }
      const rate = parseFloat(rateInfo.fixedRate) || 0;
      termDeposit.UPFRONT_INTEREST_RATE = rate;
    }
    
    if (product.settlementInformation && !termDeposit.settlementInformation) {
      termDeposit.settlementInformation = product.settlementInformation;
    }
    
    if (product.accrualInformation && !termDeposit.accrualInformation) {
      termDeposit.accrualInformation = product.accrualInformation;
    }
    
    if (product.chargesSetup && !termDeposit.chargesSetup) {
      termDeposit.chargesSetup = product.chargesSetup;
    }
    
  } catch (error) {
    console.error('Error populating from SavingsProduct:', error);
    throw error;
  }
};

// ============================================================
// INSTANCE METHODS - ENHANCED WITH CUSTOM RATE SUPPORT
// ============================================================

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
    maturedBalanceGLAccountNo: this.maturedBalanceGLAccountNo,
    INTEREST_GL_ACCT_NO: this.INTEREST_GL_ACCT_NO,
    INTEREST_PAYABLE_GL_ACCT_NO: this.INTEREST_PAYABLE_GL_ACCT_NO,
    SETTLEMENT_GL_ACCT_NO: this.SETTLEMENT_GL_ACCT_NO
  };
};

/**
 * ✅ Get the effective interest rate (custom if set, otherwise product rate)
 */
TermDeposit.prototype.getEffectiveRate = function() {
  // If custom rate is enabled and set, use it
  if (this.USE_CUSTOM_RATE && this.CUSTOM_INTEREST_RATE !== null) {
    const customRate = parseFloat(this.CUSTOM_INTEREST_RATE);
    console.log(`✅ Using custom interest rate: ${customRate}%`);
    return customRate;
  }
  
  // Otherwise use product rate from rateInformation
  let rate = 0;
  if (this.rateInformation) {
    let rateInfo = this.rateInformation;
    if (typeof rateInfo === 'string') {
      try {
        rateInfo = JSON.parse(rateInfo);
      } catch (e) {
        rateInfo = {};
      }
    }
    rate = parseFloat(rateInfo.fixedRate) || 0;
  }
  
  console.log(`✅ Using product interest rate: ${rate}%`);
  return rate;
};

/**
 * ✅ Calculate total interest using Actual/365 with effective rate
 */
TermDeposit.prototype.calculateTotalInterestActual365 = function() {
  const principal = parseFloat(this.NOTICE_AMOUNT) || 0;
  const rate = this.getEffectiveRate(); // ✅ Use effective rate
  
  // Calculate days based on START_DT and MATURITY_DT
  const startDate = new Date(this.START_DT);
  const maturityDate = new Date(this.MATURITY_DT);
  const tenorDays = Math.ceil((maturityDate - startDate) / (1000 * 60 * 60 * 24));
  
  console.log(`✅ Interest calculation: Principal=${principal}, EffectiveRate=${rate}%, Days=${tenorDays}`);
  
  const interest = calculateInterestActual365(principal, rate, tenorDays);
  return interest;
};

/**
 * ✅ Calculate total interest using Actual/Actual with effective rate
 */
TermDeposit.prototype.calculateTotalInterestActualActual = function() {
  const principal = parseFloat(this.NOTICE_AMOUNT) || 0;
  const rate = this.getEffectiveRate(); // ✅ Use effective rate
  
  const interest = calculateInterestActualActual(principal, rate, this.START_DT, this.MATURITY_DT);
  console.log(`✅ Interest calculation (Actual/Actual): Principal=${principal}, EffectiveRate=${rate}%, Interest=${interest}`);
  return interest;
};

/**
 * ✅ Calculate total interest (simple method) with effective rate
 */
TermDeposit.prototype.calculateTotalInterest = function() {
  const principal = parseFloat(this.NOTICE_AMOUNT) || 0;
  const rate = this.getEffectiveRate(); // ✅ Use effective rate
  
  const termMonths = parseInt(this.TERM) || 0;
  
  const interest = principal * (rate / 100) * (termMonths / 12);
  console.log(`✅ Simple interest: Principal=${principal}, EffectiveRate=${rate}%, Months=${termMonths}, Interest=${interest}`);
  return interest;
};

/**
 * ✅ Get interest breakdown with effective rate
 */
TermDeposit.prototype.getInterestBreakdown = function() {
  const principal = parseFloat(this.NOTICE_AMOUNT) || 0;
  const rate = this.getEffectiveRate(); // ✅ Use effective rate
  
  const breakdown = [];
  const start = new Date(this.START_DT);
  const end = new Date(this.MATURITY_DT);
  const current = new Date(start);
  
  while (current < end) {
    const year = current.getFullYear();
    const daysInYear = getDaysInYear(year);
    const nextYear = new Date(year + 1, 0, 1);
    const yearEnd = end < nextYear ? end : nextYear;
    const daysInThisYear = Math.ceil((yearEnd.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
    const interestForYear = (principal * rate / 100) * (daysInThisYear / daysInYear);
    
    breakdown.push({
      year,
      daysInYear,
      daysInThisYear,
      interestAmount: parseFloat(interestForYear.toFixed(4))
    });
    
    current.setFullYear(year + 1, 0, 1);
  }
  return breakdown;
};

TermDeposit.prototype.spansLeapYear = function() {
  const startYear = new Date(this.START_DT).getFullYear();
  const endYear = new Date(this.MATURITY_DT).getFullYear();
  for (let year = startYear; year <= endYear; year++) {
    if (isLeapYear(year)) return true;
  }
  return false;
};

/**
 * ✅ Calculate daily interest with effective rate
 */
TermDeposit.prototype.calculateDailyInterest = function() {
  const principal = parseFloat(this.NOTICE_AMOUNT) || 0;
  const rate = this.getEffectiveRate(); // ✅ Use effective rate
  
  const accrualBasis = this.accrualInformation?.accrualBasis || 'ACT/365';
  const daysInYear = accrualBasis === 'ACT/360' ? 360 : 365;
  const dailyInterest = (principal * (rate / 100)) / daysInYear;
  
  console.log(`✅ Daily interest: Principal=${principal}, EffectiveRate=${rate}%, DaysInYear=${daysInYear}, DailyInterest=${dailyInterest}`);
  return dailyInterest;
};

TermDeposit.prototype.isMatured = function() {
  const today = new Date();
  const maturityDate = new Date(this.MATURITY_DT);
  return maturityDate <= today;
};

TermDeposit.prototype.isActive = function() {
  return this.STATUS === 'ACTIVE' && this.SETTLEMENT_STATUS === 'ACTIVE';
};

TermDeposit.prototype.canBeSettled = function() {
  return this.isMatured() && this.SETTLEMENT_STATUS === 'ACTIVE';
};

TermDeposit.prototype.isRejected = function() {
  return this.STATUS === 'REJECTED' || this.STATUS === 'CANCELLED';
};

// ============================================================
// ASSOCIATIONS - FIXED
// ============================================================

TermDeposit.associate = (models) => {
  TermDeposit.belongsTo(models.SavingsProduct, {
    foreignKey: 'productCode',
    targetKey: 'productCode',
    as: 'savingsProduct'
  });
  
  TermDeposit.belongsTo(models.CustomerAccount, {
    foreignKey: 'ACCT_NO',
    targetKey: 'ACCT_NO',
    as: 'customerAccount'
  });
  
  TermDeposit.belongsTo(models.Customer, {
    foreignKey: 'CUST_ID',
    targetKey: 'CUST_ID',
    as: 'customer'
  });
  
  TermDeposit.belongsTo(models.Branch, {
    foreignKey: 'BU_ID',
    targetKey: 'BU_ID',
    as: 'branch'
  });
  
  TermDeposit.hasMany(models.InterestDistribution, {
    foreignKey: 'termDepositId',
    as: 'interestDistributions'
  });
};

export default TermDeposit;
