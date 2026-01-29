// utils/loanProcessingUtils.js - Sequelize Version (Updated with LoanAccount)
import Transaction from '../models/Transaction.js';
import InsurancePolicy from '../models/InsurancePolicy.js';
import Ledger from '../models/Ledger.js';
import Branch from '../models/Branch.js';
import LoanAccount from '../models/LoanAccount.js'; // Added LoanAccount import
import logger from './logger.js';
import  sequelize  from '../../config/db.js';

// DYNAMIC GL Account Template Configuration - With wildcards for all branches
export const GL_ACCOUNT_TEMPLATES = {
  PROCESSING_FEE: {
    template: 'BR-SB-400-001-SF', // BR=Branch(3), SB=SubBranch(3), SF=Suffix(3)
    description: 'Processing Fee Income',
    transactionType: 'PROCESSING_FEE',
    accountType: 'REVENUE'
  },
  INSURANCE_FEE: {
    template: 'BR-SB-400-002-SF',
    description: 'Insurance Premium Income',
    transactionType: 'INSURANCE_PREMIUM',
    accountType: 'REVENUE'
  },
  UPFRONT_INTEREST: {
    template: 'BR-SB-400-003-SF',
    description: 'Interest Income',
    transactionType: 'UPFRONT_INTEREST',
    accountType: 'REVENUE'
  },
  OTHER_FEES: {
    template: 'BR-SB-400-004-SF',
    description: 'Other Fee Income',
    transactionType: 'OTHER_FEES',
    accountType: 'REVENUE'
  },
  CUSTOMER_ACCOUNT: {
    template: 'BR-SB-100-001-SF',
    description: 'Customer Deposit Account',
    transactionType: 'CUSTOMER_ACCOUNT',
    accountType: 'LIABILITY'
  },
  LOAN_ASSET: {
    template: 'BR-SB-200-001-SF',
    description: 'Loan Assets',
    transactionType: 'LOAN_DISBURSEMENT',
    accountType: 'ASSET'
  }
};

// DYNAMIC Loan Product to GL Account Mapping
export const LOAN_PRODUCT_TEMPLATES = {
  'GROUP_LOAN': 'BR-SB-200-001-SF',
  'INDIVIDUAL_LOAN': 'BR-SB-200-002-SF',
  'BUSINESS_LOAN': 'BR-SB-200-003-SF',
  'PERSONAL_LOAN': 'BR-SB-200-004-SF',
  'MORTGAGE': 'BR-SB-200-005-SF',
  'AUTO_LOAN': 'BR-SB-200-006-SF'
};

// Generate dynamic GL account number based on branch code and parameters
export const generateGLAccount = (template, branchCode = '001', subBranchCode = '001', accountSuffix = '100') => {
  return template
    .replace('BR', branchCode.padStart(3, '0'))      // Branch code (3 digits)
    .replace('SB', subBranchCode.padStart(3, '0'))   // Sub-branch (3 digits)
    .replace('SF', accountSuffix.padStart(3, '0'));  // Account suffix (3 digits)
};

// Get GL account for a specific branch and account type
export const getGLAccountForBranch = (accountType, branchCode, subBranchCode = '001', accountSuffix = '100') => {
  const template = GL_ACCOUNT_TEMPLATES[accountType]?.template;
  if (!template) {
    throw new Error(`Unknown account type: ${accountType}`);
  }
  return generateGLAccount(template, branchCode, subBranchCode, accountSuffix);
};

// Get loan asset GL account for specific branch and product
export const getLoanAssetGLAccount = (productType, branchCode, subBranchCode = '001', accountSuffix = '100') => {
  const template = LOAN_PRODUCT_TEMPLATES[productType] || 'BR-SB-200-000-SF';
  return generateGLAccount(template, branchCode, subBranchCode, accountSuffix);
};

