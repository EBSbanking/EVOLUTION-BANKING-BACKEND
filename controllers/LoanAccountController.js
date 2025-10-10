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
import LoanContractController from '../controllers/LoanContractFormController.js';
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
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';
import { getProductTypeOnly } from '../controllers/ProductTypeMappingController.js';
import logger from '../utils/logger.js';
import { generateLoanAccountNumber, generateUniqueCreditApplicationId } from '../utils/loanUtils.js';
import Decimal from 'decimal.js';
import Counter from '../models/Counter.js';
import GLAccount from '../models/GLAccount.js';
import Guarantor from '../models/Guarantor.js';
import Charge from '../models/Charge.js';
import { processLoanDisbursementTransactions, processDisbursement } from '../Services/loanService.js';
import getErrorMessage from '../utils/errorUtils.js';
import LoanDisbursement from '../models/Disbursement.js'; 
import LoanRepayment from '../models/LoanRepayment.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';


const interestService = new InterestCalculationService();
const { getPaymentFrequency } = repaymentUtils;
const feeService = new FeeCalculationService();

function generateId(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

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

const generateContractText = (loanDetails, customerDetails, loanProduct, effectiveInterestRate) => {
  const amount = Number(loanDetails.AMOUNT) || 0;
  const fees = loanProduct.feeStructure || [];
  const processingFee = loanProduct.processingFeeRate
    ? `${(parseFloat(loanProduct.processingFeeRate) * 100).toFixed(2)}%`
    : '0';
  const feeDetails = fees
    .filter(fee => fee.isActive)
    .map(fee => `${fee.name}: ${fee.isPercentage ? `${parseFloat(fee.amount) * 100}%` : parseFloat(fee.amount)}`)
    .join('\n');

  return `LOAN AGREEMENT

This Agreement is made on ${new Date().toLocaleDateString()} between:

BORROWER: ${loanDetails.borrower_name || customerDetails?.ACCT_NM || 'Customer'}
ADDRESS: ${loanDetails.borrower_address || customerDetails?.HOME_ADDRESS || 'Address not provided'}

and

LENDER: ${process.env.BANK_NAME || 'Our Bank'}

LOAN TERMS:
- Principal Amount: ${amount.toLocaleString()}
- Interest Rate: ${effectiveInterestRate.toFixed(2)}%
- Term: ${loanDetails.TERM_VALUE || 0} ${getTermDescription(loanDetails.TERM_CD || 'M')}
- Purpose: ${loanDetails.loan_purpose || 'General Business Purpose'}

REPAYMENT TERMS:
- Payment Frequency: ${convertTermCodeToFrequency(loanDetails.TERM_CD || 'M')}
- Disbursement Date: ${new Date(loanDetails.DISBURSEMENT_DATE || Date.now()).toLocaleDateString()}

FEES:
- Processing Fee: ${processingFee}
${feeDetails ? `- ${feeDetails}` : ''}

SIGNATURES:
___________________________
Borrower

___________________________
Lender Representative`;
};

async function createWorkflowItem(workflowData, session) {
  try {
    console.log('Creating workflow item with data:', {
      ...workflowData,
      ITEM_VALUE: workflowData.ITEM_VALUE?.toString().substring(0, 50) + '...',
      ITEM_ID: workflowData.ITEM_ID?.toString().substring(0, 50) + '...',
      WORKFLOW_ID: workflowData.WORKFLOW_ID?.toString().substring(0, 50) + '...',
      GUARANTOR_ID: workflowData.GUARANTOR_ID?.toString().substring(0, 50) + '...'
    });

    const ids = await generateWorkflowIdentifiers();
    
    const workItem = new WF_WORK_ITEM({
      WORK_ITEM_ID: ids.WORK_ITEM_ID,
      processId: ids.BUS_PROC_ID,
      currentStep: ids.SUB_PROC_ID,
      QUEUE_ID: ids.QUEUE_ID,
      EVENT_ID: String(ids.EVENT_ID),
      JOURNAL_ID: ids.JOURNAL_ID,
      TRANSACTION_ID: ids.TRANSACTION_ID,
      ITEM_REF_NO: generateNumber(4),
      ITEM_VALUE: workflowData.ITEM_VALUE,
      ITEM_DESC: workflowData.ITEM_DESC,
      ITEM_CLASS_NM: workflowData.ITEM_CLASS_NM,
      ITEM_TYPE: workflowData.ITEM_TYPE,
      CUST_ID: workflowData.CUST_ID,
      USER_ID: workflowData.USER_ID,
      BU_ID: workflowData.BU_ID,
      TARGET_USER_ROLE_ID: workflowData.TARGET_USER_ROLE_ID,
      ORIGINATOR_USER_ROLE_ID: workflowData.ORIGINATOR_USER_ROLE_ID,
      ITEM_ID: workflowData.ITEM_ID,
      REC_ST: workflowData.REC_ST.toUpperCase(),
      WAIT_ST: workflowData.WAIT_ST.toUpperCase(),
      VERSION: workflowData.VERSION,
      CREATE_DT: workflowData.CREATE_DT,
      dueDate: workflowData.dueDate,
      WORKFLOW_ID: workflowData.WORKFLOW_ID,
      GUARANTOR_ID: workflowData.GUARANTOR_ID,
      ITEM_BU_ID: workflowData.ITEM_BU_ID,
      CREATED_BY: workflowData.USER_ID,
      SYS_CREATE_TS: new Date(),
      ROW_TS: new Date(),
      priority: 'MEDIUM'
    });

    await workItem.save({ session });
    
    console.log('Workflow item created successfully:', {
      WORK_ITEM_ID: workItem.WORK_ITEM_ID,
      ITEM_ID: workItem.ITEM_ID,
      STATUS: workItem.REC_ST
    });
    
    return {
      success: true,
      workItemId: workItem._id,
      WORK_ITEM_ID: workItem.WORK_ITEM_ID,
      document: workItem.toObject()
    };
  } catch (error) {
    console.error('Direct workflow creation error:', error);
    return {
      success: false,
      message: error.message,
      code: 'WORKFLOW_CREATION_ERROR',
      errorDetails: error
    };
  }
}

const LoanAccountController = {
async applyForLoan(req, res) {
  // Define utility functions
  async function getLoanCycleCount(custId, session) {
    try {
      const loanCount = await LoanAccount.countDocuments({ CUST_ID: custId }).session(session);
      return loanCount + 1;
    } catch (error) {
      console.error('Error in getLoanCycleCount:', error);
      throw {
        code: 'LOAN_CYCLE_COUNT_ERROR',
        message: 'Failed to retrieve loan cycle count',
        status: 500,
      };
    }
  }

  function calculateMaturityDate(startDate, termCode, termValue) {
    termCode = String(termCode).toUpperCase();
    const result = new Date(startDate);
    switch (termCode) {
      case 'D': result.setDate(result.getDate() + termValue); break;
      case 'W': result.setDate(result.getDate() + termValue * 7); break;
      case 'M': result.setMonth(result.getMonth() + termValue); break;
      case 'Q': result.setMonth(result.getMonth() + termValue * 3); break;
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
      case 'M': return 'MONTHLY';
      case 'Q': return 'QUARTERLY';
      case 'Y': return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
      default: return 'MONTHLY';
    }
  }

  async function findGuarantor(guarantorId, session) {
    if (!isNaN(guarantorId)) {
      const byNumber = await Guarantor.findOne({ GUARANTOR_ID: Number(guarantorId) }).session(session);
      if (byNumber) return byNumber;
    }
    if (mongoose.Types.ObjectId.isValid(guarantorId)) {
      const byObjectId = await Guarantor.findById(guarantorId).session(session);
      if (byObjectId) return byObjectId;
    }
    return null;
  }

  // UPDATED findRateIndex function
  async function findRateIndex(rateIndexId, session) {
    try {
      let query = {};
      
      // Try to parse as number first
      const numericId = parseInt(rateIndexId);
      if (!isNaN(numericId)) {
        query = { INDEX_RATE_ID: numericId };
      } else {
        query = { INDEX_RATE_ID: rateIndexId };
      }

      // Look for the specific rate index
      let rateIndex = await RateIndex.findOne(query).session(session);
      
      if (!rateIndex) {
        console.warn(`Rate index ${rateIndexId} not found, looking for default...`);
        
        // Look for default rate index
        rateIndex = await RateIndex.findOne({ IS_DEFAULT: true }).session(session);
        
        if (!rateIndex) {
          // If no default exists, get the first available rate index
          rateIndex = await RateIndex.findOne({}).session(session);
          
          if (rateIndex) {
            console.warn(`Using first available rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
          } else {
            throw new Error('No rate indexes available in the system');
          }
        } else {
          console.warn(`Using default rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
        }
      }
      
      return rateIndex;
    } catch (error) {
      console.error('Error in findRateIndex:', error);
      throw {
        code: 'RATE_INDEX_ERROR',
        message: `Failed to find rate index: ${error.message}`,
        status: 500,
      };
    }
  }

  // NEW FUNCTIONS ADDED
  function getDefaultRateIndexForProduct(PROD_ID) {
    const productToRateIndexMap = {
      300: 300, // Business Term Loan -> Business Loan Rate
      301: 301, // Individual Loan -> Individual Loan Rate  
      302: 301, // Consumer Loan -> Individual Loan Rate (fallback)
      303: 301, // Mortgage -> Individual Loan Rate (fallback)
      304: 301, // Auto Loan -> Individual Loan Rate (fallback)
      305: 305, // Personal Loan -> Personal Loan Rate
      306: 301, // Education Loan -> Individual Loan Rate (fallback)
      307: 301, // Credit Card -> Individual Loan Rate (fallback)
      308: 300, // Line of Credit -> Business Loan Rate
      309: 300, // SME Loan -> Business Loan Rate
      399: 301  // General Loan -> Individual Loan Rate (fallback)
    };
    
    return productToRateIndexMap[PROD_ID] || 301; // Default to Individual Loan Rate
  }

  async function validateAndResolveRateIndex(PROD_ID, requestedIndexId, session) {
    // If no rate index is specified, use the default for the product
    if (!requestedIndexId) {
      const defaultIndexId = getDefaultRateIndexForProduct(PROD_ID);
      console.log(`No INDEX_RATE_ID specified, using default ${defaultIndexId} for product ${PROD_ID}`);
      return await findRateIndex(defaultIndexId, session);
    }
    
    // If specified rate index exists, use it
    const specifiedIndex = await findRateIndex(requestedIndexId, session);
    if (specifiedIndex) {
      return specifiedIndex;
    }
    
    // If specified doesn't exist, use product default
    const defaultIndexId = getDefaultRateIndexForProduct(PROD_ID);
    console.warn(`Requested rate index ${requestedIndexId} not found, using default ${defaultIndexId} for product ${PROD_ID}`);
    return await findRateIndex(defaultIndexId, session);
  }

  // Normalize Borrower_address field names
  const normalizeBorrowerAddress = (address) => {
    if (!address || typeof address !== 'object') return null;
    return {
      street: address.street || address.Street,
      city: address.city || address.City,
      state: address.state || address.State,
      zipCode: address.zipCode || address.ZIPCode || address.zipcode,
      country: address.country || address.Country
    };
  };

  // Validate request body
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      success: false,
      message: 'Invalid request body',
      code: 'INVALID_BODY',
    });
  }

  // Normalize Borrower_address
  req.body.Borrower_address = normalizeBorrowerAddress(req.body.Borrower_address);

  const requiredFields = [
    'PROD_ID', 'CUST_ID', 'ACCT_NM', 'APPL_ID', 'PRODUCT_TYPE', 'CRNCY_ID', 'BU_ID',
    'PRIMARY_OFFICER_ID', 'DISBURSEMENT_LIMIT', 'START_DT', 'TERM_CD', 'TERM_VALUE',
    'CREATED_BY', 'REPAY_SRC_ACCT_NO', 'TRANSACTION_TYPE', 'INDEX_RATE_ID',
    'GUARANTOR_ID', 'GUARANTEED_AMT', 'USER_ID',
    'Borrower_address.street', 'Borrower_address.city', 'Borrower_address.state',
    'Borrower_address.zipCode', 'Borrower_address.country',
  ];

  const missingFields = requiredFields.filter((field) => {
    if (field.startsWith('Borrower_address.')) {
      const subField = field.split('.')[1];
      return !req.body.Borrower_address || req.body.Borrower_address[subField] === undefined;
    }
    return !req.body.hasOwnProperty(field) || req.body[field] === undefined || req.body[field] === null;
  });

  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing or undefined required fields',
      missingFields,
      code: 'MISSING_FIELDS',
    });
  }

  if (!req.body.GUARANTOR_ID) {
    return res.status(400).json({
      success: false,
      message: 'GUARANTOR_ID is required',
      code: 'INVALID_GUARANTOR_ID',
    });
  }

  // Validate numeric fields
  const numericFields = {
    PROD_ID: req.body.PROD_ID,
    TERM_VALUE: req.body.TERM_VALUE,
    DISBURSEMENT_LIMIT: req.body.DISBURSEMENT_LIMIT,
    GUARANTEED_AMT: req.body.GUARANTEED_AMT,
  };

  const invalidNumericFields = Object.entries(numericFields).filter(([field, value]) => {
    return isNaN(parseFloat(value)) || parseFloat(value) <= 0;
  });

  if (invalidNumericFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid numeric fields',
      invalidFields: invalidNumericFields.map(([field]) => field),
      code: 'INVALID_NUMERIC_FIELDS',
    });
  }

  // Validate UPFRONT_INTEREST
  let upfrontInterest = req.body.UPFRONT_INTEREST;
  if (upfrontInterest === '' || upfrontInterest === undefined || upfrontInterest === null) {
    upfrontInterest = 0;
  } else if (isNaN(parseFloat(upfrontInterest)) || parseFloat(upfrontInterest) < 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid UPFRONT_INTEREST value. Must be a non-negative number.',
      code: 'INVALID_UPFRONT_INTEREST',
    });
  }

  // Validate PARTIAL_INTEREST
  let partialInterest = req.body.PARTIAL_INTEREST;
  if (partialInterest === '' || partialInterest === undefined || partialInterest === null) {
    partialInterest = false;
  } else if (typeof partialInterest !== 'boolean') {
    return res.status(400).json({
      success: false,
      message: 'Invalid PARTIAL_INTEREST value. Must be a boolean.',
      code: 'INVALID_PARTIAL_INTEREST',
    });
  }

  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    session.startTransaction();

    // ID generation and validation
    const { TRANSACTION_ID, EVENT_ID, TRAN_JOURNAL_ID } = generateTransactionIds();
    const numericValues = {
      INDEX_RATE_ID: req.body.INDEX_RATE_ID,
      PROD_ID: parseInt(req.body.PROD_ID),
      TERM_VALUE: parseInt(req.body.TERM_VALUE),
      CUST_ID: req.body.CUST_ID,
      GUARANTEED_AMT: mongoose.Types.Decimal128.fromString(req.body.GUARANTEED_AMT.toString()),
      DISBURSEMENT_LIMIT: mongoose.Types.Decimal128.fromString(req.body.DISBURSEMENT_LIMIT.toString()),
    };

    // Validate PROD_ID and PRODUCT_TYPE
    const validProdIds = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 399];
    if (!validProdIds.includes(numericValues.PROD_ID)) {
      throw {
        code: 'INVALID_PROD_ID',
        message: `Invalid PROD_ID: ${numericValues.PROD_ID}. Must be one of ${validProdIds.join(', ')}`,
        status: 400,
      };
    }

    const validProductTypes = [
      'BUSINESS TERM LOAN', 'INDIVIDUAL LOAN', 'CONSUMER LOAN', 'MORTGAGE', 'AUTO LOAN',
      'PERSONAL LOAN', 'EDUCATION LOAN', 'CREDIT CARD', 'LINE OF CREDIT', 'SME LOAN', 'GENERAL LOAN',
    ];
    if (!validProductTypes.includes(req.body.PRODUCT_TYPE)) {
      throw {
        code: 'INVALID_PRODUCT_TYPE',
        message: `Invalid PRODUCT_TYPE: ${req.body.PRODUCT_TYPE}. Must be one of ${validProductTypes.join(', ')}`,
        status: 400,
      };
    }

    // Enhanced account generation with fallback
    let loanAccountNumber;
    const maxRetries = 3;
    let retries = 0;
    let isProvidedAccountNumber = !!req.body.ACCT_NO;

    if (isProvidedAccountNumber) {
      loanAccountNumber = req.body.ACCT_NO;
      if (!/^[0-9]{10}$/.test(loanAccountNumber)) {
        throw {
          code: 'INVALID_ACCOUNT_NUMBER',
          message: 'Provided ACCT_NO must be a 10-digit number',
          status: 400,
        };
      }
      console.log(`Using provided loanAccountNumber: ${loanAccountNumber}`);
    }

    // Fallback generator if the main function fails
    const fallbackGenerateLoanAccountNumberByProdId = async (prodId) => {
      const prefix = prodId.toString().padStart(3, '0'); // e.g., '301' for PROD_ID 301
      let candidate;
      let unique = false;
      let innerRetries = 0;
      const innerMaxRetries = 10;

      while (!unique && innerRetries < innerMaxRetries) {
        const randomSuffix = Math.floor(1000000 + Math.random() * 9000000).toString().padStart(7, '0'); // 7 random digits
        candidate = `${prefix}${randomSuffix}`; // 10 digits total

        const existing = await LoanAccount.findOne({ ACCT_NO: candidate }).session(session);
        if (!existing) {
          unique = true;
        } else {
          innerRetries++;
        }
      }

      if (!unique) {
        throw new Error(`Fallback generation failed after ${innerMaxRetries} attempts for PROD_ID ${prodId}`);
      }

      return candidate;
    };

    // Ensure unique account number
    while (!loanAccountNumber || retries < maxRetries) {
      if (!isProvidedAccountNumber) {
        try {
          loanAccountNumber = await generateLoanAccountNumberByProdId(numericValues.PROD_ID);
          console.log(`Generated loanAccountNumber (attempt ${retries + 1}): ${loanAccountNumber}`);
        } catch (genError) {
          console.error('Failed to generate loan account number with main function:', genError.message, { prodId: numericValues.PROD_ID });
          try {
            // FALLBACK: Use fallback generator
            loanAccountNumber = await fallbackGenerateLoanAccountNumberByProdId(numericValues.PROD_ID);
            console.log(`Fallback generated loanAccountNumber (attempt ${retries + 1}): ${loanAccountNumber}`);
          } catch (fallbackError) {
            console.error('Fallback generation also failed:', fallbackError.message);
            throw {
              code: 'ACCOUNT_GENERATION_ERROR',
              message: `Could not generate valid account number based on product ID ${numericValues.PROD_ID} (main: ${genError.message}; fallback: ${fallbackError.message})`,
              status: 400,
            };
          }
        }
      }

      if (!loanAccountNumber || !/^[0-9]{10}$/.test(loanAccountNumber)) {
        throw {
          code: 'ACCOUNT_NUMBER_ERROR',
          message: 'Invalid or missing loan account number',
          status: 400,
        };
      }

      const existingLoanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber }).session(session);
      if (!existingLoanAccount) {
        console.log(`Account number ${loanAccountNumber} is unique`);
        break;
      }

      console.warn(`Account number ${loanAccountNumber} already exists, retrying...`);
      if (isProvidedAccountNumber) {
        throw {
          code: 'LOAN_ACCOUNT_EXISTS',
          message: `Provided loan account number ${loanAccountNumber} already exists`,
          status: 409,
        };
      }

      retries++;
      if (retries >= maxRetries) {
        throw {
          code: 'ACCOUNT_GENERATION_FAILED',
          message: `Failed to generate a unique loan account number after ${maxRetries} attempts`,
          status: 500,
        };
      }
      loanAccountNumber = null; // Reset to trigger regeneration
    }

    // Check existing CreditApplication
    const existingCreditApplication = await CreditApplication.findOne({ APPL_ID: req.body.APPL_ID }).session(session);
    if (existingCreditApplication && existingCreditApplication.ACCT_NO !== loanAccountNumber) {
      throw {
        code: 'CREDIT_APP_ACCT_NO_CONFLICT',
        message: `A CreditApplication with APPL_ID ${req.body.APPL_ID} already exists with a different ACCT_NO (${existingCreditApplication.ACCT_NO})`,
        status: 409,
      };
    }

    // Get loan cycle count
    const loanCycleCount = await getLoanCycleCount(numericValues.CUST_ID, session);

    // UPDATED: Fetch required entities using the new validateAndResolveRateIndex function
    const [rateIndex, loanProduct, customer, guarantor, interestRate, productTypeMapping] = await Promise.all([
      validateAndResolveRateIndex(numericValues.PROD_ID, req.body.INDEX_RATE_ID, session), // CHANGED HERE
      LoanProduct.findOne({ PROD_ID: numericValues.PROD_ID }).session(session),
      Customer.findOne({ CUST_ID: req.body.CUST_ID }).session(session),
      findGuarantor(req.body.GUARANTOR_ID, session),
      LoanInterestRate.findOne({ PROD_ID: numericValues.PROD_ID }).session(session),
      ProductTypeMapping.findOne({ PROD_ID: numericValues.PROD_ID }).session(session),
    ]);

    // REMOVED: The old rate index validation block is no longer needed here
    // since validateAndResolveRateIndex already handles all cases

    if (!loanProduct) {
      throw {
        code: 'PRODUCT_NOT_FOUND',
        message: `Loan product not found for PROD_ID ${numericValues.PROD_ID}. Please ensure the product is configured in the database.`,
        status: 404,
      };
    }
    if (!customer) {
      throw {
        code: 'CUSTOMER_NOT_FOUND',
        message: `Customer not found for CUST_ID ${req.body.CUST_ID}`,
        status: 404,
      };
    }
    if (!guarantor) {
      throw {
        code: 'GUARANTOR_NOT_FOUND',
        message: `Guarantor with ID ${req.body.GUARANTOR_ID} not found`,
        status: 404,
      };
    }
    if (!guarantor.isActive) {
      throw {
        code: 'INACTIVE_GUARANTOR',
        message: 'Referenced guarantor is not active',
        status: 400,
      };
    }
    if (!interestRate) {
      throw {
        code: 'INTEREST_RATE_NOT_FOUND',
        message: `Interest rate configuration for PROD_ID ${numericValues.PROD_ID} not found`,
        status: 404,
      };
    }
    if (!productTypeMapping) {
      throw {
        code: 'PRODUCT_TYPE_MAPPING_NOT_FOUND',
        message: `Product type mapping not found for PROD_ID ${numericValues.PROD_ID}`,
        status: 404,
      };
    }

    // Validate TERM_CD and PAYMENT_FREQUENCY
    const validTermCodes = ['D', 'W', 'M', 'Q', 'Y'];
    if (!validTermCodes.includes(req.body.TERM_CD)) {
      throw {
        code: 'INVALID_TERM_CD',
        message: `Invalid TERM_CD: ${req.body.TERM_CD}. Must be one of ${validTermCodes.join(', ')}`,
        status: 400,
      };
    }

    const paymentFrequency = getPaymentFrequency(req.body.TERM_CD, numericValues.TERM_VALUE);

    // Fallback for missing TERM_CD or PAYMENT_FREQUENCY
    if (!loanProduct.TERM_CD || !loanProduct.PAYMENT_FREQUENCY) {
      console.warn(`LoanProduct missing TERM_CD or PAYMENT_FREQUENCY for PROD_ID ${numericValues.PROD_ID}. Using request values as fallback.`);
      loanProduct.TERM_CD = req.body.TERM_CD; // Use request TERM_CD
      loanProduct.PAYMENT_FREQUENCY = paymentFrequency; // Use calculated PAYMENT_FREQUENCY
    }

    // Validate TERM_CD and PAYMENT_FREQUENCY match
    if (loanProduct.TERM_CD !== req.body.TERM_CD || loanProduct.PAYMENT_FREQUENCY !== paymentFrequency) {
      throw {
        code: 'TERM_OR_FREQUENCY_MISMATCH',
        message: `TERM_CD ${req.body.TERM_CD} or PAYMENT_FREQUENCY ${paymentFrequency} does not match LoanProduct TERM_CD ${loanProduct.TERM_CD} or PAYMENT_FREQUENCY ${loanProduct.PAYMENT_FREQUENCY}`,
        status: 400,
      };
    }

    // Define required GL account fields
    const requiredGLFields = [
      'SETTLEMENT_GL_ACCT_NO', 'GL_ACCT_CAT', 'ACCT_DESC', 'CHART_OF_ACCT_ID', 'SEG_NO',
      'BU_ID', 'SUB_LEDGER_NO', 'BAL_CD', 'subfolderId', 'PARENT_ID', 'LEDGER_NO',
      'CREATED_BY', 'GL_ACCT_ID', 'GL_ACCT_NO'
    ];

    // Validate GL accounts
    const glFields = [
      'loanGLAccount', 'interestGLAccountNo', 'interestPayableGLAccountNo', 'withholdingTaxGLAccountNo',
      'suspenseGLAccountNo', 'principalGLAccountNo', 'chargeOffGLAccountNo', 'loanChargeReceivableGLAccountNo',
      'contingentGLAccountNo', 'delinquentGLAccountNo', 'interestIncomeGLAccountNo', 'interestReceivableGLAccountNo',
      'interestSuspenseGLAccountNo', 'lateFeeSuspenseGLAccountNo', 'maturityGLAccountNo', 'nonAccrualGLAccountNo',
      'nonAccrualInterestOffsetGLAccountNo', 'nonAccrualInterestReceivableGLAccountNo', 'provisionReserveGLAccountNo',
      'provisionExpenseGLAccountNo', 'recoveriesGLAccountNo', 'repaymentControlGLAccountNo', 'loanSuspenseGLAccountNo',
      'unappliedFundsGLAccountNo', 'unclearedBalanceGLAccountNo', 'unearnedInterestGLAccountNo',
      'interestCreditGLAccountNo', 'interestDebitGLAccountNo',
      'SETTLEMENT_GL_ACCT_NO'
    ];

    // Validate that all GL accounts exist and have required fields
    for (const field of glFields) {
      if (productTypeMapping.glAccounts[field]) {
        const glAccount = await GLAccount.findOne({ GL_ACCT_NO: productTypeMapping.glAccounts[field] }).session(session);
        if (!glAccount) {
          throw {
            code: 'INVALID_GL_ACCOUNT',
            message: `GL account ${productTypeMapping.glAccounts[field]} not found for ${field}`,
            status: 400,
          };
        }

        // Check for required GL account fields
        const missingGLFields = requiredGLFields.filter(glField => !glAccount[glField]);
        if (missingGLFields.length > 0) {
          throw {
            code: 'MISSING_GL_ACCOUNT_FIELDS',
            message: `GL account ${productTypeMapping.glAccounts[field]} is missing required fields: ${missingGLFields.join(', ')}`,
            status: 400,
          };
        }
      }
    }

    // Ensure SETTLEMENT_GL_ACCT_NO is present in productTypeMapping.glAccounts
    if (!productTypeMapping.glAccounts.SETTLEMENT_GL_ACCT_NO) {
      const defaultGLAccount = await GLAccount.findOne({ GL_ACCT_CAT: 'SETTLEMENT' }).session(session);
      if (!defaultGLAccount) {
        throw {
          code: 'MISSING_SETTLEMENT_GL_ACCT_NO',
          message: 'SETTLEMENT_GL_ACCT_NO not provided in productTypeMapping and no default account found',
          status: 400,
        };
      }
      productTypeMapping.glAccounts.SETTLEMENT_GL_ACCT_NO = defaultGLAccount.GL_ACCT_NO;
    }

    // Validate processing fee rate
    if (loanProduct.processingFeeRate && parseFloat(loanProduct.processingFeeRate) > 0.1) {
      throw {
        code: 'INVALID_PROCESSING_FEE_RATE',
        message: `Processing fee rate (${loanProduct.processingFeeRate}) exceeds maximum allowed (10%)`,
        status: 400,
      };
    }

    // Calculate interest rate
    let effectiveInterestRate = mongoose.Types.Decimal128.fromString(rateIndex.INDEX_RATE.toString());
    if (!effectiveInterestRate || parseFloat(effectiveInterestRate) <= 0) {
      effectiveInterestRate = mongoose.Types.Decimal128.fromString(loanProduct.interestRate.toString());
      console.log(`Falling back to LoanProduct.interestRate: ${effectiveInterestRate}%`);
    }
    if (!effectiveInterestRate || parseFloat(effectiveInterestRate) <= 0) {
      throw {
        code: 'INVALID_INTEREST_RATE',
        message: `Invalid interest rate from index (${rateIndex.INDEX_RATE}) or product (${loanProduct.interestRate}). Must be positive.`,
        status: 400,
      };
    }

    // Log warning if request rate differs
    const requestInterestRate = parseFloat(req.body.INTEREST_RATE);
    if (requestInterestRate && Math.abs(requestInterestRate - parseFloat(effectiveInterestRate)) > 0.01) {
      console.warn(
        `Request INTEREST_RATE (${requestInterestRate}%) differs from effective rate (${effectiveInterestRate}%). Using effective rate from RateIndex.`
      );
    }

    // Validate loan amount
    if (
      parseFloat(numericValues.DISBURSEMENT_LIMIT) < parseFloat(loanProduct.minAmount) ||
      parseFloat(numericValues.DISBURSEMENT_LIMIT) > parseFloat(loanProduct.maxAmount)
    ) {
      throw {
        code: 'INVALID_AMOUNT',
        message: `Loan amount must be between ${loanProduct.minAmount} and ${loanProduct.maxAmount}`,
        status: 400,
      };
    }

    // Term validation
    let termMonths;
    switch (req.body.TERM_CD.toUpperCase()) {
      case 'D': termMonths = Math.ceil(numericValues.TERM_VALUE / 30); break;
      case 'W': termMonths = Math.ceil(numericValues.TERM_VALUE / 4); break;
      case 'M': termMonths = numericValues.TERM_VALUE; break;
      case 'Q': termMonths = numericValues.TERM_VALUE * 3; break;
      case 'Y': termMonths = numericValues.TERM_VALUE * 12; break;
      default:
        throw {
          code: 'INVALID_TERM_CODE',
          message: `Invalid term code: ${req.body.TERM_CD}`,
          status: 400,
        };
    }

    if (termMonths < 1) {
      throw {
        code: 'INVALID_TERM',
        message: 'Loan term must be equivalent to at least 1 month',
        status: 400,
      };
    }

    if (termMonths < interestRate.MIN_LOAN_TERM_MONTHS) {
      throw {
        code: 'INVALID_INTEREST_TERM',
        message: `Loan term must be at least ${interestRate.MIN_LOAN_TERM_MONTHS} months per interest rate configuration`,
        status: 400,
      };
    }

    const startDate = new Date(req.body.START_DT);
    const maturityDate = calculateMaturityDate(startDate, req.body.TERM_CD, numericValues.TERM_VALUE);

    // Calculate fees
    const feeDetails = await feeService.calculateInitialFees({
      loanAmount: parseFloat(numericValues.DISBURSEMENT_LIMIT),
      productId: numericValues.PROD_ID,
      term: numericValues.TERM_VALUE,
      termCode: req.body.TERM_CD,
      hasGuarantor: true,
      guaranteedAmount: parseFloat(numericValues.GUARANTEED_AMT),
      feeStructure: loanProduct.feeStructure,
      processingFeeRate: loanProduct.processingFeeRate,
    });

    // Calculate EMI
    const emiResult = await interestService.calculateEMI({
      principal: parseFloat(numericValues.DISBURSEMENT_LIMIT),
      annualRate: parseFloat(effectiveInterestRate),
      termMonths,
      startDate,
      rateType: interestRate.RATE_TY || loanProduct.rateInformation?.rateType,
      PROD_ID: numericValues.PROD_ID,
      INDEX_RATE_ID: rateIndex.INDEX_RATE_ID,
      precision: 2,
    });

    if (!emiResult.installments?.length) {
      throw {
        code: 'INVALID_REPAYMENT_SCHEDULE',
        message: 'Failed to generate repayment schedule',
        status: 500,
      };
    }

    // Process charges
    const chargeRecords = [];
    if (loanProduct.chargesSetup && Array.isArray(loanProduct.chargesSetup)) {
      for (const charge of loanProduct.chargesSetup) {
        const glAccount = await GLAccount.findOne({ GL_ACCT_NO: charge.glAccountCode }).session(session);
        if (!glAccount) {
          throw {
            code: 'INVALID_GL_ACCOUNT',
            message: `GL account ${charge.glAccountCode} not found for charge ${charge.name}`,
            status: 400,
          };
        }

        // Validate required GL account fields for charges
        const missingGLFields = requiredGLFields.filter(glField => !glAccount[glField]);
        if (missingGLFields.length > 0) {
          throw {
            code: 'MISSING_GL_ACCOUNT_FIELDS',
            message: `GL account ${charge.glAccountCode} for charge ${charge.name} is missing required fields: ${missingGLFields.join(', ')}`,
            status: 400,
          };
        }

        const timestamp = Date.now().toString().slice(-6);
        const chargeCodePrefix = charge.name ? charge.name.substring(0, 3).toUpperCase() : 'CHG';
        const uniqueId = generateNumericId().toString().slice(-3);
        const chargeCode = `${chargeCodePrefix}${timestamp}${uniqueId}`.substring(0, 10);

        const chargeData = {
          CHRG_ID: generateNumericId(),
          CHRG_CD: chargeCode,
          CHRG_TY: charge.chargeType,
          CHRG_AMT: mongoose.Types.Decimal128.fromString(charge.amount.toString()),
          INCOME_GL_ACCT_NO: charge.glAccountCode,
          CHRG_NM: charge.name,
          REC_ST: 'A',
          TIER_TY: 'STANDARD',
          BAL_ACTION_CD: 'DEBIT',
          VERSION_NO: 1,
          USER_ID: req.body.USER_ID,
          CREATED_BY: req.body.CREATED_BY,
          EFFECTIVE_DT: new Date(),
          CREATE_DT: new Date(),
          SYS_CREATE_TS: new Date(),
          ROW_TS: new Date(),
        };

        const savedCharge = await Charge.findOneAndUpdate(
          { CHRG_ID: chargeData.CHRG_ID },
          chargeData,
          { upsert: true, new: true, runValidators: true, session }
        );

        chargeRecords.push({
          chargeId: savedCharge.CHRG_ID,
          chargeCode: savedCharge.CHRG_CD,
          amount: parseFloat(chargeData.CHRG_AMT),
          name: chargeData.CHRG_NM,
          glAccountCode: chargeData.INCOME_GL_ACCT_NO,
        });
      }
    }

    // Create LoanAccount with required GL fields
    const loanAccount = new LoanAccount({
      loanAccountId: parseInt(loanAccountNumber.replace(/\D/g, '')) || Date.now(),
      JOURNAL_ID: TRAN_JOURNAL_ID,
      CUST_ID: req.body.CUST_ID,
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
      INTEREST_RATE_ID: rateIndex.INDEX_RATE_ID,
      INTEREST_RATE: effectiveInterestRate,
      LOAN_STATUS: 'PENDING',
      PAYMENT_FREQUENCY: paymentFrequency,
      CREATED_BY: req.body.CREATED_BY,
      TRANSACTION_ID,
      EVENT_ID,
      PROD_ID: numericValues.PROD_ID,
      FEE_DETAILS: {
        ...feeDetails,
        processingFee: loanProduct.processingFeeRate
          ? mongoose.Types.Decimal128.fromString(
              (parseFloat(numericValues.DISBURSEMENT_LIMIT) * parseFloat(loanProduct.processingFeeRate)).toString()
            )
          : mongoose.Types.Decimal128.fromString('0'),
        processingFeeGLCode: loanProduct.processingFeeGLCode,
        charges: chargeRecords,
      },
      TOTAL_INTEREST: mongoose.Types.Decimal128.fromString(emiResult.totalInterest.toString()),
      TOTAL_REPAYMENT: mongoose.Types.Decimal128.fromString(emiResult.totalRepayment.toString()),
      REPAYMENT_SOURCE_ACCOUNT: req.body.REPAY_SRC_ACCT_NO,
      GUARANTOR_ID: guarantor._id,
      GUARANTEED_AMOUNT: numericValues.GUARANTEED_AMT,
      HAS_GUARANTOR: true,
      guarantorDetails: {
        name: guarantor.fullName,
        phone: guarantor.phoneNumber,
        relationship: guarantor.relationshipToBorrower,
        guarantorNumberId: guarantor.GUARANTOR_ID.toString(),
        email: guarantor.email || req.body.email,
        address: guarantor.address,
      },
      Borrower_address: {
        street: req.body.Borrower_address.street,
        city: req.body.Borrower_address.city,
        state: req.body.Borrower_address.state,
        zipCode: req.body.Borrower_address.zipCode,
        country: req.body.Borrower_address.country || 'Nigeria',
      },
      upfrontInterestPercentage: mongoose.Types.Decimal128.fromString(parseFloat(upfrontInterest).toString()),
      partialUpfrontInterest: partialInterest,
      applicationDate: new Date(),
      lastUpdated: new Date(),
      loanGLAccount: productTypeMapping.glAccounts.loanGLAccount,
      interestGLAccountNo: productTypeMapping.glAccounts.interestGLAccountNo,
      interestPayableGLAccountNo: productTypeMapping.glAccounts.interestPayableGLAccountNo,
      withholdingTaxGLAccountNo: productTypeMapping.glAccounts.withholdingTaxGLAccountNo,
      suspenseGLAccountNo: productTypeMapping.glAccounts.suspenseGLAccountNo,
      principalGLAccountNo: productTypeMapping.glAccounts.principalGLAccountNo,
      chargeOffGLAccountNo: productTypeMapping.glAccounts.chargeOffGLAccountNo,
      loanChargeReceivableGLAccountNo: productTypeMapping.glAccounts.loanChargeReceivableGLAccountNo,
      contingentGLAccountNo: productTypeMapping.glAccounts.contingentGLAccountNo,
      delinquentGLAccountNo: productTypeMapping.glAccounts.delinquentGLAccountNo,
      interestIncomeGLAccountNo: productTypeMapping.glAccounts.interestIncomeGLAccountNo,
      interestReceivableGLAccountNo: productTypeMapping.glAccounts.interestReceivableGLAccountNo,
      interestSuspenseGLAccountNo: productTypeMapping.glAccounts.interestSuspenseGLAccountNo,
      lateFeeSuspenseGLAccountNo: productTypeMapping.glAccounts.lateFeeSuspenseGLAccountNo,
      maturityGLAccountNo: productTypeMapping.glAccounts.maturityGLAccountNo,
      nonAccrualGLAccountNo: productTypeMapping.glAccounts.nonAccrualGLAccountNo,
      nonAccrualInterestOffsetGLAccountNo: productTypeMapping.glAccounts.nonAccrualInterestOffsetGLAccountNo,
      nonAccrualInterestReceivableGLAccountNo: productTypeMapping.glAccounts.nonAccrualInterestReceivableGLAccountNo,
      provisionReserveGLAccountNo: productTypeMapping.glAccounts.provisionReserveGLAccountNo,
      provisionExpenseGLAccountNo: productTypeMapping.glAccounts.provisionExpenseGLAccountNo,
      recoveriesGLAccountNo: productTypeMapping.glAccounts.recoveriesGLAccountNo,
      repaymentControlGLAccountNo: productTypeMapping.glAccounts.repaymentControlGLAccountNo,
      loanSuspenseGLAccountNo: productTypeMapping.glAccounts.loanSuspenseGLAccountNo,
      unappliedFundsGLAccountNo: productTypeMapping.glAccounts.unappliedFundsGLAccountNo,
      unclearedBalanceGLAccountNo: productTypeMapping.glAccounts.unclearedBalanceGLAccountNo,
      unearnedInterestGLAccountNo: productTypeMapping.glAccounts.unearnedInterestGLAccountNo,
      interestCreditGLAccountNo: productTypeMapping.glAccounts.interestCreditGLAccountNo,
      interestDebitGLAccountNo: productTypeMapping.glAccounts.interestDebitGLAccountNo,
      SETTLEMENT_GL_ACCT_NO: productTypeMapping.glAccounts.SETTLEMENT_GL_ACCT_NO,
    });

    await loanAccount.save({ session });
    console.log('LoanAccount saved with ACCT_NO:', loanAccount.ACCT_NO);

    await Guarantor.findByIdAndUpdate(
      guarantor._id,
      {
        $addToSet: { guaranteedLoans: loanAccount._id },
        $inc: { totalGuaranteedAmount: parseFloat(numericValues.GUARANTEED_AMT) },
        lastUsedDate: new Date(),
        status: 'PENDING_VERIFICATION',
      },
      { session }
    );

    // Create RepaymentSchedule
    const repaymentSchedule = new RepaymentSchedule({
      LOAN_ACCOUNT_ID: loanAccount._id,
      ACCT_NO: loanAccountNumber,
      CUST_ID: req.body.CUST_ID,
      START_DATE: startDate,
      MATURITY_DATE: maturityDate,
      PRINCIPAL_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      INTEREST_RATE: effectiveInterestRate,
      TERM: numericValues.TERM_VALUE,
      TERM_TYPE: req.body.TERM_CD,
      paymentFrequency,
      SCHEDULE: emiResult.installments,
      TRANSACTION_ID,
      EVENT_ID,
      CREATED_BY: req.body.CREATED_BY,
      STATUS: 'PENDING',
    });
    await repaymentSchedule.save({ session });

    // Create CreditApplication
    const creditApplicationData = {
      creditApplicationId: await CreditApplication.generateCreditApplicationId(),
      CUST_NM: req.body.ACCT_NM || customer?.CUST_NM || 'Unknown Borrower',
      CUST_ID: req.body.CUST_ID,
      PRODUCT: req.body.PRODUCT_TYPE,
      ACCT_ID: loanAccountNumber,
      ACCT_NO: loanAccountNumber,
      APPL_ID: req.body.APPL_ID,
      PROD_ID: req.body.PROD_ID,
      BU_ID: req.body.BU_ID,
      CREATED_BY: req.body.CREATED_BY,
      CRNCY_ID: req.body.CRNCY_ID || 'NGN',
      Credit_Type: 'LOAN',
      PRIME_LIMIT_AMT: numericValues.DISBURSEMENT_LIMIT,
      Purpose_of_Credit: req.body.loan_purpose || req.body.PRODUCT_TYPE || 'GENERAL LOAN',
      REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
      TERM_CD: req.body.TERM_CD,
      TERM_VALUE: numericValues.TERM_VALUE,
      USER_ID: req.body.USER_ID,
      TRANSACTION_TYPE: req.body.TRANSACTION_TYPE,
      STATUS: 'PENDING',
      REC_ST: 'active',
      LOAN_CYCLE: loanCycleCount,
      CREATED_AT: new Date(),
      REQUESTED_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      LOAN_ACCOUNT_ID: loanAccount._id,
      TRANSACTION_ID,
      EVENT_ID,
      FEE_DETAILS: {
        ...feeDetails,
        processingFee: loanProduct.processingFeeRate
          ? mongoose.Types.Decimal128.fromString(
              (parseFloat(numericValues.DISBURSEMENT_LIMIT) * parseFloat(loanProduct.processingFeeRate)).toString()
            )
          : mongoose.Types.Decimal128.fromString('0'),
        processingFeeGLCode: loanProduct.processingFeeGLCode,
        charges: chargeRecords,
      },
      GUARANTOR_ID: guarantor._id,
      INDEX_RATE_ID: req.body.INDEX_RATE_ID,
      Borrower_address: {
        street: req.body.Borrower_address.street,
        city: req.body.Borrower_address.city,
        state: req.body.Borrower_address.state,
        zip: req.body.Borrower_address.zipCode,
        country: req.body.Borrower_address.country || 'Nigeria',
      },
    };

    const creditApplication = new CreditApplication(creditApplicationData);
    await creditApplication.save({ session });
    console.log('CreditApplication saved with ACCT_NO:', creditApplication.ACCT_NO);

    // Verify ACCT_NO consistency
    if (creditApplication.ACCT_NO !== loanAccount.ACCT_NO) {
      throw {
        code: 'ACCT_NO_MISMATCH',
        message: 'CreditApplication and LoanAccount ACCT_NO do not match',
        status: 500,
      };
    }

    // Create workflow item
    const workflowResult = await createWorkflowItem(
      {
        ITEM_VALUE: loanAccount._id.toString(),
        ITEM_DESC: `Loan Application for ${loanAccountNumber}`,
        ITEM_CLASS_NM: 'Loan',
        ITEM_TYPE: 'Loan',
        CUST_ID: req.body.CUST_ID,
        USER_ID: req.body.USER_ID || req.user?.id || req.body.CREATED_BY,
        BU_ID: req.body.BU_ID || '0001',
        TARGET_USER_ROLE_ID: 'LOAN_OFFICER',
        ORIGINATOR_USER_ROLE_ID: req.user?.role || req.body.USER_ROLE_ID || 'Creator',
        ITEM_ID: creditApplication._id.toString(),
        REC_ST: 'PENDING',
        WAIT_ST: 'PENDING',
        VERSION: 1,
        CREATE_DT: new Date(),
        dueDate: new Date(Date.now() + 7 * 86400000),
        WORKFLOW_ID: creditApplication._id.toString(),
        GUARANTOR_ID: guarantor._id.toString(),
        ITEM_BU_ID: req.body.BU_ID,
      },
      session
    );

    if (!workflowResult.success) {
      throw new Error(`Workflow creation failed: ${workflowResult.message || 'Unknown error'}`);
    }

    // Create LoanContractForm
    const contractText = generateContractText(
      {
        AMOUNT: parseFloat(numericValues.DISBURSEMENT_LIMIT),
        INTEREST_RATE: parseFloat(effectiveInterestRate),
        TERM_VALUE: numericValues.TERM_VALUE,
        DISBURSEMENT_DATE: startDate,
        borrower_name: req.body.ACCT_NM || customer?.CUST_NM || 'Unknown Borrower',
        borrower_address: `${req.body.Borrower_address.street}, ${req.body.Borrower_address.city}, ${req.body.Borrower_address.state}, ${req.body.Borrower_address.zipCode}, ${req.body.Borrower_address.country || 'Nigeria'}`,
        loan_purpose: req.body.loan_purpose || 'General Business Purpose',
        TERM_CD: req.body.TERM_CD,
      },
      customer,
      loanProduct,
      effectiveInterestRate
    );

    const loanContractNo = `LCN-${generateId(8)}`;
    const processingFeeAmount = loanProduct.processingFeeRate
      ? parseFloat(numericValues.DISBURSEMENT_LIMIT) * parseFloat(loanProduct.processingFeeRate)
      : 0;

    const contractForm = new LoanContractForm({
      applicationId: req.body.APPL_ID,
      loanAccountNo: loanAccountNumber,
      loan_contract_no: loanContractNo,
      customer_id: req.body.CUST_ID,
      USER_ID: req.body.USER_ID || req.body.CREATED_BY,
      bank_name: process.env.BANK_NAME || 'Our Bank',
      bank_short: process.env.BANK_SHORT || 'OB',
      borrower_name: req.body.ACCT_NM || customer?.CUST_NM || 'Unknown Borrower',
      borrower_address: `${req.body.Borrower_address.street}, ${req.body.Borrower_address.city}, ${req.body.Borrower_address.state}, ${req.body.Borrower_address.zipCode}, ${req.body.Borrower_address.country || 'Nigeria'}`,
      loan_purpose: req.body.loan_purpose || 'General Business Purpose',
      loan_amount: numericValues.DISBURSEMENT_LIMIT,
      loan_term: numericValues.TERM_VALUE,
      interest_rate: effectiveInterestRate,
      fundingAccountNo: req.body.FUNDING_ACCT || `FA-${generateNumericId().toString().slice(-6)}`,
      fees: {
        processingFee: mongoose.Types.Decimal128.fromString(processingFeeAmount.toString()),
        latePaymentFee: mongoose.Types.Decimal128.fromString(
          (feeDetails.fees?.find((f) => f.type === 'late')?.amount || 0).toString()
        ),
        earlyRepaymentFee: mongoose.Types.Decimal128.fromString(
          (feeDetails.fees?.find((f) => f.type === 'early')?.amount || 0).toString()
        ),
      },
      LOAN_ACCOUNT_ID: loanAccount._id,
      ACCT_NO: loanAccountNumber,
      CONTRACT_TEXT: contractText,
      STATUS: 'PENDING',
      CREATED_BY: req.body.CREATED_BY,
      CREATED_AT: new Date(),
      TRANSACTION_ID,
      EVENT_ID,
      metadata: {
        productId: numericValues.PROD_ID,
        applicationSource: 'API_APPLICATION',
      },
    });

    await contractForm.save({ session });

    await session.commitTransaction();
    transactionCompleted = true;

    const WORK_ITEM_ID = workflowResult.WORK_ITEM_ID || workflowResult.document?.WORK_ITEM_ID || null;

    return res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully',
      status: 'Pending',
      data: {
        loanAccountId: loanAccount._id,
        loanAccountNumber,
        creditApplicationId: creditApplication._id,
        workItemId: WORK_ITEM_ID,
        workflowStatusUrl: `/api/workflow/${WORK_ITEM_ID}`,
        APPL_ID: req.body.APPL_ID,
        status: 'PENDING',
        guarantor: {
          guarantorId: guarantor._id,
          guarantorNumberId: guarantor.GUARANTOR_ID,
          name: guarantor.fullName,
          guaranteedAmount: parseFloat(numericValues.GUARANTEED_AMT),
          status: 'PENDING_VERIFICATION',
        },
        repaymentSchedule: {
          numberOfInstallments: emiResult.installments.length,
          firstPaymentDate: emiResult.installments[0]?.dueDate,
          lastPaymentDate: emiResult.installments.at(-1)?.dueDate,
          totalInterest: parseFloat(emiResult.totalInterest),
          totalRepayment: parseFloat(emiResult.totalRepayment),
          status: 'PENDING',
        },
        feeDetails: {
          processingFee: parseFloat(loanProduct.processingFeeRate
            ? parseFloat(numericValues.DISBURSEMENT_LIMIT) * parseFloat(loanProduct.processingFeeRate)
            : 0),
          processingFeeGLCode: loanProduct.processingFeeGLCode,
          fees: feeDetails.fees,
          charges: chargeRecords,
        },
        Borrower_address: {
          street: req.body.Borrower_address.street,
          city: req.body.Borrower_address.city,
          state: req.body.Borrower_address.state,
          zipCode: req.body.Borrower_address.zipCode,
          country: req.body.Borrower_address.country || 'Nigeria',
        },
      },
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('Loan application error:', error);
    console.error('Error stack:', error.stack);
    console.error('Validation errors:', error.errors);

    if (error.name === 'ReferenceError' && error.message.includes('ProductTypeMapping')) {
      return res.status(500).json({
        success: false,
        message: 'ProductTypeMapping model is not defined',
        code: 'MODEL_NOT_DEFINED',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: `Invalid ID format for ${error.path}: ${error.value}`,
        code: 'INVALID_ID_FORMAT',
        expectedType: error.kind,
      });
    }

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process loan application',
      code: error.code || 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  } finally {
    await session.endSession();
  }
},

