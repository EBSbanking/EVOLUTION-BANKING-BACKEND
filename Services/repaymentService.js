import RepaymentSchedule from '../models/RepaymentSchedule.js'; // Import the model for storing repayment schedules

export const generateRepaymentSchedule = async (loanAccount, TERM_VALUE, DISBURSEMENT_DATE, INTEREST_RATE) => {
    if (!loanAccount) {
      console.error('LoanAccount is not defined or is invalid');
      throw new Error('LoanAccount is not defined or invalid');
    }
  
    console.log('Generating repayment schedule for loan account:', loanAccount);
  
    const { ACCT_NO, DISBURSEMENT_LIMIT } = loanAccount;
  
    try {
      // Calculate total interest
      const totalInterest = DISBURSEMENT_LIMIT * (INTEREST_RATE / 100);
      const totalAmountToBeRepaid = DISBURSEMENT_LIMIT + totalInterest;
      const EMI = totalAmountToBeRepaid / TERM_VALUE;
  
      const repaymentSchedules = [];
      let remainingPrincipal = DISBURSEMENT_LIMIT;
      const interestForMonth = DISBURSEMENT_LIMIT * (INTEREST_RATE / 100 / 12);
      let dueDate = new Date(DISBURSEMENT_DATE);
  
      // Generate repayment schedule for each month
      for (let i = 1; i <= TERM_VALUE; i++) {
        const principalForMonth = EMI - interestForMonth;
        remainingPrincipal -= principalForMonth;
  
        if (i === TERM_VALUE) remainingPrincipal = 0;
  
        repaymentSchedules.push({
          ACCT_NO,
          installmentNo: i,
          dueDate: new Date(dueDate).toISOString().split('T')[0], // Format date
          principal: Math.round(principalForMonth * 100) / 100,
          interest: Math.round(interestForMonth * 100) / 100,
          totalPayment: Math.round(EMI * 100) / 100,
        });
  
        // Move to next month
        dueDate.setMonth(dueDate.getMonth() + 1);
      }
  
      // Save repayment schedules to DB
      await RepaymentSchedule.insertMany(repaymentSchedules);
  
      console.log('Repayment schedule generated and saved successfully');
      return repaymentSchedules;
    } catch (error) {
      console.error('Error generating repayment schedule:', error);
      throw new Error('Error generating repayment schedule: ' + error.message);
    }
  };
  