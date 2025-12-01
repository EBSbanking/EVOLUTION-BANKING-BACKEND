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
  console.log('📦 Starting vault creation...');
  
  try {
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
      $or: [{ VAULT_ID }, { VAULT_CD }]
    }).maxTimeMS(5000);

    if (existingVault) {
      console.log('❌ Vault already exists');
      return res.status(409).json({
        success: false,
        message: 'Vault with this ID or code already exists'
      });
    }

    console.log(`🔍 Finding drawer with ID: ${DRAWER_ID}`);
    
    // Find drawer
    const existingDrawer = await Drawer.findOne({ DRAWER_ID }).maxTimeMS(5000);
    
    if (!existingDrawer) {
      console.log('❌ Drawer not found');
      return res.status(404).json({
        success: false,
        message: `Drawer with ID ${DRAWER_ID} not found`
      });
    }

    console.log(`🔍 Checking if drawer ${DRAWER_ID} is already used...`);
    
    // Check if drawer is already used
    const drawerAlreadyUsed = await Vault.findOne({ 
      DRAWER_REF: existingDrawer._id 
    }).maxTimeMS(5000);

    if (drawerAlreadyUsed) {
      console.log('❌ Drawer already associated with another vault');
      return res.status(409).json({
        success: false,
        message: `Drawer with ID ${DRAWER_ID} is already associated with another vault`
      });
    }

    console.log('🔄 Updating drawer...');
    
    // ✅ ENHANCED: Parse capacity properly
    const capacity = VAULT_CAPACITY ? parseFloat(VAULT_CAPACITY) : 10000000.00;
    
    // Update drawer with proper Decimal128 values
    existingDrawer.DRAWER_NM = VAULT_NM;
    existingDrawer.DRAWER_TY_CD = 'VAULT';
    existingDrawer.VAULT_TYPE = VAULT_CATEGORY || 'BRANCH_VAULT';
    existingDrawer.SECURITY_LEVEL = SECURITY_LEVEL || 'LEVEL_2';
    existingDrawer.REQUIRES_DUAL_CONTROL = true;
    existingDrawer.VAULT_CAPACITY = mongoose.Types.Decimal128.fromString(capacity.toString());
    existingDrawer.MAX_BAL = mongoose.Types.Decimal128.fromString(capacity.toString());
    existingDrawer.GL_ACCT_NO = `VAULT-${VAULT_CD}`;
    existingDrawer.BRANCH_CODE = BRANCH_CODE || existingDrawer.BRANCH_CODE;
    existingDrawer.LOCATION_CODE = LOCATION_CODE || existingDrawer.LOCATION_CODE;
    existingDrawer.UPDATED_BY = CREATED_BY;

    await existingDrawer.save();

    console.log('📝 Creating vault data...');
    
    // Create authorized personnel
    const createAuthorizedPersonnel = (createdBy) => {
      const currentDate = new Date();
      const futureDate = new Date();
      futureDate.setFullYear(currentDate.getFullYear() + 1);
      
      return [
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
        }
      ];
    };

    // ✅ ENHANCED: Create vault data with proper Decimal128 values
    const vaultData = {
      VAULT_ID: parseInt(VAULT_ID, 10),
      VAULT_CD,
      VAULT_NM,
      DRAWER_ID: parseInt(DRAWER_ID, 10),
      DRAWER_REF: existingDrawer._id,
      VAULT_CATEGORY: VAULT_CATEGORY || 'BRANCH_VAULT',
      SECURITY_LEVEL: SECURITY_LEVEL || 'LEVEL_2',
      REQUIRES_DUAL_CONTROL: true,
      VAULT_CAPACITY: mongoose.Types.Decimal128.fromString(capacity.toString()),
      BRANCH_CODE: BRANCH_CODE || existingDrawer.BRANCH_CODE,
      LOCATION_CODE: LOCATION_CODE || existingDrawer.LOCATION_CODE,
      CREATED_BY,
      AUTHORIZED_PERSONNEL: createAuthorizedPersonnel(CREATED_BY),
      STORAGE_COMPARTMENTS: [{
        compartment_id: "COMP-001",
        compartment_type: "CASH",
        capacity: mongoose.Types.Decimal128.fromString("1000000.00"),
        current_balance: mongoose.Types.Decimal128.fromString("0.00"),
        is_locked: false,
        assigned_to: ""
      }],
      STATUS: 'ACTIVE',
      IS_ACTIVE: true,
      CURRENT_BALANCE: mongoose.Types.Decimal128.fromString("0.00"),
      AVAILABLE_CAPACITY: mongoose.Types.Decimal128.fromString(capacity.toString()),
      
      // ✅ ENHANCED: Set appropriate transaction limits based on capacity
      TRANSACTION_LIMITS: {
        max_single_deposit: mongoose.Types.Decimal128.fromString((capacity * 0.1).toString()), // 10% of capacity
        max_single_withdrawal: mongoose.Types.Decimal128.fromString((capacity * 0.05).toString()), // 5% of capacity
        daily_deposit_limit: mongoose.Types.Decimal128.fromString((capacity * 0.3).toString()), // 30% of capacity
        daily_withdrawal_limit: mongoose.Types.Decimal128.fromString((capacity * 0.2).toString()), // 20% of capacity
        min_transaction_amount: mongoose.Types.Decimal128.fromString("100.00"), // Minimum $100
        require_approval_amount: mongoose.Types.Decimal128.fromString((capacity * 0.02).toString()), // 2% of capacity
        head_teller_approval_limit: mongoose.Types.Decimal128.fromString((capacity * 0.01).toString()), // 1% of capacity
        supervisor_approval_limit: mongoose.Types.Decimal128.fromString((capacity * 0.03).toString()), // 3% of capacity
        branch_manager_approval_limit: mongoose.Types.Decimal128.fromString((capacity * 0.05).toString()) // 5% of capacity
      }
    };

    console.log('💾 Saving vault to database...');
    
    // Create vault
    const vault = new Vault(vaultData);
    await vault.save();

    console.log('✅ Vault created successfully');
    
    // Populate response
    const populatedVault = await Vault.findById(vault._id).populate('DRAWER_REF');

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
    console.error('❌ Create vault error:', error.message);
    console.error('Error stack:', error.stack);
    
    // Enhanced error handling
    if (error.name === 'MongoServerError') {
      console.error('MongoDB Error Code:', error.code);
      console.error('MongoDB Error Message:', error.message);
      
      if (error.code === 50) {
        return res.status(504).json({
          success: false,
          message: 'Database query timeout',
          error: 'Query took too long. Please check database indexes.'
        });
      }
    }
    
    if (error.name === 'ValidationError') {
      const errors = {};
      if (error.errors) {
        Object.keys(error.errors).forEach(key => {
          errors[key] = error.errors[key].message;
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Vault validation failed',
        errors: errors,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(409).json({
        success: false,
        message: 'Duplicate entry',
        error: `${field} '${error.keyValue[field]}' already exists`
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

// Add this function with the other "GET" controllers, after getVaultById

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

    // Build filter
    const filter = {
      'DRAWER_REF.BRANCH_CODE': branchCode.trim()
    };

    // Apply additional filters
    if (category) filter.VAULT_CATEGORY = category;
    if (status) filter.VAULT_STATUS = status;
    if (security_level) filter.SECURITY_LEVEL = security_level;
    
    // Handle active status filter
    if (active !== undefined) {
      if (active === 'true' || active === true) {
        filter.IS_ACTIVE = true;
        filter.VAULT_STATUS = { $ne: 'DECOMMISSIONED' };
      } else if (active === 'false' || active === false) {
        filter.IS_ACTIVE = false;
        filter.VAULT_STATUS = 'DECOMMISSIONED';
      }
    }

    // Pagination options
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      populate: {
        path: 'DRAWER_REF',
        select: 'DRAWER_NM DRAWER_TY_CD CURRENT_BALANCE MAX_BAL GL_ACCT_NO BRANCH_CODE LOCATION_CODE REC_ST'
      },
      sort: { CREATED_AT: -1 }
    };

    console.log('📊 Executing query with filter:', JSON.stringify(filter, null, 2));

    // Execute query
    const vaults = await Vault.paginate(filter, options);

    // If no vaults found
    if (vaults.docs.length === 0) {
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
    const enhancedDocs = vaults.docs.map(vault => {
      const drawer = vault.DRAWER_REF;
      const capacity = parseFloat(vault.VAULT_CAPACITY?.toString() || '0');
      const currentBalance = parseFloat(drawer?.CURRENT_BALANCE?.toString() || '0');
      
      return {
        ...vault.toObject(),
        utilization_percentage: capacity > 0 ? ((currentBalance / capacity) * 100).toFixed(2) + '%' : '0%',
        available_capacity: capacity - currentBalance,
        drawer_summary: drawer ? {
          drawerId: drawer.DRAWER_ID || 'N/A',
          drawerName: drawer.DRAWER_NM || 'N/A',
          currentBalance: currentBalance,
          maxBalance: parseFloat(drawer.MAX_BAL?.toString() || '0'),
          status: drawer.REC_ST || 'N/A',
          glAccount: drawer.GL_ACCT_NO || 'N/A',
          branchCode: drawer.BRANCH_CODE || 'N/A',
          locationCode: drawer.LOCATION_CODE || 'N/A'
        } : null
      };
    });

    // Calculate branch-level statistics
    const branchStatistics = {
      total_vaults: vaults.totalDocs,
      active_vaults: enhancedDocs.filter(v => v.IS_ACTIVE).length,
      total_capacity: enhancedDocs.reduce((sum, v) => 
        sum + parseFloat(v.VAULT_CAPACITY?.toString() || '0'), 0),
      total_balance: enhancedDocs.reduce((sum, v) => 
        sum + (v.drawer_summary?.currentBalance || 0), 0),
      categories: {},
      security_levels: {}
    };

    // Count by category and security level
    enhancedDocs.forEach(vault => {
      // Category counts
      const category = vault.VAULT_CATEGORY || 'UNKNOWN';
      branchStatistics.categories[category] = (branchStatistics.categories[category] || 0) + 1;
      
      // Security level counts
      const securityLevel = vault.SECURITY_LEVEL || 'UNKNOWN';
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
      message: `Found ${vaults.totalDocs} vault(s) for branch ${branchCode}`,
      data: {
        ...vaults,
        docs: enhancedDocs,
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

    console.log(`✅ Successfully retrieved ${vaults.totalDocs} vault(s) for branch ${branchCode}`);

    res.json(enhancedResponse);

  } catch (error) {
    console.error('❌ Get vault by BU error:', error.message);
    console.error('Error stack:', error.stack);

    // Enhanced error handling
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid branch code format',
        error: error.message
      });
    }

    if (error.name === 'ValidationError') {
      const errors = {};
      if (error.errors) {
        Object.keys(error.errors).forEach(key => {
          errors[key] = error.errors[key].message;
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Validation error in query parameters',
        errors: errors
      });
    }

    if (error.message?.includes('timeout')) {
      return res.status(504).json({
        success: false,
        message: 'Query timeout. The database is taking too long to respond.',
        suggestion: 'Try with more specific filters or reduce the page size.'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to fetch vaults by branch',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      timestamp: new Date().toISOString(),
      support_info: process.env.NODE_ENV === 'development' ? {
        endpoint: `/api/vaults/branch/${req.params.branchCode}`,
        method: req.method,
        query_params: req.query
      } : undefined
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
    const vaults = await Vault.find({
      'DRAWER_REF.BRANCH_CODE': branchCode.trim(),
      IS_ACTIVE: true
    })
    .populate('DRAWER_REF', 'CURRENT_BALANCE MAX_BAL DRAWER_NM DRAWER_TY_CD')
    .lean();

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
      const capacity = parseFloat(vault.VAULT_CAPACITY?.toString() || '0');
      const balance = parseFloat(vault.DRAWER_REF?.CURRENT_BALANCE?.toString() || '0');
      
      // Update capacity summary
      summary.capacity_summary.total_capacity += capacity;
      summary.capacity_summary.utilized_capacity += balance;
      
      // Update category counts
      const category = vault.VAULT_CATEGORY || 'UNKNOWN';
      summary.categories[category] = (summary.categories[category] || 0) + 1;
      
      // Update security level counts
      const securityLevel = vault.SECURITY_LEVEL || 'UNKNOWN';
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
        vault_id: vault.VAULT_ID,
        vault_code: vault.VAULT_CD,
        vault_name: vault.VAULT_NM,
        category: vault.VAULT_CATEGORY,
        security_level: vault.SECURITY_LEVEL,
        capacity: capacity,
        current_balance: balance,
        utilization: capacity > 0 ? (balance / capacity * 100).toFixed(2) + '%' : '0%',
        status: vault.VAULT_STATUS,
        requires_dual_control: vault.REQUIRES_DUAL_CONTROL || false,
        authorized_personnel_count: vault.AUTHORIZED_PERSONNEL?.length || 0
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

    res.json({
      success: true,
      message: `Branch vault summary for ${branchCode}`,
      data: formattedSummary
    });

  } catch (error) {
    console.error('❌ Get branch vault summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch branch vault summary',
      error: error.message
    });
  }
};

/**
 * Transfer vault between branches (vault reassignment)
 */
export const transferVaultToBranch = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { vaultId } = req.params;
    const { new_branch_code, new_location_code, transferred_by, reason } = req.body;

    console.log(`🔄 Transferring vault ${vaultId} to branch ${new_branch_code}`);

    // Validate required fields
    if (!new_branch_code || !transferred_by) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: new_branch_code, transferred_by'
      });
    }

    if (!reason || reason.trim() === '') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Transfer reason is required'
      });
    }

    // Find the vault
    const vault = await Vault.findOne({
      $or: [
        { _id: vaultId },
        { VAULT_ID: parseInt(vaultId) },
        { VAULT_CD: vaultId }
      ]
    }).populate('DRAWER_REF').session(session);

    if (!vault) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Vault not found'
      });
    }

    // Check if vault can be transferred (must be active)
    if (!vault.IS_ACTIVE) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer deactivated vault'
      });
    }

    // Check if vault has balance
    const currentBalance = parseFloat(vault.DRAWER_REF.CURRENT_BALANCE.toString());
    if (currentBalance > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Cannot transfer vault with positive balance',
        current_balance: currentBalance
      });
    }

    const oldBranchCode = vault.BRANCH_CODE;
    const oldLocationCode = vault.LOCATION_CODE;

    // Update vault
    vault.BRANCH_CODE = new_branch_code;
    vault.LOCATION_CODE = new_location_code || vault.LOCATION_CODE;
    vault.UPDATED_BY = transferred_by;
    
    // Record transfer in history
    if (!vault.TRANSFER_HISTORY) vault.TRANSFER_HISTORY = [];
    vault.TRANSFER_HISTORY.push({
      from_branch: oldBranchCode,
      to_branch: new_branch_code,
      from_location: oldLocationCode,
      to_location: new_location_code || vault.LOCATION_CODE,
      transferred_by: transferred_by,
      transferred_at: new Date(),
      reason: reason,
      previous_authorized_personnel: [...vault.AUTHORIZED_PERSONNEL]
    });

    // Clear authorized personnel (new branch needs to re-authorize)
    vault.AUTHORIZED_PERSONNEL = [];
    
    // Add system audit entry
    vault.AUDIT_TRAIL.push({
      action: 'BRANCH_TRANSFER',
      performed_by: transferred_by,
      performed_at: new Date(),
      details: {
        from_branch: oldBranchCode,
        to_branch: new_branch_code,
        reason: reason
      },
      system_generated: true
    });

    await vault.save({ session });

    // Update associated drawer
    const drawer = vault.DRAWER_REF;
    drawer.BRANCH_CODE = new_branch_code;
    drawer.LOCATION_CODE = new_location_code || vault.LOCATION_CODE;
    drawer.UPDATED_BY = transferred_by;
    await drawer.save({ session });

    await session.commitTransaction();

    console.log(`✅ Vault ${vaultId} transferred from ${oldBranchCode} to ${new_branch_code}`);

    // Get updated vault with drawer info
    const updatedVault = await Vault.findById(vault._id).populate('DRAWER_REF');

    res.json({
      success: true,
      message: 'Vault transferred successfully',
      data: {
        vault: {
          vault_id: updatedVault.VAULT_ID,
          vault_code: updatedVault.VAULT_CD,
          vault_name: updatedVault.VAULT_NM,
          new_branch_code: updatedVault.BRANCH_CODE,
          new_location_code: updatedVault.LOCATION_CODE,
          status: updatedVault.VAULT_STATUS
        },
        drawer: {
          drawer_id: updatedVault.DRAWER_REF.DRAWER_ID,
          drawer_name: updatedVault.DRAWER_REF.DRAWER_NM,
          new_branch_code: updatedVault.DRAWER_REF.BRANCH_CODE,
          new_location_code: updatedVault.DRAWER_REF.LOCATION_CODE
        },
        transfer_details: {
          from_branch: oldBranchCode,
          to_branch: new_branch_code,
          transferred_by: transferred_by,
          transferred_at: new Date(),
          reason: reason
        },
        note: 'Authorized personnel have been cleared. New branch must authorize personnel for this vault.'
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Transfer vault error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transfer vault',
      error: error.message
    });
  } finally {
    session.endSession();
  }
};

// Update the default export to include new functions
export default {
  createVault,
  getAllVaults,
  getVaultById,
  getVaultByBU,          // Added
  getBranchVaultSummary, // Added
  transferVaultToBranch, // Added
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
