// src/Services/repaymentHandler.js - UPDATED SEQUELIZE VERSION
import { Op } from 'sequelize';
import sequelize  from '../../config/db.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import GLAccount from '../models/GLAccount.js';
import logger from '../utils/logger.js';

/**
 * Process pending loan repayments
 */
export const processPendingRepayments = async () => {
  let transaction;
  
  try {
    logger.info('🔄 Processing pending loan repayments...');
    
    transaction = await sequelize.transaction();
    
    // Find all pending repayments that are due
    const pendingRepayments = await LoanRepayment.findAll({
      where: {
        status: 'PENDING',
        date: {
          [Op.lte]: new Date()
        }
      },
      transaction
    });

    const results = {
      processed: [],
      failed: [],
      skipped: []
    };

    logger.info(`Found ${pendingRepayments.length} pending repayments to process`);

    if (pendingRepayments.length === 0) {
      await transaction.commit();
      return {
        success: true,
        count: 0,
        ...results
      };
    }

    // Process each pending repayment
    for (const repayment of pendingRepayments) {
      try {
        // Check if repayment can be processed
        const canProcess = await validateRepayment(repayment, transaction);
        
        if (!canProcess.valid) {
          results.skipped.push({
            repaymentId: repayment.id,
            accountNo: repayment.ACCT_NO,
            reason: canProcess.reason
          });
          continue;
        }

        // Process the repayment
        const processResult = await processRepayment(repayment, transaction);
        
        if (processResult.success) {
          // Update repayment status
          await repayment.update({
            status: 'COMPLETED',
            updatedAt: new Date()
          }, { transaction });
          
          results.processed.push({
            repaymentId: repayment.id,
            accountNo: repayment.ACCT_NO,
            amount: repayment.amount,
            reference: repayment.reference
          });
          
          logger.info(`✅ Processed repayment ${repayment.reference} for account ${repayment.ACCT_NO}`);
        } else {
          // Mark as failed
          await repayment.update({
            status: 'FAILED',
            description: processResult.error || 'Processing failed'
          }, { transaction });
          
          results.failed.push({
            repaymentId: repayment.id,
            accountNo: repayment.ACCT_NO,
            error: processResult.error
          });
          
          logger.warn(`❌ Failed to process repayment ${repayment.reference}: ${processResult.error}`);
        }
      } catch (error) {
        // Mark as failed on error
        await repayment.update({
          status: 'FAILED',
          description: error.message || 'Processing error'
        }, { transaction });
        
        results.failed.push({
          repaymentId: repayment.id,
          accountNo: repayment.ACCT_NO,
          error: error.message
        });
        
        logger.error(`❌ Error processing repayment ${repayment.id}:`, { error: error.message });
      }
    }

    await transaction.commit();
    
    logger.info('✅ Pending repayments processing completed', {
      processed: results.processed.length,
      failed: results.failed.length,
      skipped: results.skipped.length
    });
    
    return {
      success: true,
      count: results.processed.length,
      ...results
    };
    
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    
    logger.error('❌ Failed to process pending repayments', { error: error.message });
    throw error;
  }
};

/**
 * Validate if a repayment can be processed
 */
const validateRepayment = async (repayment, transaction) => {
  try {
    // Check if loan account exists and is active
    const loanAccount = await LoanAccount.findOne({
      where: { 
        ACCT_NO: repayment.ACCT_NO,
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED'] }
      },
      transaction
    });

    if (!loanAccount) {
      return {
        valid: false,
        reason: 'Loan account not found or not active'
      };
    }

    // Check if customer account exists and has sufficient balance
    const customerAccount = await CustomerAccount.findOne({
      where: { 
        account_number: repayment.customerAccountNo,
        REC_ST: 'ACTIVE'
      },
      transaction
    });

    if (!customerAccount) {
      return {
        valid: false,
        reason: 'Customer account not found or not active'
      };
    }

    // Check if customer has sufficient balance
    const availableBalance = parseFloat(customerAccount.AVAILABLE_BALANCE || 0);
    const repaymentAmount = parseFloat(repayment.amount || 0);
    
    if (availableBalance < repaymentAmount) {
      return {
        valid: false,
        reason: 'Insufficient balance in customer account'
      };
    }

    return {
      valid: true,
      loanAccount,
      customerAccount
    };
  } catch (error) {
    logger.error(`Error validating repayment ${repayment.id}:`, error);
    return {
      valid: false,
      reason: `Validation error: ${error.message}`
    };
  }
};

