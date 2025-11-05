import mongoose from 'mongoose';
import { addDays } from 'date-fns';
import { calculateEMI, calculateDailyInterest } from './LoanInterestRateController.js';

// Models
import LoanAccount from '../models/LoanAccount.js';
import Guarantor from '../models/Guarantor.js';
import RepaymentSchedules from '../models/RepaymentSchedules.js';
import LoanContractForm from '../models/LoanContractForm.js';
import GuarantorAudit from '../models/GuarantorAudit.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import RateIndex from '../models/Rate-Index.js';
import LoanInterestRate from '../models/loanInterestRate.js';
import Counter from '../models/Counter.js';
import GLAccount from '../models/GLAccount.js';

// Services
import InterestCalculationService from '../Services/InterestCalculationService.js';
import FeeCalculationService from '../Services/FeeCalculationService.js';

// Controllers
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';

// Utils
import { 
  GenerateLoanContractFormId, 
  generateAccountNumberByProdId,
  generateTransactionIds 
} from '../utils/generateAccountNumber.js';
import { generateGuarantorId } from '../utils/generateGuarantorId.js';

const toDecimal = (val) => val ? mongoose.Types.Decimal128.fromString(val.toString()) : undefined;

// Helper functions
function calculateMaturityDate(startDate, termCode, termValue) {
  const date = new Date(startDate);
  switch (termCode) {
    case 'D': date.setDate(date.getDate() + termValue); break;
    case 'W': date.setDate(date.getDate() + (7 * termValue)); break;
    case 'M': date.setMonth(date.getMonth() + termValue); break;
    case 'Q': date.setMonth(date.getMonth() + (3 * termValue)); break;
    case 'Y': date.setFullYear(date.getFullYear() + termValue); break;
    default: throw new Error(`Invalid term code: ${termCode}`);
  }
  return date;
}

function generateRepaymentSchedule(principal, annualRate, termMonths, startDate) {
  const emi = calculateEMI(principal, annualRate, termMonths);
  const dailyRate = calculateDailyInterest(annualRate);
  
  let balance = principal;
  const schedule = [];

  for (let i = 0; i < termMonths; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i + 1);
    
    // Calculate days in this payment period
    const daysInPeriod = i === 0 ? 
      (dueDate - startDate) / (1000 * 60 * 60 * 24) :
      (dueDate - new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate())) / (1000 * 60 * 60 * 24);
    
    const interest = balance * dailyRate * daysInPeriod;
    const principalPayment = emi - interest;
    const remainingBalance = balance - principalPayment;
    
    schedule.push({
      installmentNo: i + 1,
      dueDate,
      principal: principalPayment,
      interest: interest,
      totalPayment: emi,
      remainingBalance: remainingBalance > 0 ? remainingBalance : 0,
      status: 'PENDING',
      isFinalInstallment: i === termMonths - 1
    });
    
    balance = remainingBalance > 0 ? remainingBalance : 0;
  }

  return schedule;
}

function formatLoanResponse(loanAccount) {
  return {
    id: loanAccount._id,
    accountNumber: loanAccount.ACCT_NO,
    accountName: loanAccount.ACCT_NM,
    amount: parseFloat(loanAccount.DISBURSEMENT_LIMIT.toString()),
    interestRate: parseFloat(loanAccount.INTEREST_RATE.toString()),
    term: `${loanAccount.TERM_VALUE} ${loanAccount.TERM_CD}`,
    status: loanAccount.status
  };
}

function formatGuarantorResponse(guarantor) {
  return {
    id: guarantor._id,
    guarantorId: guarantor.GUARANTOR_ID,
    name: guarantor.fullName,
    guaranteedAmount: parseFloat(guarantor.GUARANTEED_AMT.toString()),
    relationship: guarantor.relationshipToBorrower,
    status: guarantor.verificationStatus
  };
}

