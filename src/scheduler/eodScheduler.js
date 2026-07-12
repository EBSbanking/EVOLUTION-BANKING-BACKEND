import { runEODLoanRepayment } from '../../scripts/eodLoanRepayment.js';
import jobRegistry from '../services/jobRegistry.js';

jobRegistry.registerJob(
  'EOD Loan Repayment',
  '30 23 * * *',
  async () => {
    console.log('Running EOD loan repayment...');
    await runEODLoanRepayment();
  },
  'End-of-day loan repayment processing (main)'
);

jobRegistry.registerJob(
  'EOD Loan Repayment (Backup)',
  '0 2 * * *',
  async () => {
    console.log('Running backup EOD loan repayment...');
    await runEODLoanRepayment();
  },
  'Backup EOD loan repayment at 2 AM'
);

// Optional: keep for backward compatibility
export function startEODScheduler() {
  console.log('✅ EOD Scheduler started. Jobs registered with jobRegistry.');
}