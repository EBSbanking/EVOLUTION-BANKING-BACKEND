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
import AuditLogger from '../utils/AuditLogger.js'

// Add these utility functions before your createInterBranchAccounts function


// // Determine GL account category based on account type
// const determineCategoryFromAccountType = (accountType) => {
//   const categoryMap = {
//     'INTER_BRANCH': 'ASSET',
//     'INTER_BRANCH_PAYABLE': 'LIABILITY',
//     'INTER_BRANCH_RECEIVABLE': 'ASSET'
//   };
//   return categoryMap[accountType] || 'ASSET';
// };

// // Determine balance code (D for Debit, C for Credit)
// const determineBalanceCode = (accountType) => {
//   const balanceCodeMap = {
//     'INTER_BRANCH': 'D',
//     'INTER_BRANCH_PAYABLE': 'C',
//     'INTER_BRANCH_RECEIVABLE': 'D'
//   };
//   return balanceCodeMap[accountType] || 'D';
// };

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

// // GL Account Templates Configuration
// const GL_ACCOUNT_TEMPLATES = {
//   'INTER_BRANCH': {
//     template: 'GL-{branch}-{dept}-{product}-{seq}',
//     description: 'Inter-Branch Settlement Account',
//     transactionType: 'BOTH'
//   },
//   'INTER_BRANCH_PAYABLE': {
//     template: 'GL-{branch}-{dept}-{product}-{seq}',
//     description: 'Inter-Branch Payable Account',
//     transactionType: 'CREDIT'
//   },
//   'INTER_BRANCH_RECEIVABLE': {
//     template: 'GL-{branch}-{dept}-{product}-{seq}',
//     description: 'Inter-Branch Receivable Account',
//     transactionType: 'DEBIT'
//   }
// };

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

// // Generate Next GL Account ID (make sure this exists)
// const generateNextGLAcctId = async (session) => {
//   try {
//     // Find the highest GL_ACCT_ID and increment
//     const lastAccount = await GLAccount.findOne()
//       .sort({ GL_ACCT_ID: -1 })
//       .session(session)
//       .select('GL_ACCT_ID');
    
//     if (!lastAccount || !lastAccount.GL_ACCT_ID) {
//       return 1000; // Starting ID
//     }
    
//     return lastAccount.GL_ACCT_ID + 1;
//   } catch (error) {
//     logger.error('Error generating next GL account ID', { error: error.message });
//     throw new Error('Failed to generate GL account ID');
//   }
// };

// Utility: Generate Transaction ID (you already have this)
const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  const transactionId = base + random;
  logger.info('Generated Transaction ID', { transactionId });
  return transactionId;
};

///////////////////////////////////////////////////
// COA HELPER FUNCTIONS
///////////////////////////////////////////////////

const generateCOAAccountNumber = ({ organizationCode, branchCode, accountClass, accountType, subAccount = '000' }) => {
  const segments = [
    String(organizationCode).padStart(2, '0'),
    String(branchCode).padStart(3, '0'),
    getAccountClassCode(accountClass),
    getAccountTypeCode(accountType),
    subAccount.padStart(3, '0')
  ];
  
  return segments.join('-');
};

const getAccountClassCode = (accountClass) => {
  const classMap = {
    'ASSET': '100',
    'LIABILITY': '200', 
    'EQUITY': '300',
    'REVENUE': '400',
    'EXPENSE': '500'
  };
  return classMap[accountClass] || '999';
};

const getAccountTypeCode = (accountType) => {
  const typeMap = {
    // Assets
    'CURRENT_ASSET': '001',
    'FIXED_ASSET': '002',
    'INTANGIBLE_ASSET': '003',
    'LOAN_ASSET': '004',
    'OTHER_ASSET': '005',
    
    // Liabilities
    'CURRENT_LIABILITY': '101',
    'LONG_TERM_LIABILITY': '102',
    'DEPOSITS_LIABILITY': '103',
    'OTHER_LIABILITY': '104',
    
    // Equity
    'SHARE_CAPITAL': '201',
    'RETAINED_EARNINGS': '202',
    'OTHER_EQUITY': '203',
    
    // Revenue
    'OPERATING_REVENUE': '301',
    'INTEREST_INCOME': '302',
    'FEE_INCOME': '303',
    'OTHER_REVENUE': '304',
    
    // Expenses
    'OPERATING_EXPENSE': '401',
    'ADMINISTRATIVE_EXPENSE': '402',
    'FINANCE_COST': '403',
    'OTHER_EXPENSE': '404'
  };
  return typeMap[accountType] || '999';
};

const mapToFinancialStatementCategory = (accountClass, accountType) => {
  if (['ASSET', 'LIABILITY', 'EQUITY'].includes(accountClass)) {
    return 'BALANCE_SHEET';
  } else if (['REVENUE', 'EXPENSE'].includes(accountClass)) {
    return 'INCOME_STATEMENT';
  }
  return 'BALANCE_SHEET';
};

const mapToFinancialStatementSubCategory = (accountClass, accountType) => {
  const mapping = {
    'ASSET': {
      'CURRENT_ASSET': 'CURRENT_ASSETS',
      'FIXED_ASSET': 'FIXED_ASSETS',
      'INTANGIBLE_ASSET': 'INTANGIBLE_ASSETS',
      'LOAN_ASSET': 'OTHER_ASSETS',
      'OTHER_ASSET': 'OTHER_ASSETS'
    },
    'LIABILITY': {
      'CURRENT_LIABILITY': 'CURRENT_LIABILITIES',
      'LONG_TERM_LIABILITY': 'LONG_TERM_LIABILITIES',
      'DEPOSITS_LIABILITY': 'CURRENT_LIABILITIES',
      'OTHER_LIABILITY': 'OTHER_LIABILITIES'
    },
    'EQUITY': {
      'SHARE_CAPITAL': 'SHARE_CAPITAL',
      'RETAINED_EARNINGS': 'RETAINED_EARNINGS',
      'OTHER_EQUITY': 'OTHER_EQUITY'
    },
    'REVENUE': {
      'OPERATING_REVENUE': 'OPERATING_REVENUE',
      'INTEREST_INCOME': 'OTHER_REVENUE',
      'FEE_INCOME': 'OPERATING_REVENUE',
      'OTHER_REVENUE': 'OTHER_REVENUE'
    },
    'EXPENSE': {
      'OPERATING_EXPENSE': 'OPERATING_EXPENSES',
      'ADMINISTRATIVE_EXPENSE': 'ADMINISTRATIVE_EXPENSES',
      'FINANCE_COST': 'FINANCE_COSTS',
      'OTHER_EXPENSE': 'OTHER_EXPENSES'
    }
  };
  
  return mapping[accountClass]?.[accountType] || 'OTHER_ASSETS';
};

