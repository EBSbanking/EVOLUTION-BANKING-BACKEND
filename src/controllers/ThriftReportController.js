import { Op } from 'sequelize';
import { 
  getThrift, 
  initModels,
  areModelsInitialized 
} from '../utils/modelLoader.js';
import logger from '../utils/logger.js';

// Note: You need to implement or adjust your PDF/Excel generators to work with Sequelize data
import { 
  generateThriftAccountsReport, 
  generateThriftAccountsExcelReport, 
  cleanupReportFiles 
} from '../utils/pdfGenerator.js';

// Initialize models on first use
let modelsInitialized = false;

async function ensureModelsInitialized() {
  if (!modelsInitialized) {
    console.log('🔄 Ensuring models are initialized for ThriftReportController...');
    
    try {
      // Initialize models
      await initModels();
      
      // Verify we have the Thrift model
      const Thrift = getThrift();
      
      if (!Thrift) {
        throw new Error('Thrift model not available after initialization');
      }
      
      modelsInitialized = true;
      console.log('✅ ThriftReportController models ready for use');
    } catch (error) {
      console.error('❌ Failed to initialize models for ThriftReportController:', error);
      throw error;
    }
  }
}

class ThriftReportController {
  /**
   * Generate Thrift Accounts Report (PDF or Excel)
   */
  static async generateThriftAccountsReport(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      const { format = 'pdf', ...filters } = req.query;
      
      // Get the Thrift model
      const Thrift = getThrift();
      if (!Thrift) {
        return res.status(500).json({
          success: false,
          message: 'Thrift model not available'
        });
      }

      // Build query conditions for Sequelize
      const where = {};
      
      if (filters.COLLECTION_TYPE) {
        where.COLLECTION_TYPE = filters.COLLECTION_TYPE.toUpperCase();
      }
      
      if (filters.status) {
        where.status = filters.status;
      }
      
      if (filters.RELATIONSHIP_MANAGER) {
        where.RELATIONSHIP_MANAGER = { [Op.like]: `%${filters.RELATIONSHIP_MANAGER}%` };
      }
      
      if (filters.startDate && filters.endDate) {
        where.created_at = {
          [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)]
        };
      }

      // Fetch thrift accounts with selected fields
      const thriftAccounts = await Thrift.findAll({
        where,
        attributes: [
          'id',
          'CUST_ID', 
          'ACCT_NO', 
          'ACCT_ID', 
          'FIRST_NAME', 
          'LASTNAME', 
          'FULL_NAME', 
          'RELATIONSHIP_MANAGER', 
          'AMOUNT', 
          'COLLECTION_TYPE', 
          'OPENED_DT', 
          'status', 
          'opening_date', 
          'created_at', 
          'updated_at', 
          'last_collection_date', 
          'account_type', 
          'total_contributions', 
          'total_withdrawals', 
          'is_active'
        ],
        order: [['created_at', 'DESC']]
      });

