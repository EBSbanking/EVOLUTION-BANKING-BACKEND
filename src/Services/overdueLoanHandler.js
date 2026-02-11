// src/services/overdueLoanHandler.js
import { Op } from 'sequelize';
import { getLoanAccount, ensureModelsInitialized } from '../utils/modelHelper.js';
import logger from '../utils/logger.js';

/**
 * Identify and update all overdue loans
 */
export const checkOverdueLoans = async () => {
  try {
    // Initialize models if needed
    await ensureModelsInitialized();
    
    // Get LoanAccount model
    const LoanAccount = await getLoanAccount();
    
    if (!LoanAccount || typeof LoanAccount.findAll !== 'function') {
      logger.error('❌ LoanAccount model not properly loaded');
      throw new Error('LoanAccount model not available or findAll not a function');
    }
    
    // Ensure table exists
    if (typeof LoanAccount.ensureTableExists === 'function') {
      await LoanAccount.ensureTableExists();
    }
    
    const today = new Date();
    
    // Find loans that are due but not paid
    const dueLoans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
        [Op.and]: [
          { OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 } },
          {
            [Op.or]: [
              { NEXT_PAYMENT_DATE: { [Op.lt]: today } },
              { 
                [Op.and]: [
                  { NEXT_PAYMENT_DATE: { [Op.lte]: today } },
                  { hasRepaymentSchedule: true }
                ]
              }
            ]
          }
        ]
      }
    });

    if (!dueLoans || dueLoans.length === 0) {
      logger.info('[Overdue Handler] No overdue loans found.');
      return {
        success: true,
        count: 0,
        message: 'No overdue loans found',
        timestamp: new Date().toISOString(),
        results: {
          overdueLoans: {
            accounts: [],
            count: 0
          },
          statusUpdates: {
            count: 0
          }
        }
      };
    }

    const updatedLoans = [];
    
    // Update each loan to overdue status
    for (const loan of dueLoans) {
      try {
        await loan.update({
          LOAN_STATUS: 'OVERDUE',
          updatedAt: new Date()
        });
        
        updatedLoans.push({
          id: loan.id,
          ACCT_NO: loan.ACCT_NO,
          CUST_ID: loan.CUST_ID,
          previousStatus: loan.LOAN_STATUS,
          dueDate: loan.NEXT_PAYMENT_DATE,
          outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL
        });
        
        logger.info(`Loan marked overdue: ${loan.ACCT_NO}`);
      } catch (updateError) {
        logger.error(`Failed to update loan ${loan.ACCT_NO}:`, updateError.message);
      }
    }

    logger.info(`[Overdue Handler] ${updatedLoans.length} loans marked as overdue.`);

    return {
      success: true,
      count: updatedLoans.length,
      updatedLoans,
      message: `${updatedLoans.length} loans marked as overdue`,
      timestamp: new Date().toISOString(),
      results: {
        overdueLoans: {
          accounts: updatedLoans,
          count: updatedLoans.length
        },
        statusUpdates: {
          count: updatedLoans.length
        }
      }
    };
  } catch (error) {
    logger.error('[Overdue Handler] Error:', error.message, error.stack);
    return {
      success: false,
      message: 'Error occurred while processing overdue loans',
      error: error.message,
      timestamp: new Date().toISOString(),
      results: {
        overdueLoans: {
          accounts: [],
          count: 0
        },
        statusUpdates: {
          count: 0
        }
      }
    };
  }
};

/**
 * Returns all loans currently marked as 'OVERDUE'
 */
export const getOverdueLoans = async () => {
  try {
    await ensureModelsInitialized();
    const LoanAccount = await getLoanAccount();
    
    const loans = await LoanAccount.findAll({
      where: { LOAN_STATUS: 'OVERDUE' },
      raw: true
    });
    
    return loans;
  } catch (error) {
    logger.error('Error retrieving overdue loans:', error.message, error.stack);
    throw error;
  }
};

/**
 * Fallback processor to manually scan overdue loans
 */
export const processOverdueLoans = async () => {
  try {
    await ensureModelsInitialized();
    const LoanAccount = await getLoanAccount();
    
    const today = new Date();

    const activeLoans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
        NEXT_PAYMENT_DATE: { [Op.lt]: today },
        OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 }
      }
    });

    const updated = [];

    for (const loan of activeLoans) {
      try {
        // Check if loan is actually overdue
        if (loan.NEXT_PAYMENT_DATE && new Date(loan.NEXT_PAYMENT_DATE) < today) {
          await loan.update({
            LOAN_STATUS: 'OVERDUE',
            updatedAt: new Date()
          });
          
          updated.push(loan.ACCT_NO);
          logger.info(`Loan ${loan.ACCT_NO} marked overdue manually`);
        }
      } catch (updateError) {
        logger.error(`Failed to update loan ${loan.ACCT_NO}:`, updateError.message);
      }
    }

    logger.info(`[Service] ${updated.length} loans marked as overdue manually.`);

    return {
      success: true,
      count: updated.length,
      updatedAccounts: updated,
      message: 'Manual overdue processing completed',
      timestamp: new Date().toISOString(),
      results: {
        overdueLoans: {
          accounts: updated.map(acc => ({ ACCT_NO: acc })),
          count: updated.length
        },
        statusUpdates: {
          count: updated.length
        }
      }
    };
  } catch (error) {
    logger.error('Manual overdue loan processor error:', error.message, error.stack);
    return {
      success: false,
      error: error.message,
      results: {
        overdueLoans: {
          accounts: [],
          count: 0
        },
        statusUpdates: {
          count: 0
        }
      }
    };
  }
};

// Backward compatibility - also handle the service call that expects "loanProcessing"
export const loanProcessing = async () => {
  try {
    logger.info('🚀 Starting loan processing (via overdue handler)...');
    const result = await checkOverdueLoans();
    return {
      ...result,
      // Ensure the structure matches what EOD expects
      success: result.success || false,
      result: result
    };
  } catch (error) {
    logger.error('Loan processing failed:', error.message);
    return {
      success: false,
      error: error.message,
      results: {
        overdueLoans: {
          accounts: [],
          count: 0
        },
        statusUpdates: {
          count: 0
        }
      }
    };
  }
};

export default {
  checkOverdueLoans,
  getOverdueLoans,
  processOverdueLoans,
  loanProcessing // Add this for backward compatibility
};