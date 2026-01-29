// models/LoanProduct.js - UPDATED WITH FLEXIBLE PRODUCT_TYPE
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

// ==================== HELPER FUNCTIONS ====================

const convertTermToMonths = (value, termType) => {
  switch(termType?.toUpperCase()) {
    case 'DAYS':
      return Math.ceil(value / 30.44); // Average days in month
    case 'WEEKS':
      return Math.ceil(value / 4.345); // Average weeks in month
    case 'MONTHS':
      return value;
    case 'QUARTERS':
      return value * 3;
    case 'YEARS':
      return value * 12;
    default:
      return value;
  }
};

// ==================== INTEREST CALCULATION CLASS ====================

class LoanProductInterestCalculator {
  /**
   * Calculate flat rate interest
   * @param {number} principal - Loan amount
   * @param {number} ratePerMonth - Monthly interest rate in percentage
   * @param {number} termMonths - Loan term in months
   * @param {string} interestType - 'SIMPLE' or 'COMPOUND'
   * @param {boolean} isAmortized - Whether loan is amortized
   * @param {string} calculationMethod - 'FLAT', 'REDUCING_BALANCE', etc.
   * @param {string} repaymentFrequency - 'DAILY', 'WEEKLY', 'MONTHLY', etc.
   * @returns {Object} Calculation results
   */
  static calculateFlatRate(principal, ratePerMonth, termMonths, interestType = 'SIMPLE', isAmortized = true, calculationMethod = 'FLAT', repaymentFrequency = 'MONTHLY') {
    const monthlyRate = ratePerMonth / 100;
    let totalInterest, monthlyPayment, totalPayment;
    
    if (!isAmortized) {
      // Interest only payments
      totalInterest = principal * monthlyRate * termMonths;
      monthlyPayment = totalInterest / termMonths;
      totalPayment = principal + totalInterest;
    } else if (interestType.toUpperCase() === 'SIMPLE') {
      // Simple amortized (flat rate)
      totalInterest = principal * monthlyRate * termMonths;
      totalPayment = principal + totalInterest;
      monthlyPayment = totalPayment / termMonths;
    } else if (interestType.toUpperCase() === 'COMPOUND') {
      // Compound amortized
      if (monthlyRate === 0) {
        monthlyPayment = principal / termMonths;
      } else {
        const rateFactor = Math.pow(1 + monthlyRate, termMonths);
        monthlyPayment = principal * (monthlyRate * rateFactor) / (rateFactor - 1);
      }
      totalPayment = monthlyPayment * termMonths;
      totalInterest = totalPayment - principal;
    } else {
      // Default to simple amortized
      totalInterest = principal * monthlyRate * termMonths;
      totalPayment = principal + totalInterest;
      monthlyPayment = totalPayment / termMonths;
    }
    
    // Adjust for repayment frequency
    let paymentPerPeriod = monthlyPayment;
    let periodsPerYear = 12;
    
    switch(repaymentFrequency.toUpperCase()) {
      case 'DAILY':
        paymentPerPeriod = monthlyPayment / 30;
        periodsPerYear = 365;
        break;
      case 'WEEKLY':
        paymentPerPeriod = monthlyPayment / 4;
        periodsPerYear = 52;
        break;
      case 'MONTHLY':
        // Already monthly
        break;
      case 'QUARTERLY':
        paymentPerPeriod = monthlyPayment * 3;
        periodsPerYear = 4;
        break;
      case 'SEMI_ANNUALLY':
        paymentPerPeriod = monthlyPayment * 6;
        periodsPerYear = 2;
        break;
      case 'ANNUALLY':
        paymentPerPeriod = monthlyPayment * 12;
        periodsPerYear = 1;
        break;
    }
    
    return {
      principal,
      monthlyRate: monthlyRate * 100,
      annualRate: (monthlyRate * 12) * 100,
      termMonths,
      totalInterest: parseFloat(totalInterest.toFixed(2)),
      totalPayment: parseFloat(totalPayment.toFixed(2)),
      monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
      paymentPerPeriod: parseFloat(paymentPerPeriod.toFixed(2)),
      interestType,
      calculationMethod,
      repaymentFrequency,
      isAmortized,
      periodsPerYear
    };
  }

