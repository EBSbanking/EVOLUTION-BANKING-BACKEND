// models/LoanPortfolio.js
import mongoose from 'mongoose';

const loanPortfolioSchema = new mongoose.Schema({
  // Identification
  BRANCH_ID: {
    type: String,
    required: true,
    index: true
  },
  PROD_ID: {
    type: Number,
    required: true,
    index: true
  },
  PRODUCT_CODE: {
    type: String,
    required: true
  },
  PRODUCT_NAME: {
    type: String,
    required: true
  },
  PRODUCT_TYPE: {
    type: String,
    enum: [
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
      'MONTHLY_LOAN',
      'ASSET_LOAN',
      'RAPID_CASH_LOAN',
      'STAFF_LOAN',
      'STAFF_SALARY_ADVANCE',
      'GROUP_MONTHLY_LOAN',
      'SOLAR_LOAN',
      'DAILY_LOAN'
    ],
    required: true
  },
  
  // Time period
  MONTH: {
    type: Number,
    min: 1,
    max: 12,
    required: true
  },
  YEAR: {
    type: Number,
    required: true
  },
  CURRENCY: {
    type: String,
    default: 'NGN'
  },
  
  // Portfolio Summary
  TOTAL_DISBURSED: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  TOTAL_NET_DISBURSEMENT: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  TOTAL_PRINCIPAL: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  OUTSTANDING_PRINCIPAL: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  TOTAL_INTEREST_ACCRUED: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  TOTAL_INTEREST_RECEIVED: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  TOTAL_FEES_RECEIVED: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  
  // Loan Counts
  NUMBER_OF_LOANS: {
    type: Number,
    default: 0,
    min: 0
  },
  ACTIVE_LOANS: {
    type: Number,
    default: 0,
    min: 0
  },
  DISBURSEMENT_COUNT: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Performance Metrics
  TOTAL_REPAYMENTS: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  TOTAL_RECOVERED: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  TOTAL_DEFAULTS: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  
  // Portfolio Health
  PORTFOLIO_AT_RISK: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  PROVISION_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  NPL_RATIO: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  
  // Financial Ratios
  YIELD_RATE: {
    type: Number,
    default: 0,
    min: 0
  },
  COST_OF_FUNDS: {
    type: Number,
    default: 0,
    min: 0
  },
  NET_INTEREST_MARGIN: {
    type: Number,
    default: 0
  },
  AVERAGE_LOAN_SIZE: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0,
    get: v => parseFloat(v.toString())
  },
  
  // Status and Metadata
  STATUS: {
    type: String,
    enum: ['ACTIVE', 'CLOSED', 'ARCHIVED'],
    default: 'ACTIVE'
  },
  CREATED_DATE: {
    type: Date,
    default: Date.now
  },
  UPDATED_DATE: {
    type: Date,
    default: Date.now
  },
  CREATED_BY: {
    type: String
  },
  UPDATED_BY: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    getters: true 
  },
  toObject: { 
    virtuals: true,
    getters: true 
  }
});

// Compound index for efficient querying
loanPortfolioSchema.index({ BRANCH_ID: 1, PROD_ID: 1, YEAR: 1, MONTH: 1 });
loanPortfolioSchema.index({ YEAR: 1, MONTH: 1, PRODUCT_TYPE: 1 });

// Virtual for formatted period
loanPortfolioSchema.virtual('PERIOD').get(function() {
  return `${this.YEAR}-${this.MONTH.toString().padStart(2, '0')}`;
});

// Virtual for collection efficiency
loanPortfolioSchema.virtual('COLLECTION_EFFICIENCY').get(function() {
  if (this.TOTAL_REPAYMENTS === 0) return 0;
  const recovered = parseFloat(this.TOTAL_RECOVERED.toString());
  const repayments = parseFloat(this.TOTAL_REPAYMENTS.toString());
  return (recovered / repayments) * 100;
});

// Virtual for default rate
loanPortfolioSchema.virtual('DEFAULT_RATE').get(function() {
  if (this.NUMBER_OF_LOANS === 0) return 0;
  const defaults = parseFloat(this.TOTAL_DEFAULTS.toString());
  return (defaults / this.NUMBER_OF_LOANS) * 100;
});

// Virtual for portfolio yield
loanPortfolioSchema.virtual('PORTFOLIO_YIELD').get(function() {
  if (this.OUTSTANDING_PRINCIPAL === 0) return 0;
  const interest = parseFloat(this.TOTAL_INTEREST_RECEIVED.toString());
  const principal = parseFloat(this.OUTSTANDING_PRINCIPAL.toString());
  return (interest / principal) * 100;
});

// Pre-save middleware to update ratios
loanPortfolioSchema.pre('save', function(next) {
  this.UPDATED_DATE = new Date();
  
  // Update NPL ratio
  const outstanding = parseFloat(this.OUTSTANDING_PRINCIPAL.toString());
  const atRisk = parseFloat(this.PORTFOLIO_AT_RISK.toString());
  if (outstanding > 0) {
    this.NPL_RATIO = (atRisk / outstanding) * 100;
  }
  
  // Update average loan size
  if (this.NUMBER_OF_LOANS > 0) {
    const totalPrincipal = parseFloat(this.TOTAL_PRINCIPAL.toString());
    this.AVERAGE_LOAN_SIZE = totalPrincipal / this.NUMBER_OF_LOANS;
  }
  
  // Update yield rate if needed
  if (outstanding > 0) {
    const interestReceived = parseFloat(this.TOTAL_INTEREST_RECEIVED.toString());
    this.YIELD_RATE = (interestReceived / outstanding) * 100;
  }
  
  next();
});

// Static method to update portfolio for a repayment
loanPortfolioSchema.statics.updateForRepayment = async function(loanAccount, amount, session = null) {
  try {
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    
    const productId = loanAccount.PROD_ID || 1;
    const productCode = loanAccount.PRODUCT_CODE || 'DEFAULT';
    const productName = loanAccount.PRODUCT_NAME || 'General Loan';
    const productType = loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN';
    const branchId = loanAccount.BRANCH_ID || '001';
    
    const query = {
      BRANCH_ID: branchId,
      PROD_ID: productId,
      YEAR: year,
      MONTH: month
    };
    
    const update = {
      $setOnInsert: {
        PRODUCT_CODE: productCode,
        PRODUCT_NAME: productName,
        PRODUCT_TYPE: productType,
        CURRENCY: 'NGN',
        CREATED_DATE: currentDate,
        CREATED_BY: 'system',
        UPDATED_BY: 'system'
      },
      $inc: {
        TOTAL_REPAYMENTS: 1,
        TOTAL_RECOVERED: amount,
        TOTAL_INTEREST_RECEIVED: 0, // You might want to track interest separately
        OUTSTANDING_PRINCIPAL: -amount
      },
      $set: {
        UPDATED_DATE: currentDate
      }
    };
    
    const options = {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      session: session
    };
    
    return await this.findOneAndUpdate(query, update, options);
    
  } catch (error) {
    console.error('Error in updateForRepayment:', error);
    throw error;
  }
};

const LoanPortfolio = mongoose.model('LoanPortfolio', loanPortfolioSchema);

export default LoanPortfolio;