// src/services/EOYTaskService.js
import logger from '../utils/logger.js';
import { GLAccountEOYController } from '../controllers/GLAccountEOYController.js';
import { sendSystemAlert } from './NotificationService.js';
import { Op } from 'sequelize';

export class EOYTaskService {
  constructor() {
    this.isRunning = false;
    this.currentTaskId = null;
  }

  /**
   * Execute Year-End Closing as a scheduled task
   * This is called by your task scheduler system
   */
  async executeScheduledTask(taskConfig = {}) {
    const taskId = taskConfig.taskId || `EOY-${Date.now()}`;
    this.currentTaskId = taskId;
    
    if (this.isRunning) {
      throw new Error('Year-End Closing is already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info(`🚀 Starting Year-End Closing Task: ${taskId}`, taskConfig);

      // Parse task configuration
      const {
        fiscalYear = new Date().getFullYear() - 1,
        runMode = 'MANDATORY',
        accessMode = 'FULL_UPDATE',
        notificationType = 'BOTH',
        userId = 'system',
        branchId = 1,
        product = 'ALL'
      } = taskConfig;

      // Validate access mode
      if (accessMode === 'FULL_UPDATE') {
        logger.info('🔓 Full Update mode - proceeding with balance updates');
      } else if (accessMode === 'READ_ONLY') {
        throw new Error('READ_ONLY mode not allowed for Year-End Closing');
      }

      // Check if it's the last day of the year
      const closingDate = new Date();
      const lastDayOfYear = new Date(closingDate.getFullYear(), 11, 31);
      
      if (runMode === 'MANDATORY' && !this.isLastDayOfYear(closingDate)) {
        throw new Error('Year-End Closing can only run on December 31st in MANDATORY mode');
      }

      // Skip holidays if configured
      if (taskConfig.skipOnHoliday && await this.isHoliday(closingDate)) {
        logger.info('📅 Today is a holiday, task skipped');
        return {
          taskId,
          status: 'SKIPPED',
          reason: 'Holiday',
          skippedAt: new Date()
        };
      }

      // Execute the closing process
      const result = await GLAccountEOYController.executeYearEndClosing({
        fiscalYear,
        closingDate,
        userId,
        branchId,
        productFilter: product !== 'ALL' ? product : undefined
      });

      // Calculate duration
      const duration = Date.now() - startTime;

      // Send notifications based on configuration
      await this.sendTaskNotifications(
        taskConfig,
        result,
        duration,
        'SUCCESS'
      );

      logger.info(`✅ Year-End Closing Task ${taskId} completed`, {
        duration: `${duration}ms`,
        fiscalYear,
        entriesProcessed: result.summary.totalJournalEntries
      });

      // Update task status in database
      await this.updateTaskStatus(taskId, {
        status: 'COMPLETED',
        completedAt: new Date(),
        duration,
        resultSummary: result.summary
      });

      return {
        taskId,
        status: 'COMPLETED',
        startTime: new Date(startTime),
        endTime: new Date(),
        duration,
        result
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error(`❌ Year-End Closing Task ${taskId} failed:`, error);

      // Send failure notifications
      await this.sendTaskNotifications(
        taskConfig,
        { error: error.message },
        duration,
        'FAILED'
      );

      // Update task status
      await this.updateTaskStatus(taskId, {
        status: 'FAILED',
        failedAt: new Date(),
        duration,
        error: error.message
      });

      throw error;
      
    } finally {
      this.isRunning = false;
      this.currentTaskId = null;
    }
  }

  /**
   * Execute a dry run (test without making changes)
   */
  async executeDryRun(taskConfig = {}) {
    logger.info('🔍 Starting Year-End Closing Dry Run', taskConfig);

    const result = await GLAccountEOYController.executeYearEndClosing({
      fiscalYear: taskConfig.fiscalYear || new Date().getFullYear() - 1,
      userId: taskConfig.userId || 'test',
      branchId: taskConfig.branchId || 1,
      productFilter: taskConfig.product,
      dryRun: true
    });

    return {
      status: 'DRY_RUN_COMPLETED',
      result,
      message: 'No changes were made to the database'
    };
  }

  /**
   * Check if a date is the last day of the year
   */
  isLastDayOfYear(date) {
    const lastDay = new Date(date.getFullYear(), 11, 31);
    return date.getDate() === lastDay.getDate() && 
           date.getMonth() === lastDay.getMonth();
  }

  /**
   * Check if date is a holiday
   */
  async isHoliday(date) {
    const Holiday = (await import('../models/Holiday.js')).default;
    
    const holiday = await Holiday.findOne({
      where: {
        holiday_date: {
          [Op.between]: [
            new Date(date.getFullYear(), date.getMonth(), date.getDate()),
            new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)
          ]
        }
      }
    });

    return !!holiday;
  }

  /**
   * Send notifications based on task configuration
   */
  async sendTaskNotifications(taskConfig, result, duration, status) {
    const { notificationType = 'BOTH', product = 'ALL' } = taskConfig;
    
    const notificationData = {
      taskId: this.currentTaskId,
      fiscalYear: taskConfig.fiscalYear,
      status,
      duration: `${duration}ms`,
      product,
      timestamp: new Date(),
      resultSummary: result.summary || { error: result.error }
    };

    // Send email notifications
    if (notificationType === 'EMAIL' || notificationType === 'BOTH') {
      await sendSystemAlert({
        type: status === 'SUCCESS' ? 'EOY_SUCCESS' : 'EOY_FAILED',
        title: `Year-End Closing ${status === 'SUCCESS' ? 'Completed' : 'Failed'}`,
        message: `Task ${this.currentTaskId} ${status === 'SUCCESS' ? 'completed' : 'failed'} for FY ${taskConfig.fiscalYear}`,
        data: notificationData,
        recipients: ['finance@bank.com', 'operations@bank.com'],
        priority: status === 'FAILED' ? 'HIGH' : 'NORMAL'
      });
    }

    // Send SMS notifications
    if (notificationType === 'SMS' || notificationType === 'BOTH') {
      // Implement SMS sending logic here
      logger.info(`📱 SMS notification would be sent for task ${this.currentTaskId}`);
    }

    // Log to audit trail
    const AuditTrail = (await import('../models/AuditTrail.js')).default;
    await AuditTrail.create({
      action: 'EOY_TASK_EXECUTION',
      entity_type: 'scheduled_task',
      entity_id: this.currentTaskId,
      user_id: taskConfig.userId || 'system',
      details: notificationData,
      status: status === 'SUCCESS' ? 'SUCCESS' : 'FAILED',
      ip_address: 'system'
    });
  }

  /**
   * Update task status in database
   */
  async updateTaskStatus(taskId, updates) {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    
    await ScheduledTask.update(updates, {
      where: { task_id: taskId }
    });
  }

  /**
   * Get task execution status
   */
  async getTaskStatus(taskId) {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    
    return await ScheduledTask.findOne({
      where: { task_id: taskId },
      attributes: ['task_id', 'status', 'started_at', 'completed_at', 
                   'failed_at', 'duration', 'result_summary', 'error']
    });
  }

  /**
   * Get all recent EOY tasks
   */
  async getRecentTasks(limit = 10) {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    
    return await ScheduledTask.findAll({
      where: { 
        task_type: 'YEAR_END_CLOSING',
        created_at: {
          [Op.gte]: new Date(new Date().setFullYear(new Date().getFullYear() - 1))
        }
      },
      order: [['created_at', 'DESC']],
      limit
    });
  }

  /**
   * Restart a failed task
   */
  async restartTask(taskId, userId) {
    // Get the original task configuration
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    const originalTask = await ScheduledTask.findOne({
      where: { task_id: taskId }
    });

    if (!originalTask) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (originalTask.status !== 'FAILED') {
      throw new Error(`Task ${taskId} cannot be restarted (status: ${originalTask.status})`);
    }

    logger.info(`🔄 Restarting failed task: ${taskId}`, { userId });

    // Create new task with same configuration
    const newTaskId = `EOY-RESTART-${Date.now()}`;
    const taskConfig = {
      ...originalTask.configuration,
      taskId: newTaskId,
      userId: userId || originalTask.user_id
    };

    return await this.executeScheduledTask(taskConfig);
  }

  /**
   * Cancel a running task
   */
  async cancelTask(taskId, reason, userId) {
    if (this.currentTaskId === taskId && this.isRunning) {
      // Implement cancellation logic
      // This would need to interrupt the GLAccountEOYController
      logger.info(`🛑 Cancelling task ${taskId}: ${reason}`, { userId });
      
      // Update task status
      await this.updateTaskStatus(taskId, {
        status: 'CANCELLED',
        cancelled_at: new Date(),
        cancelled_by: userId,
        cancellation_reason: reason
      });

      this.isRunning = false;
      this.currentTaskId = null;

      return { success: true, message: 'Task cancelled' };
    }

    throw new Error(`Task ${taskId} is not running or not found`);
  }
}

// Singleton instance
export const eoyTaskService = new EOYTaskService();