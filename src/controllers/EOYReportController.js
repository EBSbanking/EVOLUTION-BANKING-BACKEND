// src/controllers/EOYReportController.js
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import EOYReport from '../models/EOYReport.js';
import GLClosingPeriod from '../models/GLClosingPeriods.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Ledger from '../models/Ledger.js';
import sequelize from '../../config/db.js';

class EOYReportController {
  /**
   * Generate a new EOY Report
   * POST /api/eoy/reports/generate
   */
  static async generateReport(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        fiscalYear,
        organizationCode = 1,
        branchCode = '001',
        includeDetails = true
      } = req.body;

      const userId = req.user?.id || req.user?.user_name || 'system';

      // Validate fiscal year
      if (!fiscalYear) {
        return res.status(400).json({
          success: false,
          message: 'Fiscal year is required'
        });
      }

      // Check if report already exists
      const existingReport = await EOYReport.findOne({
        where: {
          fiscal_year: fiscalYear,
          organization_code: organizationCode,
          branch_code: branchCode,
          status: 'COMPLETED'
        }
      });

      if (existingReport) {
        return res.status(409).json({
          success: false,
          message: `Report for FY ${fiscalYear} already exists`,
          data: { reportId: existingReport.report_id }
        });
      }

      // Check if period is closed
      const closingPeriod = await GLClosingPeriod.findOne({
        where: {
          fiscal_year: fiscalYear,
          organization_code: organizationCode,
          branch_code: branchCode,
          status: 'CLOSED'
        },
        transaction
      });

      if (!closingPeriod) {
        return res.status(400).json({
          success: false,
          message: `Fiscal year ${fiscalYear} has not been closed yet. Please run year-end closing first.`
        });
      }

      // Get all closing transactions for this fiscal year
      const closingTransactions = await GLAccountTransaction.findAll({
        where: {
          TRANSACTION_TYPE: 'EOY_CLOSING',
          organizationCode: organizationCode,
          branchCode: branchCode,
          STATUS: 'POSTED',
          createdAt: {
            [Op.gte]: new Date(fiscalYear, 0, 1),
            [Op.lte]: new Date(fiscalYear, 11, 31, 23, 59, 59)
          }
        },
        order: [['createdAt', 'DESC']],
        transaction
      });

      // Get retained earnings entry
      const retainedEarningsEntry = await GLAccountTransaction.findOne({
        where: {
          TRANSACTION_TYPE: 'RETAINED_EARNINGS',
          organizationCode: organizationCode,
          branchCode: branchCode,
          STATUS: 'POSTED',
          createdAt: {
            [Op.gte]: new Date(fiscalYear, 0, 1),
            [Op.lte]: new Date(fiscalYear, 11, 31, 23, 59, 59)
          }
        },
        transaction
      });

      // Calculate totals
      let revenueTotal = 0;
      let expenseTotal = 0;
      const accountDetails = [];

      // Group transactions by account
      const accountMap = new Map();

      for (const tx of closingTransactions) {
        const accountNo = tx.DR_ACCT_NO || tx.CR_ACCT_NO;
        const amount = parseFloat(tx.AMOUNT) || 0;
        const isCredit = !!tx.CR_ACCT_NO;

        if (!accountMap.has(accountNo)) {
          accountMap.set(accountNo, {
            accountCode: accountNo,
            accountName: tx.NARRATION.split(' - ')[1] || accountNo,
            accountType: 'UNKNOWN',
            openingBalance: 0,
            closingAmount: 0,
            transactionCount: 0
          });
        }

        const account = accountMap.get(accountNo);
        account.closingAmount += isCredit ? amount : -amount;
        account.transactionCount++;
      }

      // Determine account types from transaction narrations
      for (const [accountNo, account] of accountMap) {
        // Try to determine type from narration
        const narration = closingTransactions.find(tx => 
          (tx.DR_ACCT_NO === accountNo || tx.CR_ACCT_NO === accountNo)
        )?.NARRATION || '';

        if (narration.includes('REVENUE') || narration.includes('INCOME')) {
          account.accountType = 'REVENUE';
          revenueTotal += Math.abs(account.closingAmount);
        } else if (narration.includes('EXPENSE') || narration.includes('COST')) {
          account.accountType = 'EXPENSE';
          expenseTotal += Math.abs(account.closingAmount);
        } else {
          account.accountType = 'UNKNOWN';
        }

        accountDetails.push(account);
      }