async approveLoanApplication(req, res) {
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

    // Validate workItemId is a number
    const numericWorkItemId = Number(workItemId);
    if (isNaN(numericWorkItemId)) {
      return res.status(400).json({
        success: false,
        message: `Invalid workItemId: ${workItemId}. Expected a number.`,
        code: 'INVALID_WORK_ITEM_ID'
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

    if (parseFloat(guarantor.GUARANTEED_AMT) < parseFloat(loanAccount.GUARANTEED_AMOUNT) && !forceApprove) {
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
    const totalFees = parseFloat(loanAccount.FEE_DETAILS?.totalFees || 0);
    const netDisbursement = parseFloat(loanAccount.DISBURSEMENT_LIMIT) - totalFees;

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
          NET_DISBURSEMENT: mongoose.Types.Decimal128.fromString(netDisbursement.toString()),
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

    // Update Loan Contract Form
    await LoanContractForm.updateOne(
      { loanAccountNo: loanAccount.ACCT_NO, STATUS: 'PENDING' },
      {
        $set: {
          STATUS: 'APPROVED',
          UPDATED_AT: new Date(),
          APPROVED_BY: approvedBy
        }
      },
      { session }
    );

    // Update Repayment Schedule
    const repaymentSchedule = await RepaymentSchedule.findOne({
      LOAN_ACCOUNT_ID: loanAccount._id,
      STATUS: 'PENDING'
    }).session(session);

    if (repaymentSchedule) {
      await RepaymentSchedule.updateOne(
        { _id: repaymentSchedule._id },
        {
          $set: {
            STATUS: 'ACTIVE',
            UPDATED_AT: new Date()
          }
        },
        { session }
      );
    } else {
      // Generate repayment schedule if not found
      const emiResult = await interestService.calculateEMI({
        principal: parseFloat(loanAccount.DISBURSEMENT_LIMIT),
        annualRate: parseFloat(loanAccount.INTEREST_RATE),
        termMonths: Math.ceil(parseInt(loanAccount.TERM_VALUE) / (loanAccount.TERM_CD === 'D' ? 30 : loanAccount.TERM_CD === 'W' ? 4 : 1)),
        startDate: loanAccount.START_DT,
        rateType: 'FIXED', // Adjust based on your LoanProduct configuration
        PROD_ID: loanAccount.PROD_ID,
        INDEX_RATE_ID: loanAccount.INTEREST_RATE_ID,
        precision: 2
      });

      if (emiResult.installments?.length) {
        const newRepaymentSchedule = new RepaymentSchedule({
          LOAN_ACCOUNT_ID: loanAccount._id,
          ACCT_NO: loanAccount.ACCT_NO,
          CUST_ID: loanAccount.CUST_ID,
          START_DATE: loanAccount.START_DT,
          MATURITY_DATE: loanAccount.MATURITY_DT,
          PRINCIPAL_AMOUNT: loanAccount.DISBURSEMENT_LIMIT,
          INTEREST_RATE: loanAccount.INTEREST_RATE,
          TERM: loanAccount.TERM_VALUE,
          TERM_TYPE: loanAccount.TERM_CD,
          paymentFrequency: getPaymentFrequency(loanAccount.TERM_CD, loanAccount.TERM_VALUE),
          SCHEDULE: emiResult.installments,
          TRANSACTION_ID: loanAccount.TRANSACTION_ID,
          EVENT_ID: loanAccount.EVENT_ID,
          CREATED_BY: approvedBy,
          STATUS: 'ACTIVE'
        });
        await newRepaymentSchedule.save({ session });
      }
    }

    // Process disbursement transaction
    const disbursementResult = await processLoanDisbursementTransactions({
      loanAccountId: loanAccount._id,
      loanAccountNumber: loanAccount.ACCT_NO,
      customerId: loanAccount.CUST_ID,
      amount: netDisbursement,
      repaymentAccountNo: repaymentAccount?.ACCT_NO,
      disbursementDate: new Date(),
      feeDetails: loanAccount.FEE_DETAILS,
      guarantorId: guarantor._id,
      transactionId: generateNumericId(),
      eventId: generateNumericId()
    }, session);

    if (!disbursementResult.success) {
      throw new Error(`Disbursement failed: ${disbursementResult.message}`);
    }

    // Update Work Item
    const workItemUpdate = await WF_WORK_ITEMController.updateWorkItemStatusOnApproval(
      'Loan', // Matches ITEM_CLASS_NM from applyForLoan
      CUST_ID,
      approvedBy,
      session
    );

    if (!workItemUpdate.success) {
      throw new Error(workItemUpdate.error || 'Failed to update work item status');
    }

    // Log audit trail
    await logAuditTrail({
      action: 'APPROVE_LOAN',
      userId: approvedBy,
      details: {
        APPL_ID,
        loanAccountNumber: loanAccount.ACCT_NO,
        workItemId: numericWorkItemId,
        comments: approvalComments || 'Approved'
      }
    }, session);

    await session.commitTransaction();
    transactionSuccess = true;

    // Send notification
    await NotificationService.send({
      ROLE_ID: 'LOAN_OFFICER', // Adjust based on your roles
      message: `Loan ${loanAccount.ACCT_NO} approved by ${approvedBy}`,
      WORK_ITEM_ID: workItemUpdate.data?.WORK_ITEM_ID || numericWorkItemId,
      EVENT_ID: loanAccount.EVENT_ID,
      status: 'approved',
      notificationType: 'system'
    });

    return res.status(200).json({
      success: true,
      message: 'Loan approved successfully',
      data: {
        loanAccountNumber: loanAccount.ACCT_NO,
        netDisbursement,
        repaymentAccount: repaymentAccount?.ACCT_NO,
        guarantorId: guarantor.GUARANTOR_ID,
        workItemId: workItemUpdate.data?.WORK_ITEM_ID || numericWorkItemId
      }
    });
  } catch (error) {
    if (!transactionSuccess) await session.abortTransaction();
    console.error('Approval error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Loan approval failed',
      code: error.code || 'APPROVAL_ERROR',
      error: getErrorMessage(error),
      supportReference: generateId(8) // Using existing generateId function
    });
  } finally {
    session.endSession();
  }
},


async rejectLoanApplication(req, res) {
  const session = await mongoose.startSession();
  let transactionSuccess = false;

  try {
    await session.startTransaction();

    const rawCustId = req.body.CUST_ID;
    const CUST_ID = String(rawCustId);
    const numericCUST_ID = parseInt(rawCustId, 10);

    const {
      workItemId,
      rejectedBy,
      APPL_ID,
      rejectionComments,
      reason
    } = req.body;

    const requiredFields = ['workItemId', 'rejectedBy', 'APPL_ID', 'CUST_ID'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_FIELDS',
        details: {
          received: {
            workItemId: !!req.body.workItemId,
            rejectedBy: !!req.body.rejectedBy,
            APPL_ID: !!req.body.APPL_ID,
            CUST_ID: !!req.body.CUST_ID
          }
        }
      });
    }

    if (!rejectedBy || rejectedBy.toString().trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Rejector ID is required',
        code: 'INVALID_REJECTOR_ID',
        details: { rejectedBy }
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
      console.warn(`No guarantor found for loan account ${loanAccount.ACCT_NO} during rejection`);
    }

    const effectiveRejectionComments = reason || rejectionComments || 'Loan application rejected';

    await CreditApplication.updateOne(
      { _id: creditApplication._id },
      {
        $set: {
          STATUS: 'REJECTED',
          UPDATED_AT: new Date(),
          REJECTION_COMMENTS: effectiveRejectionComments
        }
      },
      { session }
    );

    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $set: {
          LOAN_STATUS: 'REJECTED',
          REJECTED_BY: rejectedBy,
          REJECTED_DATE: new Date(),
          REJECTION_COMMENTS: effectiveRejectionComments
        }
      },
      { session }
    );

    await WF_WORK_ITEM.updateOne(
      { WORK_ITEM_ID: workItemId },
      {
        $set: {
          REC_ST: 'REJECTED',
          COMPLETED_BY: rejectedBy,
          COMPLETED_AT: new Date(),
          COMMENTS: effectiveRejectionComments
        }
      },
      { session }
    );

    if (guarantor) {
      await Guarantor.updateOne(
        { _id: guarantor._id },
        {
          $set: {
            status: 'INACTIVE',
            verificationStatus: 'NOT_VERIFIED',
            lastUsed: new Date()
          },
          $pull: { guaranteedLoans: loanAccount._id },
          $inc: { totalGuaranteedAmount: -loanAccount.GUARANTEED_AMOUNT }
        },
        { session }
      );
    }

    await session.commitTransaction();
    transactionSuccess = true;

    return res.status(200).json({
      success: true,
      message: 'Loan application rejected successfully',
      data: {
        loanAccountNumber: loanAccount.ACCT_NO,
        applicationId: APPL_ID,
        workItemId,
        rejectionComments: effectiveRejectionComments,
        rejectedBy: rejectedBy
      }
    });
  } catch (error) {
    if (!transactionSuccess) await session.abortTransaction();
    console.error('Rejection error:', error);
    return res.status(500).json({
      success: false,
      message: 'Loan rejection failed',
      code: 'REJECTION_ERROR',
      error: error.message,
      supportReference: generateNumber(8)
    });
  } finally {
    session.endSession();
  }
},