// Get branch by ID and return branchCode
export const getBranchCode = async (branchId, transaction = null) => {
  try {
    const branch = await Branch.findByPk(branchId, { transaction });
    if (!branch) {
      throw new Error(`Branch not found with ID: ${branchId}`);
    }
    if (!branch.branchCode) {
      throw new Error(`Branch ${branch.branchName} does not have a branchCode`);
    }
    return branch.branchCode;
  } catch (error) {
    logger.error(`Error getting branch code for branch ${branchId}:`, error);
    throw error;
  }
};

// Get LoanAccount by account number
export const getLoanAccountByNumber = async (accountNumber, transaction = null) => {
  try {
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: accountNumber },
      transaction
    });
    
    if (!loanAccount) {
      throw new Error(`Loan account not found: ${accountNumber}`);
    }
    
    return loanAccount;
  } catch (error) {
    logger.error(`Error getting loan account ${accountNumber}:`, error);
    throw error;
  }
};

// Get LoanAccount by ID
export const getLoanAccountById = async (loanId, transaction = null) => {
  try {
    const loanAccount = await LoanAccount.findByPk(loanId, { transaction });
    
    if (!loanAccount) {
      throw new Error(`Loan account not found with ID: ${loanId}`);
    }
    
    return loanAccount;
  } catch (error) {
    logger.error(`Error getting loan account by ID ${loanId}:`, error);
    throw error;
  }
};

// Get all GL accounts for a specific branch (useful for setup)
export const getAllGLAccountsForBranch = (branchCode, subBranchCode = '001', accountSuffix = '100') => {
  const accounts = {};
  Object.keys(GL_ACCOUNT_TEMPLATES).forEach(accountType => {
    accounts[accountType] = getGLAccountForBranch(accountType, branchCode, subBranchCode, accountSuffix);
  });
  
  // Add loan product accounts
  Object.keys(LOAN_PRODUCT_TEMPLATES).forEach(productType => {
    accounts[`${productType}_ASSET`] = getLoanAssetGLAccount(productType, branchCode, subBranchCode, accountSuffix);
  });
  
  return accounts;
};

// Dynamic fee type detector
export const detectFeeType = (feeName, chargeCode = '') => {
  const name = feeName?.toLowerCase() || '';
  const code = chargeCode?.toLowerCase() || '';
  
  if (name.includes('process') || code.includes('proc')) return 'PROCESSING_FEE';
  if (name.includes('insur') || code.includes('ins')) return 'INSURANCE_FEE';
  if (name.includes('interest') || code.includes('int')) return 'UPFRONT_INTEREST';
  if (name.includes('admin') || code.includes('adm')) return 'OTHER_FEES';
  if (name.includes('service') || code.includes('svc')) return 'OTHER_FEES';
  if (name.includes('charge') || code.includes('chg')) return 'OTHER_FEES';
  
  return 'OTHER_FEES';
};

// Calculate total fees dynamically from all components
export const calculateTotalFees = (fees) => {
  let total = 0;
  
  // Add standard fee components
  if (fees.processingFee > 0) total += fees.processingFee;
  if (fees.insuranceFee > 0) total += fees.insuranceFee;
  if (fees.otherFees > 0) total += fees.otherFees;
  if (fees.upfrontInterest > 0) total += fees.upfrontInterest;
  
  // Add charges array total
  if (fees.charges && Array.isArray(fees.charges)) {
    total += fees.charges.reduce((sum, charge) => sum + (charge.amount || 0), 0);
  }
  
  return total;
};

// Get fee breakdown for reporting
export const getFeeBreakdown = (fees) => {
  const breakdown = {};
  
  if (fees.processingFee > 0) breakdown.processingFee = fees.processingFee;
  if (fees.insuranceFee > 0) breakdown.insuranceFee = fees.insuranceFee;
  if (fees.otherFees > 0) breakdown.otherFees = fees.otherFees;
  if (fees.upfrontInterest > 0) breakdown.upfrontInterest = fees.upfrontInterest;
  
  if (fees.charges && Array.isArray(fees.charges)) {
    breakdown.charges = fees.charges.map(charge => ({
      name: charge.name,
      amount: charge.amount,
      type: charge.chargeType
    }));
  }
  
  return breakdown;
};

