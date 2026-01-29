// controllers/BusinessUnitController.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import BusinessUnit from '../models/BusinessUnit.js';
import Branch from '../models/Branch.js';
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js';

// @desc    Get all business units
// @route   GET /api/business-units
// @access  Private
export const getAllBusinessUnits = async (req, res) => {
  try {
    const { 
      search, 
      BU_ID, 
      BUSINESS_UNIT, 
      STATUS, 
      branch, 
      includeBranch,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      page = 1,
      limit = 10
    } = req.query;
    
    logger.debug('Fetching all business units', { 
      search, 
      BU_ID, 
      BUSINESS_UNIT, 
      STATUS, 
      branch,
      includeBranch,
      userId: req.user?.id 
    });

    // Build where conditions
    const where = {};
    
    if (search) {
      where[Op.or] = [
        { BUSINESS_UNIT: { [Op.like]: `%${search}%` } },
        { DESCRIPTION: { [Op.like]: `%${search}%` } },
        { ADDRESS: { [Op.like]: `%${search}%` } }
      ];
    }
    
    if (BU_ID) {
      where.BU_ID = parseInt(BU_ID);
    }
    
    if (BUSINESS_UNIT) {
      where.BUSINESS_UNIT = { [Op.like]: `%${BUSINESS_UNIT}%` };
    }
    
    if (STATUS) {
      where.STATUS = STATUS.toUpperCase();
    }
    
    if (branch) {
      where.branch = parseInt(branch);
    }

    // Calculate offset for pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build query options
    const queryOptions = {
      where,
      attributes: [
        'id', 
        'BU_ID', 
        'BUSINESS_UNIT', 
        'DESCRIPTION', 
        'ADDRESS', 
        'STATUS', 
        'branch', 
        'created_at', 
        'updated_at'
      ],
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset: offset
    };

    // Include branch information if requested
    if (includeBranch === 'true') {
      queryOptions.include = [{
        model: Branch,
        as: 'Branch',
        attributes: ['id', 'organizationName', 'organizationCode', 'branchName', 'branchCode', 'branchType', 'address', 'status']
      }];
    }

    // Fetch business units with pagination
    const { count, rows: businessUnits } = await BusinessUnit.findAndCountAll(queryOptions);

    // Calculate pagination metadata
    const totalPages = Math.ceil(count / parseInt(limit));
    const currentPage = parseInt(page);

    logger.debug('Business units fetched successfully', { 
      count, 
      currentPage, 
      totalPages,
      limit 
    });

    res.status(200).json({
      success: true,
      data: businessUnits,
      pagination: {
        total: count,
        totalPages,
        currentPage,
        pageSize: parseInt(limit),
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      }
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

// @desc    Get single business unit by ID
// @route   GET /api/business-units/:id
// @access  Private
export const getBusinessUnitById = async (req, res) => {
  try {
    const { includeBranch } = req.query;
    
    logger.debug('Fetching business unit by ID', { 
      businessUnitId: req.params.id, 
      includeBranch,
      userId: req.user?.id 
    });
    
    const queryOptions = {
      where: { id: req.params.id },
      attributes: [
        'id', 
        'BU_ID', 
        'BUSINESS_UNIT', 
        'DESCRIPTION', 
        'ADDRESS', 
        'STATUS', 
        'branch', 
        'created_at', 
        'updated_at'
      ]
    };

    // Include branch information if requested
    if (includeBranch === 'true') {
      queryOptions.include = [{
        model: Branch,
        as: 'Branch',
        attributes: ['id', 'organizationName', 'organizationCode', 'branchName', 'branchCode', 'branchType', 'address', 'status']
      }];
    }
    
    const businessUnit = await BusinessUnit.findOne(queryOptions);

    if (!businessUnit) {
      logger.warn('Business unit not found', { businessUnitId: req.params.id });
      return res.status(404).json({
        success: false,
        message: 'Business unit not found'
      });
    }

    logger.debug('Business unit fetched successfully', { businessUnitId: businessUnit.id });

    res.status(200).json({
      success: true,
      data: businessUnit
    });
  } catch (error) {
    logger.error('Error fetching business unit by ID', { 
      error: error.message,
      businessUnitId: req.params.id 
    });

    // Check if it's an invalid ID format error
    if (error.name === 'SequelizeDatabaseError' || error.name === 'TypeError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid business unit ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business unit',
      error: error.message
    });
  }
};

// @desc    Get business unit by BU_ID
// @route   GET /api/business-units/bu-id/:buId
// @access  Private
export const getBusinessUnitByBuId = async (req, res) => {
  try {
    const { includeBranch } = req.query;
    
    logger.debug('Fetching business unit by BU_ID', { 
      buId: req.params.buId, 
      includeBranch,
      userId: req.user?.id 
    });
    
    const queryOptions = {
      where: { BU_ID: parseInt(req.params.buId) },
      attributes: [
        'id', 
        'BU_ID', 
        'BUSINESS_UNIT', 
        'DESCRIPTION', 
        'ADDRESS', 
        'STATUS', 
        'branch', 
        'created_at', 
        'updated_at'
      ]
    };

    // Include branch information if requested
    if (includeBranch === 'true') {
      queryOptions.include = [{
        model: Branch,
        as: 'Branch',
        attributes: ['id', 'organizationName', 'organizationCode', 'branchName', 'branchCode', 'branchType', 'address', 'status']
      }];
    }
    
    const businessUnit = await BusinessUnit.findOne(queryOptions);

    if (!businessUnit) {
      logger.warn('Business unit not found by BU_ID', { buId: req.params.buId });
      return res.status(404).json({
        success: false,
        message: 'Business unit not found'
      });
    }

    logger.debug('Business unit fetched by BU_ID successfully', { buId: businessUnit.BU_ID });

    res.status(200).json({
      success: true,
      data: businessUnit
    });
  } catch (error) {
    logger.error('Error fetching business unit by BU_ID', { 
      error: error.message,
      buId: req.params.buId 
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business unit',
      error: error.message
    });
  }
};

// @desc    Create a new business unit (standalone - not linked to branch creation)
// @route   POST /api/business-units
// @access  Private
export const createBusinessUnit = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { 
      BU_ID, 
      BUSINESS_UNIT, 
      DESCRIPTION, 
      ADDRESS, 
      STATUS = 'ACTIVE',
      branch 
    } = req.body;
    
    const userId = req.user?.id || 'system';
    const now = new Date();

    logger.info('Creating new business unit', { 
      BU_ID, 
      BUSINESS_UNIT,
      branch,
      userId 
    });

    // Validate required fields
    if (!BU_ID || !BUSINESS_UNIT) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'BU_ID and BUSINESS_UNIT are required'
      });
    }

    // Validate BU_ID is a valid number
    if (isNaN(BU_ID)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a valid number'
      });
    }

    // Check if business unit with BU_ID already exists
    const existingBusinessUnit = await BusinessUnit.findOne({ 
      where: { BU_ID: parseInt(BU_ID) },
      transaction
    });
    
    if (existingBusinessUnit) {
      await transaction.rollback();
      logger.warn('Business Unit creation failed - duplicate BU_ID', { BU_ID });
      
      return res.status(400).json({
        success: false,
        message: `Business Unit with BU_ID ${BU_ID} already exists`
      });
    }

    // If branch is provided, verify it exists
    if (branch) {
      const branchExists = await Branch.findByPk(branch, { transaction });
      
      if (!branchExists) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }
    }

    // Create business unit
    const businessUnitData = {
      BU_ID: parseInt(BU_ID),
      BUSINESS_UNIT: BUSINESS_UNIT.trim().toUpperCase(),
      DESCRIPTION: DESCRIPTION?.trim() || BUSINESS_UNIT,
      ADDRESS: ADDRESS?.trim() || BUSINESS_UNIT + ' Address',
      STATUS: STATUS.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      branch: branch || null,
      created_at: now,
      updated_at: now
    };

    const savedBusinessUnit = await BusinessUnit.create(businessUnitData, { transaction });

    // Add audit trail
    if (addAuditTrail) {
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
          source: 'business_unit_api',
          timestamp: now.toISOString()
        }
      }, transaction);
    }

    await transaction.commit();
    
    logger.info('Business Unit created successfully', { 
      businessUnitId: savedBusinessUnit.id,
      BU_ID: savedBusinessUnit.BU_ID,
      BUSINESS_UNIT: savedBusinessUnit.BUSINESS_UNIT
    });

    res.status(201).json({
      success: true,
      message: 'Business Unit created successfully',
      data: savedBusinessUnit
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating business unit', { 
      error: error.message,
      body: req.body 
    });

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: error.errors.map(err => err.message).join(', ')
      });
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'BU_ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error creating business unit',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// @desc    Update business unit
// @route   PUT /api/business-units/:id
// @access  Private
export const updateBusinessUnit = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { 
      BU_ID, 
      BUSINESS_UNIT, 
      DESCRIPTION, 
      ADDRESS, 
      STATUS,
      branch 
    } = req.body;
    
    const userId = req.user?.id || 'system';
    const now = new Date();

    logger.info('Updating business unit', { 
      businessUnitId: req.params.id,
      updates: { BU_ID, BUSINESS_UNIT, STATUS, branch },
      userId 
    });

    // Get current business unit data for audit trail
    const currentBusinessUnit = await BusinessUnit.findByPk(req.params.id, { transaction });
    
    if (!currentBusinessUnit) {
      await transaction.rollback();
      logger.warn('Business unit not found for update', { businessUnitId: req.params.id });
      
      return res.status(404).json({
        success: false,
        message: 'Business unit not found'
      });
    }

    // Check if new BU_ID already exists
    if (BU_ID && BU_ID !== currentBusinessUnit.BU_ID) {
      const existingBusinessUnit = await BusinessUnit.findOne({ 
        where: { 
          BU_ID: parseInt(BU_ID),
          id: { [Op.ne]: req.params.id } 
        },
        transaction
      });
      
      if (existingBusinessUnit) {
        await transaction.rollback();
        logger.warn('Business Unit update failed - duplicate BU_ID', { BU_ID });
        
        return res.status(400).json({
          success: false,
          message: `Business Unit with BU_ID ${BU_ID} already exists`
        });
      }
    }

    // If branch is provided and changed, verify it exists
    if (branch && branch !== currentBusinessUnit.branch) {
      const branchExists = await Branch.findByPk(branch, { transaction });
      
      if (!branchExists) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Branch not found'
        });
      }
    }

    const oldValues = {
      BU_ID: currentBusinessUnit.BU_ID,
      BUSINESS_UNIT: currentBusinessUnit.BUSINESS_UNIT,
      DESCRIPTION: currentBusinessUnit.DESCRIPTION,
      ADDRESS: currentBusinessUnit.ADDRESS,
      STATUS: currentBusinessUnit.STATUS,
      branch: currentBusinessUnit.branch
    };

    // Prepare update data
    const updateData = { 
      ...req.body,
      updated_at: now
    };

    // Normalize fields if provided
    if (updateData.BU_ID) {
      updateData.BU_ID = parseInt(updateData.BU_ID);
    }
    if (updateData.BUSINESS_UNIT) {
      updateData.BUSINESS_UNIT = updateData.BUSINESS_UNIT.trim().toUpperCase();
    }
    if (updateData.STATUS) {
      updateData.STATUS = updateData.STATUS.toUpperCase();
    }

    // Update the business unit
    await BusinessUnit.update(updateData, {
      where: { id: req.params.id },
      transaction
    });

    // Fetch the updated business unit
    const updatedBusinessUnit = await BusinessUnit.findByPk(req.params.id, { transaction });

    // Add audit trail
    if (addAuditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE',
        USER_ID: userId.toString(),
        ACTION: 'update_business_unit',
        OLD_VALUE: oldValues,
        NEW_VALUE: updateData,
        IP_ADDRESS: req.ip || 'unknown',
        ENTITY_ID: updatedBusinessUnit.id.toString(),
        ENTITY_TYPE: 'business_unit',
        additional_info: {
          source: 'business_unit_api',
          timestamp: now.toISOString()
        }
      }, transaction);
    }

    await transaction.commit();
    logger.info('Business unit updated successfully', { 
      businessUnitId: updatedBusinessUnit.id, 
      BUSINESS_UNIT: updatedBusinessUnit.BUSINESS_UNIT 
    });

    res.status(200).json({
      success: true,
      message: 'Business unit updated successfully',
      data: updatedBusinessUnit
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating business unit', { 
      error: error.message,
      businessUnitId: req.params.id 
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
        message: 'Invalid business unit ID'
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'BU_ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating business unit',
      error: error.message
    });
  }
};

