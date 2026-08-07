// controllers/VaultController.js
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import {
  Vault,
  VaultPersonnel,
  VaultApprovalRequest,
  VaultAuditLog,
  VaultMaintenanceLog,
  VaultConfiguration,
  VaultAccessAttempt,
  VaultAuthorizedPersonnel,
  VaultTransaction,
  VaultPendingApproval,
  VaultApprovalRequiredRole,
  VaultCurrentApprover,
  VaultEscalationHierarchy,
  VaultRoleAccessMatrix,
  Drawer,
  User,
  Branch
} from '../models/index.js';

// =============================================
// VAULT MANAGEMENT CONTROLLERS
// =============================================

/**
 * Create a new vault
 */
export const createVault = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('📦 Starting vault creation...');
    
    const {
      VAULT_ID,
      VAULT_CD,
      VAULT_NM,
      VAULT_CATEGORY,
      SECURITY_LEVEL,
      VAULT_CAPACITY,
      BRANCH_CODE,
      LOCATION_CODE,
      CREATED_BY,
      DRAWER_ID
    } = req.body;

    // Get user info from authenticated request
    const userId = req.user?.user_name || req.user?.id || CREATED_BY || 'system';
    
    console.log('👤 User ID from request:', userId);
    console.log('📝 Received DRAWER_ID:', DRAWER_ID);

    console.log('📝 Validating input...');
    
    // Validate required fields
    if (!VAULT_ID || !VAULT_CD || !VAULT_NM || !DRAWER_ID) {
      console.log('❌ Validation failed - missing fields');
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: VAULT_ID, VAULT_CD, VAULT_NM, DRAWER_ID'
      });
    }

    // ✅ ENHANCED: Validate VAULT_CAPACITY format if provided
    if (VAULT_CAPACITY !== undefined && VAULT_CAPACITY !== null && VAULT_CAPACITY !== '') {
      const capacityRegex = /^\d+(\.\d{1,2})?$/;
      if (!capacityRegex.test(VAULT_CAPACITY.toString())) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid VAULT_CAPACITY format. Must be a number with up to 2 decimal places (e.g., 5000000.00)'
        });
      }
      
      const capacityNum = parseFloat(VAULT_CAPACITY);
      if (capacityNum <= 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'VAULT_CAPACITY must be a positive number'
        });
      }
      
      const MAX_SAFE_AMOUNT = 1000000000000;
      if (capacityNum > MAX_SAFE_AMOUNT) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `VAULT_CAPACITY cannot exceed ${MAX_SAFE_AMOUNT.toLocaleString()}`
        });
      }
    }

    console.log(`🔍 Checking for existing vault with ID: ${VAULT_ID} or Code: ${VAULT_CD}`);
    
    // Check if vault already exists
    const existingVault = await Vault.findOne({
      where: {
        [Op.or]: [
          { vault_id: VAULT_ID },
          { vault_cd: VAULT_CD }
        ]
      },
      transaction
    });

    if (existingVault) {
      console.log('❌ Vault already exists');
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'Vault with this ID or code already exists'
      });
    }

    console.log(`🔍 Finding drawer with DRAWER_ID: ${DRAWER_ID} or DRAWER_NO: ${DRAWER_ID}`);
    
    // ✅ FIX: Find drawer by DRAWER_ID OR DRAWER_NO
    let existingDrawer = await Drawer.findOne({
      where: { DRAWER_ID: DRAWER_ID },
      transaction
    });
    
    // If not found by DRAWER_ID, try by DRAWER_NO
    if (!existingDrawer) {
      console.log(`🔍 Trying to find by DRAWER_NO: ${DRAWER_ID}`);
      existingDrawer = await Drawer.findOne({
        where: { DRAWER_NO: DRAWER_ID },
        transaction
      });
    }
    
    // If still not found, try by id (numeric)
    if (!existingDrawer && !isNaN(parseInt(DRAWER_ID))) {
      console.log(`🔍 Trying to find by id: ${parseInt(DRAWER_ID)}`);
      existingDrawer = await Drawer.findOne({
        where: { id: parseInt(DRAWER_ID) },
        transaction
      });
    }
    
    if (!existingDrawer) {
      console.log('❌ Drawer not found');
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer with ID or Number ${DRAWER_ID} not found. Please check the drawer exists.`
      });
    }

    console.log(`✅ Found drawer: DRAWER_ID: ${existingDrawer.DRAWER_ID}, DRAWER_NO: ${existingDrawer.DRAWER_NO}`);

    // Check if drawer is already used
    const drawerAlreadyUsed = await Vault.findOne({
      where: { drawer_ref: existingDrawer.id },
      transaction
    });

    if (drawerAlreadyUsed) {
      console.log('❌ Drawer already associated with another vault');
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: `Drawer ${existingDrawer.DRAWER_NO} (ID: ${existingDrawer.DRAWER_ID}) is already associated with another vault`
      });
    }

    console.log('🔄 Updating drawer...');
    
    const capacity = VAULT_CAPACITY ? parseFloat(VAULT_CAPACITY) : 10000000.00;
    
    // Update drawer
    await existingDrawer.update({
      DRAWER_NM: VAULT_NM,
      DRAWER_TY_CD: 'VAULT',
      VAULT_TYPE: VAULT_CATEGORY || 'BRANCH_VAULT',
      SECURITY_LEVEL: SECURITY_LEVEL || 'LEVEL_2',
      REQUIRES_DUAL_CONTROL: true,
      VAULT_CAPACITY: capacity,
      MAX_BAL: capacity,
      GL_ACCT_NO: `VAULT-${VAULT_CD}`,
      BRANCH_CODE: BRANCH_CODE || existingDrawer.BRANCH_CODE,
      updated_at: new Date()
    }, { transaction });

    console.log('📝 Creating vault...');
    
    // Create vault
    const vault = await Vault.create({
      vault_id: parseInt(VAULT_ID, 10),
      vault_cd: VAULT_CD,
      vault_nm: VAULT_NM,
      drawer_id: parseInt(existingDrawer.DRAWER_ID, 10) || parseInt(DRAWER_ID, 10),
      drawer_ref: existingDrawer.id,
      vault_category: VAULT_CATEGORY || 'BRANCH_VAULT',
      security_level: SECURITY_LEVEL || 'LEVEL_2',
      requires_dual_control: true,
      vault_capacity: capacity,
      branch_code: BRANCH_CODE || existingDrawer.BRANCH_CODE,
      location_code: LOCATION_CODE || existingDrawer.location_code,
      created_by: userId,
      vault_status: 'OPERATIONAL',
      is_active: true,
      
      // Set transaction limits based on capacity
      limit_max_single_deposit: capacity * 0.1,
      limit_max_single_withdrawal: capacity * 0.05,
      limit_daily_deposit: capacity * 0.3,
      limit_daily_withdrawal: capacity * 0.2
    }, { transaction });

    // Create initial authorized personnel
    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(currentDate.getFullYear() + 1);
    
    await VaultAuthorizedPersonnel.bulkCreate([
      {
        vault_id: vault.id,
        user_id: userId,
        user_name: req.user?.preferred_name || "Primary Vault Manager",
        user_role: "VAULT_MANAGER",
        access_level: "FULL",
        authorization_start: currentDate,
        authorization_end: futureDate,
        is_active: true,
        authorized_by: userId,
        authorization_notes: "Primary vault administrator with full access rights"
      },
      {
        vault_id: vault.id,
        user_id: `${userId}_backup`,
        user_name: "Backup Vault Manager",
        user_role: "VAULT_MANAGER",
        access_level: "FULL",
        authorization_start: currentDate,
        authorization_end: futureDate,
        is_active: true,
        authorized_by: userId,
        authorization_notes: "Backup vault administrator with full access rights"
      }
    ], { transaction });

    await transaction.commit();

    console.log('✅ Vault created successfully');
    
    // Get complete vault data
    const populatedVault = await Vault.findOne({
      where: { id: vault.id },
      include: [
        { model: Drawer, as: 'drawer' },
        { model: VaultAuthorizedPersonnel, as: 'authorizedPersonnel' }
      ]
    });

    return res.status(201).json({
      success: true,
      message: 'Vault created successfully',
      data: {
        vault: populatedVault,
        drawer: existingDrawer,
        created_by: userId,
        capacityDetails: {
          capacity: capacity,
          formattedCapacity: capacity.toLocaleString('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }),
          transactionLimits: {
            maxSingleDeposit: (capacity * 0.1).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }),
            maxSingleWithdrawal: (capacity * 0.05).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })
          }
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Create vault error:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = Object.keys(error.fields)[0];
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry',
        error: `${field} '${error.fields[field]}' already exists`
      });
    }
    
    if (error.name === 'SequelizeValidationError') {
      const errors = {};
      error.errors.forEach(err => {
        errors[err.path] = err.message;
      });
      
      return res.status(400).json({
        success: false,
        message: 'Vault validation failed',
        errors: errors
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to create vault',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get all vaults with filtering and pagination
 */
export const getAllVaults = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      security_level,
      branch_code,
      search,
      active = true
    } = req.query;

    const where = {};
    if (active !== undefined) {
      where.is_active = active === 'true' || active === true;
    }
    if (category) where.vault_category = category;
    if (status) where.vault_status = status;
    if (security_level) where.security_level = security_level;
    
    if (search) {
      where[Op.or] = [
        { vault_cd: { [Op.like]: `%${search}%` } },
        { vault_nm: { [Op.like]: `%${search}%` } }
      ];
    }

    const include = [
      {
        model: Drawer,
        as: 'drawer',
        required: branch_code ? true : false,
        where: branch_code ? { branch_code } : {}
      }
    ];

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const total = await Vault.count({
      where,
      include
    });

    const vaults = await Vault.findAll({
      where,
      include,
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: {
        docs: vaults,
        totalDocs: total,
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        page: parseInt(page),
        pagingCounter: offset + 1,
        hasPrevPage: parseInt(page) > 1,
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        prevPage: parseInt(page) > 1 ? parseInt(page) - 1 : null,
        nextPage: parseInt(page) < Math.ceil(total / parseInt(limit)) ? parseInt(page) + 1 : null
      }
    });

  } catch (error) {
    console.error('Get all vaults error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vaults',
      error: error.message
    });
  }
};

/**
 * Get vault by ID
 */
export const getVaultById = async (req, res) => {
  try {
    const { id } = req.params;
    console.log('🔍 Fetching vault with ID:', id);
    
    const numericId = parseInt(id);
    
    let where;
    if (!isNaN(numericId) && numericId.toString() === id) {
      where = { vault_id: numericId };
    } else {
      if (/^\d+$/.test(id)) {
        where = { id: parseInt(id) };
      } else {
        where = { vault_cd: id };
      }
    }
    
    const vault = await Vault.findOne({
      where,
      include: [
        { model: Drawer, as: 'drawer' },
        { model: VaultAuthorizedPersonnel, as: 'authorizedPersonnel' },
        { model: VaultAccessAttempt, as: 'accessAttempts', limit: 100 },
        { model: VaultMaintenanceLog, as: 'maintenanceLogs', limit: 10 }
      ]
    });
    
    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }
    
    res.json({
      success: true,
      data: vault
    });
    
  } catch (error) {
    console.error('Error fetching vault:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vault',
      error: error.message
    });
  }
};

/**
 * Update vault details
 */
export const updateVault = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const updateData = req.body;
    const userId = req.user?.user_name || req.user?.id || updateData.UPDATED_BY || 'system';

    if (!userId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const restrictedFields = ['vault_id', 'vault_cd', 'drawer_ref', 'created_by'];
    restrictedFields.forEach(field => delete updateData[field]);

    await vault.update({
      ...updateData,
      updated_by: userId
    }, { transaction });

    if (updateData.vault_nm && vault.drawer_ref) {
      await Drawer.update(
        { drawer_nm: updateData.vault_nm },
        {
          where: { id: vault.drawer_ref },
          transaction
        }
      );
    }

    await transaction.commit();

    const updatedVault = await Vault.findOne({
      where: { id: vault.id },
      include: [{ model: Drawer, as: 'drawer' }]
    });

    res.json({
      success: true,
      message: 'Vault updated successfully',
      data: updatedVault
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Update vault error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vault',
      error: error.message
    });
  }
};

/**
 * Deactivate vault
 */
export const deactivateVault = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const userId = req.user?.user_name || req.user?.id || req.body.UPDATED_BY || 'system';
    const { reason } = req.body;

    if (!userId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      include: [{ model: Drawer, as: 'drawer' }],
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    if (vault.drawer && parseFloat(vault.drawer.current_balance) > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate vault with positive balance'
      });
    }

    await vault.update({
      is_active: false,
      vault_status: 'DECOMMISSIONED',
      updated_by: userId
    }, { transaction });

    if (vault.drawer) {
      await vault.drawer.update({
        rec_st: 'C',
        wf_status: 'CLOSED'
      }, { transaction });
    }

    await transaction.commit();

    res.json({
      success: true,
      message: 'Vault deactivated successfully',
      data: {
        vault,
        deactivation_reason: reason
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Deactivate vault error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate vault',
      error: error.message
    });
  }
};

// =============================================
// ACCESS CONTROL CONTROLLERS
// =============================================

/**
 * Authorize personnel for vault access
 */
export const authorizePersonnel = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const {
      user_id,
      user_name,
      user_role,
      access_level = 'LIMITED',
      notes = ''
    } = req.body;

    const userId = req.user?.user_name || req.user?.id || user_id;

    if (!user_id || !user_name || !user_role) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: user_id, user_name, user_role'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if user already authorized
    const existingAuth = await VaultAuthorizedPersonnel.findOne({
      where: {
        vault_id: vault.id,
        user_id: user_id,
        is_active: true
      },
      transaction
    });

    if (existingAuth) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'User is already authorized for this vault'
      });
    }

    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(currentDate.getFullYear() + 1);

    const authorization = await VaultAuthorizedPersonnel.create({
      vault_id: vault.id,
      user_id: user_id,
      user_name: user_name,
      user_role: user_role,
      access_level: access_level,
      authorization_start: currentDate,
      authorization_end: futureDate,
      is_active: true,
      authorized_by: userId,
      authorization_notes: notes
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Personnel authorized successfully',
      data: {
        vault: vault.vault_cd,
        authorized_person: authorization
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Authorize personnel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to authorize personnel',
      error: error.message
    });
  }
};

/**
 * Bulk authorize personnel
 */
export const bulkAuthorizePersonnel = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { personnel } = req.body;
    const userId = req.user?.user_name || req.user?.id || 'system';

    if (!personnel || !Array.isArray(personnel) || personnel.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'personnel array is required and must not be empty'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(currentDate.getFullYear() + 1);

    const results = [];
    for (const person of personnel) {
      const { user_id, user_name, user_role, access_level = 'LIMITED' } = person;
      
      if (!user_id || !user_name || !user_role) continue;

      const existing = await VaultAuthorizedPersonnel.findOne({
        where: {
          vault_id: vault.id,
          user_id: user_id,
          is_active: true
        },
        transaction
      });

      if (!existing) {
        const auth = await VaultAuthorizedPersonnel.create({
          vault_id: vault.id,
          user_id: user_id,
          user_name: user_name,
          user_role: user_role,
          access_level: access_level,
          authorization_start: currentDate,
          authorization_end: futureDate,
          is_active: true,
          authorized_by: userId
        }, { transaction });
        
        results.push({ user_id, success: true, authorization: auth });
      } else {
        results.push({ user_id, success: false, message: 'Already authorized' });
      }
    }

    await transaction.commit();

    res.json({
      success: true,
      message: `${results.filter(r => r.success).length} personnel authorized successfully`,
      data: {
        vault: vault.vault_cd,
        results: results
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Bulk authorize personnel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk authorize personnel',
      error: error.message
    });
  }
};

/**
 * Revoke personnel authorization
 */
export const revokeAuthorization = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id, userId } = req.params;
    const revokedBy = req.user?.user_name || req.user?.id || 'system';
    const { reason = '' } = req.body;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const authorization = await VaultAuthorizedPersonnel.findOne({
      where: {
        vault_id: vault.id,
        user_id: userId,
        is_active: true
      },
      transaction
    });

    if (!authorization) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Authorization not found for this user'
      });
    }

    await authorization.update({
      is_active: false,
      authorization_notes: `Revoked by ${revokedBy} on ${new Date().toISOString()}. Reason: ${reason}`
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Authorization revoked successfully',
      data: {
        vault: vault.vault_cd,
        revoked_authorization: authorization
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Revoke authorization error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke authorization',
      error: error.message
    });
  }
};

/**
 * Get authorized personnel for vault
 */
export const getAuthorizedPersonnel = async (req, res) => {
  try {
    const { id } = req.params;
    const { active_only = true } = req.query;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      include: [{
        model: VaultAuthorizedPersonnel,
        as: 'authorizedPersonnel',
        where: active_only === 'true' ? { is_active: true } : {}
      }]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    res.json({
      success: true,
      data: {
        vault: vault.vault_cd,
        personnel_count: vault.authorizedPersonnel?.length || 0,
        personnel: vault.authorizedPersonnel || []
      }
    });

  } catch (error) {
    console.error('Get authorized personnel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch authorized personnel',
      error: error.message
    });
  }
};

// =============================================
// APPROVAL WORKFLOW CONTROLLERS
// =============================================

/**
 * Create approval request
 */
export const createApprovalRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const {
      request_type,
      request_details,
      urgency = 'NORMAL'
    } = req.body;

    const userId = req.user?.user_name || req.user?.id || 'system';

    if (!request_type || !request_details) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: request_type, request_details'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const approvalRequest = await VaultPendingApproval.create({
      vault_id: vault.id,
      approval_id: `APPR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      request_type: request_type,
      requested_by: userId,
      requested_at: new Date(),
      status: 'PENDING',
      request_details: request_details
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Approval request created successfully',
      data: {
        vault: vault.vault_cd,
        approval_request: approvalRequest
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Create approval request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create approval request',
      error: error.message
    });
  }
};

