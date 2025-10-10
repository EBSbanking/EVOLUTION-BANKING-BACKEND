import mongoose from 'mongoose';
import InterestAccrual from '../models/InterestAccrual.js';
import LoanAccount from '../models/LoanAccount.js';
import TermDeposit from '../models/TermDeposit.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { createGLAccountTransaction } from '../controllers/GLAccountTransactionController.js';
import logger from '../utils/logger.js';
import { Decimal } from 'decimal.js';

export const postDailyAccruedInterest = async () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const results = {
    loanAccruals: { postedCount: 0, failedCount: 0, failedItems: [] },
    termDeposits: { postedCount: 0, failedCount: 0, failedItems: [] },
    customerAccounts: { postedCount: 0, failedCount: 0, failedItems: [] }
  };

  // === 1. LOAN INTEREST ACCRUALS ===
  try {
    const pendingAccruals = await InterestAccrual.find({
      status: 'PENDING',
      date: { $lte: today }
    }).lean();

    if (pendingAccruals.length > 0) {
      const session = await mongoose.startSession();
      session.startTransaction();

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

            if (accrual.accrualType === 'CAPITALIZED') {
              updateData.$inc.OUTSTANDING_PRINCIPAL = interestAmount.toNumber();
            }

            await LoanAccount.updateOne(
              { ACCT_NO: accrual.ACCT_NO },
              updateData,
              { session }
            );

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

            results.loanAccruals.postedCount += 1;
          } catch (err) {
            results.loanAccruals.failedCount += 1;
            results.loanAccruals.failedItems.push({ id: accrual._id, error: err.message });
            logger.error(`Loan Accrual ${accrual._id} failed`, { error: err.message });
          }
        }

        await session.commitTransaction();
        session.endSession();
      } catch (transactionError) {
        await session.abortTransaction();
        session.endSession();
        throw transactionError;
      }
    }
  } catch (err) {
    logger.error('Critical failure in Loan Interest Posting', { error: err.message });
    results.loanAccruals.failedCount += 1;
    results.loanAccruals.failedItems.push({ error: err.message });
  }

  // === 2. TERM DEPOSIT INTEREST ACCRUALS ===
  try {
    const termDeposits = await TermDeposit.find({
      SETTLEMENT_STATUS: 'PENDING',
      MATURITY_DT: { $gte: today }
    });

    for (const td of termDeposits) {
      try {
        const principal = td.NOTICE_AMOUNT;
        const rate = td.EFFECTIVE_RATE / 100;
        const daysInYear = 365;
        const dailyInterest = (principal * rate) / daysInYear;

        if (!td.INTEREST_GL_ACCT_NO) {
          logger.warn(`Missing INTEREST_GL_ACCT_NO for TD ${td.ACCT_NO}`);
          continue;
        }

        await createGLAccountTransaction({
          debitAccount: td.ACCT_NO,
          creditAccount: td.INTEREST_GL_ACCT_NO,
          amount: dailyInterest,
          description: `Daily accrued interest for TD ${td.ACCT_NO}`,
        });

        td.ACCRUED_INTEREST += dailyInterest;
        await td.save();

        results.termDeposits.postedCount += 1;
      } catch (err) {
        results.termDeposits.failedCount += 1;
        results.termDeposits.failedItems.push({ id: td.ACCT_NO, error: err.message });
        logger.error(`Failed to post TD interest for ${td.ACCT_NO}`, { error: err.message });
      }
    }
  } catch (err) {
    logger.error('Critical failure in TD Interest Posting', { error: err.message });
    results.termDeposits.failedCount += 1;
    results.termDeposits.failedItems.push({ error: err.message });
  }

  // === 3. CUSTOMER ACCOUNT INTEREST ACCRUALS ===
  try {
    const eligibleAccounts = await CustomerAccount.find({
      STATUS: 'ACTIVE',
      INTEREST_RATE: { $gt: 0 },
      BALANCE: { $gt: 0 }
    });

    for (const ca of eligibleAccounts) {
      try {
        const principal = ca.BALANCE;
        const rate = ca.INTEREST_RATE / 100;
        const daysInYear = 365;
        const dailyInterest = (principal * rate) / daysInYear;

        if (!ca.INTEREST_GL_ACCT_NO) {
          logger.warn(`Missing INTEREST_GL_ACCT_NO for account ${ca.ACCT_NO}`);
          continue;
        }

        await createGLAccountTransaction({
          debitAccount: ca.INTEREST_GL_ACCT_NO,
          creditAccount: ca.ACCT_NO,
          amount: dailyInterest,
          description: `Daily interest credit for account ${ca.ACCT_NO}`,
        });

        ca.ACCRUED_INTEREST = (ca.ACCRUED_INTEREST || 0) + dailyInterest;
        ca.LAST_INTEREST_DATE = new Date();
        await ca.save();

        results.customerAccounts.postedCount += 1;
      } catch (err) {
        results.customerAccounts.failedCount += 1;
        results.customerAccounts.failedItems.push({ id: ca.ACCT_NO, error: err.message });
        logger.error(`Interest post failed for ${ca.ACCT_NO}`, { error: err.message });
      }
    }
  } catch (err) {
    logger.error('Critical failure in Customer Account Interest Posting', { error: err.message });
    results.customerAccounts.failedCount += 1;
    results.customerAccounts.failedItems.push({ error: err.message });
  }

  logger.info('📊 Interest Accrual Summary', results);

  return {
    success: true,
    message: 'Interest accrual processing completed',
    ...results
  };
};

// Unified job configuration
export const interestPostingJobConfig = {
  execute: postDailyAccruedInterest,
  name: 'dailyInterestAccrualPosting',
  schedule: '0 0 * * *', // midnight daily
  retryPolicy: {
    maxAttempts: 3,
    delay: '5 minutes'
  }
};

export default postDailyAccruedInterest;
