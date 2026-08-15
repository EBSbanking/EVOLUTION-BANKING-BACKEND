// controllers/EOMController.js - COMPLETE FIXED VERSION
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import sequelize from '../../config/db.js';
import EOMReport from '../models/EOMReport.js';
import EOMClosingPeriod from '../models/EOMClosingPeriod.js';
import Transaction from '../models/Transaction.js';
import DepositTransaction from '../models/DepositTransaction.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Ledger from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';

class EOMController {
  /**
   * Execute End of Month (EOM) Closing Process
   */
  static async executeEOMClosing(params = {}) {
    const transaction = await sequelize.transaction();
    let transactionCommitted = false;
    
    try {
      const {
        month = new Date().getMonth(),
        year = new Date().getFullYear(),
        userId = 'system',
        organizationCode = 1,
        branchCode = '001',
        dryRun = false,
        force = false
      } = params;

      if (month < 1 || month > 12) {
        throw new Error('Invalid month. Must be between 1 and 12');
      }

      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      logger.info(`🚀 Starting EOM Closing Process for ${month}/${year}`, {
        periodStart,
        periodEnd,
        userId,
        organizationCode,
        branchCode,
        dryRun
      });

      const existingClosing = await EOMClosingPeriod.findOne({
        where: {
          month: month,
          year: year,
          organization_code: organizationCode,
          branch_code: branchCode,
          status: 'CLOSED'
        },
        transaction
      });

      if (existingClosing) {
        throw new Error(`Month ${month}/${year} is already closed`);
      }

      const transactions = await Transaction.findAll({
        where: {
          transaction_date: {
            [Op.between]: [periodStart, periodEnd]
          },
          status: 'COMPLETED'
        },
        transaction
      });

      const depositTransactions = await DepositTransaction.findAll({
        where: {
          transaction_date: {
            [Op.between]: [periodStart, periodEnd]
          },
          status: 'COMPLETED'
        },
        transaction
      });

      let totalAmount = 0;
      let totalCredits = 0;
      let totalDebits = 0;
      let totalEMTL = 0;

      transactions.forEach(tx => {
        const amount = parseFloat(tx.AMOUNT) || 0;
        totalAmount += amount;
        if (tx.transactionDirection === 'CREDIT') {
          totalCredits += amount;
        } else {
          totalDebits += amount;
        }
      });

      depositTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        totalAmount += amount;
        if (tx.transaction_type === 'DEPOSIT' || tx.transaction_type === 'CR') {
          totalCredits += amount;
        } else {
          totalDebits += amount;
        }
        totalEMTL += parseFloat(tx.emtl_amount) || 0;
      });

      let closingPeriod = null;
      if (!dryRun) {
        const existingPeriod = await EOMClosingPeriod.findOne({
          where: {
            month: month,
            year: year,
            organization_code: organizationCode,
            branch_code: branchCode
          },
          transaction
        });

        if (existingPeriod) {
          existingPeriod.status = 'CLOSED';
          existingPeriod.closed_by = userId;
          existingPeriod.closed_at = new Date();
          existingPeriod.total_entries = transactions.length + depositTransactions.length;
          existingPeriod.total_amount = totalAmount;
          await existingPeriod.save({ transaction });
          closingPeriod = existingPeriod;
        } else {
          closingPeriod = await EOMClosingPeriod.create({
            month: month,
            year: year,
            period_start: periodStart,
            period_end: periodEnd,
            closing_date: new Date(),
            status: 'CLOSED',
            organization_code: organizationCode,
            branch_code: branchCode,
            closed_by: userId,
            closed_at: new Date(),
            total_entries: transactions.length + depositTransactions.length,
            total_amount: totalAmount
          }, { transaction });
        }

        const eomReport = await this.generateEOMReportData(
          month, 
          year, 
          periodStart, 
          periodEnd,
          transactions,
          depositTransactions,
          totalAmount,
          totalCredits,
          totalDebits,
          totalEMTL,
          organizationCode,
          branchCode,
          userId,
          transaction
        );

        closingPeriod.report_id = eomReport.report_id;
        await closingPeriod.save({ transaction });
      }