/**
 * Approve request
 */
export const approveRequest = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id, approvalId } = req.params;
    const userId = req.user?.user_name || req.user?.id || 'system';
    const { comments = '' } = req.body;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const approval = await VaultPendingApproval.findOne({
      where: {
        approval_id: approvalId,
        vault_id: vault.id,
        status: 'PENDING'
      },
      transaction
    });

    if (!approval) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Approval request not found or already processed'
      });
    }

    await approval.update({
      status: 'APPROVED',
      approved_by: userId,
      approved_at: new Date()
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Request approved successfully',
      data: {
        vault: vault.vault_cd,
        approval_request: approval
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Approve request error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve request',
      error: error.message
    });
  }
};

/**
 * Get pending approvals
 */
export const getPendingApprovals = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.query;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      include: [{
        model: VaultPendingApproval,
        as: 'pendingApprovals',
        where: { status: 'PENDING' },
        required: false
      }]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    let pendingApprovals = vault.pendingApprovals || [];

    res.json({
      success: true,
      data: {
        vault: vault.vault_cd,
        pending_approvals_count: pendingApprovals.length,
        pending_approvals: pendingApprovals
      }
    });

  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending approvals',
      error: error.message
    });
  }
};

// =============================================
// SECURITY & MAINTENANCE CONTROLLERS
// =============================================