      const netProfit = revenueTotal - expenseTotal;

      // Build report data
      const reportData = {
        reportId: `EOY-REPORT-${fiscalYear}-${Date.now()}`,
        fiscalYear,
        generationDate: new Date().toISOString(),
        organizationCode,
        branchCode,
        summary: {
          totalPLAccounts: accountDetails.length,
          totalJournalEntries: closingTransactions.length,
          revenueTotal,
          expenseTotal,
          netProfit,
          hasRetainedEarnings: !!retainedEarningsEntry,
          retainedEarningsAmount: retainedEarningsEntry ? parseFloat(retainedEarningsEntry.AMOUNT) || 0 : 0
        },
        accountDetails: includeDetails ? accountDetails : [],
        journalEntries: includeDetails ? closingTransactions.map(tx => ({
          id: tx.id,
          journalId: tx.JOURNAL_ID,
          transactionId: tx.TRANSACTION_ID,
          drAccount: tx.DR_ACCT_NO,
          crAccount: tx.CR_ACCT_NO,
          amount: tx.AMOUNT,
          narration: tx.NARRATION,
          createdAt: tx.createdAt
        })) : [],
        financialStatement: {
          revenue: revenueTotal,
          expenses: expenseTotal,
          grossProfit: revenueTotal - expenseTotal,
          netProfit,
          retainedEarnings: retainedEarningsEntry ? parseFloat(retainedEarningsEntry.AMOUNT) || 0 : 0
        },
        closingPeriod: {
          closedBy: closingPeriod.closed_by,
          closedAt: closingPeriod.closed_at,
          totalEntries: closingPeriod.total_entries,
          totalAmount: closingPeriod.total_amount
        }
      };

      // Save report
      const report = await EOYReport.create({
        report_id: reportData.reportId,
        fiscal_year: fiscalYear,
        report_data: reportData,
        organization_code: organizationCode,
        branch_code: branchCode,
        generated_at: new Date(),
        generated_by: userId,
        status: 'COMPLETED'
      }, { transaction });

      // Update closing period with report reference
      if (closingPeriod) {
        closingPeriod.report_id = reportData.reportId;
        await closingPeriod.save({ transaction });
      }

      await transaction.commit();

      await auditLogger.info({
        action: 'GENERATE_EOY_REPORT',
        entity_type: 'eoy_report',
        entity_id: report.report_id,
        user_id: userId,
        branch_id: branchCode,
        new_value: {
          fiscalYear,
          reportId: report.report_id,
          totalEntries: closingTransactions.length,
          netProfit
        },
        outcome: 'success'
      });

