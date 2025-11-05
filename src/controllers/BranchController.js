import mongoose from 'mongoose';
import Branch from '../models/Branch.js';
import BusinessUnit from '../models/BusinessUnit.js';
import GLAccountCategory from '../models/GLAccountCategory.js';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js'; // Fixed typo
import { baseCategories } from './GLAccountCategoryController.js';

// Initial branches for initialization
const initialBranches = [
  { code: '000', name: 'HEAD OFFICE' },
  { code: '001', name: 'MD/CEO OFFICE' },
  { code: '002', name: 'FINANCE' },
  { code: '003', name: 'INFORMATION TECHNOLOGY' },
  { code: '004', name: 'ADMIN' },
  { code: '005', name: 'RISK' },
  { code: '006', name: 'MARKETING' },
  { code: '007', name: 'OPERATION' },
  { code: '101', name: 'RELIEF BRANCH' },
  { code: '102', name: 'WITHDRAWAL BRANCH' }
];

// Mapping of branch codes to specific category codes
const branchCategoryMapping = {
  '000': '01-110',
  '001': '02-110',
  '002': '03-110',
  '003': '04-110',
  '004': '05-110',
  '005': '06-111'
};

export const createBranch = async (req, res) => {
  logger.info('createBranch hit', { body: req.body, ip: req.ip });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      let { organizationName, branchName, branchCode, allowReservedCode } = req.body;

      // Clean up input
      organizationName = organizationName?.trim().toUpperCase();
      branchName = branchName?.trim().replace(/\s*-\s*/g, '-').toUpperCase();
      branchCode = branchCode?.trim().toUpperCase();

      // Required fields check
      if (!organizationName || !branchName || !branchCode) {
        logger.error('Missing required fields', { organizationName, branchName, branchCode });
        throw new Error('Organization Name, Branch Name, and Branch Code are required');
      }

      // Validate branchCode format (3-digit number)
      if (!/^\d{3}$/.test(branchCode)) {
        logger.error('Invalid branchCode format', { branchCode });
        throw new Error('Branch Code must be a 3-digit number');
      }

      // Check for reserved branch codes
      const reservedCodes = initialBranches.map(b => b.code.toUpperCase());
      if (reservedCodes.includes(branchCode) && !allowReservedCode) {
        logger.error('Branch code is reserved', { branchCode });
        throw new Error(`Branch Code ${branchCode} is reserved for initial branches`);
      }

      // Check if branch already exists (case-insensitive)
      const existingBranch = await Branch.findOne({
        organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
        $or: [
          { branchName: { $regex: `^${branchName}$`, $options: 'i' } },
          { branchCode: { $regex: `^${branchCode}$`, $options: 'i' } }
        ]
      }).session(session);
      if (existingBranch) {
        logger.warn('Branch already exists in organization', { organizationName, branchName, branchCode });
        throw new Error(`Branch ${branchName} or code ${branchCode} already exists in organization ${organizationName}`);
      }

      // Check if BU_ID (branchCode as string) already exists in BusinessUnit
      const existingBusinessUnit = await BusinessUnit.findOne({ BU_ID: branchCode }).session(session);
      if (existingBusinessUnit) {
        logger.warn('Business Unit with BU_ID already exists', { BU_ID: branchCode });
        throw new Error(`Business Unit with BU_ID ${branchCode} already exists`);
      }

      // Create new branch
      const newBranch = new Branch({
        organizationName,
        branchName,
        branchCode,
        createdAt: req.body.createdAt ? new Date(req.body.createdAt) : new Date(),
        updatedAt: req.body.updatedAt ? new Date(req.body.updatedAt) : new Date()
      });
      await newBranch.save({ session });

      // Create corresponding BusinessUnit
      const newBusinessUnit = new BusinessUnit({
        BU_ID: branchCode, // Use branchCode as string
        BUSINESS_UNIT: branchName,
        DESCRIPTION: branchName,
        ADDRESS: `${organizationName} ${branchName} Address`,
        created_at: newBranch.createdAt
      });
      await newBusinessUnit.save({ session });

      // Determine the category code for this branch
      const mappedCategoryCode = branchCategoryMapping[branchCode] || '06-111';

      // Initialize categories with dynamic naming
      const branchCategories = baseCategories.map((cat) => {
        let categoryName = cat.categoryName;
        if (cat.categoryCode === mappedCategoryCode) {
          categoryName = `${organizationName} ${branchName} Branch (${branchCode})`;
        }
        return {
          ...cat,
          categoryName,
          organizationName,
          branchName,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      });

      // Check for existing categories and valid parentCodes
      const existingCategories = await GLAccountCategory.find({
        organizationName,
        branchName,
        categoryCode: { $in: branchCategories.map(cat => cat.categoryCode) }
      }).session(session).lean();

      const existingCategoryCodes = new Set(existingCategories.map(cat => cat.categoryCode));
      const parentCodes = [...new Set(branchCategories.map(cat => cat.parentCode).filter(Boolean))];
      const existingParents = await GLAccountCategory.find({
        categoryCode: { $in: parentCodes },
        organizationName,
        branchName
      }).session(session).lean();

      const validParentCodes = new Set(existingParents.map(parent => parent.categoryCode));
      const newCategories = branchCategories.filter(cat => 
        !existingCategoryCodes.has(cat.categoryCode) && 
        (!cat.parentCode || validParentCodes.has(cat.parentCode))
      );

      // Log invalid categories
      const invalidCategories = branchCategories.filter(cat => 
        !existingCategoryCodes.has(cat.categoryCode) && 
        cat.parentCode && !validParentCodes.has(cat.parentCode)
      );
      if (invalidCategories.length > 0) {
        logger.warn('Skipping categories with invalid parentCode', {
          organizationName,
          branchName,
          invalidCategories: invalidCategories.map(cat => ({
            categoryCode: cat.categoryCode,
            parentCode: cat.parentCode
          }))
        });
      }

      // Insert new categories
      let categoriesInitialized = 0;
      if (newCategories.length > 0) {
        await GLAccountCategory.insertMany(newCategories, { session, ordered: false });
        categoriesInitialized = newCategories.length;
      }

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'CREATE_BRANCH',
        USER_ID: req.userId || 'system',
        ACTION: 'CREATE',
        NEW_VALUE: { organizationName, branchName, branchCode, categoryCount: branchCategories.length, BU_ID: branchCode },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || req.headers['x-forwarded-for'] || '0.0.0.0',
        ENTITY_ID: newBranch._id,
        ENTITY_TYPE: 'Branch',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created branch ${branchName} with code ${branchCode} and Business Unit BU_ID ${branchCode} in organization ${organizationName}`,
        REFERENCE_NO: `BRANCH-${newBranch._id}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: { categoriesInitialized, businessUnitId: newBusinessUnit._id },
        session
      });

      return res.status(201).json({
        message: `Branch ${branchName} and Business Unit BU_ID ${branchCode} created for organization ${organizationName}`,
        branch: newBranch,
        businessUnit: newBusinessUnit,
        categoriesInitialized
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating branch', {
      error: error.message,
      organizationName: req.body.organizationName,
      branchName: req.body.branchName,
      branchCode: req.body.branchCode
    });
    return res.status(error.message.includes('already exists') || error.message.includes('required') || error.message.includes('reserved') ? 409 : 500).json({
      message: error.message,
      code: error.message.includes('required') || error.message.includes('already exists') || error.message.includes('reserved') ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    session.endSession();
  }
};