/**
 * Log access attempt
 */
export const logAccessAttempt = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const {
      user_id,
      attempt_type,
      status,
      ip_address = null
    } = req.body;

    if (!user_id || !attempt_type || !status) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: user_id, attempt_type, status'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const accessLog = await VaultAccessAttempt.create({
      vault_id: vault.id,
      user_id: user_id,
      attempt_type: attempt_type,
      status: status,
      ip_address: ip_address || req.ip,
      user_agent: req.headers['user-agent'] || null
    }, { transaction });

    await transaction.commit();

    res.json({
      success: true,
      message: 'Access attempt logged successfully',
      data: {
        vault: vault.vault_cd,
        access_log: accessLog
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Log access attempt error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to log access attempt',
      error: error.message
    });
  }
};

/**
 * Record maintenance
 */
export const recordMaintenance = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const {
      maintenance_type,
      description,
      cost,
      next_maintenance_date
    } = req.body;

    const userId = req.user?.user_name || req.user?.id || 'system';

    if (!maintenance_type || !description) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: maintenance_type, description'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const maintenanceLog = await VaultMaintenanceLog.create({
      vault_id: vault.id,
      maintenance_type: maintenance_type,
      performed_by: userId,
      performed_at: new Date(),
      description: description,
      cost: cost || null,
      next_maintenance_date: next_maintenance_date || null,
      status: 'COMPLETED'
    }, { transaction });

    // Update vault maintenance info
    await vault.update({
      maintenance_last_date: new Date(),
      maintenance_next_date: next_maintenance_date || null
    }, { transaction });

    await transaction.commit();

    res.status(201).json({
      success: true,
      message: 'Maintenance recorded successfully',
      data: {
        vault: vault.vault_cd,
        maintenance_log: maintenanceLog
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Record maintenance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record maintenance',
      error: error.message
    });
  }
};

