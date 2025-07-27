import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { generateTransactionId } from '../utils/generateLoanAccountId.js';

/**
 * Internal utility: Handles disbursement transaction logic.
 */
async function processLoanDisbursementTransactions({
  session,
  loanAccount,
  customerAccount,
  AMOUNT,
  loanFeeAmount = 0,
  fundingAcctNo,
  ACCT_NO,
  glAccountNo = '1-02-100-105-103-1',
  portfolioGLAcctNo = '1-002-102-5-200-1',
  CREATED_BY,
  DISBURSEMENT_DATE = new Date(),
  INTEREST_RATE,
  FEE_TYPE = 'PROCESSING_FEE',
  PAYMENT_SOURCE = 'LOAN_FUNDING_SOURCE',
  PRODUCT_TYPE,
  deductUpfrontInterest = false,
  partialUpfrontInterest = false,
  upfrontInterestAmount = 0,
  upfrontInterestPercentage = 0,
  interestIncomeAccount = '1-01-400-100-100-1',
  guarantorId,
  guaranteedAmount = 0,
  guarantorName,
  TRANSACTION_ID,
  EVENT_ID,
  JOURNAL_ID
}) {
  if (!session) throw new Error('Database session is required');
  if (!loanAccount || !customerAccount) throw new Error('Loan and customer accounts are required');
  if (!fundingAcctNo || !ACCT_NO) throw new Error('Account numbers are required');
  if (!CREATED_BY) throw new Error('Creator identification is required');

  if (!TRANSACTION_ID || !EVENT_ID || !JOURNAL_ID) {
    const ids = generateTransactionId();
    TRANSACTION_ID = ids.TRANSACTION_ID;
    EVENT_ID = ids.EVENT_ID;
    JOURNAL_ID = ids.JOURNAL_ID;
  }

  const disbursementAmount = Number(AMOUNT);
  const feeAmount = Number(loanFeeAmount);
  upfrontInterestAmount = Number(upfrontInterestAmount);
  const interestRate = Number(INTEREST_RATE);
  const transactionDate = new Date(DISBURSEMENT_DATE);
  const netDisbursement = disbursementAmount - feeAmount - upfrontInterestAmount;

  Object.assign(loanAccount, {
    PRIMARY_OFFICER_ID: loanAccount.PRIMARY_OFFICER_ID || CREATED_BY || 'system',
    JOURNAL_ID,
    TRANSACTION_ID,
    EVENT_ID,
    LEDGER_BALANCE: netDisbursement,
    CLEARED_BALANCE: netDisbursement,
    AVAILABLE_BALANCE: netDisbursement,
    OUTSTANDING_BALANCE: disbursementAmount,
    OUTSTANDING_PRINCIPAL: disbursementAmount,
    DEDUCT_UPFRONT_INTEREST: deductUpfrontInterest,
    PARTIAL_UPFRONT_INTEREST: partialUpfrontInterest,
    UPFRONT_INTEREST_PERCENTAGE: partialUpfrontInterest ? upfrontInterestPercentage : null,
    UPFRONT_INTEREST_AMOUNT: upfrontInterestAmount,
    GUARANTOR_ID: guarantorId,
    GUARANTEED_AMOUNT: guaranteedAmount,
    HAS_GUARANTOR: !!guarantorId,
    LOAN_STATUS: 'ACTIVE'
  });

  await loanAccount.save({ session });

  const transactionsToCreate = [];

  // 1. Fee transaction
  if (feeAmount > 0) {
    transactionsToCreate.push({
      TRANSACTION_ID: `${TRANSACTION_ID}-FEE`,
      EVENT_ID,
      TRAN_JOURNAL_ID: JOURNAL_ID,
      ACCT_ID: loanAccount._id,
      ACCT_NO,
      ACCT_NM: customerAccount.ACCT_NM || 'UNKNOWN',
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
      debitAccount: fundingAcctNo,
      creditAccount: glAccountNo,
      AMOUNT: feeAmount,
      TRANSACTION_TYPE: 'LOAN_FEE',
      TRANSACTIONDATE: transactionDate,
      createdBy: CREATED_BY,
      status: 'COMPLETED',
      description: `${FEE_TYPE} charged for loan disbursement`,
      metadata: {
        loanAccountNo: ACCT_NO,
        feeType: FEE_TYPE,
        PRODUCT_TYPE,
        guarantorId,
        guarantorName,
        guaranteedAmount
      }
    });
  }

  // 2. Upfront interest transaction
  if (upfrontInterestAmount > 0) {
    transactionsToCreate.push({
      TRANSACTION_ID: `${TRANSACTION_ID}-INT`,
      EVENT_ID,
      TRAN_JOURNAL_ID: JOURNAL_ID,
      ACCT_ID: loanAccount._id,
      ACCT_NO,
      ACCT_NM: customerAccount.ACCT_NM || 'UNKNOWN',
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
      debitAccount: fundingAcctNo,
      creditAccount: interestIncomeAccount,
      AMOUNT: upfrontInterestAmount,
      TRANSACTION_TYPE: 'LOAN_INTEREST',
      TRANSACTIONDATE: transactionDate,
      createdBy: CREATED_BY,
      status: 'COMPLETED',
      description: `${partialUpfrontInterest ? 'Partial' : 'Full'} upfront interest`,
      metadata: {
        interestType: partialUpfrontInterest ? 'PARTIAL_UPFRONT' : 'FULL_UPFRONT',
        percentage: partialUpfrontInterest ? upfrontInterestPercentage : null,
        guarantorId,
        guarantorName,
        guaranteedAmount
      }
    });

    const insurancePayableGL = '1-02-400-200-100-1';
    transactionsToCreate.push({
      TRANSACTION_ID: `${TRANSACTION_ID}-INSURANCE`,
      EVENT_ID,
      TRAN_JOURNAL_ID: JOURNAL_ID,
      ACCT_ID: loanAccount._id,
      ACCT_NO,
      ACCT_NM: customerAccount.ACCT_NM || 'UNKNOWN',
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
      debitAccount: fundingAcctNo,
      creditAccount: insurancePayableGL,
      AMOUNT: upfrontInterestAmount,
      TRANSACTION_TYPE: 'INSURANCE_PREMIUM',
      TRANSACTIONDATE: transactionDate,
      createdBy: CREATED_BY,
      status: 'COMPLETED',
      description: 'Insurance premium charged',
      metadata: {
        guarantorId,
        PRODUCT_TYPE
      }
    });
  }

  // 3. Loan disbursement transaction
  transactionsToCreate.push({
    TRANSACTION_ID,
    EVENT_ID,
    TRAN_JOURNAL_ID: JOURNAL_ID,
    ACCT_ID: loanAccount._id,
    ACCT_NO,
    ACCT_NM: customerAccount.ACCT_NM || 'UNKNOWN',
    CUST_ID: loanAccount.CUST_ID,
    BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
    debitAccount: portfolioGLAcctNo,
    creditAccount: fundingAcctNo,
    AMOUNT: netDisbursement,
    TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
    TRANSACTIONDATE: transactionDate,
    createdBy: CREATED_BY,
    status: 'COMPLETED',
    description: 'Loan amount disbursed',
    metadata: {
      disbursementDate: transactionDate,
      interestRate,
      PRODUCT_TYPE,
      netDisbursementAmount: netDisbursement,
      upfrontInterestAmount,
      guarantorId,
      guarantorName,
      guaranteedAmount
    }
  });

  // 4. Loan liability transaction
  transactionsToCreate.push({
    TRANSACTION_ID: `${TRANSACTION_ID}-LIAB`,
    EVENT_ID,
    TRAN_JOURNAL_ID: JOURNAL_ID,
    ACCT_ID: loanAccount._id,
    ACCT_NO,
    ACCT_NM: customerAccount.ACCT_NM || 'UNKNOWN',
    CUST_ID: loanAccount.CUST_ID,
    BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
    debitAccount: ACCT_NO,
    creditAccount: portfolioGLAcctNo,
    AMOUNT: netDisbursement,
    TRANSACTION_TYPE: 'LOAN_LIABILITY',
    TRANSACTIONDATE: transactionDate,
    createdBy: CREATED_BY,
    status: 'COMPLETED',
    description: 'Loan liability recorded',
    metadata: {
      interestRate,
      PRODUCT_TYPE,
      netDisbursementAmount: netDisbursement,
      upfrontInterestAmount,
      upfrontInterestPercentage: partialUpfrontInterest ? upfrontInterestPercentage : null,
      guarantorId,
      guarantorName,
      guaranteedAmount
    }
  });

  // Save all transactions
  const createdTransactions = await Transaction.insertMany(transactionsToCreate, { session });

  // 2. Update CustomerAccount - fund gross amount
  await CustomerAccount.updateOne(
    { ACCT_NO: fundingAcctNo },
    {
      $inc: {
        LEDGER_BALANCE: disbursementAmount,
        CLEARED_BALANCE: disbursementAmount,
        AVAILABLE_BALANCE: disbursementAmount
      }
    },
    { session }
  );

  // 3. Deduct fee from CustomerAccount
  if (feeAmount > 0) {
    await CustomerAccount.updateOne(
      { ACCT_NO: fundingAcctNo },
      {
        $inc: {
          LEDGER_BALANCE: -feeAmount,
          CLEARED_BALANCE: -feeAmount,
          AVAILABLE_BALANCE: -feeAmount
        }
      },
      { session }
    );
  }

  // 4. Deduct upfront interest or insurance
  if (upfrontInterestAmount > 0) {
    await CustomerAccount.updateOne(
      { ACCT_NO: fundingAcctNo },
      {
        $inc: {
          LEDGER_BALANCE: -upfrontInterestAmount,
          CLEARED_BALANCE: -upfrontInterestAmount,
          AVAILABLE_BALANCE: -upfrontInterestAmount
        }
      },
      { session }
    );
  }

  return {
    success: true,
    disbursementAmount: netDisbursement,
    feeAmount,
    upfrontInterest: {
      type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
      amount: upfrontInterestAmount,
      percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
    },
    interestRate,
    PRODUCT_TYPE,
    transactions: createdTransactions,
    guarantorDetails: { guarantorId, guarantorName, guaranteedAmount },
    transactionIds: {
      TRANSACTION_ID,
      EVENT_ID,
      JOURNAL_ID
    }
  };
};