      if (!thriftAccounts || thriftAccounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No thrift accounts found matching the criteria'
        });
      }

      logger.info(`Generating thrift accounts report for ${thriftAccounts.length} accounts`, {
        format,
        filters,
        user: req.user?.user_name
      });

      if (format.toLowerCase() === 'excel') {
        // Generate Excel report
        const excelPath = generateThriftAccountsExcelReport(thriftAccounts, filters);
        
        res.download(excelPath, `thrift_accounts_report_${new Date().toISOString().split('T')[0]}.xlsx`, (err) => {
          if (err) {
            logger.error('Error downloading Excel report', { error: err.message });
          }
          // Cleanup file after download
          setTimeout(() => cleanupReportFiles(excelPath), 5000);
        });
      } else {
        // Generate PDF report (default)
        await generateThriftAccountsReport(thriftAccounts, filters, res);
      }

    } catch (error) {
      logger.error('Error generating thrift accounts report', { 
        error: error.message,
        stack: error.stack,
        user: req.user?.user_name 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to generate thrift accounts report',
        error: error.message
      });
    }
  }

  /**
   * Get Thrift Accounts for reporting (API endpoint)
   */
  static async getThriftAccountsForReport(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      const { page = 1, limit = 50, ...filters } = req.query;
      const offset = (page - 1) * limit;

      // Get the Thrift model
      const Thrift = getThrift();
      if (!Thrift) {
        return res.status(500).json({
          success: false,
          message: 'Thrift model not available'
        });
      }

      // Build query conditions for Sequelize
      const where = {};
      
      if (filters.COLLECTION_TYPE) {
        where.COLLECTION_TYPE = filters.COLLECTION_TYPE.toUpperCase();
      }
      
      if (filters.status) {
        where.status = filters.status;
      }
      
      if (filters.RELATIONSHIP_MANAGER) {
        where.RELATIONSHIP_MANAGER = { [Op.like]: `%${filters.RELATIONSHIP_MANAGER}%` };
      }
      
      if (filters.search) {
        where[Op.or] = [
          { CUST_ID: { [Op.like]: `%${filters.search}%` } },
          { ACCT_NO: { [Op.like]: `%${filters.search}%` } },
          { FULL_NAME: { [Op.like]: `%${filters.search}%` } },
          { FIRST_NAME: { [Op.like]: `%${filters.search}%` } },
          { LASTNAME: { [Op.like]: `%${filters.search}%` } }
        ];
      }

      // Fetch thrift accounts with pagination using Sequelize
      const { count, rows: thriftAccounts } = await Thrift.findAndCountAll({
        where,
        attributes: [
          'id',
          'CUST_ID', 
          'ACCT_NO', 
          'ACCT_ID', 
          'FIRST_NAME', 
          'LASTNAME', 
          'FULL_NAME', 
          'RELATIONSHIP_MANAGER', 
          'AMOUNT', 
          'COLLECTION_TYPE', 
          'OPENED_DT', 
          'status', 
          'opening_date', 
          'created_at', 
          'updated_at', 
          'last_collection_date', 
          'account_type', 
          'total_contributions', 
          'total_withdrawals', 
          'is_active'
        ],
        order: [['created_at', 'DESC']],
        offset: parseInt(offset),
        limit: parseInt(limit)
      });

      // Calculate summary statistics
      const totalAmount = thriftAccounts.reduce((sum, account) => sum + parseFloat(account.AMOUNT || 0), 0);
      const activeAccounts = thriftAccounts.filter(acc => acc.status === 'ACTIVE').length;
      
      const collectionTypeStats = thriftAccounts.reduce((acc, account) => {
        const type = account.COLLECTION_TYPE || 'UNKNOWN';
        if (!acc[type]) {
          acc[type] = { count: 0, totalAmount: 0 };
        }
        acc[type].count++;
        acc[type].totalAmount += parseFloat(account.AMOUNT || 0);
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          thriftAccounts: thriftAccounts.map(account => ({
            id: account.id,
            CUST_ID: account.CUST_ID,
            ACCT_NO: account.ACCT_NO,
            ACCT_ID: account.ACCT_ID,
            FIRST_NAME: account.FIRST_NAME,
            LASTNAME: account.LASTNAME,
            FULL_NAME: account.FULL_NAME,
            RELATIONSHIP_MANAGER: account.RELATIONSHIP_MANAGER,
            AMOUNT: parseFloat(account.AMOUNT || 0),
            COLLECTION_TYPE: account.COLLECTION_TYPE,
            OPENED_DT: account.OPENED_DT,
            status: account.status,
            openingDate: account.opening_date,
            createdAt: account.created_at,
            updatedAt: account.updated_at,
            lastCollectionDate: account.last_collection_date,
            accountType: account.account_type,
            totalContributions: parseFloat(account.total_contributions || 0),
            totalWithdrawals: parseFloat(account.total_withdrawals || 0),
            isActive: account.is_active
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: count,
            pages: Math.ceil(count / limit)
          },
          summary: {
            totalAccounts: count,
            totalAmount,
            activeAccounts,
            inactiveAccounts: count - activeAccounts,
            collectionTypeStats
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching thrift accounts for report', { 
        error: error.message,
        stack: error.stack 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch thrift accounts',
        error: error.message
      });
    }
  }

  /**
   * Get Thrift Accounts Summary Statistics
   */
  static async getThriftSummaryStatistics(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      const Thrift = getThrift();
      if (!Thrift) {
        return res.status(500).json({
          success: false,
          message: 'Thrift model not available'
        });
      }

      // Get total count
      const totalAccounts = await Thrift.count();

      // Get active accounts count
      const activeAccounts = await Thrift.count({
        where: { status: 'ACTIVE' }
      });

      // Get total amount - using raw query for SUM since Sequelize cast is complex
      const totalAmountResult = await Thrift.sequelize.query(
        'SELECT SUM(AMOUNT) as totalAmount FROM THRIFT_ACCOUNTS',
        { type: Thrift.sequelize.QueryTypes.SELECT }
      );

      // Get collection type distribution
      const collectionStats = await Thrift.findAll({
        attributes: [
          'COLLECTION_TYPE',
          [Thrift.sequelize.fn('COUNT', Thrift.sequelize.col('id')), 'count'],
          [Thrift.sequelize.fn('SUM', Thrift.sequelize.col('AMOUNT')), 'totalAmount']
        ],
        group: ['COLLECTION_TYPE']
      });

      // Get recent accounts (last 7 days)
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const recentAccounts = await Thrift.count({
        where: {
          created_at: {
            [Op.gte]: oneWeekAgo
          }
        }
      });

      res.json({
        success: true,
        data: {
          summary: {
            totalAccounts,
            activeAccounts,
            inactiveAccounts: totalAccounts - activeAccounts,
            totalAmount: parseFloat(totalAmountResult[0]?.totalAmount || 0),
            recentAccounts,
            collectionStats: collectionStats.map(stat => ({
              type: stat.COLLECTION_TYPE,
              count: parseInt(stat.dataValues.count || 0),
              totalAmount: parseFloat(stat.dataValues.totalAmount || 0)
            }))
          }
        }
      });

    } catch (error) {
      logger.error('Error fetching thrift summary statistics', { 
        error: error.message,
        stack: error.stack 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch thrift summary statistics',
        error: error.message
      });
    }
  }

  /**
   * Simple endpoint to check if thrift reports are working
   */
  static async getThriftReportStatus(req, res) {
    try {
      // Ensure models are initialized
      await ensureModelsInitialized();
      
      const Thrift = getThrift();
      
      if (!Thrift) {
        return res.json({
          success: false,
          message: 'Thrift model not available'
        });
      }

      // Get basic counts
      const totalAccounts = await Thrift.count();
      const activeAccounts = await Thrift.count({ where: { status: 'ACTIVE' } });

      res.json({
        success: true,
        message: 'Thrift reports are working',
        data: {
          modelAvailable: true,
          totalAccounts,
          activeAccounts,
          modelsInitialized: true
        }
      });

    } catch (error) {
      res.json({
        success: false,
        message: 'Thrift reports initialization error',
        error: error.message,
        modelsInitialized: false
      });
    }
  }
}

export default ThriftReportController;