/**
 * Update security features
 */
export const updateSecurityFeatures = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    const { security_features } = req.body;
    const userId = req.user?.user_name || req.user?.id || 'system';

    if (!security_features) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'security_features is required'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    await vault.update({
      security_features: security_features,
      updated_by: userId
    }, { transaction });

    await transaction.commit();

    return res.json({
      success: true,
      message: 'Security features updated successfully',
      data: {
        vault_id: vault.vault_id,
        vault_code: vault.vault_cd,
        updated_security_features: security_features
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Update security features error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update security features',
      error: error.message
    });
  }
};

// =============================================
// REPORTING & ANALYTICS CONTROLLERS
// =============================================

/**
 * Get vault utilization report
 */
export const getVaultUtilization = async (req, res) => {
  try {
    const { id } = req.params;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      include: [{ model: Drawer, as: 'drawer' }]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const capacity = parseFloat(vault.vault_capacity || 0);
    const balance = vault.drawer ? parseFloat(vault.drawer.current_balance || 0) : 0;
    const utilization = capacity > 0 ? (balance / capacity * 100).toFixed(2) : 0;
    
    const utilizationData = {
      vault_id: vault.vault_id,
      vault_code: vault.vault_cd,
      vault_name: vault.vault_nm,
      capacity: capacity,
      current_balance: balance,
      utilization_percentage: `${utilization}%`,
      available_capacity: capacity - balance,
      status: vault.vault_status,
      last_updated: vault.updated_at || vault.created_at
    };

    return res.json({
      success: true,
      data: utilizationData
    });

  } catch (error) {
    console.error('Get vault utilization error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vault utilization',
      error: error.message
    });
  }
};

