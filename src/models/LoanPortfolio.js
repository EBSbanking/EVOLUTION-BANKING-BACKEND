// models/LoanPortfolio.js – Updated with proper interest accrual handling
import { DataTypes, Op, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanPortfolio extends Model {
  // ==================== STATIC METHODS ====================
  
  /**
   * Update portfolio when a repayment is made
   */
  static async updateForRepayment(loanAccount, amount, interestAmount = 0, transaction = null) {
    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const productId = loanAccount.PROD_ID || loanAccount.loan_product_id || 1;
      const productCode = loanAccount.PRODUCT_CODE || 'DEFAULT';
      const productName = loanAccount.PRODUCT_NAME || 'General Loan';
      const productType = loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN';
      const branchId = loanAccount.BU_ID || loanAccount.branch_id || '001';

      let portfolio = await LoanPortfolio.findOne({
        where: { BRANCH_ID: branchId, PROD_ID: productId, YEAR: year, MONTH: month },
        transaction
      });

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

      const currentRecovered = parseFloat(portfolio.TOTAL_RECOVERED) || 0;
      const currentOutstanding = parseFloat(portfolio.OUTSTANDING_PRINCIPAL) || 0;
      const currentInterestReceived = parseFloat(portfolio.TOTAL_INTEREST_RECEIVED) || 0;

      await portfolio.update({
        TOTAL_REPAYMENTS: (parseFloat(portfolio.TOTAL_REPAYMENTS) || 0) + 1,
        TOTAL_RECOVERED: currentRecovered + parseFloat(amount),
        TOTAL_INTEREST_RECEIVED: currentInterestReceived + parseFloat(interestAmount),
        OUTSTANDING_PRINCIPAL: Math.max(0, currentOutstanding - parseFloat(amount)),
        UPDATED_BY: 'system',
        UPDATED_DATE: new Date()
      }, { transaction });

      return portfolio;
    } catch (error) {
      console.error('Error in updateForRepayment:', error);
      throw error;
    }
  }

  /**
   * Update portfolio when a loan is disbursed
   */
  static async updateForDisbursement(loanAccount, amount, totalInterest = 0, transaction = null) {
    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const productId = loanAccount.PROD_ID || loanAccount.loan_product_id || 1;
      const productCode = loanAccount.PRODUCT_CODE || 'DEFAULT';
      const productName = loanAccount.PRODUCT_NAME || 'General Loan';
      const productType = loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN';
      const branchId = loanAccount.BU_ID || loanAccount.branch_id || '001';

      let portfolio = await LoanPortfolio.findOne({
        where: { BRANCH_ID: branchId, PROD_ID: productId, YEAR: year, MONTH: month },
        transaction
      });

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

      const currentDisbursed = parseFloat(portfolio.TOTAL_DISBURSED) || 0;
      const currentPrincipal = parseFloat(portfolio.TOTAL_PRINCIPAL) || 0;
      const currentOutstanding = parseFloat(portfolio.OUTSTANDING_PRINCIPAL) || 0;
      const currentInterestAccrued = parseFloat(portfolio.TOTAL_INTEREST_ACCRUED) || 0;

      await portfolio.update({
        TOTAL_DISBURSED: currentDisbursed + parseFloat(amount),
        TOTAL_PRINCIPAL: currentPrincipal + parseFloat(amount),
        OUTSTANDING_PRINCIPAL: currentOutstanding + parseFloat(amount),
        TOTAL_INTEREST_ACCRUED: currentInterestAccrued + parseFloat(totalInterest),
        NUMBER_OF_LOANS: (portfolio.NUMBER_OF_LOANS || 0) + 1,
        ACTIVE_LOANS: (portfolio.ACTIVE_LOANS || 0) + 1,
        DISBURSEMENT_COUNT: (portfolio.DISBURSEMENT_COUNT || 0) + 1,
        UPDATED_BY: 'system',
        UPDATED_DATE: new Date()
      }, { transaction });

      return portfolio;
    } catch (error) {
      console.error('Error in updateForDisbursement:', error);
      throw error;
    }
  }

  /**
   * Update interest accrued from repayment schedules
   */
  static async updateInterestAccrued(loanAccount, totalInterest, transaction = null) {
    try {
      const currentDate = new Date();
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();

      const productId = loanAccount.PROD_ID || loanAccount.loan_product_id || 1;
      const branchId = loanAccount.BU_ID || loanAccount.branch_id || '001';

      const portfolio = await LoanPortfolio.findOne({
        where: { BRANCH_ID: branchId, PROD_ID: productId, YEAR: year, MONTH: month },
        transaction
      });

      if (!portfolio) {
        // Create if doesn't exist
        return await LoanPortfolio.create({
          BRANCH_ID: branchId,
          PROD_ID: productId,
          PRODUCT_CODE: loanAccount.PRODUCT_CODE || 'DEFAULT',
          PRODUCT_NAME: loanAccount.PRODUCT_NAME || 'General Loan',
          PRODUCT_TYPE: loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN',
          MONTH: month,
          YEAR: year,
          CURRENCY: 'NGN',
          TOTAL_INTEREST_ACCRUED: parseFloat(totalInterest),
          CREATED_BY: 'system',
          UPDATED_BY: 'system'
        }, { transaction });
      }

      const currentAccrued = parseFloat(portfolio.TOTAL_INTEREST_ACCRUED) || 0;
      await portfolio.update({
        TOTAL_INTEREST_ACCRUED: currentAccrued + parseFloat(totalInterest),
        UPDATED_BY: 'system',
        UPDATED_DATE: new Date()
      }, { transaction });

      return portfolio;
    } catch (error) {
      console.error('Error in updateInterestAccrued:', error);
      throw error;
    }
  }

  /**
   * Get portfolio summary with interest metrics
   */
  static async getPortfolioSummary(branchId = null, year = null, month = null) {
    try {
      const where = {};
      if (branchId) where.BRANCH_ID = branchId;
      if (year) where.YEAR = year;
      if (month) where.MONTH = month;

      const portfolios = await LoanPortfolio.findAll({
        where,
        attributes: [
          'PRODUCT_TYPE',
          'PRODUCT_NAME',
          [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'total_disbursed'],
          [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'outstanding_principal'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_ACCRUED')), 'total_interest_accrued'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_RECEIVED')), 'total_interest_received'],
          [sequelize.fn('SUM', sequelize.col('NUMBER_OF_LOANS')), 'total_loans'],
          [sequelize.fn('SUM', sequelize.col('ACTIVE_LOANS')), 'active_loans'],
          [sequelize.fn('AVG', sequelize.col('NPL_RATIO')), 'avg_npl_ratio']
        ],
        group: ['PRODUCT_TYPE', 'PRODUCT_NAME'],
        order: [[sequelize.col('total_disbursed'), 'DESC']]
      });

      // Calculate derived metrics
      return portfolios.map(p => {
        const data = p.toJSON();
        const interestAccrued = parseFloat(data.total_interest_accrued) || 0;
        const interestReceived = parseFloat(data.total_interest_received) || 0;
        data.interest_collection_rate = interestAccrued > 0 
          ? (interestReceived / interestAccrued) * 100 
          : 0;
        return data;
      });
    } catch (error) {
      console.error('Error in getPortfolioSummary:', error);
      throw error;
    }
  }

  /**
   * Calculate performance metrics with interest analysis
   */
  static async calculatePerformanceMetrics(branchId, startDate, endDate) {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);

      const portfolios = await LoanPortfolio.findAll({
        where: {
          BRANCH_ID: branchId,
          CREATED_DATE: { [Op.between]: [start, end] }
        },
        attributes: [
          'YEAR',
          'MONTH',
          [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'total_disbursed'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_RECOVERED')), 'total_recovered'],
          [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'outstanding_principal'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_ACCRUED')), 'total_interest_accrued'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_RECEIVED')), 'total_interest_received'],
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
  }

  // ==================== INSTANCE GETTERS ====================
  
  get PERIOD() {
    return `${this.YEAR}-${this.MONTH.toString().padStart(2, '0')}`;
  }

  get COLLECTION_EFFICIENCY() {
    const recovered = parseFloat(this.TOTAL_RECOVERED) || 0;
    const repayments = parseFloat(this.TOTAL_REPAYMENTS) || 0;
    if (repayments === 0) return 0;
    return (recovered / repayments) * 100;
  }

  get DEFAULT_RATE() {
    const defaults = parseFloat(this.TOTAL_DEFAULTS) || 0;
    const numLoans = this.NUMBER_OF_LOANS || 0;
    if (numLoans === 0) return 0;
    return (defaults / numLoans) * 100;
  }

  get PORTFOLIO_YIELD() {
    const interest = parseFloat(this.TOTAL_INTEREST_RECEIVED) || 0;
    const principal = parseFloat(this.OUTSTANDING_PRINCIPAL) || 0;
    if (principal === 0) return 0;
    return (interest / principal) * 100;
  }

  get INTEREST_COLLECTION_RATE() {
    const accrued = parseFloat(this.TOTAL_INTEREST_ACCRUED) || 0;
    const received = parseFloat(this.TOTAL_INTEREST_RECEIVED) || 0;
    if (accrued === 0) return 0;
    return (received / accrued) * 100;
  }

  get PROVISION_COVERAGE() {
    const provision = parseFloat(this.PROVISION_AMOUNT) || 0;
    const atRisk = parseFloat(this.PORTFOLIO_AT_RISK) || 0;
    if (atRisk === 0) return 0;
    return (provision / atRisk) * 100;
  }
}

