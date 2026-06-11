// controllers/branchController.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from './AudiTrailController.js';
import { Branch, BusinessUnit } from '../models/index.js';   // ✅ import from central index

// ==================== CREATE BRANCH ====================
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

    // Check if BusinessUnit with BU_ID already exists
    const existingBusinessUnit = await BusinessUnit.findOne({ 
      where: { BU_ID: parseInt(branchCode) },
      attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'created_at', 'updated_at'],
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
      opening_date: opening_date || now.toISOString().split('T')[0],
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

    // Create business unit (without branch field if column doesn't exist)
    const businessUnitData = {
      BU_ID: parseInt(branchCode),
      BUSINESS_UNIT: branchName,
      DESCRIPTION,
      ADDRESS,
      STATUS: status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      // branch: savedBranch.id, // comment out if column not present
      created_at: now,
      updated_at: now
    };
    
    console.log('🔍 CREATE BRANCH - Business Unit data:', businessUnitData);
    
    const savedBusinessUnit = await BusinessUnit.create(businessUnitData, { transaction });

    // Add audit trails if function exists
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

    // Prepare response
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

// @desc    Get all branches
// @route   GET /api/branches
// @access  Private
export const getAllBranches = async (req, res) => {
  try {
    const { 
      includeBusinessUnits, 
      organizationName, 
      organizationCode, 
      branchType, 
      status,
      filterByUser
    } = req.query;
    
    logger.debug('Fetching all branches', { 
      includeBusinessUnits, 
      organizationName,
      organizationCode,
      branchType,
      status,
      filterByUser,
      userBU_ID: req.user?.bu_id,
      userId: req.user?.id 
    });

    const where = {};
    
    if (filterByUser === 'true' && req.user?.bu_id) {
      where.BU_ID = req.user.bu_id;
      logger.debug('Filtering branches by user BU_ID', { userBU_ID: req.user.bu_id });
    }
    
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

    const attributes = [
      'id', 'organizationName', 'organizationCode', 'branchName', 
      'branchCode', 'branchType', 'address', 'created_at', 'updated_at',
      'businessUnitId', 'BU_ID', 'created_by', 'createdBy', 'legacyId',
      'external_id', 'parent', 'office_address', 'country', 'state',
      'city', 'phone', 'email', 'branch_manager', 'opening_date',
      'branch_type', 'status', 'operational_model', 'approved_by', 'migration_id'
    ];

    let branches = await Branch.findAll({
      where,
      attributes,
      order: [['organizationCode', 'ASC'], ['branchCode', 'ASC']]
    });

    if (includeBusinessUnits === 'true') {
      const branchIds = branches.map(b => b.id);
      const businessUnits = await BusinessUnit.findAll({
        where: { branch: { [Op.in]: branchIds } },
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'branch', 'created_at', 'updated_at']
      });
      
      const businessUnitsMap = new Map();
      businessUnits.forEach(bu => {
        const key = bu.branch.toString();
        if (!businessUnitsMap.has(key)) {
          businessUnitsMap.set(key, []);
        }
        businessUnitsMap.get(key).push(bu);
      });
      
      branches.forEach(branch => {
        branch.dataValues.businessUnits = businessUnitsMap.get(branch.id.toString()) || [];
      });
    }

    logger.debug('Branches fetched successfully', { 
      count: branches.length
    });

    res.status(200).json({
      success: true,
      count: branches.length,
      data: branches,
      filterApplied: filterByUser === 'true' ? { byUserBU_ID: req.user?.bu_id } : null
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

// @desc    Get business unit by ID
// @route   GET /api/business-units/:id
// @access  Private
export const getBusinessUnitById = async (req, res) => {
  try {
    const { id } = req.params;
    const businessUnit = await BusinessUnit.findByPk(id, {
      attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'branch', 'created_at', 'updated_at']
    });

    if (!businessUnit) {
      return res.status(404).json({ success: false, message: 'Business unit not found' });
    }

    res.status(200).json({ success: true, data: businessUnit });
  } catch (error) {
    logger.error('Error fetching business unit by ID', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching business unit', error: error.message });
  }
};

// @desc    Get business unit by BU_ID
// @route   GET /api/business-units/business-unit/:bu_id
// @access  Private
export const getBusinessUnitByBU_ID = async (req, res) => {
  try {
    const { bu_id } = req.params;
    const businessUnit = await BusinessUnit.findOne({
      where: { BU_ID: bu_id },
      attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'branch', 'created_at', 'updated_at']
    });

    if (!businessUnit) {
      return res.status(404).json({ success: false, message: 'Business unit not found' });
    }

    res.status(200).json({ success: true, data: businessUnit });
  } catch (error) {
    logger.error('Error fetching business unit by BU_ID', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching business unit', error: error.message });
  }
};

// @desc    Update branch
// @route   PUT /api/branches/:id
// @access  Private
export const updateBranch = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user?.id || 'system';
    const now = new Date();

    const currentBranch = await Branch.findByPk(req.params.id, { transaction });
    if (!currentBranch) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    // Build update data
    const updateData = { ...req.body, updated_at: now };
    if (updateData.organizationName) updateData.organizationName = updateData.organizationName.toUpperCase().trim();
    if (updateData.branchName) updateData.branchName = updateData.branchName.toUpperCase().trim();
    if (updateData.status) updateData.status = updateData.status.toUpperCase();
    if (updateData.branchType) updateData.branchType = updateData.branchType.toUpperCase();
    if (updateData.email) updateData.email = updateData.email.toLowerCase().trim();

    await Branch.update(updateData, { where: { id: req.params.id }, transaction });
    const updatedBranch = await Branch.findByPk(req.params.id, { transaction });

    if (addAuditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE',
        USER_ID: userId.toString(),
        ACTION: 'update_branch',
        OLD_VALUE: currentBranch.toJSON(),
        NEW_VALUE: updateData,
        IP_ADDRESS: req.ip || 'unknown',
        ENTITY_ID: updatedBranch.id.toString(),
        ENTITY_TYPE: 'branch',
        additional_info: { source: 'branch_api', timestamp: now.toISOString() }
      }, transaction);
    }

    await transaction.commit();
    res.status(200).json({ success: true, message: 'Branch updated successfully', data: updatedBranch });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating branch', { error: error.message });
    res.status(500).json({ success: false, message: 'Error updating branch', error: error.message });
  }
};