/**
 * Get vaults by Branch Code (Business Unit)
 */
export const getVaultByBU = async (req, res) => {
  try {
    const { branchCode } = req.params;
    const {
      page = 1,
      limit = 10,
      category,
      status,
      security_level,
      active = true
    } = req.query;

    console.log(`🔍 Fetching vaults for branch: ${branchCode}`);

    if (!branchCode || branchCode.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Branch code is required'
      });
    }

    const drawerWhere = {
      branch_code: branchCode.trim()
    };

    const vaultWhere = {};
    
    if (active !== undefined) {
      if (active === 'true' || active === true) {
        vaultWhere.is_active = true;
        vaultWhere.vault_status = { [Op.ne]: 'DECOMMISSIONED' };
      } else {
        vaultWhere.is_active = false;
        vaultWhere.vault_status = 'DECOMMISSIONED';
      }
    }

    if (category) vaultWhere.vault_category = category;
    if (status) vaultWhere.vault_status = status;
    if (security_level) vaultWhere.security_level = security_level;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const total = await Vault.count({
      where: vaultWhere,
      include: [{
        model: Drawer,
        as: 'drawer',
        where: drawerWhere,
        required: true
      }]
    });

    const vaults = await Vault.findAll({
      where: vaultWhere,
      include: [{
        model: Drawer,
        as: 'drawer',
        where: drawerWhere,
        required: true
      }],
      limit: parseInt(limit),
      offset,
      order: [['created_at', 'DESC']]
    });

    const enhancedDocs = vaults.map(vault => {
      const vaultData = vault.toJSON();
      const capacity = parseFloat(vaultData.vault_capacity || 0);
      const currentBalance = vaultData.drawer ? parseFloat(vaultData.drawer.current_balance || 0) : 0;
      
      return {
        ...vaultData,
        utilization_percentage: capacity > 0 ? ((currentBalance / capacity) * 100).toFixed(2) + '%' : '0%',
        available_capacity: capacity - currentBalance
      };
    });

    const branchStatistics = {
      total_vaults: total,
      active_vaults: enhancedDocs.filter(v => v.is_active).length,
      total_capacity: enhancedDocs.reduce((sum, v) => 
        sum + parseFloat(v.vault_capacity || 0), 0),
      total_balance: enhancedDocs.reduce((sum, v) => 
        sum + (v.drawer?.current_balance || 0), 0),
      categories: {},
      security_levels: {}
    };

    enhancedDocs.forEach(vault => {
      const category = vault.vault_category || 'UNKNOWN';
      branchStatistics.categories[category] = (branchStatistics.categories[category] || 0) + 1;
      
      const securityLevel = vault.security_level || 'UNKNOWN';
      branchStatistics.security_levels[securityLevel] = (branchStatistics.security_levels[securityLevel] || 0) + 1;
    });

    branchStatistics.utilization_percentage = branchStatistics.total_capacity > 0 
      ? ((branchStatistics.total_balance / branchStatistics.total_capacity) * 100).toFixed(2) + '%'
      : '0%';

    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    };

    return res.json({
      success: true,
      message: `Found ${total} vault(s) for branch ${branchCode}`,
      data: {
        docs: enhancedDocs,
        totalDocs: total,
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
        page: parseInt(page),
        pagingCounter: offset + 1,
        hasPrevPage: parseInt(page) > 1,
        hasNextPage: parseInt(page) < Math.ceil(total / parseInt(limit)),
        prevPage: parseInt(page) > 1 ? parseInt(page) - 1 : null,
        nextPage: parseInt(page) < Math.ceil(total / parseInt(limit)) ? parseInt(page) + 1 : null,
        branch_statistics: {
          ...branchStatistics,
          formatted_total_capacity: formatCurrency(branchStatistics.total_capacity),
          formatted_total_balance: formatCurrency(branchStatistics.total_balance),
          formatted_available_capacity: formatCurrency(
            branchStatistics.total_capacity - branchStatistics.total_balance
          )
        }
      }
    });

  } catch (error) {
    console.error('❌ Get vault by BU error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vaults by branch',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// =============================================
// BRANCH-SPECIFIC OPERATIONS
// =============================================

/**
 * Get branch vault summary (consolidated view)
 */
export const getBranchVaultSummary = async (req, res) => {
  try {
    const { branchCode } = req.params;
    
    console.log(`📊 Getting branch vault summary for: ${branchCode}`);

    if (!branchCode || branchCode.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Branch code is required'
      });
    }

    const vaults = await Vault.findAll({
      where: {
        is_active: true,
        vault_status: { [Op.ne]: 'DECOMMISSIONED' }
      },
      include: [{
        model: Drawer,
        as: 'drawer',
        where: { branch_code: branchCode.trim() },
        required: true
      }]
    });

    const summary = {
      branch_code: branchCode,
      total_vaults: vaults.length,
      categories: {},
      capacity_summary: {
        total_capacity: 0,
        utilized_capacity: 0,
        available_capacity: 0,
        utilization_rate: 0
      },
      security_summary: {
        level_1: 0,
        level_2: 0,
        level_3: 0,
        other: 0
      },
      vault_list: []
    };

    vaults.forEach(vault => {
      const capacity = parseFloat(vault.vault_capacity || 0);
      const balance = parseFloat(vault.drawer?.current_balance || 0);
      
      summary.capacity_summary.total_capacity += capacity;
      summary.capacity_summary.utilized_capacity += balance;
      
      const category = vault.vault_category || 'UNKNOWN';
      summary.categories[category] = (summary.categories[category] || 0) + 1;
      
      const securityLevel = vault.security_level || 'UNKNOWN';
      switch(securityLevel) {
        case 'LEVEL_1': summary.security_summary.level_1++; break;
        case 'LEVEL_2': summary.security_summary.level_2++; break;
        case 'LEVEL_3': summary.security_summary.level_3++; break;
        default: summary.security_summary.other++;
      }
      
      summary.vault_list.push({
        vault_id: vault.vault_id,
        vault_code: vault.vault_cd,
        vault_name: vault.vault_nm,
        category: vault.vault_category,
        security_level: vault.security_level,
        capacity: capacity,
        current_balance: balance,
        utilization: capacity > 0 ? (balance / capacity * 100).toFixed(2) + '%' : '0%',
        status: vault.vault_status,
        requires_dual_control: vault.requires_dual_control || false
      });
    });

    summary.capacity_summary.available_capacity = 
      summary.capacity_summary.total_capacity - summary.capacity_summary.utilized_capacity;
    
    summary.capacity_summary.utilization_rate = summary.capacity_summary.total_capacity > 0
      ? (summary.capacity_summary.utilized_capacity / summary.capacity_summary.total_capacity * 100).toFixed(2) + '%'
      : '0%';

    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    };

    return res.json({
      success: true,
      message: `Branch vault summary for ${branchCode}`,
      data: {
        ...summary,
        capacity_summary: {
          ...summary.capacity_summary,
          formatted_total_capacity: formatCurrency(summary.capacity_summary.total_capacity),
          formatted_utilized_capacity: formatCurrency(summary.capacity_summary.utilized_capacity),
          formatted_available_capacity: formatCurrency(summary.capacity_summary.available_capacity)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get branch vault summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch branch vault summary',
      error: error.message
    });
  }
};

/**
 * Get vault statistics
 */
export const getVaultStatistics = async (req, res) => {
  try {
    const {
      branch_code,
      start_date,
      end_date,
      category
    } = req.query;

    const where = {};
    if (branch_code) where.branch_code = branch_code;
    if (category) where.vault_category = category;
    
    if (start_date) {
      where.created_at = { [Op.gte]: new Date(start_date) };
    }
    if (end_date) {
      where.created_at = { ...where.created_at, [Op.lte]: new Date(end_date) };
    }

    const vaults = await Vault.findAll({
      where,
      include: [{ model: Drawer, as: 'drawer' }]
    });

    const totalVaults = vaults.length;
    const activeVaults = vaults.filter(v => v.is_active).length;
    
    const totalCapacity = vaults.reduce((sum, vault) => {
      return sum + parseFloat(vault.vault_capacity || 0);
    }, 0);
    
    const utilizedCapacity = vaults.reduce((sum, vault) => {
      const balance = vault.drawer ? parseFloat(vault.drawer.current_balance || 0) : 0;
      return sum + balance;
    }, 0);
    
    const averageUtilization = totalCapacity > 0 
      ? ((utilizedCapacity / totalCapacity) * 100).toFixed(2) + '%' 
      : '0%';

    const categoryDistribution = {};
    vaults.forEach(vault => {
      const category = vault.vault_category || 'UNKNOWN';
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
    });

    const securityDistribution = {};
    vaults.forEach(vault => {
      const level = vault.security_level || 'UNKNOWN';
      securityDistribution[level] = (securityDistribution[level] || 0) + 1;
    });

    const branchDistribution = {};
    vaults.forEach(vault => {
      const branch = vault.branch_code || 'UNKNOWN';
      branchDistribution[branch] = (branchDistribution[branch] || 0) + 1;
    });

    const statistics = {
      total_vaults: totalVaults,
      active_vaults: activeVaults,
      inactive_vaults: totalVaults - activeVaults,
      total_capacity: totalCapacity,
      utilized_capacity: utilizedCapacity,
      available_capacity: totalCapacity - utilizedCapacity,
      average_utilization: averageUtilization,
      category_distribution: categoryDistribution,
      security_level_distribution: securityDistribution,
      branch_distribution: branchDistribution
    };

    return res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Get vault statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vault statistics',
      error: error.message
    });
  }
};

