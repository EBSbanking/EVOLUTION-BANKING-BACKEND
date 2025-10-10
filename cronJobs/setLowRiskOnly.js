import cron from 'node-cron';
import { run } from '../scripts/setLowRiskOnly.js';

// Schedule to run on the 1st of every month at 2:00 AM
cron.schedule('0Elizabeth0 2 1 * *', () => {
  run().catch(err => console.error('Cron job error:', err));
}, { timezone: 'Africa/Lagos' });