  /**
   * Generate amortization schedule
   * @param {number} principal - Loan amount
   * @param {number} monthlyPayment - Monthly payment amount
   * @param {number} monthlyRate - Monthly interest rate as decimal
   * @param {number} termMonths - Loan term in months
   * @param {string} interestType - 'SIMPLE' or 'COMPOUND'
   * @param {boolean} isAmortized - Whether loan is amortized
   * @param {string} startDate - Start date for payments
   * @returns {Array} Payment schedule
   */
  static generateAmortizationSchedule(principal, monthlyPayment, monthlyRate, termMonths, interestType = 'SIMPLE', isAmortized = true, startDate = null) {
    const schedule = [];
    let remainingBalance = principal;
    let totalInterestPaid = 0;
    
    // Parse start date or use current date
    const start = startDate ? new Date(startDate) : new Date();
    
    for (let i = 1; i <= termMonths; i++) {
      let interestPayment, principalPayment, totalPaymentThisMonth;
      
      // Calculate payment date (approximately 30 days between payments)
      const paymentDate = new Date(start);
      paymentDate.setMonth(paymentDate.getMonth() + i);
      
      if (isAmortized && interestType.toUpperCase() === 'COMPOUND') {
        // Amortization schedule for compound interest
        interestPayment = remainingBalance * monthlyRate;
        principalPayment = monthlyPayment - interestPayment;
        totalPaymentThisMonth = monthlyPayment;
      } else {
        // Equal payments for simple interest or non-amortized
        const totalInterest = principal * monthlyRate * termMonths;
        
        if (isAmortized) {
          interestPayment = totalInterest / termMonths;
          principalPayment = principal / termMonths;
          totalPaymentThisMonth = monthlyPayment;
        } else {
          interestPayment = totalInterest / termMonths;
          principalPayment = 0;
          totalPaymentThisMonth = monthlyPayment;
        }
      }
      
      remainingBalance -= principalPayment;
      totalInterestPaid += interestPayment;
      
      schedule.push({
        installment: i,
        paymentDate: paymentDate.toISOString().split('T')[0],
        principalPayment: parseFloat(principalPayment.toFixed(2)),
        interestPayment: parseFloat(interestPayment.toFixed(2)),
        totalPayment: parseFloat(totalPaymentThisMonth.toFixed(2)),
        remainingBalance: parseFloat(Math.max(0, remainingBalance).toFixed(2)),
        cumulativeInterest: parseFloat(totalInterestPaid.toFixed(2)),
        cumulativePrincipal: parseFloat((principal - remainingBalance).toFixed(2)),
        cumulativeTotal: parseFloat((principal - remainingBalance + totalInterestPaid).toFixed(2))
      });
    }
    
    return schedule;
  }

  /**
   * Calculate interest for a specific period
   * @param {number} principal - Loan amount
   * @param {number} ratePerMonth - Monthly interest rate in percentage
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {string} interestType - 'SIMPLE' or 'COMPOUND'
   * @returns {Object} Period interest calculation
   */
  static calculateInterestForPeriod(principal, ratePerMonth, startDate, endDate, interestType = 'SIMPLE') {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate number of days between dates
    const timeDiff = end.getTime() - start.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const monthsDiff = daysDiff / 30.44; // Average days in month
    
    const monthlyRate = ratePerMonth / 100;
    let interestAmount;
    
    if (interestType.toUpperCase() === 'SIMPLE') {
      // Simple interest: Principal × Rate × Time
      interestAmount = principal * monthlyRate * monthsDiff;
    } else if (interestType.toUpperCase() === 'COMPOUND') {
      // Compound interest: Principal × (1 + Rate)^Time - Principal
      interestAmount = principal * (Math.pow(1 + monthlyRate, monthsDiff) - 1);
    } else {
      // Default to simple interest
      interestAmount = principal * monthlyRate * monthsDiff;
    }
    
    return {
      principal: parseFloat(principal.toFixed(2)),
      interestRate: parseFloat(ratePerMonth.toFixed(4)),
      interestType,
      period: {
        startDate: start.toISOString().split('T')[0],
        endDate: end.toISOString().split('T')[0],
        days: daysDiff,
        months: parseFloat(monthsDiff.toFixed(2))
      },
      interestAmount: parseFloat(interestAmount.toFixed(2)),
      totalAmount: parseFloat((principal + interestAmount).toFixed(2)),
      dailyInterest: parseFloat((interestAmount / daysDiff).toFixed(2)),
      monthlyInterest: parseFloat((interestAmount / monthsDiff).toFixed(2))
    };
  }

