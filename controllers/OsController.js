import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';

let osStatus = 'idle'; // Possible values: 'idle', 'running', 'completed', 'error'

export const getDormantAccountsCount = async (req, res) => {
  try {
    const count = await countDormantAccountsToUpdate();
    res.status(200).json({ dormantAccountsToUpdate: count });
  } catch (error) {
    console.error('[Error] Counting dormant accounts failed:', error);
    res.status(500).json({ message: 'Error counting dormant accounts', error: error.message });
  }
};

export const triggerServices = async (req, res) => {
  try {
    osStatus = 'running';

    await checkOverdueLoans();
    console.log('[Service] Overdue loan check completed.');

    await updateLoanStatusForAllLoans();
    console.log('[Service] Loan status update completed.');

    await processPendingRepayments();
    console.log('[Service] Loan repayment process triggered.');

    await updateDormantAccounts();
    console.log('[Service] Dormant accounts update completed.');

    osStatus = 'completed';

    res.status(200).json({ message: 'All services and jobs triggered successfully!' });
  } catch (error) {
    console.error('[Error] Service trigger failed:', error);
    osStatus = 'error';
    res.status(500).json({
      message: 'Error triggering services',
      error: error.message,
    });
  }
};

export const getStatus = (req, res) => {
  res.status(200).json({ status: osStatus });
};
