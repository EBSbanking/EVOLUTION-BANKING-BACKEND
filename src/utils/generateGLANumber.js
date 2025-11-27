import mongoose from 'mongoose';
import Subfolder from '../models/Subfolder.js';
import { logger } from './logger.js';
import GLAccount from '../models/GLAccount.js';
import Branch from '../models/Branch.js';
import Organization from '../models/organization.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js';

// Fallback logger if import fails
const fallbackLogger = {
  info: (message, meta) => console.log(`INFO: ${message}`, meta || ''),
  error: (message, meta) => console.error(`ERROR: ${message}`, meta || ''),
  debug: (message, meta) => console.debug(`DEBUG: ${message}`, meta || ''),
  warn: (message, meta) => console.warn(`WARN: ${message}`, meta || ''),
};

/**
 * Configuration for flexible GL account segments. Customize lengths and padding here.
 * Example: { min: 1, max: 3, pad: 3 } allows 1-3 digits, padded to 3.
 */
const SEGMENT_CONFIG = {
  CHART_OF_ACCT_ID: { min: 1, max: 2, pad: 2 },
  BAL_CD: { min: 1, max: 3, pad: 3 },
  SUB_LEDGER_NO: { min: 1, max: 3, pad: 3 },
  GL_ACCT_CAT: { min: 1, max: 3, pad: 3 },
  BU_ID: { min: 1, max: 3, pad: 3 }, // branchCode
  LEDGER_NO: { min: 1, max: 3, pad: 3 },
};

// GL Account Templates Configuration
const GL_ACCOUNT_TEMPLATES = {
  'INTER_BRANCH': {
    template: 'GL-{branch}-{dept}-{product}-{seq}',
    description: 'Inter-Branch Settlement Account',
    transactionType: 'BOTH',
    category: 'ASSET'
  },
  'INTER_BRANCH_PAYABLE': {
    template: 'GL-{branch}-{dept}-{product}-{seq}',
    description: 'Inter-Branch Payable Account',
    transactionType: 'CREDIT',
    category: 'LIABILITY'
  },
  'INTER_BRANCH_RECEIVABLE': {
    template: 'GL-{branch}-{dept}-{product}-{seq}',
    description: 'Inter-Branch Receivable Account',
    transactionType: 'DEBIT',
    category: 'ASSET'
  },
  'DEFAULT': {
    template: 'GL-{branch}-{dept}-{product}-{seq}',
    description: 'General Ledger Account',
    transactionType: 'BOTH',
    category: 'ASSET'
  }
};

/**
 * Helper function to generate GL_ACCT_NO based on selected values with flexible segments.
 * Supports variable lengths (1-3 digits per segment) and optional alphanumeric.
 * @param {number|string} CHART_OF_ACCT_ID - Chart of accounts ID (e.g., 1 or 'A1')
 * @param {number|string} BAL_CD - Balance code (e.g., 10 or 'B2')
 * @param {number|string} SUB_LEDGER_NO - Subledger number (e.g., 112)
 * @param {number|string} GL_ACCT_CAT - GL Account Category code (e.g., 001)
 * @param {number|string} BU_ID - Business Unit ID / branchCode (e.g., 102)
 * @param {number|string} LEDGER_NO - Ledger number (e.g., 110)
 * @param {Object} [configOverrides] - Optional overrides for segment config
 * @returns {string} - Generated GL Account Number (e.g., '01-010-112-001-102-110' or flexible variant)
 */
