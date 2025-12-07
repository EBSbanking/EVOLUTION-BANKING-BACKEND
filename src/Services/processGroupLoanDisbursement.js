import mongoose from 'mongoose';
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
async function getGLAccountsFromProduct(productId, session) {
  try {
    console.log('Looking for product with PROD_ID:', productId);
    
    // Convert productId to number since PROD_ID is numeric
    const numericProductId = Number(productId);
    
    if (isNaN(numericProductId)) {
      throw new Error(`Invalid product ID: ${productId}. Must be a number`);
    }

    // Query by PROD_ID (numeric field) not _id
    const loanProduct = await LoanProduct.findOne({ PROD_ID: numericProductId }).session(session);
    
    if (!loanProduct) {
      // Try also by productCode as fallback
      const loanProductByCode = await LoanProduct.findOne({ productCode: String(productId) }).session(session);
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
  session,
  loanAccounts, // Array of loan accounts to disburse
  groupLoan, // The group loan document
  createdBy,
  disbursementDate = new Date(),
  transactionReferences = {},
  branchId
}) {
  if (!session) throw new Error('Database session is required');
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
  } = await getGLAccountsFromProduct(productId, session);

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
    const batchPromises = batch.map(loanAccount => 
      processSingleGroupMemberDisbursement({
        session,
        loanAccount,
        groupLoan,
        productDetails,
        glAccounts: { loanGLAccount, interestGLAccountNo, feeGLAccountNo },
        createdBy,
        disbursementDate,
        transactionReferences,
        branchId: branchId || groupLoan.branch
      })
    );

    const batchResults = await Promise.allSettled(batchPromises);
    
    batchResults.forEach((result, index) => {
      const loanAccount = batch[index];
      if (result.status === 'fulfilled') {
        const memberResult = result.value;
        results.successful.push(memberResult);
        results.transactions.push(...memberResult.transactions);
        
        // Accumulate totals
        totalDisbursed.principal += memberResult.loanAmount;
        totalDisbursed.fees += memberResult.feeCollected;
        totalDisbursed.upfrontInterest += memberResult.upfrontInterestCollected;
        totalDisbursed.netAmount += memberResult.netDisbursementToCustomer;
        
        console.log(`✅ Member ${loanAccount.CUST_ID} disbursed successfully`);
      } else {
        results.failed.push({
          memberId: loanAccount.CUST_ID,
          loanAccountNo: loanAccount.ACCT_NO,
          error: result.reason.message,
          reason: 'Disbursement failed'
        });
        console.error(`❌ Member ${loanAccount.CUST_ID} disbursement failed:`, result.reason.message);
      }
    });
  }

  // Update LoanPortfolio
  try {
    await updateLoanPortfolioForGroupDisbursement({
      session,
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
    
    await groupLoan.save({ session });
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
  session,
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
    $or: [
      { account_number: savingsAccountNo },
      { ACCT_NO: savingsAccountNo }
    ]
  }).session(session);

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
  savingsAccount.LEDGER_BALANCE = newBalance;
  savingsAccount.AVAILABLE_BALANCE = newBalance;
  if (savingsAccount.cleared_balance !== undefined) {
    savingsAccount.cleared_balance = newBalance;
  }
  await savingsAccount.save({ session });

  // Create credit transaction
  const creditTransaction = new Transaction({
    TRANSACTION_TYPE: 'CREDIT',
    AMOUNT: netDisbursement,
    ACCT_NM: savingsAccount.ACCT_NM || savingsAccount.account_name || loanAccount.ACCT_NM,
    CUST_ID: loanAccount.CUST_ID,
    BU_ID: branchId || loanAccount.BU_ID || '100',
    ACCT_ID: savingsAccount._id,
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
  });

  transactions.push(creditTransaction);
  await creditTransaction.save({ session });

  // 2. Update loan account to ACTIVE status
  loanAccount.LOAN_STATUS = 'ACTIVE';
  loanAccount.ACTUAL_DISBURSEMENT = netDisbursement;
  loanAccount.DISBURSEMENT_DATE = disbursementDate;
  loanAccount.OUTSTANDING_PRINCIPAL = principalAmount;
  loanAccount.outstanding_balance = principalAmount;
  loanAccount.START_DT = disbursementDate;
  loanAccount.ledger_balance = -principalAmount;
  loanAccount.AVAILABLE_BALANCE = 0;
  loanAccount.IS_DISBURSED = true;
  loanAccount.DISBURSEMENT_STATUS = 'COMPLETED';
  
  // Calculate next payment date based on payment frequency
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
  loanAccount.NEXT_PAYMENT_DATE = nextPaymentDate;

  await loanAccount.save({ session });

  // 3. Update repayment schedule to ACTIVE
  const repaymentSchedule = await RepaymentSchedule.findOne({
    LOAN_ACCOUNT_ID: loanAccount._id
  }).session(session);

  if (repaymentSchedule) {
    repaymentSchedule.STATUS = 'ACTIVE';
    repaymentSchedule.START_DATE = disbursementDate;
    repaymentSchedule.DISBURSEMENT_STATUS = 'COMPLETED';
    
    // Update installment due dates based on actual disbursement date
    if (repaymentSchedule.installments && Array.isArray(repaymentSchedule.installments)) {
      repaymentSchedule.installments = repaymentSchedule.installments.map((installment, index) => {
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
      });
    }
    
    await repaymentSchedule.save({ session });
  }

  // 4. Create GL entries for fees and interest
  if (feeAmount > 0) {
    const feeTransaction = new Transaction({
      TRANSACTION_TYPE: 'DEBIT',
      AMOUNT: feeAmount,
      ACCT_NM: loanAccount.ACCT_NM,
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: branchId || loanAccount.BU_ID || '100',
      ACCT_ID: loanAccount._id,
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
    });

    transactions.push(feeTransaction);
    await feeTransaction.save({ session });
  }

  if (upfrontInterestAmount > 0) {
    const interestTransaction = new Transaction({
      TRANSACTION_TYPE: 'DEBIT',
      AMOUNT: upfrontInterestAmount,
      ACCT_NM: loanAccount.ACCT_NM,
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: branchId || loanAccount.BU_ID || '100',
      ACCT_ID: loanAccount._id,
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
    });

    transactions.push(interestTransaction);
    await interestTransaction.save({ session });
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
  session,
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

    await LoanPortfolio.findOneAndUpdate(
      { 
        BRANCH_ID: branchId,
        PROD_ID: productId,
        YEAR: year,
        MONTH: month
      },
      {
        $inc: {
          TOTAL_DISBURSED: totalDisbursed.principal,
          TOTAL_NET_DISBURSEMENT: totalDisbursed.netAmount,
          TOTAL_PRINCIPAL: totalDisbursed.principal,
          OUTSTANDING_PRINCIPAL: totalDisbursed.principal,
          TOTAL_INTEREST_RECEIVED: totalDisbursed.upfrontInterest,
          TOTAL_FEES_RECEIVED: totalDisbursed.fees,
          NUMBER_OF_LOANS: loanAccounts.length,
          ACTIVE_LOANS: loanAccounts.length,
          DISBURSEMENT_COUNT: 1
        },
        $setOnInsert: {
          BRANCH_ID: branchId,
          PROD_ID: productId,
          PRODUCT_CODE: productDetails.productCode,
          PRODUCT_NAME: productDetails.PRODUCT_SHORT_NAME || productDetails.name,
          PRODUCT_TYPE: 'GROUP_LOAN',
          YEAR: year,
          MONTH: month,
          CURRENCY: productDetails.CRNCY_ID || 'NGN',
          STATUS: 'ACTIVE',
          CREATED_BY: createdBy,
          UPDATED_BY: createdBy,
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
          AVERAGE_LOAN_SIZE: totalDisbursed.principal / loanAccounts.length
        }
      },
      { 
        upsert: true, 
        new: true, 
        session 
      }
    );

    console.log(`✅ Loan portfolio updated for group loan ${groupLoan.loanId}`);
  } catch (error) {
    console.error('Error updating loan portfolio:', error.message);
    throw error;
  }
}



// Export functions
export {
  processGroupLoanDisbursement,
  updateLoanPortfolioForGroupDisbursement,
  processSingleGroupMemberDisbursement,
  getGLAccountsFromProduct,
 
};