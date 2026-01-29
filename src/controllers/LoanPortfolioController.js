// src/controllers/LoanPortfolioController.js
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanAccount from '../models/LoanAccount.js';
import CreditApplication from '../models/CreditApplication.js';
import LoanProduct from '../models/LoanProduct.js'; // Assuming you have a Product model
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanRepayment from '../models/LoanRepayment.js';

const LoanPortfolioController = {
  // =========================
  // CREATE & UPDATE METHODS
  // =========================

  /**
   * Create a new portfolio record
   */
  createPortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        BRANCH_ID,
        PROD_ID,
        MONTH,
        YEAR,
        CURRENCY = 'NGN',
        CREATED_BY = req.user?.id || 'SYSTEM'
      } = req.body;

      // Validate required fields
      if (!BRANCH_ID || !PROD_ID || !MONTH || !YEAR) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'BRANCH_ID, PROD_ID, MONTH, and YEAR are required'
        });
      }

      // Check if record already exists for this period
      const existingRecord = await LoanPortfolio.findOne({
        where: { BRANCH_ID, PROD_ID, YEAR, MONTH },
        transaction
      });

      if (existingRecord) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Portfolio record already exists for ${YEAR}-${MONTH}`
        });
      }

      // Get product details
      const loanProduct = await LoanProduct.findByPk(PROD_ID, { transaction });
      if (!loanProduct) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Product not found with ID: ${PROD_ID}`
        });
      }

      // Build portfolio data
      const portfolioData = {
        BRANCH_ID,
        PROD_ID,
        PRODUCT_CODE: loanProduct.productCode || loanProduct.PROD_ID?.toString(),
        PRODUCT_NAME: loanProduct.name || loanProduct.PRODUCT_NAME,
        PRODUCT_TYPE: loanProduct.PRODUCT_TYPE || loanProduct.productType,
        MONTH: parseInt(MONTH),
        YEAR: parseInt(YEAR),
        CURRENCY,
        CREATED_BY,
        UPDATED_BY: CREATED_BY,
        STATUS: 'ACTIVE'
      };

      // Calculate portfolio metrics
      await calculatePortfolioMetrics(portfolioData, transaction);

      // Create portfolio record
      const portfolioRecord = await LoanPortfolio.create(portfolioData, { transaction });

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: 'Portfolio record created successfully',
        data: portfolioRecord.toJSON()
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error creating portfolio record:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to create portfolio record',
        code: error.code || 'PORTFOLIO_CREATION_ERROR'
      });
    }
  },

  /**
   * Update portfolio record
   */
  updatePortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const updateData = req.body;
      const UPDATED_BY = req.user?.id || 'SYSTEM';

      // Find the portfolio record
      const portfolioRecord = await LoanPortfolio.findByPk(id, { transaction });
      if (!portfolioRecord) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Portfolio record not found'
        });
      }

      // Don't allow updates to BRANCH_ID, PROD_ID, YEAR, MONTH
      delete updateData.BRANCH_ID;
      delete updateData.PROD_ID;
      delete updateData.YEAR;
      delete updateData.MONTH;

      // Update the record
      Object.assign(portfolioRecord, {
        ...updateData,
        UPDATED_BY,
        UPDATED_DATE: new Date()
      });

      // Recalculate metrics if financial data changed
      const financialFields = [
        'TOTAL_DISBURSED', 'TOTAL_PRINCIPAL', 'OUTSTANDING_PRINCIPAL',
        'TOTAL_INTEREST_ACCRUED', 'TOTAL_INTEREST_RECEIVED', 'TOTAL_FEES_RECEIVED',
        'NUMBER_OF_LOANS', 'ACTIVE_LOANS', 'TOTAL_REPAYMENTS', 'TOTAL_RECOVERED',
        'TOTAL_DEFAULTS', 'PORTFOLIO_AT_RISK', 'PROVISION_AMOUNT'
      ];

      const hasFinancialUpdates = financialFields.some(field => field in updateData);
      if (hasFinancialUpdates) {
        await recalculatePortfolioRatios(portfolioRecord);
      }

      await portfolioRecord.save({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Portfolio record updated successfully',
        data: portfolioRecord.toJSON()
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error updating portfolio record:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to update portfolio record',
        code: error.code || 'PORTFOLIO_UPDATE_ERROR'
      });
    }
  },

  /**
   * Recalculate portfolio metrics
   */
  recalculatePortfolio: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const UPDATED_BY = req.user?.id || 'SYSTEM';

      // Find the portfolio record
      const portfolioRecord = await LoanPortfolio.findByPk(id, { transaction });
      if (!portfolioRecord) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Portfolio record not found'
        });
      }

      // Recalculate all metrics from scratch
      await calculatePortfolioMetrics(portfolioRecord, transaction, true);

      portfolioRecord.UPDATED_BY = UPDATED_BY;
      await portfolioRecord.save({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Portfolio metrics recalculated successfully',
        data: portfolioRecord.toJSON()
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error recalculating portfolio:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to recalculate portfolio',
        code: error.code || 'PORTFOLIO_RECALCULATION_ERROR'
      });
    }
  },

  // =========================
  // READ & QUERY METHODS
  // =========================

  /**
   * Get portfolio record by ID
   */
  getPortfolioById: async (req, res) => {
    try {
      const { id } = req.params;

      const portfolioRecord = await LoanPortfolio.findByPk(id, {
        include: [{
          model: LoanProduct,
          as: 'product',
          attributes: ['name', 'productCode', 'description']
        }]
      });

      if (!portfolioRecord) {
        return res.status(404).json({
          success: false,
          message: 'Portfolio record not found'
        });
      }

      const portfolioData = portfolioRecord.toJSON();
      
      // Calculate virtual fields
      portfolioData.PERIOD = `${portfolioData.YEAR}-${portfolioData.MONTH.toString().padStart(2, '0')}`;
      portfolioData.COLLECTION_EFFICIENCY = portfolioData.TOTAL_REPAYMENTS > 0 
        ? (portfolioData.TOTAL_RECOVERED / portfolioData.TOTAL_REPAYMENTS) * 100 
        : 0;
      portfolioData.DEFAULT_RATE = portfolioData.NUMBER_OF_LOANS > 0 
        ? (portfolioData.TOTAL_DEFAULTS / portfolioData.NUMBER_OF_LOANS) * 100 
        : 0;

      res.json({
        success: true,
        data: portfolioData
      });
    } catch (error) {
      console.error('Error fetching portfolio record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch portfolio record',
        error: error.message
      });
    }
  },

  /**
   * Get portfolio by period and branch/product
   */
  getPortfolioByPeriod: async (req, res) => {
    try {
      const { BRANCH_ID, PROD_ID, YEAR, MONTH } = req.query;

      if (!YEAR || !MONTH) {
        return res.status(400).json({
          success: false,
          message: 'YEAR and MONTH are required'
        });
      }

      const where = { YEAR: parseInt(YEAR), MONTH: parseInt(MONTH) };
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) where.PROD_ID = PROD_ID;

      const portfolioRecords = await LoanPortfolio.findAll({
        where,
        include: [{
          model: LoanProduct,
          as: 'product',
          attributes: ['name', 'productCode']
        }],
        order: [['BRANCH_ID', 'ASC'], ['PRODUCT_CODE', 'ASC']]
      });

      // Calculate virtual fields for each record
      const enhancedRecords = portfolioRecords.map(record => {
        const recordData = record.toJSON();
        return {
          ...recordData,
          PERIOD: `${recordData.YEAR}-${recordData.MONTH.toString().padStart(2, '0')}`,
          COLLECTION_EFFICIENCY: recordData.TOTAL_REPAYMENTS > 0 
            ? (recordData.TOTAL_RECOVERED / recordData.TOTAL_REPAYMENTS) * 100 
            : 0,
          DEFAULT_RATE: recordData.NUMBER_OF_LOANS > 0 
            ? (recordData.TOTAL_DEFAULTS / recordData.NUMBER_OF_LOANS) * 100 
            : 0
        };
      });

      res.json({
        success: true,
        data: enhancedRecords,
        count: enhancedRecords.length
      });
    } catch (error) {
      console.error('Error fetching portfolio by period:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch portfolio records',
        error: error.message
      });
    }
  },

  /**
   * Get portfolio summary by branch
   */
  getPortfolioByBranch: async (req, res) => {
    try {
      const { BRANCH_ID, YEAR, MONTH } = req.query;

      if (!BRANCH_ID) {
        return res.status(400).json({
          success: false,
          message: 'BRANCH_ID is required'
        });
      }

      const where = { BRANCH_ID };
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);

      const portfolioRecords = await LoanPortfolio.findAll({
        where,
        include: [{
          model: LoanProduct,
          as: 'product',
          attributes: ['name', 'productCode', 'PRODUCT_TYPE']
        }],
        order: [['YEAR', 'DESC'], ['MONTH', 'DESC'], ['PRODUCT_TYPE', 'ASC']]
      });

      // Group by period and calculate totals
      const groupedData = {};
      portfolioRecords.forEach(record => {
        const recordData = record.toJSON();
        const periodKey = `${recordData.YEAR}-${recordData.MONTH.toString().padStart(2, '0')}`;
        
        if (!groupedData[periodKey]) {
          groupedData[periodKey] = {
            PERIOD: periodKey,
            BRANCH_ID: recordData.BRANCH_ID,
            TOTAL_DISBURSED: 0,
            OUTSTANDING_PRINCIPAL: 0,
            TOTAL_INTEREST_RECEIVED: 0,
            NUMBER_OF_LOANS: 0,
            ACTIVE_LOANS: 0,
            PORTFOLIO_AT_RISK: 0,
            products: []
          };
        }

        groupedData[periodKey].TOTAL_DISBURSED += recordData.TOTAL_DISBURSED || 0;
        groupedData[periodKey].OUTSTANDING_PRINCIPAL += recordData.OUTSTANDING_PRINCIPAL || 0;
        groupedData[periodKey].TOTAL_INTEREST_RECEIVED += recordData.TOTAL_INTEREST_RECEIVED || 0;
        groupedData[periodKey].NUMBER_OF_LOANS += recordData.NUMBER_OF_LOANS || 0;
        groupedData[periodKey].ACTIVE_LOANS += recordData.ACTIVE_LOANS || 0;
        groupedData[periodKey].PORTFOLIO_AT_RISK += recordData.PORTFOLIO_AT_RISK || 0;

        groupedData[periodKey].products.push({
          PRODUCT_ID: recordData.PROD_ID,
          PRODUCT_CODE: recordData.PRODUCT_CODE,
          PRODUCT_NAME: recordData.PRODUCT_NAME,
          PRODUCT_TYPE: recordData.PRODUCT_TYPE,
          TOTAL_DISBURSED: recordData.TOTAL_DISBURSED,
          OUTSTANDING_PRINCIPAL: recordData.OUTSTANDING_PRINCIPAL,
          NUMBER_OF_LOANS: recordData.NUMBER_OF_LOANS,
          NPL_RATIO: recordData.NPL_RATIO,
          YIELD_RATE: recordData.YIELD_RATE
        });
      });

      const result = Object.values(groupedData).sort((a, b) => b.PERIOD.localeCompare(a.PERIOD));

      res.json({
        success: true,
        data: result,
        count: result.length
      });
    } catch (error) {
      console.error('Error fetching portfolio by branch:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch branch portfolio',
        error: error.message
      });
    }
  },

  /**
   * Get portfolio by product type
   */
  getPortfolioByProductType: async (req, res) => {
    try {
      const { PRODUCT_TYPE, YEAR, MONTH } = req.query;

      if (!PRODUCT_TYPE) {
        return res.status(400).json({
          success: false,
          message: 'PRODUCT_TYPE is required'
        });
      }

      const where = { PRODUCT_TYPE };
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);

      const portfolioRecords = await LoanPortfolio.findAll({
        where,
        include: [{
          model: LoanProduct,
          as: 'product',
          attributes: ['name', 'productCode']
        }],
        order: [['YEAR', 'DESC'], ['MONTH', 'DESC'], ['BRANCH_ID', 'ASC']]
      });

      // Calculate totals by period
      const summaryByPeriod = {};
      portfolioRecords.forEach(record => {
        const recordData = record.toJSON();
        const periodKey = `${recordData.YEAR}-${recordData.MONTH.toString().padStart(2, '0')}`;
        
        if (!summaryByPeriod[periodKey]) {
          summaryByPeriod[periodKey] = {
            PERIOD: periodKey,
            PRODUCT_TYPE: recordData.PRODUCT_TYPE,
            TOTAL_DISBURSED: 0,
            OUTSTANDING_PRINCIPAL: 0,
            TOTAL_INTEREST_RECEIVED: 0,
            NUMBER_OF_LOANS: 0,
            ACTIVE_LOANS: 0,
            branches: []
          };
        }

        summaryByPeriod[periodKey].TOTAL_DISBURSED += recordData.TOTAL_DISBURSED || 0;
        summaryByPeriod[periodKey].OUTSTANDING_PRINCIPAL += recordData.OUTSTANDING_PRINCIPAL || 0;
        summaryByPeriod[periodKey].TOTAL_INTEREST_RECEIVED += recordData.TOTAL_INTEREST_RECEIVED || 0;
        summaryByPeriod[periodKey].NUMBER_OF_LOANS += recordData.NUMBER_OF_LOANS || 0;
        summaryByPeriod[periodKey].ACTIVE_LOANS += recordData.ACTIVE_LOANS || 0;

        // Add branch details
        const existingBranch = summaryByPeriod[periodKey].branches.find(
          b => b.BRANCH_ID === recordData.BRANCH_ID
        );
        
        if (existingBranch) {
          existingBranch.TOTAL_DISBURSED += recordData.TOTAL_DISBURSED || 0;
          existingBranch.OUTSTANDING_PRINCIPAL += recordData.OUTSTANDING_PRINCIPAL || 0;
        } else {
          summaryByPeriod[periodKey].branches.push({
            BRANCH_ID: recordData.BRANCH_ID,
            TOTAL_DISBURSED: recordData.TOTAL_DISBURSED || 0,
            OUTSTANDING_PRINCIPAL: recordData.OUTSTANDING_PRINCIPAL || 0,
            NUMBER_OF_LOANS: recordData.NUMBER_OF_LOANS || 0
          });
        }
      });

      const result = Object.values(summaryByPeriod).sort((a, b) => b.PERIOD.localeCompare(a.PERIOD));

      res.json({
        success: true,
        data: result,
        count: result.length
      });
    } catch (error) {
      console.error('Error fetching portfolio by product type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch product type portfolio',
        error: error.message
      });
    }
  },

  /**
   * Search portfolio records with filters
   */
  searchPortfolio: async (req, res) => {
    try {
      const {
        BRANCH_ID,
        PROD_ID,
        PRODUCT_TYPE,
        YEAR,
        MONTH,
        STATUS,
        startDate,
        endDate,
        page = 1,
        limit = 20
      } = req.query;

      const where = {};

      // Build where clause
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) where.PROD_ID = PROD_ID;
      if (PRODUCT_TYPE) where.PRODUCT_TYPE = PRODUCT_TYPE;
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);
      if (STATUS) where.STATUS = STATUS;

      // Date range filter
      if (startDate || endDate) {
        where.CREATED_DATE = {};
        if (startDate) where.CREATED_DATE[Op.gte] = new Date(startDate);
        if (endDate) where.CREATED_DATE[Op.lte] = new Date(endDate);
      }

      // Calculate pagination
      const offset = (parseInt(page) - 1) * parseInt(limit);

      // Execute query with pagination
      const { count, rows: portfolioRecords } = await LoanPortfolio.findAndCountAll({
        where,
        include: [{
          model: LoanProduct,
          as: 'product',
          attributes: ['name', 'productCode']
        }],
        order: [['YEAR', 'DESC'], ['MONTH', 'DESC'], ['BRANCH_ID', 'ASC']],
        offset,
        limit: parseInt(limit)
      });

      // Enhance records with virtual fields
      const enhancedRecords = portfolioRecords.map(record => {
        const recordData = record.toJSON();
        return {
          ...recordData,
          PERIOD: `${recordData.YEAR}-${recordData.MONTH.toString().padStart(2, '0')}`,
          COLLECTION_EFFICIENCY: recordData.TOTAL_REPAYMENTS > 0 
            ? (recordData.TOTAL_RECOVERED / recordData.TOTAL_REPAYMENTS) * 100 
            : 0,
          DEFAULT_RATE: recordData.NUMBER_OF_LOANS > 0 
            ? (recordData.TOTAL_DEFAULTS / recordData.NUMBER_OF_LOANS) * 100 
            : 0
        };
      });

      res.json({
        success: true,
        data: enhancedRecords,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('Error searching portfolio:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to search portfolio records',
        error: error.message
      });
    }
  },

  // =========================
  // AGGREGATION & ANALYTICS
  // =========================

  /**
   * Get portfolio summary statistics
   */
  getPortfolioSummary: async (req, res) => {
    try {
      const { BRANCH_ID, YEAR, MONTH } = req.query;

      const where = {};
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);

      // Aggregate total statistics using Sequelize aggregation
      const result = await LoanPortfolio.findAll({
        where,
        attributes: [
          [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'TOTAL_DISBURSED'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_PRINCIPAL')), 'TOTAL_PRINCIPAL'],
          [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'OUTSTANDING_PRINCIPAL'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_ACCRUED')), 'TOTAL_INTEREST_ACCRUED'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_RECEIVED')), 'TOTAL_INTEREST_RECEIVED'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_FEES_RECEIVED')), 'TOTAL_FEES_RECEIVED'],
          [sequelize.fn('SUM', sequelize.col('NUMBER_OF_LOANS')), 'NUMBER_OF_LOANS'],
          [sequelize.fn('SUM', sequelize.col('ACTIVE_LOANS')), 'ACTIVE_LOANS'],
          [sequelize.fn('SUM', sequelize.col('DISBURSEMENT_COUNT')), 'DISBURSEMENT_COUNT'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_REPAYMENTS')), 'TOTAL_REPAYMENTS'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_RECOVERED')), 'TOTAL_RECOVERED'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_DEFAULTS')), 'TOTAL_DEFAULTS'],
          [sequelize.fn('SUM', sequelize.col('PORTFOLIO_AT_RISK')), 'PORTFOLIO_AT_RISK'],
          [sequelize.fn('SUM', sequelize.col('PROVISION_AMOUNT')), 'PROVISION_AMOUNT'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'recordCount']
        ],
        raw: true
      });

      const summary = result[0] || {
        TOTAL_DISBURSED: 0,
        TOTAL_PRINCIPAL: 0,
        OUTSTANDING_PRINCIPAL: 0,
        TOTAL_INTEREST_ACCRUED: 0,
        TOTAL_INTEREST_RECEIVED: 0,
        TOTAL_FEES_RECEIVED: 0,
        NUMBER_OF_LOANS: 0,
        ACTIVE_LOANS: 0,
        DISBURSEMENT_COUNT: 0,
        TOTAL_REPAYMENTS: 0,
        TOTAL_RECOVERED: 0,
        TOTAL_DEFAULTS: 0,
        PORTFOLIO_AT_RISK: 0,
        PROVISION_AMOUNT: 0,
        recordCount: 0
      };

      // Convert string values to numbers
      Object.keys(summary).forEach(key => {
        if (summary[key] !== null && summary[key] !== undefined) {
          summary[key] = parseFloat(summary[key]) || 0;
        }
      });

      // Calculate derived metrics
      const collectionEfficiency = summary.TOTAL_REPAYMENTS > 0 
        ? (summary.TOTAL_RECOVERED / summary.TOTAL_REPAYMENTS) * 100 
        : 0;
      
      const defaultRate = summary.NUMBER_OF_LOANS > 0 
        ? (summary.TOTAL_DEFAULTS / summary.NUMBER_OF_LOANS) * 100 
        : 0;
      
      const nplRatio = summary.OUTSTANDING_PRINCIPAL > 0 
        ? (summary.PORTFOLIO_AT_RISK / summary.OUTSTANDING_PRINCIPAL) * 100 
        : 0;
      
      const averageLoanSize = summary.NUMBER_OF_LOANS > 0 
        ? summary.TOTAL_PRINCIPAL / summary.NUMBER_OF_LOANS 
        : 0;

      res.json({
        success: true,
        data: {
          ...summary,
          COLLECTION_EFFICIENCY: Math.round(collectionEfficiency * 100) / 100,
          DEFAULT_RATE: Math.round(defaultRate * 100) / 100,
          NPL_RATIO: Math.round(nplRatio * 100) / 100,
          AVERAGE_LOAN_SIZE: Math.round(averageLoanSize * 100) / 100,
          RECOVERY_RATE: summary.TOTAL_DEFAULTS > 0 
            ? (summary.TOTAL_RECOVERED / summary.TOTAL_DEFAULTS) * 100 
            : 0
        },
        filters: { BRANCH_ID, YEAR, MONTH }
      });
    } catch (error) {
      console.error('Error getting portfolio summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get portfolio summary',
        error: error.message
      });
    }
  },

  /**
   * Get portfolio trend over time
   */
  getPortfolioTrend: async (req, res) => {
    try {
      const { BRANCH_ID, PROD_ID, PRODUCT_TYPE, months = 12 } = req.query;

      const where = {};
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) where.PROD_ID = PROD_ID;
      if (PRODUCT_TYPE) where.PRODUCT_TYPE = PRODUCT_TYPE;

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - parseInt(months));

      where.CREATED_DATE = { [Op.between]: [startDate, endDate] };

      // Group by month and year
      const trendData = await LoanPortfolio.findAll({
        where,
        attributes: [
          'YEAR',
          'MONTH',
          [sequelize.fn('SUM', sequelize.col('TOTAL_DISBURSED')), 'TOTAL_DISBURSED'],
          [sequelize.fn('SUM', sequelize.col('OUTSTANDING_PRINCIPAL')), 'OUTSTANDING_PRINCIPAL'],
          [sequelize.fn('SUM', sequelize.col('TOTAL_INTEREST_RECEIVED')), 'TOTAL_INTEREST_RECEIVED'],
          [sequelize.fn('SUM', sequelize.col('NUMBER_OF_LOANS')), 'NUMBER_OF_LOANS'],
          [sequelize.fn('SUM', sequelize.col('ACTIVE_LOANS')), 'ACTIVE_LOANS'],
          [sequelize.fn('SUM', sequelize.col('PORTFOLIO_AT_RISK')), 'PORTFOLIO_AT_RISK']
        ],
        group: ['YEAR', 'MONTH'],
        order: [['YEAR', 'ASC'], ['MONTH', 'ASC']],
        raw: true
      });

      // Format trend data
      const formattedTrend = trendData.map(item => {
        const totalDisbursed = parseFloat(item.TOTAL_DISBURSED) || 0;
        const outstandingPrincipal = parseFloat(item.OUTSTANDING_PRINCIPAL) || 0;
        const portfolioAtRisk = parseFloat(item.PORTFOLIO_AT_RISK) || 0;
        
        return {
          PERIOD: `${item.YEAR}-${item.MONTH.toString().padStart(2, '0')}`,
          YEAR: item.YEAR,
          MONTH: item.MONTH,
          TOTAL_DISBURSED: totalDisbursed,
          OUTSTANDING_PRINCIPAL: outstandingPrincipal,
          TOTAL_INTEREST_RECEIVED: parseFloat(item.TOTAL_INTEREST_RECEIVED) || 0,
          NUMBER_OF_LOANS: parseInt(item.NUMBER_OF_LOANS) || 0,
          ACTIVE_LOANS: parseInt(item.ACTIVE_LOANS) || 0,
          PORTFOLIO_AT_RISK: portfolioAtRisk,
          NPL_RATIO: outstandingPrincipal > 0 
            ? (portfolioAtRisk / outstandingPrincipal) * 100 
            : 0
        };
      });

      res.json({
        success: true,
        data: formattedTrend,
        period: {
          startDate,
          endDate,
          months: parseInt(months)
        }
      });
    } catch (error) {
      console.error('Error getting portfolio trend:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get portfolio trend',
        error: error.message
      });
    }
  },

  /**
   * Get portfolio health metrics
   */
  getPortfolioHealth: async (req, res) => {
    try {
      const { BRANCH_ID, YEAR, MONTH } = req.query;

      const where = {};
      if (BRANCH_ID) where.BRANCH_ID = BRANCH_ID;
      if (YEAR) where.YEAR = parseInt(YEAR);
      if (MONTH) where.MONTH = parseInt(MONTH);

      const portfolioRecords = await LoanPortfolio.findAll({
        where,
        include: [{
          model: LoanProduct,
          as: 'product',
          attributes: ['name', 'productCode']
        }]
      });

      // Calculate health metrics
      let totalOutstanding = 0;
      let totalPar = 0;
      let totalProvision = 0;
      let totalLoans = 0;
      let totalDefaults = 0;

      portfolioRecords.forEach(record => {
        const recordData = record.toJSON();
        totalOutstanding += recordData.OUTSTANDING_PRINCIPAL || 0;
        totalPar += recordData.PORTFOLIO_AT_RISK || 0;
        totalProvision += recordData.PROVISION_AMOUNT || 0;
        totalLoans += recordData.NUMBER_OF_LOANS || 0;
        totalDefaults += recordData.TOTAL_DEFAULTS || 0;
      });

      const nplRatio = totalOutstanding > 0 ? (totalPar / totalOutstanding) * 100 : 0;
      const provisionCoverage = totalPar > 0 ? (totalProvision / totalPar) * 100 : 0;
      const defaultRate = totalLoans > 0 ? (totalDefaults / totalLoans) * 100 : 0;

      // Risk categories
      const riskCategories = {
        LOW: { min: 0, max: 5, color: 'success', description: 'Low Risk' },
        MODERATE: { min: 5, max: 15, color: 'warning', description: 'Moderate Risk' },
        HIGH: { min: 15, max: 30, color: 'danger', description: 'High Risk' },
        CRITICAL: { min: 30, max: 100, color: 'critical', description: 'Critical Risk' }
      };

      let riskCategory = 'LOW';
      for (const [category, range] of Object.entries(riskCategories)) {
        if (nplRatio >= range.min && nplRatio < range.max) {
          riskCategory = category;
          break;
        }
      }

      res.json({
        success: true,
        data: {
          metrics: {
            TOTAL_OUTSTANDING: Math.round(totalOutstanding * 100) / 100,
            PORTFOLIO_AT_RISK: Math.round(totalPar * 100) / 100,
            PROVISION_AMOUNT: Math.round(totalProvision * 100) / 100,
            TOTAL_LOANS: totalLoans,
            TOTAL_DEFAULTS: totalDefaults
          },
          ratios: {
            NPL_RATIO: Math.round(nplRatio * 100) / 100,
            PROVISION_COVERAGE: Math.round(provisionCoverage * 100) / 100,
            DEFAULT_RATE: Math.round(defaultRate * 100) / 100
          },
          riskAssessment: {
            category: riskCategory,
            ...riskCategories[riskCategory],
            nplRatio: Math.round(nplRatio * 100) / 100
          },
          recommendations: generateRiskRecommendations(riskCategory, nplRatio)
        }
      });
    } catch (error) {
      console.error('Error getting portfolio health:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get portfolio health',
        error: error.message
      });
    }
  },

  // =========================
  // BATCH & ADMIN OPERATIONS
  // =========================

  /**
   * Generate portfolio for a specific period
   */
  generatePortfolioForPeriod: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { YEAR, MONTH, BRANCH_ID, PROD_ID } = req.body;
      const CREATED_BY = req.user?.id || 'SYSTEM';

      if (!YEAR || !MONTH) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'YEAR and MONTH are required'
        });
      }

      // Check if already exists
      const existingWhere = { YEAR, MONTH };
      if (BRANCH_ID) existingWhere.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) existingWhere.PROD_ID = PROD_ID;

      const existingRecords = await LoanPortfolio.findAll({ where: existingWhere, transaction });
      if (existingRecords.length > 0) {
        await transaction.rollback();
        return res.status(409).json({
          success: false,
          message: 'Portfolio records already exist for this period',
          existingCount: existingRecords.length
        });
      }

      // Determine what to generate
      let branches = BRANCH_ID ? [BRANCH_ID] : await getDistinctBranches(transaction);
      let products = PROD_ID ? [{ id: PROD_ID }] : await getDistinctProducts(transaction);

      const generatedRecords = [];
      const errors = [];

      // Generate for each combination
      for (const branch of branches) {
        for (const product of products) {
          try {
            const portfolioData = {
              BRANCH_ID: branch,
              PROD_ID: product.id,
              PRODUCT_CODE: product.productCode || product.PROD_ID?.toString(),
              PRODUCT_NAME: product.name || product.PRODUCT_NAME,
              PRODUCT_TYPE: product.PRODUCT_TYPE || product.productType,
              MONTH: parseInt(MONTH),
              YEAR: parseInt(YEAR),
              CURRENCY: 'NGN',
              CREATED_BY,
              UPDATED_BY: CREATED_BY,
              STATUS: 'ACTIVE'
            };

            // Calculate metrics from actual loan data
            await calculatePortfolioMetrics(portfolioData, transaction);

            const portfolioRecord = await LoanPortfolio.create(portfolioData, { transaction });
            generatedRecords.push(portfolioRecord);
          } catch (error) {
            errors.push({
              branch,
              product: product.id,
              error: error.message
            });
          }
        }
      }

      await transaction.commit();

      res.status(201).json({
        success: true,
        message: 'Portfolio generated successfully',
        summary: {
          generated: generatedRecords.length,
          errors: errors.length,
          totalAttempted: branches.length * products.length
        },
        data: generatedRecords.map(r => r.toJSON()),
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error generating portfolio:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to generate portfolio',
        code: error.code || 'PORTFOLIO_GENERATION_ERROR'
      });
    }
  },

  /**
   * Delete portfolio record
   */
  deletePortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;

      const portfolioRecord = await LoanPortfolio.findByPk(id, { transaction });
      if (!portfolioRecord) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Portfolio record not found'
        });
      }

      // Check if record can be deleted (only if not referenced elsewhere)
      if (portfolioRecord.STATUS === 'ACTIVE') {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Active portfolio records cannot be deleted. Archive it first.'
        });
      }

      await portfolioRecord.destroy({ transaction });

      await transaction.commit();

      res.json({
        success: true,
        message: 'Portfolio record deleted successfully',
        deletedRecord: {
          id: portfolioRecord.id,
          PERIOD: `${portfolioRecord.YEAR}-${portfolioRecord.MONTH}`,
          BRANCH_ID: portfolioRecord.BRANCH_ID,
          PRODUCT_CODE: portfolioRecord.PRODUCT_CODE
        }
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error deleting portfolio record:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to delete portfolio record',
        code: error.code || 'PORTFOLIO_DELETION_ERROR'
      });
    }
  },

  /**
   * Archive portfolio record
   */
  archivePortfolioRecord: async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const { id } = req.params;
      const UPDATED_BY = req.user?.id || 'SYSTEM';

      const portfolioRecord = await LoanPortfolio.findByPk(id, { transaction });
      if (!portfolioRecord) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Portfolio record not found'
        });
      }

      portfolioRecord.STATUS = 'ARCHIVED';
      portfolioRecord.UPDATED_BY = UPDATED_BY;
      portfolioRecord.UPDATED_DATE = new Date();

      await portfolioRecord.save({ transaction });
      await transaction.commit();

      res.json({
        success: true,
        message: 'Portfolio record archived successfully',
        data: portfolioRecord.toJSON()
      });
    } catch (error) {
      await transaction.rollback();
      console.error('Error archiving portfolio record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to archive portfolio record',
        error: error.message
      });
    }
  },

  /**
   * Export portfolio data
   */
  exportPortfolioData: async (req, res) => {
    try {
      const { format = 'json', ...filters } = req.query;

      // Build query from filters
      const where = buildPortfolioQuery(filters);

      const portfolioRecords = await LoanPortfolio.findAll({
        where,
        include: [{
          model: LoanProduct,
          as: 'product',
          attributes: ['name', 'productCode', 'description']
        }]
      });

      const recordsData = portfolioRecords.map(record => record.toJSON());

      if (format === 'csv') {
        // Convert to CSV
        const csvData = convertToCSV(recordsData);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=portfolio-export.csv');
        return res.send(csvData);
      }

      // Default JSON response
      res.json({
        success: true,
        format,
        count: recordsData.length,
        generatedAt: new Date(),
        data: recordsData
      });
    } catch (error) {
      console.error('Error exporting portfolio data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to export portfolio data',
        error: error.message
      });
    }
  }
};

