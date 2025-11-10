// controllers/businessUnitController.js
import BusinessUnit from '../models/BusinessUnit.js';
import Branch from '../models/Branch.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js';
import mongoose from 'mongoose';

// @desc    Create a new business unit
// @route   POST /api/business-units
// @access  Private
export const createBusinessUnit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { branchCode, branchName, DESCRIPTION, ADDRESS, branch } = req.body;
    const userId = req.user?._id;

    logger.info('Creating new business unit', { 
      branchCode, 
      branchName, 
      branch,
      userId 
    });

    // Validate required fields - using branchCode and branchName instead of BU_ID and BUSINESS_UNIT
    if (!branchCode || !branchName || !DESCRIPTION || !ADDRESS) {
      await session.abortTransaction();
      logger.error('Missing required fields', { branchCode, branchName, DESCRIPTION, ADDRESS });
      
      return res.status(400).json({
        success: false,
        message: 'All fields (branchCode, branchName, DESCRIPTION, ADDRESS) are required',
        code: 'INVALID_REQUEST'
      });
    }

    // Check if branch exists if provided
    if (branch) {
      const branchExists = await Branch.findById(branch).session(session);
      if (!branchExists) {
        await session.abortTransaction();
        logger.error('Branch not found', { branch });
        
        return res.status(400).json({
          success: false,
          message: 'Branch not found',
          code: 'BRANCH_NOT_FOUND'
        });
      }
    }

    // Check if business unit with branchCode already exists
    const existingBusinessUnit = await BusinessUnit.findOne({ branchCode }).session(session);
    if (existingBusinessUnit) {
      await session.abortTransaction();
      logger.warn('Business Unit creation failed - duplicate branchCode', { branchCode });
      
      return res.status(409).json({
        success: false,
        message: `Business Unit with branchCode ${branchCode} already exists`,
        code: 'DUPLICATE_KEY'
      });
    }

    const businessUnit = new BusinessUnit({
      branchCode, // Using branchCode instead of BU_ID
      branchName, // Using branchName instead of BUSINESS_UNIT
      DESCRIPTION,
      ADDRESS,
      branch: branch || undefined,
      created_at: new Date()
    });

    const savedBusinessUnit = await businessUnit.save({ session });

    // Add audit trail
    await addAuditTrail({
      user: userId,
      action: 'CREATE',
      entity: 'BusinessUnit',
      entityId: savedBusinessUnit._id,
      description: `Created business unit: ${branchName} (${branchCode})`,
      oldValues: {},
      newValues: {
        branchCode,
        branchName,
        DESCRIPTION,
        ADDRESS,
        branch
      },
      timestamp: new Date()
    }, session);

    await session.commitTransaction();
    logger.info('Business Unit created successfully', { 
      businessUnitId: savedBusinessUnit._id, 
      branchCode, 
      branchName 
    });

    res.status(201).json({
      success: true,
      message: `Business Unit with branchCode: ${savedBusinessUnit.branchCode}, branchName: "${savedBusinessUnit.branchName}" created successfully`,
      data: savedBusinessUnit
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating business unit', { 
      error: error.message, 
      branchCode: req.body.branchCode 
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(err => err.message).join(', ')
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating business unit',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get all business units with optional branch population
// @route   GET /api/business-units
// @access  Private
export const getAllBusinessUnits = async (req, res) => {
  try {
    const { includeBranch, branchId } = req.query;
    
    logger.debug('Fetching all business units', { 
      includeBranch, 
      branchId,
      userId: req.user?._id 
    });

    let query = {};
    if (branchId) {
      query.branch = branchId;
    }

    let businessUnits;
    
    if (includeBranch === 'true') {
      businessUnits = await BusinessUnit.find(query).populate({
        path: 'branch',
        select: 'branchName branchCode organizationName'
      });
    } else {
      businessUnits = await BusinessUnit.find(query);
    }

    logger.debug('Business units fetched successfully', { count: businessUnits.length });

    res.status(200).json({
      success: true,
      count: businessUnits.length,
      data: businessUnits
    });
  } catch (error) {
    logger.error('Error fetching business units', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business units',
      error: error.message
    });
  }
};

// @desc    Get business unit by ID
// @route   GET /api/business-units/:id
// @access  Private
export const getBusinessUnitById = async (req, res) => {
  try {
    const { includeBranch } = req.query;
    
    logger.debug('Fetching business unit by ID', { 
      businessUnitId: req.params.id, 
      includeBranch,
      userId: req.user?._id 
    });

    let businessUnit;
    
    if (includeBranch === 'true') {
      businessUnit = await BusinessUnit.findById(req.params.id).populate({
        path: 'branch',
        select: 'branchName branchCode organizationName'
      });
    } else {
      businessUnit = await BusinessUnit.findById(req.params.id);
    }

    if (!businessUnit) {
      logger.warn('Business Unit not found', { businessUnitId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Business Unit not found',
        code: 'NOT_FOUND'
      });
    }

    logger.debug('Business Unit fetched successfully', { businessUnitId: businessUnit._id });

    res.status(200).json({
      success: true,
      data: businessUnit
    });
  } catch (error) {
    logger.error('Error fetching business unit by ID', { 
      error: error.message,
      businessUnitId: req.params.id 
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid Business Unit ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business unit',
      error: error.message
    });
  }
};

// @desc    Get business unit by branchCode
// @route   GET /api/business-units/code/:branchCode
// @access  Private
export const getBusinessUnitByCode = async (req, res) => {
  try {
    const { includeBranch } = req.query;
    
    logger.debug('Fetching business unit by branchCode', { 
      branchCode: req.params.branchCode, 
      includeBranch,
      userId: req.user?._id 
    });

    let businessUnit;
    
    if (includeBranch === 'true') {
      businessUnit = await BusinessUnit.findOne({ branchCode: req.params.branchCode }).populate({
        path: 'branch',
        select: 'branchName branchCode organizationName'
      });
    } else {
      businessUnit = await BusinessUnit.findOne({ branchCode: req.params.branchCode });
    }

    if (!businessUnit) {
      logger.warn('Business Unit not found by branchCode', { branchCode: req.params.branchCode });
      return res.status(404).json({
        success: false,
        message: 'Business Unit not found',
        code: 'NOT_FOUND'
      });
    }

    logger.debug('Business Unit fetched by branchCode successfully', { branchCode: businessUnit.branchCode });

    res.status(200).json({
      success: true,
      data: businessUnit
    });
  } catch (error) {
    logger.error('Error fetching business unit by branchCode', { 
      error: error.message,
      branchCode: req.params.branchCode 
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business unit',
      error: error.message
    });
  }
};

// @desc    Update business unit by ID
// @route   PUT /api/business-units/:id
// @access  Private
export const updateBusinessUnit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { branchCode, branchName, DESCRIPTION, ADDRESS, branch } = req.body;
    const userId = req.user?._id;

    logger.info('Updating business unit', { 
      businessUnitId: req.params.id, 
      updates: { branchCode, branchName, DESCRIPTION, ADDRESS, branch },
      userId 
    });

    // Get current business unit data for audit trail
    const currentBusinessUnit = await BusinessUnit.findById(req.params.id).session(session);
    if (!currentBusinessUnit) {
      await session.abortTransaction();
      logger.warn('Business Unit not found for update', { businessUnitId: req.params.id });
      
      return res.status(404).json({
        success: false,
        message: 'Business Unit not found',
        code: 'NOT_FOUND'
      });
    }

    // Check if new branchCode already exists (excluding current business unit)
    if (branchCode && branchCode !== currentBusinessUnit.branchCode) {
      const existingBusinessUnit = await BusinessUnit.findOne({ 
        branchCode, 
        _id: { $ne: req.params.id } 
      }).session(session);
      
      if (existingBusinessUnit) {
        await session.abortTransaction();
        logger.warn('Business Unit update failed - duplicate branchCode', { branchCode });
        
        return res.status(409).json({
          success: false,
          message: `Business Unit with branchCode ${branchCode} already exists`,
          code: 'DUPLICATE_KEY'
        });
      }
    }

    // Check if branch exists if provided
    if (branch) {
      const branchExists = await Branch.findById(branch).session(session);
      if (!branchExists) {
        await session.abortTransaction();
        logger.error('Branch not found', { branch });
        
        return res.status(400).json({
          success: false,
          message: 'Branch not found',
          code: 'BRANCH_NOT_FOUND'
        });
      }
    }

    const oldValues = {
      branchCode: currentBusinessUnit.branchCode,
      branchName: currentBusinessUnit.branchName,
      DESCRIPTION: currentBusinessUnit.DESCRIPTION,
      ADDRESS: currentBusinessUnit.ADDRESS,
      branch: currentBusinessUnit.branch
    };

    const updatedBusinessUnit = await BusinessUnit.findByIdAndUpdate(
      req.params.id,
      { 
        branchCode, 
        branchName, 
        DESCRIPTION, 
        ADDRESS, 
        branch,
        updated_at: new Date()
      },
      { new: true, runValidators: true, session }
    );

    // Add audit trail
    await addAuditTrail({
      user: userId,
      action: 'UPDATE',
      entity: 'BusinessUnit',
      entityId: updatedBusinessUnit._id,
      description: `Updated business unit: ${branchName} (${branchCode})`,
      oldValues,
      newValues: {
        branchCode,
        branchName,
        DESCRIPTION,
        ADDRESS,
        branch
      },
      timestamp: new Date()
    }, session);

    await session.commitTransaction();
    logger.info('Business Unit updated successfully', { 
      businessUnitId: updatedBusinessUnit._id, 
      branchName: updatedBusinessUnit.branchName 
    });

    res.status(200).json({
      success: true,
      message: 'Business Unit updated successfully',
      data: updatedBusinessUnit
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating business unit', { 
      error: error.message,
      businessUnitId: req.params.id 
    });

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: Object.values(error.errors).map(err => err.message).join(', ')
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid Business Unit ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating business unit',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Delete business unit by ID
// @route   DELETE /api/business-units/:id
// @access  Private
export const deleteBusinessUnit = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?._id;

    logger.info('Deleting business unit', { 
      businessUnitId: req.params.id,
      userId 
    });

    const businessUnitToDelete = await BusinessUnit.findById(req.params.id).session(session);
    if (!businessUnitToDelete) {
      await session.abortTransaction();
      logger.warn('Business Unit not found for deletion', { businessUnitId: req.params.id });
      
      return res.status(404).json({
        success: false,
        message: 'Business Unit not found',
        code: 'NOT_FOUND'
      });
    }

    const deletedBusinessUnit = await BusinessUnit.findByIdAndDelete(req.params.id).session(session);

    // Add audit trail
    await addAuditTrail({
      user: userId,
      action: 'DELETE',
      entity: 'BusinessUnit',
      entityId: deletedBusinessUnit._id,
      description: `Deleted business unit: ${businessUnitToDelete.branchName} (${businessUnitToDelete.branchCode})`,
      oldValues: {
        branchCode: businessUnitToDelete.branchCode,
        branchName: businessUnitToDelete.branchName,
        DESCRIPTION: businessUnitToDelete.DESCRIPTION,
        ADDRESS: businessUnitToDelete.ADDRESS,
        branch: businessUnitToDelete.branch
      },
      newValues: {},
      timestamp: new Date()
    }, session);

    await session.commitTransaction();
    logger.info('Business Unit deleted successfully', { 
      businessUnitId: deletedBusinessUnit._id,
      branchName: deletedBusinessUnit.branchName 
    });

    res.status(200).json({
      success: true,
      message: 'Business Unit deleted successfully',
      data: deletedBusinessUnit
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deleting business unit', { 
      error: error.message,
      businessUnitId: req.params.id 
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid Business Unit ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error deleting business unit',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get business units by branch
// @route   GET /api/business-units/branch/:branchId
// @access  Private
export const getBusinessUnitsByBranch = async (req, res) => {
  try {
    logger.debug('Fetching business units by branch', { 
      branchId: req.params.branchId,
      userId: req.user?._id 
    });

    const branch = await Branch.findById(req.params.branchId);
    
    if (!branch) {
      logger.warn('Branch not found when fetching business units', { branchId: req.params.branchId });
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    const businessUnits = await BusinessUnit.find({ branch: req.params.branchId })
      .select('branchCode branchName DESCRIPTION ADDRESS created_at updated_at')
      .sort({ created_at: -1 });

    logger.debug('Business units fetched successfully for branch', { 
      branchId: req.params.branchId,
      businessUnitsCount: businessUnits.length 
    });

    res.status(200).json({
      success: true,
      data: {
        branch: {
          _id: branch._id,
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          organizationName: branch.organizationName
        },
        businessUnits,
        count: businessUnits.length
      }
    });
  } catch (error) {
    logger.error('Error fetching business units by branch', { 
      error: error.message,
      branchId: req.params.branchId 
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid Branch ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business units',
      error: error.message
    });
  }
};

// Helper function for role validation
const validateBusinessUnitRoles = (roleId) => {
  if (!ROLE_MAPPING[roleId]) {
    throw new Error('Invalid Role ID');
  }
  return ROLE_MAPPING[roleId];
};

// @desc    Get accessible business units for user
// @route   GET /api/business-units/user/:userId/accessible
// @access  Private
export const getAccessibleBUsForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    logger.debug('Fetching accessible business units for user', { userId });

    const userRole = await UserRole.findOne({ USER_ID: userId }).populate('permissions');

    if (!userRole || !userRole.permissions) {
      logger.warn('User role or permissions not found', { userId });
      return res.status(404).json({ 
        success: false, 
        message: 'User role or permissions not found.' 
      });
    }

    const userPermissions = Object.values(userRole.permissions).filter(value =>
      ['ALL BUSINESS UNIT', 'PARENT BUSINESS UNIT STRUCTURE', 'OWN BUSINESS UNIT'].includes(value)
    );

    // ✅ This is correct and unchanged
    const accessibleBUs = await getAccessibleBusinessUnits(userPermissions, userRole.Business_Unit);

    logger.debug('Accessible business units fetched successfully', { 
      userId, 
      count: accessibleBUs.length 
    });

    return res.status(200).json({ 
      success: true, 
      businessUnits: accessibleBUs 
    });
  } catch (err) {
    logger.error('Error fetching accessible business units', { 
      error: err.message,
      userId: req.params.userId 
    });
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching accessible business units', 
      error: err.message 
    });
  }
};