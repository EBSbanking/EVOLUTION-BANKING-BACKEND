import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import sequelize from '../../config/db.js';
import Thrift from '../models/Thrift.js';
import Transaction from '../models/Transaction.js';
import ExcelJS from 'exceljs'; // Static import – DO NOT use dynamic import inside methods

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
   * @route GET /api/thrift-reports/generate
   * @access Private
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
      
      // Apply filters
      if (filters.COLLECTION_TYPE) {
        where.COLLECTION_TYPE = filters.COLLECTION_TYPE.toUpperCase();
      }
      
      if (filters.status) {
        where.status = filters.status.toUpperCase();
      }
      
      if (filters.RELATIONSHIP_MANAGER) {
        where.RELATIONSHIP_MANAGER = { [Op.like]: `%${filters.RELATIONSHIP_MANAGER}%` };
      }
      
      if (filters.startDate && filters.endDate) {
        where.created_at = {
          [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)]
        };
      } else if (filters.startDate) {
        where.created_at = { [Op.gte]: new Date(filters.startDate) };
      } else if (filters.endDate) {
        where.created_at = { [Op.lte]: new Date(filters.endDate) };
      }

      // Filter by account number or customer ID
      if (filters.ACCT_NO) {
        where.ACCT_NO = { [Op.like]: `%${filters.ACCT_NO}%` };
      }
      
      if (filters.CUST_ID) {
        where.CUST_ID = { [Op.like]: `%${filters.CUST_ID}%` };
      }

      // Filter by minimum or maximum amount
      if (filters.minAmount) {
        where.AMOUNT = { ...where.AMOUNT, [Op.gte]: parseFloat(filters.minAmount) };
      }
      if (filters.maxAmount) {
        where.AMOUNT = { ...where.AMOUNT, [Op.lte]: parseFloat(filters.maxAmount) };
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
        raw: true
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
        return await ThriftReportController.generateExcelReport(thriftAccounts, filters, res);
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
   * Generate Excel Report Helper Method
   * @private
   */
  static async generateExcelReport(accounts, filters, res) {
    try {
      // Using static import at top – no dynamic import needed
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Thrift System';
      workbook.lastModifiedBy = 'Thrift System';
      workbook.created = new Date();
      workbook.modified = new Date();
      
      const worksheet = workbook.addWorksheet('Thrift Accounts', {
        properties: { tabColor: { argb: 'FF2E75B6' } },
        pageSetup: { paperSize: 9, orientation: 'landscape' }
      });

      // Add title
      worksheet.mergeCells('A1:J1');
      const titleRow = worksheet.getRow(1);
      titleRow.getCell(1).value = 'THRIFT ACCOUNTS REPORT';
      titleRow.getCell(1).font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
      titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF2E75B6' }
      };
      titleRow.height = 30;

      // Add generation date
      worksheet.mergeCells('A2:J2');
      const dateRow = worksheet.getRow(2);
      dateRow.getCell(1).value = `Generated on: ${new Date().toLocaleString()}`;
      dateRow.getCell(1).font = { italic: true };
      dateRow.getCell(1).alignment = { horizontal: 'center' };

      // Add filter summary if filters applied
      if (Object.keys(filters).length > 0) {
        worksheet.mergeCells('A3:J3');
        const filterRow = worksheet.getRow(3);
        const filterSummary = Object.entries(filters)
          .map(([key, value]) => `${key}: ${value}`)
          .join(' | ');
        filterRow.getCell(1).value = `Filters: ${filterSummary}`;
        filterRow.getCell(1).font = { italic: true, color: { argb: 'FF666666' } };
      }

      // Add headers
      const headers = [
        'S/N', 'Customer ID', 'Account No', 'Full Name', 
        'Relationship Manager', 'Amount (₦)', 'Collection Type',
        'Opened Date', 'Status', 'Last Collection'
      ];
      
      const headerRow = worksheet.addRow(headers);
      headerRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

      // Add data rows
      accounts.forEach((account, index) => {
        const row = worksheet.addRow([
          index + 1,
          account.CUST_ID || '',
          account.ACCT_NO || '',
          account.FULL_NAME || `${account.FIRST_NAME || ''} ${account.LASTNAME || ''}`.trim(),
          account.RELATIONSHIP_MANAGER || '',
          parseFloat(account.AMOUNT || 0),
          account.COLLECTION_TYPE || '',
          account.OPENED_DT ? new Date(account.OPENED_DT).toLocaleDateString() : '',
          account.status || '',
          account.last_collection_date ? new Date(account.last_collection_date).toLocaleDateString() : ''
        ]);

        // Style the row
        row.eachCell((cell, colNumber) => {
          cell.alignment = { vertical: 'middle' };
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' }
          };
          
          // Format amount column as currency
          if (colNumber === 6) {
            cell.numFmt = '₦#,##0.00';
            cell.alignment = { horizontal: 'right', vertical: 'middle' };
          }
          
          // Center align specific columns
          if ([1, 7, 8, 9, 10].includes(colNumber)) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
          }
        });

        // Alternate row colors
        if (index % 2 === 1) {
          row.eachCell(cell => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF2F2F2' }
            };
          });
        }
      });

      // Add summary row
      const totalRow = worksheet.addRow([
        'TOTAL', '', '', '', '',
        accounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0),
        '', '', '', ''
      ]);
      
      totalRow.eachCell((cell, colNumber) => {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD9E1F2' }
        };
        if (colNumber === 6) {
          cell.numFmt = '₦#,##0.00';
        }
      });

      // Auto-fit columns
      worksheet.columns.forEach(column => {
        column.width = 18;
      });

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=thrift_accounts_${new Date().toISOString().split('T')[0]}.xlsx`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      logger.error('Error generating Excel report', { error: error.message });
      throw error;
    }
  }

  /**
   * Get Thrift Accounts for reporting (API endpoint)
   * @route GET /api/thrift-reports/accounts
   * @access Private
   */
  static async getThriftAccountsForReport(req, res) {
    try {
      const { page = 1, limit = 50, sortBy = 'created_at', sortOrder = 'DESC', ...filters } = req.query;
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
        where.status = filters.status.toUpperCase();
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
          { LASTNAME: { [Op.like]: searchTerm } },
          { RELATIONSHIP_MANAGER: { [Op.like]: searchTerm } }
        ];
      }

      if (filters.startDate && filters.endDate) {
        where.created_at = {
          [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)]
        };
      }

      // Validate sort field to prevent SQL injection
      const validSortFields = ['created_at', 'AMOUNT', 'FULL_NAME', 'status', 'COLLECTION_TYPE'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_at';
      const sortDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      // Fetch thrift accounts with pagination
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
        order: [[sortField, sortDirection]],
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
            pages: Math.ceil(count / limit),
            sortBy: sortField,
            sortOrder: sortDirection
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
   * @route GET /api/thrift-reports/transactions/summary
   * @access Private
   */
  static async getThriftTransactionSummary(req, res) {
    try {
      const { startDate, endDate, CUST_ID, ACCT_NO, groupBy = 'day' } = req.query;

      // Validate dates
      if (startDate && isNaN(new Date(startDate).getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid start date format'
        });
      }
      
      if (endDate && isNaN(new Date(endDate).getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid end date format'
        });
      }

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

      // Get grouped transaction summary based on groupBy parameter
      let groupExpression;
      let orderExpression;
      
      switch(groupBy) {
        case 'hour':
          groupExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m-%d %H:00');
          orderExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m-%d %H:00');
          break;
        case 'day':
          groupExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
          orderExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
          break;
        case 'week':
          groupExpression = sequelize.fn('YEARWEEK', sequelize.col('TRANSACTIONDATE'));
          orderExpression = sequelize.fn('YEARWEEK', sequelize.col('TRANSACTIONDATE'));
          break;
        case 'month':
          groupExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m');
          orderExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m');
          break;
        default:
          groupExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
          orderExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
      }

      const groupedSummary = await Transaction.findAll({
        where: {
          ...dateFilter,
          ...accountFilter
        },
        attributes: [
          [groupExpression, 'period'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN transaction_direction = 'CREDIT' THEN amount ELSE 0 END")), 'credits'],
          [sequelize.fn('SUM', sequelize.literal("CASE WHEN transaction_direction = 'DEBIT' THEN amount ELSE 0 END")), 'debits'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount']
        ],
        group: [groupExpression],
        order: [[orderExpression, 'DESC']],
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
          groupedSummary,
          period: {
            startDate: startDate || 'All time',
            endDate: endDate || 'Present',
            groupBy
          }
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
   * @route GET /api/thrift-reports/summary
   * @access Private
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
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - today.getDay());

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

      // This week
      const [weekCredits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('DEPOSIT', 'SERVICE_FEE', 'THRIFT_OPENING', 'THRIFT_COLLECTION')
         AND transaction_direction = 'CREDIT'
         AND transaction_date >= ?`,
        {
          replacements: [startOfWeek],
          type: sequelize.QueryTypes.SELECT
        }
      );

      const [weekDebits] = await sequelize.query(
        `SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
         WHERE transaction_type IN ('WITHDRAWAL', 'THRIFT_WITHDRAWAL', 'THRIFT_TRANSFER')
         AND transaction_direction = 'DEBIT'
         AND transaction_date >= ?`,
        {
          replacements: [startOfWeek],
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

      // Get status distribution
      const statusStats = await Thrift.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
        ],
        group: ['status'],
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

      // Get top accounts by balance
      const topAccounts = await Thrift.findAll({
        where: { status: 'ACTIVE' },
        attributes: ['FULL_NAME', 'ACCT_NO', 'AMOUNT'],
        order: [['AMOUNT', 'DESC']],
        limit: 10,
        raw: true
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
            recentAccounts,
            averageBalance: totalAccounts > 0 ? parseFloat(amountResult?.totalAmount || 0) / totalAccounts : 0
          },
          transactionSummary: {
            today: {
              credits: parseFloat(todayCredits?.total || 0),
              debits: parseFloat(todayDebits?.total || 0),
              net: parseFloat((todayCredits?.total || 0) - (todayDebits?.total || 0))
            },
            thisWeek: {
              credits: parseFloat(weekCredits?.total || 0),
              debits: parseFloat(weekDebits?.total || 0),
              net: parseFloat((weekCredits?.total || 0) - (weekDebits?.total || 0))
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
          distribution: {
            collectionStats: collectionStats.map(stat => ({
              type: stat.COLLECTION_TYPE || 'UNKNOWN',
              count: parseInt(stat.count || 0),
              totalAmount: parseFloat(stat.totalAmount || 0),
              totalContributions: parseFloat(stat.totalContributions || 0),
              totalWithdrawals: parseFloat(stat.totalWithdrawals || 0)
            })),
            statusStats: statusStats.map(stat => ({
              status: stat.status || 'UNKNOWN',
              count: parseInt(stat.count || 0),
              totalAmount: parseFloat(stat.totalAmount || 0)
            }))
          },
          topAccounts: topAccounts.map(acc => ({
            name: acc.FULL_NAME,
            accountNo: acc.ACCT_NO,
            balance: parseFloat(acc.AMOUNT || 0)
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
   * @route GET /api/thrift-reports/export/csv
   * @access Private
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
        where.status = filters.status.toUpperCase();
      }
      
      if (filters.RELATIONSHIP_MANAGER) {
        where.RELATIONSHIP_MANAGER = { [Op.like]: `%${filters.RELATIONSHIP_MANAGER}%` };
      }

      if (filters.startDate && filters.endDate) {
        where.created_at = {
          [Op.between]: [new Date(filters.startDate), new Date(filters.endDate)]
        };
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
          'total_withdrawals',
          'last_collection_date',
          'account_type',
          'isActive'
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
        'Net Balance (₦)',
        'Collection Type',
        'Account Type',
        'Opened Date',
        'Last Collection Date',
        'Status',
        'Is Active'
      ];

      let csvContent = '\uFEFF' + headers.join(',') + '\n'; // Add BOM for UTF-8

      thriftAccounts.forEach(account => {
        const netBalance = parseFloat(account.total_contributions || 0) - parseFloat(account.total_withdrawals || 0);
        const row = [
          `"${(account.CUST_ID || '').replace(/"/g, '""')}"`,
          `"${(account.ACCT_NO || '').replace(/"/g, '""')}"`,
          `"${(account.FULL_NAME || '').replace(/"/g, '""')}"`,
          `"${(account.RELATIONSHIP_MANAGER || '').replace(/"/g, '""')}"`,
          parseFloat(account.AMOUNT || 0).toFixed(2),
          parseFloat(account.total_contributions || 0).toFixed(2),
          parseFloat(account.total_withdrawals || 0).toFixed(2),
          netBalance.toFixed(2),
          `"${(account.COLLECTION_TYPE || '').replace(/"/g, '""')}"`,
          `"${(account.account_type || '').replace(/"/g, '""')}"`,
          `"${account.OPENED_DT ? new Date(account.OPENED_DT).toLocaleDateString() : ''}"`,
          `"${account.last_collection_date ? new Date(account.last_collection_date).toLocaleDateString() : ''}"`,
          `"${(account.status || '').replace(/"/g, '""')}"`,
          account.isActive ? 'Yes' : 'No'
        ];
        csvContent += row.join(',') + '\n';
      });

      // Add summary rows
      csvContent += '\n';
      csvContent += '"SUMMARY",,,,,,,,,\n';
      
      const totalBalance = thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.AMOUNT || 0), 0);
      const totalContributions = thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.total_contributions || 0), 0);
      const totalWithdrawals = thriftAccounts.reduce((sum, acc) => sum + parseFloat(acc.total_withdrawals || 0), 0);
      const activeCount = thriftAccounts.filter(acc => acc.isActive || acc.status === 'ACTIVE').length;
      
      csvContent += `"Total Accounts",${thriftAccounts.length},,,,,\n`;
      csvContent += `"Active Accounts",${activeCount},,,,,\n`;
      csvContent += `"Inactive Accounts",${thriftAccounts.length - activeCount},,,,,\n`;
      csvContent += `"Total Balance",${totalBalance.toFixed(2)},,,,,\n`;
      csvContent += `"Total Contributions",${totalContributions.toFixed(2)},,,,,\n`;
      csvContent += `"Total Withdrawals",${totalWithdrawals.toFixed(2)},,,,,\n`;
      csvContent += `"Generated On",${new Date().toLocaleString()},,,,,\n`;

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=thrift_accounts_${new Date().toISOString().split('T')[0]}.csv`);
      res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
      
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
   * @route GET /api/thrift-reports/comprehensive
   * @access Private
   */
  static async getComprehensiveThriftReport(req, res) {
    try {
      const { startDate, endDate, includeTransactions = true, groupBy = 'day' } = req.query;

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
          [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'averageBalance'],
          [sequelize.fn('MAX', sequelize.col('AMOUNT')), 'maxBalance'],
          [sequelize.fn('MIN', sequelize.col('AMOUNT')), 'minBalance']
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

      // Get account type distribution
      const accountTypeStats = await Thrift.findAll({
        attributes: [
          'account_type',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
        ],
        group: ['account_type'],
        raw: true
      });

      let transactionData = null;
      
      if (includeTransactions) {
        // Determine grouping based on groupBy parameter
        let groupExpression;
        let orderExpression;
        
        switch(groupBy) {
          case 'hour':
            groupExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m-%d %H:00');
            orderExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m-%d %H:00');
            break;
          case 'day':
            groupExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
            orderExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
            break;
          case 'week':
            groupExpression = sequelize.fn('YEARWEEK', sequelize.col('TRANSACTIONDATE'));
            orderExpression = sequelize.fn('YEARWEEK', sequelize.col('TRANSACTIONDATE'));
            break;
          case 'month':
            groupExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m');
            orderExpression = sequelize.fn('DATE_FORMAT', sequelize.col('TRANSACTIONDATE'), '%Y-%m');
            break;
          default:
            groupExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
            orderExpression = sequelize.fn('DATE', sequelize.col('TRANSACTIONDATE'));
        }

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
            ), 'totalFees'],
            [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'averageTransaction']
          ],
          raw: true
        });

        // Get transaction counts by type
        const transactionsByType = await Transaction.findAll({
          where: dateFilter,
          attributes: [
            'TRANSACTION_TYPE',
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
            [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'averageAmount']
          ],
          group: ['TRANSACTION_TYPE'],
          raw: true
        });

        // Get transaction trend data
        const transactionTrend = await Transaction.findAll({
          where: dateFilter,
          attributes: [
            [groupExpression, 'period'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
            [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
            [sequelize.fn('SUM', 
              sequelize.literal("CASE WHEN transaction_direction = 'CREDIT' THEN amount ELSE 0 END")
            ), 'credits'],
            [sequelize.fn('SUM', 
              sequelize.literal("CASE WHEN transaction_direction = 'DEBIT' THEN amount ELSE 0 END")
            ), 'debits']
          ],
          group: [groupExpression],
          order: [[orderExpression, 'ASC']],
          raw: true
        });

        transactionData = {
          summary: {
            totalTransactions: parseInt(transactionSummary[0]?.totalTransactions || 0),
            totalCredits: parseFloat(transactionSummary[0]?.totalCredits || 0),
            totalDebits: parseFloat(transactionSummary[0]?.totalDebits || 0),
            totalFees: parseFloat(transactionSummary[0]?.totalFees || 0),
            averageTransaction: parseFloat(transactionSummary[0]?.averageTransaction || 0),
            netFlow: parseFloat((transactionSummary[0]?.totalCredits || 0) - (transactionSummary[0]?.totalDebits || 0))
          },
          byType: transactionsByType,
          trend: transactionTrend
        };
      }

      res.json({
        success: true,
        data: {
          generatedAt: new Date().toISOString(),
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
            netContributions: parseFloat(accountSummary[0]?.totalContributions || 0) - parseFloat(accountSummary[0]?.totalWithdrawals || 0),
            averageBalance: parseFloat(accountSummary[0]?.averageBalance || 0),
            maxBalance: parseFloat(accountSummary[0]?.maxBalance || 0),
            minBalance: parseFloat(accountSummary[0]?.minBalance || 0),
            byAccountType: accountTypeStats.map(stat => ({
              type: stat.account_type || 'UNKNOWN',
              count: parseInt(stat.count || 0),
              totalAmount: parseFloat(stat.totalAmount || 0)
            }))
          },
          transactionData
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
   * @route GET /api/thrift-reports/status
   * @access Public
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

      // Check database connection
      await sequelize.authenticate();

      res.json({
        success: true,
        message: 'Thrift reports are working',
        data: {
          modelAvailable: true,
          databaseConnected: true,
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
      logger.error('Status check failed', { error: error.message });
      
      res.json({
        success: false,
        message: 'Thrift reports initialization error',
        error: error.message,
        modelsInitialized: false,
        databaseConnected: false,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get report metadata and available report types
   * @route GET /api/thrift-reports/metadata
   * @access Private
   */
  static async getReportMetadata(req, res) {
    try {
      const metadata = {
        reportTypes: [
          {
            id: 'accounts',
            name: 'Thrift Accounts Report',
            description: 'List of all thrift accounts with balances and details',
            formats: ['pdf', 'excel', 'csv'],
            defaultFormat: 'pdf',
            filters: ['COLLECTION_TYPE', 'status', 'RELATIONSHIP_MANAGER', 'dateRange']
          },
          {
            id: 'transactions',
            name: 'Transaction Summary',
            description: 'Summary of all thrift transactions (credits and debits)',
            formats: ['json'],
            defaultFormat: 'json',
            filters: ['startDate', 'endDate', 'CUST_ID', 'ACCT_NO']
          },
          {
            id: 'summary',
            name: 'Summary Statistics',
            description: 'Overall statistics and key performance indicators',
            formats: ['json'],
            defaultFormat: 'json',
            filters: []
          },
          {
            id: 'comprehensive',
            name: 'Comprehensive Report',
            description: 'Combined account and transaction data with trends',
            formats: ['json'],
            defaultFormat: 'json',
            filters: ['startDate', 'endDate', 'groupBy']
          }
        ],
        availableFilters: {
          COLLECTION_TYPE: {
            type: 'select',
            options: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'],
            description: 'Filter by collection frequency'
          },
          status: {
            type: 'select',
            options: ['ACTIVE', 'INACTIVE', 'DORMANT', 'CLOSED'],
            description: 'Filter by account status'
          },
          groupBy: {
            type: 'select',
            options: ['hour', 'day', 'week', 'month'],
            description: 'Group transactions by time period'
          }
        },
        timestamp: new Date().toISOString()
      };

      res.json({
        success: true,
        data: metadata
      });

    } catch (error) {
      logger.error('Error fetching report metadata', { error: error.message });
      
      res.status(500).json({
        success: false,
        message: 'Failed to fetch report metadata',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }

  /**
   * Unified report generation endpoint
   * @route GET /api/thrift-report/reports/generate
   * @access Private
   */
  static async generateReport(req, res) {
    const { format = 'pdf', reportType = 'accounts', ...filters } = req.query;
    try {
      switch (reportType) {
        case 'transactions':
          return ThriftReportController.getThriftTransactionSummary(req, res);
        case 'summary':
          return ThriftReportController.getThriftSummaryStatistics(req, res);
        case 'comprehensive':
          return ThriftReportController.getComprehensiveThriftReport(req, res);
        default:
          return ThriftReportController.generateThriftAccountsReport(req, res);
      }
    } catch (error) {
      logger.error('Error in unified report generation', { error: error.message, stack: error.stack, reportType, format });
      res.status(500).json({
        success: false,
        message: 'Failed to generate report',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  }
}

export default ThriftReportController;