// Helper function to verify GL account exists and can post
export const verifyGLAccount = async (glCode, transactionType, transaction = null) => {
  try {
    const ledgerAccount = await Ledger.findOne({ 
      where: { GL_ACCT_NO: glCode },
      transaction
    });
    
    if (!ledgerAccount) {
      throw new Error(`GL account not found: ${glCode}`);
    }
    
    if (ledgerAccount.REC_ST !== 'Active') {
      throw new Error(`GL account is not active: ${glCode}`);
    }
    
    if (!ledgerAccount.POST_ALLOW) {
      throw new Error(`Posting not allowed for GL account: ${glCode}`);
    }
    
    // Check if debit/credit is allowed based on transaction type
    const normalizedType = transactionType.toUpperCase();
    if (normalizedType.includes('DEBIT') && !ledgerAccount.DR_ALLOWED) {
      throw new Error(`Debit not allowed for GL account: ${glCode}`);
    }
    
    if (normalizedType.includes('CREDIT') && !ledgerAccount.CR_ALLOWED) {
      throw new Error(`Credit not allowed for GL account: ${glCode}`);
    }
    
    return ledgerAccount;
  } catch (error) {
    logger.error(`GL account verification failed for ${glCode}:`, error);
    throw error;
  }
};

// Helper function to create ledger transaction
export const createLedgerTransaction = async (transactionData, transaction = null) => {
  try {
    const ledgerEntry = await Ledger.create({
      GL_ACCT_NO: transactionData.glCode,
      amount: transactionData.amount,
      transactionType: transactionData.transactionType,
      description: transactionData.description,
      BU_ID: transactionData.branchCode,
      createdBy: transactionData.userId,
      transactionDate: new Date(),
      metadata: transactionData.metadata
    }, { transaction });

    return ledgerEntry;
  } catch (error) {
    logger.error('Error creating ledger transaction:', error);
    throw error;
  }
};

// Helper function to dynamically debit fees from customer account
export const debitFeesFromCustomerAccount = async (loanAccount, customerAccount, userId, t, branchId) => {
  const fees = loanAccount.FEE_DETAILS || {};
  
  // Calculate total fees dynamically from all fee components
  const totalFees = calculateTotalFees(fees);
  
  if (totalFees <= 0) {
    logger.info(`No fees to debit for loan ${loanAccount.ACCT_NO}`);
    return;
  }

  // Get branch code from branch ID
  const branchCode = await getBranchCode(branchId, t);

  // STEP 1: DEBIT TOTAL FEES FROM CUSTOMER ACCOUNT
  const previousBalance = customerAccount.ledger_balance;
  customerAccount.ledger_balance -= totalFees;
  
  // Create debit transaction for customer account
  await Transaction.create({
    transactionId: `FEE_DEBIT_${loanAccount.ACCT_NO}_${Date.now()}`,
    account_number: customerAccount.account_number,
    amount: totalFees,
    transactionType: 'DEBIT',
    description: `Loan processing fees for account ${loanAccount.ACCT_NO}`,
    balance: customerAccount.ledger_balance,
    previousBalance: previousBalance,
    createdBy: userId,
    transactionDate: new Date(),
    reference: `LOAN_FEES_${loanAccount.ACCT_NO}`,
    metadata: {
      loanAccountNo: loanAccount.ACCT_NO,
      feeBreakdown: getFeeBreakdown(fees),
      branchCode: branchCode,
      branchId: branchId
    }
  }, { transaction: t });

  await customerAccount.save({ transaction: t });

  // STEP 2: DYNAMICALLY CREATE LEDGER ENTRIES FOR ALL FEE TYPES
  await createDynamicLedgerEntries(loanAccount, customerAccount, fees, userId, t, branchCode);

  logger.info(`Fees debited from customer ${loanAccount.CUST_ID} account: ${totalFees} for branch ${branchCode}`);
};

