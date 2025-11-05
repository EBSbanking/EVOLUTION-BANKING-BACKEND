import RepaymentSchedule from '../models/RepaymentSchedules.js';

/**
 * Helper to get the string description of term
 */
export const getTermDescription = (termCode) => {
  switch (termCode?.toUpperCase()) {
    case 'D': return 'Days';
    case 'W': return 'Weeks';
    case 'M': return 'Months';
    case 'Q': return 'Quarters';
    case 'Y': return 'Years';
    default: return termCode;
  }
};

/**
 * Helper to get payment frequency label from term code
 */
export const getPaymentFrequency = (termCode) => {
  switch (termCode?.toUpperCase()) {
    case 'D': return 'DAILY';
    case 'W': return 'WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return 'ANNUALLY';
    default: return termCode?.toUpperCase() || 'MONTHLY';
  }
};

/**
 * Generate repayment schedule for a loan
 */
export const generateRepaymentSchedule = (
  loanAmount,
  interestRate,
  termValue,
  termCode,
  acctNo,
  startDate = new Date()
) => {
  const frequency = getPaymentFrequency(termCode);
  const totalInstallments = parseInt(termValue, 10);
  const monthlyInterestRate = interestRate / 12;

  const installmentPrincipal = +(loanAmount / totalInstallments).toFixed(2);

  const schedule = [];
  let remainingBalance = loanAmount;
  let currentDate = new Date(startDate);

  for (let i = 0; i < totalInstallments; i++) {
    const interest = +(remainingBalance * monthlyInterestRate).toFixed(2);
    const totalPayment = +(installmentPrincipal + interest).toFixed(2);

    let dueDate = new Date(currentDate);
    switch (termCode?.toUpperCase()) {
      case 'D': dueDate.setDate(dueDate.getDate() + (i + 1)); break;
      case 'W': dueDate.setDate(dueDate.getDate() + (7 * (i + 1))); break;
      case 'M': dueDate.setMonth(dueDate.getMonth() + (i + 1)); break;
      case 'Q': dueDate.setMonth(dueDate.getMonth() + (3 * (i + 1))); break;
      case 'Y': dueDate.setFullYear(dueDate.getFullYear() + (i + 1)); break;
      default: dueDate.setMonth(dueDate.getMonth() + (i + 1)); break;
    }

    remainingBalance = +(remainingBalance - installmentPrincipal).toFixed(2);

    schedule.push({
      ACCT_NO: acctNo,
      installmentNo: i + 1,
      dueDate: dueDate,
      principal: installmentPrincipal,
      interest: interest,
      totalPayment: totalPayment,
      remainingBalance: remainingBalance < 0 ? 0 : remainingBalance,
      paymentFrequency: frequency,
      isFinalInstallment: i === totalInstallments - 1,
      amountPaid: 0
    });
  }

  return schedule;
};

// ✅ Default export for single import style
export default {
  getTermDescription,
  getPaymentFrequency,
  generateRepaymentSchedule
};