  /**
   * Validate loan parameters against constraints
   * @param {Object} constraints - Constraints object
   * @param {number} amount - Requested loan amount
   * @param {number} termValue - Requested term value
   * @param {string} termType - Requested term type
   * @param {number} requestedRate - Requested interest rate (optional)
   * @returns {Object} Validation results
   */
  static validateLoanParameters(constraints, amount, termValue, termType, requestedRate = null) {
    const errors = [];
    
    // Validate amount
    const amountNum = parseFloat(amount);
    const minAmount = parseFloat(constraints.minAmount || '0');
    const maxAmount = parseFloat(constraints.maxAmount || '999999999');
    
    if (amountNum < minAmount) {
      errors.push(`Loan amount (${amountNum}) is below minimum (${minAmount})`);
    }
    if (amountNum > maxAmount) {
      errors.push(`Loan amount (${amountNum}) exceeds maximum (${maxAmount})`);
    }
    
    // Validate term
    const termValueNum = parseInt(termValue);
    const productTermType = constraints.LOAN_TERM_TYPE || 'MONTHS';
    
    if (termType.toUpperCase() !== productTermType) {
      errors.push(`Term type (${termType}) does not match product term type (${productTermType})`);
    } else {
      const minTerm = constraints.MIN_LOAN_TERM_VALUE || 1;
      const maxTerm = constraints.MAX_LOAN_TERM_VALUE || 60;
      
      if (termValueNum < minTerm) {
        errors.push(`Term value (${termValueNum}) is below minimum (${minTerm})`);
      }
      if (termValueNum > maxTerm) {
        errors.push(`Term value (${termValueNum}) exceeds maximum (${maxTerm})`);
      }
    }
    
    // Validate rate if requested
    if (requestedRate !== null && constraints.rateRange) {
      const requestedRateNum = parseFloat(requestedRate);
      const minRate = parseFloat(constraints.rateRange.min || '0');
      const maxRate = parseFloat(constraints.rateRange.max || '100');
      
      if (requestedRateNum < minRate) {
        errors.push(`Requested rate (${requestedRate}%) is below minimum (${minRate}%)`);
      }
      if (requestedRateNum > maxRate) {
        errors.push(`Requested rate (${requestedRate}%) exceeds maximum (${maxRate}%)`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      constraints: {
        amountRange: { min: minAmount, max: maxAmount },
        termRange: { 
          min: constraints.MIN_LOAN_TERM_VALUE || 1, 
          max: constraints.MAX_LOAN_TERM_VALUE || 60, 
          type: constraints.LOAN_TERM_TYPE || 'MONTHS'
        },
        rateRange: constraints.rateRange || null
      }
    };
  }

  /**
   * Compare different interest rates
   * @param {number} principal - Loan amount
   * @param {number} termMonths - Term in months
   * @param {Array} rates - Array of rates to compare
   * @returns {Object} Comparison results
   */
  static compareInterestRates(principal, termMonths, rates) {
    const comparisons = rates.map(rateInfo => {
      const monthlyRate = rateInfo.rate / 100;
      const totalInterest = principal * monthlyRate * termMonths;
      const totalPayment = principal + totalInterest;
      const monthlyPayment = totalPayment / termMonths;
     
      return {
        rateName: rateInfo.name,
        rateValue: rateInfo.rate,
        rateType: rateInfo.type,
        calculations: {
          totalInterest: parseFloat(totalInterest.toFixed(2)),
          totalPayment: parseFloat(totalPayment.toFixed(2)),
          monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
          interestPercentage: parseFloat((totalInterest / principal * 100).toFixed(2))
        }
      };
    });
    
    return comparisons;
  }
}

// ==================== LOAN PRODUCT MODEL ====================

const LoanProduct = sequelize.define('LoanProduct', {
  // ======================
  // PRODUCT IDENTIFICATION
  // ======================
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    validate: {
      isNumeric: true,
      min: 1
    }
  },
  productCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    trim: true
  },
  PRODUCT_SHORT_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    trim: true,
    uppercase: true
  },
  description: {
    type: DataTypes.TEXT,
    trim: true
  },
  
