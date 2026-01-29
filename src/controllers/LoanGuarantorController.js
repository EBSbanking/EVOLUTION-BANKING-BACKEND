// controllers/LoanController.js
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import { addDays } from 'date-fns';
import { calculateEMI, calculateDailyInterest } from './LoanInterestRateController.js';

// Models (Sequelize imports)
import LoanAccount from '../models/LoanAccount.js';
import Guarantor from '../models/Guarantor.js';
import RepaymentSchedules from '../models/RepaymentSchedules.js';
import LoanContractForm from '../models/LoanContractForm.js';
import GuarantorAudit from '../models/GuarantorAudit.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import RateIndex from '../models/Rate-Index.js';
import LoanInterestRate from '../models/LoanInterestRate.js';
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
  generateAccountNumberForCustomer,
  generateTransactionIds 
} from '../utils/generateAccountNumber.js';
import { generateGuarantorId } from '../utils/generateGuarantorId.js';

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
    id: loanAccount.id,
    accountNumber: loanAccount.ACCT_NO,
    accountName: loanAccount.ACCT_NM,
    amount: parseFloat(loanAccount.DISBURSEMENT_LIMIT),
    interestRate: parseFloat(loanAccount.INTEREST_RATE),
    term: `${loanAccount.TERM_VALUE} ${loanAccount.TERM_CD}`,
    status: loanAccount.status
  };
}

