import mongoose from 'mongoose';
import InterestAccrual from '../models/InterestAccrual.js';
import LoanAccount from '../models/LoanAccount.js';
import { Decimal } from 'decimal.js';

/**
 * Posts daily accrued interest to loan accounts with complete audit trail
 * @returns {Promise<{success: boolean, message: string, postedCount: number, failedCount: number}>}
 */
export const postDailyAccruedInterest = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  try {
    // 1. Find pending accruals (including past due)
    const pendingAccruals = await InterestAccrual.find({
      status: 'PENDING',
      date: { $lte: today }
    }).lean();

    if (pendingAccruals.length === 0) {
      return {
        success: true,
        message: 'No pending accruals found for posting',
        postedCount: 0,
        failedCount: 0
      };
    }

    // 2. Process in transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    const results = {
      posted: [],
      failed: []
    };

    try {
      for (const accrual of pendingAccruals) {
        try {
          const interestAmount = new Decimal(accrual.dailyInterest);
          const updateData = {
            $inc: { accruedInterest: interestAmount.toNumber() },
            $push: {
              interestLedger: {
                date: new Date(),
                amount: interestAmount.toNumber(),
                type: accrual.accrualType,
                referenceId: accrual._id
              }
            }
          };

          // Handle capitalization if needed
          if (accrual.accrualType === 'CAPITALIZED') {
            updateData.$inc.OUTSTANDING_PRINCIPAL = interestAmount.toNumber();
          }

          // Update Loan Account with ledger record
          await LoanAccount.updateOne(
            { ACCT_NO: accrual.ACCT_NO },
            updateData,
            { session }
          );

          // Mark accrual as posted with timestamp
          await InterestAccrual.updateOne(
            { _id: accrual._id },
            { 
              $set: { 
                status: 'POSTED',
                postedAt: new Date() 
              } 
            },
            { session }
          );

          results.posted.push(accrual._id);
        } catch (accrualError) {
          results.failed.push({
            id: accrual._id,
            error: accrualError.message
          });

          // Log failure but continue with other accruals
          console.error(`Failed to post accrual ${accrual._id}:`, accrualError);
        }
      }

      await session.commitTransaction();
      session.endSession();

      // 3. Generate comprehensive report
      const report = {
        success: results.failed.length === 0,
        message: results.failed.length === 0
          ? `Successfully posted ${results.posted.length} accruals`
          : `Posted ${results.posted.length} accruals, failed ${results.failed.length}`,
        postedCount: results.posted.length,
        failedCount: results.failed.length,
        failedItems: results.failed
      };

      console.log('✅ Accrual posting completed:', report.message);
      return report;

    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }

  } catch (error) {
    console.error('❌ Critical accrual posting failure:', error);
    return {
      success: false,
      message: 'System error during accrual processing: ' + error.message,
      postedCount: 0,
      failedCount: pendingAccruals?.length || 0
    };
  }
};

// Job configuration object
export const interestPostingJobConfig = {
  execute: postDailyAccruedInterest,
  name: 'dailyInterestAccrualPosting',
  schedule: '0 0 * * *',
  retryPolicy: {
    maxAttempts: 3,
    delay: '5 minutes'
  }
};


export default postDailyAccruedInterest;