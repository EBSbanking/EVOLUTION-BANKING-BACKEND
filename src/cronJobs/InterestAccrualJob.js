// src/cronJobs/InterestAccrualJob.js
import { sequelize } from '../../config/db.js';
import logger from '../utils/logger.js';
import jobRegistry from '../services/jobRegistry.js';

/**
 * Ensure required columns exist in deposit_account_summary
 */
async function ensureColumnsExist() {
  const requiredColumns = {
    DR_INT_ACCRUED: 'DECIMAL(15,2) DEFAULT 0',
    CR_INT_ACCRUED: 'DECIMAL(15,2) DEFAULT 0',
    last_debit_date: 'DATETIME NULL',
    days_outstanding: 'INT DEFAULT 0',
    LAST_INTEREST_UPDATE: 'DATETIME NULL',
  };

  const [columns] = await sequelize.query(
    `SHOW COLUMNS FROM deposit_account_summary`
  );
  const existingCols = columns.map(c => c.Field);

  for (const [colName, colDef] of Object.entries(requiredColumns)) {
    if (!existingCols.includes(colName)) {
      await sequelize.query(
        `ALTER TABLE deposit_account_summary ADD COLUMN ${colName} ${colDef}`
      );
      logger.info(`✅ Added column ${colName} to deposit_account_summary`);
    }
  }
}

/**
 * Daily deposit interest accrual with dynamic rates (Sequelize version)
 */
class DepositInterestAccrual {
  constructor() {
    this.interestRatesCache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes
    this.lastCacheUpdate = 0;
  }

  async getInterestRate(accountType, balanceTier = 'DEFAULT') {
    const cacheKey = `${accountType}_${balanceTier}`;
    const now = Date.now();
    if (this.interestRatesCache.has(cacheKey) && (now - this.lastCacheUpdate) < this.cacheExpiry) {
      return this.interestRatesCache.get(cacheKey);
    }

    try {
      const [rows] = await sequelize.query(`
        SELECT ANNUAL_RATE 
        FROM deposit_account_interest 
        WHERE ACCOUNT_TYPE = ? 
          AND BALANCE_TIER = ? 
          AND STATUS = 'ACTIVE'
          AND EFFECTIVE_DATE <= NOW()
          AND (EXPIRY_DATE >= NOW() OR EXPIRY_DATE IS NULL)
        ORDER BY EFFECTIVE_DATE DESC 
        LIMIT 1
      `, {
        replacements: [accountType, balanceTier],
        type: sequelize.QueryTypes.SELECT
      });

      let annualRate = 0.05;
      if (rows && rows.length > 0) {
        annualRate = parseFloat(rows[0].ANNUAL_RATE) || 0.05;
        logger.debug(`Found interest rate for ${accountType}/${balanceTier}: ${annualRate}%`);
      } else {
        logger.warn(`No rate found for ${accountType}/${balanceTier}, using default 5%`);
      }

      const dailyRate = annualRate / 100 / 365;
      this.interestRatesCache.set(cacheKey, dailyRate);
      this.lastCacheUpdate = now;
      return dailyRate;
    } catch (error) {
      logger.error(`Error fetching interest rate for ${accountType}:`, error);
      return 0.05 / 100 / 365;
    }
  }

  getBalanceTier(balance) {
    if (balance >= 100000) return 'PREMIUM';
    if (balance >= 50000) return 'GOLD';
    if (balance >= 10000) return 'SILVER';
    return 'STANDARD';
  }

  async calculateAccruedInterest(account, balance, days = 1) {
    if (!balance || balance <= 0) return 0;
    try {
      const accountType = account.ACCOUNT_TYPE || 'SAVINGS';
      const balanceTier = this.getBalanceTier(balance);
      const dailyRate = await this.getInterestRate(accountType, balanceTier);
      const interest = balance * dailyRate * days;
      return Math.round(interest * 100) / 100;
    } catch (error) {
      logger.error(`Error calculating interest for account ${account.ACCT_NO}:`, error);
      return 0;
    }
  }