/**
 * Process a single repayment
 */
const processRepayment = async (repayment, transaction) => {
  try {
    const validation = await validateRepayment(repayment, transaction);
    
    if (!validation.valid) {
      return {
        success: false,
        error: validation.reason
      };
    }

    const { loanAccount, customerAccount } = validation;
    const repaymentAmount = parseFloat(repayment.amount || 0);
    
    // 1. Deduct from customer account
    const newCustomerBalance = parseFloat(customerAccount.AVAILABLE_BALANCE || 0) - repaymentAmount;
    await customerAccount.update({
      AVAILABLE_BALANCE: newCustomerBalance,
      ledger_balance: newCustomerBalance,
      lastActivityDate: new Date()
    }, { transaction });

    // 2. Update loan account balances
    const outstandingPrincipal = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const accruedInterest = parseFloat(loanAccount.ACCRUED_INTEREST || 0);
    const penaltyAmount = parseFloat(loanAccount.PENALTY_AMOUNT || 0);
    
    // Allocate payment (simplified: first to penalty, then interest, then principal)
    let remainingAmount = repaymentAmount;
    
    // Pay penalty first
    const penaltyPaid = Math.min(penaltyAmount, remainingAmount);
    const newPenalty = penaltyAmount - penaltyPaid;
    remainingAmount -= penaltyPaid;
    
    // Then pay interest
    const interestPaid = Math.min(accruedInterest, remainingAmount);
    const newInterest = accruedInterest - interestPaid;
    remainingAmount -= interestPaid;
    
    // Finally pay principal
    const principalPaid = Math.min(outstandingPrincipal, remainingAmount);
    const newPrincipal = outstandingPrincipal - principalPaid;
    
    // Update loan account
    const updateData = {
      OUTSTANDING_PRINCIPAL: newPrincipal,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      TOTAL_REPAID_AMOUNT: (parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0) + repaymentAmount),
      LAST_REPAYMENT_DATE: new Date(),
      LAST_REPAYMENT_AMOUNT: repaymentAmount,
      LAST_PAYMENT_METHOD: repayment.paymentMethod || 'BANK_TRANSFER'
    };
    
    // Update next payment date if needed
    if (loanAccount.NEXT_PAYMENT_DATE) {
      updateData.NEXT_PAYMENT_DATE = calculateNextPaymentDate(loanAccount, new Date());
    }
    
    // Mark as paid if fully settled
    if (newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0) {
      updateData.LOAN_STATUS = 'PAID';
      updateData.CLOSURE_DATE = new Date();
    }
    
    await loanAccount.update(updateData, { transaction });

    // 3. Create GL transaction if GLAccount model exists
    await createGLTransaction(repayment, loanAccount, customerAccount, transaction);

    return {
      success: true,
      amount: repaymentAmount,
      principalPaid,
      interestPaid,
      penaltyPaid
    };
    
  } catch (error) {
    logger.error(`Error processing repayment ${repayment.id}:`, error);
    return {
      success: false,
      error: error.message
    };
  }
};

/**
 * Create GL transaction (if you have a GLAccount model)
 */
