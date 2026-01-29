// src/controllers/GLAccountController.js

import { logger } from '../utils/logger.js';
import ChartofAccount from '../models/ChartofAccount.js';
import Ledger, { TRANSACTION_TYPES } from '../models/Ledger.js';
import { sequelize } from '../models/index.js'; // Import sequelize
import GLAccount from '../models/GLAccount.js';
import { Op } from 'sequelize';

// ==================== HELPER FUNCTIONS ====================
const normalizeBranchCode = (code) => String(code || '').padStart(3, '0');

const normalizeAccountType = (type) => (type || '').toUpperCase().trim();

const getAccountClassCode = (accountClass) => {
  const map = {
    ASSET: '1',
    LIABILITY: '2',
    EQUITY: '3',
    REVENUE: '4',
    EXPENSE: '5',
    CONTROL: '8',
    SUSPENSE: '9',
    TAX: '7'
  };
  return map[accountClass] || '0';
};

const getNormalBalance = (accountClass) => {
  return ['LIABILITY', 'EQUITY', 'REVENUE'].includes(accountClass) ? 'CREDIT' : 'DEBIT';
};

const generateSubAccountCode = (accountClass, accountType, metadata) => {
  return String(Math.floor(1000 + Math.random() * 9000)).padStart(4, '0');
};

const generateCOAAccountNumber = ({
  organizationCode,
  branchCode,
  accountClass,
  accountType,
  subAccount
}) => {
  const org = String(organizationCode).padStart(2, '0');
  const br = normalizeBranchCode(branchCode);
  const cls = getAccountClassCode(accountClass);
  const typeCode = getAccountClassCode(accountClass) + '00';
  const sub = String(subAccount).padStart(4, '0');
  return `${org}${br}${cls}${typeCode}${sub}`;
};

const getFinancialStatementInfo = (accountClass, accountType) => {
  const map = {
    ASSET: { type: 'BALANCE_SHEET', category: 'ASSETS' },
    LIABILITY: { type: 'BALANCE_SHEET', category: 'LIABILITIES' },
    EQUITY: { type: 'BALANCE_SHEET', category: 'EQUITY' },
    REVENUE: { type: 'INCOME_STATEMENT', category: 'REVENUE' },
    EXPENSE: { type: 'INCOME_STATEMENT', category: 'EXPENSES' },
    CONTROL: { type: 'CONTROL', category: 'CONTROL_ACCOUNTS' },
    SUSPENSE: { type: 'SUSPENSE', category: 'SUSPENSE_ACCOUNTS' },
    TAX: { type: 'TAX', category: 'TAX_ACCOUNTS' }
  };
  return map[accountClass] || { type: 'OTHER', category: 'OTHER' };
};

const determineAccountLevel = (level, isControlAccount, parentAccountNo) => {
  if (isControlAccount) return 2;
  if (parentAccountNo) return Math.min(level || 4, 5);
  return level || 4;
};

// Account type to code mapping
const ACCOUNT_TYPE_CODES = {
  // ASSET (100-199)
  'CASH_ACCOUNT': '100',
  'BANK_ACCOUNT': '101',
  'RECEIVABLE_ACCOUNT': '102',
  'LOAN_ASSET': '103',
  'FIXED_ASSET': '104',
  'INVESTMENT_ASSET': '105',
  'CURRENT_ASSET': '106',
  'NON_CURRENT_ASSET': '107',
  
  // LIABILITY (200-299)
  'DEPOSITS_LIABILITY': '200',
  'LOAN_LIABILITY': '201',
  'PAYABLE_ACCOUNT': '202',
  'CURRENT_LIABILITY': '203',
  'LONG_TERM_LIABILITY': '204',
  
  // EQUITY (300-399)
  'SHARE_CAPITAL': '300',
  'CAPITAL_ACCOUNT': '301',
  'RETAINED_EARNINGS': '302',
  
  // REVENUE (400-499)
  'INTEREST_INCOME': '400',
  'FEE_INCOME': '401',
  'SERVICE_INCOME': '402',
  'OPERATING_REVENUE': '403',
  
  // EXPENSE (500-599)
  'INTEREST_EXPENSE': '500',
  'STAFF_EXPENSE': '501',
  'ADMIN_EXPENSE': '502',
  'OPERATING_EXPENSE': '503',
  
  // CONTROL (600-699)
  'CONTROL_ACCOUNT': '600',
  'SUSPENSE_ACCOUNT': '601',
  'CLEARING_ACCOUNT': '602',
  
  // TAX (700-799)
  'WITHHOLDING_TAX_PAYABLE': '700',
  'VAT_PAYABLE': '701',
  'INCOME_TAX_PAYABLE': '702',
  
  // SPECIAL PURPOSE (800-899)
  'INTER_BRANCH': '800'
};

// Account class to code mapping
const ACCOUNT_CLASS_CODES = {
  'ASSET': '1',
  'LIABILITY': '2',
  'EQUITY': '3',
  'REVENUE': '4',
  'EXPENSE': '5',
  'CONTROL': '6',
  'SUSPENSE': '7',
  'TAX': '8',
  'SPECIAL_PURPOSE': '9'
};

// Get account type code
export const getAccountTypeCode = (accountTypeString) => {
  return ACCOUNT_TYPE_CODES[accountTypeString] || '999';
};

// UPDATED: Enhanced account class and type validation
export const validateAccountClassType = (accountClass, accountType) => {
  const normalizedAccountClass = accountClass.toUpperCase();
  const normalizedAccountType = accountType.toUpperCase();
  
  logger.debug('Validating account class and type:', {
    accountClass: normalizedAccountClass,
    accountType: normalizedAccountType
  });

  const validCombinations = {
    'ASSET': [
      'CASH_ACCOUNT', 'BANK_ACCOUNT', 'RECEIVABLE_ACCOUNT', 'LOAN_ASSET',
      'FIXED_ASSET', 'INVESTMENT_ASSET', 'CURRENT_ASSET', 'INTER_BRANCH'
    ],
    'LIABILITY': [
      'DEPOSITS_LIABILITY', 'LOAN_LIABILITY', 'PAYABLE_ACCOUNT',
      'CURRENT_LIABILITY', 'LONG_TERM_LIABILITY'
    ],
    'EQUITY': [
      'SHARE_CAPITAL', 'CAPITAL_ACCOUNT', 'RETAINED_EARNINGS'
    ],
    'REVENUE': [
      'INTEREST_INCOME', 'FEE_INCOME', 'SERVICE_INCOME', 'OPERATING_REVENUE'
    ],
    'EXPENSE': [
      'INTEREST_EXPENSE', 'STAFF_EXPENSE', 'ADMIN_EXPENSE', 'OPERATING_EXPENSE'
    ],
    'TAX': [
      'WITHHOLDING_TAX_PAYABLE', 'VAT_PAYABLE', 'INCOME_TAX_PAYABLE'
    ],
    'CONTROL': [
      'CONTROL_ACCOUNT', 'SUSPENSE_ACCOUNT', 'CLEARING_ACCOUNT'
    ],
    'SUSPENSE': [
      'SUSPENSE_ACCOUNT'
    ],
    'SPECIAL_PURPOSE': [
      'INTER_BRANCH'
    ]
  };

  if (!validCombinations[normalizedAccountClass]) {
    throw new Error(`Invalid account class: ${accountClass}`);
  }

  const allowedTypes = validCombinations[normalizedAccountClass];
  if (!allowedTypes.includes(normalizedAccountType)) {
    logger.warn(`Account type '${accountType}' may not be valid for account class '${accountClass}', but proceeding anyway`);
  }
  
  return accountClass;
};

// Map metadata account type to internal format
export const mapMetadataAccountTypeToAccountType = (accountType) => {
  return accountType;
};

// Get COA balance type
export const getCOABalanceType = (accountClass, accountType) => {
  const normalizedAccountClass = accountClass.toUpperCase();
  const normalizedAccountType = accountType.toUpperCase();
  
  logger.debug('Getting COA balance type for:', {
    accountClass: normalizedAccountClass,
    accountType: normalizedAccountType
  });

  const balanceTypeMapping = {
    'ASSET': 'ASSET',
    'LIABILITY': 'LIABILITY',
    'EQUITY': 'EQUITY',
    'REVENUE': 'REVENUE',
    'EXPENSE': 'EXPENSE',
    'TAX': getTaxBalanceType(normalizedAccountType),
    'CONTROL': getControlBalanceType(normalizedAccountType),
    'SUSPENSE': 'SUSPENSE'
  };

  const result = balanceTypeMapping[normalizedAccountClass] || 'ASSET';
  
  logger.debug('COA balance type result:', result);
  return result;
};

// Helper function to determine tax balance type
const getTaxBalanceType = (accountType) => {
  if (accountType.includes('PAYABLE')) {
    return 'LIABILITY';
  }
  return 'LIABILITY';
};

