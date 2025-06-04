import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import GLAccount from '../models/GLAccount.js';

const createGLTransaction = async (accountNumber, amount, transactionType, description) => {
  const glTransaction = new GLAccount({
    account_number: accountNumber,
    amount,
    transaction_type: transactionType,
    date: new Date(),
    description,
  });

  await glTransaction.save();
};

export const repayLoanService = async (loanAcctNo, amount, depositAcctNo) => {
  if (!loanAcctNo || !depositAcctNo || !amount || amount <= 0) {
    throw new Error('Invalid repayment request');
  }

  const loanAccount = await LoanAccount.findOne({ ACCT_NO: loanAcctNo });
  if (!loanAccount) {
    throw new Error('Loan account not found');
  }

  if (loanAccount.DISBURSEMENT_LIMIT <= 0) {
    throw new Error('No outstanding loan balance to repay');
  }

  if (amount > loanAccount.DISBURSEMENT_LIMIT) {
    throw new Error('Repayment amount exceeds outstanding loan balance');
  }

  const customerDeposit = await CustomerAccount.findOne({ ACCT_NO: depositAcctNo });
  if (!customerDeposit) {
    throw new Error('Customer deposit account not found');
  }

  if (customerDeposit.AVAILABLE_BALANCE < amount) {
    throw new Error('Insufficient funds in deposit account');
  }

  // Debit deposit account
  customerDeposit.LEDGER_BAL -= amount;
  customerDeposit.CLEARED_BAL -= amount;
  customerDeposit.AVAILABLE_BALANCE -= amount;
  await customerDeposit.save();

  // Credit loan account
  loanAccount.DISBURSEMENT_LIMIT -= amount;
  await loanAccount.save();

  // Record repayment
  const repayment = new LoanRepayment({
    ACCT_NO: loanAcctNo,
    amount,
    date: new Date(),
    customer_id: loanAccount.CUST_ID,
  });
  await repayment.save();

  // GL Entries
  await createGLTransaction(depositAcctNo, amount, 'DEBIT', 'Loan repayment debited from deposit account');
  await createGLTransaction(loanAcctNo, amount, 'CREDIT', 'Loan account credited for repayment');

  return {
    message: 'Loan repayment successful',
    remaining_loan_balance: loanAccount.DISBURSEMENT_LIMIT,
    deposit_balance: customerDeposit.AVAILABLE_BALANCE,
  };
};



export const processPendingRepayments = async () => {
  // Example placeholder: process any scheduled repayments (customize logic)
  const pendingRepayments = await LoanRepayment.find({ status: 'pending' });

  for (const repayment of pendingRepayments) {
    // Custom logic here — this is just a skeleton
    const loanAccount = await LoanAccount.findOne({ ACCT_NO: repayment.ACCT_NO });
    if (!loanAccount) continue;

    loanAccount.DISBURSEMENT_LIMIT -= repayment.amount;
    await loanAccount.save();

    repayment.status = 'processed';
    await repayment.save();
  }

  return { message: 'Pending repayments processed successfully' };
};