// @desc    Delete business unit
// @route   DELETE /api/business-units/:id
// @access  Private
export const deleteBusinessUnit = async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user?.id || 'system';
    const now = new Date();

    logger.info('Deleting business unit', { 
      businessUnitId: req.params.id,
      userId 
    });

    const businessUnitToDelete = await BusinessUnit.findByPk(req.params.id, { transaction });
    
    if (!businessUnitToDelete) {
      await transaction.rollback();
      logger.warn('Business unit not found for deletion', { businessUnitId: req.params.id });
      
      return res.status(404).json({
        success: false,
        message: 'Business unit not found'
      });
    }

    const oldValues = {
      BU_ID: businessUnitToDelete.BU_ID,
      BUSINESS_UNIT: businessUnitToDelete.BUSINESS_UNIT,
      DESCRIPTION: businessUnitToDelete.DESCRIPTION,
      ADDRESS: businessUnitToDelete.ADDRESS,
      STATUS: businessUnitToDelete.STATUS,
      branch: businessUnitToDelete.branch
    };

    // Delete the business unit
    await businessUnitToDelete.destroy({ transaction });

    // Add audit trail
    if (addAuditTrail) {
      await addAuditTrail({
        EVENT_TYPE: 'DELETE',
        USER_ID: userId.toString(),
        ACTION: 'delete_business_unit',
        OLD_VALUE: oldValues,
        NEW_VALUE: null,
        IP_ADDRESS: req.ip || 'unknown',
        ENTITY_ID: businessUnitToDelete.id.toString(),
        ENTITY_TYPE: 'business_unit',
        additional_info: {
          source: 'business_unit_api',
          timestamp: now.toISOString()
        }
      }, transaction);
    }

    await transaction.commit();
    logger.info('Business unit deleted successfully', { 
      businessUnitId: businessUnitToDelete.id,
      BUSINESS_UNIT: businessUnitToDelete.BUSINESS_UNIT 
    });

    res.status(200).json({
      success: true,
      message: 'Business unit deleted successfully',
      data: businessUnitToDelete
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting business unit', { 
      error: error.message,
      businessUnitId: req.params.id 
    });

    // Check for invalid ID
    if (error.name === 'SequelizeDatabaseError' || error.name === 'TypeError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid business unit ID'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error deleting business unit',
      error: error.message
    });
  }
};

