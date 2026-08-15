// src/Services/repaymentHandler.js - COMPLETE FIXED VERSION
import { Op } from 'sequelize';
import {
  initializeModels,
  getLoanAccount,
  getCustomerAccount,
  getLoanRepayment,
  getLoanPortfolio
} from '../models/index.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// ========== PORTFOLIO UPDATE FUNCTION ==========

/**
 * ✅ Update portfolio when a repayment is made
 */
async function updatePortfolioForRepayment(loanAccount, repaymentAmount, principalPaid, interestPaid, penaltyPaid, transaction) {
  try {
    const LoanPortfolio = getLoanPortfolio();
    if (!LoanPortfolio) {
      logger.warn('⚠️ LoanPortfolio model not available, skipping portfolio update');
      return null;
    }

    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    // ✅ Get branch and product from loan account with fallbacks
    const branchId = loanAccount.BU_ID || loanAccount.bu_id || loanAccount.branch_id || '001';
    const productId = loanAccount.PROD_ID || loanAccount.loan_product_id || loanAccount.PROD_ID || 1;

    logger.info(`📊 Looking for portfolio: Branch ${branchId}, Product ${productId}, ${month}/${year}`);

    let portfolio = await LoanPortfolio.findOne({
      where: { 
        BRANCH_ID: branchId, 
        PROD_ID: productId, 
        YEAR: year, 
        MONTH: month 
      },
      transaction
    });

    // ✅ If not found, try without month/year (use the existing record)
    if (!portfolio) {
      logger.info(`📊 No portfolio found for ${branchId}/${productId}/${month}/${year}, trying without month/year`);
      portfolio = await LoanPortfolio.findOne({
        where: { 
          BRANCH_ID: branchId, 
          PROD_ID: productId 
        },
        transaction
      });
    }

    // ✅ If still not found, create new one
    if (!portfolio) {
      logger.info(`📊 Creating new portfolio record for Branch ${branchId}, Product ${productId}, ${month}/${year}`);
      portfolio = await LoanPortfolio.create({
        BRANCH_ID: branchId,
        PROD_ID: productId,
        PRODUCT_CODE: loanAccount.PRODUCT_CODE || 'DEFAULT',
        PRODUCT_NAME: loanAccount.PRODUCT_NAME || 'General Loan',
        PRODUCT_TYPE: loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN',
        MONTH: month,
        YEAR: year,
        CURRENCY: 'NGN',
        CREATED_BY: 'system',
        UPDATED_BY: 'system',
        STATUS: 'ACTIVE'
      }, { transaction });
    }

    // ✅ Update portfolio metrics
    const currentOutstanding = parseFloat(portfolio.OUTSTANDING_PRINCIPAL) || 0;
    const currentRecovered = parseFloat(portfolio.TOTAL_RECOVERED) || 0;
    const currentRepayments = parseFloat(portfolio.TOTAL_REPAYMENTS) || 0;
    const currentInterestReceived = parseFloat(portfolio.TOTAL_INTEREST_RECEIVED) || 0;
    const currentActiveLoans = portfolio.ACTIVE_LOANS || 0;
    const currentNumberOfLoans = portfolio.NUMBER_OF_LOANS || 0;

    const newOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL) || 0;
    const isFullyPaid = newOutstanding <= 0;

    logger.info(`📊 Portfolio Update: Current Outstanding: ${currentOutstanding}, Principal Paid: ${principalPaid}`);

    const updateData = {
      OUTSTANDING_PRINCIPAL: Math.max(0, currentOutstanding - parseFloat(principalPaid)),
      TOTAL_RECOVERED: currentRecovered + parseFloat(principalPaid),
      TOTAL_REPAYMENTS: currentRepayments + parseFloat(repaymentAmount),
      TOTAL_INTEREST_RECEIVED: currentInterestReceived + parseFloat(interestPaid || 0),
      ACTIVE_LOANS: isFullyPaid ? Math.max(0, currentActiveLoans - 1) : currentActiveLoans,
      NUMBER_OF_LOANS: currentNumberOfLoans,
      UPDATED_BY: 'system',
      UPDATED_DATE: new Date()
    };

    await portfolio.update(updateData, { transaction });

    logger.info(`✅ Portfolio updated for repayment: Branch ${branchId}, Product ${productId}`);
    logger.info(`   New Outstanding: ${updateData.OUTSTANDING_PRINCIPAL}`);
    logger.info(`   Total Recovered: ${updateData.TOTAL_RECOVERED}`);
    logger.info(`   Active Loans: ${updateData.ACTIVE_LOANS}`);

    return portfolio;

  } catch (error) {
    logger.error('❌ Error updating portfolio:', error);
    throw error;
  }
}