// =========================
// HELPER FUNCTIONS
// =========================

/**
 * Calculate portfolio metrics from loan data
 */
async function calculatePortfolioMetrics(portfolioData, transaction, forceRecalculation = false) {
  const { BRANCH_ID, PROD_ID, YEAR, MONTH } = portfolioData;

  // Build date range for the month
  const startDate = new Date(YEAR, MONTH - 1, 1); // First day of month
  const endDate = new Date(YEAR, MONTH, 0); // Last day of month

  // Query for loans in this period and branch/product
  const where = {
    DISBURSEMENT_DATE: { [Op.between]: [startDate, endDate] },
    BU_ID: BRANCH_ID,
    PROD_ID: PROD_ID
  };

  // Get all relevant loans
  const loans = await LoanAccount.findAll({ where, transaction });
  
  // Calculate metrics
  let totalDisbursed = 0;
  let totalPrincipal = 0;
  let outstandingPrincipal = 0;
  let totalInterestAccrued = 0;
  let totalInterestReceived = 0;
  let totalFeesReceived = 0;
  let activeLoans = 0;
  let portfolioAtRisk = 0;
  let totalDefaults = 0;

  for (const loan of loans) {
    const loanData = loan.toJSON();
    const disbursed = parseFloat(loanData.DISBURSED_AMOUNT || 0);
    const principal = parseFloat(loanData.OUTSTANDING_PRINCIPAL || 0);
    
    totalDisbursed += disbursed;
    totalPrincipal += parseFloat(loanData.DISBURSEMENT_LIMIT || 0);
    outstandingPrincipal += principal;

    // Check if loan is active
    if (loanData.LOAN_STATUS === 'ACTIVE') {
      activeLoans++;
    }

    // Check if loan is at risk (delinquent)
    if (loanData.LOAN_STATUS === 'DELINQUENT' || loanData.LOAN_STATUS === 'DEFAULT') {
      portfolioAtRisk += principal;
      if (loanData.LOAN_STATUS === 'DEFAULT') {
        totalDefaults++;
      }
    }

    // Get repayment data for this loan
    const repayments = await LoanRepayment.findAll({
      where: {
        LOAN_ACCOUNT_ID: loan.id,
        date: { [Op.between]: [startDate, endDate] }
      },
      transaction
    });

    for (const repayment of repayments) {
      const repaymentData = repayment.toJSON();
      totalInterestReceived += parseFloat(repaymentData.interestPaid || 0);
      totalFeesReceived += parseFloat(repaymentData.feesPaid || 0);
    }
  }

  // Calculate interest accrued (simplified)
  totalInterestAccrued = outstandingPrincipal * (parseFloat(portfolioData.INTEREST_RATE || '0') / 100) / 12;

  // Update portfolio data
  portfolioData.TOTAL_DISBURSED = totalDisbursed;
  portfolioData.TOTAL_NET_DISBURSEMENT = totalDisbursed;
  portfolioData.TOTAL_PRINCIPAL = totalPrincipal;
  portfolioData.OUTSTANDING_PRINCIPAL = outstandingPrincipal;
  portfolioData.TOTAL_INTEREST_ACCRUED = totalInterestAccrued;
  portfolioData.TOTAL_INTEREST_RECEIVED = totalInterestReceived;
  portfolioData.TOTAL_FEES_RECEIVED = totalFeesReceived;
  portfolioData.NUMBER_OF_LOANS = loans.length;
  portfolioData.ACTIVE_LOANS = activeLoans;
  portfolioData.DISBURSEMENT_COUNT = loans.length;
  portfolioData.PORTFOLIO_AT_RISK = portfolioAtRisk;
  portfolioData.TOTAL_DEFAULTS = totalDefaults;

  // Get repayment totals for the period
  const loanIds = loans.map(loan => loan.id);
  
  if (loanIds.length > 0) {
    const repayments = await LoanRepayment.findAll({
      where: {
        date: { [Op.between]: [startDate, endDate] },
        LOAN_ACCOUNT_ID: { [Op.in]: loanIds }
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('amount')), 'TOTAL_REPAYMENTS'],
        [sequelize.fn('SUM', sequelize.col('principalPaid')), 'TOTAL_RECOVERED']
      ],
      transaction,
      raw: true
    });

    const repaymentData = repayments[0] || {};
    portfolioData.TOTAL_REPAYMENTS = parseFloat(repaymentData.TOTAL_REPAYMENTS) || 0;
    portfolioData.TOTAL_RECOVERED = parseFloat(repaymentData.TOTAL_RECOVERED) || 0;
  } else {
    portfolioData.TOTAL_REPAYMENTS = 0;
    portfolioData.TOTAL_RECOVERED = 0;
  }

  // Calculate provision (simplified: 10% of portfolio at risk)
  portfolioData.PROVISION_AMOUNT = portfolioAtRisk * 0.1;

  // Calculate yield rate
  portfolioData.YIELD_RATE = totalPrincipal > 0 
    ? ((totalInterestReceived + totalFeesReceived) / totalPrincipal) * 100 * 12 
    : 0;

  // Calculate average loan size
  portfolioData.AVERAGE_LOAN_SIZE = loans.length > 0 
    ? totalPrincipal / loans.length 
    : 0;
}

