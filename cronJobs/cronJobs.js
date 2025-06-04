import cron from 'node-cron';
import {calculateAndPostDailyInterest}  from '../controllers/Deposit_Account_INTEREST$AUDController.js'; // Import the daily interest calculation function
import { calculateTieredInterest } from '../controllers/DepositAccountInterest_TierController.js'; // Import tiered interest calculation
import CustomerAccount from '../models/CustomerAccount.js'; // Import the CustomerAccount model

// Run the task at midnight on the last day of every month
cron.schedule('59 23 28-31 * *', async () => {
  const today = moment();
  // Ensure it only runs on the last day of the month
  if (today.date() === today.daysInMonth()) {
    console.log('Posting interest at the end of the month...');

    try {
      const customerAccounts = await CustomerAccount.find({ REC_ST: 'ACTIVE' });

      // Loop through each active customer account
      for (let customerAccount of customerAccounts) {
        // 1. Calculate tiered interest based on the customer account's balance
        const tieredRate = await calculateTieredInterest(customerAccount);  
        // You can now calculate the interest based on this rate
        console.log(`Tiered interest for account ${customerAccount.ACCT_ID} calculated using tiered rate: ${tieredRate}`);


        // 2. Calculate daily interest using the daily accrual method
        await calculateAndPostDailyInterest(customerAccount); // Calculate daily interest for this account
      }

      console.log('Interest calculation for all customers completed successfully.');
    } catch (error) {
      console.error('Error during monthly interest calculation:', error);
    }
  }
});