// @desc    Get business units by status
// @route   GET /api/business-units/status/:status
// @access  Private
export const getBusinessUnitsByStatus = async (req, res) => {
  try {
    const { includeBranch, sortBy = 'BUSINESS_UNIT', sortOrder = 'ASC' } = req.query;
    const status = req.params.status.toUpperCase();
    
    logger.debug('Fetching business units by status', { 
      status,
      includeBranch,
      userId: req.user?.id 
    });
    
    // Validate status
    if (!['ACTIVE', 'INACTIVE'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either ACTIVE or INACTIVE'
      });
    }
    
    const queryOptions = {
      where: { STATUS: status },
      attributes: [
        'id', 
        'BU_ID', 
        'BUSINESS_UNIT', 
        'DESCRIPTION', 
        'ADDRESS', 
        'STATUS', 
        'branch', 
        'created_at', 
        'updated_at'
      ],
      order: [[sortBy, sortOrder]]
    };

    // Include branch information if requested
    if (includeBranch === 'true') {
      queryOptions.include = [{
        model: Branch,
        as: 'Branch',
        attributes: ['id', 'organizationName', 'organizationCode', 'branchName', 'branchCode', 'branchType', 'address', 'status']
      }];
    }
    
    const businessUnits = await BusinessUnit.findAll(queryOptions);

    logger.debug('Business units by status fetched successfully', { 
      status,
      count: businessUnits.length 
    });

    res.status(200).json({
      success: true,
      count: businessUnits.length,
      data: businessUnits
    });
  } catch (error) {
    logger.error('Error fetching business units by status', { 
      error: error.message,
      status: req.params.status 
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business units',
      error: error.message
    });
  }
};

