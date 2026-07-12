// src/cronJobs/dailyInterestAccrual.js
import { sequelize } from '../../config/db.js';
import { createGLAccountTransaction } from '../controllers/GLAccountTransactionController.js';
import logger from '../utils/logger.js';
import jobRegistry from '../services/jobRegistry.js';

// ──────────────────────────────────────────────────────────────
// Class: DailyInterestAccrual (term deposit daily accrual)
// ──────────────────────────────────────────────────────────────
class DailyInterestAccrual {
  // All methods use Sequelize transactions directly

  /**
   * Accrue daily interest for all active term deposits
   */
  async accrueDailyInterest() {
    const transaction = await sequelize.transaction();
    try {
      logger.info('Starting daily term deposit interest accrual');

      const [termDeposits] = await sequelize.query(`
        SELECT * FROM term_deposits 
        WHERE START_DT <= NOW() 
          AND MATURITY_DT >= NOW() 
          AND STATUS = 'ACTIVE'
        FOR UPDATE
      `, { transaction });

      let totalAccrued = 0;
      let processedDeposits = 0;
      let failedDeposits = 0;

      for (const td of termDeposits) {
        try {
          const accruedAmount = await this.accrueInterestForTermDeposit(td, transaction);
          if (accruedAmount > 0) {
            totalAccrued += accruedAmount;
            processedDeposits++;
          }
        } catch (tdError) {
          failedDeposits++;
          logger.error(`Error accruing interest for term deposit ${td.ACCT_NO}:`, tdError);
        }
      }

      await transaction.commit();
      
      logger.info('Daily term deposit interest accrual completed', {
        totalProcessed: processedDeposits,
        failedCount: failedDeposits,
        totalAccrued: totalAccrued.toFixed(2),
        date: new Date().toISOString().split('T')[0]
      });

      return { success: true, processedDeposits, failedDeposits, totalAccrued };
    } catch (error) {
      await transaction.rollback();
      logger.error('Daily term deposit interest accrual failed:', error);
      throw error;
    }
  }

  /**
   * Accrue interest for a single term deposit (called within transaction)
   */
  async accrueInterestForTermDeposit(td, transaction) {
    // Validate required fields
    if (!td.NOTICE_AMOUNT || !td.EFFECTIVE_RATE) {
      throw new Error(`Missing required fields for term deposit ${td.ACCT_NO}`);
    }

    const principal = parseFloat(td.NOTICE_AMOUNT);
    const annualRate = parseFloat(td.EFFECTIVE_RATE);
    const accrualBasis = parseInt(td.ACCRUAL_BASIS) || 365;

    if (isNaN(principal) || principal <= 0) {
      throw new Error(`Invalid principal amount for term deposit ${td.ACCT_NO}`);
    }
    if (isNaN(annualRate) || annualRate <= 0) {
      throw new Error(`Invalid interest rate for term deposit ${td.ACCT_NO}`);
    }
    if (isNaN(accrualBasis) || accrualBasis <= 0) {
      throw new Error(`Invalid accrual basis for term deposit ${td.ACCT_NO}`);
    }

    const dailyInterest = (principal * (annualRate / 100)) / accrualBasis;
    const roundedInterest = Math.round(dailyInterest * 100) / 100;
    if (roundedInterest <= 0) return 0;

    const currentAccrued = parseFloat(td.ACCRUED_INTEREST || 0);
    const newAccrued = (currentAccrued + roundedInterest).toFixed(2);
    
    await sequelize.query(`
      UPDATE term_deposits 
      SET ACCRUED_INTEREST = ?, 
          LAST_ACCRUAL_DATE = NOW()
      WHERE ACCT_NO = ? AND STATUS = 'ACTIVE'
    `, {
      replacements: [newAccrued, td.ACCT_NO],
      transaction
    });

    if (td.INTEREST_GL_ACCT_NO) {
      try {
        await createGLAccountTransaction({
          debitAccount: td.ACCT_NO,
          creditAccount: td.INTEREST_GL_ACCT_NO,
          amount: roundedInterest,
          description: `Daily interest accrual for Term Deposit ${td.ACCT_NO}`,
          txnId: `DAILY_INT_${td.id}_${new Date().toISOString().slice(0,10)}`,
          transactionDate: new Date(),
          currency: td.CURRENCY || 'USD',
          businessUnit: td.BUSINESS_UNIT,
          createdBy: 'SYSTEM_ACCRUAL'
        }, { transaction });
      } catch (glError) {
        logger.warn(`GL transaction failed for term deposit ${td.ACCT_NO}:`, glError);
      }
    }

    logger.debug(`Accrued interest ${roundedInterest.toFixed(2)} for TD: ${td.ACCT_NO}`);
    return roundedInterest;
  }

  /**
   * Get summary of current term deposit accruals
   */
  async getAccrualSummary() {
    const [summary] = await sequelize.query(`
      SELECT 
        COUNT(*) as totalDeposits,
        COALESCE(SUM(NOTICE_AMOUNT), 0) as totalPrincipal,
        COALESCE(SUM(ACCRUED_INTEREST), 0) as totalAccruedInterest,
        COALESCE(AVG(EFFECTIVE_RATE), 0) as avgInterestRate
      FROM term_deposits
      WHERE START_DT <= NOW() 
        AND MATURITY_DT >= NOW() 
        AND STATUS = 'ACTIVE'
    `);
    return summary[0] || {
      totalDeposits: 0,
      totalPrincipal: 0,
      totalAccruedInterest: 0,
      avgInterestRate: 0
    };
  }

