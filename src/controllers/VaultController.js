import Vault from '../models/Vault.js';
import Drawer from '../models/Drawer.js';
import mongoose from 'mongoose';

// =============================================
// VAULT MANAGEMENT CONTROLLERS
// =============================================

/**
 * Create a new vault
 */
export const createVault = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCommitted = false;
  
  try {
    session.startTransaction();
    
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

    // Validate required fields
    if (!VAULT_ID || !VAULT_CD || !VAULT_NM || !CREATED_BY || !DRAWER_ID) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: VAULT_ID, VAULT_CD, VAULT_NM, CREATED_BY, DRAWER_ID'
      });
    }

    // Check if vault already exists
    const existingVault = await Vault.findOne({
      $or: [{ VAULT_ID }, { VAULT_CD }]
    }).session(session);

    if (existingVault) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'Vault with this ID or code already exists'
      });
    }

    // ✅ FIND EXISTING DRAWER BY DRAWER_ID
    const existingDrawer = await Drawer.findOne({ DRAWER_ID }).session(session);
    
    if (!existingDrawer) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Drawer with ID ${DRAWER_ID} not found`
      });
    }

    // ✅ CHECK IF DRAWER IS ALREADY ASSOCIATED WITH ANOTHER VAULT
    const drawerAlreadyUsed = await Vault.findOne({ 
      DRAWER_REF: existingDrawer._id 
    }).session(session);

    if (drawerAlreadyUsed) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: `Drawer with ID ${DRAWER_ID} is already associated with another vault`
      });
    }

    // ✅ MAP SECURITY LEVEL TO DRAWER COMPATIBLE FORMAT
    const mapSecurityLevel = (level) => {
      const levelMap = {
        'LEVEL_1': 'LEVEL_1',
        'LEVEL_2': 'LEVEL_2', 
        'LEVEL_3': 'LEVEL_3',
        'LEVEL_4': 'LEVEL_4',
        'LEVEL_5': 'LEVEL_5',
        'HIGH': 'LEVEL_3',
        'MEDIUM': 'LEVEL_2',
        'LOW': 'LEVEL_1'
      };
      return levelMap[level] || 'LEVEL_2';
    };

    const drawerSecurityLevel = mapSecurityLevel(SECURITY_LEVEL);

    // ✅ UPDATE EXISTING DRAWER WITH VAULT INFORMATION
    existingDrawer.DRAWER_NM = VAULT_NM;
    existingDrawer.DRAWER_TY_CD = 'VAULT';
    existingDrawer.VAULT_TYPE = VAULT_CATEGORY || 'BRANCH_VAULT';
    existingDrawer.SECURITY_LEVEL = drawerSecurityLevel;
    existingDrawer.REQUIRES_DUAL_CONTROL = true;
    existingDrawer.VAULT_CAPACITY = VAULT_CAPACITY || '10000000.00';
    existingDrawer.MAX_BAL = VAULT_CAPACITY || '10000000.00';
    existingDrawer.GL_ACCT_NO = `VAULT-${VAULT_CD}`;
    existingDrawer.BRANCH_CODE = BRANCH_CODE || existingDrawer.BRANCH_CODE;
    existingDrawer.LOCATION_CODE = LOCATION_CODE || existingDrawer.LOCATION_CODE;
    existingDrawer.UPDATED_BY = CREATED_BY;

    await existingDrawer.save({ session });

    // ✅ FIXED: DYNAMIC PERSONNEL CREATION WITHIN MAXIMUM LIMIT (4 active personnel)
    const createAuthorizedPersonnel = (createdBy) => {
      const currentDate = new Date();
      const futureDate = new Date();
      futureDate.setFullYear(currentDate.getFullYear() + 1);
      
      const basePersonnel = [
        {
          user_id: createdBy,
          user_name: "Primary Vault Manager",
          user_role: "VAULT_MANAGER",
          access_level: "FULL",
          authorization_start: currentDate,
          authorization_end: futureDate,
          is_active: true,
          authorized_by: createdBy,
          authorization_notes: "Primary vault administrator with full access rights"
        },
        {
          user_id: `${createdBy}_backup`,
          user_name: "Backup Vault Manager",
          user_role: "VAULT_MANAGER",
          access_level: "FULL",
          authorization_start: currentDate,
          authorization_end: futureDate,
          is_active: true,
          authorized_by: createdBy,
          authorization_notes: "Backup vault administrator with full access rights"
        },
        {
          user_id: "auditor_001",
          user_name: "Internal System Auditor",
          user_role: "AUDITOR",
          access_level: "VIEW_ONLY",
          authorization_start: currentDate,
          authorization_end: futureDate,
          is_active: true,
          authorized_by: createdBy,
          authorization_notes: "Audit and compliance monitoring access"
        },
        {
          user_id: "supervisor_001",
          user_name: "Branch Operations Supervisor",
          user_role: "SUPERVISOR",
          access_level: "LIMITED",
          authorization_start: currentDate,
          authorization_end: futureDate,
          is_active: true,
          authorized_by: createdBy,
          authorization_notes: "Branch operations oversight and supervision"
        }
      ];
      
      return basePersonnel;
    };

    // ✅ CREATE VAULT DATA WITH CORRECTED PERSONNEL
    const vaultData = {
      VAULT_ID,
      VAULT_CD,
      VAULT_NM,
      DRAWER_ID: DRAWER_ID,
      DRAWER_REF: existingDrawer._id,
      VAULT_CATEGORY: VAULT_CATEGORY || 'BRANCH_VAULT',
      SECURITY_LEVEL: SECURITY_LEVEL || 'LEVEL_2',
      REQUIRES_DUAL_CONTROL: true,
      VAULT_CAPACITY: VAULT_CAPACITY || '10000000.00',
      BRANCH_CODE: BRANCH_CODE || existingDrawer.BRANCH_CODE,
      LOCATION_CODE: LOCATION_CODE || existingDrawer.LOCATION_CODE,
      CREATED_BY,
      
      // ✅ USE THE FIXED PERSONNEL FUNCTION
      AUTHORIZED_PERSONNEL: createAuthorizedPersonnel(CREATED_BY),
      
      // ✅ STORAGE COMPARTMENTS
      STORAGE_COMPARTMENTS: [{
        compartment_id: "COMP-001",
        compartment_type: "CASH",
        capacity: mongoose.Types.Decimal128.fromString("1000000.00"),
        current_balance: mongoose.Types.Decimal128.fromString("0.00"),
        is_locked: false,
        assigned_to: ""
      }],
      
      // ✅ DEFAULT STATUS FIELDS
      STATUS: 'ACTIVE',
      IS_ACTIVE: true,
      CURRENT_BALANCE: mongoose.Types.Decimal128.fromString("0.00"),
      AVAILABLE_CAPACITY: VAULT_CAPACITY || '10000000.00'
    };

    // ✅ CREATE VAULT
    const vault = new Vault(vaultData);
    await vault.save({ session });

    // ✅ COMMIT TRANSACTION
    await session.commitTransaction();
    transactionCommitted = true;

    // ✅ POPULATE THE DRAWER REFERENCE FOR RESPONSE
    const populatedVault = await Vault.findById(vault._id).populate('DRAWER_REF');

    res.status(201).json({
      success: true,
      message: 'Vault created successfully',
      data: {
        vault: populatedVault,
        drawer: existingDrawer
      }
    });

  } catch (error) {
    // ✅ FIXED: Only abort transaction if it hasn't been committed
    if (!transactionCommitted) {
      await session.abortTransaction();
    }
    
    console.error('Create vault error:', error);
    
    // ✅ IMPROVED ERROR HANDLING
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json({
        success: false,
        message: 'Vault validation failed',
        errors: errors
      });
    }
    
    // ✅ Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Duplicate vault ID or code',
        error: error.keyValue
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to create vault',
      error: error.message
    });
  } finally {
    // ✅ Always end the session
    session.endSession();
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
      search
    } = req.query;

    const filter = { IS_ACTIVE: true };

    // Apply filters
    if (category) filter.VAULT_CATEGORY = category;
    if (status) filter.VAULT_STATUS = status;
    if (security_level) filter.SECURITY_LEVEL = security_level;
    if (branch_code) {
      filter['DRAWER_REF.BRANCH_CODE'] = branch_code;
    }

    // Search functionality
    if (search) {
      filter.$or = [
        { VAULT_CD: { $regex: search, $options: 'i' } },
        { VAULT_NM: { $regex: search, $options: 'i' } }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: 'DRAWER_REF',
      sort: { CREATED_AT: -1 }
    };

    const vaults = await Vault.paginate(filter, options);

    res.json({
      success: true,
      data: vaults
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

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    }).populate('DRAWER_REF');

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
    console.error('Get vault by ID error:', error);
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
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { id } = req.params;
    const updateData = req.body;
    const { UPDATED_BY } = req.body;

    if (!UPDATED_BY) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'UPDATED_BY is required'
      });
    }

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    }).session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Fields that cannot be updated directly
    const restrictedFields = ['VAULT_ID', 'VAULT_CD', 'DRAWER_REF', 'CREATED_BY'];
    restrictedFields.forEach(field => delete updateData[field]);

    // Update vault
    Object.assign(vault, updateData, { UPDATED_BY });
    await vault.save({ session });

    // Update associated drawer if vault name changed
    if (updateData.VAULT_NM) {
      await Drawer.findByIdAndUpdate(
        vault.DRAWER_REF,
        { DRAWER_NM: updateData.VAULT_NM },
        { session }
      );
    }

    await session.commitTransaction();

    const updatedVault = await Vault.findById(vault._id).populate('DRAWER_REF');

    res.json({
      success: true,
      message: 'Vault updated successfully',
      data: updatedVault
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Update vault error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update vault',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * Deactivate vault
 */
export const deactivateVault = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { id } = req.params;
    const { UPDATED_BY, reason } = req.body;

    if (!UPDATED_BY) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'UPDATED_BY is required'
      });
    }

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    }).session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if vault has balance
    const drawer = await Drawer.findById(vault.DRAWER_REF).session(session);
    if (parseFloat(drawer.CURRENT_BALANCE.toString()) > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate vault with positive balance'
      });
    }

    // Deactivate vault
    vault.IS_ACTIVE = false;
    vault.VAULT_STATUS = 'DECOMMISSIONED';
    vault.UPDATED_BY = UPDATED_BY;
    await vault.save({ session });

    // Deactivate associated drawer
    drawer.REC_ST = 'C'; // Closed status
    drawer.WF_STATUS = 'CLOSED';
    await drawer.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Vault deactivated successfully',
      data: {
        vault,
        deactivation_reason: reason
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Deactivate vault error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate vault',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// =============================================
// ACCESS CONTROL CONTROLLERS
// =============================================

/**
 * Authorize personnel for vault access
 */
export const authorizePersonnel = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
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
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: user_id, user_name, user_role, authorized_by'
      });
    }

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    }).session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if authorizer has permission
    const authorizerPermissions = vault.checkRolePermissions(
      req.user.role, // Assuming user role from auth middleware
      'AUTHORIZE_PERSONNEL'
    );

    if (!authorizerPermissions.allowed) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to authorize personnel',
        reason: authorizerPermissions.reason
      });
    }

    // Authorize personnel
    const authorizedPerson = vault.authorizePersonnel(
      user_id,
      user_name,
      user_role,
      authorized_by,
      access_level,
      notes
    );

    await vault.save({ session });

    // Log access attempt
    vault.logAccessAttempt(
      authorized_by,
      req.user.role,
      'AUTHORIZATION',
      true,
      null,
      req.ip
    );

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Personnel authorized successfully',
      data: {
        vault: vault.VAULT_CD,
        authorized_person: authorizedPerson
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Authorize personnel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to authorize personnel',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

/**
 * Revoke personnel authorization
 */
export const revokeAuthorization = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { id, userId } = req.params;
    const { revoked_by, reason = '' } = req.body;

    if (!revoked_by) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'revoked_by is required'
      });
    }

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    }).session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if revoker has permission
    const revokerPermissions = vault.checkRolePermissions(
      req.user.role,
      'MANAGE_VAULT_ACCESS'
    );

    if (!revokerPermissions.allowed) {
      await session.abortTransaction();
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to revoke authorization',
        reason: revokerPermissions.reason
      });
    }

    // Revoke authorization
    const revokedAuth = vault.revokeAuthorization(userId, revoked_by, reason);
    await vault.save({ session });

    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Authorization revoked successfully',
      data: {
        vault: vault.VAULT_CD,
        revoked_authorization: revokedAuth
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Revoke authorization error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to revoke authorization',
      error: error.message
    });
  } finally {
    session.endSession();
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
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    let personnel = vault.AUTHORIZED_PERSONNEL;
    
    if (active_only === 'true') {
      personnel = personnel.filter(person => person.is_active);
    }

    res.json({
      success: true,
      data: {
        vault: vault.VAULT_CD,
        personnel_count: personnel.length,
        personnel
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
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Validate transaction
    const validation = vault.validateTransaction(amount, transaction_type, requested_by_role);
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Transaction validation failed',
        violations: validation.violations
      });
    }

    // Create approval request
    const approvalRequest = vault.createApprovalRequest(
      transaction_type,
      amount,
      requested_by,
      requested_by_role,
      urgency
    );

    await vault.save();

    res.status(201).json({
      success: true,
      message: 'Approval request created successfully',
      data: {
        vault: vault.VAULT_CD,
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
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if approver has permission for this role
    const permissions = vault.checkRolePermissions(approver_role, 'APPROVE_TRANSACTION');
    
    if (!permissions.allowed) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to approve this request',
        reason: permissions.reason
      });
    }

    // Approve request
    const approvedRequest = vault.approveRequest(
      approvalId,
      approver_id,
      approver_name,
      approver_role,
      notes
    );

    await vault.save();

    res.json({
      success: true,
      message: 'Request approved successfully',
      data: {
        vault: vault.VAULT_CD,
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
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    let pendingApprovals = vault.PENDING_APPROVALS.filter(
      approval => approval.status === 'PENDING'
    );

    // Filter by role if specified
    if (role) {
      pendingApprovals = pendingApprovals.filter(approval =>
        approval.approval_required_from.includes(role)
      );
    }

    res.json({
      success: true,
      data: {
        vault: vault.VAULT_CD,
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
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Log access attempt
    const accessLog = vault.logAccessAttempt(
      user_id,
      user_role,
      access_method,
      success,
      failure_reason,
      location
    );

    await vault.save();

    res.json({
      success: true,
      message: 'Access attempt logged successfully',
      data: {
        vault: vault.VAULT_CD,
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
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Record maintenance
    const maintenanceLog = vault.recordMaintenance(
      maintenance_type,
      performed_by,
      description,
      cost,
      duration_hours,
      approved_by
    );

    await vault.save();

    res.status(201).json({
      success: true,
      message: 'Maintenance recorded successfully',
      data: {
        vault: vault.VAULT_CD,
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
    const { security_features } = req.body;
    const { UPDATED_BY } = req.body;

    if (!UPDATED_BY) {
      return res.status(400).json({
        success: false,
        message: 'UPDATED_BY is required'
      });
    }

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if user has permission to configure security
    const permissions = vault.checkRolePermissions(req.user.role, 'MANAGE_VAULT_ACCESS');
    
    if (!permissions.allowed) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to update security features',
        reason: permissions.reason
      });
    }

    // Update security features
    vault.SECURITY_FEATURES = security_features;
    vault.UPDATED_BY = UPDATED_BY;
    vault.LAST_SECURITY_CHECK = new Date();

    await vault.save();

    res.json({
      success: true,
      message: 'Security features updated successfully',
      data: {
        vault: vault.VAULT_CD,
        security_features: vault.SECURITY_FEATURES,
        last_security_check: vault.LAST_SECURITY_CHECK
      }
    });

  } catch (error) {
    console.error('Update security features error:', error);
    res.status(500).json({
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
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    }).populate('DRAWER_REF');

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const utilization = {
      vault_code: vault.VAULT_CD,
      vault_name: vault.VAULT_NM,
      capacity: parseFloat(vault.VAULT_CAPACITY.toString()),
      current_balance: parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString()),
      utilization_percentage: vault.utilizationPercentage,
      available_capacity: vault.availableCapacity,
      status: vault.VAULT_STATUS
    };

    res.json({
      success: true,
      data: utilization
    });

  } catch (error) {
    console.error('Get vault utilization error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vault utilization',
      error: error.message
    });
  }
};

/**
 * Get security compliance report
 */
export const getSecurityCompliance = async (req, res) => {
  try {
    const { id } = req.params;

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    });

    if (!vault) {
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const compliance = vault.securityCompliance;

    res.json({
      success: true,
      data: {
        vault_code: vault.VAULT_CD,
        vault_name: vault.VAULT_NM,
        security_compliance: compliance,
        security_breach_count: vault.SECURITY_BREACH_COUNT,
        active_security_features: vault.SECURITY_FEATURES.filter(f => f.is_active).length,
        total_security_features: vault.SECURITY_FEATURES.length
      }
    });

  } catch (error) {
    console.error('Get security compliance error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch security compliance',
      error: error.message
    });
  }
};

/**
 * Get vault statistics
 */
export const getVaultStatistics = async (req, res) => {
  try {
    const { branch_code, category } = req.query;

    const filter = { IS_ACTIVE: true };
    if (branch_code) filter['DRAWER_REF.BRANCH_CODE'] = branch_code;
    if (category) filter.VAULT_CATEGORY = category;

    const vaults = await Vault.find(filter).populate('DRAWER_REF');

    const statistics = {
      total_vaults: vaults.length,
      by_category: {},
      by_status: {},
      total_capacity: 0,
      total_balance: 0,
      average_utilization: 0,
      security_breaches: 0,
      pending_approvals: 0
    };

    let totalUtilization = 0;

    vaults.forEach(vault => {
      // Category statistics
      statistics.by_category[vault.VAULT_CATEGORY] = 
        (statistics.by_category[vault.VAULT_CATEGORY] || 0) + 1;

      // Status statistics
      statistics.by_status[vault.VAULT_STATUS] = 
        (statistics.by_status[vault.VAULT_STATUS] || 0) + 1;

      // Capacity and balance
      const capacity = parseFloat(vault.VAULT_CAPACITY.toString());
      const balance = parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString());
      
      statistics.total_capacity += capacity;
      statistics.total_balance += balance;

      // Utilization
      const utilization = vault.utilizationPercentage;
      totalUtilization += parseFloat(utilization);

      // Security breaches
      statistics.security_breaches += vault.SECURITY_BREACH_COUNT;

      // Pending approvals
      statistics.pending_approvals += vault.PENDING_APPROVALS.filter(
        approval => approval.status === 'PENDING'
      ).length;
    });

    statistics.average_utilization = vaults.length > 0 ? 
      (totalUtilization / vaults.length).toFixed(2) : 0;

    res.json({
      success: true,
      data: statistics
    });

  } catch (error) {
    console.error('Get vault statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vault statistics',
      error: error.message
    });
  }
};

// =============================================
// BULK OPERATIONS CONTROLLERS
// =============================================

/**
 * Bulk authorize personnel
 */
export const bulkAuthorizePersonnel = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { id } = req.params;
    const { personnel_list, authorized_by } = req.body;

    if (!personnel_list || !Array.isArray(personnel_list) || !authorized_by) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: personnel_list (array), authorized_by'
      });
    }

    const vault = await Vault.findOne({
      $or: [
        { _id: id },
        { VAULT_ID: parseInt(id) },
        { VAULT_CD: id }
      ]
    }).session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const person of personnel_list) {
      try {
        const authorizedPerson = vault.authorizePersonnel(
          person.user_id,
          person.user_name,
          person.user_role,
          authorized_by,
          person.access_level || 'LIMITED',
          person.notes || ''
        );
        results.successful.push(authorizedPerson);
      } catch (error) {
        results.failed.push({
          user_id: person.user_id,
          error: error.message
        });
      }
    }

    await vault.save({ session });
    await session.commitTransaction();

    res.json({
      success: true,
      message: 'Bulk authorization completed',
      data: {
        vault: vault.VAULT_CD,
        results,
        summary: {
          total: personnel_list.length,
          successful: results.successful.length,
          failed: results.failed.length
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Bulk authorize personnel error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk authorize personnel',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

export default {
  createVault,
  getAllVaults,
  getVaultById,
  updateVault,
  deactivateVault,
  authorizePersonnel,
  revokeAuthorization,
  getAuthorizedPersonnel,
  createApprovalRequest,
  approveRequest,
  getPendingApprovals,
  logAccessAttempt,
  recordMaintenance,
  updateSecurityFeatures,
  getVaultUtilization,
  getSecurityCompliance,
  getVaultStatistics,
  bulkAuthorizePersonnel
};