// Helper function to determine control balance type
const getControlBalanceType = (accountType) => {
  if (accountType.includes('LIABILITY') || accountType.includes('PAYABLE')) {
    return 'LIABILITY';
  }
  return 'ASSET';
};

// Generate next GL account ID
export const generateNextGLAcctId = async (connection) => {
  const [result] = await connection.execute(
    'SELECT MAX(GL_ACCT_ID) as maxId FROM gl_accounts'
  );
  return (result[0]?.maxId || 0) + 1;
};

// Add audit trail
export const addAuditTrail = async (auditParams, connection) => {
  try {
    const query = `
      INSERT INTO audit_trail (
        EVENT_TYPE, USER_ID, ACTION, NEW_VALUE, OLD_VALUE, 
        IP_ADDRESS, ENTITY_ID, ENTITY_TYPE, STATUS, 
        DESCRIPTION, REFERENCE_NO, ACCOUNT_NO, ADDITIONAL_INFO,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
    `;
    
    const values = [
      auditParams.EVENT_TYPE,
      auditParams.USER_ID,
      auditParams.ACTION,
      JSON.stringify(auditParams.NEW_VALUE),
      JSON.stringify(auditParams.OLD_VALUE),
      auditParams.IP_ADDRESS,
      auditParams.ENTITY_ID,
      auditParams.ENTITY_TYPE,
      auditParams.STATUS,
      auditParams.DESCRIPTION,
      auditParams.REFERENCE_NO,
      auditParams.ACCOUNT_NO,
      JSON.stringify(auditParams.ADDITIONAL_INFO)
    ];
    
    await connection.execute(query, values);
    console.log('✅ Audit trail created successfully');
  } catch (error) {
    console.error('❌ Failed to create audit trail:', error.message);
    // Don't throw to prevent account creation from failing due to audit trail
  }
};

