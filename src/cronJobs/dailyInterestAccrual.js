import connection from '../../config/db.js'; // Your MySQL connection
import { createGLAccountTransaction } from '../controllers/GLAccountTransactionController.js';
import logger from '../utils/logger.js';

/**
 * Daily interest accrual service for term deposits
 */
class DailyInterestAccrual {
  constructor() {
    this.today = new Date();
    this.connection = connection;
  }

  /**
   * Accrue daily interest for all active term deposits
   */
  async accrueDailyInterest() {
    const conn = await this.connection.getConnection();
    
    try {
      await conn.beginTransaction();
      logger.info('Starting daily term deposit interest accrual');

      const [termDeposits] = await conn.execute(`
        SELECT * FROM term_deposits 
        WHERE START_DT <= ? 
          AND MATURITY_DT >= ? 
          AND STATUS = 'ACTIVE'
        FOR UPDATE
      `, [this.today, this.today]);

      let totalAccrued = 0;
      let processedDeposits = 0;
      let failedDeposits = 0;

      for (const td of termDeposits) {
        try {
          const accruedAmount = await this.accrueInterestForTermDeposit(td, conn);
          if (accruedAmount > 0) {
            totalAccrued += accruedAmount;
            processedDeposits++;
          }
        } catch (tdError) {
          failedDeposits++;
          logger.error(`Error accruing interest for term deposit ${td.ACCT_NO}:`, tdError);
          // Continue with other term deposits
        }
      }

      await conn.commit();
      
      logger.info('Daily term deposit interest accrual completed', {
        totalProcessed: processedDeposits,
        failedCount: failedDeposits,
        totalAccrued: totalAccrued.toFixed(2),
        date: this.today.toISOString().split('T')[0]
      });

      return {
        success: true,
        processedDeposits,
        failedDeposits,
        totalAccrued,
        date: this.today
      };

    } catch (error) {
      await conn.rollback();
      logger.error('Daily term deposit interest accrual failed:', error);
      throw error;
    } finally {
      conn.release();
    }
  }

  /**
   * Accrue interest for a single term deposit
   */
  async accrueInterestForTermDeposit(td, conn) {
    // Validate required fields
    if (!td.NOTICE_AMOUNT || !td.EFFECTIVE_RATE) {
      throw new Error(`Missing required fields for term deposit ${td.ACCT_NO}`);
    }

    const principal = parseFloat(td.NOTICE_AMOUNT);
    const annualRate = parseFloat(td.EFFECTIVE_RATE);
    const accrualBasis = parseInt(td.ACCRUAL_BASIS) || 365; // Default to 365

    // Validate numeric values
    if (isNaN(principal) || principal <= 0) {
      throw new Error(`Invalid principal amount for term deposit ${td.ACCT_NO}`);
    }
    if (isNaN(annualRate) || annualRate <= 0) {
      throw new Error(`Invalid interest rate for term deposit ${td.ACCT_NO}`);
    }
    if (isNaN(accrualBasis) || accrualBasis <= 0) {
      throw new Error(`Invalid accrual basis for term deposit ${td.ACCT_NO}`);
    }

    // Calculate daily interest
    const dailyInterest = (principal * (annualRate / 100)) / accrualBasis;
    const roundedInterest = Math.round(dailyInterest * 100) / 100; // Round to 2 decimal places

    if (roundedInterest <= 0) {
      return 0;
    }

    // Update accrued interest on term deposit
    const currentAccrued = parseFloat(td.ACCRUED_INTEREST || 0);
    const newAccrued = (currentAccrued + roundedInterest).toFixed(2);
    
    await conn.execute(`
      UPDATE term_deposits 
      SET ACCRUED_INTEREST = ?, 
          LAST_ACCRUAL_DATE = ?
      WHERE ACCT_NO = ? AND STATUS = 'ACTIVE'
    `, [newAccrued, this.today, td.ACCT_NO]);

    // Create GL transaction for interest accrual
    if (td.INTEREST_GL_ACCT_NO) {
      await createGLAccountTransaction({
        debitAccount: td.ACCT_NO, // TD Account
        creditAccount: td.INTEREST_GL_ACCT_NO, // TD Interest Holding GL
        amount: roundedInterest,
        description: `Daily interest accrual for Term Deposit ${td.ACCT_NO}`,
        txnId: `DAILY_INT_${td.id}_${this.today.toISOString().slice(0, 10)}`,
        transactionDate: this.today,
        currency: td.CURRENCY || 'USD',
        businessUnit: td.BUSINESS_UNIT,
        createdBy: 'SYSTEM_ACCRUAL'
      }, conn);
    } else {
      logger.warn(`No interest GL account configured for term deposit ${td.ACCT_NO}`);
    }

    logger.debug(`Accrued interest ${roundedInterest.toFixed(2)} for TD: ${td.ACCT_NO}`);
    return roundedInterest;
  }

