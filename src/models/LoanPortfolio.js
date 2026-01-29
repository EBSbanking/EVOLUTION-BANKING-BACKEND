// models/LoanPortfolio.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanPortfolio = sequelize.define('LoanPortfolio', {
  // Identification
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  BRANCH_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    index: true
  },
  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    index: true
  },
  PRODUCT_CODE: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  PRODUCT_NAME: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  PRODUCT_TYPE: {
    type: DataTypes.ENUM(
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
    ),
    allowNull: false
  },
  
  // Time period
  MONTH: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 12
    }
  },
  YEAR: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  CURRENCY: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN'
  },
  
  // Portfolio Summary - Using DECIMAL for monetary values
  TOTAL_DISBURSED: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_NET_DISBURSEMENT: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_PRINCIPAL: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  OUTSTANDING_PRINCIPAL: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_INTEREST_ACCRUED: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_INTEREST_RECEIVED: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_FEES_RECEIVED: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  
  // Loan Counts
  NUMBER_OF_LOANS: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  ACTIVE_LOANS: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  DISBURSEMENT_COUNT: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  
  // Performance Metrics
  TOTAL_REPAYMENTS: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_RECOVERED: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  TOTAL_DEFAULTS: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  
  // Portfolio Health
  PORTFOLIO_AT_RISK: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  PROVISION_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  NPL_RATIO: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00,
    validate: {
      min: 0,
      max: 100
    }
  },
  
  // Financial Ratios
  YIELD_RATE: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  COST_OF_FUNDS: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  NET_INTEREST_MARGIN: {
    type: DataTypes.DECIMAL(5, 2),
    defaultValue: 0.00
  },
  AVERAGE_LOAN_SIZE: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  
  // Status and Metadata
  STATUS: {
    type: DataTypes.ENUM('ACTIVE', 'CLOSED', 'ARCHIVED'),
    defaultValue: 'ACTIVE'
  },
  CREATED_BY: {
    type: DataTypes.STRING(100)
  },
  UPDATED_BY: {
    type: DataTypes.STRING(100)
  }
}, {
  tableName: 'loan_portfolio',
  timestamps: true,
  createdAt: 'CREATED_DATE',
  updatedAt: 'UPDATED_DATE',
  indexes: [
    {
      name: 'idx_branch_prod_year_month',
      fields: ['BRANCH_ID', 'PROD_ID', 'YEAR', 'MONTH']
    },
    {
      name: 'idx_year_month_product_type',
      fields: ['YEAR', 'MONTH', 'PRODUCT_TYPE']
    },
    {
      name: 'idx_branch_id',
      fields: ['BRANCH_ID']
    },
    {
      name: 'idx_prod_id',
      fields: ['PROD_ID']
    },
    {
      name: 'idx_status',
      fields: ['STATUS']
    }
  ],
  hooks: {
    beforeSave: async (loanPortfolio, options) => {
      // Calculate NPL ratio
      const outstanding = parseFloat(loanPortfolio.OUTSTANDING_PRINCIPAL) || 0;
      const atRisk = parseFloat(loanPortfolio.PORTFOLIO_AT_RISK) || 0;
      if (outstanding > 0) {
        loanPortfolio.NPL_RATIO = (atRisk / outstanding) * 100;
      } else {
        loanPortfolio.NPL_RATIO = 0;
      }
      
      // Calculate average loan size
      const numLoans = loanPortfolio.NUMBER_OF_LOANS || 0;
      const totalPrincipal = parseFloat(loanPortfolio.TOTAL_PRINCIPAL) || 0;
      if (numLoans > 0) {
        loanPortfolio.AVERAGE_LOAN_SIZE = totalPrincipal / numLoans;
      } else {
        loanPortfolio.AVERAGE_LOAN_SIZE = 0;
      }
      
      // Calculate yield rate
      const interestReceived = parseFloat(loanPortfolio.TOTAL_INTEREST_RECEIVED) || 0;
      if (outstanding > 0) {
        loanPortfolio.YIELD_RATE = (interestReceived / outstanding) * 100;
      } else {
        loanPortfolio.YIELD_RATE = 0;
      }
    }
  }
});