export const createBranches = async (req, res) => {
  logger.info('createBranches hit', { body: req.body, ip: req.ip });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const branches = req.body.branches;
      if (!Array.isArray(branches) || branches.length === 0) {
        logger.error('Invalid branches array', { branches });
        throw new Error('Branches array is required and must not be empty');
      }

      const createdBranches = [];
      const failedBranches = [];

      for (const branch of branches) {
        let { organizationName, branchName, branchCode, allowReservedCode } = branch;

        // Clean up input
        organizationName = organizationName?.trim().toUpperCase();
        branchName = branchName?.trim().replace(/\s*-\s*/g, '-').toUpperCase();
        branchCode = branchCode?.trim().toUpperCase();

        // Required fields check
        if (!organizationName || !branchName || !branchCode) {
          logger.error('Missing required fields for branch', { organizationName, branchName, branchCode });
          failedBranches.push({
            organizationName,
            branchName: branchName || 'unknown',
            branchCode: branchCode || 'unknown',
            error: 'Missing required fields'
          });
          continue;
        }

        // Validate branchCode format
        if (!/^\d{3}$/.test(branchCode)) {
          logger.error('Invalid branchCode format', { branchCode });
          failedBranches.push({
            organizationName,
            branchName,
            branchCode,
            error: 'Branch Code must be a 3-digit number'
          });
          continue;
        }

        // Check for reserved branch codes
        const reservedCodes = initialBranches.map(b => b.code.toUpperCase());
        if (reservedCodes.includes(branchCode) && !allowReservedCode) {
          logger.error('Branch code is reserved', { branchCode });
          failedBranches.push({
            organizationName,
            branchName,
            branchCode,
            error: `Branch Code ${branchCode} is reserved for initial branches`
          });
          continue;
        }

        // Check if branch already exists (case-insensitive)
        const existingBranch = await Branch.findOne({
          organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
          $or: [
            { branchName: { $regex: `^${branchName}$`, $options: 'i' } },
            { branchCode: { $regex: `^${branchCode}$`, $options: 'i' } }
          ]
        }).session(session);
        if (existingBranch) {
          logger.warn('Branch already exists in organization', { organizationName, branchName, branchCode });
          failedBranches.push({
            organizationName,
            branchName,
            branchCode,
            error: `Branch ${branchName} or code ${branchCode} already exists in organization ${organizationName}`
          });
          continue;
        }

        // Check if BU_ID (branchCode as string) already exists in BusinessUnit
        const existingBusinessUnit = await BusinessUnit.findOne({ BU_ID: branchCode }).session(session);
        if (existingBusinessUnit) {
          logger.warn('Business Unit with BU_ID already exists', { BU_ID: branchCode });
          failedBranches.push({
            organizationName,
            branchName,
            branchCode,
            error: `Business Unit with BU_ID ${branchCode} already exists`
          });
          continue;
        }

        // Create new branch
        const newBranch = new Branch({
          organizationName,
          branchName,
          branchCode,
          createdAt: branch.createdAt ? new Date(branch.createdAt) : new Date(),
          updatedAt: branch.updatedAt ? new Date(branch.updatedAt) : new Date()
        });
        await newBranch.save({ session });

        // Create corresponding BusinessUnit
        const newBusinessUnit = new BusinessUnit({
          BU_ID: branchCode, // Use branchCode as string
          BUSINESS_UNIT: branchName,
          DESCRIPTION: branchName,
          ADDRESS: `${organizationName} ${branchName} Address`,
          created_at: newBranch.createdAt
        });
        await newBusinessUnit.save({ session });

        // Determine the category code for this branch
        const mappedCategoryCode = branchCategoryMapping[branchCode] || '06-111';

        // Initialize categories with dynamic naming
        const branchCategories = baseCategories.map((cat) => {
          let categoryName = cat.categoryName;
          if (cat.categoryCode === mappedCategoryCode) {
            categoryName = `${organizationName} ${branchName} Branch (${branchCode})`;
          }
          return {
            ...cat,
            categoryName,
            organizationName,
            branchName,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        });

        // Check for existing categories and valid parentCodes
        const existingCategories = await GLAccountCategory.find({
          organizationName,
          branchName,
          categoryCode: { $in: branchCategories.map(cat => cat.categoryCode) }
        }).session(session).lean();

        const existingCategoryCodes = new Set(existingCategories.map(cat => cat.categoryCode));
        const parentCodes = [...new Set(branchCategories.map(cat => cat.parentCode).filter(Boolean))];
        const existingParents = await GLAccountCategory.find({
          categoryCode: { $in: parentCodes },
          organizationName,
          branchName
        }).session(session).lean();

        const validParentCodes = new Set(existingParents.map(parent => parent.categoryCode));
        const newCategories = branchCategories.filter(cat => 
          !existingCategoryCodes.has(cat.categoryCode) && 
          (!cat.parentCode || validParentCodes.has(cat.parentCode))
        );

        // Log invalid categories
        const invalidCategories = branchCategories.filter(cat => 
          !existingCategoryCodes.has(cat.categoryCode) && 
          cat.parentCode && !validParentCodes.has(cat.parentCode)
        );
        if (invalidCategories.length > 0) {
          logger.warn('Skipping categories with invalid parentCode', {
            organizationName,
            branchName,
            invalidCategories: invalidCategories.map(cat => ({
              categoryCode: cat.categoryCode,
              parentCode: cat.parentCode
            }))
          });
        }

        // Insert new categories
        let categoriesInitialized = 0;
        if (newCategories.length > 0) {
          await GLAccountCategory.insertMany(newCategories, { session, ordered: false });
          categoriesInitialized = newCategories.length;
        }

        // Audit trail
        await addAuditTrail({
          EVENT_TYPE: 'CREATE_BRANCH',
          USER_ID: req.userId || 'system',
          ACTION: 'CREATE',
          NEW_VALUE: { organizationName, branchName, branchCode, categoryCount: branchCategories.length, BU_ID: branchCode },
          OLD_VALUE: null,
          IP_ADDRESS: req.ip || req.headers['x-forwarded-for'] || '0.0.0.0',
          ENTITY_ID: newBranch._id,
          ENTITY_TYPE: 'Branch',
          STATUS: 'SUCCESS',
          DESCRIPTION: `Created branch ${branchName} with code ${branchCode} and Business Unit BU_ID ${branchCode} in organization ${organizationName}`,
          REFERENCE_NO: `BRANCH-${newBranch._id}`,
          ACCOUNT_NO: null,
          ADDITIONAL_INFO: { categoriesInitialized, businessUnitId: newBusinessUnit._id },
          session
        });

        createdBranches.push({
          branch: newBranch,
          businessUnit: newBusinessUnit,
          categoriesInitialized
        });
      }

      if (failedBranches.length > 0) {
        return res.status(207).json({
          message: 'Some branches and business units were created successfully, but errors occurred',
          createdBranches,
          failedBranches
        });
      }

      return res.status(201).json({
        message: 'All branches and business units created successfully',
        createdBranches
      });
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating branches', {
      error: error.message,
      branches: req.body.branches
    });
    return res.status(error.message.includes('required') || error.message.includes('already exists') || error.message.includes('reserved') ? 409 : 500).json({
      message: error.message || 'Error creating branches',
      code: error.message.includes('required') || error.message.includes('already exists') || error.message.includes('reserved') ? 'INVALID_REQUEST' : 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    session.endSession();
  }
};

