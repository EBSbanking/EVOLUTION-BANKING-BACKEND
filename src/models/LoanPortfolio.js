import mongoose from 'mongoose';

const loanPortfolioSchema = new mongoose.Schema({
  // Identification
  BRANCH_ID: {
    type: String,
    required: true,
    index: true
  },
  PROD_ID: {
    type: Number, // CHANGED FROM ObjectId to Number
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
    enum: ['BUSINESS_TERM_LOAN',
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
      'DAILY_LOAN'],
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
    type: Number,
    default: 0,
    min: 0
  },
  TOTAL_NET_DISBURSEMENT: {
    type: Number,
    default: 0,
    min: 0
  },
  TOTAL_PRINCIPAL: {
    type: Number,
    default: 0,
    min: 0
  },
  OUTSTANDING_PRINCIPAL: {
    type: Number,
    default: 0,
    min: 0
  },
  TOTAL_INTEREST_ACCRUED: {
    type: Number,
    default: 0,
    min: 0
  },
  TOTAL_INTEREST_RECEIVED: {
    type: Number,
    default: 0,
    min: 0
  },
  TOTAL_FEES_RECEIVED: {
    type: Number,
    default: 0,
    min: 0
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
    type: Number,
    default: 0,
    min: 0
  },
  TOTAL_RECOVERED: {
    type: Number,
    default: 0,
    min: 0
  },
  TOTAL_DEFAULTS: {
    type: Number,
    default: 0,
    min: 0
  },
  
  // Portfolio Health
  PORTFOLIO_AT_RISK: {
    type: Number,
    default: 0,
    min: 0
  },
  PROVISION_AMOUNT: {
    type: Number,
    default: 0,
    min: 0
  },
  NPL_RATIO: { // Non-Performing Loan Ratio
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
    type: Number,
    default: 0,
    min: 0
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
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for efficient querying
loanPortfolioSchema.index({ BRANCH_ID: 1, PROD_ID: 1, YEAR: 1, MONTH: 1 });

// Virtual for formatted period
loanPortfolioSchema.virtual('PERIOD').get(function() {
  return `${this.YEAR}-${this.MONTH.toString().padStart(2, '0')}`;
});

// Virtual for collection efficiency
loanPortfolioSchema.virtual('COLLECTION_EFFICIENCY').get(function() {
  if (this.TOTAL_REPAYMENTS === 0) return 0;
  return (this.TOTAL_RECOVERED / this.TOTAL_REPAYMENTS) * 100;
});

// Virtual for default rate
loanPortfolioSchema.virtual('DEFAULT_RATE').get(function() {
  if (this.NUMBER_OF_LOANS === 0) return 0;
  return (this.TOTAL_DEFAULTS / this.NUMBER_OF_LOANS) * 100;
});

// Pre-save middleware to update ratios
loanPortfolioSchema.pre('save', function(next) {
  this.UPDATED_DATE = new Date();
  
  // Update NPL ratio
  if (this.OUTSTANDING_PRINCIPAL > 0) {
    this.NPL_RATIO = (this.PORTFOLIO_AT_RISK / this.OUTSTANDING_PRINCIPAL) * 100;
  }
  
  // Update average loan size
  if (this.NUMBER_OF_LOANS > 0) {
    this.AVERAGE_LOAN_SIZE = this.TOTAL_PRINCIPAL / this.NUMBER_OF_LOANS;
  }
  
  next();
});

const LoanPortfolio = mongoose.model('LoanPortfolio', loanPortfolioSchema);

export default LoanPortfolio;




 