// @desc    Delete branch
// @route   DELETE /api/branches/:id
// @access  Private
export const deleteBranch = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user?.id || 'system';

    const businessUnitsCount = await BusinessUnit.count({ where: { branch: req.params.id }, transaction });
    if (businessUnitsCount > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot delete branch. It has ${businessUnitsCount} business unit(s) associated.`
      });
    }

    const branchToDelete = await Branch.findByPk(req.params.id, { transaction });
    if (!branchToDelete) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    await branchToDelete.destroy({ transaction });

    if (addAuditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'DELETE',
        USER_ID: userId.toString(),
        ACTION: 'delete_branch',
        OLD_VALUE: branchToDelete.toJSON(),
        NEW_VALUE: null,
        IP_ADDRESS: req.ip || 'unknown',
        ENTITY_ID: branchToDelete.id.toString(),
        ENTITY_TYPE: 'branch',
        additional_info: { source: 'branch_api', timestamp: new Date().toISOString() }
      }, transaction);
    }

    await transaction.commit();
    res.status(200).json({ success: true, message: 'Branch deleted successfully', data: branchToDelete });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting branch', { error: error.message });
    res.status(500).json({ success: false, message: 'Error deleting branch', error: error.message });
  }
};

// @desc    Get business units for a specific branch
// @route   GET /api/branches/:id/business-units
// @access  Private
export const getBranchBusinessUnits = async (req, res) => {
  try {
    const branch = await Branch.findByPk(req.params.id, {
      attributes: ['id', 'organizationName', 'organizationCode', 'branchName', 'branchCode', 'branchType']
    });
    if (!branch) {
      return res.status(404).json({ success: false, message: 'Branch not found' });
    }

    const businessUnits = await BusinessUnit.findAll({
      where: { branch: req.params.id },
      attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']]
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
    logger.error('Error fetching business units for branch', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching business units', error: error.message });
  }
};

// @desc    Get branches by organization
// @route   GET /api/branches/organization/:organizationName
// @access  Private
export const getBranchesByOrganization = async (req, res) => {
  try {
    const { includeBusinessUnits, organizationCode, branchType, status } = req.query;
    const where = { organizationName: { [Op.like]: `%${req.params.organizationName}%` } };
    if (organizationCode) where.organizationCode = Number(organizationCode);
    if (branchType) where.branchType = branchType.toUpperCase();
    if (status) where.status = status.toUpperCase();

    const attributes = [
      'id', 'organizationName', 'organizationCode', 'branchName', 
      'branchCode', 'branchType', 'address', 'created_at', 'updated_at',
      'businessUnitId', 'BU_ID', 'created_by', 'createdBy', 'legacyId',
      'external_id', 'parent', 'office_address', 'country', 'state',
      'city', 'phone', 'email', 'branch_manager', 'opening_date',
      'branch_type', 'status', 'operational_model', 'approved_by', 'migration_id'
    ];

    let queryOptions = { where, attributes, order: [['organizationCode', 'ASC'], ['branchCode', 'ASC']] };
    if (includeBusinessUnits === 'true') {
      queryOptions.include = [{ model: BusinessUnit, as: 'businessUnits', attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS', 'branch', 'created_at', 'updated_at'] }];
    }
    const branches = await Branch.findAll(queryOptions);

    res.status(200).json({ success: true, count: branches.length, data: branches });
  } catch (error) {
    logger.error('Error fetching branches by organization', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching branches', error: error.message });
  }
};

// @desc    Get branches for the logged-in user (by BU_ID)
// @route   GET /api/branches/user-branches
// @access  Private
export const getUserBranches = async (req, res) => {
  try {
    const userBU_ID = req.user?.bu_id;
    if (!userBU_ID) {
      return res.status(200).json({ success: true, count: 0, data: [], message: 'No business unit assigned to this user' });
    }

    const where = { BU_ID: userBU_ID };
    if (req.query.status) where.status = req.query.status.toUpperCase();
    if (req.query.branchType) where.branchType = req.query.branchType.toUpperCase();

    const attributes = [
      'id', 'organizationName', 'organizationCode', 'branchName', 
      'branchCode', 'branchType', 'address', 'created_at', 'updated_at',
      'businessUnitId', 'BU_ID', 'created_by', 'createdBy', 'legacyId',
      'external_id', 'parent', 'office_address', 'country', 'state',
      'city', 'phone', 'email', 'branch_manager', 'opening_date',
      'branch_type', 'status', 'operational_model', 'approved_by', 'migration_id'
    ];

    const branches = await Branch.findAll({ where, attributes, order: [['created_at', 'DESC']] });
    res.status(200).json({ success: true, count: branches.length, data: branches, userBU_ID });
  } catch (error) {
    logger.error('Error fetching user branches', { error: error.message });
    res.status(500).json({ success: false, message: 'Error fetching user branches', error: error.message });
  }
};

// controllers/branchController.js (add this function if missing)

// @desc    Get branch by ID
// @route   GET /api/branches/branch/:id
// @access  Private
export const getBranchById = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID parameter
    if (!id || isNaN(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch ID'
      });
    }

    const branch = await Branch.findByPk(id, {
      include: [{
        model: BusinessUnit,
        as: 'businessUnit',      // must match the alias defined in Branch model association
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION', 'ADDRESS', 'STATUS']
      }],
      attributes: [
        'id', 'organizationName', 'organizationCode', 'branchName',
        'branchCode', 'branchType', 'address', 'created_at', 'updated_at',
        'businessUnitId', 'BU_ID', 'created_by', 'createdBy', 'legacyId',
        'external_id', 'parent', 'office_address', 'country', 'state',
        'city', 'phone', 'email', 'branch_manager', 'opening_date',
        'branch_type', 'status', 'operational_model', 'approved_by', 'migration_id'
      ]
    });

    if (!branch) {
      return res.status(404).json({
        success: false,
        message: 'Branch not found'
      });
    }

    res.status(200).json({
      success: true,
      data: branch
    });
  } catch (error) {
    logger.error('Error fetching branch by ID:', {
      error: error.message,
      branchId: req.params.id,
      userId: req.user?.id
    });
    res.status(500).json({
      success: false,
      message: 'Error fetching branch',
      error: error.message
    });
  }
};
