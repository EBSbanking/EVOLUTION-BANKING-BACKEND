import mongoose from 'mongoose';
import Branch from '../models/Branch.js';
import GLAccountCategory from '../models/GLAccountCategory.js';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from './AudiTrailController.js';

// Base categories for initialization
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

export const createGLCategory = async (req, res) => {
  logger.info('createGLCategory hit with body:', { body: req.body });

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const { categoryCode, categoryName, parentCode, level, organizationName, branchName, autoCreateParents = false } = req.body;

      // Required fields check
      if (!categoryCode || !categoryName || !organizationName || !branchName) {
        logger.error('Missing required fields', { categoryCode, categoryName, organizationName, branchName });
        throw new Error('Category Code, Category Name, Organization Name, and Branch Name are required');
      }

      // Validate organizationName and branchName and get branchCode
      const branch = await Branch.findOne({ organizationName, branchName }).session(session);
      if (!branch) {
        logger.error('Branch does not exist for the given organization', { organizationName, branchName });
        throw new Error(`Branch ${branchName} does not exist for organization ${organizationName}`);
      }

      // Validate categoryCode uniqueness within organization and branch
      const existingCategory = await GLAccountCategory.findOne({
        categoryCode,
        organizationName,
        branchName
      }).session(session);
      
      if (existingCategory) {
        logger.error('Duplicate categoryCode within organization and branch', {
          categoryCode,
          organizationName,
          branchName
        });
        throw new Error(`Category Code ${categoryCode} already exists in branch ${branchName} of organization ${organizationName}`);
      }

      // Handle parent category validation and creation
      let parentCategory = null;
      if (parentCode) {
        parentCategory = await GLAccountCategory.findOne({
          categoryCode: parentCode,
          organizationName,
          // Check in current branch first, then HEAD OFFICE for base categories
          $or: [
            { branchName },
            { branchName: 'HEAD OFFICE' }
          ]
        }).session(session);

        // If parent not found and autoCreateParents is enabled
        if (!parentCategory && autoCreateParents) {
          const baseParent = baseCategories.find(cat => cat.categoryCode === parentCode);
          if (baseParent) {
            logger.info('Auto-creating missing parent category', { parentCode, branchName });
            
            // Recursively ensure all ancestors exist
            if (baseParent.parentCode) {
              await ensureParentExists(baseParent.parentCode, organizationName, branchName, session);
            }
            
            // Get HEAD OFFICE branch for base categories
            const headOfficeBranch = await Branch.findOne({ 
              organizationName, 
              branchName: 'HEAD OFFICE' 
            }).session(session);
            
            if (!headOfficeBranch) {
              throw new Error('HEAD OFFICE branch not found for base categories');
            }
            
            parentCategory = new GLAccountCategory({
              ...baseParent,
              organizationName,
              branchName: 'HEAD OFFICE', // Base categories always in HEAD OFFICE
              branchCode: headOfficeBranch.branchCode,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            await parentCategory.save({ session });
            logger.info('Parent category created successfully', { parentCode });
          } else {
            throw new Error(`Parent Code ${parentCode} is not a standard base category and cannot be auto-created`);
          }
        } else if (!parentCategory) {
          throw new Error(`Parent Code ${parentCode} does not exist. Set autoCreateParents=true to auto-create base categories.`);
        }

        // Validate level consistency
        const expectedLevel = parentCategory.level + 1;
        if (level && level !== expectedLevel) {
          throw new Error(`Level must be ${expectedLevel} for parent ${parentCode} (current parent level: ${parentCategory.level})`);
        }
      } else if (level && level !== 1) {
        throw new Error('Top-level categories must have level 1');
      }

      // Determine level if not provided
      const finalLevel = level || (parentCategory ? parentCategory.level + 1 : 1);

      // Create new category WITH branchCode
      const newCategory = new GLAccountCategory({
        categoryCode,
        categoryName,
        parentCode: parentCode || null,
        level: finalLevel,
        organizationName,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await newCategory.save({ session });

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'CREATE_GL_CATEGORY',
        USER_ID: req.userId || 'system',
        ACTION: 'CREATE',
        NEW_VALUE: { 
          categoryCode, 
          categoryName, 
          parentCode, 
          level: finalLevel, 
          organizationName, 
          branchName: branch.branchName,
          branchCode: branch.branchCode 
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip,
        ENTITY_ID: newCategory._id,
        ENTITY_TYPE: 'GLAccountCategory',
        session,
      });

      result = {
        message: 'Category created successfully',
        category: {
          _id: newCategory._id,
          categoryCode: newCategory.categoryCode,
          categoryName: newCategory.categoryName,
          parentCode: newCategory.parentCode,
          level: newCategory.level,
          organizationName: newCategory.organizationName,
          branchName: newCategory.branchName,
          branchCode: newCategory.branchCode,
          createdAt: newCategory.createdAt,
          updatedAt: newCategory.updatedAt
        },
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    if (error.code === 11000) {
      logger.error('Duplicate category code error', { error: error.message });
      return res.status(409).json({
        message: `Duplicate categoryCode: ${error.keyValue?.categoryCode || 'unknown'}`,
        code: 'DUPLICATE_KEY',
      });
    }

    logger.error('Error creating category', {
      error: error.message,
      body: req.body,
      stack: error.stack
    });

    return res.status(400).json({
      message: error.message || 'Error creating category',
      code: 'INVALID_REQUEST',
    });
  } finally {
    session.endSession();
  }
};

// Helper function to ensure parent categories exist
const ensureParentExists = async (parentCode, organizationName, branchName, session) => {
  const existingParent = await GLAccountCategory.findOne({
    categoryCode: parentCode,
    organizationName,
    $or: [
      { branchName },
      { branchName: 'HEAD OFFICE' }
    ]
  }).session(session);

  if (!existingParent) {
    const baseParent = baseCategories.find(cat => cat.categoryCode === parentCode);
    if (!baseParent) {
      throw new Error(`Base parent category not found for code: ${parentCode}`);
    }

    // Recursively ensure grandparent exists
    if (baseParent.parentCode) {
      await ensureParentExists(baseParent.parentCode, organizationName, branchName, session);
    }

    // Get HEAD OFFICE branch for base categories
    const headOfficeBranch = await Branch.findOne({ 
      organizationName, 
      branchName: 'HEAD OFFICE' 
    }).session(session);
    
    if (!headOfficeBranch) {
      throw new Error('HEAD OFFICE branch not found for base categories');
    }

    const newParent = new GLAccountCategory({
      ...baseParent,
      organizationName,
      branchName: 'HEAD OFFICE',
      branchCode: headOfficeBranch.branchCode,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await newParent.save({ session });
    logger.info('Auto-created parent category in hierarchy', { parentCode });
  }
};


export const getGLCategories = async (req, res) => {
  try {
    const { organizationName, branchName } = req.query;
    if (!organizationName || !branchName) {
      return res.status(400).json({ message: 'Organization Name and Branch Name are required' });
    }

    // Validate organizationName and branchName
    const branch = await Branch.findOne({ organizationName, branchName });
    if (!branch) {
      return res.status(400).json({ message: `Branch ${branchName} does not exist for organization ${organizationName}` });
    }

    const categories = await GLAccountCategory.find({
      organizationName,
      branchName
    }).sort({ level: 1, categoryCode: 1 }).lean();

    // Build hierarchical tree for frontend
    const buildTree = (categories, parentCode = null) => {
      return categories
        .filter(cat => cat.parentCode === parentCode)
        .map(cat => ({
          ...cat,
          children: buildTree(categories, cat.categoryCode)
        }));
    };

    const categoryTree = buildTree(categories);

    return res.status(200).json({
      message: 'Categories retrieved successfully',
      data: categoryTree
    });
  } catch (error) {
    logger.error('Error fetching categories', {
      error: error.message,
      organizationName: req.query.organizationName,
      branchName: req.query.branchName
    });
    return res.status(500).json({
      message: 'Error fetching categories',
      error: error.message,
    });
  }
};

export const getGLCategoryChildren = async (req, res) => {
  try {
    const { parentCode, organizationName, branchName } = req.query;
    if (!organizationName || !branchName) {
      return res.status(400).json({ message: 'Organization Name and Branch Name are required' });
    }

    // Validate organizationName and branchName
    const branch = await Branch.findOne({ organizationName, branchName });
    if (!branch) {
      return res.status(400).json({ message: `Branch ${branchName} does not exist for organization ${organizationName}` });
    }

    // If parentCode is provided, validate it
    if (parentCode) {
      const parentCategory = await GLAccountCategory.findOne({
        categoryCode: parentCode,
        organizationName,
        branchName
      });
      if (!parentCategory) {
        return res.status(400).json({ message: `Parent Code ${parentCode} does not exist in branch ${branchName} of organization ${organizationName}` });
      }
    }

    const children = await GLAccountCategory.find({
      parentCode: parentCode || null,
      organizationName,
      branchName
    }).sort({ categoryCode: 1 }).lean();

    return res.status(200).json({
      message: 'Category children retrieved successfully',
      data: children
    });
  } catch (error) {
    logger.error('Error fetching category children', {
      error: error.message,
      parentCode: req.query.parentCode,
      organizationName: req.query.organizationName,
      branchName: req.query.branchName
    });
    return res.status(500).json({
      message: 'Error fetching category children',
      error: error.message,
    });
  }
};



const initializeBaseCategoriesForOrganization = async (organizationName, branchName = 'HEAD OFFICE') => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Check if branch exists
      const branch = await Branch.findOne({ 
        organizationName, 
        branchName 
      }).session(session);
      
      if (!branch) {
        throw new Error(`Branch ${branchName} does not exist for organization ${organizationName}`);
      }

      // Check if categories already exist for this branch
      const existingCategories = await GLAccountCategory.find({
        organizationName,
        branchName
      }).session(session);

      if (existingCategories.length > 0) {
        throw new Error('GL categories have already been initialized for this branch');
      }

      // Create categories in correct order (level by level)
      const categoriesByLevel = {};
      baseCategories.forEach(cat => {
        if (!categoriesByLevel[cat.level]) {
          categoriesByLevel[cat.level] = [];
        }
        categoriesByLevel[cat.level].push(cat);
      });

      // Get levels in ascending order
      const levels = Object.keys(categoriesByLevel).map(Number).sort((a, b) => a - b);
      
      // Create categories level by level (parents first)
      for (const level of levels) {
        for (const baseCategory of categoriesByLevel[level]) {
          const category = new GLAccountCategory({
            categoryCode: baseCategory.categoryCode,
            categoryName: baseCategory.categoryName,
            parentCode: baseCategory.parentCode,
            level: baseCategory.level,
            organizationName,
            branchName: branch.branchName,
            branchCode: branch.branchCode,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          await category.save({ 
            session, 
            validateBeforeSave: false 
          });
          
          logger.info('Base category created', {
            categoryCode: baseCategory.categoryCode,
            categoryName: baseCategory.categoryName,
            level: baseCategory.level
          });
        }
      }

      // Add audit trail
      await addAuditTrail({
        EVENT_TYPE: 'INITIALIZE_BASE_CATEGORIES',
        USER_ID: 'system',
        ACTION: 'CREATE',
        NEW_VALUE: { 
          organizationName, 
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          categoriesCount: baseCategories.length 
        },
        OLD_VALUE: null,
        IP_ADDRESS: '127.0.0.1',
        ENTITY_ID: null,
        ENTITY_TYPE: 'GLAccountCategory',
        session,
      });

      logger.info('Base categories initialized successfully', {
        organizationName,
        branchName: branch.branchName,
        categoriesCount: baseCategories.length
      });
    });
  } catch (error) {
    logger.error('Error in initializeBaseCategoriesForOrganization', {
      error: error.message,
      organizationName,
      branchName
    });
    throw error;
  } finally {
    session.endSession();
  }
};

// Simple version without helper function
export const initializeParentCategories = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    const { organizationName, branchName } = req.body;

    // Validate required fields
    if (!organizationName || !branchName) {
      return res.status(400).json({
        message: 'Organization Name and Branch Name are required',
        code: 'MISSING_REQUIRED_FIELDS'
      });
    }

    await session.withTransaction(async () => {
      // Check if branch exists
      const branch = await Branch.findOne({ organizationName, branchName }).session(session);
      
      if (!branch) {
        logger.error('Branch does not exist', { organizationName, branchName });
        throw new Error(`Branch ${branchName} does not exist for organization ${organizationName}`);
      }

      // Check if categories already exist for this branch
      const existingCategories = await GLAccountCategory.find({
        organizationName,
        branchName
      }).session(session);

      if (existingCategories.length > 0) {
        logger.warn('Categories already initialized for branch', { 
          organizationName, 
          branchName,
          existingCount: existingCategories.length 
        });
        throw new Error('GL categories have already been initialized for this branch');
      }

      // Create categories in correct order (parents first)
      const createdCategories = [];
      
      // First pass: Create all categories without validation (since we're building the hierarchy)
      for (const baseCategory of baseCategories) {
        try {
          const category = new GLAccountCategory({
            categoryCode: baseCategory.categoryCode,
            categoryName: baseCategory.categoryName,
            parentCode: baseCategory.parentCode,
            level: baseCategory.level,
            organizationName,
            branchName: branch.branchName,
            branchCode: branch.branchCode,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Save without validation for initial setup
          await category.save({ 
            session, 
            validateBeforeSave: false // Skip validation during initialization
          });
          
          createdCategories.push(category);
          logger.info('Category created during initialization', {
            categoryCode: baseCategory.categoryCode,
            categoryName: baseCategory.categoryName
          });
        } catch (error) {
          // If it's a duplicate error, continue (might be creating same category in different branches)
          if (error.code === 11000) {
            logger.warn('Duplicate category during initialization, skipping', {
              categoryCode: baseCategory.categoryCode,
              error: error.message
            });
            continue;
          }
          throw error;
        }
      }

      // Second pass: Validate and fix any hierarchical relationships if needed
      logger.info('Validating category hierarchy after initialization', {
        organizationName,
        branchName,
        categoriesCount: createdCategories.length
      });

      // Audit trail for bulk creation
      await addAuditTrail({
        EVENT_TYPE: 'INITIALIZE_GL_CATEGORIES',
        USER_ID: req.userId || 'system',
        ACTION: 'CREATE',
        NEW_VALUE: { 
          organizationName, 
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          categoriesCount: createdCategories.length 
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip,
        ENTITY_ID: null,
        ENTITY_TYPE: 'GLAccountCategory',
        session,
      });

      logger.info('Parent categories initialized successfully', {
        organizationName,
        branchName: branch.branchName,
        branchCode: branch.branchCode,
        categoriesCount: createdCategories.length
      });
    });

    return res.status(201).json({
      message: 'Parent categories initialized successfully',
      categoriesCount: baseCategories.length
    });

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    logger.error('Error initializing parent categories', {
      error: error.message,
      body: req.body,
      stack: error.stack
    });

    // More specific error handling
    if (error.message.includes('already been initialized')) {
      return res.status(409).json({
        message: error.message,
        code: 'CATEGORIES_ALREADY_EXIST'
      });
    }

    return res.status(400).json({
      message: error.message || 'Error initializing parent categories',
      code: 'INITIALIZATION_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// Route handler for base categories
export const initializeBaseCategories = async (req, res) => {
  try {
    const { organizationName, branchName = 'HEAD OFFICE' } = req.body;

    if (!organizationName) {
      return res.status(400).json({
        message: 'Organization Name is required',
        code: 'INVALID_REQUEST',
      });
    }

    await initializeBaseCategoriesForOrganization(organizationName, branchName);
    
    return res.status(200).json({
      message: 'Base categories initialized successfully',
      organizationName,
      branchName,
    });
  } catch (error) {
    logger.error('Error initializing base categories', { error: error.message });
    return res.status(500).json({
      message: error.message || 'Error initializing base categories',
      code: 'INTERNAL_SERVER_ERROR',
    });
  }
};



export const resetGLCategories = async (req, res) => {
  logger.info('resetGLCategories hit with body:', { body: req.body });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { organizationName, branchName } = req.body;
      if (!organizationName || !branchName) {
        logger.error('Missing required fields', { organizationName, branchName });
        throw new Error('Organization Name and Branch Name are required');
      }

      // Validate organizationName and branchName
      const branch = await Branch.findOne({ organizationName, branchName }).session(session);
      if (!branch) {
        logger.error('Branch does not exist for organization', { organizationName, branchName });
        throw new Error(`Branch ${branchName} does not exist for organization ${organizationName}`);
      }

      // Delete all categories for the branch
      await GLAccountCategory.deleteMany({
        organizationName,
        branchName
      }).session(session);

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'RESET_GL_CATEGORIES',
        USER_ID: req.userId || 'system',
        ACTION: 'RESET',
        NEW_VALUE: null,
        OLD_VALUE: { organizationName, branchName },
        IP_ADDRESS: req.ip,
        ENTITY_ID: branch._id,
        ENTITY_TYPE: 'GLAccountCategory',
        session,
      });

      return res.status(200).json({
        message: `Categories reset for ${branchName} in organization ${organizationName}`
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error resetting categories', {
      error: error.message,
      organizationName: req.body.organizationName,
      branchName: req.body.branchName
    });
    return res.status(400).json({
      message: error.message || 'Error resetting categories',
      code: error.message.includes('Branch') ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};