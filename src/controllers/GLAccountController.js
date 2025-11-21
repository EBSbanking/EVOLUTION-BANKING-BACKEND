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
  generateNextGLAcctId,        // ✅ Add this
  generateSimpleGLAcctId       // ✅ Add this
} from '../utils/generateGLANumber.js';
import GLAccountSeg from '../models/GLAccountSeg.js';
import AuditLogger from '../utils/AuditLogger.js'




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


// Helper functions for determining account properties
const determineCategoryFromAccountType = (accountType) => {
  const categoryMap = {
    'PROCESSING_FEE': '400',
    'INSURANCE_FEE': '400', 
    'UPFRONT_INTEREST': '400',
    'OTHER_FEES': '400',
    'CUSTOMER_ACCOUNT': '100',
    'LOAN_ASSET': '200',
    'LIABILITY_ACCOUNT': '300',
    'DEPOSITS_LIABILITY': '300',
    'EQUITY_ACCOUNT': '500',
    'CAPITAL_ACCOUNT': '500',
    'EXPENSE_ACCOUNT': '600',
    'OPERATING_EXPENSE': '600',
    'REVENUE_ACCOUNT': '700',
    'INTEREST_INCOME': '700',
    'FIXED_ASSET': '150',
    'PROPERTY_PLANT_EQUIPMENT': '150',
    'INTER_BRANCH': '800'
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
    'LOAN_ASSET': '200',
    'LIABILITY_ACCOUNT': '300',
    'DEPOSITS_LIABILITY': '300',
    'EQUITY_ACCOUNT': '500',
    'CAPITAL_ACCOUNT': '500',
    'EXPENSE_ACCOUNT': '600',
    'OPERATING_EXPENSE': '600',
    'REVENUE_ACCOUNT': '700',
    'INTEREST_INCOME': '700',
    'FIXED_ASSET': '150',
    'PROPERTY_PLANT_EQUIPMENT': '150',
    'INTER_BRANCH': '800'
  };
  return balanceCodeMap[accountType] || '999';
};

const determineCreditAllowed = (accountType) => {
  return ['PROCESSING_FEE', 'INSURANCE_FEE', 'UPFRONT_INTEREST', 'OTHER_FEES', 'CUSTOMER_ACCOUNT', 'LIABILITY_ACCOUNT', 'DEPOSITS_LIABILITY', 'REVENUE_ACCOUNT', 'INTEREST_INCOME'].includes(accountType);
};

const determineDebitAllowed = (accountType) => {
  return ['LOAN_ASSET', 'CUSTOMER_ACCOUNT', 'EXPENSE_ACCOUNT', 'OPERATING_EXPENSE', 'FIXED_ASSET', 'PROPERTY_PLANT_EQUIPMENT'].includes(accountType);
};

