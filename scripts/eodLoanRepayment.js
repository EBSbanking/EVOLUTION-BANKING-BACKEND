// src/scripts/eodLoanRepayment.js
import { Op } from 'sequelize';
import DirectDebit from '../src/models/DirectDebit.js';
import { sendFailureNotification, sendErrorNotification } from '../src/Services/NotificationService.js';

async function runEODLoanRepayment() {
  console.log('Starting EOD Loan Repayment Processing...');
  console.log('Time:', new Date().toISOString());
  
  try {
    const batchDate = new Date();
    const results = await DirectDebit.processEODLoanRepayments(batchDate);
    
    console.log('EOD Processing Complete:');
    console.log(`Total Processed: ${results.totalProcessed}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped}`);
    
    if (results.failed.length > 0) {
      console.log('\nFailed Transactions:');
      results.failed.forEach(failed => {
        console.log(`- ${failed.directDebitId}: ${failed.reason}`);
      });
      
      // Send notification if any failures
      await sendFailureNotification(results.failed);
    }
    
    return results;
    
  } catch (error) {
    console.error('EOD Processing Failed:', error);
    await sendErrorNotification(error);
    throw error;
  }
}

// Run as a scheduled job
export async function scheduledEODProcessing() {
  // This would be called by a scheduler (cron job, Windows Task Scheduler, etc.)
  const now = new Date();
  const hour = now.getHours();
  
  // Run at EOD (e.g., 11:30 PM)
  if (hour === 23) {
    await runEODLoanRepayment();
  }
}

// Manual trigger for testing
if (process.argv.includes('--run-eod')) {
  runEODLoanRepayment().then(() => {
    console.log('EOD processing completed successfully');
    process.exit(0);
  }).catch(error => {
    console.error('EOD processing failed:', error);
    process.exit(1);
  });
}

// Export for use in other modules
export { runEODLoanRepayment };