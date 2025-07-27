// src/services/loanOverdueChecker.js
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanRepayment from '../models/LoanRepayment.js';  // <-- Add this import
import moment from 'moment';

// Function to check and update overdue loans
export const checkOverdueLoans = async () => {
    try {
        const repaymentSchedules = await RepaymentSchedule.find();

        for (const repaymentSchedule of repaymentSchedules) {
            const { ACCT_NO, dueDate, installmentNo, totalPayment } = repaymentSchedule;

            // Check if the due date has passed and if a repayment has been made
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
    }
};

export const checkIfLoanIsOverdue = async (ACCT_NO) => {
  try {
    const repaymentSchedules = await RepaymentSchedule.find({ ACCT_NO });
    for (const repaymentSchedule of repaymentSchedules) {
      const { dueDate, installmentNo, totalPayment } = repaymentSchedule;
      if (moment(dueDate).isBefore(moment()) && totalPayment > 0) {
        const repaymentMade = await LoanRepayment.findOne({ ACCT_NO, installmentNo });
        if (!repaymentMade) {
          const loanAccount = await LoanAccount.findOne({ ACCT_NO });
          if (loanAccount) {
            loanAccount.LOAN_STATUS = 'Overdue';
            await loanAccount.save();
            console.log(`Loan account ${ACCT_NO} marked as Overdue.`);
            return loanAccount;
          }
        }
      }
    }
    return null; // no overdue found
  } catch (error) {
    console.error('Error checking if loan is overdue:', error);
  }
};
