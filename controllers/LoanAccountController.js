import mongoose from 'mongoose';
import RateIndex from '../models/Rate-Index.js';
import LoanInterestRate from '../models/loanInterestRate.js';
import CreditApplication from '../models/CreditApplication.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../services/NotificationService.js';
import moment from 'moment';
import CustomerAccount from '../models/CustomerAccount.js';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import LoanContractForm from '../models/LoanContractForm.js';
import LoanAccount from '../models/LoanAccount.js';
import Transaction from '../models/Transaction.js';
import { generateRepaymentSchedule, calculateMaturityDate } from '../utils/loanUtils.js';
import LoanContractFormController from '../controllers/LoanContractFormController.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Customer from '../models/Customer.js';
import LoanFee from '../models/LoanFee.js';
import LoanProduct from '../models/LoanProduct.js';
import logAuditTrail from '../Services/AuditService.js';
import submitWorkflowItem from '../Services/workflowService.js';
import repaymentUtils from '../utils/repaymentUtils.js';
import { calculateEMI, calculateDailyInterest } from './LoanInterestRateController.js';
import { generateTransactionIds } from '../utils/generateAccountNumber.js';
import InterestAccrual from '../models/InterestAccrual.js';
import { addDays } from 'date-fns';
import InterestCalculationService from '../Services/InterestCalculationService.js';
import FeeCalculationService from '../Services/FeeCalculationService.js';
import { generateNumber } from '../utils/generateNumber.js';
import { generateLoanAccountIdByProduct } from '../utils/generateLoanAccountId.js';
import { getProductTypeOnly } from '../controllers/ProductTypeMappingController.js';
import logger from '../utils/logger.js';
import { generateLoanAccountNumber, generateUniqueCreditApplicationId } from '../utils/loanUtils.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';
import Decimal from 'decimal.js';
import Counter from '../models/Counter.js';
import GLAccount from '../models/GLAccount.js';
import Guarantor from '../models/Guarantor.js';
import { processLoanDisbursementTransactions, processDisbursement } from '../Services/loanService.js';
import getErrorMessage from '../utils/errorUtils.js'


const interestService = new InterestCalculationService();
const { getPaymentFrequency } = repaymentUtils;
const feeService = new FeeCalculationService();

// Helper function to generate numeric IDs
function generateNumericId() {
    return Math.floor(100000000000 + Math.random() * 900000000000);
}

async function generateUniqueLoanAccountId() {
  let id, exists = true;
  while (exists) {
    id = generateNumber(10);
    exists = await LoanAccount.findOne({ loanAccountId: id });
  }
  return id;
}

const getTermDescription = (termCode) => {
  switch (termCode.toUpperCase()) {
    case 'D': return 'Days';
    case 'W': return 'Weeks';
    case 'M': return 'Months';
    case 'Q': return 'Quarters';
    case 'Y': return 'Years';
    default: return 'Months';
  }
};

const convertTermCodeToFrequency = (termCode) => {
  switch (termCode.toUpperCase()) {
    case 'D': return 'DAILY';
    case 'W': return 'WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return 'YEARLY';
    default: throw new Error(`Invalid term code: ${termCode}`);
  }
};

const generateContractText = (loanDetails, customerDetails) => {
  const amount = Number(loanDetails.AMOUNT) || 0;
  
  return `LOAN AGREEMENT

This Agreement is made on ${new Date().toLocaleDateString()} between:

BORROWER: ${loanDetails.borrower_name || customerDetails?.ACCT_NM || 'Customer'}
ADDRESS: ${loanDetails.borrower_address || customerDetails?.ADDRESS_LINE1 || 'Address not provided'}

and

LENDER: ${process.env.BANK_NAME || 'Our Bank'}

LOAN TERMS:
- Principal Amount: ${amount.toLocaleString()}
- Interest Rate: ${loanDetails.INTEREST_RATE || 0}%
- Term: ${loanDetails.TERM_VALUE || 0} ${getTermDescription(loanDetails.TERM_CD || 'M')}
- Purpose: ${loanDetails.loan_purpose || 'General Business Purpose'}

REPAYMENT TERMS:
- Payment Frequency: ${convertTermCodeToFrequency(loanDetails.TERM_CD || 'M')}
- Disbursement Date: ${new Date(loanDetails.DISBURSEMENT_DATE || Date.now()).toLocaleDateString()}

FEES:
- Processing Fee: ${loanDetails.feeAmount || 0}
- Late Payment Penalty: As per policy

SIGNATURES:
___________________________
Borrower

___________________________
Lender Representative`;
};

