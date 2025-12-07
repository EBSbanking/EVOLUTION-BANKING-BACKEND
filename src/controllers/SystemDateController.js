import mongoose from 'mongoose';
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// =============================================
// SYSTEM DATE MANAGEMENT CONTROLLERS
// =============================================

const SystemDateController = {
  /**
   * Get current business date
   */
  async getCurrentBusinessDate(req, res) {
    try {
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });

      if (!systemDate) {
        // Initialize system date if not exists
        const newSystemDate = new SystemDate();
        await newSystemDate.save();
        
        return res.status(200).json({ 
          success: true,
          currentBusinessDate: newSystemDate.currentBusinessDate,
          nextBusinessDate: newSystemDate.nextBusinessDate,
          lastEODDate: newSystemDate.lastEODDate,
          isEODProcessing: newSystemDate.isEODProcessing,
          eodStatus: newSystemDate.eodStatus,
          lastUpdated: newSystemDate.updatedAt
        });
      }

      return res.status(200).json({ 
        success: true,
        currentBusinessDate: systemDate.currentBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        lastEODDate: systemDate.lastEODDate,
        isEODProcessing: systemDate.isEODProcessing,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.updatedAt
      });
    } catch (error) {
      logger.error('Failed to get current business date', { error: error.message });
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  },

  /**
   * Check if the current date is a holiday
   */
  async isHoliday(req, res) {
    try {
      const today = new Date();
      const isHoliday = await Holiday.isHoliday(today);
      return res.status(200).json({ 
        success: true,
        date: today, 
        isHoliday 
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
   */
  async setBusinessDate(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { businessDate, reason, userId } = req.body;

      if (!businessDate || !userId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'businessDate and userId are required'
        });
      }

      // Validate user
      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has permission (e.g., admin, manager)
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'BRANCH_MANAGER', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to set business date'
        });
      }

      // Parse and validate date
      const targetDate = new Date(businessDate);
      if (isNaN(targetDate.getTime())) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Invalid date format'
        });
      }

      // Set time to start of day (00:00:00)
      targetDate.setHours(0, 0, 0, 0);

      // Get current system date
      let systemDate = await SystemDate.findOne().sort({ createdAt: -1 }).session(session);

      if (!systemDate) {
        // Create new system date record
        systemDate = new SystemDate({
          currentBusinessDate: targetDate,
          nextBusinessDate: await calculateNextBusinessDate(targetDate),
          eodHistory: []
        });
      } else {
        // Check if EOD is in progress
        if (systemDate.isEODProcessing) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'Cannot change date while EOD is in progress'
          });
        }

        // Update existing system date
        systemDate.currentBusinessDate = targetDate;
        systemDate.nextBusinessDate = await calculateNextBusinessDate(targetDate);
      }

      // Add to EOD history
      systemDate.eodHistory.push({
        processedDate: targetDate,
        processingStart: new Date(),
        processingEnd: new Date(),
        processedBy: userId,
        status: 'MANUAL_SET',
        transactionsProcessed: 0,
        errors: [`Manual date set: ${reason || 'No reason provided'}`]
      });

      await systemDate.save({ session });

      await session.commitTransaction();

      logger.info(`Business date manually set to ${targetDate.toISOString().split('T')[0]} by ${user.username}`);

      return res.status(200).json({
        success: true,
        message: 'Business date set successfully',
        data: {
          currentBusinessDate: systemDate.currentBusinessDate,
          nextBusinessDate: systemDate.nextBusinessDate,
          setBy: {
            userId: user._id,
            username: user.username,
            role: user.primary_role
          },
          timestamp: new Date(),
          reason: reason
        }
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Set business date error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to set business date',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  },

  /**
   * Update business date (forward/backward)
   */
  async updateBusinessDate(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { direction, days, reason, userId } = req.body;

      if (!direction || !days || !userId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'direction, days, and userId are required'
        });
      }

      if (!['FORWARD', 'BACKWARD'].includes(direction.toUpperCase())) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'direction must be FORWARD or BACKWARD'
        });
      }

      if (days <= 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'days must be greater than 0'
        });
      }

      // Validate user
      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user has permission
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER'];
      if (!allowedRoles.includes(user.primary_role)) {
        await session.abortTransaction();
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to update business date'
        });
      }

      // Get current system date
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 }).session(session);
      if (!systemDate) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'System date not found'
        });
      }

      if (systemDate.isEODProcessing) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Cannot change date while EOD is in progress'
        });
      }

      const currentDate = new Date(systemDate.currentBusinessDate);
      const previousDate = new Date(currentDate);

      // Calculate new date
      const daysToMove = direction.toUpperCase() === 'FORWARD' ? days : -days;
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + daysToMove);
      newDate.setHours(0, 0, 0, 0);

      // Update system date
      systemDate.currentBusinessDate = newDate;
      systemDate.nextBusinessDate = await calculateNextBusinessDate(newDate);

      // Add to EOD history
      systemDate.eodHistory.push({
        processedDate: newDate,
        processingStart: new Date(),
        processingEnd: new Date(),
        processedBy: userId,
        status: 'MANUAL_ADJUST',
        transactionsProcessed: 0,
        errors: [`Date adjusted ${direction.toLowerCase()} by ${days} days: ${reason || 'No reason provided'}`]
      });

      await systemDate.save({ session });

      await session.commitTransaction();

      logger.info(`Business date adjusted ${direction.toLowerCase()} by ${days} days from ${previousDate.toISOString().split('T')[0]} to ${newDate.toISOString().split('T')[0]} by ${user.username}`);

      return res.status(200).json({
        success: true,
        message: `Business date adjusted ${direction.toLowerCase()} by ${days} days`,
        data: {
          previousBusinessDate: previousDate,
          currentBusinessDate: newDate,
          nextBusinessDate: systemDate.nextBusinessDate,
          adjustment: {
            direction: direction,
            days: days,
            from: previousDate.toISOString().split('T')[0],
            to: newDate.toISOString().split('T')[0]
          },
          adjustedBy: {
            userId: user._id,
            username: user.username,
            role: user.primary_role
          },
          timestamp: new Date(),
          reason: reason
        }
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Update business date error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update business date',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  },

  /**
   * Force initialize system date (e.g. admin trigger)
   */
  async initializeSystemDate(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { userId, initialDate } = req.body;

      if (!userId) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          message: 'userId is required' 
        });
      }

      // Validate user
      const user = await User.findById(userId).session(session);
      if (!user) {
        await session.abortTransaction();
        return res.status(404).json({ 
          success: false,
          message: 'User not found' 
        });
      }

      // Check if user has permission
      const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN'];
      if (!allowedRoles.includes(user.primary_role)) {
        await session.abortTransaction();
        return res.status(403).json({ 
          success: false,
          message: 'Insufficient permissions to initialize system date' 
        });
      }

      const count = await SystemDate.countDocuments();
      if (count > 0) {
        await session.abortTransaction();
        return res.status(400).json({ 
          success: false,
          message: 'System date already initialized' 
        });
      }

      // Use provided initial date or today
      let today = initialDate ? new Date(initialDate) : new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate next business date
      let nextBusinessDate = await calculateNextBusinessDate(today);

      const newSystemDate = new SystemDate({
        currentBusinessDate: today,
        nextBusinessDate: nextBusinessDate,
        isEODProcessing: false,
        eodStatus: 'IDLE',
        eodHistory: []
      });

      await newSystemDate.save({ session });

      await session.commitTransaction();

      logger.info('System date initialized manually', {
        currentBusinessDate: today,
        nextBusinessDate
      });

      return res.status(201).json({ 
        success: true,
        message: 'System date initialized', 
        systemDate: newSystemDate 
      });
    } catch (error) {
      await session.abortTransaction();
      logger.error('System date initialization failed', { error: error.message });
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    } finally {
      session.endSession();
    }
  },

  /**
   * Update EOD status (manual override or correction)
   */
  async updateEODStatus(req, res) {
    const { status, userId } = req.body;
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

    try {
      const user = await User.findById(userId);
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

      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      if (!systemDate) {
        return res.status(404).json({ 
          success: false,
          message: 'System date not found' 
        });
      }

      const previousStatus = systemDate.eodStatus;
      systemDate.eodStatus = status;
      await systemDate.save();

      return res.status(200).json({ 
        success: true,
        message: 'EOD status updated', 
        eodStatus: status 
      });
    } catch (error) {
      logger.error('Failed to update EOD status', { error: error.message });
      return res.status(500).json({ 
        success: false,
        error: error.message 
      });
    }
  },

  /**
   * Process End of Day (EOD)
   */
