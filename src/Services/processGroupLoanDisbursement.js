// utils/groupLoanDisbursement.js - Sequelize Version
import { Op } from 'sequelize';
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanProduct from '../models/LoanProduct.js';
import GroupLoan from '../models/GroupLoan.js';

/**
 * Get GL accounts from product configuration
 */
async function getGLAccountsFromProduct(productId, transaction = null) {
  try {
    console.log('Looking for product with PROD_ID:', productId);
    
    // Convert productId to number since PROD_ID is numeric
    const numericProductId = Number(productId);
    
    if (isNaN(numericProductId)) {
      throw new Error(`Invalid product ID: ${productId}. Must be a number`);
    }

    // Query by PROD_ID (numeric field) not id
    const loanProduct = await LoanProduct.findOne({ 
      where: { PROD_ID: numericProductId },
      transaction 
    });
    
    if (!loanProduct) {
      // Try also by productCode as fallback
      const loanProductByCode = await LoanProduct.findOne({ 
        where: { productCode: String(productId) },
        transaction 
      });
      if (!loanProductByCode) {
        throw new Error(`Product not found with PROD_ID: ${productId}`);
      }
      console.log('Found product by productCode:', loanProductByCode.productCode);
      return extractGLAccounts(loanProductByCode);
    }

    console.log('Found product by PROD_ID:', {
      PROD_ID: loanProduct.PROD_ID,
      productCode: loanProduct.productCode,
      name: loanProduct.name,
      PRODUCT_SHORT_NAME: loanProduct.PRODUCT_SHORT_NAME
    });

    return extractGLAccounts(loanProduct);
    
  } catch (error) {
    console.error('Error fetching product GL accounts:', error);
    throw new Error(`Failed to retrieve GL accounts for product ${productId}: ${error.message}`);
  }
}

/**
 * Helper function to extract GL accounts from product
 */
function extractGLAccounts(loanProduct) {
  // Extract GL accounts from product configuration - NO STATIC DEFAULTS
  const glAccounts = {
    // Loan GL Account - this is the main one (CRITICAL: No static default)
    loanGLAccount: loanProduct.defaultGLAccounts?.loanGLAccount,
    
    // Interest GL Account
    interestGLAccountNo: loanProduct.defaultGLAccounts?.interestGLAccountNo,
    
    // Fee GL Account - check processingFeeGLCode first, then defaultGLAccounts
    feeGLAccountNo: loanProduct.processingFeeGLCode ||
                   loanProduct.defaultGLAccounts?.processingFeeGLCode ||
                   loanProduct.defaultGLAccounts?.feeGLAccountNo,
    
    // Additional GL accounts
    interestPayableGLAccountNo: loanProduct.defaultGLAccounts?.interestPayableGLAccountNo,
    principalGLAccountNo: loanProduct.defaultGLAccounts?.principalGLAccountNo,
    withholdingTaxGLAccountNo: loanProduct.defaultGLAccounts?.withholdingTaxGLAccountNo,
    interestIncomeGLAccountNo: loanProduct.defaultGLAccounts?.interestIncomeGLAccountNo,
    interestReceivableGLAccountNo: loanProduct.defaultGLAccounts?.interestReceivableGLAccountNo
  };

  // Validate required GL accounts
  const requiredAccounts = ['loanGLAccount', 'interestGLAccountNo', 'feeGLAccountNo'];
  const missingAccounts = requiredAccounts.filter(acc => !glAccounts[acc]);
  
  if (missingAccounts.length > 0) {
    console.error('Missing required GL accounts for product:', {
      productCode: loanProduct.productCode,
      PROD_ID: loanProduct.PROD_ID,
      missingAccounts: missingAccounts,
      glAccounts: glAccounts
    });
    throw new Error(`Product ${loanProduct.productCode} is missing required GL accounts: ${missingAccounts.join(', ')}`);
  }

  console.log('Extracted GL accounts for product:', {
    productCode: loanProduct.productCode,
    PROD_ID: loanProduct.PROD_ID,
    glAccounts: glAccounts
  });

  return {
    ...glAccounts,
    productDetails: {
      PROD_ID: loanProduct.PROD_ID,
      productCode: loanProduct.productCode,
      name: loanProduct.name,
      PRODUCT_SHORT_NAME: loanProduct.PRODUCT_SHORT_NAME,
      PRODUCT_TYPE: loanProduct.PRODUCT_TYPE,
      CRNCY_ID: loanProduct.CRNCY_ID || 'NGN',
      PAYMENT_FREQUENCY: loanProduct.PAYMENT_FREQUENCY || 'MONTHLY',
      REPAYMENT_TYPE: loanProduct.REPAYMENT_TYPE || 'MONTHLY',
      processingFeeRate: parseFloat(loanProduct.processingFeeRate?.toString() || '0'),
      interestRate: parseFloat(loanProduct.interestRate?.toString() || loanProduct.DEFAULT_RATE_PER_MONTH?.toString() || '0'),
      minAmount: parseFloat(loanProduct.minAmount?.toString() || '0'),
      maxAmount: parseFloat(loanProduct.maxAmount?.toString() || '0'),
      minTerm: loanProduct.minTerm || loanProduct.MIN_LOAN_TERM_MONTHS || 0,
      maxTerm: loanProduct.maxTerm || loanProduct.MAX_LOAN_TERM_MONTHS || 0,
      TERM_CD: loanProduct.TERM_CD || 'M',
      RATE_TY: loanProduct.RATE_TY || 'FIXED',
      INT_TY: loanProduct.INT_TY || 'SIMPLE',
      AMORTIZED: loanProduct.AMORTIZED !== false,
      STATUS: loanProduct.STATUS || 'ACTIVE',
      defaultGLAccounts: loanProduct.defaultGLAccounts
    }
  };
}

