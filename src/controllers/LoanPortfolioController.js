// src/controllers/LoanPortfolioController.js
import mongoose from 'mongoose';
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
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
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
          throw new Error('BRANCH_ID, PROD_ID, MONTH, and YEAR are required');
        }

        // Check if record already exists for this period
        const existingRecord = await LoanPortfolio.findOne({
          BRANCH_ID,
          PROD_ID,
          YEAR,
          MONTH
        }).session(session);

        if (existingRecord) {
          throw new Error(`Portfolio record already exists for ${YEAR}-${MONTH}`);
        }

        // Get product details
        const loanProduct = await LoanProduct.findById(PROD_ID).session(session);
        if (!loanProduct) {
          throw new Error(`Product not found with ID: ${PROD_ID}`);
        }

        // Build portfolio data
        const portfolioData = {
          BRANCH_ID,
          PROD_ID,
          PRODUCT_CODE: product.productCode || product.PROD_ID?.toString(),
          PRODUCT_NAME: product.name || product.PRODUCT_NAME,
          PRODUCT_TYPE: product.PRODUCT_TYPE || product.productType,
          MONTH: parseInt(MONTH),
          YEAR: parseInt(YEAR),
          CURRENCY,
          CREATED_BY,
          UPDATED_BY: CREATED_BY,
          STATUS: 'ACTIVE'
        };

        // Calculate portfolio metrics
        await calculatePortfolioMetrics(portfolioData, session);

        // Create portfolio record
        const portfolioRecord = new LoanPortfolio(portfolioData);
        await portfolioRecord.save({ session });

        res.status(201).json({
          success: true,
          message: 'Portfolio record created successfully',
          data: portfolioRecord
        });
      });
    } catch (error) {
      console.error('Error creating portfolio record:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to create portfolio record',
        code: error.code || 'PORTFOLIO_CREATION_ERROR'
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Update portfolio record
   */
  updatePortfolioRecord: async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const { id } = req.params;
        const updateData = req.body;
        const UPDATED_BY = req.user?.id || 'SYSTEM';

        // Find the portfolio record
        const portfolioRecord = await LoanPortfolio.findById(id).session(session);
        if (!portfolioRecord) {
          throw { status: 404, message: 'Portfolio record not found' };
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

        await portfolioRecord.save({ session });

        res.json({
          success: true,
          message: 'Portfolio record updated successfully',
          data: portfolioRecord
        });
      });
    } catch (error) {
      console.error('Error updating portfolio record:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to update portfolio record',
        code: error.code || 'PORTFOLIO_UPDATE_ERROR'
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Recalculate portfolio metrics
   */
  recalculatePortfolio: async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const { id } = req.params;
        const UPDATED_BY = req.user?.id || 'SYSTEM';

        // Find the portfolio record
        const portfolioRecord = await LoanPortfolio.findById(id).session(session);
        if (!portfolioRecord) {
          throw { status: 404, message: 'Portfolio record not found' };
        }

        // Recalculate all metrics from scratch
        await calculatePortfolioMetrics(portfolioRecord, session, true);

        portfolioRecord.UPDATED_BY = UPDATED_BY;
        await portfolioRecord.save({ session });

        res.json({
          success: true,
          message: 'Portfolio metrics recalculated successfully',
          data: portfolioRecord
        });
      });
    } catch (error) {
      console.error('Error recalculating portfolio:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to recalculate portfolio',
        code: error.code || 'PORTFOLIO_RECALCULATION_ERROR'
      });
    } finally {
      await session.endSession();
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

      const portfolioRecord = await LoanPortfolio.findById(id)
        .populate('PROD_ID', 'name productCode description')
        .lean();

      if (!portfolioRecord) {
        return res.status(404).json({
          success: false,
          message: 'Portfolio record not found'
        });
      }

      // Calculate virtual fields
      portfolioRecord.PERIOD = `${portfolioRecord.YEAR}-${portfolioRecord.MONTH.toString().padStart(2, '0')}`;
      portfolioRecord.COLLECTION_EFFICIENCY = portfolioRecord.TOTAL_REPAYMENTS > 0 
        ? (portfolioRecord.TOTAL_RECOVERED / portfolioRecord.TOTAL_REPAYMENTS) * 100 
        : 0;
      portfolioRecord.DEFAULT_RATE = portfolioRecord.NUMBER_OF_LOANS > 0 
        ? (portfolioRecord.TOTAL_DEFAULTS / portfolioRecord.NUMBER_OF_LOANS) * 100 
        : 0;

      res.json({
        success: true,
        data: portfolioRecord
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

      const query = { YEAR: parseInt(YEAR), MONTH: parseInt(MONTH) };
      if (BRANCH_ID) query.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) query.PROD_ID = PROD_ID;

      const portfolioRecords = await LoanPortfolio.find(query)
        .populate('PROD_ID', 'name productCode')
        .sort({ BRANCH_ID: 1, PRODUCT_CODE: 1 })
        .lean();

      // Calculate virtual fields for each record
      const enhancedRecords = portfolioRecords.map(record => ({
        ...record,
        PERIOD: `${record.YEAR}-${record.MONTH.toString().padStart(2, '0')}`,
        COLLECTION_EFFICIENCY: record.TOTAL_REPAYMENTS > 0 
          ? (record.TOTAL_RECOVERED / record.TOTAL_REPAYMENTS) * 100 
          : 0,
        DEFAULT_RATE: record.NUMBER_OF_LOANS > 0 
          ? (record.TOTAL_DEFAULTS / record.NUMBER_OF_LOANS) * 100 
          : 0
      }));

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

      const query = { BRANCH_ID };
      if (YEAR) query.YEAR = parseInt(YEAR);
      if (MONTH) query.MONTH = parseInt(MONTH);

      const portfolioRecords = await LoanPortfolio.find(query)
        .populate('PROD_ID', 'name productCode PRODUCT_TYPE')
        .sort({ YEAR: -1, MONTH: -1, PRODUCT_TYPE: 1 })
        .lean();

      // Group by period and calculate totals
      const groupedData = {};
      portfolioRecords.forEach(record => {
        const periodKey = `${record.YEAR}-${record.MONTH.toString().padStart(2, '0')}`;
        if (!groupedData[periodKey]) {
          groupedData[periodKey] = {
            PERIOD: periodKey,
            BRANCH_ID: record.BRANCH_ID,
            TOTAL_DISBURSED: 0,
            OUTSTANDING_PRINCIPAL: 0,
            TOTAL_INTEREST_RECEIVED: 0,
            NUMBER_OF_LOANS: 0,
            ACTIVE_LOANS: 0,
            PORTFOLIO_AT_RISK: 0,
            products: []
          };
        }

        groupedData[periodKey].TOTAL_DISBURSED += record.TOTAL_DISBURSED || 0;
        groupedData[periodKey].OUTSTANDING_PRINCIPAL += record.OUTSTANDING_PRINCIPAL || 0;
        groupedData[periodKey].TOTAL_INTEREST_RECEIVED += record.TOTAL_INTEREST_RECEIVED || 0;
        groupedData[periodKey].NUMBER_OF_LOANS += record.NUMBER_OF_LOANS || 0;
        groupedData[periodKey].ACTIVE_LOANS += record.ACTIVE_LOANS || 0;
        groupedData[periodKey].PORTFOLIO_AT_RISK += record.PORTFOLIO_AT_RISK || 0;

        groupedData[periodKey].products.push({
          PRODUCT_ID: record.PROD_ID?._id,
          PRODUCT_CODE: record.PRODUCT_CODE,
          PRODUCT_NAME: record.PRODUCT_NAME,
          PRODUCT_TYPE: record.PRODUCT_TYPE,
          TOTAL_DISBURSED: record.TOTAL_DISBURSED,
          OUTSTANDING_PRINCIPAL: record.OUTSTANDING_PRINCIPAL,
          NUMBER_OF_LOANS: record.NUMBER_OF_LOANS,
          NPL_RATIO: record.NPL_RATIO,
          YIELD_RATE: record.YIELD_RATE
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

      const query = { PRODUCT_TYPE };
      if (YEAR) query.YEAR = parseInt(YEAR);
      if (MONTH) query.MONTH = parseInt(MONTH);

      const portfolioRecords = await LoanPortfolio.find(query)
        .populate('PROD_ID', 'name productCode')
        .sort({ YEAR: -1, MONTH: -1, BRANCH_ID: 1 })
        .lean();

      // Calculate totals by period
      const summaryByPeriod = {};
      portfolioRecords.forEach(record => {
        const periodKey = `${record.YEAR}-${record.MONTH.toString().padStart(2, '0')}`;
        if (!summaryByPeriod[periodKey]) {
          summaryByPeriod[periodKey] = {
            PERIOD: periodKey,
            PRODUCT_TYPE: record.PRODUCT_TYPE,
            TOTAL_DISBURSED: 0,
            OUTSTANDING_PRINCIPAL: 0,
            TOTAL_INTEREST_RECEIVED: 0,
            NUMBER_OF_LOANS: 0,
            ACTIVE_LOANS: 0,
            branches: []
          };
        }

        summaryByPeriod[periodKey].TOTAL_DISBURSED += record.TOTAL_DISBURSED || 0;
        summaryByPeriod[periodKey].OUTSTANDING_PRINCIPAL += record.OUTSTANDING_PRINCIPAL || 0;
        summaryByPeriod[periodKey].TOTAL_INTEREST_RECEIVED += record.TOTAL_INTEREST_RECEIVED || 0;
        summaryByPeriod[periodKey].NUMBER_OF_LOANS += record.NUMBER_OF_LOANS || 0;
        summaryByPeriod[periodKey].ACTIVE_LOANS += record.ACTIVE_LOANS || 0;

        // Add branch details
        const existingBranch = summaryByPeriod[periodKey].branches.find(
          b => b.BRANCH_ID === record.BRANCH_ID
        );
        if (existingBranch) {
          existingBranch.TOTAL_DISBURSED += record.TOTAL_DISBURSED || 0;
          existingBranch.OUTSTANDING_PRINCIPAL += record.OUTSTANDING_PRINCIPAL || 0;
        } else {
          summaryByPeriod[periodKey].branches.push({
            BRANCH_ID: record.BRANCH_ID,
            TOTAL_DISBURSED: record.TOTAL_DISBURSED || 0,
            OUTSTANDING_PRINCIPAL: record.OUTSTANDING_PRINCIPAL || 0,
            NUMBER_OF_LOANS: record.NUMBER_OF_LOANS || 0
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

      const query = {};

      // Build query
      if (BRANCH_ID) query.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) query.PROD_ID = PROD_ID;
      if (PRODUCT_TYPE) query.PRODUCT_TYPE = PRODUCT_TYPE;
      if (YEAR) query.YEAR = parseInt(YEAR);
      if (MONTH) query.MONTH = parseInt(MONTH);
      if (STATUS) query.STATUS = STATUS;

      // Date range filter
      if (startDate || endDate) {
        query.CREATED_DATE = {};
        if (startDate) query.CREATED_DATE.$gte = new Date(startDate);
        if (endDate) query.CREATED_DATE.$lte = new Date(endDate);
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Execute query with pagination
      const [portfolioRecords, total] = await Promise.all([
        LoanPortfolio.find(query)
          .populate('PROD_ID', 'name productCode')
          .sort({ YEAR: -1, MONTH: -1, BRANCH_ID: 1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        LoanPortfolio.countDocuments(query)
      ]);

      // Enhance records with virtual fields
      const enhancedRecords = portfolioRecords.map(record => ({
        ...record,
        PERIOD: `${record.YEAR}-${record.MONTH.toString().padStart(2, '0')}`,
        COLLECTION_EFFICIENCY: record.TOTAL_REPAYMENTS > 0 
          ? (record.TOTAL_RECOVERED / record.TOTAL_REPAYMENTS) * 100 
          : 0,
        DEFAULT_RATE: record.NUMBER_OF_LOANS > 0 
          ? (record.TOTAL_DEFAULTS / record.NUMBER_OF_LOANS) * 100 
          : 0
      }));

      res.json({
        success: true,
        data: enhancedRecords,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
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

      const query = {};
      if (BRANCH_ID) query.BRANCH_ID = BRANCH_ID;
      if (YEAR) query.YEAR = parseInt(YEAR);
      if (MONTH) query.MONTH = parseInt(MONTH);

      // Aggregate total statistics
      const aggregation = await LoanPortfolio.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            TOTAL_DISBURSED: { $sum: "$TOTAL_DISBURSED" },
            TOTAL_PRINCIPAL: { $sum: "$TOTAL_PRINCIPAL" },
            OUTSTANDING_PRINCIPAL: { $sum: "$OUTSTANDING_PRINCIPAL" },
            TOTAL_INTEREST_ACCRUED: { $sum: "$TOTAL_INTEREST_ACCRUED" },
            TOTAL_INTEREST_RECEIVED: { $sum: "$TOTAL_INTEREST_RECEIVED" },
            TOTAL_FEES_RECEIVED: { $sum: "$TOTAL_FEES_RECEIVED" },
            NUMBER_OF_LOANS: { $sum: "$NUMBER_OF_LOANS" },
            ACTIVE_LOANS: { $sum: "$ACTIVE_LOANS" },
            DISBURSEMENT_COUNT: { $sum: "$DISBURSEMENT_COUNT" },
            TOTAL_REPAYMENTS: { $sum: "$TOTAL_REPAYMENTS" },
            TOTAL_RECOVERED: { $sum: "$TOTAL_RECOVERED" },
            TOTAL_DEFAULTS: { $sum: "$TOTAL_DEFAULTS" },
            PORTFOLIO_AT_RISK: { $sum: "$PORTFOLIO_AT_RISK" },
            PROVISION_AMOUNT: { $sum: "$PROVISION_AMOUNT" },
            recordCount: { $sum: 1 }
          }
        }
      ]);

      const result = aggregation[0] || {
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

      // Calculate derived metrics
      const collectionEfficiency = result.TOTAL_REPAYMENTS > 0 
        ? (result.TOTAL_RECOVERED / result.TOTAL_REPAYMENTS) * 100 
        : 0;
      
      const defaultRate = result.NUMBER_OF_LOANS > 0 
        ? (result.TOTAL_DEFAULTS / result.NUMBER_OF_LOANS) * 100 
        : 0;
      
      const nplRatio = result.OUTSTANDING_PRINCIPAL > 0 
        ? (result.PORTFOLIO_AT_RISK / result.OUTSTANDING_PRINCIPAL) * 100 
        : 0;
      
      const averageLoanSize = result.NUMBER_OF_LOANS > 0 
        ? result.TOTAL_PRINCIPAL / result.NUMBER_OF_LOANS 
        : 0;

      res.json({
        success: true,
        data: {
          ...result,
          COLLECTION_EFFICIENCY: Math.round(collectionEfficiency * 100) / 100,
          DEFAULT_RATE: Math.round(defaultRate * 100) / 100,
          NPL_RATIO: Math.round(nplRatio * 100) / 100,
          AVERAGE_LOAN_SIZE: Math.round(averageLoanSize * 100) / 100,
          RECOVERY_RATE: result.TOTAL_DEFAULTS > 0 
            ? (result.TOTAL_RECOVERED / result.TOTAL_DEFAULTS) * 100 
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

      const query = {};
      if (BRANCH_ID) query.BRANCH_ID = BRANCH_ID;
      if (PROD_ID) query.PROD_ID = PROD_ID;
      if (PRODUCT_TYPE) query.PRODUCT_TYPE = PRODUCT_TYPE;

      // Calculate date range
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - parseInt(months));

      query.CREATED_DATE = { $gte: startDate, $lte: endDate };

      // Group by month and year
      const trendData = await LoanPortfolio.aggregate([
        { $match: query },
        {
          $group: {
            _id: { year: "$YEAR", month: "$MONTH" },
            TOTAL_DISBURSED: { $sum: "$TOTAL_DISBURSED" },
            OUTSTANDING_PRINCIPAL: { $sum: "$OUTSTANDING_PRINCIPAL" },
            TOTAL_INTEREST_RECEIVED: { $sum: "$TOTAL_INTEREST_RECEIVED" },
            NUMBER_OF_LOANS: { $sum: "$NUMBER_OF_LOANS" },
            ACTIVE_LOANS: { $sum: "$ACTIVE_LOANS" },
            PORTFOLIO_AT_RISK: { $sum: "$PORTFOLIO_AT_RISK" },
            recordCount: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } }
      ]);

      // Format trend data
      const formattedTrend = trendData.map(item => ({
        PERIOD: `${item._id.year}-${item._id.month.toString().padStart(2, '0')}`,
        YEAR: item._id.year,
        MONTH: item._id.month,
        TOTAL_DISBURSED: item.TOTAL_DISBURSED,
        OUTSTANDING_PRINCIPAL: item.OUTSTANDING_PRINCIPAL,
        TOTAL_INTEREST_RECEIVED: item.TOTAL_INTEREST_RECEIVED,
        NUMBER_OF_LOANS: item.NUMBER_OF_LOANS,
        ACTIVE_LOANS: item.ACTIVE_LOANS,
        PORTFOLIO_AT_RISK: item.PORTFOLIO_AT_RISK,
        NPL_RATIO: item.OUTSTANDING_PRINCIPAL > 0 
          ? (item.PORTFOLIO_AT_RISK / item.OUTSTANDING_PRINCIPAL) * 100 
          : 0
      }));

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

      const query = {};
      if (BRANCH_ID) query.BRANCH_ID = BRANCH_ID;
      if (YEAR) query.YEAR = parseInt(YEAR);
      if (MONTH) query.MONTH = parseInt(MONTH);

      const portfolioRecords = await LoanPortfolio.find(query)
        .populate('PROD_ID', 'name productCode')
        .lean();

      // Calculate health metrics
      const totalOutstanding = portfolioRecords.reduce((sum, record) => sum + (record.OUTSTANDING_PRINCIPAL || 0), 0);
      const totalPar = portfolioRecords.reduce((sum, record) => sum + (record.PORTFOLIO_AT_RISK || 0), 0);
      const totalProvision = portfolioRecords.reduce((sum, record) => sum + (record.PROVISION_AMOUNT || 0), 0);
      const totalLoans = portfolioRecords.reduce((sum, record) => sum + (record.NUMBER_OF_LOANS || 0), 0);
      const totalDefaults = portfolioRecords.reduce((sum, record) => sum + (record.TOTAL_DEFAULTS || 0), 0);

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
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const { YEAR, MONTH, BRANCH_ID, PROD_ID } = req.body;
        const CREATED_BY = req.user?.id || 'SYSTEM';

        if (!YEAR || !MONTH) {
          throw { status: 400, message: 'YEAR and MONTH are required' };
        }

        // Check if already exists
        const existingQuery = { YEAR, MONTH };
        if (BRANCH_ID) existingQuery.BRANCH_ID = BRANCH_ID;
        if (PROD_ID) existingQuery.PROD_ID = PROD_ID;

        const existingRecords = await LoanPortfolio.find(existingQuery).session(session);
        if (existingRecords.length > 0) {
          return res.status(409).json({
            success: false,
            message: 'Portfolio records already exist for this period',
            existingCount: existingRecords.length
          });
        }

        // Determine what to generate
        let branches = BRANCH_ID ? [BRANCH_ID] : await getDistinctBranches(session);
        let products = PROD_ID ? [{ _id: PROD_ID }] : await getDistinctProducts(session);

        const generatedRecords = [];
        const errors = [];

        // Generate for each combination
        for (const branch of branches) {
          for (const product of products) {
            try {
              const portfolioData = {
                BRANCH_ID: branch,
                PROD_ID: product._id,
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
              await calculatePortfolioMetrics(portfolioData, session);

              const portfolioRecord = new LoanPortfolio(portfolioData);
              await portfolioRecord.save({ session });
              generatedRecords.push(portfolioRecord);
            } catch (error) {
              errors.push({
                branch,
                product: product._id,
                error: error.message
              });
            }
          }
        }

        res.status(201).json({
          success: true,
          message: 'Portfolio generated successfully',
          summary: {
            generated: generatedRecords.length,
            errors: errors.length,
            totalAttempted: branches.length * products.length
          },
          data: generatedRecords,
          errors: errors.length > 0 ? errors : undefined
        });
      });
    } catch (error) {
      console.error('Error generating portfolio:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to generate portfolio',
        code: error.code || 'PORTFOLIO_GENERATION_ERROR'
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Delete portfolio record
   */
  deletePortfolioRecord: async (req, res) => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const { id } = req.params;

        const portfolioRecord = await LoanPortfolio.findById(id).session(session);
        if (!portfolioRecord) {
          throw { status: 404, message: 'Portfolio record not found' };
        }

        // Check if record can be deleted (only if not referenced elsewhere)
        if (portfolioRecord.STATUS === 'ACTIVE') {
          throw { 
            status: 400, 
            message: 'Active portfolio records cannot be deleted. Archive it first.' 
          };
        }

        await LoanPortfolio.findByIdAndDelete(id).session(session);

        res.json({
          success: true,
          message: 'Portfolio record deleted successfully',
          deletedRecord: {
            id: portfolioRecord._id,
            PERIOD: `${portfolioRecord.YEAR}-${portfolioRecord.MONTH}`,
            BRANCH_ID: portfolioRecord.BRANCH_ID,
            PRODUCT_CODE: portfolioRecord.PRODUCT_CODE
          }
        });
      });
    } catch (error) {
      console.error('Error deleting portfolio record:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to delete portfolio record',
        code: error.code || 'PORTFOLIO_DELETION_ERROR'
      });
    } finally {
      await session.endSession();
    }
  },

  /**
   * Archive portfolio record
   */
  archivePortfolioRecord: async (req, res) => {
    try {
      const { id } = req.params;
      const UPDATED_BY = req.user?.id || 'SYSTEM';

      const portfolioRecord = await LoanPortfolio.findById(id);
      if (!portfolioRecord) {
        return res.status(404).json({
          success: false,
          message: 'Portfolio record not found'
        });
      }

      portfolioRecord.STATUS = 'ARCHIVED';
      portfolioRecord.UPDATED_BY = UPDATED_BY;
      portfolioRecord.UPDATED_DATE = new Date();

      await portfolioRecord.save();

      res.json({
        success: true,
        message: 'Portfolio record archived successfully',
        data: portfolioRecord
      });
    } catch (error) {
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
      const query = buildPortfolioQuery(filters);

      const portfolioRecords = await LoanPortfolio.find(query)
        .populate('PROD_ID', 'name productCode description')
        .lean();

      if (format === 'csv') {
        // Convert to CSV
        const csvData = convertToCSV(portfolioRecords);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=portfolio-export.csv');
        return res.send(csvData);
      }

      // Default JSON response
      res.json({
        success: true,
        format,
        count: portfolioRecords.length,
        generatedAt: new Date(),
        data: portfolioRecords
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
async function calculatePortfolioMetrics(portfolioData, session, forceRecalculation = false) {
  const { BRANCH_ID, PROD_ID, YEAR, MONTH } = portfolioData;

  // Build date range for the month
  const startDate = new Date(YEAR, MONTH - 1, 1); // First day of month
  const endDate = new Date(YEAR, MONTH, 0); // Last day of month

  // Query for loans in this period and branch/product
  const loanQuery = {
    DISBURSEMENT_DATE: { $gte: startDate, $lte: endDate },
    BU_ID: BRANCH_ID,
    PROD_ID: PROD_ID
  };

  // Get all relevant loans
  const loans = await LoanAccount.find(loanQuery).session(session);
  
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
    const disbursed = parseFloat(loan.DISBURSED_AMOUNT?.toString() || '0');
    const principal = parseFloat(loan.OUTSTANDING_PRINCIPAL?.toString() || '0');
    
    totalDisbursed += disbursed;
    totalPrincipal += parseFloat(loan.DISBURSEMENT_LIMIT?.toString() || '0');
    outstandingPrincipal += principal;

    // Check if loan is active
    if (loan.LOAN_STATUS === 'ACTIVE') {
      activeLoans++;
    }

    // Check if loan is at risk (delinquent)
    if (loan.LOAN_STATUS === 'DELINQUENT' || loan.LOAN_STATUS === 'DEFAULT') {
      portfolioAtRisk += principal;
      if (loan.LOAN_STATUS === 'DEFAULT') {
        totalDefaults++;
      }
    }

    // Get repayment data for this loan
    const repayments = await LoanRepayment.find({
      LOAN_ACCOUNT_ID: loan._id,
      date: { $gte: startDate, $lte: endDate }
    }).session(session);

    for (const repayment of repayments) {
      totalInterestReceived += parseFloat(repayment.interestPaid?.toString() || '0');
      totalFeesReceived += parseFloat(repayment.feesPaid?.toString() || '0');
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
  const repayments = await LoanRepayment.aggregate([
    {
      $match: {
        date: { $gte: startDate, $lte: endDate },
        LOAN_ACCOUNT_ID: { $in: loans.map(l => l._id) }
      }
    },
    {
      $group: {
        _id: null,
        TOTAL_REPAYMENTS: { $sum: { $toDouble: "$amount" } },
        TOTAL_RECOVERED: { $sum: { $toDouble: "$principalPaid" } }
      }
    }
  ]).session(session);

  portfolioData.TOTAL_REPAYMENTS = repayments[0]?.TOTAL_REPAYMENTS || 0;
  portfolioData.TOTAL_RECOVERED = repayments[0]?.TOTAL_RECOVERED || 0;

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
  const {
    OUTSTANDING_PRINCIPAL,
    PORTFOLIO_AT_RISK,
    TOTAL_PRINCIPAL,
    NUMBER_OF_LOANS,
    TOTAL_INTEREST_RECEIVED,
    TOTAL_FEES_RECEIVED,
    COST_OF_FUNDS = 0
  } = portfolioRecord;

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
async function getDistinctBranches(session) {
  const branches = await LoanAccount.distinct('BU_ID').session(session);
  return branches.filter(Boolean);
}

/**
 * Get distinct products
 */
async function getDistinctProducts(session) {
  const products = await Product.find({}).session(session);
  return products;
}

/**
 * Build portfolio query from filters
 */
function buildPortfolioQuery(filters) {
  const query = {};

  if (filters.BRANCH_ID) query.BRANCH_ID = filters.BRANCH_ID;
  if (filters.PROD_ID) query.PROD_ID = filters.PROD_ID;
  if (filters.PRODUCT_TYPE) query.PRODUCT_TYPE = filters.PRODUCT_TYPE;
  if (filters.YEAR) query.YEAR = parseInt(filters.YEAR);
  if (filters.MONTH) query.MONTH = parseInt(filters.MONTH);
  if (filters.STATUS) query.STATUS = filters.STATUS;

  if (filters.startDate || filters.endDate) {
    query.CREATED_DATE = {};
    if (filters.startDate) query.CREATED_DATE.$gte = new Date(filters.startDate);
    if (filters.endDate) query.CREATED_DATE.$lte = new Date(filters.endDate);
  }

  return query;
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
      record.TOTAL_DISBURSED?.toFixed(2) || '0.00',
      record.OUTSTANDING_PRINCIPAL?.toFixed(2) || '0.00',
      record.TOTAL_INTEREST_RECEIVED?.toFixed(2) || '0.00',
      record.NUMBER_OF_LOANS || 0,
      record.ACTIVE_LOANS || 0,
      record.PORTFOLIO_AT_RISK?.toFixed(2) || '0.00',
      nplRatio.toFixed(2),
      record.YIELD_RATE?.toFixed(2) || '0.00',
      record.AVERAGE_LOAN_SIZE?.toFixed(2) || '0.00',
      record.STATUS
    ];
  });

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

export default LoanPortfolioController;