// In SystemDateController.js, update the processEOD function:

async processEOD(req, res) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { userId, force = false } = req.body;

      if (!userId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'userId is required'
        });
      }

      // Validate user - handle both ObjectId and string "system" user
      let user;
      let isSystemUser = false;
      
      // Check if userId is a valid ObjectId
      const isValidObjectId = mongoose.Types.ObjectId.isValid(userId);
      
      if (!isValidObjectId || userId === 'system') {
        // Handle system user or invalid ID
        isSystemUser = true;
        user = {
          _id: new mongoose.Types.ObjectId(),
          username: 'system',
          primary_role: 'SYSTEM_ADMIN',
          firstName: 'System',
          lastName: 'User'
        };
        logger.info('Using system user for EOD processing');
      } else {
        // Try to find real user
        user = await User.findById(userId).session(session);
        if (!user) {
          await session.abortTransaction();
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
          await session.abortTransaction();
          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions to process EOD'
          });
        }
      }

      // Get current system date
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 }).session(session);
      if (!systemDate) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'System date not found'
        });
      }

      if (systemDate.isEODProcessing && !force) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'EOD is already in progress'
        });
      }

      // Start EOD processing
      systemDate.isEODProcessing = true;
      systemDate.eodStatus = 'IN_PROGRESS';
      await systemDate.save({ session });

      // Update system date to next business day
      const previousDate = new Date(systemDate.currentBusinessDate);
      systemDate.currentBusinessDate = systemDate.nextBusinessDate;
      systemDate.nextBusinessDate = await calculateNextBusinessDate(systemDate.currentBusinessDate);
      systemDate.lastEODDate = previousDate;
      systemDate.lastEODProcessedBy = user.username || 'system';
      systemDate.isEODProcessing = false;
      systemDate.eodStatus = 'COMPLETED';

      // Add to EOD history
      systemDate.eodHistory.push({
        processedDate: previousDate,
        processingStart: new Date(),
        processingEnd: new Date(),
        processedBy: user.username || 'system',
        status: 'COMPLETED',
        transactionsProcessed: 0,
        errors: []
      });

      await systemDate.save({ session });

      await session.commitTransaction();

      logger.info(`EOD processed for ${previousDate.toISOString().split('T')[0]} by ${user.username || 'system'}`);

      return res.status(200).json({
        success: true,
        message: 'EOD processed successfully',
        data: {
          previousBusinessDate: previousDate,
          currentBusinessDate: systemDate.currentBusinessDate,
          nextBusinessDate: systemDate.nextBusinessDate,
          processedBy: {
            userId: user._id || 'system',
            username: user.username || 'system',
            role: user.primary_role || 'SYSTEM_ADMIN'
          },
          timestamp: new Date()
        }
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Process EOD error:', error);
      
      // Update system date to mark EOD as failed
      try {
        const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
        if (systemDate) {
          systemDate.isEODProcessing = false;
          systemDate.eodStatus = 'FAILED';
          await systemDate.save();
        }
      } catch (updateError) {
        logger.error('Failed to update system date after EOD error:', updateError);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to process EOD',
        error: error.message
      });
    } finally {
      session.endSession();
    }
  },
  
  /**
   * Get EOD history
   */
  async getEODHistory(req, res) {
    try {
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      if (!systemDate) {
        return res.status(404).json({ 
          success: false,
          message: 'System date not found' 
        });
      }

      return res.status(200).json({ 
        success: true,
        history: systemDate.eodHistory || [] 
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

      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      const currentBusinessDate = systemDate ? new Date(systemDate.currentBusinessDate) : new Date();

      // Normalize dates to compare only dates (not times)
      checkDate.setHours(0, 0, 0, 0);
      currentBusinessDate.setHours(0, 0, 0, 0);

      const isValid = checkDate.getTime() === currentBusinessDate.getTime();
      const isPast = checkDate < currentBusinessDate;
      const isFuture = checkDate > currentBusinessDate;

      return res.status(200).json({
        success: true,
        data: {
          date: checkDate,
          currentBusinessDate: currentBusinessDate,
          validation: {
            isValid,
            isPast,
            isFuture,
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

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Calculate next business date (simplified version)
 */
export async function calculateNextBusinessDate(currentDate) {
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + 1);
  
  // Skip weekends (simplified)
  while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

export { SystemDateController };
export default SystemDateController;