/**
 * Group Loan Disbursement Processor (No Guarantor)
 * Handles disbursement for group loans with multiple members
 */
async function processGroupLoanDisbursement({
  transaction: t,
  loanAccounts, // Array of loan accounts to disburse
  groupLoan, // The group loan document
  createdBy,
  disbursementDate = new Date(),
  transactionReferences = {},
  branchId
}) {
  if (!t) throw new Error('Database transaction is required');
  if (!loanAccounts || !Array.isArray(loanAccounts) || loanAccounts.length === 0) {
    throw new Error('Loan accounts array is required');
  }
  if (!groupLoan) throw new Error('Group loan document is required');
  if (!createdBy) throw new Error('Creator identification is required');

  console.log(`=== STARTING GROUP LOAN DISBURSEMENT FOR ${loanAccounts.length} MEMBERS ===`);

  const results = {
    successful: [],
    failed: [],
    transactions: [],
    portfolioUpdated: false
  };

  const productId = groupLoan.productId;
  const groupLoanId = groupLoan.loanId;
  
  // Get product details with GL accounts
  const { 
    loanGLAccount, 
    interestGLAccountNo, 
    feeGLAccountNo,
    productDetails 
  } = await getGLAccountsFromProduct(productId, t);

  console.log('Using GL accounts for group disbursement:', {
    loanGLAccount,
    interestGLAccountNo,
    feeGLAccountNo,
    productCode: productDetails.productCode
  });

  // Process loan accounts in batches for efficiency
  const batchSize = 20;
  const totalDisbursed = {
    principal: 0,
    fees: 0,
    upfrontInterest: 0,
    netAmount: 0
  };

  for (let i = 0; i < loanAccounts.length; i += batchSize) {
    const batch = loanAccounts.slice(i, i + batchSize);
    
    // Process each member sequentially in batch
    for (const loanAccount of batch) {
      try {
        const memberResult = await processSingleGroupMemberDisbursement({
          transaction: t,
          loanAccount,
          groupLoan,
          productDetails,
          glAccounts: { loanGLAccount, interestGLAccountNo, feeGLAccountNo },
          createdBy,
          disbursementDate,
          transactionReferences,
          branchId: branchId || groupLoan.branch
        });
        
        results.successful.push(memberResult);
        results.transactions.push(...memberResult.transactions);
        
        // Accumulate totals
        totalDisbursed.principal += memberResult.loanAmount;
        totalDisbursed.fees += memberResult.feeCollected;
        totalDisbursed.upfrontInterest += memberResult.upfrontInterestCollected;
        totalDisbursed.netAmount += memberResult.netDisbursementToCustomer;
        
        console.log(`✅ Member ${loanAccount.CUST_ID} disbursed successfully`);
      } catch (error) {
        results.failed.push({
          memberId: loanAccount.CUST_ID,
          loanAccountNo: loanAccount.ACCT_NO,
          error: error.message,
          reason: 'Disbursement failed'
        });
        console.error(`❌ Member ${loanAccount.CUST_ID} disbursement failed:`, error.message);
      }
    }
  }

  // Update LoanPortfolio
  try {
    await updateLoanPortfolioForGroupDisbursement({
      transaction: t,
      groupLoan,
      loanAccounts: results.successful.map(s => s.loanAccount),
      totalDisbursed,
      disbursementDate,
      createdBy,
      glAccounts: { loanGLAccount, interestGLAccountNo, feeGLAccountNo },
      productDetails
    });
    results.portfolioUpdated = true;
    console.log('✅ Loan portfolio updated successfully');
  } catch (portfolioError) {
    console.error('⚠️ Loan portfolio update failed:', portfolioError.message);
    results.portfolioError = portfolioError.message;
  }

  // Update group loan status
  if (results.successful.length > 0) {
    groupLoan.status = results.successful.length === loanAccounts.length ? 'disbursed' : 'partially_disbursed';
    groupLoan.disbursedAt = disbursementDate;
    groupLoan.actualDisbursementDate = disbursementDate;
    groupLoan.netDisbursementAmount = totalDisbursed.netAmount;
    
    await groupLoan.save({ transaction: t });
    console.log(`✅ Group loan ${groupLoanId} status updated to: ${groupLoan.status}`);
  }

  console.log(`=== GROUP LOAN DISBURSEMENT COMPLETED ===`);
  console.log(`Successful: ${results.successful.length}/${loanAccounts.length}`);
  console.log(`Total Principal: ₦${totalDisbursed.principal.toLocaleString()}`);
  console.log(`Total Net Disbursed: ₦${totalDisbursed.netAmount.toLocaleString()}`);

  return {
    success: results.successful.length > 0,
    totalMembers: loanAccounts.length,
    successful: results.successful.length,
    failed: results.failed.length,
    totalDisbursed,
    portfolioUpdated: results.portfolioUpdated,
    glAccounts: { loanGLAccount, interestGLAccountNo, feeGLAccountNo },
    productDetails,
    details: results
  };
}

