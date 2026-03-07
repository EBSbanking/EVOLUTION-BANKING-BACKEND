import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../../config/db.js';
import Thrift from '../models/Thrift.js';
import Transaction from '../models/Transaction.js'; // Import Transaction model

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import PDF generator
import { 
  generateThriftAccountsReport 
} from '../utils/pdfGenerator.js';

class ThriftReportController {
  /**
   * Generate Thrift Accounts Report (PDF or Excel)
   */
  static async generateThriftAccountsReport(req, res) {
    try {
      const { format = 'pdf', ...filters } = req.query;
      
      // Verify Thrift model is available
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
          'isActive'
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
      } else {
        // Generate PDF report (default)
        // Transform data to match PDF generator expectations
        const transformedAccounts = thriftAccounts.map(account => ({
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
          createdAt: account.created_at,
          updated_at: account.updated_at,
          last_collection_date: account.last_collection_date,
          account_type: account.account_type,
          total_contributions: parseFloat(account.total_contributions || 0),
          total_withdrawals: parseFloat(account.total_withdrawals || 0),
          is_active: account.isActive
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
      const { page = 1, limit = 50, ...filters } = req.query;
      const offset = (page - 1) * limit;

      // Verify Thrift model is available
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
          'isActive'
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
        acc.status === 'ACTIVE' || acc.status === 'active' || acc.isActive === true
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
            isActive: account.isActive
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
   * Get Thrift Transaction Summary (Credits and Debits)
   */
  static async getThriftTransactionSummary(req, res) {
    try {
      const { startDate, endDate, CUST_ID, ACCT_NO } = req.query;

      // Build date filter
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.TRANSACTIONDATE = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      } else if (startDate) {
        dateFilter.TRANSACTIONDATE = { [Op.gte]: new Date(startDate) };
      } else if (endDate) {
        dateFilter.TRANSACTIONDATE = { [Op.lte]: new Date(endDate) };
      }

      // Build account filter
      const accountFilter = {};
      if (CUST_ID) {
        accountFilter.CUST_ID = CUST_ID;
      }
      if (ACCT_NO) {
        accountFilter.ACCT_NO = ACCT_NO;
      }

      // Get total credits (DEPOSITS)
      const totalCredits = await Transaction.sum('AMOUNT', {
        where: {
          TRANSACTION_TYPE: {
            [Op.in]: ['DEPOSIT', 'SERVICE_FEE', 'THRIFT_OPENING', 'THRIFT_COLLECTION']
          },
          transactionDirection: 'CREDIT',
          ...dateFilter,
          ...accountFilter
        }
      });

      // Get total debits (WITHDRAWALS)
      const totalDebits = await Transaction.sum('AMOUNT', {
        where: {
          TRANSACTION_TYPE: {
            [Op.in]: ['WITHDRAWAL', 'THRIFT_WITHDRAWAL', 'THRIFT_TRANSFER']
          },
          transactionDirection: 'DEBIT',
          ...dateFilter,
          ...accountFilter
        }
      });

      // Get transaction counts by type
      const transactionCounts = await Transaction.findAll({
        where: {
          ...dateFilter,
          ...accountFilter
        },
        attributes: [
          'TRANSACTION_TYPE',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
        ],
        group: ['TRANSACTION_TYPE'],
        raw: true
      });

      // Get daily transaction summary
      const dailySummary = await Transaction.findAll({
        where: {
          ...dateFilter,
          ...accountFilter
        },
        attributes: [
          [sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE')), 'date'],
          [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount']
        ],
        group: [sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'))],
        order: [[sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE')), 'DESC']],
        raw: true
      });

      res.json({
        success: true,
        data: {
          summary: {
            totalCredits: parseFloat(totalCredits || 0),
            totalDebits: parseFloat(totalDebits || 0),
            netBalance: parseFloat((totalCredits || 0) - (totalDebits || 0)),
            transactionCount: transactionCounts.reduce((sum, t) => sum + parseInt(t.count || 0), 0)
          },
          transactionCounts,
          dailySummary
        }
      });

    } catch (error) {
      logger.error('Error fetching thrift transaction summary', { 
        error: error.message,
        stack: error.stack 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch transaction summary',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Get Thrift Accounts Summary Statistics (Enhanced with transaction data)
   */
  static async getThriftSummaryStatistics(req, res) {
    try {
      // Verify Thrift model is available
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
            { isActive: true }
          ]
        }
      });

      // Get total amounts using raw queries for better performance
      const [amountResult] = await sequelize.query(
        'SELECT COALESCE(SUM(AMOUNT), 0) as totalAmount FROM THRIFT_ACCOUNTS',
        { type: sequelize.QueryTypes.SELECT }
      );

      const [contributionsResult] = await sequelize.query(
        'SELECT COALESCE(SUM(total_contributions), 0) as totalContributions FROM THRIFT_ACCOUNTS',
        { type: sequelize.QueryTypes.SELECT }
      );

      const [withdrawalsResult] = await sequelize.query(
        'SELECT COALESCE(SUM(total_withdrawals), 0) as totalWithdrawals FROM THRIFT_ACCOUNTS',
        { type: sequelize.QueryTypes.SELECT }
      );

      // Get transaction summaries from Transaction table
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const startOfYear = new Date(today.getFullYear(), 0, 1);

      // Today's transactions
      const [todayCredits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('DEPOSIT', 'SERVICE_FEE', 'THRIFT_OPENING', 'THRIFT_COLLECTION')
         AND transaction_direction = 'CREDIT'
         AND transaction_date >= ? AND transaction_date < ?`,
        {
          replacements: [today, tomorrow],
          type: sequelize.QueryTypes.SELECT
        }
      );

      const [todayDebits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('WITHDRAWAL', 'THRIFT_WITHDRAWAL', 'THRIFT_TRANSFER')
         AND transaction_direction = 'DEBIT'
         AND transaction_date >= ? AND transaction_date < ?`,
        {
          replacements: [today, tomorrow],
          type: sequelize.QueryTypes.SELECT
        }
      );

      // Month to date
      const [monthCredits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('DEPOSIT', 'SERVICE_FEE', 'THRIFT_OPENING', 'THRIFT_COLLECTION')
         AND transaction_direction = 'CREDIT'
         AND transaction_date >= ?`,
        {
          replacements: [startOfMonth],
          type: sequelize.QueryTypes.SELECT
        }
      );

      const [monthDebits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('WITHDRAWAL', 'THRIFT_WITHDRAWAL', 'THRIFT_TRANSFER')
         AND transaction_direction = 'DEBIT'
         AND transaction_date >= ?`,
        {
          replacements: [startOfMonth],
          type: sequelize.QueryTypes.SELECT
        }
      );

      // Year to date
      const [yearCredits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('DEPOSIT', 'SERVICE_FEE', 'THRIFT_OPENING', 'THRIFT_COLLECTION')
         AND transaction_direction = 'CREDIT'
         AND transaction_date >= ?`,
        {
          replacements: [startOfYear],
          type: sequelize.QueryTypes.SELECT
        }
      );

      const [yearDebits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('WITHDRAWAL', 'THRIFT_WITHDRAWAL', 'THRIFT_TRANSFER')
         AND transaction_direction = 'DEBIT'
         AND transaction_date >= ?`,
        {
          replacements: [startOfYear],
          type: sequelize.QueryTypes.SELECT
        }
      );

      // Get collection type distribution
      const collectionStats = await Thrift.findAll({
        attributes: [
          'COLLECTION_TYPE',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
          [sequelize.fn('SUM', sequelize.col('total_contributions')), 'totalContributions'],
          [sequelize.fn('SUM', sequelize.col('total_withdrawals')), 'totalWithdrawals']
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
          accountSummary: {
            totalAccounts,
            activeAccounts,
            inactiveAccounts: totalAccounts - activeAccounts,
            totalBalance: parseFloat(amountResult?.totalAmount || 0),
            totalContributions: parseFloat(contributionsResult?.totalContributions || 0),
            totalWithdrawals: parseFloat(withdrawalsResult?.totalWithdrawals || 0),
            netContributions: parseFloat(contributionsResult?.totalContributions || 0) - parseFloat(withdrawalsResult?.totalWithdrawals || 0),
            recentAccounts
          },
          transactionSummary: {
            today: {
              credits: parseFloat(todayCredits?.total || 0),
              debits: parseFloat(todayDebits?.total || 0),
              net: parseFloat((todayCredits?.total || 0) - (todayDebits?.total || 0))
            },
            monthToDate: {
              credits: parseFloat(monthCredits?.total || 0),
              debits: parseFloat(monthDebits?.total || 0),
              net: parseFloat((monthCredits?.total || 0) - (monthDebits?.total || 0))
            },
            yearToDate: {
              credits: parseFloat(yearCredits?.total || 0),
              debits: parseFloat(yearDebits?.total || 0),
              net: parseFloat((yearCredits?.total || 0) - (yearDebits?.total || 0))
            }
          },
          collectionStats: collectionStats.map(stat => ({
            type: stat.COLLECTION_TYPE || 'UNKNOWN',
            count: parseInt(stat.count || 0),
            totalAmount: parseFloat(stat.totalAmount || 0),
            totalContributions: parseFloat(stat.totalContributions || 0),
            totalWithdrawals: parseFloat(stat.totalWithdrawals || 0)
          }))
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
      const { ...filters } = req.query;
      
      // Verify Thrift model is available
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
   * Get comprehensive thrift report with both account and transaction data
   */
  static async getComprehensiveThriftReport(req, res) {
    try {
      const { startDate, endDate } = req.query;

      // Build date filter for transactions
      const dateFilter = {};
      if (startDate && endDate) {
        dateFilter.TRANSACTIONDATE = {
          [Op.between]: [new Date(startDate), new Date(endDate)]
        };
      }

      // Get account summary
      const accountSummary = await Thrift.findAll({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalAccounts'],
          [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalBalance'],
          [sequelize.fn('SUM', sequelize.col('total_contributions')), 'totalContributions'],
          [sequelize.fn('SUM', sequelize.col('total_withdrawals')), 'totalWithdrawals'],
          [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'averageBalance']
        ],
        raw: true
      });

      // Get active accounts count
      const activeAccounts = await Thrift.count({
        where: { 
          [Op.or]: [
            { status: 'ACTIVE' },
            { isActive: true }
          ]
        }
      });

      // Get transaction summary
      const transactionSummary = await Transaction.findAll({
        where: dateFilter,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
          [sequelize.fn('SUM', 
            sequelize.literal("CASE WHEN transaction_direction = 'CREDIT' THEN amount ELSE 0 END")
          ), 'totalCredits'],
          [sequelize.fn('SUM', 
            sequelize.literal("CASE WHEN transaction_direction = 'DEBIT' THEN amount ELSE 0 END")
          ), 'totalDebits'],
          [sequelize.fn('SUM', 
            sequelize.literal("CASE WHEN transaction_type = 'SERVICE_FEE' THEN amount ELSE 0 END")
          ), 'totalFees']
        ],
        raw: true
      });

      // Get transaction counts by type
      const transactionsByType = await Transaction.findAll({
        where: dateFilter,
        attributes: [
          'TRANSACTION_TYPE',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
        ],
        group: ['TRANSACTION_TYPE'],
        raw: true
      });

      res.json({
        success: true,
        data: {
          period: {
            startDate: startDate || 'All time',
            endDate: endDate || 'Present'
          },
          accountSummary: {
            totalAccounts: parseInt(accountSummary[0]?.totalAccounts || 0),
            activeAccounts,
            inactiveAccounts: parseInt(accountSummary[0]?.totalAccounts || 0) - activeAccounts,
            totalBalance: parseFloat(accountSummary[0]?.totalBalance || 0),
            totalContributions: parseFloat(accountSummary[0]?.totalContributions || 0),
            totalWithdrawals: parseFloat(accountSummary[0]?.totalWithdrawals || 0),
            averageBalance: parseFloat(accountSummary[0]?.averageBalance || 0)
          },
          transactionSummary: {
            totalTransactions: parseInt(transactionSummary[0]?.totalTransactions || 0),
            totalCredits: parseFloat(transactionSummary[0]?.totalCredits || 0),
            totalDebits: parseFloat(transactionSummary[0]?.totalDebits || 0),
            totalFees: parseFloat(transactionSummary[0]?.totalFees || 0),
            netFlow: parseFloat((transactionSummary[0]?.totalCredits || 0) - (transactionSummary[0]?.totalDebits || 0))
          },
          transactionsByType
        }
      });

    } catch (error) {
      logger.error('Error generating comprehensive thrift report', { 
        error: error.message,
        stack: error.stack 
      });
      
      res.status(500).json({
        success: false,
        message: 'Failed to generate comprehensive thrift report',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Simple endpoint to check if thrift reports are working
   */
  static async getThriftReportStatus(req, res) {
    try {
      // Verify Thrift model is available
      if (!Thrift) {
        return res.json({
          success: false,
          message: 'Thrift model not available',
          modelsInitialized: false,
          timestamp: new Date().toISOString()
        });
      }

      // Get basic counts
      const totalAccounts = await Thrift.count();
      const activeAccounts = await Thrift.count({ 
        where: { 
          [Op.or]: [
            { status: 'ACTIVE' },
            { status: 'active' },
            { isActive: true }
          ]
        }
      });

      // Get transaction counts
      const totalTransactions = await Transaction.count();
      const totalCredits = await Transaction.sum('AMOUNT', {
        where: { transactionDirection: 'CREDIT' }
      });
      const totalDebits = await Transaction.sum('AMOUNT', {
        where: { transactionDirection: 'DEBIT' }
      });

      res.json({
        success: true,
        message: 'Thrift reports are working',
        data: {
          modelAvailable: true,
          accountStats: {
            totalAccounts,
            activeAccounts
          },
          transactionStats: {
            totalTransactions,
            totalCredits: parseFloat(totalCredits || 0),
            totalDebits: parseFloat(totalDebits || 0)
          },
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