/**
 * Recalculate portfolio ratios
 */
async function recalculatePortfolioRatios(portfolioRecord) {
  const portfolioData = portfolioRecord.toJSON();
  const {
    OUTSTANDING_PRINCIPAL,
    PORTFOLIO_AT_RISK,
    TOTAL_PRINCIPAL,
    NUMBER_OF_LOANS,
    TOTAL_INTEREST_RECEIVED,
    TOTAL_FEES_RECEIVED,
    COST_OF_FUNDS = 0
  } = portfolioData;

  // NPL Ratio
  portfolioRecord.NPL_RATIO = OUTSTANDING_PRINCIPAL > 0 
    ? (PORTFOLIO_AT_RISK / OUTSTANDING_PRINCIPAL) * 100 
    : 0;

  // Yield Rate
  portfolioRecord.YIELD_RATE = TOTAL_PRINCIPAL > 0 
    ? ((TOTAL_INTEREST_RECEIVED + TOTAL_FEES_RECEIVED) / TOTAL_PRINCIPAL) * 100 * 12 
    : 0;

  // Net Interest Margin
  portfolioRecord.NET_INTEREST_MARGIN = portfolioRecord.YIELD_RATE - COST_OF_FUNDS;

  // Average Loan Size
  portfolioRecord.AVERAGE_LOAN_SIZE = NUMBER_OF_LOANS > 0 
    ? TOTAL_PRINCIPAL / NUMBER_OF_LOANS 
    : 0;
}