export const getBranch = async (req, res) => {
  logger.info('getBranch hit with params/query:', { params: req.params, query: req.query });

  try {
    let organizationName, branchName, branchCode;

    // Extract parameters from path or query
    if (req.params.organizationName && req.params.branchName && req.params.branchCode) {
      organizationName = req.params.organizationName.trim().toUpperCase();
      branchName = req.params.branchName.trim().replace(/\s*-\s*/g, '-').toUpperCase();
      branchCode = req.params.branchCode.trim().toUpperCase();
    } else if (req.query.organizationName && req.query.branchName && req.query.branchCode) {
      organizationName = req.query.organizationName.trim().toUpperCase();
      branchName = req.query.branchName.trim().replace(/\s*-\s*/g, '-').toUpperCase();
      branchCode = req.query.branchCode.trim().toUpperCase();
    } else {
      logger.error('Missing required parameters', { params: req.params, query: req.query });
      return res.status(400).json({
        success: false,
        message: 'Organization Name, Branch Name, and Branch Code are required',
        code: 'INVALID_REQUEST'
      });
    }

    // Validate parameters
    if (!/^\d{3}$/.test(branchCode)) {
      logger.error('Invalid branchCode format', { branchCode });
      return res.status(400).json({
        success: false,
        message: 'Branch Code must be a 3-digit number',
        code: 'INVALID_REQUEST'
      });
    }
    if (organizationName.length > 100 || branchName.length > 100) {
      logger.error('Parameter length exceeded', { organizationName, branchName });
      return res.status(400).json({
        success: false,
        message: 'Organization Name and Branch Name must be 100 characters or less',
        code: 'INVALID_REQUEST'
      });
    }

    // Fetch branch and business unit in parallel
    const [branch, businessUnit] = await Promise.all([
      Branch.findOne({
        organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
        branchName: { $regex: `^${branchName}$`, $options: 'i' },
        branchCode: { $regex: `^${branchCode}$`, $options: 'i' }
      }).lean().catch(err => {
        logger.error('Error fetching branch', { error: err.message });
        throw new Error('Failed to fetch branch');
      }),
      BusinessUnit.findOne({ BU_ID: branchCode }).lean().catch(err => {
        logger.warn('Error fetching business unit, returning null', { error: err.message });
        return null; // Continue even if business unit query fails
      })
    ]);

    if (!branch) {
      logger.warn('Branch not found', { organizationName, branchName, branchCode });
      return res.status(404).json({
        success: false,
        message: `Branch ${branchName} with code ${branchCode} not found in organization ${organizationName}`,
        code: 'NOT_FOUND'
      });
    }

    logger.info('Branch retrieved successfully', { organizationName, branchName, branchCode });

    return res.status(200).json({
      success: true,
      message: `Branch ${branchName} with code ${branchCode} retrieved successfully`,
      data: {
        branch,
        businessUnit: businessUnit || null
      }
    });
  } catch (error) {
    logger.error('Error fetching branch', {
      error: error.message,
      params: req.params,
      query: req.query
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching branch',
      code: 'INTERNAL_SERVER_ERROR',
      error: error.message
    });
  }
};