  // ======================
  // FLEXIBLE PRODUCT TYPE - STRING INSTEAD OF ENUM
  // ======================
  PRODUCT_TYPE: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'GENERAL_LOAN',
    comment: 'Flexible product type - can be any valid loan product type'
  },
  
  // ======================
  // INTEREST RATE INTEGRATION USING LOAN_PROUD_INT_ID
  // ======================
  
  // Primary reference to LoanInterestRate via foreign key
  LOAN_INTEREST_RATE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'loan_interest_rates',
      key: 'id'
    }
  },

  // Business key integration - USED TO TIE PRODUCT TO INTEREST RATE
  LOAN_PROUD_INT_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Business key to link with LoanInterestRate.LOAN_PROUD_INT_ID'
  },

  // ======================
  // PRODUCT-SPECIFIC CONFIGURATION
  // ======================
  
  // Loan Amount Constraints
  minAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  maxAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00
  },

  // Loan Term Constraints
  MIN_LOAN_TERM_VALUE: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: 1
    }
  },
  MAX_LOAN_TERM_VALUE: {
    type: DataTypes.INTEGER,
    defaultValue: 60,
    validate: {
      min: 1
    }
  },
  LOAN_TERM_TYPE: {
    type: DataTypes.ENUM('DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'),
    defaultValue: 'MONTHS'
  },

  // Business Unit Configuration
  BU_ID: {
    type: DataTypes.TEXT,
    allowNull: false,
    get() {
      const value = this.getDataValue('BU_ID');
      return value ? value.split(',') : [];
    },
    set(value) {
      if (Array.isArray(value)) {
        this.setDataValue('BU_ID', value.join(','));
      } else {
        this.setDataValue('BU_ID', value);
      }
    }
  },
  isGlobalProduct: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  visibility: {
    type: DataTypes.ENUM('GLOBAL', 'SELECTED_BUS', 'SPECIFIC_BRANCHES'),
    defaultValue: 'SELECTED_BUS'
  },

  // Payment Configuration
  REPAYMENT_TYPE: {
    type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'BULLET', 'CUSTOM'),
    allowNull: false,
    defaultValue: 'MONTHLY'
  },
  PAYMENT_FREQUENCY: {
    type: DataTypes.ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'),
    allowNull: false,
    defaultValue: 'MONTHLY'
  },
  TERM_CD: {
    type: DataTypes.ENUM('D', 'W', 'M', 'Q', 'Y'),
    allowNull: false
  },
  CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN'
  },
  allowedCurrencies: {
    type: DataTypes.TEXT,
    defaultValue: 'NGN',
    get() {
      const value = this.getDataValue('allowedCurrencies');
      return value ? value.split(',') : ['NGN'];
    },
    set(value) {
      if (Array.isArray(value)) {
        this.setDataValue('allowedCurrencies', value.join(','));
      } else {
        this.setDataValue('allowedCurrencies', value);
      }
    }
  },

  // Interest Calculation Configuration (can be overridden from LoanInterestRate)
  CALCULATION_METHOD_OVERRIDE: {
    type: DataTypes.ENUM('FLAT', 'REDUCING_BALANCE', 'RULE_OF_78'),
    allowNull: true,
    comment: 'Optional override of interest rate calculation method'
  },
  INTEREST_TYPE_OVERRIDE: {
    type: DataTypes.ENUM('SIMPLE', 'COMPOUND'),
    allowNull: true,
    comment: 'Optional override of interest type'
  },

  // ======================
  // GL ACCOUNTS (as JSON)
  // ======================
  defaultGLAccounts: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  branchGLAccounts: {
    type: DataTypes.JSON,
    defaultValue: []
  },

  // ======================
  // FEE STRUCTURE (as JSON)
  // ======================
  feeStructure: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  processingFeeRate: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  processingFeeGLCode: {
    type: DataTypes.STRING(50),
    defaultValue: ''
  },
  lateFeePerDay: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  maxLateFee: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: null
  },

  // ======================
  // PRODUCT CATEGORIZATION
  // ======================
  productCategory: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Optional product category for grouping'
  },
  productSubCategory: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Optional product sub-category'
  },
  riskLevel: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'),
    defaultValue: 'MEDIUM'
  },
  collateralRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  eligibilityCriteria: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: 'JSON object containing eligibility criteria'
  },

  // ======================
  // SYSTEM METADATA & STATUS
  // ======================
  EFFECTIVE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  EXPIRY_DT: {
    type: DataTypes.DATE,
    defaultValue: null
  },
  VERSION: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  STATUS: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'PENDING', 'DRAFT', 'ARCHIVED'),
    defaultValue: 'DRAFT'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },

  // ======================
  // AUDIT FIELDS
  // ======================
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'SYSTEM'
  },
  USER_ID: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'SYSTEM'
  },
  LAST_MODIFIED_BY: {
    type: DataTypes.STRING(100),
    defaultValue: ''
  },

  // ======================
  // METADATA (as JSON)
  // ======================
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {
      interestRateIntegration: {
        usesLoanProudIntId: false,
        syncStatus: 'PENDING',
        lastSyncAt: null
      },
      productClassification: {
        systemDefined: false,
        customType: false,
        tags: []
      }
    }
  }
}, {
  tableName: 'loan_products',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      name: 'idx_prod_id',
      fields: ['PROD_ID']
    },
    {
      name: 'idx_product_code',
      fields: ['productCode'],
      unique: true
    },
    {
      name: 'idx_product_type',
      fields: ['PRODUCT_TYPE']
    },
    {
      name: 'idx_product_type_status',
      fields: ['PRODUCT_TYPE', 'STATUS']
    },
    {
      name: 'idx_product_category',
      fields: ['productCategory']
    },
    {
      name: 'idx_interest_rate_id',
      fields: ['LOAN_INTEREST_RATE_ID']
    },
    {
      name: 'idx_loan_proud_int_id',
      fields: ['LOAN_PROUD_INT_ID']
    },
    {
      name: 'idx_status_active',
      fields: ['STATUS', 'isActive']
    },
    {
      name: 'idx_product_short_name',
      fields: ['PRODUCT_SHORT_NAME']
    }
  ],
  hooks: {
    beforeCreate: async (loanProduct) => {
      await loanProduct.validateAndSyncInterestRate();
    },
    
    beforeUpdate: async (loanProduct) => {
      // If LOAN_PROUD_INT_ID is being changed, validate and sync
      if (loanProduct.changed('LOAN_PROUD_INT_ID')) {
        await loanProduct.validateAndSyncInterestRate();
      }
      
      // If LOAN_INTEREST_RATE_ID is being changed, update LOAN_PROUD_INT_ID
      if (loanProduct.changed('LOAN_INTEREST_RATE_ID')) {
        await loanProduct.syncLoanProudIntId();
      }
    },
    
    beforeSave: async (loanProduct) => {
      // Generate PROD_ID from productCode if not provided
      if (!loanProduct.PROD_ID && loanProduct.productCode) {
        const numericCode = parseInt(loanProduct.productCode.replace(/\D/g, ''), 10);
        loanProduct.PROD_ID = numericCode || Math.floor(Date.now() / 1000) % 1000000;
      }

      // Set TERM_CD based on LOAN_TERM_TYPE
      if (!loanProduct.TERM_CD) {
        switch (loanProduct.LOAN_TERM_TYPE) {
          case 'DAYS': loanProduct.TERM_CD = 'D'; break;
          case 'WEEKS': loanProduct.TERM_CD = 'W'; break;
          case 'MONTHS': loanProduct.TERM_CD = 'M'; break;
          case 'QUARTERS': loanProduct.TERM_CD = 'Q'; break;
          case 'YEARS': loanProduct.TERM_CD = 'Y'; break;
          default: loanProduct.TERM_CD = 'M';
        }
      }

      // Set PAYMENT_FREQUENCY based on LOAN_TERM_TYPE if not set
      if (!loanProduct.PAYMENT_FREQUENCY) {
        switch (loanProduct.LOAN_TERM_TYPE) {
          case 'DAYS': loanProduct.PAYMENT_FREQUENCY = 'DAILY'; break;
          case 'WEEKS': loanProduct.PAYMENT_FREQUENCY = 'WEEKLY'; break;
          case 'MONTHS':
          case 'QUARTERS':
          case 'YEARS':
            loanProduct.PAYMENT_FREQUENCY = 'MONTHLY'; break;
          default: loanProduct.PAYMENT_FREQUENCY = 'MONTHLY';
        }
      }

      // Set BU_ID for global products
      if (loanProduct.isGlobalProduct) {
        loanProduct.BU_ID = '*';
        loanProduct.visibility = 'GLOBAL';
      }

      // Clean and uppercase PRODUCT_TYPE
      if (loanProduct.PRODUCT_TYPE) {
        loanProduct.PRODUCT_TYPE = loanProduct.PRODUCT_TYPE.trim().toUpperCase().replace(/\s+/g, '_');
      }

      // Initialize metadata if not set
      if (!loanProduct.metadata || typeof loanProduct.metadata !== 'object') {
        loanProduct.metadata = {
          interestRateIntegration: {
            usesLoanProudIntId: false,
            syncStatus: 'PENDING',
            lastSyncAt: null
          },
          productClassification: {
            systemDefined: false,
            customType: false,
            tags: []
          }
        };
      }
      
      // Ensure metadata structures exist
      if (!loanProduct.metadata.interestRateIntegration) {
        loanProduct.metadata.interestRateIntegration = {
          usesLoanProudIntId: false,
          syncStatus: 'PENDING',
          lastSyncAt: null
        };
      }
      
      if (!loanProduct.metadata.productClassification) {
        loanProduct.metadata.productClassification = {
          systemDefined: false,
          customType: false,
          tags: []
        };
      }
      
      // Track if PRODUCT_TYPE is a custom type (not in predefined list)
      const predefinedTypes = [
        'BUSINESS_TERM_LOAN',
        'INDIVIDUAL_LOAN',
        'CONSUMER_LOAN',
        'MORTGAGE',
        'AUTO_LOAN',
        'PERSONAL_LOAN',
        'EDUCATION_LOAN',
        'CREDIT_CARD',
        'LINE_OF_CREDIT',
        'SME_LOAN',
        'GENERAL_LOAN',
        'GROUP_LOAN',
        'MICRO_LOAN',
        'AGRI_LOAN',
        'HOUSING_LOAN',
        'VEHICLE_LOAN'
      ];
      
      loanProduct.metadata.productClassification.systemDefined = predefinedTypes.includes(loanProduct.PRODUCT_TYPE);
      loanProduct.metadata.productClassification.customType = !predefinedTypes.includes(loanProduct.PRODUCT_TYPE);
    }
  },
  getterMethods: {
    // Virtual for term range display
    termRange() {
      return `${this.MIN_LOAN_TERM_VALUE} - ${this.MAX_LOAN_TERM_VALUE} ${this.LOAN_TERM_TYPE}`;
    },
    
    // Virtual for accessible BUs
    accessibleBUs() {
      if (this.isGlobalProduct) {
        return ['*'];
      }
      return this.BU_ID ? this.BU_ID.split(',').filter(bu => bu.trim()) : [];
    },
    
    // Virtual getter for interest rate configuration
    interestRateConfig() {
      return {
        hasLoanProudIntId: !!this.LOAN_PROUD_INT_ID,
        loanProudIntId: this.LOAN_PROUD_INT_ID,
        loanInterestRateId: this.LOAN_INTEREST_RATE_ID,
        calculationMethod: this.CALCULATION_METHOD_OVERRIDE || null,
        interestType: this.INTEREST_TYPE_OVERRIDE || null
      };
    },
    
    // Virtual getter for product classification
    productClassification() {
      return {
        type: this.PRODUCT_TYPE,
        category: this.productCategory,
        subCategory: this.productSubCategory,
        riskLevel: this.riskLevel,
        collateralRequired: this.collateralRequired,
        isCustomType: this.metadata?.productClassification?.customType || false,
        isSystemDefined: this.metadata?.productClassification?.systemDefined || false,
        tags: this.metadata?.productClassification?.tags || []
      };
    }
  }
});

