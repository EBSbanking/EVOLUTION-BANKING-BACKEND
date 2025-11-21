import Branch from '../models/Branch.js';
import mongoose from 'mongoose';
import BusinessUnit from '../models/BusinessUnit.js';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js';

// @desc    Create a new branch (with auto-linked BusinessUnit)
// @route   POST /api/branches
// @access  Private
export const createBranch = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    let { 
      organizationName, 
      organizationCode, 
      branchName, 
      branchCode, 
      branchType = 'MAIN', // Add branchType with default
      DESCRIPTION, 
      ADDRESS, 
      status 
    } = req.body;
    const userId = req.user?._id;

    // Normalize inputs
    organizationName = organizationName?.trim().toUpperCase() || 'DEFAULT_ORG';
    organizationCode = Number(organizationCode); // Convert to number
    branchName = branchName?.trim().replace(/\s*-\s*/g, '-').toUpperCase();
    branchCode = branchCode?.trim();
    DESCRIPTION = DESCRIPTION?.trim() || branchName;
    ADDRESS = ADDRESS?.trim() || `${organizationName} ${branchName} Address`;
    status = status ? status.toUpperCase() : 'ACTIVE';

    // Validate branch code format (3-digit number)
    if (!/^\d{3}$/.test(branchCode)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Branch code must be a 3-digit number'
      });
    }

    logger.info('Creating new branch', { 
      organizationName, 
      organizationCode,
      branchName, 
      branchCode,
      branchType,
      DESCRIPTION,
      ADDRESS,
      status,
      userId 
    });

    // Validate required fields - ADD organizationCode
    if (!organizationName || !organizationCode || !branchName || !branchCode) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Organization Name, Organization Code, Branch Name, and Branch Code are required'
      });
    }

    // Validate organizationCode is a valid number
    if (isNaN(organizationCode)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Organization Code must be a valid number'
      });
    }

    // Check if branch already exists (by organizationCode + branchCode combination)
    const existingBranch = await Branch.findOne({ 
      organizationCode, 
      branchCode 
    }).session(session);
    
    if (existingBranch) {
      await session.abortTransaction();
      logger.warn('Branch creation failed - duplicate branch code in organization', { 
        organizationCode, 
        branchCode 
      });
      
      return res.status(400).json({
        success: false,
        message: `Branch code ${branchCode} already exists in organization ${organizationCode}`
      });
    }

    // Check if BusinessUnit with BU_ID (branchCode) already exists
    const existingBusinessUnit = await BusinessUnit.findOne({ BU_ID: branchCode }).session(session);
    if (existingBusinessUnit) {
      await session.abortTransaction();
      logger.warn('Business Unit creation failed - duplicate BU_ID', { branchCode });
      
      return res.status(409).json({
        success: false,
        message: `Business Unit with BU_ID ${branchCode} already exists`,
        code: 'DUPLICATE_KEY'
      });
    }

    // Create and save Branch - INCLUDE ALL REQUIRED FIELDS
    const branchData = {
      organizationName,
      organizationCode, // ✅ ADD THIS REQUIRED FIELD
      branchName,
      branchCode,
      branchType, // ✅ ADD THIS FIELD
      address: ADDRESS,
      status: 'ACTIVE' // Use uppercase as per schema enum
    };

    console.log('Creating branch with data:', branchData); // Debug log

    const branch = new Branch(branchData);
    const savedBranch = await branch.save({ session });

    // Create and save linked BusinessUnit (explicit mapping to schema fields)
    const businessUnitData = {
      BU_ID: branchCode,
      BUSINESS_UNIT: branchName,
      DESCRIPTION,
      ADDRESS,
      branch: savedBranch._id,
      created_at: new Date()
    };
    const businessUnit = new BusinessUnit(businessUnitData);
    const savedBusinessUnit = await businessUnit.save({ session });

    // Audit trails
    await addAuditTrail({
      user: userId,
      action: 'CREATE',
      entity: 'Branch',
      entityId: savedBranch._id,
      description: `Created branch: ${branchName} (${branchCode}) for organization ${organizationName}`,
      oldValues: {},
      newValues: branchData,
      timestamp: new Date()
    }, session);

    await addAuditTrail({
      user: userId,
      action: 'CREATE',
      entity: 'BusinessUnit',
      entityId: savedBusinessUnit._id,
      description: `Created business unit: ${branchName} (${branchCode}) for branch ${savedBranch._id}`,
      oldValues: {},
      newValues: businessUnitData,
      timestamp: new Date()
    }, session);

    await session.commitTransaction();
    logger.info('Branch and Business Unit created successfully', { 
      branchId: savedBranch._id, 
      businessUnitId: savedBusinessUnit._id,
      organizationName,
      organizationCode,
      branchName, 
      branchCode 
    });

    res.status(201).json({
      success: true,
      message: `Branch ${branchName} (${branchCode}) created successfully for organization ${organizationName}`,
      data: {
        branch: savedBranch,
        businessUnit: savedBusinessUnit
      }
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    
    console.error('Branch creation error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    logger.error('Error creating branch and business unit', { 
      error: error.message,
      organizationCode: req.body.organizationCode,
      branchCode: req.body.branchCode,
      body: req.body
    });

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors)
        .map(err => err.message)
        .join('; ');
      return res.status(400).json({
        success: false,
        message: messages
      });
    }
    
    // Handle duplicate key errors specifically
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Branch code already exists in this organization'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating branch and business unit',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get all branches with optional business units and migrated data
// @route   GET /api/branches
// @access  Private
export const getAllBranches = async (req, res) => {
  try {
    const { includeBusinessUnits, organizationName, organizationCode, branchType, includeLegacy, migratedOnly, status } = req.query;
    
    logger.debug('Fetching all branches', { 
      includeBusinessUnits, 
      organizationName,
      organizationCode,
      branchType,
      includeLegacy,
      migratedOnly,
      status,
      userId: req.user?._id 
    });

    // Base query filters - UPDATED WITH NEW FIELDS
    const baseQuery = {};
    if (organizationName) {
      baseQuery.organizationName = new RegExp(organizationName, 'i');
    }
    if (organizationCode) {
      baseQuery.organizationCode = Number(organizationCode);
    }
    if (branchType) {
      baseQuery.branchType = branchType.toUpperCase();
    }
    if (status) {
      baseQuery.status = status.toUpperCase();
    }

    // Fetch new branches from 'branches' collection - UPDATED SELECT FIELDS
    let newBranches = await Branch.find(baseQuery)
      .select(includeLegacy === 'true' 
        ? 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
        : 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt status'
      )
      .sort({ organizationCode: 1, branchCode: 1 });

    if (migratedOnly === 'true') {
      newBranches = newBranches.filter(b => b.migration_id);
    }

    // Fetch legacy branches from 'branch' collection
    let legacyBranches = [];
    if (includeLegacy !== 'false' || migratedOnly !== 'true') {
      const legacyQuery = organizationName ? { organizationName: new RegExp(organizationName, 'i') } : {};
      legacyBranches = await mongoose.connection.db.collection('branch').find(legacyQuery).toArray();

      // Map legacy fields to match new schema/format - UPDATED WITH NEW FIELDS
      legacyBranches = legacyBranches.map(legacy => ({
        _id: legacy._id,
        organizationName: legacy.organizationName || 'DEFAULT_ORG',
        organizationCode: legacy.organizationCode || 1, // Default organization code
        branchName: (legacy.name || '').toUpperCase().trim() || 'UNKNOWN BRANCH',
        branchCode: legacy.branchCode || generateBranchCode(legacy.name || ''),
        branchType: legacy.branchType || 'MAIN', // Default branch type
        address: legacy.office_address || '',
        
        // Legacy-specific fields
        id: legacy.id,
        external_id: legacy.external_id || '',
        parent: legacy.parent,
        office_address: legacy.office_address,
        country: legacy.country,
        state: legacy.state,
        city: legacy.city,
        phone: legacy.phone,
        email: legacy.email,
        branch_manager: legacy.branch_manager,
        opening_date: legacy.opening_date,
        branch_type: legacy.branch_type,
        status: (legacy.status || 'ACTIVE').toUpperCase(),
        created_by: legacy.created_by,
        operational_model: legacy.operational_model,
        approved_by: legacy.approved_by,
        migration_id: legacy.migration_id || legacy._id,

        createdAt: legacy.opening_date || legacy.createdAt || new Date(),
        updatedAt: legacy.updatedAt || new Date()
      }));

      if (migratedOnly === 'true') {
        legacyBranches = legacyBranches;
      }
    }

    // Merge: new + mapped legacy
    let allBranches = [...newBranches, ...legacyBranches];

    // Apply additional filters post-merge
    if (organizationName) {
      allBranches = allBranches.filter(b => 
        b.organizationName.toLowerCase().includes(organizationName.toLowerCase())
      );
    }
    if (organizationCode) {
      const orgCode = Number(organizationCode);
      allBranches = allBranches.filter(b => b.organizationCode === orgCode);
    }
    if (branchType) {
      const typeUpper = branchType.toUpperCase();
      allBranches = allBranches.filter(b => b.branchType === typeUpper);
    }
    if (status) {
      const statusUpper = status.toUpperCase();
      allBranches = allBranches.filter(b => b.status === statusUpper);
    }

    // Optional: Populate businessUnits
    if (includeBusinessUnits === 'true') {
      const newBranchIds = newBranches.map(b => b._id);
      const populatedNew = await BusinessUnit.find({ 
        branch: { $in: newBranchIds } 
      });
      
      const busMap = new Map();
      populatedNew.forEach(bu => {
        if (!busMap.has(bu.branch.toString())) {
          busMap.set(bu.branch.toString(), []);
        }
        busMap.get(bu.branch.toString()).push(bu);
      });
      
      newBranches.forEach(b => {
        b.businessUnits = busMap.get(b._id.toString()) || [];
      });

      const legacyIds = legacyBranches.map(b => b._id);
      const busForLegacy = await BusinessUnit.find({ branch: { $in: legacyIds } });
      const legacyBuMap = new Map();
      busForLegacy.forEach(bu => legacyBuMap.set(bu.branch.toString(), bu));
      legacyBranches.forEach(b => {
        b.businessUnits = legacyBuMap.get(b._id.toString()) || [];
      });

      allBranches = [...newBranches, ...legacyBranches];
    }

    logger.debug('All branches fetched successfully', { count: allBranches.length });

    res.status(200).json({
      success: true,
      count: allBranches.length,
      data: allBranches
    });
  } catch (error) {
    logger.error('Error fetching branches', { error: error.message });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching branches',
      error: error.message
    });
  }
};