  async updateAllAccountsInterest() {
    const transaction = await sequelize.transaction();
    try {
      logger.info('Starting daily deposit interest accrual job with dynamic rates');

      // Ensure columns exist (first run)
      await ensureColumnsExist();

      const [depositAccounts] = await sequelize.query(`
        SELECT * FROM deposit_account_summary 
        WHERE REC_ST = 'A'
        FOR UPDATE
      `, { transaction });

      let updatedCount = 0;
      let totalInterestAccrued = 0;
      const rateSummary = {};

      for (const account of depositAccounts) {
        try {
          const result = await this.updateAccountInterest(account, transaction);
          if (result) {
            updatedCount++;
            totalInterestAccrued += result.totalInterest;
            const accountType = account.ACCOUNT_TYPE || 'SAVINGS';
            rateSummary[accountType] = (rateSummary[accountType] || 0) + 1;
          }
        } catch (accountError) {
          logger.error(`Error updating interest for account ${account.ACCT_NO}:`, accountError);
        }
      }

      await transaction.commit();
      
      logger.info('Daily deposit interest accrual completed', {
        accountsProcessed: updatedCount,
        totalInterestAccrued: totalInterestAccrued.toFixed(2),
        rateDistribution: rateSummary,
        date: new Date().toISOString()
      });

      return {
        success: true,
        accountsProcessed: updatedCount,
        totalInterestAccrued,
        rateDistribution: rateSummary,
        timestamp: new Date()
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Daily deposit interest accrual job failed:', error);
      throw error;
    }
  }

  async updateAccountInterest(account, transaction) {
    let totalInterest = 0;
    const updateData = {};

    // Debit interest (negative ledger balance)
    if (parseFloat(account.LEDGER_BAL) < 0) {
      const lastDebitDate = account.LAST_WITHDRAWL_DT || account.last_debit_date || new Date();
      const daysOutstanding = this.calculateDaysOutstanding(lastDebitDate);
      const debitInterest = await this.calculateAccruedInterest(
        account,
        Math.abs(account.LEDGER_BAL),
        daysOutstanding
      );
      if (debitInterest > 0) {
        updateData.DR_INT_ACCRUED = (account.DR_INT_ACCRUED || 0) + debitInterest;
        updateData.last_debit_date = new Date();
        updateData.days_outstanding = daysOutstanding;
        totalInterest += debitInterest;
      }
    }

    // Credit interest (positive cleared balance)
    if (parseFloat(account.CLEARED_BAL) > 0) {
      const creditInterest = await this.calculateAccruedInterest(account, account.CLEARED_BAL);
      if (creditInterest > 0) {
        updateData.CR_INT_ACCRUED = (account.CR_INT_ACCRUED || 0) + creditInterest;
        totalInterest += creditInterest;
      }
    }

    if (Object.keys(updateData).length > 0) {
      updateData.LAST_INTEREST_UPDATE = new Date();

      const setClauses = [];
      const values = [];
      for (const [key, value] of Object.entries(updateData)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
      values.push(account.ACCT_ID);

      await sequelize.query(`
        UPDATE deposit_account_summary 
        SET ${setClauses.join(', ')}
        WHERE ACCT_ID = ?
      `, {
        replacements: values,
        transaction
      });

      return {
        account: account.ACCT_NO,
        totalInterest,
        accountType: account.ACCOUNT_TYPE || 'SAVINGS'
      };
    }
    return null;
  }

  calculateDaysOutstanding(lastDebitDate) {
    if (!lastDebitDate) return 1;
    const currentDate = new Date();
    const lastDate = new Date(lastDebitDate);
    const timeDiff = currentDate.getTime() - lastDate.getTime();
    const daysOutstanding = Math.ceil(timeDiff / (1000 * 3600 * 24));
    return Math.max(1, daysOutstanding);
  }

  async updateAfterDebitTransaction(ACCT_NO, debitAmount) {
    const transaction = await sequelize.transaction();
    try {
      const [accounts] = await sequelize.query(`
        SELECT * FROM deposit_account_summary 
        WHERE ACCT_NO = ?
        FOR UPDATE
      `, {
        replacements: [ACCT_NO],
        transaction
      });

      if (accounts.length === 0) throw new Error(`Account not found: ${ACCT_NO}`);

      const account = accounts[0];
      const daysOutstanding = this.calculateDaysOutstanding(account.LAST_WITHDRAWL_DT);
      const debitInterest = await this.calculateAccruedInterest(
        account,
        Math.abs(debitAmount),
        daysOutstanding
      );
      const creditInterest = account.CLEARED_BAL > 0
        ? await this.calculateAccruedInterest(account, account.CLEARED_BAL)
        : 0;

      await sequelize.query(`
        UPDATE deposit_account_summary 
        SET DR_INT_ACCRUED = COALESCE(DR_INT_ACCRUED, 0) + ?,
            CR_INT_ACCRUED = COALESCE(CR_INT_ACCRUED, 0) + ?,
            last_debit_date = NOW(),
            days_outstanding = ?,
            LAST_INTEREST_UPDATE = NOW()
        WHERE ACCT_NO = ?
      `, {
        replacements: [debitInterest, creditInterest, daysOutstanding, ACCT_NO],
        transaction
      });

      await transaction.commit();
      logger.info('Deposit account summary updated after debit', {
        account: ACCT_NO,
        debitAmount,
        debitInterest,
        creditInterest,
        daysOutstanding
      });

      return {
        success: true,
        account: ACCT_NO,
        debitInterest,
        creditInterest,
        totalInterest: debitInterest + creditInterest
      };
    } catch (error) {
      await transaction.rollback();
      logger.error('Error updating deposit account after debit:', error);
      throw error;
    }
  }

  clearCache() {
    this.interestRatesCache.clear();
    this.lastCacheUpdate = 0;
    logger.info('Interest rates cache cleared');
  }

  getCacheStatus() {
    return {
      cacheSize: this.interestRatesCache.size,
      lastUpdate: new Date(this.lastCacheUpdate),
      cacheEntries: Object.fromEntries(this.interestRatesCache)
    };
  }
}

// ──────────────────────────────────────────────────────────────
// Singleton & registration
// ──────────────────────────────────────────────────────────────
const depositInterestAccrual = new DepositInterestAccrual();

jobRegistry.registerJob(
  'Deposit Interest Accrual (Dynamic)',
  '0 0 * * *',
  async () => {
    await depositInterestAccrual.updateAllAccountsInterest();
  },
  'Daily interest accrual for deposit accounts with dynamic rates'
);

// ──────────────────────────────────────────────────────────────
// Exports (unchanged)
// ──────────────────────────────────────────────────────────────
export const updateAllAccountsInterest = async () => {
  return await depositInterestAccrual.updateAllAccountsInterest();
};

export const updateAfterDebit = async (ACCT_NO, debitAmount) => {
  return await depositInterestAccrual.updateAfterDebitTransaction(ACCT_NO, debitAmount);
};

export const calculateDailyInterest = async (account, balance, days = 1) => {
  return await depositInterestAccrual.calculateAccruedInterest(account, balance, days);
};

export const clearInterestCache = () => depositInterestAccrual.clearCache();
export const getCacheStatus = () => depositInterestAccrual.getCacheStatus();

export const manualInterestAccrual = async (req, res) => {
  try {
    const result = await depositInterestAccrual.updateAllAccountsInterest();
    res.json({ success: true, message: 'Manual interest accrual completed', data: result });
  } catch (error) {
    logger.error('Manual interest accrual failed:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const updateAfterDebitEndpoint = async (req, res) => {
  try {
    const { ACCT_NO, debitAmount } = req.body;
    if (!ACCT_NO || !debitAmount) {
      return res.status(400).json({ success: false, message: 'ACCT_NO and debitAmount required' });
    }
    const result = await depositInterestAccrual.updateAfterDebitTransaction(ACCT_NO, debitAmount);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Error updating after debit:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const clearCacheEndpoint = async (req, res) => {
  try {
    depositInterestAccrual.clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCacheStatusEndpoint = async (req, res) => {
  try {
    const status = depositInterestAccrual.getCacheStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export default depositInterestAccrual;