function generateContractText(loan, guarantor) {
  return `LOAN AGREEMENT

This Agreement is made on ${new Date().toLocaleDateString()} between:

BORROWER: ${loan.ACCT_NM}
ACCOUNT NUMBER: ${loan.ACCT_NO}

GUARANTOR: ${guarantor.fullName}
ID NUMBER: ${guarantor.idNumber}

and

LENDER: [Your Bank Name]

LOAN TERMS:
- Principal Amount: ${parseFloat(loan.DISBURSEMENT_LIMIT).toLocaleString()} ${loan.CRNCY_ID}
- Interest Rate: ${loan.INTEREST_RATE}% per annum
- Term: ${loan.TERM_VALUE} ${loan.TERM_CD}
- Start Date: ${new Date(loan.START_DT).toLocaleDateString()}
- Maturity Date: ${loan.MATURITY_DT ? new Date(loan.MATURITY_DT).toLocaleDateString() : 'N/A'}
- Purpose: ${loan.loan_purpose || 'General Business Purpose'}

GUARANTOR OBLIGATIONS:
- Guaranteed Amount: ${parseFloat(guarantor.GUARANTEED_AMT).toLocaleString()} ${loan.CRNCY_ID}
- Relationship to Borrower: ${guarantor.relationshipToBorrower}
- Net Worth: ${parseFloat(guarantor.netWorth).toLocaleString()} ${loan.CRNCY_ID}

FEES:
- Processing Fee: ${loan.feeAmount || 0} ${loan.CRNCY_ID}

SIGNATURES:
___________________________
Borrower

___________________________
Guarantor

___________________________
Lender Representative`;
}

function validateLoanWithGuarantorInput(data) {
  const errors = {};
  let valid = true;

  // Validate loan data
  if (!data.loan) {
    errors.loan = 'Loan data is required';
    valid = false;
  } else {
    const requiredLoanFields = [
      'PROD_ID', 'CUST_ID', 'ACCT_NM', 'ACCT_NO', 'APPL_ID', 'PRODUCT_TYPE',
      'CRNCY_ID', 'BU_ID', 'DISBURSEMENT_LIMIT', 'INTEREST_RATE', 'TERM_CD',
      'TERM_VALUE', 'START_DT', 'REPAY_SRC_ACCT_NO', 'CREATED_BY'
    ];

    requiredLoanFields.forEach(field => {
      if (!data.loan[field]) {
        errors[`loan_${field}`] = `${field} is required`;
        valid = false;
      }
    });

    if (!data.loan.DISBURSEMENT_LIMIT || isNaN(data.loan.DISBURSEMENT_LIMIT)) {
      errors.loan_DISBURSEMENT_LIMIT = 'Valid disbursement amount is required';
      valid = false;
    }

    if (!data.loan.INTEREST_RATE || isNaN(data.loan.INTEREST_RATE)) {
      errors.loan_INTEREST_RATE = 'Valid interest rate is required';
      valid = false;
    } else if (parseFloat(data.loan.INTEREST_RATE) > 100) {
      errors.loan_INTEREST_RATE = 'Interest rate cannot exceed 100%';
      valid = false;
    }

    if (!data.loan.TERM_CD || !['D', 'W', 'M', 'Q', 'Y'].includes(data.loan.TERM_CD)) {
      errors.loan_TERM_CD = 'Valid term code is required (D, W, M, Q, Y)';
      valid = false;
    }

    if (!data.loan.TERM_VALUE || isNaN(data.loan.TERM_VALUE)) {
      errors.loan_TERM_VALUE = 'Valid term value is required';
      valid = false;
    }

    if (!data.loan.START_DT || isNaN(Date.parse(data.loan.START_DT))) {
      errors.loan_START_DT = 'Valid start date is required';
      valid = false;
    }
  }

  // Validate guarantor data
  if (!data.guarantor) {
    errors.guarantor = 'Guarantor data is required';
    valid = false;
  } else {
    const requiredGuarantorFields = [
      'fullName', 'idNumber', 'address', 'phone', 'email', 'GUARANTEED_AMT',
      'relationshipToBorrower', 'netWorth', 'annualIncome', 'dateOfBirth',
      'consentDate'
    ];

    requiredGuarantorFields.forEach(field => {
      if (!data.guarantor[field]) {
        errors[`guarantor_${field}`] = `${field} is required`;
        valid = false;
      }
    });

    if (!data.guarantor.GUARANTEED_AMT || isNaN(data.guarantor.GUARANTEED_AMT)) {
      errors.guarantor_GUARANTEED_AMT = 'Valid guaranteed amount is required';
      valid = false;
    }

    if (!data.guarantor.consentDate || isNaN(Date.parse(data.guarantor.consentDate))) {
      errors.guarantor_consentDate = 'Valid consent date is required';
      valid = false;
    }
  }

  return {
    valid,
    errors: Object.keys(errors).length > 0 ? errors : null
  };
}