// Dynamically create Ledger entries for all fee types
export const createDynamicLedgerEntries = async (loanAccount, customerAccount, fees, userId, t, branchCode) => {
  const timestamp = Date.now();
  
  // Get customer account GL code for this branch
  const customerGLCode = getGLAccountForBranch('CUSTOMER_ACCOUNT', branchCode);
  
  // Process standard fee components
  const standardFees = [
    { amount: fees.processingFee || 0, type: 'PROCESSING_FEE', name: 'Processing Fee' },
    { amount: fees.insuranceFee || 0, type: 'INSURANCE_FEE', name: 'Insurance Premium' },
    { amount: fees.otherFees || 0, type: 'OTHER_FEES', name: 'Other Fees' },
    { amount: fees.upfrontInterest || 0, type: 'UPFRONT_INTEREST', name: 'Upfront Interest' }
  ];
  
  for (const [index, fee] of standardFees.entries()) {
    if (fee.amount > 0) {
      // Generate GL account for this branch
      const glCode = getGLAccountForBranch(fee.type, branchCode);
      
      // Verify GL account before creating entry
      await verifyGLAccount(glCode, 'CREDIT', t);
      
      // Create ledger transaction
      await createLedgerTransaction({
        glCode: glCode,
        amount: fee.amount,
        transactionType: GL_ACCOUNT_TEMPLATES[fee.type]?.transactionType || 'FEE_COLLECTION',
        description: `${fee.name} for loan ${loanAccount.ACCT_NO}`,
        userId: userId,
        branchCode: branchCode,
        metadata: {
          feeType: fee.type,
          loanAccountNo: loanAccount.ACCT_NO,
          customerId: loanAccount.CUST_ID,
          customerAccount: customerAccount.account_number,
          contraAccount: customerGLCode
        }
      }, t);
    }
  }
  
  // Process dynamic charges array
  if (fees.charges && Array.isArray(fees.charges)) {
    for (const [index, charge] of fees.charges.entries()) {
      if (charge.amount > 0) {
        const chargeType = detectFeeType(charge.name, charge.chargeCode);
        
        // Use charge's GL code if provided, otherwise generate dynamic GL code
        let glCode;
        if (charge.glAccountCode) {
          glCode = charge.glAccountCode;
        } else {
          glCode = getGLAccountForBranch(chargeType, branchCode);
        }
        
        // Verify GL account before creating entry
        await verifyGLAccount(glCode, 'CREDIT', t);
        
        await createLedgerTransaction({
          glCode: glCode,
          amount: charge.amount,
          transactionType: GL_ACCOUNT_TEMPLATES[chargeType]?.transactionType || 'CHARGE_COLLECTION',
          description: `${charge.name} for loan ${loanAccount.ACCT_NO}`,
          userId: userId,
          branchCode: branchCode,
          metadata: {
            feeType: chargeType,
            chargeCode: charge.chargeCode,
            chargeName: charge.name,
            loanAccountNo: loanAccount.ACCT_NO,
            customerId: loanAccount.CUST_ID,
            customerAccount: customerAccount.account_number,
            contraAccount: customerGLCode
          }
        }, t);
      }
    }
  }

  logger.info(`Created ledger entries for loan ${loanAccount.ACCT_NO} in branch ${branchCode}`);
};

// Disbursement method descriptions
export const getDisbursementMethodDescription = (method) => {
  const methodDescriptions = {
    'BANK_TRANSFER': 'Bank Transfer',
    'CASH': 'Cash',
    'MOBILE_MONEY': 'Mobile Money',
    'CHEQUE': 'Cheque',
    'DIRECT_CREDIT': 'Direct Credit'
  };
  
  return methodDescriptions[method] || method;
};

