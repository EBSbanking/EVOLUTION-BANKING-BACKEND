// dailyInterestAccrual.js
import TermDeposit from '../models/TermDeposit.js';
import { createGLAccountTransaction } from '../controllers/GLAccountTransactionController.js';

export const accrueDailyInterest = async () => {
  try {
    const today = new Date();

    const termDeposits = await TermDeposit.find({
      START_DT: { $lte: today },
      MATURITY_DT: { $gte: today },
      STATUS: 'ACTIVE', // assuming such a field exists
    });

    for (const td of termDeposits) {
      const principal = parseFloat(td.NOTICE_AMOUNT);
      const annualRate = parseFloat(td.EFFECTIVE_RATE);
      const accrualBasis = parseInt(td.ACCRUAL_BASIS || 365); // default to 365

      const dailyInterest = (principal * (annualRate / 100)) / accrualBasis;

      // Update accrued interest on TD
      td.ACCRUED_INTEREST = (parseFloat(td.ACCRUED_INTEREST || 0) + dailyInterest).toFixed(2);
      await td.save();

      // Move interest to GL account (e.g., TD_INTEREST_GL)
      await createGLAccountTransaction({
        debitAccount: td.ACCT_NO, // TD Account
        creditAccount: td.INTEREST_GL_ACCT_NO, // TD Interest Holding GL
        amount: dailyInterest,
        description: `Daily interest accrual for Term Deposit ${td.ACCT_NO}`,
        txnId: `DAILY_INT_${td._id}_${today.toISOString().slice(0, 10)}`,
      });

      console.log(`Accrued interest ${dailyInterest.toFixed(2)} for TD: ${td.ACCT_NO}`);
    }
  } catch (err) {
    console.error('Error accruing daily interest:', err.message);
  }
};