export async function applyLoanWithGuarantorWorkflow(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate request structure
    if (!req.body.loan || !req.body.guarantor) {
      return res.status(400).json({
        success: false,
        message: "Request must contain both loan and guarantor data",
        code: "INVALID_REQUEST_STRUCTURE"
      });
    }

    // Validate input data
    const validation = validateLoanWithGuarantorInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors,
        code: "VALIDATION_ERROR"
      });
    }

    const { loan, guarantor } = req.body;

    // Generate all IDs
    const loanAccountNumber = await generateAccountNumberByProdId(loan.PROD_ID);
    const { 
      TRANSACTION_ID, 
      EVENT_ID, 
      TRAN_JOURNAL_ID 
    } = generateTransactionIds();
    const guarantorId = await generateGuarantorId();

    // Prepare loan data with proper decimal conversion
    const loanData = {
      ...loan,
      loanAccountId: loanAccountNumber,
      JOURNAL_ID: TRAN_JOURNAL_ID,
      TRANSACTION_ID,
      EVENT_ID,
      DISBURSEMENT_LIMIT: toDecimal(loan.DISBURSEMENT_LIMIT),
      INTEREST_RATE: toDecimal(loan.INTEREST_RATE),
      START_DT: new Date(loan.START_DT),
      MATURITY_DT: loan.MATURITY_DT ? new Date(loan.MATURITY_DT) : calculateMaturityDate(
        new Date(loan.START_DT),
        loan.TERM_CD,
        loan.TERM_VALUE
      ),
      status: 'PENDING_APPROVAL',
      hasGuarantor: true,
      createdAt: new Date(),
      ACCT_NO: loanAccountNumber,
      LOAN_STATUS: 'PENDING',
      processingFee: toDecimal(loan.feeAmount || 0),
      INTEREST_RATE_ID: loan.INTEREST_RATE_ID || 100
    };

    // Create loan account with error handling
    const loanAccount = new LoanAccount(loanData);
    await loanAccount.save({ session }).catch(err => {
      throw new Error(`Failed to create loan account: ${err.message}`);
    });

    // Calculate repayment schedule
    const termMonths = loan.TERM_CD === 'M' ? parseInt(loan.TERM_VALUE) :
                      loan.TERM_CD === 'Y' ? parseInt(loan.TERM_VALUE) * 12 :
                      loan.TERM_CD === 'W' ? Math.ceil(parseInt(loan.TERM_VALUE) * 12 / 52) :
                      Math.ceil(parseInt(loan.TERM_VALUE) * 12 / 365);

    const principal = parseFloat(loan.DISBURSEMENT_LIMIT);
    const interestRate = parseFloat(loan.INTEREST_RATE);
    const repaymentSchedule = generateRepaymentSchedule(
      principal, 
      interestRate, 
      termMonths, 
      new Date(loan.START_DT)
    );

    // Calculate total interest and EMI
    const emi = calculateEMI(principal, interestRate, termMonths);
    const totalInterest = repaymentSchedule.reduce((sum, item) => sum + item.interest, 0);

    // Create repayment schedule
    const repaymentScheduleDoc = new RepaymentSchedules({
      LOAN_ACCOUNT_ID: loanAccount._id,
      ACCT_NO: loanAccount.ACCT_NO,
      CUST_ID: loan.CUST_ID,
      START_DATE: new Date(loan.START_DT),
      MATURITY_DATE: loan.MATURITY_DT ? new Date(loan.MATURITY_DT) : null,
      PRINCIPAL_AMOUNT: principal,
      INTEREST_RATE: interestRate,
      TERM: loan.TERM_VALUE,
      TERM_TYPE: loan.TERM_CD,
      SCHEDULE: repaymentSchedule,
      TRANSACTION_ID,
      EVENT_ID,
      CREATED_BY: loan.CREATED_BY,
      STATUS: 'PENDING'
    });
    await repaymentScheduleDoc.save({ session });

    // Create guarantor with all provided fields
    const guarantorData = {
      loanId: loanAccount._id,
      GUARANTOR_ID: guarantorId,
      fullName: guarantor.fullName,
      relationshipToBorrower: guarantor.relationshipToBorrower,
      phoneNumber: guarantor.phone,
      email: guarantor.email,
      address: guarantor.address,
      city: guarantor.city || 'Unknown',
      state: guarantor.state || 'Unknown',
      country: guarantor.country || 'Nigeria',
      idType: guarantor.idType || 'National ID',
      idNumber: guarantor.idNumber,
      bvn: guarantor.bvn,
      dateOfBirth: new Date(guarantor.dateOfBirth),
      GUARANTEED_AMT: toDecimal(guarantor.GUARANTEED_AMT),
      netWorth: toDecimal(guarantor.netWorth),
      annualIncome: toDecimal(guarantor.annualIncome),
      occupation: guarantor.occupation || 'Not specified',
      employmentType: guarantor.employmentType || 'Self-Employed',
      RELATIONSHIP_OFFICER_ID: guarantor.RELATIONSHIP_OFFICER_ID,
      relationshipOfficerName: guarantor.relationshipOfficerName || 'Unknown',
      consentDate: new Date(guarantor.consentDate),
      createdBy: loan.CREATED_BY,
      verificationStatus: 'Pending'
    };

    const guarantorDoc = new Guarantor(guarantorData);
    await guarantorDoc.save({ session });

    // Update loan with guarantor reference
    await LoanAccount.findByIdAndUpdate(
      loanAccount._id,
      { $set: { GUARANTOR_ID: guarantorDoc._id } },
      { session }
    );

    // Generate loan contract
    const contractForm = new LoanContractForm({
      loanAccountNo: loanAccount.ACCT_NO,
      customer_id: loanAccount.CUST_ID,
      borrower_name: loanAccount.ACCT_NM,
      loan_amount: principal,
      interest_rate: interestRate,
      loan_term: `${loan.TERM_VALUE} ${loan.TERM_CD}`,
      startDate: new Date(loan.START_DT),
      maturityDate: loan.MATURITY_DT ? new Date(loan.MATURITY_DT) : null,
      loan_contract_no: await GenerateLoanContractFormId(),
      loan_purpose: loan.loan_purpose || 'General Purpose',
      applicationId: loan.APPL_ID,
      USER_ID: loan.CREATED_BY,
      fundingAccountNo: loan.REPAY_SRC_ACCT_NO,
      bank_name: 'Your Bank Name',
      bank_short: 'Bank Short Name',
      fees: {
        processingFee: toDecimal(loan.feeAmount || 0)
      },
      guarantor_name: guarantor.fullName,
      guarantor_id: guarantorDoc.GUARANTOR_ID,
      guarantor_relationship: guarantor.relationshipToBorrower,
      contractText: generateContractText(loan, guarantor),
      createdBy: loan.CREATED_BY
    });
    await contractForm.save({ session });

    // Create audit log
    await new GuarantorAudit({
      action: 'CREATE',
      guarantorId: guarantorDoc._id,
      loanId: loanAccount._id,
      performedBy: loan.CREATED_BY,
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName || 'Unknown'
      },
      notes: "New guarantor created for loan application",
      changedFields: Object.keys(guarantorData)
    }).save({ session });

    // Create workflow item
    const workflowResult = await WF_WORK_ITEMController.submitTransaction({
      body: {
        ITEM_VALUE: loanAccountNumber,
        ITEM_DESC: `Loan Application for ${loanAccount.ACCT_NO}`,
        ITEM_CLASS_NM: 'Loan',
        ITEM_TYPE: 'Loan',
        CUST_ID: loan.CUST_ID,
        USER_ID: loan.CREATED_BY,
        BU_ID: loan.BU_ID,
        TARGET_USER_ROLE_ID: 'LOAN_OFFICER',
        ORIGINATOR_USER_ROLE_ID: loan.PRIMARY_OFFICER_ID || 'ORIGINATOR',
        ITEM_ID: loanAccount._id,
        REC_ST: 'PENDING',
        WAIT_ST: 'PENDING',
        VERSION: 1,
        CREATE_DT: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000), // 7 days from now
        WORKFLOW_ID: loanAccount._id,
        GUARANTOR_ID: guarantorDoc._id,
        TRANSACTION_REF: TRANSACTION_ID,
        JOURNAL_REF: TRAN_JOURNAL_ID
      },
      session
    });

    if (!workflowResult.success) {
      throw new Error(`Workflow creation failed: ${workflowResult.error}`);
    }

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: "Loan application with guarantor submitted successfully",
      data: {
        loanAccount: formatLoanResponse(loanAccount),
        guarantor: formatGuarantorResponse(guarantorDoc),
        contract: {
          id: contractForm._id,
          contractNumber: contractForm.loan_contract_no,
          text: contractForm.contractText
        },
        repaymentSchedule: {
          numberOfInstallments: repaymentSchedule.length,
          firstPaymentDate: repaymentSchedule[0].dueDate,
          lastPaymentDate: repaymentSchedule[repaymentSchedule.length - 1].dueDate,
          emiAmount: emi,
          totalInterest: totalInterest,
          totalPrincipal: principal,
          schedule: repaymentSchedule
        },
        workflow: {
          id: workflowResult.data?._id,
          status: workflowResult.data?.REC_ST
        },
        references: {
          loanAccountNumber: loanAccount.ACCT_NO,
          transactionId: TRANSACTION_ID,
          journalId: TRAN_JOURNAL_ID,
          eventId: EVENT_ID,
          guarantorId: guarantorDoc.GUARANTOR_ID
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Loan application error:', error);
    
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process loan application',
      code: error.code || 'PROCESSING_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  } finally {
    session.endSession();
  }
};