const createGLTransaction = async (repayment, loanAccount, customerAccount, transaction) => {
  try {
    if (!GLAccount) {
      logger.info('GLAccount model not available, skipping GL entry');
      return;
    }

    // Create debit entry (customer account to loan receivable)
    await GLAccount.create({
      account_number: customerAccount.account_number,
      amount: repayment.amount,
      transaction_type: 'DEBIT',
      date: new Date(),
      description: `Loan repayment for account ${repayment.ACCT_NO}`,
      reference: repayment.reference,
      status: 'COMPLETED'
    }, { transaction });

    // Create credit entry (loan receivable)
    await GLAccount.create({
      account_number: 'LOAN_RECEIVABLE', // Your GL account for loans
      amount: repayment.amount,
      transaction_type: 'CREDIT',
      date: new Date(),
      description: `Loan repayment received for ${repayment.ACCT_NO}`,
      reference: repayment.reference,
      status: 'COMPLETED'
    }, { transaction });

    logger.info(`✅ GL transactions created for repayment ${repayment.reference}`);
  } catch (error) {
    logger.error('Error creating GL transaction:', error);
    // Don't throw error - GL transaction is optional
  }
};

/**
 * Loan repayment service (for manual repayments)
 */
export const repayLoanService = async (loanAcctNo, amount, depositAcctNo) => {
  let transaction;
  
  try {
    if (!loanAcctNo || !depositAcctNo || !amount || amount <= 0) {
      throw new Error('Invalid repayment request: loanAcctNo, depositAcctNo, and positive amount are required');
    }

    transaction = await sequelize.transaction();

    const loanAccount = await LoanAccount.findOne({ 
      where: { ACCT_NO: loanAcctNo },
      transaction
    });
    
    if (!loanAccount) {
      throw new Error('Loan account not found');
    }

    const customerDeposit = await CustomerAccount.findOne({ 
      where: { account_number: depositAcctNo },
      transaction
    });
    
    if (!customerDeposit) {
      throw new Error('Customer deposit account not found');
    }

    // Check if customer owns this loan
    if (loanAccount.CUST_ID !== customerDeposit.customer_id?.toString()) {
      throw new Error('Customer does not own this loan');
    }

    // Check outstanding balance
    const outstandingBalance = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0) + 
                              parseFloat(loanAccount.ACCRUED_INTEREST || 0) + 
                              parseFloat(loanAccount.PENALTY_AMOUNT || 0);
    
    if (outstandingBalance <= 0) {
      throw new Error('No outstanding loan balance to repay');
    }

    if (amount > outstandingBalance) {
      throw new Error(`Repayment amount exceeds outstanding loan balance. Maximum: ${outstandingBalance}`);
    }

    // Check deposit balance
    const availableBalance = parseFloat(customerDeposit.AVAILABLE_BALANCE || 0);
    if (availableBalance < amount) {
      throw new Error(`Insufficient funds in deposit account. Available: ${availableBalance}, Required: ${amount}`);
    }

    // Debit deposit account
    const newDepositBalance = availableBalance - amount;
    await customerDeposit.update({
      AVAILABLE_BALANCE: newDepositBalance,
      ledger_balance: newDepositBalance,
      cleared_balance: newDepositBalance,
      lastActivityDate: new Date()
    }, { transaction });

    // Allocate payment to loan account
    let remainingAmount = amount;
    
    // Pay penalty first
    const penaltyAmount = parseFloat(loanAccount.PENALTY_AMOUNT || 0);
    const penaltyPaid = Math.min(penaltyAmount, remainingAmount);
    const newPenalty = penaltyAmount - penaltyPaid;
    remainingAmount -= penaltyPaid;
    
    // Then pay interest
    const interestAmount = parseFloat(loanAccount.ACCRUED_INTEREST || 0);
    const interestPaid = Math.min(interestAmount, remainingAmount);
    const newInterest = interestAmount - interestPaid;
    remainingAmount -= interestPaid;
    
    // Finally pay principal
    const principalAmount = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const principalPaid = Math.min(principalAmount, remainingAmount);
    const newPrincipal = principalAmount - principalPaid;
    
    // Update loan account
    const updateData = {
      OUTSTANDING_PRINCIPAL: newPrincipal,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      TOTAL_REPAID_AMOUNT: (parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0) + amount),
      LAST_REPAYMENT_DATE: new Date(),
      LAST_REPAYMENT_AMOUNT: amount,
      LAST_PAYMENT_METHOD: 'MANUAL'
    };
    
    if (newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0) {
      updateData.LOAN_STATUS = 'PAID';
      updateData.CLOSURE_DATE = new Date();
    }
    
    await loanAccount.update(updateData, { transaction });

    // Record repayment
    const repayment = await LoanRepayment.create({
      ACCT_NO: loanAcctNo,
      amount: amount,
      date: new Date(),
      CUST_ID: loanAccount.CUST_ID,
      customerAccountNo: depositAcctNo,
      paymentMethod: 'MANUAL',
      status: 'COMPLETED',
      reference: `REPAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      description: `Manual loan repayment from deposit account ${depositAcctNo}`
    }, { transaction });

    // Create GL transactions
    await createGLTransaction(repayment, loanAccount, customerDeposit, transaction);

    await transaction.commit();

    logger.info(`✅ Loan repayment processed for account ${loanAcctNo}`, {
      amount,
      principalPaid,
      interestPaid,
      penaltyPaid,
      newBalance: newPrincipal + newInterest + newPenalty
    });

    return {
      success: true,
      message: 'Loan repayment successful',
      repaymentId: repayment.id,
      reference: repayment.reference,
      loanAccount: {
        accountNo: loanAccount.ACCT_NO,
        previousBalance: outstandingBalance,
        newBalance: newPrincipal + newInterest + newPenalty,
        remainingPrincipal: newPrincipal,
        remainingInterest: newInterest,
        remainingPenalty: newPenalty
      },
      depositAccount: {
        accountNo: depositAcctNo,
        previousBalance: availableBalance,
        newBalance: newDepositBalance
      },
      allocation: {
        principalPaid,
        interestPaid,
        penaltyPaid,
        totalPaid: amount
      }
    };

  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    
    logger.error('❌ Loan repayment failed:', { error: error.message });
    throw error;
  }
};

/**
 * Calculate next payment date
 */
const calculateNextPaymentDate = (loanAccount, currentDate) => {
  const nextDate = new Date(currentDate);
  const termCd = loanAccount.TERM_CD || 'MONTHLY';
  const termValue = loanAccount.TERM_VALUE || 1;
  
  switch (termCd) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + termValue);
      break;
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + (7 * termValue));
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + termValue);
      break;
    case 'QUARTERLY':
      nextDate.setMonth(nextDate.getMonth() + (3 * termValue));
      break;
    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + termValue);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  return nextDate;
};

/**
 * Get repayment statistics
 */
export const getRepaymentStatistics = async (startDate, endDate) => {
  try {
    const stats = await LoanRepayment.findAll({
      where: {
        date: {
          [Op.between]: [startDate, endDate]
        },
        status: 'COMPLETED'
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalRepayments'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('amount')), 'averageAmount'],
        [sequelize.fn('DATE', sequelize.col('date')), 'repaymentDate']
      ],
      group: [sequelize.fn('DATE', sequelize.col('date'))],
      order: [[sequelize.fn('DATE', sequelize.col('date')), 'DESC']]
    });

    const paymentMethodStats = await LoanRepayment.findAll({
      where: {
        date: {
          [Op.between]: [startDate, endDate]
        },
        status: 'COMPLETED'
      },
      attributes: [
        'paymentMethod',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
      ],
      group: ['paymentMethod']
    });

    return {
      success: true,
      dailyStats: stats,
      paymentMethodStats: paymentMethodStats,
      summary: {
        totalRepayments: stats.reduce((sum, item) => sum + parseInt(item.dataValues.totalRepayments || 0), 0),
        totalAmount: stats.reduce((sum, item) => sum + parseFloat(item.dataValues.totalAmount || 0), 0)
      }
    };
  } catch (error) {
    logger.error('Error getting repayment statistics:', error);
    return { success: false, error: error.message };
  }
};

export default {
  processPendingRepayments,
  repayLoanService,
  getRepaymentStatistics
};