export const generateGLAccountNumber = (
  CHART_OF_ACCT_ID,
  BAL_CD,
  SUB_LEDGER_NO,
  GL_ACCT_CAT,
  BU_ID,
  LEDGER_NO,
  configOverrides = {}
) => {
  try {
    // Validate inputs exist
    const inputs = { CHART_OF_ACCT_ID, BAL_CD, SUB_LEDGER_NO, GL_ACCT_CAT, BU_ID, LEDGER_NO };
    for (const [key, value] of Object.entries(inputs)) {
      if (value === undefined || value === null) {
        throw new Error(`Missing required input: ${key}`);
      }
    }

    // Use overridden or default config
    const effectiveConfig = { ...SEGMENT_CONFIG, ...configOverrides };

    // Validate and format each segment
    const segments = [];
    const segmentKeys = ['CHART_OF_ACCT_ID', 'BAL_CD', 'SUB_LEDGER_NO', 'GL_ACCT_CAT', 'BU_ID', 'LEDGER_NO'];
    for (const key of segmentKeys) {
      const value = inputs[key];
      const { min, max, pad } = effectiveConfig[key];
      const strValue = String(value).trim();

      // Allow alphanumeric, but enforce length
      if (strValue.length < min || strValue.length > max) {
        throw new Error(`${key} must be ${min}-${max} characters (alphanumeric allowed)`);
      }

      // Pad if needed (left-pad with zeros for numbers, or spaces/no-pad for alpha)
      const padded = Number.isNaN(Number(strValue)) 
        ? strValue.padEnd(pad, ' ') // For alpha, right-pad with spaces or customize
        : strValue.padStart(pad, '0'); // For numeric, left-pad with zeros

      segments.push(padded);
    }

    const glAcctNo = segments.join('-');
    
    // Validate overall format (flexible regex for variable lengths)
    validateGLAccountFormat(glAcctNo, effectiveConfig);

    (logger.info || fallbackLogger.info)('Generated GL Account Number', {
      glAcctNo,
      inputs,
      config: effectiveConfig,
    });
    return glAcctNo;
  } catch (error) {
    (logger.error || fallbackLogger.error)('Error generating GL Account Number', {
      error: error.message,
      inputs: { CHART_OF_ACCT_ID, BAL_CD, SUB_LEDGER_NO, GL_ACCT_CAT, BU_ID, LEDGER_NO },
    });
    throw error;
  }
};

/**
 * Template-based GL Account Generator for specific account types
 * @param {string} template - Template string with placeholders
 * @param {string} branchCode - Branch code
 * @param {string} departmentCode - Department code (default: '001')
 * @param {string} productCode - Product code (default: '800')
 * @param {Object} options - Additional options for sequence generation
 * @returns {string} Generated GL Account Number
 */
export const generateGLAccountFromTemplate = (
  template, 
  branchCode, 
  departmentCode = '001', 
  productCode = '800',
  options = {}
) => {
  try {
    const { sequenceLength = 4, useRandomSequence = true, customSequence } = options;
    
    let accountNo = template;
    
    // Replace template placeholders
    accountNo = accountNo
      .replace(/{branch}/g, String(branchCode).padStart(3, '0'))
      .replace(/{dept}/g, String(departmentCode).padStart(3, '0'))
      .replace(/{product}/g, String(productCode).padStart(4, '0'));
    
    // Handle sequence generation
    if (accountNo.includes('{seq}')) {
      let sequence;
      if (customSequence) {
        sequence = String(customSequence).padStart(sequenceLength, '0');
      } else if (useRandomSequence) {
        const min = Math.pow(10, sequenceLength - 1);
        const max = Math.pow(10, sequenceLength) - 1;
        sequence = String(Math.floor(min + Math.random() * (max - min + 1)));
      } else {
        sequence = '1'.padStart(sequenceLength, '0');
      }
      accountNo = accountNo.replace(/{seq}/g, sequence);
    }
    
    (logger.info || fallbackLogger.info)('Generated GL Account from template', {
      template,
      branchCode,
      departmentCode,
      productCode,
      generatedAccount: accountNo
    });
    
    return accountNo;
  } catch (error) {
    (logger.error || fallbackLogger.error)('Error generating GL Account from template', {
      error: error.message,
      template,
      branchCode
    });
    throw error;
  }
};