// Define virtual properties using getters
Object.defineProperties(LoanPortfolio.prototype, {
  PERIOD: {
    get() {
      return `${this.YEAR}-${this.MONTH.toString().padStart(2, '0')}`;
    },
    enumerable: true,
    configurable: true
  },
  
  COLLECTION_EFFICIENCY: {
    get() {
      const recovered = parseFloat(this.TOTAL_RECOVERED) || 0;
      const repayments = parseFloat(this.TOTAL_REPAYMENTS) || 0;
      if (repayments === 0) return 0;
      return (recovered / repayments) * 100;
    },
    enumerable: true,
    configurable: true
  },
  
  DEFAULT_RATE: {
    get() {
      const defaults = parseFloat(this.TOTAL_DEFAULTS) || 0;
      const numLoans = this.NUMBER_OF_LOANS || 0;
      if (numLoans === 0) return 0;
      return (defaults / numLoans) * 100;
    },
    enumerable: true,
    configurable: true
  },
  
  PORTFOLIO_YIELD: {
    get() {
      const interest = parseFloat(this.TOTAL_INTEREST_RECEIVED) || 0;
      const principal = parseFloat(this.OUTSTANDING_PRINCIPAL) || 0;
      if (principal === 0) return 0;
      return (interest / principal) * 100;
    },
    enumerable: true,
    configurable: true
  }
});

// Class method to update portfolio for a repayment
LoanPortfolio.updateForRepayment = async function(loanAccount, amount, transaction = null) {
  try {
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    
    const productId = loanAccount.PROD_ID || 1;
    const productCode = loanAccount.PRODUCT_CODE || 'DEFAULT';
    const productName = loanAccount.PRODUCT_NAME || 'General Loan';
    const productType = loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN';
    const branchId = loanAccount.BRANCH_ID || '001';
    
    // Check if portfolio exists for this month
    let portfolio = await LoanPortfolio.findOne({
      where: {
        BRANCH_ID: branchId,
        PROD_ID: productId,
        YEAR: year,
        MONTH: month
      },
      transaction
    });
    
    // If portfolio doesn't exist, create it
    if (!portfolio) {
      portfolio = await LoanPortfolio.create({
        BRANCH_ID: branchId,
        PROD_ID: productId,
        PRODUCT_CODE: productCode,
        PRODUCT_NAME: productName,
        PRODUCT_TYPE: productType,
        MONTH: month,
        YEAR: year,
        CURRENCY: 'NGN',
        CREATED_BY: 'system',
        UPDATED_BY: 'system'
      }, { transaction });
    }
    
    // Update portfolio with repayment
    await portfolio.update({
      TOTAL_REPAYMENTS: (parseFloat(portfolio.TOTAL_REPAYMENTS) || 0) + 1,
      TOTAL_RECOVERED: (parseFloat(portfolio.TOTAL_RECOVERED) || 0) + parseFloat(amount),
      OUTSTANDING_PRINCIPAL: (parseFloat(portfolio.OUTSTANDING_PRINCIPAL) || 0) - parseFloat(amount),
      UPDATED_BY: 'system'
    }, { transaction });
    
    return portfolio;
    
  } catch (error) {
    console.error('Error in updateForRepayment:', error);
    throw error;
  }
};

