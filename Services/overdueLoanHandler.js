// src/services/overdueLoanHandler.js
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedule.js';
import LoanRepayment from '../models/LoanRepayment.js';
import moment from 'moment';


export const checkOverdueLoans = async () => {
  try {
    const repaymentSchedules = await RepaymentSchedule.find();

    for (const repaymentSchedule of repaymentSchedules) {
      const { ACCT_NO, dueDate, installmentNo, totalPayment } = repaymentSchedule;

      if (moment(dueDate).isBefore(moment()) && totalPayment > 0) {
        const loanAccount = await LoanAccount.findOne({ ACCT_NO });

        if (loanAccount) {
          const repaymentMade = await LoanRepayment.findOne({ ACCT_NO, installmentNo });

          if (!repaymentMade) {
            loanAccount.LOAN_STATUS = 'Overdue';
            await loanAccount.save();

            console.log(`Loan account ${ACCT_NO} marked as Overdue.`);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error checking overdue loans:', error);
    throw error;
  }
};

// Optional utility function (re-add if used elsewhere)
export const getOverdueLoans = async () => {
  try {
    const overdueLoans = await LoanAccount.find({ LOAN_STATUS: 'Overdue' });
    return overdueLoans;
  } catch (error) {
    console.error('Error retrieving overdue loans:', error);
    throw error;
  }
};


export const processOverdueLoans = async () => {
  try {
    const today = new Date();

    const overdueLoans = await LoanAccount.find({
      due_date: { $lt: today },
      loan_status: 'Active',
    });

    for (const loan of overdueLoans) {
      try {
        if (!loan || !loan.ACCT_NO) {
          console.error(`Error updating loan status for account ${loan?.ACCT_NO}: Loan account ${loan?._id || 'unknown'} not found.`);
          continue;
        }

        loan.loan_status = 'Overdue';
        await loan.save();

        console.log(`Loan account ${loan.ACCT_NO} marked as overdue.`);
      } catch (innerErr) {
        console.error(`Error updating loan status for account ${loan?.ACCT_NO}:`, innerErr.message);
      }
    }

    console.log('[Service] Overdue loan check completed.');
  } catch (error) {
    console.error('Error checking overdue loans:', error.message);
  }
};

export default {getOverdueLoans, checkOverdueLoans, processOverdueLoans};