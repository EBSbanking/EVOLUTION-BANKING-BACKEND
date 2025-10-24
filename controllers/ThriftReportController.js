import Thrift from '../models/Thrift.js';
import { generateThriftAccountsReport, generateThriftAccountsExcelReport, cleanupReportFiles } from '../utils/pdfGenerator.js';
import logger from '../utils/logger.js';

class ThriftReportController {
  /**
   * Generate Thrift Accounts Report (PDF or Excel)
   */
  static async generateThriftAccountsReport(req, res) {
    try {
      const { format = 'pdf', ...filters } = req.query;
      
      // Build query based on filters
      let query = {};
      
      if (filters.COLLECTION_TYPE) {
        query.COLLECTION_TYPE = filters.COLLECTION_TYPE.toUpperCase();
      }
      
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.RELATIONSHIP_MANAGER) {
        query.RELATIONSHIP_MANAGER = { $regex: filters.RELATIONSHIP_MANAGER, $options: 'i' };
      }
      
      if (filters.startDate && filters.endDate) {
        query.createdAt = {
          $gte: new Date(filters.startDate),
          $lte: new Date(filters.endDate)
        };
      }

      // Fetch thrift accounts with selected fields
      const thriftAccounts = await Thrift.find(query)
        .select('CUST_ID ACCT_NO ACCT_ID FIRST_NAME LASTNAME FULL_NAME RELATIONSHIP_MANAGER AMOUNT COLLECTION_TYPE OPENED_DT status openingDate createdAt updatedAt lastCollectionDate accountType totalContributions totalWithdrawals isActive')
        .sort({ createdAt: -1 });

      if (thriftAccounts.length === 0) {
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
      const { page = 1, limit = 50, ...filters } = req.query;
      const skip = (page - 1) * limit;

      // Build query based on filters
      let query = {};
      
      if (filters.COLLECTION_TYPE) {
        query.COLLECTION_TYPE = filters.COLLECTION_TYPE.toUpperCase();
      }
      
      if (filters.status) {
        query.status = filters.status;
      }
      
      if (filters.RELATIONSHIP_MANAGER) {
        query.RELATIONSHIP_MANAGER = { $regex: filters.RELATIONSHIP_MANAGER, $options: 'i' };
      }
      
      if (filters.search) {
        query.$or = [
          { CUST_ID: { $regex: filters.search, $options: 'i' } },
          { ACCT_NO: { $regex: filters.search, $options: 'i' } },
          { FULL_NAME: { $regex: filters.search, $options: 'i' } },
          { FIRST_NAME: { $regex: filters.search, $options: 'i' } },
          { LASTNAME: { $regex: filters.search, $options: 'i' } }
        ];
      }

      // Fetch thrift accounts with pagination
      const [thriftAccounts, total] = await Promise.all([
        Thrift.find(query)
          .select('CUST_ID ACCT_NO ACCT_ID FIRST_NAME LASTNAME FULL_NAME RELATIONSHIP_MANAGER AMOUNT COLLECTION_TYPE OPENED_DT status openingDate createdAt updatedAt lastCollectionDate accountType totalContributions totalWithdrawals isActive')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        Thrift.countDocuments(query)
      ]);

      // Calculate summary statistics
      const totalAmount = thriftAccounts.reduce((sum, account) => sum + (account.AMOUNT || 0), 0);
      const activeAccounts = thriftAccounts.filter(acc => acc.status === 'active').length;
      
      const collectionTypeStats = thriftAccounts.reduce((acc, account) => {
        const type = account.COLLECTION_TYPE || 'UNKNOWN';
        if (!acc[type]) {
          acc[type] = { count: 0, totalAmount: 0 };
        }
        acc[type].count++;
        acc[type].totalAmount += account.AMOUNT || 0;
        return acc;
      }, {});

      res.json({
        success: true,
        data: {
          thriftAccounts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          },
          summary: {
            totalAccounts: total,
            totalAmount,
            activeAccounts,
            inactiveAccounts: total - activeAccounts,
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
}

export default ThriftReportController;