const LoanAccountController = {

async applyForLoan(req, res) {
  // Helper functions
  function calculateMaturityDate(startDate, termCode, termValue) {
    termCode = String(termCode).toUpperCase();
    const result = new Date(startDate);

    switch (termCode) {
      case 'D': result.setDate(result.getDate() + termValue); break;
      case 'W': result.setDate(result.getDate() + (termValue * 7)); break;
      case 'M': result.setMonth(result.getMonth() + termValue); break;
      case 'Y': result.setFullYear(result.getFullYear() + termValue); break;
      default: throw new Error(`Invalid term code: ${termCode}`);
    }

    return result;
  }

  function getPaymentFrequency(termCode, termValue) {
    termCode = String(termCode).toUpperCase();
    switch (termCode) {
      case 'D': return 'DAILY';
      case 'W': return 'WEEKLY';
      case 'M': return termValue <= 3 ? 'MONTHLY' : 'QUARTERLY';
      case 'Y': return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
      default: return 'MONTHLY';
    }
  }

  // Helper function to find guarantor by either numeric ID or ObjectId
  async function findGuarantor(guarantorId) {
    // First try to find by numeric GUARANTOR_ID
    if (!isNaN(guarantorId)) {
      const byNumber = await Guarantor.findOne({ GUARANTOR_ID: Number(guarantorId) });
      if (byNumber) return byNumber;
    }

    // Then try by ObjectId if the input looks like one
    if (mongoose.Types.ObjectId.isValid(guarantorId)) {
      const byObjectId = await Guarantor.findById(guarantorId);
      if (byObjectId) return byObjectId;
    }

    return null;
  }

  // Validate request body
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ 
      success: false, 
      message: 'Invalid request body', 
      code: 'INVALID_BODY' 
    });
  }

  // Validate required fields
  const requiredFields = [
    'PROD_ID', 'CUST_ID', 'ACCT_NM', 'APPL_ID', 'PRODUCT_TYPE', 'CRNCY_ID', 'BU_ID',
    'PRIMARY_OFFICER_ID', 'DISBURSEMENT_LIMIT', 'START_DT', 'TERM_CD', 'TERM_VALUE',
    'CREATED_BY', 'REPAY_SRC_ACCT_NO', 'TRANSACTION_TYPE', 'INDEX_RATE_ID', 'INTEREST_RATE',
    'GUARANTOR_ID', 'GUARANTEED_AMT', 'USER_ID'
  ];

  const missingFields = requiredFields.filter(field => !req.body.hasOwnProperty(field));
  if (missingFields.length > 0) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing required fields', 
      missingFields, 
      code: 'MISSING_FIELDS' 
    });
  }

  // Enhanced GUARANTOR_ID validation
  if (!req.body.GUARANTOR_ID) {
    return res.status(400).json({ 
      success: false, 
      message: 'GUARANTOR_ID is required',
      code: 'INVALID_GUARANTOR_ID' 
    });
  }

  // Check if guarantor exists using the improved lookup
  const existingGuarantor = await findGuarantor(req.body.GUARANTOR_ID);
  if (!existingGuarantor) {
    return res.status(404).json({ 
      success: false, 
      message: `Guarantor with ID ${req.body.GUARANTOR_ID} not found`,
      code: 'GUARANTOR_NOT_FOUND' 
    });
  }

  // Validate guarantor is active
  if (!existingGuarantor.isActive) {
    return res.status(400).json({ 
      success: false, 
      message: 'Referenced guarantor is not active',
      code: 'INACTIVE_GUARANTOR' 
    });
  }

  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    session.startTransaction();

    // Generate transaction IDs
    const { TRANSACTION_ID, EVENT_ID, TRAN_JOURNAL_ID } = generateTransactionIds();

    // Generate loan account number
    const loanAccountNumber = req.body.ACCT_NO || (await Counter.generateAccountNumber('LOAN')).formattedString;
    if (!loanAccountNumber || !/^[0-9]{10}$/.test(loanAccountNumber)) {
      throw { 
        code: 'ACCOUNT_NUMBER_ERROR', 
        message: 'Invalid or missing loan account number',
        status: 400
      };
    }

    // Check for existing loan account
    const existingLoanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber }).session(session);
    if (existingLoanAccount) {
      throw { 
        code: 'LOAN_ACCOUNT_EXISTS', 
        message: `Loan account with ACCT_NO ${loanAccountNumber} already exists`,
        status: 409 
      };
    }

    // Parse numeric values
    const numericValues = {
      INDEX_RATE_ID: parseInt(req.body.INDEX_RATE_ID),
      PROD_ID: parseInt(req.body.PROD_ID),
      TERM_VALUE: parseInt(req.body.TERM_VALUE),
      CUST_ID: req.body.CUST_ID,
      GUARANTEED_AMT: parseFloat(req.body.GUARANTEED_AMT),
      DISBURSEMENT_LIMIT: parseFloat(req.body.DISBURSEMENT_LIMIT),
      INTEREST_RATE: parseFloat(req.body.INTEREST_RATE)
    };

    // Validate rate index and product
    const [rateIndex, loanProduct] = await Promise.all([
      RateIndex.findOne({ INDEX_RATE_ID: numericValues.INDEX_RATE_ID }).session(session),
      LoanProduct.findOne({ PROD_ID: numericValues.PROD_ID }).session(session)
    ]);

    if (!rateIndex) throw { 
      code: 'RATE_INDEX_NOT_FOUND', 
      message: 'Rate index not found', 
      status: 404 
    };
    if (!loanProduct) throw { 
      code: 'PRODUCT_NOT_FOUND', 
      message: 'Loan product not found', 
      status: 404 
    };

    // Calculate dates and schedules
    const startDate = new Date(req.body.START_DT);
    const maturityDate = calculateMaturityDate(startDate, req.body.TERM_CD, numericValues.TERM_VALUE);
    const paymentFrequency = getPaymentFrequency(req.body.TERM_CD, numericValues.TERM_VALUE);

    // Calculate fees
    const feeService = new FeeCalculationService();
    const feeDetails = await feeService.calculateInitialFees({
      loanAmount: numericValues.DISBURSEMENT_LIMIT,
      productId: numericValues.PROD_ID,
      term: numericValues.TERM_VALUE,
      termCode: req.body.TERM_CD,
      hasGuarantor: true,
      guaranteedAmount: numericValues.GUARANTEED_AMT
    });

    // Calculate EMI
    const emiResult = interestService.calculateEMI({
      principal: numericValues.DISBURSEMENT_LIMIT,
      annualRate: numericValues.INTEREST_RATE,
      termMonths: req.body.TERM_CD === 'M' ? numericValues.TERM_VALUE : 
                 req.body.TERM_CD === 'Y' ? numericValues.TERM_VALUE * 12 : 
                 numericValues.TERM_VALUE,
      startDate,
      precision: 2
    });

    if (!emiResult.installments?.length) {
      throw { 
        code: 'INVALID_REPAYMENT_SCHEDULE', 
        message: 'Failed to generate repayment schedule', 
        status: 500 
      };
    }

    // Create loan account with guarantor reference
   const loanAccount = new LoanAccount({
      loanAccountId: parseInt(loanAccountNumber.replace(/\D/g, '')) || Date.now(),
      JOURNAL_ID: TRAN_JOURNAL_ID,
      CUST_ID: numericValues.CUST_ID,
      ACCT_NM: req.body.ACCT_NM,
      ACCT_NO: loanAccountNumber,
      APPL_ID: req.body.APPL_ID,
      PRODUCT_TYPE: req.body.PRODUCT_TYPE,
      CRNCY_ID: req.body.CRNCY_ID || 'NGN',
      BU_ID: req.body.BU_ID,
      PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
      SECONDARY_OFFICER_ID: req.body.SECONDARY_OFFICER_ID,
      DISBURSEMENT_LIMIT: numericValues.DISBURSEMENT_LIMIT,
      START_DT: startDate,
      TERM_CD: req.body.TERM_CD,
      TERM_VALUE: numericValues.TERM_VALUE,
      MATURITY_DT: maturityDate,
      INTEREST_RATE_ID: loanProduct.interestRateId || numericValues.INDEX_RATE_ID,
      INTEREST_RATE: numericValues.INTEREST_RATE,
      LOAN_STATUS: 'PENDING',
      PAYMENT_FREQUENCY: paymentFrequency,
      CREATED_BY: req.body.CREATED_BY,
      TRANSACTION_ID,
      EVENT_ID,
      PROD_ID: numericValues.PROD_ID,
      FEE_DETAILS: feeDetails,
      TOTAL_INTEREST: emiResult.totalInterest,
      TOTAL_REPAYMENT: emiResult.totalRepayment,
      REPAYMENT_SOURCE_ACCOUNT: req.body.REPAY_SRC_ACCT_NO,
      GUARANTOR_ID: existingGuarantor._id,
      GUARANTEED_AMOUNT: numericValues.GUARANTEED_AMT,
      HAS_GUARANTOR: true,
      guarantorDetails: {
        name: existingGuarantor.fullName,
        phone: existingGuarantor.phoneNumber,
        relationship: existingGuarantor.relationshipToBorrower,
        guarantorNumberId: existingGuarantor.GUARANTOR_ID.toString(),
        email: existingGuarantor.email || req.body.email, // Include email if available
        address: existingGuarantor.address // Include if available
      },
      // Additional fields for tracking
      applicationDate: new Date(),
      lastUpdated: new Date()
    });

    await loanAccount.save({ session });

    // Update guarantor record using the ObjectId
    await Guarantor.findByIdAndUpdate(
      existingGuarantor._id,
      {
        $addToSet: { guaranteedLoans: loanAccount._id },
        $inc: { totalGuaranteedAmount: numericValues.GUARANTEED_AMT },
        lastUsedDate: new Date(),
        status: 'PENDING_VERIFICATION' // Add this line to set initial status
      },
      { session }
    );

    // Create repayment schedule
    const repaymentSchedule = new RepaymentSchedule({
      LOAN_ACCOUNT_ID: loanAccount._id,
      ACCT_NO: loanAccountNumber,
      CUST_ID: numericValues.CUST_ID,
      START_DATE: startDate,
      MATURITY_DATE: maturityDate,
      PRINCIPAL_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      INTEREST_RATE: numericValues.INTEREST_RATE,
      TERM: numericValues.TERM_VALUE,
      TERM_TYPE: req.body.TERM_CD,
      paymentFrequency,
      SCHEDULE: emiResult.installments,
      TRANSACTION_ID,
      EVENT_ID,
      CREATED_BY: req.body.CREATED_BY,
      STATUS: 'PENDING'
    });

    await repaymentSchedule.save({ session });

    // Create credit application
    const creditApplication = new CreditApplication({
      creditApplicationId: await generateUniqueCreditApplicationId(),
      ...req.body,
      STATUS: 'PENDING',
      CREATED_AT: new Date(),
      REQUESTED_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      CRNCY_ID: req.body.CRNCY_ID || 'NGN',
      LOAN_ACCOUNT_ID: loanAccount._id,
      ACCT_NO: loanAccountNumber,
      TRANSACTION_ID,
      EVENT_ID,
      FEE_DETAILS: feeDetails,
      GUARANTOR_ID: existingGuarantor._id
    });

    await creditApplication.save({ session });

    // Create workflow item
    const workflowResult = await WF_WORK_ITEMController.submitTransaction({
      body: {
        ITEM_VALUE: loanAccount._id,
        ITEM_DESC: `Loan Application for ${loanAccountNumber}`,
        ITEM_CLASS_NM: 'Loan',
        ITEM_TYPE: 'Loan',
        CUST_ID: numericValues.CUST_ID,
        USER_ID: req.body.CREATED_BY,
        BU_ID: req.body.BU_ID,
        TARGET_USER_ROLE_ID: 'LOAN_OFFICER',
        ORIGINATOR_USER_ROLE_ID: req.body.USER_ROLE_ID || 'ORIGINATOR',
        ITEM_ID: creditApplication._id,
        REC_ST: 'PENDING',
        WAIT_ST: 'PENDING',
        VERSION: 1,
        CREATE_DT: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000),
        WORKFLOW_ID: creditApplication._id,
        GUARANTOR_ID: existingGuarantor._id
      },
      session
    });

    if (!workflowResult.success) {
      throw new Error(`Workflow creation failed: ${workflowResult.error}`);
    }

    // Commit transaction
    await session.commitTransaction();
    transactionCompleted = true;

    // First, log the workflow result to understand its structure
    console.log('Workflow Result Structure:', {
      rawResult: workflowResult,
      hasDocument: !!workflowResult.document,
      hasCreatedWorkItem: !!workflowResult.createdWorkItem,
      directWorkItemId: workflowResult.WORK_ITEM_ID,
      workItemId: workflowResult.workItemId
    });

    // Extract WORK_ITEM_ID based on actual structure
    let WORK_ITEM_ID;
    if (workflowResult.document && workflowResult.document.WORK_ITEM_ID) {
      WORK_ITEM_ID = workflowResult.document.WORK_ITEM_ID;
    } else if (workflowResult.WORK_ITEM_ID) {
      WORK_ITEM_ID = workflowResult.WORK_ITEM_ID;
    } else if (workflowResult.workItemId) {
      WORK_ITEM_ID = workflowResult.workItemId;
    } else if (workflowResult.data && workflowResult.data.WORK_ITEM_ID) {
      WORK_ITEM_ID = workflowResult.data.WORK_ITEM_ID;
    } else {
      // If we still can't find it, use a default or throw an error
      WORK_ITEM_ID = null;
      console.error('WORK_ITEM_ID not found in workflow result');
    }

    // Then include it in the response
   return res.status(201).json({
  success: true,
  message: 'Loan application submitted successfully',
  data: {
    loanAccountId: loanAccount._id,
    loanAccountNumber,
    creditApplicationId: creditApplication._id,
    WORK_ITEM_ID: WORK_ITEM_ID,
    workflowId: workflowResult._id || creditApplication._id,
    APPL_ID: req.body.APPL_ID,
    status: 'PENDING',  // Explicitly include the status here
    guarantor: {
      guarantorId: existingGuarantor._id,
      guarantorNumberId: existingGuarantor.GUARANTOR_ID,
      name: existingGuarantor.fullName,
      guaranteedAmount: numericValues.GUARANTEED_AMT,
      status: 'PENDING_VERIFICATION'  // Include guarantor status as well
    },
    repaymentSchedule: {
      numberOfInstallments: emiResult.installments.length,
      firstPaymentDate: emiResult.installments[0]?.dueDate,
      lastPaymentDate: emiResult.installments.at(-1)?.dueDate,
      totalInterest: emiResult.totalInterest,
      totalRepayment: emiResult.totalRepayment,
      status: 'PENDING'  // Include repayment schedule status
    }
  }
});
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }

    console.error('Loan application error:', error);
    
    // Handle CastError specifically
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: `Invalid ID format: ${error.value}`,
        code: 'INVALID_ID_FORMAT',
        expectedType: error.kind
      });
    }

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process loan application',
      code: error.code || 'SERVER_ERROR'
    });
  } finally {
    await session.endSession();
  }
},

 async approveLoanApplication   (req, res) {
  const session = await mongoose.startSession();
  let transactionSuccess = false;

  try {
    await session.startTransaction();

    const rawCustId = req.body.CUST_ID;
    const CUST_ID = String(rawCustId);
    const numericCUST_ID = parseInt(rawCustId, 10);

    const {
      workItemId,
      approvedBy,
      APPL_ID,
      approvalComments,
      overrideRiskCheck = false,
      forceApprove = false
    } = req.body;

    const requiredFields = ['workItemId', 'approvedBy', 'APPL_ID', 'CUST_ID'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_FIELDS'
      });
    }

    const creditApplication = await CreditApplication.findOne({
      APPL_ID,
      $or: [
        { CUST_ID: CUST_ID },
        { CUST_ID: numericCUST_ID },
        { CUST_ID: rawCustId }
      ],
      STATUS: 'PENDING'
    }).session(session);

    if (!creditApplication) {
      return res.status(404).json({
        success: false,
        message: `Pending credit application not found for ${APPL_ID}`,
        code: 'CREDIT_APP_NOT_FOUND'
      });
    }

    const loanAccount = await LoanAccount.findOne({
      ACCT_NO: creditApplication.ACCT_NO,
      LOAN_STATUS: 'PENDING'
    }).session(session);

    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: `Pending loan account not found for ${APPL_ID}`,
        code: 'LOAN_ACCOUNT_NOT_FOUND'
      });
    }

    const guarantor = await Guarantor.findOne({
      $or: [
        { _id: loanAccount.GUARANTOR_ID },
        { GUARANTOR_ID: loanAccount.guarantorDetails?.guarantorNumberId }
      ]
    }).session(session);

    if (!guarantor) {
      return res.status(400).json({
        success: false,
        message: 'No guarantor found for this loan',
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    const isStatusValid =
      ['ACTIVE', 'VERIFIED'].includes(guarantor.status?.toUpperCase()) ||
      guarantor.verificationStatus?.toUpperCase() === 'VERIFIED';

    if (!isStatusValid && !forceApprove) {
      return res.status(400).json({
        success: false,
        message: 'Guarantor status is not valid for approval',
        code: 'INVALID_GUARANTOR_STATUS'
      });
    }

    if (guarantor.GUARANTEED_AMT < loanAccount.GUARANTEED_AMOUNT && !forceApprove) {
      return res.status(400).json({
        success: false,
        message: 'Guaranteed amount is insufficient for this loan',
        code: 'INSUFFICIENT_GUARANTEE'
      });
    }

    const repaymentAccount = await CustomerAccount.findOne({
      ACCT_NO: loanAccount.REPAYMENT_SOURCE_ACCOUNT,
      $or: [
        { CUST_ID: CUST_ID },
        { CUST_ID: numericCUST_ID },
        { CUST_ID: rawCustId }
      ],
      STATUS: 'ACTIVE'
    }).session(session);

    if (!repaymentAccount && !forceApprove) {
      const accountCheck = await CustomerAccount.findOne({
        ACCT_NO: loanAccount.REPAYMENT_SOURCE_ACCOUNT
      }).session(session);

      const customerAccounts = await CustomerAccount.find({
        $or: [
          { CUST_ID: CUST_ID },
          { CUST_ID: numericCUST_ID },
          { CUST_ID: rawCustId }
        ],
        STATUS: 'ACTIVE'
      }).session(session);

      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid repayment account',
        code: 'INVALID_REPAYMENT_ACCOUNT',
        diagnostic: {
          accountExists: !!accountCheck,
          accountStatus: accountCheck?.STATUS,
          accountCustomerId: accountCheck?.CUST_ID,
          customerHasActiveAccounts: customerAccounts.length > 0,
          customerActiveAccountNumbers: customerAccounts.map(a => a.ACCT_NO)
        }
      });
    }

    // Calculate disbursement
    const totalFees = loanAccount.FEE_DETAILS?.totalFees || 0;
    const netDisbursement = loanAccount.DISBURSEMENT_LIMIT - totalFees;

    // Update Guarantor
    await Guarantor.updateOne(
      { _id: guarantor._id },
      {
        $set: {
          loanId: loanAccount._id,
          verificationStatus: 'VERIFIED',
          status: 'ACTIVE',
          lastUsed: new Date()
        }
      },
      { session }
    );

    // Update Loan Account
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $set: {
          LOAN_STATUS: 'APPROVED',
          APPROVED_BY: approvedBy,
          NET_DISBURSEMENT: netDisbursement,
          APPROVED_DATE: new Date(),
          REPAYMENT_SOURCE_ACCOUNT: repaymentAccount?.ACCT_NO
        }
      },
      { session }
    );

    // Update Credit Application
    await CreditApplication.updateOne(
      { _id: creditApplication._id },
      {
        $set: {
          STATUS: 'APPROVED',
          UPDATED_AT: new Date()
        }
      },
      { session }
    );

    // Update Work Item
    await WF_WORK_ITEM.updateOne(
      { WORK_ITEM_ID: workItemId },
      {
        $set: {
          STATUS: 'APPROVED',
          COMPLETED_BY: approvedBy,
          COMPLETED_AT: new Date(),
          COMMENTS: approvalComments || 'Approved'
        }
      },
      { session }
    );

    // TODO: Create disbursement transaction and repayment schedule (if applicable)

    await session.commitTransaction();
    transactionSuccess = true;

    return res.status(200).json({
      success: true,
      message: 'Loan approved successfully',
      data: {
        loanAccountNumber: loanAccount.ACCT_NO,
        netDisbursement,
        repaymentAccount: repaymentAccount?.ACCT_NO,
        guarantorId: guarantor.GUARANTOR_ID
      }
    });
  } catch (error) {
    if (!transactionSuccess) await session.abortTransaction();
    console.error('Approval error:', error);
    return res.status(500).json({
      success: false,
      message: 'Loan approval failed',
      code: 'APPROVAL_ERROR',
      error: error.message,
      supportReference: generateSupportReference()
    });
  } finally {
    session.endSession();
  }
},


