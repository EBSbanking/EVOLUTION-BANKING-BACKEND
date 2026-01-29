
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js'; // Assuming this path based on previous code
import Branch from '../models/Branch.js';
import Organization from '../models/organization.js'; // Assuming this import based on previous code
import GLAccountCategory from '../models/GLAccountCategory.js'; // Import the model (adjust path as needed)

// Controller: Get all GL Account Categories
export const getAllGLAccountCategories = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { organizationName, branchName, categoryCode, parentCode, level } = req.query;

      // Build filter
      const filter = {};
      if (organizationName) filter.organizationName = organizationName.trim();
      if (branchName) filter.branchName = branchName.trim();
      if (categoryCode) filter.categoryCode = categoryCode;
      if (parentCode) filter.parentCode = parentCode;
      if (level) filter.level = parseInt(level);

      // Fetch categories
      const categories = await GLAccountCategory.find(filter).sort({ level: 1, categoryCode: 1 }).session(session);

      // Optionally compute full paths for each
      const enrichedCategories = await Promise.all(
        categories.map(async (cat) => ({
          ...cat.toObject(),
          fullPath: await cat.getFullPath(),
        }))
      );

      logger.info('Fetched GL account categories', { count: enrichedCategories.length, filter });

      return res.status(200).json({
        success: true,
        message: 'GL account categories fetched successfully',
        data: enrichedCategories,
      });
    });
  } catch (error) {
    logger.error('Error fetching GL account categories', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account categories',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// Controller: Get GL Account Category by ID or Code
export const getGLAccountCategoryById = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const category = await GLAccountCategory.findById(id).session(session);
      if (!category) {
        return res.status(404).json({
          success: false,
          message: `GL account category with ID ${id} not found`,
        });
      }

      const enrichedCategory = {
        ...category.toObject(),
        fullPath: await category.getFullPath(),
      };

      logger.info('Fetched GL account category by ID', { id });

      return res.status(200).json({
        success: true,
        message: 'GL account category fetched successfully',
        data: enrichedCategory,
      });
    });
  } catch (error) {
    logger.error('Error fetching GL account category by ID', {
      error: error.message,
      stack: error.stack,
      id: req.params.id,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account category',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// Controller: Create GL Account Category
export const createGLAccountCategory = async (req, res) => {
  logger.info('createGLAccountCategory hit with body:', { body: req.body });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const {
        categoryCode,
        categoryName,
        organizationName,
        branchName,
        parentCode,
        level,
        CREATED_BY,
      } = req.body;

      // Required fields check
      const criticalFields = {
        categoryCode,
        categoryName,
        organizationName,
        branchName,
        level,
        CREATED_BY,
      };
      const missingFields = Object.entries(criticalFields)
        .filter(([_, value]) => value === null || value === undefined || value === '')
        .map(([key]) => key);
      if (missingFields.length > 0) {
        logger.error('Missing required fields', { missingFields });
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      const trimmedOrgName = organizationName.trim();

      // Validate and create organization if not exists
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

      // Validate and create branch if not exists
      let branch = await Branch.findOne({
        organizationName: trimmedOrgName,
        branchName,
      }).session(session);
      if (!branch) {
        logger.info('Branch not found, creating new', { organizationName: trimmedOrgName, branchName });
        branch = new Branch({
          organizationName: trimmedOrgName,
          branchName,
          branchCode: `BR-${Date.now()}`, // Generate a default code or require it
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        await branch.save({ session });
        logger.info('Created new branch', { organizationName: trimmedOrgName, branchName });
        await addAuditTrail({
          EVENT_TYPE: 'CREATE_BRANCH',
          USER_ID: CREATED_BY,
          ACTION: 'CREATE',
          NEW_VALUE: { organizationName: trimmedOrgName, branchName, branchCode: branch.branchCode },
          OLD_VALUE: null,
          IP_ADDRESS: req.ip || '0.0.0.0',
          ENTITY_ID: branch._id,
          ENTITY_TYPE: 'Branch',
          STATUS: 'SUCCESS',
          DESCRIPTION: `Created branch ${branchName} in organization ${trimmedOrgName}`,
          REFERENCE_NO: `BRANCH-${branch._id}`,
          ACCOUNT_NO: null,
          ADDITIONAL_INFO: {},
          session,
        });
      }

      // Check for duplicate categoryCode in the same org/branch
      const existingCategory = await GLAccountCategory.findOne({
        categoryCode,
        organizationName: trimmedOrgName,
        branchName,
      }).session(session);
      if (existingCategory) {
        logger.error('Duplicate categoryCode found', { categoryCode, organizationName: trimmedOrgName, branchName });
        throw new Error(`Category code ${categoryCode} already exists in ${trimmedOrgName}/${branchName}`);
      }

      // Validate parentCode if provided
      if (parentCode) {
        const parent = await GLAccountCategory.findOne({
          categoryCode: parentCode,
          organizationName: trimmedOrgName,
          branchName,
        }).session(session);
        if (!parent) {
          throw new Error(`Parent category with code ${parentCode} not found in ${trimmedOrgName}/${branchName}`);
        }
        // Ensure level is parent.level + 1
        if (level !== (parent.level + 1)) {
          throw new Error(`Level must be ${parent.level + 1} for child of ${parentCode}`);
        }
      }

      // Create new category
      const newCategory = new GLAccountCategory({
        categoryCode,
        categoryName: categoryName.trim(),
        organizationName: trimmedOrgName,
        branchName,
        parentCode,
        level: parseInt(level),
        CREATED_BY,
      });

      await newCategory.save({ session });
      logger.info('Created new GL account category', { categoryCode, organizationName: trimmedOrgName, branchName });

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'CREATE_GL_ACCOUNT_CATEGORY',
        USER_ID: CREATED_BY,
        ACTION: 'CREATE',
        NEW_VALUE: {
          categoryCode,
          categoryName: newCategory.categoryName,
          organizationName: trimmedOrgName,
          branchName,
          parentCode,
          level,
        },
        OLD_VALUE: null,
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: newCategory._id,
        ENTITY_TYPE: 'GLAccountCategory',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Created GL account category ${categoryCode} in ${trimmedOrgName}/${branchName}`,
        REFERENCE_NO: `CAT-${newCategory._id}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {},
        session,
      });

      const enrichedCategory = {
        ...newCategory.toObject(),
        fullPath: await newCategory.getFullPath(),
      };

      result = {
        success: true,
        message: 'GL account category created successfully',
        data: enrichedCategory,
      };
    });

    return res.status(201).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating GL account category', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });
    return res.status(400).json({
      success: false,
      message: 'Error creating GL account category',
      error: error.message,
      code: error.message.includes('Missing') || error.message.includes('Invalid') || error.message.includes('Duplicate') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// Controller: Update GL Account Category
export const updateGLAccountCategory = async (req, res) => {
  logger.info('updateGLAccountCategory hit with body:', { body: req.body, params: req.params });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const {
        categoryCode,
        categoryName,
        parentCode,
        level,
        UPDATED_BY,
      } = req.body;

      // Find existing category
      const existingCategory = await GLAccountCategory.findById(id).session(session);
      if (!existingCategory) {
        throw new Error(`GL account category with ID ${id} not found`);
      }

      // Validate organization and branch consistency
      if (req.body.organizationName && req.body.organizationName.trim() !== existingCategory.organizationName) {
        throw new Error('Cannot update organizationName');
      }
      if (req.body.branchName && req.body.branchName !== existingCategory.branchName) {
        throw new Error('Cannot update branchName');
      }

      // Update fields if provided
      if (categoryCode && categoryCode !== existingCategory.categoryCode) {
        // Check for duplicate new code
        const duplicate = await GLAccountCategory.findOne({
          categoryCode,
          organizationName: existingCategory.organizationName,
          branchName: existingCategory.branchName,
          _id: { $ne: id },
        }).session(session);
        if (duplicate) {
          throw new Error(`Category code ${categoryCode} already exists in ${existingCategory.organizationName}/${existingCategory.branchName}`);
        }
        existingCategory.categoryCode = categoryCode;
      }

      if (categoryName) existingCategory.categoryName = categoryName.trim();
      if (parentCode !== undefined) {
        if (parentCode) {
          const parent = await GLAccountCategory.findOne({
            categoryCode: parentCode,
            organizationName: existingCategory.organizationName,
            branchName: existingCategory.branchName,
          }).session(session);
          if (!parent) {
            throw new Error(`Parent category with code ${parentCode} not found`);
          }
          existingCategory.parentCode = parentCode;
          existingCategory.level = parent.level + 1;
        } else {
          existingCategory.parentCode = null;
          existingCategory.level = 1;
        }
      } else if (level !== undefined) {
        existingCategory.level = parseInt(level);
      }

      existingCategory.UPDATED_BY = UPDATED_BY;
      existingCategory.updatedAt = new Date();

      await existingCategory.save({ session });
      logger.info('Updated GL account category', { id });

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE_GL_ACCOUNT_CATEGORY',
        USER_ID: UPDATED_BY,
        ACTION: 'UPDATE',
        NEW_VALUE: {
          categoryCode: existingCategory.categoryCode,
          categoryName: existingCategory.categoryName,
          parentCode: existingCategory.parentCode,
          level: existingCategory.level,
        },
        OLD_VALUE: {
          categoryCode: req.body.categoryCode ? existingCategory.categoryCode : null, // Track changes
          categoryName: req.body.categoryName ? existingCategory.categoryName : null,
          parentCode: req.body.parentCode !== undefined ? existingCategory.parentCode : null,
          level: req.body.level !== undefined ? existingCategory.level : null,
        },
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: id,
        ENTITY_TYPE: 'GLAccountCategory',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Updated GL account category ${existingCategory.categoryCode}`,
        REFERENCE_NO: `CAT-${id}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {},
        session,
      });

      const enrichedCategory = {
        ...existingCategory.toObject(),
        fullPath: await existingCategory.getFullPath(),
      };

      result = {
        success: true,
        message: 'GL account category updated successfully',
        data: enrichedCategory,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error updating GL account category', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      params: req.params,
      timestamp: new Date(),
    });
    return res.status(400).json({
      success: false,
      message: 'Error updating GL account category',
      error: error.message,
      code: error.message.includes('not found') || error.message.includes('Invalid') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// Controller: Delete GL Account Category
export const deleteGLAccountCategory = async (req, res) => {
  logger.info('deleteGLAccountCategory hit with params:', { params: req.params });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const { DELETED_BY } = req.body;

      // Find and check for children
      const existingCategory = await GLAccountCategory.findById(id).session(session);
      if (!existingCategory) {
        throw new Error(`GL account category with ID ${id} not found`);
      }

      const hasChildren = await GLAccountCategory.countDocuments({
        parentCode: existingCategory.categoryCode,
        organizationName: existingCategory.organizationName,
        branchName: existingCategory.branchName,
      }).session(session);
      if (hasChildren > 0) {
        throw new Error(`Cannot delete category ${existingCategory.categoryCode} as it has child categories`);
      }

      // Soft delete or hard delete? Assuming hard delete for now
      const deletedCategory = await GLAccountCategory.findByIdAndDelete(id).session(session);

      logger.info('Deleted GL account category', { id });

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'DELETE_GL_ACCOUNT_CATEGORY',
        USER_ID: DELETED_BY,
        ACTION: 'DELETE',
        NEW_VALUE: null,
        OLD_VALUE: {
          categoryCode: deletedCategory.categoryCode,
          categoryName: deletedCategory.categoryName,
          organizationName: deletedCategory.organizationName,
          branchName: deletedCategory.branchName,
          parentCode: deletedCategory.parentCode,
          level: deletedCategory.level,
        },
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: id,
        ENTITY_TYPE: 'GLAccountCategory',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Deleted GL account category ${deletedCategory.categoryCode}`,
        REFERENCE_NO: `CAT-${id}`,
        ACCOUNT_NO: null,
        ADDITIONAL_INFO: {},
        session,
      });

      result = {
        success: true,
        message: 'GL account category deleted successfully',
        data: deletedCategory,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error deleting GL account category', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
      timestamp: new Date(),
    });
    return res.status(400).json({
      success: false,
      message: 'Error deleting GL account category',
      error: error.message,
      code: error.message.includes('not found') || error.message.includes('Cannot delete') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};