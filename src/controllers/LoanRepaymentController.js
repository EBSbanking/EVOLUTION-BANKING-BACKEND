// src/controllers/LoanRepaymentController.js
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import logger from '../utils/logger.js';

// ========== HELPER FUNCTIONS ==========

function generateTransactionReference() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9).toUpperCase();
  return `REPAY-${timestamp}-${random}`;
}

function generateReceiptNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `RCPT-${timestamp}-${random}`;
}

// ========== PORTFOLIO UPDATE ==========

async function updatePortfolioForRepayment(loanAccount, repaymentAmount, principalPaid, interestPaid, penaltyPaid, transaction) {
  try {
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();

    const branchId = loanAccount.BU_ID || loanAccount.bu_id || '001';
    const productId = loanAccount.PROD_ID || loanAccount.loan_product_id || 1;

    let portfolio = await LoanPortfolio.findOne({
      where: { 
        BRANCH_ID: branchId, 
        PROD_ID: productId, 
        YEAR: year, 
        MONTH: month 
      },
      transaction
    });

    if (!portfolio) {
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

    const currentOutstanding = parseFloat(portfolio.OUTSTANDING_PRINCIPAL) || 0;
    const currentRecovered = parseFloat(portfolio.TOTAL_RECOVERED) || 0;
    const currentRepayments = parseFloat(portfolio.TOTAL_REPAYMENTS) || 0;
    const currentInterestReceived = parseFloat(portfolio.TOTAL_INTEREST_RECEIVED) || 0;
    const currentActiveLoans = portfolio.ACTIVE_LOANS || 0;

    const newOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL) || 0;
    const isFullyPaid = newOutstanding <= 0;

    await portfolio.update({
      OUTSTANDING_PRINCIPAL: Math.max(0, currentOutstanding - parseFloat(principalPaid)),
      TOTAL_RECOVERED: currentRecovered + parseFloat(principalPaid),
      TOTAL_REPAYMENTS: currentRepayments + parseFloat(repaymentAmount),
      TOTAL_INTEREST_RECEIVED: currentInterestReceived + parseFloat(interestPaid || 0),
      ACTIVE_LOANS: isFullyPaid ? Math.max(0, currentActiveLoans - 1) : currentActiveLoans,
      UPDATED_BY: 'system',
      UPDATED_DATE: new Date()
    }, { transaction });

    logger.info(`✅ Portfolio updated for repayment: Branch ${branchId}, Product ${productId}`);
    return portfolio;

  } catch (error) {
    logger.error('❌ Error updating portfolio:', error);
    throw error;
  }
}

// ========== CREATE REPAYMENT HISTORY ==========