/**
 * Public wrapper function for complete disbursement flow
 */
async function processDisbursement({
  session,
  loanContract,
  repaymentSchedule,
  loanProduct,
  totalFees,
  interestRate,
  PRODUCT_TYPE,
  deductUpfrontInterest = false,
  partialUpfrontInterest = false,
  upfrontInterestAmount = 0,
  upfrontInterestPercentage = 0,
  guarantorDetails,
  guaranteedAmount,
  TRANSACTION_ID,
  EVENT_ID,
  JOURNAL_ID,
  workflowId
}) {
  if (!session) throw new Error('Database session is required');
  if (!loanContract?.loanAccountNo || !loanContract?.customer_id) {
    throw new Error('Invalid loan contract data');
  }

  if (guarantorDetails && !(
    guarantorDetails.name &&
    guarantorDetails.phone &&
    guarantorDetails.relationship &&
    guarantorDetails.guarantorNumberId
  )) {
    throw new Error('Guarantor details are incomplete');
  }

  const loan = new LoanAccount({
    JOURNAL_ID,
    CUST_ID: loanContract.customer_id,
    ACCT_NM: loanContract.borrower_name,
    ACCT_NO: loanContract.loanAccountNo,
    APPL_ID: loanContract.applicationId,
    CRNCY_ID: 'NGN',
    BU_ID: loanContract.bu_id || 'DEFAULT_BU',
    PRIMARY_OFFICER_ID: loanContract.USER_ID || 'system',
    DISBURSEMENT_LIMIT: loanContract.loan_amount,
    ACTUAL_DISBURSEMENT: loanContract.loan_amount - totalFees - upfrontInterestAmount,
    START_DT: new Date(loanContract.disbursementDate) || new Date(),
    TERM_CD: loanContract.TERM_CD,
    TERM_VALUE: loanContract.loan_term,
    MATURITY_DT: new Date(loanContract.maturityDate),
    TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
    INTEREST_RATE: interestRate,
    INTEREST_RATE_ID: loanContract.interestRateId || 1,
    PROD_ID: loanContract.productDetails?.productId || loanProduct.productId,
    PRODUCT_TYPE: PRODUCT_TYPE || loanContract.productDetails?.productType || 'UNKNOWN',
    LOAN_STATUS: 'ACTIVE',
    PAYMENT_FREQUENCY: loanProduct.paymentFrequency || 'MONTHLY',
    DEDUCT_UPFRONT_INTEREST: deductUpfrontInterest,
    PARTIAL_UPFRONT_INTEREST: partialUpfrontInterest,
    UPFRONT_INTEREST_PERCENTAGE: partialUpfrontInterest ? upfrontInterestPercentage : null,
    UPFRONT_INTEREST_AMOUNT: upfrontInterestAmount,
    GUARANTOR_ID: guarantorDetails?.guarantorId,
    GUARANTEED_AMOUNT: guaranteedAmount,
    HAS_GUARANTOR: !!guarantorDetails,
    guarantorDetails: guarantorDetails ? {
      name: guarantorDetails.name,
      phone: guarantorDetails.phone,
      relationship: guarantorDetails.relationship,
      guarantorNumberId: String(guarantorDetails.guarantorNumberId),
      ...(guarantorDetails.email && { email: guarantorDetails.email }),
      ...(guarantorDetails.address && { address: guarantorDetails.address })
    } : undefined,
    TRANSACTION_ID,
    EVENT_ID,
    workflowId
  });

  await loan.save({ session });

  const scheduleData = repaymentSchedule.map((item, index) => ({
    LOAN_ACCOUNT_ID: loan._id,
    CUST_ID: loan.CUST_ID,
    ACCT_NO: loan.ACCT_NO,
    EVENT_ID,
    TRANSACTION_ID,
    TERM_TYPE: loan.TERM_CD,
    TERM: loan.TERM_VALUE,
    INTEREST_RATE: interestRate,
    PRINCIPAL_AMOUNT: loanContract.loan_amount,
    MATURITY_DATE: loan.MATURITY_DT,
    START_DATE: loan.START_DT,
    installmentNo: index + 1,
    dueDate: item.dueDate,
    principal: item.principal,
    interest: item.interest,
    totalPayment: item.totalPayment,
    remainingBalance: item.remainingBalance,
    status: 'PENDING',
    CREATED_BY: loanContract.USER_ID || 'system',
    UPFRONT_INTEREST: {
      type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
      amount: upfrontInterestAmount,
      percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
    },
    GUARANTOR_ID: guarantorDetails?.guarantorId,
    GUARANTEED_AMOUNT: guaranteedAmount
  }));

  await RepaymentSchedule.insertMany(scheduleData, { session });

  const customerAccount = await CustomerAccount.findOne({
    ACCT_NO: loanContract.fundingAccountNo
  }).session(session);

  if (!customerAccount) throw new Error('Customer account not found');

  const transactionResult = await processLoanDisbursementTransactions({
    session,
    loanAccount: loan,
    customerAccount,
    AMOUNT: loanContract.loan_amount,
    loanFeeAmount: totalFees,
    fundingAcctNo: loanContract.fundingAccountNo,
    ACCT_NO: loan.ACCT_NO,
    glAccountNo: loanProduct.feeIncomeAccount,
    portfolioGLAcctNo: loanProduct.fundingSource,
    CREATED_BY: loanContract.USER_ID || 'system',
    DISBURSEMENT_DATE: new Date(loanContract.disbursementDate),
    INTEREST_RATE: interestRate,
    FEE_TYPE: 'PROCESSING_FEE',
    PAYMENT_SOURCE: 'LOAN_FUNDING_SOURCE',
    PRODUCT_TYPE,
    deductUpfrontInterest,
    partialUpfrontInterest,
    upfrontInterestAmount,
    upfrontInterestPercentage,
    interestIncomeAccount: loanProduct.interestIncomeAccount,
    guarantorId: guarantorDetails?.guarantorId,
    guaranteedAmount,
    guarantorName: guarantorDetails?.name,
    TRANSACTION_ID,
    EVENT_ID,
    JOURNAL_ID
  });

  return {
    success: true,
    loanAccount: loan,
    transactions: transactionResult.transactions,
    upfrontInterest: transactionResult.upfrontInterest,
    guarantorDetails: transactionResult.guarantorDetails,
    transactionIds: transactionResult.transactionIds,
    workflowId
  };
}

export {
  processLoanDisbursementTransactions,
  processDisbursement
};