function formatGuarantorResponse(guarantor) {
  return {
    id: guarantor.id,
    guarantorId: guarantor.GUARANTOR_ID,
    name: guarantor.fullName,
    guaranteedAmount: parseFloat(guarantor.GUARANTEED_AMT),
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
  const transaction = await sequelize.transaction();

  try {
    // Validate request structure
    if (!req.body.loan || !req.body.guarantor) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Request must contain both loan and guarantor data",
        code: "INVALID_REQUEST_STRUCTURE"
      });
    }

    // Validate input data
    const validation = validateLoanWithGuarantorInput(req.body);
    if (!validation.valid) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validation.errors,
        code: "VALIDATION_ERROR"
      });
    }

    const { loan, guarantor } = req.body;

    // Generate all IDs
    const loanAccountNumber = await generateAccountNumberForCustomer(loan.CUST_ID);
    const { 
      TRANSACTION_ID, 
      EVENT_ID, 
      TRAN_JOURNAL_ID 
    } = generateTransactionIds();
    const guarantorId = await generateGuarantorId();

    // Prepare loan data
    const loanData = {
      ...loan,
      loanAccountId: loanAccountNumber,
      JOURNAL_ID: TRAN_JOURNAL_ID,
      TRANSACTION_ID,
      EVENT_ID,
      DISBURSEMENT_LIMIT: parseFloat(loan.DISBURSEMENT_LIMIT),
      INTEREST_RATE: parseFloat(loan.INTEREST_RATE),
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
      processingFee: parseFloat(loan.feeAmount || 0),
      INTEREST_RATE_ID: loan.INTEREST_RATE_ID || 100
    };

    // Create loan account with error handling
    const loanAccount = await LoanAccount.create(loanData, { transaction });

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
    const repaymentScheduleDoc = await RepaymentSchedules.create({
      LOAN_ACCOUNT_ID: loanAccount.id,
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
    }, { transaction });

    // Create guarantor with all provided fields
    const guarantorData = {
      loanId: loanAccount.id,
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
      GUARANTEED_AMT: parseFloat(guarantor.GUARANTEED_AMT),
      netWorth: parseFloat(guarantor.netWorth),
      annualIncome: parseFloat(guarantor.annualIncome),
      occupation: guarantor.occupation || 'Not specified',
      employmentType: guarantor.employmentType || 'Self-Employed',
      RELATIONSHIP_OFFICER_ID: guarantor.RELATIONSHIP_OFFICER_ID,
      relationshipOfficerName: guarantor.relationshipOfficerName || 'Unknown',
      consentDate: new Date(guarantor.consentDate),
      createdBy: loan.CREATED_BY,
      verificationStatus: 'Pending'
    };

    const guarantorDoc = await Guarantor.create(guarantorData, { transaction });

    // Update loan with guarantor reference
    await loanAccount.update({ GUARANTOR_ID: guarantorDoc.id }, { transaction });

    // Generate loan contract
    const contractForm = await LoanContractForm.create({
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
        processingFee: parseFloat(loan.feeAmount || 0)
      },
      guarantor_name: guarantor.fullName,
      guarantor_id: guarantorDoc.GUARANTOR_ID,
      guarantor_relationship: guarantor.relationshipToBorrower,
      contractText: generateContractText(loan, guarantor),
      createdBy: loan.CREATED_BY
    }, { transaction });

    // Create audit log
    await GuarantorAudit.create({
      action: 'CREATE',
      guarantorId: guarantorDoc.id,
      loanId: loanAccount.id,
      performedBy: loan.CREATED_BY,
      relationshipOfficer: {
        id: guarantor.RELATIONSHIP_OFFICER_ID,
        name: guarantor.relationshipOfficerName || 'Unknown'
      },
      notes: "New guarantor created for loan application",
      changedFields: Object.keys(guarantorData)
    }, { transaction });

    // Create workflow item (assuming WF_WORK_ITEMController is updated for Sequelize)
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
        ITEM_ID: loanAccount.id,
        REC_ST: 'PENDING',
        WAIT_ST: 'PENDING',
        VERSION: 1,
        CREATE_DT: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000), // 7 days from now
        WORKFLOW_ID: loanAccount.id,
        GUARANTOR_ID: guarantorDoc.id,
        TRANSACTION_REF: TRANSACTION_ID,
        JOURNAL_REF: TRAN_JOURNAL_ID
      },
      transaction
    });

    if (!workflowResult.success) {
      throw new Error(`Workflow creation failed: ${workflowResult.error}`);
    }

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: "Loan application with guarantor submitted successfully",
      data: {
        loanAccount: formatLoanResponse(loanAccount),
        guarantor: formatGuarantorResponse(guarantorDoc),
        contract: {
          id: contractForm.id,
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
          id: workflowResult.data?.id,
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
    await transaction.rollback();
    console.error('Loan application error:', error);
    
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process loan application',
      code: error.code || 'PROCESSING_ERROR',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
}

// Loan approval workflow
export async function approveLoanWithGuarantor(req, res) {
  const transaction = await sequelize.transaction();

  try {
    const { loanId, approvalDecision, comments } = req.body;
    const userId = req.user.id;

    // 1. Validate input
    if (!loanId || !approvalDecision) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Loan ID and approval decision are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // 2. Fetch loan and related records
    const loan = await LoanAccount.findByPk(loanId, { transaction });
    if (!loan) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const guarantor = await Guarantor.findOne({ 
      where: { loanId: loanId },
      transaction 
    });
    
    if (!guarantor) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found for this loan',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    // 3. Check if guarantor is verified
    if (guarantor.verificationStatus !== 'VERIFIED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot approve loan with unverified guarantor',
        code: 'GUARANTOR_NOT_VERIFIED'
      });
    }

    // 4. Update loan status based on decision
    const updateData = {};
    if (approvalDecision === 'APPROVE') {
      updateData.status = 'APPROVED';
      updateData.approvedBy = userId;
      updateData.approvalDate = new Date();
    } else if (approvalDecision === 'REJECT') {
      updateData.status = 'REJECTED';
      updateData.rejectedBy = userId;
      updateData.rejectionDate = new Date();
      updateData.rejectionReason = comments || 'No reason provided';
    } else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid approval decision',
        code: 'INVALID_DECISION'
      });
    }

    await loan.update(updateData, { transaction });

    // 5. Update workflow items (assuming WorkflowItem model exists)
    // Note: You'll need to update this based on your actual WorkflowItem model
    // await WorkflowItem.update(
    //   { 
    //     status: approvalDecision === 'APPROVE' ? 'COMPLETED' : 'REJECTED',
    //     completedBy: userId,
    //     completionDate: new Date(),
    //     comments 
    //   },
    //   { 
    //     where: { 'metadata.loanId': loanId },
    //     transaction 
    //   }
    // );

    // 6. Create audit log
    // Note: You'll need to update this based on your actual AuditLog model
    // await AuditLog.create({
    //   entityType: 'LOAN',
    //   entityId: loan.id,
    //   action: `LOAN_${approvalDecision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`,
    //   performedBy: userId,
    //   details: {
    //     decision: approvalDecision,
    //     comments,
    //     guarantorId: guarantor.id
    //   },
    //   timestamp: new Date()
    // }, { transaction });

    // 7. If approved, initiate disbursement process
    if (approvalDecision === 'APPROVE') {
      await initiateDisbursement(loan, guarantor, userId, transaction);
    }

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: `Loan application ${approvalDecision === 'APPROVE' ? 'approved' : 'rejected'} successfully`,
      data: {
        loanId: loan.id,
        status: loan.status,
        accountNumber: loan.ACCT_NO,
        decision: approvalDecision,
        decisionDate: new Date()
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[LoanApproval Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process loan approval',
      error: error.message,
      code: 'APPROVAL_PROCESSING_ERROR'
    });
  }
}

