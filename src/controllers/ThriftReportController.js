import { Op } from 'sequelize';
import { 
  getThrift, 
  initModels,
  areModelsInitialized 
} from '../utils/modelLoader.js';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import PDF generator
import { 
  generateThriftAccountsReport 
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

      // Also filter by account number or customer ID if provided
      if (filters.ACCT_NO) {
        where.ACCT_NO = { [Op.like]: `%${filters.ACCT_NO}%` };
      }
      
      if (filters.CUST_ID) {
        where.CUST_ID = { [Op.like]: `%${filters.CUST_ID}%` };
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
        order: [['created_at', 'DESC']],
        raw: true // Get plain objects instead of Sequelize instances
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
        // Generate Excel report - Note: You need to implement this function
        return res.status(501).json({
          success: false,
          message: 'Excel report generation is not implemented yet',
          suggestion: 'Use PDF format instead'
        });
        
        /* If you have Excel generation implemented:
        const excelPath = generateThriftAccountsExcelReport(thriftAccounts, filters);
        
        res.download(excelPath, `thrift_accounts_report_${new Date().toISOString().split('T')[0]}.xlsx`, (err) => {
          if (err) {
            logger.error('Error downloading Excel report', { error: err.message });
          }
          // Cleanup file after download
          setTimeout(() => cleanupReportFiles(excelPath), 5000);
        });
        */
      } else {
        // Generate PDF report (default)
        // Transform data to match PDF generator expectations
        const transformedAccounts = thriftAccounts.map(account => ({
          // Map Sequelize field names to PDF generator expected names
          id: account.id,
          CUST_ID: account.CUST_ID || '',
          ACCT_NO: account.ACCT_NO || '',
          ACCT_ID: account.ACCT_ID || '',
          FIRST_NAME: account.FIRST_NAME || '',
          LASTNAME: account.LASTNAME || '',
          FULL_NAME: account.FULL_NAME || `${account.FIRST_NAME || ''} ${account.LASTNAME || ''}`.trim(),
          RELATIONSHIP_MANAGER: account.RELATIONSHIP_MANAGER || '',
          AMOUNT: parseFloat(account.AMOUNT || 0),
          COLLECTION_TYPE: account.COLLECTION_TYPE || '',
          OPENED_DT: account.OPENED_DT,
          status: account.status || 'active',
          opening_date: account.opening_date,
          created_at: account.created_at,
          createdAt: account.created_at, // For PDF generator
          updated_at: account.updated_at,
          last_collection_date: account.last_collection_date,
          account_type: account.account_type,
          total_contributions: parseFloat(account.total_contributions || 0),
          total_withdrawals: parseFloat(account.total_withdrawals || 0),
          is_active: account.is_active
        }));

        await generateThriftAccountsReport(transformedAccounts, filters, res);
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
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
        const searchTerm = `%${filters.search}%`;
        where[Op.or] = [
          { CUST_ID: { [Op.like]: searchTerm } },
          { ACCT_NO: { [Op.like]: searchTerm } },
          { FULL_NAME: { [Op.like]: searchTerm } },
          { FIRST_NAME: { [Op.like]: searchTerm } },
          { LASTNAME: { [Op.like]: searchTerm } }
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
        limit: parseInt(limit),
        raw: true
      });

      // Calculate summary statistics
      const totalAmount = thriftAccounts.reduce((sum, account) => sum + parseFloat(account.AMOUNT || 0), 0);
      const totalContributions = thriftAccounts.reduce((sum, account) => sum + parseFloat(account.total_contributions || 0), 0);
      const totalWithdrawals = thriftAccounts.reduce((sum, account) => sum + parseFloat(account.total_withdrawals || 0), 0);
      
      const activeAccounts = thriftAccounts.filter(acc => 
        acc.status === 'ACTIVE' || acc.status === 'active' || acc.is_active === true
      ).length;
      
      const collectionTypeStats = thriftAccounts.reduce((acc, account) => {
        const type = account.COLLECTION_TYPE || 'UNKNOWN';
        if (!acc[type]) {
          acc[type] = { 
            count: 0, 
            totalAmount: 0,
            totalContributions: 0,
            totalWithdrawals: 0
          };
        }
        acc[type].count++;
        acc[type].totalAmount += parseFloat(account.AMOUNT || 0);
        acc[type].totalContributions += parseFloat(account.total_contributions || 0);
        acc[type].totalWithdrawals += parseFloat(account.total_withdrawals || 0);
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
            FULL_NAME: account.FULL_NAME || `${account.FIRST_NAME || ''} ${account.LASTNAME || ''}`.trim(),
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
            totalContributions,
            totalWithdrawals,
            netContributions: totalContributions - totalWithdrawals,
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
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
        where: { 
          [Op.or]: [
            { status: 'ACTIVE' },
            { status: 'active' },
            { is_active: true }
          ]
        }
      });

      // Get total amounts using raw queries for better performance
      const [amountResult] = await Thrift.sequelize.query(
        'SELECT COALESCE(SUM(AMOUNT), 0) as totalAmount FROM THRIFT_ACCOUNTS',
        { type: Thrift.sequelize.QueryTypes.SELECT }
      );

      const [contributionsResult] = await Thrift.sequelize.query(
        'SELECT COALESCE(SUM(total_contributions), 0) as totalContributions FROM THRIFT_ACCOUNTS',
        { type: Thrift.sequelize.QueryTypes.SELECT }
      );

      const [withdrawalsResult] = await Thrift.sequelize.query(
        'SELECT COALESCE(SUM(total_withdrawals), 0) as totalWithdrawals FROM THRIFT_ACCOUNTS',
        { type: Thrift.sequelize.QueryTypes.SELECT }
      );

      // Get collection type distribution
      const collectionStats = await Thrift.findAll({
        attributes: [
          'COLLECTION_TYPE',
          [Thrift.sequelize.fn('COUNT', Thrift.sequelize.col('id')), 'count'],
          [Thrift.sequelize.fn('SUM', Thrift.sequelize.col('AMOUNT')), 'totalAmount'],
          [Thrift.sequelize.fn('SUM', Thrift.sequelize.col('total_contributions')), 'totalContributions'],
          [Thrift.sequelize.fn('SUM', Thrift.sequelize.col('total_withdrawals')), 'totalWithdrawals']
        ],
        group: ['COLLECTION_TYPE'],
        raw: true
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
            totalAmount: parseFloat(amountResult?.totalAmount || 0),
            totalContributions: parseFloat(contributionsResult?.totalContributions || 0),
            totalWithdrawals: parseFloat(withdrawalsResult?.totalWithdrawals || 0),
            netContributions: parseFloat(contributionsResult?.totalContributions || 0) - parseFloat(withdrawalsResult?.totalWithdrawals || 0),
            recentAccounts,
            collectionStats: collectionStats.map(stat => ({
              type: stat.COLLECTION_TYPE || 'UNKNOWN',
              count: parseInt(stat.count || 0),
              totalAmount: parseFloat(stat.totalAmount || 0),
              totalContributions: parseFloat(stat.totalContributions || 0),
              totalWithdrawals: parseFloat(stat.totalWithdrawals || 0)
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
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Export Thrift Accounts to CSV
   */
  static async exportThriftAccountsToCSV(req, res) {
    try {
      await ensureModelsInitialized();
      
      const { ...filters } = req.query;
      const Thrift = getThrift();
      
      if (!Thrift) {
        return res.status(500).json({
          success: false,
          message: 'Thrift model not available'
        });
      }

      // Build query conditions
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

      // Fetch all matching accounts
      const thriftAccounts = await Thrift.findAll({
        where,
        attributes: [
          'CUST_ID', 
          'ACCT_NO', 
          'FULL_NAME', 
          'RELATIONSHIP_MANAGER', 
          'AMOUNT', 
          'COLLECTION_TYPE', 
          'OPENED_DT', 
          'status', 
          'total_contributions', 
          'total_withdrawals'
        ],
        order: [['created_at', 'DESC']],
        raw: true
      });

      if (!thriftAccounts || thriftAccounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No thrift accounts found matching the criteria'
        });
      }

      // Create CSV content
      const headers = [
        'Customer ID',
        'Account Number', 
        'Full Name',
        'Relationship Manager',
        'Current Balance (₦)',
        'Total Contributions (₦)',
        'Total Withdrawals (₦)',
        'Collection Type',
        'Opened Date',
        'Status'
      ];

      let csvContent = headers.join(',') + '\n';

      thriftAccounts.forEach(account => {
        const row = [
          `"${account.CUST_ID || ''}"`,
          `"${account.ACCT_NO || ''}"`,
          `"${account.FULL_NAME || ''}"`,
          `"${account.RELATIONSHIP_MANAGER || ''}"`,
          parseFloat(account.AMOUNT || 0).toFixed(2),
          parseFloat(account.total_contributions || 0).toFixed(2),
          parseFloat(account.total_withdrawals || 0).toFixed(2),
          `"${account.COLLECTION_TYPE || ''}"`,
          `"${account.OPENED_DT ? new Date(account.OPENED_DT).toLocaleDateString() : ''}"`,
          `"${account.status || ''}"`
        ];
        csvContent += row.join(',') + '\n';
      });

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=thrift_accounts_${new Date().toISOString().split('T')[0]}.csv`);
      
      res.send(csvContent);

    } catch (error) {
      logger.error('Error exporting thrift accounts to CSV', { 
        error: error.message,
        stack: error.stack 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to export thrift accounts to CSV',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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
      const activeAccounts = await Thrift.count({ 
        where: { 
          [Op.or]: [
            { status: 'ACTIVE' },
            { status: 'active' },
            { is_active: true }
          ]
        }
      });

      res.json({
        success: true,
        message: 'Thrift reports are working',
        data: {
          modelAvailable: true,
          totalAccounts,
          activeAccounts,
          modelsInitialized: true,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      res.json({
        success: false,
        message: 'Thrift reports initialization error',
        error: error.message,
        modelsInitialized: false,
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default ThriftReportController;