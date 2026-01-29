// src/controllers/EOYTaskController.js
import { eoyTaskService } from '../Services/EOYTaskService.js';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';

export class EOYTaskController {
  /**
   * Create and execute a Year-End Closing task
   */
  static async createAndExecuteTask(req, res) {
    try {
      const {
        fiscalYear,
        runMode = 'MANDATORY',
        accessMode = 'FULL_UPDATE',
        notificationType = 'BOTH',
        product = 'ALL',
        skipOnHoliday = true,
        dryRun = false
      } = req.body;

      const userId = req.user?.id || req.body.userId || 'manual';
      const branchId = req.user?.branch_id || req.body.branchId || 1;

      // Validate parameters
      if (!fiscalYear) {
        return res.status(400).json({
          success: false,
          message: 'fiscalYear is required'
        });
      }

      // Create task configuration
      const taskId = `EOY-${fiscalYear}-${Date.now()}`;
      const taskConfig = {
        taskId,
        fiscalYear: parseInt(fiscalYear),
        runMode,
        accessMode,
        notificationType,
        product,
        skipOnHoliday,
        userId,
        branchId
      };

      logger.info('📋 Creating Year-End Closing task', {
        taskId,
        userId,
        branchId,
        fiscalYear
      });

      // Execute task (dry run or real)
      let result;
      if (dryRun) {
        result = await eoyTaskService.executeDryRun(taskConfig);
      } else {
        result = await eoyTaskService.executeScheduledTask(taskConfig);
      }

      // Log audit
      await auditLogger.info({
        action: 'EOY_TASK_CREATED',
        entity_type: 'scheduled_task',
        entity_id: taskId,
        user_id: userId,
        branch_id: branchId,
        new_value: {
          taskId,
          fiscalYear,
          runMode,
          dryRun,
          status: result.status
        },
        outcome: 'success'
      });

      res.json({
        success: true,
        message: dryRun ? 'Dry run completed' : 'Year-End Closing task created and executed',
        data: {
          taskId,
          status: result.status,
          executionResult: result
        }
      });

    } catch (error) {
      logger.error('❌ Failed to create/execute EOY task:', error);

      await auditLogger.error({
        action: 'EOY_TASK_CREATED',
        entity_type: 'scheduled_task',
        user_id: req.user?.id || 'unknown',
        error_message: error.message,
        outcome: 'failed'
      });

      res.status(500).json({
        success: false,
        message: 'Failed to execute Year-End Closing',
        error: error.message,
        taskId: req.body.taskId
      });
    }
  }

  /**
   * Get task status
   */
  static async getTaskStatus(req, res) {
    try {
      const { taskId } = req.params;
      const status = await eoyTaskService.getTaskStatus(taskId);

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
   * Get recent EOY tasks
   */
  static async getRecentTasks(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;
      const tasks = await eoyTaskService.getRecentTasks(limit);

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

      const result = await eoyTaskService.restartTask(taskId, userId);

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

      const result = await eoyTaskService.cancelTask(
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
   * Get Year-End Closing statistics
   */
  static async getEOYStatistics(req, res) {
    try {
      const { fiscalYear } = req.params;
      const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
      const GLClosingPeriod = (await import('../models/GLClosingPeriod.js')).default;

      // Get task statistics
      const tasks = await ScheduledTask.findAll({
        where: {
          task_type: 'YEAR_END_CLOSING',
          ...(fiscalYear ? {
            configuration: {
              fiscalYear: parseInt(fiscalYear)
            }
          } : {})
        },
        attributes: [
          'status',
          [sequelize.fn('COUNT', '*'), 'count']
        ],
        group: ['status']
      });

      // Get closing period info
      const closingPeriod = fiscalYear ? 
        await GLClosingPeriod.findOne({
          where: { fiscal_year: parseInt(fiscalYear) }
        }) : null;

      res.json({
        success: true,
        data: {
          tasks: tasks.reduce((acc, task) => {
            acc[task.status] = parseInt(task.dataValues.count);
            return acc;
          }, {}),
          closingPeriod,
          currentFiscalYear: new Date().getFullYear() - 1,
          nextScheduledRun: fiscalYear ? 
            new Date(parseInt(fiscalYear) + 1, 11, 31, 1, 15, 0) : null
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to get statistics',
        error: error.message
      });
    }
  }
}