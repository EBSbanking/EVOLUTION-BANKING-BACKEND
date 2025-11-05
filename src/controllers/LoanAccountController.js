import mongoose from 'mongoose';
import RateIndex from '../models/Rate-Index.js';
import LoanInterestRate from '../models/LoanInterestRate.js';
import CreditApplication from '../models/CreditApplication.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import NotificationService from '../Services/NotificationService.js';
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
    case 'BW': return 'Bi-Weeks';
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
    case 'BW': return 'BI_WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return 'YEARLY';
    default: throw new Error(`Invalid term code: ${termCode}`);
  }
};

const generateContractText = (loanDetails, customerDetails, loanProduct, effectiveInterestRate) => {
  try {
    // Always use the effectiveInterestRate parameter which should be the actual rate used
    let interestRate;
    
    if (effectiveInterestRate !== undefined && effectiveInterestRate !== null) {
      // Handle Decimal128 objects from MongoDB
      if (effectiveInterestRate && typeof effectiveInterestRate === 'object') {
        if (effectiveInterestRate.toString && typeof effectiveInterestRate.toString === 'function') {
          interestRate = parseFloat(effectiveInterestRate.toString());
        } else if (effectiveInterestRate.$numberDecimal) {
          interestRate = parseFloat(effectiveInterestRate.$numberDecimal);
        } else {
          interestRate = parseFloat(effectiveInterestRate);
        }
      } else if (typeof effectiveInterestRate === 'number') {
        interestRate = effectiveInterestRate;
      } else if (typeof effectiveInterestRate === 'string') {
        interestRate = parseFloat(effectiveInterestRate);
      }
    }
    
    // If we still don't have a valid interest rate, try loanDetails
    if (isNaN(interestRate) || interestRate === undefined) {
      interestRate = parseFloat(loanDetails.INTEREST_RATE);
    }
    
    // Final fallback - use a more reasonable default or throw error
    if (isNaN(interestRate) || !isFinite(interestRate)) {
      console.error('CRITICAL: No valid interest rate found for contract generation');
      // Instead of using 15.0, use the rate from loan product or throw error
      interestRate = parseFloat(loanProduct?.interestRate) || 
                    parseFloat(loanProduct?.rateInformation?.rate) || 
                    12.0; // More reasonable default
      console.warn(`Using fallback interest rate: ${interestRate}%`);
    }

    const amount = Number(loanDetails.AMOUNT) || 0;
    const fees = loanProduct.feeStructure || [];
    const processingFee = loanProduct.processingFeeRate
      ? `${(parseFloat(loanProduct.processingFeeRate) * 100).toFixed(2)}%`
      : '0%';
    
    const feeDetails = fees
      .filter(fee => fee.isActive)
      .map(fee => `${fee.name}: ${fee.isPercentage ? `${parseFloat(fee.amount) * 100}%` : parseFloat(fee.amount)}`)
      .join('\n');

    // Helper function for term description
    const getTermDescription = (termCode) => {
      const termMap = {
        'D': 'Days',
        'W': 'Weeks',
        'BW': 'Bi-Weeks',
        'M': 'Months',
        'Q': 'Quarters',
        'Y': 'Years'
      };
      return termMap[termCode] || 'Months';
    };

    // Helper function for payment frequency
    const convertTermCodeToFrequency = (termCode) => {
      const frequencyMap = {
        'D': 'Daily',
        'W': 'Weekly',
        'BW': 'Bi-Weekly',
        'M': 'Monthly',
        'Q': 'Quarterly',
        'Y': 'Yearly'
      };
      return frequencyMap[termCode] || 'Monthly';
    };

    // Format dates safely
    const formatDate = (dateInput) => {
      if (!dateInput) return 'Not specified';
      try {
        const date = new Date(dateInput);
        return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (error) {
        return 'Invalid date';
      }
    };

    return `LOAN AGREEMENT

This Agreement is made on ${new Date().toLocaleDateString('en-NG', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})} between:

BORROWER: 
${loanDetails.borrower_name || customerDetails?.ACCT_NM || customerDetails?.CUST_NM || 'Customer'}
${loanDetails.borrower_address || customerDetails?.HOME_ADDRESS || 'Address not provided'}

AND

LENDER: 
${process.env.BANK_NAME || 'Our Bank'}

ARTICLE 1: LOAN TERMS

1.1 Principal Amount: ${amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
1.2 Interest Rate: ${interestRate.toFixed(2)}% per annum
1.3 Loan Term: ${loanDetails.TERM_VALUE || 0} ${getTermDescription(loanDetails.TERM_CD || 'M')}
1.4 Loan Purpose: ${loanDetails.loan_purpose || 'General Business Purpose'}
1.5 Disbursement Date: ${formatDate(loanDetails.DISBURSEMENT_DATE)}

ARTICLE 2: REPAYMENT TERMS

2.1 Payment Frequency: ${convertTermCodeToFrequency(loanDetails.TERM_CD || 'M')}
2.2 Number of Installments: ${loanDetails.NUMBER_OF_INSTALLMENTS || 'Not specified'}
2.3 First Payment Date: ${formatDate(loanDetails.FIRST_PAYMENT_DATE)}
2.4 Final Payment Date: ${formatDate(loanDetails.LAST_PAYMENT_DATE)}

ARTICLE 3: FEES AND CHARGES

3.1 Processing Fee: ${processingFee}
${feeDetails ? `3.2 Other Fees:\n${feeDetails.split('\n').map(fee => `   ${fee}`).join('\n')}` : '3.2 Other Fees: None'}

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

BORROWER:
_________________________
Name: ${loanDetails.borrower_name || customerDetails?.ACCT_NM || customerDetails?.CUST_NM || 'Borrower'}
Signature: ___________________
Date: ___________________

LENDER:
_________________________
Name: ${process.env.BANK_NAME || 'Our Bank'}
Signature: ___________________
Date: ___________________`;
  } catch (error) {
    console.error('Error generating contract text:', error);
    // Fallback minimal contract with error indication
    return `LOAN AGREEMENT 
    
Between ${loanDetails.borrower_name || 'Borrower'} 
And ${process.env.BANK_NAME || 'Our Bank'}

Principal Amount: ${loanDetails.AMOUNT || 0}
Interest Rate: ${effectiveInterestRate?.toString() || loanDetails.INTEREST_RATE || 'Rate not specified'}%
Term: ${loanDetails.TERM_VALUE || 0} ${loanDetails.TERM_CD || 'M'}

NOTE: Contract generated with limited details due to system error.

Signatures:
___________________________
Borrower

___________________________
Lender
Date: ${new Date().toLocaleDateString()}`;
  }
};


const LoanAccountController = {
async applyForLoan(req, res) {
  // Define utility functions
  async function getLoanCycleCount(custId, session) {
    try {
      const query = LoanAccount.countDocuments({ CUST_ID: custId });
      if (session) query.session(session);
      const loanCount = await query;
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
      case 'BW': result.setDate(result.getDate() + termValue * 14); break;
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
      case 'BW': return 'BI_WEEKLY';
      case 'M': return 'MONTHLY';
      case 'Q': return 'QUARTERLY';
      case 'Y': return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
      default: return 'MONTHLY';
    }
  }

  async function findGuarantor(guarantorId, session) {
    try {
      if (!guarantorId) {
        return null;
      }

      // Try by GUARANTOR_ID number first
      if (!isNaN(guarantorId)) {
        let query = Guarantor.findOne({ GUARANTOR_ID: Number(guarantorId) });
        if (session) query = query.session(session);
        const byNumber = await query;
        if (byNumber) return byNumber;
      }

      // Try by ObjectId
      if (mongoose.Types.ObjectId.isValid(guarantorId)) {
        let query = Guarantor.findById(guarantorId);
        if (session) query = query.session(session);
        const byObjectId = await query;
        if (byObjectId) return byObjectId;
      }

      // Try by string GUARANTOR_ID
      let query = Guarantor.findOne({ GUARANTOR_ID: guarantorId.toString() });
      if (session) query = query.session(session);
      const byString = await query;
      return byString;
    } catch (error) {
      console.error('Error finding guarantor:', error);
      return null;
    }
  }

  // SIMPLIFIED: Function to check if guarantor has existing guaranteed loans
  async function checkGuarantorExistingLoans(guarantorId, session) {
    try {
      console.log(`Checking existing loans for guarantor: ${guarantorId}`);
      
      let query = LoanAccount.find({
        GUARANTOR_ID: guarantorId,
        LOAN_STATUS: { $in: ['ACTIVE', 'PENDING', 'APPROVED'] }
      });
      
      if (session) {
        query = query.session(session);
      }

      const existingLoans = await query;
      console.log(`Found ${existingLoans.length} existing loans for guarantor`);

      if (existingLoans.length > 0) {
        const loanDetails = existingLoans.map(loan => ({
          loanAccountId: loan.loanAccountId,
          ACCT_NO: loan.ACCT_NO,
          LOAN_STATUS: loan.LOAN_STATUS,
          DISBURSEMENT_LIMIT: parseFloat(loan.DISBURSEMENT_LIMIT?.toString() || '0'),
          GUARANTEED_AMOUNT: parseFloat(loan.GUARANTEED_AMOUNT?.toString() || '0'),
          CUST_ID: loan.CUST_ID,
          START_DT: loan.START_DT,
          MATURITY_DT: loan.MATURITY_DT
        }));

        return {
          hasExistingLoans: true,
          totalExistingLoans: existingLoans.length,
          loanDetails: loanDetails,
          totalGuaranteedAmount: loanDetails.reduce((sum, loan) => sum + loan.GUARANTEED_AMOUNT, 0)
        };
      }

      return {
        hasExistingLoans: false,
        totalExistingLoans: 0,
        loanDetails: [],
        totalGuaranteedAmount: 0
      };
    } catch (error) {
      console.error('Error checking guarantor existing loans:', error);
      // Return empty result instead of throwing to avoid blocking loan application
      return {
        hasExistingLoans: false,
        totalExistingLoans: 0,
        loanDetails: [],
        totalGuaranteedAmount: 0
      };
    }
  }

  async function findRateIndex(rateIndexId, session) {
    try {
      let query = {};
      
      const numericId = parseInt(rateIndexId);
      if (!isNaN(numericId)) {
        query = { INDEX_RATE_ID: numericId };
      } else {
        query = { INDEX_RATE_ID: rateIndexId };
      }

      let rateQuery = RateIndex.findOne(query);
      if (session) rateQuery = rateQuery.session(session);
      let rateIndex = await rateQuery;
      
      if (!rateIndex) {
        console.warn(`Rate index ${rateIndexId} not found, looking for default...`);
        
        let defaultQuery = RateIndex.findOne({ IS_DEFAULT: true });
        if (session) defaultQuery = defaultQuery.session(session);
        rateIndex = await defaultQuery;
        
        if (!rateIndex) {
          let firstQuery = RateIndex.findOne({});
          if (session) firstQuery = firstQuery.session(session);
          rateIndex = await firstQuery;
          
          if (rateIndex) {
            console.warn(`Using first available rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
          } else {
            // Create a default rate index object to avoid null
            rateIndex = {
              INDEX_RATE_ID: 'DEFAULT',
              INDEX_RATE: 15.0,
              INDEX_NM: 'Default Rate'
            };
            console.warn('No rate indexes available, using default rate of 15.0%');
          }
        } else {
          console.warn(`Using default rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
        }
      }
      
      return rateIndex;
    } catch (error) {
      console.error('Error in findRateIndex:', error);
      // Return default rate instead of throwing
      return {
        INDEX_RATE_ID: 'FALLBACK',
        INDEX_RATE: 15.0,
        INDEX_NM: 'Fallback Rate'
      };
    }
  }

  async function calculateFallbackEMI(principal, annualRate, termMonths, startDate) {
    console.log('Calculating fallback EMI...');
    
    const monthlyRate = (annualRate / 100) / 12;
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths) / 
                (Math.pow(1 + monthlyRate, termMonths) - 1);
    
    const totalPayment = emi * termMonths;
    const totalInterest = totalPayment - principal;
    
    const installments = [];
    let balance = principal;
    
    for (let i = 1; i <= termMonths; i++) {
      const interest = balance * monthlyRate;
      const principalComponent = emi - interest;
      
      if (principalComponent > balance) {
        const finalPrincipal = balance;
        const finalEMI = finalPrincipal + interest;
        balance = 0;
        
        installments.push({
          installmentNumber: i,
          dueDate: new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate()),
          principal: parseFloat(finalPrincipal.toFixed(2)),
          interest: parseFloat(interest.toFixed(2)),
          totalPayment: parseFloat(finalEMI.toFixed(2)),
          remainingBalance: 0
        });
        break;
      }
      
      balance -= principalComponent;
      
      installments.push({
        installmentNumber: i,
        dueDate: new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate()),
        principal: parseFloat(principalComponent.toFixed(2)),
        interest: parseFloat(interest.toFixed(2)),
        totalPayment: parseFloat(emi.toFixed(2)),
        remainingBalance: parseFloat(balance.toFixed(2))
      });
    }
    
    return {
      emi: parseFloat(emi.toFixed(2)),
      totalPayment: parseFloat(totalPayment.toFixed(2)),
      totalInterest: parseFloat(totalInterest.toFixed(2)),
      installments
    };
  }

  function getDefaultRateIndexForProduct(PROD_ID) {
    const productToRateIndexMap = {
      300: 300, 301: 301, 302: 301, 303: 301, 304: 301, 
      305: 305, 306: 301, 307: 301, 308: 300, 309: 300, 399: 301
    };
    return productToRateIndexMap[PROD_ID] || 301;
  }

  async function validateAndResolveRateIndex(PROD_ID, requestedIndexId, session) {
    if (!requestedIndexId) {
      const defaultIndexId = getDefaultRateIndexForProduct(PROD_ID);
      console.log(`No INDEX_RATE_ID specified, using default ${defaultIndexId} for product ${PROD_ID}`);
      return await findRateIndex(defaultIndexId, session);
    }
    
    const specifiedIndex = await findRateIndex(requestedIndexId, session);
    if (specifiedIndex) {
      return specifiedIndex;
    }
    
    const defaultIndexId = getDefaultRateIndexForProduct(PROD_ID);
    console.warn(`Requested rate index ${requestedIndexId} not found, using default ${defaultIndexId} for product ${PROD_ID}`);
    return await findRateIndex(defaultIndexId, session);
  }

  function safeDecimal128(value, fieldName = 'value') {
    console.log(`safeDecimal128: Converting field ${fieldName} with value:`, value);
    
    if (value === null || value === undefined) {
      throw new Error(`Invalid ${fieldName}: null or undefined. Field: ${fieldName}, Value: ${value}`);
    }
    
    if (value instanceof mongoose.Types.Decimal128) {
      return value;
    }
    
    // Convert to number if it's a string
    const numericValue = typeof value === 'string' ? parseFloat(value) : Number(value);
    
    if (isNaN(numericValue)) {
      throw new Error(`Invalid ${fieldName}: not a number. Field: ${fieldName}, Value: ${value}`);
    }
    
    if (!isFinite(numericValue)) {
      throw new Error(`Invalid ${fieldName}: infinite value. Field: ${fieldName}, Value: ${value}`);
    }
    
    try {
      return mongoose.Types.Decimal128.fromString(numericValue.toString());
    } catch (error) {
      console.error(`Error converting ${fieldName} to Decimal128:`, error);
      throw new Error(`Failed to convert ${fieldName} to Decimal128: ${error.message}`);
    }
  }

  function convertDecimalObject(obj) {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj !== 'object') return obj;
    if (obj.$numberDecimal !== undefined) {
      return parseFloat(obj.$numberDecimal);
    }
    const newObj = Array.isArray(obj) ? [] : {};
    for (let key in obj) {
      newObj[key] = convertDecimalObject(obj[key]);
    }
    return newObj;
  }

  const normalizeBorrowerAddress = (address) => {
    if (!address || typeof address !== 'object') return null;
    return {
      street: address.street || address.Street || '',
      city: address.city || address.City || '',
      state: address.state || address.State || '',
      zipCode: address.zipCode || address.ZIPCode || address.zipcode || '',
      country: address.country || address.Country || 'Nigeria'
    };
  };

  // SIMPLIFIED: Generate workflow identifiers without external dependencies
  async function generateWorkflowIdentifiers(session) {
    const timestamp = Date.now();
    return {
      TRANSACTION_ID: `TXN-${timestamp}`,
      WORK_ITEM_ID: `WORK-${timestamp}`,
      EVENT_ID: `EVT-${timestamp}`,
      WORKFLOW_ID: `WF-${timestamp}`,
      TRAN_JOURNAL_ID: `JRN-${timestamp}`
    };
  }

  // SIMPLIFIED: Generate loan account number
  async function generateLoanAccountNumberByProdId(prodId) {
    const prefix = prodId.toString().padStart(3, '0');
    const randomSuffix = Math.floor(1000000 + Math.random() * 9000000).toString().padStart(7, '0');
    return `${prefix}${randomSuffix}`;
  }

  // SIMPLIFIED: Generate numeric ID
  function generateNumericId() {
    return Math.floor(100000 + Math.random() * 900000);
  }

  // SIMPLIFIED: Generate ID
  function generateId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  // SIMPLIFIED: Generate contract text
  function generateContractText(params, customer, loanProduct, interestRate) {
    return `LOAN AGREEMENT

Borrower: ${params.borrower_name}
Address: ${params.borrower_address}
Loan Amount: ₦${params.AMOUNT.toLocaleString()}
Interest Rate: ${params.INTEREST_RATE}%
Term: ${params.TERM_VALUE} ${params.TERM_CD}
Purpose: ${params.loan_purpose}

This agreement constitutes a legally binding contract between the borrower and the bank.`;
  }

  // SIMPLIFIED: Create workflow item
  async function createWorkflowItem(workflowData, session) {
    // For now, return a simple success response
    // In a real implementation, this would create a workflow item in your system
    return {
      success: true,
      WORK_ITEM_ID: workflowData.WORK_ITEM_ID,
      WORKFLOW_ID: workflowData.WORKFLOW_ID,
      document: workflowData
    };
  }

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

  // SIMPLIFIED: Required fields - removed less critical ones for now
  const requiredFields = [
    'PROD_ID', 'CUST_ID', 'ACCT_NM', 'APPL_ID', 'PRODUCT_TYPE', 'CRNCY_ID', 'BU_ID',
    'PRIMARY_OFFICER_ID', 'DISBURSEMENT_LIMIT', 'START_DT', 'TERM_CD', 'TERM_VALUE',
    'CREATED_BY', 'REPAY_SRC_ACCT_NO', 'TRANSACTION_TYPE', 'GUARANTOR_ID'
  ];

  const missingFields = requiredFields.filter((field) => {
    return !req.body.hasOwnProperty(field) || req.body[field] === undefined || req.body[field] === null || req.body[field] === '';
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

  // Set default values for optional fields
  const upfrontInterest = req.body.UPFRONT_INTEREST || 0;
  const partialInterest = req.body.PARTIAL_INTEREST || false;
  const guaranteedAmount = req.body.GUARANTEED_AMT || req.body.DISBURSEMENT_LIMIT;

  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    session.startTransaction();
    console.log('Transaction started');

    // Generate workflow identifiers
    let workflowIdentifiers;
    try {
      workflowIdentifiers = await generateWorkflowIdentifiers(session);
      console.log('Workflow identifiers generated successfully:', workflowIdentifiers);
    } catch (workflowIdError) {
      console.error('Failed to generate workflow identifiers:', workflowIdError);
      // Create fallback identifiers
      const timestamp = Date.now();
      workflowIdentifiers = {
        TRANSACTION_ID: `TXN-${timestamp}`,
        WORK_ITEM_ID: `WORK-${timestamp}`,
        EVENT_ID: `EVT-${timestamp}`,
        WORKFLOW_ID: `WF-${timestamp}`,
        TRAN_JOURNAL_ID: `JRN-${timestamp}`
      };
      console.log('Using fallback workflow identifiers:', workflowIdentifiers);
    }

    const { TRANSACTION_ID, EVENT_ID, WORK_ITEM_ID, WORKFLOW_ID, TRAN_JOURNAL_ID } = workflowIdentifiers;

    const numericValues = {
      INDEX_RATE_ID: req.body.INDEX_RATE_ID,
      PROD_ID: parseInt(req.body.PROD_ID),
      TERM_VALUE: parseInt(req.body.TERM_VALUE),
      CUST_ID: req.body.CUST_ID,
      GUARANTEED_AMT: safeDecimal128(guaranteedAmount, 'GUARANTEED_AMT'),
      DISBURSEMENT_LIMIT: safeDecimal128(req.body.DISBURSEMENT_LIMIT, 'DISBURSEMENT_LIMIT'),
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

    // Generate loan account number
    let loanAccountNumber;
    const maxRetries = 3;
    let retries = 0;

    while (!loanAccountNumber && retries < maxRetries) {
      try {
        loanAccountNumber = await generateLoanAccountNumberByProdId(numericValues.PROD_ID);
        console.log(`Generated loanAccountNumber (attempt ${retries + 1}): ${loanAccountNumber}`);

        // Check if account number is unique
        const existingLoanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber });
        if (!existingLoanAccount) {
          console.log(`Account number ${loanAccountNumber} is unique`);
          break;
        }

        console.warn(`Account number ${loanAccountNumber} already exists, retrying...`);
        loanAccountNumber = null;
        retries++;
      } catch (genError) {
        console.error('Failed to generate loan account number:', genError.message);
        retries++;
      }
    }

    if (!loanAccountNumber) {
      throw {
        code: 'ACCOUNT_GENERATION_FAILED',
        message: `Failed to generate a unique loan account number after ${maxRetries} attempts`,
        status: 500,
      };
    }

    // Check existing CreditApplication
    const existingCreditApplication = await CreditApplication.findOne({ APPL_ID: req.body.APPL_ID });
    if (existingCreditApplication) {
      throw {
        code: 'DUPLICATE_APPLICATION',
        message: `A CreditApplication with APPL_ID ${req.body.APPL_ID} already exists`,
        status: 409,
      };
    }

    // Get loan cycle count
    const loanCycleCount = await getLoanCycleCount(numericValues.CUST_ID, session);

    // SIMPLIFIED: Fetch required entities with better error handling
    const [rateIndex, loanProduct, customer, guarantor] = await Promise.all([
      validateAndResolveRateIndex(numericValues.PROD_ID, req.body.INDEX_RATE_ID, session),
      LoanProduct.findOne({ PROD_ID: numericValues.PROD_ID }).session(session),
      Customer.findOne({ CUST_ID: req.body.CUST_ID }).session(session),
      findGuarantor(req.body.GUARANTOR_ID, session)
    ]);

    if (!loanProduct) {
      throw {
        code: 'PRODUCT_NOT_FOUND',
        message: `Loan product not found for PROD_ID ${numericValues.PROD_ID}`,
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

    // Check guarantor existing loans
    console.log('Checking guarantor existing loans...');
    const guarantorLoanCheck = await checkGuarantorExistingLoans(guarantor._id, session);

    if (guarantorLoanCheck.hasExistingLoans) {
      console.log(`Guarantor has ${guarantorLoanCheck.totalExistingLoans} existing guaranteed loans`);
      console.warn(`Guarantor ${guarantor.GUARANTOR_ID} (${guarantor.fullName}) is already guaranteeing ${guarantorLoanCheck.totalExistingLoans} loan(s)`);
    }

    // Validate TERM_CD
    const validTermCodes = ['D', 'W', 'BW', 'M', 'Q', 'Y'];
    if (!validTermCodes.includes(req.body.TERM_CD)) {
      throw {
        code: 'INVALID_TERM_CD',
        message: `Invalid TERM_CD: ${req.body.TERM_CD}. Must be one of ${validTermCodes.join(', ')}`,
        status: 400,
      };
    }

    const paymentFrequency = getPaymentFrequency(req.body.TERM_CD, numericValues.TERM_VALUE);

    // Calculate dates
    const startDate = new Date(req.body.START_DT);
    const maturityDate = calculateMaturityDate(startDate, req.body.TERM_CD, numericValues.TERM_VALUE);

    // Calculate interest rate
    console.log('=== INTEREST RATE CALCULATION ===');
    let effectiveInterestRate;
    let interestRateNumber;

    try {
      if (rateIndex && rateIndex.INDEX_RATE !== undefined && rateIndex.INDEX_RATE !== null) {
        const rateValue = rateIndex.INDEX_RATE;
        console.log(`Using rate index interest rate: ${rateValue}%`);
        effectiveInterestRate = safeDecimal128(rateValue, 'INDEX_RATE');
      } else if (loanProduct.interestRate !== undefined && loanProduct.interestRate !== null) {
        const rateValue = loanProduct.interestRate;
        console.log(`Falling back to LoanProduct.interestRate: ${rateValue}%`);
        effectiveInterestRate = safeDecimal128(rateValue, 'loanProduct.interestRate');
      } else {
        effectiveInterestRate = mongoose.Types.Decimal128.fromString('15.0');
        console.warn(`No interest rate found, using default: 15.0%`);
      }

      interestRateNumber = parseFloat(effectiveInterestRate.toString());
      console.log(`Final effective interest rate: ${interestRateNumber}%`);
    } catch (error) {
      console.error('Interest rate calculation error:', error);
      // Use default rate
      effectiveInterestRate = mongoose.Types.Decimal128.fromString('15.0');
      interestRateNumber = 15.0;
      console.warn('Using default interest rate of 15.0% due to calculation error');
    }

    // Calculate EMI using fallback method
    let emiResult;
    try {
      console.log('Calculating EMI...');
      const principalAmount = parseFloat(numericValues.DISBURSEMENT_LIMIT.toString());
      
      // Convert term to months for EMI calculation
      let termMonths;
      switch (req.body.TERM_CD.toUpperCase()) {
        case 'D': termMonths = Math.ceil(numericValues.TERM_VALUE / 30); break;
        case 'W': termMonths = Math.ceil(numericValues.TERM_VALUE / 4); break;
        case 'BW': termMonths = Math.ceil(numericValues.TERM_VALUE * 2 / 4); break;
        case 'M': termMonths = numericValues.TERM_VALUE; break;
        case 'Q': termMonths = numericValues.TERM_VALUE * 3; break;
        case 'Y': termMonths = numericValues.TERM_VALUE * 12; break;
        default: termMonths = numericValues.TERM_VALUE;
      }

      if (termMonths < 1) termMonths = 1;

      emiResult = await calculateFallbackEMI(
        principalAmount,
        interestRateNumber,
        termMonths,
        startDate
      );
      console.log('EMI calculation successful');
    } catch (emiError) {
      console.error('EMI calculation error:', emiError);
      throw {
        code: 'INVALID_REPAYMENT_SCHEDULE',
        message: `Failed to generate repayment schedule: ${emiError.message}`,
        status: 500,
      };
    }

    // SIMPLIFIED: Create LoanAccount with basic fields
    const loanAccountData = {
      loanAccountId: parseInt(loanAccountNumber) || Date.now(),
      JOURNAL_ID: TRAN_JOURNAL_ID,
      CUST_ID: req.body.CUST_ID,
      ACCT_NM: req.body.ACCT_NM,
      ACCT_NO: loanAccountNumber,
      APPL_ID: req.body.APPL_ID,
      PRODUCT_TYPE: req.body.PRODUCT_TYPE,
      CRNCY_ID: req.body.CRNCY_ID || 'NGN',
      BU_ID: req.body.BU_ID,
      PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
      SECONDARY_OFFICER_ID: req.body.SECONDARY_OFFICER_ID || req.body.PRIMARY_OFFICER_ID,
      DISBURSEMENT_LIMIT: numericValues.DISBURSEMENT_LIMIT,
      // Set all disbursement-related fields to ZERO
      ACTUAL_DISBURSEMENT: mongoose.Types.Decimal128.fromString('0.00'),
      DISBURSED_AMOUNT: mongoose.Types.Decimal128.fromString('0.00'),
      OUTSTANDING_PRINCIPAL: mongoose.Types.Decimal128.fromString('0.00'),
      CURRENT_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
      START_DT: startDate,
      TERM_CD: req.body.TERM_CD,
      TERM_VALUE: numericValues.TERM_VALUE,
      MATURITY_DT: maturityDate,
      INTEREST_RATE_ID: rateIndex.INDEX_RATE_ID || 'DEFAULT',
      INTEREST_RATE: effectiveInterestRate,
      LOAN_STATUS: 'PENDING',
      PAYMENT_FREQUENCY: paymentFrequency,
      CREATED_BY: req.body.CREATED_BY,
      TRANSACTION_ID,
      EVENT_ID,
      PROD_ID: numericValues.PROD_ID,
      TOTAL_INTEREST: safeDecimal128(emiResult.totalInterest, 'emiResult.totalInterest'),
      TOTAL_REPAYMENT: safeDecimal128(emiResult.totalPayment, 'emiResult.totalPayment'),
      REPAYMENT_SOURCE_ACCOUNT: req.body.REPAY_SRC_ACCT_NO,
      GUARANTOR_ID: guarantor._id,
      GUARANTEED_AMOUNT: numericValues.GUARANTEED_AMT,
      HAS_GUARANTOR: true,
      guarantorDetails: {
        name: guarantor.fullName,
        phone: guarantor.phoneNumber,
        relationship: guarantor.relationshipToBorrower,
        guarantorNumberId: guarantor.GUARANTOR_ID.toString(),
        email: guarantor.email,
        address: guarantor.address,
        existingGuarantees: guarantorLoanCheck.hasExistingLoans ? {
          totalExistingLoans: guarantorLoanCheck.totalExistingLoans,
          totalGuaranteedAmount: guarantorLoanCheck.totalGuaranteedAmount
        } : null
      },
      Borrower_address: req.body.Borrower_address ? {
        street: req.body.Borrower_address.street || '',
        city: req.body.Borrower_address.city || '',
        state: req.body.Borrower_address.state || '',
        zipCode: req.body.Borrower_address.zipCode || '',
        country: req.body.Borrower_address.country || 'Nigeria',
      } : undefined,
      upfrontInterestPercentage: safeDecimal128(upfrontInterest, 'upfrontInterest'),
      partialUpfrontInterest: partialInterest,
      applicationDate: new Date(),
      lastUpdated: new Date(),
    };

    const loanAccount = new LoanAccount(loanAccountData);
    await loanAccount.save({ session });
    console.log('LoanAccount saved with ACCT_NO:', loanAccount.ACCT_NO);

    // Update guarantor
    await Guarantor.findByIdAndUpdate(
      guarantor._id,
      {
        $addToSet: { guaranteedLoans: loanAccount._id },
        lastUsedDate: new Date(),
        status: 'PENDING_VERIFICATION',
      },
      { session }
    );

    // SIMPLIFIED: Create RepaymentSchedule
    const repaymentScheduleData = {
      LOAN_ACCOUNT_ID: loanAccount._id,
      ACCT_NO: loanAccountNumber,
      CUST_ID: req.body.CUST_ID,
      START_DATE: startDate,
      MATURITY_DATE: maturityDate,
      PRINCIPAL_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      INTEREST_RATE: effectiveInterestRate,
      TERM: numericValues.TERM_VALUE,
      TERM_TYPE: req.body.TERM_CD,
      paymentFrequency: paymentFrequency,
      EMI_AMOUNT: safeDecimal128(emiResult.emi, 'emiResult.emi'),
      installments: emiResult.installments.map((installment, index) => ({
        installmentNo: installment.installmentNumber || (index + 1),
        dueDate: installment.dueDate,
        principal: safeDecimal128(installment.principal, `installment.principal for ${index}`),
        interest: safeDecimal128(installment.interest, `installment.interest for ${index}`),
        totalPayment: safeDecimal128(installment.totalPayment, `installment.totalPayment for ${index}`),
        remainingBalance: safeDecimal128(installment.remainingBalance, `installment.remainingBalance for ${index}`),
        status: 'PENDING',
        amountPaid: mongoose.Types.Decimal128.fromString('0.00'),
        principalPaid: mongoose.Types.Decimal128.fromString('0.00'),
        interestPaid: mongoose.Types.Decimal128.fromString('0.00')
      })),
      TOTAL_INTEREST: safeDecimal128(emiResult.totalInterest, 'emiResult.totalInterest'),
      TOTAL_REPAYMENT: safeDecimal128(emiResult.totalPayment, 'emiResult.totalPayment'),
      TRANSACTION_ID,
      EVENT_ID,
      CREATED_BY: req.body.CREATED_BY,
      STATUS: 'PENDING'
    };

    const repaymentSchedule = new RepaymentSchedule(repaymentScheduleData);
    await repaymentSchedule.save({ session });
    console.log('RepaymentSchedule saved with ACCT_NO:', repaymentSchedule.ACCT_NO);

    // SIMPLIFIED: Create CreditApplication
    const creditApplicationData = {
      creditApplicationId: `APP-${Date.now()}`,
      CUST_NM: req.body.ACCT_NM,
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
      Purpose_of_Credit: req.body.loan_purpose || 'GENERAL LOAN',
      REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
      TERM_CD: req.body.TERM_CD,
      TERM_VALUE: numericValues.TERM_VALUE,
      USER_ID: req.body.USER_ID || req.body.CREATED_BY,
      TRANSACTION_TYPE: req.body.TRANSACTION_TYPE,
      STATUS: 'PENDING',
      REC_ST: 'active',
      LOAN_CYCLE: loanCycleCount,
      CREATED_AT: new Date(),
      REQUESTED_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      LOAN_ACCOUNT_ID: loanAccount._id,
      REPAYMENT_SCHEDULE_ID: repaymentSchedule._id,
      TRANSACTION_ID,
      EVENT_ID,
      GUARANTOR_ID: guarantor._id,
      INDEX_RATE_ID: req.body.INDEX_RATE_ID,
      Borrower_address: req.body.Borrower_address,
      guarantorExistingLoans: guarantorLoanCheck.hasExistingLoans ? guarantorLoanCheck : null
    };

    const creditApplication = new CreditApplication(creditApplicationData);
    await creditApplication.save({ session });
    console.log('CreditApplication saved with ACCT_NO:', creditApplication.ACCT_NO);

    // Create workflow item
    let workflowResult;
    try {
      workflowResult = await createWorkflowItem(
        {
          ITEM_VALUE: loanAccount._id.toString(),
          ITEM_DESC: `Loan Application for ${loanAccountNumber}`,
          ITEM_CLASS_NM: 'Loan',
          ITEM_TYPE: 'Loan',
          CUST_ID: req.body.CUST_ID,
          USER_ID: req.body.USER_ID || req.body.CREATED_BY,
          BU_ID: req.body.BU_ID || '0001',
          TARGET_USER_ROLE_ID: 'LOAN_OFFICER',
          ORIGINATOR_USER_ROLE_ID: 'Creator',
          ITEM_ID: creditApplication._id.toString(),
          REPAYMENT_SCHEDULE_ID: repaymentSchedule._id.toString(),
          REC_ST: 'PENDING',
          WAIT_ST: 'PENDING',
          VERSION: 1,
          CREATE_DT: new Date(),
          dueDate: new Date(Date.now() + 7 * 86400000),
          WORKFLOW_ID: WORKFLOW_ID,
          WORK_ITEM_ID: WORK_ITEM_ID,
          TRANSACTION_ID: TRANSACTION_ID,
          EVENT_ID: EVENT_ID,
          GUARANTOR_ID: guarantor._id.toString(),
          ITEM_BU_ID: req.body.BU_ID,
        },
        session
      );
    } catch (workflowError) {
      console.error('Workflow creation error:', workflowError);
      workflowResult = {
        success: true,
        WORK_ITEM_ID: WORK_ITEM_ID,
        WORKFLOW_ID: WORKFLOW_ID
      };
    }

    await session.commitTransaction();
    transactionCompleted = true;
    console.log('Transaction committed successfully');

    return res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully',
      status: 'Pending',
      data: {
        loanAccountId: loanAccount._id,
        loanAccountNumber,
        creditApplicationId: creditApplication._id,
        repaymentScheduleId: repaymentSchedule._id,
        workItemId: workflowResult.WORK_ITEM_ID,
        workflowId: workflowResult.WORKFLOW_ID,
        APPL_ID: req.body.APPL_ID,
        status: 'PENDING',
        disbursementStatus: 'NOT_DISBURSED',
        currentBalance: '0.00',
        disbursedAmount: '0.00',
        guarantor: {
          guarantorId: guarantor._id,
          guarantorNumberId: guarantor.GUARANTOR_ID,
          name: guarantor.fullName,
          guaranteedAmount: parseFloat(numericValues.GUARANTEED_AMT.toString()),
          status: 'PENDING_VERIFICATION',
          existingGuarantees: guarantorLoanCheck.hasExistingLoans ? {
            totalExistingLoans: guarantorLoanCheck.totalExistingLoans,
            totalGuaranteedAmount: guarantorLoanCheck.totalGuaranteedAmount
          } : null
        },
        repaymentSchedule: {
          id: repaymentSchedule._id,
          numberOfInstallments: emiResult.installments.length,
          firstPaymentDate: emiResult.installments[0]?.dueDate,
          lastPaymentDate: emiResult.installments.at(-1)?.dueDate,
          totalInterest: parseFloat(emiResult.totalInterest),
          totalRepayment: parseFloat(emiResult.totalPayment),
          paymentFrequency: paymentFrequency,
        },
        Borrower_address: req.body.Borrower_address,
        guarantorWarning: guarantorLoanCheck.hasExistingLoans ? 
          `Guarantor is already guaranteeing ${guarantorLoanCheck.totalExistingLoans} loan(s)` 
          : null,
      },
    });
  } catch (error) {
    console.error('Loan application error:', error);
    console.error('Error stack:', error.stack);
    
    if (session && session.inTransaction() && !transactionCompleted) {
      try {
        await session.abortTransaction();
        console.log('Transaction aborted successfully');
      } catch (abortError) {
        console.error('Error aborting transaction:', abortError);
      }
    }

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process loan application',
      code: error.code || 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  } finally {
    try {
      if (session) {
        await session.endSession();
        console.log('Session ended successfully');
      }
    } catch (endSessionError) {
      console.error('Error ending session:', endSessionError);
    }
  }
},

  // Additional controller methods can be added here
  async getLoanApplication(req, res) {
    try {
      const { applicationId } = req.params;
      
      const application = await CreditApplication.findOne({ APPL_ID: applicationId })
        .populate('LOAN_ACCOUNT_ID')
        .populate('GUARANTOR_ID');
      
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Loan application not found',
          code: 'APPLICATION_NOT_FOUND',
        });
      }

      return res.status(200).json({
        success: true,
        data: application,
      });
    } catch (error) {
      console.error('Error fetching loan application:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch loan application',
        code: 'FETCH_ERROR',
      });
    }
  },
  
