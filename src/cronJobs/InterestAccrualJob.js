import cron from 'node-cron';
import DepositAccountSummary from '../models/DepositAccountSummary';

// Daily job to update interest accrued
cron.schedule('0 0 * * *', async () => {
  try {
    const depositAccounts = await DepositAccountSummary.find();
    
    depositAccounts.forEach(async (account) => {
      // Calculate accrued interest for DR (Debit) and CR (Credit)
      const DR_INT_ACCRUED = calculateAccruedInterest(account.LEDGER_BAL, account.last_debit_date);
      const CR_INT_ACCRUED = calculateAccruedInterest(account.CLEARED_BAL);

      // Update the DepositAccountSummary with the new interest values
      await DepositAccountSummary.findByIdAndUpdate(account._id, {
        DR_INT_ACCRUED,
        CR_INT_ACCRUED
      });
    });

    console.log('Interest accrued updated successfully for all accounts!');
  } catch (error) {
    console.error('Error updating interest:', error);
  }
});

// Example interest calculation function
function calculateAccruedInterest(balance, lastDebitDate = null) {
  const interestRate = 0.05; // Example: 5% annual interest
  const dailyInterestRate = interestRate / 365;

  // If balance is negative or debit, calculate based on outstanding days
  if (lastDebitDate) {
    const currentDate = new Date();
    const daysOutstanding = Math.ceil((currentDate - new Date(lastDebitDate)) / (1000 * 3600 * 24)); // Calculate days outstanding
    return balance * dailyInterestRate * daysOutstanding;
  }

  // If no last debit date (for CR_INT_ACCRUED), calculate interest daily
  return balance * dailyInterestRate;
}

// Update or create a DepositAccountSummary after a debit transaction
export const updateDepositAccountSummaryAfterDebit = async (req, res) => {
  const { ACCT_NO, debitAmount } = req.body; // debitAmount passed with the transaction

  try {
    const account = await DepositAccountSummary.findOne({ ACCT_NO });

    if (!account) {
      return res.status(404).json({ message: 'Account not found' });
    }

    // Calculate the number of days since the last debit
    const currentDate = new Date();
    const lastDebitDate = account.last_debit_date || currentDate;
    const daysOutstanding = Math.ceil((currentDate - new Date(lastDebitDate)) / (1000 * 3600 * 24)); // Calculate days outstanding

    // Example logic for DR_INT_ACCRUED (debit interest)
    const interestRate = 0.05; // 5% annual interest
    const dailyInterestRate = interestRate / 365;
    const DR_INT_ACCRUED = debitAmount * dailyInterestRate * daysOutstanding;

    // Update the DepositAccountSummary with the new DR_INT_ACCRUED
    account.DR_INT_ACCRUED += DR_INT_ACCRUED; // Add the interest to the accrued interest

    // Update the last debit date and days outstanding
    account.last_debit_date = currentDate;
    account.days_outstanding = daysOutstanding;

    // Now calculate CR_INT_ACCRUED for the cleared balance
    const CR_INT_ACCRUED = calculateAccruedInterest(account.CLEARED_BAL);

    // Update the DepositAccountSummary with the new CR_INT_ACCRUED
    account.CR_INT_ACCRUED += CR_INT_ACCRUED;

    // Save the updated account summary
    await account.save();

    res.status(200).json({
      message: 'Deposit Account Summary updated with new interest accrued!',
      account
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error updating Deposit Account Summary', error });
  }
};