// Class method to update portfolio for a disbursement
LoanPortfolio.updateForDisbursement = async function(loanAccount, amount, transaction = null) {
  try {
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    
    const productId = loanAccount.PROD_ID || 1;
    const productCode = loanAccount.PRODUCT_CODE || 'DEFAULT';
    const productName = loanAccount.PRODUCT_NAME || 'General Loan';
    const productType = loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN';
    const branchId = loanAccount.BRANCH_ID || '001';
    
    // Check if portfolio exists for this month
    let portfolio = await LoanPortfolio.findOne({
      where: {
        BRANCH_ID: branchId,
        PROD_ID: productId,
        YEAR: year,
        MONTH: month
      },
      transaction
    });
    
    // If portfolio doesn't exist, create it
    if (!portfolio) {
      portfolio = await LoanPortfolio.create({
        BRANCH_ID: branchId,
        PROD_ID: productId,
        PRODUCT_CODE: productCode,
        PRODUCT_NAME: productName,
        PRODUCT_TYPE: productType,
        MONTH: month,
        YEAR: year,
        CURRENCY: 'NGN',
        CREATED_BY: 'system',
        UPDATED_BY: 'system'
      }, { transaction });
    }
    
    // Update portfolio with disbursement
    await portfolio.update({
      TOTAL_DISBURSED: (parseFloat(portfolio.TOTAL_DISBURSED) || 0) + parseFloat(amount),
      TOTAL_PRINCIPAL: (parseFloat(portfolio.TOTAL_PRINCIPAL) || 0) + parseFloat(amount),
      OUTSTANDING_PRINCIPAL: (parseFloat(portfolio.OUTSTANDING_PRINCIPAL) || 0) + parseFloat(amount),
      NUMBER_OF_LOANS: (portfolio.NUMBER_OF_LOANS || 0) + 1,
      ACTIVE_LOANS: (portfolio.ACTIVE_LOANS || 0) + 1,
      DISBURSEMENT_COUNT: (portfolio.DISBURSEMENT_COUNT || 0) + 1,
      UPDATED_BY: 'system'
    }, { transaction });
    
    return portfolio;
    
  } catch (error) {
    console.error('Error in updateForDisbursement:', error);
    throw error;
  }
};

// Class method to get portfolio summary
LoanPortfolio.getPortfolioSummary = async function(branchId = null, year = null, month = null) {
  try {
    const where = {};
    
    if (branchId) {
      where.BRANCH_ID = branchId;
    }
    
    if (year) {
      where.YEAR = year;
    }
    
    if (month) {
      where.MONTH = month;
    }
    
    const portfolios = await LoanPortfolio.findAll({
      where,
      attributes: [
        'PRODUCT_TYPE',
        'PRODUCT_NAME',
        [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'total_disbursed'],
        [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'outstanding_principal'],
        [sequelize.fn('SUM', sequelize.col('NUMBER_OF_LOANS')), 'total_loans'],
        [sequelize.fn('SUM', sequelize.col('ACTIVE_LOANS')), 'active_loans'],
        [sequelize.fn('AVG', sequelize.col('NPL_RATIO')), 'avg_npl_ratio'],
        [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_RECEIVED')), 'total_interest_received']
      ],
      group: ['PRODUCT_TYPE', 'PRODUCT_NAME'],
      order: [['total_disbursed', 'DESC']]
    });
    
    return portfolios;
    
  } catch (error) {
    console.error('Error in getPortfolioSummary:', error);
    throw error;
  }
};

// Class method to calculate performance metrics
LoanPortfolio.calculatePerformanceMetrics = async function(branchId, startDate, endDate) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    const portfolios = await LoanPortfolio.findAll({
      where: {
        BRANCH_ID: branchId,
        CREATED_DATE: {
          [Op.between]: [start, end]
        }
      },
      attributes: [
        'YEAR',
        'MONTH',
        [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'total_disbursed'],
        [sequelize.fn('SUM', sequelize.col('TOTAL_RECOVERED')), 'total_recovered'],
        [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'outstanding_principal'],
        [sequelize.fn('AVG', sequelize.col('NPL_RATIO')), 'npl_ratio']
      ],
      group: ['YEAR', 'MONTH'],
      order: [['YEAR', 'DESC'], ['MONTH', 'DESC']]
    });
    
    return portfolios;
    
  } catch (error) {
    console.error('Error in calculatePerformanceMetrics:', error);
    throw error;
  }
};

export default LoanPortfolio;