// Dynamic loan disbursement function
export const disburseFullAmount = async (loanAccount, customerAccount, userId, t, branchId, disbursementMethod = null) => {
  const fullAmount = loanAccount.DISBURSEMENT_LIMIT || loanAccount.loanAmount;
  
  if (fullAmount <= 0) {
    logger.warn(`Zero or negative loan amount for ${loanAccount.ACCT_NO}`);
    return;
  }

  // Get branch code from branch ID
  const branchCode = await getBranchCode(branchId, t);

  const previousBalance = customerAccount.ledger_balance;
  
  // CREDIT full loan amount to customer's account
  customerAccount.ledger_balance += fullAmount;
  
  // Determine disbursement method dynamically
  const method = disbursementMethod || loanAccount.disbursementMethod || 'BANK_TRANSFER';
  const methodDescription = getDisbursementMethodDescription(method);
  
  // Create credit transaction for customer account
  await Transaction.create({
    transactionId: `LOAN_DISB_${loanAccount.ACCT_NO}_${Date.now()}`,
    account_number: customerAccount.account_number,
    amount: fullAmount,
    transactionType: 'CREDIT',
    description: `Loan disbursement via ${methodDescription} for account ${loanAccount.ACCT_NO}`,
    balance: customerAccount.ledger_balance,
    previousBalance: previousBalance,
    createdBy: userId,
    transactionDate: new Date(),
    reference: `LOAN_DISB_${loanAccount.ACCT_NO}`,
    metadata: {
      loanAccountNo: loanAccount.ACCT_NO,
      disbursementMethod: method,
      loanPurpose: loanAccount.loanPurpose,
      branchCode: branchCode,
      branchId: branchId
    }
  }, { transaction: t });

  await customerAccount.save({ transaction: t });

  // Get the appropriate loan asset GL code for this branch
  const productType = loanAccount.PRODUCT_TYPE || loanAccount.productType;
  const loanAssetGLCode = getLoanAssetGLAccount(productType, branchCode);
  const customerGLCode = getGLAccountForBranch('CUSTOMER_ACCOUNT', branchCode);
  
  // Verify both GL accounts before creating entries
  await verifyGLAccount(loanAssetGLCode, 'DEBIT', t);
  await verifyGLAccount(customerGLCode, 'CREDIT', t);

  // Create dynamic ledger entry for loan disbursement
  await createLedgerTransaction({
    glCode: loanAssetGLCode,
    amount: fullAmount,
    transactionType: 'LOAN_DISBURSEMENT',
    description: `Loan disbursement to ${loanAccount.ACCT_NM || loanAccount.customerName} via ${methodDescription}`,
    userId: userId,
    branchCode: branchCode,
    metadata: {
      productType: productType,
      disbursementMethod: method,
      loanTerm: loanAccount.loanTerm,
      customerId: loanAccount.CUST_ID,
      customerAccount: customerAccount.account_number,
      contraAccount: customerGLCode
    }
  }, t);

  logger.info(`Full loan amount disbursed to ${loanAccount.ACCT_NM}: ${fullAmount} via ${method} in branch ${branchCode}`);
};