// ======================
// INSTANCE METHODS
// ======================

/**
 * Validate and sync with LoanInterestRate using LOAN_PROUD_INT_ID
 */
LoanProduct.prototype.validateAndSyncInterestRate = async function() {
  const { LoanInterestRate } = sequelize.models;
  
  // If LOAN_PROUD_INT_ID is provided, find the matching LoanInterestRate
  if (this.LOAN_PROUD_INT_ID) {
    const interestRate = await LoanInterestRate.findOne({
      where: { LOAN_PROUD_INT_ID: this.LOAN_PROUD_INT_ID }
    });
    
    if (!interestRate) {
      throw new Error(`No LoanInterestRate found with LOAN_PROUD_INT_ID: ${this.LOAN_PROUD_INT_ID}`);
    }
    
    // Update the foreign key reference
    this.LOAN_INTEREST_RATE_ID = interestRate.id;
    
    // Update metadata
    if (!this.metadata) this.metadata = {};
    if (!this.metadata.interestRateIntegration) {
      this.metadata.interestRateIntegration = {};
    }
    this.metadata.interestRateIntegration.usesLoanProudIntId = true;
    this.metadata.interestRateIntegration.syncStatus = 'SYNCED';
    this.metadata.interestRateIntegration.lastSyncAt = new Date();
    this.metadata.interestRateIntegration.matchedInterestRate = {
      id: interestRate.id,
      name: interestRate.name,
      code: interestRate.code,
      loanProudIntId: interestRate.LOAN_PROUD_INT_ID
    };
    
    console.log(`✅ Product ${this.productCode} linked to LoanInterestRate ${interestRate.name} via LOAN_PROUD_INT_ID: ${this.LOAN_PROUD_INT_ID}`);
  }
  
  return true;
};

