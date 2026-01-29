// controllers/VaultController.js
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import {
  Vault,
  VaultAuthorizedPersonnel,
  VaultPendingApproval,
  VaultAccessAttempt,
  VaultMaintenanceLog,
  Drawer
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

    console.log('📝 Validating input...');
    
    // Validate required fields
    if (!VAULT_ID || !VAULT_CD || !VAULT_NM || !CREATED_BY || !DRAWER_ID) {
      console.log('❌ Validation failed - missing fields');
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: VAULT_ID, VAULT_CD, VAULT_NM, CREATED_BY, DRAWER_ID'
      });
    }

    // ✅ ENHANCED: Validate VAULT_CAPACITY format if provided
    if (VAULT_CAPACITY !== undefined && VAULT_CAPACITY !== null && VAULT_CAPACITY !== '') {
      const capacityRegex = /^\d+(\.\d{1,2})?$/;
      if (!capacityRegex.test(VAULT_CAPACITY.toString())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid VAULT_CAPACITY format. Must be a number with up to 2 decimal places (e.g., 5000000.00)'
        });
      }
      
      // ✅ ENHANCED: Validate capacity is positive
      const capacityNum = parseFloat(VAULT_CAPACITY);
      if (capacityNum <= 0) {
        return res.status(400).json({
          success: false,
          message: 'VAULT_CAPACITY must be a positive number'
        });
      }
      
      // ✅ ENHANCED: Validate capacity doesn't exceed maximum safe amount
      const MAX_SAFE_AMOUNT = 1000000000000; // 1 trillion
      if (capacityNum > MAX_SAFE_AMOUNT) {
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

    console.log(`🔍 Finding drawer with ID: ${DRAWER_ID}`);
    
    // Find drawer
    const existingDrawer = await Drawer.findOne({
      where: { drawer_id: DRAWER_ID },
      transaction
    });
    
    if (!existingDrawer) {
      console.log('❌ Drawer not found');
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Drawer with ID ${DRAWER_ID} not found`
      });
    }

    console.log(`🔍 Checking if drawer ${DRAWER_ID} is already used...`);
    
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
        message: `Drawer with ID ${DRAWER_ID} is already associated with another vault`
      });
    }

    console.log('🔄 Updating drawer...');
    
    // ✅ ENHANCED: Parse capacity properly
    const capacity = VAULT_CAPACITY ? parseFloat(VAULT_CAPACITY) : 10000000.00;
    
    // Update drawer
    await existingDrawer.update({
      drawer_nm: VAULT_NM,
      drawer_ty_cd: 'VAULT',
      vault_type: VAULT_CATEGORY || 'BRANCH_VAULT',
      security_level: SECURITY_LEVEL || 'LEVEL_2',
      requires_dual_control: true,
      vault_capacity: capacity,
      max_bal: capacity,
      gl_acct_no: `VAULT-${VAULT_CD}`,
      branch_code: BRANCH_CODE || existingDrawer.branch_code,
      location_code: LOCATION_CODE || existingDrawer.location_code,
      updated_by: CREATED_BY
    }, { transaction });

    console.log('📝 Creating vault...');
    
    // Create vault
    const vault = await Vault.create({
      vault_id: parseInt(VAULT_ID, 10),
      vault_cd: VAULT_CD,
      vault_nm: VAULT_NM,
      drawer_id: parseInt(DRAWER_ID, 10),
      drawer_ref: existingDrawer.id,
      vault_category: VAULT_CATEGORY || 'BRANCH_VAULT',
      security_level: SECURITY_LEVEL || 'LEVEL_2',
      requires_dual_control: true,
      vault_capacity: capacity,
      branch_code: BRANCH_CODE || existingDrawer.branch_code,
      location_code: LOCATION_CODE || existingDrawer.location_code,
      created_by: CREATED_BY,
      vault_status: 'OPERATIONAL',
      is_active: true,
      
      // Set transaction limits based on capacity
      limit_max_single_deposit: capacity * 0.1,
      limit_max_single_withdrawal: capacity * 0.05,
      limit_daily_deposit: capacity * 0.3,
      limit_daily_withdrawal: capacity * 0.2,
      limit_min_transaction: 100.00,
      limit_require_approval: capacity * 0.02,
      limit_head_teller_approval: capacity * 0.01,
      limit_supervisor_approval: capacity * 0.03,
      limit_branch_manager_approval: capacity * 0.05
    }, { transaction });

    // Create initial authorized personnel
    const currentDate = new Date();
    const futureDate = new Date();
    futureDate.setFullYear(currentDate.getFullYear() + 1);
    
    await VaultAuthorizedPersonnel.bulkCreate([
      {
        vault_id: vault.id,
        user_id: CREATED_BY,
        user_name: "Primary Vault Manager",
        user_role: "VAULT_MANAGER",
        access_level: "FULL",
        authorization_start: currentDate,
        authorization_end: futureDate,
        is_active: true,
        authorized_by: CREATED_BY,
        authorization_notes: "Primary vault administrator with full access rights"
      },
      {
        vault_id: vault.id,
        user_id: `${CREATED_BY}_backup`,
        user_name: "Backup Vault Manager",
        user_role: "VAULT_MANAGER",
        access_level: "FULL",
        authorization_start: currentDate,
        authorization_end: futureDate,
        is_active: true,
        authorized_by: CREATED_BY,
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
        { model: VaultAuthorizedPersonnel, as: 'authorized_personnel' }
      ]
    });

    return res.status(201).json({
      success: true,
      message: 'Vault created successfully',
      data: {
        vault: populatedVault,
        drawer: existingDrawer,
        capacityDetails: {
          capacity: capacity,
          formattedCapacity: capacity.toLocaleString('en-US', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }),
          transactionLimits: {
            maxSingleDeposit: (capacity * 0.1).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
            maxSingleWithdrawal: (capacity * 0.05).toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
            approvalThreshold: (capacity * 0.02).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
          }
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Create vault error:', error.message);
    console.error('Error stack:', error.stack);
    
    // Enhanced error handling
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
        errors: errors,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to create vault',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
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

    // Build where clause
    const where = {};
    if (active !== undefined) {
      where.is_active = active === 'true' || active === true;
    }
    if (category) where.vault_category = category;
    if (status) where.vault_status = status;
    if (security_level) where.security_level = security_level;
    
    // Search functionality
    if (search) {
      where[Op.or] = [
        { vault_cd: { [Op.like]: `%${search}%` } },
        { vault_nm: { [Op.like]: `%${search}%` } }
      ];
    }

    // Build include clause for branch filter
    const include = [
      {
        model: Drawer,
        as: 'drawer',
        required: branch_code ? true : false,
        where: branch_code ? { branch_code } : {}
      }
    ];

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const total = await Vault.count({
      where,
      include
    });

    // Get paginated results
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
    console.log('🔍 Fetching vault with ID:', id, 'Type:', typeof id);
    
    // Try to parse as number first (if it looks like VAULT_ID)
    const numericId = parseInt(id);
    
    let where;
    if (!isNaN(numericId) && numericId.toString() === id) {
      // It's a pure number, search by VAULT_ID
      console.log('🔍 Searching by VAULT_ID:', numericId);
      where = { vault_id: numericId };
    } else {
      // Try as primary key ID first, then as vault_cd
      if (/^\d+$/.test(id)) {
        where = { id: parseInt(id) };
      } else {
        where = { vault_cd: id };
      }
    }
    
    console.log('🔍 Query:', where);
    
    const vault = await Vault.findOne({
      where,
      include: [
        { model: Drawer, as: 'drawer' },
        { model: VaultAuthorizedPersonnel, as: 'authorized_personnel' },
        { model: VaultAccessAttempt, as: 'access_attempts', limit: 100 },
        { model: VaultMaintenanceLog, as: 'maintenance_logs', limit: 10 }
      ]
    });
    
    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }
    
    // Calculate virtual fields
    const vaultData = vault.toJSON();
    vaultData.utilization_percentage = vault.utilization_percentage;
    vaultData.available_capacity = vault.available_capacity;
    vaultData.maintenance_status = vault.maintenance_status;
    vaultData.security_compliance = vault.security_compliance;
    
    res.json({
      success: true,
      data: vaultData
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
    const { UPDATED_BY } = req.body;

    if (!UPDATED_BY) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'UPDATED_BY is required'
      });
    }

    // Find vault
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

    // Fields that cannot be updated directly
    const restrictedFields = ['vault_id', 'vault_cd', 'drawer_ref', 'created_by'];
    restrictedFields.forEach(field => delete updateData[field]);

    // Update vault
    await vault.update({
      ...updateData,
      updated_by: UPDATED_BY
    }, { transaction });

    // Update associated drawer if vault name changed
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
    const { UPDATED_BY, reason } = req.body;

    if (!UPDATED_BY) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'UPDATED_BY is required'
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

    // Check if vault has balance
    if (vault.drawer && parseFloat(vault.drawer.current_balance) > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate vault with positive balance'
      });
    }

    // Deactivate vault
    await vault.update({
      is_active: false,
      vault_status: 'DECOMMISSIONED',
      updated_by: UPDATED_BY
    }, { transaction });

    // Deactivate associated drawer
    if (vault.drawer) {
      await vault.drawer.update({
        rec_st: 'C', // Closed status
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
      authorized_by,
      access_level = 'LIMITED',
      notes = ''
    } = req.body;

    // Validate required fields
    if (!user_id || !user_name || !user_role || !authorized_by) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: user_id, user_name, user_role, authorized_by'
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

    // Check if authorizer has permission (simplified - implement proper auth middleware)
    // For now, just check if the user exists in authorized personnel with sufficient role
    const authorizerAuth = await VaultAuthorizedPersonnel.findOne({
      where: {
        vault_id: vault.id,
        user_id: req.user?.id || authorized_by,
        is_active: true
      }
    });

    if (!authorizerAuth) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Authorizer must be an authorized personnel member'
      });
    }

    // Authorize personnel using model method
    const authorizedPerson = await vault.authorizePersonnel(
      user_id,
      user_name,
      user_role,
      authorized_by,
      access_level,
      notes
    );

    // Log access attempt
    await vault.logAccessAttempt(
      authorized_by,
      req.user?.role || 'SYSTEM',
      'AUTHORIZATION',
      true,
      null,
      req.ip
    );

    await transaction.commit();

    res.json({
      success: true,
      message: 'Personnel authorized successfully',
      data: {
        vault: vault.vault_cd,
        authorized_person: authorizedPerson
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
  try {
    const { id } = req.params;
    const { personnel, authorized_by } = req.body;

    if (!personnel || !Array.isArray(personnel) || personnel.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'personnel array is required and must not be empty'
      });
    }

    if (!authorized_by) {
      return res.status(400).json({
        success: false,
        message: 'authorized_by is required'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // TODO: Implement bulk authorization logic
    console.log(`Bulk authorizing ${personnel.length} personnel for vault ${id}`);
    
    return res.status(501).json({
      success: false,
      message: 'Bulk authorize personnel not implemented yet',
      data: {
        vault_id: id,
        personnel_count: personnel.length
      }
    });

  } catch (error) {
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
    const { revoked_by, reason = '' } = req.body;

    if (!revoked_by) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'revoked_by is required'
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

    // Find the authorization to revoke
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

    // Check if revoker has permission (simplified)
    const revokerAuth = await VaultAuthorizedPersonnel.findOne({
      where: {
        vault_id: vault.id,
        user_id: revoked_by,
        is_active: true,
        user_role: { [Op.in]: ['BRANCH_MANAGER', 'VAULT_MANAGER'] }
      }
    });

    if (!revokerAuth) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to revoke authorization'
      });
    }

    // Revoke authorization
    await authorization.update({
      is_active: false,
      authorization_notes: `Revoked by ${revoked_by} on ${new Date().toISOString()}. Reason: ${reason}`
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
        as: 'authorized_personnel',
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
        personnel_count: vault.authorized_personnel.length,
        personnel: vault.authorized_personnel
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
  try {
    const { id } = req.params;
    const {
      transaction_type,
      amount,
      requested_by,
      requested_by_role,
      urgency = 'NORMAL'
    } = req.body;

    // Validate required fields
    if (!transaction_type || !amount || !requested_by || !requested_by_role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: transaction_type, amount, requested_by, requested_by_role'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Validate transaction
    const validation = await vault.validateTransaction(amount, transaction_type, requested_by_role);
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Transaction validation failed',
        violations: validation.violations
      });
    }

    // Create approval request using model method
    const approvalRequest = await vault.createApprovalRequest(
      transaction_type,
      parseFloat(amount),
      requested_by,
      requested_by_role,
      urgency
    );

    res.status(201).json({
      success: true,
      message: 'Approval request created successfully',
      data: {
        vault: vault.vault_cd,
        approval_request: approvalRequest,
        requires_approval: validation.requiresApproval,
        approval_role: validation.approvalRole
      }
    });

  } catch (error) {
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
  try {
    const { id, approvalId } = req.params;
    const {
      approver_id,
      approver_name,
      approver_role,
      notes = ''
    } = req.body;

    // Validate required fields
    if (!approver_id || !approver_name || !approver_role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: approver_id, approver_name, approver_role'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if approver has permission for this role (simplified)
    const approverAuth = await VaultAuthorizedPersonnel.findOne({
      where: {
        vault_id: vault.id,
        user_id: approver_id,
        user_role: approver_role,
        is_active: true
      }
    });

    if (!approverAuth) {
      return res.status(403).json({
        success: false,
        message: 'Approver is not authorized for this role'
      });
    }

    // Approve request using model method
    const approvedRequest = await vault.approveRequest(
      approvalId,
      approver_id,
      approver_name,
      approver_role,
      notes
    );

    res.json({
      success: true,
      message: 'Request approved successfully',
      data: {
        vault: vault.vault_cd,
        approval_request: approvedRequest
      }
    });

  } catch (error) {
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
        as: 'pending_approvals',
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

    let pendingApprovals = vault.pending_approvals;

    // Filter by role if specified (simplified - would need role-based filtering)
    if (role) {
      // This would need additional logic based on your approval hierarchy
      pendingApprovals = pendingApprovals.filter(approval => {
        // Basic role filtering - you'll need to implement based on your requirements
        return true; // Placeholder
      });
    }

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
  try {
    const { id } = req.params;
    const {
      user_id,
      user_role,
      access_method,
      success,
      failure_reason = null,
      location = null
    } = req.body;

    // Validate required fields
    if (!user_id || !user_role || !access_method || success === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: user_id, user_role, access_method, success'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Log access attempt using model method
    const accessLog = await vault.logAccessAttempt(
      user_id,
      user_role,
      access_method,
      success,
      failure_reason,
      location
    );

    res.json({
      success: true,
      message: 'Access attempt logged successfully',
      data: {
        vault: vault.vault_cd,
        access_log: accessLog
      }
    });

  } catch (error) {
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
  try {
    const { id } = req.params;
    const {
      maintenance_type,
      performed_by,
      description,
      cost,
      duration_hours,
      approved_by = null
    } = req.body;

    // Validate required fields
    if (!maintenance_type || !performed_by || !description || !cost || !duration_hours) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: maintenance_type, performed_by, description, cost, duration_hours'
      });
    }

    const vault = await Vault.findOne({
      where: {
        [Op.or]: [
          { id: parseInt(id) },
          { vault_id: parseInt(id) },
          { vault_cd: id }
        ]
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Record maintenance using model method
    const maintenanceLog = await vault.recordMaintenance(
      maintenance_type,
      performed_by,
      description,
      parseFloat(cost),
      parseInt(duration_hours),
      approved_by
    );

    res.status(201).json({
      success: true,
      message: 'Maintenance recorded successfully',
      data: {
        vault: vault.vault_cd,
        maintenance_log: maintenanceLog
      }
    });

  } catch (error) {
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
  try {
    const { id } = req.params;
    const { security_features, UPDATED_BY } = req.body;

    if (!UPDATED_BY) {
      return res.status(400).json({
        success: false,
        message: 'UPDATED_BY is required'
      });
    }

    if (!security_features) {
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
      }
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if user has permission to configure security
    const userAuth = await VaultAuthorizedPersonnel.findOne({
      where: {
        vault_id: vault.id,
        user_id: UPDATED_BY,
        is_active: true,
        user_role: { [Op.in]: ['BRANCH_MANAGER', 'VAULT_MANAGER'] }
      }
    });

    if (!userAuth) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to update security features'
      });
    }

    // Update security features
    const updatedVault = await vault.update({
      security_features: security_features,
      updated_by: UPDATED_BY,
      updated_at: new Date()
    });

    return res.json({
      success: true,
      message: 'Security features updated successfully',
      data: {
        vault_id: vault.vault_id,
        vault_code: vault.vault_cd,
        updated_security_features: security_features,
        updated_at: updatedVault.updated_at
      }
    });

  } catch (error) {
    console.error('Update security features error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update security features',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
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

    // Validate branch code
    if (!branchCode || branchCode.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Branch code is required'
      });
    }

    // Build where clause for drawer
    const drawerWhere = {
      branch_code: branchCode.trim()
    };

    // Build where clause for vault
    const vaultWhere = {};
    
    // Handle active status filter
    if (active !== undefined) {
      if (active === 'true' || active === true) {
        vaultWhere.is_active = true;
        vaultWhere.vault_status = { [Op.ne]: 'DECOMMISSIONED' };
      } else if (active === 'false' || active === false) {
        vaultWhere.is_active = false;
        vaultWhere.vault_status = 'DECOMMISSIONED';
      }
    }

    // Apply additional filters
    if (category) vaultWhere.vault_category = category;
    if (status) vaultWhere.vault_status = status;
    if (security_level) vaultWhere.security_level = security_level;

    // Pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get total count
    const total = await Vault.count({
      where: vaultWhere,
      include: [{
        model: Drawer,
        as: 'drawer',
        where: drawerWhere,
        required: true
      }]
    });

    // Get paginated results
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

    // If no vaults found
    if (vaults.length === 0) {
      return res.status(200).json({
        success: true,
        message: `No vaults found for branch code: ${branchCode}`,
        data: {
          docs: [],
          totalDocs: 0,
          limit: parseInt(limit),
          totalPages: 0,
          page: parseInt(page),
          pagingCounter: 0,
          hasPrevPage: false,
          hasNextPage: false,
          prevPage: null,
          nextPage: null
        }
      });
    }

    // Enhance the response data with calculated fields
    const enhancedDocs = vaults.map(vault => {
      const vaultData = vault.toJSON();
      const capacity = parseFloat(vaultData.vault_capacity || 0);
      const currentBalance = vaultData.drawer ? parseFloat(vaultData.drawer.current_balance || 0) : 0;
      
      return {
        ...vaultData,
        utilization_percentage: capacity > 0 ? ((currentBalance / capacity) * 100).toFixed(2) + '%' : '0%',
        available_capacity: capacity - currentBalance,
        drawer_summary: vaultData.drawer ? {
          drawerId: vaultData.drawer.drawer_id || 'N/A',
          drawerName: vaultData.drawer.drawer_nm || 'N/A',
          currentBalance: currentBalance,
          maxBalance: parseFloat(vaultData.drawer.max_bal || 0),
          status: vaultData.drawer.rec_st || 'N/A',
          glAccount: vaultData.drawer.gl_acct_no || 'N/A',
          branchCode: vaultData.drawer.branch_code || 'N/A',
          locationCode: vaultData.drawer.location_code || 'N/A'
        } : null
      };
    });

    // Calculate branch-level statistics
    const branchStatistics = {
      total_vaults: total,
      active_vaults: enhancedDocs.filter(v => v.is_active).length,
      total_capacity: enhancedDocs.reduce((sum, v) => 
        sum + parseFloat(v.vault_capacity || 0), 0),
      total_balance: enhancedDocs.reduce((sum, v) => 
        sum + (v.drawer_summary?.currentBalance || 0), 0),
      categories: {},
      security_levels: {}
    };

    // Count by category and security level
    enhancedDocs.forEach(vault => {
      // Category counts
      const category = vault.vault_category || 'UNKNOWN';
      branchStatistics.categories[category] = (branchStatistics.categories[category] || 0) + 1;
      
      // Security level counts
      const securityLevel = vault.security_level || 'UNKNOWN';
      branchStatistics.security_levels[securityLevel] = (branchStatistics.security_levels[securityLevel] || 0) + 1;
    });

    // Add overall utilization percentage
    branchStatistics.utilization_percentage = branchStatistics.total_capacity > 0 
      ? ((branchStatistics.total_balance / branchStatistics.total_capacity) * 100).toFixed(2) + '%'
      : '0%';

    // Format currency values
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    };

    // Enhanced pagination info
    const enhancedResponse = {
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
        },
        query_info: {
          branch_code: branchCode,
          active_filter: active,
          page: parseInt(page),
          limit: parseInt(limit),
          category_filter: category || 'All',
          status_filter: status || 'All'
        }
      }
    };

    console.log(`✅ Successfully retrieved ${total} vault(s) for branch ${branchCode}`);

    return res.json(enhancedResponse);

  } catch (error) {
    console.error('❌ Get vault by BU error:', error.message);
    console.error('Error stack:', error.stack);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vaults by branch',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString()
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

    // Get all active vaults for the branch
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

    // Initialize summary
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

    // Calculate totals
    vaults.forEach(vault => {
      const capacity = parseFloat(vault.vault_capacity || 0);
      const balance = parseFloat(vault.drawer?.current_balance || 0);
      
      // Update capacity summary
      summary.capacity_summary.total_capacity += capacity;
      summary.capacity_summary.utilized_capacity += balance;
      
      // Update category counts
      const category = vault.vault_category || 'UNKNOWN';
      summary.categories[category] = (summary.categories[category] || 0) + 1;
      
      // Update security level counts
      const securityLevel = vault.security_level || 'UNKNOWN';
      switch(securityLevel) {
        case 'LEVEL_1':
          summary.security_summary.level_1++;
          break;
        case 'LEVEL_2':
          summary.security_summary.level_2++;
          break;
        case 'LEVEL_3':
          summary.security_summary.level_3++;
          break;
        default:
          summary.security_summary.other++;
      }
      
      // Add to vault list
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
        requires_dual_control: vault.requires_dual_control || false,
        authorized_personnel_count: 0 // Would need to query this separately
      });
    });

    // Calculate available capacity and utilization rate
    summary.capacity_summary.available_capacity = 
      summary.capacity_summary.total_capacity - summary.capacity_summary.utilized_capacity;
    
    summary.capacity_summary.utilization_rate = summary.capacity_summary.total_capacity > 0
      ? (summary.capacity_summary.utilized_capacity / summary.capacity_summary.total_capacity * 100).toFixed(2) + '%'
      : '0%';

    // Format currency values
    const formatCurrency = (amount) => {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(amount);
    };

    // Format the response
    const formattedSummary = {
      ...summary,
      capacity_summary: {
        ...summary.capacity_summary,
        formatted_total_capacity: formatCurrency(summary.capacity_summary.total_capacity),
        formatted_utilized_capacity: formatCurrency(summary.capacity_summary.utilized_capacity),
        formatted_available_capacity: formatCurrency(summary.capacity_summary.available_capacity)
      }
    };

    return res.json({
      success: true,
      message: `Branch vault summary for ${branchCode}`,
      data: formattedSummary
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

    // Build where clause
    const where = {};
    if (branch_code) {
      where.branch_code = branch_code;
    }
    if (category) {
      where.vault_category = category;
    }
    
    // Date filtering if provided
    if (start_date) {
      where.created_at = { [Op.gte]: new Date(start_date) };
    }
    if (end_date) {
      where.created_at = { ...where.created_at, [Op.lte]: new Date(end_date) };
    }

    // Get all vaults matching criteria
    const vaults = await Vault.findAll({
      where,
      include: [{ model: Drawer, as: 'drawer' }]
    });

    // Calculate statistics
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

    // Category distribution
    const categoryDistribution = {};
    vaults.forEach(vault => {
      const category = vault.vault_category || 'UNKNOWN';
      categoryDistribution[category] = (categoryDistribution[category] || 0) + 1;
    });

    // Security level distribution
    const securityDistribution = {};
    vaults.forEach(vault => {
      const level = vault.security_level || 'UNKNOWN';
      securityDistribution[level] = (securityDistribution[level] || 0) + 1;
    });

    // Branch distribution
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
      branch_distribution: branchDistribution,
      recent_activity: []
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
        { model: VaultAccessAttempt, as: 'access_attempts', limit: 50 },
        { model: VaultMaintenanceLog, as: 'maintenance_logs', limit: 10 }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Calculate compliance metrics
    const totalAccessAttempts = vault.access_attempts?.length || 0;
    const failedAccessAttempts = vault.access_attempts?.filter(a => !a.success).length || 0;
    const successRate = totalAccessAttempts > 0 
      ? ((totalAccessAttempts - failedAccessAttempts) / totalAccessAttempts * 100).toFixed(2) + '%'
      : '100%';

    const lastMaintenance = vault.maintenance_logs?.length > 0
      ? vault.maintenance_logs[0]
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
      compliance_score: 'N/A', // You can calculate this based on your criteria
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
  try {
    const { vaultId } = req.params;
    const { new_branch_code, new_location_code, transferred_by, notes = '' } = req.body;

    if (!new_branch_code || !transferred_by) {
      return res.status(400).json({
        success: false,
        message: 'new_branch_code and transferred_by are required'
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
      include: [{ model: Drawer, as: 'drawer' }]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // TODO: Implement transfer logic with transaction
    // For now, return not implemented
    return res.status(501).json({
      success: false,
      message: 'Transfer vault to branch not implemented yet',
      data: {
        vault_id: vault.vault_id,
        current_branch: vault.branch_code,
        new_branch: new_branch_code,
        transferred_by: transferred_by
      }
    });

  } catch (error) {
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