async disburseLoan(req, res) {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();

    // Helper function to get product type
    const getProductType = async (PROD_ID) => {
      const loanProduct = await LoanProduct.findOne({ PROD_ID }).session(session);
      if (!loanProduct) throw new Error(`Product ${PROD_ID} not found`);
      return loanProduct.PRODUCT_TYPE || loanProduct.name || 'UNKNOWN';
    };

    // Destructure and validate request body
    const {
      APPL_ID,
      CUST_ID,
      ACCT_NO,
      fundingAcctNo,
      AMOUNT,
      TERM_CD = 'M',
      TERM_VALUE,
      INTEREST_RATE,
      PROD_ID,
      INDEX_RATE_ID,
      borrower_name,
      borrower_address,
      DISBURSEMENT_DATE = new Date().toISOString().split('T')[0],
      MATURITY_DT,
      CREATED_BY = req.user?.id || 'system',
      APPROVAL_STATUS = 'PENDING',
      SCHEDULE_TYPE = 'STANDARD',
      bank_short = 'N/A',
      bank_name = 'N/A',
      loan_purpose = 'General',
      deductUpfrontInterest = false,
      partialUpfrontInterest = false,
      upfrontInterestPercentage = 0,
      // Guarantor fields
      GUARANTOR_ID,
      GUARANTEED_AMT,
      guarantor_name,
      guarantor_relationship,
      guarantor_contact,
      guarantor_id_type,
      guarantor_id_number
    } = req.body;

    // Validate required fields
    const requiredFields = [
      'APPL_ID', 'CUST_ID', 'ACCT_NO', 'fundingAcctNo', 'AMOUNT', 'PROD_ID',
      'GUARANTOR_ID', 'GUARANTEED_AMT', 'guarantor_name', 'guarantor_relationship'
    ];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    // Validate upfront interest parameters
    if (partialUpfrontInterest) {
      if (deductUpfrontInterest) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Cannot enable both full and partial upfront interest',
          code: 'CONFLICTING_INTEREST_OPTIONS'
        });
      }
      if (isNaN(upfrontInterestPercentage)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Upfront interest percentage must be a number',
          code: 'INVALID_UPFRONT_PERCENTAGE'
        });
      }
      if (upfrontInterestPercentage <= 0 || upfrontInterestPercentage > 100) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Upfront interest percentage must be between 0 and 100',
          code: 'INVALID_UPFRONT_PERCENTAGE'
        });
      }
    }

    // Validate guarantor details
    if (GUARANTEED_AMT <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Guaranteed amount must be positive',
        code: 'INVALID_GUARANTEED_AMOUNT'
      });
    }
    if (GUARANTEED_AMT > AMOUNT * 2) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Guaranteed amount cannot exceed twice the loan amount',
        code: 'EXCESSIVE_GUARANTEED_AMOUNT'
      });
    }

    // Validate dates
    const disbursementDate = new Date(DISBURSEMENT_DATE);
    if (isNaN(disbursementDate.getTime())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid disbursement date format',
        code: 'INVALID_DISBURSEMENT_DATE'
      });
    }

    let maturityDate;
    if (MATURITY_DT) {
      maturityDate = new Date(MATURITY_DT);
    } else if (TERM_VALUE && TERM_CD) {
      maturityDate = new Date(disbursementDate);
      TERM_CD.toUpperCase() === 'M'
        ? maturityDate.setMonth(maturityDate.getMonth() + TERM_VALUE)
        : maturityDate.setFullYear(maturityDate.getFullYear() + TERM_VALUE);
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Either MATURITY_DT or both TERM_VALUE and TERM_CD must be provided',
        code: 'MISSING_MATURITY_INFO'
      });
    }

    if (isNaN(maturityDate.getTime())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid maturity date format',
        code: 'INVALID_MATURITY_DATE'
      });
    }
    if (disbursementDate >= maturityDate) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Maturity date must be after disbursement date',
        code: 'INVALID_DATE_RANGE'
      });
    }

    // Validate loan amount
    if (AMOUNT <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Loan amount must be positive',
        code: 'INVALID_LOAN_AMOUNT'
      });
    }

    // Get product type and validate related entities
    const PRODUCT_TYPE = await getProductType(PROD_ID);
    const [loanProduct, customerAccount, creditApplication] = await Promise.all([
      LoanProduct.findOne({ PROD_ID }).session(session),
      Customer.findOne({ CUST_ID }).session(session),
      CreditApplication.findOne({ APPL_ID }).session(session)
    ]);

    if (!loanProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Loan product not found',
        code: 'PRODUCT_NOT_FOUND'
      });
    }
    if (!customerAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
        code: 'CUSTOMER_NOT_FOUND'
      });
    }

    // UPDATED GUARANTOR VALIDATION WITH CORRECT FIELD NAME
    const existingGuarantor = await Guarantor.findOne({ GUARANTOR_ID }).session(session);
    if (!existingGuarantor) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Guarantor ${GUARANTOR_ID} not found`,
        code: 'GUARANTOR_NOT_FOUND'
      });
    }

    // Debug logs with correct field names
    console.log('Database Guarantor Record:', {
      _id: existingGuarantor._id,
      GUARANTOR_ID: existingGuarantor.GUARANTOR_ID,
      fullName: existingGuarantor.fullName,
      relationshipToBorrower: existingGuarantor.relationshipToBorrower,
      status: existingGuarantor.status
    });

    console.log('Provided Guarantor Details:', {
      GUARANTOR_ID,
      name: guarantor_name,
      relationship: guarantor_relationship
    });

    // Normalize strings for comparison
    const normalizeString = (str) => String(str || '').trim().toLowerCase();

    // Verify guarantor details match application
    if (normalizeString(existingGuarantor.fullName) !== normalizeString(guarantor_name) || 
        normalizeString(existingGuarantor.relationshipToBorrower) !== normalizeString(guarantor_relationship)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Guarantor details do not match application records. ` +
                 `Expected: ${existingGuarantor.fullName} (${existingGuarantor.relationshipToBorrower}), ` +
                 `Received: ${guarantor_name} (${guarantor_relationship})`,
        code: 'GUARANTOR_DETAILS_MISMATCH'
      });
    }

    // Check for existing active loan
    const existingLoanAccount = await LoanAccount.findOne({ ACCT_NO }).session(session);
    if (existingLoanAccount && existingLoanAccount.LOAN_STATUS === 'ACTIVE') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Loan already disbursed or active for account number ${ACCT_NO}`,
        code: 'LOAN_ALREADY_ACTIVE'
      });
    }

    // Calculate fees
    const feeService = new FeeCalculationService();
    const feeDetails = await feeService.calculateInitialFees({
      loanAmount: AMOUNT,
      productId: PROD_ID,
      term: TERM_VALUE,
      termCode: TERM_CD,
      hasGuarantor: true,
      guaranteedAmount: GUARANTEED_AMT
    });
    const totalFees = feeDetails.totalFees;

    // Calculate interest
    const termMonths = TERM_CD.toUpperCase() === 'M' ? TERM_VALUE : TERM_VALUE * 12;
    const totalInterest = (AMOUNT * (INTEREST_RATE / 100) * termMonths) / 12;

    // Calculate upfront interest
    let upfrontInterest = 0;
    let remainingInterest = totalInterest;
    
    if (partialUpfrontInterest) {
      const percentage = parseFloat(upfrontInterestPercentage) / 100;
      upfrontInterest = totalInterest * percentage;
      remainingInterest = totalInterest - upfrontInterest;
      feeDetails.upfrontInterest = upfrontInterest;
      feeDetails.upfrontInterestPercentage = upfrontInterestPercentage;
    } else if (deductUpfrontInterest) {
      upfrontInterest = totalInterest;
      remainingInterest = 0;
      feeDetails.upfrontInterest = upfrontInterest;
    }

    // Generate repayment schedule
    const upperTermCd = TERM_CD.toUpperCase();
    const emiResult = await calculateEMI({
      principal: AMOUNT,
      annualRate: INTEREST_RATE,
      termMonths: upperTermCd === 'M' ? TERM_VALUE : TERM_VALUE * 12,
      startDate: disbursementDate,
      remainingInterest: remainingInterest,
      partialUpfrontInterest,
      upfrontInterestPercentage
    });

    if (!emiResult?.installments) {
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: 'Failed to generate repayment schedule',
        code: 'SCHEDULE_GENERATION_FAILED'
      });
    }

    // Generate transaction IDs
    const TRANSACTION_IDS = generateTransactionIds();
    const workflowId = Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);

    // Determine approval status
    const resolvedApprovalStatus = ['APPROVED', 'PENDING'].includes(APPROVAL_STATUS.toUpperCase())
      ? APPROVAL_STATUS.toUpperCase()
      : 'PENDING';

    // Update guarantor record with loan reference
    await Guarantor.updateOne(
      { _id: existingGuarantor._id },
      { 
        $set: {
          loanId: existingLoanAccount?._id || null,
          loanAccountNo: ACCT_NO,
          customerId: CUST_ID,
          status: 'PENDING_VERIFICATION',
          lastUpdated: new Date(),
          updatedBy: CREATED_BY
        }
      },
      { session }
    );

    // Prepare loan account payload
    const loanAccountPayload = {
      loanAccountId: ACCT_NO,
      JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      CUST_ID,
      ACCT_NM: customerAccount.ACCT_NM,
      ACCT_NO,
      APPL_ID,
      CRNCY_ID: 'NGN',
      BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
      PRIMARY_OFFICER_ID: customerAccount.PRIMARY_OFFICER_ID || null,
      SECONDARY_OFFICER_ID: customerAccount.SECONDARY_OFFICER_ID || null,
      DISBURSEMENT_LIMIT: AMOUNT,
      ACTUAL_DISBURSEMENT: AMOUNT - upfrontInterest,
      START_DT: disbursementDate,
      TERM_CD,
      TERM_VALUE,
      MATURITY_DT: maturityDate,
      TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
      PROD_ID,
      PRODUCT_TYPE,
      INDEX_RATE_ID,
      INTEREST_RATE_ID: loanProduct.interestRateId,
      INTEREST_RATE,
      LOAN_STATUS: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'PENDING',
      PAYMENT_FREQUENCY: loanProduct.paymentFrequency || 'Monthly',
      CREATED_BY,
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      FEE_DETAILS: feeDetails,
      TOTAL_INTEREST: totalInterest,
      TOTAL_REPAYMENT: AMOUNT + totalInterest,
      REPAYMENT_SOURCE_ACCOUNT: fundingAcctNo,
      REPAYMENT_SCHEDULE_TYPE: SCHEDULE_TYPE,
      NEXT_PAYMENT_DATE: emiResult.installments?.[0]?.dueDate,
      workflowId,
      deductUpfrontInterest,
      partialUpfrontInterest,
      upfrontInterestPercentage,
      upfrontInterestAmount: upfrontInterest,
      remainingInterestAmount: remainingInterest,
      GUARANTOR_ID: existingGuarantor._id,
      GUARANTEED_AMOUNT: GUARANTEED_AMT,
      HAS_GUARANTOR: true
    };

    // Create or update loan account
    const loanAccount = await LoanAccount.findOneAndUpdate(
      { ACCT_NO },
      { $set: loanAccountPayload },
      { new: true, upsert: true, session }
    );

    // Update credit application with loan account ID if exists
    if (creditApplication) {
      await CreditApplication.updateOne(
        { _id: creditApplication._id },
        { $set: { LOAN_ACCOUNT_ID: loanAccount._id } },
        { session }
      );
    }

   
   // Create loan contract with proper fallbacks
const loanContract = new LoanContractForm({
  loan_contract_no: `LC-${ACCT_NO}-${Date.now()}`,
  customer_id: CUST_ID,
  applicationId: APPL_ID,
  borrower_name: borrower_name || customerAccount.ACCT_NM || 'Unknown Borrower',
  borrower_address: borrower_address || customerAccount.ADDRESS_LINE1 || 'Unknown Address',
  loan_amount: AMOUNT,
  loan_term: TERM_VALUE,
  TERM_CD: upperTermCd,
  interest_rate: INTEREST_RATE,
  index_rate_id: INDEX_RATE_ID,
  status: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'PENDING',
  USER_ID: CREATED_BY,
  loanAccountNo: ACCT_NO,
  fundingAccountNo: fundingAcctNo,
  productDetails: {
    productId: loanProduct._id,
    productCode: loanProduct.productCode,
    productName: loanProduct.name
  },
  fees: {
    ...feeDetails,
    processingFee: feeDetails.processingFee || 0,
    upfrontInterest: upfrontInterest,
    upfrontInterestPercentage: partialUpfrontInterest ? upfrontInterestPercentage : null
  },
  repaymentSchedule: emiResult.installments,
  emiAmount: emiResult.emi,
  totalInterest: totalInterest,
  totalRepayment: AMOUNT + totalInterest,
  disbursementDate,
  maturityDate,
  bank_short,
  bank_name,
  loan_purpose,
  workflowId,
  deductUpfrontInterest,
  partialUpfrontInterest,
  upfrontInterestPercentage,
  guarantorDetails: {
    guarantorId: existingGuarantor._id,
    guarantorName: guarantor_name,
    relationship: guarantor_relationship,
    contact: guarantor_contact,
    guaranteedAmount: GUARANTEED_AMT,
    status: 'PENDING_VERIFICATION'
  }
});

    // Create workflow item
    const wfWorkItem = new WF_WORK_ITEM({
      WORK_ITEM_ID: workflowId,    
      referenceId: ACCT_NO,
      entity: 'LoanDisbursement',
      entityType: 'Loan',
      entityId: loanAccount._id,
      processId: 'LoanDisbursement',
      currentStep: 'DISBURSEMENT',
      assignedTo: CREATED_BY,
      status: resolvedApprovalStatus,
      createdBy: CREATED_BY,
      createdAt: new Date(),
      guarantorId: existingGuarantor._id,
      metadata: {
        hasGuarantor: true,
        guaranteedAmount: GUARANTEED_AMT,
        upfrontInterest: {
          type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
          amount: upfrontInterest,
          percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
        }
      }
    });

    // Prepare repayment schedule
    const repaymentSchedule = emiResult.installments.map((installment, index) => ({
      LOAN_ACCOUNT_ID: loanAccount._id,
      CUST_ID,
      ACCT_NO,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      TERM_TYPE: TERM_CD,
      TERM: TERM_VALUE,
      INTEREST_RATE,
      PRINCIPAL_AMOUNT: AMOUNT,
      MATURITY_DATE: maturityDate,
      START_DATE: disbursementDate,
      installmentNo: index + 1,
      dueDate: installment.dueDate,
      principal: installment.principal,
      interest: installment.interest,
      totalPayment: installment.totalPayment,
      remainingBalance: installment.remainingBalance,
      status: 'PENDING',
      CREATED_BY,
      UPFRONT_INTEREST: {
        type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
        amount: partialUpfrontInterest || deductUpfrontInterest ? upfrontInterest : 0,
        percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
      },
      GUARANTOR_ID: existingGuarantor._id,
      GUARANTEED_AMOUNT: GUARANTEED_AMT
    }));

    // Save all documents
    await Promise.all([
      loanContract.save({ session }),
      wfWorkItem.save({ session }),
      RepaymentSchedule.insertMany(repaymentSchedule, { session })
    ]);

    
// Process disbursement if approved
 // Process disbursement if approved
    let netDisbursement = 0;
    if (resolvedApprovalStatus === 'APPROVED') {
      netDisbursement = AMOUNT - totalFees - upfrontInterest;
      
      // Create disbursement transaction with all required fields
      const disbursementTx = new Transaction({
        TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
        EVENT_ID: TRANSACTION_IDS.EVENT_ID,
        JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
        TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
        ACCT_ID: loanAccount._id,
        ACCT_NO: loanAccount.ACCT_NO,
        ACCT_NM: loanAccount.ACCT_NM || customerAccount.ACCT_NM || 'Unknown Account',
        CUST_ID: loanAccount.CUST_ID,
        BU_ID: loanAccount.BU_ID || customerAccount.BU_ID || 'DEFAULT_BU',
        FROM_ACCT_NO: loanProduct.fundingSource || '1-002-102-5-200-1',
        TO_ACCT_NO: fundingAcctNo,
        AMOUNT: netDisbursement,
        CRNCY_ID: 'NGN',
        TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
        TRANSACTION_DESC: `Loan disbursed to ${loanAccount.ACCT_NM}`,
        STATUS: 'COMPLETED',
        VALUE_DATE: new Date(),
        createdBy: CREATED_BY, // Now guaranteed to have a value
        guarantorId: existingGuarantor._id,
        GUARANTEED_AMOUNT: GUARANTEED_AMT,
        metadata: {
          loanAccountNo: ACCT_NO,
          productType: PRODUCT_TYPE,
          upfrontInterest: {
            type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
            amount: upfrontInterest,
            percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
          },
          createdBy: CREATED_BY
        }
      });

      await disbursementTx.save({ session });


  // Update account balances
  await Promise.all([
    CustomerAccount.updateOne(
      { ACCT_NO: fundingAcctNo },
      { $inc: { BALANCE: -(netDisbursement + upfrontInterest) } },
      { session }
    ),
    CustomerAccount.updateOne(
      { ACCT_NO },
      { $inc: { BALANCE: netDisbursement } },
      { session }
    ),
    Guarantor.updateOne(
      { _id: existingGuarantor._id },
      { $set: { status: 'ACTIVE' } },
      { session }
    )
  ]);
}
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: resolvedApprovalStatus === 'APPROVED'
        ? 'Loan disbursed successfully with guarantor'
        : 'Loan prepared for disbursement with guarantor - pending approval',
      data: {
        WORK_ITEM_ID: workflowId, // Changed to uppercase to match your requirement
        loanAccount: {
          ACCT_NO,
          status: resolvedApprovalStatus,
          disbursedAmount: resolvedApprovalStatus === 'APPROVED' ? netDisbursement : 0,
          emi: emiResult.emi,
          nextPaymentDate: emiResult.installments?.[0]?.dueDate,
          maturityDate,
          upfrontInterest: {
            type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
            amount: upfrontInterest,
            percentage: partialUpfrontInterest ? upfrontInterestPercentage : null,
            remainingInterest: remainingInterest
          },
          guarantor: {
            guarantorId: existingGuarantor._id,
            name: guarantor_name,
            guaranteedAmount: GUARANTEED_AMT,
            status: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'PENDING_VERIFICATION'
          }
        },
        contract: {
          contractNo: loanContract.loan_contract_no,
          status: resolvedApprovalStatus
        },
        repaymentSchedule: {
          installments: emiResult.installments.length,
          totalInterest: totalInterest,
          schedule: emiResult.installments.slice(0, 5).map(s => ({
            installmentNo: s.installmentNo,
            dueDate: s.dueDate,
            amount: s.totalPayment,
            status: s.status
          }))
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Loan disbursement error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to process loan disbursement',
      code: error.code || 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    session.endSession();
  }
},

// Helper function for error messages - place this BEFORE the approveLoanDisbursement function
async getErrorMessage  (error, sourceAcctNo)  {
  const errorMessages = {
    'GL_ACCOUNT_NOT_FOUND': `The treasury GL account ${sourceAcctNo} was not found`,
    'GL_ACCOUNT_DEBIT_NOT_ALLOWED': `The treasury GL account ${sourceAcctNo} cannot be debited`,
    'INSUFFICIENT_GL_BALANCE': `Insufficient funds in treasury GL account ${sourceAcctNo}`,
    'TRANSACTION_VALIDATION_FAILED': `Transaction validation failed: ${error.message}`,
    'UPFRONT_INTEREST_ALREADY_DEDUCTED': 'Cannot approve disbursement - upfront interest was already deducted',
    'INVALID_GUARANTOR_STATUS': `Invalid guarantor status: ${error.message}`,
    'MISSING_REQUIRED_FIELDS': error.message,
    'INVALID_APPROVER': error.message,
    'INVALID_LOAN_FEE_PERCENTAGE': error.message,
    'INVALID_LOAN_FEE_RANGE': error.message,
    'WORK_ITEM_NOT_FOUND': error.message,
    'LOAN_CONTRACT_NOT_FOUND': error.message,
    'LOAN_ACCOUNT_NOT_FOUND': 'Loan account not found',
    'CUSTOMER_ACCOUNT_NOT_FOUND': 'Customer account not found',
    'INVALID_LOAN_AMOUNT': 'Invalid loan amount',
    'INVALID_REPAYMENT_SCHEDULE': 'Failed to generate repayment schedule'
  };
  
  return errorMessages[error.code] || error.message || 'An unexpected error occurred';
},


async approveLoanDisbursement(req, res) {
  const DISBURSEMENT_STATUS = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    DISBURSED: 'DISBURSED',
    ACTIVE: 'ACTIVE',
    CLOSED: 'CLOSED'
  };

  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    const result = await session.withTransaction(async () => {
      const { workItemId, approvedBy = req.user?.id || 'system' } = req.body;

      if (!workItemId) {
        throw {
          status: 400,
          code: 'MISSING_REQUIRED_FIELDS',
          message: 'Missing required field: workItemId',
          details: { missingFields: ['workItemId'] }
        };
      }

      // Generate unique transaction IDs
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 10000);
      const transactionIds = {
        TRANSACTION_ID: `TXN-${timestamp}-${randomSuffix}`,
        EVENT_ID: `EVT-${timestamp}-${randomSuffix}`,
        JOURNAL_ID: `JRN-${timestamp}-${randomSuffix}`
      };

      // Fetch work item
      const workItem = await WF_WORK_ITEM.findOne({
        WORK_ITEM_ID: workItemId,
        status: { $in: ['PENDING', 'APPROVAL_PENDING', 'READY_FOR_DISBURSEMENT'] }
      }).session(session);

      if (!workItem) {
        const existingItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId }).session(session);
        throw {
          status: 404,
          code: 'WORK_ITEM_NOT_FOUND',
          message: existingItem
            ? `Work item is in ${existingItem.status} status`
            : 'Work item not found'
        };
      }

      // Loan account
      const loanAccount = await LoanAccount.findById(workItem.entityId).session(session);
      if (!loanAccount) {
        throw {
          code: 'LOAN_ACCOUNT_NOT_FOUND',
          status: 404,
          message: 'Loan account not found for this work item'
        };
      }

      // Loan contract
      const loanContract = await LoanContractForm.findOne({
        loanAccountNo: loanAccount.ACCT_NO
      }).session(session);

      if (!loanContract) {
        throw {
          code: 'LOAN_CONTRACT_NOT_FOUND',
          status: 404,
          message: 'Loan contract not found for this work item'
        };
      }

      const productDetails = loanContract.productDetails || {};
      const PROD_ID = loanAccount.PROD_ID || productDetails.productId || productDetails.PROD_ID;
      const PRODUCT_TYPE = loanAccount.PRODUCT_TYPE || productDetails.productType || 'STANDARD_LOAN';

      if (!PROD_ID) {
        throw {
          code: 'MISSING_PRODUCT_ID',
          status: 400,
          message: 'Loan product ID (PROD_ID) is required but missing'
        };
      }

      // Customer account
      const customerAccount = await CustomerAccount.findOne({
        ACCT_NO: loanContract.fundingAccountNo
      }).session(session);

      if (!customerAccount) {
        throw {
          code: 'CUSTOMER_ACCOUNT_NOT_FOUND',
          status: 404,
          message: `Funding account ${loanContract.fundingAccountNo} not found`
        };
      }

      const loanAmount = parseFloat(loanContract.loan_amount);
      if (isNaN(loanAmount) || loanAmount <= 0) {
        throw {
          code: 'INVALID_LOAN_AMOUNT',
          status: 400,
          message: `Invalid loan amount: ${loanContract.loan_amount}`
        };
      }

      // Process the loan disbursement
      const disbursementResult = await processLoanDisbursementTransactions({
        session,
        loanAccount,
        customerAccount,
        AMOUNT: loanAmount,
        fundingAcctNo: loanContract.fundingAccountNo,
        ACCT_NO: loanAccount.ACCT_NO,
        CREATED_BY: approvedBy,
        INTEREST_RATE: loanContract.interest_rate,
        PRODUCT_TYPE,
        TRANSACTION_ID: transactionIds.TRANSACTION_ID,
        EVENT_ID: transactionIds.EVENT_ID,
        JOURNAL_ID: transactionIds.JOURNAL_ID,
        BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
        CUST_ID: loanAccount.CUST_ID,
        ACCT_NM: customerAccount.ACCT_NM || 'Unknown Customer',
        deductUpfrontInterest: loanContract.deductUpfrontInterest,
        partialUpfrontInterest: loanContract.partialUpfrontInterest,
        upfrontInterestAmount: loanContract.upfrontInterestAmount || 0,
        upfrontInterestPercentage: loanContract.upfrontInterestPercentage || 0,
        loanFeeAmount: loanContract.loanFeeAmount || 0,
        guarantorId: loanContract.guarantorId,
        guaranteedAmount: loanContract.guaranteedAmount || 0,
        guarantorName: loanContract.guarantorName || ''
      });

      // Console logs
      console.log("Full disbursement:", loanAmount);
      console.log("Fee:", disbursementResult.feeAmount);
      console.log("Upfront interest:", disbursementResult.upfrontInterest.amount);
      console.log(
        "Net disbursed to customer:",
        loanAmount - disbursementResult.feeAmount - disbursementResult.upfrontInterest.amount
      );
      console.log("Loan outstanding principal:", loanAmount);

      // Update work item
      Object.assign(workItem, {
        status: DISBURSEMENT_STATUS.APPROVED,
        approvedBy,
        approvedAt: new Date(),
        transactionDetails: transactionIds
      });
      await workItem.save({ session });

      // Update loan account
      Object.assign(loanAccount, {
        STATUS: DISBURSEMENT_STATUS.ACTIVE,
        OPEN_DATE: new Date(),
        TRANSACTION_ID: transactionIds.TRANSACTION_ID,
        JOURNAL_ID: transactionIds.JOURNAL_ID
      });
      await loanAccount.save({ session });

      // Update loan contract
      Object.assign(loanContract, {
        status: DISBURSEMENT_STATUS.APPROVED,
        approvedBy,
        approvedAt: new Date(),
        disbursementDate: new Date(),
        transactionDetails: transactionIds
      });
      await loanContract.save({ session });

      return {
        success: true,
        message: 'Loan disbursement approved successfully',
        data: {
          transactionIds,
          disbursedAmount: loanAmount,
          accountNo: loanAccount.ACCT_NO,
          contractNo: loanContract.loan_contract_no,
          productId: PROD_ID,
          customerName: customerAccount.ACCT_NM,
          transactions: disbursementResult.transactions
        }
      };
    });

    transactionCompleted = true;
    return res.status(200).json(result);

  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }

    console.error('Disbursement approval failed:', {
      error: error.message,
      code: error.code || 'DISBURSEMENT_ERROR',
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Disbursement approval failed',
      code: error.code || 'DISBURSEMENT_ERROR',
      details: error.details || null
    });

  } finally {
    await session.endSession();
  }
},


async rejectLoanApplication(req, res) {
    // ✅ Validate request body with detailed error messages
    const { workItemId, rejectedBy, reason, overrideChecks = false } = req.body;
    
    const missingFields = [];
    if (!workItemId) missingFields.push('workItemId');
    if (!rejectedBy) missingFields.push('rejectedBy');
    if (!reason) missingFields.push('reason');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS',
        missingFields,
        details: {
          received: {
            workItemId: !!workItemId,
            rejectedBy: !!rejectedBy,
            reason: !!reason
          }
        }
      });
    }

    // Validate officer ID format if provided
    const officerIdRegex = /^[A-Z]{2,3}\d{3,4}$/;
    if (!officerIdRegex.test(rejectedBy)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rejector ID must be in format AA123 or AAA1234',
        code: 'INVALID_OFFICER_ID',
        details: { rejectedBy }
      });
    }

    const session = await mongoose.startSession();
    let transactionCompleted = false;

    try {
      await session.withTransaction(async () => {
        // 1. Update workflow status with enhanced tracking
        const workflowResult = await WF_WORK_ITEMController.rejectWorkItem({
          workItemId,
          rejectedBy,
          reason,
          metadata: {
            action: 'LOAN_REJECTION',
            overrideChecks,
            ipAddress: req.ip
          },
          session
        });

        if (!workflowResult.success) {
          throw {
            code: 'WORKFLOW_REJECTION_FAILED',
            message: workflowResult.message,
            status: 400,
            details: workflowResult.error
          };
        }

        // 2. Get related documents with comprehensive error handling
        const [loanContract, loanAccount, creditApplication, guarantor] = await Promise.all([
          LoanContractForm.findOne({
            $or: [
              { _id: workflowResult.data.ITEM_ID },
              { loanAccountNo: workflowResult.data.ITEM_VALUE }
            ]
          }).session(session),
          LoanAccount.findOne({
            $or: [
              { _id: workflowResult.data.ITEM_ID },
              { ACCT_NO: workflowResult.data.ITEM_VALUE }
            ]
          }).session(session),
          CreditApplication.findOne({
            $or: [
              { _id: workflowResult.data.ITEM_ID },
              { APPL_ID: workflowResult.data.APPL_ID }
            ]
          }).session(session),
          Guarantor.findOne({
            $or: [
              { _id: workflowResult.data.GUARANTOR_ID },
              { loanId: workflowResult.data.ITEM_ID }
            ],
            status: { $ne: 'RELEASED' }
          }).session(session)
        ]);

        // 3. Validate upfront interest status with safety checks
        const hasUpfrontInterest = loanAccount?.DEDUCT_UPFRONT_INTEREST || loanAccount?.PARTIAL_UPFRONT_INTEREST;
        const upfrontInterestAmount = parseFloat(loanAccount?.UPFRONT_INTEREST_AMOUNT?.toString() || '0');
        
        if (hasUpfrontInterest && loanAccount?.UPFRONT_INTEREST_PAID && !overrideChecks) {
          throw {
            code: 'UPFRONT_INTEREST_ALREADY_DEDUCTED',
            message: 'Cannot reject loan - upfront interest was already deducted (use overrideChecks if intentional)',
            status: 400,
            details: {
              upfrontInterestPaid: loanAccount.UPFRONT_INTEREST_PAID,
              paidDate: loanAccount.UPFRONT_INTEREST_PAID_DATE,
              amount: upfrontInterestAmount
            }
          };
        }

        // 4. Process interest reversal if needed (with override capability)
        if (hasUpfrontInterest && loanAccount?.UPFRONT_INTEREST_PAID && overrideChecks) {
          const loanProduct = await LoanProduct.findOne({ 
            PROD_ID: loanAccount.PROD_ID 
          }).session(session);

          const interestIncomeAccount = loanProduct?.INTEREST_INCOME_ACCOUNT || '1-01-400-100-100-1';
          const fundingAccount = await CustomerAccount.findOne({
            ACCT_NO: loanAccount.REPAYMENT_SOURCE_ACCOUNT
          }).session(session);

          if (!fundingAccount) {
            throw {
              code: 'FUNDING_ACCOUNT_NOT_FOUND',
              message: 'Cannot reverse upfront interest - funding account not found',
              status: 404,
              details: {
                accountNumber: loanAccount.REPAYMENT_SOURCE_ACCOUNT
              }
            };
          }

          // Generate transaction IDs for reversal
          const { TRANSACTION_ID, EVENT_ID } = generateTransactionIds();

          // Create reversal transaction
          const reversalTx = new Transaction({
            TRANSACTION_ID,
            EVENT_ID,
            JOURNAL_ID: loanAccount.JOURNAL_ID,
            ACCT_NO: loanAccount.ACCT_NO,
            CUST_ID: loanAccount.CUST_ID,
            AMOUNT: upfrontInterestAmount,
            CRNCY_ID: loanAccount.CRNCY_ID || 'NGN',
            TRANSACTION_TYPE: 'INTEREST_REVERSAL',
            TRANSACTION_DESC: `Reversal of upfront interest for rejected loan ${loanAccount.ACCT_NO}`,
            STATUS: 'COMPLETED',
            VALUE_DATE: new Date(),
            CREATED_BY: rejectedBy,
            debitAccount: interestIncomeAccount,
            creditAccount: fundingAccount.ACCT_NO,
            metadata: {
              originalTransaction: loanAccount.TRANSACTION_ID,
              loanAccountNo: loanAccount.ACCT_NO,
              guarantorId: guarantor?._id,
              override: true,
              workflowId: workItemId
            }
          });

          await reversalTx.save({ session });

          // Update account balances
          await Promise.all([
            CustomerAccount.updateOne(
              { _id: fundingAccount._id },
              { 
                $inc: { BALANCE: upfrontInterestAmount },
                $push: {
                  transactions: {
                    transactionId: TRANSACTION_ID,
                    amount: upfrontInterestAmount,
                    type: 'INTEREST_REVERSAL',
                    date: new Date(),
                    description: reversalTx.TRANSACTION_DESC
                  }
                }
              },
              { session }
            ),
            CustomerAccount.updateOne(
              { ACCT_NO: interestIncomeAccount },
              { 
                $inc: { BALANCE: -upfrontInterestAmount },
                $push: {
                  transactions: {
                    transactionId: TRANSACTION_ID,
                    amount: -upfrontInterestAmount,
                    type: 'INTEREST_REVERSAL',
                    date: new Date(),
                    description: reversalTx.TRANSACTION_DESC
                  }
                }
              },
              { session }
            )
          ]);
        }

        // 5. Update all related records with comprehensive field clearing
        const updatePromises = [];
        const now = new Date();
        
        if (loanContract) {
          const updateData = {
            status: 'REJECTED',
            rejectedBy,
            rejectedAt: now,
            rejectionReason: reason,
            updatedAt: now,
            deductUpfrontInterest: false,
            partialUpfrontInterest: false,
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            guarantorDetails: {
              status: 'RELEASED',
              releaseDate: now,
              releaseReason: `Loan rejection: ${reason}`
            }
          };
          updatePromises.push(loanContract.updateOne(updateData, { session }));
        }

        if (loanAccount) {
          const updateData = {
            LOAN_STATUS: 'REJECTED',
            REJECTED_BY: rejectedBy,
            REJECTED_DATE: now,
            UPDATED_AT: now,
            DEDUCT_UPFRONT_INTEREST: false,
            PARTIAL_UPFRONT_INTEREST: false,
            UPFRONT_INTEREST_AMOUNT: 0,
            UPFRONT_INTEREST_PERCENTAGE: 0,
            UPFRONT_INTEREST_PAID: false,
            UPFRONT_INTEREST_PAID_DATE: null,
            GUARANTOR_ID: null,
            GUARANTEED_AMOUNT: 0,
            HAS_GUARANTOR: false,
            REJECTION_REASON: reason
          };
          updatePromises.push(loanAccount.updateOne(updateData, { session }));
        }

        if (creditApplication) {
          const updateData = {
            STATUS: 'REJECTED',
            REJECTED_BY: rejectedBy,
            REJECTED_DATE: now,
            UPDATED_AT: now,
            REJECTION_REASON: reason,
            deductUpfrontInterest: false,
            partialUpfrontInterest: false,
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            GUARANTOR_STATUS: 'RELEASED'
          };
          updatePromises.push(creditApplication.updateOne(updateData, { session }));
        }

        if (guarantor) {
          const updateData = {
            status: 'RELEASED',
            releasedBy: rejectedBy,
            releasedDate: now,
            releaseReason: `Loan rejection: ${reason}`,
            updatedAt: now,
            loanAccountNo: null,
            loanAccountId: null,
            creditApplicationId: null
          };
          updatePromises.push(guarantor.updateOne(updateData, { session }));
        }

        await Promise.all(updatePromises);

        // 6. Log comprehensive audit trail
        await logAuditTrail({
          eventType: 'LOAN_REJECTION',
          userId: rejectedBy,
          entityType: 'Loan',
          entityId: loanAccount?._id || workflowResult.data.ITEM_ID,
          action: 'REJECT',
          oldValues: {
            status: 'PENDING',
            interestType: loanAccount?.PARTIAL_UPFRONT_INTEREST ? 'PARTIAL' : 
                         loanAccount?.DEDUCT_UPFRONT_INTEREST ? 'FULL' : 'NONE',
            upfrontInterestAmount: upfrontInterestAmount,
            upfrontInterestPercentage: loanAccount?.UPFRONT_INTEREST_PERCENTAGE || 0,
            hasGuarantor: loanAccount?.HAS_GUARANTOR || false,
            guarantorId: loanAccount?.GUARANTOR_ID || null,
            guaranteedAmount: loanAccount?.GUARANTEED_AMOUNT?.toString() || '0',
            workflowStatus: workflowResult.data.status
          },
          newValues: {
            status: 'REJECTED',
            rejectedBy,
            rejectionReason: reason,
            rejectionDate: now,
            interestType: 'NONE',
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            hasGuarantor: false,
            guarantorId: null,
            guaranteedAmount: '0',
            workflowStatus: 'REJECTED'
          },
          ipAddress: req.ip,
          metadata: {
            overrideUsed: overrideChecks,
            upfrontInterestReversed: hasUpfrontInterest && loanAccount?.UPFRONT_INTEREST_PAID,
            reversalAmount: hasUpfrontInterest ? upfrontInterestAmount : 0
          }
        }, session);

        // 7. Send detailed notification
        await NotificationService.send({
          ROLE_ID: [20, 19, 30], // Loan officers, managers, etc.
          USER_ID: [loanAccount?.CREATED_BY, guarantor?.RELATIONSHIP_OFFICER_ID].filter(Boolean),
          message: `Loan application ${loanAccount?.ACCT_NO || 'N/A'} with guarantor has been rejected`,
          status: 'REJECTED',
          notificationType: 'LOAN_REJECTION',
          metadata: {
            loanAccountNumber: loanAccount?.ACCT_NO || 'N/A',
            applicationId: creditApplication?.APPL_ID || 'N/A',
            customerName: loanAccount?.ACCT_NM || 'N/A',
            guarantorName: guarantor?.fullName || 'N/A',
            rejectionReason: reason,
            rejectedBy,
            rejectionDate: now,
            upfrontInterestHandling: hasUpfrontInterest ? 
              (loanAccount?.UPFRONT_INTEREST_PAID ? 'REVERSED' : 'CLEARED') : 'NONE',
            reversalAmount: hasUpfrontInterest && loanAccount?.UPFRONT_INTEREST_PAID ? 
              upfrontInterestAmount : 0,
            overrideUsed: overrideChecks
          }
        });

        transactionCompleted = true;

        return res.status(200).json({
          success: true,
          message: 'Loan application rejected successfully',
          code: 'LOAN_REJECTED',
          data: {
            workItemId,
            rejectedAt: now,
            rejectionReason: reason,
            upfrontInterest: {
              existed: hasUpfrontInterest,
              amount: upfrontInterestAmount,
              wasDeducted: loanAccount?.UPFRONT_INTEREST_PAID || false,
              wasReversed: hasUpfrontInterest && loanAccount?.UPFRONT_INTEREST_PAID,
              reversalAmount: hasUpfrontInterest && loanAccount?.UPFRONT_INTEREST_PAID ? 
                upfrontInterestAmount : 0
            },
            guarantor: {
              existed: !!guarantor,
              wasReleased: !!guarantor,
              guarantorId: guarantor?._id,
              guaranteedAmount: guarantor?.GUARANTEED_AMT || 0
            },
            affectedRecords: {
              loanContract: !!loanContract,
              loanAccount: !!loanAccount,
              creditApplication: !!creditApplication,
              guarantor: !!guarantor
            },
            overrideUsed: overrideChecks
          }
        });
      });
    } catch (error) {
      if (!transactionCompleted) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          logger.error('Transaction abort failed:', {
            error: abortError.message,
            originalError: error.message,
            workItemId,
            timestamp: new Date()
          });
        }
      }

      logger.error('Loan rejection failed:', {
        error: error.message,
        code: error.code || 'REJECTION_ERROR',
        stack: error.stack,
        workItemId,
        rejectedBy,
        timestamp: new Date(),
        details: error.details || {}
      });

      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Loan rejection failed',
        code: error.code || 'REJECTION_ERROR',
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          ...(error.details || {})
        } : undefined
      });
    } finally {
      await session.endSession();
    }
},

// Updated repayment schedule generator
async  generateRepaymentSchedule(amount, rate, term, termCode, accountNo, startDate, session) {
  // Your EMI calculation logic here
  const termMonths = termCode === 'M' ? term : term * 12;
  const monthlyRate = rate / 100 / 12;
  const emi = amount * monthlyRate * Math.pow(1 + monthlyRate, termMonths) / 
              (Math.pow(1 + monthlyRate, termMonths) - 1);

  let balance = amount;
  const installments = [];
  const start = new Date(startDate);

  for (let i = 0; i < termMonths; i++) {
    const interest = balance * monthlyRate;
    const principal = emi - interest;
    balance -= principal;

    const installment = {
      dueDate: new Date(start.setMonth(start.getMonth() + 1)),
      principal: parseFloat(principal.toFixed(2)),
      interest: parseFloat(interest.toFixed(2)),
      totalPayment: parseFloat(emi.toFixed(2)),
      remainingBalance: parseFloat(Math.max(0, balance).toFixed(2)),
      status: 'PENDING',
      installmentNo: i + 1 // Ensure installment number is included
    };

    installments.push(installment);
  }

  return installments;
},


async rejectLoanDisbursement(req, res) {
    const { 
      contractId, 
      rejectedBy, 
      rejectionReason,
      interestIncomeAccount = '1-01-400-100-100-1' // Default GL account
    } = req.body;

    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // 1. Find the loan contract and related documents
        const [loanContract, loanAccount, guarantor] = await Promise.all([
          LoanContractForm.findOne({
            loan_contract_no: contractId, 
            status: 'PENDING'
          }).session(session),
          LoanAccount.findOne({ ACCT_NO: contractId }).session(session),
          Guarantor.findOne({ loanAccountNo: contractId }).session(session)
        ]);

        if (!loanContract) {
          throw new Error('Pending loan contract not found or already processed');
        }

        // Check if upfront interest was collected
        const hasUpfrontInterest = loanContract.upfrontInterestAmount > 0;
        const hasGuarantor = !!guarantor;

        // 2. If upfront interest was collected, reverse it
        if (hasUpfrontInterest) {
          // Create journal entry to reverse the upfront interest
          await JournalEntry.create([{
            account: interestIncomeAccount,
            debit: 0,
            credit: loanContract.upfrontInterestAmount,
            description: `Reversal of upfront interest for rejected loan ${contractId}`,
            reference: contractId,
            date: new Date(),
            postedBy: rejectedBy,
            session
          }, {
            account: loanContract.disbursementAccount, // The account where interest was debited from
            debit: loanContract.upfrontInterestAmount,
            credit: 0,
            description: `Reversal of upfront interest for rejected loan ${contractId}`,
            reference: contractId,
            date: new Date(),
            postedBy: rejectedBy,
            session
          }], { session });
        }

        // 3. Update all related documents
        const updatePromises = [];

        // Update loan contract
        updatePromises.push(
          LoanContractForm.findOneAndUpdate(
            { _id: loanContract._id },
            { 
              $set: { 
                status: 'REJECTED',
                approvalStatus: 'REJECTED',
                rejectedBy,
                rejectedAt: new Date(),
                rejectionReason,
                ...(hasUpfrontInterest && { 
                  upfrontInterestReversed: true,
                  upfrontInterestReversalDate: new Date() 
                }),
                ...(hasGuarantor && {
                  'guarantorDetails.status': 'RELEASED'
                })
              } 
            },
            { new: true, session }
          )
        );

        // Update loan account if exists
        if (loanAccount) {
          updatePromises.push(
            LoanAccount.findOneAndUpdate(
              { _id: loanAccount._id },
              {
                $set: {
                  LOAN_STATUS: 'REJECTED',
                  REJECTED_BY: rejectedBy,
                  REJECTED_DATE: new Date(),
                  REJECTION_REASON: rejectionReason,
                  ...(hasUpfrontInterest && {
                    UPFRONT_INTEREST_REVERSED: true,
                    UPFRONT_INTEREST_REVERSAL_DATE: new Date()
                  }),
                  ...(hasGuarantor && {
                    GUARANTOR_ID: null,
                    GUARANTEED_AMOUNT: 0,
                    HAS_GUARANTOR: false
                  })
                }
              },
              { session }
            )
          );
        }

        // Update guarantor if exists
        if (guarantor) {
          updatePromises.push(
            Guarantor.findOneAndUpdate(
              { _id: guarantor._id },
              {
                $set: {
                  status: 'RELEASED',
                  releasedBy: rejectedBy,
                  releasedAt: new Date(),
                  releaseReason: `Loan rejection: ${rejectionReason}`,
                  loanId: null
                }
              },
              { session }
            )
          );
        }

        await Promise.all(updatePromises);

        // 4. Log audit trail with guarantor details
        await logAuditTrail({
          action: 'LOAN_REJECTION',
          performedBy: rejectedBy,
          entity: 'LoanContractForm',
          entityId: loanContract._id,
          details: {
            rejectionReason,
            loanAmount: loanContract.loan_amount,
            applicationId: loanContract.applicationId,
            ...(hasUpfrontInterest && {
              upfrontInterestReversed: loanContract.upfrontInterestAmount,
              interestIncomeAccountUsed: interestIncomeAccount
            }),
            ...(hasGuarantor && {
              guarantorDetails: {
                guarantorId: guarantor._id,
                guaranteedAmount: guarantor.GUARANTEED_AMT,
                previousStatus: guarantor.status,
                newStatus: 'RELEASED'
              }
            })
          },
          session
        });

        // 5. Send notifications
        const notificationPromises = [];
        
        // Notify loan officer
        if (loanAccount?.PRIMARY_OFFICER_ID) {
          notificationPromises.push(
            NotificationService.send({
              recipient: loanAccount.PRIMARY_OFFICER_ID,
              message: `Loan ${contractId} has been rejected`,
              type: 'LOAN_REJECTION',
              metadata: {
                rejectionReason,
                rejectedBy,
                rejectedAt: new Date(),
                ...(hasUpfrontInterest && {
                  interestReversed: loanContract.upfrontInterestAmount
                }),
                ...(hasGuarantor && {
                  guarantorReleased: true
                })
              }
            })
          );
        }

        // Notify guarantor if exists
        if (guarantor?.phoneNumber) {
          notificationPromises.push(
            NotificationService.sendSMS({
              phoneNumber: guarantor.phoneNumber,
              message: `Your guarantee for loan ${contractId} has been released due to loan rejection. Reason: ${rejectionReason}`
            })
          );
        }

        await Promise.all(notificationPromises);

        await session.commitTransaction();

        res.status(200).json({
          success: true,
          message: 'Loan application rejected successfully' + 
                  (hasUpfrontInterest ? ' with upfront interest reversal' : '') +
                  (hasGuarantor ? ' and guarantor released' : ''),
          data: {
            contractId: loanContract.loan_contract_no,
            rejectionDetails: {
              rejectedAt: new Date(),
              rejectedBy,
              rejectionReason
            },
            ...(hasUpfrontInterest && {
              interestReversal: {
                amount: loanContract.upfrontInterestAmount,
                account: interestIncomeAccount,
                reversalDate: new Date()
              }
            }),
            ...(hasGuarantor && {
              guarantorRelease: {
                guarantorId: guarantor._id,
                releasedAt: new Date(),
                releaseReason: `Loan rejection: ${rejectionReason}`
              }
            })
          }
        });

      } catch (error) {
        await session.abortTransaction();
        console.error('Rejection transaction error:', {
          error: error.message,
          stack: error.stack,
          contractId,
          rejectedBy,
          timestamp: new Date()
        });
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error('Loan rejection error:', {
        error: error.message,
        stack: error.stack,
        contractId,
        rejectedBy,
        timestamp: new Date()
      });
      res.status(500).json({
        success: false,
        message: 'Loan rejection failed',
        error: error.message,
        code: 'REJECTION_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
},

  // Helper functions (implement as needed)
  generateJournalId() {
    return 'JRN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  },

  generateUniqueTransactionId() {
    return 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  },

  generateLedgerNo() {
    return 'LEDGER-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  },

  async getLoanAccountByAcctNo(req, res) {
    const { ACCT_NO } = req.params;
  
    if (!ACCT_NO) {
      return res.status(400).json({ message: 'Account number is required' });
    }
  
    try {
      const loanAccount = await LoanAccount.findOne({ ACCT_NO });
      if (!loanAccount) {
        return res.status(404).json({ message: 'Loan account not found' });
      }
  
      res.status(200).json({
        message: 'Loan account retrieved successfully',
        loanAccount,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Error fetching loan account', error: error.message });
    }
  },

  async getLoanAccountsByCustomerId(req, res) {
    const { custId } = req.params;

    if (!custId) {
      return res.status(400).json({ message: 'Customer ID (custId) is required' });
    }

    try {
      const loanAccounts = await LoanAccount.find({ CUST_ID: custId });

      if (!loanAccounts || loanAccounts.length === 0) {
        return res.status(404).json({ message: 'No loan accounts found for this customer' });
      }

      res.status(200).json({
        message: 'Loan accounts retrieved successfully',
        count: loanAccounts.length,
        loanAccounts,
      });
    } catch (error) {
      console.error('Error fetching loan accounts by customer ID:', error);
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  async getLoanInterestDetails(req, res) {
    try {
      const { ACCT_NO } = req.params;
      
      const [account, repayments] = await Promise.all([
        LoanAccountDetails.findOne({ ACCT_NO })
          .select('INTEREST_RATE accruedInterest lastAccrualAmount'),
        RepaymentSchedule.find({ ACCT_NO })
          .select('dueDate interestDue status')
          .sort({ dueDate: 1 })
      ]);
      
      if (!account) {
        return res.status(404).json({ message: 'Loan account not found' });
      }
      
      res.status(200).json({
        success: true,
        data: {
          interestRate: account.INTEREST_RATE,
          accruedInterest: account.accruedInterest,
          lastAccrualAmount: account.lastAccrualAmount,
          repaymentSchedule: repayments.map(p => ({
            dueDate: p.dueDate,
            interestDue: p.interestDue,
            status: p.status
          })),
          totalInterest: repayments.reduce((sum, p) => sum + p.interestDue, 0),
          interestPaid: repayments
            .filter(p => p.status === 'PAID')
            .reduce((sum, p) => sum + p.interestDue, 0)
        }
      });
      
    } catch (error) {
      console.error('Error fetching interest details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interest details',
        error: error.message
      });
    }
  }
};



export default LoanAccountController;