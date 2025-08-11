// controllers/endOfDayController.js
import { getServerTime, getBusinessDate, setServerTimeOffset } from '../utils/serverTime.js';
import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';
import { postDailyAccruedInterest } from '../Services/InterestPostingController.js';
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import logger from '../utils/logger.js';

// Enhanced system state with service health tracking and date management
const systemStatus = {
  state: 'idle',
  lastRun: null,
  nextRun: null,
  executionTime: null,
  currentBusinessDate: null,
  nextBusinessDate: null,
  isEODProcessing: false,
  eodStatus: 'IDLE',
  serverTime: getServerTime(),
  serverTimeOffset: 0,
  services: {
    overdueLoans: { healthy: true, lastError: null },
    loanStatusUpdates: { healthy: true, lastError: null },
    pendingRepayments: { healthy: true, lastError: null },
    dormantAccounts: { healthy: true, lastError: null },
    interestPosting: { healthy: true, lastError: null }
  }
};

// Add new endpoint for server time
export const getServerDateTime = async (req, res) => {
  try {
    const businessDate = await getBusinessDate();
    
    res.status(200).json({
      success: true,
      serverTime: getServerTime(),
      businessDate,
      serverTimeOffset: systemStatus.serverTimeOffset,
      isEODProcessing: systemStatus.isEODProcessing,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get server time', { error: error.message });
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// Add endpoint to adjust server time (for testing)
export const adjustServerTime = async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      message: 'Time adjustment only allowed in development mode'
    });
  }

  try {
    const { offsetHours } = req.body;
    const offsetMs = offsetHours * 60 * 60 * 1000;
    setServerTimeOffset(offsetMs);
    systemStatus.serverTimeOffset = offsetMs;
    systemStatus.serverTime = getServerTime();

    res.status(200).json({
      success: true,
      newServerTime: getServerTime(),
      offsetHours,
      message: 'Server time adjusted (development only)'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// Initialize system dates to use server time
const initializeSystemDates = async () => {
  try {
    const existingDate = await SystemDate.findOne().sort({ createdAt: -1 });
    const currentServerTime = getServerTime();
    
    if (existingDate) {
      systemStatus.currentBusinessDate = existingDate.currentBusinessDate;
      systemStatus.nextBusinessDate = existingDate.nextBusinessDate;
      systemStatus.eodStatus = existingDate.eodStatus;
    } else {
      const today = new Date(currentServerTime);
      today.setHours(0, 0, 0, 0);
      let nextBusinessDate = await calculateNextBusinessDate(today);
      
      const newSystemDate = await SystemDate.create({
        currentBusinessDate: today,
        nextBusinessDate,
        isEODProcessing: false,
        eodStatus: 'IDLE',
        eodHistory: []
      });

      systemStatus.currentBusinessDate = newSystemDate.currentBusinessDate;
      systemStatus.nextBusinessDate = newSystemDate.nextBusinessDate;
    }
    
    logger.info('System dates initialized', {
      serverTime: currentServerTime,
      businessDate: systemStatus.currentBusinessDate,
      nextBusinessDate: systemStatus.nextBusinessDate
    });
  } catch (error) {
    logger.error('Failed to initialize system dates', { 
      error: error.message,
      serverTime: getServerTime() 
    });
  }
};

// Calculate the next valid business date
const calculateNextBusinessDate = async (date) => {
  let nextDate = new Date(date);
  let isHoliday = true;
  let attempts = 0;

  while (isHoliday && attempts < 30) {
    nextDate.setDate(nextDate.getDate() + 1);
    isHoliday = await Holiday.isHoliday(nextDate) || 
                nextDate.getDay() === 0 || 
                nextDate.getDay() === 6;
    attempts++;
  }

  if (attempts >= 30) {
    throw new Error('Could not determine next business date after 30 attempts');
  }

  return nextDate;
};

// Service execution with robust error handling
const executeService = async (serviceName, serviceFn) => {
  const startTime = Date.now();
  try {
    logger.info(`Starting ${serviceName} service`, { 
      timestamp: getServerTime(),
      businessDate: systemStatus.currentBusinessDate
    });
    const result = await serviceFn();
    const executionTime = Date.now() - startTime;
    
    systemStatus.services[serviceName] = {
      healthy: true,
      lastError: null,
      lastRun: new Date(),
      executionTime
    };
    
    logger.info(`${serviceName} completed in ${executionTime}ms`, { 
      timestamp: getServerTime(),
      executionTime 
    });
    
    return { success: true, result };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      timestamp: getServerTime()
    };
    
    systemStatus.services[serviceName] = {
      healthy: false,
      lastError: errorDetails,
      lastRun: new Date(),
      executionTime
    };
    
    logger.error(`${serviceName} failed after ${executionTime}ms`, errorDetails);
    
    if (serviceName === 'loanStatusUpdates') {
      logger.warn('Loan status update failure may require data validation', {
        affectedServices: ['overdueLoans', 'pendingRepayments']
      });
    }
    
    return { 
      success: false, 
      error: errorDetails,
      isCritical: ['loanStatusUpdates', 'interestPosting'].includes(serviceName)
    };
  }
};

export const triggerEndOfDayProcess = async (req, res) => {
  if (systemStatus.state === 'running') {
    logger.warn('EOD process requested while already running');
    return res.status(429).json({
      success: false,
      message: 'EOD process is already running',
      timestamp: getServerTime().toISOString()
    });
  }

  const executionStart = Date.now();
  systemStatus.state = 'running';
  systemStatus.isEODProcessing = true;
  systemStatus.eodStatus = 'IN_PROGRESS';
  systemStatus.lastRun = getServerTime();

  try {
    logger.info('Starting End of Day processing', {
      timestamp: systemStatus.lastRun,
      businessDate: systemStatus.currentBusinessDate
    });

    // Define all EOD services in execution order
    const eodServices = [
      { name: 'interestPosting', fn: postDailyAccruedInterest },
      { name: 'loanStatusUpdates', fn: updateLoanStatusForAllLoans },
      { name: 'overdueLoans', fn: checkOverdueLoans },
      { name: 'pendingRepayments', fn: processPendingRepayments },
      { name: 'dormantAccounts', fn: updateDormantAccounts }
    ];

    // Execute all EOD services sequentially
    const results = {};
    for (const service of eodServices) {
      if (service.name === 'loanStatusUpdates') {
        results[service.name] = await executeService(service.name, async () => {
          try {
            return await service.fn();
          } catch (error) {
            if (error.message.includes('not found')) {
              logger.warn('Loan account not found during status update', {
                suggestion: 'Verify account existence in database',
                error: error.message
              });
            }
            throw error;
          }
        });
      } else {
        results[service.name] = await executeService(service.name, service.fn);
      }
    }

    // Check for critical errors before proceeding with date change
    const hasCriticalErrors = Object.values(results).some(
      result => !result.success && result.isCritical
    );

    if (hasCriticalErrors) {
      systemStatus.state = 'error';
      systemStatus.eodStatus = 'FAILED';
      systemStatus.executionTime = Date.now() - executionStart;
      
      logger.error('EOD processing failed due to critical errors', {
        status: systemStatus.state,
        executionTime: systemStatus.executionTime,
        criticalErrors: true,
        timestamp: getServerTime()
      });

      return res.status(207).json({
        success: false,
        message: 'EOD processing failed due to critical errors',
        executionTime: systemStatus.executionTime,
        results,
        systemStatus,
        timestamp: getServerTime().toISOString()
      });
    }

    // All services completed successfully - proceed with date change
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    if (!systemDate) {
      throw new Error('System date not found');
    }

    // Calculate and update to next business date
    const nextBusinessDate = await calculateNextBusinessDate(systemStatus.currentBusinessDate);
    
    systemDate.currentBusinessDate = nextBusinessDate;
    systemDate.nextBusinessDate = await calculateNextBusinessDate(nextBusinessDate);
    systemDate.eodStatus = 'COMPLETED';
    systemDate.eodHistory.push({
      processedAt: getServerTime(),
      processedBy: req.user ? req.user._id : null,
      status: 'COMPLETED'
    });

    await systemDate.save();

    // Update system status
    systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
    systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
    systemStatus.state = 'completed';
    systemStatus.isEODProcessing = false;
    systemStatus.eodStatus = 'COMPLETED';
    systemStatus.executionTime = Date.now() - executionStart;

    logger.info('End of Day processing completed successfully', {
      newBusinessDate: systemStatus.currentBusinessDate,
      nextBusinessDate: systemStatus.nextBusinessDate,
      executionTime: systemStatus.executionTime,
      processedBy: req.user ? req.user._id : 'system'
    });

    return res.status(200).json({
      success: true,
      message: 'End of Day processing completed successfully',
      currentBusinessDate: systemStatus.currentBusinessDate,
      nextBusinessDate: systemStatus.nextBusinessDate,
      executionTime: systemStatus.executionTime,
      results,
      systemStatus,
      timestamp: getServerTime().toISOString()
    });

  } catch (error) {
    systemStatus.state = 'error';
    systemStatus.isEODProcessing = false;
    systemStatus.eodStatus = 'FAILED';
    systemStatus.executionTime = Date.now() - executionStart;
    
    logger.error('End of Day processing failed', {
      error: error.message,
      stack: error.stack,
      executionTime: systemStatus.executionTime,
      timestamp: getServerTime()
    });

    return res.status(500).json({
      success: false,
      message: 'End of Day processing failed',
      error: error.message,
      systemStatus,
      timestamp: getServerTime().toISOString()
    });
  }
};

export const getCurrentBusinessDate = async (req, res) => {
  try {
    // Get the business date using the utility function
    const businessDate = await getBusinessDate();
    
    return res.status(200).json({
      success: true,
      currentBusinessDate: businessDate.toISOString(),
      nextBusinessDate: systemStatus.nextBusinessDate,
      isEODProcessing: systemStatus.isEODProcessing,
      eodStatus: systemStatus.eodStatus,
      timestamp: getServerTime().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get current business date', { 
      error: error.message,
      stack: error.stack 
    });
    
    return res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve business date information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: getServerTime().toISOString()
    });
  }
};

export const getServiceErrors = async (req, res) => {
  const errors = Object.entries(systemStatus.services)
    .filter(([_, status]) => !status.healthy)
    .map(([name, status]) => ({
      service: name,
      lastError: status.lastError,
      lastRun: status.lastRun
    }));

  res.status(200).json({
    errors,
    count: errors.length,
    timestamp: getServerTime().toISOString()
  });
};

export const getDormantAccountsCount = async (req, res) => {
  try {
    const count = await countDormantAccountsToUpdate();
    return res.status(200).json({
      success: true,
      count,
      timestamp: getServerTime().toISOString()
    });
  } catch (error) {
    logger.error('Dormant count fetch failed', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to count dormant accounts',
      error: error.message,
      timestamp: getServerTime().toISOString()
    });
  }
};