/**
 * Sync LOAN_PROUD_INT_ID from associated LoanInterestRate
 */
LoanProduct.prototype.syncLoanProudIntId = async function() {
  const { LoanInterestRate } = sequelize.models;
  
  // If LOAN_INTEREST_RATE_ID is set, get the LoanInterestRate
  if (this.LOAN_INTEREST_RATE_ID) {
    const interestRate = await LoanInterestRate.findByPk(this.LOAN_INTEREST_RATE_ID);
    
    if (interestRate && interestRate.LOAN_PROUD_INT_ID) {
      this.LOAN_PROUD_INT_ID = interestRate.LOAN_PROUD_INT_ID;
      
      // Update metadata
      if (!this.metadata) this.metadata = {};
      if (!this.metadata.interestRateIntegration) {
        this.metadata.interestRateIntegration = {};
      }
      this.metadata.interestRateIntegration.usesLoanProudIntId = true;
      this.metadata.interestRateIntegration.syncStatus = 'SYNCED';
      this.metadata.interestRateIntegration.lastSyncAt = new Date();
      this.metadata.interestRateIntegration.matchedInterestRate = {
        id: interestRate.id,
        name: interestRate.name,
        code: interestRate.code,
        loanProudIntId: interestRate.LOAN_PROUD_INT_ID
      };
      
      console.log(`✅ Product ${this.productCode} LOAN_PROUD_INT_ID synced from LoanInterestRate: ${interestRate.LOAN_PROUD_INT_ID}`);
    }
  }
  
  return this.LOAN_PROUD_INT_ID;
};

/**
 * Get the associated LoanInterestRate with all details
 */
LoanProduct.prototype.getInterestRate = async function(options = {}) {
  const { forceRefresh = false } = options;
  const { LoanInterestRate } = sequelize.models;
  
  // If we have LOAN_PROUD_INT_ID but not LOAN_INTEREST_RATE_ID, find it
  if (this.LOAN_PROUD_INT_ID && (!this.LOAN_INTEREST_RATE_ID || forceRefresh)) {
    await this.validateAndSyncInterestRate();
  }
  
  // Get the interest rate
  const interestRate = await LoanInterestRate.findByPk(this.LOAN_INTEREST_RATE_ID);
  
  if (!interestRate) {
    throw new Error(`LoanInterestRate with ID ${this.LOAN_INTEREST_RATE_ID} not found`);
  }
  
  return interestRate;
};

/**
 * Calculate loan repayment using the associated interest rate
 */