/**
 * Process disbursement for a single group member
 */
async function processSingleGroupMemberDisbursement({
  transaction: t,
  loanAccount,
  groupLoan,
  productDetails,
  glAccounts,
  createdBy,
  disbursementDate,
  transactionReferences,
  branchId
}) {
  console.log(`Processing disbursement for member ${loanAccount.CUST_ID}, loan ${loanAccount.ACCT_NO}`);

  // Get loan amounts
  const principalAmount = loanAccount.DISBURSEMENT_LIMIT || loanAccount.ORIGINAL_PRINCIPAL || 0;
  const feeAmount = loanAccount.FEE_DETAILS?.totalFees || 0;
  const upfrontInterestAmount = loanAccount.UPFRONT_INTEREST_AMOUNT || loanAccount.FEE_DETAILS?.upfrontInterest || 0;
  
  const netDisbursement = principalAmount - feeAmount - upfrontInterestAmount;
  
  if (netDisbursement <= 0) {
    throw new Error(`Invalid net disbursement amount: ${netDisbursement}`);
  }

  // Get savings account
  const savingsAccountNo = loanAccount.savingsAccountNo;
  if (!savingsAccountNo) {
    throw new Error('No savings account specified');
  }

  const savingsAccount = await CustomerAccount.findOne({
    where: {
      [Op.or]: [
        { account_number: savingsAccountNo },
        { ACCT_NO: savingsAccountNo }
      ]
    },
    transaction: t
  });

  if (!savingsAccount) {
    throw new Error(`Savings account ${savingsAccountNo} not found`);
  }

  // Verify account is active
  const accountStatus = savingsAccount.status || savingsAccount.REC_ST || '';
  if (!['ACTIVE', 'Active', 'A', 'OPEN', 'LIVE'].includes(accountStatus)) {
    throw new Error(`Savings account ${savingsAccountNo} is not active`);
  }

  // Generate transaction IDs
  const timestamp = Date.now();
  const uniqueSuffix = Math.random().toString(36).substring(2, 8);
  const TRANSACTION_ID = Number(`${timestamp}${Math.floor(Math.random() * 1000)}`);
  const EVENT_ID = Number(`${timestamp}${Math.floor(Math.random() * 1000) + 1000}`);
  const JOURNAL_ID = `JNL_${loanAccount.ACCT_NO}_${timestamp}`;

  const transactions = [];

  // 1. Credit loan amount to savings account
  const currentBalance = parseFloat(savingsAccount.LEDGER_BALANCE?.toString() || 
                                   savingsAccount.AVAILABLE_BALANCE?.toString() || 0);
  const newBalance = currentBalance + netDisbursement;

  // Update savings account
  await CustomerAccount.update({
    LEDGER_BALANCE: newBalance,
    AVAILABLE_BALANCE: newBalance,
    cleared_balance: newBalance
  }, {
    where: { id: savingsAccount.id },
    transaction: t
  });

  // Create credit transaction
  const creditTransaction = await Transaction.create({
    TRANSACTION_TYPE: 'CREDIT',
    AMOUNT: netDisbursement,
    ACCT_NM: savingsAccount.ACCT_NM || savingsAccount.account_name || loanAccount.ACCT_NM,
    CUST_ID: loanAccount.CUST_ID,
    BU_ID: branchId || loanAccount.BU_ID || '100',
    ACCT_ID: savingsAccount.id,
    ACCT_NO: savingsAccountNo,
    account_number: savingsAccountNo,
    transaction_type: 'CREDIT',
    amount: netDisbursement,
    description: `Group loan disbursement - ${groupLoan.loanId}`,
    reference: `GL_DISB_${groupLoan.loanId}_${loanAccount.CUST_ID}_${timestamp}`,
    TRAN_PARTICULARS: `Loan disbursement for group loan ${groupLoan.loanId}`,
    transaction_date: disbursementDate,
    TRAN_DATE: disbursementDate,
    VALUE_DATE: disbursementDate,
    STATUS: 'COMPLETED',
    REC_ST: 'A',
    createdBy: createdBy,
    CREATED_BY: createdBy.toString(),
    BALANCE: newBalance,
    AVAILABLE_BALANCE: newBalance,
    LEDGER_BALANCE: newBalance,
    metadata: {
      purpose: 'GROUP_LOAN_DISBURSEMENT',
      groupLoanId: groupLoan.loanId,
      memberId: loanAccount.CUST_ID,
      loanAccountNo: loanAccount.ACCT_NO,
      principalAmount: principalAmount,
      feesDeducted: feeAmount,
      upfrontInterestDeducted: upfrontInterestAmount,
      netDisbursement: netDisbursement,
      glAccountUsed: glAccounts.loanGLAccount,
      productCode: productDetails.productCode
    }
  }, { transaction: t });

  transactions.push(creditTransaction);

  // 2. Update loan account to ACTIVE status
  const nextPaymentDate = new Date(disbursementDate);
  const paymentFrequency = loanAccount.PAYMENT_FREQUENCY || 'MONTHLY';
  
  switch(paymentFrequency.toUpperCase()) {
    case 'DAILY':
      nextPaymentDate.setDate(disbursementDate.getDate() + 1);
      break;
    case 'WEEKLY':
      nextPaymentDate.setDate(disbursementDate.getDate() + 7);
      break;
    case 'BIWEEKLY':
      nextPaymentDate.setDate(disbursementDate.getDate() + 14);
      break;
    case 'MONTHLY':
      nextPaymentDate.setMonth(disbursementDate.getMonth() + 1);
      break;
    default:
      nextPaymentDate.setMonth(disbursementDate.getMonth() + 1);
  }

  await LoanAccount.update({
    LOAN_STATUS: 'ACTIVE',
    ACTUAL_DISBURSEMENT: netDisbursement,
    DISBURSEMENT_DATE: disbursementDate,
    OUTSTANDING_PRINCIPAL: principalAmount,
    outstanding_balance: principalAmount,
    START_DT: disbursementDate,
    ledger_balance: -principalAmount,
    AVAILABLE_BALANCE: 0,
    IS_DISBURSED: true,
    DISBURSEMENT_STATUS: 'COMPLETED',
    NEXT_PAYMENT_DATE: nextPaymentDate
  }, {
    where: { id: loanAccount.id },
    transaction: t
  });

  // 3. Update repayment schedule to ACTIVE
  const repaymentSchedule = await RepaymentSchedule.findOne({
    where: { LOAN_ACCOUNT_ID: loanAccount.id },
    transaction: t
  });

  if (repaymentSchedule) {
    const updatedInstallments = repaymentSchedule.installments && Array.isArray(repaymentSchedule.installments) 
      ? repaymentSchedule.installments.map((installment, index) => {
          const dueDate = new Date(disbursementDate);
          
          switch(paymentFrequency.toUpperCase()) {
            case 'DAILY':
              dueDate.setDate(disbursementDate.getDate() + (index + 1));
              break;
            case 'WEEKLY':
              dueDate.setDate(disbursementDate.getDate() + ((index + 1) * 7));
              break;
            case 'BIWEEKLY':
              dueDate.setDate(disbursementDate.getDate() + ((index + 1) * 14));
              break;
            case 'MONTHLY':
              dueDate.setMonth(disbursementDate.getMonth() + (index + 1));
              break;
            default:
              dueDate.setMonth(disbursementDate.getMonth() + (index + 1));
          }
          
          return {
            ...installment,
            dueDate: dueDate,
            status: index === 0 ? 'DUE' : 'PENDING'
          };
        })
      : [];

    await RepaymentSchedule.update({
      STATUS: 'ACTIVE',
      START_DATE: disbursementDate,
      DISBURSEMENT_STATUS: 'COMPLETED',
      installments: updatedInstallments
    }, {
      where: { id: repaymentSchedule.id },
      transaction: t
    });
  }

  // 4. Create GL entries for fees and interest
  if (feeAmount > 0) {
    const feeTransaction = await Transaction.create({
      TRANSACTION_TYPE: 'DEBIT',
      AMOUNT: feeAmount,
      ACCT_NM: loanAccount.ACCT_NM,
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: branchId || loanAccount.BU_ID || '100',
      ACCT_ID: loanAccount.id,
      ACCT_NO: loanAccount.ACCT_NO,
      account_number: loanAccount.ACCT_NO,
      transaction_type: 'DEBIT',
      amount: feeAmount,
      description: `Loan processing fee - ${groupLoan.loanId}`,
      reference: `GL_FEE_${groupLoan.loanId}_${loanAccount.CUST_ID}_${timestamp}`,
      TRAN_PARTICULARS: `Processing fee for group loan ${groupLoan.loanId}`,
      transaction_date: disbursementDate,
      TRAN_DATE: disbursementDate,
      VALUE_DATE: disbursementDate,
      STATUS: 'COMPLETED',
      REC_ST: 'A',
      createdBy: createdBy,
      CREATED_BY: createdBy.toString(),
      metadata: {
        purpose: 'LOAN_PROCESSING_FEE',
        groupLoanId: groupLoan.loanId,
        memberId: loanAccount.CUST_ID,
        feeType: 'PROCESSING',
        glAccountUsed: glAccounts.feeGLAccountNo,
        productCode: productDetails.productCode
      }
    }, { transaction: t });

    transactions.push(feeTransaction);
  }

  if (upfrontInterestAmount > 0) {
    const interestTransaction = await Transaction.create({
      TRANSACTION_TYPE: 'DEBIT',
      AMOUNT: upfrontInterestAmount,
      ACCT_NM: loanAccount.ACCT_NM,
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: branchId || loanAccount.BU_ID || '100',
      ACCT_ID: loanAccount.id,
      ACCT_NO: loanAccount.ACCT_NO,
      account_number: loanAccount.ACCT_NO,
      transaction_type: 'DEBIT',
      amount: upfrontInterestAmount,
      description: `Upfront interest - ${groupLoan.loanId}`,
      reference: `GL_INT_${groupLoan.loanId}_${loanAccount.CUST_ID}_${timestamp}`,
      TRAN_PARTICULARS: `Upfront interest for group loan ${groupLoan.loanId}`,
      transaction_date: disbursementDate,
      TRAN_DATE: disbursementDate,
      VALUE_DATE: disbursementDate,
      STATUS: 'COMPLETED',
      REC_ST: 'A',
      createdBy: createdBy,
      CREATED_BY: createdBy.toString(),
      metadata: {
        purpose: 'UPFRONT_INTEREST',
        groupLoanId: groupLoan.loanId,
        memberId: loanAccount.CUST_ID,
        interestType: 'UPFRONT',
        glAccountUsed: glAccounts.interestGLAccountNo,
        productCode: productDetails.productCode
      }
    }, { transaction: t });

    transactions.push(interestTransaction);
  }

  return {
    success: true,
    memberId: loanAccount.CUST_ID,
    memberName: loanAccount.ACCT_NM,
    loanAccountNo: loanAccount.ACCT_NO,
    loanAmount: principalAmount,
    feeCollected: feeAmount,
    upfrontInterestCollected: upfrontInterestAmount,
    netDisbursementToCustomer: netDisbursement,
    savingsAccountNo: savingsAccountNo,
    savingsBalanceBefore: currentBalance,
    savingsBalanceAfter: newBalance,
    transactions: transactions,
    loanAccount: loanAccount
  };
}