// Helper function to generate dynamic policy number
export const generatePolicyNumber = (loanAccount, insurance) => {
  const prefix = insurance.provider ? insurance.provider.substring(0, 3).toUpperCase() : 'INS';
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}_${loanAccount.ACCT_NO}_${timestamp}${random}`;
};

// Calculate default insurance coverage
export const calculateDefaultCoverage = (loanAccount) => {
  const loanAmount = loanAccount.DISBURSEMENT_LIMIT || loanAccount.loanAmount;
  // Default coverage: loan amount + 20% for additional protection
  return loanAmount * 1.2;
};

// Calculate coverage period based on loan term
export const calculateCoveragePeriod = (loanAccount, insurance) => {
  const startDate = insurance.startDate || new Date();
  const endDate = new Date(startDate);
  
  // Extend coverage slightly beyond loan maturity for safety
  const extensionDays = 30; // 30-day grace period
  
  const loanTerm = loanAccount.loanTerm?.toLowerCase();
  const termValue = loanAccount.TERM_VALUE || loanAccount.loanTermValue || 1;
  
  switch (loanTerm) {
    case 'weekly':
      endDate.setDate(endDate.getDate() + (termValue * 7) + extensionDays);
      break;
    case 'monthly':
      endDate.setMonth(endDate.getMonth() + termValue);
      endDate.setDate(endDate.getDate() + extensionDays);
      break;
    case 'yearly':
      endDate.setFullYear(endDate.getFullYear() + termValue);
      endDate.setDate(endDate.getDate() + extensionDays);
      break;
    default:
      endDate.setMonth(endDate.getMonth() + termValue);
      endDate.setDate(endDate.getDate() + extensionDays);
  }
  
  return {
    startDate: startDate,
    endDate: endDate,
    duration: Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) // days
  };
};

// Enhanced insurance activation with dynamic policy generation
export const activateInsurance = async (loanAccount, userId, t) => {
  const insurance = loanAccount.insuranceDetails;
  
  if (!insurance) {
    logger.warn(`No insurance details found for loan ${loanAccount.ACCT_NO}`);
    return null;
  }

  // Generate dynamic policy number if not provided
  const policyNumber = insurance.policyNumber || generatePolicyNumber(loanAccount, insurance);
  
  // Calculate dynamic coverage if not specified
  const insuredAmount = insurance.insuredAmount || calculateDefaultCoverage(loanAccount);
  
  // Determine coverage period
  const coveragePeriod = calculateCoveragePeriod(loanAccount, insurance);
  
  const insurancePolicy = await InsurancePolicy.create({
    policyNumber: policyNumber,
    loanAccount: loanAccount.id,
    customerId: loanAccount.CUST_ID,
    customerName: loanAccount.ACCT_NM || loanAccount.customerName,
    premiumAmount: insurance.premiumAmount,
    insuredAmount: insuredAmount,
    coverageType: insurance.coverageType || 'LOAN_PROTECTION',
    provider: insurance.provider || 'DEFAULT_INSURER',
    startDate: insurance.startDate || new Date(),
    endDate: coveragePeriod.endDate,
    coverageDuration: coveragePeriod.duration,
    status: 'ACTIVE',
    premiumPaid: true,
    paymentDate: new Date(),
    paymentMethod: 'LOAN_DISBURSEMENT',
    createdBy: userId,
    metadata: {
      loanAmount: loanAccount.DISBURSEMENT_LIMIT || loanAccount.loanAmount,
      loanTerm: loanAccount.loanTerm,
      termValue: loanAccount.TERM_VALUE || loanAccount.loanTermValue,
      productType: loanAccount.PRODUCT_TYPE || loanAccount.productType
    }
  }, { transaction: t });

  logger.info(`Insurance activated for loan ${loanAccount.ACCT_NO}: ${policyNumber} with coverage ${insuredAmount}`);
  
  return insurancePolicy;
};

// Utility to get all available GL account types
export const getGLAccountTypes = () => {
  return Object.keys(GL_ACCOUNT_TEMPLATES);
};

// Utility to get GL accounts for all branches
export const getGLAccountsForAllBranches = async () => {
  const branches = await Branch.findAll({ 
    where: { status: 'ACTIVE' }
  });
  
  const branchAccounts = {};
  
  for (const branch of branches) {
    if (branch.branchCode) {
      branchAccounts[branch.branchName] = {
        branchCode: branch.branchCode,
        accounts: getAllGLAccountsForBranch(branch.branchCode)
      };
    }
  }
  
  return branchAccounts;
};

// Complete loan processing with all steps in a single transaction
export const processLoanDisbursement = async (loanAccount, customerAccount, userId, branchId, disbursementMethod = null) => {
  const transaction = await sequelize.transaction();
  
  try {
    logger.info(`Starting loan processing for ${loanAccount.ACCT_NO}`);
    
    // Validate loan for disbursement
    const validation = validateLoanForDisbursement(loanAccount, customerAccount);
    if (!validation.isValid) {
      throw new Error(`Loan validation failed: ${validation.errors.join(', ')}`);
    }
    
    // Step 1: Debit fees from customer account
    await debitFeesFromCustomerAccount(loanAccount, customerAccount, userId, transaction, branchId);
    
    // Step 2: Activate insurance if applicable
    if (loanAccount.insuranceDetails?.premiumAmount > 0) {
      await activateInsurance(loanAccount, userId, transaction);
    }
    
    // Step 3: Disburse full loan amount
    await disburseFullAmount(loanAccount, customerAccount, userId, transaction, branchId, disbursementMethod);
    
    // Step 4: Update loan status and disbursement details
    loanAccount.status = 'ACTIVE';
    loanAccount.disbursementDate = new Date();
    loanAccount.disbursementMethod = disbursementMethod || loanAccount.disbursementMethod || 'BANK_TRANSFER';
    loanAccount.disbursedAmount = loanAccount.DISBURSEMENT_LIMIT || loanAccount.loanAmount;
    loanAccount.lastModifiedBy = userId;
    loanAccount.lastModifiedDate = new Date();
    
    await loanAccount.save({ transaction });
    
    // Commit transaction
    await transaction.commit();
    
    logger.info(`Loan processing completed successfully for ${loanAccount.ACCT_NO}`);
    
    return {
      success: true,
      loanAccountNo: loanAccount.ACCT_NO,
      customerAccount: customerAccount.account_number,
      disbursementAmount: loanAccount.DISBURSEMENT_LIMIT || loanAccount.loanAmount,
      feesDebited: calculateTotalFees(loanAccount.FEE_DETAILS || {}),
      timestamp: new Date()
    };
    
  } catch (error) {
    await transaction.rollback();
    logger.error(`Loan processing failed for ${loanAccount.ACCT_NO}:`, error);
    
    throw new Error(`Loan processing failed: ${error.message}`);
  }
};

// Validate loan for disbursement
export const validateLoanForDisbursement = (loanAccount, customerAccount) => {
  const errors = [];
  
  if (!loanAccount || !customerAccount) {
    errors.push('Loan account or customer account not provided');
  }
  
  if (loanAccount.status !== 'APPROVED') {
    errors.push(`Loan status must be APPROVED, current status: ${loanAccount.status}`);
  }
  
  const disbursementAmount = loanAccount.DISBURSEMENT_LIMIT || loanAccount.loanAmount;
  if (disbursementAmount <= 0) {
    errors.push('Loan disbursement limit must be greater than 0');
  }
  
  if (customerAccount.ledger_balance < 0) {
    errors.push('Customer account has insufficient balance');
  }
  
  const productType = loanAccount.PRODUCT_TYPE || loanAccount.productType;
  if (!productType) {
    errors.push('Loan product type is required');
  }
  
  if (!loanAccount.CUST_ID) {
    errors.push('Customer ID is required');
  }
  
  if (!loanAccount.ACCT_NO) {
    errors.push('Loan account number is required');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Get transaction summary for a loan
export const getLoanTransactionSummary = async (loanAccountNo) => {
  try {
    const transactions = await Transaction.findAll({
      where: {
        metadata: {
          loanAccountNo: loanAccountNo
        }
      },
      order: [['transactionDate', 'DESC']],
      limit: 50
    });
    
    const ledgerEntries = await Ledger.findAll({
      where: {
        metadata: {
          loanAccountNo: loanAccountNo
        }
      },
      order: [['transactionDate', 'DESC']],
      limit: 50
    });
    
    const totalDebits = transactions
      .filter(t => t.transactionType === 'DEBIT')
      .reduce((sum, t) => sum + t.amount, 0);
    
    const totalCredits = transactions
      .filter(t => t.transactionType === 'CREDIT')
      .reduce((sum, t) => sum + t.amount, 0);
    
    return {
      loanAccountNo,
      transactionCount: transactions.length,
      ledgerEntryCount: ledgerEntries.length,
      totalDebits,
      totalCredits,
      netAmount: totalCredits - totalDebits,
      transactions,
      ledgerEntries,
      lastUpdated: new Date()
    };
    
  } catch (error) {
    logger.error(`Error getting transaction summary for ${loanAccountNo}:`, error);
    throw error;
  }
};

// Get loan application details for processing
export const getLoanApplicationForProcessing = async (loanId) => {
  try {
    const loanAccount = await LoanAccount.findByPk(loanId);
    
    if (!loanAccount) {
      throw new Error(`Loan application not found: ${loanId}`);
    }
    
    // Get associated customer account
    // This assumes you have a Customer model with an account
    // Adjust based on your actual data model
    const Customer = (await import('../models/Customer.js')).default;
    const customer = await Customer.findOne({
      where: { CUST_ID: loanAccount.CUST_ID }
    });
    
    if (!customer) {
      throw new Error(`Customer not found for loan: ${loanId}`);
    }
    
    return {
      loanAccount,
      customer,
      isValid: loanAccount.status === 'APPROVED',
      validation: validateLoanForDisbursement(loanAccount, customer)
    };
  } catch (error) {
    logger.error(`Error getting loan application ${loanId}:`, error);
    throw error;
  }
};

// Update loan account status
export const updateLoanAccountStatus = async (loanId, status, userId, transaction = null) => {
  try {
    const loanAccount = await LoanAccount.findByPk(loanId, { transaction });
    
    if (!loanAccount) {
      throw new Error(`Loan account not found: ${loanId}`);
    }
    
    loanAccount.status = status;
    loanAccount.lastModifiedBy = userId;
    loanAccount.lastModifiedDate = new Date();
    
    await loanAccount.save({ transaction });
    
    logger.info(`Updated loan ${loanAccount.ACCT_NO} status to ${status}`);
    
    return loanAccount;
  } catch (error) {
    logger.error(`Error updating loan status for ${loanId}:`, error);
    throw error;
  }
};

// Get loan statistics for dashboard
export const getLoanStatistics = async (branchId = null) => {
  try {
    const whereClause = branchId ? { branchId } : {};
    
    const totalLoans = await LoanAccount.count({ where: whereClause });
    const activeLoans = await LoanAccount.count({ 
      where: { ...whereClause, status: 'ACTIVE' } 
    });
    const approvedLoans = await LoanAccount.count({ 
      where: { ...whereClause, status: 'APPROVED' } 
    });
    const pendingLoans = await LoanAccount.count({ 
      where: { ...whereClause, status: 'PENDING' } 
    });
    
    const totalDisbursed = await LoanAccount.sum('DISBURSEMENT_LIMIT', {
      where: { ...whereClause, status: 'ACTIVE' }
    }) || 0;
    
    return {
      totalLoans,
      activeLoans,
      approvedLoans,
      pendingLoans,
      totalDisbursed,
      averageLoanAmount: activeLoans > 0 ? totalDisbursed / activeLoans : 0
    };
  } catch (error) {
    logger.error('Error getting loan statistics:', error);
    throw error;
  }
};

export default {
  // Core templates
  GL_ACCOUNT_TEMPLATES,
  LOAN_PRODUCT_TEMPLATES,
  
  // Account generation
  generateGLAccount,
  getGLAccountForBranch,
  getLoanAssetGLAccount,
  getAllGLAccountsForBranch,
  getGLAccountsForAllBranches,
  
  // Branch operations
  getBranchCode,
  
  // Loan account operations
  getLoanAccountByNumber,
  getLoanAccountById,
  getLoanApplicationForProcessing,
  updateLoanAccountStatus,
  getLoanStatistics,
  
  // Fee processing
  detectFeeType,
  calculateTotalFees,
  getFeeBreakdown,
  
  // GL account operations
  verifyGLAccount,
  createLedgerTransaction,
  
  // Loan processing functions
  debitFeesFromCustomerAccount,
  createDynamicLedgerEntries,
  getDisbursementMethodDescription,
  disburseFullAmount,
  
  // Insurance operations
  generatePolicyNumber,
  calculateDefaultCoverage,
  calculateCoveragePeriod,
  activateInsurance,
  
  // GL account types
  getGLAccountTypes,
  
  // Complete loan processing
  processLoanDisbursement,
  validateLoanForDisbursement,
  getLoanTransactionSummary
};