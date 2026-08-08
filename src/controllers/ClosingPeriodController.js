// src/controllers/ClosingPeriodController.js - FIXED
import { Op } from 'sequelize';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import GLClosingPeriod from '../models/GLClosingPeriods.js';
import EOYReport from '../models/EOYReport.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import sequelize from '../../config/db.js';

class ClosingPeriodController {
  /**
   * Get all closing periods
   * GET /api/eoy/closing-periods
   */
  static async getClosingPeriods(req, res) {
    try {
      const {
        organizationCode = 1,
        branchCode = '001',
        status,
        fiscalYear,
        page = 1,
        limit = 20
      } = req.query;

      const where = {
        organization_code: parseInt(organizationCode) || 1,
        branch_code: branchCode || '001'
      };

      // ✅ Only add fiscalYear if it's a valid number
      if (fiscalYear && !isNaN(fiscalYear) && fiscalYear !== 'NaN' && fiscalYear > 0) {
        where.fiscal_year = parseInt(fiscalYear);
      }

      if (status) where.status = status;

      const offset = (parseInt(page) - 1) * parseInt(limit);

      const { count, rows: periods } = await GLClosingPeriod.findAndCountAll({
        where,
        order: [['fiscal_year', 'DESC']],
        offset,
        limit: parseInt(limit) || 20
      });

      return res.status(200).json({
        success: true,
        data: periods,
        pagination: {
          total: count,
          page: parseInt(page) || 1,
          limit: parseInt(limit) || 20,
          totalPages: Math.ceil(count / (parseInt(limit) || 20))
        }
      });

    } catch (error) {
      logger.error('❌ Error fetching closing periods:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch closing periods',
        error: error.message
      });
    }
  }

  /**
   * Get closing period by fiscal year
   * GET /api/eoy/closing-periods/:fiscalYear
   */
  static async getClosingPeriodByYear(req, res) {
    try {
      const { fiscalYear } = req.params;
      const { organizationCode = 1, branchCode = '001' } = req.query;

      // ✅ Validate fiscalYear - if invalid, return 200 with null data instead of error
      if (!fiscalYear || fiscalYear === 'NaN' || isNaN(fiscalYear) || fiscalYear === 'undefined' || fiscalYear === 'null') {
        return res.status(200).json({
          success: true,
          data: null,
          message: 'No valid fiscal year provided'
        });
      }

      const period = await GLClosingPeriod.findOne({
        where: {
          fiscal_year: parseInt(fiscalYear),
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001'
        }
      });

      if (!period) {
        return res.status(200).json({
          success: true,
          data: null,
          message: `Closing period for FY ${fiscalYear} not found`
        });
      }

      // Get associated report if exists
      let report = null;
      if (period.report_id) {
        report = await EOYReport.findOne({
          where: { report_id: period.report_id }
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          period,
          report: report ? {
            reportId: report.report_id,
            status: report.status,
            generatedAt: report.generated_at
          } : null
        }
      });

    } catch (error) {
      logger.error('❌ Error fetching closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch closing period',
        error: error.message
      });
    }
  }

  /**
   * Create a new closing period
   * POST /api/eoy/closing-periods
   */
  static async createClosingPeriod(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        fiscalYear,
        closingDate,
        organizationCode = 1,
        branchCode = '001',
        notes
      } = req.body;

      const userId = req.user?.id || req.user?.user_name || 'system';

      // Validate
      if (!fiscalYear || fiscalYear === 'NaN' || isNaN(fiscalYear)) {
        return res.status(400).json({
          success: false,
          message: 'Valid fiscal year is required'
        });
      }

      // Check if already exists
      const existing = await GLClosingPeriod.findOne({
        where: {
          fiscal_year: parseInt(fiscalYear),
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001'
        },
        transaction
      });

      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Closing period for FY ${fiscalYear} already exists`,
          data: existing
        });
      }

      // Create period
      const period = await GLClosingPeriod.create({
        fiscal_year: parseInt(fiscalYear),
        closing_date: closingDate || new Date(),
        status: 'OPEN',
        organization_code: parseInt(organizationCode) || 1,
        branch_code: branchCode || '001',
        notes: notes || `Closing period for FY ${fiscalYear}`,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      await transaction.commit();

      await auditLogger.info({
        action: 'CREATE_CLOSING_PERIOD',
        entity_type: 'gl_closing_period',
        entity_id: period.id,
        user_id: userId,
        new_value: {
          fiscalYear,
          status: 'OPEN'
        },
        outcome: 'success'
      });

      return res.status(201).json({
        success: true,
        message: `Closing period for FY ${fiscalYear} created successfully`,
        data: period
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('❌ Error creating closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create closing period',
        error: error.message
      });
    }
  }

  /**
   * Update closing period status
   * PUT /api/eoy/closing-periods/:fiscalYear/status
   */
  static async updateClosingPeriodStatus(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { fiscalYear } = req.params;
      const { status, notes } = req.body;
      const { organizationCode = 1, branchCode = '001' } = req.query;
      const userId = req.user?.id || req.user?.user_name || 'system';

      // ✅ Validate fiscalYear
      if (!fiscalYear || fiscalYear === 'NaN' || isNaN(fiscalYear) || fiscalYear === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Invalid fiscal year provided'
        });
      }

      const period = await GLClosingPeriod.findOne({
        where: {
          fiscal_year: parseInt(fiscalYear),
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001'
        },
        transaction
      });

      if (!period) {
        return res.status(404).json({
          success: false,
          message: `Closing period for FY ${fiscalYear} not found`
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

      await auditLogger.info({
        action: 'UPDATE_CLOSING_PERIOD_STATUS',
        entity_type: 'gl_closing_period',
        entity_id: period.id,
        user_id: userId,
        old_value: { status: oldStatus },
        new_value: { status: period.status },
        outcome: 'success'
      });

      return res.status(200).json({
        success: true,
        message: `Closing period status updated to ${status}`,
        data: period
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('❌ Error updating closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update closing period',
        error: error.message
      });
    }
  }

  /**
   * Get closing status summary
   * GET /api/eoy/closing-periods/summary
   */
  static async getClosingSummary(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001' } = req.query;

      const periods = await GLClosingPeriod.findAll({
        where: {
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001'
        },
        order: [['fiscal_year', 'DESC']]
      });

      const summary = {
        total: periods.length,
        byStatus: {
          OPEN: 0,
          CLOSING_IN_PROGRESS: 0,
          CLOSED: 0,
          REVERSED: 0
        },
        fiscalYears: periods.map(p => p.fiscal_year),
        latest: periods.length > 0 ? periods[0] : null,
        closedYears: periods.filter(p => p.status === 'CLOSED').map(p => p.fiscal_year)
      };

      periods.forEach(p => {
        if (summary.byStatus[p.status] !== undefined) {
          summary.byStatus[p.status]++;
        }
      });

      // Get reports for closed periods
      const closedPeriods = periods.filter(p => p.status === 'CLOSED' && p.report_id);
      if (closedPeriods.length > 0) {
        const reports = await EOYReport.findAll({
          where: {
            report_id: {
              [Op.in]: closedPeriods.map(p => p.report_id).filter(Boolean)
            }
          }
        });

        summary.reports = reports.map(r => ({
          reportId: r.report_id,
          fiscalYear: r.fiscal_year,
          status: r.status,
          generatedAt: r.generated_at
        }));
      } else {
        summary.reports = [];
      }

      return res.status(200).json({
        success: true,
        data: summary
      });

    } catch (error) {
      logger.error('❌ Error fetching closing summary:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch closing summary',
        error: error.message
      });
    }
  }

  /**
   * Reverse a closing period
   * POST /api/eoy/closing-periods/:fiscalYear/reverse
   */
  static async reverseClosingPeriod(req, res) {
    const transaction = await sequelize.transaction();
    
    try {
      const { fiscalYear } = req.params;
      const { reason } = req.body;
      const { organizationCode = 1, branchCode = '001' } = req.query;
      const userId = req.user?.id || req.user?.user_name || 'system';

      // ✅ Validate fiscalYear
      if (!fiscalYear || fiscalYear === 'NaN' || isNaN(fiscalYear) || fiscalYear === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Invalid fiscal year provided'
        });
      }

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Reversal reason is required'
        });
      }

      const period = await GLClosingPeriod.findOne({
        where: {
          fiscal_year: parseInt(fiscalYear),
          organization_code: parseInt(organizationCode) || 1,
          branch_code: branchCode || '001'
        },
        transaction
      });

      if (!period) {
        return res.status(404).json({
          success: false,
          message: `Closing period for FY ${fiscalYear} not found`
        });
      }

      if (!period.canBeReversed()) {
        return res.status(400).json({
          success: false,
          message: 'This period cannot be reversed',
          status: period.status
        });
      }

      // Reverse the period
      period.status = 'REVERSED';
      period.reversed_by = userId;
      period.reversed_at = new Date();
      period.reversal_reason = reason;
      await period.save({ transaction });

      // Also reverse any associated EOY transactions
      const eoyTransactions = await GLAccountTransaction.findAll({
        where: {
          TRANSACTION_TYPE: 'EOY_CLOSING',
          organizationCode: parseInt(organizationCode) || 1,
          branchCode: branchCode || '001',
          STATUS: 'POSTED',
          createdAt: {
            [Op.gte]: new Date(parseInt(fiscalYear), 0, 1),
            [Op.lte]: new Date(parseInt(fiscalYear), 11, 31, 23, 59, 59)
          }
        },
        transaction
      });

      // Mark transactions as reversed
      for (const tx of eoyTransactions) {
        tx.STATUS = 'REVERSED';
        tx.REVERSAL_DATE = new Date();
        tx.REVERSED_BY = userId;
        tx.REVERSAL_REASON = `Period reversal: ${reason}`;
        await tx.save({ transaction });
      }

      await transaction.commit();

      await auditLogger.info({
        action: 'REVERSE_CLOSING_PERIOD',
        entity_type: 'gl_closing_period',
        entity_id: period.id,
        user_id: userId,
        new_value: {
          status: 'REVERSED',
          reason: reason
        },
        outcome: 'success'
      });

      return res.status(200).json({
        success: true,
        message: `Closing period for FY ${fiscalYear} reversed successfully`,
        data: {
          period,
          transactionsReversed: eoyTransactions.length
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('❌ Error reversing closing period:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to reverse closing period',
        error: error.message
      });
    }
  }
}

export default ClosingPeriodController;