// controllers/transactionPolicyController.js - UPDATED FOR SEQUELIZE
import { TransactionPolicy } from '../models/TransactionPolicy.js';
import { Op } from 'sequelize';

// ✅ Create or update transaction policies
export const setTransactionPolicy = async (req, res) => {
  try {
    const { POLICIES } = req.body;
    
    if (!Array.isArray(POLICIES) || POLICIES.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: "At least one policy is required." 
      });
    }

    const results = [];

    for (const policy of POLICIES) {
      const { POLICY_TYPE, ROLES } = policy;
      
      if (!POLICY_TYPE) {
        return res.status(400).json({ 
          success: false,
          message: "Each policy must include POLICY_TYPE." 
        });
      }
      
      if (!Array.isArray(ROLES) || ROLES.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: "Each policy must include at least one role." 
        });
      }

      for (const role of ROLES) {
        const { ROLE_NM, RANGES, BU_ID, branch_code, description } = role;

        if (!ROLE_NM || !Array.isArray(RANGES) || RANGES.length === 0) {
          return res.status(400).json({ 
            success: false,
            message: "ROLE_NM and at least one range in RANGES are required." 
          });
        }

        // ✅ Validate each range
        for (const range of RANGES) {
          const { MIN_AMOUNT, MAX_AMOUNT, requiresApproval, AUTHORIZED_ROLES } = range;

          if (MIN_AMOUNT == null || MAX_AMOUNT == null || requiresApproval == null) {
            return res.status(400).json({ 
              success: false,
              message: "Each range must include MIN_AMOUNT, MAX_AMOUNT, and requiresApproval." 
            });
          }

          if (requiresApproval && (!AUTHORIZED_ROLES || AUTHORIZED_ROLES.length === 0)) {
            return res.status(400).json({ 
              success: false,
              message: "AUTHORIZED_ROLES must be provided for ranges that require approval." 
            });
          }

          if (!requiresApproval) {
            range.AUTHORIZED_ROLES = [];
          }
        }

        try {
          // Use the createPolicy method from TransactionPolicy model directly
          const createdPolicy = await TransactionPolicy.createPolicy({
            POLICY_TYPE,
            ROLE_NM: ROLE_NM.toUpperCase(),
            BU_ID: BU_ID || null,
            branch_code: branch_code || null,
            description: description || `Policy for ${ROLE_NM} - ${POLICY_TYPE}`,
            created_by: req.user?.id || 1, // Get user ID from request
            RANGES: RANGES
          });

          results.push({
            success: true,
            policy_id: createdPolicy.POLICY_ID,
            role: ROLE_NM,
            type: POLICY_TYPE
          });

          console.log(`✅ Policy created: ${createdPolicy.POLICY_ID} for ${ROLE_NM}`);

        } catch (createError) {
          console.error('❌ Error creating policy:', createError);
          return res.status(500).json({
            success: false,
            message: `Failed to create policy for ${ROLE_NM}: ${createError.message}`
          });
        }
      }
    }

    return res.status(201).json({ 
      success: true,
      message: "Policies processed successfully.",
      results 
    });

  } catch (error) {
    console.error("❌ Error setting policy:", error.message);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error", 
      error: error.message 
    });
  }
};

