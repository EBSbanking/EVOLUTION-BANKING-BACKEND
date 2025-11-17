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
import { generateJournalId, generateGLAccountNumber, createRootSubfolder, validateGLAccountFormat } from '../utils/generateGLANumber.js';

// Add the missing isValidGLAcctNo function locally
/**
 * Validate GL_ACCT_NO format (wrapper for validateGLAccountFormat that returns boolean)
 * @param {string} glAcctNo - GL Account Number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidGLAcctNo = (glAcctNo) => {
  try {
    validateGLAccountFormat(glAcctNo);
    return true;
  } catch (error) {
    console.error('GL Account Number validation failed:', {
      glAcctNo,
      error: error.message,
    });
    return false;
  }
};

// Utility: Generate Transaction ID
const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  const transactionId = base + random;
  logger.info('Generated Transaction ID', { transactionId });
  return transactionId;
};

// Helper function to generate next GL account ID
const generateNextGLAcctId = async (session) => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Helper functions for determining account properties
const determineCategoryFromAccountType = (accountType) => {
  const categoryMap = {
    'PROCESSING_FEE': '400',
    'INSURANCE_FEE': '400', 
    'UPFRONT_INTEREST': '400',
    'OTHER_FEES': '400',
    'CUSTOMER_ACCOUNT': '100',
    'LOAN_ASSET': '200'
  };
  return categoryMap[accountType] || '999';
};

const determineBalanceCode = (accountType) => {
  const balanceCodeMap = {
    'PROCESSING_FEE': '400',
    'INSURANCE_FEE': '400',
    'UPFRONT_INTEREST': '400',
    'OTHER_FEES': '400',
    'CUSTOMER_ACCOUNT': '100',
    'LOAN_ASSET': '200'
  };
  return balanceCodeMap[accountType] || '999';
};

const determineCreditAllowed = (accountType) => {
  return ['PROCESSING_FEE', 'INSURANCE_FEE', 'UPFRONT_INTEREST', 'OTHER_FEES', 'CUSTOMER_ACCOUNT'].includes(accountType);
};

const determineDebitAllowed = (accountType) => {
  return ['LOAN_ASSET', 'CUSTOMER_ACCOUNT'].includes(accountType);
};

// Original createGLAccount function (for backward compatibility)
export const createGLAccount = async (req, res) => {
  logger.info('createGLAccount hit with body:', { body: req.body });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const {
        organizationName,
        branchName,
        branchCode,
        categoryCode,
        categoryName,
        parentCode,
        level,
        CHART_OF_ACCT_ID,
        ACCT_DESC,
        LEDGER_NO,
        GL_ACCT_CAT,
        JOURNAL_ID,
        TRANSACTION_TYPE,
        BAL_CD,
        SUB_LEDGER_NO,
        CR_ALLOWED,
        DR_ALLOWED,
        REC_ST,
        POST_ALLOW,
        POST_FG,
        CONTROL_ACCT_FG,
        CREATED_BY,
        SUSPENSE_ACCT_FG,
        ALLOW_BAL_SWING_FG,
        PARENT_ID,
        SEG_VALUE,
        SEG_DESC,
        SEG_NO,
        subfolderId,
        SEG_TY_CD,
        SEG_PLACEHLDR_ID,
        DELAY_GL_POSTING,
        SETTLEMENT_GL_ACCT_NO,
      } = req.body;

      // Required fields check
      const criticalFields = {
        organizationName,
        branchName,
        branchCode,
        categoryCode,
        categoryName,
        level,
        CREATED_BY,
        LEDGER_NO,
        BAL_CD,
        SUB_LEDGER_NO,
        branchCode,
        SEG_NO,
        ACCT_DESC,
        GL_ACCT_CAT,
        CHART_OF_ACCT_ID,
      };
      const missingFields = Object.entries(criticalFields)
        .filter(([_, value]) => value === null || value === undefined || value === '')
        .map(([key]) => key);
      if (missingFields.length > 0) {
        logger.error('Missing required fields', { missingFields });
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Validate and create organization
      const trimmedOrgName = organizationName.trim();
      let organization = await Organization.findOne({
        organizationName: trimmedOrgName,
      }).session(session);
      if (!organization) {
        logger.info('Organization not found, creating new', { organizationName: trimmedOrgName });
        organization = new Organization({
          organizationName: trimmedOrgName,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await organization.save({ session });
        logger.info('Created new organization', { organizationName: trimmedOrgName });
      }

      // Validate and create branch
      let branch = await Branch.findOne({
        organizationName: trimmedOrgName,
        branchName,
        branchCode,
      }).session(session);
      if (!branch) {
        logger.info('Branch not found, creating new', { organizationName: trimmedOrgName, branchName, branchCode });
        branch = new Branch({
          organizationName: trimmedOrgName,
          branchName,
          branchCode,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await branch.save({ session });
        logger.info('Created new branch', { organizationName: trimmedOrgName, branchName, branchCode });
        await addAuditTrail({
          EVENT_TYPE: 'CREATE_BRANCH',
          USER_ID: CREATED_BY,
          ACTION: 'CREATE',
          NEW_VALUE: { organizationName: trimmedOrgName, branchName, branchCode },
          OLD_VALUE: null,
          IP_ADDRESS: req.ip || '0.0.0.0',
          ENTITY_ID: branch._id,
          ENTITY_TYPE: 'Branch',
          STATUS: 'SUCCESS',
          DESCRIPTION: `Created branch ${branchName} with code ${branchCode} in organization ${trimmedOrgName}`,
          REFERENCE_NO: `BRANCH-${branch._id}`,
          ACCOUNT_NO: null,
          ADDITIONAL_INFO: {},
          session,
        });
      }

      // Generate GL_ACCT_NO
      let glAcctNo = SETTLEMENT_GL_ACCT_NO;
      if (!glAcctNo) {
        glAcctNo = [
          String(CHART_OF_ACCT_ID).padStart(2, '0'),
          String(branchCode).padStart(3, '0'),
          String(BAL_CD).padStart(3, '0'),
          String(GL_ACCT_CAT).padStart(3, '0'),
          String(LEDGER_NO).padStart(3, '0'),
          String(branchCode).padStart(3, '0'),
        ].join('-');
      }

      // Check for duplicate GL_ACCT_NO
      const existingAccounts = await GLAccount.find({ GL_ACCT_NO: glAcctNo }).session(session).lean();
      if (existingAccounts.length > 0) {
        logger.error('Duplicate GL_ACCT_NO found', { glAcctNo, existingIds: existingAccounts.map(acc => acc._id) });
        throw new Error(`GL_ACCT_NO ${glAcctNo} already exists`);
      }

      // Subfolder resolution
      let parentFolder;
      if (PARENT_ID && subfolderId) {
        parentFolder = await Subfolder.findOne({ subfolderId, parentId: PARENT_ID }).session(session);
        if (!parentFolder) {
          logger.error('Subfolder not found', { subfolderId, PARENT_ID });
          throw new Error(`Subfolder with subfolderId ${subfolderId} and parentId ${PARENT_ID} not found`);
        }
      } else {
        parentFolder = await createRootSubfolder(CREATED_BY, LEDGER_NO, { session });
      }
      const resolvedParentId = PARENT_ID || parentFolder.parentId;
      const resolvedSubfolderId = subfolderId || parentFolder.subfolderId;

      // Create GL account
      const newGLAccount = new GLAccount({
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: await generateNextGLAcctId(session),
        CREATED_BY,
        categoryCode,
        categoryName: categoryName || 'Default Category',
        parentCode: parentCode || null,
        level,
        organizationName: trimmedOrgName,
        branchName,
        branchCode,
        LEDGER_NO,
        PARENT_ID: resolvedParentId,
        subfolderId: resolvedSubfolderId,
        BAL_CD,
        SUB_LEDGER_NO,
        branchCode,
        SEG_NO: SEG_NO || 1,
        CHART_OF_ACCT_ID,
        ACCT_DESC,
        GL_ACCT_CAT: String(GL_ACCT_CAT).padStart(3, '0'),
        JOURNAL_ID: JOURNAL_ID || generateJournalId(),
        TRANSACTION_TYPE: TRANSACTION_TYPE || 'Asset Balance',
        CR_ALLOWED: CR_ALLOWED !== undefined ? CR_ALLOWED : true,
        DR_ALLOWED: DR_ALLOWED !== undefined ? DR_ALLOWED : true,
        REC_ST: REC_ST || 'Active',
        POST_ALLOW: POST_ALLOW !== undefined ? POST_ALLOW : true,
        POST_FG: POST_FG !== undefined ? POST_FG : false,
        CONTROL_ACCT_FG: CONTROL_ACCT_FG !== undefined ? CONTROL_ACCT_FG : false,
        SUSPENSE_ACCT_FG: SUSPENSE_ACCT_FG !== undefined ? SUSPENSE_ACCT_FG : false,
        ALLOW_BAL_SWING_FG: ALLOW_BAL_SWING_FG !== undefined ? ALLOW_BAL_SWING_FG : false,
        SEG_VALUE: SEG_VALUE || '',
        SEG_DESC: SEG_DESC || categoryName || 'Default Description',
        SEG_TY_CD: SEG_TY_CD || '',
        SEG_PLACEHLDR_ID: SEG_PLACEHLDR_ID || '',
        DELAY_GL_POSTING: DELAY_GL_POSTING !== undefined ? DELAY_GL_POSTING : false,
        LEDGER_BALANCE: 0,
        CURRENCY_CODE: 'NGN',
        transactions: [],
        SETTLEMENT_GL_ACCT_NO: SETTLEMENT_GL_ACCT_NO || glAcctNo,
      });

      await newGLAccount.save({ session });
      logger.info('Created new GL account', { GL_ACCT_NO: glAcctNo });

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'CREATE_GL_ACCOUNT',
        USER_ID: CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: {
          GL_ACCT_NO: glAcctNo,
          SETTLEMENT_GL_ACCT_NO: newGLAccount.SETTLEMENT_GL_ACCT_NO,
          GL_ACCT_CAT,
          categoryCode,
          categoryName: newGLAccount.categoryName,
          parentCode,
          level,
          organizationName: trimmedOrgName,
          branchName,
          branchCode,
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: newGLAccount._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created GL account ${glAcctNo} for ${trimmedOrgName}/${branchName}`,
        REFERENCE_NO: `GL-${newGLAccount._id}`,
        ACCOUNT_NO: glAcctNo,
        ADDITIONAL_INFO: {},
        session,
      });

      result = {
        success: true,
        message: 'GL account created successfully',
        data: newGLAccount,
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating GL account', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });
    return res.status(400).json({
      success: false,
      message: 'Error creating GL account',
      error: error.message,
      code: error.message.includes('Missing') || error.message.includes('Invalid') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// Add canPost method to GLAccountSchema
GLAccount.schema.methods.canPost = function (type) {
  if (type === 'DR') return this.DR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  if (type === 'CR') return this.CR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  return false;
};

// Ledger Entry Function
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

      // Post Debit
      debitAccount.LEDGER_BALANCE = (debitAccount.LEDGER_BALANCE || 0) - AMOUNT;
      debitAccount.transactions.push({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        TYPE: 'DEBIT',
        AMOUNT,
        NARRATION,
        CREATED_BY,
        CREATED_AT: new Date(),
      });
      await debitAccount.save({ session });

      // Post Credit
      creditAccount.LEDGER_BALANCE = (creditAccount.LEDGER_BALANCE || 0) + AMOUNT;
      creditAccount.transactions.push({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        TYPE: 'CREDIT',
        AMOUNT,
        NARRATION,
        CREATED_BY,
        CREATED_AT: new Date(),
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

// DYNAMIC GL ACCOUNT FUNCTIONS

// Simplified GL Account Creation using Dynamic Templates
export const createDynamicGLAccount = async (req, res) => {
  logger.info('createDynamicGLAccount hit with body:', { body: req.body });
  
  // Destructure body parameters at the top level to make them available outside transaction scope
  const {
    organizationName,
    branchCode, // Use branchCode directly
    accountType,
    productType,
    CREATED_BY,
    ACCT_DESC,
    GL_ACCT_CAT,
    BAL_CD,
    level = 1 // Default level if not provided
  } = req.body;

  // Early validation
  if (!organizationName || !branchCode || !accountType || !CREATED_BY) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields: organizationName, branchCode, accountType, CREATED_BY',
      code: 'BAD_REQUEST'
    });
  }

  const session = await mongoose.startSession();
  let newGLAccount = null;
  let glAcctNo = null;
  let trimmedOrgNameLocal = null;
  let branchNameLocal = null;
  let categoryCodeLocal = null;
  let categoryNameLocal = null;
  let descriptionLocal = null;
  let success = false; // Track if transaction succeeded
  
  try {
    await session.withTransaction(async () => {
      trimmedOrgNameLocal = organizationName.trim();

      // Infer categoryCode from accountType if not provided
      let categoryCode;
      if (accountType === 'LOAN_ASSET') {
        categoryCode = '200'; // Assets for loans
      } else if (accountType === 'PROCESSING_FEE' || accountType === 'INSURANCE_FEE' || accountType === 'UPFRONT_INTEREST' || accountType === 'OTHER_FEES') {
        categoryCode = '400'; // Income/Fees
      } else if (accountType === 'CUSTOMER_ACCOUNT') {
        categoryCode = '100'; // Customer Deposits (Current Assets)
      } else if (accountType === 'LIABILITY_ACCOUNT' || accountType === 'DEPOSITS_LIABILITY') {
        categoryCode = '300'; // Liabilities (e.g., customer deposits owed)
      } else if (accountType === 'EQUITY_ACCOUNT' || accountType === 'CAPITAL_ACCOUNT') {
        categoryCode = '500'; // Equity/Capital
      } else if (accountType === 'EXPENSE_ACCOUNT' || accountType === 'OPERATING_EXPENSE') {
        categoryCode = '600'; // Expenses
      } else if (accountType === 'REVENUE_ACCOUNT' || accountType === 'INTEREST_INCOME') {
        categoryCode = '700'; // Revenue/Income
      } else if (accountType === 'FIXED_ASSET' || accountType === 'PROPERTY_PLANT_EQUIPMENT') {
        categoryCode = '150'; // Non-Current Assets
      } else {
        categoryCode = GL_ACCT_CAT || '999'; // Default fallback for unknown types
      }
      categoryCodeLocal = categoryCode;

      // Infer categoryName from categoryCode
      const categoryNameMap = {
        '100': 'Current Assets',
        '150': 'Fixed Assets',
        '200': 'Loan Assets',
        '300': 'Liabilities',
        '400': 'Income/Fees',
        '500': 'Equity',
        '600': 'Expenses',
        '700': 'Revenue',
        '999': 'Other'
      };
      const categoryName = categoryNameMap[categoryCode] || 'Unknown Category';
      categoryNameLocal = categoryName;

      // Validate organization
      let organization = await Organization.findOne({
        organizationName: trimmedOrgNameLocal,
      }).session(session);
      
      if (!organization) {
        logger.info('Organization not found, creating new', { organizationName: trimmedOrgNameLocal });
        organization = new Organization({
          organizationName: trimmedOrgNameLocal,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await organization.save({ session });
      }

      // Find branch by code to get branchName
      const branch = await Branch.findOne({
        organizationName: trimmedOrgNameLocal,
        branchCode,
      }).session(session);
      
      if (!branch) {
        throw new Error(`Branch with code "${branchCode}" not found in organization "${trimmedOrgNameLocal}"`);
      }

      branchNameLocal = branch.branchName; // Extract branchName from found branch

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
      descriptionLocal = description;

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

      // Create GL account
      const newGLAccountObject = new GLAccount({
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: await generateNextGLAcctId(session),
        CREATED_BY,
        organizationName: trimmedOrgNameLocal,
        branchName: branchNameLocal,
        branchCode,
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
        CURRENCY_CODE: 'NGN',
        transactions: [],
        SETTLEMENT_GL_ACCT_NO: glAcctNo,
        level: Number(level), // Ensure it's a number
        metadata: {
          accountType,
          productType: productType || null,
          categoryCode,
          categoryName,
          templateGenerated: true,
          dynamicAccount: true
        }
      });

      await newGLAccountObject.save({ session });
      newGLAccount = newGLAccountObject; // Store for response and audit
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

  // Audit trail moved OUTSIDE transaction to avoid blocking response
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
          branchName: branchNameLocal,
          branchCode: branchCode,
          categoryCode: categoryCodeLocal,
          categoryName: categoryNameLocal,
          level: level,
          description: descriptionLocal
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: newGLAccount._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created dynamic GL account ${glAcctNo} for ${accountType} in category ${categoryNameLocal}`,
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
      // Don't fail the main response due to audit timeout - response already sent
    }
  }
};

// Bulk create all dynamic GL accounts for a branch
export const createAllDynamicGLAccountsForBranch = async (req, res) => {
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
            branchName: branch.branchName,
            branchCode,
            ACCT_DESC: templateConfig.description,
            GL_ACCT_CAT: determineCategoryFromAccountType(accountType),
            BAL_CD: determineBalanceCode(accountType),
            TRANSACTION_TYPE: templateConfig.transactionType,
            CR_ALLOWED: determineCreditAllowed(accountType),
            DR_ALLOWED: determineDebitAllowed(accountType),
            REC_ST: 'Active',
            POST_ALLOW: true,
            LEDGER_BALANCE: 0,
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

// Get available GL account templates
export const getGLAccountTemplates = (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      accountTemplates: GL_ACCOUNT_TEMPLATES,
      loanProductTemplates: LOAN_PRODUCT_TEMPLATES
    }
  });
};

// Test endpoint to verify dynamic GL accounts
export const testDynamicGLAccounts = async (req, res) => {
  try {
    const { branchCode } = req.params;
    const { subBranchCode = '001', accountSuffix = '100' } = req.query;
    
    const accounts = getAllGLAccountsForBranch(branchCode, subBranchCode, accountSuffix);
    
    res.status(200).json({
      success: true,
      branchCode,
      subBranchCode,
      accountSuffix,
      accounts,
      message: `Dynamic GL accounts generated for branch ${branchCode}`
    });
  } catch (error) {
    logger.error('Error testing dynamic GL accounts:', error);
    res.status(400).json({
      success: false,
      message: 'Error generating dynamic GL accounts',
      error: error.message
    });
  }
};

// ... (Other functions like processEODGLTransactions, queueGLTransaction, approveGLTransaction, 
// getAllGLAccounts, getGLAccountById, updateGLAccount, deleteGLAccount, etc. remain the same 
// but with BU_ID replaced with branchCode where applicable)


export const processEODGLTransactions = async (session = null) => {
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
          const { GL_ACCT_NO, TRANSACTION_TYPE, AMOUNT, JOURNAL_ID, CREATED_BY, SUB_LEDGER_NO, SEG_NO, ACCT_DESC, BAL_CD, GL_ACCT_CAT, CURRENCY_CODE, EXCHANGE_RATE, REFERENCE_ID, debitAccount, creditAccount } = txn;

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

            const debitCategory = await GLAccountCategory.findOne({
              categoryCode: debitLedger.GL_ACCT_CAT,
              organizationName: debitLedger.organizationName,
              branchName: debitLedger.branchName
            }).session(localSession);
            const creditCategory = await GLAccountCategory.findOne({
              categoryCode: creditLedger.GL_ACCT_CAT,
              organizationName: creditLedger.organizationName,
              branchName: creditLedger.branchName
            }).session(localSession);
            if (!debitCategory || !creditCategory) {
              logger.warn(`Invalid GL_ACCT_CAT for transaction ${txn._id}`, { debitCategory: debitLedger.GL_ACCT_CAT, creditCategory: creditLedger.GL_ACCT_CAT });
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
              logger.warn(`Debit account ${debitLedger.GL_ACCT_NO} does not allow DR transactions`, { transactionId: txn._id });
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
              logger.warn(`Credit account ${creditLedger.GL_ACCT_NO} does not allow CR transactions`, { transactionId: txn._id });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Credit account ${creditLedger.GL_ACCT_NO} does not allow CR transactions`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Credit account ${creditLedger.GL_ACCT_NO} does not allow CR transactions` });
              continue;
            }

            const isDebitAsset = debitCategory.categoryName === 'ASSET' || (await debitCategory.getFullPath()).startsWith('1 - ASSET');
            if (isDebitAsset && (debitLedger.LEDGER_BALANCE || 0) < AMOUNT) {
              logger.warn(`Insufficient funds in debit account ${debitLedger.GL_ACCT_NO}`, { transactionId: txn._id });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Insufficient funds in debit account ${debitLedger.GL_ACCT_NO}`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Insufficient funds in debit account ${debitLedger.GL_ACCT_NO}` });
              continue;
            }

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
            };
            await createLedgerEntry(null, null, debitTransactionData, { session: localSession });

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
            };
            await createLedgerEntry(null, null, creditTransactionData, { session: localSession });

            await addAuditTrail({
              eventId: JOURNAL_ID,
              userId: CREATED_BY || 'system',
              eventType: 'GL_ACCOUNT_TRANSFER',
              action: `Transfer ${AMOUNT} from ${debitLedger.GL_ACCT_NO} to ${creditLedger.GL_ACCT_NO}`,
              oldValue: {
                debitBalance: debitLedger.LEDGER_BALANCE,
                creditBalance: creditLedger.LEDGER_BALANCE,
                debitCategoryPath: await debitCategory.getFullPath(),
                creditCategoryPath: await creditCategory.getFullPath(),
              },
              newValue: {
                debitBalance: debitLedger.LEDGER_BALANCE - AMOUNT,
                creditBalance: creditLedger.LEDGER_BALANCE + AMOUNT,
                debitCategoryPath: await debitCategory.getFullPath(),
                creditCategoryPath: await creditCategory.getFullPath(),
              },
              ipAddress: '127.0.0.1',
              accountNo: `${debitLedger.GL_ACCT_NO}/${creditLedger.GL_ACCT_NO}`,
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
              PROCESSED_AT: new Date(),
              status: 'PROCESSED',
            });
          } else {
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

            const category = await GLAccountCategory.findOne({
              categoryCode: GL_ACCT_CAT || glAccount.GL_ACCT_CAT,
              organizationName: glAccount.organizationName,
              branchName: glAccount.branchName
            }).session(localSession);
            if (!category) {
              logger.warn(`Invalid GL_ACCT_CAT for transaction ${txn._id}`, { GL_ACCT_CAT });
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
              logger.warn(`GL Account ${GL_ACCT_NO} does not have DELAY_GL_POSTING enabled`, { transactionId: txn._id });
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
              logger.warn(`GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions`, { transactionId: txn._id });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions` });
              continue;
            }

            const isAsset = category.categoryName === 'ASSET' || (await category.getFullPath()).startsWith('1 - ASSET');
            if (TRANSACTION_TYPE === 'DR' && isAsset && (glAccount.LEDGER_BALANCE || 0) < AMOUNT) {
              logger.warn(`Insufficient funds in GL Account ${GL_ACCT_NO}`, { transactionId: txn._id });
              bulkOps.push({
                updateOne: {
                  filter: { _id: txn._id },
                  update: { $set: { STATUS: 'FAILED', errorMessage: `Insufficient funds in GL Account ${GL_ACCT_NO}`, processedAt: new Date() } },
                },
              });
              failedTransactions.push({ transactionId: txn._id, reason: `Insufficient funds in GL Account ${GL_ACCT_NO}` });
              continue;
            }

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
            };
            const result = await createLedgerEntry(null, null, transactionData, { session: localSession });

            if (result.queued) {
              logger.warn(`Transaction ${txn._id} was re-queued due to DELAY_GL_POSTING`, { transactionId: txn._id });
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
    logger.error('Error in processEODGLTransactions:', { error: error.message, stack: error.stack });
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

export const queueGLTransaction = async ({ debitData, creditData }, options = {}) => {
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

      // Validate categories
      const debitCategory = await GLAccountCategory.findOne({
        categoryCode: debitData.GL_ACCT_CAT || debitAccount.GL_ACCT_CAT,
        organizationName: debitAccount.organizationName,
        branchName: debitAccount.branchName
      }).session(session);
      const creditCategory = await GLAccountCategory.findOne({
        categoryCode: creditData.GL_ACCT_CAT || creditAccount.GL_ACCT_CAT,
        organizationName: creditAccount.organizationName,
        branchName: creditAccount.branchName
      }).session(session);
      if (!debitCategory || !creditCategory) {
        throw new Error('Invalid GL_ACCT_CAT for debit or credit transaction');
      }

      const journalId = debitData.JOURNAL_ID || generateJournalId();

      // Create debit transaction
      const debitTxn = new PendingGLTransaction({
        ...debitData,
        TRANSACTION_TYPE: 'DR',
        JOURNAL_ID: journalId,
        STATUS: 'Pending',
        TRANSACTION_DATE: new Date(),
        CURRENCY_CODE: debitData.CURRENCY_CODE || 'NGN',
        EXCHANGE_RATE: debitData.EXCHANGE_RATE || 1,
      });

      // Create credit transaction
      const creditTxn = new PendingGLTransaction({
        ...creditData,
        TRANSACTION_TYPE: 'CR',
        JOURNAL_ID: journalId,
        STATUS: 'Pending',
        TRANSACTION_DATE: new Date(),
        CURRENCY_CODE: creditData.CURRENCY_CODE || 'NGN',
        EXCHANGE_RATE: creditData.EXCHANGE_RATE || 1,
      });

      // Save transactions in batch
      await Promise.all([
        debitTxn.save({ session }),
        creditTxn.save({ session }),
      ]);

      // Audit trail
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
        },
        OLD_VALUE: null,
        IP_ADDRESS: '127.0.0.1',
        ENTITY_ID: journalId,
        ENTITY_TYPE: 'PendingGLTransaction',
        session,
      });

      logger.info(`Paired transactions queued for EOD processing: JOURNAL_ID ${journalId}, Debit GL_ACCT_NO: ${debitData.GL_ACCT_NO}, Credit GL_ACCT_NO: ${creditData.GL_ACCT_NO}`);
      return { queued: true, debitTxn, creditTxn };
    });
  } catch (error) {
    logger.error('Error queuing paired GL transactions:', { error: error.message, debitData, creditData });
    throw error;
  } finally {
    if (!options.session) session.endSession();
  }
};

export const approveGLTransaction = async (req, res) => {
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

      const category = await GLAccountCategory.findOne({
        categoryCode: pendingTransaction.GL_ACCT_CAT,
        organizationName: glAccount.organizationName,
        branchName: glAccount.branchName
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
      };

      const result = await createLedgerEntry(null, null, transactionData, { session });

      pendingTransaction.STATUS = 'APPROVED';
      pendingTransaction.APPROVED_BY = APPROVED_BY;
      pendingTransaction.APPROVED_DATE = new Date();
      await pendingTransaction.save({ session });

      await addAuditTrail({
        eventId: journalId,
        userId: APPROVED_BY,
        eventType: 'GL_TRANSACTION_APPROVED',
        action: `Approved GL Transaction for GL_ACCT_NO ${transactionData.GL_ACCT_NO}`,
        oldValue: { STATUS: 'PENDING', CATEGORY_PATH: await category.getFullPath() },
        newValue: { STATUS: 'APPROVED', CATEGORY_PATH: await category.getFullPath() },
        ipAddress: req?.ip || req.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: transactionData.GL_ACCT_NO,
        session,
      });

      logger.info(`Transaction approved: GL_ACCT_NO: ${transactionData.GL_ACCT_NO}, JOURNAL_ID: ${journalId}`);

      await session.commitTransaction();
      transactionCompleted = true;
      return res.status(200).json({
        message: 'Transaction approved and posted successfully',
        transaction: result.transaction,
      });
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error approving GL transaction:', { error: error.message, journalId });
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

export default {
  createGLAccount, 
  createLedgerEntry, 
  createDynamicGLAccount, 
  createAllDynamicGLAccountsForBranch, 
  getGLAccountTemplates, 
  testDynamicGLAccounts, 
  processEODGLTransactions,
  queueGLTransaction, 
  approveGLTransaction 
};