export const getStatus = async (req, res) => {
  try {
    const dormantCount = await countDormantAccountsToUpdate();
    
    // Calculate service health status
    const serviceStatuses = Object.keys(systemStatus.services).map(serviceName => ({
      name: serviceName,
      healthy: systemStatus.services[serviceName].healthy,
      lastRun: systemStatus.services[serviceName].lastRun,
      lastError: systemStatus.services[serviceName].lastError,
      executionTime: systemStatus.services[serviceName].executionTime
    }));

    res.status(200).json({
      system: {
        state: systemStatus.state,
        lastRun: systemStatus.lastRun,
        nextRun: systemStatus.nextRun,
        currentBusinessDate: systemStatus.currentBusinessDate,
        nextBusinessDate: systemStatus.nextBusinessDate,
        isEODProcessing: systemStatus.isEODProcessing,
        eodStatus: systemStatus.eodStatus,
        serverTime: getServerTime(),
        serverTimeOffset: systemStatus.serverTimeOffset,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      services: serviceStatuses,
      metrics: {
        dormantAccountsPending: dormantCount,
        timestamp: getServerTime().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get system status', {
      error: error.message,
      stack: error.stack,
      timestamp: getServerTime()
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to get system status',
      error: error.message,
      timestamp: getServerTime().toISOString()
    });
  }
};

// Initialize system dates when the module loads
initializeSystemDates();