const mapToInternalAccountType = (accountClass, accountType) => {
  const mapping = {
    'ASSET': {
      'LOAN_ASSET': 'LOAN_ASSET',
      'FIXED_ASSET': 'FIXED_ASSET',
      'CURRENT_ASSET': 'CUSTOMER_ACCOUNT'
    },
    'LIABILITY': {
      'DEPOSITS_LIABILITY': 'DEPOSITS_LIABILITY',
      'CURRENT_LIABILITY': 'LIABILITY_ACCOUNT'
    },
    'EQUITY': {
      'SHARE_CAPITAL': 'CAPITAL_ACCOUNT',
      'RETAINED_EARNINGS': 'EQUITY_ACCOUNT'
    },
    'REVENUE': {
      'INTEREST_INCOME': 'INTEREST_INCOME',
      'FEE_INCOME': 'REVENUE_ACCOUNT',
      'OPERATING_REVENUE': 'REVENUE_ACCOUNT'
    },
    'EXPENSE': {
      'OPERATING_EXPENSE': 'EXPENSE_ACCOUNT',
      'ADMINISTRATIVE_EXPENSE': 'OPERATING_EXPENSE',
      'FINANCE_COST': 'EXPENSE_ACCOUNT'
    }
  };
  
  return mapping[accountClass]?.[accountType] || 'CUSTOMER_ACCOUNT';
};

const determineAccountLevel = (isControlAccount, parentAccountNo) => {
  if (!parentAccountNo && isControlAccount) return 1;
  if (parentAccountNo && isControlAccount) return 2;
  if (parentAccountNo && !isControlAccount) return 3;
  return 4;
};

