// src/cronJobs/penaltyAccrualCron.js
import cron from 'node-cron';
import moment from 'moment';
import PenaltyAccrualService from '../services/PenaltyAccrualService.js';
import logger from '../utils/logger.js';

/**
 * Daily Penalty Accrual Cron Job
 * Runs every day at 00:05 (5 minutes after midnight)
 * Accrues penalties for all overdue loans
 */
const penaltyAccrualCron = cron.schedule('5 0 * * *', async () => {
  const startTime = Date.now();
  const today = moment().format('YYYY-MM-DD HH:mm:ss');
  
  logger.info(`🔄 Starting daily penalty accrual at ${today}`);

  try {
    // Run the penalty accrual service
    const results = await PenaltyAccrualService.runDailyPenaltyAccrual();
    
    const duration = Date.now() - startTime;
    
    logger.info(`✅ Penalty accrual completed in ${duration}ms`, {
      totalLoansProcessed: results.totalLoansProcessed,
      penaltiesApplied: results.penaltiesApplied,
      totalPenaltyAmount: results.totalPenaltyAmount,
      failedLoans: results.failedLoans.length,
      loansWithNoPenaltyRule: results.loansWithNoPenaltyRule.length
    });

    // Log detailed results if there were penalties applied
    if (results.penaltiesApplied > 0) {
      logger.info(`📊 Penalty summary: Applied ${results.penaltiesApplied} penalties totaling ₦${results.totalPenaltyAmount.toFixed(2)}`);
    }

    // Send notification if there were failures
    if (results.failedLoans.length > 0) {
      logger.warn(`⚠️ ${results.failedLoans.length} loans failed penalty accrual:`, results.failedLoans);
    }

    if (results.loansWithNoPenaltyRule.length > 0) {
      logger.warn(`⚠️ ${results.loansWithNoPenaltyRule.length} loans have no penalty rule configured`);
    }

    return results;

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(`❌ Penalty accrual failed after ${duration}ms:`, {
      error: error.message,
      stack: error.stack
    });
    
    // Send alert for critical failure
    // You can add email/Slack notification here
    
    throw error;
  }
}, {
  scheduled: true,
  timezone: 'Africa/Lagos' // Adjust to your timezone
});

// Function to manually trigger penalty accrual (for testing or admin use)
export const runPenaltyAccrualManually = async () => {
  logger.info('🔧 Manually triggering penalty accrual...');
  const results = await PenaltyAccrualService.runDailyPenaltyAccrual();
  return results;
};

// Export the cron job
export default penaltyAccrualCron;