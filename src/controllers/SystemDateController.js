// src/controllers/SystemDateController.js - CORRECTED VERSION
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import { calculateNextBusinessDate, shouldSkipDate } from '../utils/dateUtils.js';

// =============================================
// SYSTEM DATE MANAGEMENT CONTROLLERS
// =============================================

const SystemDateController = {
  /**
   * Get current business date
   * Returns: Current system date with all relevant information
   */
  async getCurrentBusinessDate(req, res) {
    try {
      logger.info('📅 Getting current business date...');
      
      // First ensure table exists
      if (SystemDate.ensureTableExists) {
        await SystemDate.ensureTableExists();
      }
      
      // Get current system date
      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']]
      });

      if (!systemDate) {
        // Initialize system date if not exists
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const nextBusinessDate = await calculateNextBusinessDate(today);
        
        const newSystemDate = await SystemDate.create({
          current_business_date: today,
          next_business_date: nextBusinessDate,
          last_e_o_d_date: null,
          last_e_o_d_processed_by: null,
          is_e_o_d_processing: false,
          eod_status: 'IDLE',
          eod_history: []
        });
        
        logger.info('System date initialized automatically', {
          currentDate: today,
          nextDate: nextBusinessDate
        });
        
        return res.status(200).json({
          success: true,
          data: {
            id: newSystemDate.id,
            current_business_date: newSystemDate.current_business_date,
            next_business_date: newSystemDate.next_business_date,
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
      
      // Fallback response if everything fails
      const fallbackDate = new Date();
      fallbackDate.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(fallbackDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      return res.status(200).json({
        success: true,
        data: {
          current_business_date: fallbackDate,
          next_business_date: nextDate,
          eod_status: 'IDLE',
          is_e_o_d_processing: false,
          eod_history: []
        },
        isFallback: true,
        message: 'Using fallback date due to system error: ' + error.message
      });
    }
  },

  /**
   * Check if the current date is a holiday
   */
  async isHoliday(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Use the model's static method
      const holiday = await Holiday.isHoliday(today);
      const isHoliday = !!holiday;
      
      return res.status(200).json({
        success: true,
        data: {
          date: today,
          isHoliday,
          holidayInfo: holiday
        }
      });
    } catch (error) {
      logger.error('Failed to check holiday status', { error: error.message });
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Set business date manually
   * Required: businessDate, userId, reason (optional)
   */
  async setBusinessDate(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { businessDate, reason, userId } = req.body;

      if (!businessDate || !userId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'businessDate and userId are required'
        });
      }

      // Validate user
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has permission
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'BRANCH_MANAGER', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to set business date'
        });
      }

      // Parse and validate date
      const targetDate = new Date(businessDate);
      if (isNaN(targetDate.getTime())) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      // Set time to start of day (00:00:00)
      targetDate.setHours(0, 0, 0, 0);

      // Check if date is a holiday
      const holiday = await Holiday.isHoliday(targetDate);
      if (holiday) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cannot set business date to a holiday'
        });
      }

      // Get current system date
      let systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']],
        transaction
      });

      if (!systemDate) {
        // Create new system date record
        systemDate = await SystemDate.create({
          current_business_date: targetDate,
          next_business_date: await calculateNextBusinessDate(targetDate),
          eod_history: [],
          is_e_o_d_processing: false,
          eod_status: 'IDLE'
        }, { transaction });
      } else {
        // Check if EOD is in progress
        if (systemDate.is_e_o_d_processing) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Cannot change date while EOD is in progress'
          });
        }

        const previousDate = new Date(systemDate.current_business_date);
        
        // Update existing system date
        systemDate.current_business_date = targetDate;
        systemDate.next_business_date = await calculateNextBusinessDate(targetDate);
        
        // Get current eod_history or initialize it
        const eodHistory = systemDate.eod_history || [];
        
        // Add to EOD history
        eodHistory.push({
          type: 'MANUAL_SET',
          processedDate: targetDate,
          previousDate: previousDate,
          processingStart: new Date(),
          processingEnd: new Date(),
          processedBy: {
            userId: user.id,
            username: user.username,
            role: user.primary_role
          },
          status: 'COMPLETED',
          transactionsProcessed: 0,
          reason: reason || 'No reason provided',
          notes: [`Manual date set from ${previousDate.toISOString().split('T')[0]} to ${targetDate.toISOString().split('T')[0]}`]
        });
        
        systemDate.eod_history = eodHistory;
        systemDate.updated_at = new Date();
        
        await systemDate.save({ transaction });
      }

      await transaction.commit();

      logger.info(`Business date manually set to ${targetDate.toISOString().split('T')[0]} by ${user.username}`, {
        userId: user.id,
        targetDate,
        reason
      });

      return res.status(200).json({
        success: true,
        message: 'Business date set successfully',
        data: {
          current_business_date: systemDate.current_business_date,
          next_business_date: systemDate.next_business_date,
          setBy: {
            userId: user.id,
            username: user.username,
            role: user.primary_role
          },
          timestamp: new Date(),
          reason: reason
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Set business date error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to set business date',
        error: error.message
      });
    }
  },

  /**
   * Update business date (forward/backward)
   * Required: direction (FORWARD/BACKWARD), days, userId, reason (optional)
   */
  async updateBusinessDate(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { direction, days, reason, userId } = req.body;

      if (!direction || !days || !userId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'direction, days, and userId are required'
        });
      }

      const upperDirection = direction.toUpperCase();
      if (!['FORWARD', 'BACKWARD'].includes(upperDirection)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'direction must be FORWARD or BACKWARD'
        });
      }

      if (days <= 0 || days > 365) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'days must be between 1 and 365'
        });
      }

      // Validate user
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has permission
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to update business date'
        });
      }

      // Get current system date
      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']],
        transaction
      });
      
      if (!systemDate) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'System date not found'
        });
      }

      if (systemDate.is_e_o_d_processing) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Cannot change date while EOD is in progress'
        });
      }

      const currentDate = new Date(systemDate.current_business_date);
      const previousDate = new Date(currentDate);

      // Calculate new date
      const daysToMove = upperDirection === 'FORWARD' ? parseInt(days) : -parseInt(days);
      let newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + daysToMove);
      newDate.setHours(0, 0, 0, 0);

      // Skip weekends and holidays for forward movement
      if (upperDirection === 'FORWARD') {
        let skippedDays = 0;
        while (await shouldSkipDate(newDate)) {
          newDate.setDate(newDate.getDate() + 1);
          skippedDays++;
        }
        if (skippedDays > 0) {
          logger.info(`Skipped ${skippedDays} non-business days during forward adjustment`);
        }
      }

      // Update system date
      systemDate.current_business_date = newDate;
      systemDate.next_business_date = await calculateNextBusinessDate(newDate);
      
      // Get current eod_history or initialize it
      const eodHistory = systemDate.eod_history || [];
      
      // Add to EOD history
      eodHistory.push({
        type: 'MANUAL_ADJUST',
        processedDate: newDate,
        previousDate: previousDate,
        processingStart: new Date(),
        processingEnd: new Date(),
        processedBy: {
          userId: user.id,
          username: user.username,
          role: user.primary_role
        },
        status: 'COMPLETED',
        transactionsProcessed: 0,
        adjustment: {
          direction: upperDirection,
          days: parseInt(days),
          actualDays: Math.abs((newDate - previousDate) / (1000 * 60 * 60 * 24))
        },
        reason: reason || 'No reason provided',
        notes: [`Date adjusted ${upperDirection.toLowerCase()} by ${days} days`]
      });
      
      systemDate.eod_history = eodHistory;
      systemDate.updated_at = new Date();
      
      await systemDate.save({ transaction });

      await transaction.commit();

      logger.info(`Business date adjusted ${upperDirection.toLowerCase()} by ${days} days from ${previousDate.toISOString().split('T')[0]} to ${newDate.toISOString().split('T')[0]} by ${user.username}`, {
        userId: user.id,
        direction: upperDirection,
        days,
        reason
      });

      return res.status(200).json({
        success: true,
        message: `Business date adjusted ${upperDirection.toLowerCase()} by ${days} days`,
        data: {
          previous_business_date: previousDate,
          current_business_date: newDate,
          next_business_date: systemDate.next_business_date,
          adjustment: {
            direction: upperDirection,
            days: parseInt(days),
            from: previousDate.toISOString().split('T')[0],
            to: newDate.toISOString().split('T')[0]
          },
          adjustedBy: {
            userId: user.id,
            username: user.username,
            role: user.primary_role
          },
          timestamp: new Date(),
          reason: reason
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Update business date error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update business date',
        error: error.message
      });
    }
  },

  /**
   * Force initialize system date (admin trigger)
   */
  async initializeSystemDate(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { userId, initialDate } = req.body;

      if (!userId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'userId is required'
        });
      }

      // Validate user
      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has permission
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN'];
      if (!allowedRoles.includes(user.primary_role)) {
        await transaction.rollback();
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to initialize system date'
        });
      }

      const count = await SystemDate.count({ transaction });
      if (count > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'System date already initialized'
        });
      }

      // Use provided initial date or today
      let today = initialDate ? new Date(initialDate) : new Date();
      today.setHours(0, 0, 0, 0);

      // Skip non-business days
      while (await shouldSkipDate(today)) {
        today.setDate(today.getDate() + 1);
      }

      // Calculate next business date
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
          processedBy: {
            userId: user.id,
            username: user.username,
            role: user.primary_role
          },
          status: 'COMPLETED',
          transactionsProcessed: 0,
          notes: ['System date initialized']
        }]
      }, { transaction });

      await transaction.commit();

      logger.info('System date initialized manually', {
        userId: user.id,
        current_business_date: today,
        next_business_date: nextBusinessDate
      });

      return res.status(201).json({
        success: true,
        message: 'System date initialized',
        data: {
          systemDate: newSystemDate
        }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('System date initialization failed', { error: error.message });
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Update EOD status (manual override or correction)
   */
  async updateEODStatus(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { status, userId, reason } = req.body;
      const validStatuses = ['IDLE', 'PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'];

      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid EOD status'
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required'
        });
      }

      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has permission
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to update EOD status'
        });
      }

      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']],
        transaction
      });
      
      if (!systemDate) {
        return res.status(404).json({
          success: false,
          message: 'System date not found'
        });
      }

      const previousStatus = systemDate.eod_status;
      systemDate.eod_status = status;
      systemDate.updated_at = new Date();
      
      // Log the status change in history
      if (systemDate.eod_history) {
        systemDate.eod_history.push({
          type: 'STATUS_CHANGE',
          timestamp: new Date(),
          processedBy: {
            userId: user.id,
            username: user.username,
            role: user.primary_role
          },
          previousStatus,
          newStatus: status,
          reason: reason || 'Manual status update'
        });
      }
      
      await systemDate.save({ transaction });
      await transaction.commit();

      logger.info(`EOD status updated from ${previousStatus} to ${status} by ${user.username}`, {
        userId: user.id,
        previousStatus,
        newStatus: status,
        reason
      });

      return res.status(200).json({
        success: true,
        message: 'EOD status updated',
        data: {
          eod_status: status,
          previousStatus,
          updatedBy: {
            userId: user.id,
            username: user.username,
            role: user.primary_role
          },
          timestamp: new Date()
        }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Failed to update EOD status', { error: error.message });
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Process End of Day (EOD)
   * Required: userId, force (optional)
   */
  async processEOD(req, res) {
    const transaction = await sequelize.transaction();

    try {
      const { userId, force = false } = req.body;

      if (!userId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'userId is required'
        });
      }

      // Validate user - handle both regular user and string "system" user
      let user;
      let isSystemUser = false;
      
      // Check if userId is 'system'
      if (userId === 'system') {
        // Handle system user
        isSystemUser = true;
        user = {
          id: 0,
          username: 'system',
          primary_role: 'SYSTEM_ADMIN',
          firstName: 'System',
          lastName: 'User'
        };
        logger.info('Using system user for EOD processing');
      } else {
        // Try to find real user
        user = await User.findByPk(userId, { transaction });
        if (!user) {
          await transaction.rollback();
          return res.status(404).json({
            success: false,
            message: 'User not found'
          });
        }
      }

      // Check if user has permission (skip for system user)
      if (!isSystemUser) {
        const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER'];
        if (!allowedRoles.includes(user.primary_role)) {
          await transaction.rollback();
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions to process EOD'
          });
        }
      }

      // Get current system date
      const systemDate = await SystemDate.findOne({
        order: [['created_at', 'DESC']],
        transaction
      });
      
      if (!systemDate) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'System date not found'
        });
      }

      if (systemDate.is_e_o_d_processing && !force) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'EOD is already in progress. Use force=true to override.'
        });
      }

      // Start EOD processing
      const processingStart = new Date();
      systemDate.is_e_o_d_processing = true;
      systemDate.eod_status = 'IN_PROGRESS';
      await systemDate.save({ transaction });

      // Simulate EOD processing tasks
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Update system date to next business day
      const previousDate = new Date(systemDate.current_business_date);
      const newCurrentDate = new Date(systemDate.next_business_date);
      
      systemDate.current_business_date = newCurrentDate;
      systemDate.next_business_date = await calculateNextBusinessDate(newCurrentDate);
      systemDate.last_e_o_d_date = previousDate;
      systemDate.last_e_o_d_processed_by = user.username || 'system';
      systemDate.is_e_o_d_processing = false;
      systemDate.eod_status = 'COMPLETED';
      systemDate.updated_at = new Date();
      
      // Get current eod_history or initialize it
      const eodHistory = systemDate.eod_history || [];
      
      // Add to EOD history
      eodHistory.push({
        type: 'EOD_PROCESSING',
        processedDate: previousDate,
        newDate: newCurrentDate,
        processingStart: processingStart,
        processingEnd: new Date(),
        processedBy: {
          userId: user.id || 0,
          username: user.username || 'system',
          role: user.primary_role || 'SYSTEM_ADMIN'
        },
        status: 'COMPLETED',
        transactionsProcessed: Math.floor(Math.random() * 100) + 1, // Mock count
        errors: [],
        duration: (new Date() - processingStart) / 1000,
        notes: ['EOD processed successfully']
      });
      
      systemDate.eod_history = eodHistory;
      
      await systemDate.save({ transaction });

      await transaction.commit();

      logger.info(`EOD processed for ${previousDate.toISOString().split('T')[0]} by ${user.username || 'system'}`, {
        userId: user.id || 0,
        previousDate,
        newDate: newCurrentDate,
        duration: (new Date() - processingStart) / 1000
      });

      return res.status(200).json({
        success: true,
        message: 'EOD processed successfully',
        data: {
          previous_business_date: previousDate,
          current_business_date: systemDate.current_business_date,
          next_business_date: systemDate.next_business_date,
          processedBy: {
            userId: user.id || 0,
            username: user.username || 'system',
            role: user.primary_role || 'SYSTEM_ADMIN'
          },
          processingDuration: (new Date() - processingStart) / 1000,
          timestamp: new Date()
        }
      });

    } catch (error) {
      await transaction.rollback();
      logger.error('Process EOD error:', error);
      
      // Update system date to mark EOD as failed
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
  
  /**
   * Get EOD history
   */
  async getEODHistory(req, res) {
    try {
      const { limit = 50, offset = 0 } = req.query;
      
      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
      if (!systemDate) {
        return res.status(404).json({
          success: false,
          message: 'System date not found'
        });
      }

      const history = systemDate.eod_history || [];
      
      // Apply pagination
      const paginatedHistory = history.slice(offset, offset + limit);

      return res.status(200).json({
        success: true,
        data: {
          history: paginatedHistory,
          pagination: {
            total: history.length,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: offset + paginatedHistory.length < history.length
          }
        }
      });
    } catch (error) {
      logger.error('Failed to fetch EOD history', { error: error.message });
      return res.status(500).json({
        success: false,
        error: error.message
      });
    }
  },

  /**
   * Validate business date (check if it's valid for transactions)
   */
  async validateBusinessDate(req, res) {
    try {
      const { date } = req.body;

      if (!date) {
        return res.status(400).json({
          success: false,
          message: 'Date is required'
        });
      }

      const checkDate = new Date(date);
      if (isNaN(checkDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
      const currentBusinessDate = systemDate ? new Date(systemDate.current_business_date) : new Date();

      // Normalize dates to compare only dates (not times)
      checkDate.setHours(0, 0, 0, 0);
      currentBusinessDate.setHours(0, 0, 0, 0);

      const isValid = checkDate.getTime() === currentBusinessDate.getTime();
      const isPast = checkDate < currentBusinessDate;
      const isFuture = checkDate > currentBusinessDate;
      
      // Use the model's static method
      const holiday = await Holiday.isHoliday(checkDate);
      const isHoliday = !!holiday;
      
      const isWeekend = checkDate.getDay() === 0 || checkDate.getDay() === 6;

      return res.status(200).json({
        success: true,
        data: {
          date: checkDate,
          current_business_date: currentBusinessDate,
          validation: {
            isValid,
            isPast,
            isFuture,
            isHoliday,
            isWeekend,
            isBusinessDay: !isHoliday && !isWeekend,
            daysDifference: Math.floor((checkDate - currentBusinessDate) / (1000 * 60 * 60 * 24))
          },
          message: isValid 
            ? 'Date matches current business date' 
            : isPast 
              ? 'Date is in the past' 
              : 'Date is in the future'
        }
      });

    } catch (error) {
      logger.error('Validate business date error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to validate business date',
        error: error.message
      });
    }
  }
};

export {SystemDateController};
export default SystemDateController;