// src/controllers/systemController.js
import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';
import { postDailyAccruedInterest } from '../Services/InterestPostingController.js';
import logger from '../utils/logger.js';

// Enhanced system state with service health tracking
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

// Service execution with robust error handling
const executeService = async (serviceName, serviceFn) => {
  const startTime = Date.now();
  try {
    logger.info(`Starting ${serviceName} service`, { timestamp: new Date() });
    const result = await serviceFn();
    const executionTime = Date.now() - startTime;
    
    systemStatus.services[serviceName] = {
      healthy: true,
      lastError: null,
      lastRun: new Date(),
      executionTime
    };
    
    logger.info(`${serviceName} completed in ${executionTime}ms`, { 
      timestamp: new Date(),
      executionTime 
    });
    
    return { success: true, result };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorDetails = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date()
    };
    
    systemStatus.services[serviceName] = {
      healthy: false,
      lastError: errorDetails,
      lastRun: new Date(),
      executionTime
    };
    
    logger.error(`${serviceName} failed after ${executionTime}ms`, errorDetails);
    
    // Special handling for loan-related errors
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

export const triggerServices = async (req, res) => {
  if (systemStatus.state === 'running') {
    logger.warn('Service execution requested while already running');
    return res.status(429).json({
      success: false,
      message: 'Services are already running',
      timestamp: new Date().toISOString()
    });
  }

  const executionStart = Date.now();
  systemStatus.state = 'running';
  systemStatus.lastRun = new Date();
  systemStatus.nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);

  try {
    logger.info('Starting background services execution', {
      services: ['overdueLoans', 'loanStatusUpdates', 'pendingRepayments', 'dormantAccounts', 'interestPosting'],
      timestamp: systemStatus.lastRun
    });

    // Execute services sequentially with dependency awareness
    const results = {
      overdueLoans: await executeService('overdueLoans', checkOverdueLoans),
      loanStatusUpdates: await executeService('loanStatusUpdates', async () => {
        try {
          return await updateLoanStatusForAllLoans();
        } catch (error) {
          // Special handling for loan not found errors
          if (error.message.includes('not found')) {
            logger.warn('Loan account not found during status update', {
              suggestion: 'Verify account existence in database',
              error: error.message
            });
          }
          throw error;
        }
      }),
      pendingRepayments: await executeService('pendingRepayments', processPendingRepayments),
      dormantAccounts: await executeService('dormantAccounts', updateDormantAccounts),
      interestPosting: await executeService('interestPosting', postDailyAccruedInterest)
    };

    // Determine overall status
    const hasCriticalErrors = Object.values(results).some(
      result => !result.success && result.isCritical
    );

    systemStatus.state = hasCriticalErrors ? 'error' : 'completed';
    systemStatus.executionTime = Date.now() - executionStart;

    const responseStatus = hasCriticalErrors ? 207 : 200;
    const responseMessage = hasCriticalErrors 
      ? 'Services completed with errors' 
      : 'All services completed successfully';

    logger.info(responseMessage, {
      status: systemStatus.state,
      executionTime: systemStatus.executionTime,
      criticalErrors: hasCriticalErrors,
      timestamp: new Date()
    });

    return res.status(responseStatus).json({
      success: !hasCriticalErrors,
      message: responseMessage,
      executionTime: systemStatus.executionTime,
      results,
      systemStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    systemStatus.state = 'error';
    systemStatus.executionTime = Date.now() - executionStart;
    
    logger.error('Background services execution failed', {
      error: error.message,
      stack: error.stack,
      executionTime: systemStatus.executionTime,
      timestamp: new Date()
    });

    return res.status(500).json({
      success: false,
      message: 'Background service execution failed',
      error: error.message,
      systemStatus,
      timestamp: new Date().toISOString()
    });
  }
};

// Additional diagnostic endpoint
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
    timestamp: new Date().toISOString()
  });
};

// In OsController.js
export const getDormantAccountsCount = async (req, res) => {
  try {
    const count = await countDormantAccountsToUpdate();
    return res.status(200).json({
      success: true,
      count,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[System] Dormant count fetch failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to count dormant accounts',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get comprehensive system status
 * @returns {Object} System status information
 */
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
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      },
      services: serviceStatuses,
      metrics: {
        dormantAccountsPending: dormantCount,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Failed to get system status', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
    
    res.status(500).json({
      status: 'error',
      message: 'Failed to get system status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};
// Existing endpoints (getStatus, getDormantAccountsCount) remain the same