async function initiateDisbursement(loan, guarantor, userId, transaction) {
  // Note: You'll need to implement this based on your Disbursement and NotificationService models
  console.log('Initiating disbursement for loan:', loan.id);
  
  // Example implementation:
  // 1. Update loan status
  await loan.update({ disbursementStatus: 'PENDING' }, { transaction });
  
  // 2. Create disbursement record (if you have a Disbursement model)
  // const disbursement = await Disbursement.create({
  //   loanId: loan.id,
  //   amount: loan.DISBURSEMENT_LIMIT,
  //   disbursedBy: userId,
  //   disbursementDate: new Date(),
  //   status: 'PENDING',
  //   guarantorId: guarantor.id
  // }, { transaction });
  
  // 3. Create workflow item
  // const workflowItem = await WorkflowItem.create({
  //   type: 'DISBURSEMENT_APPROVAL',
  //   assignedToRole: 'DISBURSEMENT_OFFICER',
  //   status: 'PENDING',
  //   dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
  //   metadata: {
  //     loanId: loan.id,
  //     disbursementId: disbursement.id
  //   }
  // }, { transaction });
  
  // 4. Send notification (if you have NotificationService)
  // await NotificationService.send({
  //   recipientRoles: ['DISBURSEMENT_OFFICER'],
  //   message: `Disbursement approval required for loan ${loan.ACCT_NO}`,
  //   type: 'WORKFLOW_ITEM_ASSIGNED',
  //   metadata: {
  //     workflowItemId: workflowItem.id,
  //     loanId: loan.id
  //   }
  // });
}