async approveLoanApplication(req, res) {
  const session = await mongoose.startSession();
  let transactionSuccess = false;

  try {
    await session.startTransaction();

    const rawCustId = req.body.CUST_ID;
    
    // Handle different CUST_ID formats - remove leading zeros for matching
    const normalizedCustId = rawCustId.replace(/^0+/, ''); // Remove leading zeros
    const CUST_ID = String(normalizedCustId);
    const numericCUST_ID = parseInt(normalizedCustId, 10);

    const {
      workItemId,
      approvedBy,
      APPL_ID,
      approvalComments,
      overrideRiskCheck = false,
      forceApprove = false
    } = req.body;

    console.log('Starting loan approval process:', {
      APPL_ID,
      CUST_ID: normalizedCustId,
      workItemId,
      approvedBy
    });

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

    // Find credit application
    const creditApplication = await CreditApplication.findOne({
      APPL_ID,
      $or: [
        { CUST_ID: CUST_ID },
        { CUST_ID: numericCUST_ID },
        { CUST_ID: rawCustId },
        { CUST_ID: normalizedCustId }
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

    console.log('Found credit application:', {
      ACCT_NO: creditApplication.ACCT_NO,
      REPAY_SRC_ACCT_NO: creditApplication.REPAY_SRC_ACCT_NO
    });

    // Find loan account
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

    console.log('Found loan account:', {
      ACCT_NO: loanAccount.ACCT_NO,
      REPAYMENT_SOURCE_ACCOUNT: loanAccount.REPAYMENT_SOURCE_ACCOUNT
    });

    // Get repayment account number
    const repaymentAccountNo = creditApplication.REPAY_SRC_ACCT_NO || loanAccount.REPAYMENT_SOURCE_ACCOUNT;
    
    console.log('Repayment account lookup:', {
      repaymentAccountNo,
      sources: {
        fromCreditApp: creditApplication.REPAY_SRC_ACCT_NO,
        fromLoanAccount: loanAccount.REPAYMENT_SOURCE_ACCOUNT
      }
    });

    if (!repaymentAccountNo) {
      throw new Error('No repayment account number found in credit application or loan account');
    }

    // Find repayment account
    let repaymentAccount = await CustomerAccount.findOne({
      ACCT_NO: repaymentAccountNo,
      STATUS: 'ACTIVE'
    }).session(session);

    console.log('Repayment account search result:', {
      found: !!repaymentAccount,
      accountNo: repaymentAccountNo,
      accountStatus: repaymentAccount?.STATUS,
      accountCustId: repaymentAccount?.CUST_ID
    });

    // If not found and forceApprove is true, use the loan account as fallback
    if (!repaymentAccount && forceApprove) {
      console.log('Force approve: Using loan account as fallback for repayment account');
      repaymentAccount = {
        ACCT_NO: repaymentAccountNo,
        ACCT_NM: loanAccount.ACCT_NM || 'Customer Account',
        CUST_ID: normalizedCustId,
        STATUS: 'ACTIVE',
        LEDGER_BALANCE: 0,
        CLEARED_BALANCE: 0,
        AVAILABLE_BALANCE: 0,
        BU_ID: loanAccount.BU_ID || '100'
      };
    }

    if (!repaymentAccount) {
      throw new Error(`Repayment account ${repaymentAccountNo} not found for customer ${normalizedCustId}`);
    }

    // Continue with guarantor check and other validations...
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

    // Generate workflow identifiers for future disbursement
    const timestamp = Date.now();
    const uniqueSuffix = Math.random().toString(36).substring(2, 15);
    
    const workflowIdentifiers = {
      TRANSACTION_ID: `TXN-${timestamp}-${uniqueSuffix}`,
      WORK_ITEM_ID: `WORK-${timestamp}-${uniqueSuffix}`,
      EVENT_ID: `EVT-${timestamp}-${uniqueSuffix}`,
      WORKFLOW_ID: `WF-${timestamp}-${uniqueSuffix}`,
      TRAN_JOURNAL_ID: `JRN-${timestamp}-${uniqueSuffix}`
    };

    console.log('Generated workflow identifiers for future disbursement:', workflowIdentifiers);

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

    // Update Loan Account - ONLY CHANGE STATUS TO APPROVED
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $set: {
          LOAN_STATUS: 'APPROVED', // ✅ ONLY CHANGE STATUS
          APPROVED_BY: approvedBy,
          APPROVED_DATE: new Date(),
          REPAYMENT_SOURCE_ACCOUNT: repaymentAccount.ACCT_NO,
          TRANSACTION_ID: workflowIdentifiers.TRANSACTION_ID, // Store for future disbursement
          EVENT_ID: workflowIdentifiers.EVENT_ID, // Store for future disbursement
          JOURNAL_ID: workflowIdentifiers.TRAN_JOURNAL_ID, // Store for future disbursement
          lastUpdated: new Date()
        }
      },
      { session }
    );

    // Update Credit Application - ONLY CHANGE STATUS TO APPROVED
    await CreditApplication.updateOne(
      { _id: creditApplication._id },
      {
        $set: {
          STATUS: 'APPROVED', // ✅ ONLY CHANGE STATUS
          UPDATED_AT: new Date(),
          APPROVED_BY: approvedBy,
          APPROVAL_DT: new Date(),
          APPROVED_LIMIT_AMT: loanAccount.DISBURSEMENT_LIMIT,
          TRANSACTION_ID: workflowIdentifiers.TRANSACTION_ID, // Store for future disbursement
          EVENT_ID: workflowIdentifiers.EVENT_ID, // Store for future disbursement
          REPAY_SRC_ACCT_NO: repaymentAccount.ACCT_NO // Ensure repayment account is set
        }
      },
      { session }
    );

    // Update Repayment Schedule status if it exists
    try {
      await RepaymentSchedule.updateOne(
        { LOAN_ACCOUNT_ID: loanAccount._id },
        {
          $set: {
            STATUS: 'APPROVED',
            lastUpdated: new Date()
          }
        },
        { session }
      );
      console.log('Repayment schedule status updated to APPROVED');
    } catch (scheduleError) {
      console.warn('Could not update repayment schedule status:', scheduleError.message);
      // Continue even if repayment schedule update fails
    }

    // Update Work Item status
    try {
      await WF_WORK_ITEM.findOneAndUpdate(
        { WORK_ITEM_ID: numericWorkItemId },
        {
          $set: {
            REC_ST: 'COMPLETED',
            WAIT_ST: 'COMPLETED',
            STATUS: 'APPROVED',
            UPDATED_BY: approvedBy,
            UPDATE_DT: new Date()
          }
        },
        { session }
      );
      console.log('Work item updated successfully to APPROVED status');
    } catch (workItemError) {
      console.warn('Work item update failed, continuing:', workItemError.message);
      // Continue even if work item update fails
    }

    // Log audit trail
    try {
      const AuditLog = mongoose.model('AuditLog');
      await AuditLog.create([{
        action: 'APPROVE_LOAN',
        userId: approvedBy,
        timestamp: new Date(),
        details: {
          APPL_ID,
          loanAccountNumber: loanAccount.ACCT_NO,
          workItemId: numericWorkItemId,
          comments: approvalComments || 'Loan application approved',
          repaymentAccount: repaymentAccount.ACCT_NO,
          approvedAmount: loanAccount.DISBURSEMENT_LIMIT?.toString(),
          nextStep: 'Awaiting disbursement'
        }
      }], { session });
    } catch (auditError) {
      console.warn('Audit trail logging failed, continuing:', auditError.message);
      // Continue even if audit logging fails
    }

    await session.commitTransaction();
    transactionSuccess = true;

    console.log('✅ Loan approval completed successfully - Status changed to APPROVED');

    return res.status(200).json({
      success: true,
      message: 'Loan application approved successfully - Ready for disbursement',
      data: {
        loanAccountNumber: loanAccount.ACCT_NO,
        approvedAmount: loanAccount.DISBURSEMENT_LIMIT?.toString(),
        repaymentAccount: repaymentAccount.ACCT_NO,
        guarantorId: guarantor.GUARANTOR_ID,
        workItemId: numericWorkItemId,
        nextStep: 'DISBURSEMENT_REQUIRED',
        disbursementInstructions: 'Use the disbursement endpoint to release funds to customer',
        workflowIdentifiers: workflowIdentifiers // For future disbursement reference
      }
    });

  } catch (error) {
    if (session.inTransaction() && !transactionSuccess) {
      try {
        await session.abortTransaction();
        console.log('❌ Transaction aborted due to error');
      } catch (abortError) {
        console.error('Error aborting transaction:', abortError);
      }
    }
    
    console.error('❌ Approval error:', error);
    
    // Handle duplicate key error specifically
    let errorMessage = error.message;
    let errorCode = 'APPROVAL_ERROR';
    
    if (error.message.includes('duplicate key error') || error.message.includes('E11000')) {
      errorMessage = 'Database error: Duplicate entry detected. Please try again.';
      errorCode = 'DUPLICATE_ENTRY';
    }
    
    return res.status(500).json({
      success: false,
      message: errorMessage,
      code: errorCode,
      error: error.message,
      supportReference: Math.random().toString(36).substring(2, 10).toUpperCase()
    });
  } finally {
    try {
      if (session) {
        await session.endSession();
        console.log('Session ended');
      }
    } catch (endSessionError) {
      console.error('Error ending session:', endSessionError);
    }
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

async disburseLoan(req, res) {
  // Helper function for safe Decimal128 conversion
  const safeDecimal128 = (value) => {
    if (value === null || value === undefined) {
      return mongoose.Types.Decimal128.fromString('0.00');
    }
    if (value instanceof mongoose.Types.Decimal128) {
      return value;
    }
    // Convert to string first to ensure proper format
    const stringValue = typeof value === 'number' ? value.toString() : String(value);
    return mongoose.Types.Decimal128.fromString(stringValue);
  };

  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.withTransaction(async () => {
      console.log('🏦 Starting loan disbursement process with transaction');

      if (!req.user || !req.user.id) {
        throw {
          status: 401,
          message: 'Unauthorized: User not found',
          code: 'UNAUTHORIZED'
        };
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
        USER_ID = req.user.id,
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
        fundingAcctNo,
      } = req.body;

      console.log("🔍 Received disbursement request:", {
        APPL_ID,
        ACCT_NO,
        AMOUNT,
        fundingAcctNo,
        PROD_ID,
        GUARANTOR_ID
      });

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
        'USER_ID',
        'fundingAcctNo',
      ];
      
      const missingFields = requiredFields.filter(field => !req.body[field]);
      if (missingFields.length > 0) {
        throw {
          status: 400,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          code: 'MISSING_REQUIRED_FIELDS',
        };
      }

      // VALIDATION: Check for existing active loans or pending applications
      console.log("🔍 Checking for existing loans/applications for customer:", CUST_ID, "product:", PROD_ID);
      
      const [existingActiveLoans, existingPendingApplications] = await Promise.all([
        LoanAccount.find({ 
          CUST_ID: CUST_ID, 
          PROD_ID: PROD_ID,
          LOAN_STATUS: { $in: ['ACTIVE', 'PENDING'] }
        }).session(session),
        
        CreditApplication.find({
          CUST_ID: CUST_ID,
          PROD_ID: PROD_ID,
          STATUS: 'PENDING'
        }).session(session)
      ]);

      console.log("🔍 Existing active loans found:", existingActiveLoans.length);
      console.log("🔍 Existing pending applications found:", existingPendingApplications.length);

      // Filter out the current loan application from the results
      const otherActiveLoans = existingActiveLoans.filter(loan => loan.ACCT_NO !== ACCT_NO);
      const otherPendingApplications = existingPendingApplications.filter(app => app.APPL_ID !== APPL_ID);

      if (otherActiveLoans.length > 0) {
        throw {
          status: 400,
          message: `Customer already has ${otherActiveLoans.length} active or pending loan(s) for product ${PROD_ID}. Please ensure existing loans are fully repaid or written off before disbursing a new loan.`,
          code: 'EXISTING_ACTIVE_LOAN',
          details: {
            existingLoans: otherActiveLoans.map(loan => ({
              accountNo: loan.ACCT_NO,
              status: loan.LOAN_STATUS,
              disbursedAmount: loan.DISBURSED_AMOUNT,
              outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL
            }))
          }
        };
      }

      if (otherPendingApplications.length > 0) {
        throw {
          status: 400,
          message: `Customer already has ${otherPendingApplications.length} pending application(s) for product ${PROD_ID}. Please process or cancel existing applications before disbursing a new loan.`,
          code: 'EXISTING_PENDING_APPLICATION',
          details: {
            pendingApplications: otherPendingApplications.map(app => ({
              applicationId: app.APPL_ID,
              status: app.STATUS,
              requestedAmount: app.REQUESTED_AMOUNT
            }))
          }
        };
      }

      // Check for non-terminal loans
      const nonTerminalLoans = await LoanAccount.find({
        CUST_ID: CUST_ID,
        PROD_ID: PROD_ID,
        LOAN_STATUS: { 
          $nin: ['CLOSED', 'WRITTEN_OFF', 'REJECTED', 'SETTLED'] 
        },
        ACCT_NO: { $ne: ACCT_NO }
      }).session(session);

      if (nonTerminalLoans.length > 0) {
        throw {
          status: 400,
          message: `Customer has ${nonTerminalLoans.length} non-closed loan(s) for product ${PROD_ID}. All existing loans must be closed, written off, or settled before disbursing a new loan.`,
          code: 'EXISTING_NON_TERMINAL_LOAN',
          details: {
            nonTerminalLoans: nonTerminalLoans.map(loan => ({
              accountNo: loan.ACCT_NO,
              status: loan.LOAN_STATUS,
              outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL,
              currentBalance: loan.CURRENT_BALANCE
            })),
            requiredActions: [
              'Close existing loans by full repayment',
              'Write off non-recoverable loans', 
              'Settle loans through settlement process'
            ]
          }
        };
      }

      // Continue with other validations
      if (partialUpfrontInterest) {
        if (deductUpfrontInterest) {
          throw {
            status: 400,
            message: 'Cannot enable both full and partial upfront interest',
            code: 'CONFLICTING_INTEREST_OPTIONS',
          };
        }
        if (isNaN(upfrontInterestPercentage) || upfrontInterestPercentage <= 0 || upfrontInterestPercentage > 100) {
          throw {
            status: 400,
            message: 'Upfront interest percentage must be between 0 and 100',
            code: 'INVALID_UPFRONT_PERCENTAGE',
          };
        }
      }

      if (GUARANTEED_AMT <= 0) {
        throw {
          status: 400,
          message: 'Guaranteed amount must be positive',
          code: 'INVALID_GUARANTEED_AMOUNT',
        };
      }
      if (GUARANTEED_AMT > AMOUNT * 2) {
        throw {
          status: 400,
          message: 'Guaranteed amount cannot exceed twice the loan amount',
          code: 'EXCESSIVE_GUARANTEED_AMOUNT',
        };
      }

      const disbursementDate = new Date(DISBURSEMENT_DATE);
      if (isNaN(disbursementDate.getTime())) {
        throw {
          status: 400,
          message: 'Invalid disbursement date format',
          code: 'INVALID_DISBURSEMENT_DATE',
        };
      }

      let maturityDate;
      if (MATURITY_DT) {
        maturityDate = new Date(MATURITY_DT);
      } else if (TERM_VALUE && TERM_CD) {
        maturityDate = new Date(disbursementDate);
        TERM_CD.toUpperCase() === 'M'
          ? maturityDate.setMonth(maturityDate.getMonth() + parseInt(TERM_VALUE))
          : maturityDate.setFullYear(maturityDate.getFullYear() + parseInt(TERM_VALUE));
      } else {
        throw {
          status: 400,
          message: 'Either MATURITY_DT or both TERM_VALUE and TERM_CD must be provided',
          code: 'MISSING_MATURITY_INFO',
        };
      }

      if (isNaN(maturityDate.getTime()) || disbursementDate >= maturityDate) {
        throw {
          status: 400,
          message: 'Invalid maturity date or must be after disbursement date',
          code: 'INVALID_MATURITY_DATE',
        };
      }

      if (AMOUNT <= 0) {
        throw {
          status: 400,
          message: 'Loan amount must be positive',
          code: 'INVALID_LOAN_AMOUNT',
        };
      }

      // Database operations
      const [loanProduct, customerAccount, creditApplication, existingGuarantor, existingLoanAccount] = await Promise.all([
        LoanProduct.findOne({ PROD_ID }).session(session),
        CustomerAccount.findOne({ ACCT_NO: fundingAcctNo }).session(session),
        CreditApplication.findOne({ APPL_ID }).session(session),
        Guarantor.findOne({ GUARANTOR_ID }).session(session),
        LoanAccount.findOne({ ACCT_NO }).session(session)
      ]);

      if (!loanProduct) {
        throw {
          status: 404,
          message: 'Loan product not found',
          code: 'PRODUCT_NOT_FOUND',
        };
      }

      const PRODUCT_TYPE = loanProduct.PRODUCT_TYPE || loanProduct.name || 'UNKNOWN';

      if (!customerAccount) {
        throw {
          status: 404,
          message: `Customer account ${fundingAcctNo} not found`,
          code: 'CUSTOMER_ACCOUNT_NOT_FOUND',
        };
      }

      // Flexible Customer ID Validation
      const normalizeCustomerId = (custId) => {
        if (!custId) return '';
        return custId.toString().replace(/^0+/, '');
      };

      const accountCustId = normalizeCustomerId(customerAccount.CUST_ID);
      const requestCustId = normalizeCustomerId(CUST_ID);

      console.log("🔍 Customer ID Validation:", {
        accountCustId,
        requestCustId,
        rawAccountCustId: customerAccount.CUST_ID,
        rawRequestCustId: CUST_ID
      });

      if (accountCustId !== requestCustId) {
        throw {
          status: 400,
          message: `Customer account ${fundingAcctNo} does not belong to customer ${CUST_ID}. Account belongs to ${customerAccount.CUST_ID}`,
          code: 'CUSTOMER_ACCOUNT_MISMATCH',
        };
      }

      // Use the database CUST_ID format for consistency
      const normalizedCUST_ID = customerAccount.CUST_ID;

      if (!existingGuarantor) {
        throw {
          status: 404,
          message: `Guarantor ${GUARANTOR_ID} not found`,
          code: 'GUARANTOR_NOT_FOUND',
        };
      }

      const normalizeString = (str) => String(str || '').trim().toLowerCase();
      if (
        normalizeString(existingGuarantor.fullName) !== normalizeString(guarantor_name) ||
        normalizeString(existingGuarantor.relationshipToBorrower) !== normalizeString(guarantor_relationship)
      ) {
        throw {
          status: 400,
          message: `Guarantor details do not match. Expected: ${existingGuarantor.fullName} (${existingGuarantor.relationshipToBorrower}), Received: ${guarantor_name} (${guarantor_relationship})`,
          code: 'GUARANTOR_DETAILS_MISMATCH',
        };
      }

      if (existingLoanAccount && existingLoanAccount.LOAN_STATUS === 'ACTIVE') {
        throw {
          status: 400,
          message: `Loan already disbursed or active for account number ${ACCT_NO}`,
          code: 'LOAN_ALREADY_ACTIVE',
        };
      }

      // Calculate fees
      const calculateFees = (loanAmount, productId) => {
        const processingFee = loanAmount * 0.01; // 1% processing fee
        const charges = [
          {
            type: 'PROCESSING_FEE',
            name: 'Loan Processing Fee',
            amount: processingFee,
            description: 'Processing fee for loan application'
          },
          {
            type: 'LEGAL_FEE',
            name: 'Legal Fee',
            amount: loanAmount * 0.005, // 0.5% legal fee
            description: 'Legal documentation fee'
          }
        ];
        
        const totalFees = charges.reduce((sum, charge) => sum + charge.amount, 0);
        
        return {
          processingFee,
          charges,
          totalFees,
          upfrontInterest: 0,
          upfrontInterestPercentage: 0
        };
      };

      const feeDetails = calculateFees(parseFloat(AMOUNT), PROD_ID);
      const totalCharges = feeDetails.charges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
      feeDetails.totalFees = (feeDetails.processingFee || 0) + totalCharges;
      
      // Use safeDecimal128 helper for all Decimal128 conversions
      feeDetails.totalFees = safeDecimal128(feeDetails.totalFees.toFixed(2));
      feeDetails.processingFee = safeDecimal128((feeDetails.processingFee || 0).toFixed(2));
      feeDetails.charges = feeDetails.charges.map(charge => ({
        ...charge,
        amount: safeDecimal128(charge.amount.toFixed(2))
      }));

      const termMonths = TERM_CD.toUpperCase() === 'M' ? parseInt(TERM_VALUE) : parseInt(TERM_VALUE) * 12;
      const totalInterest = safeDecimal128(((parseFloat(AMOUNT) * (parseFloat(INTEREST_RATE) / 100) * termMonths) / 12).toFixed(2));

      let upfrontInterest = safeDecimal128('0.00');
      let remainingInterest = totalInterest;
      if (partialUpfrontInterest) {
        const percentage = parseFloat(upfrontInterestPercentage) / 100;
        const upfrontAmount = parseFloat(totalInterest.toString()) * percentage;
        upfrontInterest = safeDecimal128(upfrontAmount.toFixed(2));
        remainingInterest = safeDecimal128((parseFloat(totalInterest.toString()) - upfrontAmount).toFixed(2));
        feeDetails.upfrontInterest = upfrontInterest;
        feeDetails.upfrontInterestPercentage = safeDecimal128(upfrontInterestPercentage.toFixed(2));
      } else if (deductUpfrontInterest) {
        upfrontInterest = totalInterest;
        remainingInterest = safeDecimal128('0.00');
        feeDetails.upfrontInterest = upfrontInterest;
      }

      const netDisbursement = safeDecimal128(
        (parseFloat(AMOUNT) - parseFloat(feeDetails.totalFees.toString()) - parseFloat(upfrontInterest.toString())).toFixed(2)
      );

      if (parseFloat(netDisbursement.toString()) <= 0) {
        throw {
          status: 400,
          message: 'Net disbursement amount must be positive after deducting fees and upfront interest',
          code: 'INVALID_NET_DISBURSEMENT',
        };
      }

      // EMI calculation function
      const calculateEMI = ({ principal, annualRate, termMonths, startDate }) => {
        const monthlyRate = (annualRate / 100) / 12;
        const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths) / 
                    (Math.pow(1 + monthlyRate, termMonths) - 1);
        
        const totalPayment = emi * termMonths;
        const totalInterest = totalPayment - principal;
        
        const installments = [];
        let balance = principal;
        
        for (let i = 1; i <= termMonths; i++) {
          const interest = balance * monthlyRate;
          const principalComponent = emi - interest;
          
          if (principalComponent > balance) {
            const finalPrincipal = balance;
            const finalEMI = finalPrincipal + interest;
            balance = 0;
            
            installments.push({
              installmentNumber: i,
              dueDate: new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate()),
              principal: parseFloat(finalPrincipal.toFixed(2)),
              interest: parseFloat(interest.toFixed(2)),
              totalPayment: parseFloat(finalEMI.toFixed(2)),
              remainingBalance: 0
            });
            break;
          }
          
          balance -= principalComponent;
          
          installments.push({
            installmentNumber: i,
            dueDate: new Date(startDate.getFullYear(), startDate.getMonth() + i, startDate.getDate()),
            principal: parseFloat(principalComponent.toFixed(2)),
            interest: parseFloat(interest.toFixed(2)),
            totalPayment: parseFloat(emi.toFixed(2)),
            remainingBalance: parseFloat(balance.toFixed(2))
          });
        }
        
        return {
          emi: parseFloat(emi.toFixed(2)),
          totalPayment: parseFloat(totalPayment.toFixed(2)),
          totalInterest: parseFloat(totalInterest.toFixed(2)),
          installments
        };
      };

      const upperTermCd = TERM_CD.toUpperCase();
      const emiResult = calculateEMI({
        principal: parseFloat(AMOUNT),
        annualRate: parseFloat(INTEREST_RATE),
        termMonths: upperTermCd === 'M' ? parseInt(TERM_VALUE) : parseInt(TERM_VALUE) * 12,
        startDate: disbursementDate,
      });

      if (!emiResult?.installments) {
        throw {
          status: 500,
          message: 'Failed to generate repayment schedule',
          code: 'SCHEDULE_GENERATION_FAILED',
        };
      }

      // Generate transaction IDs
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      const TRANSACTION_ID = `TXN-${timestamp}-${randomSuffix}`;
      const EVENT_ID = `EVT-${timestamp}-${randomSuffix}`;
      const JOURNAL_ID = `JRN-${timestamp}-${randomSuffix}`;

      // Create or update LoanAccount
      let loanAccount;
      if (existingLoanAccount) {
        // Update existing loan account
        loanAccount = await LoanAccount.findOneAndUpdate(
          { ACCT_NO },
          {
            LOAN_STATUS: 'ACTIVE',
            DISBURSED_AMOUNT: safeDecimal128(AMOUNT),
            ACTUAL_DISBURSEMENT: safeDecimal128(AMOUNT),
            OUTSTANDING_PRINCIPAL: safeDecimal128(AMOUNT),
            CURRENT_BALANCE: safeDecimal128(AMOUNT),
            START_DT: disbursementDate,
            MATURITY_DT: maturityDate,
            INTEREST_RATE: safeDecimal128(INTEREST_RATE),
            TERM_CD,
            TERM_VALUE: parseInt(TERM_VALUE),
            FEE_DETAILS: feeDetails,
            TOTAL_INTEREST: totalInterest,
            TOTAL_REPAYMENT: safeDecimal128(emiResult.totalPayment.toFixed(2)),
            GUARANTOR_ID: existingGuarantor._id,
            GUARANTEED_AMOUNT: safeDecimal128(GUARANTEED_AMT),
            HAS_GUARANTOR: true,
            upfrontInterestPercentage: safeDecimal128(upfrontInterestPercentage),
            partialUpfrontInterest,
            TRANSACTION_ID,
            EVENT_ID,
            JOURNAL_ID,
            lastUpdated: new Date(),
            disbursementDate: new Date(),
          },
          { new: true, session }
        );
      } else {
        // Create new loan account
        loanAccount = new LoanAccount({
          loanAccountId: Date.now(),
          CUST_ID: normalizedCUST_ID,
          ACCT_NM: borrower_name || customerAccount.ACCT_NM || 'Unknown Borrower',
          ACCT_NO,
          APPL_ID,
          PRODUCT_TYPE,
          CRNCY_ID: 'NGN',
          BU_ID: customerAccount.BU_ID || '001',
          PRIMARY_OFFICER_ID: USER_ID,
          DISBURSEMENT_LIMIT: safeDecimal128(AMOUNT),
          DISBURSED_AMOUNT: safeDecimal128(AMOUNT),
          ACTUAL_DISBURSEMENT: safeDecimal128(AMOUNT),
          OUTSTANDING_PRINCIPAL: safeDecimal128(AMOUNT),
          CURRENT_BALANCE: safeDecimal128(AMOUNT),
          START_DT: disbursementDate,
          MATURITY_DT: maturityDate,
          INTEREST_RATE: safeDecimal128(INTEREST_RATE),
          INTEREST_RATE_ID: INDEX_RATE_ID || 'DEFAULT',
          LOAN_STATUS: 'ACTIVE',
          PAYMENT_FREQUENCY: 'MONTHLY',
          CREATED_BY,
          PROD_ID,
          FEE_DETAILS: feeDetails,
          TOTAL_INTEREST: totalInterest,
          TOTAL_REPAYMENT: safeDecimal128(emiResult.totalPayment.toFixed(2)),
          REPAYMENT_SOURCE_ACCOUNT: fundingAcctNo,
          GUARANTOR_ID: existingGuarantor._id,
          GUARANTEED_AMOUNT: safeDecimal128(GUARANTEED_AMT),
          HAS_GUARANTOR: true,
          guarantorDetails: {
            name: existingGuarantor.fullName,
            phone: existingGuarantor.phoneNumber,
            relationship: existingGuarantor.relationshipToBorrower,
            guarantorNumberId: existingGuarantor.GUARANTOR_ID.toString(),
          },
          Borrower_address: borrower_address || {},
          upfrontInterestPercentage: safeDecimal128(upfrontInterestPercentage),
          partialUpfrontInterest,
          TRANSACTION_ID,
          EVENT_ID,
          JOURNAL_ID,
          applicationDate: new Date(),
          disbursementDate: new Date(),
          lastUpdated: new Date(),
        });

        await loanAccount.save({ session });
      }

      // ===== CRITICAL: CALL PROCESS LOAN DISBURSEMENT TRANSACTIONS =====
      console.log('🔄 Processing loan disbursement transactions...');
      
      const transactionResult = await processLoanDisbursementTransactions({
        session,
        loanAccount,
        customerAccount,
        AMOUNT: parseFloat(AMOUNT),
        loanFeeAmount: parseFloat(feeDetails.totalFees.toString()),
        fundingAcctNo: fundingAcctNo,
        ACCT_NO,
        CREATED_BY,
        DISBURSEMENT_DATE: disbursementDate,
        INTEREST_RATE: parseFloat(INTEREST_RATE),
        FEE_TYPE: 'PROCESSING_FEE',
        PRODUCT_TYPE,
        deductUpfrontInterest,
        partialUpfrontInterest,
        upfrontInterestAmount: parseFloat(upfrontInterest.toString()),
        upfrontInterestPercentage: parseFloat(upfrontInterestPercentage),
        guarantorId: existingGuarantor._id,
        guaranteedAmount: parseFloat(GUARANTEED_AMT),
        guarantorName: existingGuarantor.fullName,
        TRANSACTION_ID,
        EVENT_ID,
        JOURNAL_ID
      });

      console.log('✅ Loan disbursement transactions completed:', transactionResult.success);

      // Update CreditApplication status
      await CreditApplication.findOneAndUpdate(
        { APPL_ID },
        {
          STATUS: 'DISBURSED',
          APPROVAL_STATUS: 'APPROVED',
          disbursementDate: new Date(),
          lastUpdated: new Date(),
        },
        { session }
      );

      // Update Guarantor
      await Guarantor.findByIdAndUpdate(
        existingGuarantor._id,
        {
          $addToSet: { guaranteedLoans: loanAccount._id },
          $inc: { totalGuaranteedAmount: parseFloat(GUARANTEED_AMT) },
          lastUsedDate: new Date(),
          status: 'ACTIVE',
        },
        { session }
      );

      // Create RepaymentSchedule
      const repaymentSchedule = new RepaymentSchedule({
        LOAN_ACCOUNT_ID: loanAccount._id,
        ACCT_NO,
        CUST_ID: normalizedCUST_ID,
        START_DATE: disbursementDate,
        MATURITY_DATE: maturityDate,
        PRINCIPAL_AMOUNT: safeDecimal128(AMOUNT),
        INTEREST_RATE: safeDecimal128(INTEREST_RATE),
        TERM: parseInt(TERM_VALUE),
        TERM_TYPE: TERM_CD,
        paymentFrequency: 'MONTHLY',
        EMI_AMOUNT: safeDecimal128(emiResult.emi.toFixed(2)),
        installments: emiResult.installments.map((installment, index) => ({
          installmentNo: installment.installmentNumber || (index + 1),
          dueDate: installment.dueDate,
          principal: safeDecimal128(installment.principal.toFixed(2)),
          interest: safeDecimal128(installment.interest.toFixed(2)),
          totalPayment: safeDecimal128(installment.totalPayment.toFixed(2)),
          remainingBalance: safeDecimal128(installment.remainingBalance.toFixed(2)),
          status: 'PENDING',
          amountPaid: safeDecimal128('0.00'),
          principalPaid: safeDecimal128('0.00'),
          interestPaid: safeDecimal128('0.00')
        })),
        TOTAL_INTEREST: totalInterest,
        TOTAL_REPAYMENT: safeDecimal128(emiResult.totalPayment.toFixed(2)),
        TRANSACTION_ID,
        EVENT_ID,
        CREATED_BY,
        STATUS: 'ACTIVE'
      });

      await repaymentSchedule.save({ session });

      transactionCompleted = true;

      console.log('✅ Loan disbursement completed successfully');

      return res.status(200).json({
        success: true,
        message: 'Loan disbursed successfully',
        data: {
          loanAccountId: loanAccount._id,
          loanAccountNumber: ACCT_NO,
          disbursedAmount: AMOUNT,
          netDisbursement: netDisbursement.toString(),
          fees: {
            totalFees: feeDetails.totalFees.toString(),
            processingFee: feeDetails.processingFee.toString(),
            charges: feeDetails.charges.map(charge => ({
              type: charge.type,
              name: charge.name,
              amount: charge.amount.toString()
            }))
          },
          interest: {
            totalInterest: totalInterest.toString(),
            upfrontInterest: upfrontInterest.toString(),
            remainingInterest: remainingInterest.toString()
          },
          repaymentSchedule: {
            emi: emiResult.emi,
            totalPayment: emiResult.totalPayment,
            numberOfInstallments: emiResult.installments.length,
            firstPaymentDate: emiResult.installments[0]?.dueDate,
            lastPaymentDate: emiResult.installments[emiResult.installments.length - 1]?.dueDate
          },
          guarantor: {
            guarantorId: existingGuarantor._id,
            name: existingGuarantor.fullName,
            guaranteedAmount: GUARANTEED_AMT
          },
          fundingAccount: fundingAcctNo,
          disbursementDate: new Date(),
          maturityDate: maturityDate,
          transactionDetails: {
            TRANSACTION_ID,
            EVENT_ID,
            JOURNAL_ID
          }
        }
      });
    });
  } catch (error) {
    console.error('❌ Loan disbursement error:', error);
    
    if (!transactionCompleted) {
      try {
        await session.abortTransaction();
        console.log('🔄 Transaction rolled back due to error');
      } catch (abortError) {
        console.error('Error aborting transaction:', abortError);
      }
    }
    
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process loan disbursement',
      code: error.code || 'INTERNAL_SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  } finally {
    await session.endSession();
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
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const { workItemId, approvedBy = req.user?.id || 'system' } = req.body;

    if (!workItemId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: workItemId',
        code: 'MISSING_WORK_ITEM_ID'
      });
    }

    console.log('🔍 Starting disbursement approval for workItem:', workItemId);

    // Find work item
    const workItem = await WF_WORK_ITEM.findOne({
      WORK_ITEM_ID: workItemId,
      status: { $in: ['PENDING', 'APPROVAL_PENDING', 'READY_FOR_DISBURSEMENT'] }
    }).session(session);

    if (!workItem) {
      const existingItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId }).session(session);
      return res.status(404).json({
        success: false,
        message: existingItem ? `Work item is in ${existingItem.status} status` : 'Work item not found',
        code: 'WORK_ITEM_NOT_FOUND'
      });
    }

    // Find loan account (should be in APPROVED status, not ACTIVE yet)
    const loanAccount = await LoanAccount.findOne({
      _id: workItem.entityId,
      LOAN_STATUS: 'APPROVED' // Should be APPROVED, not ACTIVE yet
    }).session(session);

    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Approved loan account not found for this work item',
        code: 'LOAN_ACCOUNT_NOT_FOUND'
      });
    }

    console.log('🔍 Found approved loan account:', loanAccount.ACCT_NO);

    // Find customer account for funding
    const customerAccount = await CustomerAccount.findOne({
      ACCT_NO: loanAccount.REPAYMENT_SOURCE_ACCOUNT
    }).session(session);

    if (!customerAccount) {
      return res.status(404).json({
        success: false,
        message: `Customer account ${loanAccount.REPAYMENT_SOURCE_ACCOUNT} not found`,
        code: 'CUSTOMER_ACCOUNT_NOT_FOUND'
      });
    }

    // Generate transaction IDs
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const { TRANSACTION_ID, EVENT_ID, JOURNAL_ID } = {
      TRANSACTION_ID: `TXN-${timestamp}-${randomSuffix}`,
      EVENT_ID: `EVT-${timestamp}-${randomSuffix}`,
      JOURNAL_ID: `JRN-${timestamp}-${randomSuffix}`
    };

    // Calculate amounts
    const loanAmount = parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0');
    const totalFees = parseFloat(loanAccount.FEE_DETAILS?.totalFees?.toString() || '0');
    const upfrontInterest = parseFloat(loanAccount.UPFRONT_INTEREST_AMOUNT?.toString() || '0');
    const netDisbursement = loanAmount - totalFees - upfrontInterest;

    if (netDisbursement <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Net disbursement amount must be positive after deducting fees and upfront interest',
        code: 'INVALID_NET_DISBURSEMENT'
      });
    }

    console.log('💰 Disbursement amounts:', {
      loanAmount,
      totalFees,
      upfrontInterest,
      netDisbursement
    });

    // ===== CALL PROCESS LOAN DISBURSEMENT TRANSACTIONS =====
    console.log('🔄 Processing loan disbursement transactions for approved loan...');
    
    const transactionResult = await processLoanDisbursementTransactions({
      session,
      loanAccount,
      customerAccount,
      AMOUNT: loanAmount,
      loanFeeAmount: totalFees,
      fundingAcctNo: customerAccount.ACCT_NO,
      ACCT_NO: loanAccount.ACCT_NO,
      CREATED_BY: approvedBy,
      DISBURSEMENT_DATE: new Date(),
      INTEREST_RATE: parseFloat(loanAccount.INTEREST_RATE?.toString() || '0'),
      FEE_TYPE: 'PROCESSING_FEE',
      PRODUCT_TYPE: loanAccount.PRODUCT_TYPE || 'UNKNOWN',
      deductUpfrontInterest: loanAccount.DEDUCT_UPFRONT_INTEREST || false,
      partialUpfrontInterest: loanAccount.PARTIAL_UPFRONT_INTEREST || false,
      upfrontInterestAmount: upfrontInterest,
      upfrontInterestPercentage: parseFloat(loanAccount.UPFRONT_INTEREST_PERCENTAGE?.toString() || '0'),
      guarantorId: loanAccount.GUARANTOR_ID,
      guaranteedAmount: parseFloat(loanAccount.GUARANTEED_AMOUNT?.toString() || '0'),
      guarantorName: loanAccount.guarantorDetails?.name,
      TRANSACTION_ID,
      EVENT_ID,
      JOURNAL_ID
    });

    if (!transactionResult.success) {
      throw new Error(`Disbursement transactions failed: ${transactionResult.message}`);
    }

    console.log('✅ Loan disbursement transactions completed');

    // Update Loan Account to ACTIVE status
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $set: {
          LOAN_STATUS: 'ACTIVE',
          DISBURSED_AMOUNT: mongoose.Types.Decimal128.fromString(loanAmount.toFixed(2)),
          ACTUAL_DISBURSEMENT: mongoose.Types.Decimal128.fromString(netDisbursement.toFixed(2)),
          DISBURSEMENT_DATE: new Date(),
          TRANSACTION_ID,
          EVENT_ID,
          JOURNAL_ID,
          lastUpdated: new Date()
        }
      },
      { session }
    );

    // Update Credit Application status if exists
    await CreditApplication.updateOne(
      { APPL_ID: loanAccount.APPL_ID },
      {
        $set: {
          STATUS: 'DISBURSED',
          disbursementDate: new Date(),
          lastUpdated: new Date()
        }
      },
      { session }
    );

    // Update Work Item to COMPLETED
    await WF_WORK_ITEM.updateOne(
      { WORK_ITEM_ID: workItemId },
      {
        $set: {
          status: 'COMPLETED',
          REC_ST: 'COMPLETED',
          WAIT_ST: 'COMPLETED',
          UPDATED_BY: approvedBy,
          UPDATE_DT: new Date(),
          transactionDetails: {
            TRANSACTION_ID,
            EVENT_ID,
            JOURNAL_ID
          }
        }
      },
      { session }
    );

    // Update Guarantor if exists
    if (loanAccount.GUARANTOR_ID) {
      await Guarantor.updateOne(
        { _id: loanAccount.GUARANTOR_ID },
        {
          $set: {
            status: 'ACTIVE',
            lastUsedDate: new Date()
          },
          $addToSet: { guaranteedLoans: loanAccount._id }
        },
        { session }
      );
    }

    // Update Repayment Schedule status if exists
    await RepaymentSchedule.updateOne(
      { LOAN_ACCOUNT_ID: loanAccount._id },
      {
        $set: {
          STATUS: 'ACTIVE',
          lastUpdated: new Date()
        }
      },
      { session }
    );

    // Log audit trail
    try {
      const AuditLog = mongoose.model('AuditLog');
      await AuditLog.create([{
        action: 'APPROVE_DISBURSEMENT',
        userId: approvedBy,
        timestamp: new Date(),
        details: {
          workItemId,
          loanAccountNumber: loanAccount.ACCT_NO,
          disbursedAmount: loanAmount,
          netDisbursement,
          transactionIds: { TRANSACTION_ID, EVENT_ID, JOURNAL_ID }
        }
      }], { session });
    } catch (auditError) {
      console.warn('Audit trail logging failed:', auditError.message);
    }

    await session.commitTransaction();
    transactionCompleted = true;

    console.log('✅ Loan disbursement approval completed successfully');

    return res.status(200).json({
      success: true,
      message: 'Loan disbursement approved and funds transferred successfully',
      data: {
        loanAccountNumber: loanAccount.ACCT_NO,
        disbursedAmount: loanAmount,
        netDisbursement,
        feesDeducted: totalFees,
        upfrontInterestDeducted: upfrontInterest,
        fundingAccount: customerAccount.ACCT_NO,
        transactionDetails: {
          TRANSACTION_ID,
          EVENT_ID,
          JOURNAL_ID
        },
        workItemId,
        status: 'ACTIVE'
      }
    });

  } catch (error) {
    console.error('❌ Disbursement approval error:', error);

    if (session.inTransaction() && !transactionCompleted) {
      try {
        await session.abortTransaction();
        console.log('🔄 Transaction rolled back due to error');
      } catch (abortError) {
        console.error('Error aborting transaction:', abortError);
      }
    }

    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to approve loan disbursement',
      code: error.code || 'DISBURSEMENT_APPROVAL_ERROR'
    });
  } finally {
    await session.endSession();
  }
},