LoanProduct.prototype.calculateLoanRepayment = async function({
  principal,
  termValue,
  termType = null,
  useDefaultRate = true,
  customRate = null,
  generateSchedule = true,
  startDate = null
}) {
  // Get the associated interest rate
  const interestRate = await this.getInterestRate();
  
  // Use product term type if not specified
  const actualTermType = termType || this.LOAN_TERM_TYPE;
  
  // Convert term to months
  const termMonths = convertTermToMonths(termValue, actualTermType);
  
  // Determine which rate to use
  let ratePerMonth;
  if (useDefaultRate) {
    ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  } else if (customRate !== null) {
    ratePerMonth = parseFloat(customRate);
    
    // Validate custom rate is within allowed range
    const minRate = parseFloat(interestRate.MIN_RATE_PER_MONTH || '0');
    const maxRate = parseFloat(interestRate.MAX_RATE_PER_MONTH || '100');
    
    if (ratePerMonth < minRate || ratePerMonth > maxRate) {
      throw new Error(`Custom rate ${ratePerMonth}% is outside allowed range (${minRate}% - ${maxRate}%)`);
    }
  } else {
    ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  }
  
  // Determine calculation method (use override if exists)
  const calculationMethod = this.CALCULATION_METHOD_OVERRIDE || interestRate.CALCULATION_METHOD || 'FLAT';
  const interestType = this.INTEREST_TYPE_OVERRIDE || interestRate.INTEREST_TYPE || 'SIMPLE';
  const isAmortized = this.REPAYMENT_TYPE !== 'BULLET'; // Assuming BULLET means interest-only
  
  // Calculate using the helper class
  const calculation = LoanProductInterestCalculator.calculateFlatRate(
    principal,
    ratePerMonth,
    termMonths,
    interestType,
    isAmortized,
    calculationMethod,
    this.PAYMENT_FREQUENCY
  );
  
  let paymentSchedule = [];
  if (generateSchedule) {
    paymentSchedule = LoanProductInterestCalculator.generateAmortizationSchedule(
      principal,
      calculation.monthlyPayment,
      ratePerMonth / 100,
      termMonths,
      interestType,
      isAmortized,
      startDate
    );
  }
  
  return {
    ...calculation,
    paymentSchedule,
    interestRateDetails: {
      id: interestRate.id,
      name: interestRate.name,
      code: interestRate.code,
      loanProudIntId: interestRate.LOAN_PROUD_INT_ID,
      rateType: interestRate.RATE_TYPE,
      interestType: interestRate.INTEREST_TYPE,
      calculationMethod: interestRate.CALCULATION_METHOD,
      minRate: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
      maxRate: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
      defaultRate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0')
    },
    productDetails: {
      id: this.id,
      PROD_ID: this.PROD_ID,
      name: this.name,
      productCode: this.productCode,
      loanProudIntId: this.LOAN_PROUD_INT_ID,
      productType: this.PRODUCT_TYPE,
      productCategory: this.productCategory
    }
  };
};

/**
 * Validate loan application against this product and its interest rate
 */
LoanProduct.prototype.validateLoanApplication = async function(amount, termValue, termType = null, requestedRate = null) {
  // Get the associated interest rate
  const interestRate = await this.getInterestRate();
  
  // Use product term type if not specified
  const actualTermType = termType || this.LOAN_TERM_TYPE;
  
  // Prepare constraints
  const constraints = {
    minAmount: this.minAmount,
    maxAmount: this.maxAmount,
    MIN_LOAN_TERM_VALUE: this.MIN_LOAN_TERM_VALUE,
    MAX_LOAN_TERM_VALUE: this.MAX_LOAN_TERM_VALUE,
    LOAN_TERM_TYPE: this.LOAN_TERM_TYPE,
    rateRange: {
      min: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
      max: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
      default: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0')
    }
  };
  
  // Validate using the helper class
  const validation = LoanProductInterestCalculator.validateLoanParameters(
    constraints,
    amount,
    termValue,
    actualTermType,
    requestedRate
  );
  
  return {
    ...validation,
    product: {
      id: this.id,
      PROD_ID: this.PROD_ID,
      name: this.name,
      productCode: this.productCode,
      productType: this.PRODUCT_TYPE
    },
    interestRate: {
      id: interestRate.id,
      name: interestRate.name,
      code: interestRate.code,
      loanProudIntId: interestRate.LOAN_PROUD_INT_ID
    }
  };
};

/**
 * Calculate interest for a specific period
 */
LoanProduct.prototype.calculateInterestForPeriod = async function({
  principal,
  startDate,
  endDate,
  useDefaultRate = true,
  customRate = null
}) {
  // Get the associated interest rate
  const interestRate = await this.getInterestRate();
  
  // Determine which rate to use
  let ratePerMonth;
  if (useDefaultRate) {
    ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  } else if (customRate !== null) {
    ratePerMonth = parseFloat(customRate);
  } else {
    ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  }
  
  const interestType = this.INTEREST_TYPE_OVERRIDE || interestRate.INTEREST_TYPE || 'SIMPLE';
  
  // Calculate using the helper class
  return LoanProductInterestCalculator.calculateInterestForPeriod(
    principal,
    ratePerMonth,
    startDate,
    endDate,
    interestType
  );
};