// ==================== ENHANCED: CREATE COA-ALIGNED GL ACCOUNT + LEDGER ENTRY ====================
// ==================== ENHANCED: CREATE COA-ALIGNED GL ACCOUNT + LEDGER ENTRY ====================
export const createCOAAlignedGLAccount = async (req, res) => {
  let transaction;

  try {
    logger.info('Starting COA-aligned GL account creation with Ledger linkage');
    console.log('📦 Request body:', JSON.stringify(req.body, null, 2));

    // ==================== AUTO-CREATE GL_ACCOUNTS TABLE ====================
    await GLAccount.createTableIfNotExists();
    console.log('✅ GL Account table check/creation completed');

    transaction = await sequelize.transaction();

    const {
      organizationCode: rawOrgCode,
      organizationName = '',
      branchCode: rawBranchCode,
      branchName = '',
      accountClass,
      accountType,
      ACCT_DESC,
      level = 4,
      CREATED_BY = 'system',
      parentAccountNo = null,
      isControlAccount = false,
      isSuspenseAccount = false,
      openingBalance = 0,
      allowNegativeBalance = false,
      productType,
      subAccount,
      metadata = {}
    } = req.body;

    // ------------------ DEBUG: LOG ALL INPUTS ------------------
    console.log('🔍 Raw inputs:');
    console.log('  - rawOrgCode:', rawOrgCode, 'type:', typeof rawOrgCode);
    console.log('  - rawBranchCode:', rawBranchCode, 'type:', typeof rawBranchCode);
    console.log('  - ACCT_DESC:', ACCT_DESC, 'type:', typeof ACCT_DESC);
    console.log('  - accountClass:', accountClass, 'type:', typeof accountClass);
    console.log('  - accountType:', accountType, 'type:', typeof accountType);
    console.log('  - metadata:', metadata, 'type:', typeof metadata);

    // Helper function for safe value conversion
    const safeLedgerValue = (value) => {
      if (value === null || value === undefined) return value;
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number') return String(value);
      if (typeof value === 'boolean') return String(value);
      if (Array.isArray(value)) return JSON.stringify(value);
      if (typeof value === 'object') return JSON.stringify(value);
      return String(value);
    };

    // ------------------ SAFE INPUT CONVERSION & VALIDATION ------------------
    const safeToString = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      if (typeof value === 'object') try { return JSON.stringify(value); } catch { return ''; }
      return '';
    };

    const safeTrim = (value) => {
      const str = safeToString(value);
      return typeof str === 'string' ? str.trim() : '';
    };

    const organizationCode = safeTrim(rawOrgCode);
    const branchCode = safeTrim(rawBranchCode);
    const acctDesc = safeTrim(ACCT_DESC);
    const safeOrganizationName = safeTrim(organizationName);
    const safeBranchName = safeTrim(branchName);

    console.log('🔍 After conversion:');
    console.log('  - organizationCode:', organizationCode);
    console.log('  - branchCode:', branchCode);
    console.log('  - acctDesc:', acctDesc);
    console.log('  - safeOrganizationName:', safeOrganizationName);
    console.log('  - safeBranchName:', safeBranchName);

    if (!organizationCode || !branchCode || !acctDesc) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing or invalid required fields: organizationCode, branchCode, ACCT_DESC'
      });
    }

    const resolvedAccountClass = accountClass || metadata.accountClass || '';
    const resolvedAccountType = accountType || metadata.accountType || '';
    
    const safeToUpper = (value) => {
      const str = safeToString(value);
      return typeof str === 'string' ? str.toUpperCase().trim() : '';
    };

    const accountClassUpper = safeToUpper(resolvedAccountClass);
    const accountTypeUpper = safeToUpper(resolvedAccountType);

    console.log('🔍 Account classification:');
    console.log('  - accountClassUpper:', accountClassUpper);
    console.log('  - accountTypeUpper:', accountTypeUpper);

    const validClasses = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE', 'CONTROL', 'SUSPENSE', 'TAX'];
    if (!validClasses.includes(accountClassUpper)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid accountClass. Must be one of: ${validClasses.join(', ')}`
      });
    }

    // ------------------ ENHANCED GL CODE GENERATION ------------------
    const normalizeBranchCodeSimple = (code) => {
      const str = safeToString(code);
      const digits = str.replace(/\D/g, '');
      return digits.padStart(3, '0').slice(0, 3);
    };

    const normalizedBranchCode = normalizeBranchCodeSimple(branchCode);
    const subAccountCode = subAccount || '0001';

    console.log('🔍 Prepared data:');
    console.log('  - normalizedBranchCode:', normalizedBranchCode);
    console.log('  - subAccountCode:', subAccountCode);

    // Class mapping
    const clsMap = {
      'ASSET': '1', 'LIABILITY': '2', 'EQUITY': '3', 
      'REVENUE': '4', 'EXPENSE': '5', 'CONTROL': '8',
      'SUSPENSE': '9', 'TAX': '7'
    };

    // Account Type to Category Code Mapping
    const accountTypeCategoryMap = {
      // ASSET Types (100-199)
      'CUSTOMER_ACCOUNT': '100',
      'SAVINGS_ACCOUNT': '101',
      'CURRENT_ACCOUNT': '102',
      'INTEREST_RECEIVABLE': '103',
      'LOAN_PORTFOLIO': '104',
      'LOAN_ASSET': '105',
      'CASH_ACCOUNT': '106',
      'BANK_ACCOUNT': '107',
      'RECEIVABLE_ACCOUNT': '108',
      'FIXED_ASSET': '109',
      'INVESTMENT_ASSET': '110',
      
      // LIABILITY Types (200-299)
      'CUSTOMER_DEPOSIT': '200',
      'LOAN_PAYABLE': '201',
      'DEPOSITS_LIABILITY': '202',
      'PAYABLE_ACCOUNT': '203',
      'CURRENT_LIABILITY': '204',
      'LONG_TERM_LIABILITY': '205',
      
      // REVENUE Types (400-499)
      'INTEREST_INCOME': '400',
      'INTEREST_INCOME_ON_LOANS': '401',
      'FEE_INCOME': '402',
      'PROCESSING_FEE_INCOME': '403',
      'SERVICE_INCOME': '404',
      'OPERATING_REVENUE': '405',
      'COMMISSION_INCOME': '406',
      
      // EXPENSE Types (500-599)
      'INTEREST_EXPENSE': '500',
      'STAFF_EXPENSE': '501',
      'ADMIN_EXPENSE': '502',
      'OPERATING_EXPENSE': '503',
      'PROCESSING_FEE_EXPENSE': '504',
      
      // Other categories
      'SHARE_CAPITAL': '300',
      'CAPITAL_ACCOUNT': '301',
      'RETAINED_EARNINGS': '302',
      'CONTROL_ACCOUNT': '800',
      'SUSPENSE_ACCOUNT': '900',
      'WITHHOLDING_TAX_PAYABLE': '700',
      'VAT_PAYABLE': '701',
      'INCOME_TAX_PAYABLE': '702'
    };

    // ENHANCED GL Code Generation Function
    const generateUniqueGLCode = ({ orgCode, branch, accClass, accType, subAcc }) => {
      // Organization segment (2 digits)
      const org = safeToString(orgCode).padStart(2, '0').slice(0, 2);
      
      // Branch segment (3 digits)
      const br = safeToString(branch).padStart(3, '0').slice(0, 3);
      
      // Class code (1 digit)
      const cls = clsMap[accClass] || '0';
      
      // Category code from account type (3 digits)
      let categoryCode = accountTypeCategoryMap[accType] || '000';
      if (categoryCode === '000') {
        // Generate a unique code for unknown account types
        const typeHash = Math.abs(accType.split('').reduce((acc, char) => {
          return ((acc << 5) - acc) + char.charCodeAt(0);
        }, 0)).toString().slice(-3);
        categoryCode = typeHash.padStart(3, '0');
      }
      
      // Sub account (4 digits)
      const sub = safeToString(subAcc).padStart(4, '0').slice(0, 4);
      
      // Format: ORG(2) + BRANCH(3) + CLASS(1) + CATEGORY(3) + SUB(4) = 13 digits
      return `${org}${br}${cls}${categoryCode}${sub}`;
    };

    // Generate the GL Code
    const glcode = generateUniqueGLCode({
      orgCode: organizationCode,
      branch: normalizedBranchCode,
      accClass: accountClassUpper,
      accType: accountTypeUpper,  // This is CRITICAL for uniqueness
      subAcc: subAccountCode
    });

    // Generate GL_ACCT_ID with timestamp
    const glAccountId = `GL${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // ==================== ENHANCED DEBUGGING SECTION ====================
    console.log('🔍 =============== ENHANCED GL CODE GENERATION DEBUG ===============');
    console.log('📊 Input Summary:');
    console.log(`  - Organization Code: ${organizationCode} (raw: ${rawOrgCode})`);
    console.log(`  - Branch Code: ${normalizedBranchCode} (raw: ${rawBranchCode})`);
    console.log(`  - Account Class: ${accountClassUpper} → Class Code: ${clsMap[accountClassUpper]}`);
    console.log(`  - Account Type: ${accountTypeUpper} → Category Code: ${accountTypeCategoryMap[accountTypeUpper] || 'Generated'}`);
    console.log(`  - Sub Account: ${subAccountCode}`);
    
    console.log('🧮 Code Generation Details:');
    const orgSegment = safeToString(organizationCode).padStart(2, '0').slice(0, 2);
    const branchSegment = safeToString(normalizedBranchCode).padStart(3, '0').slice(0, 3);
    const classCode = clsMap[accountClassUpper] || '0';
    const categoryCode = accountTypeCategoryMap[accountTypeUpper] || '000';
    const subSegment = safeToString(subAccountCode).padStart(4, '0').slice(0, 4);
    
    console.log(`  - Organization Segment: "${organizationCode}" → "${orgSegment}"`);
    console.log(`  - Branch Segment: "${normalizedBranchCode}" → "${branchSegment}"`);
    console.log(`  - Class Code: "${accountClassUpper}" → "${classCode}"`);
    console.log(`  - Category Code: "${accountTypeUpper}" → "${categoryCode}"`);
    console.log(`  - Sub Account: "${subAccountCode}" → "${subSegment}"`);
    
    console.log('📋 Final GL Code:');
    console.log(`  - Generated Code: ${glcode}`);
    console.log(`  - Pattern: ${orgSegment}${branchSegment}${classCode}${categoryCode}${subSegment}`);
    console.log(`  - Length: ${glcode.length} characters (should be 13)`);
    console.log(`  - GL Account ID: ${glAccountId}`);

    // ------------------ ENHANCED POSTING RULES LOGIC ------------------
    const getSimpleNormalBalance = (accClass) => {
      return ['LIABILITY', 'EQUITY', 'REVENUE'].includes(accClass) ? 'CREDIT' : 'DEBIT';
    };

    const normalBalance = getSimpleNormalBalance(accountClassUpper);
    const accountLevel = parseInt(safeToString(level), 10) || 4;

    // ENHANCED: Proper posting rules for different account types
    const getPostingRules = (accountClass, normalBalance, allowNegativeBalance, isControlAccount, isSuspenseAccount, metadata = {}) => {
      const baseRules = {
        allowNegative: Boolean(allowNegativeBalance),
        postAllow: true,
        controlAccount: Boolean(isControlAccount),
        suspenseAccount: Boolean(isSuspenseAccount)
      };

      // Check for metadata override first
      if (metadata.postingRulesOverride) {
        return {
          ...baseRules,
          ...metadata.postingRulesOverride
        };
      }

      // Determine CR/DR permissions based on account class
      switch (accountClass) {
        case 'REVENUE':
          // Revenue accounts: Allow both CREDIT (increase) and DEBIT (decrease/adjustment)
          return {
            ...baseRules,
            crAllowed: true,   // CREDIT increases revenue
            drAllowed: true    // DEBIT decreases revenue (for adjustments/reversals)
          };
        
        case 'EXPENSE':
          // Expense accounts: Allow both DEBIT (increase) and CREDIT (decrease/adjustment)
          return {
            ...baseRules,
            crAllowed: true,   // CREDIT decreases expense
            drAllowed: true    // DEBIT increases expense
          };
        
        case 'ASSET':
          // Asset accounts: DEBIT increases, CREDIT decreases
          return {
            ...baseRules,
            crAllowed: true,   // CREDIT allowed for decreases
            drAllowed: true    // DEBIT allowed for increases
          };
        
        case 'LIABILITY':
        case 'EQUITY':
          // Liability/Equity accounts: CREDIT increases, DEBIT decreases
          return {
            ...baseRules,
            crAllowed: true,   // CREDIT allowed for increases
            drAllowed: true    // DEBIT allowed for decreases
          };
        
        case 'CONTROL':
        case 'SUSPENSE':
        case 'TAX':
          // Special accounts: Allow both for flexibility
          return {
            ...baseRules,
            crAllowed: true,
            drAllowed: true
          };
        
        default:
          // Default: Allow both
          return {
            ...baseRules,
            crAllowed: true,
            drAllowed: true
          };
      }
    };

    const postingRules = getPostingRules(
      accountClassUpper,
      normalBalance,
      allowNegativeBalance,
      isControlAccount,
      isSuspenseAccount,
      metadata
    );

    console.log('🔍 Posting Rules Configuration:');
    console.log(`  - Account Class: ${accountClassUpper}`);
    console.log(`  - Normal Balance: ${normalBalance}`);
    console.log(`  - CR_ALLOWED: ${postingRules.crAllowed} (${postingRules.crAllowed ? '✓' : '✗'})`);
    console.log(`  - DR_ALLOWED: ${postingRules.drAllowed} (${postingRules.drAllowed ? '✓' : '✗'})`);
    console.log(`  - Allow Negative: ${postingRules.allowNegative}`);
    console.log(`  - Post Allow: ${postingRules.postAllow}`);

    const coaMetadata = {
      accountClass: accountClassUpper,
      accountType: accountTypeUpper,
      normalBalance,
      coaCompliant: true,
      dynamicAccount: true,
      branchSpecific: true,
      productType: safeToString(productType),
      subAccountCode,
      balanceSettings: {
        allowNegative: Boolean(allowNegativeBalance),
        openingBalance: parseFloat(safeToString(openingBalance)) || 0
      },
      hierarchy: {
        level: accountLevel,
        parentAccountNo: safeToString(parentAccountNo),
        isControlAccount: Boolean(isControlAccount),
        isSuspenseAccount: Boolean(isSuspenseAccount)
      },
      postingRules: postingRules, // Include posting rules in metadata
      ...(typeof metadata === 'object' ? metadata : {})
    };

    // Build COA structure
    const coaStructure = {
      organization: {
        code: organizationCode,
        name: safeOrganizationName || `Organization ${organizationCode}`
      },
      branch: {
        code: normalizedBranchCode,
        name: safeBranchName || `Branch ${branchCode}`
      },
      account: {
        class: accountClassUpper,
        type: accountTypeUpper,
        category: accountClassUpper,
        subCategory: accountTypeUpper,
        categoryCode: accountTypeCategoryMap[accountTypeUpper] || '000',
        postingRules: postingRules
      },
      segments: [
        { segment: 'ORG', value: orgSegment, description: 'Organization' },
        { segment: 'BRANCH', value: branchSegment, description: 'Branch' },
        { segment: 'CLASS', value: classCode, description: 'Account Class' },
        { segment: 'CATEGORY', value: categoryCode, description: 'Account Type Category' },
        { segment: 'SUB', value: subSegment, description: 'Sub Account' }
      ],
      generationDate: new Date().toISOString()
    };

    console.log('🔍 Account Configuration Summary:');
    console.log(`  - Normal Balance: ${normalBalance}`);
    console.log(`  - Opening Balance: ${openingBalance || 0}`);
    console.log(`  - Allow Negative Balance: ${allowNegativeBalance}`);

    // ------------------ DUPLICATE CHECK WITH ENHANCED LOGGING ------------------
    console.log('🔍 =============== DUPLICATE CHECK ===============');
    console.log(`Checking for existing account with code: ${glcode}`);
    
    // Check for duplicate codes in all three tables
    const existingAccounts = await Promise.all([
      ChartofAccount.findOne({ where: { glcode }, transaction }),
      Ledger.findOne({ where: { GL_ACCT_NO: glcode }, transaction }),
      GLAccount.findOne({ where: { GL_ACCT_NO: glcode }, transaction })
    ]);

    const tableNames = ['ChartOfAccount', 'Ledger', 'GLAccount'];
    let hasDuplicates = false;
    
    existingAccounts.forEach((acc, index) => {
      if (acc) {
        hasDuplicates = true;
        console.log(`❌ ${tableNames[index]}: EXISTS`);
        console.log(`   - ID: ${acc.id || acc.GL_ACCT_ID}`);
        console.log(`   - Description: ${acc.ACCT_DESC || acc.name || 'N/A'}`);
        console.log(`   - Account Type: ${accountTypeUpper}`);
      } else {
        console.log(`✅ ${tableNames[index]}: OK`);
      }
    });

    if (hasDuplicates) {
      await transaction.rollback();
      
      // Find similar accounts to suggest alternatives
      const similarPattern = `${orgSegment}${branchSegment}${classCode}%`;
      const similarAccounts = await GLAccount.findAll({
        where: {
          GL_ACCT_NO: {
            [Op.like]: similarPattern
          },
          accountType: accountTypeUpper
        },
        attributes: ['GL_ACCT_NO', 'ACCT_DESC', 'accountType'],
        limit: 5,
        transaction
      });
      
      let suggestion = '';
      if (similarAccounts.length > 0) {
        suggestion = ` Similar accounts found: ${similarAccounts.map(a => a.GL_ACCT_NO).join(', ')}`;
      }
      
      return res.status(409).json({
        success: false,
        message: `GL account with code ${glcode} already exists.${suggestion}`,
        error: 'DUPLICATE_GL_CODE',
        generatedCode: glcode,
        inputSummary: {
          organizationCode,
          branchCode: normalizedBranchCode,
          accountClass: accountClassUpper,
          accountType: accountTypeUpper,
          subAccount: subAccountCode
        }
      });
    }

    console.log('✅ No duplicates found, proceeding with account creation...');

    // Also check for accounts with same description and type
    const existingByDescType = await GLAccount.findOne({
      where: {
        ACCT_DESC: acctDesc,
        accountType: accountTypeUpper,
        organizationCode: parseInt(organizationCode, 10),
        branchCode: normalizedBranchCode
      },
      transaction
    });

    if (existingByDescType) {
      console.warn(`⚠️  Warning: Similar account exists with same description and type`);
      console.warn(`   - Existing GL Code: ${existingByDescType.GL_ACCT_NO}`);
      console.warn(`   - This might be intentional (multiple accounts of same type)`);
    }

    console.log('🔍 =============== END DUPLICATE CHECK ===============');

    // ------------------ CREATE CHART OF ACCOUNT ------------------
    console.log('🔍 Creating Chart of Account...');

    const chartAccount = await ChartofAccount.create({
      name: acctDesc,
      glcode,
      type: accountClassUpper,
      account_usage: accountTypeUpper,
      gl_group: accountClassUpper,
      balance: parseFloat(safeToString(openingBalance)) || 0,
      unreconciled_balance: parseFloat(safeToString(openingBalance)) || 0,
      manual_entries: 'NO',
      description: acctDesc,
      status: 'ACTIVE',
      organizationCode: parseInt(organizationCode, 10) || 1,
      branchCode: normalizedBranchCode,
      glAccountNo: glcode,
      mappingStatus: 'SYNCED',
      mappedAt: new Date(),
      category: accountClassUpper,
      subCategory: accountTypeUpper,
      isControlAccount: Boolean(isControlAccount),
      isSuspenseAccount: Boolean(isSuspenseAccount),
      allowNegativeBalance: Boolean(allowNegativeBalance),
      postingRules: JSON.stringify(postingRules),
      reportingCategory: accountClassUpper,
      createdBy: safeTrim(CREATED_BY),
      updatedBy: safeTrim(CREATED_BY),
      sourceSystem: 'INTERNAL_COA_ENGINE',
      metadata: JSON.stringify(coaMetadata)
    }, { transaction });

    console.log('✅ Chart of Account created:', chartAccount.id);

    // ------------------ CREATE LEDGER ENTRY ------------------
    console.log('🔍 Creating Ledger entry...');

    const getAccountClassCategoryCode = (accClass) => {
      const map = { 
        'ASSET': '100', 
        'LIABILITY': '200', 
        'EQUITY': '300', 
        'REVENUE': '400', 
        'EXPENSE': '500',
        'CONTROL': '800',
        'SUSPENSE': '900',
        'TAX': '700'
      };
      return map[accClass] || '100';
    };

    const ledgerData = {
      GL_ACCT_NO: glcode,
      GL_ACCT_ID: parseInt(safeToString(chartAccount.id), 10) || 0,
      CHART_OF_ACCT_ID: '10001',
      BAL_CD: getAccountClassCategoryCode(accountClassUpper),
      SUB_LEDGER_NO: subAccountCode,
      ACCT_DESC: acctDesc,
      LEDGER_NO: '001',
      BU_ID: normalizedBranchCode,
      GL_ACCT_CAT: accountClassUpper,
      CR_ALLOWED: postingRules.crAllowed,  // Use enhanced posting rules
      DR_ALLOWED: postingRules.drAllowed,  // Use enhanced posting rules
      REC_ST: 'Active',
      POST_ALLOW: postingRules.postAllow,
      POST_FG: false,
      CONTROL_ACCT_FG: Boolean(isControlAccount),
      CREATED_BY: safeTrim(CREATED_BY),
      SUSPENSE_ACCT_FG: Boolean(isSuspenseAccount),
      ALLOW_BAL_SWING_FG: Boolean(allowNegativeBalance),
      PARENT_ID: parentAccountNo ? safeToString(parentAccountNo) : null,
      SEG_VALUE: subAccountCode,
      SEG_DESC: acctDesc,
      SEG_NO: subAccountCode,
      subfolderId: `COA_${organizationCode}_${normalizedBranchCode}`,
      DELAY_GL_POSTING: false,
      ROW_TS: new Date(),
      LEDGER_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      organizationName: safeOrganizationName || `Organization ${organizationCode}`,
      branchName: safeBranchName || `Branch ${branchCode}`,
      organizationCode: parseInt(organizationCode, 10) || 1,
      branchCode: normalizedBranchCode,
      branchType: 'MAIN',
      OPENING_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENT_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      AVAILABLE_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENCY_CODE: 'NGN',
      JOURNAL_ID: `JRN-COA-${Date.now()}`,
      TRANSACTION_TYPE: `${accountClassUpper} Balance`,
      metadata: JSON.stringify(coaMetadata),
      categoryCode: getAccountClassCategoryCode(accountClassUpper),
      categoryName: `${accountClassUpper} - ${accountTypeUpper}`,
      level: accountLevel,
      childAccounts: '[]',
      accountType: accountTypeUpper
    };

    const ledgerEntry = await Ledger.create(ledgerData, { transaction });
    console.log('✅ Ledger entry created:', ledgerEntry.id);

    // ------------------ CREATE GL ACCOUNT ENTRY ------------------
    console.log('🔍 Creating GL Account entry...');

    const glAccountData = {
      GL_ACCT_NO: glcode,
      GL_ACCT_ID: glAccountId,
      CREATED_BY: safeTrim(CREATED_BY),
      coaStructure: coaStructure,
      organizationName: safeOrganizationName || `Organization ${organizationCode}`,
      organizationCode: parseInt(organizationCode, 10) || 1,
      branchName: safeBranchName || `Branch ${branchCode}`,
      branchCode: normalizedBranchCode,
      branchType: 'MAIN',
      categoryCode: getAccountClassCategoryCode(accountClassUpper),
      categoryName: `${accountClassUpper} - ${accountTypeUpper}`,
      parentCode: parentAccountNo,
      level: accountLevel,
      LEDGER_NO: '001',
      PARENT_ID: parentAccountNo ? parseInt(parentAccountNo, 10) : null,
      subfolderId: `COA_${organizationCode}_${normalizedBranchCode}`,
      BAL_CD: getAccountClassCategoryCode(accountClassUpper),
      SUB_LEDGER_NO: subAccountCode,
      SEG_NO: 1,
      CHART_OF_ACCT_ID: '10001',
      ACCT_DESC: acctDesc,
      GL_ACCT_CAT: accountClassUpper,
      JOURNAL_ID: `JRN-COA-${Date.now()}`,
      TRANSACTION_TYPE: `${accountClassUpper} Balance`,
      CR_ALLOWED: postingRules.crAllowed,  // Use enhanced posting rules
      DR_ALLOWED: postingRules.drAllowed,  // Use enhanced posting rules
      REC_ST: 'Active',
      POST_ALLOW: postingRules.postAllow,
      POST_FG: false,
      CONTROL_ACCT_FG: Boolean(isControlAccount),
      SUSPENSE_ACCT_FG: Boolean(isSuspenseAccount),
      ALLOW_BAL_SWING_FG: Boolean(allowNegativeBalance),
      SEG_VALUE: subAccountCode,
      SEG_DESC: acctDesc,
      SEG_TY_CD: accountClassUpper,
      SEG_PLACEHLDR_ID: 'SEG001',
      DELAY_GL_POSTING: false,
      LEDGER_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      AVAILABLE_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      OPENING_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENT_BALANCE: parseFloat(safeToString(openingBalance)) || 0,
      CURRENCY_CODE: 'NGN',
      balanceHistory: [],
      transactions: [],
      SETTLEMENT_GL_ACCT_NO: null,
      INTER_BRANCH_ACCOUNT: false,
      legacyReference: {
        chartAccountId: chartAccount.id,
        ledgerId: ledgerEntry.id,
        glcode: glcode
      },
      systemSource: 'NEW_SYSTEM',
      syncStatus: {
        chartOfAccount: 'SYNCED',
        ledger: 'SYNCED',
        lastSync: new Date().toISOString()
      },
      metadata: coaMetadata,
      branchTimezone: 'Africa/Lagos',
      accountType: accountTypeUpper
    };

    const glAccountEntry = await GLAccount.create(glAccountData, { transaction });
    console.log('✅ GL Account entry created:', glAccountEntry.id);

    // Optional bidirectional links
    await chartAccount.update({ 
      glAccountId: ledgerEntry.id,
      mappedGLAccountId: glAccountEntry.id 
    }, { transaction });

    await transaction.commit();

    // ------------------ SUCCESS SUMMARY ------------------
    console.log('✅ =============== ACCOUNT CREATION SUMMARY ===============');
    console.log('📋 New Account Details:');
    console.log(`  - GL Code: ${glcode}`);
    console.log(`  - GL Account ID: ${glAccountId}`);
    console.log(`  - Description: ${acctDesc}`);
    console.log(`  - Account Class: ${accountClassUpper}`);
    console.log(`  - Account Type: ${accountTypeUpper}`);
    console.log(`  - Category Code: ${accountTypeCategoryMap[accountTypeUpper] || 'Generated'}`);
    console.log(`  - Organization: ${organizationCode} - ${safeOrganizationName}`);
    console.log(`  - Branch: ${normalizedBranchCode} - ${safeBranchName}`);
    console.log(`  - Opening Balance: ${openingBalance || 0}`);
    console.log(`  - CR Allowed: ${postingRules.crAllowed ? '✓' : '✗'}`);
    console.log(`  - DR Allowed: ${postingRules.drAllowed ? '✓' : '✗'}`);
    console.log(`  - Created By: ${safeTrim(CREATED_BY)}`);
    console.log(`  - Created At: ${new Date().toISOString()}`);
    console.log('📊 Database IDs:');
    console.log(`  - Chart of Account ID: ${chartAccount.id}`);
    console.log(`  - Ledger Entry ID: ${ledgerEntry.id}`);
    console.log(`  - GL Account Entry ID: ${glAccountEntry.id}`);
    console.log('✅ =============== END SUMMARY ===============');

    logger.info(`COA-aligned GL account created successfully: ${glcode} (${accountTypeUpper})`);

    // ------------------ SUCCESS RESPONSE ------------------
    const responseData = {
      chartAccountId: chartAccount.id,
      ledgerId: ledgerEntry.id,
      glAccountId: glAccountEntry.id,
      glcode,
      GL_ACCT_NO: glcode,
      GL_ACCT_ID: glAccountId,
      name: chartAccount.name,
      description: chartAccount.description,
      accountClass: accountClassUpper,
      accountType: accountTypeUpper,
      normalBalance,
      postingRules: postingRules,
      organizationCode: chartAccount.organizationCode,
      organizationName: safeOrganizationName || `Org ${organizationCode}`,
      branchCode: chartAccount.branchCode,
      branchName: safeBranchName || `Branch ${branchCode}`,
      balance: chartAccount.balance,
      openingBalance: parseFloat(safeToString(openingBalance)) || 0,
      status: 'ACTIVE',
      isControlAccount: Boolean(isControlAccount),
      isSuspenseAccount: Boolean(isSuspenseAccount),
      allowNegativeBalance: Boolean(allowNegativeBalance),
      createdBy: safeTrim(CREATED_BY),
      createdAt: chartAccount.createdAt,
      coaStructure: coaStructure,
      metadata: coaMetadata,
      categoryCode: accountTypeCategoryMap[accountTypeUpper] || '000'
    };

    return res.status(201).json({
      success: true,
      message: `COA-aligned ${accountTypeUpper} GL account created successfully`,
      data: responseData
    });

  } catch (error) {
    console.error('❌ =============== ERROR DETAILS ===============');
    console.error('  - Error:', error.message);
    console.error('  - Stack:', error.stack);
    console.error('  - Request Body:', JSON.stringify(req.body, null, 2));
    console.error('❌ =============== END ERROR DETAILS ===============');

    if (transaction) {
      try {
        await transaction.rollback();
        console.log('🔄 Transaction rolled back');
      } catch (rollbackError) {
        logger.error('Transaction rollback failed:', rollbackError);
      }
    }

    logger.error('Failed to create COA-aligned GL account:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to create COA-aligned GL account',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ==================== FIXED HELPER FUNCTIONS ====================

// Fixed normalizeBranchCode function
const normalizeBranchCodeFixed = (code) => {
  if (code === null || code === undefined) return '000';
  
  // Convert to string first
  const strCode = String(code);
  
  // Remove any non-digit characters
  const digitsOnly = strCode.replace(/\D/g, '');
  
  // If empty after cleaning, return '000'
  if (!digitsOnly) return '000';
  
  // Pad to 3 digits
  return digitsOnly.padStart(3, '0');
};

// Updated getAccountClassCode to handle all cases
const getAccountClassCodeFixed = (accountClass) => {
  const map = {
    'ASSET': '1',
    'LIABILITY': '2', 
    'EQUITY': '3',
    'REVENUE': '4',
    'EXPENSE': '5',
    'CONTROL': '8',
    'SUSPENSE': '9',
    'TAX': '7'
  };
  
  const upperClass = String(accountClass).toUpperCase().trim();
  return map[upperClass] || '0';
};

// Updated generateCOAAccountNumber with safer handling
const generateCOAAccountNumberFixed = ({ organizationCode, branchCode, accountClass, subAccount }) => {
  const org = String(organizationCode || '00').padStart(2, '0');
  const br = normalizeBranchCodeFixed(branchCode);
  const cls = getAccountClassCodeFixed(accountClass);
  const typeCode = getAccountClassCodeFixed(accountClass) + '00';
  const sub = String(subAccount || '0001').padStart(4, '0');
  return `${org}${br}${cls}${typeCode}${sub}`;
};

// Updated generateSubAccountCode with safer handling
const generateSubAccountCodeFixed = (accountClass, accountType, metadata) => {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  return String(randomNum).padStart(4, '0');
};

// Updated getNormalBalance with safer handling
const getNormalBalanceFixed = (accountClass) => {
  const upperClass = String(accountClass).toUpperCase().trim();
  return ['LIABILITY', 'EQUITY', 'REVENUE'].includes(upperClass) ? 'CREDIT' : 'DEBIT';
};

// Updated determineAccountLevel with safer handling
const determineAccountLevelFixed = (level, isControlAccount, parentAccountNo) => {
  const numLevel = parseInt(level) || 4;
  if (isControlAccount) return 2;
  if (parentAccountNo) return Math.min(numLevel, 5);
  return numLevel;
};

// ==================== DEPRECATED: LEGACY FUNCTION (DO NOT USE FOR NEW CODE) ====================
/**
 * @deprecated Use createCOAAlignedGLAccount instead. This is kept only for legacy migrations.
 */
export const createLegacyGLAccount = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'This endpoint is deprecated. Use /gl/create-coa-aligned instead.',
    recommended: 'POST /api/gl/create-coa-aligned'
  });
};