async function createRepaymentHistory(loanAccount, repaymentData, transaction) {
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
        principal_amount: repaymentData.principalPaid || 0,
        interest_amount: repaymentData.interestPaid || 0,
        penalty_amount: repaymentData.penaltyPaid || 0,
        total_amount: repaymentData.totalAmount || 0,
        repayment_date: repaymentData.repaymentDate || new Date(),
        reference: repaymentData.reference || generateTransactionReference(),
        created_by: repaymentData.createdBy || 'SYSTEM',
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

// ========== CREATE LOAN REPAYMENT RECORD ==========

async function createLoanRepaymentRecord(loanAccount, repaymentData, transaction) {
  try {
    console.log('Creating loan repayment record with data:', {
      loanAccountId: loanAccount.id,
      loanAccountNumber: loanAccount.ACCT_NO || loanAccount.acct_no,
      customerId: loanAccount.CUST_ID || loanAccount.cust_id,
      principalAmount: repaymentData.principalPaid || 0,
      interestAmount: repaymentData.interestPaid || 0,
      totalAmount: repaymentData.totalAmount || 0,
    });

    const repayment = await LoanRepayment.create({
      collectionId: null,
      loanAccountId: loanAccount.id,
      loanAccountNumber: loanAccount.ACCT_NO || loanAccount.acct_no,
      customerId: loanAccount.CUST_ID || loanAccount.cust_id,
      customerName: repaymentData.customerName || 'Customer',
      principalAmount: repaymentData.principalPaid || 0,
      interestAmount: repaymentData.interestPaid || 0,
      penaltyAmount: repaymentData.penaltyPaid || 0,
      totalAmount: repaymentData.totalAmount || 0,
      installmentNumber: repaymentData.installmentNumber || 1,
      repaymentDate: repaymentData.repaymentDate || new Date(),
      transactionReference: repaymentData.reference || generateTransactionReference(),
      status: 'PENDING',
      created_at: new Date(),
      updated_at: new Date(),
      loan_account_number: loanAccount.ACCT_NO || loanAccount.acct_no
    }, { transaction });

    logger.info(`✅ Loan repayment record created with ID: ${repayment.id} (status: PENDING)`);
    return repayment;
  } catch (error) {
    logger.error('❌ Error creating loan repayment record:', error);
    throw error;
  }
}

// ========== MAIN REPAYMENT FUNCTION ==========

export const handleLoanRepayment = async ({ 
  ACCT_NO, 
  amount, 
  date, 
  customerAccountNo,
  paymentMethod = 'BANK_TRANSFER',
  reference,
  description,
  createdBy = 'SYSTEM',
  interestAmount = 0,
  penaltyAmount = 0,
  customerId = null
}) => {
  if (isNaN(new Date(date).getTime())) {
    throw new Error('Invalid repayment date.');
  }

  const transaction = await sequelize.transaction();

  try {
    logger.info(`🔄 Processing repayment for loan ${ACCT_NO}, amount ${amount}`);

    // 1. Fetch loan account
    const loanAccount = await LoanAccount.findOne({ 
      where: { 
        ACCT_NO: String(ACCT_NO).trim() 
      },
      transaction
    });
    
    if (!loanAccount) {
      await transaction.rollback();
      throw new Error('Loan account not found.');
    }

    // ✅ 2. Fetch repayment schedule - find active schedule
    let repaymentSchedule = await RepaymentSchedule.findOne({
      where: {
        account_number: String(ACCT_NO).trim(),
        is_schedule_complete: 0
      },
      attributes: [
        'id',
        'loan_account_id',
        'account_number',
        'customer_id',
        'installments_json',
        'status',
        'is_schedule_complete',
        'created_at',
        'updated_at'
      ],
      transaction
    });

    // If no active schedule, check if there's a completed one
    if (!repaymentSchedule) {
      const completedSchedule = await RepaymentSchedule.findOne({
        where: {
          account_number: String(ACCT_NO).trim(),
          is_schedule_complete: 1
        },
        transaction
      });
      
      if (completedSchedule) {
        logger.info(`📊 Loan ${ACCT_NO} already has a completed schedule`);
        // Still process repayment but skip installment updates
      } else {
        logger.warn(`⚠️ No repayment schedule found for account ${ACCT_NO}`);
      }
    }

    let scheduleInterest = 0;
    let schedulePrincipal = 0;
    let totalSchedulePayment = 0;
    let currentInstallment = null;
    let installments = [];

    if (repaymentSchedule && repaymentSchedule.installments_json) {
      // Parse installments if it's a string
      installments = typeof repaymentSchedule.installments_json === 'string' 
        ? JSON.parse(repaymentSchedule.installments_json) 
        : repaymentSchedule.installments_json;
      
      // Find the first PENDING installment
      currentInstallment = installments.find(inst => inst.status === 'PENDING');
      
      if (currentInstallment) {
        scheduleInterest = parseFloat(currentInstallment.interest) || 0;
        schedulePrincipal = parseFloat(currentInstallment.principal) || 0;
        totalSchedulePayment = parseFloat(currentInstallment.totalPayment) || 0;
        logger.info(`📊 Current installment: #${currentInstallment.installmentNo}, Principal: ${schedulePrincipal}, Interest: ${scheduleInterest}, Total: ${totalSchedulePayment}`);
      } else {
        // Check if all installments are PAID
        const allPaid = installments.every(inst => inst.status === 'PAID');
        if (allPaid) {
          logger.info(`📊 All installments already paid for account ${ACCT_NO}`);
          await repaymentSchedule.update({
            status: 'COMPLETED',
            is_schedule_complete: 1,
            updated_at: new Date()
          }, { transaction });
        } else {
          logger.warn(`⚠️ No pending installment found for account ${ACCT_NO}`);
        }
      }
    }

    // ✅ 3. Use schedule interest if available
    const finalInterestAmount = scheduleInterest > 0 ? scheduleInterest : (interestAmount || 0);

    // ✅ 4. Check if loan is active - allow ALL statuses except CLOSED/PAID/REJECTED
    const blockedStatuses = ['CLOSED', 'PAID', 'REJECTED'];
    const loanStatus = loanAccount.LOAN_STATUS?.toUpperCase();
    
    if (blockedStatuses.includes(loanStatus)) {
      await transaction.rollback();
      throw new Error(`Cannot repay a loan with status: ${loanAccount.LOAN_STATUS}`);
    }

    logger.info(`📊 Loan status: ${loanAccount.LOAN_STATUS} - Repayment allowed`);

    // 5. Get customer ID from loan account if not provided
    const finalCustomerId = customerId || loanAccount.CUST_ID || loanAccount.cust_id;
    if (!finalCustomerId) {
      await transaction.rollback();
      throw new Error('Customer ID not found for this loan account.');
    }

    // 6. Find customer account
    let customerAccount = null;
    
    if (customerAccountNo) {
      customerAccount = await CustomerAccount.findOne({ 
        where: { 
          account_number: String(customerAccountNo).trim() 
        },
        transaction
      });
    }
    
    if (!customerAccount && finalCustomerId) {
      customerAccount = await CustomerAccount.findOne({ 
        where: { 
          customer_id: String(finalCustomerId).trim() 
        },
        transaction
      });
    }

    if (!customerAccount) {
      await transaction.rollback();
      throw new Error(`Customer account not found for customer ${finalCustomerId} or account ${customerAccountNo}`);
    }

    logger.info(`✅ Customer account found: ${customerAccount.account_number}`);

    // ✅ 7. Get ALL balance fields from customer account
    const amountNum = parseFloat(amount.toString());
    if (isNaN(amountNum) || amountNum <= 0) {
      await transaction.rollback();
      throw new Error('Invalid repayment amount. Amount must be greater than 0.');
    }
    
    // Get all balance fields
    let customerAvailableBalance = 0;
    let customerCurrentBalance = 0;
    let customerLedgerBalance = 0;
    let customerClearedBalance = 0;

    // Available balance
    if (customerAccount.available_balance !== undefined) {
      customerAvailableBalance = parseFloat(customerAccount.available_balance);
    } else if (customerAccount.AVAILABLE_BALANCE !== undefined) {
      customerAvailableBalance = parseFloat(customerAccount.AVAILABLE_BALANCE);
    }

    // Current balance
    if (customerAccount.current_balance !== undefined) {
      customerCurrentBalance = parseFloat(customerAccount.current_balance);
    } else if (customerAccount.CURRENT_BALANCE !== undefined) {
      customerCurrentBalance = parseFloat(customerAccount.CURRENT_BALANCE);
    }

    // Ledger balance
    if (customerAccount.ledger_balance !== undefined) {
      customerLedgerBalance = parseFloat(customerAccount.ledger_balance);
    } else if (customerAccount.LEDGER_BALANCE !== undefined) {
      customerLedgerBalance = parseFloat(customerAccount.LEDGER_BALANCE);
    }

    // Cleared balance
    if (customerAccount.cleared_balance !== undefined) {
      customerClearedBalance = parseFloat(customerAccount.cleared_balance);
    } else if (customerAccount.CLEARED_BALANCE !== undefined) {
      customerClearedBalance = parseFloat(customerAccount.CLEARED_BALANCE);
    }

    // Use available balance for the check
    if (customerAvailableBalance < amountNum) {
      await transaction.rollback();
      throw new Error(`Insufficient balance. Available: ${customerAvailableBalance}, Required: ${amountNum}`);
    }

    // ✅ 8. Calculate payment allocation
    let remainingAmount = amountNum;
    const currentPenalty = parseFloat(loanAccount.PENALTY_AMOUNT || 0);
    const currentInterest = parseFloat(loanAccount.ACCRUED_INTEREST || 0);
    const currentOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);

    // First, pay penalty if any
    const penaltyPaid = Math.min(currentPenalty, remainingAmount);
    remainingAmount -= penaltyPaid;

    // ✅ Then, pay interest (from schedule or accrued)
    let interestPaid = 0;
    if (finalInterestAmount > 0) {
      interestPaid = Math.min(finalInterestAmount, remainingAmount);
      remainingAmount -= interestPaid;
    } else if (currentInterest > 0) {
      interestPaid = Math.min(currentInterest, remainingAmount);
      remainingAmount -= interestPaid;
    }

    // ✅ Finally, pay principal
    const principalPaid = Math.min(currentOutstanding, remainingAmount);

    const newOutstanding = Math.max(0, currentOutstanding - principalPaid);
    const newPenalty = Math.max(0, currentPenalty - penaltyPaid);
    const newInterest = Math.max(0, currentInterest - interestPaid);
    const newTotalRepaid = (parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0) + amountNum);

    logger.info(`📊 Payment allocation: Principal: ${principalPaid}, Interest: ${interestPaid}, Penalty: ${penaltyPaid}`);

    // ✅ 9. Update LoanAccount
    const updateData = {
      OUTSTANDING_PRINCIPAL: newOutstanding,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      TOTAL_REPAID_AMOUNT: newTotalRepaid,
      LAST_REPAYMENT_DATE: new Date(date),
      LAST_REPAYMENT_AMOUNT: amountNum
    };

    // ✅ Improved loan status logic
    const totalOutstanding = newOutstanding + newInterest + newPenalty;
    const maturityDate = loanAccount.MATURITY_DT || loanAccount.maturity_dt;
    const isPastMaturity = maturityDate && new Date() > new Date(maturityDate);
    const wasOverdue = loanAccount.LOAN_STATUS === 'OVERDUE';

    if (totalOutstanding <= 0) {
      updateData.LOAN_STATUS = 'CLOSED';
      updateData.CLOSURE_DATE = new Date(date);
      logger.info(`✅ Loan fully paid - Status set to CLOSED`);
    } else if (newOutstanding <= 0 && (newInterest > 0 || newPenalty > 0)) {
      if (isPastMaturity) {
        updateData.LOAN_STATUS = 'OVERDUE';
      } else {
        updateData.LOAN_STATUS = 'ACTIVE';
      }
      logger.info(`📊 Principal paid, ${newInterest + newPenalty} in interest/penalty remains. Status: ${updateData.LOAN_STATUS}`);
    } else {
      if (wasOverdue && !isPastMaturity) {
        updateData.LOAN_STATUS = 'ACTIVE';
        logger.info(`✅ Loan status changed from OVERDUE to ACTIVE`);
      } else if (isPastMaturity) {
        updateData.LOAN_STATUS = 'OVERDUE';
        logger.info(`📊 Loan remains OVERDUE (past maturity date)`);
      } else {
        updateData.LOAN_STATUS = 'ACTIVE';
        logger.info(`✅ Loan status set to ACTIVE`);
      }
    }

    await loanAccount.update(updateData, { transaction });
    logger.info(`✅ Loan account updated: New Outstanding: ${newOutstanding}, New Interest: ${newInterest}, Status: ${updateData.LOAN_STATUS}`);

    // 10. Debit CustomerAccount
    const newBalance = customerAvailableBalance - amountNum;
    const customerUpdateData = {
      lastActivityDate: new Date()
    };

    if (customerAccount.available_balance !== undefined) {
      customerUpdateData.available_balance = newBalance;
    } else if (customerAccount.AVAILABLE_BALANCE !== undefined) {
      customerUpdateData.AVAILABLE_BALANCE = newBalance;
    }

    if (customerAccount.current_balance !== undefined) {
      customerUpdateData.current_balance = newBalance;
    } else if (customerAccount.CURRENT_BALANCE !== undefined) {
      customerUpdateData.CURRENT_BALANCE = newBalance;
    }

    if (customerAccount.ledger_balance !== undefined) {
      customerUpdateData.ledger_balance = newBalance;
    } else if (customerAccount.LEDGER_BALANCE !== undefined) {
      customerUpdateData.LEDGER_BALANCE = newBalance;
    }

    if (customerAccount.cleared_balance !== undefined) {
      customerUpdateData.cleared_balance = newBalance;
    } else if (customerAccount.CLEARED_BALANCE !== undefined) {
      customerUpdateData.CLEARED_BALANCE = newBalance;
    }

    if (customerAccount.balance !== undefined) {
      customerUpdateData.balance = newBalance;
    }
    if (customerAccount.BALANCE !== undefined) {
      customerUpdateData.BALANCE = newBalance;
    }

    await customerAccount.update(customerUpdateData, { transaction });
    logger.info(`✅ Customer account debited: New Balance: ${newBalance}`);

    // ✅ 11. Update repayment schedule - mark installment as paid
    if (repaymentSchedule && currentInstallment) {
      // Parse installments if it's a string
      let currentInstallments = typeof repaymentSchedule.installments_json === 'string'
        ? JSON.parse(repaymentSchedule.installments_json)
        : repaymentSchedule.installments_json || [];
      
      logger.info(`📊 Before update - Installment ${currentInstallment.installmentNo}: ${JSON.stringify(currentInstallment)}`);
      
      const updatedInstallments = currentInstallments.map(inst => {
        if (inst.installmentNo === currentInstallment.installmentNo) {
          const updatedInst = {
            ...inst,
            status: 'PAID',
            paidDate: new Date(date).toISOString().split('T')[0],
            paidAmount: amountNum,
            transactionReference: reference || generateTransactionReference()
          };
          logger.info(`✅ Marking installment ${inst.installmentNo} as PAID`);
          return updatedInst;
        }
        return inst;
      });

      const allPaid = updatedInstallments.every(inst => inst.status === 'PAID');
      
      logger.info(`📊 After update - All paid? ${allPaid}`);
      logger.info(`📊 Updated installments: ${JSON.stringify(updatedInstallments)}`);
      
      await repaymentSchedule.update({
        installments_json: updatedInstallments,
        schedule: updatedInstallments,
        status: allPaid ? 'COMPLETED' : 'PENDING',
        is_schedule_complete: allPaid ? 1 : 0,
        updated_at: new Date()
      }, { transaction });
      
      // ✅ Verify the update
      const verifySchedule = await RepaymentSchedule.findOne({
        where: { id: repaymentSchedule.id },
        transaction
      });
      
      if (verifySchedule) {
        const verifiedInstallments = typeof verifySchedule.installments_json === 'string'
          ? JSON.parse(verifySchedule.installments_json)
          : verifySchedule.installments_json;
        
        const verifiedInstallment = verifiedInstallments.find(inst => inst.installmentNo === currentInstallment.installmentNo);
        logger.info(`✅ Verified installment ${currentInstallment.installmentNo} status: ${verifiedInstallment?.status}`);
      }
      
    } else if (repaymentSchedule && !currentInstallment) {
      // Check if all installments are already paid
      let currentInstallments = typeof repaymentSchedule.installments_json === 'string'
        ? JSON.parse(repaymentSchedule.installments_json)
        : repaymentSchedule.installments_json || [];
      
      const allPaid = currentInstallments.every(inst => inst.status === 'PAID');
      if (allPaid) {
        logger.info(`📊 All installments already paid for account ${ACCT_NO}`);
        await repaymentSchedule.update({
          status: 'COMPLETED',
          is_schedule_complete: 1,
          updated_at: new Date()
        }, { transaction });
      }
    }

    // 12. Create repayment data object
    const repaymentData = {
      principalPaid: principalPaid,
      interestPaid: interestPaid,
      penaltyPaid: penaltyPaid,
      totalAmount: amountNum,
      repaymentDate: new Date(date),
      reference: reference || generateTransactionReference(),
      createdBy: createdBy,
      customerName: customerAccount.customer_name || customerAccount.account_name || 'Customer',
      installmentNumber: currentInstallment?.installmentNo || 1
    };

    // 13. Create loan repayment record (status: PENDING)
    const repayment = await createLoanRepaymentRecord(loanAccount, repaymentData, transaction);
    logger.info(`✅ Loan repayment record created: ${repayment.id}`);

    // 14. Create repayment history
    await createRepaymentHistory(loanAccount, repaymentData, transaction);
    logger.info(`✅ Repayment history created`);

    // 15. Update portfolio
    await updatePortfolioForRepayment(loanAccount, amountNum, principalPaid, interestPaid, penaltyPaid, transaction);
    logger.info(`✅ Portfolio updated`);

    // 16. Create transaction record
    try {
      if (LoanRepaymentTransaction) {
        const transactionRecordData = {
          accountId: loanAccount.id,
          accountNumber: loanAccount.ACCT_NO || loanAccount.acct_no,
          customerId: loanAccount.CUST_ID || loanAccount.cust_id,
          transactionDate: new Date(date),
          transactionType: 'REPAYMENT',
          amount: amountNum,
          principalAmount: principalPaid,
          interestAmount: interestPaid,
          paymentMethod: paymentMethod,
          transactionReference: repaymentData.reference,
          repaymentType: 'REPAYMENT',
          isInstallment: false,
          createdBy: createdBy,
          status: 'COMPLETED',
          receiptNo: generateReceiptNumber(),
          branchCode: '001',
          productCode: 'DEFAULT',
          notes: description || 'Loan repayment',
          glPosted: false,
          isReversed: false
        };

        await LoanRepaymentTransaction.create(transactionRecordData, { transaction });
        logger.info(`✅ Transaction record created`);
      }
    } catch (txError) {
      logger.warn('⚠️ Could not create transaction record:', txError.message);
    }

    await transaction.commit();

    logger.info(`✅ Repayment completed successfully for ${ACCT_NO}`);

    return { 
      success: true, 
      message: 'Loan repayment successful. Portfolio and history updated.',
      data: {
        repaymentId: repayment.id,
        reference: repaymentData.reference,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          newOutstandingPrincipal: newOutstanding,
          newAccruedInterest: newInterest,
          newPenalty: newPenalty,
          totalRepaid: newTotalRepaid,
          loanStatus: updateData.LOAN_STATUS || loanAccount.LOAN_STATUS
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
          balanceAfter: newBalance
        },
        allocation: {
          principalPaid,
          interestPaid,
          penaltyPaid,
          totalPaid: amountNum
        },
        installmentInfo: currentInstallment ? {
          installmentNumber: currentInstallment.installmentNo,
          status: 'PAID',
          paidAmount: amountNum,
          paidDate: new Date(date).toISOString().split('T')[0]
        } : null
      }
    };

  } catch (error) {
    await transaction.rollback();
    logger.error('❌ Loan repayment failed:', error);
    return { success: false, error: error.message };
  }
};