// Determine GL account category based on account type
export const determineCategoryFromAccountType = (accountType) => {
  const categoryMap = {
    'INTER_BRANCH': 'ASSET',
    'INTER_BRANCH_PAYABLE': 'LIABILITY',
    'INTER_BRANCH_RECEIVABLE': 'ASSET',
    'CASH': 'ASSET',
    'BANK': 'ASSET',
    'RECEIVABLE': 'ASSET',
    'PAYABLE': 'LIABILITY',
    'EQUITY': 'EQUITY',
    'REVENUE': 'REVENUE',
    'EXPENSE': 'EXPENSE'
  };
  return categoryMap[accountType] || 'ASSET';
};

// Determine balance code (D for Debit, C for Credit)
export const determineBalanceCode = (accountType) => {
  const balanceCodeMap = {
    'INTER_BRANCH': 'D',
    'INTER_BRANCH_PAYABLE': 'C',
    'INTER_BRANCH_RECEIVABLE': 'D',
    'CASH': 'D',
    'BANK': 'D',
    'RECEIVABLE': 'D',
    'PAYABLE': 'C',
    'EQUITY': 'C',
    'REVENUE': 'C',
    'EXPENSE': 'D'
  };
  return balanceCodeMap[accountType] || 'D';
};

// Determine if credit transactions are allowed
export const determineCreditAllowed = (accountType) => {
  const creditAllowedMap = {
    'INTER_BRANCH': true,
    'INTER_BRANCH_PAYABLE': true,
    'INTER_BRANCH_RECEIVABLE': false,
    'CASH': true,
    'BANK': true,
    'RECEIVABLE': false,
    'PAYABLE': true,
    'EQUITY': true,
    'REVENUE': true,
    'EXPENSE': false
  };
  return creditAllowedMap[accountType] !== false;
};

// Determine if debit transactions are allowed
export const determineDebitAllowed = (accountType) => {
  const debitAllowedMap = {
    'INTER_BRANCH': true,
    'INTER_BRANCH_PAYABLE': false,
    'INTER_BRANCH_RECEIVABLE': true,
    'CASH': true,
    'BANK': true,
    'RECEIVABLE': true,
    'PAYABLE': false,
    'EQUITY': false,
    'REVENUE': false,
    'EXPENSE': true
  };
  return debitAllowedMap[accountType] !== false;
};

