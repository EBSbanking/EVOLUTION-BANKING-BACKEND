import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import {
  ERROR_CODES,
  createError,
  getErrorMessage,
  formatErrorResponse
} from '../utils/errorUtils.js';
import mongoose from 'mongoose';
import logAuditTrail from '../Services/AuditService.js';
import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';
import { postDailyAccruedInterest } from '../Services/InterestPostingController.js';
import logger from '../utils/logger.js';

const systemStatus = {
  state: 'idle',
  lastRun: null,
  nextRun: null,
  executionTime: null,
  services: {
    overdueLoans: { healthy: true, lastError: null },
    loanStatusUpdates: { healthy: true, lastError: null },
    pendingRepayments: { healthy: true, lastError: null },
    dormantAccounts: { healthy: true, lastError: null },
    interestPosting: { healthy: true, lastError: null }
  }
};

export class OperationalController {
  static async getCurrentBusinessDate() {
    try {
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      if (!systemDate) {
        throw createError(ERROR_CODES.RESOURCE_NOT_FOUND, 'System date not initialized');
      }
      return systemDate.currentBusinessDate;
    } catch (error) {
      logger.error('Failed to get current business date', {
        error: getErrorMessage(error),
        code: error.code
      });
      throw formatErrorResponse(error);
    }
  }

  static async initializeSystemDate() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const existing = await SystemDate.findOne().session(session);
      if (existing) {
        logger.info('System date already exists');
        await session.commitTransaction();
        return existing.currentBusinessDate;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let nextBusinessDate = new Date(today);
      let isHoliday = true;
      let attempts = 0;

      while (isHoliday && attempts < 30) {
        nextBusinessDate.setDate(nextBusinessDate.getDate() + 1);
        isHoliday =
          (await Holiday.isHoliday(nextBusinessDate)) ||
          nextBusinessDate.getDay() === 0 ||
          nextBusinessDate.getDay() === 6;
        attempts++;
      }

      if (attempts >= 30) {
        throw createError(ERROR_CODES.INITIALIZATION_ERROR, 'Failed to find valid business date');
      }

      const systemDate = new SystemDate({
        currentBusinessDate: today,
        nextBusinessDate,
        isEODProcessing: false,
        eodStatus: 'IDLE'
      });

      await systemDate.save({ session });
      await session.commitTransaction();

      logger.info('System date initialized successfully', {
        currentBusinessDate: today,
        nextBusinessDate
      });

      return today;
    } catch (error) {
      await session.abortTransaction();
      logger.error('Failed to initialize system date', {
        error: getErrorMessage(error),
        code: error.code
      });
      throw formatErrorResponse(error);
    } finally {
      session.endSession();
    }
  }

  static async isHoliday(date) {
    try {
      return await Holiday.isHoliday(date);
    } catch (error) {
      logger.error('Failed to check holiday status', {
        error: getErrorMessage(error),
        code: error.code,
        date
      });
      throw formatErrorResponse(error);
    }
  }

  static async getNextBusinessDay(currentDate) {
    try {
      let nextDate = new Date(currentDate);
      let isHoliday = true;
      let attempts = 0;

      while (isHoliday && attempts < 30) {
        nextDate.setDate(nextDate.getDate() + 1);
        isHoliday =
          (await Holiday.isHoliday(nextDate)) ||
          nextDate.getDay() === 0 ||
          nextDate.getDay() === 6;
        attempts++;
      }

      if (attempts >= 30) {
        throw createError(
          ERROR_CODES.OPERATION_NOT_ALLOWED,
          'Could not find a valid business date'
        );
      }

      return nextDate;
    } catch (error) {
      logger.error('Failed to get next business day', {
        error: getErrorMessage(error),
        code: error.code,
        currentDate
      });
      throw formatErrorResponse(error);
    }
  }

  static async processEndOfDay(userId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const systemDate = await SystemDate.findOneAndUpdate(
        { isEODProcessing: false },
        {
          $set: { isEODProcessing: true, eodStatus: 'IN_PROGRESS' }
        },
        { new: true, session }
      ).session(session);

      if (!systemDate) {
        throw createError(
          ERROR_CODES.OPERATION_NOT_ALLOWED,
          'EOD already in progress or system date not initialized'
        );
      }

      const eodRecord = {
        processedDate: systemDate.currentBusinessDate,
        processingStart: new Date(),
        processedBy: userId,
        status: 'IN_PROGRESS',
        services: {}
      };

      const runService = async (name, fn) => {
        const start = Date.now();
        try {
          await fn();
          const time = Date.now() - start;
          eodRecord.services[name] = { status: 'COMPLETED', executionTime: time };
          systemStatus.services[name] = { healthy: true, lastError: null };
        } catch (error) {
          const time = Date.now() - start;
          const msg = getErrorMessage(error);
          eodRecord.services[name] = {
            status: 'FAILED',
            executionTime: time,
            error: msg
          };
          systemStatus.services[name] = {
            healthy: false,
            lastError: msg,
            lastErrorTime: new Date()
          };
          logger.error(`EOD ${name} failed`, { error: msg });
        }
      };

      await Promise.all([
        runService('loanStatusUpdates', updateLoanStatusForAllLoans),
        runService('overdueLoans', checkOverdueLoans),
        runService('pendingRepayments', processPendingRepayments),
        runService('dormantAccounts', updateDormantAccounts),
        runService('interestPosting', postDailyAccruedInterest)
      ]);

      const nextDate = await this.getNextBusinessDay(systemDate.nextBusinessDate);

      const updated = await SystemDate.findByIdAndUpdate(
        systemDate._id,
        {
          $set: {
            currentBusinessDate: systemDate.nextBusinessDate,
            nextBusinessDate: nextDate,
            isEODProcessing: false,
            eodStatus: 'COMPLETED',
            lastEODProcessedBy: userId
          },
          $push: { eodHistory: eodRecord }
        },
        { new: true, session }
      );

      await logAuditTrail({
        userId,
        action: 'EOD_PROCESSED',
        entityType: 'SYSTEM',
        description: `EOD processed for ${systemDate.currentBusinessDate}`,
        metadata: eodRecord.services
      }, session);

      await session.commitTransaction();

      return { success: true, date: updated.currentBusinessDate };
    } catch (error) {
      await session.abortTransaction();
      logger.error('EOD processing failed', {
        error: getErrorMessage(error),
        code: error.code
      });
      throw formatErrorResponse(error);
    } finally {
      session.endSession();
    }
  }

  static async getSystemStatus() {
    try {
      const date = await this.getCurrentBusinessDate();
      const holiday = await this.isHoliday(date);

      return {
        system: {
          state: systemStatus.state,
          currentBusinessDate: date,
          isHoliday: holiday,
          lastRun: systemStatus.lastRun,
          nextRun: systemStatus.nextRun,
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage()
        },
        services: systemStatus.services,
        status: 'operational'
      };
    } catch (error) {
      logger.error('Failed to get system status', {
        error: getErrorMessage(error),
        code: error.code
      });
      return formatErrorResponse(error);
    }
  }

  static async countDormantAccounts() {
    try {
      return await countDormantAccountsToUpdate();
    } catch (error) {
      logger.error('Failed to count dormant accounts', {
        error: getErrorMessage(error),
        code: error.code
      });
      throw formatErrorResponse(error);
    }
  }
}

export default OperationalController;