// ========== CREATE REPAYMENT HISTORY ==========

async function createRepaymentHistory(loanAccount, repayment, transaction) {
  try {
    const query = `
      INSERT INTO loan_repayment_history (
        loan_account_id,
        account_number,
        customer_id,
        principal_amount,
        interest_amount,
        penalty_amount,
        total_amount,
        repayment_date,
        reference,
        created_by,
        created_at
      ) VALUES (
        :loan_account_id,
        :account_number,
        :customer_id,
        :principal_amount,
        :interest_amount,
        :penalty_amount,
        :total_amount,
        :repayment_date,
        :reference,
        :created_by,
        :created_at
      )
    `;

    await sequelize.query(query, {
      replacements: {
        loan_account_id: loanAccount.id,
        account_number: loanAccount.ACCT_NO || loanAccount.acct_no,
        customer_id: loanAccount.CUST_ID || loanAccount.cust_id,
        principal_amount: repayment.principalAmount || 0,
        interest_amount: repayment.interestAmount || 0,
        penalty_amount: repayment.penaltyAmount || 0,
        total_amount: repayment.totalAmount || 0,
        repayment_date: repayment.repaymentDate || new Date(),
        reference: repayment.transactionReference || `REPAY-${Date.now()}`,
        created_by: repayment.createdBy || 'SYSTEM',
        created_at: new Date()
      },
      transaction
    });

    logger.info(`✅ Repayment history created for account ${loanAccount.ACCT_NO}`);
    return true;
  } catch (error) {
    logger.error('❌ Error creating repayment history:', error);
    return false;
  }
}

// ========== PROCESS SINGLE REPAYMENT ==========

async function processSingleRepayment(repayment, transaction) {
  try {
    logger.info(`🔄 Processing repayment ${repayment.id} for account ${repayment.loanAccountNumber}`);

    // Get models
    const LoanAccount = getLoanAccount();
    const CustomerAccount = getCustomerAccount();

    // Find loan account
    let loanAccount = await LoanAccount.findOne({
      where: { 
        id: repayment.loanAccountId 
      },
      transaction
    });

    if (!loanAccount && repayment.loanAccountNumber) {
      loanAccount = await LoanAccount.findOne({
        where: { 
          ACCT_NO: repayment.loanAccountNumber 
        },
        transaction
      });
    }

    if (!loanAccount) {
      logger.error(`❌ Loan account not found for repayment ${repayment.id}`);
      await repayment.update({ status: 'FAILED' }, { transaction });
      return { success: false, error: 'Loan account not found' };
    }

    // ✅ FIX: Use CUST_ID instead of customer_id
    const customerId = repayment.customerId || loanAccount.CUST_ID || loanAccount.cust_id;
    
    if (!customerId) {
      logger.error(`❌ Customer ID not found for repayment ${repayment.id}`);
      await repayment.update({ status: 'FAILED' }, { transaction });
      return { success: false, error: 'Customer ID not found' };
    }

    // Find customer account using CUST_ID
    const customerAccount = await CustomerAccount.findOne({
      where: { 
        CUST_ID: customerId  // ✅ Fixed: Use CUST_ID
      },
      transaction
    });

    if (!customerAccount) {
      logger.error(`❌ Customer account not found for CUST_ID: ${customerId}`);
      await repayment.update({ status: 'FAILED' }, { transaction });
      return { success: false, error: `Customer account not found for CUST_ID: ${customerId}` };
    }

    const repaymentAmount = parseFloat(repayment.totalAmount || 0);

    // Check customer balance - handle different field names
    const currentBalance = parseFloat(
      customerAccount.AVAILABLE_BALANCE || 
      customerAccount.available_balance || 
      customerAccount.current_balance ||
      customerAccount.CURRENT_BALANCE ||
      0
    );
    
    if (currentBalance < repaymentAmount) {
      logger.warn(`⚠️ Insufficient balance: ${currentBalance} < ${repaymentAmount}`);
      await repayment.update({ status: 'FAILED' }, { transaction });
      return { success: false, error: 'Insufficient balance' };
    }

    // Deduct from customer account - handle different field names
    const newCustomerBalance = currentBalance - repaymentAmount;
    
    // Build update object with available fields
    const customerUpdateData = {
      AVAILABLE_BALANCE: newCustomerBalance,
      updated_at: new Date()
    };
    
    // Add other balance fields if they exist
    if (customerAccount.ledger_balance !== undefined) {
      customerUpdateData.ledger_balance = newCustomerBalance;
    }
    if (customerAccount.LEDGER_BAL !== undefined) {
      customerUpdateData.LEDGER_BAL = newCustomerBalance;
    }
    if (customerAccount.current_balance !== undefined) {
      customerUpdateData.current_balance = newCustomerBalance;
    }
    if (customerAccount.CURRENT_BALANCE !== undefined) {
      customerUpdateData.CURRENT_BALANCE = newCustomerBalance;
    }

    await customerAccount.update(customerUpdateData, { transaction });
    logger.info(`✅ Customer account debited: ${repaymentAmount}`);

    // Update loan account
    const outstandingPrincipal = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const accruedInterest = parseFloat(loanAccount.ACCRUED_INTEREST || 0);
    const penaltyAmount = parseFloat(loanAccount.PENALTY_AMOUNT || 0);

    let remainingAmount = repaymentAmount;
    const penaltyPaid = Math.min(penaltyAmount, remainingAmount);
    remainingAmount -= penaltyPaid;

    const interestPaid = Math.min(accruedInterest, remainingAmount);
    remainingAmount -= interestPaid;

    const principalPaid = Math.min(outstandingPrincipal, remainingAmount);

    const newPrincipal = outstandingPrincipal - principalPaid;
    const newInterest = accruedInterest - interestPaid;
    const newPenalty = penaltyAmount - penaltyPaid;

    const updateData = {
      OUTSTANDING_PRINCIPAL: newPrincipal,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      TOTAL_REPAID_AMOUNT: (parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0) + repaymentAmount),
      LAST_REPAYMENT_DATE: new Date(),
      LAST_REPAYMENT_AMOUNT: repaymentAmount
    };

    if (newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0) {
      updateData.LOAN_STATUS = 'PAID';
      updateData.CLOSURE_DATE = new Date();
    }

    await loanAccount.update(updateData, { transaction });
    logger.info(`✅ Loan account updated: New Principal: ${newPrincipal}`);

    // ✅ Update portfolio
    await updatePortfolioForRepayment(loanAccount, repaymentAmount, principalPaid, interestPaid, penaltyPaid, transaction);

    // ✅ Create repayment history
    await createRepaymentHistory(loanAccount, repayment, transaction);

    // Mark repayment as completed
    await repayment.update({
      status: 'COMPLETED',
      updated_at: new Date()
    }, { transaction });

    logger.info(`✅ Repayment ${repayment.id} completed successfully`);

    return { 
      success: true, 
      amount: repaymentAmount, 
      principalPaid, 
      interestPaid, 
      penaltyPaid 
    };
  } catch (error) {
    logger.error(`❌ Error processing repayment ${repayment.id}:`, error);
    await repayment.update({ status: 'FAILED' }, { transaction });
    return { success: false, error: error.message };
  }
}

