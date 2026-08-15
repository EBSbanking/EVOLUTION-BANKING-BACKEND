// controllers/EOMTaskController.js
import EOMTaskService from '../Services/EOMTaskService.js';  // ✅ Default import
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import EOMClosingPeriod from '../models/EOMClosingPeriod.js';
import EOMReport from '../models/EOMReport.js';
import sequelize from '../../config/db.js';

export class EOMTaskController {
  /**
   * Create and execute an End of Month task
   */
  static async createAndExecuteTask(req, res) {
    try {
      const {
        month = new Date().getMonth(),
        year = new Date().getFullYear(),
        runMode = 'MANDATORY',
        accessMode = 'FULL_UPDATE',
        notificationType = 'BOTH',
        product = 'ALL',
        skipOnHoliday = true,
        dryRun = false,
        organizationCode = 1,
        branchCode = '001'
      } = req.body;

      const userId = req.user?.id || req.body.userId || 'manual';
      const branchId = req.user?.branch_id || req.body.branchId || 1;

      // Validate parameters
      if (!month || !year) {
        return res.status(400).json({
          success: false,
          message: 'month and year are required'
        });
      }

      // Check if EOM is already running
      const isRunning = await EOMTaskService.isEOMRunning();  // ✅ Use EOMTaskService directly
      if (isRunning) {
        return res.status(409).json({
          success: false,
          message: 'An EOM task is already in progress',
          error: 'EOM_ALREADY_RUNNING'
        });
      }

      // Check if period is already closed
      const existingClosing = await EOMClosingPeriod.findOne({
        where: {
          month: month,
          year: year,
          organization_code: organizationCode,
          branch_code: branchCode,
          status: 'CLOSED'
        }
      });

      if (existingClosing) {
        return res.status(409).json({
          success: false,
          message: `Month ${month}/${year} is already closed`,
          error: 'PERIOD_ALREADY_CLOSED',
          data: existingClosing
        });
      }

      // Create task configuration
      const taskConfig = EOMTaskService.createEOMTaskConfig({  // ✅ Use EOMTaskService directly
        month: parseInt(month),
        year: parseInt(year),
        runMode,
        accessMode,
        notificationType,
        product,
        skipOnHoliday,
        userId,
        branchId,
        organizationCode,
        branchCode,
        dryRun
      });

      logger.info('📋 Creating EOM task', {
        taskId: taskConfig.taskId,
        userId,
        branchId,
        month,
        year
      });

      // Execute task
      let result;
      if (dryRun) {
        result = await EOMTaskService.executeDryRun(taskConfig);  // ✅ Use EOMTaskService directly
      } else {
        result = await EOMTaskService.executeScheduledTask(taskConfig);  // ✅ Use EOMTaskService directly
      }

      // Log audit
      await auditLogger.info({
        action: 'EOM_TASK_CREATED',
        entity_type: 'scheduled_task',
        entity_id: taskConfig.taskId,
        user_id: userId,
        branch_id: branchId,
        new_value: {
          taskId: taskConfig.taskId,
          month,
          year,
          dryRun,
          status: result.status
        },
        outcome: 'success'
      });

      res.json({
        success: true,
        message: dryRun ? 'Dry run completed' : 'EOM task created and executed',
        data: {
          taskId: taskConfig.taskId,
          status: result.status,
          executionResult: result
        }
      });

    } catch (error) {
      logger.error('❌ Failed to create/execute EOM task:', error);

      await auditLogger.error({
        action: 'EOM_TASK_CREATED',
        entity_type: 'scheduled_task',
        user_id: req.user?.id || 'unknown',
        error_message: error.message,
        outcome: 'failed'
      });

      res.status(500).json({
        success: false,
        message: 'Failed to execute EOM task',
        error: error.message
      });
    }
  }

  /**
   * Get task status
   */
  static async getTaskStatus(req, res) {
    try {
      const { taskId } = req.params;
      const status = await EOMTaskService.getTaskStatus(taskId);  // ✅ Use EOMTaskService directly

      if (!status) {
        return res.status(404).json({
          success: false,
          message: `Task ${taskId} not found`
        });
      }

      res.json({
        success: true,
        data: status
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get task status',
        error: error.message
      });
    }
  }

  /**
   * Get recent EOM tasks
   */
  static async getRecentTasks(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const tasks = await EOMTaskService.getRecentTasks(limit);  // ✅ Use EOMTaskService directly

      res.json({
        success: true,
        data: tasks
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get recent tasks',
        error: error.message
      });
    }
  }

  /**
   * Restart a failed task
   */
  static async restartTask(req, res) {
    try {
      const { taskId } = req.params;
      const userId = req.user?.id || req.body.userId;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required to restart task'
        });
      }

      const result = await EOMTaskService.restartTask(taskId, userId);  // ✅ Use EOMTaskService directly

      res.json({
        success: true,
        message: 'Task restarted successfully',
        data: result
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to restart task',
        error: error.message
      });
    }
  }

  /**
   * Cancel a running task
   */
  static async cancelTask(req, res) {
    try {
      const { taskId } = req.params;
      const { reason, userId } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          message: 'Cancellation reason is required'
        });
      }

      const result = await EOMTaskService.cancelTask(  // ✅ Use EOMTaskService directly
        taskId, 
        reason, 
        userId || req.user?.id
      );

      res.json({
        success: true,
        message: 'Task cancelled successfully',
        data: result
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to cancel task',
        error: error.message
      });
    }
  }

  /**
   * Get EOM status
   */
  static async getEOMStatus(req, res) {
    try {
      const { organizationCode = 1, branchCode = '001' } = req.query;
      const status = await EOMTaskService.getLatestEOMStatus(organizationCode, branchCode);  // ✅ Use EOMTaskService directly

      // Get all closed periods
      const closedPeriods = await EOMClosingPeriod.findAll({
        where: {
          organization_code: organizationCode,
          branch_code: branchCode,
          status: 'CLOSED'
        },
        order: [['year', 'DESC'], ['month', 'DESC']]
      });

      res.json({
        success: true,
        data: {
          ...status,
          closedPeriods,
          count: closedPeriods.length
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get EOM status',
        error: error.message
      });
    }
  }

  /**
   * Check if a date is in a closed period
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

      res.json({
        success: true,
        data: {
          date,
          month,
          year,
          isClosed,
          canPost: !isClosed,
          message: isClosed ? `Cannot post to ${month}/${year}. Period is closed.` : `Can post to ${month}/${year}.`
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to check date closure',
        error: error.message
      });
    }
  }

  /**
   * Reopen a closed period
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

      // Reopen the period
      period.status = 'REOPENED';
      period.reopened_by = userId;
      period.reopened_at = new Date();
      period.reopening_reason = reason || 'Reopened by admin';
      period.updated_at = new Date();
      await period.save({ transaction });

      // Also update any associated report
      if (period.report_id) {
        await EOMReport.update({
          status: 'ARCHIVED',
          archived_at: new Date(),
          updated_at: new Date()
        }, {
          where: { report_id: period.report_id },
          transaction
        });
      }

      await transaction.commit();

      // Log audit
      await auditLogger.info({
        action: 'EOM_PERIOD_REOPENED',
        entity_type: 'eom_closing_period',
        entity_id: period.id,
        user_id: userId,
        branch_id: branchCode,
        new_value: {
          month,
          year,
          reason,
          status: 'REOPENED'
        },
        outcome: 'success'
      });

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
}

export default EOMTaskController;