export const updatePolicy = async (req, res) => {
  try {
    const { id } = req.params; // POLICY_ID or ID
    const { RANGES, status, description, effective_to } = req.body;

    if (!RANGES && !status && !description && !effective_to) {
      return res.status(400).json({ 
        success: false,
        message: 'At least one field to update is required.' 
      });
    }

    // If RANGES are provided, validate them
    if (RANGES && Array.isArray(RANGES)) {
      if (RANGES.length === 0) {
        return res.status(400).json({ 
          success: false,
          message: 'At least one range in RANGES is required.' 
        });
      }

      for (let range of RANGES) {
        const { MIN_AMOUNT, MAX_AMOUNT, requiresApproval, AUTHORIZED_ROLES } = range;

        if (MIN_AMOUNT == null || MAX_AMOUNT == null || requiresApproval == null) {
          return res.status(400).json({ 
            success: false,
            message: 'Each range must include MIN_AMOUNT, MAX_AMOUNT, and requiresApproval.' 
          });
        }

        if (requiresApproval && (!AUTHORIZED_ROLES || !Array.isArray(AUTHORIZED_ROLES) || AUTHORIZED_ROLES.length === 0)) {
          return res.status(400).json({ 
            success: false,
            message: 'AUTHORIZED_ROLES must be provided for ranges that require approval.' 
          });
        }

        if (!requiresApproval) {
          range.AUTHORIZED_ROLES = [];
        }
      }
    }

    const updateData = {};
    if (RANGES) updateData.RANGES = RANGES;
    if (status) updateData.status = status;
    if (description) updateData.description = description;
    if (effective_to) updateData.effective_to = effective_to;
    if (Object.keys(updateData).length > 0) {
      updateData.updated_by = req.user?.id || null;
    }

    // Use the updatePolicy method from TransactionPolicy model directly
    const policy = await TransactionPolicy.updatePolicy(id, updateData);

    if (!policy) {
      return res.status(404).json({ 
        success: false,
        message: `No policy found with ID ${id}` 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: 'Policy updated successfully.',
      policy: {
        POLICY_ID: policy.POLICY_ID,
        POLICY_TYPE: policy.policy_type,
        ROLE_NM: policy.role_name,
        BU_ID: policy.bu_id,
        status: policy.status,
        ranges: policy.ranges.map(range => ({
          MIN_AMOUNT: range.MIN_AMOUNT,
          MAX_AMOUNT: range.MAX_AMOUNT,
          requiresApproval: range.requiresApproval,
          AUTHORIZED_ROLES: range.authorized_roles?.map(role => role.ROLE_NM) || []
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error updating policy:', error.message);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error', 
      error: error.message 
    });
  }
};

// ✅ Validate transaction based on amount and role
export const validateTransaction = async (req, res) => {
  try {
    const { ROLE_NM, AMOUNT, POLICY_TYPE, BU_ID, branch_code } = req.body;

    if (!ROLE_NM || AMOUNT == null || !POLICY_TYPE) {
      return res.status(400).json({ 
        success: false,
        message: 'ROLE_NM, POLICY_TYPE and AMOUNT are required.' 
      });
    }

    const amount = parseFloat(AMOUNT);
    if (isNaN(amount)) {
      return res.status(400).json({ 
        success: false,
        message: 'AMOUNT must be a valid number.' 
      });
    }

    // Use the checkRequiresApproval method from TransactionPolicy model directly
    const validation = await TransactionPolicy.checkRequiresApproval(
      POLICY_TYPE,
      ROLE_NM.toUpperCase(),
      amount,
      BU_ID || null,
      branch_code || null
    );

    console.log('Validation result:', {
      hasPolicy: !!validation.policy,
      hasRange: !!validation.range,
      requiresApproval: validation.requiresApproval,
      authorizedRoles: validation.authorizedRoles
    });

    // Check if no policy found at all
    if (!validation.policy) {
      return res.status(404).json({
        success: false,
        message: `No active policy found for role ${ROLE_NM} and type ${POLICY_TYPE}`,
        requiresApproval: true // Default to requiring approval if no policy found
      });
    }

    // Check if amount doesn't fit any range in the policy
    if (!validation.range) {
      return res.status(400).json({
        success: false,
        message: `Amount ₦${amount.toLocaleString()} is outside the defined ranges for ${ROLE_NM}. Policy ranges: ${validation.policy.ranges?.map(r => `₦${r.MIN_AMOUNT.toLocaleString()} - ₦${r.MAX_AMOUNT.toLocaleString()}`).join(', ')}`,
        requiresApproval: true,
        policyRanges: validation.policy.ranges?.map(range => ({
          MIN_AMOUNT: range.MIN_AMOUNT,
          MAX_AMOUNT: range.MAX_AMOUNT,
          requiresApproval: range.requiresApproval
        }))
      });
    }

    return res.status(200).json({
      success: true,
      message: validation.requiresApproval
        ? `Transaction requires approval from: ${validation.authorizedRoles.join(', ')}`
        : "Transaction can be auto-approved.",
      requiresApproval: validation.requiresApproval,
      authorizedRoles: validation.authorizedRoles,
      policy: {
        POLICY_ID: validation.policy?.POLICY_ID,
        POLICY_TYPE: validation.policy?.policy_type,
        range: validation.range ? {
          MIN_AMOUNT: validation.range.MIN_AMOUNT,
          MAX_AMOUNT: validation.range.MAX_AMOUNT
        } : null
      }
    });

  } catch (error) {
    console.error('❌ Error validating transaction:', error.message);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error', 
      error: error.message 
    });
  }
};


export const getTransactionPolicies = async (req, res) => {
  try {
    const { role, policy_type, status, bu_id, branch_code } = req.query;
    const filters = {};

    if (role) filters.role_name = role.toUpperCase();
    if (policy_type) filters.policy_type = policy_type;
    if (status) filters.status = status;
    if (bu_id) filters.bu_id = bu_id;
    if (branch_code) filters.branch_code = branch_code;

    // Use the getAllPolicies method from TransactionPolicy model
    const policies = await TransactionPolicy.getAllPolicies(filters);

    const formattedPolicies = policies.map(policy => ({
      id: policy.id,
      POLICY_ID: policy.POLICY_ID,
      POLICY_TYPE: policy.policy_type,
      ROLE_NM: policy.role_name,
      BU_ID: policy.bu_id,
      branch_code: policy.branch_code,
      status: policy.status,
      effective_from: policy.effective_from,
      effective_to: policy.effective_to,
      description: policy.description,
      created_by: policy.created_by,
      created_at: policy.created_at,
      updated_at: policy.updated_at,
      ranges: policy.ranges?.map(range => ({
        id: range.id,
        MIN_AMOUNT: range.MIN_AMOUNT,
        MAX_AMOUNT: range.MAX_AMOUNT,
        requiresApproval: range.requiresApproval,
        AUTHORIZED_ROLES: range.authorized_roles?.map(role => role.ROLE_NM) || [],
        created_at: range.created_at
      })) || []
    }));

    return res.status(200).json({ 
      success: true,
      count: formattedPolicies.length,
      policies: formattedPolicies 
    });

  } catch (error) {
    console.error('Error fetching policies:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message 
    });
  }
};

// ✅ Get policy by ID
export const getPolicyById = async (req, res) => {
  try {
    const { id } = req.params;

    const policy = await req.sequelize.models.TransactionPolicy.getPolicyById(id);

    if (!policy) {
      return res.status(404).json({ 
        success: false,
        message: `Policy not found with ID: ${id}` 
      });
    }

    const formattedPolicy = {
      id: policy.id,
      POLICY_ID: policy.POLICY_ID,
      POLICY_TYPE: policy.policy_type,
      ROLE_NM: policy.role_name,
      BU_ID: policy.bu_id,
      branch_code: policy.branch_code,
      status: policy.status,
      effective_from: policy.effective_from,
      effective_to: policy.effective_to,
      description: policy.description,
      created_by: policy.created_by,
      created_at: policy.created_at,
      updated_at: policy.updated_at,
      ranges: policy.ranges?.map(range => ({
        id: range.id,
        MIN_AMOUNT: range.MIN_AMOUNT,
        MAX_AMOUNT: range.MAX_AMOUNT,
        requiresApproval: range.requiresApproval,
        AUTHORIZED_ROLES: range.authorized_roles?.map(role => role.ROLE_NM) || [],
        created_at: range.created_at
      })) || []
    };

    return res.status(200).json({ 
      success: true,
      policy: formattedPolicy 
    });

  } catch (error) {
    console.error('Error fetching policy by ID:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message 
    });
  }
};

// ✅ Deactivate policy
export const deactivatePolicy = async (req, res) => {
  try {
    const { id } = req.params;

    const policy = await req.sequelize.models.TransactionPolicy.deactivatePolicy(id);

    if (!policy) {
      return res.status(404).json({ 
        success: false,
        message: `Policy not found with ID: ${id}` 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: 'Policy deactivated successfully.',
      policy: {
        POLICY_ID: policy.POLICY_ID,
        status: policy.status,
        effective_to: policy.effective_to
      }
    });

  } catch (error) {
    console.error('Error deactivating policy:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message 
    });
  }
};

// ✅ Get policy statistics
export const getPolicyStats = async (req, res) => {
  try {
    const stats = await req.sequelize.models.TransactionPolicy.getPolicyStats();

    return res.status(200).json({ 
      success: true,
      stats 
    });

  } catch (error) {
    console.error('Error getting policy stats:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message 
    });
  }
};

// ✅ Initialize/seed policy tables
export const initializePolicyTables = async (req, res) => {
  try {
    const result = await req.sequelize.models.TransactionPolicy.initializeTables();

    if (result) {
      return res.status(200).json({ 
        success: true,
        message: 'Transaction policy tables initialized successfully.' 
      });
    } else {
      return res.status(500).json({ 
        success: false,
        message: 'Failed to initialize transaction policy tables.' 
      });
    }

  } catch (error) {
    console.error('Error initializing policy tables:', error);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: error.message 
    });
  }
};