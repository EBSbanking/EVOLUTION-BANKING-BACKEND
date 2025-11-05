import OverdueLoan from '../models/OverdueLoan.js';
import LoanAccount from '../models/LoanAccount.js';

export const checkOverdueLoans = async () => {
  try {
    const currentDate = new Date();

    const overdueLoans = await OverdueLoan.find({
      due_date: { $lt: currentDate },
      status: 'Pending'
    });

    if (overdueLoans.length === 0) {
      console.log('No overdue loans found.');
      return;
    }

    const updateResult = await OverdueLoan.updateMany(
      { due_date: { $lt: currentDate }, status: 'Pending' },
      { $set: { status: 'Overdue' } }
    );

    console.log(`Updated ${updateResult.modifiedCount} overdue loans.`);

    const loanAccountNumbers = overdueLoans.map(loan => loan.loanAccountNo || loan.acct_no);

    const loanAccountUpdateResult = await LoanAccount.updateMany(
      { acct_no: { $in: loanAccountNumbers }, LOAN_STATUS: 'Pending' },
      { $set: { LOAN_STATUS: 'Overdue' } }
    );

    console.log(`Marked ${loanAccountUpdateResult.modifiedCount} loan accounts as Overdue.`);

    const uniqueLoanAccountNumbers = [...new Set(loanAccountNumbers)];
    uniqueLoanAccountNumbers.forEach(acctNo => {
      console.log(`Loan account ${acctNo} marked as Overdue.`);
    });

  } catch (error) {
    console.error('Error checking overdue loans:', error);
    throw error;
  }
};

export const getOverdueLoans = async () => {
  try {
    const overdueLoans = await OverdueLoan.find({ status: 'Overdue' });
    return overdueLoans;
  } catch (error) {
    console.error('Error retrieving overdue loans:', error);
    throw error;
  }
};