/**
 * Update LoanPortfolio for group disbursement
 */
async function updateLoanPortfolioForGroupDisbursement({
  transaction: t,
  groupLoan,
  loanAccounts,
  totalDisbursed,
  disbursementDate,
  createdBy,
  glAccounts,
  productDetails
}) {
  try {
    const productId = groupLoan.productId;
    const branchId = groupLoan.branch || '100';
    const month = disbursementDate.getMonth() + 1;
    const year = disbursementDate.getFullYear();

    // Find existing portfolio record
    const existingPortfolio = await LoanPortfolio.findOne({
      where: {
        BRANCH_ID: branchId,
        PROD_ID: productId,
        YEAR: year,
        MONTH: month
      },
      transaction: t
    });

    if (existingPortfolio) {
      // Update existing portfolio
      await LoanPortfolio.update({
        TOTAL_DISBURSED: (existingPortfolio.TOTAL_DISBURSED || 0) + totalDisbursed.principal,
        TOTAL_NET_DISBURSEMENT: (existingPortfolio.TOTAL_NET_DISBURSEMENT || 0) + totalDisbursed.netAmount,
        TOTAL_PRINCIPAL: (existingPortfolio.TOTAL_PRINCIPAL || 0) + totalDisbursed.principal,
        OUTSTANDING_PRINCIPAL: (existingPortfolio.OUTSTANDING_PRINCIPAL || 0) + totalDisbursed.principal,
        TOTAL_INTEREST_RECEIVED: (existingPortfolio.TOTAL_INTEREST_RECEIVED || 0) + totalDisbursed.upfrontInterest,
        TOTAL_FEES_RECEIVED: (existingPortfolio.TOTAL_FEES_RECEIVED || 0) + totalDisbursed.fees,
        NUMBER_OF_LOANS: (existingPortfolio.NUMBER_OF_LOANS || 0) + loanAccounts.length,
        ACTIVE_LOANS: (existingPortfolio.ACTIVE_LOANS || 0) + loanAccounts.length,
        DISBURSEMENT_COUNT: (existingPortfolio.DISBURSEMENT_COUNT || 0) + 1,
        UPDATED_BY: createdBy,
        UPDATED_AT: new Date()
      }, {
        where: { id: existingPortfolio.id },
        transaction: t
      });
    } else {
      // Create new portfolio record
      await LoanPortfolio.create({
        BRANCH_ID: branchId,
        PROD_ID: productId,
        PRODUCT_CODE: productDetails.productCode,
        PRODUCT_NAME: productDetails.PRODUCT_SHORT_NAME || productDetails.name,
        PRODUCT_TYPE: 'GROUP_LOAN',
        YEAR: year,
        MONTH: month,
        CURRENCY: productDetails.CRNCY_ID || 'NGN',
        STATUS: 'ACTIVE',
        TOTAL_DISBURSED: totalDisbursed.principal,
        TOTAL_NET_DISBURSEMENT: totalDisbursed.netAmount,
        TOTAL_PRINCIPAL: totalDisbursed.principal,
        OUTSTANDING_PRINCIPAL: totalDisbursed.principal,
        TOTAL_INTEREST_RECEIVED: totalDisbursed.upfrontInterest,
        TOTAL_FEES_RECEIVED: totalDisbursed.fees,
        NUMBER_OF_LOANS: loanAccounts.length,
        ACTIVE_LOANS: loanAccounts.length,
        DISBURSEMENT_COUNT: 1,
        YIELD_RATE: groupLoan.interestRate || productDetails.interestRate || 0,
        TOTAL_INTEREST_ACCRUED: 0,
        TOTAL_REPAYMENTS: 0,
        TOTAL_RECOVERED: 0,
        TOTAL_DEFAULTS: 0,
        PORTFOLIO_AT_RISK: 0,
        PROVISION_AMOUNT: 0,
        NPL_RATIO: 0,
        COST_OF_FUNDS: 0,
        NET_INTEREST_MARGIN: groupLoan.interestRate || productDetails.interestRate || 0,
        AVERAGE_LOAN_SIZE: loanAccounts.length > 0 ? totalDisbursed.principal / loanAccounts.length : 0,
        CREATED_BY: createdBy,
        UPDATED_BY: createdBy,
        CREATED_AT: new Date(),
        UPDATED_AT: new Date()
      }, { transaction: t });
    }

    console.log(`✅ Loan portfolio updated for group loan ${groupLoan.loanId}`);
  } catch (error) {
    console.error('Error updating loan portfolio:', error.message);
    throw error;
  }
}

