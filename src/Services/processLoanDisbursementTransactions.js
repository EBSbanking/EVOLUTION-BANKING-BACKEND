import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import GLAccount from '../models/GLAccount.js';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanProduct from '../models/LoanProduct.js';
import LoanInterestRate from '../models/LoanInterestRate.js'; // ADD THIS IMPORT
import Guarantor from '../models/Guarantor.js';
import mongoose from 'mongoose';
import { generateTransactionId } from '../utils/generateLoanAccountId.js';

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
  // Extract GL accounts from product configuration
  const glAccounts = {
    // Loan GL Account - this is the main one
    loanGLAccount: loanProduct.defaultGLAccounts?.loanGLAccount || '01002001012001',
    
    // Interest GL Account
    interestGLAccountNo: loanProduct.defaultGLAccounts?.interestGLAccountNo || '01001301304001',
    
    // Fee GL Account - check processingFeeGLCode first, then defaultGLAccounts
    feeGLAccountNo: loanProduct.processingFeeGLCode ||
                   loanProduct.defaultGLAccounts?.processingFeeGLCode ||
                   loanProduct.defaultGLAccounts?.feeGLAccountNo || 
                   '500100',
    
    // Additional GL accounts
    interestPayableGLAccountNo: loanProduct.defaultGLAccounts?.interestPayableGLAccountNo || '01001101111001',
    principalGLAccountNo: loanProduct.defaultGLAccounts?.principalGLAccountNo || '01002001012001',
    withholdingTaxGLAccountNo: loanProduct.defaultGLAccounts?.withholdingTaxGLAccountNo || '',
    interestIncomeGLAccountNo: loanProduct.defaultGLAccounts?.interestIncomeGLAccountNo || '',
    interestReceivableGLAccountNo: loanProduct.defaultGLAccounts?.interestReceivableGLAccountNo || ''
  };

  console.log('Extracted GL accounts for product:', {
    productCode: loanProduct.productCode,
    PROD_ID: loanProduct.PROD_ID,
    glAccounts
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
 * Helper function to safely convert values to Decimal128
 */
function toDecimal128(value) {
  if (!value && value !== 0) return mongoose.Types.Decimal128.fromString('0.00');
  try {
    return mongoose.Types.Decimal128.fromString(value.toString());
  } catch (error) {
    console.warn('Error converting to Decimal128:', error.message, { value });
    return mongoose.Types.Decimal128.fromString('0.00');
  }
}

/**
 * Helper function to ensure loanAccount is a Mongoose document
 */
async function ensureLoanAccountIsDocument(loanAccount, loanId, session) {
  // If loanAccount is already a Mongoose document, return it
  if (loanAccount instanceof mongoose.Document) {
    console.log('Loan account is already a Mongoose document');
    return loanAccount;
  }
  
  // If loanAccount has an _id, fetch the document from database
  if (loanAccount._id) {
    console.log('Fetching loan account document from database by _id');
    const freshLoan = await LoanAccount.findById(loanAccount._id).session(session);
    if (freshLoan) {
      // Copy properties from the plain object to the document
      Object.keys(loanAccount).forEach(key => {
        if (key !== '_id' && key !== '__v' && key !== 'id') {
          freshLoan[key] = loanAccount[key];
        }
      });
      return freshLoan;
    }
  }
  
  // If we have a loanId, fetch by that
  if (loanId) {
    console.log('Fetching loan account document from database by loanId');
    const freshLoan = await LoanAccount.findOne({ _id: loanId }).session(session);
    if (freshLoan) {
      return freshLoan;
    }
  }
  
  // Last resort: create a new document instance
  console.log('Creating new LoanAccount document instance');
  return new LoanAccount(loanAccount);
}

/**
 * Helper function to handle guarantor ID processing
 */
async function processGuarantorId(guarantorId, loanDoc, guaranteedAmount, guarantorName, session) {
  if (!guarantorId) return null;
  
  console.log('Processing guarantor ID:', {
    guarantorId,
    type: typeof guarantorId,
    isString: typeof guarantorId === 'string',
    isValidObjectId: mongoose.Types.ObjectId.isValid(guarantorId)
  });
  
  try {
    let guarantorDoc = null;
    
    // Try to find guarantor by different methods
    if (mongoose.Types.ObjectId.isValid(guarantorId)) {
      // If it's a valid ObjectId, find by _id
      guarantorDoc = await Guarantor.findById(guarantorId).session(session);
    } else {
      // If it's a string (likely GUARANTOR_ID like "1000006"), find by GUARANTOR_ID
      const guarantorIdStr = String(guarantorId);
      
      // Try with padding to 7 digits
      const paddedId = guarantorIdStr.padStart(7, '0');
      guarantorDoc = await Guarantor.findOne({ 
        GUARANTOR_ID: paddedId 
      }).session(session);
      
      // If not found with padding, try without padding
      if (!guarantorDoc) {
        guarantorDoc = await Guarantor.findOne({ 
          GUARANTOR_ID: guarantorIdStr 
        }).session(session);
      }
      
      // If still not found, try by other fields
      if (!guarantorDoc) {
        // Try by phone number
        guarantorDoc = await Guarantor.findOne({ 
          phoneNumber: guarantorIdStr 
        }).session(session);
        
        if (!guarantorDoc && guarantorName) {
          // Try by name (partial match)
          guarantorDoc = await Guarantor.findOne({ 
            fullName: new RegExp(guarantorName, 'i') 
          }).session(session);
        }
      }
    }
    
    if (guarantorDoc) {
      console.log('Found guarantor document:', {
        _id: guarantorDoc._id,
        GUARANTOR_ID: guarantorDoc.GUARANTOR_ID,
        fullName: guarantorDoc.fullName
      });
      
      // Update guarantor details in loan document
      const guarantorDetails = {
        guarantorId: guarantorDoc._id, // MongoDB ObjectId
        guarantorNumberId: guarantorDoc.GUARANTOR_ID, // 7-digit string ID
        name: guarantorName || guarantorDoc.fullName || '',
        phone: guarantorDoc.phoneNumber || '',
        relationship: guarantorDoc.relationshipToBorrower || '',
        email: guarantorDoc.email || '',
        address: guarantorDoc.address || '',
        status: 'ACTIVE',
        guaranteedAmount: toDecimal128(guaranteedAmount || guarantorDoc.GUARANTEED_AMT || 0)
      };
      
      // Also update the Guarantor document to reference this loan
      try {
        if (!guarantorDoc.guaranteedLoans) {
          guarantorDoc.guaranteedLoans = [];
        }
        
        if (!guarantorDoc.guaranteedLoans.includes(loanDoc._id)) {
          guarantorDoc.guaranteedLoans.push(loanDoc._id);
          await guarantorDoc.save({ session });
          console.log('Updated guarantor document with new loan reference');
        }
      } catch (guarantorUpdateError) {
        console.warn('Could not update guarantor document:', guarantorUpdateError.message);
        // Non-critical error, continue with loan disbursement
      }
      
      return guarantorDetails;
    } else {
      // If guarantor not found, create minimal guarantor details
      console.warn(`Guarantor with ID ${guarantorId} not found in database`);
      
      return {
        guarantorNumberId: String(guarantorId).padStart(7, '0'),
        name: guarantorName || '',
        phone: '',
        relationship: '',
        status: 'PENDING',
        guaranteedAmount: toDecimal128(guaranteedAmount)
        // Note: No guarantorId field since we don't have a valid ObjectId
      };
    }
    
  } catch (error) {
    console.error('Error processing guarantor:', error.message);
    
    // Return minimal guarantor details on error
    return {
      guarantorNumberId: String(guarantorId).padStart(7, '0'),
      name: guarantorName || '',
      status: 'PENDING',
      guaranteedAmount: toDecimal128(guaranteedAmount)
    };
  }
}

/**
 * Main loan disbursement transaction processing
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
  INTEREST_RATE, // This parameter will be IGNORED
  PRODUCT_TYPE,
  productId,
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
  transactionReferences = {},
  branchId
}) {
  if (!session) throw new Error('Database session is required');
  if (!loanAccount) throw new Error('Loan account is required');
  if (!customerAccount) throw new Error('Customer account is required');
  if (!fundingAcctNo || !ACCT_NO) throw new Error('Account numbers are required');
  if (!CREATED_BY) throw new Error('Creator identification is required');
  if (!productId) throw new Error('Product ID is required to fetch GL accounts');

  console.log('=== STARTING LOAN DISBURSEMENT PROCESS ===');
  console.log('Loan Interest Rate ID (LOAN_PROUD_INT_ID):', loanAccount.LOAN_INTEREST_RATE_ID);

  // Generate IDs if not provided
  if (!TRANSACTION_ID || !EVENT_ID || !JOURNAL_ID) {
    const ids = generateTransactionId();
    TRANSACTION_ID = ids.TRANSACTION_ID;
    EVENT_ID = ids.EVENT_ID;
    JOURNAL_ID = ids.JOURNAL_ID;
  }

  // Generate transaction references
  const timestamp = Date.now();
  const refs = {
    main: `DISP-${timestamp}`,
    fee: `FEE-${timestamp}`,
    interest: `INT-${timestamp}`,
    batch: `BATCH-${timestamp}`
  };

  // Fetch GL accounts dynamically from product
  const { 
    loanGLAccount, 
    interestGLAccountNo, 
    feeGLAccountNo,
    productDetails 
  } = await getGLAccountsFromProduct(productId, session);

  console.log('Using GL accounts for disbursement:', {
    loanGLAccount,
    interestGLAccountNo,
    feeGLAccountNo,
    productCode: productDetails.productCode
  });

  const disbursementAmount = Number(AMOUNT);
  const feeAmount = Number(loanFeeAmount);
  upfrontInterestAmount = Number(upfrontInterestAmount);
  
  // IGNORE the INTEREST_RATE parameter - we'll use LoanInterestRate.ANNUAL_PERCENTAGE_RATE
  console.log('\n=== IGNORING DISBURSEMENT INTEREST RATE PARAMETER ===');
  console.log('Parameter INTEREST_RATE:', INTEREST_RATE, '(will be ignored)');
  
  const transactionDate = new Date(DISBURSEMENT_DATE);
  
  // Calculate net amount customer receives
  const netDisbursement = disbursementAmount - feeAmount - upfrontInterestAmount;

  if (netDisbursement <= 0) {
    throw new Error('Net disbursement amount must be greater than zero after fees and upfront interest');
  }

  console.log('Processing disbursement:', {
    loanAmount: disbursementAmount,
    fees: feeAmount,
    upfrontInterest: upfrontInterestAmount,
    netToCustomer: netDisbursement
  });

  // ============================================
  // 1. ENSURE loanAccount IS A MONGOOSE DOCUMENT
  // ============================================
  let loanDoc = await ensureLoanAccountIsDocument(loanAccount, loanAccount._id, session);
  
  console.log('\n=== LOAN ACCOUNT DETAILS ===');
  console.log('Document _id:', loanDoc._id);
  console.log('LOAN_INTEREST_RATE_ID:', loanDoc.LOAN_INTEREST_RATE_ID);
  console.log('Existing INTEREST_RATE:', loanDoc.INTEREST_RATE ? parseFloat(loanDoc.INTEREST_RATE.toString()) : 'N/A');

  if (!(loanDoc instanceof mongoose.Document)) {
    throw new Error('Failed to obtain a valid Mongoose document for loan account');
  }

  // ============================================
  // 2. FETCH AND USE ANNUAL_PERCENTAGE_RATE FROM LOAN_INTEREST_RATE
  // ============================================
  console.log('\n=== FETCHING ANNUAL_PERCENTAGE_RATE FROM LOAN_INTEREST_RATE ===');
  
  let loanInterestRateDetails = null;
  let finalInterestRate;
  let interestRateSource;
  let annualPercentageRate = null;

  if (loanDoc.LOAN_INTEREST_RATE_ID) {
    try {
      // Fetch LoanInterestRate by LOAN_PROUD_INT_ID
      const loanInterestRate = await LoanInterestRate.findOne({
        LOAN_PROUD_INT_ID: parseInt(loanDoc.LOAN_INTEREST_RATE_ID),
        STATUS: 'ACTIVE'
      }).session(session);
      
      if (loanInterestRate) {
        loanInterestRateDetails = {
          LOAN_PROUD_INT_ID: loanInterestRate.LOAN_PROUD_INT_ID,
          name: loanInterestRate.name,
          code: loanInterestRate.code,
          RATE_TYPE: loanInterestRate.RATE_TYPE,
          INTEREST_TYPE: loanInterestRate.INTEREST_TYPE,
          CALCULATION_METHOD: loanInterestRate.CALCULATION_METHOD,
          DEFAULT_RATE_PER_MONTH: loanInterestRate.DEFAULT_RATE_PER_MONTH,
          ANNUAL_PERCENTAGE_RATE: loanInterestRate.ANNUAL_PERCENTAGE_RATE,
          ACCRUAL_BASIS: loanInterestRate.ACCRUAL_BASIS,
          ACCRUAL_FREQUENCY: loanInterestRate.ACCRUAL_FREQUENCY
        };
        
        console.log('Found LoanInterestRate details:', {
          LOAN_PROUD_INT_ID: loanInterestRateDetails.LOAN_PROUD_INT_ID,
          name: loanInterestRateDetails.name,
          ANNUAL_PERCENTAGE_RATE: loanInterestRateDetails.ANNUAL_PERCENTAGE_RATE,
          DEFAULT_RATE_PER_MONTH: loanInterestRateDetails.DEFAULT_RATE_PER_MONTH,
          CALCULATION_METHOD: loanInterestRateDetails.CALCULATION_METHOD
        });
        
        // USE ANNUAL_PERCENTAGE_RATE as the final interest rate
        if (loanInterestRate.ANNUAL_PERCENTAGE_RATE !== undefined && 
            loanInterestRate.ANNUAL_PERCENTAGE_RATE !== null) {
          
          annualPercentageRate = parseFloat(loanInterestRate.ANNUAL_PERCENTAGE_RATE);
          
          if (!isNaN(annualPercentageRate) && annualPercentageRate > 0) {
            finalInterestRate = toDecimal128(annualPercentageRate);
            interestRateSource = 'LOAN_INTEREST_RATE_ANNUAL';
            
            console.log(`✓ USING ANNUAL_PERCENTAGE_RATE from LoanInterestRate: ${annualPercentageRate}%`);
            
            // Log what we're ignoring
            const existingLoanAccountRate = loanDoc.INTEREST_RATE ? 
              parseFloat(loanDoc.INTEREST_RATE.toString()) : null;
            
            if (existingLoanAccountRate && Math.abs(existingLoanAccountRate - annualPercentageRate) > 0.1) {
              console.warn(`⚠️ OVERRIDING loan account rate of ${existingLoanAccountRate}%`);
            }
            
            if (INTEREST_RATE && parseFloat(INTEREST_RATE) && 
                Math.abs(parseFloat(INTEREST_RATE) - annualPercentageRate) > 0.1) {
              console.warn(`⚠️ IGNORING disbursement parameter rate of ${parseFloat(INTEREST_RATE)}%`);
            }
            
          } else {
            throw new Error(`Invalid ANNUAL_PERCENTAGE_RATE in LoanInterestRate: ${loanInterestRate.ANNUAL_PERCENTAGE_RATE}`);
          }
        } else {
          throw new Error('ANNUAL_PERCENTAGE_RATE not found in LoanInterestRate configuration');
        }
      } else {
        throw new Error(`LoanInterestRate with LOAN_PROUD_INT_ID ${loanDoc.LOAN_INTEREST_RATE_ID} not found or not active`);
      }
    } catch (error) {
      console.error('❌ Error fetching/using LoanInterestRate:', error.message);
      throw new Error(`Failed to get interest rate from LoanInterestRate: ${error.message}`);
    }
  } else {
    // If no LOAN_INTEREST_RATE_ID, look for default LoanInterestRate
    console.log('No LOAN_INTEREST_RATE_ID found, looking for default LoanInterestRate...');
    
    try {
      const defaultLoanInterestRate = await LoanInterestRate.findOne({
        IS_DEFAULT: true,
        STATUS: 'ACTIVE'
      }).session(session);
      
      if (defaultLoanInterestRate && defaultLoanInterestRate.ANNUAL_PERCENTAGE_RATE) {
        annualPercentageRate = parseFloat(defaultLoanInterestRate.ANNUAL_PERCENTAGE_RATE);
        finalInterestRate = toDecimal128(annualPercentageRate);
        interestRateSource = 'DEFAULT_LOAN_INTEREST_RATE_ANNUAL';
        
        console.log(`✓ Using default LoanInterestRate ANNUAL_PERCENTAGE_RATE: ${annualPercentageRate}%`);
        console.log(`Default LoanInterestRate LOAN_PROUD_INT_ID: ${defaultLoanInterestRate.LOAN_PROUD_INT_ID}`);
      } else {
        throw new Error('No default LoanInterestRate found with ANNUAL_PERCENTAGE_RATE');
      }
    } catch (error) {
      console.error('❌ Error fetching default LoanInterestRate:', error.message);
      throw new Error(`No interest rate configuration found: ${error.message}`);
    }
  }

  // ============================================
  // 3. PROCESS GUARANTOR DETAILS
  // ============================================
  let guarantorDetails = null;
  if (guarantorId) {
    guarantorDetails = await processGuarantorId(
      guarantorId, 
      loanDoc, 
      guaranteedAmount, 
      guarantorName, 
      session
    );
  }

  // ============================================
  // 4. UPDATE LOAN ACCOUNT DOCUMENT WITH CORRECT RATE
  // ============================================
  console.log('\n=== UPDATING LOAN ACCOUNT WITH ANNUAL_PERCENTAGE_RATE ===');
  console.log(`Setting interest rate to: ${annualPercentageRate}%`);
  
  loanDoc.LOAN_STATUS = 'ACTIVE';
  loanDoc.ACTUAL_DISBURSEMENT = toDecimal128(netDisbursement);
  loanDoc.DISBURSEMENT_DATE = transactionDate;
  loanDoc.OUTSTANDING_PRINCIPAL = toDecimal128(disbursementAmount);
  loanDoc.outstanding_balance = toDecimal128(disbursementAmount);
  loanDoc.START_DT = transactionDate;
  loanDoc.INTEREST_RATE = finalInterestRate; // Set from ANNUAL_PERCENTAGE_RATE
  
  // Store LoanInterestRate details
  if (loanInterestRateDetails) {
    loanDoc.loanInterestRateDetails = loanInterestRateDetails;
  }
  
  // Store interest rate source info
  loanDoc.interestRateSource = interestRateSource;
  
  // Calculate next payment date
  const nextPaymentDate = new Date(transactionDate);
  if (loanDoc.PAYMENT_FREQUENCY === 'MONTHLY') {
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  } else if (loanDoc.PAYMENT_FREQUENCY === 'WEEKLY') {
    nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
  } else if (loanDoc.PAYMENT_FREQUENCY === 'DAILY') {
    nextPaymentDate.setDate(nextPaymentDate.getDate() + 1);
  } else {
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  }
  loanDoc.NEXT_PAYMENT_DATE = nextPaymentDate;
  
  // Update other fields
  loanDoc.PRIMARY_OFFICER_ID = loanDoc.PRIMARY_OFFICER_ID || CREATED_BY;
  loanDoc.JOURNAL_ID = JOURNAL_ID;
  loanDoc.TRANSACTION_ID = TRANSACTION_ID;
  loanDoc.EVENT_ID = EVENT_ID;
  
  // Update upfront interest if applicable
  if (upfrontInterestAmount > 0) {
    loanDoc.upfrontInterestDeducted = true;
    loanDoc.upfrontInterestAmount = toDecimal128(upfrontInterestAmount);
    loanDoc.deductUpfrontInterest = deductUpfrontInterest;
    loanDoc.partialUpfrontInterest = partialUpfrontInterest;
    if (partialUpfrontInterest) {
      loanDoc.upfrontInterestPercentage = toDecimal128(upfrontInterestPercentage);
    }
  }
  
  // Update guarantor details if provided
  if (guarantorDetails) {
    loanDoc.HAS_GUARANTOR = true;
    loanDoc.guarantorDetails = {
      ...loanDoc.guarantorDetails,
      ...guarantorDetails
    };
  }
  
  // Save GL accounts used
  loanDoc.FEE_DETAILS = {
    ...loanDoc.FEE_DETAILS,
    processingFee: toDecimal128(feeAmount),
    totalFees: toDecimal128(feeAmount),
    upfrontInterest: toDecimal128(upfrontInterestAmount),
    upfrontInterestPercentage: toDecimal128(upfrontInterestPercentage)
  };

  console.log('Saving loan account with ANNUAL_PERCENTAGE_RATE...');
  
  try {
    await loanDoc.save({ session });
    console.log('✅ Loan account updated successfully');
    console.log(`✅ Final interest rate: ${annualPercentageRate}% (from ANNUAL_PERCENTAGE_RATE)`);
  } catch (saveError) {
    console.error('❌ Error saving loan account:', saveError.message);
    console.error('Save error stack:', saveError.stack);
    
    // Try alternative save method
    try {
      console.log('Trying alternative save method using findByIdAndUpdate...');
      
      const updateData = {
        LOAN_STATUS: 'ACTIVE',
        ACTUAL_DISBURSEMENT: toDecimal128(netDisbursement),
        DISBURSEMENT_DATE: transactionDate,
        OUTSTANDING_PRINCIPAL: toDecimal128(disbursementAmount),
        outstanding_balance: toDecimal128(disbursementAmount),
        START_DT: transactionDate,
        NEXT_PAYMENT_DATE: nextPaymentDate,
        INTEREST_RATE: finalInterestRate, // From ANNUAL_PERCENTAGE_RATE
        PRIMARY_OFFICER_ID: loanDoc.PRIMARY_OFFICER_ID || CREATED_BY,
        JOURNAL_ID,
        TRANSACTION_ID,
        EVENT_ID,
        interestRateSource,
        ...(loanInterestRateDetails && { loanInterestRateDetails }),
        ...(upfrontInterestAmount > 0 && {
          upfrontInterestDeducted: true,
          upfrontInterestAmount: toDecimal128(upfrontInterestAmount),
          deductUpfrontInterest,
          partialUpfrontInterest,
          ...(partialUpfrontInterest && { upfrontInterestPercentage: toDecimal128(upfrontInterestPercentage) })
        }),
        'FEE_DETAILS.processingFee': toDecimal128(feeAmount),
        'FEE_DETAILS.totalFees': toDecimal128(feeAmount),
        'FEE_DETAILS.upfrontInterest': toDecimal128(upfrontInterestAmount),
        'FEE_DETAILS.upfrontInterestPercentage': toDecimal128(upfrontInterestPercentage),
        lastUpdated: new Date()
      };
      
      // Add guarantor details safely
      if (guarantorDetails) {
        updateData.HAS_GUARANTOR = true;
        
        if (guarantorDetails.guarantorNumberId) {
          updateData['guarantorDetails.guarantorNumberId'] = guarantorDetails.guarantorNumberId;
        }
        if (guarantorDetails.name) {
          updateData['guarantorDetails.name'] = guarantorDetails.name;
        }
        if (guarantorDetails.phone) {
          updateData['guarantorDetails.phone'] = guarantorDetails.phone;
        }
        if (guarantorDetails.relationship) {
          updateData['guarantorDetails.relationship'] = guarantorDetails.relationship;
        }
        if (guarantorDetails.email) {
          updateData['guarantorDetails.email'] = guarantorDetails.email;
        }
        if (guarantorDetails.address) {
          updateData['guarantorDetails.address'] = guarantorDetails.address;
        }
        if (guarantorDetails.status) {
          updateData['guarantorDetails.status'] = guarantorDetails.status;
        }
        if (guarantorDetails.guaranteedAmount) {
          updateData['guarantorDetails.guaranteedAmount'] = guarantorDetails.guaranteedAmount;
        }
        
        if (guarantorDetails.guarantorId && mongoose.Types.ObjectId.isValid(guarantorDetails.guarantorId)) {
          updateData['guarantorDetails.guarantorId'] = guarantorDetails.guarantorId;
        }
      }
      
      await LoanAccount.findByIdAndUpdate(
        loanDoc._id,
        updateData,
        { session, new: true }
      );
      console.log('✅ Loan account updated via findByIdAndUpdate');
    } catch (updateError) {
      console.error('❌ Both save methods failed:', updateError.message);
      throw new Error(`Failed to save loan account: ${updateError.message}`);
    }
  }

  // ============================================
  // CREATE TRANSACTIONS WITH PROPER FIELD NAMES
  // ============================================
  const transactionsToCreate = [];

  // Helper function to ensure field names match Transaction schema
  const createTransactionData = (baseData) => ({
    TRANSACTION_ID: Number(baseData.TRANSACTION_ID || TRANSACTION_ID),
    EVENT_ID: Number(baseData.EVENT_ID || EVENT_ID),
    TRAN_JOURNAL_ID: baseData.TRAN_JOURNAL_ID || JOURNAL_ID,
    ACCT_NO: baseData.ACCT_NO || ACCT_NO,
    ACCT_ID: String(baseData.ACCT_ID || loanDoc._id),
    BU_ID: Number(baseData.BU_ID || loanDoc.BU_ID || branchId || 1),
    CUST_ID: String(baseData.CUST_ID || loanDoc.CUST_ID),
    ACCT_NM: baseData.ACCT_NM || loanDoc.ACCT_NM,
    AMOUNT: Number(baseData.AMOUNT || 0),
    TRANSACTIONDATE: baseData.TRANSACTIONDATE || transactionDate,
    TRANSACTION_TYPE: baseData.TRANSACTION_TYPE,
    description: baseData.description || '',
    currency: baseData.currency || productDetails.CRNCY_ID || 'NGN',
    createdBy: baseData.createdBy || CREATED_BY,
    status: baseData.status || 'COMPLETED',
    REFERENCE: baseData.REFERENCE || `TXN${Date.now()}`,
    metadata: baseData.metadata || {}
  });

  // 1. Main disbursement transaction
  transactionsToCreate.push(createTransactionData({
    TRANSACTION_ID: Number(TRANSACTION_ID),
    AMOUNT: disbursementAmount,
    TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
    description: `Loan Disbursement to ${loanDoc.ACCT_NM}`,
    REFERENCE: refs.main,
    metadata: {
      loanAccountNo: ACCT_NO,
      customerAccountNo: fundingAcctNo,
      totalLoanAmount: disbursementAmount,
      netDisbursement,
      feesDeducted: feeAmount,
      upfrontInterestDeducted: upfrontInterestAmount,
      glAccountUsed: loanGLAccount,
      transactionType: 'loan_disbursement',
      loanInterestRateId: loanDoc.LOAN_INTEREST_RATE_ID,
      // ANNUAL_PERCENTAGE_RATE info
      interestRate: {
        appliedRate: annualPercentageRate,
        rateSource: interestRateSource,
        loanProudIntId: loanInterestRateDetails?.LOAN_PROUD_INT_ID || null,
        annualPercentageRate: annualPercentageRate,
        rateType: loanInterestRateDetails?.RATE_TYPE || loanDoc.INTEREST_RATE_TYPE || 'FIXED',
        calculationMethod: loanInterestRateDetails?.CALCULATION_METHOD || loanDoc.INTEREST_CALCULATION_METHOD || 'FLAT_RATE',
        interestType: loanInterestRateDetails?.INTEREST_TYPE || 'SIMPLE',
        isTermBased: loanDoc.IS_TERM_BASED_RATE || true,
        note: `Using ANNUAL_PERCENTAGE_RATE from LoanInterestRate configuration`
      }
    }
  }));

  // 2. Fee transaction
  if (feeAmount > 0) {
    transactionsToCreate.push(createTransactionData({
      TRANSACTION_ID: Number(TRANSACTION_ID) + 1,
      AMOUNT: feeAmount,
      TRANSACTION_TYPE: 'PROCESSING_FEE',
      description: `Processing Fee for Loan ${ACCT_NO}`,
      REFERENCE: refs.fee,
      metadata: {
        loanAccountNo: ACCT_NO,
        feeType: 'PROCESSING',
        feeRate: productDetails.processingFeeRate || 'N/A',
        customerAccountNo: fundingAcctNo
      }
    }));
  }

  // 3. Interest transaction
  if (upfrontInterestAmount > 0) {
    const interestType = partialUpfrontInterest ? 'PARTIAL_UPFRONT' : 'FULL_UPFRONT';
    
    transactionsToCreate.push(createTransactionData({
      TRANSACTION_ID: Number(TRANSACTION_ID) + 2,
      AMOUNT: upfrontInterestAmount,
      TRANSACTION_TYPE: 'INTEREST',
      description: `${interestType} Interest for Loan ${ACCT_NO}`,
      REFERENCE: refs.interest,
      metadata: {
        loanAccountNo: ACCT_NO,
        interestType,
        percentage: partialUpfrontInterest ? upfrontInterestPercentage : null,
        glAccountUsed: interestGLAccountNo,
        customerAccountNo: fundingAcctNo,
        calculatedFromAnnualRate: annualPercentageRate
      }
    }));
  }

  // Save transactions
  try {
    console.log('Creating transactions...');
    await Transaction.insertMany(transactionsToCreate, { session });
    console.log('✅ Transactions created:', transactionsToCreate.length);
  } catch (error) {
    console.error('❌ Error creating transactions:', error.message);
    
    if (error.errors) {
      Object.keys(error.errors).forEach(key => {
        console.error(`Field ${key}:`, error.errors[key].message);
      });
    }
    
    throw new Error(`Transaction creation failed: ${error.message}`);
  }

  // ============================================
  // 5. UPDATE CUSTOMER ACCOUNT
  // ============================================
  try {
    let customerDoc;
    if (customerAccount instanceof mongoose.Document) {
      customerDoc = customerAccount;
    } else {
      customerDoc = await CustomerAccount.findOne({ ACCT_NO: fundingAcctNo }).session(session);
      if (!customerDoc) {
        throw new Error(`Customer account ${fundingAcctNo} not found`);
      }
    }
    
    const currentBalance = parseFloat(customerDoc.LEDGER_BALANCE?.toString() || '0');
    const newBalance = currentBalance + netDisbursement;
    
    console.log('Updating customer account:', {
      accountNo: fundingAcctNo,
      currentBalance,
      netDisbursement,
      newBalance
    });
    
    customerDoc.LEDGER_BALANCE = toDecimal128(newBalance);
    customerDoc.CLEARED_BALANCE = toDecimal128(newBalance);
    customerDoc.AVAILABLE_BALANCE = toDecimal128(newBalance);
    customerDoc.LAST_UPDATED = new Date();
    
    if (!customerDoc.transactionHistory) {
      customerDoc.transactionHistory = [];
    }
    
    customerDoc.transactionHistory.push({
      date: new Date(),
      type: 'LOAN_DISBURSEMENT',
      amount: netDisbursement,
      description: `Loan disbursement from ${ACCT_NO}`,
      reference: ACCT_NO,
      balanceAfter: newBalance
    });
    
    await customerDoc.save({ session });
    
    console.log(`✅ Customer account ${fundingAcctNo} updated. Balance change: +${netDisbursement}`);
  } catch (error) {
    console.error('❌ Error updating customer account:', error);
    throw error;
  }

  // ============================================
  // 6. UPDATE LOAN PORTFOLIO (SINGLE LOCATION)
  // ============================================
  if (LoanPortfolio && (branchId || loanDoc.BU_ID)) {
    try {
      const actualBranchId = branchId || loanDoc.BU_ID;
      const portfolioProductId = Number(productId);
      
      console.log('Updating LoanPortfolio:', {
        BRANCH_ID: actualBranchId,
        PROD_ID: portfolioProductId,
        MONTH: transactionDate.getMonth() + 1,
        YEAR: transactionDate.getFullYear(),
        productCode: productDetails.productCode
      });
      
      const updatedPortfolio = await LoanPortfolio.findOneAndUpdate(
        { 
          BRANCH_ID: actualBranchId,
          PROD_ID: portfolioProductId,
          MONTH: transactionDate.getMonth() + 1,
          YEAR: transactionDate.getFullYear()
        },
        {
          $inc: {
            TOTAL_DISBURSED: disbursementAmount,
            TOTAL_NET_DISBURSEMENT: netDisbursement,
            TOTAL_PRINCIPAL: disbursementAmount,
            OUTSTANDING_PRINCIPAL: disbursementAmount,
            TOTAL_INTEREST_RECEIVED: upfrontInterestAmount,
            TOTAL_FEES_RECEIVED: feeAmount,
            NUMBER_OF_LOANS: 1,
            ACTIVE_LOANS: 1,
            DISBURSEMENT_COUNT: 1
          },
          $setOnInsert: {
            BRANCH_ID: actualBranchId,
            PROD_ID: portfolioProductId,
            PRODUCT_CODE: productDetails.productCode,
            PRODUCT_NAME: productDetails.PRODUCT_SHORT_NAME || productDetails.name,
            PRODUCT_TYPE: productDetails.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
            MONTH: transactionDate.getMonth() + 1,
            YEAR: transactionDate.getFullYear(),
            CURRENCY: productDetails.CRNCY_ID || 'NGN',
            CREATED_DATE: new Date(),
            STATUS: 'ACTIVE',
            CREATED_BY: CREATED_BY,
            UPDATED_BY: CREATED_BY,
            YIELD_RATE: annualPercentageRate, // Use ANNUAL_PERCENTAGE_RATE
            TOTAL_INTEREST_ACCRUED: 0,
            TOTAL_REPAYMENTS: 0,
            TOTAL_RECOVERED: 0,
            TOTAL_DEFAULTS: 0,
            PORTFOLIO_AT_RISK: 0,
            PROVISION_AMOUNT: 0,
            NPL_RATIO: 0,
            COST_OF_FUNDS: 0,
            NET_INTEREST_MARGIN: annualPercentageRate, // Use ANNUAL_PERCENTAGE_RATE
            AVERAGE_LOAN_SIZE: disbursementAmount
          },
          $set: {
            UPDATED_DATE: new Date()
          }
        },
        { 
          upsert: true, 
          new: true, 
          session 
        }
      );
      
      console.log('✅ Loan portfolio updated successfully. Document ID:', updatedPortfolio?._id);
    } catch (error) {
      console.error('⚠️ Error updating loan portfolio (non-critical):', error.message);
    }
  } else {
    console.log('⚠️ LoanPortfolio update skipped:');
    if (!LoanPortfolio) console.log('  - LoanPortfolio model not available');
    if (!branchId && !loanDoc.BU_ID) console.log('  - No branch ID provided');
  }

  console.log('=== LOAN DISBURSEMENT COMPLETED SUCCESSFULLY ===');
  console.log(`=== FINAL INTEREST RATE: ${annualPercentageRate}% (Source: ${interestRateSource}) ===`);
  
  return {
    success: true,
    loanAmount: disbursementAmount,
    feeCollected: feeAmount,
    upfrontInterestCollected: upfrontInterestAmount,
    netDisbursementToCustomer: netDisbursement,
    productDetails,
    loanInterestRateDetails,
    interestRateDetails: {
      appliedRate: annualPercentageRate,
      source: interestRateSource,
      loanProudIntId: loanInterestRateDetails?.LOAN_PROUD_INT_ID || null,
      annualPercentageRate: annualPercentageRate,
      rateType: loanInterestRateDetails?.RATE_TYPE || 'FIXED',
      calculationMethod: loanInterestRateDetails?.CALCULATION_METHOD || 'FLAT_RATE',
      interestType: loanInterestRateDetails?.INTEREST_TYPE || 'SIMPLE',
      note: 'Rate from LoanInterestRate.ANNUAL_PERCENTAGE_RATE'
    },
    transactions: transactionsToCreate,
    transactionReferences: refs,
    guarantorDetails: guarantorDetails || { guarantorId, guarantorName, guaranteedAmount },
    transactionIds: {
      TRANSACTION_ID,
      EVENT_ID,
      JOURNAL_ID
    },
    accountingSummary: {
      totalLoanAmount: disbursementAmount,
      feesCollected: feeAmount,
      upfrontInterestCollected: upfrontInterestAmount,
      netToCustomer: netDisbursement,
      productCode: productDetails.productCode,
      glAccountsUsed: {
        loanPortfolio: loanGLAccount,
        interestIncome: interestGLAccountNo,
        feeIncome: feeGLAccountNo
      },
      interestRateApplied: annualPercentageRate
    }
  };
}

async function processDisbursement({
  session,
  loanContract,
  repaymentSchedule,
  loanProduct,
  totalFees,
  interestRate, // This parameter is IGNORED - we use ANNUAL_PERCENTAGE_RATE instead
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
  transactionReferences = {},
  branchId
}) {
  console.log('=== DISBURSEMENT WRAPPER - ANNUAL_PERCENTAGE_RATE WILL BE USED ===');
  console.log('Note: interestRate parameter will be ignored');
  console.log('LoanInterestRate.ANNUAL_PERCENTAGE_RATE will be used instead');
  
  // The loanContract should have LOAN_INTEREST_RATE_ID which points to LoanInterestRate
  console.log('Loan Contract Details:', {
    LOAN_INTEREST_RATE_ID: loanContract.LOAN_INTEREST_RATE_ID,
    loanAccountNumber: loanContract.loanAccountNumber,
    PROD_ID: loanProduct?.PROD_ID
  });
  
  // Validate required parameters
  if (!loanContract) {
    throw new Error('loanContract is required');
  }
  
  if (!loanProduct) {
    throw new Error('loanProduct is required');
  }
  
  if (!loanContract.loanAccountNumber) {
    throw new Error('loanAccountNumber is required in loanContract');
  }
  
  if (!loanContract.fundingAccountNumber) {
    throw new Error('fundingAccountNumber is required in loanContract');
  }
  
  if (!loanContract.loanAmount) {
    throw new Error('loanAmount is required in loanContract');
  }
  
  // IMPORTANT: We're NOT using the interestRate parameter at all
  // The processLoanDisbursementTransactions function will fetch and use
  // ANNUAL_PERCENTAGE_RATE from LoanInterestRate configuration
  
  return await processLoanDisbursementTransactions({
    session,
    loanAccount: loanContract,
    customerAccount: loanContract.customerAccount,
    AMOUNT: loanContract.loanAmount,
    loanFeeAmount: totalFees,
    fundingAcctNo: loanContract.fundingAccountNumber,
    ACCT_NO: loanContract.loanAccountNumber,
    CREATED_BY: loanContract.createdBy || 'SYSTEM',
    DISBURSEMENT_DATE: new Date(),
    INTEREST_RATE: null, // Explicitly pass null since we're ignoring this parameter
    PRODUCT_TYPE,
    productId: loanProduct.PROD_ID,
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
    transactionReferences,
    branchId
  });
}

export {
  processLoanDisbursementTransactions,
  processDisbursement,
  getGLAccountsFromProduct
};