      await transaction.commit();
      transactionCommitted = true;

      logger.info(`✅ EOM Closing completed for ${month}/${year}`, {
        totalTransactions: transactions.length + depositTransactions.length,
        totalAmount,
        dryRun
      });

      return {
        success: true,
        dryRun,
        month,
        year,
        periodStart,
        periodEnd,
        summary: {
          totalTransactions: transactions.length + depositTransactions.length,
          totalAmount,
          totalCredits,
          totalDebits,
          totalEMTL
        },
        closingPeriod,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      if (!transactionCommitted) {
        await transaction.rollback();
      }
      logger.error('❌ EOM Closing failed:', error);
      throw error;
    }
  }

  /**
   * Generate EOM Report Data (internal)
   */
  static async generateEOMReportData(month, year, periodStart, periodEnd, transactions, depositTransactions, totalAmount, totalCredits, totalDebits, totalEMTL, organizationCode, branchCode, userId, transaction) {
    const reportId = `EOM-REPORT-${year}-${String(month).padStart(2, '0')}-${Date.now()}`;
    
    const reportData = {
      reportId,
      month,
      year,
      periodStart,
      periodEnd,
      generationDate: new Date(),
      organizationCode,
      branchCode,
      summary: {
        totalTransactions: transactions.length + depositTransactions.length,
        totalAmount,
        totalCredits,
        totalDebits,
        totalEMTL,
        transactionCount: transactions.length,
        depositTransactionCount: depositTransactions.length
      },
      transactions: transactions.map(tx => ({
        id: tx.id,
        reference: tx.REFERENCE,
        type: tx.TRANSACTION_TYPE,
        amount: tx.AMOUNT,
        direction: tx.transactionDirection,
        date: tx.transaction_date
      })),
      depositTransactions: depositTransactions.map(tx => ({
        id: tx.id,
        reference: tx.transaction_ref_no,
        type: tx.transaction_type,
        amount: tx.amount,
        emtlAmount: tx.emtl_amount,
        date: tx.transaction_date
      }))
    };

    await EOMReport.create({
      report_id: reportId,
      month: month,
      year: year,
      period_start: periodStart,
      period_end: periodEnd,
      report_data: reportData,
      organization_code: organizationCode,
      branch_code: branchCode,
      generated_at: new Date(),
      generated_by: userId,
      status: 'COMPLETED'
    }, { transaction });

    return reportData;
  }

  /**
   * Execute EOM Closing from API
   */
  static async executeEOM(req, res) {
    try {
      const {
        month,
        year,
        userId = req.user?.id || req.user?.user_name || 'system',
        organizationCode = 1,
        branchCode = '001',
        dryRun = false,
        force = false
      } = req.body;

      const result = await this.executeEOMClosing({
        month: month || new Date().getMonth(),
        year: year || new Date().getFullYear(),
        userId,
        organizationCode,
        branchCode,
        dryRun,
        force
      });

      return res.status(200).json({
        success: true,
        message: `EOM Closing for ${result.month}/${result.year} completed successfully${dryRun ? ' (DRY RUN)' : ''}`,
        data: result,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('❌ EOM execution failed:', error);
      return res.status(500).json({
        success: false,
        message: 'EOM Closing failed',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get EOM status
   */
  static async getEOMStatus(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const closedPeriods = await EOMClosingPeriod.getClosedPeriods(organizationCode, branchCode);
      const latestClosed = await EOMClosingPeriod.getLatestClosedPeriod(organizationCode, branchCode);

      const reports = await EOMReport.findAll({
        where: {
          organization_code: organizationCode,
          branch_code: branchCode,
          status: 'COMPLETED'
        },
        order: [['year', 'DESC'], ['month', 'DESC']]
      });

      return res.status(200).json({
        success: true,
        data: {
          closedPeriods,
          latestClosed,
          reports,
          count: {
            closedPeriods: closedPeriods.length,
            reports: reports.length
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('❌ Failed to get EOM status:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get EOM status',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  // ============================================================
  // EOM REPORT METHODS
  // ============================================================

  /**
   * Generate a new EOM Report
   * POST /api/eom/reports/generate
   */
  static async generateEOMReport(req, res) {
    try {
      const { month, year, organizationCode = 1, branchCode = '001' } = req.body;
      const userId = req.user?.id || req.user?.user_name || 'system';

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      const isClosed = await EOMClosingPeriod.isMonthClosed(month, year, organizationCode, branchCode);
      if (!isClosed) {
        return res.status(400).json({
          success: false,
          message: `Month ${month}/${year} is not closed yet. Please run EOM closing first.`
        });
      }

      const existingReport = await EOMReport.findOne({
        where: {
          month: month,
          year: year,
          organization_code: organizationCode,
          branch_code: branchCode
        }
      });

      if (existingReport) {
        return res.status(409).json({
          success: false,
          message: `Report for ${month}/${year} already exists`,
          data: existingReport
        });
      }

      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      const transactions = await Transaction.findAll({
        where: {
          transaction_date: {
            [Op.between]: [periodStart, periodEnd]
          },
          status: 'COMPLETED'
        }
      });

      const depositTransactions = await DepositTransaction.findAll({
        where: {
          transaction_date: {
            [Op.between]: [periodStart, periodEnd]
          },
          status: 'COMPLETED'
        }
      });

      let totalAmount = 0;
      let totalCredits = 0;
      let totalDebits = 0;
      let totalEMTL = 0;

      transactions.forEach(tx => {
        const amount = parseFloat(tx.AMOUNT) || 0;
        totalAmount += amount;
        if (tx.transactionDirection === 'CREDIT') totalCredits += amount;
        else totalDebits += amount;
      });

      depositTransactions.forEach(tx => {
        const amount = parseFloat(tx.amount) || 0;
        totalAmount += amount;
        if (tx.transaction_type === 'DEPOSIT' || tx.transaction_type === 'CR') totalCredits += amount;
        else totalDebits += amount;
        totalEMTL += parseFloat(tx.emtl_amount) || 0;
      });

      const reportId = `EOM-REPORT-${year}-${String(month).padStart(2, '0')}-${Date.now()}`;
      
      const reportData = {
        reportId,
        month,
        year,
        periodStart,
        periodEnd,
        generationDate: new Date(),
        organizationCode,
        branchCode,
        summary: {
          totalTransactions: transactions.length + depositTransactions.length,
          totalAmount,
          totalCredits,
          totalDebits,
          totalEMTL,
          transactionCount: transactions.length,
          depositTransactionCount: depositTransactions.length
        },
        transactions: transactions.map(tx => ({
          id: tx.id,
          reference: tx.REFERENCE,
          type: tx.TRANSACTION_TYPE,
          amount: tx.AMOUNT,
          direction: tx.transactionDirection,
          date: tx.transaction_date
        })),
        depositTransactions: depositTransactions.map(tx => ({
          id: tx.id,
          reference: tx.transaction_ref_no,
          type: tx.transaction_type,
          amount: tx.amount,
          emtlAmount: tx.emtl_amount,
          date: tx.transaction_date
        }))
      };

      const report = await EOMReport.create({
        report_id: reportId,
        month: month,
        year: year,
        period_start: periodStart,
        period_end: periodEnd,
        report_data: reportData,
        organization_code: organizationCode,
        branch_code: branchCode,
        generated_at: new Date(),
        generated_by: userId,
        status: 'COMPLETED'
      });

      return res.status(201).json({
        success: true,
        message: `EOM Report for ${month}/${year} generated successfully`,
        data: reportData
      });

    } catch (error) {
      console.error('❌ Error generating EOM report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate EOM report',
        error: error.message
      });
    }
  }

  /**
   * Get all EOM Reports
   * GET /api/eom/reports
   */
  static async getEOMReports(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001', month, year, status, page = 1, limit = 20 } = req.query;

      const where = {
        organization_code: organizationCode,
        branch_code: branchCode
      };

      if (month) where.month = parseInt(month);
      if (year) where.year = parseInt(year);
      if (status) where.status = status;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { count, rows: reports } = await EOMReport.findAndCountAll({
        where,
        order: [['year', 'DESC'], ['month', 'DESC']],
        offset,
        limit: parseInt(limit)
      });

      const formattedReports = reports.map(report => {
        const data = report.report_data || {};
        return {
          reportId: report.report_id,
          month: report.month,
          year: report.year,
          status: report.status,
          generatedAt: report.generated_at,
          generatedBy: report.generated_by,
          summary: data.summary || {}
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
      console.error('❌ Error fetching EOM reports:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch EOM reports',
        error: error.message
      });
    }
  }

  /**
   * Get EOM Report Summary
   * GET /api/eom/reports/summary
   */
  static async getEOMReportSummary(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const reports = await EOMReport.findAll({
        where: {
          organization_code: organizationCode,
          branch_code: branchCode,
          status: 'COMPLETED'
        },
        order: [['year', 'DESC'], ['month', 'DESC']]
      });

      const summary = reports.map(report => {
        const data = report.report_data || {};
        return {
          month: report.month,
          year: report.year,
          reportId: report.report_id,
          generatedAt: report.generated_at,
          totalAmount: data.summary?.totalAmount || 0,
          totalTransactions: data.summary?.totalTransactions || 0
        };
      });

      const totals = summary.reduce((acc, item) => ({
        totalAmount: acc.totalAmount + item.totalAmount,
        totalTransactions: acc.totalTransactions + item.totalTransactions
      }), { totalAmount: 0, totalTransactions: 0 });

      return res.status(200).json({
        success: true,
        data: {
          reports: summary,
          totals,
          count: reports.length
        }
      });

    } catch (error) {
      console.error('❌ Error fetching EOM report summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch EOM report summary',
        error: error.message
      });
    }
  }

  /**
   * Get EOM Report by ID
   * GET /api/eom/reports/:reportId
   */
  static async getEOMReportById(req, res) {
    try {
      const { reportId } = req.params;
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const report = await EOMReport.findOne({
        where: {
          report_id: reportId,
          organization_code: organizationCode,
          branch_code: branchCode
        }
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'EOM Report not found'
        });
      }

      const data = report.report_data || {};

      return res.status(200).json({
        success: true,
        data: {
          reportId: report.report_id,
          month: report.month,
          year: report.year,
          status: report.status,
          generatedAt: report.generated_at,
          generatedBy: report.generated_by,
          summary: data.summary || {},
          transactions: data.transactions || [],
          depositTransactions: data.depositTransactions || []
        }
      });

    } catch (error) {
      console.error('❌ Error fetching EOM report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch EOM report',
        error: error.message
      });
    }
  }

  /**
   * Archive EOM Report
   * PUT /api/eom/reports/:reportId/archive
   */
  static async archiveEOMReport(req, res) {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id || req.user?.user_name || 'system';

      const report = await EOMReport.findOne({
        where: { report_id: reportId }
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'EOM Report not found'
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

      return res.status(200).json({
        success: true,
        message: 'EOM Report archived successfully',
        data: {
          reportId: report.report_id,
          status: report.status,
          archivedAt: report.archived_at
        }
      });

    } catch (error) {
      console.error('❌ Error archiving EOM report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to archive EOM report',
        error: error.message
      });
    }
  }

  /**
   * Delete EOM Report
   * DELETE /api/eom/reports/:reportId
   */
  static async deleteEOMReport(req, res) {
    try {
      const { reportId } = req.params;
      const userId = req.user?.id || req.user?.user_name || 'system';

      const report = await EOMReport.findOne({
        where: { report_id: reportId }
      });

      if (!report) {
        return res.status(404).json({
          success: false,
          message: 'EOM Report not found'
        });
      }

      if (report.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete a completed report. Archive it first or use force delete.'
        });
      }

      await report.destroy();

      return res.status(200).json({
        success: true,
        message: 'EOM Report deleted successfully'
      });

    } catch (error) {
      console.error('❌ Error deleting EOM report:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete EOM report',
        error: error.message
      });
    }
  }

  // ============================================================
  // CLOSING PERIOD METHODS
  // ============================================================

  /**
   * Get all closing periods
   * GET /api/eom/closing-periods
   */
  static async getClosingPeriods(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001', status, page = 1, limit = 20 } = req.query;

      const where = {
        organization_code: organizationCode,
        branch_code: branchCode
      };

      if (status) where.status = status;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { count, rows: periods } = await EOMClosingPeriod.findAndCountAll({
        where,
        order: [['year', 'DESC'], ['month', 'DESC']],
        offset,
        limit: parseInt(limit)
      });

      return res.status(200).json({
        success: true,
        data: periods,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(count / limit)
        }
      });

    } catch (error) {
      console.error('❌ Error fetching closing periods:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch closing periods',
        error: error.message
      });
    }
  }

  /**
   * Get closing period by month/year
   * GET /api/eom/closing-periods/:month/:year
   */
  static async getClosingPeriodByMonthYear(req, res) {
    try {
      const { month, year } = req.params;
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const period = await EOMClosingPeriod.findOne({
        where: {
          month: parseInt(month),
          year: parseInt(year),
          organization_code: organizationCode,
          branch_code: branchCode
        }
      });

      if (!period) {
        return res.status(404).json({
          success: false,
          message: `Closing period for ${month}/${year} not found`
        });
      }

      return res.status(200).json({
        success: true,
        data: period
      });

    } catch (error) {
      console.error('❌ Error fetching closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch closing period',
        error: error.message
      });
    }
  }

  /**
   * Get closing summary
   * GET /api/eom/closing-periods/summary
   */
  static async getClosingSummary(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const periods = await EOMClosingPeriod.findAll({
        where: {
          organization_code: organizationCode,
          branch_code: branchCode
        },
        order: [['year', 'DESC'], ['month', 'DESC']]
      });

      const summary = {
        total: periods.length,
        byStatus: {
          OPEN: 0,
          CLOSED: 0,
          REOPENED: 0
        },
        periods: periods
      };

      periods.forEach(p => {
        if (summary.byStatus[p.status] !== undefined) {
          summary.byStatus[p.status]++;
        }
      });

      return res.status(200).json({
        success: true,
        data: summary
      });

    } catch (error) {
      console.error('❌ Error fetching closing summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch closing summary',
        error: error.message
      });
    }
  }

  /**
   * Create a new closing period
   * POST /api/eom/closing-periods
   */
  static async createClosingPeriod(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { month, year, organizationCode = 1, branchCode = '001', notes } = req.body;
      const userId = req.user?.id || req.user?.user_name || 'system';

      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'Month and year are required'
        });
      }

      const existing = await EOMClosingPeriod.findOne({
        where: {
          month: parseInt(month),
          year: parseInt(year),
          organization_code: organizationCode,
          branch_code: branchCode
        },
        transaction
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Closing period for ${month}/${year} already exists`
        });
      }

      const period = await EOMClosingPeriod.create({
        month: parseInt(month),
        year: parseInt(year),
        period_start: new Date(year, month - 1, 1),
        period_end: new Date(year, month, 0),
        status: 'OPEN',
        organization_code: organizationCode,
        branch_code: branchCode,
        notes: notes || `Closing period for ${month}/${year}`,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: `Closing period for ${month}/${year} created successfully`,
        data: period
      });

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error creating closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create closing period',
        error: error.message
      });
    }
  }

  /**
   * Update closing period status
   * PUT /api/eom/closing-periods/:month/:year/status
   */
  static async updateClosingPeriodStatus(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { month, year } = req.params;
      const { status, notes } = req.body;
      const { organizationCode = 1, branchCode = '001' } = req.query;
      const userId = req.user?.id || req.user?.user_name || 'system';

      const period = await EOMClosingPeriod.findOne({
        where: {
          month: parseInt(month),
          year: parseInt(year),
          organization_code: organizationCode,
          branch_code: branchCode
        },
        transaction
      });

      if (!period) {
        return res.status(404).json({
          success: false,
          message: `Closing period for ${month}/${year} not found`
        });
      }

      const oldStatus = period.status;
      period.status = status;
      if (notes) period.notes = notes;

      if (status === 'CLOSED' && !period.closed_at) {
        period.closed_by = userId;
        period.closed_at = new Date();
      }

      await period.save({ transaction });
      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: `Closing period status updated to ${status}`,
        data: period
      });

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error updating closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update closing period',
        error: error.message
      });
    }
  }

  /**
   * Reverse a closing period
   * POST /api/eom/closing-periods/:month/:year/reverse
   */
  static async reverseClosingPeriod(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { month, year } = req.params;
      const { reason } = req.body;
      const { organizationCode = 1, branchCode = '001' } = req.query;
      const userId = req.user?.id || req.user?.user_name || 'system';

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Reversal reason is required'
        });
      }

      const period = await EOMClosingPeriod.findOne({
        where: {
          month: parseInt(month),
          year: parseInt(year),
          organization_code: organizationCode,
          branch_code: branchCode
        },
        transaction
      });

      if (!period) {
        return res.status(404).json({
          success: false,
          message: `Closing period for ${month}/${year} not found`
        });
      }

      if (period.status !== 'CLOSED') {
        return res.status(400).json({
          success: false,
          message: `Period ${month}/${year} is not closed (Status: ${period.status})`
        });
      }

      period.status = 'REVERSED';
      period.reopened_by = userId;
      period.reopened_at = new Date();
      period.reopening_reason = reason;
      await period.save({ transaction });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: `Closing period for ${month}/${year} reversed successfully`,
        data: period
      });

    } catch (error) {
      await transaction.rollback();
      console.error('❌ Error reversing closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reverse closing period',
        error: error.message
      });
    }
  }

  /**
   * Reopen a closed period
   * POST /api/eom/reopen/:month/:year
   */
  static async reopenPeriod(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { month, year } = req.params;
      const { reason, userId = req.user?.id || req.user?.user_name || 'system' } = req.body;
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const period = await EOMClosingPeriod.findOne({
        where: {
          month: parseInt(month),
          year: parseInt(year),
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001'
        },
        transaction
      });

      if (!period) {
        return res.status(404).json({
          success: false,
          message: `Period ${month}/${year} not found`
        });
      }

      if (period.status !== 'CLOSED') {
        return res.status(400).json({
          success: false,
          message: `Period ${month}/${year} is not closed (Status: ${period.status})`
        });
      }

      await period.reopen(userId, reason);

      if (period.report_id) {
        await EOMReport.update({
          status: 'ARCHIVED',
          archived_at: new Date()
        }, {
          where: { report_id: period.report_id },
          transaction
        });
      }

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: `Period ${month}/${year} reopened successfully`,
        data: period,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('❌ Failed to reopen period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reopen period',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Check if a date is in a closed period (for frontend validation)
   * GET /api/eom/check-date
   */
  static async checkDateClosure(req, res) {
    try {
      const { date, organizationCode = 1, branchCode = '001' } = req.query;

      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Date is required'
        });
      }

      const d = new Date(date);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();

      const isClosed = await EOMClosingPeriod.isMonthClosed(month, year, organizationCode, branchCode);

      return res.status(200).json({
        success: true,
        data: {
          date,
          month,
          year,
          isClosed,
          canPost: !isClosed,
          message: isClosed ? `Cannot post to ${month}/${year}. Period is closed.` : `Can post to ${month}/${year}.`
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('❌ Failed to check date closure:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to check date closure',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }
}

export default EOMController;