import PendingDisbursement from '../models/PendingDisbursement.model.js';

// ... your other imports ...

async function initiateDisbursement(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // --- VALIDATION ---
    if (!req.body.workItemId) {
      throw {
        status: 400,
        code: 'MISSING_REQUIRED_FIELDS',
        message: 'Missing workItemId'
      };
    }

    const { workItemId } = req.body;
    const createdBy = req.user?.id || 'system';

    // --- ENTITY LOOKUPS ---
    const [workItem, loanAccount, loanContract, customerAccount] = await Promise.all([
      WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId }).session(session),
      LoanAccount.findOne({ _id: workItem?.entityId }).session(session),
      LoanContractForm.findOne({ loanAccountNo: loanAccount?.ACCT_NO }).session(session),
      CustomerAccount.findOne({ ACCT_NO: loanContract?.fundingAccountNo }).session(session)
    ]);

    // --- VALIDATIONS ---
    if (!workItem) throw { code: 'WORK_ITEM_NOT_FOUND', status: 404 };
    if (!loanAccount) throw { code: 'LOAN_ACCOUNT_NOT_FOUND', status: 404 };
    if (!loanContract) throw { code: 'LOAN_CONTRACT_NOT_FOUND', status: 404 };
    if (!customerAccount) throw { code: 'CUSTOMER_ACCOUNT_NOT_FOUND', status: 404 };

    // --- PREPARE DISBURSEMENT DATA ---
    const loanAmount = parseFloat(loanContract.loan_amount);
    const feeDetails = await new FeeCalculationService().calculateInitialFees({
      loanAmount,
      productId: loanAccount.PROD_ID
    });

    const termMonths = loanContract.TERM_CD === 'M' ? 
      loanContract.loan_term : 
      loanContract.loan_term * 12;
    
    const totalInterest = (loanAmount * (loanContract.interest_rate / 100) * termMonths) / 12;
    let upfrontInterest = 0;
    
    if (loanContract.partialUpfrontInterest) {
      upfrontInterest = totalInterest * (loanContract.upfrontInterestPercentage / 100);
    } else if (loanContract.deductUpfrontInterest) {
      upfrontInterest = totalInterest;
    }

    // --- STORE AS PENDING DISBURSEMENT ---
    const pendingDisbursement = new PendingDisbursement({
      workItemId,
      loanAccountId: loanAccount._id,
      loanAccountNo: loanAccount.ACCT_NO,
      amount: loanAmount,
      transactionData: {
        loanAccount,
        loanContract,
        customerAccount,
        loanAmount,
        feeAmount: feeDetails.totalFees,
        upfrontInterestAmount: upfrontInterest,
        interestRate: loanContract.interest_rate,
        fundingAccountNo: loanContract.fundingAccountNo,
        createdBy,
        productType: loanAccount.PRODUCT_TYPE,
        guarantorDetails: req.body.guarantorDetails
      },
      createdBy
    });

    await pendingDisbursement.save({ session });
    await session.commitTransaction();

    res.status(200).json({
      success: true,
      pendingDisbursementId: pendingDisbursement._id,
      status: 'PENDING',
      message: 'Disbursement initiated and awaiting approval'
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(error.status || 500).json({
      success: false,
      code: error.code || 'DISBURSEMENT_INITIATION_FAILED',
      message: error.message || 'Failed to initiate disbursement'
    });
  } finally {
    session.endSession();
  }
}

async function approveDisbursement(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { pendingDisbursementId } = req.body;
    const approvedBy = req.user?.id || 'system';

    // 1. Retrieve the pending disbursement
    const pendingDisbursement = await PendingDisbursement.findById(pendingDisbursementId)
      .session(session);
    
    if (!pendingDisbursement) {
      throw { code: 'PENDING_DISBURSEMENT_NOT_FOUND', status: 404 };
    }

    if (pendingDisbursement.status !== 'PENDING') {
      throw { code: 'DISBURSEMENT_ALREADY_PROCESSED', status: 400 };
    }

    // 2. Execute the actual disbursement
    const {
      loanAccount,
      loanContract,
      customerAccount,
      loanAmount,
      feeAmount,
      upfrontInterestAmount,
      interestRate,
      fundingAccountNo,
      createdBy,
      productType,
      guarantorDetails
    } = pendingDisbursement.transactionData;

    // Generate fresh transaction IDs for the actual execution
    const ids = generateTransactionId();

    // 3. Process the full disbursement
    const disbursementResult = await processDisbursement({
      session,
      loanContract,
      repaymentSchedule: await calculateEMI({
        principal: loanAmount,
        annualRate: interestRate,
        termMonths: loanContract.TERM_CD === 'M' ? 
          loanContract.loan_term : 
          loanContract.loan_term * 12,
        remainingInterest: (loanAmount * (interestRate / 100) * termMonths) / 12 - upfrontInterestAmount,
        startDate: new Date(loanContract.disbursementDate)
      }),
      loanProduct: await LoanProduct.findById(loanAccount.PROD_ID).session(session),
      totalFees: feeAmount,
      interestRate,
      PRODUCT_TYPE: productType,
      deductUpfrontInterest: loanContract.deductUpfrontInterest,
      partialUpfrontInterest: loanContract.partialUpfrontInterest,
      upfrontInterestAmount,
      upfrontInterestPercentage: loanContract.upfrontInterestPercentage,
      guarantorDetails,
      guaranteedAmount: req.body.guaranteedAmount,
      TRANSACTION_ID: ids.TRANSACTION_ID,
      EVENT_ID: ids.EVENT_ID,
      JOURNAL_ID: ids.JOURNAL_ID,
      workflowId: pendingDisbursement.workItemId
    });

    // 4. Update the pending disbursement status
    pendingDisbursement.status = 'APPROVED';
    pendingDisbursement.approvedBy = approvedBy;
    pendingDisbursement.approvedAt = new Date();
    await pendingDisbursement.save({ session });

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      data: disbursementResult,
      message: 'Loan successfully disbursed'
    });

  } catch (error) {
    await session.abortTransaction();
    res.status(error.status || 500).json({
      success: false,
      code: error.code || 'DISBURSEMENT_APPROVAL_FAILED',
      message: error.message || 'Failed to approve disbursement'
    });
  } finally {
    session.endSession();
  }
}

export {
  processLoanDisbursementTransactions,
  processDisbursement,
  initiateDisbursement,
  approveDisbursement
};