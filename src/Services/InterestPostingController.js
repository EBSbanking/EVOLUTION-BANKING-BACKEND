import { getPool } from '../../config/db.js'; // MySQL connection pool
import { createGLAccountTransaction } from '../controllers/GLAccountTransactionController.js';
import logger from '../utils/logger.js';
import { Decimal } from 'decimal.js';

export const postDailyAccruedInterest = async () => {
  const pool = getPool();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const results = {
    loanAccruals: { postedCount: 0, failedCount: 0, failedItems: [] },
    termDeposits: { postedCount: 0, failedCount: 0, failedItems: [] },
    customerAccounts: { postedCount: 0, failedCount: 0, failedItems: [] }
  };

  // === 1. LOAN INTEREST ACCRUALS ===
  try {
    // Get pending accruals for today or earlier
    const [pendingAccruals] = await pool.query(`
      SELECT * FROM InterestAccrual 
      WHERE status = 'PENDING' 
        AND date <= ?
    `, [today]);

    if (pendingAccruals.length > 0) {
      const connection = await pool.getConnection();
      
      try {
        await connection.beginTransaction();

        for (const accrual of pendingAccruals) {
          try {
            const interestAmount = new Decimal(accrual.dailyInterest || 0);
            
            // Update LoanAccount with accrued interest
            if (accrual.accrualType === 'CAPITALIZED') {
              await connection.query(`
                UPDATE LoanAccount 
                SET 
                  accruedInterest = accruedInterest + ?,
                  OUTSTANDING_PRINCIPAL = OUTSTANDING_PRINCIPAL + ?,
                  updatedAt = NOW()
                WHERE ACCT_NO = ?
              `, [
                interestAmount.toNumber(),
                interestAmount.toNumber(),
                accrual.ACCT_NO
              ]);
            } else {
              await connection.query(`
                UPDATE LoanAccount 
                SET 
                  accruedInterest = accruedInterest + ?,
                  updatedAt = NOW()
                WHERE ACCT_NO = ?
              `, [interestAmount.toNumber(), accrual.ACCT_NO]);
            }

            // Add to interest ledger
            await connection.query(`
              INSERT INTO InterestLedger 
              (loanAccountId, date, amount, type, referenceId, createdAt) 
              VALUES (?, NOW(), ?, ?, ?, NOW())
            `, [
              accrual.loanAccountId || accrual.ACCT_NO,
              interestAmount.toNumber(),
              accrual.accrualType || 'ACCRUED',
              accrual.id
            ]);

            // Update accrual status
            await connection.query(`
              UPDATE InterestAccrual 
              SET status = 'POSTED', postedAt = NOW() 
              WHERE id = ?
            `, [accrual.id]);

            results.loanAccruals.postedCount += 1;
          } catch (err) {
            results.loanAccruals.failedCount += 1;
            results.loanAccruals.failedItems.push({ 
              id: accrual.id, 
              error: err.message 
            });
            logger.error(`Loan Accrual ${accrual.id} failed`, { error: err.message });
          }
        }

        await connection.commit();
      } catch (transactionError) {
        await connection.rollback();
        throw transactionError;
      } finally {
        connection.release();
      }
    }
  } catch (err) {
    logger.error('Critical failure in Loan Interest Posting', { error: err.message });
    results.loanAccruals.failedCount += 1;
    results.loanAccruals.failedItems.push({ error: err.message });
  }

  // === 2. TERM DEPOSIT INTEREST ACCRUALS ===
  try {
    const [termDeposits] = await pool.query(`
      SELECT * FROM TermDeposit 
      WHERE SETTLEMENT_STATUS = 'PENDING' 
        AND MATURITY_DT >= ?
    `, [today]);

    for (const td of termDeposits) {
      try {
        const principal = parseFloat(td.NOTICE_AMOUNT || 0);
        const rate = parseFloat(td.EFFECTIVE_RATE || 0) / 100;
        const daysInYear = 365;
        const dailyInterest = (principal * rate) / daysInYear;

        if (!td.INTEREST_GL_ACCT_NO) {
          logger.warn(`Missing INTEREST_GL_ACCT_NO for TD ${td.ACCT_NO}`);
          continue;
        }

        // Create GL transaction
        await createGLAccountTransaction({
          debitAccount: td.ACCT_NO,
          creditAccount: td.INTEREST_GL_ACCT_NO,
          amount: dailyInterest,
          description: `Daily accrued interest for TD ${td.ACCT_NO}`,
        });

        // Update term deposit accrued interest
        await pool.query(`
          UPDATE TermDeposit 
          SET 
            ACCRUED_INTEREST = ACCRUED_INTEREST + ?,
            updatedAt = NOW()
          WHERE ACCT_NO = ?
        `, [dailyInterest, td.ACCT_NO]);

        results.termDeposits.postedCount += 1;
      } catch (err) {
        results.termDeposits.failedCount += 1;
        results.termDeposits.failedItems.push({ 
          id: td.ACCT_NO, 
          error: err.message 
        });
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
    const [eligibleAccounts] = await pool.query(`
      SELECT * FROM CustomerAccount 
      WHERE STATUS = 'ACTIVE' 
        AND INTEREST_RATE > 0 
        AND BALANCE > 0
    `);

    for (const ca of eligibleAccounts) {
      try {
        const principal = parseFloat(ca.BALANCE || 0);
        const rate = parseFloat(ca.INTEREST_RATE || 0) / 100;
        const daysInYear = 365;
        const dailyInterest = (principal * rate) / daysInYear;

        if (!ca.INTEREST_GL_ACCT_NO) {
          logger.warn(`Missing INTEREST_GL_ACCT_NO for account ${ca.ACCT_NO}`);
          continue;
        }

        // Create GL transaction
        await createGLAccountTransaction({
          debitAccount: ca.INTEREST_GL_ACCT_NO,
          creditAccount: ca.ACCT_NO,
          amount: dailyInterest,
          description: `Daily interest credit for account ${ca.ACCT_NO}`,
        });

        // Update customer account
        await pool.query(`
          UPDATE CustomerAccount 
          SET 
            ACCRUED_INTEREST = IFNULL(ACCRUED_INTEREST, 0) + ?,
            LAST_INTEREST_DATE = NOW(),
            updatedAt = NOW()
          WHERE ACCT_NO = ?
        `, [dailyInterest, ca.ACCT_NO]);

        results.customerAccounts.postedCount += 1;
      } catch (err) {
        results.customerAccounts.failedCount += 1;
        results.customerAccounts.failedItems.push({ 
          id: ca.ACCT_NO, 
          error: err.message 
        });
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
    timestamp: new Date().toISOString(),
    ...results,
    summary: {
      totalPosted: 
        results.loanAccruals.postedCount + 
        results.termDeposits.postedCount + 
        results.customerAccounts.postedCount,
      totalFailed: 
        results.loanAccruals.failedCount + 
        results.termDeposits.failedCount + 
        results.customerAccounts.failedCount
    }
  };
};

// Function to check if interest accrual is needed
export const checkInterestAccrualNeeded = async () => {
  const pool = getPool();
  const today = new Date().toISOString().split('T')[0];

  try {
    // Check for pending loan accruals
    const [pendingLoanAccruals] = await pool.query(`
      SELECT COUNT(*) as count FROM InterestAccrual 
      WHERE status = 'PENDING' AND date <= ?
    `, [today]);

    // Check active term deposits
    const [activeTermDeposits] = await pool.query(`
      SELECT COUNT(*) as count FROM TermDeposit 
      WHERE SETTLEMENT_STATUS = 'PENDING' 
        AND MATURITY_DT >= ?
    `, [today]);

    // Check accounts needing interest
    const [accountsNeedingInterest] = await pool.query(`
      SELECT COUNT(*) as count FROM CustomerAccount 
      WHERE STATUS = 'ACTIVE' 
        AND INTEREST_RATE > 0 
        AND BALANCE > 0
    `);

    return {
      needsProcessing: 
        pendingLoanAccruals[0].count > 0 || 
        activeTermDeposits[0].count > 0 || 
        accountsNeedingInterest[0].count > 0,
      details: {
        pendingLoanAccruals: pendingLoanAccruals[0].count,
        activeTermDeposits: activeTermDeposits[0].count,
        accountsNeedingInterest: accountsNeedingInterest[0].count
      }
    };
  } catch (error) {
    logger.error('Error checking interest accrual needs:', error);
    return { needsProcessing: false, error: error.message };
  }
};

// Function to manually trigger interest accrual for a specific date
export const manualInterestAccrual = async (targetDate) => {
  const pool = getPool();
  const date = targetDate ? new Date(targetDate) : new Date();
  date.setHours(0, 0, 0, 0);
  const dateStr = date.toISOString().split('T')[0];

  logger.info(`Manual interest accrual triggered for date: ${dateStr}`);

  try {
    // Check if accrual already processed for this date
    const [alreadyProcessed] = await pool.query(`
      SELECT COUNT(*) as count FROM InterestAccrualProcessLog 
      WHERE processDate = ? AND status = 'COMPLETED'
    `, [dateStr]);

    if (alreadyProcessed[0].count > 0) {
      logger.warn(`Interest accrual already processed for date: ${dateStr}`);
      return {
        success: false,
        message: `Interest accrual already processed for ${dateStr}`,
        date: dateStr
      };
    }

    // Log process start
    await pool.query(`
      INSERT INTO InterestAccrualProcessLog 
      (processDate, status, startedAt) 
      VALUES (?, 'PROCESSING', NOW())
    `, [dateStr]);

    // Call the main accrual function
    const result = await postDailyAccruedInterest();

    // Update process log
    await pool.query(`
      UPDATE InterestAccrualProcessLog 
      SET 
        status = ?,
        completedAt = NOW(),
        result = ?
      WHERE processDate = ? AND status = 'PROCESSING'
    `, [
      result.success ? 'COMPLETED' : 'FAILED',
      JSON.stringify(result),
      dateStr
    ]);

    return {
      success: result.success,
      message: `Manual interest accrual completed for ${dateStr}`,
      date: dateStr,
      details: result
    };

  } catch (error) {
    logger.error('Manual interest accrual failed:', error);
    
    // Update process log with error
    try {
      await pool.query(`
        UPDATE InterestAccrualProcessLog 
        SET 
          status = 'FAILED',
          completedAt = NOW(),
          error = ?
        WHERE processDate = ? AND status = 'PROCESSING'
      `, [error.message, dateStr]);
    } catch (logError) {
      logger.error('Failed to update process log:', logError);
    }

    return {
      success: false,
      message: `Manual interest accrual failed for ${dateStr}`,
      error: error.message,
      date: dateStr
    };
  }
};

// Get interest accrual status report
export const getAccrualStatusReport = async (startDate, endDate) => {
  const pool = getPool();

  try {
    let dateFilter = '';
    const params = [];

    if (startDate && endDate) {
      dateFilter = 'WHERE DATE(processDate) BETWEEN ? AND ?';
      params.push(startDate, endDate);
    } else if (startDate) {
      dateFilter = 'WHERE DATE(processDate) >= ?';
      params.push(startDate);
    } else if (endDate) {
      dateFilter = 'WHERE DATE(processDate) <= ?';
      params.push(endDate);
    }

    const [processLogs] = await pool.query(`
      SELECT * FROM InterestAccrualProcessLog 
      ${dateFilter}
      ORDER BY startedAt DESC
      LIMIT 100
    `, params);

    // Get accrual statistics
    const [stats] = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count,
        MIN(startedAt) as earliest,
        MAX(completedAt) as latest
      FROM InterestAccrualProcessLog
      ${dateFilter}
      GROUP BY status
    `, params);

    // Get summary of accruals by type
    const [accrualSummary] = await pool.query(`
      SELECT 
        DATE(postedAt) as accrualDate,
        COUNT(*) as totalAccruals,
        SUM(dailyInterest) as totalInterest
      FROM InterestAccrual
      WHERE status = 'POSTED'
        ${startDate ? 'AND DATE(postedAt) >= ?' : ''}
        ${endDate ? 'AND DATE(postedAt) <= ?' : ''}
      GROUP BY DATE(postedAt)
      ORDER BY accrualDate DESC
      LIMIT 30
    `, startDate && endDate ? [startDate, endDate] : []);

    return {
      success: true,
      data: {
        processLogs,
        statistics: stats,
        accrualSummary,
        reportPeriod: {
          startDate: startDate || 'N/A',
          endDate: endDate || 'N/A',
          generatedAt: new Date().toISOString()
        }
      }
    };

  } catch (error) {
    logger.error('Error generating accrual status report:', error);
    return {
      success: false,
      message: 'Failed to generate accrual status report',
      error: error.message
    };
  }
};

// Unified job configuration
export const interestPostingJobConfig = {
  execute: postDailyAccruedInterest,
  name: 'dailyInterestAccrualPosting',
  schedule: '0 0 * * *', // midnight daily
  retryPolicy: {
    maxAttempts: 3,
    delay: '5 minutes'
  },
  validateBeforeRun: checkInterestAccrualNeeded,
  manualTrigger: manualInterestAccrual,
  getStatusReport: getAccrualStatusReport
};

export default postDailyAccruedInterest;