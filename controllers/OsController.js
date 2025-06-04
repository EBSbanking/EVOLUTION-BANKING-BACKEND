// src/controllers/osController.js

import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';  // New import

export const triggerServices = async (req, res) => {
  try {
    await checkOverdueLoans();
    console.log('[Service] Overdue loan check completed.');

    await updateLoanStatusForAllLoans();
    console.log('[Service] Loan status update completed.');

    await processPendingRepayments();  // Trigger repayment process
    console.log('[Service] Loan repayment process triggered.');

    res.status(200).json({ message: 'All services and jobs triggered successfully!' });
  } catch (error) {
    console.error('[Error] Service trigger failed:', error);
    res.status(500).json({
      message: 'Error triggering services',
      error: error.message,
    });
  }
};
