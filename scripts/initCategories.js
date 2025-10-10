import mongoose from 'mongoose';
import Department from '../models/Branch.js';
import GLAccountCategory from '../models/GLAccountCategory.js';
import GLAccount from '../models/GLAccount.js';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js';

// Define Organization schema if needed
const organizationSchema = new mongoose.Schema({ organizationName: String });
mongoose.model('Organization', organizationSchema);

const categories = [
  { categoryCode: '1', categoryName: 'ASSET', parentCode: null, level: 1 },
  { categoryCode: '101', categoryName: 'CASH', parentCode: '1', level: 2 },
  { categoryCode: '01', categoryName: 'PETTY CASH', parentCode: '101', level: 3 },
  { categoryCode: '102', categoryName: 'INTER-BRANCH SETTLEMENTS', parentCode: '1', level: 2 },
  { categoryCode: '103', categoryName: 'INVESTMENT', parentCode: '1', level: 2 },
  { categoryCode: '104', categoryName: 'FIXED ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '105', categoryName: 'LOANS AND OVERDRAFTS TO CLIENTS', parentCode: '1', level: 2 },
  { categoryCode: '106', categoryName: 'RECEIVABLE AND REPAYMENTS', parentCode: '1', level: 2 },
  { categoryCode: '107', categoryName: 'ACCRUED INTEREST RECEIVABLE ON OVERDRAFT AND LOANS', parentCode: '1', level: 2 },
  { categoryCode: '108', categoryName: 'OTHER ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '109', categoryName: 'INTANGIBLE ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '110', categoryName: 'ACCOUNTS AND DEPOSITS WITH BANKS AND FINANCIAL INSTITUTIONS', parentCode: '1', level: 2 },
  { categoryCode: '01-110', categoryName: 'FIRST BANK', parentCode: '110', level: 3 },
  { categoryCode: '02-110', categoryName: 'GT BANK PLC', parentCode: '110', level: 3 },
  { categoryCode: '03-110', categoryName: 'ACCESS BANK PLC', parentCode: '110', level: 3 },
  { categoryCode: '04-110', categoryName: 'UNION BANK PLC', parentCode: '110', level: 3 },
  { categoryCode: '05-110', categoryName: 'ZENITH BANK PLC', parentCode: '110', level: 3 },
  { categoryCode: '111', categoryName: 'RESTRICTED CASH AND CASH EQUIVALENTS', parentCode: '1', level: 2 },
  { categoryCode: '112', categoryName: 'PENALTY AND INCOME RECEIVABLE', parentCode: '1', level: 2 },
  { categoryCode: '113', categoryName: 'ACCUMULATED DEPRECIATION - TANGIBLE/FIXED ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '114', categoryName: 'ACCUMULATED AMORTIZATION - INTANGIBLE ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '115', categoryName: 'LONG-TERM DEBT SECURITIES', parentCode: '1', level: 2 },
  { categoryCode: '116', categoryName: 'LONG-TERM SECURITIES HELD FOR DEALING PURPOSES', parentCode: '1', level: 2 },
  { categoryCode: '117', categoryName: 'OTHER LONG TERM ASSETS', parentCode: '1', level: 2 },
  { categoryCode: '2', categoryName: 'LIABILITY', parentCode: null, level: 1 },
  { categoryCode: '201', categoryName: 'ACCOUNTS AND DEPOSITS FROM BANKS AND FINANCIAL INSTITUTIONS', parentCode: '2', level: 2 },
  { categoryCode: '202', categoryName: 'CURRENT SAVINGS AND DEPOSIT ACCOUNT FOR CLIENTS', parentCode: '2', level: 2 },
  { categoryCode: '01-202', categoryName: 'Savings Account', parentCode: '202', level: 3 },
  { categoryCode: '02-202', categoryName: 'Current Accounts', parentCode: '202', level: 3 },
  { categoryCode: '03-202', categoryName: 'Fixed/Term-Deposits', parentCode: '202', level: 3 },
  { categoryCode: '04-202', categoryName: 'Unclaimed Current/Savings Account', parentCode: '202', level: 3 },
  { categoryCode: '05-202', categoryName: 'Unclaimed Fixed Deposits', parentCode: '202', level: 3 },
  { categoryCode: '06-202', categoryName: 'Dormant Accounts', parentCode: '202', level: 3 },
  { categoryCode: '203', categoryName: 'LOANS AND OVERDRAFTS FROM BANKS AND FINANCIAL INSTITUTIONS', parentCode: '2', level: 2 },
  { categoryCode: '204', categoryName: 'PAYABLES TO OTHER BANKS AND INSTITUTIONS', parentCode: '2', level: 2 },
  { categoryCode: '205', categoryName: 'INTEREST PAYABLE', parentCode: '2', level: 2 },
  { categoryCode: '206', categoryName: 'SUSPENDED INTEREST INCOME', parentCode: '2', level: 2 },
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
  { categoryCode: '703', categoryName: 'FIRE', parentCode: '01-517', level: 4 },
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

async function initializeDepartmentAndGLAccount() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority');
    logger.info('Connected to MongoDB', { timestamp: new Date().toISOString() });

    // Drop potentially conflicting indexes to avoid duplicate index errors
    await GLAccountCategory.collection.dropIndexes().catch((err) => 
      logger.warn('Failed to drop GLAccountCategory indexes', { error: err.message, timestamp: new Date().toISOString() })
    );
    await GLAccount.collection.dropIndexes().catch((err) => 
      logger.warn('Failed to drop GLAccount indexes', { error: err.message, timestamp: new Date().toISOString() })
    );

    const session = await mongoose.startSession();
    await session.withTransaction(async () => {
      // Step 1: Create Organization
      const organizationName = 'PCO BANK';
      let organization = await mongoose.model('Organization').findOne({ organizationName }).session(session);
      if (!organization) {
        organization = new (mongoose.model('Organization'))({ organizationName });
        await organization.save({ session });
        logger.info('Created organization', { organizationName, timestamp: new Date().toISOString() });
      }

      // Step 2: Create Departments and GLAccountCategories
      const departmentCodes = ['000', '001', '002'];
      const departmentName = 'FINANCE';

      for (const departmentCode of departmentCodes) {
        // Create or verify Department
        let department = await Department.findOne({
          organizationName,
          departmentName,
          departmentCode,
        }).session(session);

        if (!department) {
          logger.info('Creating new department', { organizationName, departmentName, departmentCode, timestamp: new Date().toISOString() });
          department = new Department({
            organizationName,
            departmentName,
            departmentCode,
            createdAt: new Date('2025-09-21T19:05:00.000Z'),
            updatedAt: new Date('2025-09-21T19:05:00.000Z'),
          });
          await department.save({ session, validateBeforeSave: false });

          await addAuditTrail({
            EVENT_TYPE: 'CREATE_DEPARTMENT',
            USER_ID: 'system',
            ACTION: 'CREATE',
            NEW_VALUE: { organizationName, departmentName, departmentCode },
            OLD_VALUE: null,
            IP_ADDRESS: '0.0.0.0',
            ENTITY_ID: department._id,
            ENTITY_TYPE: 'Department',
            STATUS: 'SUCCESS',
            DESCRIPTION: `Created department ${departmentName} with code ${departmentCode} in organization ${organizationName}`,
            REFERENCE_NO: `DEPT-${department._id}`,
            ACCOUNT_NO: null,
            ADDITIONAL_INFO: {},
            session,
          });
        } else {
          logger.info('Department already exists', { organizationName, departmentName, departmentCode, timestamp: new Date().toISOString() });
        }

        // Initialize GLAccountCategory entries by level
        const deptCategories = categories.map((cat) => ({
          ...cat,
          organizationName,
          departmentName,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

        // Insert categories by level to ensure proper order
        const levels = [...new Set(deptCategories.map((cat) => cat.level))].sort((a, b) => a - b);
        let categoriesInitialized = 0;

        for (const level of levels) {
          const levelCategories = deptCategories.filter((cat) => cat.level === level);
          const inserted = await GLAccountCategory.insertMany(levelCategories, {
            session,
            ordered: false,
            validateBeforeSave: false, // Bypass all validations
          });
          categoriesInitialized += inserted.length;
          logger.info(`Inserted ${inserted.length} categories for level ${level}`, {
            organizationName,
            departmentName,
            departmentCode,
            timestamp: new Date().toISOString(),
          });
        }

        logger.info('Initialized GLAccountCategory entries', {
          count: categoriesInitialized,
          organizationName,
          departmentName,
          departmentCode,
          timestamp: new Date().toISOString(),
        });
      }

      // Step 3: Create GL Account for department '002'
      const targetDepartmentCode = '002';
      const glAccountData = {
        organizationName,
        departmentName: 'FINANCE',
        categoryCode: '105',
        categoryName: 'LOANS AND OVERDRAFTS TO CLIENTS',
        parentCode: '1',
        level: 2,
        CHART_OF_ACCT_ID: '01',
        BAL_CD: '111',
        SUB_LEDGER_NO: '105',
        LEDGER_NO: '102',
        BU_ID: '100',
        ACCT_DESC: 'Interest Account for Individual Loan',
        GL_ACCT_CAT: '105',
        CREATED_BY: 'PCO06',
        JOURNAL_ID: 'JRNL123456',
        TRANSACTION_TYPE: 'Asset Balance',
        CR_ALLOWED: true,
        DR_ALLOWED: true,
        REC_ST: 'Active',
        POST_ALLOW: true,
        POST_FG: false,
        CONTROL_ACCT_FG: false,
        SUSPENSE_ACCT_FG: false,
        ALLOW_BAL_SWING_FG: false,
        PARENT_ID: '', // Will be updated below
        subfolderId: '', // Will be updated below
        SEG_NO: 1,
        SEG_VALUE: '12',
        SEG_DESC: 'Interest Account for Individual Loan',
        SEG_TY_CD: '',
        SEG_PLACEHLDR_ID: '',
        DELAY_GL_POSTING: false,
        SETTLEMENT_GL_ACCT_NO: '01-002-111-105-102-100',
      };

      // Generate GL_ACCT_NO
      const generateGLAccountNumber = (
        CHART_OF_ACCT_ID,
        departmentCode,
        BAL_CD,
        GL_ACCT_CAT,
        LEDGER_NO,
        BU_ID
      ) => {
        return `${CHART_OF_ACCT_ID.padStart(2, '0')}-${departmentCode.padStart(3, '0')}-${BAL_CD.padStart(3, '0')}-${GL_ACCT_CAT.padStart(3, '0')}-${LEDGER_NO.padStart(3, '0')}-${BU_ID.padStart(3, '0')}`;
      };

      const glAcctNo = generateGLAccountNumber(
        glAccountData.CHART_OF_ACCT_ID,
        targetDepartmentCode,
        glAccountData.BAL_CD,
        glAccountData.GL_ACCT_CAT,
        glAccountData.LEDGER_NO,
        glAccountData.BU_ID
      );

      // Ensure GLAccountCategory exists for categoryCode: "105"
      let glAccountCategory = await GLAccountCategory.findOne({
        organizationName,
        departmentName,
        categoryCode: glAccountData.categoryCode,
      }).session(session);

      if (!glAccountCategory) {
        glAccountCategory = new GLAccountCategory({
          categoryCode: glAccountData.categoryCode,
          categoryName: glAccountData.categoryName,
          parentCode: glAccountData.parentCode,
          level: glAccountData.level,
          organizationName,
          departmentName: glAccountData.departmentName,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await glAccountCategory.save({ session, validateBeforeSave: false });
        logger.info('Created new GLAccountCategory', { categoryCode: glAccountData.categoryCode, timestamp: new Date().toISOString() });
      }

      // Find parent GLAccountCategory for PARENT_ID
      const parentCategory = await GLAccountCategory.findOne({
        organizationName,
        departmentName: 'FINANCE',
        categoryCode: glAccountData.parentCode,
      }).session(session);

      // Create GLAccount
      const newGLAccount = new GLAccount({
        ...glAccountData,
        GL_ACCT_NO: glAcctNo,
        GL_ACCT_ID: `GL${Math.floor(100000 + Math.random() * 900000)}`,
        LEDGER_BALANCE: 0,
        CURRENCY_CODE: 'NGN',
        PARENT_ID: parentCategory ? parentCategory._id.toString() : glAccountData.parentCode,
        subfolderId: glAccountCategory._id.toString(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await newGLAccount.save({ session, validateBeforeSave: false });
      logger.info('Created GL Account', { GL_ACCT_NO: glAcctNo, timestamp: new Date().toISOString() });

      await addAuditTrail({
        EVENT_TYPE: 'CREATE_GL_ACCOUNT',
        USER_ID: glAccountData.CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: glAccountData,
        OLD_VALUE: null,
        IP_ADDRESS: '0.0.0.0',
        ENTITY_ID: newGLAccount._id,
        ENTITY_TYPE: 'GLAccount',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created GL Account ${glAcctNo} for ${organizationName} - ${departmentName}`,
        REFERENCE_NO: `GL-${newGLAccount._id}`,
        ACCOUNT_NO: glAcctNo,
        ADDITIONAL_INFO: { categoriesInitialized: categories.length },
        session,
      });

      console.log('Department and GL Account initialized successfully', {
        departments: departmentCodes,
        glAccount: { GL_ACCT_NO: glAcctNo },
        categoriesInitialized: categories.length * departmentCodes.length,
      });
    });

    await session.endSession();
  } catch (error) {
    logger.error('Error initializing department and GL account', { error: error.message, timestamp: new Date().toISOString() });
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB', { timestamp: new Date().toISOString() });
  }
}

initializeDepartmentAndGLAccount();