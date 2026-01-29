// controllers/branchController.js - COMPLETE UPDATED VERSION
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Branch from '../models/Branch.js';
import BusinessUnit from '../models/BusinessUnit.js';
import { logger } from '../utils/logger.js'; // ADD THIS IMPORT
import { addAuditTrail } from '../controllers/AudiTrailController.js';

// controllers/branchController.js - FIXED VERSION (NO RAW SQL)
// controllers/BranchController.js - UPDATED createBranch function
export const createBranch = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🔍 CREATE BRANCH - Request body:', JSON.stringify(req.body, null, 2));
    
    let { 
      organizationName, 
      organizationCode, 
      branchName, 
      branchCode, 
      branchType = 'MAIN',
      businessUnitId,
      BU_ID,
      created_by,
      createdBy,
      legacyId,
      ADDRESS,
      external_id,
      parent,
      office_address,
      country,
      state,
      city,
      phone,
      email,
      branch_manager,
      opening_date,
      branch_type = 'No',
      DESCRIPTION,
      status = 'Active',
      operational_model = 'Cash',
      approved_by,
      migration_id,
      address // Alternative field name
    } = req.body;
    
    const userId = req.user?.id || 'system';
    const now = new Date();

    // Normalize inputs
    organizationName = organizationName?.trim().toUpperCase() || 'DEFAULT_ORG';
    organizationCode = Number(organizationCode);
    branchName = branchName?.trim().replace(/\s*-\s*/g, '-').toUpperCase();
    branchCode = branchCode?.trim();
    DESCRIPTION = DESCRIPTION?.trim() || branchName;
    ADDRESS = ADDRESS || address || `${organizationName} ${branchName} Address`;
    ADDRESS = ADDRESS.trim();
    status = status.toUpperCase();

    console.log('🔍 CREATE BRANCH - Normalized values:', {
      organizationName,
      organizationCode,
      branchName,
      branchCode,
      DESCRIPTION,
      ADDRESS,
      status
    });

    // Validate branch code format (3-digit number)
    if (!/^\d{3}$/.test(branchCode)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Branch code must be a 3-digit number'
      });
    }

    // Validate required fields
    if (!organizationName || !organizationCode || !branchName || !branchCode) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Organization Name, Organization Code, Branch Name, and Branch Code are required'
      });
    }

    // Validate organizationCode is a valid number
    if (isNaN(organizationCode)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Organization Code must be a valid number'
      });
    }

    logger.info('Creating new branch', { 
      organizationName, 
      organizationCode,
      branchName, 
      branchCode,
      userId 
    });

    // Check if branch already exists (by organizationCode + branchCode combination)
    const existingBranch = await Branch.findOne({ 
      where: { 
        organizationCode, 
        branchCode 
      },
      transaction
    });
    
    if (existingBranch) {
      await transaction.rollback();
      logger.warn('Branch creation failed - duplicate branch code in organization', { 
        organizationCode, 
        branchCode 
      });
      
      return res.status(400).json({
        success: false,
        message: `Branch code ${branchCode} already exists in organization ${organizationCode}`
      });
    }

    // 🔥 FIX: Check if BusinessUnit with BU_ID already exists - EXPLICITLY LIST COLUMNS
    const existingBusinessUnit = await BusinessUnit.findOne({ 
      where: { BU_ID: parseInt(branchCode) },
      attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'created_at', 'updated_at'], // Don't include 'branch'
      transaction
    });
    
    if (existingBusinessUnit) {
      await transaction.rollback();
      logger.warn('Business Unit creation failed - duplicate BU_ID', { branchCode });
      
      return res.status(409).json({
        success: false,
        message: `Business Unit with BU_ID ${branchCode} already exists`,
        code: 'DUPLICATE_KEY'
      });
    }

    // Create branch with ALL fields
    const branchData = {
      organizationName,
      organizationCode,
      branchName,
      branchCode,
      branchType,
      businessUnitId: businessUnitId || null,
      BU_ID: BU_ID || parseInt(branchCode),
      created_by: created_by || userId,
      createdBy: createdBy || userId,
      legacyId: legacyId || null,
      address: ADDRESS,
      external_id: external_id || null,
      parent: parent || null,
      office_address: office_address || ADDRESS,
      country: country || null,
      state: state || null,
      city: city || null,
      phone: phone || null,
      email: email || null,
      branch_manager: branch_manager || null,
      opening_date: opening_date || now.toISOString().split('T')[0], // Default to today
      branch_type: branch_type,
      status: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      operational_model: operational_model,
      approved_by: approved_by || null,
      migration_id: migration_id || null,
      created_at: now,
      updated_at: now
    };

    console.log('🔍 CREATE BRANCH - Branch data:', branchData);

    const savedBranch = await Branch.create(branchData, { transaction });

    // 🔥 FIX: Create business unit WITHOUT branch field for now
    const businessUnitData = {
      BU_ID: parseInt(branchCode),
      BUSINESS_UNIT: branchName,
      DESCRIPTION,
      ADDRESS,
      STATUS: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      // branch: savedBranch.id, // Temporarily commented out - column doesn't exist
      created_at: now,
      updated_at: now
    };
    
    console.log('🔍 CREATE BRANCH - Business Unit data:', businessUnitData);
    
    const savedBusinessUnit = await BusinessUnit.create(businessUnitData, { transaction });

    // Add audit trail
    if (addAuditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'CREATE',
        USER_ID: userId.toString(),
        ACTION: 'create_branch',
        OLD_VALUE: null,
        NEW_VALUE: branchData,
        IP_ADDRESS: req.ip || 'unknown',
        ENTITY_ID: savedBranch.id.toString(),
        ENTITY_TYPE: 'branch',
        additional_info: {
          source: 'branch_api',
          timestamp: now.toISOString()
        }
      }, transaction);

      await addAuditTrail({
        EVENT_TYPE: 'CREATE',
        USER_ID: userId.toString(),
        ACTION: 'create_business_unit',
        OLD_VALUE: null,
        NEW_VALUE: businessUnitData,
        IP_ADDRESS: req.ip || 'unknown',
        ENTITY_ID: savedBusinessUnit.id.toString(),
        ENTITY_TYPE: 'business_unit',
        additional_info: {
          source: 'branch_api',
          timestamp: now.toISOString()
        }
      }, transaction);
    }

    await transaction.commit();
    
    logger.info('Branch and Business Unit created successfully', { 
      branchId: savedBranch.id, 
      businessUnitId: savedBusinessUnit.id,
      organizationName,
      branchCode 
    });

    // Prepare response with all fields
    const responseData = {
      branch: {
        id: savedBranch.id,
        organizationName: savedBranch.organizationName,
        organizationCode: savedBranch.organizationCode,
        branchName: savedBranch.branchName,
        branchCode: savedBranch.branchCode,
        branchType: savedBranch.branchType,
        businessUnitId: savedBranch.businessUnitId,
        BU_ID: savedBranch.BU_ID,
        created_by: savedBranch.created_by,
        createdBy: savedBranch.createdBy,
        legacyId: savedBranch.legacyId,
        address: savedBranch.address,
        external_id: savedBranch.external_id,
        parent: savedBranch.parent,
        office_address: savedBranch.office_address,
        country: savedBranch.country,
        state: savedBranch.state,
        city: savedBranch.city,
        phone: savedBranch.phone,
        email: savedBranch.email,
        branch_manager: savedBranch.branch_manager,
        opening_date: savedBranch.opening_date,
        branch_type: savedBranch.branch_type,
        status: savedBranch.status,
        operational_model: savedBranch.operational_model,
        approved_by: savedBranch.approved_by,
        migration_id: savedBranch.migration_id,
        created_at: savedBranch.created_at,
        updated_at: savedBranch.updated_at
      },
      businessUnit: {
        id: savedBusinessUnit.id,
        BU_ID: savedBusinessUnit.BU_ID,
        BUSINESS_UNIT: savedBusinessUnit.BUSINESS_UNIT,
        DESCRIPTION: savedBusinessUnit.DESCRIPTION,
        ADDRESS: savedBusinessUnit.ADDRESS,
        STATUS: savedBusinessUnit.STATUS,
        // branch: savedBusinessUnit.branch, // Temporarily commented out
        created_at: savedBusinessUnit.created_at,
        updated_at: savedBusinessUnit.updated_at
      }
    };

    res.status(201).json({
      success: true,
      message: `Branch ${branchName} (${branchCode}) created successfully`,
      data: responseData
    });

  } catch (error) {
    if (transaction.finished !== 'commit') {
      await transaction.rollback();
    }
    
    console.error('❌ CREATE BRANCH ERROR:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    
    logger.error('Error creating branch and business unit', { 
      error: error.message
    });

    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map(err => err.message).join('; ');
      return res.status(400).json({
        success: false,
        message: messages
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
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
      userId: req.user?.id 
    });

    // Build where conditions
    const where = {};
    
    if (organizationName) {
      where.organizationName = { [Op.like]: `%${organizationName}%` };
    }
    
    if (organizationCode) {
      where.organizationCode = Number(organizationCode);
    }
    
    if (branchType) {
      where.branchType = branchType.toUpperCase();
    }
    
    if (status) {
      where.status = status.toUpperCase();
    }

    // 🔥 FIX: Use the correct field names from your model
    const attributes = [
      'id', 'organizationName', 'organizationCode', 'branchName', 
      'branchCode', 'branchType', 'address', 'created_at', 'updated_at',
      'businessUnitId', 'BU_ID', 'created_by', 'createdBy', 'legacyId',
      'external_id', 'parent', 'office_address', 'country', 'state',
      'city', 'phone', 'email', 'branch_manager', 'opening_date',
      'branch_type', 'status', 'operational_model', 'approved_by', 'migration_id'
    ];

    // Fetch branches
    let branches = await Branch.findAll({
      where,
      attributes,
      order: [['organizationCode', 'ASC'], ['branchCode', 'ASC']]
    });

    // Filter by migration_id if requested
    if (migratedOnly === 'true') {
      branches = branches.filter(b => b.migration_id);
    }

    // Optional: Populate businessUnits
    if (includeBusinessUnits === 'true') {
      const branchIds = branches.map(b => b.id);
      
      const businessUnits = await BusinessUnit.findAll({
        where: { branch: { [Op.in]: branchIds } },
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'branch', 'created_at', 'updated_at']
      });
      
      // Map business units to branches
      const businessUnitsMap = new Map();
      businessUnits.forEach(bu => {
        const key = bu.branch.toString();
        if (!businessUnitsMap.has(key)) {
          businessUnitsMap.set(key, []);
        }
        businessUnitsMap.get(key).push(bu);
      });
      
      // Add businessUnits to branches
      branches.forEach(branch => {
        branch.dataValues.businessUnits = businessUnitsMap.get(branch.id.toString()) || [];
      });
    }

    logger.debug('All branches fetched successfully', { count: branches.length });

    res.status(200).json({
      success: true,
      count: branches.length,
      data: branches
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
      userId: req.user?.id 
    });
    
    // Define attributes based on includeLegacy
    const attributes = includeLegacy === 'true' 
      ? [
          'id', 'organizationName', 'organizationCode', 'branchName', 
          'branchCode', 'branchType', 'address', 'createdAt', 'updatedAt',
          'external_id', 'parent', 'office_address', 'country', 'state',
          'city', 'phone', 'email', 'branch_manager', 'opening_date',
          'branch_type', 'status', 'created_by', 'operational_model',
          'approved_by', 'migration_id'
        ]
      : [
          'id', 'organizationName', 'organizationCode', 'branchName', 
          'branchCode', 'branchType', 'address', 'createdAt', 'updatedAt', 'status'
        ];
    
    let queryOptions = {
      where: { id: req.params.id },
      attributes
    };
    
    // Include business units if requested
    if (includeBusinessUnits === 'true') {
      queryOptions.include = [{
        model: BusinessUnit,
        as: 'businessUnits',
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'createdAt']
      }];
    }
    
    const branch = await Branch.findOne(queryOptions);

    if (!branch) {
      logger.warn('Branch not found', { branchId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    logger.debug('Branch fetched successfully', { branchId: branch.id });

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    logger.error('Error fetching branch by ID', { 
      error: error.message,
      branchId: req.params.id 
    });

    // Check if it's an invalid ID format error
    if (error.name === 'SequelizeDatabaseError' || error.name === 'TypeError') {
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
      userId: req.user?.id 
    });
    
    // 🔥 FIX: Use correct field names (created_at, updated_at)
    const attributes = [
      'id', 'organizationName', 'organizationCode', 'branchName', 
      'branchCode', 'branchType', 'address', 'created_at', 'updated_at',
      'businessUnitId', 'BU_ID', 'created_by', 'createdBy', 'legacyId',
      'external_id', 'parent', 'office_address', 'country', 'state',
      'city', 'phone', 'email', 'branch_manager', 'opening_date',
      'branch_type', 'status', 'operational_model', 'approved_by', 'migration_id'
    ];
    
    // Build where clause
    const where = { branchCode: req.params.branchCode };
    
    if (organizationCode) {
      where.organizationCode = Number(organizationCode);
    }
    
    let queryOptions = {
      where,
      attributes
    };
    
    // Include business units if requested
    if (includeBusinessUnits === 'true') {
      queryOptions.include = [{
        model: BusinessUnit,
        as: 'businessUnits',
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'branch', 'created_at', 'updated_at'] // 🔥 CHANGED: created_at instead of createdAt
      }];
    }
    
    const branch = await Branch.findOne(queryOptions);

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
  const transaction = await sequelize.transaction();

  try {
    const { 
      organizationName, 
      organizationCode, 
      branchName, 
      branchCode, 
      branchType, 
      address, 
      status,
      businessUnitId,
      BU_ID,
      created_by,
      createdBy,
      legacyId,
      external_id,
      parent,
      office_address,
      country,
      state,
      city,
      phone,
      email,
      branch_manager,
      opening_date,
      branch_type,
      operational_model,
      approved_by,
      migration_id
    } = req.body;
    
    const userId = req.user?.id || 'system';
    const now = new Date();

    logger.info('Updating branch', { 
      branchId: req.params.id, 
      updates: { organizationName, organizationCode, branchName, branchCode, branchType },
      userId 
    });

    // Get current branch data for audit trail
    const currentBranch = await Branch.findByPk(req.params.id, { transaction });
    
    if (!currentBranch) {
      await transaction.rollback();
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
        where: { 
          organizationCode: orgCode,
          branchCode, 
          id: { [Op.ne]: req.params.id } 
        },
        transaction
      });
      
      if (existingBranch) {
        await transaction.rollback();
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
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Branch code must be a 3-digit number'
      });
    }

    // Validate organizationCode if provided
    if (organizationCode && isNaN(organizationCode)) {
      await transaction.rollback();
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
      status: currentBranch.status,
      businessUnitId: currentBranch.businessUnitId,
      BU_ID: currentBranch.BU_ID,
      created_by: currentBranch.created_by,
      createdBy: currentBranch.createdBy,
      legacyId: currentBranch.legacyId,
      external_id: currentBranch.external_id,
      parent: currentBranch.parent,
      office_address: currentBranch.office_address,
      country: currentBranch.country,
      state: currentBranch.state,
      city: currentBranch.city,
      phone: currentBranch.phone,
      email: currentBranch.email,
      branch_manager: currentBranch.branch_manager,
      opening_date: currentBranch.opening_date,
      branch_type: currentBranch.branch_type,
      operational_model: currentBranch.operational_model,
      approved_by: currentBranch.approved_by,
      migration_id: currentBranch.migration_id
    };

    // Prepare update data - Use updated_at instead of updatedAt
    const updateData = { 
      ...req.body,
      updated_at: now // 🔥 CHANGED: updated_at instead of updatedAt
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
    if (updateData.email) {
      updateData.email = updateData.email.toLowerCase().trim();
    }

    // Update the branch
    await Branch.update(updateData, {
      where: { id: req.params.id },
      transaction
    });

    // Fetch the updated branch
    const updatedBranch = await Branch.findByPk(req.params.id, { transaction });

    // Add audit trail if function exists
    if (typeof addAuditTrail === 'function') {
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE',
        USER_ID: userId.toString(),
        ACTION: 'update_branch',
        OLD_VALUE: oldValues,
        NEW_VALUE: updateData,
        IP_ADDRESS: req.ip || 'unknown',
        ENTITY_ID: updatedBranch.id.toString(),
        ENTITY_TYPE: 'branch',
        additional_info: {
          source: 'branch_api',
          timestamp: now.toISOString()
        }
      }, transaction);
    }

    await transaction.commit();
    logger.info('Branch updated successfully', { 
      branchId: updatedBranch.id, 
      branchName: updatedBranch.branchName 
    });

    res.status(200).json({
      success: true,
      message: 'Branch updated successfully',
      data: updatedBranch
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating branch', { 
      error: error.message,
      branchId: req.params.id 
    });

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: error.errors.map(err => err.message).join(', ')
      });
    }
    
    // Check for invalid ID
    if (error.name === 'SequelizeDatabaseError' || error.name === 'TypeError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID'
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
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
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private
export const deleteBranch = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user?.id || 'system';

    logger.info('Deleting branch', { 
      branchId: req.params.id,
      userId 
    });

    // Check if branch has business units before deletion
    const businessUnitsCount = await BusinessUnit.count({ 
      where: { branch: req.params.id },
      transaction
    });
    
    if (businessUnitsCount > 0) {
      await transaction.rollback();
      logger.warn('Branch deletion failed - has business units', { 
        branchId: req.params.id,
        businessUnitsCount 
      });
      
      return res.status(400).json({
        success: false,
        message: `Cannot delete branch. It has ${businessUnitsCount} business unit(s) associated with it.`
      });
    }

    const branchToDelete = await Branch.findByPk(req.params.id, { transaction });
    
    if (!branchToDelete) {
      await transaction.rollback();
      logger.warn('Branch not found for deletion', { branchId: req.params.id });
      
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    const oldValues = {
      organizationName: branchToDelete.organizationName,
      organizationCode: branchToDelete.organizationCode,
      branchName: branchToDelete.branchName,
      branchCode: branchToDelete.branchCode,
      branchType: branchToDelete.branchType,
      address: branchToDelete.address,
      status: branchToDelete.status
    };

    // Delete the branch
    await branchToDelete.destroy({ transaction });

    // Add audit trail if function exists
    if (typeof addAuditTrail === 'function') {
      await addAuditTrail({
        user: userId,
        action: 'DELETE',
        entity: 'Branch',
        entityId: branchToDelete.id,
        description: `Deleted branch: ${branchToDelete.branchName} (${branchToDelete.branchCode})`,
        oldValues,
        newValues: {},
        timestamp: new Date()
      }, transaction);
    }

    await transaction.commit();
    logger.info('Branch deleted successfully', { 
      branchId: branchToDelete.id,
      branchName: branchToDelete.branchName 
    });

    res.status(200).json({
      success: true,
      message: 'Branch deleted successfully',
      data: branchToDelete
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting branch', { 
      error: error.message,
      branchId: req.params.id 
    });

    // Check for invalid ID
    if (error.name === 'SequelizeDatabaseError' || error.name === 'TypeError') {
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
  }
};

// @desc    Get business units for a specific branch
// @route   GET /api/branches/:id/business-units
// @access  Private
export const getBranchBusinessUnits = async (req, res) => {
  try {
    logger.debug('Fetching business units for branch', { 
      branchId: req.params.id,
      userId: req.user?.id 
    });

    const branch = await Branch.findByPk(req.params.id, {
      attributes: ['id', 'organizationName', 'organizationCode', 'branchName', 'branchCode', 'branchType']
    });
    
    if (!branch) {
      logger.warn('Branch not found when fetching business units', { branchId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    const businessUnits = await BusinessUnit.findAll({
      where: { branch: req.params.id },
      attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'created_at', 'updated_at'], // 🔥 CHANGED
      order: [['created_at', 'DESC']] // 🔥 CHANGED
    });

    logger.debug('Business units fetched successfully for branch', { 
      branchId: req.params.id,
      businessUnitsCount: businessUnits.length 
    });

    res.status(200).json({
      success: true,
      data: {
        branch: {
          id: branch.id,
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

    // Check for invalid ID
    if (error.name === 'SequelizeDatabaseError' || error.name === 'TypeError') {
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
      userId: req.user?.id 
    });
    
    // 🔥 FIX: Use correct field names
    const attributes = [
      'id', 'organizationName', 'organizationCode', 'branchName', 
      'branchCode', 'branchType', 'address', 'created_at', 'updated_at',
      'businessUnitId', 'BU_ID', 'created_by', 'createdBy', 'legacyId',
      'external_id', 'parent', 'office_address', 'country', 'state',
      'city', 'phone', 'email', 'branch_manager', 'opening_date',
      'branch_type', 'status', 'operational_model', 'approved_by', 'migration_id'
    ];
    
    // Build where clause
    const where = { 
      organizationName: { [Op.like]: `%${req.params.organizationName}%` }
    };
    
    if (organizationCode) {
      where.organizationCode = Number(organizationCode);
    }
    
    if (branchType) {
      where.branchType = branchType.toUpperCase();
    }
    
    if (status) {
      where.status = status.toUpperCase();
    }
    
    let queryOptions = {
      where,
      attributes,
      order: [['organizationCode', 'ASC'], ['branchCode', 'ASC']]
    };
    
    // Include business units if requested
    if (includeBusinessUnits === 'true') {
      queryOptions.include = [{
        model: BusinessUnit,
        as: 'businessUnits',
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'branch', 'created_at', 'updated_at']
      }];
    }
    
    const branches = await Branch.findAll(queryOptions);

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