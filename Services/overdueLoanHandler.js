// src/services/overdueLoanHandler.js
import LoanAccount from '../models/LoanAccount.js';

/**
 * Identify and update all overdue loans by using schema statics.
 */
export const checkOverdueLoans = async () => {
  try {
    const overdueLoans = await LoanAccount.findOverdueLoans();

    if (!overdueLoans.length) {
      console.log('[Overdue Handler] No overdue loans found.');
      return {
        success: true,
        count: 0,
        message: 'No overdue loans found',
        timestamp: new Date().toISOString()
      };
    }

    const result = await LoanAccount.markLoansAsOverdue();

    console.log(`[Overdue Handler] ${result.modifiedCount} loans marked as overdue.`);

    return {
      success: true,
      count: result.modifiedCount,
      message: `${result.modifiedCount} loans marked as overdue`,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('[Overdue Handler] Error:', error.message);
    return {
      success: false,
      message: 'Error occurred while processing overdue loans',
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Returns all loans currently marked as 'OVERDUE'
 */
export const getOverdueLoans = async () => {
  try {
    const loans = await LoanAccount.find({ LOAN_STATUS: 'OVERDUE' }).lean();
    return loans;
  } catch (error) {
    console.error('Error retrieving overdue loans:', error.message);
    throw error;
  }
};

/**
 * Fallback processor to manually scan overdue loans without relying on statics.
 */
export const processOverdueLoans = async () => {
  try {
    const today = new Date();

    const activeLoans = await LoanAccount.find({
      LOAN_STATUS: 'ACTIVE',
      NEXT_PAYMENT_DATE: { $lt: today }
    });

    const updated = [];

    for (const loan of activeLoans) {
      if (loan.isOverdue()) {
        loan.LOAN_STATUS = 'OVERDUE';
        await loan.save();
        updated.push(loan.ACCT_NO);
      }
    }

    console.log(`[Service] ${updated.length} loans marked as overdue manually.`);

    return {
      success: true,
      count: updated.length,
      updatedAccounts: updated,
      message: 'Manual overdue processing completed',
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Manual overdue loan processor error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};

export default {
  checkOverdueLoans,
  getOverdueLoans,
  processOverdueLoans
};
