import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js';
import GLAccount from '../models/GLAccount.js';
import GLAccountCategory from '../models/GLAccountCategory.js';
import Subfolder from '../models/Subfolder.js';
import Branch from '../models/Branch.js';
import { generateGLAccountNumber, generateNextGLAcctId, createRootSubfolder, generateJournalId, validateGLAccountFormat } from '../utils/generateGLANumber.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import Reconciliation from '../models/Reconciliation.js';
import Organization from '../models/organization.js';


// Utility: Generate Transaction ID
const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  const transactionId = base + random;
  logger.info('Generated Transaction ID', { transactionId });
  return transactionId;
};

// Base categories for reference (used for validation)
export const baseCategories = [
  { categoryCode: '1', categoryName: 'ASSET', parentCode: null, level: 1 },
  { categoryCode: '101', categoryName: 'CASH', parentCode: '1', level: 2 },
  { categoryCode: '01', categoryName: 'PETTY CASH', parentCode: '101', level: 3 },
  { categoryCode: '02', categoryName: 'CASH IN TREASURY/CASH IN EXCHANGE OFFICE', parentCode: '101', level: 3 },
  { categoryCode: '03', categoryName: 'CASH AND OTHER PAYMENT', parentCode: '101', level: 3 },
  { categoryCode: '04', categoryName: 'TELLER CASH CLEARING ACCOUNT', parentCode: '101', level: 3 },
  { categoryCode: '05', categoryName: 'CHANNELS CASH CLEARING', parentCode: '101', level: 3 },
  { categoryCode: '102', categoryName: 'INTER-BRANCH SETTLEMENTS', parentCode: '1', level: 2 },
  { categoryCode: '103', categoryName: 'INVESTMENT', parentCode: '1', level: 2 },
  { categoryCode: '104', categoryName: 'FIXED ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '105', categoryName: 'LOANS AND OVERDRAFTS TO CLIENTS', parentCode: '1', level: 2 },
  { categoryCode: '106', categoryName: 'RECEIVABLE AND REPAYMENTS', parentCode: '1', level: 2 },
  { categoryCode: '107', categoryName: 'ACCRUED INTEREST RECEIVABLE ON OVERDRAFT AND LOANS', parentCode: '1', level: 2 },
  { categoryCode: '108', categoryName: 'OTHER ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '109', categoryName: 'INTANGIBLE ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '110', categoryName: 'ACCOUNTS AND DEPOSITS WITH BANKS AND FINANCIAL INSTITUTIONS', parentCode: '1', level: 2 },
  { categoryCode: '01-110', categoryName: 'BRANCH 1 ACCOUNTS', parentCode: '110', level: 3 },
  { categoryCode: '02-110', categoryName: 'BRANCH 2 ACCOUNTS', parentCode: '110', level: 3 },
  { categoryCode: '03-110', categoryName: 'BRANCH 3 ACCOUNTS', parentCode: '110', level: 3 },
  { categoryCode: '04-110', categoryName: 'BRANCH 4 ACCOUNTS', parentCode: '110', level: 3 },
  { categoryCode: '05-110', categoryName: 'BRANCH 5 ACCOUNTS', parentCode: '110', level: 3 },
  { categoryCode: '06-111', categoryName: 'RESTRICTED CASH AND CASH EQUIVALENTS', parentCode: '110', level: 3 },
  { categoryCode: '07-112', categoryName: 'PENALTY AND INCOME RECEIVABLE', parentCode: '1', level: 2 },
  { categoryCode: '08-113', categoryName: 'ACCUMULATED DEPRECIATION - TANGIBLE/FIXED ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '09-114', categoryName: 'ACCUMULATED AMORTIZATION - INTANGIBLE ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '10-115', categoryName: 'LONG-TERM DEBT SECURITIES', parentCode: '1', level: 2 },
  { categoryCode: '11-116', categoryName: 'LONG-TERM SECURITIES HELD FOR DEALING PURPOSES', parentCode: '1', level: 2 },
  { categoryCode: '12-117', categoryName: 'OTHER LONG TERM ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '2', categoryName: 'LIABILITY', parentCode: null, level: 1 },
  { categoryCode: '201', categoryName: 'ACCOUNTS AND DEPOSITS FROM BANKS AND FINANCIAL INSTITUTIONS', parentCode: '2', level: 2 },
  { categoryCode: '202', categoryName: 'CURRENT SAVINGS AND DEPOSIT ACCOUNT FOR CLIENTS', parentCode: '2', level: 2 },
  { categoryCode: '01-202', categoryName: 'SAVINGS ACCOUNT', parentCode: '202', level: 3 },
  { categoryCode: '02-202', categoryName: 'CURRENT ACCOUNTS', parentCode: '202', level: 3 },
  { categoryCode: '03-202', categoryName: 'FIXED/TERM-DEPOSITS', parentCode: '202', level: 3 },
  { categoryCode: '04-202', categoryName: 'UNCLAIMED CURRENT/SAVINGS ACCOUNT', parentCode: '202', level: 3 },
  { categoryCode: '05-202', categoryName: 'UNCLAIMED FIXED DEPOSITS', parentCode: '202', level: 3 },
  { categoryCode: '06-202', categoryName: 'DORMANT ACCOUNTS', parentCode: '202', level: 3 },
  { categoryCode: '203', categoryName: 'LOANS AND OVERDRAFTS FROM BANKS AND FINANCIAL INSTITUTIONS', parentCode: '2', level: 2 },
  { categoryCode: '204', categoryName: 'PAYABLES TO OTHER BANKS AND INSTITUTIONS', parentCode: '2', level: 2 },
  { categoryCode: '205', categoryName: 'INTEREST PAYABLE', parentCode: '2', level: 2 },
  { categoryCode: '01-205', categoryName: 'INTEREST PAYABLE ON LOAN FROM BANKS AND FINANCIAL INSTITUTIONS', parentCode: '205', level: 3 },
  { categoryCode: '02-205', categoryName: 'INTEREST PAYABLE ON CURRENT AND SAVINGS ACCOUNTS', parentCode: '205', level: 3 },
  { categoryCode: '03-205', categoryName: 'INTEREST PAYABLE ON FIXED AND TERM DEPOSITS', parentCode: '205', level: 3 },
  { categoryCode: '206', categoryName: 'SUSPENDED INTEREST INCOME', parentCode: '2', level: 2 },
  { categoryCode: '01-206', categoryName: 'SUSPENDED INTEREST INCOME', parentCode: '206', level: 3 },
  { categoryCode: '01-01-206', categoryName: 'SUSPENDED INTEREST INCOME FOR INDIVIDUAL INSTITUTIONS', parentCode: '01-206', level: 4 },
  { categoryCode: '02-206', categoryName: 'SUSPENDED FEE/SERVICE CHARGE INCOME', parentCode: '206', level: 3 },
  { categoryCode: '03-206', categoryName: 'LOAN LOSS PROVISION ON LOANS AND OVERDRAFTS - GENERAL', parentCode: '206', level: 3 },
  { categoryCode: '04-206', categoryName: 'LOAN LOSS PROVISION ON LOANS AND OVERDRAFTS - SPECIFIC', parentCode: '206', level: 3 },
  { categoryCode: '05-206', categoryName: 'LOAN LOSS PROVISION ADJUSTMENTS', parentCode: '206', level: 3 },
  { categoryCode: '06-206', categoryName: 'SUSPENDED ARREARS PENALTY INTEREST', parentCode: '206', level: 3 },
  { categoryCode: '07-206', categoryName: 'SUSPENDED POST MATURITY INTEREST', parentCode: '206', level: 3 },
  { categoryCode: '08-206', categoryName: 'SUSPENDED INTEREST INCOME OVERDRAFTS', parentCode: '206', level: 3 },
  { categoryCode: '207', categoryName: 'LOANS FROM BANKS AND FINANCIAL INSTITUTIONS', parentCode: '2', level: 2 },
  { categoryCode: '208', categoryName: 'DEFERRED GRANTS REVENUE', parentCode: '2', level: 2 },
  { categoryCode: '209', categoryName: 'INTER-BRANCH SETTLEMENTS', parentCode: '2', level: 2 },
  { categoryCode: '210', categoryName: 'SHORT-TERM SECURITIES ISSUED AND OTHER EVIDENCED LIABILITIES', parentCode: '2', level: 2 },
  { categoryCode: '211', categoryName: 'PAYABLES TO GOVERNMENT AND OTHER ORGANIZATIONS', parentCode: '2', level: 2 },
  { categoryCode: '212', categoryName: 'LEAVE ALLOWANCE PAYABLE', parentCode: '2', level: 2 },
  { categoryCode: '3', categoryName: 'EQUITY/CAPITAL', parentCode: null, level: 1 },
  { categoryCode: '301', categoryName: 'EQUITY/SHARE CAPITAL', parentCode: '3', level: 2 },
  { categoryCode: '302', categoryName: 'RESERVES', parentCode: '3', level: 2 },
  { categoryCode: '4', categoryName: 'INCOME', parentCode: null, level: 1 },
  { categoryCode: '401', categoryName: 'INTEREST INCOME ON LOANS', parentCode: '4', level: 2 },
  { categoryCode: '402', categoryName: 'PENALTY AND FEES INCOME', parentCode: '4', level: 2 },
  { categoryCode: '403', categoryName: 'LOAN FEES AND COMMISSIONS', parentCode: '4', level: 2 },
  { categoryCode: '404', categoryName: 'INTEREST INCOME FROM INVESTMENTS', parentCode: '4', level: 2 },
  { categoryCode: '405', categoryName: 'FEES AND COMMISSION FROM BANKING OPERATIONS', parentCode: '4', level: 2 },
  { categoryCode: '406', categoryName: 'DIVIDEND INCOME AND INVESTMENTS', parentCode: '4', level: 2 },
  { categoryCode: '407', categoryName: 'DEALING OPERATIONS PROFITS', parentCode: '4', level: 2 },
  { categoryCode: '408', categoryName: 'OTHERS OPERATING INCOME', parentCode: '4', level: 2 },
  { categoryCode: '409', categoryName: 'GRANTS INCOME', parentCode: '4', level: 2 },
  { categoryCode: '410', categoryName: 'DONATIONS', parentCode: '4', level: 2 },
  { categoryCode: '411', categoryName: 'FOREIGN EXCHANGE GAINS', parentCode: '4', level: 2 },
  { categoryCode: '5', categoryName: 'EXPENSES', parentCode: null, level: 1 },
  { categoryCode: '501', categoryName: 'INTEREST EXPENSE', parentCode: '5', level: 2 },
  { categoryCode: '502', categoryName: 'FEES AND COMMISSIONS', parentCode: '5', level: 2 },
  { categoryCode: '503', categoryName: 'LOAN LOSS PROVISION EXPENSE ACCOUNTS', parentCode: '5', level: 2 },
  { categoryCode: '504', categoryName: 'LOAN WRITE OFFS', parentCode: '5', level: 2 },
  { categoryCode: '505', categoryName: 'LOSSES ON DEALING OPERATIONS', parentCode: '5', level: 2 },
  { categoryCode: '506', categoryName: 'AFFILIATION FEES', parentCode: '5', level: 2 },
  { categoryCode: '507', categoryName: 'STAFF COSTS', parentCode: '5', level: 2 },
  { categoryCode: '508', categoryName: 'TRAINING AND SEMINARS', parentCode: '5', level: 2 },
  { categoryCode: '509', categoryName: 'TRAVEL COSTS', parentCode: '5', level: 2 },
  { categoryCode: '510', categoryName: 'PROFESSIONAL SERVICES', parentCode: '5', level: 2 },
  { categoryCode: '511', categoryName: 'RENT', parentCode: '5', level: 2 },
  { categoryCode: '512', categoryName: 'UTILITIES', parentCode: '5', level: 2 },
  { categoryCode: '513', categoryName: 'SECURITY', parentCode: '5', level: 2 },
  { categoryCode: '514', categoryName: 'VEHICLES OPERATING COSTS', parentCode: '5', level: 2 },
  { categoryCode: '515', categoryName: 'GENERATOR OPERATING COSTS', parentCode: '5', level: 2 },
  { categoryCode: '516', categoryName: 'MARKETING PR ADVERTISING AND RESEARCH', parentCode: '5', level: 2 },
  { categoryCode: '517', categoryName: 'IT SYSTEM MAINTENANCE AND SUPPORT', parentCode: '5', level: 2 },
  { categoryCode: '01-517', categoryName: 'MAINTENANCE', parentCode: '517', level: 3 },
  { categoryCode: '703', categoryName: 'FIRE', parentCode: '517', level: 3 },
  { categoryCode: '518', categoryName: 'OTHER OPERATIONAL EXPENSES', parentCode: '5', level: 2 },
  { categoryCode: '519', categoryName: 'DEPRECIATION AND AMORTIZATION EXPENSE', parentCode: '5', level: 2 },
  { categoryCode: '520', categoryName: 'TAXES OTHER THAN PROFIT TAX', parentCode: '5', level: 2 },
  { categoryCode: '521', categoryName: 'FOREIGN EXCHANGE LOSSES', parentCode: '5', level: 2 },
  { categoryCode: '6', categoryName: 'CONTINGENT-ASSETS', parentCode: null, level: 1 },
  { categoryCode: '601', categoryName: 'CONTINGENT ASSETS', parentCode: '6', level: 2 },
  { categoryCode: '602', categoryName: 'CONTINGENT ASSETS-WRITTEN OFF LOANS', parentCode: '6', level: 2 },
  { categoryCode: '7', categoryName: 'CONTINGENT-LIABILITIES', parentCode: null, level: 1 },
  { categoryCode: '701', categoryName: 'CONTINGENT LIABILITIES', parentCode: '7', level: 2 },
  { categoryCode: '702', categoryName: 'CONTINGENT LIABILITIES-WRITTEN OFF LOANS', parentCode: '7', level: 2 },
];

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
        BU_ID,
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
        BU_ID,
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

      // Validate GL_ACCT_CAT and categoryCode
      const categoryRecord = await GLAccountCategory.findOne({
        categoryCode: GL_ACCT_CAT,
        organizationName: trimmedOrgName,
        branchName,
        branchCode,
      }).session(session);
      if (!categoryRecord) {
        logger.info('Category not found, attempting to create new', {
          categoryCode: GL_ACCT_CAT,
          organizationName: trimmedOrgName,
          branchName,
          branchCode,
        });
        // Assuming baseCategories is defined elsewhere; validate or create
        const baseCategory = baseCategories.find(cat => cat.categoryCode === GL_ACCT_CAT);
        if (!baseCategory) {
          logger.error('Category not found in baseCategories', { categoryCode: GL_ACCT_CAT });
          throw new Error(`Category ${GL_ACCT_CAT} does not exist in base categories`);
        }
        if (baseCategory.parentCode !== parentCode) {
          logger.error('Parent code mismatch', { provided: parentCode, expected: baseCategory.parentCode });
          throw new Error(`Parent code ${parentCode || 'null'} does not match expected parent ${baseCategory.parentCode || 'null'}`);
        }
        if (baseCategory.level !== level) {
          logger.error('Level mismatch', { provided: level, expected: baseCategory.level });
          throw new Error(`Level ${level} does not match expected level ${baseCategory.level}`);
        }
        const newCategory = new GLAccountCategory({
          categoryCode: GL_ACCT_CAT,
          categoryName: categoryName || baseCategory.categoryName,
          parentCode: parentCode || null,
          level,
          organizationName: trimmedOrgName,
          branchName,
          branchCode,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await newCategory.save({ session });
        logger.info('Created new category', {
          categoryCode: GL_ACCT_CAT,
          categoryName: newCategory.categoryName,
          organizationName: trimmedOrgName,
          branchName,
          branchCode,
        });
      }

      // Validate parentCode
      if (parentCode) {
        const parentCategory = await GLAccountCategory.findOne({
          categoryCode: parentCode,
          organizationName: trimmedOrgName,
          branchName,
          branchCode,
        }).session(session);
        if (!parentCategory) {
          const baseParentCategory = baseCategories.find(cat => cat.categoryCode === parentCode);
          if (!baseParentCategory) {
            logger.error('Parent category not found in baseCategories', { parentCode });
            throw new Error(`Parent category ${parentCode} does not exist in base categories`);
          }
          logger.info('Parent category not found, creating new', {
            parentCode,
            organizationName: trimmedOrgName,
            branchName,
            branchCode,
          });
          const newParentCategory = new GLAccountCategory({
            categoryCode: parentCode,
            categoryName: baseParentCategory.categoryName,
            parentCode: baseParentCategory.parentCode || null,
            level: baseParentCategory.level,
            organizationName: trimmedOrgName,
            branchName,
            branchCode,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await newParentCategory.save({ session });
          logger.info('Created new parent category', {
            parentCode,
            organizationName: trimmedOrgName,
            branchName,
            branchCode,
          });
        } else if (level !== parentCategory.level + 1) {
          logger.error('Invalid level for parent', { level, parentLevel: parentCategory.level });
          throw new Error(`Level must be ${parentCategory.level + 1} for parent ${parentCode}`);
        }
      } else if (level !== 1) {
        logger.error('Invalid level for top-level category', { level });
        throw new Error('Top-level categories must have level 1');
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
          String(BU_ID).padStart(3, '0'),
        ].join('-');
      } else {
        const segments = glAcctNo.split('-');
        if (segments.length === 6) {
          glAcctNo = [
            segments[0].padStart(2, '0'),
            segments[1].padStart(3, '0'),
            segments[2].padStart(3, '0'),
            segments[3].padStart(3, '0'),
            segments[4].padStart(3, '0'),
            segments[5].padStart(3, '0'),
          ].join('-');
        } else if (segments.length === 5) {
          glAcctNo = [
            segments[0].padStart(2, '0'),
            segments[1].padStart(3, '0'),
            segments[2].padStart(3, '0'),
            segments[3].padStart(3, '0'),
            segments[4].padStart(3, '0'),
          ].join('-');
        } else {
          logger.error('Invalid GL_ACCT_NO segment count', { glAcctNo, segments });
          throw new Error(`Invalid GL_ACCT_NO: ${glAcctNo}. Expected 5 or 6 segments.`);
        }
      }

      // Validate GL_ACCT_NO format
      const segments = glAcctNo.split('-');
      if (segments.length !== 5 && segments.length !== 6) {
        logger.error('Invalid GL_ACCT_NO segment count', { glAcctNo, segments });
        throw new Error(`Invalid GL_ACCT_NO: ${glAcctNo}. Expected 5 or 6 segments.`);
      }
      const branchCodeDerived = segments.length === 6 ? segments[1] : segments[0];
      const categorySegment = segments.length === 6 ? segments[3] : segments[2];
      if (branchCode !== branchCodeDerived) {
        logger.error('Branch code mismatch', { provided: branchCode, derived: branchCodeDerived });
        throw new Error(`Branch code (${branchCode}) does not match GL_ACCT_NO segment (${branchCodeDerived})`);
      }
      if (String(GL_ACCT_CAT).padStart(3, '0') !== categorySegment) {
        logger.error('GL_ACCT_CAT mismatch', { provided: GL_ACCT_CAT, derived: categorySegment });
        throw new Error(`GL_ACCT_CAT (${GL_ACCT_CAT}) does not match GL_ACCT_NO category segment (${categorySegment})`);
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
        categoryName: categoryName || (categoryRecord ? categoryRecord.categoryName : 'Default Category'), // Safe fallback
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
        BU_ID,
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
        SEG_DESC: SEG_DESC || categoryName || (categoryRecord ? categoryRecord.categoryName : 'Default Description'), // Safe fallback
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

// Add canPost method to GLAccountSchema (should be in GLAccount.js, included here for completeness)
GLAccount.schema.methods.canPost = function (type) {
  if (type === 'DR') return this.DR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  if (type === 'CR') return this.CR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  return false;
};

export const createLedgerEntry = async (req, res, transactionData, options = {}) => {
  const session = options.session || await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.withTransaction(async () => {
      logger.debug('Request headers:', { headers: req?.headers });
      logger.debug('Raw request body:', { body: req?.body || transactionData });

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

      // Validate organizationName and branchName for both accounts
      const debitBranch = await Branch.findOne({
        organizationName: debitAccount.organizationName,
        branchName: debitAccount.branchName
      }).session(session);
      const creditBranch = await Branch.findOne({
        organizationName: creditAccount.organizationName,
        branchName: creditAccount.branchName
      }).session(session);
      if (!debitBranch) {
        throw new Error(`Branch ${debitAccount.branchName} not found for organization ${debitAccount.organizationName}`);
      }
      if (!creditBranch) {
        throw new Error(`Branch ${creditAccount.branchName} not found for organization ${creditAccount.organizationName}`);
      }

      // Validate categories
      const debitCategory = await GLAccountCategory.findOne({
        categoryCode: debitAccount.GL_ACCT_CAT,
        organizationName: debitAccount.organizationName,
        branchName: debitAccount.branchName
      }).session(session);
      const creditCategory = await GLAccountCategory.findOne({
        categoryCode: creditAccount.GL_ACCT_CAT,
        organizationName: creditAccount.organizationName,
        branchName: creditAccount.branchName
      }).session(session);
      if (!debitCategory || !creditCategory) {
        throw new Error('Invalid GL_ACCT_CAT for debit or credit account');
      }

      // Check if accounts allow posting
      if (!debitAccount.canPost('DR')) {
        throw new Error(`Debit account ${DR_ACCT_NO} does not allow DR transactions`);
      }
      if (!creditAccount.canPost('CR')) {
        throw new Error(`Credit account ${CR_ACCT_NO} does not allow CR transactions`);
      }

      // Check sufficient funds for Asset accounts
      const isDebitAsset = debitCategory.categoryName === 'ASSET' || (await debitCategory.getFullPath()).startsWith('1 - ASSET');
      if (isDebitAsset && (debitAccount.LEDGER_BALANCE || 0) < AMOUNT) {
        throw new Error(`Insufficient funds in debit account ${DR_ACCT_NO}`);
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
          DEBIT_CATEGORY_PATH: await debitCategory.getFullPath(),
          CREDIT_CATEGORY_PATH: await creditCategory.getFullPath(),
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
          error.message.includes('Insufficient') || 
          error.message.includes('Branch') ? 400 : 500
        ).json(errRes)
      : errRes;
  } finally {
    if (!options.session) {
      session.endSession();
    }
  }
};

export const createGLTransaction = async (req, res, transactionData, options = {}) => {
  try {
    const { GL_ACCT_NO, AMOUNT, TRANSACTION_TYPE, JOURNAL_ID, CREATED_BY, SUB_LEDGER_NO, SEG_NO, ACCT_DESC, CURRENCY_CODE, EXCHANGE_RATE, REFERENCE_ID } = transactionData || req.body;

    const session = options.session || await mongoose.startSession();
    let transactionCompleted = false;

    try {
      await session.withTransaction(async () => {
        const glAccount = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
        if (!glAccount) {
          throw new Error(`GL Account ${GL_ACCT_NO} not found`);
        }

        const category = await GLAccountCategory.findOne({
          categoryCode: glAccount.GL_ACCT_CAT,
          organizationName: glAccount.organizationName,
          branchName: glAccount.branchName
        }).session(session);
        if (!category) {
          throw new Error(`Invalid GL_ACCT_CAT: ${glAccount.GL_ACCT_CAT} not found in GLAccountCategory`);
        }

        let normalizedType = TRANSACTION_TYPE.toUpperCase();
        if (normalizedType === 'DEBIT') normalizedType = 'DR';
        if (normalizedType === 'CREDIT') normalizedType = 'CR';
        if (!['DR', 'CR'].includes(normalizedType)) {
          throw new Error(`Invalid TRANSACTION_TYPE: ${TRANSACTION_TYPE}. Must be DR or CR`);
        }

        if (!glAccount.canPost(normalizedType)) {
          throw new Error(`GL Account ${GL_ACCT_NO} does not allow ${normalizedType} transactions`);
        }

        const isAsset = category.categoryName === 'ASSET' || (await category.getFullPath()).startsWith('1 - ASSET');
        if (normalizedType === 'DR' && isAsset && (glAccount.LEDGER_BALANCE || 0) < AMOUNT) {
          throw new Error(`Insufficient funds in GL Account ${GL_ACCT_NO} for debit transaction`);
        }

        const isLiabilityOrEquity = category.categoryName === 'LIABILITY' || category.categoryName === 'EQUITY/CAPITAL' ||
          (await category.getFullPath()).startsWith('2 - LIABILITY') || (await category.getFullPath()).startsWith('3 - EQUITY/CAPITAL');
        const balanceUpdate = isLiabilityOrEquity
          ? (normalizedType === 'DR' ? -AMOUNT : AMOUNT)
          : (normalizedType === 'DR' ? AMOUNT : -AMOUNT);

        const newTransaction = new GLAccountTransaction({
          GL_ACCT_NO,
          AMOUNT,
          TRANSACTION_TYPE: normalizedType,
          CREATED_BY,
          SUB_LEDGER_NO: SUB_LEDGER_NO || '000',
          SEG_NO: SEG_NO || '1',
          ACCT_DESC: ACCT_DESC || `GL Transaction for ${GL_ACCT_NO}`,
          JOURNAL_ID: JOURNAL_ID || generateJournalId(),
          BAL_CD: glAccount.BAL_CD,
          GL_ACCT_CAT: glAccount.GL_ACCT_CAT,
          CURRENCY_CODE: CURRENCY_CODE || 'NGN',
          EXCHANGE_RATE: EXCHANGE_RATE || 1,
          REFERENCE_ID,
          TransactionId: generateTransactionId(),
          USER_ID: CREATED_BY,
          CREATE_DT: new Date(),
          ROW_TS: new Date(),
          SYS_CREATE_TS: new Date(),
        });

        await newTransaction.save({ session });

        const updatedGLAccount = await GLAccount.findOneAndUpdate(
          { GL_ACCT_NO },
          {
            $inc: { LEDGER_BALANCE: balanceUpdate },
            $push: { transactions: newTransaction._id },
            $set: { ROW_TS: new Date() },
          },
          { session, new: true }
        );

        const reconciliation = new Reconciliation({
          JOURNAL_ID: newTransaction.JOURNAL_ID,
          GL_ACCT_NO,
          TRANSACTION_ID: newTransaction.TransactionId,
          AMOUNT,
          CURRENCY_CODE: CURRENCY_CODE || 'NGN',
          EXTERNAL_REF: REFERENCE_ID || '',
          STATUS: 'Pending',
          CREATED_AT: new Date(),
        });
        await reconciliation.save({ session });

        await addAuditTrail({
          eventId: newTransaction.JOURNAL_ID,
          userId: CREATED_BY || 'system',
          eventType: `GL_ACCOUNT_${normalizedType}`,
          action: `${normalizedType === 'DR' ? 'Debit' : 'Credit'} GL Account ${GL_ACCT_NO}`,
          oldValue: { LEDGER_BALANCE: glAccount.LEDGER_BALANCE, CATEGORY_PATH: await category.getFullPath() },
          newValue: { LEDGER_BALANCE: updatedGLAccount.LEDGER_BALANCE, CATEGORY_PATH: await category.getFullPath() },
          ipAddress: req?.ip || '127.0.0.1',
          accountNo: GL_ACCT_NO,
          session,
        });

        logger.info(`GL Transaction added to ${GL_ACCT_NO}, JOURNAL_ID: ${newTransaction.JOURNAL_ID}, Balance Update: ${balanceUpdate}`);

        await session.commitTransaction();
        transactionCompleted = true;

        if (res) {
          return res.status(201).json({
            message: 'GL transaction created successfully',
            transaction: newTransaction,
          });
        }
        return { queued: false, transaction: updatedGLAccount };
      });
    } catch (error) {
      if (session.inTransaction() && !transactionCompleted) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (!options.session) {
        session.endSession();
      }
    }
  } catch (error) {
    logger.error('Error creating GL transaction:', { error: error.message, transactionData: transactionData || req.body });
    if (res) {
      return res.status(
        error.message.includes('Invalid') || error.message.includes('not found') || error.message.includes('Missing') || error.message.includes('Insufficient') ? 400 : 500
      ).json({
        message: 'Server error creating GL transaction',
        error: error.message,
      });
    }
    throw error;
  }
};

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

/**
 * GET ALL GL ACCOUNTS
 */
/**
 * GET ALL GL ACCOUNTS
 */
export const getAllGLAccounts = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      logger.error('Database not connected', { readyState: mongoose.connection.readyState });
      return res.status(503).json({
        success: false,
        message: 'Database is not connected. Please try again later.',
        code: 'SERVICE_UNAVAILABLE',
      });
    }

    // Fetch all GLAccount documents
    const accounts = await GLAccount.find({}).lean();

    // Map accounts to include category path
    const accountsWithCategoryPaths = await Promise.all(
      accounts.map(async (account) => {
        let categoryPath = '';
        let categoryDetails = null;

        // Query GLAccountCategory by GL_ACCT_CAT, organizationName, branchName, and branchCode
        if (account.GL_ACCT_CAT && account.branchCode) {
          const categoryRecord = await GLAccountCategory.findOne({
            categoryCode: account.GL_ACCT_CAT,
            organizationName: account.organizationName,
            branchName: account.branchName,
            branchCode: account.branchCode,
          }).lean();

          if (categoryRecord) {
            // Call getFullPath on a new instance of GLAccountCategory
            const categoryInstance = new GLAccountCategory(categoryRecord);
            categoryPath = await categoryInstance.getFullPath();
            categoryDetails = {
              _id: categoryRecord._id,
              categoryCode: categoryRecord.categoryCode,
              categoryName: categoryRecord.categoryName,
            };
          } else {
            logger.warn(`No GLAccountCategory found for GL_ACCT_CAT: ${account.GL_ACCT_CAT}`, {
              GL_ACCT_NO: account.GL_ACCT_NO,
              organizationName: account.organizationName,
              branchName: account.branchName,
              branchCode: account.branchCode,
            });
          }
        } else {
          logger.warn(`GL_ACCT_CAT or branchCode missing for account: ${account.GL_ACCT_NO}`, {
            GL_ACCT_NO: account.GL_ACCT_NO,
            organizationName: account.organizationName,
            branchName: account.branchName,
            branchCode: account.branchCode,
          });
        }

        return {
          ...account,
          CATEGORY_PATH: categoryPath,
          GL_ACCT_CAT: categoryDetails, // Include category details or null
        };
      })
    );

    return res.status(200).json({
      success: true,
      message: 'GL Accounts fetched successfully',
      data: accountsWithCategoryPaths,
    });
  } catch (error) {
    logger.error('Error fetching GL Accounts:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL Accounts',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
};

/**
 * GET A SINGLE GL ACCOUNT BY GL_ACCT_NO
 */
export const getGLAccountById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: 'GL Account Number is required',
        code: 'MISSING_GL_ACCT_NO',
      });
    }

    const trimmedGL_ACCT_NO = id.trim();
    const isValidFormat = /^\d+-\d+-\d+-\d+-\d+-\d+$/.test(trimmedGL_ACCT_NO);
    if (!isValidFormat) {
      return res.status(400).json({
        message: 'Invalid GL Account Number format',
        code: 'INVALID_GL_ACCT_NO',
      });
    }

    const glAccount = await GLAccount.findOne({ GL_ACCT_NO: trimmedGL_ACCT_NO }).populate({
      path: 'GL_ACCT_CAT',
      model: 'GLAccountCategory',
      select: 'categoryCode categoryName',
    });

    if (!glAccount) {
      return res.status(404).json({
        message: 'GL Account not found',
        code: 'GL_ACCOUNT_NOT_FOUND',
      });
    }

    const category = await GLAccountCategory.findOne({ categoryCode: glAccount.GL_ACCT_CAT });
    const categoryPath = await category.getFullPath();

    res.status(200).json({
      message: 'GL Account fetched successfully',
      data: { ...glAccount.toObject(), CATEGORY_PATH: categoryPath },
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error fetching GL Account',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
};

/**
 * UPDATE GL ACCOUNT
 */
export const updateGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const {
      GL_ACCT_NO,
      CHART_OF_ACCT_ID,
      ACCT_DESC,
      LEDGER_NO,
      GL_ACCT_CAT,
      JOURNAL_ID,
      TRANSACTION_TYPE,
      BAL_CD,
      SUB_LEDGER_NO,
      BU_ID,
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
      PROMPT,
      DELAY_GL_POSTING,
    } = req.body;

    // Validate required identifier
    if (!GL_ACCT_NO) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'GL_ACCT_NO is required to identify the account to update',
        code: 'MISSING_GL_ACCT_NO',
      });
    }

    // Find the existing GL account
    const existingAccount = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
    if (!existingAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        message: 'GL Account not found',
        code: 'GL_ACCOUNT_NOT_FOUND',
      });
    }

    // Validate GL_ACCT_CAT if provided
    if (GL_ACCT_CAT) {
      const category = await GLAccountCategory.findOne({
        categoryCode: GL_ACCT_CAT,
        organizationName: existingAccount.organizationName,
        branchName: existingAccount.branchName
      }).session(session);
      if (!category) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `Invalid GL_ACCT_CAT: ${GL_ACCT_CAT} not found in GLAccountCategory`,
          code: 'INVALID_GL_ACCT_CAT',
        });
      }
    }

    // Validate required fields for updates
    if (
      LEDGER_NO !== undefined && !LEDGER_NO ||
      BAL_CD !== undefined && !BAL_CD ||
      SUB_LEDGER_NO !== undefined && !SUB_LEDGER_NO ||
      BU_ID !== undefined && !BU_ID ||
      SEG_NO !== undefined && !SEG_NO
    ) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'LEDGER_NO, BAL_CD, SUB_LEDGER_NO, BU_ID, and SEG_NO are required when provided',
        code: 'MISSING_REQUIRED_FIELDS',
      });
    }

    // Validate DELAY_GL_POSTING
    if (DELAY_GL_POSTING !== undefined && typeof DELAY_GL_POSTING !== 'boolean') {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'DELAY_GL_POSTING must be a boolean',
        code: 'INVALID_DELAY_GL_POSTING',
      });
    }

    // Determine or create the parent subfolder
    let parentFolder;
    if (PARENT_ID) {
      parentFolder = await Subfolder.findOne({ parentId: PARENT_ID }).session(session);
      if (!parentFolder) {
        parentFolder = await createRootSubfolder(CREATED_BY || existingAccount.CREATED_BY, LEDGER_NO || existingAccount.LEDGER_NO, { session });
      }
    } else {
      parentFolder = await Subfolder.findOne({ subfolderId: existingAccount.subfolderId }).session(session) ||
        await createRootSubfolder(CREATED_BY || existingAccount.CREATED_BY, LEDGER_NO || existingAccount.LEDGER_NO, { session });
    }

    const resolvedParentId = PARENT_ID || parentFolder.parentId || existingAccount.PARENT_ID || '01';

    // Construct new GL_ACCT_NO if components are updated
    let newGlAcctNo = existingAccount.GL_ACCT_NO;
    if (PARENT_ID || BAL_CD || LEDGER_NO || SUB_LEDGER_NO || BU_ID || SEG_NO || GL_ACCT_CAT) {
      newGlAcctNo = generateGLAccountNumber(
        CHART_OF_ACCT_ID || existingAccount.CHART_OF_ACCT_ID,
        BAL_CD || existingAccount.BAL_CD,
        SUB_LEDGER_NO || existingAccount.SUB_LEDGER_NO,
        LEDGER_NO || existingAccount.LEDGER_NO,
        BU_ID || existingAccount.BU_ID,
        GL_ACCT_CAT || existingAccount.GL_ACCT_CAT
      );

      // Validate new GL_ACCT_NO
      const segments = newGlAcctNo.split('-');
      if (segments[3] !== (GL_ACCT_CAT || existingAccount.GL_ACCT_CAT)) {
        await session.abortTransaction();
        return res.status(400).json({
          message: `GL_ACCT_NO fourth segment (${segments[3]}) must match GL_ACCT_CAT (${GL_ACCT_CAT || existingAccount.GL_ACCT_CAT})`,
          code: 'INVALID_GL_ACCT_NO',
        });
      }

      // Check for duplicate GL_ACCT_NO
      if (newGlAcctNo !== existingAccount.GL_ACCT_NO) {
        const duplicateAccount = await GLAccount.findOne({ GL_ACCT_NO: newGlAcctNo }).session(session);
        if (duplicateAccount) {
          await session.abortTransaction();
          return res.status(400).json({
            message: 'New GL Account Number already exists',
            code: 'DUPLICATE_GL_ACCT_NO',
          });
        }
      }
    }

    // Update GLAccount
    const updatedFields = {
      GL_ACCT_NO: newGlAcctNo,
      CHART_OF_ACCT_ID: CHART_OF_ACCT_ID !== undefined ? CHART_OF_ACCT_ID : existingAccount.CHART_OF_ACCT_ID,
      ACCT_DESC: ACCT_DESC !== undefined ? ACCT_DESC : existingAccount.ACCT_DESC,
      LEDGER_NO: LEDGER_NO !== undefined ? LEDGER_NO : existingAccount.LEDGER_NO,
      GL_ACCT_CAT: GL_ACCT_CAT !== undefined ? GL_ACCT_CAT : existingAccount.GL_ACCT_CAT,
      JOURNAL_ID: JOURNAL_ID !== undefined ? JOURNAL_ID : existingAccount.JOURNAL_ID,
      TRANSACTION_TYPE: TRANSACTION_TYPE !== undefined ? TRANSACTION_TYPE : existingAccount.TRANSACTION_TYPE,
      BAL_CD: BAL_CD !== undefined ? BAL_CD : existingAccount.BAL_CD,
      SUB_LEDGER_NO: SUB_LEDGER_NO !== undefined ? SUB_LEDGER_NO : existingAccount.SUB_LEDGER_NO,
      BU_ID: BU_ID !== undefined ? BU_ID : existingAccount.BU_ID,
      CR_ALLOWED: CR_ALLOWED !== undefined ? CR_ALLOWED : existingAccount.CR_ALLOWED,
      DR_ALLOWED: DR_ALLOWED !== undefined ? DR_ALLOWED : existingAccount.DR_ALLOWED,
      REC_ST: REC_ST !== undefined ? REC_ST : existingAccount.REC_ST,
      POST_ALLOW: POST_ALLOW !== undefined ? POST_ALLOW : existingAccount.POST_ALLOW,
      POST_FG: POST_FG !== undefined ? POST_FG : existingAccount.POST_FG,
      CONTROL_ACCT_FG: CONTROL_ACCT_FG !== undefined ? CONTROL_ACCT_FG : existingAccount.CONTROL_ACCT_FG,
      CREATED_BY: CREATED_BY !== undefined ? CREATED_BY : existingAccount.CREATED_BY,
      SUSPENSE_ACCT_FG: SUSPENSE_ACCT_FG !== undefined ? SUSPENSE_ACCT_FG : existingAccount.SUSPENSE_ACCT_FG,
      ALLOW_BAL_SWING_FG: ALLOW_BAL_SWING_FG !== undefined ? ALLOW_BAL_SWING_FG : existingAccount.ALLOW_BAL_SWING_FG,
      PARENT_ID: resolvedParentId,
      subfolderId: parentFolder.subfolderId,
      SEG_VALUE: SEG_VALUE !== undefined ? SEG_VALUE : existingAccount.SEG_VALUE,
      SEG_DESC: SEG_DESC !== undefined ? SEG_DESC : existingAccount.SEG_DESC,
      SEG_NO: SEG_NO !== undefined ? SEG_NO : existingAccount.SEG_NO,
      SEG_TY_CD: SEG_TY_CD !== undefined ? SEG_TY_CD : existingAccount.SEG_TY_CD,
      SEG_PLACEHLDR_ID: SEG_PLACEHLDR_ID !== undefined ? SEG_PLACEHLDR_ID : existingAccount.SEG_PLACEHLDR_ID,
      PROMPT: PROMPT !== undefined ? PROMPT : existingAccount.PROMPT,
      DELAY_GL_POSTING: DELAY_GL_POSTING !== undefined ? DELAY_GL_POSTING : existingAccount.DELAY_GL_POSTING,
      UPDATED_AT: new Date(),
    };

    // Update the document
    const updatedGLAccount = await GLAccount.findOneAndUpdate(
      { GL_ACCT_NO: GL_ACCT_NO },
      { $set: updatedFields },
      { new: true, session }
    );

    // Audit trail
    const category = await GLAccountCategory.findOne({
      categoryCode: updatedGLAccount.GL_ACCT_CAT,
      organizationName: updatedGLAccount.organizationName,
      branchName: updatedGLAccount.branchName
    }).session(session);
    await addAuditTrail({
      EVENT_TYPE: 'UPDATE_GL_ACCOUNT',
      USER_ID: CREATED_BY || existingAccount.CREATED_BY,
      ACTION: 'UPDATE',
      NEW_VALUE: {
        GL_ACCT_NO: newGlAcctNo,
        GL_ACCT_CAT: updatedGLAccount.GL_ACCT_CAT,
        CATEGORY_PATH: await category.getFullPath(),
      },
      OLD_VALUE: {
        GL_ACCT_NO: existingAccount.GL_ACCT_NO,
        GL_ACCT_CAT: existingAccount.GL_ACCT_CAT,
        CATEGORY_PATH: await (await GLAccountCategory.findOne({
          categoryCode: existingAccount.GL_ACCT_CAT,
          organizationName: existingAccount.organizationName,
          branchName: existingAccount.branchName
        })).getFullPath(),
      },
      IP_ADDRESS: req?.ip,
      ENTITY_ID: updatedGLAccount._id,
      ENTITY_TYPE: 'GLAccount',
      session,
    });

    await session.commitTransaction();
    transactionCompleted = true;

    return res.status(200).json({
      message: 'GL account updated successfully',
      glAccount: { ...updatedGLAccount.toObject(), CATEGORY_PATH: await category.getFullPath() },
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error updating GL account:', {
      error: error.message,
      stack: error.stack,
    });
    return res.status(
      error.message.includes('Invalid') || error.message.includes('not found') || error.message.includes('Missing') ? 400 : 500
    ).json({
      message: 'Error updating GL account',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

/**
 * DELETE GL ACCOUNT
 */
export const deleteGLAccount = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const { id } = req.params;

    if (!id) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'GL Account Number is required',
        code: 'MISSING_GL_ACCT_NO',
      });
    }

    const trimmedGL_ACCT_NO = id.trim();
    const isValidFormat = /^\d+-\d+-\d+-\d+-\d+-\d+$/.test(trimmedGL_ACCT_NO);
    if (!isValidFormat) {
      await session.abortTransaction();
      return res.status(400).json({
        message: 'Invalid GL Account Number format',
        code: 'INVALID_GL_ACCT_NO',
      });
    }

    const deletedGLAccount = await GLAccount.findOneAndDelete(
      { GL_ACCT_NO: trimmedGL_ACCT_NO },
      { session }
    );

    if (!deletedGLAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        message: 'GL Account not found',
        code: 'GL_ACCOUNT_NOT_FOUND',
      });
    }

    // Audit trail
    const category = await GLAccountCategory.findOne({
      categoryCode: deletedGLAccount.GL_ACCT_CAT,
      organizationName: deletedGLAccount.organizationName,
      branchName: deletedGLAccount.branchName
    }).session(session);
    await addAuditTrail({
      EVENT_TYPE: 'DELETE_GL_ACCOUNT',
      USER_ID: req.body.CREATED_BY || 'system',
      ACTION: 'DELETE',
      NEW_VALUE: null,
      OLD_VALUE: {
        GL_ACCT_NO: deletedGLAccount.GL_ACCT_NO,
        GL_ACCT_CAT: deletedGLAccount.GL_ACCT_CAT,
        CATEGORY_PATH: await category.getFullPath(),
      },
      IP_ADDRESS: req?.ip,
      ENTITY_ID: deletedGLAccount._id,
      ENTITY_TYPE: 'GLAccount',
      session,
    });

    await session.commitTransaction();
    transactionCompleted = true;

    res.status(200).json({
      message: 'GL Account deleted successfully',
      data: deletedGLAccount,
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    res.status(500).json({
      message: 'Error deleting GL Account',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

/**
 * FETCH SUBFOLDERS
 */
export const fetchSubfolders = async (req, res) => {
  try {
    const { parentId } = req.query;
    const filter = parentId ? { parentId: Number(parentId) } : {};
    const subfolders = await Subfolder.find(filter).sort({ createdAt: -1 }).exec();

    res.status(200).json({
      message: 'Subfolders fetched successfully',
      subfolders,
    });
  } catch (error) {
    logger.error('Error fetching subfolders:', error);
    res.status(500).json({
      message: 'Error fetching subfolders',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
};

/**
 * CREATE SUBFOLDER
 */
export const createSubfolder = async (req, res) => {
  const { parentId, createdBy, ledgerNo, isRoot, name } = req.body;

  if (
    typeof parentId !== 'number' ||
    typeof ledgerNo !== 'number' ||
    typeof isRoot !== 'boolean' ||
    typeof createdBy !== 'string' ||
    typeof name !== 'string' ||
    !createdBy.trim() ||
    !name.trim()
  ) {
    return res.status(400).json({
      message: 'Required fields are missing or invalid',
      code: 'INVALID_SUBFOLDER_FIELDS',
    });
  }

  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const maxSubfolder = await Subfolder.findOne().sort({ subfolderId: -1 }).lean().session(session);
    let subfolderId = 1;
    if (maxSubfolder && maxSubfolder.subfolderId !== undefined && !isNaN(Number(maxSubfolder.subfolderId))) {
      subfolderId = Number(maxSubfolder.subfolderId) + 1;
    }

    const newSubfolder = new Subfolder({
      subfolderId,
      parentId,
      createdBy: createdBy.trim(),
      ledgerNo,
      isRoot,
      name: name.trim(),
    });

    await newSubfolder.save({ session });

    await addAuditTrail({
      EVENT_TYPE: 'CREATE_SUBFOLDER',
      USER_ID: createdBy,
      ACTION: 'CREATE',
      NEW_VALUE: { subfolderId, parentId, name },
      OLD_VALUE: null,
      IP_ADDRESS: req?.ip,
      ENTITY_ID: newSubfolder._id,
      ENTITY_TYPE: 'Subfolder',
      session,
    });

    await session.commitTransaction();
    transactionCompleted = true;

    res.status(201).json({
      message: 'Subfolder created successfully',
      subfolder: newSubfolder,
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error creating subfolder:', error);
    res.status(500).json({
      message: 'Error creating subfolder',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

/**
 * GET ALL GL ACCOUNT CATEGORIES
 */
export const getAllGLAccountCategories = async (req, res) => {
  try {
    const { organizationName, branchName } = req.query;
    if (!organizationName || !branchName) {
      return res.status(400).json({ message: 'organizationName and branchName are required' });
    }

    const categories = await GLAccountCategory.find({ organizationName, branchName });
    const categoriesWithPaths = await Promise.all(
      categories.map(async (cat) => ({
        categoryCode: cat.categoryCode,
        categoryName: cat.categoryName,
        parentCode: cat.parentCode,
        level: cat.level,
        fullPath: await cat.getFullPath(),
      }))
    );
    return res.status(200).json({
      message: 'GL Account Categories fetched successfully',
      data: categoriesWithPaths,
    });
  } catch (error) {
    logger.error('Error fetching GL Account Categories:', { error: error.message });
    return res.status(500).json({
      message: 'Error fetching GL Account Categories',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
};

/**
 * GET GL ACCOUNT CATEGORY PATH
 */
export const getGLAccountCategoryPath = async (req, res) => {
  try {
    const { categoryCode, organizationName, branchName } = req.params;
    const category = await GLAccountCategory.findOne({ categoryCode, organizationName, branchName });
    if (!category) {
      return res.status(404).json({
        message: `GL Account Category ${categoryCode} not found`,
        code: 'CATEGORY_NOT_FOUND',
      });
    }
    const fullPath = await category.getFullPath();
    return res.status(200).json({
      message: 'GL Account Category path fetched successfully',
      data: { categoryCode, fullPath },
    });
  } catch (error) {
    logger.error('Error fetching GL Account Category path:', { error: error.message });
    return res.status(500).json({
      message: 'Error fetching GL Account Category path',
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
};

export default {
  createGLAccount,
  getAllGLAccounts,
  getGLAccountById,
  updateGLAccount,
  deleteGLAccount,
  fetchSubfolders,
  createSubfolder,
  processEODGLTransactions,
  queueGLTransaction,
  approveGLTransaction,
  getAllGLAccountCategories,
  getGLAccountCategoryPath,
};