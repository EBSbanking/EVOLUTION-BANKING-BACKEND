import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { generateTransactionId } from '../utils/generateLoanAccountId.js';

/**
 * Internal utility: Handles disbursement transaction logic with proper double-entry accounting
 * Banking Standard: Debit Loan Account (Asset), Credit Customer Account (Liability)
 */
async function processLoanDisbursementTransactions({
  session,
  loanAccount,
  customerAccount,
  AMOUNT,
  loanFeeAmount = 0,
  fundingAcctNo,
  ACCT_NO,
  CREATED_BY,
  DISBURSEMENT_DATE = new Date(),
  INTEREST_RATE,
  FEE_TYPE = 'PROCESSING_FEE',
  PRODUCT_TYPE,
  deductUpfrontInterest = false,
  partialUpfrontInterest = false,
  upfrontInterestAmount = 0,
  upfrontInterestPercentage = 0,
  guarantorId,
  guaranteedAmount = 0,
  guarantorName,
  TRANSACTION_ID,
  EVENT_ID,
  JOURNAL_ID,
  transactionReferences = {}
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
  
  // Calculate net amount customer receives
  const netDisbursement = disbursementAmount - feeAmount - upfrontInterestAmount;

  if (netDisbursement <= 0) {
    throw new Error('Net disbursement amount must be greater than zero after fees and upfront interest');
  }

  // Generate unique transaction references
  const timestamp = Date.now();
  const uniqueSuffix = Math.random().toString(36).substring(2, 8);
  
  const refs = { ...transactionReferences };
  
  // If no references provided, generate unique ones
  if (!refs.main) refs.main = `LOAN-${ACCT_NO}-${timestamp}-${uniqueSuffix}`;
  if (!refs.fee) refs.fee = `FEE-${ACCT_NO}-${timestamp}-${uniqueSuffix}`;
  if (!refs.interest) refs.interest = `INT-${ACCT_NO}-${timestamp}-${uniqueSuffix}`;

  console.log('Using transaction references:', refs);

  // Update loan account status and balances
  Object.assign(loanAccount, {
    PRIMARY_OFFICER_ID: loanAccount.PRIMARY_OFFICER_ID || CREATED_BY || 'system',
    JOURNAL_ID,
    TRANSACTION_ID,
    EVENT_ID,
    LEDGER_BALANCE: disbursementAmount, // Full loan amount
    CLEARED_BALANCE: disbursementAmount,
    AVAILABLE_BALANCE: disbursementAmount,
    OUTSTANDING_BALANCE: disbursementAmount,
    OUTSTANDING_PRINCIPAL: disbursementAmount,
    DEDUCT_UPFRONT_INTEREST: deductUpfrontInterest,
    PARTIAL_UPFRONT_INTEREST: partialUpfrontInterest,
    UPFRONT_INTEREST_PERCENTAGE: partialUpfrontInterest ? upfrontInterestPercentage : null,
    UPFRONT_INTEREST_AMOUNT: upfrontInterestAmount,
    GUARANTOR_ID: guarantorId,
    GUARANTEED_AMOUNT: guaranteedAmount,
    HAS_GUARANTOR: !!guarantorId,
    LOAN_STATUS: 'ACTIVE',
    DISBURSEMENT_DATE: transactionDate,
    LAST_UPDATED: new Date()
  });

  await loanAccount.save({ session });

  const transactionsToCreate = [];

  // ===== MAIN DISBURSEMENT TRANSACTION =====
  // BANKING STANDARD: Debit Loan Account (Asset), Credit Customer Account (Liability)
  transactionsToCreate.push({
    TRANSACTION_ID,
    EVENT_ID,
    TRAN_JOURNAL_ID: JOURNAL_ID,
    ACCT_ID: loanAccount._id,
    ACCT_NO,
    ACCT_NM: customerAccount.ACCT_NM || 'UNKNOWN',
    CUST_ID: loanAccount.CUST_ID,
    BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
    debitAccount: ACCT_NO, // DEBIT: Loan Account (Asset increases)
    creditAccount: fundingAcctNo, // CREDIT: Customer Account (Liability increases)
    AMOUNT: disbursementAmount, // Full loan amount
    TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
    TRANSACTIONDATE: transactionDate,
    createdBy: CREATED_BY,
    status: 'COMPLETED',
    description: `Loan disbursement - ${PRODUCT_TYPE}`,
    reference: refs.main,
    metadata: {
      disbursementDate: transactionDate.toISOString(),
      interestRate,
      PRODUCT_TYPE,
      totalLoanAmount: disbursementAmount,
      netAmountToCustomer: netDisbursement,
      fees: feeAmount,
      upfrontInterest: upfrontInterestAmount,
      guarantorId,
      guarantorName,
      guaranteedAmount
    }
  });

  // ===== FEE TRANSACTION =====
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
      debitAccount: fundingAcctNo, // DEBIT: Customer Account (reduce liability)
      creditAccount: `${ACCT_NO}-FEES`, // CREDIT: Fee Income Account
      AMOUNT: feeAmount,
      TRANSACTION_TYPE: 'LOAN_FEE',
      TRANSACTIONDATE: transactionDate,
      createdBy: CREATED_BY,
      status: 'COMPLETED',
      description: `${FEE_TYPE} charged for loan disbursement`,
      reference: refs.fee,
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

  // ===== UPFRONT INTEREST TRANSACTION =====
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
      debitAccount: fundingAcctNo, // DEBIT: Customer Account (reduce liability)
      creditAccount: `${ACCT_NO}-INTEREST`, // CREDIT: Interest Income Account
      AMOUNT: upfrontInterestAmount,
      TRANSACTION_TYPE: 'LOAN_INTEREST',
      TRANSACTIONDATE: transactionDate,
      createdBy: CREATED_BY,
      status: 'COMPLETED',
      description: `${partialUpfrontInterest ? 'Partial' : 'Full'} upfront interest`,
      reference: refs.interest,
      metadata: {
        interestType: partialUpfrontInterest ? 'PARTIAL_UPFRONT' : 'FULL_UPFRONT',
        percentage: partialUpfrontInterest ? upfrontInterestPercentage : null,
        guarantorId,
        guarantorName,
        guaranteedAmount
      }
    });
  }

  console.log('Creating transactions with proper double-entry accounting:', transactionsToCreate.map(t => ({
    type: t.TRANSACTION_TYPE,
    debit: t.debitAccount,
    credit: t.creditAccount,
    amount: t.AMOUNT
  })));

  // Save all transactions
  try {
    const createdTransactions = await Transaction.insertMany(transactionsToCreate, { session });
    console.log('Transactions created successfully:', createdTransactions.length);
  } catch (error) {
    console.error('Error creating transactions:', error);
    if (error.code === 11000) {
      console.error('Duplicate key error details:', {
        transactions: transactionsToCreate.map(t => ({
          TRANSACTION_TYPE: t.TRANSACTION_TYPE,
          reference: t.reference
        }))
      });
    }
    throw error;
  }

  // ===== UPDATE CUSTOMER ACCOUNT BALANCES =====
  try {
    // Customer receives NET amount (after fees and upfront interest)
    await CustomerAccount.updateOne(
      { ACCT_NO: fundingAcctNo },
      {
        $inc: {
          LEDGER_BALANCE: netDisbursement,
          CLEARED_BALANCE: netDisbursement,
          AVAILABLE_BALANCE: netDisbursement
        },
        $set: {
          LAST_UPDATED: new Date()
        }
      },
      { session }
    );
    console.log(`Customer account ${fundingAcctNo} credited with net amount: ${netDisbursement}`);
  } catch (error) {
    console.error('Error updating customer account balances:', error);
    throw new Error(`Failed to update customer account balances: ${error.message}`);
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
    transactions: transactionsToCreate,
    transactionReferences: refs,
    guarantorDetails: { guarantorId, guarantorName, guaranteedAmount },
    transactionIds: {
      TRANSACTION_ID,
      EVENT_ID,
      JOURNAL_ID
    },
    accountingSummary: {
      totalLoanAmount: disbursementAmount,
      feesDeducted: feeAmount,
      upfrontInterestDeducted: upfrontInterestAmount,
      netToCustomer: netDisbursement,
      principle: 'Debit Loan Account (Asset), Credit Customer Account (Liability)'
    }
  };
}

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
  workflowId,
  transactionReferences = {}
}) {
  if (!session) throw new Error('Database session is required');
  if (!loanContract?.loanAccountNo || !loanContract?.customer_id) {
    throw new Error('Invalid loan contract data: loanAccountNo and customer_id are required');
  }

  if (!loanContract.loan_amount || loanContract.loan_amount <= 0) {
    throw new Error('Invalid loan amount');
  }

  if (!repaymentSchedule || !Array.isArray(repaymentSchedule) || repaymentSchedule.length === 0) {
    throw new Error('Valid repayment schedule is required');
  }

  // Validate guarantor details if provided
  if (guarantorDetails) {
    const requiredFields = ['name', 'phone', 'relationship', 'guarantorNumberId'];
    const missingFields = requiredFields.filter(field => !guarantorDetails[field]);
    
    if (missingFields.length > 0) {
      throw new Error(`Guarantor details are incomplete. Missing: ${missingFields.join(', ')}`);
    }
  }

  // Generate IDs if not provided
  if (!TRANSACTION_ID || !EVENT_ID || !JOURNAL_ID) {
    const ids = generateTransactionId();
    TRANSACTION_ID = ids.TRANSACTION_ID;
    EVENT_ID = ids.EVENT_ID;
    JOURNAL_ID = ids.JOURNAL_ID;
  }

  // Create loan account
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
    workflowId,
    CREATED_BY: loanContract.USER_ID || 'system',
    CREATED_DATE: new Date(),
    LAST_UPDATED: new Date()
  });

  await loan.save({ session });

  // Create repayment schedule
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
    GUARANTEED_AMOUNT: guaranteedAmount,
    CREATED_DATE: new Date()
  }));

  await RepaymentSchedule.insertMany(scheduleData, { session });

  // Find customer account for funding
  const customerAccount = await CustomerAccount.findOne({
    ACCT_NO: loanContract.fundingAccountNo
  }).session(session);

  if (!customerAccount) {
    throw new Error(`Customer account not found: ${loanContract.fundingAccountNo}`);
  }

  // Process transactions - NO GL PARAMETERS NEEDED (handled by product mapping)
  const transactionResult = await processLoanDisbursementTransactions({
    session,
    loanAccount: loan,
    customerAccount,
    AMOUNT: loanContract.loan_amount,
    loanFeeAmount: totalFees,
    fundingAcctNo: loanContract.fundingAccountNo,
    ACCT_NO: loan.ACCT_NO,
    CREATED_BY: loanContract.USER_ID || 'system',
    DISBURSEMENT_DATE: new Date(loanContract.disbursementDate),
    INTEREST_RATE: interestRate,
    FEE_TYPE: 'PROCESSING_FEE',
    PRODUCT_TYPE,
    deductUpfrontInterest,
    partialUpfrontInterest,
    upfrontInterestAmount,
    upfrontInterestPercentage,
    guarantorId: guarantorDetails?.guarantorId,
    guaranteedAmount,
    guarantorName: guarantorDetails?.name,
    TRANSACTION_ID,
    EVENT_ID,
    JOURNAL_ID,
    transactionReferences
  });

  return {
    success: true,
    loanAccount: loan,
    transactions: transactionResult.transactions,
    transactionReferences: transactionResult.transactionReferences,
    upfrontInterest: transactionResult.upfrontInterest,
    guarantorDetails: transactionResult.guarantorDetails,
    transactionIds: transactionResult.transactionIds,
    workflowId,
    repaymentSchedule: scheduleData.length,
    accountingSummary: transactionResult.accountingSummary
  };
}

export {
  processLoanDisbursementTransactions,
  processDisbursement
};