/**
 * Add tags to product classification
 */
LoanProduct.prototype.addTags = function(tags) {
  if (!Array.isArray(tags)) {
    tags = [tags];
  }
  
  if (!this.metadata) this.metadata = {};
  if (!this.metadata.productClassification) {
    this.metadata.productClassification = {
      tags: []
    };
  }
  
  // Add unique tags
  const existingTags = this.metadata.productClassification.tags || [];
  const newTags = tags.filter(tag => !existingTags.includes(tag));
  this.metadata.productClassification.tags = [...existingTags, ...newTags];
  
  return this.metadata.productClassification.tags;
};

// ======================
// CLASS/STATIC METHODS
// ======================

/**
 * Find product by LOAN_PROUD_INT_ID
 */
LoanProduct.findByLoanProudIntId = async function(loanProudIntId, options = {}) {
  const { includeInterestRate = true } = options;
  
  const query = {
    where: { LOAN_PROUD_INT_ID: loanProudIntId }
  };
  
  if (includeInterestRate) {
    query.include = [{
      model: sequelize.models.LoanInterestRate,
      as: 'LoanInterestRate',
      required: true
    }];
  }
  
  return this.findOne(query);
};

/**
 * Find products by interest rate LOAN_PROUD_INT_ID
 */
LoanProduct.findByInterestRateLoanProudIntId = async function(loanProudIntId, options = {}) {
  const { status = 'ACTIVE', limit, offset } = options;
  
  return this.findAll({
    where: {
      STATUS: status,
      isActive: true
    },
    include: [{
      model: sequelize.models.LoanInterestRate,
      as: 'LoanInterestRate',
      where: { LOAN_PROUD_INT_ID: loanProudIntId },
      required: true
    }],
    order: [['name', 'ASC']],
    limit,
    offset
  });
};

/**
 * Find products by PRODUCT_TYPE
 */
LoanProduct.findByProductType = async function(productType, options = {}) {
  const { status = 'ACTIVE', limit, offset, includeInterestRate = true } = options;
  
  const query = {
    where: {
      PRODUCT_TYPE: productType.toUpperCase(),
      STATUS: status,
      isActive: true
    },
    order: [['name', 'ASC']],
    limit,
    offset
  };
  
  if (includeInterestRate) {
    query.include = [{
      model: sequelize.models.LoanInterestRate,
      as: 'LoanInterestRate',
      required: true
    }];
  }
  
  return this.findAll(query);
};

/**
 * Get all distinct PRODUCT_TYPE values
 */
LoanProduct.getProductTypes = async function() {
  const result = await this.findAll({
    attributes: [
      [sequelize.fn('DISTINCT', sequelize.col('PRODUCT_TYPE')), 'product_type']
    ],
    order: [['PRODUCT_TYPE', 'ASC']]
  });
  
  return result.map(item => item.dataValues.product_type);
};

/**
 * Find products with their interest rates
 */
LoanProduct.findActiveProductsWithInterestRates = function(options = {}) {
  const { limit, offset } = options;
  
  return this.findAll({
    where: {
      STATUS: 'ACTIVE',
      isActive: true
    },
    include: [{
      model: sequelize.models.LoanInterestRate,
      as: 'LoanInterestRate',
      required: true
    }],
    order: [['name', 'ASC']],
    limit,
    offset
  });
};

/**
 * Find products by category
 */
LoanProduct.findByCategory = async function(category, options = {}) {
  const { status = 'ACTIVE', limit, offset, includeInterestRate = true } = options;
  
  const query = {
    where: {
      productCategory: category,
      STATUS: status,
      isActive: true
    },
    order: [['name', 'ASC']],
    limit,
    offset
  };
  
  if (includeInterestRate) {
    query.include = [{
      model: sequelize.models.LoanInterestRate,
      as: 'LoanInterestRate',
      required: true
    }];
  }
  
  return this.findAll(query);
};

// ======================
// ASSOCIATIONS
// ======================

export function setupLoanProductAssociations() {
  const { LoanInterestRate } = sequelize.models;
  
  // Primary association by foreign key
  LoanProduct.belongsTo(LoanInterestRate, {
    foreignKey: 'LOAN_INTEREST_RATE_ID',
    as: 'LoanInterestRate',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  });
  
  // Additional association by business key (optional)
  LoanProduct.belongsTo(LoanInterestRate, {
    foreignKey: 'LOAN_PROUD_INT_ID',
    targetKey: 'LOAN_PROUD_INT_ID',
    as: 'LoanInterestRateByProudId',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  });
  
  LoanInterestRate.hasMany(LoanProduct, {
    foreignKey: 'LOAN_INTEREST_RATE_ID',
    as: 'LoanProducts'
  });
  
  LoanInterestRate.hasMany(LoanProduct, {
    foreignKey: 'LOAN_PROUD_INT_ID',
    targetKey: 'LOAN_PROUD_INT_ID',
    as: 'LoanProductsByProudId'
  });
}

export default LoanProduct;