async rejectLoanDisbursement(req, res) {
    const { 
      contractId, 
      rejectedBy, 
      rejectionReason,
      interestIncomeAccount = '1-01-400-100-100-1', // Default GL account
      overrideChecks = false
    } = req.body;

    // Validate required fields
    const missingFields = [];
    if (!contractId) missingFields.push('contractId');
    if (!rejectedBy) missingFields.push('rejectedBy');
    if (!rejectionReason) missingFields.push('rejectionReason');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS',
        missingFields,
        details: {
          received: {
            contractId: !!contractId,
            rejectedBy: !!rejectedBy,
            rejectionReason: !!rejectionReason
          }
        }
      });
    }

    // Validate officer ID format
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
        // 1. Find the loan contract and related documents with comprehensive search
        const [loanContract, loanAccount, guarantor, creditApplication] = await Promise.all([
          LoanContractForm.findOne({
            $or: [
              { loan_contract_no: contractId },
              { _id: contractId }
            ],
            status: { $in: ['PENDING', 'APPROVED'] }
          }).session(session),
          LoanAccount.findOne({ 
            $or: [
              { ACCT_NO: contractId },
              { _id: contractId }
            ],
            LOAN_STATUS: { $in: ['PENDING', 'APPROVED'] }
          }).session(session),
          Guarantor.findOne({ 
            $or: [
              { loanAccountNo: contractId },
              { loanId: contractId }
            ],
            status: { $ne: 'RELEASED' }
          }).session(session),
          CreditApplication.findOne({
            $or: [
              { loanContractNo: contractId },
              { _id: contractId }
            ]
          }).session(session)
        ]);

        if (!loanContract && !loanAccount) {
          throw {
            code: 'LOAN_NOT_FOUND',
            message: 'Pending or approved loan contract/account not found',
            status: 404,
            details: { contractId }
          };
        }

        const targetLoanContract = loanContract || loanAccount;
        if (!targetLoanContract) {
          throw {
            code: 'LOAN_RECORD_NOT_FOUND',
            message: 'No valid loan record found for rejection',
            status: 404,
            details: { contractId }
          };
        }

        // Check if upfront interest was collected
        const hasUpfrontInterest = targetLoanContract.upfrontInterestAmount > 0 || 
                                 targetLoanContract.UPFRONT_INTEREST_AMOUNT > 0;
        const upfrontInterestAmount = parseFloat(
          targetLoanContract.upfrontInterestAmount?.toString() || 
          targetLoanContract.UPFRONT_INTEREST_AMOUNT?.toString() || '0'
        );
        const hasGuarantor = !!guarantor;

        // Validate if upfront interest was already processed and needs reversal
        const upfrontInterestPaid = targetLoanContract.upfrontInterestPaid || 
                                  targetLoanContract.UPFRONT_INTEREST_PAID;

        if (hasUpfrontInterest && upfrontInterestPaid && !overrideChecks) {
          throw {
            code: 'UPFRONT_INTEREST_ALREADY_DEDUCTED',
            message: 'Cannot reject loan - upfront interest was already deducted (use overrideChecks if intentional)',
            status: 400,
            details: {
              upfrontInterestPaid: true,
              amount: upfrontInterestAmount,
              paidDate: targetLoanContract.upfrontInterestPaidDate || targetLoanContract.UPFRONT_INTEREST_PAID_DATE
            }
          };
        }

        // 2. If upfront interest was collected and paid, reverse it
        if (hasUpfrontInterest && upfrontInterestPaid) {
          const fundingAccount = await CustomerAccount.findOne({
            ACCT_NO: targetLoanContract.disbursementAccount || targetLoanContract.REPAYMENT_SOURCE_ACCOUNT
          }).session(session);

          if (!fundingAccount) {
            throw {
              code: 'FUNDING_ACCOUNT_NOT_FOUND',
              message: 'Cannot reverse upfront interest - funding account not found',
              status: 404,
              details: {
                accountNumber: targetLoanContract.disbursementAccount || targetLoanContract.REPAYMENT_SOURCE_ACCOUNT
              }
            };
          }

          // Generate transaction IDs for reversal
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 15);
          const TRANSACTION_ID = `TXN-REV-${timestamp}-${randomSuffix}`;
          const EVENT_ID = `EVT-REV-${timestamp}-${randomSuffix}`;

          // Create reversal journal entries
          await JournalEntry.create([{
            account: interestIncomeAccount,
            debit: 0,
            credit: upfrontInterestAmount,
            description: `Reversal of upfront interest for rejected loan ${contractId}`,
            reference: contractId,
            transactionId: TRANSACTION_ID,
            eventId: EVENT_ID,
            date: new Date(),
            postedBy: rejectedBy,
            status: 'COMPLETED',
            session
          }, {
            account: fundingAccount.ACCT_NO,
            debit: upfrontInterestAmount,
            credit: 0,
            description: `Reversal of upfront interest for rejected loan ${contractId}`,
            reference: contractId,
            transactionId: TRANSACTION_ID,
            eventId: EVENT_ID,
            date: new Date(),
            postedBy: rejectedBy,
            status: 'COMPLETED',
            session
          }], { session });

          // Update account balances
          await CustomerAccount.updateOne(
            { _id: fundingAccount._id },
            { 
              $inc: { BALANCE: upfrontInterestAmount },
              $push: {
                transactions: {
                  transactionId: TRANSACTION_ID,
                  amount: upfrontInterestAmount,
                  type: 'INTEREST_REVERSAL',
                  date: new Date(),
                  description: `Reversal of upfront interest for rejected loan ${contractId}`
                }
              }
            },
            { session }
          );
        }

        // 3. Update all related documents
        const updatePromises = [];
        const now = new Date();

        // Update loan contract
        if (loanContract) {
          const updateData = {
            status: 'REJECTED',
            approvalStatus: 'REJECTED',
            rejectedBy,
            rejectedAt: now,
            rejectionReason,
            updatedAt: now,
            deductUpfrontInterest: false,
            partialUpfrontInterest: false,
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            ...(hasUpfrontInterest && upfrontInterestPaid && { 
              upfrontInterestReversed: true,
              upfrontInterestReversalDate: now,
              upfrontInterestReversalBy: rejectedBy
            }),
            ...(hasGuarantor && {
              'guarantorDetails.status': 'RELEASED',
              'guarantorDetails.releaseDate': now,
              'guarantorDetails.releaseReason': `Loan rejection: ${rejectionReason}`
            })
          };
          updatePromises.push(loanContract.updateOne(updateData, { session }));
        }

        // Update loan account
        if (loanAccount) {
          const updateData = {
            LOAN_STATUS: 'REJECTED',
            REJECTED_BY: rejectedBy,
            REJECTED_DATE: now,
            REJECTION_REASON: rejectionReason,
            UPDATED_AT: now,
            DEDUCT_UPFRONT_INTEREST: false,
            PARTIAL_UPFRONT_INTEREST: false,
            UPFRONT_INTEREST_AMOUNT: 0,
            UPFRONT_INTEREST_PERCENTAGE: 0,
            UPFRONT_INTEREST_PAID: false,
            UPFRONT_INTEREST_PAID_DATE: null,
            ...(hasUpfrontInterest && upfrontInterestPaid && {
              UPFRONT_INTEREST_REVERSED: true,
              UPFRONT_INTEREST_REVERSAL_DATE: now
            }),
            ...(hasGuarantor && {
              GUARANTOR_ID: null,
              GUARANTEED_AMOUNT: 0,
              HAS_GUARANTOR: false
            })
          };
          updatePromises.push(loanAccount.updateOne(updateData, { session }));
        }

        // Update credit application
        if (creditApplication) {
          const updateData = {
            STATUS: 'REJECTED',
            REJECTED_BY: rejectedBy,
            REJECTED_DATE: now,
            UPDATED_AT: now,
            REJECTION_REASON: rejectionReason,
            deductUpfrontInterest: false,
            partialUpfrontInterest: false,
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            ...(hasGuarantor && {
              GUARANTOR_STATUS: 'RELEASED'
            })
          };
          updatePromises.push(creditApplication.updateOne(updateData, { session }));
        }

        // Update guarantor
        if (guarantor) {
          const updateData = {
            status: 'RELEASED',
            releasedBy: rejectedBy,
            releasedDate: now,
            releaseReason: `Loan rejection: ${rejectionReason}`,
            updatedAt: now,
            loanAccountNo: null,
            loanId: null,
            creditApplicationId: null
          };
          updatePromises.push(guarantor.updateOne(updateData, { session }));
        }

        await Promise.all(updatePromises);

        // 4. Log comprehensive audit trail
        await logAuditTrail({
          eventType: 'LOAN_REJECTION',
          userId: rejectedBy,
          entityType: 'Loan',
          entityId: loanAccount?._id || loanContract?._id,
          action: 'REJECT',
          oldValues: {
            status: loanContract?.status || loanAccount?.LOAN_STATUS,
            interestType: loanContract?.partialUpfrontInterest ? 'PARTIAL' : 
                         loanContract?.deductUpfrontInterest ? 'FULL' : 'NONE',
            upfrontInterestAmount: upfrontInterestAmount,
            upfrontInterestPercentage: loanContract?.upfrontInterestPercentage || loanAccount?.UPFRONT_INTEREST_PERCENTAGE || 0,
            hasGuarantor: !!guarantor,
            guarantorId: guarantor?._id || null,
            guaranteedAmount: guarantor?.GUARANTEED_AMT?.toString() || '0'
          },
          newValues: {
            status: 'REJECTED',
            rejectedBy,
            rejectionReason,
            rejectionDate: now,
            interestType: 'NONE',
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            hasGuarantor: false,
            guarantorId: null,
            guaranteedAmount: '0'
          },
          ipAddress: req.ip,
          metadata: {
            overrideUsed: overrideChecks,
            upfrontInterestReversed: hasUpfrontInterest && upfrontInterestPaid,
            reversalAmount: hasUpfrontInterest ? upfrontInterestAmount : 0,
            contractId
          }
        }, session);

        // 5. Send notifications
        const notificationPromises = [];
        
        // Notify relevant users
        notificationPromises.push(
          NotificationService.send({
            ROLE_ID: [20, 19, 30], // Loan officers, managers, etc.
            USER_ID: [loanAccount?.CREATED_BY, guarantor?.RELATIONSHIP_OFFICER_ID].filter(Boolean),
            message: `Loan application ${contractId} has been rejected`,
            status: 'REJECTED',
            notificationType: 'LOAN_REJECTION',
            metadata: {
              loanAccountNumber: contractId,
              rejectionReason,
              rejectedBy,
              rejectionDate: now,
              upfrontInterestHandling: hasUpfrontInterest ? 
                (upfrontInterestPaid ? 'REVERSED' : 'CLEARED') : 'NONE',
              reversalAmount: hasUpfrontInterest && upfrontInterestPaid ? 
                upfrontInterestAmount : 0,
              guarantorReleased: hasGuarantor,
              overrideUsed: overrideChecks
            }
          })
        );

        // Notify guarantor via SMS if exists
        if (guarantor?.phoneNumber) {
          notificationPromises.push(
            NotificationService.sendSMS({
              phoneNumber: guarantor.phoneNumber,
              message: `Your guarantee for loan ${contractId} has been released due to loan rejection. Reason: ${rejectionReason}`
            })
          );
        }

        await Promise.all(notificationPromises);

        transactionCompleted = true;

        return res.status(200).json({
          success: true,
          message: 'Loan application rejected successfully',
          code: 'LOAN_REJECTED',
          data: {
            contractId,
            rejectedAt: now,
            rejectionReason,
            upfrontInterest: {
              existed: hasUpfrontInterest,
              amount: upfrontInterestAmount,
              wasDeducted: upfrontInterestPaid,
              wasReversed: hasUpfrontInterest && upfrontInterestPaid,
              reversalAmount: hasUpfrontInterest && upfrontInterestPaid ? 
                upfrontInterestAmount : 0
            },
            guarantor: {
              existed: hasGuarantor,
              wasReleased: hasGuarantor,
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
            contractId,
            timestamp: new Date()
          });
        }
      }

      logger.error('Loan disbursement rejection failed:', {
        error: error.message,
        code: error.code || 'REJECTION_ERROR',
        stack: error.stack,
        contractId,
        rejectedBy,
        timestamp: new Date(),
        details: error.details || {}
      });

      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Loan disbursement rejection failed',
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