import LoanAccount from '../models/LoanAccount.js';
import { updateLoanStatus } from './loanStatusService.js';
import moment from 'moment/moment.js';
import RepaymentSchedules from '../models/RepaymentSchedules.js';
import LoanRepayment from '../models/LoanRepayment.js';
import GroupLoan from '../models/GroupLoan.js';


export const updateLoanStatusForAllLoans = async () => {
  try {
    const loans = await LoanAccount.find();

    for (const loan of loans) {
      const { ACCT_NO } = loan;

      if (!ACCT_NO) {
        console.error('Skipping loan with missing ACCT_NO:', loan);
        continue;
      }

      // Delegate status update logic to the service function
      const updatedLoan = await updateLoanStatus(ACCT_NO);

      if (updatedLoan) {
        console.log(`Loan account ${ACCT_NO} updated to status: ${updatedLoan.LOAN_STATUS}`);
      }
    }
  } catch (error) {
    console.error('Error updating loan statuses:', error);
  }
};