/**
 * Get security compliance
 */
export const getSecurityCompliance = async (req, res) => {
  try {
    const { id } = req.params;

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      },
      include: [
        { model: Drawer, as: 'drawer' },
        { model: VaultAccessAttempt, as: 'accessAttempts', limit: 50 },
        { model: VaultMaintenanceLog, as: 'maintenanceLogs', limit: 10 }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const totalAccessAttempts = vault.accessAttempts?.length || 0;
    const failedAccessAttempts = vault.accessAttempts?.filter(a => a.status === 'FAILED' || a.status === 'BLOCKED').length || 0;
    const successRate = totalAccessAttempts > 0 
      ? ((totalAccessAttempts - failedAccessAttempts) / totalAccessAttempts * 100).toFixed(2) + '%'
      : '100%';

    const lastMaintenance = vault.maintenanceLogs?.length > 0
      ? vault.maintenanceLogs[0]
      : null;

    const complianceData = {
      vault_id: vault.vault_id,
      vault_code: vault.vault_cd,
      security_level: vault.security_level,
      requires_dual_control: vault.requires_dual_control,
      access_attempts: {
        total: totalAccessAttempts,
        successful: totalAccessAttempts - failedAccessAttempts,
        failed: failedAccessAttempts,
        success_rate: successRate
      },
      maintenance_status: {
        last_maintenance: lastMaintenance?.performed_at || 'Never',
        last_maintenance_type: lastMaintenance?.maintenance_type || 'N/A',
        maintenance_due: lastMaintenance 
          ? new Date(new Date(lastMaintenance.performed_at).setMonth(new Date(lastMaintenance.performed_at).getMonth() + 6))
          : new Date()
      },
      security_features: vault.security_features || {},
      compliance_score: 'N/A',
      recommendations: [
        'Ensure regular maintenance schedule',
        'Review access logs weekly',
        'Update security protocols quarterly'
      ]
    };

    return res.json({
      success: true,
      data: complianceData
    });

  } catch (error) {
    console.error('Get security compliance error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch security compliance',
      error: error.message
    });
  }
};