      return res.status(201).json({
        success: true,
        message: `EOY Report for FY ${fiscalYear} generated successfully`,
        data: reportData
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('❌ Error generating EOY report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate EOY report',
        error: error.message
      });
    }
  }

  /**
   * Get all EOY Reports
   * GET /api/eoy/reports
   */
  static async getReports(req, res) {
    try {
      const {
        organizationCode = 1,
        branchCode = '001',
        fiscalYear,
        status,
        page = 1,
        limit = 20
      } = req.query;

      const where = {
        organization_code: parseInt(organizationCode),
        branch_code: branchCode
      };

      if (fiscalYear) where.fiscal_year = parseInt(fiscalYear);
      if (status) where.status = status;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { count, rows: reports } = await EOYReport.findAndCountAll({
        where,
        order: [['fiscal_year', 'DESC'], ['generated_at', 'DESC']],
        offset,
        limit: parseInt(limit)
      });

      // Format response
      const formattedReports = reports.map(report => {
        const data = report.report_data || {};
        return {
          reportId: report.report_id,
          fiscalYear: report.fiscal_year,
          status: report.status,
          generatedAt: report.generated_at,
          generatedBy: report.generated_by,
          summary: data.summary || {},
          financialStatement: data.financialStatement || {},
          closingPeriod: data.closingPeriod || {}
        };
      });

      return res.status(200).json({
        success: true,
        data: formattedReports,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      logger.error('❌ Error fetching EOY reports:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch EOY reports',
        error: error.message
      });
    }
  }

  /**
   * Get EOY Report by ID
   * GET /api/eoy/reports/:reportId
   */
  static async getReportById(req, res) {
    try {
      const { reportId } = req.params;
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const report = await EOYReport.findOne({
        where: {
          report_id: reportId,
          organization_code: parseInt(organizationCode),
          branch_code: branchCode
        }
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'EOY Report not found'
        });
      }

      const data = report.report_data || {};

      return res.status(200).json({
        success: true,
        data: {
          reportId: report.report_id,
          fiscalYear: report.fiscal_year,
          status: report.status,
          generatedAt: report.generated_at,
          generatedBy: report.generated_by,
          summary: data.summary || {},
          accountDetails: data.accountDetails || [],
          journalEntries: data.journalEntries || [],
          financialStatement: data.financialStatement || {},
          closingPeriod: data.closingPeriod || {}
        }
      });

    } catch (error) {
      logger.error('❌ Error fetching EOY report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch EOY report',
        error: error.message
      });
    }
  }

  /**
   * Get EOY Report Summary
   * GET /api/eoy/reports/summary
   */
  static async getReportSummary(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const reports = await EOYReport.findAll({
        where: {
          organization_code: parseInt(organizationCode),
          branch_code: branchCode,
          status: 'COMPLETED'
        },
        order: [['fiscal_year', 'DESC']]
      });

      const summary = reports.map(report => {
        const data = report.report_data || {};
        return {
          fiscalYear: report.fiscal_year,
          reportId: report.report_id,
          generatedAt: report.generated_at,
          netProfit: data.summary?.netProfit || 0,
          revenueTotal: data.summary?.revenueTotal || 0,
          expenseTotal: data.summary?.expenseTotal || 0,
          totalAccounts: data.summary?.totalPLAccounts || 0,
          totalEntries: data.summary?.totalJournalEntries || 0
        };
      });

      // Calculate totals
      const totals = summary.reduce((acc, item) => ({
        totalRevenue: acc.totalRevenue + item.revenueTotal,
        totalExpenses: acc.totalExpenses + item.expenseTotal,
        totalNetProfit: acc.totalNetProfit + item.netProfit,
        totalAccounts: acc.totalAccounts + item.totalAccounts,
        totalEntries: acc.totalEntries + item.totalEntries
      }), {
        totalRevenue: 0,
        totalExpenses: 0,
        totalNetProfit: 0,
        totalAccounts: 0,
        totalEntries: 0
      });

      return res.status(200).json({
        success: true,
        data: {
          reports: summary,
          totals,
          count: reports.length
        }
      });

    } catch (error) {
      logger.error('❌ Error fetching EOY report summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch EOY report summary',
        error: error.message
      });
    }
  }

  /**
   * Archive EOY Report
   * PUT /api/eoy/reports/:reportId/archive
   */
  static async archiveReport(req, res) {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id || req.user?.user_name || 'system';

      const report = await EOYReport.findOne({
        where: { report_id: reportId }
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'EOY Report not found'
        });
      }

      if (report.status === 'ARCHIVED') {
        return res.status(400).json({
          success: false,
          message: 'Report is already archived'
        });
      }

      report.status = 'ARCHIVED';
      report.archived_at = new Date();
      await report.save();

      await auditLogger.info({
        action: 'ARCHIVE_EOY_REPORT',
        entity_type: 'eoy_report',
        entity_id: report.report_id,
        user_id: userId,
        new_value: { status: 'ARCHIVED' },
        outcome: 'success'
      });

      return res.status(200).json({
        success: true,
        message: 'EOY Report archived successfully',
        data: {
          reportId: report.report_id,
          status: report.status,
          archivedAt: report.archived_at
        }
      });

    } catch (error) {
      logger.error('❌ Error archiving EOY report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to archive EOY report',
        error: error.message
      });
    }
  }

  /**
   * Delete EOY Report
   * DELETE /api/eoy/reports/:reportId
   */
  static async deleteReport(req, res) {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id || req.user?.user_name || 'system';

      const report = await EOYReport.findOne({
        where: { report_id: reportId }
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'EOY Report not found'
        });
      }

      if (report.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete a completed report. Archive it first or use force delete.'
        });
      }

      await report.destroy();

      await auditLogger.info({
        action: 'DELETE_EOY_REPORT',
        entity_type: 'eoy_report',
        entity_id: reportId,
        user_id: userId,
        outcome: 'success'
      });

      return res.status(200).json({
        success: true,
        message: 'EOY Report deleted successfully'
      });

    } catch (error) {
      logger.error('❌ Error deleting EOY report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete EOY report',
        error: error.message
      });
    }
  }
}

export default EOYReportController;