// Updated createInterBranchAccounts function using the new generator
export const createInterBranchAccounts = async (organizationCode, branchCode, branchName, CREATED_BY, session) => {
  const interBranchAccounts = [];
  const interBranchTypes = ['INTER_BRANCH', 'INTER_BRANCH_PAYABLE', 'INTER_BRANCH_RECEIVABLE'];
  
  for (const accountType of interBranchTypes) {
    const templateConfig = GL_ACCOUNT_TEMPLATES[accountType];
    if (!templateConfig) {
      (logger.warn || fallbackLogger.warn)(`No template configuration found for account type: ${accountType}`);
      continue;
    }

    try {
      // Use the enhanced template generator
      const glAcctNo = generateGLAccountFromTemplate(
        templateConfig.template, 
        branchCode, 
        '001', 
        '800',
        { sequenceLength: 4, useRandomSequence: true }
      );
      
      const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
      if (existingAccount) {
        (logger.info || fallbackLogger.info)(`Inter-branch account ${glAcctNo} already exists, skipping creation`);
        continue;
      }

      const newGLAccount = new GLAccount({
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: await generateNextGLAcctId(session),
        CREATED_BY,
        organizationName: branchName,
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
          templateUsed: templateConfig.template,
          createdAt: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await newGLAccount.save({ session });
      interBranchAccounts.push(newGLAccount);
      
      (logger.info || fallbackLogger.info)(`Created inter-branch account: ${glAcctNo} for branch ${branchCode}`, {
        accountType,
        glAcctNo,
        branchCode
      });

    } catch (error) {
      (logger.error || fallbackLogger.error)(`Error creating inter-branch account of type ${accountType}`, {
        error: error.message,
        branchCode,
        accountType
      });
      // Continue with other account types even if one fails
      continue;
    }
  }
  
  (logger.info || fallbackLogger.info)(`Created ${interBranchAccounts.length} inter-branch accounts for branch ${branchCode}`);
  return interBranchAccounts;
};

/**
 * Auto-generate next GL_ACCT_ID (7-digit string), scoped to organization/branch if provided.
 * @param {mongoose.ClientSession} session - MongoDB session for transaction
 * @param {string} [organizationName] - Optional filter for organization
 * @param {string} [branchName] - Optional filter for branch
 * @returns {string} - Next GL_ACCT_ID (e.g., '0000001')
 */
/**
 * Fixed version of generateNextGLAcctId to avoid "fn is not a function" error
 */
export const generateNextGLAcctId = async (session) => {
  try {
    console.log('generateNextGLAcctId: Starting with session:', !!session);
    
    // Find the highest GL_ACCT_ID and increment
    const lastAccount = await GLAccount.findOne()
      .sort({ GL_ACCT_ID: -1 })
      .limit(1)
      .session(session || null);

    console.log('generateNextGLAcctId: Last account found:', lastAccount ? lastAccount.GL_ACCT_ID : 'None');

    let newGLAcctId;
    
    if (!lastAccount || !lastAccount.GL_ACCT_ID) {
      newGLAcctId = 1000; // Starting ID as number
    } else {
      // Handle both string and number formats
      const lastId = lastAccount.GL_ACCT_ID;
      if (typeof lastId === 'string') {
        const numericPart = lastId.replace(/\D/g, '');
        newGLAcctId = numericPart ? parseInt(numericPart, 10) + 1 : 1000;
      } else {
        newGLAcctId = lastId + 1;
      }
    }

    console.log('generateNextGLAcctId: Generated next ID:', newGLAcctId);
    
    (logger.info || fallbackLogger.info)('Generated GL_ACCT_ID', { newGLAcctId });
    return newGLAcctId;
  } catch (error) {
    console.error('generateNextGLAcctId: Error:', error.message);
    (logger.error || fallbackLogger.error)('Error generating GL_ACCT_ID', {
      error: error.message,
    });
    // Fallback
    return 1000;
  }
};

/**
 * Validate GL_ACCT_NO format with flexible segment lengths.
 * @param {string} glAcctNo - GL Account Number to validate
 * @param {Object} [config] - Segment config for validation (from SEGMENT_CONFIG)
 * @returns {boolean} - True if valid
 * @throws {Error} - If format is invalid
 */
export const validateGLAccountFormat = (glAcctNo, config = SEGMENT_CONFIG) => {
  // Split by dashes and validate each segment against config
  const segments = glAcctNo.split('-');
  if (segments.length !== 6) {
    throw new Error(`GL_ACCT_NO must have exactly 6 segments separated by dashes: ${glAcctNo}`);
  }

  const segmentKeys = ['CHART_OF_ACCT_ID', 'BAL_CD', 'SUB_LEDGER_NO', 'GL_ACCT_CAT', 'BU_ID', 'LEDGER_NO'];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i].trim();
    const { min, max } = config[segmentKeys[i]];
    if (segment.length < min || segment.length > max) {
      throw new Error(`${segmentKeys[i]} segment must be ${min}-${max} characters: ${segment}`);
    }
    // Optional: Enforce alphanumeric if needed
    if (!/^[a-zA-Z0-9 ]+$/.test(segment)) {
      throw new Error(`${segmentKeys[i]} segment must be alphanumeric or spaces: ${segment}`);
    }
  }

  if (!/^[a-zA-Z0-9 -]+$/.test(glAcctNo)) {
    throw new Error(`GL_ACCT_NO contains invalid characters: ${glAcctNo}`);
  }

  return true;
};