  /**
   * Get accrual summary for reporting
   */
  async getAccrualSummary() {
    const today = new Date();
    const conn = await this.connection.getConnection();
    
    try {
      const [summary] = await conn.execute(`
        SELECT 
          COUNT(*) as totalDeposits,
          COALESCE(SUM(NOTICE_AMOUNT), 0) as totalPrincipal,
          COALESCE(SUM(ACCRUED_INTEREST), 0) as totalAccruedInterest,
          COALESCE(AVG(EFFECTIVE_RATE), 0) as avgInterestRate
        FROM term_deposits
        WHERE START_DT <= ? 
          AND MATURITY_DT >= ? 
          AND STATUS = 'ACTIVE'
      `, [today, today]);

      return summary[0] || {
        totalDeposits: 0,
        totalPrincipal: 0,
        totalAccruedInterest: 0,
        avgInterestRate: 0
      };
    } finally {
      conn.release();
    }
  }

  /**
   * Manual accrual for specific term deposit
   */
  async manualAccrualForDeposit(acctNo) {
    const conn = await this.connection.getConnection();
    
    try {
      await conn.beginTransaction();

      const [termDeposits] = await conn.execute(`
        SELECT * FROM term_deposits 
        WHERE ACCT_NO = ? AND STATUS = 'ACTIVE'
        FOR UPDATE
      `, [acctNo]);

      if (termDeposits.length === 0) {
        throw new Error(`Active term deposit not found: ${acctNo}`);
      }

      const termDeposit = termDeposits[0];
      const accruedAmount = await this.accrueInterestForTermDeposit(termDeposit, conn);
      
      await conn.commit();

      logger.info(`Manual interest accrual completed for term deposit ${acctNo}`, {
        amount: accruedAmount,
        date: this.today
      });

      return {
        success: true,
        account: acctNo,
        accruedAmount,
        date: this.today
      };

    } catch (error) {
      await conn.rollback();
      logger.error(`Manual accrual failed for term deposit ${acctNo}:`, error);
      throw error;
    } finally {
      conn.release();
    }
  }
}

// Create singleton instance
const dailyInterestAccrual = new DailyInterestAccrual();

// Export functions
export const accrueDailyInterest = async () => {
  return await dailyInterestAccrual.accrueDailyInterest();
};

export const getAccrualSummary = async () => {
  return await dailyInterestAccrual.getAccrualSummary();
};

export const manualAccrualForDeposit = async (acctNo) => {
  return await dailyInterestAccrual.manualAccrualForDeposit(acctNo);
};

// HTTP endpoint for manual trigger
export const manualAccrualEndpoint = async (req, res) => {
  try {
    const { acctNo } = req.body;
    
    let result;
    if (acctNo) {
      // Accrue for specific account
      result = await dailyInterestAccrual.manualAccrualForDeposit(acctNo);
    } else {
      // Accrue for all accounts
      result = await dailyInterestAccrual.accrueDailyInterest();
    }

    res.json({
      success: true,
      message: acctNo ? 
        `Manual accrual completed for account ${acctNo}` : 
        'Manual accrual completed for all term deposits',
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

// HTTP endpoint for accrual summary
export const getAccrualSummaryEndpoint = async (req, res) => {
  try {
    const summary = await dailyInterestAccrual.getAccrualSummary();
    
    res.json({
      success: true,
      data: summary
    });
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