/**
 * Get distinct branches
 */
async function getDistinctBranches(transaction) {
  const branches = await LoanAccount.findAll({
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('BU_ID')), 'BU_ID']],
    where: { BU_ID: { [Op.ne]: null } },
    transaction,
    raw: true
  });
  
  return branches.map(b => b.BU_ID);
}

/**
 * Get distinct products
 */
async function getDistinctProducts(transaction) {
  const products = await LoanProduct.findAll({ transaction });
  return products;
}

/**
 * Build portfolio query from filters
 */
function buildPortfolioQuery(filters) {
  const where = {};

  if (filters.BRANCH_ID) where.BRANCH_ID = filters.BRANCH_ID;
  if (filters.PROD_ID) where.PROD_ID = filters.PROD_ID;
  if (filters.PRODUCT_TYPE) where.PRODUCT_TYPE = filters.PRODUCT_TYPE;
  if (filters.YEAR) where.YEAR = parseInt(filters.YEAR);
  if (filters.MONTH) where.MONTH = parseInt(filters.MONTH);
  if (filters.STATUS) where.STATUS = filters.STATUS;

  if (filters.startDate || filters.endDate) {
    where.CREATED_DATE = {};
    if (filters.startDate) where.CREATED_DATE[Op.gte] = new Date(filters.startDate);
    if (filters.endDate) where.CREATED_DATE[Op.lte] = new Date(filters.endDate);
  }

  return where;
}