// @desc    Search business units by name or description
// @route   GET /api/business-units/search/:query
// @access  Private
export const searchBusinessUnits = async (req, res) => {
  try {
    const { includeBranch, limit = 10 } = req.query;
    const searchQuery = req.params.query;
    
    logger.debug('Searching business units', { 
      query: searchQuery,
      includeBranch,
      userId: req.user?.id 
    });
    
    const queryOptions = {
      where: {
        [Op.or]: [
          { BUSINESS_UNIT: { [Op.like]: `%${searchQuery}%` } },
          { DESCRIPTION: { [Op.like]: `%${searchQuery}%` } }
        ]
      },
      attributes: [
        'id', 
        'BU_ID', 
        'BUSINESS_UNIT', 
        'DESCRIPTION', 
        'ADDRESS', 
        'STATUS', 
        'branch', 
        'created_at', 
        'updated_at'
      ],
      order: [['BUSINESS_UNIT', 'ASC']],
      limit: parseInt(limit)
    };

    // Include branch information if requested
    if (includeBranch === 'true') {
      queryOptions.include = [{
        model: Branch,
        as: 'Branch',
        attributes: ['id', 'organizationName', 'organizationCode', 'branchName', 'branchCode', 'branchType', 'address', 'status']
      }];
    }
    
    const businessUnits = await BusinessUnit.findAll(queryOptions);

    logger.debug('Business units search completed', { 
      query: searchQuery,
      count: businessUnits.length 
    });

    res.status(200).json({
      success: true,
      count: businessUnits.length,
      data: businessUnits
    });
  } catch (error) {
    logger.error('Error searching business units', { 
      error: error.message,
      query: req.params.query 
    });
    
    res.status(500).json({
      success: false,
      message: 'Error searching business units',
      error: error.message
    });
  }
};

// @desc    Get business units without branch association
// @route   GET /api/business-units/unassigned
// @access  Private
export const getUnassignedBusinessUnits = async (req, res) => {
  try {
    const { sortBy = 'BUSINESS_UNIT', sortOrder = 'ASC' } = req.query;
    
    logger.debug('Fetching unassigned business units', { 
      userId: req.user?.id 
    });
    
    const businessUnits = await BusinessUnit.findAll({
      where: { branch: null },
      attributes: [
        'id', 
        'BU_ID', 
        'BUSINESS_UNIT', 
        'DESCRIPTION', 
        'ADDRESS', 
        'STATUS', 
        'branch', 
        'created_at', 
        'updated_at'
      ],
      order: [[sortBy, sortOrder]]
    });

    logger.debug('Unassigned business units fetched successfully', { 
      count: businessUnits.length 
    });

    res.status(200).json({
      success: true,
      count: businessUnits.length,
      data: businessUnits
    });
  } catch (error) {
    logger.error('Error fetching unassigned business units', { 
      error: error.message
    });
    
    res.status(500).json({
      success: false,
      message: 'Error fetching business units',
      error: error.message
    });
  }
};