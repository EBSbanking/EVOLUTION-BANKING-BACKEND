// utils/loanDisbursementProcessor.js - Sequelize Version
import { Op, where, fn, col, cast, QueryTypes } from 'sequelize'; // Added QueryTypes here
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import GLAccount from '../models/GLAccount.js';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanProduct from '../models/LoanProduct.js';
import LoanInterestRate from '../models/LoanInterestRate.js';
import Guarantor from '../models/Guarantor.js';
import { generateTransactionId } from '../utils/generateLoanAccountId.js';
import sequelize from '../../config/db.js';

/**
 * Get GL accounts from product configuration
 */
async function getGLAccountsFromProduct(productId, transaction = null) {
  try {
    console.log('Looking for product with PROD_ID:', productId);
    
    // Convert productId to number since PROD_ID is numeric
    const numericProductId = Number(productId);
    
    if (isNaN(numericProductId)) {
      throw new Error(`Invalid product ID: ${productId}. Must be a number`);
    }

    // Query by PROD_ID (numeric field) not id
    const loanProduct = await LoanProduct.findOne({ 
      where: { PROD_ID: numericProductId },
      transaction 
    });
    
    if (!loanProduct) {
      // Try also by productCode as fallback
      const loanProductByCode = await LoanProduct.findOne({ 
        where: { productCode: String(productId) },
        transaction 
      });
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
 * Helper function to safely convert values to Decimal
 */
function toDecimal(value) {
  if (!value && value !== 0) return 0.00;
  try {
    const num = parseFloat(value.toString());
    return isNaN(num) ? 0.00 : parseFloat(num.toFixed(2));
  } catch (error) {
    console.warn('Error converting to Decimal:', error.message, { value });
    return 0.00;
  }
}

/**
 * Helper function to handle guarantor ID processing
 */
async function processGuarantorId(guarantorId, loanDoc, guaranteedAmount, guarantorName, transaction = null) {
  if (!guarantorId) return null;
  
  console.log('Processing guarantor ID:', {
    guarantorId,
    type: typeof guarantorId,
    isString: typeof guarantorId === 'string'
  });
  
  try {
    let guarantorDoc = null;
    
    // Convert to string for comparison
    const guarantorIdStr = String(guarantorId);
    
    // Try with padding to 7 digits
    const paddedId = guarantorIdStr.padStart(7, '0');
    
    // Try to find guarantor by different methods
    guarantorDoc = await Guarantor.findOne({ 
      where: { GUARANTOR_ID: paddedId },
      transaction
    });
    
    // If not found with padding, try without padding
    if (!guarantorDoc) {
      guarantorDoc = await Guarantor.findOne({ 
        where: { GUARANTOR_ID: guarantorIdStr },
        transaction
      });
    }
    
    // If still not found, try by other fields
    if (!guarantorDoc) {
      // Try by phone number
      guarantorDoc = await Guarantor.findOne({ 
        where: { phoneNumber: guarantorIdStr },
        transaction
      });
      
      if (!guarantorDoc && guarantorName) {
        // Try by name (partial match)
        guarantorDoc = await Guarantor.findOne({ 
          where: {
            fullName: {
              [Op.like]: `%${guarantorName}%`
            }
          },
          transaction
        });
      }
    }
    
    if (guarantorDoc) {
      console.log('Found guarantor document:', {
        id: guarantorDoc.id,
        GUARANTOR_ID: guarantorDoc.GUARANTOR_ID,
        fullName: guarantorDoc.fullName
      });
      
      // Update guarantor details in loan document
      const guarantorDetails = {
        guarantorId: guarantorDoc.id,
        guarantorNumberId: guarantorDoc.GUARANTOR_ID,
        name: guarantorName || guarantorDoc.fullName || '',
        phone: guarantorDoc.phoneNumber || '',
        relationship: guarantorDoc.relationshipToBorrower || '',
        email: guarantorDoc.email || '',
        address: guarantorDoc.address || '',
        status: 'ACTIVE',
        guaranteedAmount: toDecimal(guaranteedAmount || guarantorDoc.GUARANTEED_AMT || 0)
      };
      
      // Also update the Guarantor document to reference this loan
      try {
        // Assuming Guarantor model has a guaranteedLoans field
        await Guarantor.update(
          {
            // Add loan ID to guaranteedLoans if it's an array field
            // This depends on your model structure
          },
          {
            where: { id: guarantorDoc.id },
            transaction
          }
        );
        console.log('Updated guarantor document with new loan reference');
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
        guaranteedAmount: toDecimal(guaranteedAmount)
      };
    }
    
  } catch (error) {
    console.error('Error processing guarantor:', error.message);
    
    // Return minimal guarantor details on error
    return {
      guarantorNumberId: String(guarantorId).padStart(7, '0'),
      name: guarantorName || '',
      status: 'PENDING',
      guaranteedAmount: toDecimal(guaranteedAmount)
    };
  }
}


/**
 * Main loan disbursement transaction processing
 */
async function processLoanDisbursementTransactions({
  transaction: t,
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
  TRANSACTION_IDENTIFIER, // **CHANGED: Use TRANSACTION_IDENTIFIER**
  TRANSACTION_ID, // Keep for backward compatibility
  EVENT_ID,
  JOURNAL_ID,
  TRAN_JOURNAL_ID,
  transactionReferences = {},
  branchId
}) {
  if (!t) throw new Error('Database transaction is required');
  if (!loanAccount) throw new Error('Loan account is required');
  if (!customerAccount) throw new Error('Customer account is required');
  if (!fundingAcctNo || !ACCT_NO) throw new Error('Account numbers are required');
  if (!CREATED_BY) throw new Error('Creator identification is required');
  if (!productId) throw new Error('Product ID is required to fetch GL accounts');

  console.log('=== STARTING LOAN DISBURSEMENT PROCESS ===');
  console.log('Loan Interest Rate ID (LOAN_PROUD_INT_ID):', loanAccount.LOAN_INTEREST_RATE_ID);

  // Generate IDs if not provided
  if (!TRANSACTION_IDENTIFIER || !EVENT_ID || !JOURNAL_ID || !TRAN_JOURNAL_ID) {
    const ids = await Transaction.generateTransactionIds(t); // **CHANGED: Use Transaction model method**
    TRANSACTION_IDENTIFIER = ids.TRANSACTION_IDENTIFIER;
    TRANSACTION_ID = ids.TRANSACTION_ID; // Also set TRANSACTION_ID for backward compatibility
    EVENT_ID = ids.EVENT_ID;
    JOURNAL_ID = ids.JOURNAL_ID;
    TRAN_JOURNAL_ID = ids.TRAN_JOURNAL_ID || ids.JOURNAL_ID;
  }

  console.log('🔍 Using Transaction IDs:', {
    TRANSACTION_IDENTIFIER,
    TRANSACTION_ID,
    EVENT_ID,
    JOURNAL_ID,
    TRAN_JOURNAL_ID
  });

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
  } = await getGLAccountsFromProduct(productId, t);

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
  // 2. FETCH AND USE ANNUAL_PERCENTAGE_RATE FROM LOAN_INTEREST_RATE
  // ============================================
  console.log('\n=== FETCHING ANNUAL_PERCENTAGE_RATE FROM LOAN_INTEREST_RATE ===');
  
  let loanInterestRateDetails = null;
  let finalInterestRate;
  let interestRateSource;
  let annualPercentageRate = null;

  if (loanAccount.LOAN_INTEREST_RATE_ID) {
    try {
      // Fetch LoanInterestRate by LOAN_PROUD_INT_ID
      const loanInterestRate = await LoanInterestRate.findOne({
        where: {
          LOAN_PROUD_INT_ID: parseInt(loanAccount.LOAN_INTEREST_RATE_ID),
          STATUS: 'ACTIVE'
        },
        transaction: t
      });
      
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
            finalInterestRate = toDecimal(annualPercentageRate);
            interestRateSource = 'LOAN_INTEREST_RATE_ANNUAL';
            
            console.log(`✓ USING ANNUAL_PERCENTAGE_RATE from LoanInterestRate: ${annualPercentageRate}%`);
            
            // Log what we're ignoring
            const existingLoanAccountRate = loanAccount.INTEREST_RATE ? 
              parseFloat(loanAccount.INTEREST_RATE.toString()) : null;
            
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
        throw new Error(`LoanInterestRate with LOAN_PROUD_INT_ID ${loanAccount.LOAN_INTEREST_RATE_ID} not found or not active`);
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
        where: {
          IS_DEFAULT: true,
          STATUS: 'ACTIVE'
        },
        transaction: t
      });
      
      if (defaultLoanInterestRate && defaultLoanInterestRate.ANNUAL_PERCENTAGE_RATE) {
        annualPercentageRate = parseFloat(defaultLoanInterestRate.ANNUAL_PERCENTAGE_RATE);
        finalInterestRate = toDecimal(annualPercentageRate);
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
      loanAccount, 
      guaranteedAmount, 
      guarantorName, 
      t
    );
  }

  // ============================================
  // 4. UPDATE LOAN ACCOUNT DOCUMENT WITH CORRECT RATE
  // ============================================
  console.log('\n=== UPDATING LOAN ACCOUNT WITH ANNUAL_PERCENTAGE_RATE ===');
  console.log(`Setting interest rate to: ${annualPercentageRate}%`);
  
  // Calculate next payment date
  const nextPaymentDate = new Date(transactionDate);
  const paymentFrequency = loanAccount.PAYMENT_FREQUENCY || 'MONTHLY';
  
  switch(paymentFrequency.toUpperCase()) {
    case 'MONTHLY':
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      break;
    case 'WEEKLY':
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 7);
      break;
    case 'DAILY':
      nextPaymentDate.setDate(nextPaymentDate.getDate() + 1);
      break;
    default:
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
  }

  // Prepare loan account update data
  const loanUpdateData = {
    LOAN_STATUS: 'ACTIVE',
    ACTUAL_DISBURSEMENT: toDecimal(disbursementAmount),
    DISBURSEMENT_DATE: transactionDate,
    OUTSTANDING_PRINCIPAL: toDecimal(disbursementAmount),
    outstanding_balance: toDecimal(disbursementAmount),
    START_DT: transactionDate,
    INTEREST_RATE: finalInterestRate,
    NEXT_PAYMENT_DATE: nextPaymentDate,
    PRIMARY_OFFICER_ID: loanAccount.PRIMARY_OFFICER_ID || CREATED_BY,
    JOURNAL_ID: JOURNAL_ID,
    TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
    TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER, // **CHANGED: Use TRANSACTION_IDENTIFIER**
    TRANSACTION_ID: TRANSACTION_ID, // Keep for backward compatibility
    EVENT_ID: EVENT_ID,
    interestRateSource,
    lastUpdated: new Date()
  };

  // Add fee details
  loanUpdateData.processingFee = toDecimal(feeAmount);
  loanUpdateData.totalFees = toDecimal(feeAmount);
  loanUpdateData.upfrontInterest = toDecimal(upfrontInterestAmount);
  loanUpdateData.upfrontInterestPercentage = toDecimal(upfrontInterestPercentage);

  // Add LoanInterestRate details
  if (loanInterestRateDetails) {
    loanUpdateData.loanInterestRateDetails = JSON.stringify(loanInterestRateDetails);
  }

  // Add upfront interest fields
  if (upfrontInterestAmount > 0) {
    loanUpdateData.upfrontInterestDeducted = true;
    loanUpdateData.upfrontInterestAmount = toDecimal(upfrontInterestAmount);
    loanUpdateData.deductUpfrontInterest = deductUpfrontInterest;
    loanUpdateData.partialUpfrontInterest = partialUpfrontInterest;
    if (partialUpfrontInterest) {
      loanUpdateData.upfrontInterestPercentage = toDecimal(upfrontInterestPercentage);
    }
  }

  // Add guarantor details
  if (guarantorDetails) {
    loanUpdateData.HAS_GUARANTOR = true;
    loanUpdateData.guarantorDetails = JSON.stringify(guarantorDetails);
  }

  console.log('Updating loan account with ANNUAL_PERCENTAGE_RATE...');
  
  try {
    await LoanAccount.update(
      loanUpdateData,
      {
        where: { id: loanAccount.id },
        transaction: t
      }
    );
    console.log('✅ Loan account updated successfully');
    console.log(`✅ Final interest rate: ${annualPercentageRate}% (from ANNUAL_PERCENTAGE_RATE)`);
  } catch (saveError) {
    console.error('❌ Error updating loan account:', saveError.message);
    console.error('Update error stack:', saveError.stack);
    throw new Error(`Failed to update loan account: ${saveError.message}`);
  }

  // ============================================
  // CREATE TRANSACTIONS WITH PROPER FIELD NAMES
  // ============================================
  const transactionsToCreate = [];

  // **UPDATED: Helper function to create transaction data with TRANSACTION_IDENTIFIER**
  const createTransactionData = (baseData) => {
    const txData = {
      TRANSACTION_IDENTIFIER: baseData.TRANSACTION_IDENTIFIER || TRANSACTION_IDENTIFIER,
      TRANSACTION_ID: baseData.TRANSACTION_ID || TRANSACTION_ID, // For transaction_id column
      EVENT_ID: baseData.EVENT_ID || EVENT_ID,
      TRAN_JOURNAL_ID: baseData.TRAN_JOURNAL_ID || TRAN_JOURNAL_ID || JOURNAL_ID,
      ACCT_NO: baseData.ACCT_NO || ACCT_NO,
      ACCT_ID: String(baseData.ACCT_ID || loanAccount.id),
      BU_ID: Number(baseData.BU_ID || loanAccount.BU_ID || branchId || 1),
      CUST_ID: String(baseData.CUST_ID || loanAccount.CUST_ID),
      ACCT_NM: baseData.ACCT_NM || loanAccount.ACCT_NM,
      AMOUNT: Number(baseData.AMOUNT || 0),
      TRANSACTIONDATE: baseData.TRANSACTIONDATE || transactionDate,
      TRANSACTION_TYPE: baseData.TRANSACTION_TYPE,
      description: baseData.description || '',
      currency: baseData.currency || productDetails.CRNCY_ID || 'NGN',
      createdBy: baseData.createdBy || CREATED_BY,
      status: baseData.status || 'COMPLETED',
      REFERENCE: baseData.REFERENCE || `TXN${Date.now()}`,
      metadata: baseData.metadata || {}
    };
    
    console.log('📝 Created transaction data:', {
      TRANSACTION_IDENTIFIER: txData.TRANSACTION_IDENTIFIER,
      TRANSACTION_ID: txData.TRANSACTION_ID,
      TRAN_JOURNAL_ID: txData.TRAN_JOURNAL_ID,
      EVENT_ID: txData.EVENT_ID
    });
    
    return txData;
  };

  // 1. Main disbursement transaction
  transactionsToCreate.push(createTransactionData({
    TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER,
    TRANSACTION_ID: TRANSACTION_ID,
    TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
    AMOUNT: disbursementAmount,
    TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
    description: `Loan Disbursement to ${loanAccount.ACCT_NM}`,
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
      loanInterestRateId: loanAccount.LOAN_INTEREST_RATE_ID,
      interestRate: {
        appliedRate: annualPercentageRate,
        rateSource: interestRateSource,
        loanProudIntId: loanInterestRateDetails?.LOAN_PROUD_INT_ID || null,
        annualPercentageRate: annualPercentageRate,
        rateType: loanInterestRateDetails?.RATE_TYPE || loanAccount.INTEREST_RATE_TYPE || 'FIXED',
        calculationMethod: loanInterestRateDetails?.CALCULATION_METHOD || loanAccount.INTEREST_CALCULATION_METHOD || 'FLAT_RATE',
        interestType: loanInterestRateDetails?.INTEREST_TYPE || 'SIMPLE',
        isTermBased: loanAccount.IS_TERM_BASED_RATE || true,
        note: `Using ANNUAL_PERCENTAGE_RATE from LoanInterestRate configuration`
      }
    }
  }));

  // 2. Fee transaction
  if (feeAmount > 0) {
    transactionsToCreate.push(createTransactionData({
      TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER + 1,
      TRANSACTION_ID: TRANSACTION_ID ? `TXN${Number(TRANSACTION_IDENTIFIER) + 1}` : undefined,
      TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
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
      TRANSACTION_IDENTIFIER: TRANSACTION_IDENTIFIER + 2,
      TRANSACTION_ID: TRANSACTION_ID ? `TXN${Number(TRANSACTION_IDENTIFIER) + 2}` : undefined,
      TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
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

  // **UPDATED: Save transactions with TRANSACTION_IDENTIFIER**
  try {
    console.log('Creating transactions...');
    for (const transactionData of transactionsToCreate) {
      // Ensure metadata is stringified for database storage
      const txData = {
        ...transactionData,
        metadata: JSON.stringify(transactionData.metadata)
      };
      
      console.log('🔍 Saving transaction:', {
        TRANSACTION_IDENTIFIER: txData.TRANSACTION_IDENTIFIER,
        TRANSACTION_ID: txData.TRANSACTION_ID,
        TRAN_JOURNAL_ID: txData.TRAN_JOURNAL_ID,
        TRANSACTION_TYPE: txData.TRANSACTION_TYPE,
        AMOUNT: txData.AMOUNT
      });
      
      await Transaction.create(txData, { transaction: t });
    }
    console.log('✅ Transactions created:', transactionsToCreate.length);
  } catch (error) {
    console.error('❌ Error creating transactions:', error.message);
    console.error('❌ Transaction error details:', {
      name: error.name,
      errors: error.errors,
      sql: error.sql,
      parameters: error.parameters
    });
    throw new Error(`Transaction creation failed: ${error.message}`);
  }

  // ============================================
  // 5. UPDATE CUSTOMER ACCOUNT
  // ============================================
  try {
    let customerDoc;
    if (customerAccount.id) {
      customerDoc = customerAccount;
    } else {
      customerDoc = await CustomerAccount.findOne({ 
        where: { ACCT_NO: fundingAcctNo },
        transaction: t 
      });
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
    
    // Get current transaction history - handle as string or array
    let transactionHistory = [];
    try {
      if (customerDoc.transactionHistory) {
        if (typeof customerDoc.transactionHistory === 'string') {
          transactionHistory = JSON.parse(customerDoc.transactionHistory);
        } else if (Array.isArray(customerDoc.transactionHistory)) {
          transactionHistory = customerDoc.transactionHistory;
        }
      }
    } catch (parseError) {
      console.warn('Could not parse transaction history:', parseError.message);
    }
    
    // Add new transaction
    transactionHistory.push({
      date: new Date(),
      type: 'LOAN_DISBURSEMENT',
      amount: netDisbursement,
      description: `Loan disbursement from ${ACCT_NO}`,
      reference: ACCT_NO,
      balanceAfter: newBalance
    });
    
    await CustomerAccount.update(
      {
        LEDGER_BALANCE: toDecimal(newBalance),
        CLEARED_BALANCE: toDecimal(newBalance),
        AVAILABLE_BALANCE: toDecimal(newBalance),
        LAST_UPDATED: new Date(),
        transactionHistory: JSON.stringify(transactionHistory)
      },
      {
        where: { id: customerDoc.id },
        transaction: t
      }
    );
    
    console.log(`✅ Customer account ${fundingAcctNo} updated. Balance change: +${netDisbursement}`);
  } catch (error) {
    console.error('❌ Error updating customer account:', error);
    throw error;
  }

  // ============================================
  // 6. UPDATE LOAN PORTFOLIO (SINGLE LOCATION)
  // ============================================
  if (LoanPortfolio && (branchId || loanAccount.BU_ID)) {
    try {
      const actualBranchId = branchId || loanAccount.BU_ID;
      const portfolioProductId = Number(productId);
      const month = transactionDate.getMonth() + 1;
      const year = transactionDate.getFullYear();
      
      console.log('Updating LoanPortfolio:', {
        BRANCH_ID: actualBranchId,
        PROD_ID: portfolioProductId,
        MONTH: month,
        YEAR: year,
        productCode: productDetails.productCode
      });
      
      // Find existing portfolio record
      const existingPortfolio = await LoanPortfolio.findOne({
        where: {
          BRANCH_ID: actualBranchId,
          PROD_ID: portfolioProductId,
          MONTH: month,
          YEAR: year
        },
        transaction: t
      });
      
      if (existingPortfolio) {
        // Update existing portfolio
        await LoanPortfolio.update(
          {
            TOTAL_DISBURSED: (existingPortfolio.TOTAL_DISBURSED || 0) + disbursementAmount,
            TOTAL_NET_DISBURSEMENT: (existingPortfolio.TOTAL_NET_DISBURSEMENT || 0) + netDisbursement,
            TOTAL_PRINCIPAL: (existingPortfolio.TOTAL_PRINCIPAL || 0) + disbursementAmount,
            OUTSTANDING_PRINCIPAL: (existingPortfolio.OUTSTANDING_PRINCIPAL || 0) + disbursementAmount,
            TOTAL_INTEREST_RECEIVED: (existingPortfolio.TOTAL_INTEREST_RECEIVED || 0) + upfrontInterestAmount,
            TOTAL_FEES_RECEIVED: (existingPortfolio.TOTAL_FEES_RECEIVED || 0) + feeAmount,
            NUMBER_OF_LOANS: (existingPortfolio.NUMBER_OF_LOANS || 0) + 1,
            ACTIVE_LOANS: (existingPortfolio.ACTIVE_LOANS || 0) + 1,
            DISBURSEMENT_COUNT: (existingPortfolio.DISBURSEMENT_COUNT || 0) + 1,
            UPDATED_DATE: new Date(),
            UPDATED_BY: CREATED_BY
          },
          {
            where: { id: existingPortfolio.id },
            transaction: t
          }
        );
      } else {
        // Create new portfolio record
        await LoanPortfolio.create({
          BRANCH_ID: actualBranchId,
          PROD_ID: portfolioProductId,
          PRODUCT_CODE: productDetails.productCode,
          PRODUCT_NAME: productDetails.PRODUCT_SHORT_NAME || productDetails.name,
          PRODUCT_TYPE: productDetails.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
          MONTH: month,
          YEAR: year,
          CURRENCY: productDetails.CRNCY_ID || 'NGN',
          CREATED_DATE: new Date(),
          STATUS: 'ACTIVE',
          TOTAL_DISBURSED: disbursementAmount,
          TOTAL_NET_DISBURSEMENT: netDisbursement,
          TOTAL_PRINCIPAL: disbursementAmount,
          OUTSTANDING_PRINCIPAL: disbursementAmount,
          TOTAL_INTEREST_RECEIVED: upfrontInterestAmount,
          TOTAL_FEES_RECEIVED: feeAmount,
          NUMBER_OF_LOANS: 1,
          ACTIVE_LOANS: 1,
          DISBURSEMENT_COUNT: 1,
          YIELD_RATE: annualPercentageRate,
          TOTAL_INTEREST_ACCRUED: 0,
          TOTAL_REPAYMENTS: 0,
          TOTAL_RECOVERED: 0,
          TOTAL_DEFAULTS: 0,
          PORTFOLIO_AT_RISK: 0,
          PROVISION_AMOUNT: 0,
          NPL_RATIO: 0,
          COST_OF_FUNDS: 0,
          NET_INTEREST_MARGIN: annualPercentageRate,
          AVERAGE_LOAN_SIZE: disbursementAmount,
          CREATED_BY: CREATED_BY,
          UPDATED_BY: CREATED_BY
        }, { transaction: t });
      }
      
      console.log('✅ Loan portfolio updated successfully.');
    } catch (error) {
      console.error('⚠️ Error updating loan portfolio (non-critical):', error.message);
    }
  } else {
    console.log('⚠️ LoanPortfolio update skipped:');
    if (!LoanPortfolio) console.log('  - LoanPortfolio model not available');
    if (!branchId && !loanAccount.BU_ID) console.log('  - No branch ID provided');
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
      TRANSACTION_IDENTIFIER,
      TRANSACTION_ID,
      EVENT_ID,
      JOURNAL_ID,
      TRAN_JOURNAL_ID
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

async function processDisbursement(params) {
  // ==================== CRITICAL VALIDATION ====================
  console.log('🔍 Starting processDisbursement validation...');
  
  if (!params) {
    throw new Error('processDisbursement: params object is required');
  }
  
  if (!params.customerAccount) {
    console.error('❌ processDisbursement: customerAccount parameter is missing');
    console.error('❌ Available params:', Object.keys(params));
    throw new Error('customerAccount parameter is required');
  }
  
  if (!params.customerAccount.id) {
    console.error('❌ processDisbursement: Invalid customerAccount object:', {
      hasId: !!params.customerAccount.id,
      hasAccountNumber: !!params.customerAccount.account_number,
      customerAccount: params.customerAccount
    });
    throw new Error('customerAccount.id is required');
  }
  
  if (!params.loanContract) {
    throw new Error('loanContract parameter is required');
  }
  
  if (!params.transaction) {
    throw new Error('transaction parameter is required');
  }
  
  console.log('✅ processDisbursement validation passed:', {
    customerAccountId: params.customerAccount.id,
    customerAccountNumber: params.customerAccount.account_number,
    loanContractId: params.loanContract?.id,
    hasTransaction: !!params.transaction
  });
  
  // ==================== FUNCTION PARAMETERS ====================
  const {
    transaction,
    loanContract,
    customerAccount,
    repaymentSchedule,
    loanProduct,
    totalFees = 0,
    interestRate,
    PRODUCT_TYPE,
    deductUpfrontInterest = false,
    partialUpfrontInterest = false,
    upfrontInterestAmount = 0,
    upfrontInterestPercentage = 0,
    guarantorDetails = null,
    guaranteedAmount = 0,
    TRANSACTION_ID,
    EVENT_ID,
    JOURNAL_ID,
    transactionReferences = {},
    branchId = 1,
    CREATED_BY = 'SYSTEM'
  } = params;
  
  // ==================== ADDITIONAL VALIDATION WITH FALLBACKS ====================
  console.log('🔍 Validating disbursement parameters with fallbacks...');
  
  // Check for missing fields with fallbacks
  const missingFields = [];
  
  // 1. Check loanContract fields with multiple possible names
  if (!loanContract.loanAccountNumber && 
      !loanContract.LOAN_ACCOUNT_NUMBER && 
      !loanContract.ACCT_NO) {
    missingFields.push('loanContract.loanAccountNumber');
  } else {
    // Set the field with fallback logic
    loanContract.loanAccountNumber = loanContract.loanAccountNumber || 
                                    loanContract.LOAN_ACCOUNT_NUMBER || 
                                    loanContract.ACCT_NO;
    console.log('📝 Set loanAccountNumber:', loanContract.loanAccountNumber);
  }
  
  // 2. Check principal amount with multiple possible names
  if ((!loanContract.principal || loanContract.principal === 0) && 
      (!loanContract.LOAN_AMOUNT || loanContract.LOAN_AMOUNT === 0) &&
      (!loanContract.PRINCIPAL || loanContract.PRINCIPAL === 0)) {
    missingFields.push('loanContract.principal');
  } else {
    // Set the field with fallback logic
    loanContract.principal = loanContract.principal || 
                           loanContract.LOAN_AMOUNT || 
                           loanContract.PRINCIPAL || 
                           0;
    loanContract.principal = parseFloat(loanContract.principal);
    console.log('📝 Set principal:', loanContract.principal);
  }
  
  // 3. Check repaymentSchedule.totalRepaymentAmount with fallbacks
  if ((!repaymentSchedule || !repaymentSchedule.totalRepaymentAmount) && 
      (!repaymentSchedule?.TOTAL_REPAYMENT_AMOUNT) &&
      (!repaymentSchedule?.totalRepayable)) {
    missingFields.push('repaymentSchedule.totalRepaymentAmount');
  } else if (repaymentSchedule) {
    // Set the field with fallback logic
    repaymentSchedule.totalRepaymentAmount = repaymentSchedule.totalRepaymentAmount || 
                                           repaymentSchedule.TOTAL_REPAYMENT_AMOUNT || 
                                           repaymentSchedule.totalRepayable || 
                                           0;
    repaymentSchedule.totalRepaymentAmount = parseFloat(repaymentSchedule.totalRepaymentAmount);
    console.log('📝 Set totalRepaymentAmount:', repaymentSchedule.totalRepaymentAmount);
  } else {
    missingFields.push('repaymentSchedule (object missing)');
  }
  
  // 4. Validate numeric values
  if (loanContract.principal <= 0) {
    console.error('❌ Invalid principal amount:', loanContract.principal);
    missingFields.push('loanContract.principal (must be > 0)');
  }
  
  if (typeof interestRate !== 'number' || interestRate < 0) {
    console.error('❌ Invalid interest rate:', interestRate);
    missingFields.push('interestRate (must be >= 0)');
  }
  
  // 5. Log what we have for debugging
  console.log('🔍 Field Status:', {
    loanAccountNumber: loanContract.loanAccountNumber || 'MISSING',
    principal: loanContract.principal || 'MISSING',
    totalRepaymentAmount: repaymentSchedule?.totalRepaymentAmount || 'MISSING',
    loanProductId: loanProduct?.PROD_ID || loanProduct?.id || 'MISSING',
    transactionId: TRANSACTION_ID || 'MISSING',
    eventId: EVENT_ID || 'MISSING',
    journalId: JOURNAL_ID || 'MISSING'
  });
  
  if (missingFields.length > 0) {
    console.error('❌ Missing/Invalid fields:', missingFields);
    console.error('❌ Loan Contract:', loanContract);
    console.error('❌ Repayment Schedule:', repaymentSchedule);
    console.error('❌ Loan Product:', loanProduct);
    
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  
  console.log('✅ All parameters validated successfully');
  
  // ==================== CALL THE MAIN DISBURSEMENT FUNCTION ====================
  console.log('🚀 Calling processLoanDisbursementTransactions...');
  
  try {
    // Convert parameters for the main disbursement function
    const disbursementParams = {
      transaction: transaction,
      loanAccount: {
        id: loanContract.id,
        LOAN_ACCOUNT_NUMBER: loanContract.loanAccountNumber,
        ACCT_NO: loanContract.loanAccountNumber,
        ACCT_NM: loanContract.accountName || customerAccount.account_name || 'Unknown',
        CUST_ID: loanContract.customerId || customerAccount.customer_id,
        PROD_ID: loanProduct.PROD_ID,
        PRODUCT_TYPE: PRODUCT_TYPE,
        INTEREST_RATE: interestRate,
        principal: loanContract.principal,
        BU_ID: branchId,
        // Add any other fields that processLoanDisbursementTransactions expects
        ...loanContract
      },
      customerAccount: customerAccount,
      AMOUNT: loanContract.principal,
      loanFeeAmount: totalFees,
      fundingAcctNo: loanContract.fundingAccountNumber || customerAccount.account_number,
      ACCT_NO: loanContract.loanAccountNumber,
      CREATED_BY: CREATED_BY,
      PRODUCT_TYPE: PRODUCT_TYPE,
      productId: loanProduct.PROD_ID,
      deductUpfrontInterest: deductUpfrontInterest,
      partialUpfrontInterest: partialUpfrontInterest,
      upfrontInterestAmount: upfrontInterestAmount,
      upfrontInterestPercentage: upfrontInterestPercentage,
      guarantorId: guarantorDetails?.guarantorId,
      guaranteedAmount: guaranteedAmount,
      guarantorName: guarantorDetails?.name,
      TRANSACTION_ID: TRANSACTION_ID,
      EVENT_ID: EVENT_ID,
      JOURNAL_ID: JOURNAL_ID,
      transactionReferences: transactionReferences,
      branchId: branchId
    };
    
    console.log('📤 Passing to processLoanDisbursementTransactions:', {
      loanAccountNumber: disbursementParams.loanAccount.LOAN_ACCOUNT_NUMBER,
      amount: disbursementParams.AMOUNT,
      productId: disbursementParams.productId
    });
    
    // Call the main disbursement function
    const result = await processLoanDisbursementTransactions(disbursementParams);
    
    console.log('✅ processLoanDisbursementTransactions completed successfully');
    
    // Return formatted result
    return {
      success: true,
      loanAmount: result.loanAmount,
      netDisbursementToCustomer: result.netDisbursementToCustomer,
      feeCollected: result.feeCollected,
      upfrontInterestCollected: result.upfrontInterestCollected,
      interestRateDetails: result.interestRateDetails,
      transactionIds: result.transactionIds,
      accountingSummary: result.accountingSummary,
      disbursementDate: new Date()
    };
    
  } catch (error) {
    console.error('❌ Error in processDisbursement:', error.message);
    console.error('Stack trace:', error.stack);
    throw new Error(`Disbursement process failed: ${error.message}`);
  }
}

// Helper function for complete loan disbursement
export async function completeLoanDisbursement(loanId, userId, branchId, options = {}) {
  let localTransaction = null;
  let createdTransaction = false;
  
  try {
    // Create transaction if not provided in options
    if (!options.transaction) {
      localTransaction = await sequelize.transaction();
      createdTransaction = true;
    } else {
      localTransaction = options.transaction;
    }
    
    console.log(`🚀 Starting complete loan disbursement for loan ID: ${loanId}`);
    
    // Fetch loan account
    const loanAccount = await LoanAccount.findByPk(loanId, { 
      transaction: localTransaction 
    });
    
    if (!loanAccount) {
      throw new Error(`Loan account not found: ${loanId}`);
    }
    
    // Fetch customer account
    const customerAccount = await CustomerAccount.findOne({
      where: { 
        [Op.or]: [
          { ACCT_NO: loanAccount.savingsAccountNo },
          { account_number: loanAccount.savingsAccountNo }
        ]
      },
      transaction: localTransaction
    });
    
    if (!customerAccount) {
      throw new Error(`Customer account not found for savings account: ${loanAccount.savingsAccountNo}`);
    }
    
    // Fetch loan product
    const loanProduct = await LoanProduct.findOne({
      where: { PROD_ID: loanAccount.PROD_ID },
      transaction: localTransaction
    });
    
    if (!loanProduct) {
      throw new Error(`Loan product not found: ${loanAccount.PROD_ID}`);
    }
    
    // Calculate fees and upfront interest
    const totalFees = parseFloat(loanAccount.FEE_DETAILS?.totalFees || 0);
    const upfrontInterestAmount = parseFloat(loanAccount.UPFRONT_INTEREST_AMOUNT || 0);
    
    // Process disbursement
    const result = await processLoanDisbursementTransactions({
      transaction: localTransaction,
      loanAccount,
      customerAccount,
      AMOUNT: loanAccount.DISBURSEMENT_LIMIT || loanAccount.loanAmount,
      loanFeeAmount: totalFees,
      fundingAcctNo: loanAccount.savingsAccountNo,
      ACCT_NO: loanAccount.ACCT_NO,
      CREATED_BY: userId,
      PRODUCT_TYPE: loanAccount.PRODUCT_TYPE,
      productId: loanAccount.PROD_ID,
      deductUpfrontInterest: loanAccount.deductUpfrontInterest || false,
      partialUpfrontInterest: loanAccount.partialUpfrontInterest || false,
      upfrontInterestAmount: upfrontInterestAmount,
      upfrontInterestPercentage: loanAccount.upfrontInterestPercentage || 0,
      guarantorId: loanAccount.guarantorDetails?.guarantorId,
      guaranteedAmount: loanAccount.guarantorDetails?.guaranteedAmount,
      guarantorName: loanAccount.guarantorDetails?.name,
      branchId: branchId || loanAccount.BU_ID
    });
    
    // Update repayment schedule if it exists
    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: { LOAN_ACCOUNT_ID: loanAccount.id },
      transaction: localTransaction
    });
    
    if (repaymentSchedule) {
      await RepaymentSchedule.update(
        {
          STATUS: 'ACTIVE',
          DISBURSEMENT_STATUS: 'COMPLETED',
          START_DATE: new Date()
        },
        {
          where: { id: repaymentSchedule.id },
          transaction: localTransaction
        }
      );
    }
    
    // Commit transaction if we created it
    if (createdTransaction) {
      await localTransaction.commit();
    }
    
    console.log(`✅ Loan disbursement completed successfully for ${loanAccount.ACCT_NO}`);
    
    return {
      success: true,
      message: 'Loan disbursement completed successfully',
      ...result
    };
    
  } catch (error) {
    // Rollback transaction if we created it
    if (createdTransaction && localTransaction) {
      await localTransaction.rollback();
    }
    
    console.error('❌ Loan disbursement failed:', error);
    
    return {
      success: false,
      message: `Loan disbursement failed: ${error.message}`,
      error: error.message
    };
  }
}

export {
  processLoanDisbursementTransactions,
  processDisbursement,
  getGLAccountsFromProduct,
  // completeLoanDisbursement
};

export default {
  processLoanDisbursementTransactions,
  processDisbursement,
  getGLAccountsFromProduct,
  completeLoanDisbursement
};