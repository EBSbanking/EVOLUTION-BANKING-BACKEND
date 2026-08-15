// Services/EOMTaskService.js
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import ScheduledTask from '../models/ScheduledTask.js';
import EOMClosingPeriod from '../models/EOMClosingPeriod.js';
import EOMReport from '../models/EOMReport.js';
import Transaction from '../models/Transaction.js';
import DepositTransaction from '../models/DepositTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import GLAccount from '../models/GLAccount.js';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import moment from 'moment';

class EOMTaskService {
  /**
   * Create an EOM task configuration
   */
  static createEOMTaskConfig({
    month,
    year,
    runMode = 'MANDATORY',
    accessMode = 'FULL_UPDATE',
    notificationType = 'BOTH',
    product = 'ALL',
    skipOnHoliday = true,
    userId = 'system',
    branchId = 1,
    organizationCode = 1,
    branchCode = '001',
    dryRun = false
  }) {
    const taskId = `EOM-${year}-${String(month).padStart(2, '0')}-${Date.now()}`;
    
    return {
      taskId,
      month,
      year,
      runMode,
      accessMode,
      notificationType,
      product,
      skipOnHoliday,
      userId,
      branchId,
      organizationCode,
      branchCode,
      dryRun,
      created_at: new Date(),
      status: 'pending'
    };
  }

  /**
   * Execute EOM Closing Task
   */
  static async executeEOMTask(taskConfig) {
    const {
      taskId,
      month,
      year,
      userId,
      organizationCode,
      branchCode,
      dryRun
    } = taskConfig;

    logger.info(`🚀 Executing EOM Task ${taskId} for ${month}/${year}`, {
      userId,
      organizationCode,
      branchCode,
      dryRun
    });

    const startTime = Date.now();
    let status = 'completed';
    let errors = [];
    let warnings = [];

    try {
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
        return {
          success: false,
          status: 'skipped',
          message: `Month ${month}/${year} is already closed`,
          taskId
        };
      }

      const periodStart = new Date(year, month - 1, 1);
      const periodEnd = new Date(year, month, 0);

      // Get all transactions for the period
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

      // Calculate totals
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

      // Check if there are any customer accounts to update
      const customerAccounts = await CustomerAccount.findAll({
        where: {
          status: 'ACTIVE',
          updated_at: {
            [Op.between]: [periodStart, periodEnd]
          }
        }
      });

      if (!dryRun) {
        // Create or update closing period
        let closingPeriod = await EOMClosingPeriod.findOne({
          where: {
            month: month,
            year: year,
            organization_code: organizationCode,
            branch_code: branchCode
          }
        });

        if (closingPeriod) {
          closingPeriod.status = 'CLOSED';
          closingPeriod.closed_by = userId;
          closingPeriod.closed_at = new Date();
          closingPeriod.total_entries = transactions.length + depositTransactions.length;
          closingPeriod.total_amount = totalAmount;
          await closingPeriod.save();
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
          });
        }