// ==================== MODEL INITIALIZATION ====================
LoanPortfolio.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'id' },
    BRANCH_ID: { type: DataTypes.STRING(50), allowNull: false, field: 'BRANCH_ID' },
    PROD_ID: { type: DataTypes.INTEGER, allowNull: false, field: 'PROD_ID' },
    PRODUCT_CODE: { type: DataTypes.STRING(50), allowNull: false, field: 'PRODUCT_CODE' },
    PRODUCT_NAME: { type: DataTypes.STRING(255), allowNull: false, field: 'PRODUCT_NAME' },
    PRODUCT_TYPE: {
      type: DataTypes.ENUM(
        'BUSINESS_TERM_LOAN','INDIVIDUAL_LOAN','CONSUMER_LOAN','MORTGAGE','AUTO_LOAN','PERSONAL_LOAN',
        'EDUCATION_LOAN','CREDIT_CARD','LINE_OF_CREDIT','SME_LOAN','GENERAL_LOAN','GROUP_LOAN','MONTHLY_LOAN',
        'ASSET_LOAN','RAPID_CASH_LOAN','STAFF_LOAN','STAFF_SALARY_ADVANCE','GROUP_MONTHLY_LOAN','SOLAR_LOAN','DAILY_LOAN'
      ),
      allowNull: false,
      field: 'PRODUCT_TYPE'
    },
    MONTH: { type: DataTypes.INTEGER, allowNull: false, field: 'MONTH' },
    YEAR: { type: DataTypes.INTEGER, allowNull: false, field: 'YEAR' },
    CURRENCY: { type: DataTypes.STRING(3), defaultValue: 'NGN', field: 'CURRENCY' },
    TOTAL_DISBURSED: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_DISBURSED' },
    TOTAL_NET_DISBURSEMENT: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_NET_DISBURSEMENT' },
    TOTAL_PRINCIPAL: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_PRINCIPAL' },
    OUTSTANDING_PRINCIPAL: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'OUTSTANDING_PRINCIPAL' },
    TOTAL_INTEREST_ACCRUED: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_INTEREST_ACCRUED' },
    TOTAL_INTEREST_RECEIVED: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_INTEREST_RECEIVED' },
    TOTAL_FEES_RECEIVED: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_FEES_RECEIVED' },
    NUMBER_OF_LOANS: { type: DataTypes.INTEGER, defaultValue: 0, field: 'NUMBER_OF_LOANS' },
    ACTIVE_LOANS: { type: DataTypes.INTEGER, defaultValue: 0, field: 'ACTIVE_LOANS' },
    DISBURSEMENT_COUNT: { type: DataTypes.INTEGER, defaultValue: 0, field: 'DISBURSEMENT_COUNT' },
    TOTAL_REPAYMENTS: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_REPAYMENTS' },
    TOTAL_RECOVERED: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_RECOVERED' },
    TOTAL_DEFAULTS: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'TOTAL_DEFAULTS' },
    PORTFOLIO_AT_RISK: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'PORTFOLIO_AT_RISK' },
    PROVISION_AMOUNT: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'PROVISION_AMOUNT' },
    NPL_RATIO: { type: DataTypes.DECIMAL(5,2), defaultValue: 0.00, field: 'NPL_RATIO' },
    YIELD_RATE: { type: DataTypes.DECIMAL(5,2), defaultValue: 0.00, field: 'YIELD_RATE' },
    COST_OF_FUNDS: { type: DataTypes.DECIMAL(5,2), defaultValue: 0.00, field: 'COST_OF_FUNDS' },
    NET_INTEREST_MARGIN: { type: DataTypes.DECIMAL(5,2), defaultValue: 0.00, field: 'NET_INTEREST_MARGIN' },
    AVERAGE_LOAN_SIZE: { type: DataTypes.DECIMAL(15,2), defaultValue: 0.00, field: 'AVERAGE_LOAN_SIZE' },
    STATUS: { type: DataTypes.ENUM('ACTIVE','CLOSED','ARCHIVED'), defaultValue: 'ACTIVE', field: 'STATUS' },
    CREATED_BY: { type: DataTypes.STRING(100), field: 'CREATED_BY' },
    UPDATED_BY: { type: DataTypes.STRING(100), field: 'UPDATED_BY' }
  },
  {
    sequelize,
    modelName: 'LoanPortfolio',
    tableName: 'loan_portfolio',
    timestamps: true,
    createdAt: 'CREATED_DATE',
    updatedAt: 'UPDATED_DATE',
    underscored: false,
    hooks: {
      beforeSave: async (loanPortfolio) => {
        // Calculate NPL Ratio
        const outstanding = parseFloat(loanPortfolio.OUTSTANDING_PRINCIPAL) || 0;
        const atRisk = parseFloat(loanPortfolio.PORTFOLIO_AT_RISK) || 0;
        loanPortfolio.NPL_RATIO = outstanding ? (atRisk / outstanding) * 100 : 0;

        // Calculate Average Loan Size
        const numLoans = loanPortfolio.NUMBER_OF_LOANS || 0;
        const totalPrincipal = parseFloat(loanPortfolio.TOTAL_PRINCIPAL) || 0;
        loanPortfolio.AVERAGE_LOAN_SIZE = numLoans ? totalPrincipal / numLoans : 0;

        // Calculate Yield Rate (annualized)
        const interestReceived = parseFloat(loanPortfolio.TOTAL_INTEREST_RECEIVED) || 0;
        const principal = parseFloat(loanPortfolio.OUTSTANDING_PRINCIPAL) || 0;
        loanPortfolio.YIELD_RATE = principal ? (interestReceived / principal) * 100 : 0;

        // Calculate Net Interest Margin
        const interestAccrued = parseFloat(loanPortfolio.TOTAL_INTEREST_ACCRUED) || 0;
        loanPortfolio.NET_INTEREST_MARGIN = principal ? (interestAccrued / principal) * 100 : 0;

        // Calculate Provision Amount (10% of portfolio at risk)
        loanPortfolio.PROVISION_AMOUNT = atRisk * 0.1;
      }
    }
  }
);

export default LoanPortfolio;