// Loan approval workflow
export async function approveLoanWithGuarantor(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { loanId, approvalDecision, comments } = req.body;
    const userId = req.user.id;

    // 1. Validate input
    if (!loanId || !approvalDecision) {
      return res.status(400).json({
        success: false,
        message: 'Loan ID and approval decision are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // 2. Fetch loan and related records
    const loan = await LoanAccount.findById(loanId).session(session);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const guarantor = await Guarantor.findOne({ loanId }).session(session);
    if (!guarantor) {
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found for this loan',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    // 3. Check if guarantor is verified
    if (guarantor.verificationStatus !== 'VERIFIED') {
      return res.status(400).json({
        success: false,
        message: 'Cannot approve loan with unverified guarantor',
        code: 'GUARANTOR_NOT_VERIFIED'
      });
    }

    // 4. Update loan status based on decision
    if (approvalDecision === 'APPROVE') {
      loan.status = 'APPROVED';
      loan.approvedBy = userId;
      loan.approvalDate = new Date();
    } else if (approvalDecision === 'REJECT') {
      loan.status = 'REJECTED';
      loan.rejectedBy = userId;
      loan.rejectionDate = new Date();
      loan.rejectionReason = comments || 'No reason provided';
    } else {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval decision',
        code: 'INVALID_DECISION'
      });
    }

    await loan.save({ session });

    // 5. Update workflow items
    await WorkflowItem.updateMany(
      { 'metadata.loanId': loanId },
      { 
        $set: { 
          status: approvalDecision === 'APPROVE' ? 'COMPLETED' : 'REJECTED',
          completedBy: userId,
          completionDate: new Date(),
          comments
        }
      },
      { session }
    );

    // 6. Create audit log
    const auditLog = new AuditLog({
      entityType: 'LOAN',
      entityId: loan._id,
      action: `LOAN_${approvalDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
      performedBy: userId,
      details: {
        decision: approvalDecision,
        comments,
        guarantorId: guarantor._id
      },
      timestamp: new Date()
    });
    await auditLog.save({ session });

    // 7. Send notifications
    await NotificationService.send({
      recipientRoles: ['LOAN_ADMIN', 'CUSTOMER_SERVICE'],
      message: `Loan ${loan.accountNumber} has been ${approvalDecision === 'APPROVE' ? 'approved' : 'rejected'}`,
      type: 'LOAN_DECISION',
      metadata: {
        loanId: loan._id,
        decision: approvalDecision
      }
    });

    // 8. If approved, initiate disbursement process
    if (approvalDecision === 'APPROVE') {
      await initiateDisbursement(loan, guarantor, userId, session);
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Loan application ${approvalDecision === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
      data: {
        loanId: loan._id,
        status: loan.status,
        accountNumber: loan.accountNumber,
        decision: approvalDecision,
        decisionDate: new Date()
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('[LoanApproval Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process loan approval',
      error: error.message,
      code: 'APPROVAL_PROCESSING_ERROR'
    });
  } finally {
    session.endSession();
  }
}

async function initiateDisbursement(loan, guarantor, userId, session) {
  // 1. Create disbursement record
  const disbursement = new Disbursement({
    loanId: loan._id,
    amount: loan.amount,
    disbursedBy: userId,
    disbursementDate: new Date(),
    status: 'PENDING',
    guarantorId: guarantor._id
  });
  await disbursement.save({ session });

  // 2. Update loan status
  loan.disbursementStatus = 'PENDING';
  await loan.save({ session });

  // 3. Create workflow item for disbursement
  const workflowItem = new WF_WORK_ITEMController({
    type: 'DISBURSEMENT_APPROVAL',
    assignedToRole: 'DISBURSEMENT_OFFICER',
    status: 'PENDING',
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // 1 day
    metadata: {
      loanId: loan._id,
      disbursementId: disbursement._id
    }
  });
  await workflowItem.save({ session });

  // 4. Send notification
  await NotificationService.send({
    recipientRoles: ['DISBURSEMENT_OFFICER'],
    message: `Disbursement approval required for loan ${loan.accountNumber}`,
    type: 'WORKFLOW_ITEM_ASSIGNED',
    metadata: {
      workflowItemId: workflowItem._id,
      loanId: loan._id
    }
  });
};

// Get loan application details with guarantor information
export async function getLoanApplicationDetails(req, res) {
  try {
    const { loanId } = req.params;

    const loan = await LoanAccount.findById(loanId)
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email');

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const guarantor = await Guarantor.findOne({ loanId });
    const workflowItems = await WF_WORK_ITEMController.find({ 'metadata.loanId': loanId });
    const auditLogs = await AuditLog.find({ entityType: 'LOAN', entityId: loanId })
      .sort({ timestamp: -1 })
      .populate('performedBy', 'name role');

    // Calculate loan metrics
    const repaymentSchedule = await calculateRepaymentSchedule(loan);
    const riskAssessment = await assessLoanRisk(loan, guarantor);

    res.status(200).json({
      success: true,
      data: {
        loan: {
          id: loan._id,
          accountNumber: loan.accountNumber,
          amount: loan.amount,
          term: loan.term,
          status: loan.status,
          interestRate: loan.interestRate,
          createdAt: loan.createdAt,
          approvedBy: loan.approvedBy,
          approvalDate: loan.approvalDate,
          rejectedBy: loan.rejectedBy,
          rejectionDate: loan.rejectionDate,
          rejectionReason: loan.rejectionReason,
          disbursementStatus: loan.disbursementStatus
        },
        guarantor: guarantor ? {
          id: guarantor._id,
          name: guarantor.fullName,
          relationship: guarantor.relationship,
          verificationStatus: guarantor.verificationStatus,
          verifiedBy: guarantor.verifiedBy,
          verificationDate: guarantor.verificationDate,
          guaranteedAmount: guarantor.guaranteedAmount
        } : null,
        workflow: WF_WORK_ITEMController.map(item => ({
          id: item._id,
          type: item.type,
          status: item.status,
          assignedTo: item.assignedTo,
          dueDate: item.dueDate,
          completedBy: item.completedBy,
          completionDate: item.completionDate
        })),
        auditTrail: auditLogs.map(log => ({
          action: log.action,
          performedBy: log.performedBy,
          timestamp: log.timestamp,
          details: log.details
        })),
        repaymentSchedule,
        riskAssessment
      }
    });

  } catch (error) {
    console.error('[GetLoanDetails Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan details',
      error: error.message,
      code: 'FETCH_ERROR'
    });
  }
};

// Verify guarantor
export async function verifyGuarantor(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { guarantorId, verificationStatus, verificationNotes } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!guarantorId || !verificationStatus) {
      return res.status(400).json({
        success: false,
        message: 'Guarantor ID and verification status are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Fetch guarantor record
    const guarantor = await Guarantor.findById(guarantorId).session(session);
    if (!guarantor) {
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    // Update guarantor status
    guarantor.verificationStatus = verificationStatus;
    guarantor.verifiedBy = userId;
    guarantor.verificationDate = new Date();
    guarantor.verificationNotes = verificationNotes;

    await guarantor.save({ session });

    // Update related workflow item
    await WorkflowItem.updateOne(
      { 'metadata.guarantorId': guarantorId, type: 'GUARANTOR_VERIFICATION' },
      { 
        $set: { 
          status: 'COMPLETED',
          completedBy: userId,
          completionDate: new Date(),
          comments: verificationNotes
        }
      },
      { session }
    );

    // Create audit log
    const auditLog = new AuditLog({
      entityType: 'GUARANTOR',
      entityId: guarantor._id,
      action: 'GUARANTOR_VERIFIED',
      performedBy: userId,
      details: {
        verificationStatus,
        notes: verificationNotes,
        loanId: guarantor.loanId
      },
      timestamp: new Date()
    });
    await auditLog.save({ session });

    // Send notification to loan officer
    const loan = await LoanAccount.findById(guarantor.loanId).session(session);
    if (loan) {
      await NotificationService.send({
        recipientRoles: ['LOAN_OFFICER'],
        message: `Guarantor for loan ${loan.accountNumber} has been ${verificationStatus.toLowerCase()}`,
        type: 'GUARANTOR_VERIFICATION_UPDATE',
        metadata: {
          loanId: loan._id,
          guarantorId: guarantor._id,
          status: verificationStatus
        }
      });
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: `Guarantor verification status updated to ${verificationStatus}`,
      data: {
        guarantorId: guarantor._id,
        verificationStatus,
        verifiedBy: userId,
        verificationDate: new Date()
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('[VerifyGuarantor Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update guarantor verification status',
      error: error.message,
      code: 'VERIFICATION_ERROR'
    });
  } finally {
    session.endSession();
  }
};


// Display risk assessment information
export async function getLoanRiskAssessment(req, res) {
  try {
    const { loanId } = req.params;

    const loan = await LoanAccount.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const guarantor = await Guarantor.findOne({ loanId });
    const riskAssessment = await assessLoanRisk(loan, guarantor);

    res.status(200).json({
      success: true,
      data: {
        loanId: loan._id,
        accountNumber: loan.accountNumber,
        riskAssessment,
        guarantor: guarantor ? {
          id: guarantor._id,
          name: guarantor.fullName,
          riskRating: guarantor.riskRating,
          creditScore: guarantor.creditScore
        } : null,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    console.error('[RiskAssessment Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch risk assessment',
      error: error.message,
      code: 'RISK_ASSESSMENT_ERROR'
    });
  }
}

async function assessLoanRisk(loan, guarantor) {
  // Simple risk assessment logic - can be enhanced
  let riskScore = 0;
  const riskFactors = [];

  // Loan amount risk
  if (loan.amount > 100000) {
    riskScore += 20;
    riskFactors.push('High loan amount');
  } else if (loan.amount > 50000) {
    riskScore += 10;
    riskFactors.push('Moderate loan amount');
  }

  // Loan term risk
  if (loan.term > 60) {
    riskScore += 15;
    riskFactors.push('Long loan term');
  }

  // Guarantor risk assessment
  if (guarantor) {
    if (guarantor.creditScore < 600) {
      riskScore += 25;
      riskFactors.push('Guarantor has low credit score');
    }
    if (guarantor.riskRating === 'High') {
      riskScore += 30;
      riskFactors.push('High-risk guarantor');
    }
  } else {
    riskScore += 40;
    riskFactors.push('No guarantor');
  }

  // Determine risk level
  let riskLevel;
  if (riskScore >= 70) {
    riskLevel = 'High';
  } else if (riskScore >= 40) {
    riskLevel = 'Medium';
  } else {
    riskLevel = 'Low';
  }

  return {
    riskScore,
    riskLevel,
    riskFactors,
    lastAssessed: new Date()
  };
};