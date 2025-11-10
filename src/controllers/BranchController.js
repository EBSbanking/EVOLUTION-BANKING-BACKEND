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
    let { organizationName, branchName, branchCode, DESCRIPTION, ADDRESS, status } = req.body;
    const userId = req.user?._id;

    // Normalize inputs
    organizationName = organizationName?.trim().toUpperCase() || 'DEFAULT_ORG';
    branchName = branchName?.trim().replace(/\s*-\s*/g, '-').toUpperCase();
    branchCode = branchCode?.trim().toUpperCase();
    DESCRIPTION = DESCRIPTION?.trim() || branchName;
    ADDRESS = ADDRESS?.trim() || `${organizationName} ${branchName} Address`;
    status = status ? status.toUpperCase() : 'ACTIVE';

    logger.info('Creating new branch', { 
      organizationName, 
      branchName, 
      branchCode,
      DESCRIPTION,
      ADDRESS,
      status,
      userId 
    });

    // Validate required fields
    if (!organizationName || !branchName || !branchCode) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Organization Name, Branch Name, and Branch Code are required'
      });
    }

    // Check if branch code already exists
    const existingBranch = await Branch.findOne({ branchCode }).session(session);
    if (existingBranch) {
      await session.abortTransaction();
      logger.warn('Branch creation failed - duplicate branch code', { branchCode });
      
      return res.status(400).json({
        success: false,
        message: 'Branch code already exists'
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

    // Create and save Branch
    const branchData = {
      organizationName,
      branchName,
      branchCode,
      address: ADDRESS,
      status
    };
    const branch = new Branch(branchData);
    const savedBranch = await branch.save({ session });

    // Create and save linked BusinessUnit (explicit mapping to schema fields)
    const businessUnitData = {
      BU_ID: branchCode,  // Maps to required BU_ID
      BUSINESS_UNIT: branchName,  // Maps to required BUSINESS_UNIT
      DESCRIPTION,
      ADDRESS,
      branch: savedBranch._id,  // Ref if schema supports
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
      description: `Created branch: ${branchName} (${branchCode})`,
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
      branchName, 
      branchCode 
    });

    res.status(201).json({
      success: true,
      message: `Branch and Business Unit with branchCode: ${branchCode} created successfully`,
      data: {
        branch: savedBranch,
        businessUnit: savedBusinessUnit
      }
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating branch and business unit', { 
      error: error.message,
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
    const { includeBusinessUnits, organizationName, includeLegacy, migratedOnly } = req.query;
    
    logger.debug('Fetching all branches', { 
      includeBusinessUnits, 
      organizationName,
      includeLegacy,
      migratedOnly,
      userId: req.user?._id 
    });

    // Base query filters
    const baseQuery = {};
    if (organizationName) {
      baseQuery.organizationName = new RegExp(organizationName, 'i');
    }

    // Fetch new branches from 'branches' collection
    let newBranches = await Branch.find(baseQuery)
      .select(includeLegacy === 'true' 
        ? 'organizationName branchName branchCode createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
        : 'organizationName branchName branchCode createdAt updatedAt'
      );

    if (migratedOnly === 'true') {
      newBranches = newBranches.filter(b => b.migration_id); // Only migrated new ones
    }

    // Fetch legacy branches from 'branch' collection (raw MongoDB for flexibility)
    let legacyBranches = [];
    if (includeLegacy !== 'false' || migratedOnly !== 'true') { // Fetch legacy unless explicitly excluded or only new
      const legacyQuery = organizationName ? { organizationName: new RegExp(organizationName, 'i') } : {}; // If legacy has organizationName
      legacyBranches = await mongoose.connection.db.collection('branch').find(legacyQuery).toArray();

      // Map legacy fields to match new schema/format
      legacyBranches = legacyBranches.map(legacy => ({
        // Core fields (map/derive)
        _id: legacy._id,
        organizationName: legacy.organizationName || 'DEFAULT_ORG', // Default if missing in legacy
        branchName: (legacy.name || '').toUpperCase().trim() || 'UNKNOWN BRANCH', // Map from 'name'
        branchCode: legacy.branchCode || generateBranchCode(legacy.name || ''), // Generate if missing (define helper below)
        
        // Legacy-specific fields (preserve)
        id: legacy.id, // Legacy ID (e.g., 22)
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
        status: (legacy.status || 'Active').toUpperCase(),
        created_by: legacy.created_by,
        operational_model: legacy.operational_model,
        approved_by: legacy.approved_by,
        migration_id: legacy.migration_id || legacy._id, // Track as migrated

        // Timestamps (derive from opening_date or default)
        createdAt: legacy.opening_date || legacy.createdAt || new Date(),
        updatedAt: legacy.updatedAt || new Date()
      }));

      // Filter if only migrated (legacy are all "migrated")
      if (migratedOnly === 'true') {
        legacyBranches = legacyBranches; // All legacy qualify
      }
    }

    // Merge: new + mapped legacy
    let allBranches = [...newBranches, ...legacyBranches];

    // Apply organizationName filter post-merge if not applied earlier (for consistency)
    if (organizationName) {
      allBranches = allBranches.filter(b => 
        b.organizationName.toLowerCase().includes(organizationName.toLowerCase())
      );
    }

    // Optional: Populate businessUnits (for new branches only; extend for legacy if ref exists)
    if (includeBusinessUnits === 'true') {
      // For new branches (populate works on Mongoose docs)
      const populatedNew = await Branch.populate(newBranches, {
        path: 'businessUnits',
        select: 'unitName unitCode description createdAt'
      });
      
      // For legacy: Assuming no ref, query separately and attach (customize if legacy has branch ref)
      const legacyIds = legacyBranches.map(b => b._id);
      const busForLegacy = await BusinessUnit.find({ branch: { $in: legacyIds } });
      const buMap = new Map();
      busForLegacy.forEach(bu => buMap.set(bu.branch.toString(), bu));
      legacyBranches.forEach(b => {
        b.businessUnits = buMap.get(b._id.toString()) || [];
      });

      // Re-merge after populate
      allBranches = [...populatedNew, ...legacyBranches];
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

// Helper function to generate branchCode for legacy (add at top of file or utils)
const generateBranchCode = (branchName) => {
  const nameUpper = branchName.toUpperCase().trim();
  const codeMap = {
    'HEAD OFFICE': '000',
    'FINANCE': '002',
    // Add more mappings as needed from initialBranches
  };
  return codeMap[nameUpper] || `9${Math.floor(Math.random() * 99).toString().padStart(2, '0')}`; // Fallback 3-digit
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
    
    const selectFields = includeLegacy === 'true' 
      ? 'organizationName branchName branchCode createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
      : 'organizationName branchName branchCode createdAt updatedAt';
    
    let branch;
    
    if (includeBusinessUnits === 'true') {
      branch = await Branch.findById(req.params.id)
        .select(selectFields)
        .populate({
          path: 'businessUnits',
          select: 'unitName unitCode description createdAt'
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
    const { includeBusinessUnits, includeLegacy } = req.query;
    
    logger.debug('Fetching branch by code', { 
      branchCode: req.params.branchCode, 
      includeBusinessUnits,
      includeLegacy,
      userId: req.user?._id 
    });
    
    const selectFields = includeLegacy === 'true' 
      ? 'organizationName branchName branchCode createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
      : 'organizationName branchName branchCode createdAt updatedAt';
    
    let branch;
    
    if (includeBusinessUnits === 'true') {
      branch = await Branch.findOne({ branchCode: req.params.branchCode })
        .select(selectFields)
        .populate({
          path: 'businessUnits',
          select: 'unitName unitCode description createdAt'
        });
    } else {
      branch = await Branch.findOne({ branchCode: req.params.branchCode }).select(selectFields);
    }

    if (!branch) {
      logger.warn('Branch not found by code', { branchCode: req.params.branchCode });
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
    const { organizationName, branchName, branchCode } = req.body;
    const userId = req.user?._id;

    logger.info('Updating branch', { 
      branchId: req.params.id, 
      updates: { organizationName, branchName, branchCode },
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

    // Check if new branch code already exists (excluding current branch)
    if (branchCode && branchCode !== currentBranch.branchCode) {
      const existingBranch = await Branch.findOne({ 
        branchCode, 
        _id: { $ne: req.params.id } 
      }).session(session);
      
      if (existingBranch) {
        await session.abortTransaction();
        logger.warn('Branch update failed - duplicate branch code', { branchCode });
        
        return res.status(400).json({
          success: false,
          message: 'Branch code already exists'
        });
      }
    }

    const oldValues = {
      organizationName: currentBranch.organizationName,
      branchName: currentBranch.branchName,
      branchCode: currentBranch.branchCode
    };

    // Spread legacy fields if updating them
    const updateData = { 
      organizationName, 
      branchName, 
      branchCode,
      updatedAt: Date.now(),
      ...req.body // Include legacy updates (e.g., office_address)
    };

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
      description: `Updated branch: ${branchName} (${branchCode})`,
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

    // Check if branch has business units before deletion (works for migrated too)
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

    // Add audit trail
    await addAuditTrail({
      user: userId,
      action: 'DELETE',
      entity: 'Branch',
      entityId: deletedBranch._id,
      description: `Deleted branch: ${branchToDelete.branchName} (${branchToDelete.branchCode})`,
      oldValues: {
        organizationName: branchToDelete.organizationName,
        branchName: branchToDelete.branchName,
        branchCode: branchToDelete.branchCode
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
      .select('unitName unitCode description createdAt updatedAt')
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
          branchName: branch.branchName,
          branchCode: branch.branchCode,
          organizationName: branch.organizationName
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
    const { includeBusinessUnits, includeLegacy } = req.query;
    
    logger.debug('Fetching branches by organization', { 
      organizationName: req.params.organizationName, 
      includeBusinessUnits,
      includeLegacy,
      userId: req.user?._id 
    });
    
    const selectFields = includeLegacy === 'true' 
      ? 'organizationName branchName branchCode createdAt updatedAt external_id parent office_address country state city phone email branch_manager opening_date branch_type status created_by operational_model approved_by migration_id'
      : 'organizationName branchName branchCode createdAt updatedAt';
    
    let branches;
    
    if (includeBusinessUnits === 'true') {
      branches = await Branch.find({ 
        organizationName: new RegExp(req.params.organizationName, 'i') 
      })
        .select(selectFields)
        .populate({
          path: 'businessUnits',
          select: 'unitName unitCode description'
        });
    } else {
      branches = await Branch.find({ 
        organizationName: new RegExp(req.params.organizationName, 'i') 
      }).select(selectFields);
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