import cron from 'node-cron';
import mongoose from 'mongoose';
import DepositAccountSummary from '../models/DepositAccountSummary.js';
import DepositAccountInterest from '../models/DepositAccountInterest.js';
import logger from '../utils/logger.js';

/**
 * Daily deposit interest accrual cron job with dynamic rates
 */
class DepositInterestAccrual {
  constructor() {
    this.interestRatesCache = new Map();
    this.cacheExpiry = 30 * 60 * 1000; // 30 minutes cache
    this.lastCacheUpdate = 0;
  }

  /**
   * Get interest rate for account type from database
   */
  async getInterestRate(accountType, balanceTier = 'DEFAULT') {
    // Check cache first
    const cacheKey = `${accountType}_${balanceTier}`;
    const now = Date.now();
    
    if (this.interestRatesCache.has(cacheKey) && 
        (now - this.lastCacheUpdate) < this.cacheExpiry) {
      return this.interestRatesCache.get(cacheKey);
    }

    try {
      // Fetch interest rate from database
      const interestConfig = await DepositAccountInterest.findOne({
        ACCOUNT_TYPE: accountType,
        BALANCE_TIER: balanceTier,
        STATUS: 'ACTIVE',
        EFFECTIVE_DATE: { $lte: new Date() },
        $or: [
          { EXPIRY_DATE: { $gte: new Date() } },
          { EXPIRY_DATE: null }
        ]
      }).sort({ EFFECTIVE_DATE: -1 }); // Get the latest effective rate

      let annualRate = 0.05; // Default 5% if no rate found

      if (interestConfig) {
        annualRate = parseFloat(interestConfig.ANNUAL_RATE) || 0.05;
        logger.debug(`Found interest rate for ${accountType}/${balanceTier}: ${annualRate}%`);
      } else {
        logger.warn(`No interest rate found for ${accountType}/${balanceTier}, using default 5%`);
      }

      const dailyRate = annualRate / 100 / 365; // Convert annual percentage to daily decimal
      
      // Update cache
      this.interestRatesCache.set(cacheKey, dailyRate);
      this.lastCacheUpdate = now;

      return dailyRate;

    } catch (error) {
      logger.error(`Error fetching interest rate for ${accountType}:`, error);
      // Return default rate on error
      return 0.05 / 100 / 365;
    }
  }

  /**
   * Determine balance tier based on account balance
   */
  getBalanceTier(balance) {
    if (balance >= 100000) return 'PREMIUM';
    if (balance >= 50000) return 'GOLD';
    if (balance >= 10000) return 'SILVER';
    return 'STANDARD';
  }