// ========== PROCESS PENDING REPAYMENTS ==========

export const processPendingRepayments = async () => {
  await initializeModels();

  const LoanRepayment = getLoanRepayment();

  let transaction;

  try {
    logger.info('🔄 Processing pending loan repayments...');
    transaction = await sequelize.transaction();

    // ✅ Find all repayments that are PENDING or SCHEDULED
    const pendingRepayments = await LoanRepayment.findAll({
      where: {
        status: {
          [Op.in]: ['PENDING', 'SCHEDULED']
        }
      },
      transaction
    });

    logger.info(`📊 Found ${pendingRepayments.length} pending repayments`);

    const results = { processed: [], failed: [], skipped: [] };

    if (pendingRepayments.length === 0) {
      await transaction.commit();
      return { success: true, count: 0, ...results };
    }

    for (const repayment of pendingRepayments) {
      try {
        const result = await processSingleRepayment(repayment, transaction);
        
        if (result.success) {
          results.processed.push({ 
            repaymentId: repayment.id, 
            amount: repayment.totalAmount 
          });
          logger.info(`✅ Repayment ${repayment.id} processed successfully`);
        } else {
          results.failed.push({ 
            repaymentId: repayment.id, 
            error: result.error 
          });
          logger.error(`❌ Repayment ${repayment.id} failed: ${result.error}`);
        }
      } catch (error) {
        logger.error(`❌ Error processing repayment ${repayment.id}:`, error);
        results.failed.push({ 
          repaymentId: repayment.id, 
          error: error.message 
        });
      }
    }

    await transaction.commit();
    
    logger.info(`✅ Pending repayments completed: ${results.processed.length} processed, ${results.failed.length} failed`);
    return { success: true, count: results.processed.length, ...results };
    
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error('❌ Failed to process pending repayments:', error);
    throw error;
  }
};

// ============================================================
// EXPORTS
// ============================================================

export default {
  processPendingRepayments
};