/**
 * Generate risk recommendations
 */
function generateRiskRecommendations(riskCategory, nplRatio) {
  const recommendations = [];

  switch (riskCategory) {
    case 'CRITICAL':
      recommendations.push(
        'Immediate review of high-risk loans required',
        'Increase provision coverage to at least 50%',
        'Temporarily suspend new disbursements for this product',
        'Implement aggressive collection strategies',
        'Consider portfolio restructuring'
      );
      break;
    case 'HIGH':
      recommendations.push(
        'Enhance monitoring of delinquent accounts',
        'Increase collection efforts',
        'Review credit policies for this product',
        'Consider increasing interest rates to cover risk',
        'Regular portfolio reviews required'
      );
      break;
    case 'MODERATE':
      recommendations.push(
        'Maintain current monitoring levels',
        'Focus on early warning signs',
        'Standard collection procedures sufficient',
        'Regular portfolio performance reviews'
      );
      break;
    case 'LOW':
      recommendations.push(
        'Portfolio performing well',
        'Continue current policies',
        'Consider expansion opportunities',
        'Monitor for any emerging risks'
      );
      break;
  }

  return recommendations;
}

/**
 * Convert portfolio data to CSV
 */
function convertToCSV(portfolioRecords) {
  if (portfolioRecords.length === 0) return '';

  const headers = [
    'PERIOD', 'BRANCH_ID', 'PRODUCT_CODE', 'PRODUCT_NAME', 'PRODUCT_TYPE',
    'TOTAL_DISBURSED', 'OUTSTANDING_PRINCIPAL', 'TOTAL_INTEREST_RECEIVED',
    'NUMBER_OF_LOANS', 'ACTIVE_LOANS', 'PORTFOLIO_AT_RISK', 'NPL_RATIO',
    'YIELD_RATE', 'AVERAGE_LOAN_SIZE', 'STATUS'
  ];

  const rows = portfolioRecords.map(record => {
    const period = `${record.YEAR}-${record.MONTH.toString().padStart(2, '0')}`;
    const nplRatio = record.OUTSTANDING_PRINCIPAL > 0 
      ? (record.PORTFOLIO_AT_RISK / record.OUTSTANDING_PRINCIPAL) * 100 
      : 0;
    
    return [
      period,
      record.BRANCH_ID,
      record.PRODUCT_CODE,
      `"${record.PRODUCT_NAME}"`,
      record.PRODUCT_TYPE,
      (record.TOTAL_DISBURSED || 0).toFixed(2),
      (record.OUTSTANDING_PRINCIPAL || 0).toFixed(2),
      (record.TOTAL_INTEREST_RECEIVED || 0).toFixed(2),
      record.NUMBER_OF_LOANS || 0,
      record.ACTIVE_LOANS || 0,
      (record.PORTFOLIO_AT_RISK || 0).toFixed(2),
      nplRatio.toFixed(2),
      (record.YIELD_RATE || 0).toFixed(2),
      (record.AVERAGE_LOAN_SIZE || 0).toFixed(2),
      record.STATUS
    ];
  });

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

export default LoanPortfolioController;