// Get loan application details with guarantor information
export async function getLoanApplicationDetails(req, res) {
  try {
    const { loanId } = req.params;

    const loan = await LoanAccount.findByPk(loanId, {
      // If you have associations set up, include them here
      // include: [
      //   { model: User, as: 'approvedBy', attributes: ['name', 'email'] },
      //   { model: User, as: 'rejectedBy', attributes: ['name', 'email'] }
      // ]
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const guarantor = await Guarantor.findOne({ where: { loanId: loanId } });
    
    // Note: You'll need to update these based on your actual models
    // const workflowItems = await WorkflowItem.findAll({ where: { 'metadata.loanId': loanId } });
    // const auditLogs = await AuditLog.findAll({
    //   where: { entityType: 'LOAN', entityId: loanId },
    //   order: [['timestamp', 'DESC']],
    //   include: [{ model: User, as: 'performedBy', attributes: ['name', 'role'] }]
    // });

    // Calculate loan metrics
    const repaymentSchedule = await calculateRepaymentSchedule(loan);
    const riskAssessment = await assessLoanRisk(loan, guarantor);

    res.status(200).json({
      success: true,
      data: {
        loan: {
          id: loan.id,
          accountNumber: loan.ACCT_NO,
          amount: loan.DISBURSEMENT_LIMIT,
          term: `${loan.TERM_VALUE} ${loan.TERM_CD}`,
          status: loan.status,
          interestRate: loan.INTEREST_RATE,
          createdAt: loan.createdAt,
          approvedBy: loan.approvedBy,
          approvalDate: loan.approvalDate,
          rejectedBy: loan.rejectedBy,
          rejectionDate: loan.rejectionDate,
          rejectionReason: loan.rejectionReason,
          disbursementStatus: loan.disbursementStatus
        },
        guarantor: guarantor ? {
          id: guarantor.id,
          name: guarantor.fullName,
          relationship: guarantor.relationshipToBorrower,
          verificationStatus: guarantor.verificationStatus,
          verifiedBy: guarantor.verifiedBy,
          verificationDate: guarantor.verificationDate,
          guaranteedAmount: guarantor.GUARANTEED_AMT
        } : null,
        // workflow: workflowItems.map(item => ({
        //   id: item.id,
        //   type: item.type,
        //   status: item.status,
        //   assignedTo: item.assignedTo,
        //   dueDate: item.dueDate,
        //   completedBy: item.completedBy,
        //   completionDate: item.completionDate
        // })),
        // auditTrail: auditLogs.map(log => ({
        //   action: log.action,
        //   performedBy: log.performedBy,
        //   timestamp: log.timestamp,
        //   details: log.details
        // })),
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
}

// Verify guarantor
export async function verifyGuarantor(req, res) {
  const transaction = await sequelize.transaction();

  try {
    const { guarantorId, verificationStatus, verificationNotes } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!guarantorId || !verificationStatus) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Guarantor ID and verification status are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Fetch guarantor record
    const guarantor = await Guarantor.findByPk(guarantorId, { transaction });
    if (!guarantor) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Guarantor not found',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    // Update guarantor status
    await guarantor.update({
      verificationStatus,
      verifiedBy: userId,
      verificationDate: new Date(),
      verificationNotes
    }, { transaction });

    // Note: You'll need to update workflow items based on your WorkflowItem model
    // await WorkflowItem.update(
    //   { 
    //     status: 'COMPLETED',
    //     completedBy: userId,
    //     completionDate: new Date(),
    //     comments: verificationNotes
    //   },
    //   { 
    //     where: { 'metadata.guarantorId': guarantorId, type: 'GUARANTOR_VERIFICATION' },
    //     transaction 
    //   }
    // );

    // Create audit log
    // await AuditLog.create({
    //   entityType: 'GUARANTOR',
    //   entityId: guarantor.id,
    //   action: 'GUARANTOR_VERIFIED',
    //   performedBy: userId,
    //   details: {
    //     verificationStatus,
    //     notes: verificationNotes,
    //     loanId: guarantor.loanId
    //   },
    //   timestamp: new Date()
    // }, { transaction });

    // Send notification to loan officer
    const loan = await LoanAccount.findByPk(guarantor.loanId, { transaction });
    if (loan) {
      // Note: You'll need to implement NotificationService
      // await NotificationService.send({
      //   recipientRoles: ['LOAN_OFFICER'],
      //   message: `Guarantor for loan ${loan.ACCT_NO} has been ${verificationStatus.toLowerCase()}`,
      //   type: 'GUARANTOR_VERIFICATION_UPDATE',
      //   metadata: {
      //     loanId: loan.id,
      //     guarantorId: guarantor.id,
      //     status: verificationStatus
      //   }
      // });
    }

    await transaction.commit();

    res.status(200).json({
      success: true,
      message: `Guarantor verification status updated to ${verificationStatus}`,
      data: {
        guarantorId: guarantor.id,
        verificationStatus,
        verifiedBy: userId,
        verificationDate: new Date()
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('[VerifyGuarantor Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update guarantor verification status',
      error: error.message,
      code: 'VERIFICATION_ERROR'
    });
  }
}

// Display risk assessment information
export async function getLoanRiskAssessment(req, res) {
  try {
    const { loanId } = req.params;

    const loan = await LoanAccount.findByPk(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found',
        code: 'LOAN_NOT_FOUND'
      });
    }

    const guarantor = await Guarantor.findOne({ where: { loanId: loanId } });
    const riskAssessment = await assessLoanRisk(loan, guarantor);

    res.status(200).json({
      success: true,
      data: {
        loanId: loan.id,
        accountNumber: loan.ACCT_NO,
        riskAssessment,
        guarantor: guarantor ? {
          id: guarantor.id,
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
  if (loan.DISBURSEMENT_LIMIT > 100000) {
    riskScore += 20;
    riskFactors.push('High loan amount');
  } else if (loan.DISBURSEMENT_LIMIT > 50000) {
    riskScore += 10;
    riskFactors.push('Moderate loan amount');
  }

  // Loan term risk
  const termMonths = loan.TERM_CD === 'M' ? parseInt(loan.TERM_VALUE) :
                    loan.TERM_CD === 'Y' ? parseInt(loan.TERM_VALUE) * 12 : 0;
  
  if (termMonths > 60) {
    riskScore += 15;
    riskFactors.push('Long loan term');
  }

  // Guarantor risk assessment
  if (guarantor) {
    // Note: You'll need to add creditScore and riskRating fields to Guarantor model
    // if (guarantor.creditScore < 600) {
    //   riskScore += 25;
    //   riskFactors.push('Guarantor has low credit score');
    // }
    // if (guarantor.riskRating === 'High') {
    //   riskScore += 30;
    //   riskFactors.push('High-risk guarantor');
    // }
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
}

// Helper function to calculate repayment schedule (placeholder)
async function calculateRepaymentSchedule(loan) {
  // Implement based on your RepaymentSchedules model
  const schedule = await RepaymentSchedules.findOne({
    where: { LOAN_ACCOUNT_ID: loan.id }
  });
  
  return schedule ? schedule.SCHEDULE : [];
}