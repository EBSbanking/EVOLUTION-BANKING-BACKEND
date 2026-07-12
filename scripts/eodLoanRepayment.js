// scripts/eodLoanRepayment.js
import DirectDebit from '../src/models/DirectDebit.js';
import { sendFailureNotification, sendErrorNotification } from '../src/Services/NotificationService.js';

async function runEODLoanRepayment() {
  console.log('Starting EOD Loan Repayment Processing...');
  console.log('Time:', new Date().toISOString());

  try {
    const batchDate = new Date();
    const results = {
      totalProcessed: 0,
      successful: [],
      failed: [],
      skipped: 0
    };

    // Fetch active direct debits – adjust the `status` field as per your schema
    const activeDirectDebits = await DirectDebit.findAll({
      where: { status: 'ACTIVE' } // or 'PENDING', 'SCHEDULED', etc.
    });

    console.log(`Found ${activeDirectDebits.length} active direct debits`);

    for (const dd of activeDirectDebits) {
      try {
        // -------------------------------
        // ⚠️ REPLACE THIS WITH YOUR ACTUAL PAYMENT LOGIC
        // You might call an external API, update balances, etc.
        // For example:
        // const paymentResult = await processPayment(dd);
        // -------------------------------
        const success = true; // placeholder – implement real processing

        if (success) {
          results.successful.push({ directDebitId: dd.id, amount: dd.amount });
          // Update status (example)
          dd.status = 'PROCESSED';
          await dd.save();
        } else {
          results.failed.push({ directDebitId: dd.id, reason: 'Payment failed' });
          await dd.update({ status: 'FAILED' });
        }
        results.totalProcessed++;
      } catch (err) {
        results.failed.push({ directDebitId: dd.id, reason: err.message });
        results.totalProcessed++;
      }
    }

    console.log('EOD Processing Complete:');
    console.log(`Total Processed: ${results.totalProcessed}`);
    console.log(`Successful: ${results.successful.length}`);
    console.log(`Failed: ${results.failed.length}`);
    console.log(`Skipped: ${results.skipped}`);

    if (results.failed.length > 0) {
      console.log('\nFailed Transactions:');
      results.failed.forEach(failed => {
        console.log(`- ${failed.directDebitId}: ${failed.reason}`);
      });
      await sendFailureNotification(results.failed);
    }

    return results;
  } catch (error) {
    console.error('EOD Processing Failed:', error);
    await sendErrorNotification(error);
    throw error;
  }
}

export { runEODLoanRepayment };