// Optional: Keep old name for backward compatibility (temporary)
export { createLegacyGLAccount as createGLAccount };

// ==================== CREATE LEDGER ENTRY ====================
export const createLedgerEntry = async (req, res, ledgerData = null, options = {}) => {
  let transaction;
  
  try {
    // This function can be called directly or via HTTP
    const data = ledgerData || req.body;
    const { useTransaction = true } = options;

    const requiredFields = ['GL_ACCT_NO', 'AMOUNT', 'TRANSACTION_TYPE'];
    const missingFields = requiredFields.filter(field => !data[field]);
    
    if (missingFields.length > 0) {
      const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
      if (res) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    // Start transaction if requested
    if (useTransaction) {
      transaction = await sequelize.transaction();
    }

    // Check if account exists
    const account = await Ledger.findOne({
      where: { GL_ACCT_NO: data.GL_ACCT_NO },
      transaction
    });

    if (!account) {
      const error = new Error(`GL Account ${data.GL_ACCT_NO} not found`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    // Check if transaction is allowed
    const isCredit = data.TRANSACTION_TYPE.toUpperCase() === 'CR' || data.TRANSACTION_TYPE.toUpperCase() === 'CREDIT';
    const isDebit = data.TRANSACTION_TYPE.toUpperCase() === 'DR' || data.TRANSACTION_TYPE.toUpperCase() === 'DEBIT';
    
    if (isCredit && !account.CR_ALLOWED) {
      const error = new Error(`Credit transactions not allowed for account ${data.GL_ACCT_NO}`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    if (isDebit && !account.DR_ALLOWED) {
      const error = new Error(`Debit transactions not allowed for account ${data.GL_ACCT_NO}`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    if (!isCredit && !isDebit) {
      const error = new Error(`Invalid transaction type: ${data.TRANSACTION_TYPE}. Must be 'CR'/'CREDIT' or 'DR'/'DEBIT'`);
      if (res) {
        if (transaction) await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      throw error;
    }

    // Process the transaction using Ledger's built-in method
    const amount = parseFloat(data.AMOUNT);
    const transactionType = isCredit ? TRANSACTION_TYPES.CREDIT : TRANSACTION_TYPES.DEBIT;
    
    try {
      // Use the Ledger model's updateBalance method
      await account.updateBalance(amount, transactionType, { transaction });
      
      // Get updated account
      const updatedAccount = await Ledger.findOne({
        where: { GL_ACCT_NO: data.GL_ACCT_NO },
        transaction
      });

      // Create result
      const result = {
        success: true,
        transaction: {
          GL_ACCT_NO: data.GL_ACCT_NO,
          AMOUNT: amount,
          TRANSACTION_TYPE: transactionType,
          NEW_BALANCE: parseFloat(updatedAccount.LEDGER_BALANCE || 0),
          PREVIOUS_BALANCE: parseFloat(account.LEDGER_BALANCE || 0),
          CURRENT_BALANCE: parseFloat(updatedAccount.CURRENT_BALANCE || 0),
          AVAILABLE_BALANCE: parseFloat(updatedAccount.AVAILABLE_BALANCE || 0),
          JOURNAL_ID: data.JOURNAL_ID || `JRN-${Date.now()}`,
          CREATED_BY: data.CREATED_BY || 'system',
          DESCRIPTION: data.DESCRIPTION || '',
          REFERENCE_NO: data.REFERENCE_NO || '',
          TIMESTAMP: new Date()
        }
      };

      // Commit transaction if used
      if (transaction) {
        await transaction.commit();
      }

      if (res) {
        return res.status(200).json({
          success: true,
          message: 'Ledger entry created successfully',
          data: result.transaction
        });
      }

      return result;

    } catch (balanceError) {
      if (transaction) await transaction.rollback();
      throw balanceError;
    }

  } catch (error) {
    logger.error('❌ Failed to create ledger entry:', error);
    
    if (res) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create ledger entry',
        error: error.message
      });
    }
    
    throw error;
  }
};

// ==================== CREATE GL ACCOUNT (Legacy function) ====================
// Update the createGLAccount function in your GLAccountController.js

// // Update the createGLAccount function with corrected SQL
// export const createGLAccount = async (req, res) => {
//   let connection;
  
//   try {
//     console.log('🟢 Starting regular GL account creation...');
    
//     // Get a connection from Sequelize pool
//     connection = await sequelize.connectionManager.getConnection();
    
//     // First, ensure the table exists with proper columns
//     await ensureGLAccountsTable(connection);
    
//     // Begin transaction
//     const beginTransaction = () => new Promise((resolve, reject) => {
//       connection.beginTransaction((err) => {
//         if (err) reject(err);
//         else resolve();
//       });
//     });
    
//     await beginTransaction();

//     const {
//       GL_ACCT_NO,
//       GL_ACCT_ID,
//       ACCT_DESC,
//       organizationName,
//       organizationCode,
//       branchName,
//       branchCode,
//       branchType = 'MAIN',
//       CREATED_BY,
//       categoryCode,
//       categoryName,
//       level = 4,
//       LEDGER_NO = '001',
//       SUB_LEDGER_NO = '001',
//       CHART_OF_ACCT_ID = '001',
//       GL_ACCT_CAT,
//       BAL_CD,
//       subfolderId,
//       JOURNAL_ID = `JRN-${Date.now()}`,
//       TRANSACTION_TYPE = 'General Transaction',
//       CR_ALLOWED = false,
//       DR_ALLOWED = true,
//       REC_ST = 'Active',
//       POST_ALLOW = true,
//       CONTROL_ACCT_FG = false,
//       SUSPENSE_ACCT_FG = false,
//       ALLOW_BAL_SWING_FG = false,
//       LEDGER_BALANCE = 0,
//       AVAILABLE_BALANCE = 0,
//       OPENING_BALANCE = 0,
//       CURRENT_BALANCE = 0,
//       CURRENCY_CODE = 'NGN',
//       metadata = {},
//       accountClass = 'ASSET',
//       accountType = 'GENERAL',
//       normalBalance = 'DEBIT'
//     } = req.body;

//     // Validation
//     if (!GL_ACCT_NO || !ACCT_DESC || !CREATED_BY) {
//       throw new Error('Missing required fields: GL_ACCT_NO, ACCT_DESC, CREATED_BY');
//     }

//     // Check for duplicate
//     const checkDuplicate = () => new Promise((resolve, reject) => {
//       connection.query(
//         'SELECT * FROM gl_accounts WHERE GL_ACCT_NO = ?',
//         [GL_ACCT_NO],
//         (err, results) => {
//           if (err) reject(err);
//           else resolve(results);
//         }
//       );
//     });
    
//     const existingAccounts = await checkDuplicate();
    
//     if (existingAccounts.length > 0) {
//       throw new Error(`GL account ${GL_ACCT_NO} already exists`);
//     }

//     // Generate ID if needed
//     let finalGL_ACCT_ID = GL_ACCT_ID;
//     if (!finalGL_ACCT_ID) {
//       const getMaxId = () => new Promise((resolve, reject) => {
//         connection.query(
//           'SELECT MAX(GL_ACCT_ID) as maxId FROM gl_accounts',
//           (err, results) => {
//             if (err) reject(err);
//             else resolve(results);
//           }
//         );
//       });
      
//       const maxResult = await getMaxId();
//       finalGL_ACCT_ID = (maxResult[0]?.maxId || 0) + 1;
//     }

//     // Prepare metadata
//     const fullMetadata = {
//       ...metadata,
//       accountClass,
//       accountType,
//       normalBalance,
//       createdAt: new Date().toISOString(),
//       updatedAt: new Date().toISOString()
//     };

//     // Current timestamp for createdAt and updatedAt
//     const currentTimestamp = new Date();

//     // Insert account - FIXED: Removed NOW() from values, let database handle defaults
//     const insertAccount = () => new Promise((resolve, reject) => {
//       const insertQuery = `
//         INSERT INTO gl_accounts (
//           GL_ACCT_NO, GL_ACCT_ID, CREATED_BY, organizationName, organizationCode,
//           branchName, branchCode, branchType, ACCT_DESC, categoryCode, categoryName,
//           level, LEDGER_NO, SUB_LEDGER_NO, CHART_OF_ACCT_ID, GL_ACCT_CAT, BAL_CD,
//           subfolderId, JOURNAL_ID, TRANSACTION_TYPE, CR_ALLOWED, DR_ALLOWED,
//           REC_ST, POST_ALLOW, CONTROL_ACCT_FG, SUSPENSE_ACCT_FG, ALLOW_BAL_SWING_FG,
//           LEDGER_BALANCE, AVAILABLE_BALANCE, OPENING_BALANCE, CURRENT_BALANCE,
//           CURRENCY_CODE, metadata, createdAt, updatedAt
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
//       `;

//       const values = [
//         GL_ACCT_NO, 
//         finalGL_ACCT_ID, 
//         CREATED_BY, 
//         organizationName || '', 
//         organizationCode || '',
//         branchName || '', 
//         branchCode || '', 
//         branchType || '', 
//         ACCT_DESC, 
//         categoryCode || '',
//         categoryName || '', 
//         level, 
//         LEDGER_NO, 
//         SUB_LEDGER_NO, 
//         CHART_OF_ACCT_ID, 
//         GL_ACCT_CAT || '',
//         BAL_CD || '', 
//         subfolderId || '', 
//         JOURNAL_ID, 
//         TRANSACTION_TYPE, 
//         CR_ALLOWED, 
//         DR_ALLOWED,
//         REC_ST, 
//         POST_ALLOW, 
//         CONTROL_ACCT_FG, 
//         SUSPENSE_ACCT_FG, 
//         ALLOW_BAL_SWING_FG,
//         LEDGER_BALANCE, 
//         AVAILABLE_BALANCE, 
//         OPENING_BALANCE, 
//         CURRENT_BALANCE,
//         CURRENCY_CODE, 
//         JSON.stringify(fullMetadata),
//         currentTimestamp, // createdAt
//         currentTimestamp  // updatedAt
//       ];

//       connection.query(insertQuery, values, (err, result) => {
//         if (err) reject(err);
//         else resolve(result);
//       });
//     });

//     const result = await insertAccount();
//     const accountId = result.insertId;

//     // Fetch result
//     const fetchAccount = () => new Promise((resolve, reject) => {
//       connection.query(
//         'SELECT * FROM gl_accounts WHERE id = ?',
//         [accountId],
//         (err, results) => {
//           if (err) reject(err);
//           else resolve(results);
//         }
//       );
//     });
    
//     const accountRows = await fetchAccount();
    
//     if (accountRows.length === 0) {
//       throw new Error('Failed to retrieve created account');
//     }
    
//     const createdAccount = accountRows[0];
    
//     // Commit transaction
//     const commitTransaction = () => new Promise((resolve, reject) => {
//       connection.commit((err) => {
//         if (err) reject(err);
//         else resolve();
//       });
//     });
    
//     await commitTransaction();

//     // Parse metadata
//     const metadataParsed = typeof createdAccount.metadata === 'string'
//       ? JSON.parse(createdAccount.metadata)
//       : createdAccount.metadata || {};

//     // Response
//     const responseData = {
//       success: true,
//       status: 'success',
//       message: 'GL account created successfully',
//       data: {
//         id: createdAccount.id,
//         GL_ACCT_NO: createdAccount.GL_ACCT_NO,
//         GL_ACCT_ID: createdAccount.GL_ACCT_ID,
//         ACCT_DESC: createdAccount.ACCT_DESC,
//         organizationName: createdAccount.organizationName,
//         organizationCode: createdAccount.organizationCode,
//         branchName: createdAccount.branchName,
//         branchCode: createdAccount.branchCode,
//         status: createdAccount.REC_ST,
//         openingBalance: createdAccount.OPENING_BALANCE,
//         currentBalance: createdAccount.CURRENT_BALANCE,
//         metadata: metadataParsed,
//         createdAt: createdAccount.createdAt,
//         updatedAt: createdAccount.updatedAt
//       },
//       timestamp: new Date().toISOString()
//     };

//     return res.status(201).json(responseData);

//   } catch (error) {
//     console.error('❌ Error creating GL account:', error.message);
//     console.error('Error stack:', error.stack);
    
//     if (connection) {
//       // Rollback transaction
//       const rollbackTransaction = () => new Promise((resolve) => {
//         connection.rollback(() => {
//           resolve();
//         });
//       });
      
//       await rollbackTransaction();
//     }

//     return res.status(400).json({
//       success: false,
//       status: 'error',
//       message: 'Failed to create GL account',
//       error: error.message,
//       timestamp: new Date().toISOString()
//     });

//   } finally {
//     if (connection) {
//       sequelize.connectionManager.releaseConnection(connection);
//     }
//   }
// };

// Helper function to create full gl_accounts table - UPDATED with proper syntax
async function createFullGLAccountsTable(connection) {
  return new Promise((resolve, reject) => {
    // First, drop table if exists to avoid conflicts
    connection.query('DROP TABLE IF EXISTS gl_accounts', (dropErr) => {
      if (dropErr) {
        console.warn('Warning dropping table:', dropErr.message);
      }
      
      // Create table with proper SQL syntax
      const createTableQuery = `
        CREATE TABLE gl_accounts (
          id INT PRIMARY KEY AUTO_INCREMENT,
          GL_ACCT_NO VARCHAR(50) UNIQUE NOT NULL,
          GL_ACCT_ID INT,
          CREATED_BY VARCHAR(100),
          organizationName VARCHAR(255),
          organizationCode VARCHAR(50),
          branchName VARCHAR(255),
          branchCode VARCHAR(50),
          branchType VARCHAR(50) DEFAULT 'MAIN',
          ACCT_DESC VARCHAR(500),
          categoryCode VARCHAR(10),
          categoryName VARCHAR(255),
          level INT DEFAULT 4,
          LEDGER_NO VARCHAR(10) DEFAULT '001',
          SUB_LEDGER_NO VARCHAR(10) DEFAULT '001',
          CHART_OF_ACCT_ID VARCHAR(10) DEFAULT '001',
          GL_ACCT_CAT VARCHAR(10),
          BAL_CD VARCHAR(10),
          subfolderId VARCHAR(100),
          JOURNAL_ID VARCHAR(100),
          TRANSACTION_TYPE VARCHAR(100),
          CR_ALLOWED BOOLEAN DEFAULT FALSE,
          DR_ALLOWED BOOLEAN DEFAULT TRUE,
          REC_ST VARCHAR(20) DEFAULT 'Active',
          POST_ALLOW BOOLEAN DEFAULT TRUE,
          CONTROL_ACCT_FG BOOLEAN DEFAULT FALSE,
          SUSPENSE_ACCT_FG BOOLEAN DEFAULT FALSE,
          ALLOW_BAL_SWING_FG BOOLEAN DEFAULT FALSE,
          LEDGER_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          AVAILABLE_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          OPENING_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          CURRENT_BALANCE DECIMAL(20,2) DEFAULT 0.00,
          CURRENCY_CODE VARCHAR(3) DEFAULT 'NGN',
          metadata JSON,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_gl_acct_no (GL_ACCT_NO),
          INDEX idx_organization (organizationCode, branchCode),
          INDEX idx_status (REC_ST)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `;
      
      connection.query(createTableQuery, (err, result) => {
        if (err) {
          console.error('Error creating table:', err.message);
          console.error('SQL:', createTableQuery);
          reject(err);
        } else {
          console.log('✅ Created gl_accounts table with all columns');
          resolve(result);
        }
      });
    });
  });
}




// ==================== UTILITY FUNCTIONS ====================

// Helper function to determine asset category
const getAssetCategory = (accountType) => {
  // Current assets
  if (accountType.includes('CURRENT_ASSET') || 
      accountType.includes('CASH') || 
      accountType.includes('BANK') || 
      accountType.includes('RECEIVABLE') ||
      accountType.includes('TRADING_SECURITIES') ||
      accountType.includes('DERIVATIVE_ASSETS') ||
      accountType.includes('INVENTORY') ||
      accountType.includes('PREPAID') ||
      accountType.includes('ACCUMULATED_INCOME') ||
      accountType.includes('INTEREST_RECEIVABLE') ||
      accountType.includes('FEE_RECEIVABLE')) {
    return 'CURRENT_ASSET';
  }
  
  // Non-current assets
  if (accountType.includes('NON_CURRENT_ASSET') || 
      accountType.includes('FIXED_ASSET') || 
      accountType.includes('PROPERTY') || 
      accountType.includes('INTANGIBLE') ||
      accountType.includes('GOODWILL') ||
      accountType.includes('INVESTMENT') ||
      accountType.includes('LEASE_ASSET') ||
      accountType.includes('RIGHT_OF_USE') ||
      accountType.includes('DEFERRED_TAX_ASSET')) {
    return 'NON_CURRENT_ASSET';
  }
  
  // Default to asset
  return 'ASSET';
};

// Helper function to determine liability category
const getLiabilityCategory = (accountType) => {
  // Current liabilities
  if (accountType.includes('CURRENT_LIABILITY') || 
      accountType.includes('PAYABLE') || 
      accountType.includes('DEPOSIT') || 
      accountType.includes('TAX_PAYABLE') ||
      accountType.includes('INTEREST_PAYABLE') ||
      accountType.includes('ACCRUED') ||
      accountType.includes('DIVIDEND_PAYABLE') ||
      accountType.includes('WITHHOLDING_TAX_PAYABLE') ||
      accountType.includes('UNEARNED_REVENUE') ||
      accountType.includes('CUSTOMER_DEPOSITS') ||
      accountType.includes('SAVINGS_DEPOSITS')) {
    return 'CURRENT_LIABILITY';
  }
  
  // Non-current liabilities
  if (accountType.includes('NON_CURRENT_LIABILITY') || 
      accountType.includes('LONG_TERM') || 
      accountType.includes('LOAN_LIABILITY') || 
      accountType.includes('BORROWING') ||
      accountType.includes('BONDS_PAYABLE') ||
      accountType.includes('SUBORDINATED_DEBT') ||
      accountType.includes('LEASE_LIABILITY') ||
      accountType.includes('DEFERRED_TAX_LIABILITY')) {
    return 'NON_CURRENT_LIABILITY';
  }
  
  // Default to liability
  return 'LIABILITY';
};

// Helper function to determine tax category
const getTaxCategory = (accountType) => {
  if (accountType.includes('PAYABLE')) {
    return 'CURRENT_LIABILITY';
  }
  if (accountType.includes('ASSET')) {
    return 'CURRENT_ASSET';
  }
  return 'LIABILITY';
};

// Helper function to determine control category
const getControlCategory = (accountType) => {
  if (accountType.includes('LIABILITY')) {
    return 'CURRENT_LIABILITY';
  }
  return 'ASSET';
};

// Helper function to update parent-child relationships
const updateParentChildRelationship = async (parentAccountNo, childAccountNo, connection) => {
  try {
    // First update parent's childAccounts
    const [parentRows] = await connection.execute(
      'SELECT childAccounts FROM gl_accounts WHERE GL_ACCT_NO = ?',
      [parentAccountNo]
    );
    
    let childAccounts = [];
    if (parentRows[0]?.childAccounts) {
      childAccounts = typeof parentRows[0].childAccounts === 'string' 
        ? JSON.parse(parentRows[0].childAccounts)
        : parentRows[0].childAccounts;
    }
    
    if (!childAccounts.includes(childAccountNo)) {
      childAccounts.push(childAccountNo);
      await connection.execute(
        'UPDATE gl_accounts SET childAccounts = ? WHERE GL_ACCT_NO = ?',
        [JSON.stringify(childAccounts), parentAccountNo]
      );
      console.log(`✅ Updated parent-child: ${parentAccountNo} -> ${childAccountNo}`);
    }
  } catch (error) {
    console.log('⚠️ Could not update parent-child relationship:', error.message);
  }
};

// Helper function to ensure gl_accounts table exists
async function ensureGLAccountsTable(connection) {
  try {
    // Try to describe the table first
    await connection.execute('DESCRIBE gl_accounts');
    console.log('✅ gl_accounts table exists');
    return true;
  } catch (error) {
    console.log('🔄 Creating gl_accounts table...');
    
    // Create a minimal table with only required columns
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS gl_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        GL_ACCT_NO VARCHAR(50) UNIQUE NOT NULL,
        GL_ACCT_ID INT,
        CREATED_BY VARCHAR(100),
        ACCT_DESC VARCHAR(500),
        organizationName VARCHAR(255),
        organizationCode VARCHAR(50),
        branchName VARCHAR(255),
        branchCode VARCHAR(50),
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('✅ Created minimal gl_accounts table');
    
    // Now add other columns if they don't exist
    const additionalColumns = [
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS branchType VARCHAR(50) DEFAULT "MAIN"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS coaStructure JSON',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS categoryCode VARCHAR(10)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS categoryName VARCHAR(255)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS level INT DEFAULT 4',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS LEDGER_NO VARCHAR(10) DEFAULT "001"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS SUB_LEDGER_NO VARCHAR(10) DEFAULT "001"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CHART_OF_ACCT_ID VARCHAR(10) DEFAULT "001"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS GL_ACCT_CAT VARCHAR(10)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS BAL_CD VARCHAR(10)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS subfolderId VARCHAR(100)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS JOURNAL_ID VARCHAR(100)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS TRANSACTION_TYPE VARCHAR(100)',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CR_ALLOWED BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS DR_ALLOWED BOOLEAN DEFAULT TRUE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS REC_ST VARCHAR(20) DEFAULT "Active"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS POST_ALLOW BOOLEAN DEFAULT TRUE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CONTROL_ACCT_FG BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS SUSPENSE_ACCT_FG BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS ALLOW_BAL_SWING_FG BOOLEAN DEFAULT FALSE',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS LEDGER_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS AVAILABLE_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS OPENING_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CURRENT_BALANCE DECIMAL(20,2) DEFAULT 0.00',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS CURRENCY_CODE VARCHAR(3) DEFAULT "NGN"',
      'ALTER TABLE gl_accounts ADD COLUMN IF NOT EXISTS metadata JSON'
    ];
    
    for (const alterQuery of additionalColumns) {
      try {
        await connection.execute(alterQuery);
      } catch (alterError) {
        console.log(`⚠️ Could not add column: ${alterError.message}`);
      }
    }
    
    console.log('✅ Added additional columns to gl_accounts table');
    return true;
  }
}

// Helper function to create gl_accounts table
async function createGLAccountsTable(connection) {
  try {
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS gl_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        GL_ACCT_NO VARCHAR(50) UNIQUE NOT NULL,
        GL_ACCT_ID INT,
        CREATED_BY VARCHAR(100),
        organizationName VARCHAR(255),
        organizationCode VARCHAR(50),
        branchName VARCHAR(255),
        branchCode VARCHAR(50),
        branchType VARCHAR(50),
        ACCT_DESC VARCHAR(500),
        coaStructure JSON,
        categoryCode VARCHAR(10),
        categoryName VARCHAR(255),
        level INT,
        LEDGER_NO VARCHAR(10),
        SUB_LEDGER_NO VARCHAR(10),
        CHART_OF_ACCT_ID VARCHAR(10),
        GL_ACCT_CAT VARCHAR(10),
        BAL_CD VARCHAR(10),
        subfolderId VARCHAR(100),
        JOURNAL_ID VARCHAR(100),
        TRANSACTION_TYPE VARCHAR(100),
        CR_ALLOWED BOOLEAN DEFAULT FALSE,
        DR_ALLOWED BOOLEAN DEFAULT FALSE,
        REC_ST VARCHAR(20) DEFAULT 'Active',
        POST_ALLOW BOOLEAN DEFAULT TRUE,
        CONTROL_ACCT_FG BOOLEAN DEFAULT FALSE,
        SUSPENSE_ACCT_FG BOOLEAN DEFAULT FALSE,
        ALLOW_BAL_SWING_FG BOOLEAN DEFAULT FALSE,
        LEDGER_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        AVAILABLE_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        OPENING_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        CURRENT_BALANCE DECIMAL(20,2) DEFAULT 0.00,
        CURRENCY_CODE VARCHAR(3) DEFAULT 'NGN',
        metadata JSON,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } catch (error) {
    console.error('❌ Error creating gl_accounts table:', error.message);
    throw error;
  }
}

// ==================== DIAGNOSE DATABASE ====================
export const diagnoseDatabase = async (req, res) => {
  const connection = await sequelize.connectionManager.getConnection();
  
  try {
    console.log('🔍 Running database diagnosis...');
    
    // 1. Check all tables
    const [tables] = await connection.execute('SHOW TABLES');
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('📊 Tables found:', tableNames);
    
    // 2. Check organizations table if it exists
    let orgColumns = [];
    if (tableNames.some(t => t.toLowerCase().includes('organization'))) {
      const orgTable = tableNames.find(t => t.toLowerCase().includes('organization'));
      [orgColumns] = await connection.execute(`SHOW COLUMNS FROM ${orgTable}`);
      console.log(`📊 ${orgTable} columns:`, orgColumns.map(c => ({ Field: c.Field, Type: c.Type })));
    }
    
    // 3. Check branches table if it exists
    let branchColumns = [];
    if (tableNames.some(t => t.toLowerCase().includes('branch'))) {
      const branchTable = tableNames.find(t => t.toLowerCase().includes('branch'));
      [branchColumns] = await connection.execute(`SHOW COLUMNS FROM ${branchTable}`);
      console.log(`📊 ${branchTable} columns:`, branchColumns.map(c => ({ Field: c.Field, Type: c.Type })));
    }
    
    // 4. Check gl_accounts table if it exists
    let glColumns = [];
    if (tableNames.some(t => t.toLowerCase().includes('gl_account'))) {
      const glTable = tableNames.find(t => t.toLowerCase().includes('gl_account'));
      [glColumns] = await connection.execute(`SHOW COLUMNS FROM ${glTable}`);
      console.log(`📊 ${glTable} columns:`, glColumns.map(c => ({ Field: c.Field, Type: c.Type })));
    }
    
    return res.json({
      success: true,
      diagnosis: {
        tables: tableNames,
        organizations: orgColumns.map(c => c.Field),
        branches: branchColumns.map(c => c.Field),
        gl_accounts: glColumns.map(c => c.Field)
      }
    });
    
  } catch (error) {
    console.error('❌ Diagnosis error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  } finally {
    if (connection) sequelize.connectionManager.releaseConnection(connection);
  }
};

// ==================== EXPORT DEFAULT ====================
const GLAccountController = {
  createCOAAlignedGLAccount,
  createLedgerEntry,
  diagnoseDatabase,
  validateAccountClassType,
  mapMetadataAccountTypeToAccountType,
  getCOABalanceType,
  generateNextGLAcctId,
  getAccountTypeCode,
  addAuditTrail
};

export default GLAccountController;