// NEW FUNCTION: Clone GL Accounts for Branch Creation
export const cloneGLAccountsForBranch = async (req, res) => {
  logger.info('cloneGLAccountsForBranch hit with body:', { body: req.body });
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
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

      // Validate required fields
      if (!sourceOrganizationCode || !sourceBranchCode || !targetOrganizationCode || !targetBranchCode || !targetBranchName || !CREATED_BY) {
        throw new Error('Missing required fields: sourceOrganizationCode, sourceBranchCode, targetOrganizationCode, targetBranchCode, targetBranchName, CREATED_BY');
      }

      // Validate source branch exists
      const sourceBranch = await Branch.findOne({
        organizationCode: sourceOrganizationCode,
        branchCode: sourceBranchCode,
      }).session(session);
      
      if (!sourceBranch) {
        throw new Error(`Source branch with code ${sourceBranchCode} not found in organization ${sourceOrganizationCode}`);
      }

      // Validate target organization exists
      const targetOrganization = await Organization.findOne({
        organizationCode: targetOrganizationCode,
      }).session(session);
      
      if (!targetOrganization) {
        throw new Error(`Target organization with code ${targetOrganizationCode} not found`);
      }

      // Check if target branch already exists
      const existingTargetBranch = await Branch.findOne({
        organizationCode: targetOrganizationCode,
        branchCode: targetBranchCode,
      }).session(session);
      
      if (existingTargetBranch) {
        throw new Error(`Target branch with code ${targetBranchCode} already exists in organization ${targetOrganizationCode}`);
      }

      // Get all GL accounts from source branch
      const sourceAccounts = await GLAccount.find({
        organizationCode: sourceOrganizationCode,
        branchCode: sourceBranchCode,
        REC_ST: 'Active'
      }).session(session);

      if (sourceAccounts.length === 0) {
        throw new Error(`No active GL accounts found in source branch ${sourceBranchCode}`);
      }

      // Create target branch
      const newBranch = new Branch({
        organizationName: targetOrganization.organizationName,
        organizationCode: targetOrganizationCode,
        branchName: targetBranchName,
        branchCode: targetBranchCode,
        branchType: targetBranchType,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: CREATED_BY
      });
      await newBranch.save({ session });

      // Clone GL accounts
      const clonedAccounts = [];
      const accountMapping = {}; // Track source -> target account mapping

      for (const sourceAccount of sourceAccounts) {
        // Skip inter-branch accounts if not requested
        if (!cloneInterBranchAccounts && sourceAccount.metadata.accountType === 'INTER_BRANCH') {
          continue;
        }

        // Generate new GL account number with target branch code
        const glAcctNoParts = sourceAccount.GL_ACCT_NO.split('-');
        if (glAcctNoParts.length >= 2) {
          glAcctNoParts[1] = String(targetBranchCode).padStart(3, '0');
        }
        const newGLAccountNo = glAcctNoParts.join('-');

        // Check if account already exists in target branch
        const existingAccount = await GLAccount.findOne({
          GL_ACCT_NO: newGLAccountNo,
          branchCode: targetBranchCode
        }).session(session);

        if (!existingAccount) {
          const newGLAccount = new GLAccount({
            ...sourceAccount.toObject(),
            _id: new mongoose.Types.ObjectId(), // Generate new ID
            GL_ACCT_NO: newGLAccountNo,
            GL_ACCT_ID: await generateNextGLAcctId(session),
            organizationName: targetOrganization.organizationName,
            organizationCode: targetOrganizationCode,
            branchName: targetBranchName,
            branchCode: targetBranchCode,
            branchType: targetBranchType,
            CREATED_BY: CREATED_BY,
            LEDGER_BALANCE: resetBalances ? 0 : sourceAccount.LEDGER_BALANCE,
            AVAILABLE_BALANCE: resetBalances ? 0 : sourceAccount.AVAILABLE_BALANCE,
            transactions: [], // Reset transactions
            metadata: {
              ...sourceAccount.metadata,
              clonedFrom: {
                sourceOrganizationCode,
                sourceBranchCode,
                sourceGLAccountNo: sourceAccount.GL_ACCT_NO,
                clonedAt: new Date()
              },
              branchSpecific: true
            },
            createdAt: new Date(),
            updatedAt: new Date()
          });

          await newGLAccount.save({ session });
          clonedAccounts.push(newGLAccount);
          
          // Store mapping for reference
          accountMapping[sourceAccount.GL_ACCT_NO] = newGLAccountNo;
        }
      }

      // Create inter-branch accounts if requested
      if (cloneInterBranchAccounts) {
        const interBranchAccounts = await createInterBranchAccounts(
          targetOrganizationCode, 
          targetBranchCode, 
          targetBranchName, 
          CREATED_BY, 
          session
        );
        clonedAccounts.push(...interBranchAccounts);
      }

      // Audit trail for branch cloning
      await addAuditTrail({
        EVENT_TYPE: 'CLONE_BRANCH_GL_ACCOUNTS',
        USER_ID: CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: {
          sourceOrganizationCode,
          sourceBranchCode,
          targetOrganizationCode,
          targetBranchCode,
          targetBranchName,
          accountsCloned: clonedAccounts.length,
          resetBalances,
          cloneInterBranchAccounts,
          accountMapping
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: newBranch._id,
        ENTITY_TYPE: 'Branch',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Cloned ${clonedAccounts.length} GL accounts from branch ${sourceBranchCode} to new branch ${targetBranchCode}`,
        REFERENCE_NO: `CLONE-${newBranch._id}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {},
        session,
      });

      return res.status(201).json({
        success: true,
        message: `Successfully cloned ${clonedAccounts.length} GL accounts to new branch ${targetBranchCode}`,
        data: {
          newBranch,
          clonedAccounts: clonedAccounts.map(acc => ({
            GL_ACCT_NO: acc.GL_ACCT_NO,
            ACCT_DESC: acc.ACCT_DESC,
            metadata: acc.metadata
          })),
          accountMapping
        }
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error cloning GL accounts for branch', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });
    
    return res.status(400).json({
      success: false,
      message: 'Error cloning GL accounts for branch',
      error: error.message,
      code: error.message.includes('Missing') || error.message.includes('not found') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// NEW FUNCTION: Create Inter-Branch Accounts
const createInterBranchAccounts = async (organizationCode, branchCode, branchName, CREATED_BY, session) => {
  const interBranchAccounts = [];
  const interBranchTypes = ['INTER_BRANCH'];
  
  for (const accountType of interBranchTypes) {
    const templateConfig = GL_ACCOUNT_TEMPLATES[accountType];
    if (!templateConfig) continue;

    const glAcctNo = generateGLAccount(templateConfig.template, branchCode, '001', '800');
    
    const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
    if (!existingAccount) {
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
          interBranch: true
        }
      });

      await newGLAccount.save({ session });
      interBranchAccounts.push(newGLAccount);
    }
  }
  
  return interBranchAccounts;
};


// UPDATED: createGLAccount function with fixed audit trail
export const createGLAccount = async (req, res) => {
  logger.info('createGLAccount hit with body:', { body: req.body });
  const session = await mongoose.startSession();
  let result;
  
  console.log('=== STARTING TRANSACTION ===');
  
  try {
    await session.withTransaction(async () => {
      console.log('=== INSIDE TRANSACTION ===');
      
      try {
        // STEP 1: Parse and validate required fields
        console.log('=== STEP 1: Parsing fields ===');
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

        console.log('=== DEBUG: Critical fields ===');
        console.log('CHART_OF_ACCT_ID:', CHART_OF_ACCT_ID);
        console.log('ACCT_DESC:', ACCT_DESC);
        console.log('LEDGER_NO:', LEDGER_NO);
        console.log('GL_ACCT_CAT:', GL_ACCT_CAT);
        console.log('BAL_CD:', BAL_CD);
        console.log('SUB_LEDGER_NO:', SUB_LEDGER_NO);

        // Validate required fields
        console.log('=== STEP 2: Validating required fields ===');
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
        console.log('✅ All required fields present');

        // STEP 2: Organization handling
        console.log('=== STEP 3: Organization handling ===');
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
          console.log('Creating new organization');
          organization = new Organization({
            organizationName: trimmedOrgName,
            organizationCode: orgCode,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await organization.save({ session });
          console.log('✅ Organization created:', organization._id);
        } else {
          console.log('✅ Organization found:', organization._id);
        }

        // STEP 3: Branch handling
        console.log('=== STEP 4: Branch handling ===');
        let branch = await Branch.findOne({
          organizationCode: orgCode,
          branchCode,
        }).session(session);

        if (!branch) {
          console.log('Creating new branch');
          
          const branchData = {
            organizationName: trimmedOrgName,
            organizationCode: orgCode,
            branchName: branchName.trim().toUpperCase(),
            branchCode: branchCode.trim(),
            branchType: 'MAIN',
            address: `${trimmedOrgName} ${branchName} Address`,
            status: 'ACTIVE'
          };

          console.log('Creating branch with data:', branchData);

          // Validate branch code format
          if (!/^\d{3}$/.test(branchCode)) {
            throw new Error('Branch code must be a 3-digit number');
          }

          branch = new Branch(branchData);
          await branch.save({ session });
          console.log('✅ Branch created:', branch._id);

          // FIXED: Branch audit trail with simple direct approach
          console.log('=== STEP 4a: Creating branch audit trail ===');
          try {
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
            console.log('✅ Branch audit trail created');
          } catch (auditError) {
            console.error('❌ Branch audit trail failed:', auditError.message);
            // Don't throw - continue with GL Account creation
          }
        } else {
          console.log('✅ Branch found:', branch._id);
        }

        // STEP 4: Generate GL Account Number
        console.log('=== STEP 5: Generating GL Account Number ===');
        const glAcctNo = [
          String(CHART_OF_ACCT_ID).padStart(2, '0'),
          String(branchCode).padStart(3, '0'),
          String(BAL_CD).padStart(3, '0'),
          String(GL_ACCT_CAT).padStart(3, '0'),
          String(LEDGER_NO).padStart(3, '0'),
          String(branchCode).padStart(3, '0'),
        ].join('-');

        console.log('✅ Generated GL_ACCT_NO:', glAcctNo);

        // STEP 5: Check for duplicates
        console.log('=== STEP 6: Checking for duplicates ===');
        const existingAccount = await GLAccount.findOne({ 
          GL_ACCT_NO: glAcctNo 
        }).session(session);

        if (existingAccount) {
          throw new Error(`GL account ${glAcctNo} already exists`);
        }
        console.log('✅ No duplicate found');

        // STEP 6: Generate GL Account ID
        console.log('=== STEP 7: Generating GL Account ID ===');
        let glAcctId;
        try {
          console.log('Calling generateNextGLAcctId...');
          glAcctId = await generateNextGLAcctId(session);
          console.log('✅ GL_ACCT_ID generated:', glAcctId);
        } catch (error) {
          console.log('❌ generateNextGLAcctId failed:', error.message);
          console.log('Falling back to simple ID generation...');
          const count = await GLAccount.countDocuments().session(session);
          glAcctId = String(count + 1).padStart(7, '0');
          console.log('✅ Fallback GL_ACCT_ID:', glAcctId);
        }

        // STEP 7: Create GL Account
        console.log('=== STEP 8: Creating GL Account object ===');
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

        console.log('GL Account data prepared with required fields:', {
          subfolderId: glAccountData.subfolderId,
          metadata: glAccountData.metadata
        });

        const newGLAccount = new GLAccount(glAccountData);
        
        // Validate before saving
        console.log('=== STEP 9: Validating GL Account ===');
        const validationError = newGLAccount.validateSync();
        if (validationError) {
          console.log('❌ Validation errors:', validationError.errors);
          throw new Error(`GL Account validation failed: ${validationError.message}`);
        }
        console.log('✅ GL Account validation passed');

        console.log('=== STEP 10: Saving GL Account ===');
        await newGLAccount.save({ session });
        console.log('✅ GL Account saved successfully:', newGLAccount._id);

        // STEP 8: Create GL Account Segment (OPTIONAL - REMOVED FOR NOW)
        console.log('=== STEP 11: Skipping GL Account Segment (optional) ===');

        // STEP 9: GL Account audit trail
        console.log('=== STEP 12: Creating GL Account audit trail ===');
        try {
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
            IP_ADDRESS: req.ip || '127.0.0.1',
            ENTITY_ID: newGLAccount._id,
            ENTITY_TYPE: 'GLAccount',
            STATUS: 'SUCCESS',
            DESCRIPTION: `Created GL account ${glAcctNo} - ${ACCT_DESC}`,
            REFERENCE_NO: `GL-${newGLAccount._id}`,
            ACCOUNT_NO: glAcctNo
          }, session);
          console.log('✅ GL Account audit trail created');
        } catch (auditError) {
          console.error('❌ GL Account audit trail failed:', auditError.message);
          // Don't throw - continue with success response
        }

        console.log('🎉 TRANSACTION COMPLETED SUCCESSFULLY 🎉');
        
        // Set the result
        result = {
          success: true,
          message: 'GL account created successfully',
          data: newGLAccount,
        };

      } catch (innerError) {
        console.error('❌ INNER TRANSACTION ERROR:', innerError.message);
        console.error('Inner error stack:', innerError.stack);
        throw innerError;
      }
    });

    // If we get here, transaction was committed successfully
    console.log('=== TRANSACTION COMMITTED ===');
    return res.status(201).json(result);

  } catch (error) {
    console.error('❌ TRANSACTION FAILED:', error.message);
    console.error('Error stack:', error.stack);
    
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
    console.log('=== SESSION ENDED ===');
  }
};

// SIMPLE AUDIT FUNCTION - Add this to the same file as createGLAccount
const simpleAudit = async (data, session = null) => {
  try {
    const AuditTrail = mongoose.model('AuditTrail');
    
    // Generate event_id
    let event_id;
    try {
      const lastAudit = await AuditTrail.findOne().sort({ event_id: -1 });
      event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
    } catch (error) {
      event_id = Date.now();
    }

    console.log('🔍 Creating simple audit:', {
      EVENT_TYPE: data.EVENT_TYPE,
      USER_ID: data.USER_ID,
      ENTITY_TYPE: data.ENTITY_TYPE
    });

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
    
    console.log('✅ Simple audit created successfully:', data.EVENT_TYPE);
    return audit;
  } catch (error) {
    console.error('❌ Simple audit failed:', error.message);
    return null;
  }
};

// UPDATED: createDynamicGLAccount function with new schema support
export const createDynamicGLAccount = async (req, res) => {
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
  let categoryCodeLocal = null;
  let categoryNameLocal = null;
  let descriptionLocal = null;
  let success = false;

  try {
    await session.withTransaction(async () => {
      trimmedOrgNameLocal = organizationName.trim();

      // Infer categoryCode from accountType
      const categoryCode = determineCategoryFromAccountType(accountType);
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
        '800': 'Inter-Branch',
        '999': 'Other'
      };
      const categoryName = categoryNameMap[categoryCode] || 'Unknown Category';
      categoryNameLocal = categoryName;

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
          categoryName,
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
          categoryCode: categoryCodeLocal,
          categoryName: categoryNameLocal,
          level: level,
          description: descriptionLocal,
          metadata: newGLAccount.metadata
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
export const getBranchGLAccountSummary = async (req, res) => {
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
export const getOrganizationGLAccounts = async (req, res) => {
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

// Add these to your GLAccountController.js

// NEW FUNCTION: Get Inter-Branch Accounts
export const getInterBranchAccounts = async (req, res) => {
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
export const searchGLAccounts = async (req, res) => {
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
export const getAllGLAccounts = async (req, res) => {
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
export const getGLAccountById = async (req, res) => {
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
export const updateGLAccount = async (req, res) => {
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
export const updateGLAccountStatus = async (req, res) => {
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
export const deleteGLAccount = async (req, res) => {
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

// ... (Other functions like processEODGLTransactions, queueGLTransaction, approveGLTransaction, 
// getAllGLAccounts, getGLAccountById, updateGLAccount, deleteGLAccount would also be updated 
// with branchCode and organizationCode support)

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


export default {
  // Account Creation
  createGLAccount, 
  createDynamicGLAccount, 
  createAllDynamicGLAccountsForBranch, // ADD THIS
  cloneGLAccountsForBranch,
  
  // Branch Management
  getBranchGLAccountSummary, 
  getOrganizationGLAccounts,
  getInterBranchAccounts,

  
  // // Templates & Testing
  // getGLAccountTemplates, 
  // testDynamicGLAccounts,
  
  // Transaction Processing
  createLedgerEntry, 
  queueGLTransaction, 
  approveGLTransaction,
  processEODGLTransactions,
  
  // Account Management
  getAllGLAccounts,
  searchGLAccounts,
  getGLAccountById,
  updateGLAccount,
  updateGLAccountStatus,
  deleteGLAccount
};