async disburseLoan(req, res) {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: User not found',
        code: 'UNAUTHORIZED',
      });
    }

    const {
      APPL_ID,
      CUST_ID,
      ACCT_NO,
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
      CREATED_BY = req.user.id,
      APPROVAL_STATUS = 'PENDING',
      SCHEDULE_TYPE = 'STANDARD',
      bank_short = 'N/A',
      bank_name = 'N/A',
      loan_purpose = 'General',
      deductUpfrontInterest = false,
      partialUpfrontInterest = false,
      upfrontInterestPercentage = 0,
      GUARANTOR_ID,
      GUARANTEED_AMT,
      guarantor_name,
      guarantor_relationship,
      guarantor_contact,
      guarantor_id_type,
      guarantor_id_number,
      modifyGuarantor = false,
      guarantorAction,
      guarantorRemovalReason,
      guarantorNotes,
    } = req.body;

    const requiredFields = [
      'APPL_ID',
      'CUST_ID',
      'ACCT_NO',
      'AMOUNT',
      'PROD_ID',
      'GUARANTOR_ID',
      'GUARANTEED_AMT',
      'guarantor_name',
      'guarantor_relationship',
    ];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    if (partialUpfrontInterest) {
      if (deductUpfrontInterest) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Cannot enable both full and partial upfront interest',
          code: 'CONFLICTING_INTEREST_OPTIONS',
        });
      }
      if (isNaN(upfrontInterestPercentage) || upfrontInterestPercentage <= 0 || upfrontInterestPercentage > 100) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Upfront interest percentage must be between 0 and 100',
          code: 'INVALID_UPFRONT_PERCENTAGE',
        });
      }
    }

    if (GUARANTEED_AMT <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Guaranteed amount must be positive',
        code: 'INVALID_GUARANTEED_AMOUNT',
      });
    }
    if (GUARANTEED_AMT > AMOUNT * 2) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Guaranteed amount cannot exceed twice the loan amount',
        code: 'EXCESSIVE_GUARANTEED_AMOUNT',
      });
    }

    const disbursementDate = new Date(DISBURSEMENT_DATE);
    if (isNaN(disbursementDate.getTime())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid disbursement date format',
        code: 'INVALID_DISBURSEMENT_DATE',
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
        code: 'MISSING_MATURITY_INFO',
      });
    }

    if (isNaN(maturityDate.getTime()) || disbursementDate >= maturityDate) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid maturity date or must be after disbursement date',
        code: 'INVALID_MATURITY_DATE',
      });
    }

    if (AMOUNT <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Loan amount must be positive',
        code: 'INVALID_LOAN_AMOUNT',
      });
    }

    const loanProduct = await LoanProduct.findOne({ PROD_ID }).session(session);
    if (!loanProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Loan product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    // Retrieve Loan GL account from LoanProduct
    const loanGLAccount = loanProduct.loanGLAccount;
    if (!loanGLAccount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Loan GL account not configured for product',
        code: 'MISSING_LOAN_GL_ACCOUNT',
      });
    }

    const PRODUCT_TYPE = loanProduct.PRODUCT_TYPE || loanProduct.name || 'UNKNOWN';
    const [customerAccount, creditApplication, existingGuarantor] = await Promise.all([
      Customer.findOne({ CUST_ID }).session(session),
      CreditApplication.findOne({ APPL_ID }).session(session),
      Guarantor.findOne({ GUARANTOR_ID }).session(session),
    ]);

    if (!customerAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Customer account not found',
        code: 'CUSTOMER_NOT_FOUND',
      });
    }
    if (!existingGuarantor) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Guarantor ${GUARANTOR_ID} not found`,
        code: 'GUARANTOR_NOT_FOUND',
      });
    }

    const normalizeString = (str) => String(str || '').trim().toLowerCase();
    if (
      normalizeString(existingGuarantor.fullName) !== normalizeString(guarantor_name) ||
      normalizeString(existingGuarantor.relationshipToBorrower) !== normalizeString(guarantor_relationship)
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Guarantor details do not match. Expected: ${existingGuarantor.fullName} (${existingGuarantor.relationshipToBorrower}), Received: ${guarantor_name} (${guarantor_relationship})`,
        code: 'GUARANTOR_DETAILS_MISMATCH',
      });
    }

    const existingLoanAccount = await LoanAccount.findOne({ ACCT_NO }).session(session);
    if (existingLoanAccount && existingLoanAccount.LOAN_STATUS === 'ACTIVE') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Loan already disbursed or active for account number ${ACCT_NO}`,
        code: 'LOAN_ALREADY_ACTIVE',
      });
    }

    const feeService = new FeeCalculationService();
    const feeDetails = await feeService.calculateInitialFees({
      loanAmount: AMOUNT,
      productId: PROD_ID,
      term: TERM_VALUE,
      termCode: TERM_CD,
      hasGuarantor: true,
      guaranteedAmount: GUARANTEED_AMT,
    });

    const totalCharges = feeDetails.charges ? feeDetails.charges.reduce((sum, charge) => sum + (charge.amount || 0), 0) : 0;
    feeDetails.totalFees = (feeDetails.processingFee || 0) + totalCharges;
    feeDetails.totalFees = mongoose.Types.Decimal128.fromString(feeDetails.totalFees.toFixed(2));
    feeDetails.processingFee = mongoose.Types.Decimal128.fromString((feeDetails.processingFee || 0).toFixed(2));
    feeDetails.charges = feeDetails.charges.map(charge => ({
      ...charge,
      amount: mongoose.Types.Decimal128.fromString(charge.amount.toFixed(2))
    }));

    const termMonths = TERM_CD.toUpperCase() === 'M' ? TERM_VALUE : TERM_VALUE * 12;
    const totalInterest = mongoose.Types.Decimal128.fromString(((AMOUNT * (INTEREST_RATE / 100) * termMonths) / 12).toFixed(2));

    let upfrontInterest = mongoose.Types.Decimal128.fromString('0.00');
    let remainingInterest = totalInterest;
    if (partialUpfrontInterest) {
      const percentage = parseFloat(upfrontInterestPercentage) / 100;
      const upfrontAmount = parseFloat(totalInterest.toString()) * percentage;
      upfrontInterest = mongoose.Types.Decimal128.fromString(upfrontAmount.toFixed(2));
      remainingInterest = mongoose.Types.Decimal128.fromString((parseFloat(totalInterest.toString()) - upfrontAmount).toFixed(2));
      feeDetails.upfrontInterest = upfrontInterest;
      feeDetails.upfrontInterestPercentage = mongoose.Types.Decimal128.fromString(upfrontInterestPercentage.toFixed(2));
    } else if (deductUpfrontInterest) {
      upfrontInterest = totalInterest;
      remainingInterest = mongoose.Types.Decimal128.fromString('0.00');
      feeDetails.upfrontInterest = upfrontInterest;
    }

    const netDisbursement = mongoose.Types.Decimal128.fromString(
      (GUARANTEED_AMT - parseFloat(feeDetails.totalFees.toString()) - parseFloat(upfrontInterest.toString())).toFixed(2)
    );

    if (parseFloat(netDisbursement.toString()) <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Net disbursement amount must be positive after deducting fees and upfront interest',
        code: 'INVALID_NET_DISBURSEMENT',
      });
    }

    const upperTermCd = TERM_CD.toUpperCase();
    const emiResult = await calculateEMI({
      principal: AMOUNT,
      annualRate: INTEREST_RATE,
      termMonths: upperTermCd === 'M' ? TERM_VALUE : TERM_VALUE * 12,
      startDate: disbursementDate,
      remainingInterest: parseFloat(remainingInterest.toString()),
      partialUpfrontInterest,
      upfrontInterestPercentage,
    });

    if (!emiResult?.installments) {
      await session.abortTransaction();
      return res.status(500).json({
        success: false,
        message: 'Failed to generate repayment schedule',
        code: 'SCHEDULE_GENERATION_FAILED',
      });
    }

    const TRANSACTION_IDS = generateTransactionIds();
    const workflowId = Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
    const resolvedApprovalStatus = ['APPROVED', 'PENDING'].includes(APPROVAL_STATUS.toUpperCase())
      ? APPROVAL_STATUS.toUpperCase()
      : 'PENDING';

    // Create LoanDisbursement record
    const loanDisbursement = new LoanDisbursement({
      APPL_ID,
      CUST_ID,
      ACCT_NO,
      DISBURSEMENT_DATE: disbursementDate,
      AMOUNT,
      TERM_CD: upperTermCd,
      TERM_VALUE,
      INTEREST_RATE,
      REPAYMENT_SCHEDULE: emiResult.installments.map((installment, index) => ({
        installmentNo: index + 1,
        dueDate: installment.dueDate
      })),
      STATUS: resolvedApprovalStatus
    });

    let guarantorModificationResult = null;
    if (modifyGuarantor && guarantorAction) {
      if (guarantorAction === 'UNCHECK') {
        guarantorModificationResult = await uncheckGuarantor(
          GUARANTOR_ID,
          ACCT_NO,
          guarantorRemovalReason,
          guarantorNotes,
          req.user.id,
          session
        );
      } else if (guarantorAction === 'REACTIVATE') {
        guarantorModificationResult = await reactivateGuarantor(
          GUARANTOR_ID,
          ACCT_NO,
          guarantorNotes,
          req.user.id,
          session
        );
      } else {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Invalid guarantor action. Must be UNCHECK or REACTIVATE',
          code: 'INVALID_GUARANTOR_ACTION',
        });
      }
    }

    if (!modifyGuarantor || guarantorAction !== 'UNCHECK') {
      await Guarantor.updateOne(
        { _id: existingGuarantor._id },
        {
          $addToSet: { guaranteedLoans: existingLoanAccount?._id || null },
          $inc: { totalGuaranteedAmount: GUARANTEED_AMT },
          $set: {
            status: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'APPROVED',
            lastUpdated: new Date(),
            updatedBy: req.user.id,
          },
        },
        { session }
      );

      await new GuarantorAudit({
        action: 'UPDATE',
        guarantorId: existingGuarantor.GUARANTOR_ID,
        loanId: existingLoanAccount?._id || null,
        performedBy: req.user.id,
        relationshipOfficer: { id: existingGuarantor.BU_ID, name: existingGuarantor.relationshipOfficerName },
        details: {
          notes: `Guarantor linked to loan ${ACCT_NO} during disbursement`,
          updatedFields: {
            guaranteedLoans: existingLoanAccount?._id?.toString(),
            totalGuaranteedAmount: GUARANTEED_AMT,
            status: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'APPROVED',
          },
        },
      }).save({ session });
    }

    const loanAccountPayload = {
      loanAccountId: parseInt(ACCT_NO.replace(/\D/g, '') || Date.now()),
      JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      CUST_ID,
      ACCT_NM: customerAccount.ACCT_NM,
      ACCT_NO,
      APPL_ID,
      CRNCY_ID: 'NGN',
      BU_ID: customerAccount.BU_ID || 'DEFAULT_BU',
      PRIMARY_OFFICER_ID: customerAccount.PRIMARY_OFFICER_ID || null,
      SECONDARY_OFFICER_ID: customerAccount.SECONDARY_OFFICER_ID || null,
      DISBURSEMENT_LIMIT: mongoose.Types.Decimal128.fromString(AMOUNT.toFixed(2)),
      ACTUAL_DISBURSEMENT: netDisbursement,
      START_DT: disbursementDate,
      TERM_CD,
      TERM_VALUE,
      MATURITY_DT: maturityDate,
      PROD_ID,
      PRODUCT_TYPE,
      INTEREST_RATE_ID: loanProduct.interestRateId,
      INTEREST_RATE: mongoose.Types.Decimal128.fromString(INTEREST_RATE.toFixed(2)),
      LOAN_STATUS: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'PENDING',
      PAYMENT_FREQUENCY: loanProduct.paymentFrequency || 'MONTHLY',
      CREATED_BY,
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      FEE_DETAILS: feeDetails,
      TOTAL_INTEREST: totalInterest,
      TOTAL_REPAYMENT: mongoose.Types.Decimal128.fromString((AMOUNT + parseFloat(totalInterest.toString())).toFixed(2)),
      REPAYMENT_SOURCE_ACCOUNT: loanGLAccount, // Use Loan GL account instead of fundingAcctNo
      REPAYMENT_SCHEDULE_TYPE: SCHEDULE_TYPE,
      NEXT_PAYMENT_DATE: emiResult.installments?.[0]?.dueDate,
      workflowId,
      workItemId: 129,
      deductUpfrontInterest,
      partialUpfrontInterest,
      upfrontInterestPercentage: mongoose.Types.Decimal128.fromString(upfrontInterestPercentage.toFixed(2)),
      upfrontInterestAmount: upfrontInterest,
      remainingInterestAmount: remainingInterest,
      GUARANTOR_ID: existingGuarantor._id,
      GUARANTEED_AMOUNT: mongoose.Types.Decimal128.fromString(GUARANTEED_AMT.toFixed(2)),
      HAS_GUARANTOR: !modifyGuarantor || guarantorAction !== 'UNCHECK',
      guarantorDetails: {
        guarantorId: existingGuarantor._id,
        name: guarantor_name,
        phone: guarantor_contact,
        relationship: guarantor_relationship,
        guarantorNumberId: guarantor_id_number || existingGuarantor.GUARANTOR_ID,
        email: existingGuarantor.email,
        address: existingGuarantor.address,
        status: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'APPROVED',
        guaranteedAmount: mongoose.Types.Decimal128.fromString(GUARANTEED_AMT.toFixed(2))
      },
      Borrower_address: {
        Street: borrower_address?.Street || customerAccount.ADDRESS_LINE1 || 'Unknown Street',
        State: borrower_address?.State || 'Unknown State',
        City: borrower_address?.City || 'Unknown City',
        ZIPCode: borrower_address?.ZIPCode || '000000',
        Country: borrower_address?.Country || 'Nigeria'
      }
    };

    const loanAccount = await LoanAccount.findOneAndUpdate(
      { ACCT_NO },
      { $set: loanAccountPayload },
      { new: true, upsert: true, session }
    );

    if (creditApplication) {
      await CreditApplication.updateOne(
        { _id: creditApplication._id },
        { $set: { LOAN_ACCOUNT_ID: loanAccount._id } },
        { session }
      );
    }

    const loanContract = new LoanContractForm({
      loan_contract_no: `LC-${ACCT_NO}-${Date.now()}`,
      customer_id: CUST_ID,
      applicationId: APPL_ID,
      borrower_name: borrower_name || customerAccount.ACCT_NM || 'Unknown Borrower',
      borrower_address: {
        Street: borrower_address?.Street || customerAccount.ADDRESS_LINE1 || 'Unknown Street',
        State: borrower_address?.State || 'Unknown State',
        City: borrower_address?.City || 'Unknown City',
        ZIPCode: borrower_address?.ZIPCode || '000000',
        Country: borrower_address?.Country || 'Nigeria'
      },
      loan_amount: AMOUNT,
      loan_term: TERM_VALUE,
      TERM_CD: upperTermCd,
      interest_rate: INTEREST_RATE,
      index_rate_id: INDEX_RATE_ID,
      status: resolvedApprovalStatus,
      USER_ID: CREATED_BY,
      loanAccountNo: ACCT_NO,
      fundingAccountNo: loanGLAccount, // Use Loan GL account
      productDetails: {
        productId: loanProduct._id,
        productCode: loanProduct.productCode,
        productName: loanProduct.name,
      },
      fees: {
        ...feeDetails,
        processingFee: feeDetails.processingFee,
        upfrontInterest,
        upfrontInterestPercentage: partialUpfrontInterest ? upfrontInterestPercentage : null
      },
      repaymentSchedule: emiResult.installments,
      emiAmount: emiResult.emi,
      totalInterest: parseFloat(totalInterest.toString()),
      totalRepayment: AMOUNT + parseFloat(totalInterest.toString()),
      disbursementDate,
      maturityDate,
      bank_short,
      bank_name,
      loan_purpose,
      workflowId,
      workItemId: '',
      deductUpfrontInterest,
      partialUpfrontInterest,
      upfrontInterestPercentage,
      guarantorDetails: {
        guarantorId: existingGuarantor._id,
        name: guarantor_name,
        phone: guarantor_contact,
        relationship: guarantor_relationship,
        guarantorNumberId: guarantor_id_number || existingGuarantor.GUARANTOR_ID,
        email: existingGuarantor.email,
        address: existingGuarantor.address,
        status: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'APPROVED',
        guaranteedAmount: GUARANTEED_AMT
      }
    });

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
        hasGuarantor: !modifyGuarantor || guarantorAction !== 'UNCHECK',
        guaranteedAmount: GUARANTEED_AMT,
        workItemId: 129,
        upfrontInterest: {
          type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
          amount: parseFloat(upfrontInterest.toString()),
          percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
        }
      }
    });

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
        amount: parseFloat(upfrontInterest.toString()),
        percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
      },
      GUARANTOR_ID: existingGuarantor._id,
      GUARANTEED_AMOUNT: GUARANTEED_AMT
    }));

    if (resolvedApprovalStatus === 'APPROVED') {
      // Create LoanDisbursement record
      await loanDisbursement.save({ session });

      // Create transaction for disbursement: DR Loan GL, CR Customer Account
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
        FROM_ACCT_NO: loanGLAccount, // Debit Loan GL account
        TO_ACCT_NO: ACCT_NO, // Credit Customer Account
        AMOUNT: parseFloat(netDisbursement.toString()),
        CRNCY_ID: 'NGN',
        TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
        TRANSACTION_DESC: `Loan disbursed to ${loanAccount.ACCT_NM}`,
        STATUS: 'COMPLETED',
        VALUE_DATE: new Date(),
        createdBy: CREATED_BY,
        guarantorId: existingGuarantor._id,
        GUARANTEED_AMOUNT: GUARANTEED_AMT,
        metadata: {
          loanAccountNo: ACCT_NO,
          productType: PRODUCT_TYPE,
          workItemId: 129,
          upfrontInterest: {
            type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
            amount: parseFloat(upfrontInterest.toString()),
            percentage: partialUpfrontInterest ? upfrontInterestPercentage : null
          },
          createdBy: CREATED_BY
        }
      });

      // Update GLAccount for Loan GL (Debit)
      await GLAccount.updateOne(
        { GL_ACCT_NO: loanGLAccount },
        { $inc: { BALANCE: parseFloat(netDisbursement.toString()) } }, // Debit increases balance
        { session }
      );

      // Update CustomerAccount (Credit)
      await CustomerAccount.updateOne(
        { ACCT_NO },
        { $inc: { BALANCE: parseFloat(netDisbursement.toString()) } }, // Credit increases balance
        { session }
      );

      // Update CustomerAccount for fees and upfront interest (Debit)
      await CustomerAccount.updateOne(
        { ACCT_NO },
        { $inc: { BALANCE: -(parseFloat(feeDetails.totalFees.toString()) + parseFloat(upfrontInterest.toString())) } }, // Debit decreases balance
        { session }
      );

      await Promise.all([
        loanContract.save({ session }),
        wfWorkItem.save({ session }),
        RepaymentSchedule.insertMany(repaymentSchedule, { session }),
        disbursementTx.save({ session })
      ]);
    } else {
      // Save LoanDisbursement record for PENDING status
      await loanDisbursement.save({ session });

      await Promise.all([
        loanContract.save({ session }),
        wfWorkItem.save({ session }),
        RepaymentSchedule.insertMany(repaymentSchedule, { session })
      ]);
    }

    await session.commitTransaction();
    transactionCompleted = true;

    return res.status(200).json({
      success: true,
      message: resolvedApprovalStatus === 'APPROVED'
        ? 'Loan disbursed successfully with guarantor'
        : 'Loan prepared for disbursement with guarantor - pending approval',
      data: {
        WORK_ITEM_ID: workflowId,
        workItemId: 129,
        loanAccount: {
          ACCT_NO,
          status: resolvedApprovalStatus,
          disbursedAmount: resolvedApprovalStatus === 'APPROVED' ? parseFloat(netDisbursement.toString()) : 0,
          emi: emiResult.emi,
          nextPaymentDate: emiResult.installments?.[0]?.dueDate,
          maturityDate,
          upfrontInterest: {
            type: partialUpfrontInterest ? 'PARTIAL' : deductUpfrontInterest ? 'FULL' : 'NONE',
            amount: parseFloat(upfrontInterest.toString()),
            percentage: partialUpfrontInterest ? upfrontInterestPercentage : null,
            remainingInterest: parseFloat(remainingInterest.toString())
          },
          guarantor: {
            guarantorId: existingGuarantor._id,
            name: guarantor_name,
            guaranteedAmount: GUARANTEED_AMT,
            status: resolvedApprovalStatus === 'APPROVED' ? 'ACTIVE' : 'APPROVED'
          }
        },
        contract: {
          contractNo: loanContract.loan_contract_no,
          status: resolvedApprovalStatus
        },
        repaymentSchedule: {
          installments: emiResult.installments.length,
          totalInterest: parseFloat(totalInterest.toString()),
          schedule: emiResult.installments.slice(0, 5).map(s => ({
            installmentNo: s.installmentNo,
            dueDate: s.dueDate,
            amount: s.totalPayment,
            status: s.status
          }))
        },
        guarantorModification: guarantorModificationResult,
        feeDetails,
        Borrower_address: {
          Street: borrower_address?.Street || customerAccount.ADDRESS_LINE1 || 'Unknown Street',
          State: borrower_address?.State || 'Unknown State',
          City: borrower_address?.City || 'Unknown City',
          ZIPCode: borrower_address?.ZIPCode || '000000',
          Country: borrower_address?.Country || 'Nigeria'
        },
        disbursementId: loanDisbursement._id // Include LoanDisbursement ID
      }
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('Loan disbursement error:', error);
    return res.status(error.status || 500).json({
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

async repayLoan(req, res) {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const { ACCT_NO, REPAYMENT_AMOUNT, LOAN_ACCOUNT_ID, REPAYMENT_DATE = new Date() } = req.body;

    if (!req.user || !req.user.id) {
      throw new Error('Unauthorized: User not found');
    }

    // Validate input
    const requiredFields = ['ACCT_NO', 'REPAYMENT_AMOUNT', 'LOAN_ACCOUNT_ID'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    if (REPAYMENT_AMOUNT <= 0) {
      throw new Error('Repayment amount must be positive');
    }

    const repaymentDate = new Date(REPAYMENT_DATE);
    if (isNaN(repaymentDate.getTime())) {
      throw new Error('Invalid repayment date format');
    }

    // Fetch required documents
    const [loanAccount, loanProduct, customerAccount] = await Promise.all([
      LoanAccount.findOne({ ACCT_NO, _id: LOAN_ACCOUNT_ID }).session(session),
      LoanProduct.findOne({ PROD_ID: loanAccount?.PROD_ID }).session(session),
      CustomerAccount.findOne({ ACCT_NO }).session(session),
    ]);

    if (!loanAccount) {
      throw new Error('Loan account not found');
    }
    if (!loanProduct || !loanProduct.loanGLAccount) {
      throw new Error('Loan GL account not configured');
    }
    if (!customerAccount) {
      throw new Error('Customer account not found');
    }

    // Check if loan is active
    if (loanAccount.LOAN_STATUS !== 'ACTIVE') {
      throw new Error('Loan is not active for repayment');
    }

    // Calculate outstanding interest and principal
    const outstandingPrincipal = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || loanAccount.DISBURSEMENT_LIMIT.toString());
    const outstandingInterest = parseFloat(loanAccount.TOTAL_INTEREST?.toString() || 0) - parseFloat(loanAccount.TOTAL_REPAID_INTEREST?.toString() || 0);
    const totalOutstanding = outstandingPrincipal + outstandingInterest;

    if (REPAYMENT_AMOUNT > totalOutstanding) {
      throw new Error(`Repayment amount (${REPAYMENT_AMOUNT}) exceeds outstanding balance (${totalOutstanding})`);
    }

    // Allocate repayment to interest and principal
    let interestPaid = 0;
    let principalPaid = 0;
    if (outstandingInterest > 0) {
      interestPaid = Math.min(REPAYMENT_AMOUNT, outstandingInterest);
      principalPaid = REPAYMENT_AMOUNT - interestPaid;
    } else {
      principalPaid = REPAYMENT_AMOUNT;
    }

    // Create LoanRepayment record
    const loanRepayment = new LoanRepayment({
      ACCT_NO,
      amount: mongoose.Types.Decimal128.fromString(REPAYMENT_AMOUNT.toFixed(2)),
      date: repaymentDate,
      CUST_ID: loanAccount.CUST_ID,
      REPAYMENT_HISTORY: [{
        amount: mongoose.Types.Decimal128.fromString(REPAYMENT_AMOUNT.toFixed(2)),
        date: repaymentDate
      }]
    });

    // Update RepaymentSchedule
    const repaymentSchedules = await RepaymentSchedule.find({
      LOAN_ACCOUNT_ID: loanAccount._id,
      status: 'PENDING'
    }).sort({ dueDate: 1 }).session(session);

    let remainingRepayment = REPAYMENT_AMOUNT;
    for (const schedule of repaymentSchedules) {
      if (remainingRepayment <= 0) break;

      const scheduleTotal = parseFloat(schedule.totalPayment.toString());
      const scheduleInterest = parseFloat(schedule.interest.toString());
      const schedulePrincipal = parseFloat(schedule.principal.toString());

      let interestToPay = Math.min(remainingRepayment, scheduleInterest);
      let principalToPay = Math.min(remainingRepayment - interestToPay, schedulePrincipal);

      if (interestToPay + principalToPay > 0) {
        await RepaymentSchedule.updateOne(
          { _id: schedule._id },
          {
            $set: {
              interest: mongoose.Types.Decimal128.fromString((scheduleInterest - interestToPay).toFixed(2)),
              principal: mongoose.Types.Decimal128.fromString((schedulePrincipal - principalToPay).toFixed(2)),
              totalPayment: mongoose.Types.Decimal128.fromString((scheduleTotal - (interestToPay + principalToPay)).toFixed(2)),
              status: interestToPay + principalToPay >= scheduleTotal ? 'PAID' : 'PARTIAL'
            }
          },
          { session }
        );

        remainingRepayment -= (interestToPay + principalToPay);
      }
    }

    // Generate transaction IDs
    const TRANSACTION_IDS = generateTransactionIds();

    // Create repayment transaction: DR Customer Account, CR Loan GL
    const repaymentTx = new Transaction({
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
      TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      ACCT_ID: loanAccount._id,
      ACCT_NO: loanAccount.ACCT_NO,
      ACCT_NM: loanAccount.ACCT_NM,
      CUST_ID: loanAccount.CUST_ID,
      BU_ID: loanAccount.BU_ID || 'DEFAULT_BU',
      FROM_ACCT_NO: ACCT_NO, // Debit Customer Account
      TO_ACCT_NO: loanProduct.loanGLAccount, // Credit Loan GL
      AMOUNT: mongoose.Types.Decimal128.fromString(REPAYMENT_AMOUNT.toFixed(2)),
      CRNCY_ID: 'NGN',
      TRANSACTION_TYPE: 'LOAN_REPAYMENT',
      TRANSACTION_DESC: `Loan repayment for ${loanAccount.ACCT_NM} (Interest: ${interestPaid}, Principal: ${principalPaid})`,
      STATUS: 'COMPLETED',
      VALUE_DATE: repaymentDate,
      createdBy: req.user.id,
      metadata: {
        loanAccountNo: ACCT_NO,
        productType: loanAccount.PRODUCT_TYPE,
        interestPaid,
        principalPaid
      }
    });

    // Update CustomerAccount (Debit)
    await CustomerAccount.updateOne(
      { ACCT_NO },
      { $inc: { BALANCE: -REPAYMENT_AMOUNT } },
      { session }
    );

    // Update GLAccount for Loan GL (Credit)
    await GLAccount.updateOne(
      { GL_ACCT_NO: loanProduct.loanGLAccount },
      { $inc: { BALANCE: -REPAYMENT_AMOUNT } }, // Credit decreases balance
      { session }
    );

    // Update LoanAccount
    await LoanAccount.updateOne(
      { ACCT_NO },
      {
        $inc: {
          TOTAL_REPAID_AMOUNT: REPAYMENT_AMOUNT,
          OUTSTANDING_PRINCIPAL: -principalPaid,
          TOTAL_REPAID_INTEREST: interestPaid || 0
        },
        $set: {
          LOAN_STATUS: outstandingPrincipal - principalPaid <= 0 ? 'PAID' : 'ACTIVE'
        }
      },
      { session }
    );

    // Save LoanRepayment record
    await loanRepayment.save({ session });

    // Save transaction
    await repaymentTx.save({ session });

    await session.commitTransaction();
    transactionCompleted = true;

    return res.status(200).json({
      success: true,
      message: 'Loan repayment processed successfully',
      data: {
        transactionId: TRANSACTION_IDS.TRANSACTION_ID,
        repaymentAmount: REPAYMENT_AMOUNT,
        interestPaid,
        principalPaid,
        loanAccountNo: ACCT_NO,
        repaymentId: loanRepayment._id
      }
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('Loan repayment error:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process loan repayment',
      code: error.code || 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    session.endSession();
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

    // Add workItemId to the loan account response
    const loanAccountWithWorkItem = {
      ...loanAccount.toObject(), // Convert Mongoose document to plain object
      workItemId: 129
    };

    res.status(200).json({
      message: 'Loan account retrieved successfully',
      loanAccount: loanAccountWithWorkItem
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
    // Use lean() to get plain JavaScript objects
    const loanAccounts = await LoanAccount.find({ CUST_ID: custId }).lean();

    if (!loanAccounts || loanAccounts.length === 0) {
      return res.status(404).json({ message: 'No loan accounts found for this customer' });
    }

    // Add workItemId to each loan account
    const loanAccountsWithWorkItem = loanAccounts.map(loanAccount => ({
      ...loanAccount,
      workItemId: 129
    }));

    res.status(200).json({
      message: 'Loan accounts retrieved successfully',
      count: loanAccounts.length,
      loanAccounts: loanAccountsWithWorkItem
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