  /**
   * Manual accrual for a specific term deposit
   */
  async manualAccrualForDeposit(acctNo) {
    const transaction = await sequelize.transaction();
    try {
      const [termDeposits] = await sequelize.query(`
        SELECT * FROM term_deposits 
        WHERE ACCT_NO = ? AND STATUS = 'ACTIVE'
        FOR UPDATE
      `, {
        replacements: [acctNo],
        transaction
      });

      if (termDeposits.length === 0) {
        throw new Error(`Active term deposit not found: ${acctNo}`);
      }

      const termDeposit = termDeposits[0];
      const accruedAmount = await this.accrueInterestForTermDeposit(termDeposit, transaction);
      
      await transaction.commit();

      logger.info(`Manual interest accrual completed for term deposit ${acctNo}`, {
        amount: accruedAmount,
        date: new Date()
      });

      return {
        success: true,
        account: acctNo,
        accruedAmount,
        date: new Date()
      };
    } catch (error) {
      await transaction.rollback();
      logger.error(`Manual accrual failed for term deposit ${acctNo}:`, error);
      throw error;
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Create singleton instance
// ──────────────────────────────────────────────────────────────
const dailyInterestAccrual = new DailyInterestAccrual();

// ──────────────────────────────────────────────────────────────
// Register cron jobs with JobRegistry
// ──────────────────────────────────────────────────────────────

// 1. Daily term deposit interest accrual (1 AM daily)
jobRegistry.registerJob(
  'Term Deposit Daily Interest Accrual',
  '0 1 * * *',
  async () => {
    await dailyInterestAccrual.accrueDailyInterest();
  },
  'Accrues daily interest for all active term deposits'
);

// 2. Monthly end‑of‑month interest posting (last day of month at 23:59)
jobRegistry.registerJob(
  'Monthly Interest Posting',
  '59 23 28-31 * *',
  async () => {
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    if (today.getDate() !== lastDay) {
      console.log('Not the last day of the month – skipping monthly interest posting.');
      return;
    }

    console.log('Posting interest at the end of the month...');
    try {
      // ✅ Dynamic imports – so the file loads even if controllers are missing
      const { calculateAndPostDailyInterest } = await import(
        '../controllers/Deposit_Account_INTEREST$AUDController.js'
      ).catch(() => {
        throw new Error('Failed to load calculateAndPostDailyInterest');
      });

      const { calculateTieredInterest } = await import(
        '../controllers/DepositAccountInterest_TierController.js'
      ).catch(() => {
        throw new Error('Failed to load calculateTieredInterest');
      });

      const { default: CustomerAccount } = await import('../models/CustomerAccount.js');

      const customerAccounts = await CustomerAccount.findAll({ where: { REC_ST: 'ACTIVE' } });
      for (const customerAccount of customerAccounts) {
        const tieredRate = await calculateTieredInterest(customerAccount);
        console.log(`Tiered interest for account ${customerAccount.ACCT_ID}: ${tieredRate}`);
        await calculateAndPostDailyInterest(customerAccount);
      }
      console.log('Interest calculation for all customers completed successfully.');
    } catch (error) {
      console.error('Error during monthly interest calculation:', error);
    }
  },
  'Posts interest to all active customer accounts on the last day of each month'
);

// ──────────────────────────────────────────────────────────────
// Exports for programmatic use
// ──────────────────────────────────────────────────────────────
export const accrueDailyInterest = async () => {
  return await dailyInterestAccrual.accrueDailyInterest();
};

export const getAccrualSummary = async () => {
  return await dailyInterestAccrual.getAccrualSummary();
};

export const manualAccrualForDeposit = async (acctNo) => {
  return await dailyInterestAccrual.manualAccrualForDeposit(acctNo);
};

export const manualAccrualEndpoint = async (req, res) => {
  try {
    const { acctNo } = req.body;
    let result;
    if (acctNo) {
      result = await dailyInterestAccrual.manualAccrualForDeposit(acctNo);
    } else {
      result = await dailyInterestAccrual.accrueDailyInterest();
    }
    res.json({
      success: true,
      message: acctNo
        ? `Manual accrual completed for account ${acctNo}`
        : 'Manual accrual completed for all term deposits',
      data: result
    });
  } catch (error) {
    logger.error('Manual accrual endpoint failed:', error);
    res.status(500).json({
      success: false,
      message: 'Manual accrual failed',
      error: error.message
    });
  }
};

export const getAccrualSummaryEndpoint = async (req, res) => {
  try {
    const summary = await dailyInterestAccrual.getAccrualSummary();
    res.json({ success: true, data: summary });
  } catch (error) {
    logger.error('Failed to get accrual summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get accrual summary',
      error: error.message
    });
  }
};

export default dailyInterestAccrual;