// COA-ALIGNED GL ACCOUNT CREATION
export const createCOAAlignedGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      const {
        organizationCode,
        organizationName,
        branchCode,
        branchName,
        accountClass,
        accountType,
        accountName,
        normalBalance,
        parentAccountNo,
        isControlAccount = false,
        subAccount = '000',
        level,
        CREATED_BY,
        metadata = {}
      } = req.body;

      // Validate required fields
      if (!organizationCode || !branchCode || !accountClass || !accountType || !accountName || !normalBalance || !CREATED_BY) {
        throw new Error('Missing required fields: organizationCode, branchCode, accountClass, accountType, accountName, normalBalance, CREATED_BY');
      }

      // Validate organization and branch
      const organization = await Organization.findOne({ organizationCode }).session(session);
      if (!organization) {
        throw new Error(`Organization with code ${organizationCode} not found`);
      }

      const branch = await Branch.findOne({ organizationCode, branchCode }).session(session);
      if (!branch) {
        throw new Error(`Branch with code ${branchCode} not found in organization ${organizationCode}`);
      }

      // Generate COA-compliant account number
      const glAcctNo = generateCOAAccountNumber({
        organizationCode,
        branchCode,
        accountClass,
        accountType,
        subAccount
      });

      // Check for duplicate account
      const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
      if (existingAccount) {
        throw new Error(`GL account ${glAcctNo} already exists`);
      }

      // Determine COA structure
      const financialStatementType = mapToFinancialStatementCategory(accountClass, accountType);
      const financialStatementCategory = mapToFinancialStatementSubCategory(accountClass, accountType);
      const internalAccountType = mapToInternalAccountType(accountClass, accountType);
      const accountLevel = level || determineAccountLevel(isControlAccount, parentAccountNo);

      // Generate GL Account ID
      const glAcctId = await generateNextGLAcctId(session);

      // Create COA-aligned GL Account
      const newGLAccount = new GLAccount({
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: glAcctId,
        CREATED_BY,
        
        // Organization & Branch
        organizationName: organizationName || organization.organizationName,
        organizationCode,
        branchName: branchName || branch.branchName,
        branchCode,
        branchType: branch.branchType,
        
        // Account Description
        ACCT_DESC: accountName,
        
        // COA Structure
        coaStructure: {
          segments: {
            entity: String(organizationCode).padStart(2, '0'),
            branch: String(branchCode).padStart(3, '0'),
            accountClass: getAccountClassCode(accountClass),
            accountType: getAccountTypeCode(accountType),
            subAccount: subAccount.padStart(3, '0')
          },
          financialStatement: {
            type: financialStatementType,
            category: financialStatementCategory,
            subCategory: `${accountClass}_${accountType}`
          },
          hierarchy: {
            level: accountLevel,
            parentAccountNo: parentAccountNo || null,
            isControlAccount,
            isSummaryAccount: isControlAccount,
            childAccounts: []
          },
          accounting: {
            normalBalance,
            balanceType: accountClass,
            isTemporary: ['REVENUE', 'EXPENSE'].includes(accountClass),
            isPermanent: ['ASSET', 'LIABILITY', 'EQUITY'].includes(accountClass),
            requiresClosing: ['REVENUE', 'EXPENSE'].includes(accountClass)
          }
        },
        
        // Account Structure (legacy fields for compatibility)
        categoryCode: getAccountClassCode(accountClass),
        categoryName: `${accountClass} - ${accountType}`,
        level: accountLevel,
        LEDGER_NO: '001',
        SUB_LEDGER_NO: '000',
        CHART_OF_ACCT_ID: '001',
        GL_ACCT_CAT: getAccountClassCode(accountClass),
        BAL_CD: getAccountClassCode(accountClass),
        subfolderId: `COA_${organizationCode}_${branchCode}`,
        
        // Transaction Controls
        JOURNAL_ID: `JRN-COA-${Date.now()}`,
        TRANSACTION_TYPE: `${accountClass} Balance`,
        CR_ALLOWED: normalBalance === 'CREDIT',
        DR_ALLOWED: normalBalance === 'DEBIT',
        REC_ST: 'Active',
        POST_ALLOW: true,
        
        // Balances
        LEDGER_BALANCE: 0,
        AVAILABLE_BALANCE: 0,
        OPENING_BALANCE: 0,
        CURRENT_BALANCE: 0,
        CURRENCY_CODE: 'NGN',
        
        // Metadata
        metadata: {
          accountType: internalAccountType,
          coaCompliant: true,
          templateGenerated: false,
          dynamicAccount: true,
          branchSpecific: true,
          consolidationRequired: !isControlAccount,
          ...metadata
        }
      });

      await newGLAccount.save({ session });

      // If this is a child account, update parent account
      if (parentAccountNo) {
        const parentAccount = await GLAccount.findOne({ GL_ACCT_NO: parentAccountNo }).session(session);
        if (parentAccount) {
          if (!parentAccount.coaStructure.hierarchy.childAccounts.includes(glAcctNo)) {
            parentAccount.coaStructure.hierarchy.childAccounts.push(glAcctNo);
            await parentAccount.save({ session });
          }
        }
      }

      // Audit trail - CORRECTED PARAMETERS
      await addAuditTrail({
        event_type: 'CREATE_COA_ALIGNED_ACCOUNT',
        user_id: CREATED_BY,
        action: 'CREATE',
        new_value: {
          GL_ACCT_NO: glAcctNo,
          accountClass,
          accountType,
          financialStatement: financialStatementType,
          normalBalance,
          isControlAccount,
          parentAccountNo
        },
        old_value: null,
        ip_address: req.ip || '0.0.0.0',
        entity_id: newGLAccount._id,
        entity_type: 'GLAccount',
        status: 'SUCCESS',
        description: `Created COA-aligned account ${glAcctNo} - ${accountName}`,
        reference_no: `COA-${newGLAccount._id}`,
        account_no: glAcctNo,
        additional_info: {},
        session,
      });

      return res.status(201).json({
        success: true,
        message: 'COA-aligned GL account created successfully',
        data: newGLAccount
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
      code: error.message.includes('Missing') || error.message.includes('not found') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// MIGRATE EXISTING ACCOUNTS TO COA STRUCTURE
export const migrateToCOAStructure = async (req, res) => {
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
        IP_ADDRESS: req.ip || '0.0.0.0',
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

///////////////////////////////////////////////////
// LEGACY ACCOUNT PROPERTY DETERMINATION (for backward compatibility)
///////////////////////////////////////////////////

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


///////////////////////////////////////////////////
// CORE GL ACCOUNT FUNCTIONS
///////////////////////////////////////////////////

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
export const createGLAccount = async (req, res) => {
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
        IP_ADDRESS: req.ip || '127.0.0.1',
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



// Add this debug function at the top
const debugSession = async () => {
  try {
    console.log('=== DEBUG SESSION START ===');
    console.log('Mongoose version:', mongoose.version);
    console.log('Mongoose connection state:', mongoose.connection.readyState);
    
    const session = await mongoose.startSession();
    console.log('Session created successfully');
    console.log('Session type:', typeof session);
    console.log('Session constructor:', session.constructor.name);
    console.log('Session methods:', Object.keys(session).filter(key => typeof session[key] === 'function'));
    console.log('Has startTransaction:', typeof session.startTransaction);
    console.log('Has withTransaction:', typeof session.withTransaction);
    console.log('Has commitTransaction:', typeof session.commitTransaction);
    console.log('Has abortTransaction:', typeof session.abortTransaction);
    console.log('Has endSession:', typeof session.endSession);
    
    await session.endSession();
    console.log('Session ended successfully');
    console.log('=== DEBUG SESSION END ===');
    return true;
  } catch (error) {
    console.error('Session debug error:', error);
    console.error('Error stack:', error.stack);
    return false;
  }
};

// Call the debug function when the module loads
debugSession().then(result => {
  console.log('=== SESSION DEBUG RESULT ===');
  console.log('Session test passed:', result);
}).catch(err => {
  console.error('=== SESSION DEBUG FAILED ===');
  console.error('Session test error:', err);
});

export const cloneGLAccountsForBranch = async (req, res) => {
  console.log('🚀 CLONE BRANCH - STARTING (NO SESSIONS)');
  
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

    console.log('📝 Request data:', {
      sourceOrganizationCode,
      sourceBranchCode,
      targetOrganizationCode,
      targetBranchCode,
      targetBranchName
    });

    // Validate required fields
    const missingFields = [];
    if (!sourceOrganizationCode) missingFields.push('sourceOrganizationCode');
    if (!sourceBranchCode) missingFields.push('sourceBranchCode');
    if (!targetOrganizationCode) missingFields.push('targetOrganizationCode');
    if (!targetBranchCode) missingFields.push('targetBranchCode');
    if (!targetBranchName) missingFields.push('targetBranchName');
    if (!CREATED_BY) missingFields.push('CREATED_BY');

    if (missingFields.length > 0) {
      console.log('❌ Missing fields:', missingFields);
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    console.log('✅ All required fields present');

    // Validate source branch exists
    console.log('🔍 Checking source branch...');
    const sourceBranch = await Branch.findOne({
      organizationCode: sourceOrganizationCode,
      branchCode: sourceBranchCode,
    });
    
    if (!sourceBranch) {
      console.log('❌ Source branch not found');
      return res.status(404).json({
        success: false,
        message: `Source branch ${sourceBranchCode} not found in organization ${sourceOrganizationCode}`
      });
    }
    console.log('✅ Source branch found:', sourceBranch.branchName);

    // Validate target organization exists
    console.log('🔍 Checking target organization...');
    const targetOrganization = await Organization.findOne({
      organizationCode: targetOrganizationCode,
    });
    
    if (!targetOrganization) {
      console.log('❌ Target organization not found');
      return res.status(404).json({
        success: false,
        message: `Target organization ${targetOrganizationCode} not found`
      });
    }
    console.log('✅ Target organization found:', targetOrganization.organizationName);

    // Check if target branch already exists
    console.log('🔍 Checking if target branch already exists...');
    const existingTargetBranch = await Branch.findOne({
      organizationCode: targetOrganizationCode,
      branchCode: targetBranchCode,
    });
    
    if (existingTargetBranch) {
      console.log('❌ Target branch already exists');
      return res.status(409).json({
        success: false,
        message: `Target branch ${targetBranchCode} already exists in organization ${targetOrganizationCode}`
      });
    }
    console.log('✅ Target branch code is available');

    // Get all GL accounts from source branch
    console.log('📋 Fetching source GL accounts...');
    const sourceAccounts = await GLAccount.find({
      organizationCode: sourceOrganizationCode,
      branchCode: sourceBranchCode,
      REC_ST: 'Active'
    });

    console.log(`📊 Found ${sourceAccounts.length} source accounts`);

    if (sourceAccounts.length === 0) {
      console.log('❌ No active GL accounts found');
      return res.status(404).json({
        success: false,
        message: `No active GL accounts found in source branch ${sourceBranchCode}`
      });
    }

    // Create target branch
    console.log('🏢 Creating target branch...');
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
    
    await newBranch.save();
    console.log('✅ Target branch created:', newBranch.branchCode);

    // Clone GL accounts
    console.log('🔄 Cloning GL accounts...');
    const clonedAccounts = [];
    const accountMapping = {};

    // Get the highest GL_ACCT_ID to start from
    console.log('🔢 Getting next GL Account ID...');
    const lastAccount = await GLAccount.findOne()
      .sort({ GL_ACCT_ID: -1 })
      .select('GL_ACCT_ID')
      .lean();

    let nextGLAccountId = lastAccount && lastAccount.GL_ACCT_ID 
      ? parseInt(lastAccount.GL_ACCT_ID) + 1 
      : 1000;

    console.log(`🔢 Starting GL Account ID: ${nextGLAccountId}`);

    let skippedAccounts = 0;
    let createdAccounts = 0;

    for (const sourceAccount of sourceAccounts) {
      // Skip inter-branch accounts if not requested
      if (!cloneInterBranchAccounts && sourceAccount.metadata?.accountType === 'INTER_BRANCH') {
        console.log(`⏭️ Skipping inter-branch account: ${sourceAccount.GL_ACCT_NO}`);
        skippedAccounts++;
        continue;
      }

      // Generate new GL account number with target branch code
      const glAcctNoParts = sourceAccount.GL_ACCT_NO.split('-');
      if (glAcctNoParts.length >= 2) {
        glAcctNoParts[1] = String(targetBranchCode).padStart(3, '0');
      }
      const newGLAccountNo = glAcctNoParts.join('-');

      // Check if account already exists (just in case)
      const existingAccount = await GLAccount.findOne({
        GL_ACCT_NO: newGLAccountNo,
        branchCode: targetBranchCode
      });

      if (existingAccount) {
        console.log(`⏭️ Account already exists, skipping: ${newGLAccountNo}`);
        skippedAccounts++;
        continue;
      }

      // Create new GL account
      try {
        const newGLAccount = new GLAccount({
          ...sourceAccount.toObject(),
          _id: new mongoose.Types.ObjectId(), // Generate new ID
          GL_ACCT_NO: newGLAccountNo,
          GL_ACCT_ID: nextGLAccountId,
          organizationName: targetOrganization.organizationName,
          organizationCode: targetOrganizationCode,
          branchName: targetBranchName,
          branchCode: targetBranchCode,
          branchType: targetBranchType,
          CREATED_BY: CREATED_BY,
          LEDGER_BALANCE: resetBalances ? 0 : (sourceAccount.LEDGER_BALANCE || 0),
          AVAILABLE_BALANCE: resetBalances ? 0 : (sourceAccount.AVAILABLE_BALANCE || 0),
          transactions: [],
          metadata: {
            ...(sourceAccount.metadata || {}),
            clonedFrom: {
              sourceOrganizationCode,
              sourceBranchCode,
              sourceGLAccountNo: sourceAccount.GL_ACCT_NO,
              sourceAccountId: sourceAccount._id,
              clonedAt: new Date()
            },
            branchSpecific: true
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });

        await newGLAccount.save();
        clonedAccounts.push(newGLAccount);
        accountMapping[sourceAccount.GL_ACCT_NO] = newGLAccountNo;
        
        console.log(`✅ Created: ${newGLAccountNo} (ID: ${nextGLAccountId})`);
        
        nextGLAccountId++;
        createdAccounts++;

      } catch (accountError) {
        console.error(`❌ Failed to create account ${newGLAccountNo}:`, accountError.message);
        // Continue with other accounts even if one fails
      }
    }

    console.log(`🎉 Cloning completed!`);
    console.log(`📊 Results: ${createdAccounts} created, ${skippedAccounts} skipped`);

    // Create simple audit trail
    try {
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
          accountsCloned: createdAccounts,
          accountsSkipped: skippedAccounts,
          resetBalances,
          cloneInterBranchAccounts
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: newBranch._id,
        ENTITY_TYPE: 'Branch',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Cloned ${createdAccounts} GL accounts from ${sourceBranchCode} to ${targetBranchCode}`,
        REFERENCE_NO: `CLONE-${Date.now()}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {},
      });
      console.log('📝 Audit trail created');
    } catch (auditError) {
      console.warn('⚠️ Audit trail creation failed:', auditError.message);
    }

    return res.status(201).json({
      success: true,
      message: `Successfully cloned ${createdAccounts} GL accounts to new branch ${targetBranchCode}`,
      data: {
        newBranch: {
          _id: newBranch._id,
          branchCode: newBranch.branchCode,
          branchName: newBranch.branchName,
          branchType: newBranch.branchType,
          organizationCode: newBranch.organizationCode
        },
        statistics: {
          totalSourceAccounts: sourceAccounts.length,
          accountsCreated: createdAccounts,
          accountsSkipped: skippedAccounts,
          resetBalances: resetBalances
        },
        accountMapping
      }
    });

  } catch (error) {
    console.error('💥 CLONE BRANCH ERROR:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Internal server error during branch cloning',
      error: process.env.NODE_ENV === 'development' ? error.message : 'An unexpected error occurred'
    });
  }
};

// Fallback function without transactions
const cloneWithoutTransaction = async (req, res) => {
  console.log('=== USING NON-TRANSACTION APPROACH ===');
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

    // Validate required fields
    if (!sourceOrganizationCode || !sourceBranchCode || !targetOrganizationCode || 
        !targetBranchCode || !targetBranchName || !CREATED_BY) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Validate source branch exists
    const sourceBranch = await Branch.findOne({
      organizationCode: sourceOrganizationCode,
      branchCode: sourceBranchCode,
    });
    
    if (!sourceBranch) {
      return res.status(404).json({
        success: false,
        message: `Source branch ${sourceBranchCode} not found`
      });
    }

    // Validate target organization exists
    const targetOrganization = await Organization.findOne({
      organizationCode: targetOrganizationCode,
    });
    
    if (!targetOrganization) {
      return res.status(404).json({
        success: false,
        message: `Target organization ${targetOrganizationCode} not found`
      });
    }

    // Check if target branch already exists
    const existingTargetBranch = await Branch.findOne({
      organizationCode: targetOrganizationCode,
      branchCode: targetBranchCode,
    });
    
    if (existingTargetBranch) {
      return res.status(409).json({
        success: false,
        message: `Target branch ${targetBranchCode} already exists`
      });
    }

    // Get all GL accounts from source branch
    const sourceAccounts = await GLAccount.find({
      organizationCode: sourceOrganizationCode,
      branchCode: sourceBranchCode,
      REC_ST: 'Active'
    });

    if (sourceAccounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No active GL accounts found in source branch`
      });
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
    
    await newBranch.save();
    console.log('New branch created successfully');

    // Clone GL accounts
    const clonedAccounts = [];
    const accountMapping = {};

    // Get the highest GL_ACCT_ID
    const lastAccount = await GLAccount.findOne()
      .sort({ GL_ACCT_ID: -1 })
      .select('GL_ACCT_ID')
      .lean();

    let nextGLAccountId = lastAccount && lastAccount.GL_ACCT_ID 
      ? parseInt(lastAccount.GL_ACCT_ID) + 1 
      : 1000;

    for (const sourceAccount of sourceAccounts) {
      if (!cloneInterBranchAccounts && sourceAccount.metadata?.accountType === 'INTER_BRANCH') {
        continue;
      }

      // Generate new GL account number
      const glAcctNoParts = sourceAccount.GL_ACCT_NO.split('-');
      if (glAcctNoParts.length >= 2) {
        glAcctNoParts[1] = String(targetBranchCode).padStart(3, '0');
      }
      const newGLAccountNo = glAcctNoParts.join('-');

      // Create new GL account
      const newGLAccount = new GLAccount({
        ...sourceAccount.toObject(),
        _id: new mongoose.Types.ObjectId(),
        GL_ACCT_NO: newGLAccountNo,
        GL_ACCT_ID: nextGLAccountId,
        organizationName: targetOrganization.organizationName,
        organizationCode: targetOrganizationCode,
        branchName: targetBranchName,
        branchCode: targetBranchCode,
        branchType: targetBranchType,
        CREATED_BY: CREATED_BY,
        LEDGER_BALANCE: resetBalances ? 0 : sourceAccount.LEDGER_BALANCE,
        AVAILABLE_BALANCE: resetBalances ? 0 : sourceAccount.AVAILABLE_BALANCE,
        transactions: [],
        metadata: {
          ...(sourceAccount.metadata || {}),
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

      await newGLAccount.save();
      clonedAccounts.push(newGLAccount);
      accountMapping[sourceAccount.GL_ACCT_NO] = newGLAccountNo;
      nextGLAccountId++;
    }

    return res.status(201).json({
      success: true,
      message: `Successfully cloned ${clonedAccounts.length} GL accounts to new branch ${targetBranchCode}`,
      data: {
        newBranch: {
          branchCode: newBranch.branchCode,
          branchName: newBranch.branchName
        },
        clonedAccountsCount: clonedAccounts.length,
        accountMapping
      }
    });

  } catch (error) {
    console.error('Non-transaction clone error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};



// // UPDATED: createGLAccount function with fixed audit trail
// export const createGLAccount = async (req, res) => {
//   logger.info('createGLAccount hit with body:', { body: req.body });
//   const session = await mongoose.startSession();
//   let result;
  
//   console.log('=== STARTING TRANSACTION ===');
  
//   try {
//     await session.withTransaction(async () => {
//       console.log('=== INSIDE TRANSACTION ===');
      
//       try {
//         // STEP 1: Parse and validate required fields
//         console.log('=== STEP 1: Parsing fields ===');
//         const {
//           organizationName,
//           organizationCode,
//           branchName,
//           branchCode,
//           categoryCode,
//           categoryName,
//           level,
//           CHART_OF_ACCT_ID,
//           ACCT_DESC,
//           LEDGER_NO,
//           GL_ACCT_CAT,
//           BAL_CD,
//           SUB_LEDGER_NO,
//           CREATED_BY,
//           SEG_NO,
//           subfolderId,
//           metadata = {}
//         } = req.body;

//         console.log('=== DEBUG: Critical fields ===');
//         console.log('CHART_OF_ACCT_ID:', CHART_OF_ACCT_ID);
//         console.log('ACCT_DESC:', ACCT_DESC);
//         console.log('LEDGER_NO:', LEDGER_NO);
//         console.log('GL_ACCT_CAT:', GL_ACCT_CAT);
//         console.log('BAL_CD:', BAL_CD);
//         console.log('SUB_LEDGER_NO:', SUB_LEDGER_NO);

//         // Validate required fields
//         console.log('=== STEP 2: Validating required fields ===');
//         const requiredFields = {
//           organizationName, organizationCode, branchName, branchCode,
//           categoryCode, categoryName, level, CHART_OF_ACCT_ID,
//           ACCT_DESC, LEDGER_NO, GL_ACCT_CAT, BAL_CD,
//           SUB_LEDGER_NO, CREATED_BY, SEG_NO, subfolderId
//         };

//         const missingFields = Object.entries(requiredFields)
//           .filter(([_, value]) => !value && value !== 0)
//           .map(([key]) => key);

//         if (missingFields.length > 0) {
//           throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
//         }
//         console.log('✅ All required fields present');

//         // STEP 2: Organization handling
//         console.log('=== STEP 3: Organization handling ===');
//         const orgCode = Number(organizationCode);
//         if (isNaN(orgCode)) {
//           throw new Error('Organization code must be a valid number');
//         }

//         const trimmedOrgName = organizationName.trim().toUpperCase();
        
//         let organization = await Organization.findOne({
//           $or: [
//             { organizationName: trimmedOrgName },
//             { organizationCode: orgCode }
//           ]
//         }).session(session);

//         if (!organization) {
//           console.log('Creating new organization');
//           organization = new Organization({
//             organizationName: trimmedOrgName,
//             organizationCode: orgCode,
//             createdAt: new Date(),
//             updatedAt: new Date(),
//           });
//           await organization.save({ session });
//           console.log('✅ Organization created:', organization._id);
//         } else {
//           console.log('✅ Organization found:', organization._id);
//         }

//         // STEP 3: Branch handling
//         console.log('=== STEP 4: Branch handling ===');
//         let branch = await Branch.findOne({
//           organizationCode: orgCode,
//           branchCode,
//         }).session(session);

//         if (!branch) {
//           console.log('Creating new branch');
          
//           const branchData = {
//             organizationName: trimmedOrgName,
//             organizationCode: orgCode,
//             branchName: branchName.trim().toUpperCase(),
//             branchCode: branchCode.trim(),
//             branchType: 'MAIN',
//             address: `${trimmedOrgName} ${branchName} Address`,
//             status: 'ACTIVE'
//           };

//           console.log('Creating branch with data:', branchData);

//           // Validate branch code format
//           if (!/^\d{3}$/.test(branchCode)) {
//             throw new Error('Branch code must be a 3-digit number');
//           }

//           branch = new Branch(branchData);
//           await branch.save({ session });
//           console.log('✅ Branch created:', branch._id);

//           // FIXED: Branch audit trail with simple direct approach
//           console.log('=== STEP 4a: Creating branch audit trail ===');
//           try {
//             await simpleAudit({
//               EVENT_TYPE: 'CREATE_BRANCH',
//               USER_ID: CREATED_BY,
//               ACTION: 'CREATE',
//               NEW_VALUE: branchData,
//               OLD_VALUE: null,
//               IP_ADDRESS: req.ip || '127.0.0.1',
//               ENTITY_ID: branch._id,
//               ENTITY_TYPE: 'Branch',
//               STATUS: 'SUCCESS',
//               DESCRIPTION: `Created branch: ${branch.branchName} (${branch.branchCode})`,
//               REFERENCE_NO: `BRANCH-${branch._id}`
//             }, session);
//             console.log('✅ Branch audit trail created');
//           } catch (auditError) {
//             console.error('❌ Branch audit trail failed:', auditError.message);
//             // Don't throw - continue with GL Account creation
//           }
//         } else {
//           console.log('✅ Branch found:', branch._id);
//         }

//         // STEP 4: Generate GL Account Number
//         console.log('=== STEP 5: Generating GL Account Number ===');
//         const glAcctNo = [
//           String(CHART_OF_ACCT_ID).padStart(2, '0'),
//           String(branchCode).padStart(3, '0'),
//           String(BAL_CD).padStart(3, '0'),
//           String(GL_ACCT_CAT).padStart(3, '0'),
//           String(LEDGER_NO).padStart(3, '0'),
//           String(branchCode).padStart(3, '0'),
//         ].join('-');

//         console.log('✅ Generated GL_ACCT_NO:', glAcctNo);

//         // STEP 5: Check for duplicates
//         console.log('=== STEP 6: Checking for duplicates ===');
//         const existingAccount = await GLAccount.findOne({ 
//           GL_ACCT_NO: glAcctNo 
//         }).session(session);

//         if (existingAccount) {
//           throw new Error(`GL account ${glAcctNo} already exists`);
//         }
//         console.log('✅ No duplicate found');

//         // STEP 6: Generate GL Account ID
//         console.log('=== STEP 7: Generating GL Account ID ===');
//         let glAcctId;
//         try {
//           console.log('Calling generateNextGLAcctId...');
//           glAcctId = await generateNextGLAcctId(session);
//           console.log('✅ GL_ACCT_ID generated:', glAcctId);
//         } catch (error) {
//           console.log('❌ generateNextGLAcctId failed:', error.message);
//           console.log('Falling back to simple ID generation...');
//           const count = await GLAccount.countDocuments().session(session);
//           glAcctId = String(count + 1).padStart(7, '0');
//           console.log('✅ Fallback GL_ACCT_ID:', glAcctId);
//         }

//         // STEP 7: Create GL Account
//         console.log('=== STEP 8: Creating GL Account object ===');
//         const glAccountData = {
//           GL_ACCT_NO: glAcctNo,
//           GL_ACCT_ID: glAcctId,
//           organizationName: trimmedOrgName,
//           organizationCode: orgCode,
//           branchName: branch.branchName,
//           branchCode: branch.branchCode,
//           branchType: branch.branchType,
//           CREATED_BY,
//           categoryCode,
//           categoryName,
//           level,
//           LEDGER_NO,
//           BAL_CD,
//           SUB_LEDGER_NO,
//           CHART_OF_ACCT_ID,
//           ACCT_DESC,
//           GL_ACCT_CAT: String(GL_ACCT_CAT).padStart(3, '0'),
//           JOURNAL_ID: req.body.JOURNAL_ID || `JRN-${Date.now()}`,
//           TRANSACTION_TYPE: req.body.TRANSACTION_TYPE || 'Asset Balance',
//           CR_ALLOWED: req.body.CR_ALLOWED !== undefined ? req.body.CR_ALLOWED : true,
//           DR_ALLOWED: req.body.DR_ALLOWED !== undefined ? req.body.DR_ALLOWED : true,
//           REC_ST: req.body.REC_ST || 'Active',
//           POST_ALLOW: req.body.POST_ALLOW !== undefined ? req.body.POST_ALLOW : true,
//           SEG_NO: SEG_NO || 1,
//           SEG_DESC: req.body.SEG_DESC || categoryName,
//           LEDGER_BALANCE: 0,
//           AVAILABLE_BALANCE: 0,
//           CURRENCY_CODE: 'NGN',
//           subfolderId: subfolderId,
//           metadata: {
//             accountType: metadata.accountType || 'CUSTOMER_ACCOUNT',
//             branchSpecific: metadata.branchSpecific !== undefined ? metadata.branchSpecific : true,
//             consolidationRequired: metadata.consolidationRequired !== undefined ? metadata.consolidationRequired : false,
//             ...metadata
//           },
//           createdAt: new Date(),
//           updatedAt: new Date()
//         };

//         console.log('GL Account data prepared with required fields:', {
//           subfolderId: glAccountData.subfolderId,
//           metadata: glAccountData.metadata
//         });

//         const newGLAccount = new GLAccount(glAccountData);
        
//         // Validate before saving
//         console.log('=== STEP 9: Validating GL Account ===');
//         const validationError = newGLAccount.validateSync();
//         if (validationError) {
//           console.log('❌ Validation errors:', validationError.errors);
//           throw new Error(`GL Account validation failed: ${validationError.message}`);
//         }
//         console.log('✅ GL Account validation passed');

//         console.log('=== STEP 10: Saving GL Account ===');
//         await newGLAccount.save({ session });
//         console.log('✅ GL Account saved successfully:', newGLAccount._id);

//         // STEP 8: Create GL Account Segment (OPTIONAL - REMOVED FOR NOW)
//         console.log('=== STEP 11: Skipping GL Account Segment (optional) ===');

//         // STEP 9: GL Account audit trail
//         console.log('=== STEP 12: Creating GL Account audit trail ===');
//         try {
//           await simpleAudit({
//             EVENT_TYPE: 'CREATE_GL_ACCOUNT',
//             USER_ID: CREATED_BY,
//             ACTION: 'CREATE',
//             NEW_VALUE: {
//               GL_ACCT_NO: glAcctNo,
//               GL_ACCT_ID: glAcctId,
//               organizationName: trimmedOrgName,
//               branchName: branch.branchName,
//               ACCT_DESC: ACCT_DESC
//             },
//             OLD_VALUE: null,
//             IP_ADDRESS: req.ip || '127.0.0.1',
//             ENTITY_ID: newGLAccount._id,
//             ENTITY_TYPE: 'GLAccount',
//             STATUS: 'SUCCESS',
//             DESCRIPTION: `Created GL account ${glAcctNo} - ${ACCT_DESC}`,
//             REFERENCE_NO: `GL-${newGLAccount._id}`,
//             ACCOUNT_NO: glAcctNo
//           }, session);
//           console.log('✅ GL Account audit trail created');
//         } catch (auditError) {
//           console.error('❌ GL Account audit trail failed:', auditError.message);
//           // Don't throw - continue with success response
//         }

//         console.log('🎉 TRANSACTION COMPLETED SUCCESSFULLY 🎉');
        
//         // Set the result
//         result = {
//           success: true,
//           message: 'GL account created successfully',
//           data: newGLAccount,
//         };

//       } catch (innerError) {
//         console.error('❌ INNER TRANSACTION ERROR:', innerError.message);
//         console.error('Inner error stack:', innerError.stack);
//         throw innerError;
//       }
//     });

//     // If we get here, transaction was committed successfully
//     console.log('=== TRANSACTION COMMITTED ===');
//     return res.status(201).json(result);

//   } catch (error) {
//     console.error('❌ TRANSACTION FAILED:', error.message);
//     console.error('Error stack:', error.stack);
    
//     logger.error('Error creating GL account', {
//       error: error.message,
//       stack: error.stack,
//       body: req.body,
//     });

//     return res.status(400).json({
//       success: false,
//       message: 'Failed to create GL account',
//       error: error.message,
//       code: error.message.includes('Missing') || error.message.includes('Invalid') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
//     });
//   } finally {
//     await session.endSession();
//     console.log('=== SESSION ENDED ===');
//   }
// };

// // SIMPLE AUDIT FUNCTION - Add this to the same file as createGLAccount
// const simpleAudit = async (data, session = null) => {
//   try {
//     const AuditTrail = mongoose.model('AuditTrail');
    
//     // Generate event_id
//     let event_id;
//     try {
//       const lastAudit = await AuditTrail.findOne().sort({ event_id: -1 });
//       event_id = lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
//     } catch (error) {
//       event_id = Date.now();
//     }

//     console.log('🔍 Creating simple audit:', {
//       EVENT_TYPE: data.EVENT_TYPE,
//       USER_ID: data.USER_ID,
//       ENTITY_TYPE: data.ENTITY_TYPE
//     });

//     const audit = new AuditTrail({
//       event_id,
//       event_type: data.EVENT_TYPE,
//       user_id: data.USER_ID,
//       action: data.ACTION,
//       new_value: data.NEW_VALUE || {},
//       old_value: data.OLD_VALUE || null,
//       ip_address: String(data.IP_ADDRESS || '127.0.0.1'),
//       entity_id: data.ENTITY_ID,
//       entity_type: data.ENTITY_TYPE,
//       status: data.STATUS || 'SUCCESS',
//       description: data.DESCRIPTION,
//       reference_no: data.REFERENCE_NO,
//       account_no: data.ACCOUNT_NO,
//       timestamp: new Date()
//     });

//     const options = session ? { session } : {};
//     await audit.save(options);
    
//     console.log('✅ Simple audit created successfully:', data.EVENT_TYPE);
//     return audit;
//   } catch (error) {
//     console.error('❌ Simple audit failed:', error.message);
//     return null;
//   }
// };

// // UPDATED: createDynamicGLAccount function with new schema support
// export const createDynamicGLAccount = async (req, res) => {
//   logger.info('createDynamicGLAccount hit with body:', { body: req.body });
  
//   const {
//     organizationName,
//     organizationCode,
//     branchCode,
//     branchType = 'MAIN',
//     accountType,
//     productType,
//     CREATED_BY,
//     ACCT_DESC,
//     GL_ACCT_CAT,
//     BAL_CD,
//     level = 1,
//     metadata = {}
//   } = req.body;

//   // Early validation with new required fields
//   if (!organizationName || !organizationCode || !branchCode || !accountType || !CREATED_BY) {
//     return res.status(400).json({
//       success: false,
//       message: 'Missing required fields: organizationName, organizationCode, branchCode, accountType, CREATED_BY',
//       code: 'BAD_REQUEST'
//     });
//   }

//   const session = await mongoose.startSession();
//   let newGLAccount = null;
//   let glAcctNo = null;
//   let trimmedOrgNameLocal = null;
//   let branchNameLocal = null;
//   let categoryCodeLocal = null;
//   let categoryNameLocal = null;
//   let descriptionLocal = null;
//   let success = false;

//   try {
//     await session.withTransaction(async () => {
//       trimmedOrgNameLocal = organizationName.trim();

//       // Infer categoryCode from accountType
//       const categoryCode = determineCategoryFromAccountType(accountType);
//       categoryCodeLocal = categoryCode;

//       // Infer categoryName from categoryCode
//       const categoryNameMap = {
//         '100': 'Current Assets',
//         '150': 'Fixed Assets',
//         '200': 'Loan Assets',
//         '300': 'Liabilities',
//         '400': 'Income/Fees',
//         '500': 'Equity',
//         '600': 'Expenses',
//         '700': 'Revenue',
//         '800': 'Inter-Branch',
//         '999': 'Other'
//       };
//       const categoryName = categoryNameMap[categoryCode] || 'Unknown Category';
//       categoryNameLocal = categoryName;

//       // Validate organization
//       let organization = await Organization.findOne({
//         $or: [
//           { organizationName: trimmedOrgNameLocal },
//           { organizationCode: organizationCode }
//         ]
//       }).session(session);
      
//       if (!organization) {
//         logger.info('Organization not found, creating new', { organizationName: trimmedOrgNameLocal, organizationCode });
//         organization = new Organization({
//           organizationName: trimmedOrgNameLocal,
//           organizationCode: organizationCode,
//           createdAt: new Date(),
//           updatedAt: new Date(),
//         });
//         await organization.save({ session });
//       }

//       // Find branch by code to get branchName
//       const branch = await Branch.findOne({
//         organizationCode: organizationCode,
//         branchCode,
//       }).session(session);
      
//       if (!branch) {
//         throw new Error(`Branch with code "${branchCode}" not found in organization "${trimmedOrgNameLocal}"`);
//       }

//       branchNameLocal = branch.branchName;

//       // Set defaults for required fields
//       const LEDGER_NO = 1;
//       const SUB_LEDGER_NO = 0;
//       const CHART_OF_ACCT_ID = 1;

//       // Create root subfolder
//       const parentFolder = await createRootSubfolder(CREATED_BY, LEDGER_NO, { session });
//       const resolvedSubfolderId = parentFolder.subfolderId;

//       let glAcctNoLocal;
//       let description;

//       // Generate GL account number based on template
//       if (accountType === 'LOAN_ASSET' && productType) {
//         const template = LOAN_PRODUCT_TEMPLATES[productType];
//         if (!template) {
//           throw new Error(`Unknown product type: ${productType}`);
//         }
//         glAcctNoLocal = generateGLAccount(template, branchCode, '001', '100');
//         description = ACCT_DESC || `${productType.replace('_', ' ')} Loan Assets`;
//       } else {
//         const templateConfig = GL_ACCOUNT_TEMPLATES[accountType];
//         if (!templateConfig) {
//           throw new Error(`Unknown account type: ${accountType}. Available types: ${Object.keys(GL_ACCOUNT_TEMPLATES).join(', ')}`);
//         }
//         glAcctNoLocal = generateGLAccount(templateConfig.template, branchCode, '001', '100');
//         description = ACCT_DESC || templateConfig.description || `${accountType} Account`;
//       }
//       glAcctNo = glAcctNoLocal;
//       descriptionLocal = description;

//       // Check for duplicate GL account
//       const existingAccount = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo }).session(session);
//       if (existingAccount) {
//         logger.info('GL account already exists, returning existing account', { GL_ACCT_NO: glAcctNo });
//         return res.status(200).json({
//           success: true,
//           message: 'GL account already exists',
//           data: existingAccount,
//         });
//       }

//       // Determine GL account category if not provided
//       const resolvedGLAccountCat = GL_ACCT_CAT || categoryCode;

//       // Create GL account with new schema
//       const newGLAccountObject = new GLAccount({
//         GL_ACCT_NO: glAcctNo,
//         GL_ACCT_ID: await generateNextGLAcctId(session),
//         CREATED_BY,
//         organizationName: trimmedOrgNameLocal,
//         organizationCode: organizationCode,
//         branchName: branchNameLocal,
//         branchCode,
//         branchType,
//         ACCT_DESC: description,
//         GL_ACCT_CAT: resolvedGLAccountCat,
//         BAL_CD: BAL_CD || categoryCode,
//         JOURNAL_ID: generateJournalId(),
//         LEDGER_NO,
//         SUB_LEDGER_NO,
//         CHART_OF_ACCT_ID,
//         TRANSACTION_TYPE: GL_ACCOUNT_TEMPLATES[accountType]?.transactionType || 'GENERAL',
//         CR_ALLOWED: determineCreditAllowed(accountType),
//         DR_ALLOWED: determineDebitAllowed(accountType),
//         REC_ST: 'Active',
//         POST_ALLOW: true,
//         POST_FG: false,
//         CONTROL_ACCT_FG: false,
//         SUSPENSE_ACCT_FG: false,
//         ALLOW_BAL_SWING_FG: false,
//         PARENT_ID: null,
//         subfolderId: resolvedSubfolderId,
//         SEG_VALUE: '',
//         SEG_DESC: description,
//         SEG_NO: 1,
//         SEG_TY_CD: '',
//         SEG_PLACEHLDR_ID: '',
//         DELAY_GL_POSTING: false,
//         LEDGER_BALANCE: 0,
//         AVAILABLE_BALANCE: 0,
//         CURRENCY_CODE: 'NGN',
//         transactions: [],
//         SETTLEMENT_GL_ACCT_NO: glAcctNo,
//         branchTimezone: 'Africa/Lagos',
//         level: Number(level),
//         metadata: {
//           accountType,
//           productType: productType || null,
//           categoryCode,
//           categoryName,
//           templateGenerated: true,
//           dynamicAccount: true,
//           branchSpecific: metadata.branchSpecific !== undefined ? metadata.branchSpecific : true,
//           consolidationRequired: metadata.consolidationRequired !== undefined ? metadata.consolidationRequired : false,
//           ...metadata
//         }
//       });

//       await newGLAccountObject.save({ session });
//       newGLAccount = newGLAccountObject;
//       success = true;
//       logger.info('Created new dynamic GL account', { GL_ACCT_NO: glAcctNo, accountType });

//       return res.status(201).json({
//         success: true,
//         message: 'Dynamic GL account created successfully',
//         data: newGLAccount,
//       });
//     });
//   } catch (error) {
//     if (session.inTransaction()) {
//       await session.abortTransaction();
//     }
//     logger.error('Error creating dynamic GL account', {
//       error: error.message,
//       stack: error.stack,
//       body: req.body,
//       timestamp: new Date(),
//     });
    
//     return res.status(400).json({
//       success: false,
//       message: 'Error creating dynamic GL account',
//       error: error.message,
//       code: error.message.includes('Missing') || error.message.includes('Unknown') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
//     });
//   } finally {
//     session.endSession();
//   }

//   // Audit trail moved OUTSIDE transaction
//   if (success && newGLAccount && CREATED_BY) {
//     try {
//       await addAuditTrail({
//         EVENT_TYPE: 'CREATE_DYNAMIC_GL_ACCOUNT',
//         USER_ID: CREATED_BY,
//         ACTION: 'CREATE',
//         NEW_VALUE: {
//           GL_ACCT_NO: glAcctNo,
//           accountType: accountType,
//           productType: productType || null,
//           organizationName: trimmedOrgNameLocal,
//           organizationCode: organizationCode,
//           branchName: branchNameLocal,
//           branchCode: branchCode,
//           branchType: branchType,
//           categoryCode: categoryCodeLocal,
//           categoryName: categoryNameLocal,
//           level: level,
//           description: descriptionLocal,
//           metadata: newGLAccount.metadata
//         },
//         OLD_VALUE: null,
//         IP_ADDRESS: req.ip || '0.0.0.0',
//         ENTITY_ID: newGLAccount._id,
//         ENTITY_TYPE: 'GLAccount',
//         STATUS: 'SUCCESS',
//         DESCRIPTION: `Created dynamic GL account ${glAcctNo} for ${accountType} in category ${categoryNameLocal}`,
//         REFERENCE_NO: `GL-${newGLAccount._id}`,
//         ACCOUNT_NO: glAcctNo,
//         ADDITIONAL_INFO: {},
//       });
//       logger.info('Audit trail logged successfully for GL account creation', { GL_ACCT_NO: glAcctNo });
//     } catch (auditError) {
//       logger.warn('Audit trail failed after successful GL creation', {
//         error: auditError.message,
//         glAcctNo,
//         CREATED_BY,
//       });
//     }
//   }
// };

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

// Add this function to your GLAccountController.js

// NEW FUNCTION: Get COA Structure for Organization
export const getCOAStructure = async (req, res) => {
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

//////////////////////////////////////////////////////////////
// GL INITIALIZATION CONTROLLER EXPORTS
///////////////////////////////////////////////////////////////

// EXPORT FUNCTION: Initialize and Activate GL Accounts (DIAGNOSTIC VERSION)
export const initializeAndActivateGLAccounts = async (req, res) => {
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
// EXPORT FUNCTION: Force Reactivate GL Accounts (FIXED - No Validation Bypass)
export const forceReactivateGLAccounts = async (req, res) => {
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
export const getGLActivationStatus = async (req, res) => {
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
export const getGLAccountByNumber = async (req, res) => {
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
export const activateSpecificGLAccounts = async (req, res) => {
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

//////////////////////////////////////////////////////////////////
// UPDATE EXPORTS TO INCLUDE NEW FUNCTIONS
////////////////////////////////////////////////////////////////
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
export const getCOASettings = async (req, res) => {
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




export default {
  // Account Creation
  createGLAccount, 
  createDynamicGLAccount, 
  createCOAAlignedGLAccount,
  migrateToCOAStructure,
  getCOAStructure,
  
  // Branch Management
  getBranchGLAccountSummary, 
  getOrganizationGLAccounts,
  getInterBranchAccounts,
  
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
  deleteGLAccount,

  /////////////////////////////////////////////
  //GL INITIALIZATION CONTROLLER EXPORTS

  
    initializeAndActivateGLAccounts,
  getGLActivationStatus,
  activateSpecificGLAccounts,
  forceReactivateGLAccounts,
  getGLAccountByNumber,

   updateCOA,
  bulkUpdateCOA,
  getCOASettings,
};