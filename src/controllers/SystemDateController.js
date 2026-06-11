// controllers/SystemDateController.js - FINAL WORKING VERSION
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { calculateNextBusinessDate, shouldSkipDate } from '../utils/dateUtils.js';
import { 
  getBusinessDate, 
  getServerTime,
  setServerTimeOffset,
  freezeTime,
  unfreezeTime 
} from '../services/timeService.js';

// =============================================
// SYSTEM DATE MANAGEMENT CONTROLLERS
// =============================================

const SystemDateController = {

  /**
   * Ensure the business date is not stuck (next <= current) and not stale (>7 days behind)
   * Auto-corrects by setting current to the most recent business day and next to the next business day.
   */
  async ensureRecentBusinessDate() {
    try {
      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
      if (!systemDate) return false;

      const current = new Date(systemDate.current_business_date);
      const next = new Date(systemDate.next_business_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today);
      sevenDaysAgo.setDate(today.getDate() - 7);

      const isStale = current < sevenDaysAgo;
      const isStuck = next <= current;

      if (isStale || isStuck) {
        logger.warn(`Business date correction needed: current=${current.toISOString().split('T')[0]}, next=${next.toISOString().split('T')[0]}. Auto-correcting...`);

        // Find the most recent business day (today or earlier)
        let target = new Date(today);
        while (await shouldSkipDate(target)) {
          target.setDate(target.getDate() - 1);
        }
        const newCurrent = target;
        const newNext = await calculateNextBusinessDate(newCurrent);

        systemDate.current_business_date = newCurrent;
        systemDate.next_business_date = newNext;
        systemDate.updated_at = new Date();
        await systemDate.save();

        logger.info(`Auto-corrected business date to ${newCurrent.toISOString().split('T')[0]}, next: ${newNext.toISOString().split('T')[0]}`);
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to auto-correct business date', { error: error.message });
      return false;
    }
  },

  /**
   * Get current business date
   */
  async getCurrentBusinessDate(req, res) {
    // ✅ FIX: use controller name to avoid 'this' binding issues
    await SystemDateController.ensureRecentBusinessDate();

    try {
      logger.info('📅 Getting current business date...');
      const businessDate = await getBusinessDate({ 
        user_id: req.user?.id || 'system',
        ip_address: req.ip || req.connection.remoteAddress 
      });
      let systemDate = null;
      if (SystemDate.ensureTableExists) await SystemDate.ensureTableExists();
      systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });

      if (!systemDate) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let businessDate = new Date(today);
        let daysToAdd = 0;
        while (await shouldSkipDate(businessDate)) {
          daysToAdd++;
          businessDate.setDate(today.getDate() + daysToAdd);
          businessDate.setHours(0, 0, 0, 0);
        }
        const nextBusinessDate = await calculateNextBusinessDate(businessDate);
        const newSystemDate = await SystemDate.create({
          current_business_date: businessDate,
          next_business_date: nextBusinessDate,
          last_e_o_d_date: null,
          last_e_o_d_processed_by: null,
          is_e_o_d_processing: false,
          eod_status: 'IDLE',
          eod_history: []
        });
        logger.info('System date initialized automatically', { currentDate: businessDate, nextDate: nextBusinessDate });
        return res.status(200).json({
          success: true,
          data: {
            id: newSystemDate.id,
            current_business_date: newSystemDate.current_business_date,
            next_business_date: newSystemDate.next_business_date,
            serverTime: getServerTime(),
            formattedDate: businessDate.toISOString().split('T')[0],
            last_e_o_d_date: newSystemDate.last_e_o_d_date,
            last_e_o_d_processed_by: newSystemDate.last_e_o_d_processed_by,
            is_e_o_d_processing: newSystemDate.is_e_o_d_processing,
            eod_status: newSystemDate.eod_status,
            eod_history: newSystemDate.eod_history || [],
            created_at: newSystemDate.created_at,
            updated_at: newSystemDate.updated_at
          }
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: systemDate.id,
          current_business_date: systemDate.current_business_date,
          next_business_date: systemDate.next_business_date,
          serverTime: getServerTime(),
          formattedDate: systemDate.current_business_date 
            ? new Date(systemDate.current_business_date).toISOString().split('T')[0] 
            : new Date().toISOString().split('T')[0],
          last_e_o_d_date: systemDate.last_e_o_d_date,
          last_e_o_d_processed_by: systemDate.last_e_o_d_processed_by,
          is_e_o_d_processing: systemDate.is_e_o_d_processing,
          eod_status: systemDate.eod_status,
          eod_history: systemDate.eod_history || [],
          created_at: systemDate.created_at,
          updated_at: systemDate.updated_at
        }
      });
    } catch (error) {
      logger.error('❌ Error getting current business date:', error);
      const fallbackDate = new Date();
      fallbackDate.setHours(0, 0, 0, 0);
      const nextDate = new Date(fallbackDate);
      nextDate.setDate(nextDate.getDate() + 1);
      return res.status(200).json({
        success: true,
        data: {
          current_business_date: fallbackDate,
          next_business_date: nextDate,
          serverTime: getServerTime(),
          formattedDate: fallbackDate.toISOString().split('T')[0],
          eod_status: 'IDLE',
          is_e_o_d_processing: false,
          eod_history: []
        },
        isFallback: true,
        message: 'Using fallback date due to system error: ' + error.message
      });
    }
  },

  async checkHoliday(req, res) {
    try {
      const { date } = req.params;
      const { country } = req.query;
      const checkDate = date ? new Date(date) : new Date();
      checkDate.setHours(0, 0, 0, 0);
      if (isNaN(checkDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }
      const holiday = await Holiday.isHoliday(checkDate, { country: country || 'US', includeInactive: false });
      return res.status(200).json({
        success: true,
        data: {
          date: checkDate,
          isHoliday: !!holiday,
          holidayInfo: holiday ? {
            id: holiday.id,
            name: holiday.holidayName,
            description: holiday.description,
            date: holiday.holidayDate,
            recurring: holiday.recurring,
            country: holiday.country
          } : null,
          country: country || 'US'
        }
      });
    } catch (error) {
      logger.error('Failed to check holiday status', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async initializeSystemDate(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const { userId, initialDate } = req.body;
      if (!userId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'userId is required' });
      }
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN'];
      if (!allowedRoles.includes(user.primary_role)) {
        await transaction.rollback();
        return res.status(403).json({ success: false, message: 'Insufficient permissions to initialize system date' });
      }
      const count = await SystemDate.count({ transaction });
      if (count > 0) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'System date already initialized' });
      }
      let today = initialDate ? new Date(initialDate) : new Date();
      today.setHours(0, 0, 0, 0);
      let skippedDays = 0;
      while (await shouldSkipDate(today)) {
        today.setDate(today.getDate() + 1);
        skippedDays++;
      }
      let nextBusinessDate = await calculateNextBusinessDate(today);
      const newSystemDate = await SystemDate.create({
        current_business_date: today,
        next_business_date: nextBusinessDate,
        is_e_o_d_processing: false,
        eod_status: 'IDLE',
        eod_history: [{
          type: 'INITIALIZATION',
          processedDate: today,
          processingStart: new Date(),
          processingEnd: new Date(),
          processedBy: { userId: user.id, username: user.username, role: user.primary_role },
          status: 'COMPLETED',
          transactionsProcessed: 0,
          notes: ['System date initialized manually'],
          skippedDays: skippedDays > 0 ? skippedDays : 0
        }]
      }, { transaction });
      await transaction.commit();
      logger.info('System date initialized manually', { userId: user.id, current_business_date: today, next_business_date: nextBusinessDate, skippedDays });
      return res.status(201).json({
        success: true,
        message: 'System date initialized successfully',
        data: { systemDate: newSystemDate, serverTime: getServerTime(), formattedDate: today.toISOString().split('T')[0], skippedDays: skippedDays > 0 ? skippedDays : 0 }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('System date initialization failed', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async updateEODStatus(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const { status, userId, reason } = req.body;
      const validStatuses = ['IDLE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid EOD status' });
      }
      if (!userId) {
        return res.status(400).json({ success: false, message: 'userId is required' });
      }
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions to update EOD status' });
      }
      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']], transaction });
      if (!systemDate) {
        return res.status(404).json({ success: false, message: 'System date not found' });
      }
      const previousStatus = systemDate.eod_status;
      systemDate.eod_status = status;
      systemDate.updated_at = new Date();
      if (systemDate.eod_history) {
        const eodHistory = systemDate.eod_history || [];
        eodHistory.push({
          type: 'STATUS_CHANGE',
          timestamp: new Date(),
          processedBy: { userId: user.id, username: user.username, role: user.primary_role },
          previousStatus,
          newStatus: status,
          reason: reason || 'Manual status update'
        });
        systemDate.eod_history = eodHistory;
      }
      await systemDate.save({ transaction });
      await transaction.commit();
      logger.info(`EOD status updated from ${previousStatus} to ${status} by ${user.username}`, { userId: user.id, previousStatus, newStatus: status, reason });
      return res.status(200).json({
        success: true,
        message: 'EOD status updated successfully',
        data: { eod_status: status, previousStatus, updatedBy: { userId: user.id, username: user.username, role: user.primary_role }, timestamp: new Date() }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to update EOD status', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async getEODHistory(req, res) {
    try {
      const { limit = 50, offset = 0 } = req.query;
      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
      if (!systemDate) {
        return res.status(404).json({ success: false, message: 'System date not found' });
      }
      const history = systemDate.eod_history || [];
      const sortedHistory = [...history].sort((a, b) => {
        const dateA = new Date(a.timestamp || a.processingStart || 0);
        const dateB = new Date(b.timestamp || b.processingStart || 0);
        return dateB - dateA;
      });
      const paginatedHistory = sortedHistory.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
      return res.status(200).json({
        success: true,
        data: {
          history: paginatedHistory,
          pagination: {
            total: sortedHistory.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: parseInt(offset) + paginatedHistory.length < sortedHistory.length
          }
        }
      });
    } catch (error) {
      logger.error('Failed to fetch EOD history', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async setBusinessDate(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const { businessDate, reason, userId } = req.body;
      if (!businessDate || !userId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'businessDate and userId are required' });
      }
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'BRANCH_MANAGER', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        await transaction.rollback();
        return res.status(403).json({ success: false, message: 'Insufficient permissions to set business date' });
      }
      const targetDate = new Date(businessDate);
      if (isNaN(targetDate.getTime())) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }
      targetDate.setHours(0, 0, 0, 0);
      const holiday = await Holiday.isHoliday(targetDate);
      if (holiday) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: `Cannot set business date to a holiday: ${holiday.holidayName}`, holiday: { id: holiday.id, name: holiday.holidayName, description: holiday.description, date: holiday.holidayDate, recurring: holiday.recurring } });
      }
      const dayOfWeek = targetDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Cannot set business date to a weekend' });
      }
      let systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']], transaction });
      if (!systemDate) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'System date not found. Please initialize first.' });
      }
      if (systemDate.is_e_o_d_processing) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Cannot change date while EOD is in progress' });
      }
      const previousDate = new Date(systemDate.current_business_date);
      systemDate.current_business_date = targetDate;
      systemDate.next_business_date = await calculateNextBusinessDate(targetDate);
      const eodHistory = systemDate.eod_history || [];
      eodHistory.push({
        type: 'MANUAL_SET',
        processedDate: targetDate,
        previousDate: previousDate,
        processingStart: new Date(),
        processingEnd: new Date(),
        processedBy: { userId: user.id, username: user.username, role: user.primary_role },
        status: 'COMPLETED',
        transactionsProcessed: 0,
        reason: reason || 'No reason provided',
        notes: [`Manual date set from ${previousDate.toISOString().split('T')[0]} to ${targetDate.toISOString().split('T')[0]}`]
      });
      systemDate.eod_history = eodHistory;
      systemDate.updated_at = new Date();
      await systemDate.save({ transaction });
      await transaction.commit();
      logger.info(`Business date manually set to ${targetDate.toISOString().split('T')[0]} by ${user.username}`, { userId: user.id, targetDate, reason });
      return res.status(200).json({
        success: true,
        message: 'Business date set successfully',
        data: {
          current_business_date: systemDate.current_business_date,
          next_business_date: systemDate.next_business_date,
          formattedDate: targetDate.toISOString().split('T')[0],
          serverTime: getServerTime(),
          setBy: { userId: user.id, username: user.username, role: user.primary_role },
          timestamp: new Date(),
          reason: reason
        }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Set business date error:', error);
      return res.status(500).json({ success: false, message: 'Failed to set business date', error: error.message });
    }
  },

  async updateBusinessDate(req, res) {
    const transaction = await sequelize.transaction();
    try {
      const { direction, days, reason, userId } = req.body;
      if (!direction || !days || !userId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'direction, days, and userId are required' });
      }
      const upperDirection = direction.toUpperCase();
      if (!['FORWARD', 'BACKWARD'].includes(upperDirection)) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'direction must be FORWARD or BACKWARD' });
      }
      if (days <= 0 || days > 365) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'days must be between 1 and 365' });
      }
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        await transaction.rollback();
        return res.status(403).json({ success: false, message: 'Insufficient permissions to update business date' });
      }
      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']], transaction });
      if (!systemDate) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'System date not found' });
      }
      if (systemDate.is_e_o_d_processing) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Cannot change date while EOD is in progress' });
      }
      const currentDate = new Date(systemDate.current_business_date);
      const previousDate = new Date(currentDate);
      const daysToMove = upperDirection === 'FORWARD' ? parseInt(days) : -parseInt(days);
      let newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + daysToMove);
      newDate.setHours(0, 0, 0, 0);
      if (upperDirection === 'FORWARD') {
        let skippedDays = 0;
        while (await shouldSkipDate(newDate)) {
          newDate.setDate(newDate.getDate() + 1);
          skippedDays++;
        }
        if (skippedDays > 0) logger.info(`Skipped ${skippedDays} non-business days during forward adjustment`);
      } else {
        while (await shouldSkipDate(newDate)) newDate.setDate(newDate.getDate() - 1);
      }
      systemDate.current_business_date = newDate;
      systemDate.next_business_date = await calculateNextBusinessDate(newDate);
      const eodHistory = systemDate.eod_history || [];
      eodHistory.push({
        type: 'MANUAL_ADJUST',
        processedDate: newDate,
        previousDate: previousDate,
        processingStart: new Date(),
        processingEnd: new Date(),
        processedBy: { userId: user.id, username: user.username, role: user.primary_role },
        status: 'COMPLETED',
        transactionsProcessed: 0,
        adjustment: { direction: upperDirection, days: parseInt(days), actualDays: Math.abs((newDate - previousDate) / (1000 * 60 * 60 * 24)) },
        reason: reason || 'No reason provided',
        notes: [`Date adjusted ${upperDirection.toLowerCase()} by ${days} days`]
      });
      systemDate.eod_history = eodHistory;
      systemDate.updated_at = new Date();
      await systemDate.save({ transaction });
      await transaction.commit();
      logger.info(`Business date adjusted ${upperDirection.toLowerCase()} by ${days} days from ${previousDate.toISOString().split('T')[0]} to ${newDate.toISOString().split('T')[0]} by ${user.username}`, { userId: user.id, direction: upperDirection, days, reason });
      return res.status(200).json({
        success: true,
        message: `Business date adjusted ${upperDirection.toLowerCase()} by ${days} days`,
        data: {
          previous_business_date: previousDate,
          current_business_date: newDate,
          next_business_date: systemDate.next_business_date,
          formattedDate: newDate.toISOString().split('T')[0],
          serverTime: getServerTime(),
          adjustment: { direction: upperDirection, days: parseInt(days), from: previousDate.toISOString().split('T')[0], to: newDate.toISOString().split('T')[0] },
          adjustedBy: { userId: user.id, username: user.username, role: user.primary_role },
          timestamp: new Date(),
          reason: reason
        }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Update business date error:', error);
      return res.status(500).json({ success: false, message: 'Failed to update business date', error: error.message });
    }
  },

  /**
   * Process End of Day (EOD) - FIXED: always advance from current date
   */
  async processEOD(req, res) {
    let transactionCompleted = false;
    const transaction = await sequelize.transaction();

    try {
      const { userId, force = false } = req.body;
      if (!userId) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'userId is required' });
      }

      let user;
      let isSystemUser = false;
      if (userId === 'system') {
        isSystemUser = true;
        user = { id: 0, username: 'system', primary_role: 'SYSTEM_ADMIN', firstName: 'System', lastName: 'User' };
        logger.info('Using system user for EOD processing');
      } else {
        user = await User.findByPk(userId, { transaction });
        if (!user) {
          await transaction.rollback();
          return res.status(404).json({ success: false, message: 'User not found' });
        }
      }

      if (!isSystemUser) {
        const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER'];
        if (!allowedRoles.includes(user.primary_role)) {
          await transaction.rollback();
          return res.status(403).json({ success: false, message: 'Insufficient permissions to process EOD' });
        }
      }

      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']], transaction });
      if (!systemDate) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'System date not found' });
      }

      if (systemDate.is_e_o_d_processing && !force) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'EOD is already in progress. Use force=true to override.' });
      }

      // Convert stored dates to Date objects
      const currentDate = new Date(systemDate.current_business_date);

      // Check holiday
      let isTodayHoliday = null;
      try {
        isTodayHoliday = await Holiday.isHoliday(currentDate);
      } catch (holidayError) {
        logger.warn('Holiday check failed, continuing with EOD', { error: holidayError.message });
      }

      if (isTodayHoliday && !force) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Cannot process EOD on a holiday: ${isTodayHoliday.holidayName}. Use force=true to override.`,
          holiday: { name: isTodayHoliday.holidayName, description: isTodayHoliday.description }
        });
      }

      const processingStart = new Date();
      systemDate.is_e_o_d_processing = true;
      systemDate.eod_status = 'IN_PROGRESS';
      await systemDate.save({ transaction });

      // Simulate EOD tasks (replace with actual logic)
      const mockTransactionsProcessed = Math.floor(Math.random() * 100) + 1;
      await new Promise(resolve => setTimeout(resolve, 1000));

      const previousDate = currentDate;
      // ✅ FIX: always compute new current date from current date
      const newCurrentDate = await calculateNextBusinessDate(currentDate);
      const newNextDate = await calculateNextBusinessDate(newCurrentDate);

      systemDate.current_business_date = newCurrentDate;
      systemDate.next_business_date = newNextDate;
      systemDate.last_e_o_d_date = previousDate;
      systemDate.last_e_o_d_processed_by = user.username || 'system';
      systemDate.is_e_o_d_processing = false;
      systemDate.eod_status = 'COMPLETED';
      systemDate.updated_at = new Date();

      const eodHistory = systemDate.eod_history || [];
      eodHistory.push({
        type: 'EOD_PROCESSING',
        processedDate: previousDate,
        newDate: newCurrentDate,
        processingStart: processingStart,
        processingEnd: new Date(),
        processedBy: { userId: user.id || 0, username: user.username || 'system', role: user.primary_role || 'SYSTEM_ADMIN' },
        status: 'COMPLETED',
        transactionsProcessed: mockTransactionsProcessed,
        errors: [],
        duration: (new Date() - processingStart) / 1000,
        notes: ['EOD processed successfully'],
        wasHoliday: !!isTodayHoliday
      });
      systemDate.eod_history = eodHistory;

      await systemDate.save({ transaction });
      await transaction.commit();
      transactionCompleted = true;

      logger.info(`EOD processed for ${previousDate.toISOString().split('T')[0]} by ${user.username || 'system'}`, {
        userId: user.id || 0,
        previousDate,
        newDate: newCurrentDate,
        duration: (new Date() - processingStart) / 1000,
        transactions: mockTransactionsProcessed
      });

      return res.status(200).json({
        success: true,
        message: 'EOD processed successfully',
        data: {
          previous_business_date: previousDate,
          current_business_date: newCurrentDate,
          next_business_date: newNextDate,
          formattedDate: newCurrentDate.toISOString().split('T')[0],
          serverTime: getServerTime(),
          processedBy: { userId: user.id || 0, username: user.username || 'system', role: user.primary_role || 'SYSTEM_ADMIN' },
          processingDuration: (new Date() - processingStart) / 1000,
          transactionsProcessed: mockTransactionsProcessed,
          timestamp: new Date()
        }
      });

    } catch (error) {
      if (!transactionCompleted) {
        await transaction.rollback();
      }
      logger.error('Process EOD error:', error);
      
      // Update system date to failed status (outside transaction)
      try {
        const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
        if (systemDate) {
          systemDate.is_e_o_d_processing = false;
          systemDate.eod_status = 'FAILED';
          systemDate.updated_at = new Date();
          await systemDate.save();
        }
      } catch (updateError) {
        logger.error('Failed to update system date after EOD error:', updateError);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to process EOD',
        error: error.message,
        timestamp: new Date()
      });
    }
  },

  async validateBusinessDate(req, res) {
    try {
      const { date } = req.body;
      if (!date) return res.status(400).json({ success: false, message: 'Date is required' });
      const checkDate = new Date(date);
      if (isNaN(checkDate.getTime())) return res.status(400).json({ success: false, message: 'Invalid date format' });
      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
      const currentBusinessDate = systemDate ? new Date(systemDate.current_business_date) : new Date();
      checkDate.setHours(0, 0, 0, 0);
      currentBusinessDate.setHours(0, 0, 0, 0);
      const isValid = checkDate.getTime() === currentBusinessDate.getTime();
      const isPast = checkDate < currentBusinessDate;
      const isFuture = checkDate > currentBusinessDate;
      const holiday = await Holiday.isHoliday(checkDate);
      const isHoliday = !!holiday;
      const isWeekend = checkDate.getDay() === 0 || checkDate.getDay() === 6;
      let upcomingHolidays = [];
      if (isFuture) upcomingHolidays = await Holiday.getHolidaysInRange(currentBusinessDate, checkDate);
      return res.status(200).json({
        success: true,
        data: {
          date: checkDate,
          current_business_date: currentBusinessDate,
          serverTime: getServerTime(),
          formattedDate: checkDate.toISOString().split('T')[0],
          validation: {
            isValid,
            isPast,
            isFuture,
            isHoliday,
            holidayInfo: holiday ? { id: holiday.id, name: holiday.holidayName, description: holiday.description, recurring: holiday.recurring } : null,
            isWeekend,
            isBusinessDay: !isHoliday && !isWeekend,
            daysDifference: Math.floor((checkDate - currentBusinessDate) / (1000 * 60 * 60 * 24))
          },
          upcomingHolidaysInRange: upcomingHolidays.length,
          message: isValid ? 'Date matches current business date' : isPast ? 'Date is in the past' : 'Date is in the future'
        }
      });
    } catch (error) {
      logger.error('Validate business date error:', error);
      return res.status(500).json({ success: false, message: 'Failed to validate business date', error: error.message });
    }
  },

  async getHolidaysForMonth(req, res) {
    try {
      const { year, month } = req.params;
      const { country } = req.query;
      const targetYear = parseInt(year) || new Date().getFullYear();
      const targetMonth = parseInt(month) !== undefined ? parseInt(month) : new Date().getMonth();
      if (targetMonth < 0 || targetMonth > 11) return res.status(400).json({ success: false, message: 'Month must be between 0 (January) and 11 (December)' });
      const holidays = await Holiday.getHolidaysForMonth(targetYear, targetMonth, { country: country || 'US' });
      return res.status(200).json({
        success: true,
        data: {
          year: targetYear,
          month: targetMonth,
          monthName: new Date(targetYear, targetMonth).toLocaleString('default', { month: 'long' }),
          count: holidays.length,
          holidays: holidays.map(h => ({ id: h.id, name: h.holidayName, description: h.description, date: h.holidayDate, recurring: h.recurring, country: h.country })),
          country: country || 'US'
        }
      });
    } catch (error) {
      logger.error('Failed to get holidays for month', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async getUpcomingHolidays(req, res) {
    try {
      const { days = 30, country } = req.query;
      const holidays = await Holiday.getUpcomingHolidays(parseInt(days), { country: country || 'US' });
      return res.status(200).json({
        success: true,
        data: {
          count: holidays.length,
          days: parseInt(days),
          holidays: holidays.map(h => ({ id: h.id, name: h.holidayName, description: h.description, date: h.actualDate || h.holidayDate, recurring: h.recurring, country: h.country })),
          country: country || 'US'
        }
      });
    } catch (error) {
      logger.error('Failed to get upcoming holidays', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async getNextBusinessDay(req, res) {
    try {
      const { date, country } = req.query;
      const startDate = date ? new Date(date) : new Date();
      if (isNaN(startDate.getTime())) return res.status(400).json({ success: false, message: 'Invalid date format' });
      startDate.setHours(0, 0, 0, 0);
      let nextDate = new Date(startDate);
      let daysChecked = 0;
      const maxDays = 365;
      while (daysChecked < maxDays) {
        nextDate.setDate(nextDate.getDate() + 1);
        daysChecked++;
        const isWeekend = nextDate.getDay() === 0 || nextDate.getDay() === 6;
        if (isWeekend) continue;
        const isHoliday = await Holiday.isHoliday(nextDate, { country: country || 'US' });
        if (!isHoliday) {
          return res.status(200).json({
            success: true,
            data: { inputDate: startDate, nextBusinessDay: nextDate, formattedDate: nextDate.toISOString().split('T')[0], daysChecked, country: country || 'US' }
          });
        }
      }
      return res.status(404).json({ success: false, message: 'No business day found within 365 days' });
    } catch (error) {
      logger.error('Failed to get next business day', { error: error.message });
      return res.status(500).json({ success: false, error: error.message });
    }
  },

  async getServerTime(req, res) {
    try {
      const serverTime = getServerTime();
      res.json({ success: true, data: { serverTime, formattedDate: serverTime.toISOString(), timestamp: serverTime.getTime() } });
    } catch (error) {
      logger.error('Error getting server time:', error);
      res.status(500).json({ success: false, message: 'Failed to get server time', error: error.message });
    }
  },

  async setServerTimeOffset(req, res) {
    try {
      const { offsetMs } = req.body;
      if (offsetMs === undefined) return res.status(400).json({ success: false, message: 'offsetMs is required' });
      if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: 'Admin access required' });
      await setServerTimeOffset(offsetMs, { user_id: req.user?.id || 'system', ip_address: req.ip || req.connection.remoteAddress });
      res.json({ success: true, message: 'Server time offset set successfully', data: { currentServerTime: getServerTime(), offsetMs } });
    } catch (error) {
      logger.error('Error setting server time offset:', error);
      res.status(500).json({ success: false, message: 'Failed to set server time offset', error: error.message });
    }
  }
};

export { SystemDateController };
export default SystemDateController;