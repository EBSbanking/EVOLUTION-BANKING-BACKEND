// src/scheduler/eodScheduler.js
import cron from 'node-cron';
import { runEODLoanRepayment } from '../../scripts/eodLoanRepayment.js';

// Schedule EOD processing at 11:30 PM daily
export function startEODScheduler() {
  console.log('Starting EOD Loan Repayment Scheduler...');
  
  // Run at 11:30 PM every day
  cron.schedule('30 23 * * *', async () => {
    console.log('Running scheduled EOD loan repayment processing...');
    console.log('Time:', new Date().toISOString());
    
    try {
      await runEODLoanRepayment();
      console.log('Scheduled EOD processing completed successfully');
    } catch (error) {
      console.error('Scheduled EOD processing failed:', error);
    }
  });
  
  // Also run at 2:00 AM for any missed transactions (optional)
  cron.schedule('0 2 * * *', async () => {
    console.log('Running backup EOD loan repayment processing...');
    
    try {
      await runEODLoanRepayment();
      console.log('Backup EOD processing completed successfully');
    } catch (error) {
      console.error('Backup EOD processing failed:', error);
    }
  });
  
  console.log('EOD Scheduler started. Will run at 11:30 PM daily.');
}

// Add to your main server file (app.js or server.js):
// import { startEODScheduler } from './scheduler/eodScheduler.js';
// startEODScheduler();