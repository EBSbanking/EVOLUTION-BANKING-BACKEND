// src/services/loanStatusService.js
import LoanAccount from '../models/LoanAccount.js';
import { checkIfLoanIsOverdue } from './loanOverdueChecker.js'; // Assuming this function checks a single loan

/**
 * Function to update loan status based on various conditions
 * @param {string} ACCT_NO - Account number of the loan
 * @returns {Promise<LoanAccount|null>} Updated loan account or null if no update
 */
export const updateLoanStatus = async (ACCT_NO) => {
  try {
    const loanAccount = await LoanAccount.findOne({ ACCT_NO });
    if (!loanAccount) {
      throw new Error(`Loan account ${ACCT_NO} not found.`);
    }

    // If loan is already closed, no need to update
    if (loanAccount.LOAN_STATUS === 'Closed') {
      console.log(`Loan account ${ACCT_NO} is already closed.`);
      return null;
    }

    // Check if loan is overdue (assuming checkIfLoanIsOverdue returns boolean)
    const isOverdue = await checkIfLoanIsOverdue(loanAccount);

    if (isOverdue && loanAccount.LOAN_STATUS !== 'Overdue') {
      loanAccount.LOAN_STATUS = 'Overdue';
      await loanAccount.save();
      console.log(`Loan account ${ACCT_NO} marked as Overdue.`);
      return loanAccount;
    }

    // If disbursement limit is zero, close the loan
    if (loanAccount.DISBURSEMENT_LIMIT === 0 && loanAccount.LOAN_STATUS !== 'Closed') {
      loanAccount.LOAN_STATUS = 'Closed';
      await loanAccount.save();
      console.log(`Loan account ${ACCT_NO} is now Closed.`);
      return loanAccount;
    }

    // If no status update needed
    console.log(`Loan account ${ACCT_NO} status remains: ${loanAccount.LOAN_STATUS}`);
    return null;
  } catch (error) {
    console.error(`Error updating loan status for account ${ACCT_NO}:`, error.message);
    return null;
  }
};