  /**
   * Calculate accrued interest based on balance, account type, and days
   */
  async calculateAccruedInterest(account, balance, days = 1) {
    if (!balance || balance <= 0) return 0;
    
    try {
      const accountType = account.ACCOUNT_TYPE || 'SAVINGS';
      const balanceTier = this.getBalanceTier(balance);
      const dailyRate = await this.getInterestRate(accountType, balanceTier);
      
      const interest = balance * dailyRate * days;
      return Math.round(interest * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      logger.error(`Error calculating interest for account ${account.ACCT_NO}:`, error);
      return 0;
    }
  }

  /**
   * Update interest accrued for all deposit accounts with dynamic rates
   */
  async updateAllAccountsInterest() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      logger.info('Starting daily deposit interest accrual job with dynamic rates');

      const depositAccounts = await DepositAccountSummary.find({
        STATUS: 'ACTIVE'
      }).session(session);

      let updatedCount = 0;
      let totalInterestAccrued = 0;
      const rateSummary = {};

      for (const account of depositAccounts) {
        try {
          const result = await this.updateAccountInterest(account, session);
          if (result) {
            updatedCount++;
            totalInterestAccrued += result.totalInterest;
            
            // Track rates used
            const accountType = account.ACCOUNT_TYPE || 'SAVINGS';
            rateSummary[accountType] = (rateSummary[accountType] || 0) + 1;
          }
        } catch (accountError) {
          logger.error(`Error updating interest for account ${account.ACCT_NO}:`, accountError);
          // Continue with other accounts
        }
      }

      await session.commitTransaction();
      
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
      await session.abortTransaction();
      logger.error('Daily deposit interest accrual job failed:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Update interest for a single account with dynamic rates
   */
  async updateAccountInterest(account, session = null) {
    const updateData = {};
    let totalInterest = 0;

    // Calculate debit interest (DR_INT_ACCRUED) - for overdrafts/negative balances
    if (account.LEDGER_BAL < 0) {
      const daysOutstanding = this.calculateDaysOutstanding(account.last_debit_date);
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

    // Calculate credit interest (CR_INT_ACCRUED) - for positive balances
    if (account.CLEARED_BAL > 0) {
      const creditInterest = await this.calculateAccruedInterest(account, account.CLEARED_BAL);
      
      if (creditInterest > 0) {
        updateData.CR_INT_ACCRUED = (account.CR_INT_ACCRUED || 0) + creditInterest;
        totalInterest += creditInterest;
      }
    }

    // Update account if there's interest to accrue
    if (Object.keys(updateData).length > 0) {
      updateData.LAST_INTEREST_UPDATE = new Date();
      
      const options = session ? { session } : {};
      await DepositAccountSummary.findByIdAndUpdate(
        account._id, 
        { $set: updateData },
        options
      );

      return { 
        account: account.ACCT_NO, 
        totalInterest,
        accountType: account.ACCOUNT_TYPE || 'SAVINGS'
      };
    }

    return null;
  }

  /**
   * Calculate days outstanding since last debit
   */
  calculateDaysOutstanding(lastDebitDate) {
    if (!lastDebitDate) return 1;
    
    const currentDate = new Date();
    const lastDate = new Date(lastDebitDate);
    const timeDiff = currentDate.getTime() - lastDate.getTime();
    const daysOutstanding = Math.ceil(timeDiff / (1000 * 3600 * 24));
    
    return Math.max(1, daysOutstanding); // Minimum 1 day
  }

  /**
   * Update account summary after debit transaction with dynamic rates
   */
  async updateAfterDebitTransaction(ACCT_NO, debitAmount) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const account = await DepositAccountSummary.findOne({ ACCT_NO }).session(session);

      if (!account) {
        throw new Error(`Account not found: ${ACCT_NO}`);
      }

      // Calculate days since last debit
      const daysOutstanding = this.calculateDaysOutstanding(account.last_debit_date);
      
      // Calculate debit interest with dynamic rate
      const debitInterest = await this.calculateAccruedInterest(
        account,
        Math.abs(debitAmount), 
        daysOutstanding
      );

      // Calculate credit interest for cleared balance with dynamic rate
      const creditInterest = account.CLEARED_BAL > 0 ? 
        await this.calculateAccruedInterest(account, account.CLEARED_BAL) : 0;

      // Update account
      const updateData = {
        DR_INT_ACCRUED: (account.DR_INT_ACCRUED || 0) + debitInterest,
        CR_INT_ACCRUED: (account.CR_INT_ACCRUED || 0) + creditInterest,
        last_debit_date: new Date(),
        days_outstanding: daysOutstanding,
        LAST_INTEREST_UPDATE: new Date()
      };

      await DepositAccountSummary.findByIdAndUpdate(
        account._id, 
        { $set: updateData },
        { session }
      );

      await session.commitTransaction();

      logger.info('Deposit account summary updated after debit', {
        account: ACCT_NO,
        accountType: account.ACCOUNT_TYPE || 'SAVINGS',
        debitAmount,
        debitInterest,
        creditInterest,
        daysOutstanding
      });

      return {
        success: true,
        account: ACCT_NO,
        accountType: account.ACCOUNT_TYPE || 'SAVINGS',
        debitInterest,
        creditInterest,
        totalInterest: debitInterest + creditInterest
      };

    } catch (error) {
      await session.abortTransaction();
      logger.error('Error updating deposit account after debit:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  /**
   * Clear interest rates cache (useful for testing or when rates change)
   */
  clearCache() {
    this.interestRatesCache.clear();
    this.lastCacheUpdate = 0;
    logger.info('Interest rates cache cleared');
  }

  /**
   * Get current cache status
   */
  getCacheStatus() {
    return {
      cacheSize: this.interestRatesCache.size,
      lastUpdate: new Date(this.lastCacheUpdate),
      cacheEntries: Object.fromEntries(this.interestRatesCache)
    };
  }
}

// Create singleton instance
const depositInterestAccrual = new DepositInterestAccrual();

// Daily cron job - runs at midnight every day
cron.schedule('0 0 * * *', async () => {
  try {
    logger.info('Executing scheduled deposit interest accrual job');
    const result = await depositInterestAccrual.updateAllAccountsInterest();
    logger.info('Scheduled deposit interest accrual completed', result);
  } catch (error) {
    logger.error('Scheduled deposit interest accrual job failed:', error);
  }
});

// Export functions
export const updateAllAccountsInterest = async () => {
  return await depositInterestAccrual.updateAllAccountsInterest();
};

export const updateAfterDebit = async (ACCT_NO, debitAmount) => {
  return await depositInterestAccrual.updateAfterDebitTransaction(ACCT_NO, debitAmount);
};

export const calculateDailyInterest = async (account, balance, days = 1) => {
  return await depositInterestAccrual.calculateAccruedInterest(account, balance, days);
};

export const clearInterestCache = () => {
  return depositInterestAccrual.clearCache();
};

export const getCacheStatus = () => {
  return depositInterestAccrual.getCacheStatus();
};

// HTTP endpoint for manual trigger
export const manualInterestAccrual = async (req, res) => {
  try {
    const result = await depositInterestAccrual.updateAllAccountsInterest();
    
    res.json({
      success: true,
      message: 'Manual interest accrual completed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Manual interest accrual failed:', error);
    res.status(500).json({
      success: false,
      message: 'Manual interest accrual failed',
      error: error.message
    });
  }
};

// HTTP endpoint for debit transaction update
export const updateAfterDebitEndpoint = async (req, res) => {
  try {
    const { ACCT_NO, debitAmount } = req.body;

    if (!ACCT_NO || !debitAmount) {
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO and debitAmount are required'
      });
    }

    const result = await depositInterestAccrual.updateAfterDebitTransaction(ACCT_NO, debitAmount);
    
    res.json({
      success: true,
      message: 'Account updated successfully after debit transaction',
      data: result
    });
  } catch (error) {
    logger.error('Error updating account after debit:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update account after debit transaction',
      error: error.message
    });
  }
};

// HTTP endpoint to clear cache
export const clearCacheEndpoint = async (req, res) => {
  try {
    depositInterestAccrual.clearCache();
    
    res.json({
      success: true,
      message: 'Interest rates cache cleared successfully'
    });
  } catch (error) {
    logger.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cache',
      error: error.message
    });
  }
};

// HTTP endpoint to get cache status
export const getCacheStatusEndpoint = async (req, res) => {
  try {
    const cacheStatus = depositInterestAccrual.getCacheStatus();
    
    res.json({
      success: true,
      data: cacheStatus
    });
  } catch (error) {
    logger.error('Error getting cache status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get cache status',
      error: error.message
    });
  }
};

export default depositInterestAccrual;