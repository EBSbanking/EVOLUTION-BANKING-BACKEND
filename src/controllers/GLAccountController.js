import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js';
import GLAccount from '../models/GLAccount.js';
import GLAccountCategory from '../models/GLAccountCategory.js';
import Subfolder from '../models/Subfolder.js';
import Branch from '../models/Branch.js';
import Organization from '../models/organization.js';
import {
  GL_ACCOUNT_TEMPLATES,
  LOAN_PRODUCT_TEMPLATES,
  generateGLAccount,
  getGLAccountForBranch,
  getAllGLAccountsForBranch
} from '../utils/loanDisbursementHelpers.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import Reconciliation from '../models/Reconciliation.js';
import {
  generateJournalId,
  generateGLAccountNumber,
  createRootSubfolder,
  validateGLAccountFormat,
  generateNextGLAcctId,
  generateSimpleGLAcctId
} from '../utils/generateGLANumber.js';
import GLAccountSeg from '../models/GLAccountSeg.js';
import AuditLogger from '../utils/AuditLogger.js';
// ==================== ENHANCED COA HELPER FUNCTIONS ====================
// UPDATED: Enhanced COA account number generation with frontend alignment
const generateCOAAccountNumber = ({ organizationCode, branchCode, accountClass, accountType, subAccount = '001' }) => {
  const entity = String(organizationCode).padStart(2, '0');
  const branch = String(branchCode).padStart(3, '0');
  const classCode = getAccountClassCode(accountClass);
  const typeCode = getAccountTypeCode(accountType);
  const subAcc = String(subAccount).padStart(3, '0');
  return `${entity}${branch}${classCode}${typeCode}${subAcc}`;
};
// UPDATED: Enhanced account class mapping - ALIGNED WITH FRONTEND
const getAccountClassCode = (accountClass) => {
  const classMap = {
    'ASSET': '001',
    'LIABILITY': '101',
    'EQUITY': '201',
    'REVENUE': '301',
    'EXPENSE': '401',
    'CONTROL_SUSPENSE': '501',
    'TAX': '601',
    'SPECIAL_PURPOSE': '701',
    'OTHER': '999'
  };
  return classMap[accountClass] || '999';
};
// UPDATED: Enhanced account type mapping - FULLY ALIGNED WITH FRONTEND ENUM
const getAccountTypeCode = (accountType) => {
  const typeMap = {
    // Assets - Frontend types
    'CURRENT_ASSET': '001',
    'CUSTOMER_ACCOUNT': '002',
    'CASH_ACCOUNT': '003',
    'BANK_ACCOUNT': '004',
    'RECEIVABLE_ACCOUNT': '005',
    'FIXED_ASSET': '006',
    'LOAN_ASSET': '007',
    'INTANGIBLE_ASSET': '008',
    'OTHER_ASSET': '009',
    'PROPERTY_PLANT_EQUIPMENT': '010',
    'INVESTMENT_ASSET': '011',
  
    // NEW: Enhanced Asset Types
    'LOAN_PORTFOLIO': '012',
    'LOAN_RECEIVABLE': '013',
    'INTEREST_RECEIVABLE': '014',
    'FEE_RECEIVABLE': '015',
    'ACCRUED_INTEREST': '016',
    'DUE_FROM_BANKS': '017',
    'TRADING_SECURITIES': '018',
    'HELD_TO_MATURITY_SECURITIES': '019',
    'INVENTORY': '020',
    'PREPAID_EXPENSE': '021',
    'DEFERRED_TAX_ASSET': '022',
    'GOODWILL': '023',
    'LEASE_ASSET': '024',
  
    // Liabilities - Frontend types
    'CURRENT_LIABILITY': '101',
    'LIABILITY_ACCOUNT': '102',
    'PAYABLE_ACCOUNT': '103',
    'LONG_TERM_LIABILITY': '104',
    'LOAN_LIABILITY': '105',
    'DEPOSITS_LIABILITY': '106',
    'OTHER_LIABILITY': '107',
  
    // NEW: Enhanced Liability Types
    'CUSTOMER_DEPOSITS': '108',
    'SAVINGS_DEPOSITS': '109',
    'TIME_DEPOSITS': '110',
    'INTEREST_PAYABLE': '111',
    'ACCRUED_EXPENSES': '112',
    'TAX_PAYABLE': '113',
    'DIVIDEND_PAYABLE': '114',
    'BORROWINGS': '115',
    'BONDS_PAYABLE': '116',
    'LEASE_LIABILITY': '117',
    'DEFERRED_TAX_LIABILITY': '118',
    'PROVISIONS': '119',
    'CONTINGENT_LIABILITY': '120',
  
    // Equity - Frontend types
    'SHARE_CAPITAL': '201',
    'CAPITAL_ACCOUNT': '202',
    'RETAINED_EARNINGS': '203',
    'EQUITY_ACCOUNT': '204',
    'OTHER_EQUITY': '205',
  
    // NEW: Enhanced Equity Types
    'ADDITIONAL_PAID_IN_CAPITAL': '206',
    'TREASURY_STOCK': '207',
    'OTHER_COMPREHENSIVE_INCOME': '208',
    'DONATED_CAPITAL': '209',
    'REVALUATION_RESERVE': '210',
    'CAPITAL_RESERVE': '211',
    'STATUTORY_RESERVE': '212',
  
    // Revenue - Frontend types
    'OPERATING_REVENUE': '301',
    'REVENUE_ACCOUNT': '302',
    'SERVICE_INCOME': '303',
    'INTEREST_INCOME': '304',
    'FEE_INCOME': '305',
    'PROCESSING_FEE': '306',
    'INSURANCE_FEE': '307',
    'UPFRONT_INTEREST': '308',
    'OTHER_FEES': '309',
    'OTHER_REVENUE': '310',
  
    // NEW: Enhanced Revenue Types
    'LOAN_INTEREST_INCOME': '311',
    'INVESTMENT_INTEREST_INCOME': '312',
    'COMMISSION_INCOME': '313',
    'TRADING_INCOME': '314',
    'DIVIDEND_INCOME': '315',
    'RENTAL_INCOME': '316',
    'LATE_FEE_INCOME': '317',
    'PENALTY_INCOME': '318',
    'FOREIGN_EXCHANGE_GAIN': '319',
    'REALIZED_GAIN': '320',
    'UNREALIZED_GAIN': '321',
    'SALES_REVENUE': '322',
  
    // Expenses - Frontend types
    'OPERATING_EXPENSE': '401',
    'EXPENSE_ACCOUNT': '402',
    'STAFF_EXPENSE': '403',
    'ADMINISTRATIVE_EXPENSE': '404',
    'ADMIN_EXPENSE': '405',
    'FINANCE_COST': '406',
    'INTEREST_EXPENSE': '407',
    'OTHER_EXPENSE': '408',
  
    // NEW: Enhanced Expense Types
    'SALARIES_WAGES': '409',
    'EMPLOYEE_BENEFITS': '410',
    'RENT_EXPENSE': '411',
    'UTILITIES_EXPENSE': '412',
    'DEPRECIATION_EXPENSE': '413',
    'AMORTIZATION_EXPENSE': '414',
    'PROFESSIONAL_FEES': '415',
    'MARKETING_EXPENSE': '416',
    'TRAVEL_EXPENSE': '417',
    'INSURANCE_EXPENSE': '418',
    'REPAIRS_MAINTENANCE': '419',
    'BAD_DEBT_EXPENSE': '420',
    'LOAN_LOSS_PROVISION': '421',
    'FOREIGN_EXCHANGE_LOSS': '422',
    'TAX_EXPENSE': '423',
    'BORROWING_COST': '424',
  
    // NEW: Control & Suspense Accounts
    'SUSPENSE_ACCOUNT': '501',
    'CLEARING_ACCOUNT': '502',
    'CONTROL_ACCOUNT': '503',
    'INTERCOMPANY_ACCOUNT': '504',
    'RECONCILIATION_ACCOUNT': '505',
  
    // NEW: Loan Specific Accounts
    'LOAN_SUSPENSE': '506',
    'LOAN_DISBURSEMENT_CONTROL': '507',
    'LOAN_REPAYMENT_CONTROL': '508',
    'INTEREST_SUSPENSE': '509',
    'FEE_SUSPENSE': '510',
    'UNAPPLIED_FUNDS': '511',
    'UNEARNED_INTEREST': '512',
    'LOAN_CHARGE_OFF': '513',
    'PROVISION_FOR_LOAN_LOSSES': '514',
    'RECOVERIES_ACCOUNT': '515',
    'DELINQUENT_LOAN_ACCOUNT': '516',
    'RESTRUCTURED_LOAN_ACCOUNT': '517',
  
    // NEW: Tax Accounts
    'WITHHOLDING_TAX_PAYABLE': '601',
    'VAT_PAYABLE': '602',
    'INCOME_TAX_PAYABLE': '603',
    'DEFERRED_TAX': '604',
  
    // NEW: Special Purpose Accounts
    'CONTINGENT_ACCOUNT': '701',
    'MEMORANDUM_ACCOUNT': '702',
    'OFF_BALANCE_SHEET_ACCOUNT': '703',
    'NOSTRO_ACCOUNT': '704',
    'VOSTRO_ACCOUNT': '705',
  
    // Special Types
    'INTER_BRANCH': '801',
    'CONTRA_ASSET': '802',
    'CONTRA_LIABILITY': '803'
  };
  return typeMap[accountType] || '999';
};
// UPDATED: Helper function to detect account class from type code
const getAccountClassFromTypeCode = (typeCode) => {
  const code = parseInt(typeCode);
  if (code >= 1 && code <= 99) return 'ASSET';
  if (code >= 101 && code <= 199) return 'LIABILITY';
  if (code >= 201 && code <= 299) return 'EQUITY';
  if (code >= 301 && code <= 399) return 'REVENUE';
  if (code >= 401 && code <= 499) return 'EXPENSE';
  if (code >= 501 && code <= 599) return 'CONTROL_SUSPENSE';
  if (code >= 601 && code <= 699) return 'TAX';
  if (code >= 701 && code <= 799) return 'SPECIAL_PURPOSE';
  return 'OTHER';
};
// UPDATED: Enhanced financial statement mapping
const mapToFinancialStatementCategory = (accountClass, accountType) => {
  const balanceSheetClasses = ['ASSET', 'LIABILITY', 'EQUITY', 'CONTROL_SUSPENSE', 'TAX', 'SPECIAL_PURPOSE'];
  const incomeStatementClasses = ['REVENUE', 'EXPENSE'];
  if (balanceSheetClasses.includes(accountClass)) {
    return 'BALANCE_SHEET';
  } else if (incomeStatementClasses.includes(accountClass)) {
    return 'INCOME_STATEMENT';
  }
  return 'BALANCE_SHEET';
};
// UPDATED: Enhanced sub-category mapping aligned with frontend types
const mapToFinancialStatementSubCategory = (accountClass, accountType) => {
  const mapping = {
    'ASSET': {
      'CURRENT_ASSET': 'CURRENT_ASSETS',
      'CUSTOMER_ACCOUNT': 'CURRENT_ASSETS',
      'CASH_ACCOUNT': 'CASH_EQUIVALENTS',
      'BANK_ACCOUNT': 'CASH_EQUIVALENTS',
      'RECEIVABLE_ACCOUNT': 'RECEIVABLE_ASSETS',
      'LOAN_ASSET': 'LOAN_ASSETS',
      'FIXED_ASSET': 'FIXED_ASSETS',
      'INTANGIBLE_ASSET': 'INTANGIBLE_ASSETS',
      'OTHER_ASSET': 'OTHER_ASSETS',
      'PROPERTY_PLANT_EQUIPMENT': 'FIXED_ASSETS',
      'INVESTMENT_ASSET': 'INVESTMENT_ASSETS',
      'LOAN_PORTFOLIO': 'LOAN_ASSETS',
      'LOAN_RECEIVABLE': 'LOAN_ASSETS',
      'INTEREST_RECEIVABLE': 'RECEIVABLE_ASSETS',
      'FEE_RECEIVABLE': 'RECEIVABLE_ASSETS',
      'ACCRUED_INTEREST': 'OTHER_ASSETS',
      'DUE_FROM_BANKS': 'CASH_EQUIVALENTS',
      'TRADING_SECURITIES': 'INVESTMENT_ASSETS',
      'HELD_TO_MATURITY_SECURITIES': 'INVESTMENT_ASSETS',
      'INVENTORY': 'CURRENT_ASSETS',
      'PREPAID_EXPENSE': 'CURRENT_ASSETS',
      'DEFERRED_TAX_ASSET': 'OTHER_ASSETS',
      'GOODWILL': 'INTANGIBLE_ASSETS',
      'LEASE_ASSET': 'FIXED_ASSETS'
    },
    'LIABILITY': {
      'CURRENT_LIABILITY': 'CURRENT_LIABILITIES',
      'LIABILITY_ACCOUNT': 'CURRENT_LIABILITIES',
      'PAYABLE_ACCOUNT': 'CURRENT_LIABILITIES',
      'LONG_TERM_LIABILITY': 'LONG_TERM_LIABILITIES',
      'LOAN_LIABILITY': 'LONG_TERM_LIABILITIES',
      'DEPOSITS_LIABILITY': 'DEPOSIT_LIABILITIES',
      'OTHER_LIABILITY': 'OTHER_LIABILITIES',
      'CUSTOMER_DEPOSITS': 'DEPOSIT_LIABILITIES',
      'SAVINGS_DEPOSITS': 'DEPOSIT_LIABILITIES',
      'TIME_DEPOSITS': 'DEPOSIT_LIABILITIES',
      'INTEREST_PAYABLE': 'CURRENT_LIABILITIES',
      'ACCRUED_EXPENSES': 'CURRENT_LIABILITIES',
      'TAX_PAYABLE': 'CURRENT_LIABILITIES',
      'DIVIDEND_PAYABLE': 'CURRENT_LIABILITIES',
      'BORROWINGS': 'BORROWED_FUNDS',
      'BONDS_PAYABLE': 'BORROWED_FUNDS',
      'LEASE_LIABILITY': 'LONG_TERM_LIABILITIES',
      'DEFERRED_TAX_LIABILITY': 'OTHER_LIABILITIES',
      'PROVISIONS': 'OTHER_LIABILITIES',
      'CONTINGENT_LIABILITY': 'OTHER_LIABILITIES'
    },
    'EQUITY': {
      'SHARE_CAPITAL': 'SHARE_CAPITAL',
      'CAPITAL_ACCOUNT': 'CAPITAL_ACCOUNTS',
      'RETAINED_EARNINGS': 'RETAINED_EARNINGS',
      'EQUITY_ACCOUNT': 'OTHER_EQUITY',
      'OTHER_EQUITY': 'OTHER_EQUITY',
      'ADDITIONAL_PAID_IN_CAPITAL': 'SHARE_CAPITAL',
      'TREASURY_STOCK': 'OTHER_EQUITY',
      'OTHER_COMPREHENSIVE_INCOME': 'OTHER_EQUITY',
      'DONATED_CAPITAL': 'CAPITAL_ACCOUNTS',
      'REVALUATION_RESERVE': 'RESERVES',
      'CAPITAL_RESERVE': 'RESERVES',
      'STATUTORY_RESERVE': 'RESERVES'
    },
    'REVENUE': {
      'OPERATING_REVENUE': 'OPERATING_REVENUE',
      'REVENUE_ACCOUNT': 'OPERATING_REVENUE',
      'SERVICE_INCOME': 'SERVICE_INCOME',
      'INTEREST_INCOME': 'INTEREST_INCOME',
      'FEE_INCOME': 'FEE_INCOME',
      'PROCESSING_FEE': 'FEE_INCOME',
      'INSURANCE_FEE': 'FEE_INCOME',
      'UPFRONT_INTEREST': 'INTEREST_INCOME',
      'OTHER_FEES': 'OTHER_REVENUE',
      'OTHER_REVENUE': 'OTHER_REVENUE',
      'LOAN_INTEREST_INCOME': 'INTEREST_INCOME',
      'INVESTMENT_INTEREST_INCOME': 'INTEREST_INCOME',
      'COMMISSION_INCOME': 'COMMISSION_INCOME',
      'TRADING_INCOME': 'OTHER_REVENUE',
      'DIVIDEND_INCOME': 'INVESTMENT_INCOME',
      'RENTAL_INCOME': 'OTHER_REVENUE',
      'LATE_FEE_INCOME': 'FEE_INCOME',
      'PENALTY_INCOME': 'FEE_INCOME',
      'FOREIGN_EXCHANGE_GAIN': 'OTHER_REVENUE',
      'REALIZED_GAIN': 'OTHER_REVENUE',
      'UNREALIZED_GAIN': 'OTHER_REVENUE',
      'SALES_REVENUE': 'OPERATING_REVENUE'
    },
    'EXPENSE': {
      'OPERATING_EXPENSE': 'OPERATING_EXPENSES',
      'EXPENSE_ACCOUNT': 'OPERATING_EXPENSES',
      'STAFF_EXPENSE': 'STAFF_EXPENSES',
      'ADMINISTRATIVE_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'ADMIN_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'FINANCE_COST': 'FINANCE_COSTS',
      'INTEREST_EXPENSE': 'FINANCE_COSTS',
      'OTHER_EXPENSE': 'OTHER_EXPENSES',
      'SALARIES_WAGES': 'STAFF_EXPENSES',
      'EMPLOYEE_BENEFITS': 'STAFF_EXPENSES',
      'RENT_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'UTILITIES_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'DEPRECIATION_EXPENSE': 'DEPRECIATION_EXPENSE',
      'AMORTIZATION_EXPENSE': 'AMORTIZATION_EXPENSE',
      'PROFESSIONAL_FEES': 'ADMINISTRATIVE_EXPENSES',
      'MARKETING_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'TRAVEL_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'INSURANCE_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'REPAIRS_MAINTENANCE': 'ADMINISTRATIVE_EXPENSES',
      'BAD_DEBT_EXPENSE': 'PROVISION_EXPENSE',
      'LOAN_LOSS_PROVISION': 'PROVISION_EXPENSE',
      'FOREIGN_EXCHANGE_LOSS': 'OTHER_EXPENSES',
      'TAX_EXPENSE': 'TAX_EXPENSE',
      'BORROWING_COST': 'FINANCE_COSTS'
    },
    'CONTROL_SUSPENSE': {
      'SUSPENSE_ACCOUNT': 'SUSPENSE_ACCOUNTS',
      'CLEARING_ACCOUNT': 'CLEARING_ACCOUNTS',
      'CONTROL_ACCOUNT': 'CONTROL_ACCOUNTS',
      'INTERCOMPANY_ACCOUNT': 'INTERCOMPANY_ACCOUNTS',
      'RECONCILIATION_ACCOUNT': 'CLEARING_ACCOUNTS',
      'LOAN_SUSPENSE': 'SUSPENSE_ACCOUNTS',
      'LOAN_DISBURSEMENT_CONTROL': 'CONTROL_ACCOUNTS',
      'LOAN_REPAYMENT_CONTROL': 'CONTROL_ACCOUNTS',
      'INTEREST_SUSPENSE': 'SUSPENSE_ACCOUNTS',
      'FEE_SUSPENSE': 'SUSPENSE_ACCOUNTS',
      'UNAPPLIED_FUNDS': 'SUSPENSE_ACCOUNTS',
      'UNEARNED_INTEREST': 'SUSPENSE_ACCOUNTS',
      'LOAN_CHARGE_OFF': 'CONTROL_ACCOUNTS',
      'PROVISION_FOR_LOAN_LOSSES': 'CONTROL_ACCOUNTS',
      'RECOVERIES_ACCOUNT': 'CONTROL_ACCOUNTS',
      'DELINQUENT_LOAN_ACCOUNT': 'CONTROL_ACCOUNTS',
      'RESTRUCTURED_LOAN_ACCOUNT': 'CONTROL_ACCOUNTS'
    },
    'TAX': {
      'WITHHOLDING_TAX_PAYABLE': 'CURRENT_LIABILITIES',
      'VAT_PAYABLE': 'CURRENT_LIABILITIES',
      'INCOME_TAX_PAYABLE': 'CURRENT_LIABILITIES',
      'DEFERRED_TAX': 'OTHER_LIABILITIES'
    },
    'SPECIAL_PURPOSE': {
      'CONTINGENT_ACCOUNT': 'CONTROL_ACCOUNTS',
      'MEMORANDUM_ACCOUNT': 'CONTROL_ACCOUNTS',
      'OFF_BALANCE_SHEET_ACCOUNT': 'CONTROL_ACCOUNTS',
      'NOSTRO_ACCOUNT': 'CASH_EQUIVALENTS',
      'VOSTRO_ACCOUNT': 'CASH_EQUIVALENTS'
    }
  };
  return mapping[accountClass]?.[accountType] || 'OTHER_ASSETS';
};
// UPDATED: Enhanced account type normalization
const normalizeAccountType = (frontendAccountType) => {
  // Since we're now fully aligned with frontend, most types should match directly
  // This function handles any legacy mappings or special cases
  const specialMappings = {
    'INTER_BRANCH': 'INTER_BRANCH',
    'INTER_BRANCH_PAYABLE': 'PAYABLE_ACCOUNT',
    'INTER_BRANCH_RECEIVABLE': 'RECEIVABLE_ACCOUNT'
  };
  return specialMappings[frontendAccountType] || frontendAccountType;
};
// UPDATED: Enhanced branch code normalization
const normalizeBranchCode = (branchCode) => {
  if (!branchCode) return null;
  const code = String(branchCode);
  const digitsOnly = code.replace(/\D/g, '');
  // Prevent reserved branch codes
  if (digitsOnly === '000') {
    throw new Error('Branch code 000 is reserved and cannot be used');
  }
  return digitsOnly.padStart(3, '0');
};
// UPDATED: Enhanced sub-account code generation
const generateSubAccountCode = (accountClass, accountType, metadata = {}) => {
  // Generate meaningful sub-account codes based on account characteristics
  const subAccountMap = {
    // Main account types
    'CASH_ACCOUNT': '001',
    'BANK_ACCOUNT': '002',
    'RECEIVABLE_ACCOUNT': '003',
    'LOAN_ASSET': '004',
    'FIXED_ASSET': '005',
    'DEPOSITS_LIABILITY': '101',
    'LOAN_LIABILITY': '102',
  
    // Control and suspense accounts
    'CONTROL_ACCOUNT': '901',
    'SUSPENSE_ACCOUNT': '902',
    'INTER_BRANCH': '801'
  };
  return subAccountMap[accountType] || '001';
};
// UPDATED: Enhanced normal balance determination
const getNormalBalance = (accountClass) => {
  const normalBalanceMap = {
    'ASSET': 'DEBIT',
    'LIABILITY': 'CREDIT',
    'EQUITY': 'CREDIT',
    'REVENUE': 'CREDIT',
    'EXPENSE': 'DEBIT',
    'CONTROL_SUSPENSE': 'DEBIT', // Most control accounts are debit normal
    'TAX': 'CREDIT', // Most tax accounts are liabilities
    'SPECIAL_PURPOSE': 'DEBIT'
  };
  return normalBalanceMap[accountClass] || 'DEBIT';
};
// UPDATED: Enhanced account level determination
const determineAccountLevel = (level, isControlAccount, parentAccountNo) => {
  if (isControlAccount && !parentAccountNo) return 1; // Top-level control account
  if (isControlAccount && parentAccountNo) return 2; // Sub-control account
  if (parentAccountNo && !isControlAccount) return 3; // Detail account with parent
  return 4; // Standalone detail account
};
// UPDATED: Enhanced account class and type validation
const validateAccountClassType = (accountClass, accountType) => {
  const validCombinations = {
    'ASSET': [
      'CURRENT_ASSET', 'CUSTOMER_ACCOUNT', 'CASH_ACCOUNT', 'BANK_ACCOUNT', 'RECEIVABLE_ACCOUNT',
      'FIXED_ASSET', 'LOAN_ASSET', 'INTANGIBLE_ASSET', 'OTHER_ASSET', 'PROPERTY_PLANT_EQUIPMENT',
      'INVESTMENT_ASSET', 'LOAN_PORTFOLIO', 'LOAN_RECEIVABLE', 'INTEREST_RECEIVABLE', 'FEE_RECEIVABLE',
      'ACCRUED_INTEREST', 'DUE_FROM_BANKS', 'TRADING_SECURITIES', 'HELD_TO_MATURITY_SECURITIES',
      'INVENTORY', 'PREPAID_EXPENSE', 'DEFERRED_TAX_ASSET', 'GOODWILL', 'LEASE_ASSET'
    ],
    'LIABILITY': [
      'CURRENT_LIABILITY', 'LIABILITY_ACCOUNT', 'PAYABLE_ACCOUNT', 'LONG_TERM_LIABILITY', 'LOAN_LIABILITY',
      'DEPOSITS_LIABILITY', 'OTHER_LIABILITY', 'CUSTOMER_DEPOSITS', 'SAVINGS_DEPOSITS', 'TIME_DEPOSITS',
      'INTEREST_PAYABLE', 'ACCRUED_EXPENSES', 'TAX_PAYABLE', 'DIVIDEND_PAYABLE', 'BORROWINGS', 'BONDS_PAYABLE',
      'LEASE_LIABILITY', 'DEFERRED_TAX_LIABILITY', 'PROVISIONS', 'CONTINGENT_LIABILITY'
    ],
    'EQUITY': [
      'SHARE_CAPITAL', 'CAPITAL_ACCOUNT', 'RETAINED_EARNINGS', 'EQUITY_ACCOUNT', 'OTHER_EQUITY',
      'ADDITIONAL_PAID_IN_CAPITAL', 'TREASURY_STOCK', 'OTHER_COMPREHENSIVE_INCOME', 'DONATED_CAPITAL',
      'REVALUATION_RESERVE', 'CAPITAL_RESERVE', 'STATUTORY_RESERVE'
    ],
    'REVENUE': [
      'OPERATING_REVENUE', 'REVENUE_ACCOUNT', 'SERVICE_INCOME', 'INTEREST_INCOME', 'FEE_INCOME', 'PROCESSING_FEE',
      'INSURANCE_FEE', 'UPFRONT_INTEREST', 'OTHER_FEES', 'OTHER_REVENUE', 'LOAN_INTEREST_INCOME', 'INVESTMENT_INTEREST_INCOME',
      'COMMISSION_INCOME', 'TRADING_INCOME', 'DIVIDEND_INCOME', 'RENTAL_INCOME', 'LATE_FEE_INCOME', 'PENALTY_INCOME',
      'FOREIGN_EXCHANGE_GAIN', 'REALIZED_GAIN', 'UNREALIZED_GAIN', 'SALES_REVENUE'
    ],
    'EXPENSE': [
      'OPERATING_EXPENSE', 'EXPENSE_ACCOUNT', 'STAFF_EXPENSE', 'ADMINISTRATIVE_EXPENSE', 'ADMIN_EXPENSE', 'FINANCE_COST',
      'INTEREST_EXPENSE', 'OTHER_EXPENSE', 'SALARIES_WAGES', 'EMPLOYEE_BENEFITS', 'RENT_EXPENSE', 'UTILITIES_EXPENSE',
      'DEPRECIATION_EXPENSE', 'AMORTIZATION_EXPENSE', 'PROFESSIONAL_FEES', 'MARKETING_EXPENSE', 'TRAVEL_EXPENSE',
      'INSURANCE_EXPENSE', 'REPAIRS_MAINTENANCE', 'BAD_DEBT_EXPENSE', 'LOAN_LOSS_PROVISION', 'FOREIGN_EXCHANGE_LOSS',
      'TAX_EXPENSE', 'BORROWING_COST'
    ],
    'CONTROL_SUSPENSE': [
      'SUSPENSE_ACCOUNT', 'CLEARING_ACCOUNT', 'CONTROL_ACCOUNT', 'INTERCOMPANY_ACCOUNT', 'RECONCILIATION_ACCOUNT',
      'LOAN_SUSPENSE', 'LOAN_DISBURSEMENT_CONTROL', 'LOAN_REPAYMENT_CONTROL', 'INTEREST_SUSPENSE', 'FEE_SUSPENSE',
      'UNAPPLIED_FUNDS', 'UNEARNED_INTEREST', 'LOAN_CHARGE_OFF', 'PROVISION_FOR_LOAN_LOSSES', 'RECOVERIES_ACCOUNT',
      'DELINQUENT_LOAN_ACCOUNT', 'RESTRUCTURED_LOAN_ACCOUNT'
    ],
    'TAX': [
      'WITHHOLDING_TAX_PAYABLE', 'VAT_PAYABLE', 'INCOME_TAX_PAYABLE', 'DEFERRED_TAX'
    ],
    'SPECIAL_PURPOSE': [
      'CONTINGENT_ACCOUNT', 'MEMORANDUM_ACCOUNT', 'OFF_BALANCE_SHEET_ACCOUNT', 'NOSTRO_ACCOUNT', 'VOSTRO_ACCOUNT'
    ]
  };
  if (!validCombinations[accountClass]?.includes(accountType)) {
    throw new Error(`Invalid account type '${accountType}' for account class '${accountClass}'`);
  }
};
// ==================== ENHANCED COA ACCOUNT CREATION ====================
const createCOAAlignedGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        organizationCode,
        organizationName,
        branchCode,
        branchName,
        accountClass, // Can be at root or in metadata
        accountType, // Can be at root or in metadata
        ACCT_DESC,
        level = 4,
        CREATED_BY,
        // COA Structure
        parentAccountNo = null,
        isControlAccount = false,
        isSummaryAccount = false,
        // Balance Settings
        openingBalance = 0,
        allowNegative = false,
        // Additional Metadata
        productType,
        subAccount,
        metadata = {}
      } = req.body;

      // Resolve accountClass and accountType from metadata if not at root
      const resolvedAccountClass = accountClass || metadata.accountClass;
      const resolvedAccountType = accountType || metadata.accountType;

      // Validate required fields using resolved values
      if (!organizationCode || !branchCode || !resolvedAccountClass || !resolvedAccountType || !ACCT_DESC || !CREATED_BY) {
        throw new Error(`Missing required fields: organizationCode, branchCode, accountClass, accountType, ACCT_DESC, CREATED_BY`);
      }

      // Use resolved values going forward
      const finalAccountClass = resolvedAccountClass;
      const finalAccountType = resolvedAccountType;

      // Normalize and validate branch code
      const normalizedBranchCode = normalizeBranchCode(branchCode);

      // Normalize account type to ensure compatibility
      const normalizedAccountType = normalizeAccountType(finalAccountType);

      // Validate account class and type consistency
      validateAccountClassType(finalAccountClass, normalizedAccountType);

      // Validate organization and branch
      const organization = await Organization.findOne({ organizationCode }).session(session);
      if (!organization) {
        throw new Error(`Organization with code ${organizationCode} not found`);
      }
      const branch = await Branch.findOne({
        organizationCode,
        branchCode: normalizedBranchCode
      }).session(session);
    
      if (!branch) {
        throw new Error(`Branch with code ${normalizedBranchCode} not found in organization ${organizationCode}`);
      }

      // Generate sub-account code
      const subAccountCode = subAccount || generateSubAccountCode(finalAccountClass, normalizedAccountType, metadata);

      // Generate COA-compliant account number
      const glAcctNo = generateCOAAccountNumber({
        organizationCode,
        branchCode: normalizedBranchCode,
        accountClass: finalAccountClass,
        accountType: normalizedAccountType,
        subAccount: subAccountCode
      });

      // Check for duplicate account
      const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
      if (existingAccount) {
        throw new Error(`GL account ${glAcctNo} already exists`);
      }

      // Determine COA structure
      const financialStatementType = mapToFinancialStatementCategory(finalAccountClass, normalizedAccountType);
      const financialStatementCategory = mapToFinancialStatementSubCategory(finalAccountClass, normalizedAccountType);
    
      // Determine normal balance based on account class
      const normalBalance = getNormalBalance(finalAccountClass);
    
      // Determine account level
      const accountLevel = determineAccountLevel(level, isControlAccount, parentAccountNo);

      // Generate GL Account ID
      const glAcctId = await generateNextGLAcctId(session);

      // Create COA-aligned GL Account
      const newGLAccount = new GLAccount({
        // Core Identifiers
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: glAcctId,
        CREATED_BY,
      
        // Organization & Branch
        organizationName: organizationName || organization.organizationName,
        organizationCode,
        branchName: branchName || branch.branchName,
        branchCode: normalizedBranchCode,
        branchType: branch.branchType,
      
        // Account Description
        ACCT_DESC,
      
        // ==================== ENHANCED COA STRUCTURE ====================
        coaStructure: {
          segments: {
            entity: String(organizationCode).padStart(2, '0'),
            branch: normalizedBranchCode,
            accountClass: getAccountClassCode(finalAccountClass),
            accountType: getAccountTypeCode(normalizedAccountType),
            subAccount: subAccountCode
          },
          financialStatement: {
            type: financialStatementType,
            category: financialStatementCategory,
            subCategory: `${finalAccountClass}_${normalizedAccountType}`
          },
          hierarchy: {
            level: accountLevel,
            parentAccountNo: parentAccountNo,
            isControlAccount: isControlAccount,
            isSummaryAccount: isSummaryAccount,
            childAccounts: []
          },
          accounting: {
            normalBalance: normalBalance,
            balanceType: finalAccountClass,
            isTemporary: ['REVENUE', 'EXPENSE'].includes(finalAccountClass),
            isPermanent: ['ASSET', 'LIABILITY', 'EQUITY', 'CONTROL_SUSPENSE', 'TAX', 'SPECIAL_PURPOSE'].includes(finalAccountClass),
            requiresClosing: ['REVENUE', 'EXPENSE'].includes(finalAccountClass)
          }
        },
      
        // Account Structure (legacy compatibility)
        categoryCode: getAccountClassCode(finalAccountClass),
        categoryName: `${finalAccountClass} - ${normalizedAccountType}`,
        level: accountLevel,
        LEDGER_NO: '001',
        SUB_LEDGER_NO: subAccountCode,
        CHART_OF_ACCT_ID: '001',
        GL_ACCT_CAT: getAccountClassCode(finalAccountClass),
        BAL_CD: getAccountClassCode(finalAccountClass),
        subfolderId: `COA_${organizationCode}_${normalizedBranchCode}`,
      
        // Transaction Controls
        JOURNAL_ID: `JRN-COA-${Date.now()}`,
        TRANSACTION_TYPE: `${finalAccountClass} Balance`,
        CR_ALLOWED: normalBalance === 'CREDIT',
        DR_ALLOWED: normalBalance === 'DEBIT',
        REC_ST: 'Active',
        POST_ALLOW: true,
        CONTROL_ACCT_FG: isControlAccount,
        SUSPENSE_ACCT_FG: normalizedAccountType.includes('SUSPENSE'),
        ALLOW_BAL_SWING_FG: allowNegative,
      
        // Balances
        LEDGER_BALANCE: openingBalance,
        AVAILABLE_BALANCE: openingBalance,
        OPENING_BALANCE: openingBalance,
        CURRENT_BALANCE: openingBalance,
        CURRENCY_CODE: 'NGN',
      
        // ==================== ENHANCED METADATA ====================
        metadata: {
          accountType: normalizedAccountType,
          accountClass: finalAccountClass,
          normalBalance: normalBalance,
          coaCompliant: true,
          templateGenerated: false,
          dynamicAccount: true,
          branchSpecific: true,
          consolidationRequired: true,
          productType: productType,
          subAccountCode: subAccountCode,
          balanceSettings: {
            allowNegative: allowNegative,
            minimumBalance: allowNegative ? -1000000 : 0,
            maximumBalance: 1000000000,
            autoReconcile: true
          },
          ...metadata
        }
      });

      await newGLAccount.save({ session });

      // If this is a control account, update parent-child relationships
      if (isControlAccount && parentAccountNo) {
        await updateParentChildRelationship(parentAccountNo, glAcctNo, session);
      }

      // Enhanced audit trail
      await addAuditTrail({
        event_type: 'CREATE_COA_ALIGNED_ACCOUNT',
        user_id: CREATED_BY,
        action: 'CREATE',
        new_value: {
          GL_ACCT_NO: glAcctNo,
          accountClass: finalAccountClass,
          accountType: normalizedAccountType,
          financialStatement: financialStatementType,
          normalBalance,
          isControlAccount,
          parentAccountNo,
          branchCode: normalizedBranchCode,
          subAccountCode
        },
        old_value: null,
        ip_address: req.ip || '0.0.0.0',
        entity_id: newGLAccount._id,
        entity_type: 'GLAccount',
        status: 'SUCCESS',
        description: `Created COA-aligned account ${glAcctNo} - ${ACCT_DESC} for branch ${normalizedBranchCode}`,
        reference_no: `COA-${newGLAccount._id}`,
        account_no: glAcctNo,
        additional_info: {
          originalBranchCode: branchCode,
          normalizedBranchCode: normalizedBranchCode,
          branchName: branch.branchName,
          subAccountCode: subAccountCode,
          accountLevel: accountLevel
        },
        session,
      });

      return res.status(201).json({
        success: true,
        message: 'COA-aligned GL account created successfully',
        data: newGLAccount.getFrontendData() // Use the instance method from your model
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating COA-aligned GL account', {
      error: error.message,
      body: req.body,
    });
  
    return res.status(400).json({
      success: false,
      message: 'Failed to create COA-aligned GL account',
      error: error.message,
      code: error.message.includes('Missing') || error.message.includes('not found') || error.message.includes('Invalid branch code') || error.message.includes('reserved') || error.message.includes('Invalid account type') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// Helper function to update parent-child relationships
const updateParentChildRelationship = async (parentAccountNo, childAccountNo, session) => {
  const parentAccount = await GLAccount.findOne({ GL_ACCT_NO: parentAccountNo }).session(session);
  if (parentAccount && parentAccount.coaStructure) {
    if (!parentAccount.coaStructure.hierarchy.childAccounts.includes(childAccountNo)) {
      parentAccount.coaStructure.hierarchy.childAccounts.push(childAccountNo);
      parentAccount.coaStructure.hierarchy.isControlAccount = true;
      await parentAccount.save({ session });
    }
  }
};
// ==================== ENHANCED ACCOUNT QUERY FUNCTIONS ====================
// NEW FUNCTION: Get accounts by COA segments
 const getAccountsByCOASegments = async (req, res) => {
  try {
    const { entity, branch, accountClass, accountType } = req.query;
    if (!entity || !branch) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: entity, branch'
      });
    }
    const accounts = await GLAccount.findByCOASegments(entity, branch, accountClass, accountType);
    return res.status(200).json({
      success: true,
      data: {
        entity,
        branch,
        accountClass,
        accountType,
        accounts: accounts.map(acc => acc.getFrontendData()),
        totalCount: accounts.length
      }
    });
  } catch (error) {
    logger.error('Error getting accounts by COA segments', {
      error: error.message,
      query: req.query
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting accounts by COA segments',
      error: error.message
    });
  }
};
// NEW FUNCTION: Get financial statement breakdown
const getFinancialStatementBreakdown = async (req, res) => {
  try {
    const { organizationCode, statementType, category } = req.query;
    if (!organizationCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: organizationCode'
      });
    }
    const accounts = await GLAccount.findByFinancialStatement(organizationCode, statementType, category);
    // Calculate totals
    const totalBalance = accounts.reduce((sum, account) => sum + account.LEDGER_BALANCE, 0);
    const netBalance = accounts.reduce((sum, account) => {
      const multiplier = account.getNormalBalanceMultiplier();
      return sum + (account.LEDGER_BALANCE * multiplier);
    }, 0);
    return res.status(200).json({
      success: true,
      data: {
        organizationCode,
        statementType,
        category,
        accounts: accounts.map(acc => acc.getFrontendData()),
        summary: {
          totalAccounts: accounts.length,
          totalBalance,
          netBalance,
          averageBalance: totalBalance / accounts.length
        }
      }
    });
  } catch (error) {
    logger.error('Error getting financial statement breakdown', {
      error: error.message,
      query: req.query
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting financial statement breakdown',
      error: error.message
    });
  }
};
// NEW FUNCTION: Get COA structure analysis
 const getCOAAnalysis = async (req, res) => {
  try {
    const { organizationCode } = req.params;
    if (!organizationCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: organizationCode'
      });
    }
    const coaStructure = await GLAccount.getCOAStructure(organizationCode);
    const balanceSummary = await GLAccount.getCOABalanceSummary(organizationCode);
    return res.status(200).json({
      success: true,
      data: {
        organizationCode,
        coaStructure,
        balanceSummary
      }
    });
  } catch (error) {
    logger.error('Error getting COA analysis', {
      error: error.message,
      params: req.params
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting COA analysis',
      error: error.message
    });
  }
};
// Determine if credit transactions are allowed
const determineCreditAllowed = (accountType) => {
  const creditAllowedMap = {
    'INTER_BRANCH': true,
    'INTER_BRANCH_PAYABLE': true,
    'INTER_BRANCH_RECEIVABLE': false
  };
  return creditAllowedMap[accountType] !== false;
};
// Determine if debit transactions are allowed
const determineDebitAllowed = (accountType) => {
  const debitAllowedMap = {
    'INTER_BRANCH': true,
    'INTER_BRANCH_PAYABLE': false,
    'INTER_BRANCH_RECEIVABLE': true
  };
  return debitAllowedMap[accountType] !== false;
};
// Updated createInterBranchAccounts function
const createInterBranchAccounts = async (organizationCode, branchCode, branchName, CREATED_BY, session) => {
  const interBranchAccounts = [];
  const interBranchTypes = ['INTER_BRANCH', 'INTER_BRANCH_PAYABLE', 'INTER_BRANCH_RECEIVABLE'];
  for (const accountType of interBranchTypes) {
    const templateConfig = GL_ACCOUNT_TEMPLATES[accountType];
    if (!templateConfig) {
      logger.warn(`No template configuration found for account type: ${accountType}`);
      continue;
    }
    try {
      const glAcctNo = generateGLAccount(templateConfig.template, branchCode, '001', '800');
    
      const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
      if (existingAccount) {
        logger.info(`Inter-branch account ${glAcctNo} already exists, skipping creation`);
        continue;
      }
      const newGLAccount = new GLAccount({
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: await generateNextGLAcctId(session),
        CREATED_BY,
        organizationName: branchName, // Using branch name as organization name for inter-branch
        organizationCode: organizationCode,
        branchName: branchName,
        branchCode: branchCode,
        branchType: 'MAIN',
        ACCT_DESC: templateConfig.description,
        GL_ACCT_CAT: determineCategoryFromAccountType(accountType),
        BAL_CD: determineBalanceCode(accountType),
        TRANSACTION_TYPE: templateConfig.transactionType,
        CR_ALLOWED: determineCreditAllowed(accountType),
        DR_ALLOWED: determineDebitAllowed(accountType),
        REC_ST: 'Active',
        POST_ALLOW: true,
        LEDGER_BALANCE: 0,
        AVAILABLE_BALANCE: 0,
        CURRENCY_CODE: 'NGN',
        SETTLEMENT_GL_ACCT_NO: glAcctNo,
        level: 1,
        metadata: {
          accountType,
          templateGenerated: true,
          dynamicAccount: true,
          branchSpecific: false,
          consolidationRequired: true,
          interBranch: true,
          createdAt: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await newGLAccount.save({ session });
      interBranchAccounts.push(newGLAccount);
    
      logger.info(`Created inter-branch account: ${glAcctNo} for branch ${branchCode}`, {
        accountType,
        glAcctNo,
        branchCode
      });
    } catch (error) {
      logger.error(`Error creating inter-branch account of type ${accountType}`, {
        error: error.message,
        branchCode,
        accountType
      });
      // Continue with other account types even if one fails
      continue;
    }
  }
  logger.info(`Created ${interBranchAccounts.length} inter-branch accounts for branch ${branchCode}`);
  return interBranchAccounts;
};
// Utility: Generate Transaction ID (you already have this)
const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  const transactionId = base + random;
  logger.info('Generated Transaction ID', { transactionId });
  return transactionId;
};
// Make sure this helper function exists and uses normalized branch codes
const mapToInternalAccountType = (accountClass, accountType) => {
  const mapping = {
    'ASSET': {
      'CURRENT_ASSET': 'CUSTOMER_ACCOUNT',
      'FIXED_ASSET': 'FIXED_ASSET',
      'LOAN_ASSET': 'LOAN_ASSET',
      'INTANGIBLE_ASSET': 'FIXED_ASSET',
      'OTHER_ASSET': 'OTHER_ASSET',
      'CUSTOMER_ACCOUNT': 'CUSTOMER_ACCOUNT',
      'CASH_ACCOUNT': 'CASH_ACCOUNT',
      'BANK_ACCOUNT': 'BANK_ACCOUNT',
      'RECEIVABLE_ACCOUNT': 'RECEIVABLE_ACCOUNT',
      'PROPERTY_PLANT_EQUIPMENT': 'PROPERTY_PLANT_EQUIPMENT',
      'INVESTMENT_ASSET': 'INVESTMENT_ASSET'
    },
    'LIABILITY': {
      'CURRENT_LIABILITY': 'LIABILITY_ACCOUNT',
      'LONG_TERM_LIABILITY': 'LOAN_LIABILITY',
      'DEPOSITS_LIABILITY': 'DEPOSITS_LIABILITY',
      'OTHER_LIABILITY': 'LIABILITY_ACCOUNT',
      'LIABILITY_ACCOUNT': 'LIABILITY_ACCOUNT',
      'PAYABLE_ACCOUNT': 'PAYABLE_ACCOUNT',
      'LOAN_LIABILITY': 'LOAN_LIABILITY'
    },
    'EQUITY': {
      'SHARE_CAPITAL': 'CAPITAL_ACCOUNT',
      'RETAINED_EARNINGS': 'RETAINED_EARNINGS',
      'OTHER_EQUITY': 'EQUITY_ACCOUNT',
      'CAPITAL_ACCOUNT': 'CAPITAL_ACCOUNT',
      'EQUITY_ACCOUNT': 'EQUITY_ACCOUNT'
    },
    'REVENUE': {
      'OPERATING_REVENUE': 'REVENUE_ACCOUNT',
      'INTEREST_INCOME': 'INTEREST_INCOME',
      'FEE_INCOME': 'FEE_INCOME',
      'OTHER_REVENUE': 'OTHER_FEES',
      'REVENUE_ACCOUNT': 'REVENUE_ACCOUNT',
      'SERVICE_INCOME': 'SERVICE_INCOME',
      'PROCESSING_FEE': 'PROCESSING_FEE',
      'INSURANCE_FEE': 'INSURANCE_FEE',
      'UPFRONT_INTEREST': 'UPFRONT_INTEREST',
      'OTHER_FEES': 'OTHER_FEES'
    },
    'EXPENSE': {
      'OPERATING_EXPENSE': 'OPERATING_EXPENSE',
      'ADMINISTRATIVE_EXPENSE': 'ADMIN_EXPENSE',
      'FINANCE_COST': 'INTEREST_EXPENSE',
      'OTHER_EXPENSE': 'EXPENSE_ACCOUNT',
      'EXPENSE_ACCOUNT': 'EXPENSE_ACCOUNT',
      'INTEREST_EXPENSE': 'INTEREST_EXPENSE',
      'STAFF_EXPENSE': 'STAFF_EXPENSE',
      'ADMIN_EXPENSE': 'ADMIN_EXPENSE'
    }
  };
  return mapping[accountClass]?.[accountType] || accountType;
};
// const determineAccountLevel = (isControlAccount, parentAccountNo) => {
// if (!parentAccountNo && isControlAccount) return 1;
// if (parentAccountNo && isControlAccount) return 2;
// if (parentAccountNo && !isControlAccount) return 3;
// return 4;
// };
// ADDED: MAPPING FUNCTIONS TO ALIGN FRONTEND WITH BACKEND
const mapCategoryCodeToAccountClass = (categoryCode) => {
  const mapping = {
    '100': 'ASSET',
    '200': 'ASSET', // Loan Asset is also ASSET
    '150': 'ASSET', // Fixed Asset
    '151': 'ASSET', // Property Plant Equipment
    '152': 'ASSET', // Investment Asset
    '300': 'LIABILITY',
    '301': 'LIABILITY', // Deposits Liability
    '302': 'LIABILITY', // Payable Account
    '303': 'LIABILITY', // Loan Liability
    '400': 'REVENUE',
    '500': 'EQUITY',
    '501': 'EQUITY', // Capital Account
    '502': 'EQUITY', // Retained Earnings
    '600': 'EXPENSE',
    '800': 'ASSET', // Inter-branch treated as asset
    '900': 'ASSET', // Suspense account
    '901': 'ASSET' // Control account
  };
  return mapping[categoryCode] || 'ASSET';
};
const mapAccountClassToNormalBalance = (accountClass) => {
  const mapping = {
    'ASSET': 'DEBIT',
    'LIABILITY': 'CREDIT',
    'EQUITY': 'CREDIT',
    'REVENUE': 'CREDIT',
    'EXPENSE': 'DEBIT'
  };
  return mapping[accountClass] || 'DEBIT';
};
// UPDATED: Enhanced mapping function for frontend account types
const mapMetadataAccountTypeToAccountType = (frontendAccountType) => {
  const typeMap = {
    // Frontend asset types to backend account types (using only schema enum values)
    'CASH_ACCOUNT': 'CURRENT_ASSET',
    'BANK_ACCOUNT': 'CURRENT_ASSET',
    'RECEIVABLE_ACCOUNT': 'CURRENT_ASSET', // Changed from 'RECEIVABLE' to 'CURRENT_ASSET'
    'CUSTOMER_ACCOUNT': 'CURRENT_ASSET',
    'LOAN_ASSET': 'LOAN_ASSET',
    'FIXED_ASSET': 'FIXED_ASSET',
    'PROPERTY_PLANT_EQUIPMENT': 'FIXED_ASSET',
    'INVESTMENT_ASSET': 'OTHER_ASSET', // Changed from 'INVESTMENT_ASSET' to 'OTHER_ASSET'
  
    // Frontend liability types
    'LIABILITY_ACCOUNT': 'CURRENT_LIABILITY',
    'DEPOSITS_LIABILITY': 'CURRENT_LIABILITY',
    'PAYABLE_ACCOUNT': 'CURRENT_LIABILITY',
    'LOAN_LIABILITY': 'LONG_TERM_LIABILITY',
  
    // Frontend equity types
    'EQUITY_ACCOUNT': 'EQUITY',
    'CAPITAL_ACCOUNT': 'EQUITY',
    'RETAINED_EARNINGS': 'RETAINED_EARNINGS',
  
    // Frontend revenue types
    'REVENUE_ACCOUNT': 'OPERATING_REVENUE',
    'INTEREST_INCOME': 'INTEREST_INCOME',
    'FEE_INCOME': 'FEE_INCOME',
    'SERVICE_INCOME': 'OPERATING_REVENUE', // Changed from 'SERVICE_INCOME' to 'OPERATING_REVENUE'
    'PROCESSING_FEE': 'FEE_INCOME',
    'INSURANCE_FEE': 'FEE_INCOME',
    'UPFRONT_INTEREST': 'INTEREST_INCOME',
    'OTHER_FEES': 'OTHER_REVENUE',
  
    // Frontend expense types
    'EXPENSE_ACCOUNT': 'OPERATING_EXPENSE',
    'OPERATING_EXPENSE': 'OPERATING_EXPENSE',
    'INTEREST_EXPENSE': 'FINANCE_COST', // Changed from 'INTEREST_EXPENSE' to 'FINANCE_COST'
    'STAFF_EXPENSE': 'OPERATING_EXPENSE', // Changed from 'STAFF_EXPENSE' to 'OPERATING_EXPENSE'
    'ADMIN_EXPENSE': 'ADMINISTRATIVE_EXPENSE',
  
    // Special accounts
    'INTER_BRANCH': 'INTER_BRANCH',
    'SUSPENSE_ACCOUNT': 'OTHER_ASSET', // Changed from 'SUSPENSE_ACCOUNT' to 'OTHER_ASSET'
    'CONTROL_ACCOUNT': 'CURRENT_ASSET' // Changed from 'CONTROL_ACCOUNT' to 'CURRENT_ASSET'
  };
  return typeMap[frontendAccountType] || 'CURRENT_ASSET';
};
// MIGRATE EXISTING ACCOUNTS TO COA STRUCTURE
const migrateToCOAStructure = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { CREATED_BY, organizationCode, batchSize = 100 } = req.body;
      if (!CREATED_BY || !organizationCode) {
        throw new Error('Missing required fields: CREATED_BY, organizationCode');
      }
      // Get all accounts for the organization
      const accounts = await GLAccount.find({ organizationCode }).session(session);
    
      let migratedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;
      const migrationResults = [];
      for (const account of accounts) {
        try {
          // Skip accounts that are already COA-compliant
          if (account.coaStructure && account.coaStructure.segments) {
            skippedCount++;
            continue;
          }
          // Map legacy account to COA structure
          const coaMapping = mapLegacyAccountToCOA(account);
        
          // Update account with COA structure
          await GLAccount.findByIdAndUpdate(account._id, {
            $set: {
              'coaStructure': coaMapping.coaStructure,
              'metadata.coaMigrated': true,
              'metadata.coaMigrationDate': new Date(),
              'metadata.coaMigrationVersion': '2.0'
            }
          }, { session });
          migratedCount++;
          migrationResults.push({
            GL_ACCT_NO: account.GL_ACCT_NO,
            ACCT_DESC: account.ACCT_DESC,
            status: 'SUCCESS',
            coaStructure: coaMapping.coaStructure
          });
          // Commit in batches to avoid memory issues
          if (migratedCount % batchSize === 0) {
            console.log(`Processed ${migratedCount} accounts...`);
          }
        } catch (error) {
          errorCount++;
          migrationResults.push({
            GL_ACCT_NO: account.GL_ACCT_NO,
            ACCT_DESC: account.ACCT_DESC,
            status: 'FAILED',
            error: error.message
          });
          console.error(`Failed to migrate account ${account.GL_ACCT_NO}:`, error.message);
        }
      }
      // Audit trail for bulk migration
      await addAuditTrail({
        EVENT_TYPE: 'BULK_COA_MIGRATION',
        USER_ID: CREATED_BY,
        ACTION: 'UPDATE',
        NEW_VALUE: {
          organizationCode,
          totalAccounts: accounts.length,
          migratedCount,
          skippedCount,
          errorCount,
          migrationRate: ((migratedCount / accounts.length) * 100).toFixed(2) + '%'
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '127.0.0.1',
        ENTITY_ID: `COA_MIGRATION_${organizationCode}_${Date.now()}`,
        ENTITY_TYPE: 'GLAccount',
        STATUS: migratedCount > 0 ? 'SUCCESS' : 'PARTIAL',
        DESCRIPTION: `Migrated ${migratedCount} accounts to COA structure for organization ${organizationCode}`,
        REFERENCE_NO: `COA-MIG-${organizationCode}-${Date.now()}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: { migrationResults: migrationResults.slice(0, 10) },
        session,
      });
      return res.status(200).json({
        success: true,
        message: `COA migration completed for organization ${organizationCode}`,
        data: {
          totalAccounts: accounts.length,
          migratedCount,
          skippedCount,
          errorCount,
          migrationRate: ((migratedCount / accounts.length) * 100).toFixed(2) + '%',
          sampleResults: migrationResults.slice(0, 5)
        }
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error migrating to COA structure', {
      error: error.message,
      body: req.body,
    });
  
    return res.status(500).json({
      success: false,
      message: 'COA migration failed',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// Helper function to map legacy accounts to COA
const mapLegacyAccountToCOA = (legacyAccount) => {
  const accountMappings = {
    // Expense Accounts
    'Generator Fuelling': {
      accountClass: 'EXPENSE',
      accountType: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT'
    },
    'Admin Fee': {
      accountClass: 'EXPENSE',
      accountType: 'ADMINISTRATIVE_EXPENSE',
      normalBalance: 'DEBIT'
    },
    'Loan Processing Fee': {
      accountClass: 'EXPENSE',
      accountType: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT'
    },
    'Salaries and Allowances': {
      accountClass: 'EXPENSE',
      accountType: 'OPERATING_EXPENSE',
      normalBalance: 'DEBIT'
    },
  
    // Revenue Accounts
    'Income From Fees': {
      accountClass: 'REVENUE',
      accountType: 'FEE_INCOME',
      normalBalance: 'CREDIT'
    },
    'Interest Income on Loan': {
      accountClass: 'REVENUE',
      accountType: 'INTEREST_INCOME',
      normalBalance: 'CREDIT'
    },
    'Fee Income': {
      accountClass: 'REVENUE',
      accountType: 'FEE_INCOME',
      normalBalance: 'CREDIT'
    },
  
    // Asset Accounts
    'Loan Balances': {
      accountClass: 'ASSET',
      accountType: 'LOAN_ASSET',
      normalBalance: 'DEBIT'
    },
    'Cash Balances': {
      accountClass: 'ASSET',
      accountType: 'CURRENT_ASSET',
      normalBalance: 'DEBIT'
    },
    'Fixed Asset': {
      accountClass: 'ASSET',
      accountType: 'FIXED_ASSET',
      normalBalance: 'DEBIT'
    },
  
    // Liability Accounts
    'Savings Balances': {
      accountClass: 'LIABILITY',
      accountType: 'DEPOSITS_LIABILITY',
      normalBalance: 'CREDIT'
    },
    'Borrowed Fund': {
      accountClass: 'LIABILITY',
      accountType: 'CURRENT_LIABILITY',
      normalBalance: 'CREDIT'
    }
  };
  const mapping = accountMappings[legacyAccount.ACCT_DESC] ||
                 inferCOAMappingFromMetadata(legacyAccount) ||
                 inferCOAMappingFromAccountType(legacyAccount) ||
                 {
                   accountClass: 'ASSET',
                   accountType: 'OTHER_ASSET',
                   normalBalance: 'DEBIT'
                 };
  const financialStatementType = mapToFinancialStatementCategory(mapping.accountClass, mapping.accountType);
  const financialStatementCategory = mapToFinancialStatementSubCategory(mapping.accountClass, mapping.accountType);
  return {
    coaStructure: {
      segments: {
        entity: String(legacyAccount.organizationCode).padStart(2, '0'),
        branch: legacyAccount.branchCode.padStart(3, '0'),
        accountClass: getAccountClassCode(mapping.accountClass),
        accountType: getAccountTypeCode(mapping.accountType),
        subAccount: '000'
      },
      financialStatement: {
        type: financialStatementType,
        category: financialStatementCategory,
        subCategory: `${mapping.accountClass}_${mapping.accountType}`
      },
      hierarchy: {
        level: legacyAccount.level || 4,
        parentAccountNo: null,
        isControlAccount: false,
        isSummaryAccount: false,
        childAccounts: []
      },
      accounting: {
        normalBalance: mapping.normalBalance,
        balanceType: mapping.accountClass,
        isTemporary: ['REVENUE', 'EXPENSE'].includes(mapping.accountClass),
        isPermanent: ['ASSET', 'LIABILITY', 'EQUITY'].includes(mapping.accountClass),
        requiresClosing: ['REVENUE', 'EXPENSE'].includes(mapping.accountClass)
      }
    }
  };
};
// Helper function to infer COA mapping from metadata
const inferCOAMappingFromMetadata = (account) => {
  if (!account.metadata) return null;
  const metadataMapping = {
    'LOAN_ASSET': { accountClass: 'ASSET', accountType: 'LOAN_ASSET', normalBalance: 'DEBIT' },
    'PROCESSING_FEE': { accountClass: 'REVENUE', accountType: 'FEE_INCOME', normalBalance: 'CREDIT' },
    'INSURANCE_FEE': { accountClass: 'REVENUE', accountType: 'FEE_INCOME', normalBalance: 'CREDIT' },
    'OTHER_FEES': { accountClass: 'REVENUE', accountType: 'FEE_INCOME', normalBalance: 'CREDIT' },
    'CUSTOMER_ACCOUNT': { accountClass: 'ASSET', accountType: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
    'LIABILITY_ACCOUNT': { accountClass: 'LIABILITY', accountType: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
    'DEPOSITS_LIABILITY': { accountClass: 'LIABILITY', accountType: 'DEPOSITS_LIABILITY', normalBalance: 'CREDIT' },
    'EQUITY_ACCOUNT': { accountClass: 'EQUITY', accountType: 'RETAINED_EARNINGS', normalBalance: 'CREDIT' },
    'CAPITAL_ACCOUNT': { accountClass: 'EQUITY', accountType: 'SHARE_CAPITAL', normalBalance: 'CREDIT' },
    'EXPENSE_ACCOUNT': { accountClass: 'EXPENSE', accountType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' },
    'OPERATING_EXPENSE': { accountClass: 'EXPENSE', accountType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' },
    'REVENUE_ACCOUNT': { accountClass: 'REVENUE', accountType: 'OPERATING_REVENUE', normalBalance: 'CREDIT' },
    'INTEREST_INCOME': { accountClass: 'REVENUE', accountType: 'INTEREST_INCOME', normalBalance: 'CREDIT' },
    'FIXED_ASSET': { accountClass: 'ASSET', accountType: 'FIXED_ASSET', normalBalance: 'DEBIT' },
    'PROPERTY_PLANT_EQUIPMENT': { accountClass: 'ASSET', accountType: 'FIXED_ASSET', normalBalance: 'DEBIT' },
    'INTER_BRANCH': { accountClass: 'ASSET', accountType: 'CURRENT_ASSET', normalBalance: 'DEBIT' }
  };
  return metadataMapping[account.metadata.accountType] || null;
};
// Helper function to infer COA mapping from account type patterns
const inferCOAMappingFromAccountType = (account) => {
  const desc = account.ACCT_DESC?.toLowerCase() || '';
  if (desc.includes('loan') && !desc.includes('income')) {
    return { accountClass: 'ASSET', accountType: 'LOAN_ASSET', normalBalance: 'DEBIT' };
  }
  if (desc.includes('saving') || desc.includes('deposit')) {
    return { accountClass: 'LIABILITY', accountType: 'DEPOSITS_LIABILITY', normalBalance: 'CREDIT' };
  }
  if (desc.includes('interest') && desc.includes('income')) {
    return { accountClass: 'REVENUE', accountType: 'INTEREST_INCOME', normalBalance: 'CREDIT' };
  }
  if (desc.includes('fee') || desc.includes('income')) {
    return { accountClass: 'REVENUE', accountType: 'FEE_INCOME', normalBalance: 'CREDIT' };
  }
  if (desc.includes('expense') || desc.includes('cost')) {
    return { accountClass: 'EXPENSE', accountType: 'OPERATING_EXPENSE', normalBalance: 'DEBIT' };
  }
  if (desc.includes('asset') || desc.includes('equipment')) {
    return { accountClass: 'ASSET', accountType: 'FIXED_ASSET', normalBalance: 'DEBIT' };
  }
  if (desc.includes('capital') || desc.includes('equity')) {
    return { accountClass: 'EQUITY', accountType: 'SHARE_CAPITAL', normalBalance: 'CREDIT' };
  }
  return null;
};
// LEGACY ACCOUNT PROPERTY DETERMINATION (for backward compatibility)
const determineCategoryFromAccountType = (accountType) => {
  // Map account types to their corresponding account class codes (aligned with new COA system)
  const classCodeMap = {
    // Revenue types -> '301'
    'PROCESSING_FEE': '301',
    'INSURANCE_FEE': '301',
    'UPFRONT_INTEREST': '301',
    'OTHER_FEES': '301',
    'REVENUE_ACCOUNT': '301',
    'INTEREST_INCOME': '301',
    'SERVICE_INCOME': '301',
    'FEE_INCOME': '301',
    'OTHER_REVENUE': '301',
    // Asset types -> '001'
    'CUSTOMER_ACCOUNT': '001',
    'LOAN_ASSET': '001',
    'FIXED_ASSET': '001',
    'PROPERTY_PLANT_EQUIPMENT': '001',
    'CURRENT_ASSET': '001',
    'CASH_ACCOUNT': '001',
    'BANK_ACCOUNT': '001',
    'RECEIVABLE_ACCOUNT': '001',
    'INTANGIBLE_ASSET': '001',
    'OTHER_ASSET': '001',
    'INVESTMENT_ASSET': '001',
    // Liability types -> '101'
    'LIABILITY_ACCOUNT': '101',
    'DEPOSITS_LIABILITY': '101',
    'CURRENT_LIABILITY': '101',
    'PAYABLE_ACCOUNT': '101',
    'LONG_TERM_LIABILITY': '101',
    'LOAN_LIABILITY': '101',
    'OTHER_LIABILITY': '101',
    // Equity types -> '201'
    'EQUITY_ACCOUNT': '201',
    'CAPITAL_ACCOUNT': '201',
    'SHARE_CAPITAL': '201',
    'RETAINED_EARNINGS': '201',
    'OTHER_EQUITY': '201',
    // Expense types -> '401'
    'EXPENSE_ACCOUNT': '401',
    'OPERATING_EXPENSE': '401',
    'STAFF_EXPENSE': '401',
    'ADMINISTRATIVE_EXPENSE': '401',
    'ADMIN_EXPENSE': '401',
    'FINANCE_COST': '401',
    'INTEREST_EXPENSE': '401',
    'OTHER_EXPENSE': '401',
    // Special/Control types -> '501' or '999'
    'INTER_BRANCH': '501', // Treated as control/suspense for legacy alignment
    'SUSPENSE_ACCOUNT': '501',
    'CONTROL_ACCOUNT': '501'
  };
  return classCodeMap[accountType] || '999';
};
const determineBalanceCode = (accountType) => {
  // BAL_CD aligns with category code in the new system, so reuse the same mapping
  // (avoids repetition; both derive from modern COA class codes like '001', '301', etc.)
  return determineCategoryFromAccountType(accountType);
};
// SIMPLE AUDIT FUNCTION
const simpleAudit = async (data, session = null) => {
  try {
    const AuditTrail = mongoose.model('AuditTrail');
  
    let event_id;
    try {
      const lastAudit = await AuditTrail.findOne().sort({ event_id: -1 });
      event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
    } catch (error) {
      event_id = Date.now();
    }
    const audit = new AuditTrail({
      event_id,
      event_type: data.EVENT_TYPE,
      user_id: data.USER_ID,
      action: data.ACTION,
      new_value: data.NEW_VALUE || {},
      old_value: data.OLD_VALUE || null,
      ip_address: String(data.IP_ADDRESS || '127.0.0.1'),
      entity_id: data.ENTITY_ID,
      entity_type: data.ENTITY_TYPE,
      status: data.STATUS || 'SUCCESS',
      description: data.DESCRIPTION,
      reference_no: data.REFERENCE_NO,
      account_no: data.ACCOUNT_NO,
      timestamp: new Date()
    });
    const options = session ? { session } : {};
    await audit.save(options);
  
    return audit;
  } catch (error) {
    console.error('Simple audit failed:', error.message);
    return null;
  }
};
// CREATE GL ACCOUNT (Legacy function - consider migrating to createCOAAlignedGLAccount)
const createGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const {
        organizationName,
        organizationCode,
        branchName,
        branchCode,
        categoryCode,
        categoryName,
        level,
        CHART_OF_ACCT_ID,
        ACCT_DESC,
        LEDGER_NO,
        GL_ACCT_CAT,
        BAL_CD,
        SUB_LEDGER_NO,
        CREATED_BY,
        SEG_NO,
        subfolderId,
        metadata = {}
      } = req.body;
      // Validate required fields
      const requiredFields = {
        organizationName, organizationCode, branchName, branchCode,
        categoryCode, categoryName, level, CHART_OF_ACCT_ID,
        ACCT_DESC, LEDGER_NO, GL_ACCT_CAT, BAL_CD,
        SUB_LEDGER_NO, CREATED_BY, SEG_NO, subfolderId
      };
      const missingFields = Object.entries(requiredFields)
        .filter(([_, value]) => !value && value !== 0)
        .map(([key]) => key);
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      // Organization handling
      const orgCode = Number(organizationCode);
      if (isNaN(orgCode)) {
        throw new Error('Organization code must be a valid number');
      }
      const trimmedOrgName = organizationName.trim().toUpperCase();
    
      let organization = await Organization.findOne({
        $or: [
          { organizationName: trimmedOrgName },
          { organizationCode: orgCode }
        ]
      }).session(session);
      if (!organization) {
        organization = new Organization({
          organizationName: trimmedOrgName,
          organizationCode: orgCode,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await organization.save({ session });
      }
      // Branch handling
      let branch = await Branch.findOne({
        organizationCode: orgCode,
        branchCode,
      }).session(session);
      if (!branch) {
        const branchData = {
          organizationName: trimmedOrgName,
          organizationCode: orgCode,
          branchName: branchName.trim().toUpperCase(),
          branchCode: branchCode.trim(),
          branchType: 'MAIN',
          address: `${trimmedOrgName} ${branchName} Address`,
          status: 'ACTIVE'
        };
        if (!/^\d{3}$/.test(branchCode)) {
          throw new Error('Branch code must be a 3-digit number');
        }
        branch = new Branch(branchData);
        await branch.save({ session });
        // Branch audit trail
        await simpleAudit({
          EVENT_TYPE: 'CREATE_BRANCH',
          USER_ID: CREATED_BY,
          ACTION: 'CREATE',
          NEW_VALUE: branchData,
          OLD_VALUE: null,
          IP_ADDRESS: req.ip || '127.0.0.1',
          ENTITY_ID: branch._id,
          ENTITY_TYPE: 'Branch',
          STATUS: 'SUCCESS',
          DESCRIPTION: `Created branch: ${branch.branchName} (${branch.branchCode})`,
          REFERENCE_NO: `BRANCH-${branch._id}`
        }, session);
      }
      // Generate GL Account Number
      const glAcctNo = [
        String(CHART_OF_ACCT_ID).padStart(2, '0'),
        String(branchCode).padStart(3, '0'),
        String(BAL_CD).padStart(3, '0'),
        String(GL_ACCT_CAT).padStart(3, '0'),
        String(LEDGER_NO).padStart(3, '0'),
        String(branchCode).padStart(3, '0'),
      ].join('-');
      // Check for duplicates
      const existingAccount = await GLAccount.findOne({
        GL_ACCT_NO: glAcctNo
      }).session(session);
      if (existingAccount) {
        throw new Error(`GL account ${glAcctNo} already exists`);
      }
      // Generate GL Account ID
      let glAcctId;
      try {
        glAcctId = await generateNextGLAcctId(session);
      } catch (error) {
        const count = await GLAccount.countDocuments().session(session);
        glAcctId = String(count + 1).padStart(7, '0');
      }
      // Create GL Account
      const glAccountData = {
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: glAcctId,
        organizationName: trimmedOrgName,
        organizationCode: orgCode,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        branchType: branch.branchType,
        CREATED_BY,
        categoryCode,
        categoryName,
        level,
        LEDGER_NO,
        BAL_CD,
        SUB_LEDGER_NO,
        CHART_OF_ACCT_ID,
        ACCT_DESC,
        GL_ACCT_CAT: String(GL_ACCT_CAT).padStart(3, '0'),
        JOURNAL_ID: req.body.JOURNAL_ID || `JRN-${Date.now()}`,
        TRANSACTION_TYPE: req.body.TRANSACTION_TYPE || 'Asset Balance',
        CR_ALLOWED: req.body.CR_ALLOWED !== undefined ? req.body.CR_ALLOWED : true,
        DR_ALLOWED: req.body.DR_ALLOWED !== undefined ? req.body.DR_ALLOWED : true,
        REC_ST: req.body.REC_ST || 'Active',
        POST_ALLOW: req.body.POST_ALLOW !== undefined ? req.body.POST_ALLOW : true,
        SEG_NO: SEG_NO || 1,
        SEG_DESC: req.body.SEG_DESC || categoryName,
        LEDGER_BALANCE: 0,
        AVAILABLE_BALANCE: 0,
        CURRENCY_CODE: 'NGN',
        subfolderId: subfolderId,
        metadata: {
          accountType: metadata.accountType || 'CUSTOMER_ACCOUNT',
          branchSpecific: metadata.branchSpecific !== undefined ? metadata.branchSpecific : true,
          consolidationRequired: metadata.consolidationRequired !== undefined ? metadata.consolidationRequired : false,
          ...metadata
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      const newGLAccount = new GLAccount(glAccountData);
    
      // Validate before saving
      const validationError = newGLAccount.validateSync();
      if (validationError) {
        throw new Error(`GL Account validation failed: ${validationError.message}`);
      }
      await newGLAccount.save({ session });
      // GL Account audit trail
      await simpleAudit({
        EVENT_TYPE: 'CREATE_GL_ACCOUNT',
        USER_ID: CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: {
          GL_ACCT_NO: glAcctNo,
          GL_ACCT_ID: glAcctId,
          organizationName: trimmedOrgName,
          branchName: branch.branchName,
          ACCT_DESC: ACCT_DESC
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.1',
        ENTITY_ID: newGLAccount._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created GL account ${glAcctNo} - ${ACCT_DESC}`,
        REFERENCE_NO: `GL-${newGLAccount._id}`,
        ACCOUNT_NO: glAcctNo
      }, session);
      result = {
        success: true,
        message: 'GL account created successfully',
        data: newGLAccount,
      };
    });
    return res.status(201).json(result);
  } catch (error) {
    logger.error('Error creating GL account', {
      error: error.message,
      stack: error.stack,
      body: req.body,
    });
    return res.status(400).json({
      success: false,
      message: 'Failed to create GL account',
      error: error.message,
      code: error.message.includes('Missing') || error.message.includes('Invalid') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    await session.endSession();
  }
};
// CREATE DYNAMIC GL ACCOUNT
const createDynamicGLAccount = async (req, res) => {
  logger.info('createDynamicGLAccount hit with body:', { body: req.body });
  const {
    organizationName,
    organizationCode,
    branchCode,
    branchType = 'MAIN',
    accountType,
    productType,
    CREATED_BY,
    ACCT_DESC,
    GL_ACCT_CAT,
    BAL_CD,
    level = 1,
    metadata = {}
  } = req.body;
  // Early validation with new required fields
  if (!organizationName || !organizationCode || !branchCode || !accountType || !CREATED_BY) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: organizationName, organizationCode, branchCode, accountType, CREATED_BY',
      code: 'BAD_REQUEST'
    });
  }
  const session = await mongoose.startSession();
  let newGLAccount = null;
  let glAcctNo = null;
  let trimmedOrgNameLocal = null;
  let branchNameLocal = null;
  let success = false;
  try {
    await session.withTransaction(async () => {
      trimmedOrgNameLocal = organizationName.trim();
      // Infer categoryCode from accountType
      const categoryCode = determineCategoryFromAccountType(accountType);
      // Validate organization
      let organization = await Organization.findOne({
        $or: [
          { organizationName: trimmedOrgNameLocal },
          { organizationCode: organizationCode }
        ]
      }).session(session);
    
      if (!organization) {
        logger.info('Organization not found, creating new', { organizationName: trimmedOrgNameLocal, organizationCode });
        organization = new Organization({
          organizationName: trimmedOrgNameLocal,
          organizationCode: organizationCode,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await organization.save({ session });
      }
      // Find branch by code to get branchName
      const branch = await Branch.findOne({
        organizationCode: organizationCode,
        branchCode,
      }).session(session);
    
      if (!branch) {
        throw new Error(`Branch with code "${branchCode}" not found in organization "${trimmedOrgNameLocal}"`);
      }
      branchNameLocal = branch.branchName;
      // Set defaults for required fields
      const LEDGER_NO = 1;
      const SUB_LEDGER_NO = 0;
      const CHART_OF_ACCT_ID = 1;
      // Create root subfolder
      const parentFolder = await createRootSubfolder(CREATED_BY, LEDGER_NO, { session });
      const resolvedSubfolderId = parentFolder.subfolderId;
      let glAcctNoLocal;
      let description;
      // Generate GL account number based on template
      if (accountType === 'LOAN_ASSET' && productType) {
        const template = LOAN_PRODUCT_TEMPLATES[productType];
        if (!template) {
          throw new Error(`Unknown product type: ${productType}`);
        }
        glAcctNoLocal = generateGLAccount(template, branchCode, '001', '100');
        description = ACCT_DESC || `${productType.replace('_', ' ')} Loan Assets`;
      } else {
        const templateConfig = GL_ACCOUNT_TEMPLATES[accountType];
        if (!templateConfig) {
          throw new Error(`Unknown account type: ${accountType}. Available types: ${Object.keys(GL_ACCOUNT_TEMPLATES).join(', ')}`);
        }
        glAcctNoLocal = generateGLAccount(templateConfig.template, branchCode, '001', '100');
        description = ACCT_DESC || templateConfig.description || `${accountType} Account`;
      }
      glAcctNo = glAcctNoLocal;
      // Check for duplicate GL account
      const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
      if (existingAccount) {
        logger.info('GL account already exists, returning existing account', { GL_ACCT_NO: glAcctNo });
        return res.status(200).json({
          success: true,
          message: 'GL account already exists',
          data: existingAccount,
        });
      }
      // Determine GL account category if not provided
      const resolvedGLAccountCat = GL_ACCT_CAT || categoryCode;
      // Create GL account with new schema
      const newGLAccountObject = new GLAccount({
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: await generateNextGLAcctId(session),
        CREATED_BY,
        organizationName: trimmedOrgNameLocal,
        organizationCode: organizationCode,
        branchName: branchNameLocal,
        branchCode,
        branchType,
        ACCT_DESC: description,
        GL_ACCT_CAT: resolvedGLAccountCat,
        BAL_CD: BAL_CD || categoryCode,
        JOURNAL_ID: generateJournalId(),
        LEDGER_NO,
        SUB_LEDGER_NO,
        CHART_OF_ACCT_ID,
        TRANSACTION_TYPE: GL_ACCOUNT_TEMPLATES[accountType]?.transactionType || 'GENERAL',
        CR_ALLOWED: determineCreditAllowed(accountType),
        DR_ALLOWED: determineDebitAllowed(accountType),
        REC_ST: 'Active',
        POST_ALLOW: true,
        POST_FG: false,
        CONTROL_ACCT_FG: false,
        SUSPENSE_ACCT_FG: false,
        ALLOW_BAL_SWING_FG: false,
        PARENT_ID: null,
        subfolderId: resolvedSubfolderId,
        SEG_VALUE: '',
        SEG_DESC: description,
        SEG_NO: 1,
        SEG_TY_CD: '',
        SEG_PLACEHLDR_ID: '',
        DELAY_GL_POSTING: false,
        LEDGER_BALANCE: 0,
        AVAILABLE_BALANCE: 0,
        CURRENCY_CODE: 'NGN',
        transactions: [],
        SETTLEMENT_GL_ACCT_NO: glAcctNo,
        branchTimezone: 'Africa/Lagos',
        level: Number(level),
        metadata: {
          accountType,
          productType: productType || null,
          categoryCode,
          templateGenerated: true,
          dynamicAccount: true,
          branchSpecific: metadata.branchSpecific !== undefined ? metadata.branchSpecific : true,
          consolidationRequired: metadata.consolidationRequired !== undefined ? metadata.consolidationRequired : false,
          ...metadata
        }
      });
      await newGLAccountObject.save({ session });
      newGLAccount = newGLAccountObject;
      success = true;
      logger.info('Created new dynamic GL account', { GL_ACCT_NO: glAcctNo, accountType });
      return res.status(201).json({
        success: true,
        message: 'Dynamic GL account created successfully',
        data: newGLAccount,
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating dynamic GL account', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });
  
    return res.status(400).json({
      success: false,
      message: 'Error creating dynamic GL account',
      error: error.message,
      code: error.message.includes('Missing') || error.message.includes('Unknown') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
  // Audit trail moved OUTSIDE transaction
  if (success && newGLAccount && CREATED_BY) {
    try {
      await addAuditTrail({
        EVENT_TYPE: 'CREATE_DYNAMIC_GL_ACCOUNT',
        USER_ID: CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: {
          GL_ACCT_NO: glAcctNo,
          accountType: accountType,
          productType: productType || null,
          organizationName: trimmedOrgNameLocal,
          organizationCode: organizationCode,
          branchName: branchNameLocal,
          branchCode: branchCode,
          branchType: branchType,
          metadata: newGLAccount.metadata
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: newGLAccount._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created dynamic GL account ${glAcctNo} for ${accountType}`,
        REFERENCE_NO: `GL-${newGLAccount._id}`,
        ACCOUNT_NO: glAcctNo,
        ADDITIONAL_INFO: {},
      });
      logger.info('Audit trail logged successfully for GL account creation', { GL_ACCT_NO: glAcctNo });
    } catch (auditError) {
      logger.warn('Audit trail failed after successful GL creation', {
        error: auditError.message,
        glAcctNo,
        CREATED_BY,
      });
    }
  }
};
const cloneGLAccountsForBranch = async (req, res) => {
  console.log('CLONE BRANCH - FIXED VALIDATION VERSION');

  try {
    const {
      sourceOrganizationCode,
      sourceBranchCode,
      targetOrganizationCode,
      targetBranchCode,
      targetBranchName,
      targetBranchType = 'SUB',
      CREATED_BY,
      cloneInterBranchAccounts = false,
      resetBalances = true
    } = req.body;

    // Validation
    if (!sourceOrganizationCode || !sourceBranchCode || !targetOrganizationCode ||
        !targetBranchCode || !targetBranchName || !CREATED_BY) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Source & target checks
    const sourceBranch = await Branch.findOne({ organizationCode: sourceOrganizationCode, branchCode: sourceBranchCode }).lean();
    if (!sourceBranch) return res.status(404).json({ success: false, message: 'Source branch not found' });

    const targetOrg = await Organization.findOne({ organizationCode: targetOrganizationCode }).lean();
    if (!targetOrg) return res.status(404).json({ success: false, message: 'Target organization not found' });

    const existingBranch = await Branch.findOne({ organizationCode: targetOrganizationCode, branchCode: targetBranchCode });
    if (existingBranch) return res.status(409).json({ success: false, message: 'Target branch already exists' });

    // Fetch source accounts
    const sourceAccounts = await GLAccount.find({
      organizationCode: sourceOrganizationCode,
      branchCode: sourceBranchCode,
      REC_ST: 'Active'
    }).lean();

    if (sourceAccounts.length === 0) {
      return res.status(404).json({ success: false, message: 'No active GL accounts in source branch' });
    }

    // Create target branch
    const newBranch = await Branch.create({
      organizationName: targetOrg.organizationName,
      organizationCode: targetOrganizationCode,
      branchName: targetBranchName,
      branchCode: targetBranchCode,
      branchType: targetBranchType,
      createdBy: CREATED_BY,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    console.log(`✅ Created new branch: ${targetBranchName} (${targetBranchCode})`);

    // Next GL_ACCT_ID
    const last = await GLAccount.findOne().sort({ GL_ACCT_ID: -1 }).select('GL_ACCT_ID').lean();
    let nextId = last?.GL_ACCT_ID ? parseInt(last.GL_ACCT_ID) + 1 : 1000;

    let created = 0;
    let skipped = 0;
    const mapping = {};

    console.log('=== USING MONGOOSE FOR GL ACCOUNT CREATION ===');
    
    for (const src of sourceAccounts) {
      if (!cloneInterBranchAccounts && src.metadata && src.metadata.accountType === 'INTER_BRANCH') {
        skipped++;
        continue;
      }

      // Build new GL number
      const parts = src.GL_ACCT_NO.split('-');
      if (parts.length >= 2) parts[1] = String(targetBranchCode).padStart(3, '0');
      const newGLNo = parts.join('-');

      // Prevent duplicates
      if (await GLAccount.exists({ GL_ACCT_NO: newGLNo })) {
        skipped++;
        continue;
      }

      // FIX: Map account types to valid COA categories
      const getValidCOACategory = (accountType) => {
        const categoryMap = {
          // Map metadata.accountType to valid coaStructure.financialStatement.category
          'CUSTOMER_ACCOUNT': 'CURRENT_ASSETS',
          'DEPOSITS_LIABILITY': 'DEPOSIT_LIABILITIES', 
          'PROPERTY_PLANT_EQUIPMENT': 'FIXED_ASSETS',
          'LOAN_ASSET': 'LOAN_ASSETS',
          'INTEREST_INCOME': 'INTEREST_INCOME',
          'FEE_INCOME': 'FEE_INCOME',
          'OPERATING_EXPENSE': 'OPERATING_EXPENSES',
          'STAFF_EXPENSE': 'STAFF_EXPENSES',
          'ADMIN_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
          'BANK_ACCOUNT': 'CASH_EQUIVALENTS',
          'CASH_ACCOUNT': 'CASH_EQUIVALENTS',
          'RECEIVABLE_ACCOUNT': 'RECEIVABLE_ASSETS',
          'PAYABLE_ACCOUNT': 'PAYABLE_LIABILITIES',
          'EQUITY_ACCOUNT': 'SHARE_CAPITAL',
          'RETAINED_EARNINGS': 'RETAINED_EARNINGS'
        };
        
        // Use mapped value or default to CURRENT_ASSETS
        return categoryMap[accountType] || 'CURRENT_ASSETS';
      };

      // FIX: Generate subfolderId if missing
      const generateSubfolderId = (glAccountNo) => {
        // Use parts of GL account number to create subfolderId
        const parts = glAccountNo.split('-');
        if (parts.length >= 3) {
          return `SUB_${parts[2]}_${parts[3] || '000'}`;
        }
        return `SUB_${glAccountNo.replace(/[^a-zA-Z0-9]/g, '_')}`;
      };

      const accountType = src.metadata?.accountType || 'CURRENT_ASSET';
      const validCOACategory = getValidCOACategory(accountType);
      const subfolderId = src.subfolderId || generateSubfolderId(src.GL_ACCT_NO);

      // Create clean account data for Mongoose
      const accountData = {
        GL_ACCT_NO: newGLNo,
        GL_ACCT_ID: String(nextId++),
        CREATED_BY: CREATED_BY,

        // Organization & Branch
        organizationName: targetOrg.organizationName,
        organizationCode: targetOrganizationCode,
        branchName: targetBranchName,
        branchCode: targetBranchCode,
        branchType: targetBranchType,

        // Account Classification - FIXED: Provide defaults
        categoryCode: src.categoryCode || '100',
        categoryName: src.categoryName || 'General Category',
        parentCode: src.parentCode || null,
        level: src.level || 5,

        // Account Structure - FIXED: Include subfolderId
        ACCT_DESC: src.ACCT_DESC,
        GL_ACCT_CAT: src.GL_ACCT_CAT,
        LEDGER_NO: src.LEDGER_NO,
        BAL_CD: src.BAL_CD,
        SUB_LEDGER_NO: src.SUB_LEDGER_NO || '',
        SEG_NO: src.SEG_NO || 1,
        CHART_OF_ACCT_ID: src.CHART_OF_ACCT_ID,
        PARENT_ID: null,
        subfolderId: subfolderId, // FIXED: Required field

        // Transaction & Posting Controls
        REC_ST: 'Active',
        CR_ALLOWED: src.CR_ALLOWED !== undefined ? src.CR_ALLOWED : true,
        DR_ALLOWED: src.DR_ALLOWED !== undefined ? src.DR_ALLOWED : true,
        POST_ALLOW: src.POST_ALLOW !== undefined ? src.POST_ALLOW : true,
        POST_FG: src.POST_FG !== undefined ? src.POST_FG : false,
        CONTROL_ACCT_FG: src.CONTROL_ACCT_FG !== undefined ? src.CONTROL_ACCT_FG : false,
        SUSPENSE_ACCT_FG: src.SUSPENSE_ACCT_FG !== undefined ? src.SUSPENSE_ACCT_FG : false,
        ALLOW_BAL_SWING_FG: src.ALLOW_BAL_SWING_FG !== undefined ? src.ALLOW_BAL_SWING_FG : false,

        // Segmentation
        SEG_VALUE: src.SEG_VALUE || '',
        SEG_DESC: src.SEG_DESC || 'Default Description',
        SEG_TY_CD: src.SEG_TY_CD || '',
        SEG_PLACEHLDR_ID: src.SEG_PLACEHLDR_ID || '',
        DELAY_GL_POSTING: src.DELAY_GL_POSTING !== undefined ? src.DELAY_GL_POSTING : false,

        // Financial Data
        LEDGER_BALANCE: resetBalances ? 0 : (src.LEDGER_BALANCE || 0),
        AVAILABLE_BALANCE: resetBalances ? 0 : (src.AVAILABLE_BALANCE || 0),
        OPENING_BALANCE: resetBalances ? 0 : (src.OPENING_BALANCE || 0),
        CURRENT_BALANCE: resetBalances ? 0 : (src.CURRENT_BALANCE || 0),
        CURRENCY_CODE: src.CURRENCY_CODE || 'NGN',

        // COA Structure - FIXED: Use valid enum values
        coaStructure: {
          segments: {
            entity: String(targetOrganizationCode).padStart(2, '0'),
            branch: String(targetBranchCode).padStart(3, '0'),
            accountClass: '100',
            accountType: '001',
            subAccount: '000'
          },
          financialStatement: {
            type: 'BALANCE_SHEET', // Default to BALANCE_SHEET
            category: validCOACategory, // FIXED: Use mapped valid category
            subCategory: null
          },
          hierarchy: {
            level: src.level || 5,
            parentAccountNo: null,
            isControlAccount: false,
            isSummaryAccount: false,
            childAccounts: []
          },
          accounting: {
            normalBalance: 'DEBIT',
            balanceType: 'ASSET',
            isTemporary: false,
            isPermanent: true,
            requiresClosing: false
          }
        },

        // Settlement & References
        SETTLEMENT_GL_ACCT_NO: null,
        INTER_BRANCH_ACCOUNT: src.INTER_BRANCH_ACCOUNT !== undefined ? src.INTER_BRANCH_ACCOUNT : false,

        // System
        systemSource: 'NEW_SYSTEM',

        // Sync Status
        syncStatus: {
          syncRequired: false,
          balanceReconciled: true,
          reconciliationDate: new Date()
        },

        // Metadata
        metadata: {
          accountType: accountType,
          branchSpecific: true,
          templateGenerated: true,
          bulkCreated: true,
          coaCompliant: true,
          accountClass: src.metadata?.accountClass || 'ASSET',
          normalBalance: src.metadata?.normalBalance || 'DEBIT',
          balanceSettings: {
            allowNegative: resetBalances ? true : (src.metadata?.balanceSettings?.allowNegative !== undefined ? src.metadata.balanceSettings.allowNegative : false),
            minimumBalance: 0,
            maximumBalance: 1000000000,
            autoReconcile: true
          },
          clonedFrom: {
            sourceOrganizationCode: sourceOrganizationCode,
            sourceBranchCode: sourceBranchCode,
            sourceGLAccountNo: src.GL_ACCT_NO,
            clonedAt: new Date(),
            clonedBy: CREATED_BY
          }
        },

        // Reset arrays
        transactions: [],
        balanceHistory: [],
        branchTimezone: src.branchTimezone || 'Africa/Lagos'
      };

      try {
        // Use Mongoose create with validation
        await GLAccount.create(accountData);
        
        mapping[src.GL_ACCT_NO] = newGLNo;
        created++;
        console.log(`✅ Cloned: ${src.GL_ACCT_NO} → ${newGLNo}`);
      } catch (err) {
        console.error(`❌ Create failed for ${newGLNo}:`, err.message);
        
        // Fallback to direct MongoDB if Mongoose validation fails
        console.log(`🔄 Trying fallback for ${newGLNo}...`);
        try {
          const collection = mongoose.connection.db.collection('gl_accounts');
          // Remove validation-sensitive fields for fallback
          const fallbackData = { ...accountData };
          delete fallbackData.coaStructure; // Remove problematic COA structure
          delete fallbackData.metadata; // Remove metadata that might have validation issues
          
          await collection.insertOne(fallbackData);
          mapping[src.GL_ACCT_NO] = newGLNo;
          created++;
          console.log(`✅ Fallback success: ${src.GL_ACCT_NO} → ${newGLNo}`);
        } catch (fallbackErr) {
          console.error(`❌ Fallback also failed for ${newGLNo}:`, fallbackErr.message);
          skipped++;
        }
      }
    }

    // Response
    return res.status(201).json({
      success: true,
      message: `Successfully cloned ${created} accounts from branch ${sourceBranchCode} to ${targetBranchCode}`,
      data: {
        newBranch: {
          _id: newBranch._id,
          branchCode: newBranch.branchCode,
          branchName: newBranch.branchName,
          branchType: newBranch.branchType,
          organizationCode: newBranch.organizationCode
        },
        statistics: { 
          created, 
          skipped, 
          total: sourceAccounts.length,
          successRate: created > 0 ? `${((created / sourceAccounts.length) * 100).toFixed(1)}%` : '0%'
        },
        accountMapping: mapping,
        sourceBranch: sourceBranchCode,
        targetBranch: targetBranchCode
      }
    });

  } catch (error) {
    console.error('❌ CLONE ERROR:', error);
    return res.status(500).json({
      success: false,
      message: 'Clone failed',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};
// Bulk create all dynamic GL accounts for a branch
const createAllDynamicGLAccountsForBranch = async (req, res) => {
  logger.info('createAllDynamicGLAccountsForBranch hit with body:', { body: req.body });
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        organizationName,
        branchCode,
        subBranchCode = '001',
        accountSuffix = '100',
        CREATED_BY
      } = req.body;
      if (!organizationName || !branchCode || !CREATED_BY) {
        throw new Error('Missing required fields: organizationName, branchCode, CREATED_BY');
      }
      // Validate organization and branch
      const trimmedOrgName = organizationName.trim();
      const organization = await Organization.findOne({ organizationName: trimmedOrgName }).session(session);
      if (!organization) {
        throw new Error(`Organization ${trimmedOrgName} not found`);
      }
      const branch = await Branch.findOne({
        organizationName: trimmedOrgName,
        branchCode,
      }).session(session);
    
      if (!branch) {
        throw new Error(`Branch with code ${branchCode} not found`);
      }
      // Get all GL accounts for this branch
      const allAccounts = getAllGLAccountsForBranch(branchCode, subBranchCode, accountSuffix);
      const createdAccounts = [];
      // Create each GL account
      for (const [accountType, glAcctNo] of Object.entries(allAccounts)) {
        const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
      
        if (!existingAccount) {
          const templateConfig = GL_ACCOUNT_TEMPLATES[accountType] ||
            { description: `${accountType.replace('_', ' ')} Account`, transactionType: 'GENERAL' };
          const newGLAccount = new GLAccount({
            GL_ACCT_NO: glAcctNo,
            GL_ACCT_ID: await generateNextGLAcctId(session),
            CREATED_BY,
            organizationName: trimmedOrgName,
            organizationCode: organization.organizationCode,
            branchName: branch.branchName,
            branchCode,
            branchType: branch.branchType,
            ACCT_DESC: templateConfig.description,
            GL_ACCT_CAT: determineCategoryFromAccountType(accountType),
            BAL_CD: determineBalanceCode(accountType),
            TRANSACTION_TYPE: templateConfig.transactionType,
            CR_ALLOWED: determineCreditAllowed(accountType),
            DR_ALLOWED: determineDebitAllowed(accountType),
            REC_ST: 'Active',
            POST_ALLOW: true,
            LEDGER_BALANCE: 0,
            AVAILABLE_BALANCE: 0,
            CURRENCY_CODE: 'NGN',
            SETTLEMENT_GL_ACCT_NO: glAcctNo,
            metadata: {
              accountType,
              subBranchCode,
              accountSuffix,
              templateGenerated: true,
              dynamicAccount: true,
              bulkCreated: true
            }
          });
          await newGLAccount.save({ session });
          createdAccounts.push(newGLAccount);
          logger.info(`Created dynamic GL account: ${glAcctNo}`, { accountType });
        } else {
          createdAccounts.push(existingAccount);
        }
      }
      // Audit trail for bulk creation
      await addAuditTrail({
        EVENT_TYPE: 'BULK_CREATE_DYNAMIC_GL_ACCOUNTS',
        USER_ID: CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: {
          branchCode,
          organizationName: trimmedOrgName,
          accountsCreated: createdAccounts.length,
          accountTypes: Object.keys(allAccounts)
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: branch._id,
        ENTITY_TYPE: 'Branch',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created ${createdAccounts.length} dynamic GL accounts for branch ${branchCode}`,
        REFERENCE_NO: `BULK-GL-${branch._id}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {},
        session,
      });
      return res.status(201).json({
        success: true,
        message: `Successfully created/verified ${createdAccounts.length} dynamic GL accounts for branch ${branchCode}`,
        data: createdAccounts,
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating bulk dynamic GL accounts', {
      error: error.message,
      body: req.body,
    });
  
    return res.status(400).json({
      success: false,
      message: 'Error creating dynamic GL accounts',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};
// NEW FUNCTION: Get Branch GL Account Summary
const getBranchGLAccountSummary = async (req, res) => {
  try {
    const { organizationCode, branchCode } = req.params;
    if (!organizationCode || !branchCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: organizationCode, branchCode'
      });
    }
    const summary = await GLAccount.getBranchBalanceSummary(organizationCode, branchCode);
  
    const totalBalance = summary.reduce((sum, item) => sum + item.totalBalance, 0);
    const totalAccounts = summary.reduce((count, item) => count + item.accountCount, 0);
    return res.status(200).json({
      success: true,
      data: {
        organizationCode,
        branchCode,
        totalBalance,
        totalAccounts,
        breakdown: summary
      }
    });
  } catch (error) {
    logger.error('Error getting branch GL account summary', {
      error: error.message,
      params: req.params
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting branch GL account summary',
      error: error.message
    });
  }
};
// NEW FUNCTION: Get Organization GL Accounts
const getOrganizationGLAccounts = async (req, res) => {
  try {
    const { organizationCode } = req.params;
    const { includeInactive = false } = req.query;
    if (!organizationCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: organizationCode'
      });
    }
    const query = { organizationCode };
    if (!includeInactive) {
      query.REC_ST = 'Active';
    }
    const accounts = await GLAccount.find(query)
      .select('GL_ACCT_NO ACCT_DESC LEDGER_BALANCE branchCode branchName metadata REC_ST')
      .sort({ branchCode: 1, GL_ACCT_NO: 1 });
    // Group by branch
    const branches = {};
    accounts.forEach(account => {
      if (!branches[account.branchCode]) {
        branches[account.branchCode] = {
          branchCode: account.branchCode,
          branchName: account.branchName,
          accounts: [],
          totalBalance: 0
        };
      }
      branches[account.branchCode].accounts.push(account);
      branches[account.branchCode].totalBalance += account.LEDGER_BALANCE;
    });
    return res.status(200).json({
      success: true,
      data: {
        organizationCode,
        totalBranches: Object.keys(branches).length,
        totalAccounts: accounts.length,
        branches: Object.values(branches)
      }
    });
  } catch (error) {
    logger.error('Error getting organization GL accounts', {
      error: error.message,
      params: req.params
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting organization GL accounts',
      error: error.message
    });
  }
};
// UPDATED: createLedgerEntry function with branch tracking in transactions
export const createLedgerEntry = async (req, res, transactionData, options = {}) => {
  const session = options.session || await mongoose.startSession();
  let transactionCompleted = false;
  try {
    await session.withTransaction(async () => {
      const inputData = transactionData || req?.body;
      if (!inputData || Object.keys(inputData).length === 0) {
        throw new Error('Request body is empty or undefined');
      }
      const {
        DR_ACCT_NO,
        CR_ACCT_NO,
        AMOUNT,
        NARRATION,
        CREATED_BY,
        TRANSACTION_TYPE,
        JOURNAL_ID,
        CURRENCY_CODE = 'NGN',
        branchCode // Optional branch code for transaction tracking
      } = inputData;
      // Validate mandatory fields
      if (!DR_ACCT_NO || !CR_ACCT_NO || !AMOUNT || !CREATED_BY) {
        throw new Error('Missing required fields for ledger transaction');
      }
      // Fetch Debit and Credit Accounts
      const debitAccount = await GLAccount.findOne({ GL_ACCT_NO: DR_ACCT_NO }).session(session);
      if (!debitAccount) throw new Error(`Debit account ${DR_ACCT_NO} not found`);
      const creditAccount = await GLAccount.findOne({ GL_ACCT_NO: CR_ACCT_NO }).session(session);
      if (!creditAccount) throw new Error(`Credit account ${CR_ACCT_NO} not found`);
      // Check if accounts allow posting
      if (!debitAccount.canPost('DR')) {
        throw new Error(`Debit account ${DR_ACCT_NO} does not allow DR transactions`);
      }
      if (!creditAccount.canPost('CR')) {
        throw new Error(`Credit account ${CR_ACCT_NO} does not allow CR transactions`);
      }
      // Generate journal ID if not provided
      const journalId = JOURNAL_ID || generateJournalId();
      const transactionId = generateTransactionId();
      // Use account's branch code if not provided in transaction
      const transactionBranchCode = branchCode || debitAccount.branchCode;
      // Post Debit
      debitAccount.LEDGER_BALANCE = (debitAccount.LEDGER_BALANCE || 0) - AMOUNT;
      debitAccount.AVAILABLE_BALANCE = (debitAccount.AVAILABLE_BALANCE || 0) - AMOUNT;
      debitAccount.transactions.push({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        TYPE: 'DEBIT',
        AMOUNT,
        NARRATION,
        CREATED_BY,
        CREATED_AT: new Date(),
        branchCode: transactionBranchCode,
      });
      await debitAccount.save({ session });
      // Post Credit
      creditAccount.LEDGER_BALANCE = (creditAccount.LEDGER_BALANCE || 0) + AMOUNT;
      creditAccount.AVAILABLE_BALANCE = (creditAccount.AVAILABLE_BALANCE || 0) + AMOUNT;
      creditAccount.transactions.push({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        TYPE: 'CREDIT',
        AMOUNT,
        NARRATION,
        CREATED_BY,
        CREATED_AT: new Date(),
        branchCode: transactionBranchCode,
      });
      await creditAccount.save({ session });
      // Save transaction record
      const newTransaction = new GLAccountTransaction({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        DR_ACCT_NO,
        CR_ACCT_NO,
        AMOUNT,
        NARRATION,
        CREATED_BY,
        TRANSACTION_TYPE,
        CURRENCY_CODE,
        branchCode: transactionBranchCode,
        STATUS: 'POSTED',
        CREATED_AT: new Date(),
      });
      await newTransaction.save({ session });
      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'LEDGER_ENTRY',
        USER_ID: CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: {
          DR_ACCT_NO,
          CR_ACCT_NO,
          AMOUNT,
          JOURNAL_ID: journalId,
          branchCode: transactionBranchCode,
          debitAccountBranch: debitAccount.branchCode,
          creditAccountBranch: creditAccount.branchCode
        },
        OLD_VALUE: null,
        IP_ADDRESS: req?.ip,
        ENTITY_ID: newTransaction._id,
        ENTITY_TYPE: 'GLAccountTransaction',
        session,
      });
      await session.commitTransaction();
      transactionCompleted = true;
      return res && typeof res.status === 'function'
        ? res.status(201).json({ message: 'Ledger entry created successfully', transaction: newTransaction })
        : { queued: false, transaction: newTransaction };
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error creating ledger transaction:', { error: error.message, transactionData: transactionData || req?.body || {} });
    const errRes = {
      message: 'Server error creating ledger transaction',
      error: error.message,
    };
    return res && typeof res.status === 'function'
      ? res.status(
          error.message.includes('Invalid') ||
          error.message.includes('not found') ||
          error.message.includes('Missing') ||
          error.message.includes('Insufficient') ? 400 : 500
        ).json(errRes)
      : errRes;
  } finally {
    if (!options.session) {
      session.endSession();
    }
  }
};
// NEW FUNCTION: Get Inter-Branch Accounts
const getInterBranchAccounts = async (req, res) => {
  try {
    const { organizationCode } = req.params;
    if (!organizationCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: organizationCode'
      });
    }
    const interBranchAccounts = await GLAccount.findInterBranchAccounts(organizationCode);
    return res.status(200).json({
      success: true,
      data: {
        organizationCode,
        accounts: interBranchAccounts
      }
    });
  } catch (error) {
    logger.error('Error getting inter-branch accounts', {
      error: error.message,
      params: req.params
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting inter-branch accounts',
      error: error.message
    });
  }
};
// NEW FUNCTION: Search GL Accounts
const searchGLAccounts = async (req, res) => {
  try {
    const { organizationCode, branchCode, accountType, GL_ACCT_NO } = req.query;
  
    const query = {};
    if (organizationCode) query.organizationCode = organizationCode;
    if (branchCode) query.branchCode = branchCode;
    if (accountType) query['metadata.accountType'] = accountType;
    if (GL_ACCT_NO) query.GL_ACCT_NO = { $regex: GL_ACCT_NO, $options: 'i' };
    const accounts = await GLAccount.find(query)
      .select('GL_ACCT_NO ACCT_DESC LEDGER_BALANCE branchCode branchName metadata REC_ST')
      .sort({ GL_ACCT_NO: 1 });
    return res.status(200).json({
      success: true,
      data: {
        accounts,
        totalCount: accounts.length
      }
    });
  } catch (error) {
    logger.error('Error searching GL accounts', {
      error: error.message,
      query: req.query
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error searching GL accounts',
      error: error.message
    });
  }
};
// NEW FUNCTION: Get All GL Accounts
const getAllGLAccounts = async (req, res) => {
  try {
    const { page = 1, limit = 50, branchCode, organizationCode } = req.query;
  
    const query = {};
    if (branchCode) query.branchCode = branchCode;
    if (organizationCode) query.organizationCode = organizationCode;
    const accounts = await GLAccount.find(query)
      .select('GL_ACCT_NO ACCT_DESC LEDGER_BALANCE branchCode branchName metadata REC_ST')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ GL_ACCT_NO: 1 });
    const total = await GLAccount.countDocuments(query);
    return res.status(200).json({
      success: true,
      data: {
        accounts,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        totalCount: total
      }
    });
  } catch (error) {
    logger.error('Error getting all GL accounts', {
      error: error.message
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting GL accounts',
      error: error.message
    });
  }
};
// NEW FUNCTION: Get GL Account by ID
const getGLAccountById = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;
    const account = await GLAccount.findOne({ GL_ACCT_NO });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'GL Account not found'
      });
    }
    return res.status(200).json({
      success: true,
      data: account
    });
  } catch (error) {
    logger.error('Error getting GL account by ID', {
      error: error.message,
      GL_ACCT_NO: req.params.GL_ACCT_NO
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting GL account',
      error: error.message
    });
  }
};
// NEW FUNCTION: Update GL Account
const updateGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { GL_ACCT_NO } = req.params;
      const updateData = req.body;
      const account = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
      if (!account) {
        throw new Error('GL Account not found');
      }
      // Update allowed fields
      const allowedFields = ['ACCT_DESC', 'REC_ST', 'CR_ALLOWED', 'DR_ALLOWED', 'POST_ALLOW', 'DELAY_GL_POSTING'];
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          account[field] = updateData[field];
        }
      });
      await account.save({ session });
      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE_GL_ACCOUNT',
        USER_ID: updateData.UPDATED_BY || 'system',
        ACTION: 'UPDATE',
        NEW_VALUE: updateData,
        OLD_VALUE: account._doc,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: account._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Updated GL account ${GL_ACCT_NO}`,
        REFERENCE_NO: `UPDATE-GL-${account._id}`,
        ACCOUNT_NO: GL_ACCT_NO,
        ADDITIONAL_INFO: {},
        session,
      });
      return res.status(200).json({
        success: true,
        message: 'GL account updated successfully',
        data: account
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error updating GL account', {
      error: error.message,
      GL_ACCT_NO: req.params.GL_ACCT_NO
    });
  
    return res.status(400).json({
      success: false,
      message: 'Error updating GL account',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// NEW FUNCTION: Update GL Account Status
const updateGLAccountStatus = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { GL_ACCT_NO } = req.params;
      const { REC_ST, UPDATED_BY } = req.body;
      if (!REC_ST || !UPDATED_BY) {
        throw new Error('Missing required fields: REC_ST, UPDATED_BY');
      }
      const account = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
      if (!account) {
        throw new Error('GL Account not found');
      }
      const oldStatus = account.REC_ST;
      account.REC_ST = REC_ST;
      await account.save({ session });
      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE_GL_ACCOUNT_STATUS',
        USER_ID: UPDATED_BY,
        ACTION: 'UPDATE',
        NEW_VALUE: { REC_ST },
        OLD_VALUE: { REC_ST: oldStatus },
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: account._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Updated GL account ${GL_ACCT_NO} status from ${oldStatus} to ${REC_ST}`,
        REFERENCE_NO: `STATUS-GL-${account._id}`,
        ACCOUNT_NO: GL_ACCT_NO,
        ADDITIONAL_INFO: {},
        session,
      });
      return res.status(200).json({
        success: true,
        message: 'GL account status updated successfully',
        data: account
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error updating GL account status', {
      error: error.message,
      GL_ACCT_NO: req.params.GL_ACCT_NO
    });
  
    return res.status(400).json({
      success: false,
      message: 'Error updating GL account status',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// NEW FUNCTION: Delete GL Account
const deleteGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { GL_ACCT_NO } = req.params;
      const { DELETED_BY } = req.body;
      if (!DELETED_BY) {
        throw new Error('Missing required field: DELETED_BY');
      }
      const account = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
      if (!account) {
        throw new Error('GL Account not found');
      }
      // Soft delete by setting status to Inactive
      account.REC_ST = 'Inactive';
      await account.save({ session });
      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'DELETE_GL_ACCOUNT',
        USER_ID: DELETED_BY,
        ACTION: 'DELETE',
        NEW_VALUE: null,
        OLD_VALUE: account._doc,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: account._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Deleted GL account ${GL_ACCT_NO}`,
        REFERENCE_NO: `DELETE-GL-${account._id}`,
        ACCOUNT_NO: GL_ACCT_NO,
        ADDITIONAL_INFO: {},
        session,
      });
      return res.status(200).json({
        success: true,
        message: 'GL account deleted successfully'
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error deleting GL account', {
      error: error.message,
      GL_ACCT_NO: req.params.GL_ACCT_NO
    });
  
    return res.status(400).json({
      success: false,
      message: 'Error deleting GL account',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
const processEODGLTransactions = async (session = null) => {
  const localSession = session || await mongoose.startSession();
  let transactionCompleted = false;
  try {
    const result = await localSession.withTransaction(async () => {
      const pendingTransactions = await PendingGLTransaction.find({ STATUS: 'PENDING' }).session(localSession);
      if (!pendingTransactions.length) {
        logger.info('No pending GL transactions to process');
        return { success: true, message: 'No pending GL transactions to process', processed: [], failed: [], skipped: [] };
      }
      const processedTransactions = [];
      const failedTransactions = [];
      const skippedTransactions = [];
      const BATCH_SIZE = 1000;
      const batches = [];
      for (let i = 0; i < pendingTransactions.length; i += BATCH_SIZE) {
        batches.push(pendingTransactions.slice(i, i + BATCH_SIZE));
      }
      for (const batch of batches) {
        const bulkOps = [];
        const reconciliationOps = [];
        for (const txn of batch) {
          const {
            GL_ACCT_NO,
            TRANSACTION_TYPE,
            AMOUNT,
            JOURNAL_ID,
            CREATED_BY,
            SUB_LEDGER_NO,
            SEG_NO,
            ACCT_DESC,
            BAL_CD,
            GL_ACCT_CAT,
            CURRENCY_CODE,
            EXCHANGE_RATE,
            REFERENCE_ID,
            debitAccount,
            creditAccount,
            branchCode // Added branch code support
          } = txn;
          if (debitAccount && creditAccount) {
            const debitLedger = await GLAccount.findById(debitAccount).session(localSession);
            const creditLedger = await GLAccount.findById(creditAccount).session(localSession);
            if (!debitLedger || !creditLedger) {
              logger.warn(`Missing GL accounts for paired transaction ${txn._id}`, { debitAccount, creditAccount });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: 'Missing GL accounts', processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: 'Missing GL accounts' });
              continue;
            }
            // Enhanced category lookup with organizationCode and branchCode
            const debitCategory = await GLAccountCategory.findOne({
              categoryCode: debitLedger.GL_ACCT_CAT,
              organizationName: debitLedger.organizationName,
              organizationCode: debitLedger.organizationCode,
              branchName: debitLedger.branchName,
              branchCode: debitLedger.branchCode
            }).session(localSession);
          
            const creditCategory = await GLAccountCategory.findOne({
              categoryCode: creditLedger.GL_ACCT_CAT,
              organizationName: creditLedger.organizationName,
              organizationCode: creditLedger.organizationCode,
              branchName: creditLedger.branchName,
              branchCode: creditLedger.branchCode
            }).session(localSession);
          
            if (!debitCategory || !creditCategory) {
              logger.warn(`Invalid GL_ACCT_CAT for transaction ${txn._id}`, {
                debitCategory: debitLedger.GL_ACCT_CAT,
                creditCategory: creditLedger.GL_ACCT_CAT,
                debitOrganization: debitLedger.organizationCode,
                creditOrganization: creditLedger.organizationCode
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: 'Invalid GL_ACCT_CAT', processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: 'Invalid GL_ACCT_CAT' });
              continue;
            }
            if (!debitLedger.canPost('DR')) {
              logger.warn(`Debit account ${debitLedger.GL_ACCT_NO} does not allow DR transactions`, {
                transactionId: txn._id,
                branchCode: debitLedger.branchCode
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Debit account ${debitLedger.GL_ACCT_NO} does not allow DR transactions`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Debit account ${debitLedger.GL_ACCT_NO} does not allow DR transactions` });
              continue;
            }
            if (!creditLedger.canPost('CR')) {
              logger.warn(`Credit account ${creditLedger.GL_ACCT_NO} does not allow CR transactions`, {
                transactionId: txn._id,
                branchCode: creditLedger.branchCode
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Credit account ${creditLedger.GL_ACCT_NO} does not allow CR transactions`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Credit account ${creditLedger.GL_ACCT_NO} does not allow CR transactions` });
              continue;
            }
            // Enhanced balance check with available balance
            const isDebitAsset = debitCategory.categoryName === 'ASSET' || (await debitCategory.getFullPath()).startsWith('1 - ASSET');
            if (isDebitAsset && (debitLedger.AVAILABLE_BALANCE || 0) < AMOUNT) {
              logger.warn(`Insufficient available balance in debit account ${debitLedger.GL_ACCT_NO}`, {
                transactionId: txn._id,
                availableBalance: debitLedger.AVAILABLE_BALANCE,
                requestedAmount: AMOUNT
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Insufficient available balance in debit account ${debitLedger.GL_ACCT_NO}`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Insufficient available balance in debit account ${debitLedger.GL_ACCT_NO}` });
              continue;
            }
            // Use transaction branch code or account branch code
            const transactionBranchCode = branchCode || debitLedger.branchCode;
            const debitTransactionData = {
              GL_ACCT_NO: debitLedger.GL_ACCT_NO,
              AMOUNT,
              TRANSACTION_TYPE: 'DR',
              CREATED_BY,
              SUB_LEDGER_NO: SUB_LEDGER_NO || '000',
              SEG_NO: SEG_NO || '1',
              ACCT_DESC: ACCT_DESC || `Paired debit for ${debitLedger.GL_ACCT_NO}`,
              JOURNAL_ID,
              BAL_CD: debitLedger.BAL_CD || '01',
              GL_ACCT_CAT: debitLedger.GL_ACCT_CAT,
              CURRENCY_CODE: CURRENCY_CODE || 'NGN',
              EXCHANGE_RATE: EXCHANGE_RATE || 1,
              REFERENCE_ID,
              branchCode: transactionBranchCode, // Add branch code to transaction
            };
            const creditTransactionData = {
              GL_ACCT_NO: creditLedger.GL_ACCT_NO,
              AMOUNT,
              TRANSACTION_TYPE: 'CR',
              CREATED_BY,
              SUB_LEDGER_NO: SUB_LEDGER_NO || '000',
              SEG_NO: SEG_NO || '1',
              ACCT_DESC: ACCT_DESC || `Paired credit for ${creditLedger.GL_ACCT_NO}`,
              JOURNAL_ID,
              BAL_CD: creditLedger.BAL_CD || '01',
              GL_ACCT_CAT: creditLedger.GL_ACCT_CAT,
              CURRENCY_CODE: CURRENCY_CODE || 'NGN',
              EXCHANGE_RATE: EXCHANGE_RATE || 1,
              REFERENCE_ID,
              branchCode: transactionBranchCode, // Add branch code to transaction
            };
            // Process both transactions
            await createLedgerEntry(null, null, debitTransactionData, { session: localSession });
            await createLedgerEntry(null, null, creditTransactionData, { session: localSession });
            // Enhanced audit trail with branch information
            await addAuditTrail({
              eventId: JOURNAL_ID,
              userId: CREATED_BY || 'system',
              eventType: 'GL_ACCOUNT_TRANSFER',
              action: `Transfer ${AMOUNT} from ${debitLedger.GL_ACCT_NO} to ${creditLedger.GL_ACCT_NO}`,
              oldValue: {
                debitBalance: debitLedger.LEDGER_BALANCE,
                debitAvailableBalance: debitLedger.AVAILABLE_BALANCE,
                creditBalance: creditLedger.LEDGER_BALANCE,
                creditAvailableBalance: creditLedger.AVAILABLE_BALANCE,
                debitCategoryPath: await debitCategory.getFullPath(),
                creditCategoryPath: await creditCategory.getFullPath(),
                debitBranch: debitLedger.branchCode,
                creditBranch: creditLedger.branchCode,
              },
              newValue: {
                debitBalance: debitLedger.LEDGER_BALANCE - AMOUNT,
                debitAvailableBalance: (debitLedger.AVAILABLE_BALANCE || 0) - AMOUNT,
                creditBalance: creditLedger.LEDGER_BALANCE + AMOUNT,
                creditAvailableBalance: (creditLedger.AVAILABLE_BALANCE || 0) + AMOUNT,
                debitCategoryPath: await debitCategory.getFullPath(),
                creditCategoryPath: await creditCategory.getFullPath(),
                debitBranch: debitLedger.branchCode,
                creditBranch: creditLedger.branchCode,
              },
              ipAddress: '127.0.0.1',
              accountNo: `${debitLedger.GL_ACCT_NO}/${creditLedger.GL_ACCT_NO}`,
              branchCode: transactionBranchCode,
              session: localSession,
            });
            const reconciliation = new Reconciliation({
              JOURNAL_ID,
              GL_ACCT_NO: `${debitLedger.GL_ACCT_NO}/${creditLedger.GL_ACCT_NO}`,
              TRANSACTION_ID: generateTransactionId(),
              AMOUNT,
              CURRENCY_CODE: CURRENCY_CODE || 'NGN',
              EXTERNAL_REF: REFERENCE_ID || '',
              STATUS: 'Pending',
              BRANCH_CODE: transactionBranchCode, // Add branch code to reconciliation
              CREATED_AT: new Date(),
            });
            reconciliationOps.push({
              insertOne: {
                document: reconciliation,
              },
            });
            bulkOps.push({
              updateOne: {
                filter: { _id: txn._id },
                update: { $set: { STATUS: 'PROCESSED', processedAt: new Date() } },
              },
            });
            processedTransactions.push({
              transactionId: txn._id,
              GL_ACCT_NO: `${debitLedger.GL_ACCT_NO}/${creditLedger.GL_ACCT_NO}`,
              TRANSACTION_TYPE: 'TRANSFER',
              AMOUNT,
              JOURNAL_ID,
              BRANCH_CODE: transactionBranchCode,
              PROCESSED_AT: new Date(),
              status: 'PROCESSED',
            });
          } else {
            // Single account transaction processing
            const glAccount = await GLAccount.findOne({ GL_ACCT_NO }).session(localSession);
            if (!glAccount) {
              logger.warn(`GL Account ${GL_ACCT_NO} not found`, { transactionId: txn._id });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `GL Account ${GL_ACCT_NO} not found`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `GL Account ${GL_ACCT_NO} not found` });
              continue;
            }
            // Enhanced category lookup
            const category = await GLAccountCategory.findOne({
              categoryCode: GL_ACCT_CAT || glAccount.GL_ACCT_CAT,
              organizationName: glAccount.organizationName,
              organizationCode: glAccount.organizationCode,
              branchName: glAccount.branchName,
              branchCode: glAccount.branchCode
            }).session(localSession);
          
            if (!category) {
              logger.warn(`Invalid GL_ACCT_CAT for transaction ${txn._id}`, {
                GL_ACCT_CAT,
                organizationCode: glAccount.organizationCode,
                branchCode: glAccount.branchCode
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Invalid GL_ACCT_CAT ${GL_ACCT_CAT}`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Invalid GL_ACCT_CAT ${GL_ACCT_CAT}` });
              continue;
            }
            if (!glAccount.DELAY_GL_POSTING) {
              logger.warn(`GL Account ${GL_ACCT_NO} does not have DELAY_GL_POSTING enabled`, {
                transactionId: txn._id,
                branchCode: glAccount.branchCode
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `GL Account ${GL_ACCT_NO} does not have DELAY_GL_POSTING enabled`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `GL Account ${GL_ACCT_NO} does not have DELAY_GL_POSTING enabled` });
              continue;
            }
            if (!glAccount.canPost(TRANSACTION_TYPE)) {
              logger.warn(`GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions`, {
                transactionId: txn._id,
                branchCode: glAccount.branchCode
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions` });
              continue;
            }
            // Enhanced balance check with available balance
            const isAsset = category.categoryName === 'ASSET' || (await category.getFullPath()).startsWith('1 - ASSET');
            if (TRANSACTION_TYPE === 'DR' && isAsset && (glAccount.AVAILABLE_BALANCE || 0) < AMOUNT) {
              logger.warn(`Insufficient available balance in GL Account ${GL_ACCT_NO}`, {
                transactionId: txn._id,
                availableBalance: glAccount.AVAILABLE_BALANCE,
                requestedAmount: AMOUNT
              });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Insufficient available balance in GL Account ${GL_ACCT_NO}`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Insufficient available balance in GL Account ${GL_ACCT_NO}` });
              continue;
            }
            const transactionBranchCode = branchCode || glAccount.branchCode;
            const transactionData = {
              GL_ACCT_NO,
              AMOUNT,
              TRANSACTION_TYPE,
              CREATED_BY,
              SUB_LEDGER_NO: SUB_LEDGER_NO || '000',
              SEG_NO: SEG_NO || '1',
              ACCT_DESC: ACCT_DESC || `EOD processed transaction ${JOURNAL_ID}`,
              JOURNAL_ID,
              BAL_CD: BAL_CD || glAccount.BAL_CD || '01',
              GL_ACCT_CAT: GL_ACCT_CAT || glAccount.GL_ACCT_CAT,
              CURRENCY_CODE: CURRENCY_CODE || 'NGN',
              EXCHANGE_RATE: EXCHANGE_RATE || 1,
              REFERENCE_ID,
              branchCode: transactionBranchCode, // Add branch code to transaction
            };
            const result = await createLedgerEntry(null, null, transactionData, { session: localSession });
            if (result.queued) {
              logger.warn(`Transaction ${txn._id} was re-queued due to DELAY_GL_POSTING`, {
                transactionId: txn._id,
                branchCode: transactionBranchCode
              });
              skippedTransactions.push({ transactionId: txn._id, reason: `Transaction re-queued due to DELAY_GL_POSTING` });
              continue;
            }
            const reconciliation = new Reconciliation({
              JOURNAL_ID,
              GL_ACCT_NO,
              TRANSACTION_ID: generateTransactionId(),
              AMOUNT,
              CURRENCY_CODE: CURRENCY_CODE || 'NGN',
              EXTERNAL_REF: REFERENCE_ID || '',
              STATUS: 'Pending',
              BRANCH_CODE: transactionBranchCode, // Add branch code to reconciliation
              CREATED_AT: new Date(),
            });
            reconciliationOps.push({
              insertOne: {
                document: reconciliation,
              },
            });
            bulkOps.push({
              updateOne: {
                filter: { _id: txn._id },
                update: { $set: { STATUS: 'PROCESSED', processedAt: new Date() } },
              },
            });
            processedTransactions.push({
              transactionId: txn._id,
              GL_ACCT_NO,
              TRANSACTION_TYPE,
              AMOUNT,
              JOURNAL_ID,
              BRANCH_CODE: transactionBranchCode,
              PROCESSED_AT: new Date(),
              status: 'PROCESSED',
            });
          }
        }
        if (bulkOps.length) {
          await PendingGLTransaction.bulkWrite(bulkOps, { session: localSession });
        }
        if (reconciliationOps.length) {
          await Reconciliation.bulkWrite(reconciliationOps, { session: localSession });
        }
      }
      logger.info('EOD GL transactions processed', {
        processedCount: processedTransactions.length,
        failedCount: failedTransactions.length,
        skippedCount: skippedTransactions.length,
        branches: [...new Set(processedTransactions.map(t => t.BRANCH_CODE))] // Log affected branches
      });
      return {
        success: true,
        message: 'EOD GL transactions processed successfully',
        processed: processedTransactions,
        failed: failedTransactions,
        skipped: skippedTransactions,
      };
    });
    transactionCompleted = true;
    await localSession.commitTransaction();
    return result;
  } catch (error) {
    if (localSession.inTransaction() && !transactionCompleted) {
      await localSession.abortTransaction();
    }
    logger.error('Error in processEODGLTransactions:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return {
      success: false,
      message: `EOD GL transaction processing failed: ${error.message}`,
      processed: [],
      failed: [{ reason: error.message }],
      skipped: [],
    };
  } finally {
    if (!session) localSession.endSession();
  }
};
const queueGLTransaction = async ({ debitData, creditData }, options = {}) => {
  const session = options.session || await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Validate inputs
      if (!debitData.GL_ACCT_NO || !creditData.GL_ACCT_NO || !debitData.AMOUNT || !creditData.AMOUNT) {
        throw new Error('Missing required fields: GL_ACCT_NO or AMOUNT');
      }
      if (debitData.AMOUNT !== creditData.AMOUNT) {
        throw new Error('Debit and credit amounts must match');
      }
      // Validate accounts
      const debitAccount = await GLAccount.findOne({ GL_ACCT_NO: debitData.GL_ACCT_NO }).session(session);
      const creditAccount = await GLAccount.findOne({ GL_ACCT_NO: creditData.GL_ACCT_NO }).session(session);
      if (!debitAccount || !creditAccount) {
        throw new Error('Debit or credit GL account not found');
      }
      // Enhanced category validation with organizationCode and branchCode
      const debitCategory = await GLAccountCategory.findOne({
        categoryCode: debitData.GL_ACCT_CAT || debitAccount.GL_ACCT_CAT,
        organizationName: debitAccount.organizationName,
        organizationCode: debitAccount.organizationCode,
        branchName: debitAccount.branchName,
        branchCode: debitAccount.branchCode
      }).session(session);
    
      const creditCategory = await GLAccountCategory.findOne({
        categoryCode: creditData.GL_ACCT_CAT || creditAccount.GL_ACCT_CAT,
        organizationName: creditAccount.organizationName,
        organizationCode: creditAccount.organizationCode,
        branchName: creditAccount.branchName,
        branchCode: creditAccount.branchCode
      }).session(session);
    
      if (!debitCategory || !creditCategory) {
        throw new Error('Invalid GL_ACCT_CAT for debit or credit transaction');
      }
      const journalId = debitData.JOURNAL_ID || generateJournalId();
      // Determine branch code for transactions
      const transactionBranchCode = debitData.branchCode || debitAccount.branchCode;
      // Create debit transaction with branch information
      const debitTxn = new PendingGLTransaction({
        ...debitData,
        TRANSACTION_TYPE: 'DR',
        JOURNAL_ID: journalId,
        STATUS: 'Pending',
        TRANSACTION_DATE: new Date(),
        CURRENCY_CODE: debitData.CURRENCY_CODE || 'NGN',
        EXCHANGE_RATE: debitData.EXCHANGE_RATE || 1,
        branchCode: transactionBranchCode, // Add branch code
        organizationCode: debitAccount.organizationCode, // Add organization code
      });
      // Create credit transaction with branch information
      const creditTxn = new PendingGLTransaction({
        ...creditData,
        TRANSACTION_TYPE: 'CR',
        JOURNAL_ID: journalId,
        STATUS: 'Pending',
        TRANSACTION_DATE: new Date(),
        CURRENCY_CODE: creditData.CURRENCY_CODE || 'NGN',
        EXCHANGE_RATE: creditData.EXCHANGE_RATE || 1,
        branchCode: transactionBranchCode, // Add branch code
        organizationCode: creditAccount.organizationCode, // Add organization code
      });
      // Save transactions in batch
      await Promise.all([
        debitTxn.save({ session }),
        creditTxn.save({ session }),
      ]);
      // Enhanced audit trail with branch information
      await addAuditTrail({
        EVENT_TYPE: 'QUEUE_GL_TRANSACTION',
        USER_ID: debitData.CREATED_BY || 'system',
        ACTION: 'QUEUE',
        NEW_VALUE: {
          DEBIT_GL_ACCT_NO: debitData.GL_ACCT_NO,
          CREDIT_GL_ACCT_NO: creditData.GL_ACCT_NO,
          JOURNAL_ID: journalId,
          DEBIT_CATEGORY_PATH: await debitCategory.getFullPath(),
          CREDIT_CATEGORY_PATH: await creditCategory.getFullPath(),
          DEBIT_BRANCH: debitAccount.branchCode,
          CREDIT_BRANCH: creditAccount.branchCode,
          TRANSACTION_BRANCH: transactionBranchCode,
          AMOUNT: debitData.AMOUNT,
        },
        OLD_VALUE: null,
        IP_ADDRESS: '127.0.0.1',
        ENTITY_ID: journalId,
        ENTITY_TYPE: 'PendingGLTransaction',
        BRANCH_CODE: transactionBranchCode,
        session,
      });
      logger.info(`Paired transactions queued for EOD processing`, {
        JOURNAL_ID: journalId,
        Debit_GL_ACCT_NO: debitData.GL_ACCT_NO,
        Credit_GL_ACCT_NO: creditData.GL_ACCT_NO,
        Branch: transactionBranchCode,
        Amount: debitData.AMOUNT
      });
    
      return { queued: true, debitTxn, creditTxn };
    });
  } catch (error) {
    logger.error('Error queuing paired GL transactions:', {
      error: error.message,
      debitData: { ...debitData, GL_ACCT_NO: debitData.GL_ACCT_NO },
      creditData: { ...creditData, GL_ACCT_NO: creditData.GL_ACCT_NO }
    });
    throw error;
  } finally {
    if (!options.session) session.endSession();
  }
};
const approveGLTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCompleted = false;
  try {
    await session.withTransaction(async () => {
      const { journalId } = req.params;
      const { APPROVED_BY } = req.body;
      const pendingTransaction = await PendingGLTransaction.findOne({ JOURNAL_ID: journalId }).session(session);
      if (!pendingTransaction) {
        throw new Error(`Pending transaction with JOURNAL_ID ${journalId} not found`);
      }
      if (pendingTransaction.STATUS !== 'PENDING') {
        throw new Error(`Transaction with JOURNAL_ID ${journalId} is not in PENDING status`);
      }
      const glAccount = await GLAccount.findOne({ GL_ACCT_NO: pendingTransaction.GL_ACCT_NO }).session(session);
      if (!glAccount) {
        throw new Error(`GL Account ${pendingTransaction.GL_ACCT_NO} not found`);
      }
      // Enhanced category lookup
      const category = await GLAccountCategory.findOne({
        categoryCode: pendingTransaction.GL_ACCT_CAT,
        organizationName: glAccount.organizationName,
        organizationCode: glAccount.organizationCode,
        branchName: glAccount.branchName,
        branchCode: glAccount.branchCode
      }).session(session);
    
      if (!category) {
        throw new Error(`Invalid GL_ACCT_CAT: ${pendingTransaction.GL_ACCT_CAT} not found in GLAccountCategory`);
      }
      const transactionData = {
        GL_ACCT_NO: pendingTransaction.GL_ACCT_NO,
        AMOUNT: pendingTransaction.AMOUNT,
        TRANSACTION_TYPE: pendingTransaction.TRANSACTION_TYPE,
        CREATED_BY: pendingTransaction.CREATED_BY,
        SUB_LEDGER_NO: pendingTransaction.SUB_LEDGER_NO,
        SEG_NO: pendingTransaction.SEG_NO,
        ACCT_DESC: pendingTransaction.ACCT_DESC,
        JOURNAL_ID: pendingTransaction.JOURNAL_ID,
        BAL_CD: pendingTransaction.BAL_CD,
        GL_ACCT_CAT: pendingTransaction.GL_ACCT_CAT,
        CURRENCY_CODE: pendingTransaction.CURRENCY_CODE,
        EXCHANGE_RATE: pendingTransaction.EXCHANGE_RATE,
        REFERENCE_ID: pendingTransaction.REFERENCE_ID,
        branchCode: pendingTransaction.branchCode || glAccount.branchCode, // Add branch code
      };
      const result = await createLedgerEntry(null, null, transactionData, { session });
      pendingTransaction.STATUS = 'APPROVED';
      pendingTransaction.APPROVED_BY = APPROVED_BY;
      pendingTransaction.APPROVED_DATE = new Date();
      await pendingTransaction.save({ session });
      // Enhanced audit trail with branch information
      await addAuditTrail({
        eventId: journalId,
        userId: APPROVED_BY,
        eventType: 'GL_TRANSACTION_APPROVED',
        action: `Approved GL Transaction for GL_ACCT_NO ${transactionData.GL_ACCT_NO}`,
        oldValue: {
          STATUS: 'PENDING',
          CATEGORY_PATH: await category.getFullPath(),
          BRANCH: glAccount.branchCode
        },
        newValue: {
          STATUS: 'APPROVED',
          CATEGORY_PATH: await category.getFullPath(),
          BRANCH: glAccount.branchCode
        },
        ipAddress: req?.ip || req.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: transactionData.GL_ACCT_NO,
        branchCode: glAccount.branchCode,
        session,
      });
      logger.info(`Transaction approved`, {
        GL_ACCT_NO: transactionData.GL_ACCT_NO,
        JOURNAL_ID: journalId,
        BRANCH: glAccount.branchCode,
        AMOUNT: pendingTransaction.AMOUNT
      });
      await session.commitTransaction();
      transactionCompleted = true;
      return res.status(200).json({
        message: 'Transaction approved and posted successfully',
        transaction: result.transaction,
        branchCode: glAccount.branchCode,
      });
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error approving GL transaction:', {
      error: error.message,
      journalId,
      timestamp: new Date().toISOString()
    });
    return res.status(
      error.message.includes('not found') || error.message.includes('Invalid') ? 400 : 500
    ).json({
      message: 'Server error approving GL transaction',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};
// NEW FUNCTION: Get COA Structure for Organization
const getCOAStructure = async (req, res) => {
  try {
    const { organizationCode } = req.params;
    if (!organizationCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: organizationCode'
      });
    }
    const coaStructure = await GLAccount.getCOAStructure(organizationCode);
    return res.status(200).json({
      success: true,
      data: {
        organizationCode,
        coaStructure
      }
    });
  } catch (error) {
    logger.error('Error getting COA structure', {
      error: error.message,
      params: req.params
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting COA structure',
      error: error.message
    });
  }
};
// EXPORT FUNCTION: Initialize and Activate GL Accounts (DIAGNOSTIC VERSION)
const initializeAndActivateGLAccounts = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        CREATED_BY,
        organizationCode,
        accountNumbers
      } = req.body;
      if (!CREATED_BY) {
        throw new Error('Missing required field: CREATED_BY');
      }
      logger.info('DIAGNOSTIC: Starting GL accounts activation check', {
        CREATED_BY,
        organizationCode,
        accountNumbers
      });
      // FIRST: Let's check what ACTUALLY exists in the database for these accounts
      const diagnosticQuery = {
        GL_ACCT_NO: { $in: accountNumbers }
      };
    
      if (organizationCode) {
        diagnosticQuery.organizationCode = organizationCode;
      }
      const allRequestedAccounts = await GLAccount.find(diagnosticQuery).session(session);
    
      logger.info('DIAGNOSTIC: All requested accounts in database', {
        totalFound: allRequestedAccounts.length,
        accounts: allRequestedAccounts.map(acc => ({
          _id: acc._id,
          GL_ACCT_NO: acc.GL_ACCT_NO,
          ACCT_DESC: acc.ACCT_DESC,
          REC_ST: acc.REC_ST,
          POST_ALLOW: acc.POST_ALLOW,
          organizationCode: acc.organizationCode,
          systemSource: acc.systemSource,
          CR_ALLOWED: acc.CR_ALLOWED,
          DR_ALLOWED: acc.DR_ALLOWED,
          metadata: acc.metadata
        }))
      });
      // Now check with the activation criteria
      const activationQuery = {
        GL_ACCT_NO: { $in: accountNumbers },
        REC_ST: 'Inactive',
        POST_ALLOW: false
      };
    
      if (organizationCode) {
        activationQuery.organizationCode = organizationCode;
      }
      const inactiveAccounts = await GLAccount.find(activationQuery).session(session);
    
      logger.info('DIAGNOSTIC: Accounts matching activation criteria', {
        totalFound: inactiveAccounts.length,
        accounts: inactiveAccounts.map(acc => ({
          GL_ACCT_NO: acc.GL_ACCT_NO,
          ACCT_DESC: acc.ACCT_DESC,
          REC_ST: acc.REC_ST,
          POST_ALLOW: acc.POST_ALLOW
        }))
      });
      // If no accounts found with inactive status, let's try a broader search
      if (inactiveAccounts.length === 0) {
        // Try without POST_ALLOW filter
        const broaderQuery = {
          GL_ACCT_NO: { $in: accountNumbers },
          REC_ST: 'Inactive'
        };
      
        if (organizationCode) {
          broaderQuery.organizationCode = organizationCode;
        }
        const broaderResults = await GLAccount.find(broaderQuery).session(session);
      
        logger.info('DIAGNOSTIC: Broader search (without POST_ALLOW filter)', {
          totalFound: broaderResults.length,
          accounts: broaderResults.map(acc => ({
            GL_ACCT_NO: acc.GL_ACCT_NO,
            ACCT_DESC: acc.ACCT_DESC,
            REC_ST: acc.REC_ST,
            POST_ALLOW: acc.POST_ALLOW
          }))
        });
        // If still no results, check if accounts are already active
        const activeCheckQuery = {
          GL_ACCT_NO: { $in: accountNumbers }
        };
      
        if (organizationCode) {
          activeCheckQuery.organizationCode = organizationCode;
        }
        const allStatusAccounts = await GLAccount.find(activeCheckQuery).session(session);
      
        const statusBreakdown = allStatusAccounts.reduce((acc, account) => {
          acc[account.REC_ST] = (acc[account.REC_ST] || 0) + 1;
          return acc;
        }, {});
        logger.info('DIAGNOSTIC: Status breakdown of all requested accounts', {
          statusBreakdown,
          details: allStatusAccounts.map(acc => ({
            GL_ACCT_NO: acc.GL_ACCT_NO,
            REC_ST: acc.REC_ST,
            POST_ALLOW: acc.POST_ALLOW,
            organizationCode: acc.organizationCode
          }))
        });
        return res.status(200).json({
          success: true,
          message: 'DIAGNOSTIC: No inactive GL accounts found to activate',
          data: {
            diagnostic: {
              totalAccountsInDatabase: allRequestedAccounts.length,
              accountsFound: allRequestedAccounts.map(acc => ({
                accountNumber: acc.GL_ACCT_NO,
                accountName: acc.ACCT_DESC,
                actualStatus: acc.REC_ST,
                postAllowed: acc.POST_ALLOW,
                organizationCode: acc.organizationCode,
                systemSource: acc.systemSource
              })),
              statusBreakdown,
              activationCriteria: {
                REC_ST: 'Inactive',
                POST_ALLOW: false,
                GL_ACCT_NO: accountNumbers,
                organizationCode: organizationCode || 'any'
              },
              recommendations: [
                'If REC_ST is already "Active", accounts are already activated',
                'If POST_ALLOW is true, remove POST_ALLOW filter from query',
                'Check if organizationCode matches your accounts'
              ]
            }
          }
        });
      }
      // If we found inactive accounts, proceed with activation
      logger.info(`Found ${inactiveAccounts.length} inactive accounts to activate`);
      // Process activation
      const activatedAccounts = [];
      const failedAccounts = [];
      const now = new Date();
      for (const account of inactiveAccounts) {
        try {
          // Update account to active status
          account.REC_ST = 'Active';
          account.POST_ALLOW = true;
          account.updatedAt = now;
          account.metadata = {
            ...account.metadata,
            initialized: true,
            initializedAt: now,
            initializedBy: CREATED_BY,
            previousStatus: 'Inactive'
          };
          await account.save({ session });
          activatedAccounts.push({
            id: account._id,
            accountNumber: account.GL_ACCT_NO,
            accountName: account.ACCT_DESC,
            accountType: account.metadata?.accountType,
            currentBalance: account.LEDGER_BALANCE,
            status: 'Active',
            systemSource: account.systemSource,
            currency: account.CURRENCY_CODE,
            activatedAt: now
          });
        } catch (accountError) {
          failedAccounts.push({
            accountNumber: account.GL_ACCT_NO,
            error: accountError.message
          });
        }
      }
      // Return success response
      return res.status(200).json({
        success: true,
        message: `GL accounts activation completed: ${activatedAccounts.length} activated, ${failedAccounts.length} failed`,
        data: {
          summary: {
            totalInactiveAccounts: inactiveAccounts.length,
            activatedAccounts: activatedAccounts.length,
            failedAccounts: failedAccounts.length,
            activationRate: `${((activatedAccounts.length / inactiveAccounts.length) * 100).toFixed(2)}%`
          },
          activatedAccounts,
          failedAccounts
        }
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error in diagnostic GL accounts activation', {
      error: error.message,
      body: req.body,
    });
  
    return res.status(500).json({
      success: false,
      message: 'Failed to activate GL accounts',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// EXPORT FUNCTION: Force Reactivate GL Accounts (FIXED VERSION)
 const forceReactivateGLAccounts = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        CREATED_BY,
        organizationCode,
        accountNumbers
      } = req.body;
      if (!CREATED_BY || !accountNumbers || !Array.isArray(accountNumbers)) {
        throw new Error('Missing required fields: CREATED_BY and accountNumbers');
      }
      logger.info('FORCE REACTIVATION: Starting force reactivation', {
        CREATED_BY,
        organizationCode,
        accountNumbers
      });
      // Find ALL accounts regardless of current status
      const query = {
        GL_ACCT_NO: { $in: accountNumbers }
      };
    
      if (organizationCode) {
        query.organizationCode = organizationCode;
      }
      const accounts = await GLAccount.find(query).session(session);
    
      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No accounts found with the provided account numbers'
        });
      }
      const reactivatedAccounts = [];
      const failedAccounts = [];
      const now = new Date();
      // Use bulkWrite instead of individual updates to avoid validation
      const bulkOps = accounts.map(account => ({
        updateOne: {
          filter: { _id: account._id },
          update: {
            $set: {
              REC_ST: 'Active',
              POST_ALLOW: true,
              updatedAt: now,
              'metadata.forceReactivated': true,
              'metadata.forceReactivatedAt': now,
              'metadata.forceReactivatedBy': CREATED_BY,
              'metadata.previousStatus': account.REC_ST,
              'metadata.previousPostAllow': account.POST_ALLOW
            }
          }
        }
      }));
      try {
        // Execute bulk operation
        const bulkResult = await GLAccount.bulkWrite(bulkOps, {
          session,
          ordered: false // Continue even if some operations fail
        });
        logger.info('FORCE REACTIVATION: Bulk write result', {
          matched: bulkResult.matchedCount,
          modified: bulkResult.modifiedCount,
          upserted: bulkResult.upsertedCount
        });
        // Check which accounts were successfully updated
        for (const account of accounts) {
          // Reload the account to get updated data
          const updatedAccount = await GLAccount.findById(account._id).session(session);
        
          if (updatedAccount && updatedAccount.REC_ST === 'Active') {
            reactivatedAccounts.push({
              id: updatedAccount._id,
              accountNumber: updatedAccount.GL_ACCT_NO,
              accountName: updatedAccount.ACCT_DESC,
              accountType: updatedAccount.metadata?.accountType,
              currentBalance: updatedAccount.LEDGER_BALANCE,
              status: 'Active',
              systemSource: updatedAccount.systemSource,
              currency: updatedAccount.CURRENCY_CODE,
              previousStatus: account.REC_ST,
              previousPostAllow: account.POST_ALLOW,
              reactivatedAt: now
            });
          } else {
            failedAccounts.push({
              accountNumber: account.GL_ACCT_NO,
              error: 'Account was not updated successfully'
            });
          }
        }
      } catch (bulkError) {
        logger.error('FORCE REACTIVATION: Bulk write failed', {
          error: bulkError.message
        });
      
        // If bulk write fails, try individual updates with error handling
        for (const account of accounts) {
          try {
            // Use findOneAndUpdate to bypass middleware validation
            const updatedAccount = await GLAccount.findOneAndUpdate(
              { _id: account._id },
              {
                $set: {
                  REC_ST: 'Active',
                  POST_ALLOW: true,
                  updatedAt: now,
                  'metadata.forceReactivated': true,
                  'metadata.forceReactivatedAt': now,
                  'metadata.forceReactivatedBy': CREATED_BY,
                  'metadata.previousStatus': account.REC_ST,
                  'metadata.previousPostAllow': account.POST_ALLOW
                }
              },
              {
                new: true,
                session,
                runValidators: false // Skip schema validation
              }
            );
            if (updatedAccount) {
              reactivatedAccounts.push({
                id: updatedAccount._id,
                accountNumber: updatedAccount.GL_ACCT_NO,
                accountName: updatedAccount.ACCT_DESC,
                accountType: updatedAccount.metadata?.accountType,
                currentBalance: updatedAccount.LEDGER_BALANCE,
                status: 'Active',
                systemSource: updatedAccount.systemSource,
                currency: updatedAccount.CURRENCY_CODE,
                previousStatus: account.REC_ST,
                previousPostAllow: account.POST_ALLOW,
                reactivatedAt: now
              });
            } else {
              failedAccounts.push({
                accountNumber: account.GL_ACCT_NO,
                error: 'Account update returned null'
              });
            }
          } catch (individualError) {
            failedAccounts.push({
              accountNumber: account.GL_ACCT_NO,
              error: individualError.message
            });
          }
        }
      }
      // Return response
      return res.status(200).json({
        success: true,
        message: `Force reactivation completed: ${reactivatedAccounts.length} updated, ${failedAccounts.length} failed`,
        data: {
          summary: {
            totalAccounts: accounts.length,
            reactivatedAccounts: reactivatedAccounts.length,
            failedAccounts: failedAccounts.length,
            successRate: `${((reactivatedAccounts.length / accounts.length) * 100).toFixed(2)}%`
          },
          reactivatedAccounts: reactivatedAccounts.map(acc => ({
            id: acc.id,
            accountNumber: acc.accountNumber,
            accountName: acc.accountName,
            accountType: acc.accountType,
            currentBalance: acc.currentBalance,
            status: acc.status,
            systemSource: acc.systemSource,
            currency: acc.currency,
            previousStatus: acc.previousStatus,
            reactivatedAt: acc.reactivatedAt
          })),
          failedAccounts,
          note: 'Used findOneAndUpdate with runValidators: false to bypass schema validation'
        }
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error in force reactivation', {
      error: error.message,
      body: req.body,
    });
  
    return res.status(500).json({
      success: false,
      message: 'Failed to force reactivate GL accounts',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// EXPORT FUNCTION: Get Activation Status Report
const getGLActivationStatus = async (req, res) => {
  try {
    const { organizationCode, includeDetails = false, limit = 100 } = req.query;
    // Build query - organizationCode is optional
    const query = {};
    if (organizationCode) {
      query.organizationCode = parseInt(organizationCode);
    }
    logger.info('Getting GL activation status', { query });
    // Get activation statistics
    const activationStats = await GLAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$REC_ST',
          count: { $sum: 1 },
          totalBalance: { $sum: '$LEDGER_BALANCE' },
          accounts: {
            $push: {
              id: '$_id',
              accountNumber: '$GL_ACCT_NO',
              accountName: '$ACCT_DESC',
              systemSource: '$systemSource',
              accountType: '$metadata.accountType',
              ledgerBalance: '$LEDGER_BALANCE',
              organizationCode: '$organizationCode',
              branchCode: '$branchCode'
            }
          }
        }
      }
    ]);
    // If no accounts found, return empty result
    if (activationStats.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No GL accounts found',
        data: {
          summary: {
            totalAccounts: 0,
            totalBalance: 0,
            byStatus: {}
          },
          breakdown: {
            bySystemSource: {},
            byAccountType: {}
          }
        }
      });
    }
    // Get system source breakdown
    const systemSourceStats = await GLAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            systemSource: '$systemSource',
            status: '$REC_ST'
          },
          count: { $sum: 1 },
          totalBalance: { $sum: '$LEDGER_BALANCE' }
        }
      }
    ]);
    // Get account type breakdown
    const accountTypeStats = await GLAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            accountType: '$metadata.accountType',
            status: '$REC_ST'
          },
          count: { $sum: 1 },
          totalBalance: { $sum: '$LEDGER_BALANCE' }
        }
      }
    ]);
    const totalAccounts = activationStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalBalance = activationStats.reduce((sum, stat) => sum + stat.totalBalance, 0);
    const result = {
      success: true,
      data: {
        summary: {
          totalAccounts,
          totalBalance,
          byStatus: activationStats.reduce((acc, stat) => {
            acc[stat._id] = {
              count: stat.count,
              totalBalance: stat.totalBalance,
              percentage: totalAccounts > 0 ? ((stat.count / totalAccounts) * 100).toFixed(2) + '%' : '0%'
            };
            return acc;
          }, {})
        },
        breakdown: {
          bySystemSource: systemSourceStats.reduce((acc, stat) => {
            const source = stat._id.systemSource || 'NEW_SYSTEM';
            if (!acc[source]) acc[source] = {};
            acc[source][stat._id.status] = {
              count: stat.count,
              totalBalance: stat.totalBalance
            };
            return acc;
          }, {}),
          byAccountType: accountTypeStats.reduce((acc, stat) => {
            const type = stat._id.accountType || 'UNKNOWN';
            if (!acc[type]) acc[type] = {};
            acc[type][stat._id.status] = {
              count: stat.count,
              totalBalance: stat.totalBalance
            };
            return acc;
          }, {})
        }
      }
    };
    // Include detailed account lists if requested
    if (includeDetails === 'true') {
      result.data.detailedAccounts = activationStats.reduce((acc, stat) => {
        acc[stat._id] = stat.accounts.slice(0, parseInt(limit));
        return acc;
      }, {});
    }
    logger.info('GL activation status retrieved successfully', {
      totalAccounts,
      statusBreakdown: Object.keys(result.data.summary.byStatus)
    });
    return res.status(200).json(result);
  } catch (error) {
    logger.error('Error getting GL activation status', {
      error: error.message,
      query: req.query,
      stack: error.stack
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting GL activation status',
      error: error.message
    });
  }
};
// EXPORT FUNCTION: Get GL Account by Number
const getGLAccountByNumber = async (req, res) => {
  try {
    const { accountNumber } = req.params;
    if (!accountNumber) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }
    const account = await GLAccount.findOne({ GL_ACCT_NO: accountNumber });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'GL Account not found'
      });
    }
    // Transform to frontend-friendly format
    const transformedAccount = {
      id: account._id,
      accountNumber: account.GL_ACCT_NO,
      accountName: account.ACCT_DESC,
      accountType: account.metadata?.accountType,
      currentBalance: account.LEDGER_BALANCE,
      status: account.REC_ST, // Map REC_ST to status
      systemSource: account.systemSource,
      currency: account.CURRENCY_CODE,
      organizationCode: account.organizationCode,
      branchCode: account.branchCode,
      createdAt: account.createdAt,
      lastUpdated: account.updatedAt,
      // Include raw schema fields for reference
      rawStatus: account.REC_ST,
      postAllowed: account.POST_ALLOW
    };
    return res.status(200).json({
      success: true,
      data: transformedAccount
    });
  } catch (error) {
    logger.error('Error getting GL account by number', {
      accountNumber: req.params.accountNumber,
      error: error.message
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting GL account',
      error: error.message
    });
  }
};
// EXPORT FUNCTION: Activate Specific GL Accounts
const activateSpecificGLAccounts = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        CREATED_BY,
        accountNumbers, // Array of GL_ACCT_NO to activate
        activateWithBalanceCheck = true
      } = req.body;
      if (!CREATED_BY || !accountNumbers || !Array.isArray(accountNumbers)) {
        throw new Error('Missing required fields: CREATED_BY and accountNumbers (array)');
      }
      if (accountNumbers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'accountNumbers array cannot be empty'
        });
      }
      if (accountNumbers.length > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Cannot activate more than 1000 accounts at once'
        });
      }
      logger.info('Activating specific GL accounts', {
        CREATED_BY,
        accountCount: accountNumbers.length,
        accountNumbers: accountNumbers.slice(0, 10) // Log first 10
      });
      // Find the specific accounts
      const accountsToActivate = await GLAccount.find({
        GL_ACCT_NO: { $in: accountNumbers },
        REC_ST: 'Inactive'
      }).session(session);
      if (accountsToActivate.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No inactive accounts found with the provided account numbers'
        });
      }
      const activatedAccounts = [];
      const failedAccounts = [];
      const now = new Date();
      // Process each account
      for (const account of accountsToActivate) {
        try {
          // Optional: Check if account has valid configuration
          if (activateWithBalanceCheck && account.LEDGER_BALANCE < 0 && !account.metadata?.balanceSettings?.allowNegative) {
            failedAccounts.push({
              GL_ACCT_NO: account.GL_ACCT_NO,
              error: 'Account has negative balance and negative balances are not allowed'
            });
            continue;
          }
          // Activate the account
          account.REC_ST = 'Active';
          account.POST_ALLOW = true;
          account.updatedAt = now;
          account.metadata = {
            ...account.metadata,
            initialized: true,
            initializedAt: now,
            initializedBy: CREATED_BY,
            previousStatus: 'Inactive'
          };
          await account.save({ session });
          activatedAccounts.push({
            GL_ACCT_NO: account.GL_ACCT_NO,
            ACCT_DESC: account.ACCT_DESC,
            accountType: account.metadata?.accountType,
            systemSource: account.systemSource,
            LEDGER_BALANCE: account.LEDGER_BALANCE,
            activatedAt: now
          });
        } catch (accountError) {
          failedAccounts.push({
            GL_ACCT_NO: account.GL_ACCT_NO,
            error: accountError.message
          });
        }
      }
      // Audit trail for specific activation
      await addAuditTrail({
        EVENT_TYPE: 'ACTIVATE_SPECIFIC_GL_ACCOUNTS',
        USER_ID: CREATED_BY,
        ACTION: 'UPDATE',
        NEW_VALUE: {
          requestedAccounts: accountNumbers.length,
          activatedAccounts: activatedAccounts.length,
          failedAccounts: failedAccounts.length,
          activationRate: `${((activatedAccounts.length / accountNumbers.length) * 100).toFixed(2)}%`,
          activatedAccountNumbers: activatedAccounts.map(acc => acc.GL_ACCT_NO)
        },
        OLD_VALUE: {
          status: 'Inactive',
          accountNumbers: accountNumbers
        },
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: `GL_SPECIFIC_ACTIVATION_${Date.now()}`,
        ENTITY_TYPE: 'GLAccount',
        STATUS: activatedAccounts.length > 0 ? 'SUCCESS' : 'PARTIAL',
        DESCRIPTION: `Activated ${activatedAccounts.length} specific GL accounts`,
        REFERENCE_NO: `GL-SPECIFIC-${Date.now()}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {
          activateWithBalanceCheck,
          failedAccounts: failedAccounts.slice(0, 10)
        },
        session,
      });
      return res.status(200).json({
        success: true,
        message: `Specific GL accounts activation completed: ${activatedAccounts.length} activated, ${failedAccounts.length} failed`,
        data: {
          summary: {
            requested: accountNumbers.length,
            found: accountsToActivate.length,
            activated: activatedAccounts.length,
            failed: failedAccounts.length,
            successRate: `${((activatedAccounts.length / accountsToActivate.length) * 100).toFixed(2)}%`
          },
          activatedAccounts,
          failedAccounts,
          notFoundAccounts: accountNumbers.filter(num =>
            !accountsToActivate.find(acc => acc.GL_ACCT_NO === num) &&
            !activatedAccounts.find(acc => acc.GL_ACCT_NO === num)
          )
        }
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error activating specific GL accounts', {
      error: error.message,
      body: req.body,
    });
  
    return res.status(500).json({
      success: false,
      message: 'Failed to activate specific GL accounts',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// NEW FUNCTION: Update COA Settings for Existing GL Account
export const updateCOA = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        GL_ACCT_NO,
        UPDATED_BY,
        // Control Settings
        CONTROL_ACCT_FG = false,
        SUSPENSE_ACCT_FG = false,
        ALLOW_BAL_SWING_FG = false,
        POST_ALLOW = true,
        CR_ALLOWED = true,
        DR_ALLOWED = true,
        DELAY_GL_POSTING = false,
        // Balance Settings
        allowNegative = false,
        minimumBalance = 0,
        maximumBalance = 1000000000,
        autoReconcile = true,
        // COA Structure Updates
        isControlAccount = false,
        isSummaryAccount = false,
        parentAccountNo = null,
        level,
        // Additional Metadata
        notes,
        categoryCode,
        categoryName
      } = req.body;
      // Validate required fields
      if (!GL_ACCT_NO || !UPDATED_BY) {
        throw new Error('Missing required fields: GL_ACCT_NO, UPDATED_BY');
      }
      logger.info('Updating COA settings for GL account', {
        GL_ACCT_NO,
        UPDATED_BY,
        controlSettings: {
          CONTROL_ACCT_FG,
          SUSPENSE_ACCT_FG,
          ALLOW_BAL_SWING_FG,
          POST_ALLOW,
          CR_ALLOWED,
          DR_ALLOWED,
          DELAY_GL_POSTING
        }
      });
      // Find the GL account
      const account = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
      if (!account) {
        throw new Error(`GL Account ${GL_ACCT_NO} not found`);
      }
      // Store old values for audit trail
      const oldValues = {
        CONTROL_ACCT_FG: account.CONTROL_ACCT_FG,
        SUSPENSE_ACCT_FG: account.SUSPENSE_ACCT_FG,
        ALLOW_BAL_SWING_FG: account.ALLOW_BAL_SWING_FG,
        POST_ALLOW: account.POST_ALLOW,
        CR_ALLOWED: account.CR_ALLOWED,
        DR_ALLOWED: account.DR_ALLOWED,
        DELAY_GL_POSTING: account.DELAY_GL_POSTING,
        metadata: { ...account.metadata }
      };
      // Update control settings
      account.CONTROL_ACCT_FG = CONTROL_ACCT_FG;
      account.SUSPENSE_ACCT_FG = SUSPENSE_ACCT_FG;
      account.ALLOW_BAL_SWING_FG = ALLOW_BAL_SWING_FG;
      account.POST_ALLOW = POST_ALLOW;
      account.CR_ALLOWED = CR_ALLOWED;
      account.DR_ALLOWED = DR_ALLOWED;
      account.DELAY_GL_POSTING = DELAY_GL_POSTING;
      // Update metadata with balance settings
      account.metadata = {
        ...account.metadata,
        balanceSettings: {
          allowNegative: Boolean(allowNegative),
          minimumBalance: Number(minimumBalance) || 0,
          maximumBalance: Number(maximumBalance) || 1000000000,
          autoReconcile: Boolean(autoReconcile)
        },
        controlAccount: Boolean(CONTROL_ACCT_FG),
        suspenseAccount: Boolean(SUSPENSE_ACCT_FG),
        allowBalanceSwing: Boolean(ALLOW_BAL_SWING_FG),
        notes: notes || account.metadata?.notes,
        lastUpdatedBy: UPDATED_BY,
        lastUpdatedAt: new Date()
      };
      // Update COA structure if provided
      if (account.coaStructure) {
        account.coaStructure.hierarchy = {
          ...account.coaStructure.hierarchy,
          isControlAccount: Boolean(isControlAccount),
          isSummaryAccount: Boolean(isSummaryAccount)
        };
        if (parentAccountNo) {
          account.coaStructure.hierarchy.parentAccountNo = parentAccountNo;
        }
        if (level) {
          account.coaStructure.hierarchy.level = Number(level);
          account.level = Number(level);
        }
      }
      // Update category if provided
      if (categoryCode) {
        account.categoryCode = categoryCode;
      }
      if (categoryName) {
        account.categoryName = categoryName;
      }
      account.updatedAt = new Date();
      // Validate the updated account
      const validationError = account.validateSync();
      if (validationError) {
        throw new Error(`GL Account validation failed: ${validationError.message}`);
      }
      await account.save({ session });
      // Create detailed audit trail
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE_COA_SETTINGS',
        USER_ID: UPDATED_BY,
        ACTION: 'UPDATE',
        NEW_VALUE: {
          GL_ACCT_NO,
          controlSettings: {
            CONTROL_ACCT_FG,
            SUSPENSE_ACCT_FG,
            ALLOW_BAL_SWING_FG,
            POST_ALLOW,
            CR_ALLOWED,
            DR_ALLOWED,
            DELAY_GL_POSTING
          },
          balanceSettings: {
            allowNegative,
            minimumBalance,
            maximumBalance,
            autoReconcile
          },
          coaStructure: {
            isControlAccount,
            isSummaryAccount,
            parentAccountNo,
            level
          },
          categoryUpdates: {
            categoryCode,
            categoryName
          }
        },
        OLD_VALUE: oldValues,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: account._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Updated COA settings for GL account ${GL_ACCT_NO}`,
        REFERENCE_NO: `COA-UPDATE-${account._id}`,
        ACCOUNT_NO: GL_ACCT_NO,
        ADDITIONAL_INFO: {
          changes: getChangedFields(oldValues, {
            CONTROL_ACCT_FG,
            SUSPENSE_ACCT_FG,
            ALLOW_BAL_SWING_FG,
            POST_ALLOW,
            CR_ALLOWED,
            DR_ALLOWED,
            DELAY_GL_POSTING
          })
        },
        session,
      });
      logger.info('COA settings updated successfully', {
        GL_ACCT_NO,
        changes: getChangedFields(oldValues, {
          CONTROL_ACCT_FG,
          SUSPENSE_ACCT_FG,
          ALLOW_BAL_SWING_FG,
          POST_ALLOW,
          CR_ALLOWED,
          DR_ALLOWED,
          DELAY_GL_POSTING
        })
      });
      return res.status(200).json({
        success: true,
        message: 'COA settings updated successfully',
        data: {
          GL_ACCT_NO: account.GL_ACCT_NO,
          ACCT_DESC: account.ACCT_DESC,
          controlSettings: {
            CONTROL_ACCT_FG: account.CONTROL_ACCT_FG,
            SUSPENSE_ACCT_FG: account.SUSPENSE_ACCT_FG,
            ALLOW_BAL_SWING_FG: account.ALLOW_BAL_SWING_FG,
            POST_ALLOW: account.POST_ALLOW,
            CR_ALLOWED: account.CR_ALLOWED,
            DR_ALLOWED: account.DR_ALLOWED,
            DELAY_GL_POSTING: account.DELAY_GL_POSTING
          },
          balanceSettings: account.metadata.balanceSettings,
          coaStructure: account.coaStructure?.hierarchy,
          metadata: {
            controlAccount: account.metadata.controlAccount,
            suspenseAccount: account.metadata.suspenseAccount,
            allowBalanceSwing: account.metadata.allowBalanceSwing,
            lastUpdatedBy: account.metadata.lastUpdatedBy,
            lastUpdatedAt: account.metadata.lastUpdatedAt
          }
        }
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error updating COA settings', {
      error: error.message,
      GL_ACCT_NO: req.body.GL_ACCT_NO,
      body: req.body,
    });
  
    return res.status(400).json({
      success: false,
      message: 'Failed to update COA settings',
      error: error.message,
      code: error.message.includes('not found') ? 'ACCOUNT_NOT_FOUND' :
            error.message.includes('validation') ? 'VALIDATION_ERROR' : 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    session.endSession();
  }
};
// Helper function to detect changed fields
const getChangedFields = (oldValues, newValues) => {
  const changes = {};
  for (const [key, newValue] of Object.entries(newValues)) {
    if (oldValues[key] !== newValue) {
      changes[key] = {
        from: oldValues[key],
        to: newValue
      };
    }
  }
  return changes;
};
// NEW FUNCTION: Bulk Update COA Settings
export const bulkUpdateCOA = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const {
        accountNumbers, // Array of GL_ACCT_NO
        UPDATED_BY,
        updates // Object with fields to update
      } = req.body;
      if (!accountNumbers || !Array.isArray(accountNumbers) || !UPDATED_BY || !updates) {
        throw new Error('Missing required fields: accountNumbers (array), UPDATED_BY, updates');
      }
      if (accountNumbers.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'accountNumbers array cannot be empty'
        });
      }
      if (accountNumbers.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Cannot update more than 100 accounts at once'
        });
      }
      logger.info('Bulk updating COA settings', {
        accountCount: accountNumbers.length,
        UPDATED_BY,
        updates
      });
      // Find all accounts
      const accounts = await GLAccount.find({
        GL_ACCT_NO: { $in: accountNumbers }
      }).session(session);
      if (accounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No accounts found with the provided account numbers'
        });
      }
      const updatedAccounts = [];
      const failedAccounts = [];
      const now = new Date();
      // Process each account
      for (const account of accounts) {
        try {
          const oldValues = {
            CONTROL_ACCT_FG: account.CONTROL_ACCT_FG,
            SUSPENSE_ACCT_FG: account.SUSPENSE_ACCT_FG,
            ALLOW_BAL_SWING_FG: account.ALLOW_BAL_SWING_FG,
            POST_ALLOW: account.POST_ALLOW,
            CR_ALLOWED: account.CR_ALLOWED,
            DR_ALLOWED: account.DR_ALLOWED,
            DELAY_GL_POSTING: account.DELAY_GL_POSTING
          };
          // Apply updates
          if (updates.CONTROL_ACCT_FG !== undefined) {
            account.CONTROL_ACCT_FG = updates.CONTROL_ACCT_FG;
          }
          if (updates.SUSPENSE_ACCT_FG !== undefined) {
            account.SUSPENSE_ACCT_FG = updates.SUSPENSE_ACCT_FG;
          }
          if (updates.ALLOW_BAL_SWING_FG !== undefined) {
            account.ALLOW_BAL_SWING_FG = updates.ALLOW_BAL_SWING_FG;
          }
          if (updates.POST_ALLOW !== undefined) {
            account.POST_ALLOW = updates.POST_ALLOW;
          }
          if (updates.CR_ALLOWED !== undefined) {
            account.CR_ALLOWED = updates.CR_ALLOWED;
          }
          if (updates.DR_ALLOWED !== undefined) {
            account.DR_ALLOWED = updates.DR_ALLOWED;
          }
          if (updates.DELAY_GL_POSTING !== undefined) {
            account.DELAY_GL_POSTING = updates.DELAY_GL_POSTING;
          }
          // Update metadata
          account.metadata = {
            ...account.metadata,
            lastUpdatedBy: UPDATED_BY,
            lastUpdatedAt: now,
            bulkUpdated: true
          };
          account.updatedAt = now;
          await account.save({ session });
          updatedAccounts.push(account.GL_ACCT_NO);
        } catch (accountError) {
          failedAccounts.push({
            GL_ACCT_NO: account.GL_ACCT_NO,
            error: accountError.message
          });
        }
      }
      // Bulk audit trail
      await addAuditTrail({
        EVENT_TYPE: 'BULK_UPDATE_COA_SETTINGS',
        USER_ID: UPDATED_BY,
        ACTION: 'UPDATE',
        NEW_VALUE: {
          totalAccounts: accountNumbers.length,
          updatedAccounts: updatedAccounts.length,
          failedAccounts: failedAccounts.length,
          updatesApplied: updates,
          successRate: `${((updatedAccounts.length / accountNumbers.length) * 100).toFixed(2)}%`
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: `BULK_COA_UPDATE_${Date.now()}`,
        ENTITY_TYPE: 'GLAccount',
        STATUS: updatedAccounts.length > 0 ? 'SUCCESS' : 'PARTIAL',
        DESCRIPTION: `Bulk updated COA settings for ${updatedAccounts.length} accounts`,
        REFERENCE_NO: `BULK-COA-${Date.now()}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {
          updatedAccounts: updatedAccounts.slice(0, 10), // First 10
          failedAccounts: failedAccounts.slice(0, 10) // First 10
        },
        session,
      });
      return res.status(200).json({
        success: true,
        message: `Bulk COA update completed: ${updatedAccounts.length} updated, ${failedAccounts.length} failed`,
        data: {
          summary: {
            requested: accountNumbers.length,
            found: accounts.length,
            updated: updatedAccounts.length,
            failed: failedAccounts.length,
            successRate: `${((updatedAccounts.length / accounts.length) * 100).toFixed(2)}%`
          },
          updatedAccounts,
          failedAccounts,
          notFoundAccounts: accountNumbers.filter(num =>
            !accounts.find(acc => acc.GL_ACCT_NO === num)
          )
        }
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error in bulk COA update', {
      error: error.message,
      body: req.body,
    });
  
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk update COA settings',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};
// NEW FUNCTION: Get COA Settings for Account
const getCOASettings = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;
    if (!GL_ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'GL_ACCT_NO is required'
      });
    }
    const account = await GLAccount.findOne({ GL_ACCT_NO });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'GL Account not found'
      });
    }
    // Return comprehensive COA settings
    const coaSettings = {
      GL_ACCT_NO: account.GL_ACCT_NO,
      ACCT_DESC: account.ACCT_DESC,
      basicInfo: {
        organizationCode: account.organizationCode,
        branchCode: account.branchCode,
        categoryCode: account.categoryCode,
        categoryName: account.categoryName,
        level: account.level,
        REC_ST: account.REC_ST
      },
      controlSettings: {
        CONTROL_ACCT_FG: account.CONTROL_ACCT_FG,
        SUSPENSE_ACCT_FG: account.SUSPENSE_ACCT_FG,
        ALLOW_BAL_SWING_FG: account.ALLOW_BAL_SWING_FG,
        POST_ALLOW: account.POST_ALLOW,
        CR_ALLOWED: account.CR_ALLOWED,
        DR_ALLOWED: account.DR_ALLOWED,
        DELAY_GL_POSTING: account.DELAY_GL_POSTING
      },
      balanceSettings: account.metadata?.balanceSettings || {
        allowNegative: false,
        minimumBalance: 0,
        maximumBalance: 1000000000,
        autoReconcile: true
      },
      coaStructure: account.coaStructure || {
        segments: null,
        financialStatement: null,
        hierarchy: {
          level: account.level,
          parentAccountNo: null,
          isControlAccount: account.CONTROL_ACCT_FG,
          isSummaryAccount: false,
          childAccounts: []
        },
        accounting: null
      },
      metadata: account.metadata || {},
      balances: {
        LEDGER_BALANCE: account.LEDGER_BALANCE,
        AVAILABLE_BALANCE: account.AVAILABLE_BALANCE,
        OPENING_BALANCE: account.OPENING_BALANCE,
        CURRENT_BALANCE: account.CURRENT_BALANCE
      },
      timestamps: {
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        lastUpdatedBy: account.metadata?.lastUpdatedBy
      }
    };
    return res.status(200).json({
      success: true,
      data: coaSettings
    });
  } catch (error) {
    logger.error('Error getting COA settings', {
      error: error.message,
      GL_ACCT_NO: req.params.GL_ACCT_NO
    });
  
    return res.status(500).json({
      success: false,
      message: 'Error getting COA settings',
      error: error.message
    });
  }
};

// Collect all controller handlers into the main object
const GLAccountController = {
  createCOAAlignedGLAccount,
  getAccountsByCOASegments,
  getFinancialStatementBreakdown,
  getCOAAnalysis,
  createGLAccount,
  createDynamicGLAccount,
  cloneGLAccountsForBranch,
  createAllDynamicGLAccountsForBranch,
  getBranchGLAccountSummary,
  getOrganizationGLAccounts,
  getInterBranchAccounts,
  searchGLAccounts,
  getAllGLAccounts,
  getGLAccountById,
  updateGLAccount,
  updateGLAccountStatus,
  deleteGLAccount,
  approveGLTransaction,
  getCOAStructure,
  initializeAndActivateGLAccounts,
  forceReactivateGLAccounts,
  getGLActivationStatus,
  getGLAccountByNumber,
  activateSpecificGLAccounts,
  getCOASettings,
  migrateToCOAStructure
};

// Export all functions as named exports
export default GLAccountController;