export const getAllBranches = async (req, res) => {
  logger.info('getAllBranches hit', { ip: req.ip, query: req.query });

  try {
    // Extract pagination parameters
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Optional filtering by organizationName
    const matchStage = req.query.organizationName
      ? { $match: { organizationName: { $regex: `^${req.query.organizationName.trim()}$`, $options: 'i' } } }
      : { $match: {} };

    // Fetch branches with BusinessUnit data
    const branches = await Branch.aggregate([
      matchStage,
      {
        $lookup: {
          from: 'businessunits', // Ensure this matches the exact collection name
          localField: 'branchCode',
          foreignField: 'BU_ID',
          as: 'businessUnit'
        }
      },
      {
        $unwind: {
          path: '$businessUnit',
          preserveNullAndEmptyArrays: true
        }
      },
      { $sort: { organizationName: 1, branchName: 1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // Get total count for pagination metadata
    const totalBranches = await Branch.countDocuments(
      req.query.organizationName
        ? { organizationName: { $regex: `^${req.query.organizationName.trim()}$`, $options: 'i' } }
        : {}
    );

    if (!branches.length) {
      logger.info('No branches found', { organizationName: req.query.organizationName || 'all' });
      return res.status(200).json({
        success: true,
        message: 'No branches found',
        data: [],
        pagination: { page, limit, total: 0 }
      });
    }

    logger.info('Branches retrieved successfully', { count: branches.length, page, limit });

    return res.status(200).json({
      success: true,
      message: 'Branches retrieved successfully',
      data: branches,
      pagination: {
        page,
        limit,
        total: totalBranches,
        pages: Math.ceil(totalBranches / limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching all branches', {
      error: error.message,
      query: req.query
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching branches',
      code: 'INTERNAL_SERVER_ERROR',
      error: error.message
    });
  }
};