// ========== REPAY LOAN API CONTROLLER ==========

export const repayLoan = async (req, res) => {
  try {
    const { 
      ACCT_NO, 
      amount, 
      date, 
      customerAccountNo,
      paymentMethod,
      reference,
      description,
      createdBy,
      interestAmount,
      penaltyAmount,
      customerId
    } = req.body;

    const errors = [];
    
    if (!ACCT_NO) errors.push({ message: 'ACCT_NO is required' });
    if (!amount || isNaN(amount) || amount <= 0) errors.push({ message: 'Valid amount is required' });
    if (!date || isNaN(new Date(date).getTime())) errors.push({ message: 'Valid date is required' });
    if (!customerAccountNo && !customerId) errors.push({ message: 'customerAccountNo or customerId is required' });
    if (!paymentMethod) errors.push({ message: 'paymentMethod is required' });

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        errors,
        timestamp: new Date().toISOString()
      });
    }

    const result = await handleLoanRepayment({ 
      ACCT_NO, 
      amount, 
      date, 
      customerAccountNo,
      paymentMethod,
      reference,
      description,
      createdBy: createdBy || req.user?.id || 'SYSTEM',
      interestAmount: interestAmount || 0,
      penaltyAmount: penaltyAmount || 0,
      customerId: customerId || null
    });

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.data,
        timestamp: new Date().toISOString()
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.error,
        code: 'REPAYMENT_FAILED',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[Repayment Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ========== GET LOAN INSTALLMENTS ==========

/**
 * Get loan installments by account number
 * Returns the repayment schedule with installment details
 */
export const getLoanInstallments = async (req, res) => {
  try {
    const { ACCT_NO } = req.params || req.query || {};

    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'Account number (ACCT_NO) is required',
        code: 'MISSING_ACCOUNT_NUMBER',
        timestamp: new Date().toISOString()
      });
    }

    // Find the repayment schedule for this loan account
    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: {
        account_number: String(ACCT_NO).trim()
      },
      attributes: [
        'id',
        'loan_account_id',
        'account_number',
        'customer_id',
        'start_date',
        'maturity_date',
        'principal_amount',
        'interest_rate',
        'interest_rate_type',
        'interest_type',
        'calculation_method',
        'is_term_based_rate',
        'term',
        'term_type',
        'payment_frequency',
        'emi_amount',
        'total_interest',
        'total_repayment',
        'upfront_interest',
        'status',
        'is_schedule_complete',
        'installments_json',
        'schedule',
        'created_at',
        'updated_at'
      ]
    });

    if (!repaymentSchedule) {
      return res.status(404).json({
        success: false,
        message: `No repayment schedule found for account: ${ACCT_NO}`,
        code: 'SCHEDULE_NOT_FOUND',
        timestamp: new Date().toISOString()
      });
    }

    // Parse installments JSON if it's a string
    let installments = repaymentSchedule.installments_json;
    let schedule = repaymentSchedule.schedule;

    if (typeof installments === 'string') {
      try {
        installments = JSON.parse(installments);
      } catch (e) {
        installments = [];
      }
    }

    if (typeof schedule === 'string') {
      try {
        schedule = JSON.parse(schedule);
      } catch (e) {
        schedule = [];
      }
    }

    // Get loan account details
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: String(ACCT_NO).trim() },
      attributes: [
        'ACCT_NO',
        'CUST_ID',
        'LOAN_STATUS',
        'OUTSTANDING_PRINCIPAL',
        'ACCRUED_INTEREST',
        'PENALTY_AMOUNT',
        'TOTAL_REPAID_AMOUNT',
        'DISBURSEMENT_DATE',
        'MATURITY_DT'
      ]
    });

    // Calculate summary statistics
    const totalInstallments = installments?.length || 0;
    const paidInstallments = installments?.filter(inst => inst.status === 'PAID').length || 0;
    const pendingInstallments = installments?.filter(inst => inst.status === 'PENDING').length || 0;
    const overdueInstallments = installments?.filter(inst => {
      if (inst.status === 'PENDING' && inst.dueDate) {
        return new Date(inst.dueDate) < new Date();
      }
      return false;
    }).length || 0;

    // Calculate totals from installments
    let totalPrincipal = 0;
    let totalInterest = 0;
    let totalPayment = 0;
    let paidPrincipal = 0;
    let paidInterest = 0;

    if (installments && Array.isArray(installments)) {
      installments.forEach(inst => {
        const principal = parseFloat(inst.principal) || 0;
        const interest = parseFloat(inst.interest) || 0;
        const payment = parseFloat(inst.totalPayment) || 0;
        
        totalPrincipal += principal;
        totalInterest += interest;
        totalPayment += payment;

        if (inst.status === 'PAID') {
          paidPrincipal += principal;
          paidInterest += interest;
        }
      });
    }

    // Get the next due installment
    const nextInstallment = installments?.find(inst => inst.status === 'PENDING') || null;
    
    // Check if next installment is overdue
    let isNextOverdue = false;
    if (nextInstallment && nextInstallment.dueDate) {
      isNextOverdue = new Date(nextInstallment.dueDate) < new Date();
    }

    // Get repayment history count
    const repaymentCount = await LoanRepayment.count({
      where: {
        [Op.or]: [
          { loanAccountNumber: String(ACCT_NO).trim() },
          { loan_account_number: String(ACCT_NO).trim() }
        ]
      }
    });

    const responseData = {
      success: true,
      message: 'Loan installments retrieved successfully',
      data: {
        loanAccount: {
          accountNumber: loanAccount?.ACCT_NO || ACCT_NO,
          customerId: loanAccount?.CUST_ID || repaymentSchedule.customer_id,
          status: loanAccount?.LOAN_STATUS || repaymentSchedule.status,
          disbursementDate: loanAccount?.DISBURSEMENT_DATE || repaymentSchedule.start_date,
          maturityDate: loanAccount?.MATURITY_DT || repaymentSchedule.maturity_date,
          outstandingPrincipal: parseFloat(loanAccount?.OUTSTANDING_PRINCIPAL) || 0,
          accruedInterest: parseFloat(loanAccount?.ACCRUED_INTEREST) || 0,
          penaltyAmount: parseFloat(loanAccount?.PENALTY_AMOUNT) || 0,
          totalRepaid: parseFloat(loanAccount?.TOTAL_REPAID_AMOUNT) || 0
        },
        
        scheduleSummary: {
          totalInstallments,
          paidInstallments,
          pendingInstallments,
          overdueInstallments,
          totalPrincipal,
          totalInterest,
          totalPayment,
          paidPrincipal,
          paidInterest,
          remainingPrincipal: totalPrincipal - paidPrincipal,
          remainingInterest: totalInterest - paidInterest,
          remainingTotal: (totalPrincipal + totalInterest) - (paidPrincipal + paidInterest),
          progressPercentage: totalPayment > 0 ? ((paidPrincipal + paidInterest) / (totalPrincipal + totalInterest) * 100) : 0,
          isComplete: repaymentSchedule.is_schedule_complete === 1 || repaymentSchedule.is_schedule_complete === true,
          emiAmount: parseFloat(repaymentSchedule.emi_amount) || 0,
          paymentFrequency: repaymentSchedule.payment_frequency || 'MONTHLY',
          interestRate: parseFloat(repaymentSchedule.interest_rate) || 0,
          scheduleStatus: repaymentSchedule.status || 'PENDING'
        },
        
        currentInstallment: nextInstallment ? {
          installmentNumber: nextInstallment.installmentNo || 1,
          dueDate: nextInstallment.dueDate,
          principal: parseFloat(nextInstallment.principal) || 0,
          interest: parseFloat(nextInstallment.interest) || 0,
          totalPayment: parseFloat(nextInstallment.totalPayment) || 0,
          remainingBalance: parseFloat(nextInstallment.remainingBalance) || 0,
          isOverdue: isNextOverdue,
          status: nextInstallment.status || 'PENDING',
          paidDate: nextInstallment.paidDate || null,
          paidAmount: parseFloat(nextInstallment.paidAmount) || 0,
          transactionReference: nextInstallment.transactionReference || null
        } : null,
        
        // All Installments with full details
        installments: installments?.map(inst => ({
          installmentNumber: inst.installmentNo || 0,
          dueDate: inst.dueDate,
          principal: parseFloat(inst.principal) || 0,
          interest: parseFloat(inst.interest) || 0,
          totalPayment: parseFloat(inst.totalPayment) || 0,
          remainingBalance: parseFloat(inst.remainingBalance) || 0,
          status: inst.status || 'PENDING',
          paidDate: inst.paidDate || null,
          paidAmount: parseFloat(inst.paidAmount) || 0,
          transactionReference: inst.transactionReference || null,
          isOverdue: inst.status === 'PENDING' && inst.dueDate ? new Date(inst.dueDate) < new Date() : false,
          isPaid: inst.status === 'PAID'
        })) || [],
        
        repaymentStats: {
          totalRepayments: repaymentCount
        }
      },
      timestamp: new Date().toISOString()
    };

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('[Get Loan Installments Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve loan installments',
      code: 'INSTALLMENT_FETCH_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ========== GET REPAYMENT HISTORY SERVICE ==========

export const getRepaymentHistoryService = async (ACCT_NO, filters = {}) => {
  try {
    const where = { 
      [Op.or]: [
        { loanAccountNumber: String(ACCT_NO).trim() },
        { loan_account_number: String(ACCT_NO).trim() }
      ]
    };

    if (filters.startDate) {
      where.repaymentDate = { [Op.gte]: filters.startDate };
    }
    if (filters.endDate) {
      where.repaymentDate = { [Op.lte]: filters.endDate };
    }
    if (filters.status) {
      where.status = filters.status;
    }

    const repayments = await LoanRepayment.findAll({ 
      where,
      order: [['repaymentDate', 'DESC']],
      limit: filters.limit || 100,
      offset: filters.offset || 0
    });
    
    return repayments.map(repayment => {
      const repaymentData = repayment.toJSON();
      return {
        ...repaymentData,
        amount: parseFloat(repaymentData.totalAmount || 0),
        principalAmount: parseFloat(repaymentData.principalAmount || 0),
        interestAmount: parseFloat(repaymentData.interestAmount || 0),
        penaltyAmount: parseFloat(repaymentData.penaltyAmount || 0)
      };
    });
  } catch (error) {
    throw new Error(`Error fetching repayment history: ${error.message}`);
  }
};

// ========== GET REPAYMENT HISTORY API ==========

export const getRepaymentHistory = async (req, res) => {
  try {
    const { ACCT_NO } = req.query || req.params || {};

    if (!ACCT_NO) {
      return res.status(400).json({ 
        success: false,
        message: 'Account number is required',
        code: 'MISSING_ACCOUNT_NUMBER',
        timestamp: new Date().toISOString()
      });
    }

    const filters = {
      startDate: req.query?.startDate || null,
      endDate: req.query?.endDate || null,
      status: req.query?.status || null,
      limit: req.pagination?.limit || 50,
      offset: req.pagination?.offset || 0
    };

    const result = await getRepaymentHistoryService(ACCT_NO, filters);
    
    return res.status(200).json({
      success: true,
      message: 'Repayment history retrieved successfully',
      data: result,
      count: result.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[History Error]', error);
    return res.status(500).json({ 
      success: false,
      message: error.message || 'Error fetching repayment history',
      code: 'HISTORY_FETCH_ERROR',
      timestamp: new Date().toISOString()
    });
  }
};

// ========== GET REPAYMENT SUMMARY ==========

export const getRepaymentSummary = async (req, res) => {
  try {
    const { ACCT_NO } = req.params || req.query || {};

    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'ACCT_NO is required',
        code: 'MISSING_ACCOUNT_NUMBER',
        timestamp: new Date().toISOString()
      });
    }

    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: String(ACCT_NO).trim() }
    });

    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_ACCOUNT_NOT_FOUND',
        timestamp: new Date().toISOString()
      });
    }

    const repayments = await LoanRepayment.findAll({
      where: { 
        [Op.or]: [
          { loanAccountNumber: String(ACCT_NO).trim() },
          { loan_account_number: String(ACCT_NO).trim() }
        ],
        status: 'COMPLETED'
      }
    });

    const totalRepaid = repayments.reduce((sum, r) => sum + parseFloat(r.totalAmount || 0), 0);
    const totalPrincipal = repayments.reduce((sum, r) => sum + parseFloat(r.principalAmount || 0), 0);
    const totalInterest = repayments.reduce((sum, r) => sum + parseFloat(r.interestAmount || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        loanDetails: {
          ACCT_NO: loanAccount.ACCT_NO,
          outstandingPrincipal: loanAccount.OUTSTANDING_PRINCIPAL,
          loanStatus: loanAccount.LOAN_STATUS
        },
        repaymentSummary: {
          totalRepayments: repayments.length,
          totalAmount: totalRepaid,
          totalPrincipal: totalPrincipal,
          totalInterest: totalInterest
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Repayment Summary Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get repayment summary',
      code: 'SUMMARY_FETCH_ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ============================================================
// EXPORTS
// ============================================================

export default {
  handleLoanRepayment,
  repayLoan,
  getRepaymentHistory,
  getRepaymentHistoryService,
  getRepaymentSummary,
  getLoanInstallments,
  generateTransactionReference,
  generateReceiptNumber
};