/**
 * Transfer vault to branch
 */
export const transferVaultToBranch = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { vaultId } = req.params;
    const { new_branch_code, new_location_code, notes = '' } = req.body;
    const userId = req.user?.user_name || req.user?.id || 'system';

    if (!new_branch_code) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'new_branch_code is required'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(vaultId) },
          { vault_id: parseInt(vaultId) },
          { vault_cd: vaultId }
        ]
      },
      include: [{ model: Drawer, as: 'drawer' }],
      transaction
    });

    if (!vault) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    await vault.update({
      branch_code: new_branch_code,
      location_code: new_location_code || vault.location_code,
      updated_by: userId
    }, { transaction });

    if (vault.drawer) {
      await vault.drawer.update({
        branch_code: new_branch_code,
        location_code: new_location_code || vault.drawer.location_code,
        updated_by: userId
      }, { transaction });
    }

    await transaction.commit();

    return res.json({
      success: true,
      message: 'Vault transferred successfully',
      data: {
        vault_id: vault.vault_id,
        vault_code: vault.vault_cd,
        new_branch: new_branch_code,
        transferred_by: userId,
        transferred_at: new Date()
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Transfer vault error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to transfer vault',
      error: error.message
    });
  }
};

// =============================================
// DEFAULT EXPORT (Compatible with both import styles)
// =============================================

export default {
  // Vault Management
  createVault,
  getAllVaults,
  getVaultById,
  updateVault,
  deactivateVault,
  
  // Statistics & Reporting
  getVaultStatistics,
  getBranchVaultSummary,
  getVaultByBU,
  getVaultUtilization,
  getSecurityCompliance,
  
  // Access Control
  authorizePersonnel,
  bulkAuthorizePersonnel,
  revokeAuthorization,
  getAuthorizedPersonnel,
  
  // Approval Workflow
  createApprovalRequest,
  approveRequest,
  getPendingApprovals,
  
  // Security & Maintenance
  logAccessAttempt,
  recordMaintenance,
  updateSecurityFeatures,
  
  // Additional Operations
  transferVaultToBranch
};