/**
 * Generate Transaction ID
 * @returns {string} - Generated Transaction ID (e.g., timestamp + random 4 digits)
 */
export const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  const transactionId = base + random;
  (logger.info || fallbackLogger.info)('Generated Transaction ID', { transactionId });
  return transactionId;
};

/**
 * Generate Journal ID
 * @returns {string} - Generated Journal ID (e.g., last 8 digits of timestamp + random 4 digits)
 */
export const generateJournalId = () => {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  const journalId = `${timestamp}${random}`;
  (logger.info || fallbackLogger.info)('Generated Journal ID', { journalId });
  return journalId;
};

/**
 * Create Root Subfolder
 * @param {string} createdBy - User ID creating the subfolder
 * @param {number} ledgerNo - Ledger number
 * @param {Object} options - Options object containing MongoDB session
 * @returns {Object} - Created subfolder document
 */
export const createRootSubfolder = async (createdBy, ledgerNo, { session }) => {
  try {
    console.log('createRootSubfolder: Starting with createdBy:', createdBy, 'ledgerNo:', ledgerNo);
    
    // Find the highest subfolderId to generate the next sequential ID
    const maxSubfolder = await Subfolder.findOne()
      .sort({ subfolderId: -1 })
      .session(session || null);
    
    console.log('createRootSubfolder: Max subfolder found:', maxSubfolder ? maxSubfolder.subfolderId : 'None');
    
    const subfolderId = maxSubfolder ? Number(maxSubfolder.subfolderId) + 1 : 1;
    const parentId = subfolderId;

    console.log('createRootSubfolder: Creating with subfolderId:', subfolderId, 'parentId:', parentId);

    const newSubfolder = new Subfolder({
      subfolderId,
      parentId,
      createdBy,
      ledgerNo: String(ledgerNo),
      isRoot: true,
      name: `Root-${subfolderId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newSubfolder.save({ session });
    
    console.log('createRootSubfolder: Successfully created subfolder:', newSubfolder.subfolderId);
    
    (logger.info || fallbackLogger.info)('Created root subfolder', {
      subfolderId,
      parentId,
      createdBy,
      ledgerNo,
    });
    return newSubfolder;
  } catch (error) {
    console.error('createRootSubfolder: Error:', error.message);
    (logger.error || fallbackLogger.error)('Error creating root subfolder', {
      error: error.message,
      createdBy,
      ledgerNo,
    });
    throw error;
  }
};

/**
 * Simple fallback function for GL Account ID generation
 * Use this if the main function has issues
 */
export const generateSimpleGLAcctId = async (session) => {
  try {
    console.log('generateSimpleGLAcctId: Starting simple ID generation');
    const count = await GLAccount.countDocuments().session(session || null);
    const newId = String(count + 1).padStart(7, '0');
    console.log('generateSimpleGLAcctId: Generated ID:', newId);
    return newId;
  } catch (error) {
    console.error('generateSimpleGLAcctId: Error:', error.message);
    // Ultimate fallback
    return '0000001';
  }
};

/**
 * Test function to verify GL account ID generation works
 */
export const testGLAccountIdGeneration = async () => {
  const session = await mongoose.startSession();
  try {
    console.log('=== TESTING GL ACCOUNT ID GENERATION ===');
    
    await session.withTransaction(async () => {
      console.log('Testing main generateNextGLAcctId...');
      const mainResult = await generateNextGLAcctId(session);
      console.log('Main function result:', mainResult);
      
      console.log('Testing simple generateSimpleGLAcctId...');
      const simpleResult = await generateSimpleGLAcctId(session);
      console.log('Simple function result:', simpleResult);
    });
    
    console.log('=== TEST COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('=== TEST FAILED ===');
    console.error('Error:', error.message);
  } finally {
    session.endSession();
    console.log('=== TEST SESSION ENDED ===');
  }
};

// Export GL_ACCOUNT_TEMPLATES for external use
export { GL_ACCOUNT_TEMPLATES };