/**
 * Get group loan members for disbursement
 */
export async function getGroupLoanMembersForDisbursement(groupLoanId, transaction = null) {
  try {
    const groupLoan = await GroupLoan.findByPk(groupLoanId, { transaction });
    
    if (!groupLoan) {
      throw new Error(`Group loan not found: ${groupLoanId}`);
    }

    if (!groupLoan.approvedMembers || groupLoan.approvedMembers.length === 0) {
      throw new Error(`No approved members found for group loan ${groupLoanId}`);
    }

    // Get loan accounts for approved members
    const loanAccounts = await LoanAccount.findAll({
      where: {
        id: {
          [Op.in]: groupLoan.approvedMembers
        },
        status: 'APPROVED'
      },
      transaction
    });

    if (loanAccounts.length === 0) {
      throw new Error(`No approved loan accounts found for group loan members`);
    }

    return {
      groupLoan,
      loanAccounts,
      totalMembers: loanAccounts.length,
      totalAmount: loanAccounts.reduce((sum, account) => 
        sum + (account.DISBURSEMENT_LIMIT || account.loanAmount || 0), 0
      )
    };
  } catch (error) {
    console.error('Error getting group loan members:', error);
    throw error;
  }
}

/**
 * Validate group loan for disbursement
 */
export function validateGroupLoanForDisbursement(groupLoan, loanAccounts) {
  const errors = [];

  if (!groupLoan) {
    errors.push('Group loan not provided');
  }

  if (groupLoan.status !== 'APPROVED') {
    errors.push(`Group loan status must be APPROVED, current: ${groupLoan.status}`);
  }

  if (!loanAccounts || !Array.isArray(loanAccounts) || loanAccounts.length === 0) {
    errors.push('No loan accounts provided');
  }

  // Check if all loan accounts are approved
  const notApproved = loanAccounts.filter(account => account.status !== 'APPROVED');
  if (notApproved.length > 0) {
    errors.push(`${notApproved.length} loan accounts are not approved`);
  }

  // Check if all have savings accounts
  const noSavingsAccount = loanAccounts.filter(account => !account.savingsAccountNo);
  if (noSavingsAccount.length > 0) {
    errors.push(`${noSavingsAccount.length} members don't have savings accounts`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Main function to process group loan disbursement
 */
export async function processCompleteGroupLoanDisbursement(groupLoanId, userId, branchId, transaction = null) {
  let createdTransaction = false;
  let localTransaction = transaction;
  
  try {
    // Create transaction if not provided
    if (!localTransaction) {
      const { sequelize } = await import('../../config/db.js');
      localTransaction = await sequelize.transaction();
      createdTransaction = true;
    }

    console.log(`🚀 Starting complete group loan disbursement for ${groupLoanId}`);

    // Get group loan and members
    const { groupLoan, loanAccounts } = await getGroupLoanMembersForDisbursement(groupLoanId, localTransaction);
    
    // Validate
    const validation = validateGroupLoanForDisbursement(groupLoan, loanAccounts);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Process disbursement
    const result = await processGroupLoanDisbursement({
      transaction: localTransaction,
      loanAccounts,
      groupLoan,
      createdBy: userId,
      branchId
    });

    // Commit transaction if we created it
    if (createdTransaction) {
      await localTransaction.commit();
    }

    console.log(`✅ Group loan disbursement completed successfully`);
    
    return {
      success: true,
      message: 'Group loan disbursement completed successfully',
      groupLoanId,
      ...result
    };

  } catch (error) {
    // Rollback transaction if we created it
    if (createdTransaction && localTransaction) {
      await localTransaction.rollback();
    }
    
    console.error('❌ Group loan disbursement failed:', error);
    
    return {
      success: false,
      message: `Group loan disbursement failed: ${error.message}`,
      groupLoanId,
      error: error.message
    };
  }
}

// // Export functions
export {
  processGroupLoanDisbursement,
  updateLoanPortfolioForGroupDisbursement,
  processSingleGroupMemberDisbursement,
  getGLAccountsFromProduct,
  // getGroupLoanMembersForDisbursement,
  // validateGroupLoanForDisbursement,
  // processCompleteGroupLoanDisbursement
};

export default {
  processGroupLoanDisbursement,
  updateLoanPortfolioForGroupDisbursement,
  processSingleGroupMemberDisbursement,
  getGLAccountsFromProduct,
  getGroupLoanMembersForDisbursement,
  validateGroupLoanForDisbursement,
  processCompleteGroupLoanDisbursement
};