        // Generate EOM Report
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
            depositTransactionCount: depositTransactions.length,
            customerAccountCount: customerAccounts.length
          }
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
        });

        // Update closing period with report ID
        closingPeriod.report_id = reportId;
        await closingPeriod.save();

        logger.info(`✅ EOM Task ${taskId} completed`, {
          totalTransactions: transactions.length + depositTransactions.length,
          totalAmount,
          reportId
        });
      } else {
        logger.info(`📋 DRY RUN: EOM Task ${taskId} simulated`, {
          totalTransactions: transactions.length + depositTransactions.length,
          totalAmount
        });
        status = 'dry_run';
      }

      const executionTime = Date.now() - startTime;

      return {
        success: true,
        status: status,
        taskId,
        executionTime,
        month,
        year,
        summary: {
          totalTransactions: transactions.length + depositTransactions.length,
          totalAmount,
          totalCredits,
          totalDebits,
          totalEMTL,
          customerAccountCount: customerAccounts.length
        },
        dryRun,
        errors,
        warnings
      };

    } catch (error) {
      logger.error(`❌ EOM Task ${taskId} failed:`, error);
      status = 'failed';
      errors.push({
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        status: status,
        taskId,
        error: error.message,
        errors,
        warnings
      };
    }
  }

  /**
   * Execute scheduled EOM task
   */
  static async executeScheduledTask(taskConfig) {
    // Save task to database
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    
    const task = await ScheduledTask.create({
      task_id: taskConfig.taskId,
      task_type: 'END_OF_MONTH',
      task_name: `EOM Closing ${taskConfig.month}/${taskConfig.year}`,
      status: 'in_progress',
      configuration: taskConfig,
      created_by: taskConfig.userId,
      branch_id: taskConfig.branchId,
      started_at: new Date(),
      updated_at: new Date()
    });

    try {
      const result = await this.executeEOMTask(taskConfig);
      
      // Update task status
      await task.update({
        status: result.success ? 'completed' : 'failed',
        completed_at: new Date(),
        execution_result: result,
        updated_at: new Date()
      });

      // Log audit
      await auditLogger.info({
        action: 'EOM_TASK_EXECUTED',
        entity_type: 'scheduled_task',
        entity_id: taskConfig.taskId,
        user_id: taskConfig.userId,
        branch_id: taskConfig.branchId,
        new_value: {
          month: taskConfig.month,
          year: taskConfig.year,
          status: result.success ? 'completed' : 'failed',
          dryRun: taskConfig.dryRun
        },
        outcome: result.success ? 'success' : 'failed'
      });

      return result;

    } catch (error) {
      await task.update({
        status: 'failed',
        completed_at: new Date(),
        error_message: error.message,
        updated_at: new Date()
      });

      throw error;
    }
  }

  /**
   * Execute dry run
   */
  static async executeDryRun(taskConfig) {
    const dryRunConfig = {
      ...taskConfig,
      dryRun: true
    };
    return await this.executeEOMTask(dryRunConfig);
  }

  /**
   * Get task status
   */
  static async getTaskStatus(taskId) {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    return await ScheduledTask.findOne({
      where: { task_id: taskId }
    });
  }

  /**
   * Get recent tasks
   */
  static async getRecentTasks(limit = 10) {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    return await ScheduledTask.findAll({
      where: {
        task_type: 'END_OF_MONTH'
      },
      order: [['created_at', 'DESC']],
      limit: limit
    });
  }

  /**
   * Restart a failed task
   */
  static async restartTask(taskId, userId) {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    const task = await ScheduledTask.findOne({
      where: { task_id: taskId }
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'failed') {
      throw new Error(`Task ${taskId} is not in failed state (status: ${task.status})`);
    }

    const config = task.configuration;
    config.userId = userId;
    config.taskId = `${taskId}-restart-${Date.now()}`;

    return await this.executeScheduledTask(config);
  }

  /**
   * Cancel a running task
   */
  static async cancelTask(taskId, reason, userId) {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    const task = await ScheduledTask.findOne({
      where: { task_id: taskId }
    });

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    if (task.status !== 'in_progress') {
      throw new Error(`Task ${taskId} is not in progress (status: ${task.status})`);
    }

    await task.update({
      status: 'cancelled',
      completed_at: new Date(),
      cancellation_reason: reason,
      cancelled_by: userId,
      updated_at: new Date()
    });

    return {
      taskId,
      status: 'cancelled',
      reason,
      cancelledBy: userId,
      cancelledAt: new Date()
    };
  }

  /**
   * Check if EOM is already running
   */
  static async isEOMRunning() {
    const ScheduledTask = (await import('../models/ScheduledTask.js')).default;
    const runningTask = await ScheduledTask.findOne({
      where: {
        task_type: 'END_OF_MONTH',
        status: 'in_progress'
      }
    });
    return !!runningTask;
  }

  /**
   * Get latest EOM status
   */
  static async getLatestEOMStatus(organizationCode = 1, branchCode = '001') {
    const latestClosing = await EOMClosingPeriod.findOne({
      where: {
        organization_code: organizationCode,
        branch_code: branchCode,
        status: 'CLOSED'
      },
      order: [['year', 'DESC'], ['month', 'DESC']]
    });

    const latestReport = await EOMReport.findOne({
      where: {
        organization_code: organizationCode,
        branch_code: branchCode,
        status: 'COMPLETED'
      },
      order: [['year', 'DESC'], ['month', 'DESC']]
    });

    return {
      latestClosing,
      latestReport,
      isRunning: await this.isEOMRunning()
    };
  }
}

// ✅ ONLY ONE export default - REMOVE THE DUPLICATE
export default EOMTaskService;