// @desc    Get single branch by ID with business units and migrated data
// @route   GET /api/branches/:id
// @access  Private
export const getBranchById = async (req, res) => {
  try {
    const { includeBusinessUnits, includeLegacy } = req.query;
    
    logger.debug('Fetching branch by ID', { 
      branchId: req.params.id, 
      includeBusinessUnits,
      includeLegacy,
      userId: req.user?._id 
    });
    
    // UPDATED SELECT FIELDS
    const selectFields = includeLegacy === 'true' 
      ? 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
      : 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt status';
    
    let branch;
    
    if (includeBusinessUnits === 'true') {
      branch = await Branch.findById(req.params.id)
        .select(selectFields)
        .populate({
          path: 'businessUnits',
          select: 'BU_ID BUSINESS_UNIT DESCRIPTION ADDRESS createdAt'
        });
    } else {
      branch = await Branch.findById(req.params.id).select(selectFields);
    }

    if (!branch) {
      logger.warn('Branch not found', { branchId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    logger.debug('Branch fetched successfully', { branchId: branch._id });

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    logger.error('Error fetching branch by ID', { 
      error: error.message,
      branchId: req.params.id 
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching branch',
      error: error.message
    });
  }
};

// @desc    Get branch by branch code with business units and migrated data
// @route   GET /api/branches/code/:branchCode
// @access  Private
export const getBranchByCode = async (req, res) => {
  try {
    const { includeBusinessUnits, includeLegacy, organizationCode } = req.query;
    
    logger.debug('Fetching branch by code', { 
      branchCode: req.params.branchCode, 
      includeBusinessUnits,
      includeLegacy,
      organizationCode,
      userId: req.user?._id 
    });
    
    // UPDATED SELECT FIELDS AND QUERY
    const selectFields = includeLegacy === 'true' 
      ? 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
      : 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt status';
    
    const query = { branchCode: req.params.branchCode };
    if (organizationCode) {
      query.organizationCode = Number(organizationCode);
    }
    
    let branch;
    
    if (includeBusinessUnits === 'true') {
      branch = await Branch.findOne(query)
        .select(selectFields)
        .populate({
          path: 'businessUnits',
          select: 'BU_ID BUSINESS_UNIT DESCRIPTION ADDRESS createdAt'
        });
    } else {
      branch = await Branch.findOne(query).select(selectFields);
    }

    if (!branch) {
      logger.warn('Branch not found by code', { 
        branchCode: req.params.branchCode,
        organizationCode 
      });
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    logger.debug('Branch fetched by code successfully', { branchCode: branch.branchCode });

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    logger.error('Error fetching branch by code', { 
      error: error.message,
      branchCode: req.params.branchCode 
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching branch',
      error: error.message
    });
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private
export const updateBranch = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { organizationName, organizationCode, branchName, branchCode, branchType, address, status } = req.body;
    const userId = req.user?._id;

    logger.info('Updating branch', { 
      branchId: req.params.id, 
      updates: { organizationName, organizationCode, branchName, branchCode, branchType },
      userId 
    });

    // Get current branch data for audit trail
    const currentBranch = await Branch.findById(req.params.id).session(session);
    if (!currentBranch) {
      await session.abortTransaction();
      logger.warn('Branch not found for update', { branchId: req.params.id });
      
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    // Check if new branch code already exists in same organization
    if (branchCode && branchCode !== currentBranch.branchCode) {
      const orgCode = organizationCode || currentBranch.organizationCode;
      const existingBranch = await Branch.findOne({ 
        organizationCode: orgCode,
        branchCode, 
        _id: { $ne: req.params.id } 
      }).session(session);
      
      if (existingBranch) {
        await session.abortTransaction();
        logger.warn('Branch update failed - duplicate branch code in organization', { 
          organizationCode: orgCode,
          branchCode 
        });
        
        return res.status(400).json({
          success: false,
          message: 'Branch code already exists in this organization'
        });
      }
    }

    // Validate branch code format if provided
    if (branchCode && !/^\d{3}$/.test(branchCode)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Branch code must be a 3-digit number'
      });
    }

    // Validate organizationCode if provided
    if (organizationCode && isNaN(organizationCode)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Organization Code must be a valid number'
      });
    }

    const oldValues = {
      organizationName: currentBranch.organizationName,
      organizationCode: currentBranch.organizationCode,
      branchName: currentBranch.branchName,
      branchCode: currentBranch.branchCode,
      branchType: currentBranch.branchType,
      address: currentBranch.address,
      status: currentBranch.status
    };

    // UPDATED: Include all new fields in update data
    const updateData = { 
      ...req.body,
      updatedAt: new Date()
    };

    // Normalize fields if provided
    if (updateData.organizationName) {
      updateData.organizationName = updateData.organizationName.toUpperCase().trim();
    }
    if (updateData.branchName) {
      updateData.branchName = updateData.branchName.toUpperCase().trim();
    }
    if (updateData.status) {
      updateData.status = updateData.status.toUpperCase();
    }
    if (updateData.branchType) {
      updateData.branchType = updateData.branchType.toUpperCase();
    }

    const updatedBranch = await Branch.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true, session }
    );

    // Add audit trail
    await addAuditTrail({
      user: userId,
      action: 'UPDATE',
      entity: 'Branch',
      entityId: updatedBranch._id,
      description: `Updated branch: ${updatedBranch.branchName} (${updatedBranch.branchCode})`,
      oldValues,
      newValues: updateData,
      timestamp: new Date()
    }, session);

    await session.commitTransaction();
    logger.info('Branch updated successfully', { 
      branchId: updatedBranch._id, 
      branchName: updatedBranch.branchName 
    });

    res.status(200).json({
      success: true,
      message: 'Branch updated successfully',
      data: updatedBranch
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating branch', { 
      error: error.message,
      branchId: req.params.id 
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
        message: 'Invalid branch ID'
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Branch code already exists in this organization'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating branch',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private
export const deleteBranch = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const userId = req.user?._id;

    logger.info('Deleting branch', { 
      branchId: req.params.id,
      userId 
    });

    // Check if branch has business units before deletion
    const businessUnitsCount = await BusinessUnit.countDocuments({ 
      branch: req.params.id 
    }).session(session);
    
    if (businessUnitsCount > 0) {
      await session.abortTransaction();
      logger.warn('Branch deletion failed - has business units', { 
        branchId: req.params.id,
        businessUnitsCount 
      });
      
      return res.status(400).json({
        success: false,
        message: `Cannot delete branch. It has ${businessUnitsCount} business unit(s) associated with it.`
      });
    }

    const branchToDelete = await Branch.findById(req.params.id).session(session);
    if (!branchToDelete) {
      await session.abortTransaction();
      logger.warn('Branch not found for deletion', { branchId: req.params.id });
      
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    const deletedBranch = await Branch.findByIdAndDelete(req.params.id).session(session);

    // Add audit trail - UPDATED WITH NEW FIELDS
    await addAuditTrail({
      user: userId,
      action: 'DELETE',
      entity: 'Branch',
      entityId: deletedBranch._id,
      description: `Deleted branch: ${branchToDelete.branchName} (${branchToDelete.branchCode})`,
      oldValues: {
        organizationName: branchToDelete.organizationName,
        organizationCode: branchToDelete.organizationCode,
        branchName: branchToDelete.branchName,
        branchCode: branchToDelete.branchCode,
        branchType: branchToDelete.branchType,
        address: branchToDelete.address,
        status: branchToDelete.status
      },
      newValues: {},
      timestamp: new Date()
    }, session);

    await session.commitTransaction();
    logger.info('Branch deleted successfully', { 
      branchId: deletedBranch._id,
      branchName: deletedBranch.branchName 
    });

    res.status(200).json({
      success: true,
      message: 'Branch deleted successfully',
      data: deletedBranch
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deleting branch', { 
      error: error.message,
      branchId: req.params.id 
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error deleting branch',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// @desc    Get business units for a specific branch
// @route   GET /api/branches/:id/business-units
// @access  Private
export const getBranchBusinessUnits = async (req, res) => {
  try {
    logger.debug('Fetching business units for branch', { 
      branchId: req.params.id,
      userId: req.user?._id 
    });

    const branch = await Branch.findById(req.params.id);
    
    if (!branch) {
      logger.warn('Branch not found when fetching business units', { branchId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    const businessUnits = await BusinessUnit.find({ branch: req.params.id })
      .select('BU_ID BUSINESS_UNIT DESCRIPTION ADDRESS createdAt updatedAt')
      .sort({ createdAt: -1 });

    logger.debug('Business units fetched successfully for branch', { 
      branchId: req.params.id,
      businessUnitsCount: businessUnits.length 
    });

    res.status(200).json({
      success: true,
      data: {
        branch: {
          _id: branch._id,
          organizationName: branch.organizationName,
          organizationCode: branch.organizationCode,
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          branchType: branch.branchType
        },
        businessUnits,
        count: businessUnits.length
      }
    });
  } catch (error) {
    logger.error('Error fetching business units for branch', { 
      error: error.message,
      branchId: req.params.id 
    });

    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business units',
      error: error.message
    });
  }
};

// @desc    Get branches by organization with migrated data
// @route   GET /api/branches/organization/:organizationName
// @access  Private
export const getBranchesByOrganization = async (req, res) => {
  try {
    const { includeBusinessUnits, includeLegacy, organizationCode, branchType, status } = req.query;
    
    logger.debug('Fetching branches by organization', { 
      organizationName: req.params.organizationName, 
      includeBusinessUnits,
      includeLegacy,
      organizationCode,
      branchType,
      status,
      userId: req.user?._id 
    });
    
    // UPDATED SELECT FIELDS
    const selectFields = includeLegacy === 'true' 
      ? 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
      : 'organizationName organizationCode branchName branchCode branchType address createdAt updatedAt status';
    
    // UPDATED QUERY WITH NEW FIELDS
    const query = { 
      organizationName: new RegExp(req.params.organizationName, 'i') 
    };
    
    if (organizationCode) {
      query.organizationCode = Number(organizationCode);
    }
    if (branchType) {
      query.branchType = branchType.toUpperCase();
    }
    if (status) {
      query.status = status.toUpperCase();
    }
    
    let branches;
    
    if (includeBusinessUnits === 'true') {
      branches = await Branch.find(query)
        .select(selectFields)
        .populate({
          path: 'businessUnits',
          select: 'BU_ID BUSINESS_UNIT DESCRIPTION ADDRESS'
        })
        .sort({ organizationCode: 1, branchCode: 1 });
    } else {
      branches = await Branch.find(query)
        .select(selectFields)
        .sort({ organizationCode: 1, branchCode: 1 });
    }

    logger.debug('Branches by organization fetched successfully', { 
      organizationName: req.params.organizationName,
      count: branches.length 
    });

    res.status(200).json({
      success: true,
      count: branches.length,
      data: branches
    });
  } catch (error) {
    logger.error('Error fetching branches by organization', { 
      error: error.message,
      organizationName: req.params.organizationName 
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching branches',
      error: error.message
    });
  }
};

// Helper function to generate branchCode for legacy
const generateBranchCode = (branchName) => {
  const nameUpper = branchName.toUpperCase().trim();
  const codeMap = {
    'HEAD OFFICE': '000',
    'MAIN BRANCH': '001',
    'FINANCE': '002',
  };
  return codeMap[nameUpper] || `9${Math.floor(Math.random() * 99).toString().padStart(2, '0')}`;
};