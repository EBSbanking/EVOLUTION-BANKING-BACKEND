// src/models/TransactionPolicy.js
import { DataTypes, Model, Op } from 'sequelize'; // ? Added Op import
import sequelize from '../../config/db.js';

// ================================================================
// ? POLICY RANGE MODEL (Defined first for proper initialization)
// ================================================================
class PolicyRange extends Model {
  // ================================================================
  // ? STATIC METHODS FOR PolicyRange
  // ================================================================
  
  // Get all ranges for a specific policy
  static async getRangesByPolicyId(policyId) {
    try {
      const ranges = await PolicyRange.findAll({
        where: { policy_id: policyId },
        order: [['min_amount', 'ASC']]
      });
      return ranges;
    } catch (error) {
      console.error('? Error getting ranges by policy ID:', error.message);
      return [];
    }
  }

  // Check if amount falls within any range and requires approval
  static async checkAmountRequiresApproval(policyId, amount) {
    try {
      const range = await PolicyRange.findOne({
        where: {
          policy_id: policyId,
          min_amount: { [Op.lte]: amount },
          max_amount: { [Op.gte]: amount }
        }
      });

      if (!range) {
        return {
          found: false,
          requiresApproval: true,
          authorizedRoles: ['SUPERVISOR', 'MANAGER'],
          range: null,
          message: 'Amount outside all defined ranges'
        };
      }

      const requiresApproval = range.requires_approval === 1 || range.requires_approval === true;
      const authorizedRoles = range.authorized_roles 
        ? range.authorized_roles.split(',').map(r => r.trim())
        : ['SUPERVISOR', 'MANAGER'];

      return {
        found: true,
        requiresApproval,
        authorizedRoles,
        range: range,
        message: requiresApproval 
          ? `Amount requires approval from ${authorizedRoles.join(', ')}`
          : 'Amount is auto-approved'
      };
    } catch (error) {
      console.error('? Error checking amount:', error.message);
      return {
        found: false,
        requiresApproval: true,
        authorizedRoles: ['SUPERVISOR', 'MANAGER'],
        range: null,
        message: 'Error checking amount, defaulting to require approval'
      };
    }
  }

  // Bulk create ranges for a policy
  static async bulkCreateRanges(policyId, rangesData, createdBy = 1) {
    try {
      const ranges = rangesData.map(range => ({
        policy_id: policyId,
        min_amount: range.MIN_AMOUNT || range.min_amount || 0,
        max_amount: range.MAX_AMOUNT || range.max_amount || 999999999.99,
        requires_approval: range.requiresApproval || range.requires_approval || false,
        authorized_roles: range.AUTHORIZED_ROLES || range.authorized_roles 
          ? (Array.isArray(range.AUTHORIZED_ROLES || range.authorized_roles) 
              ? (range.AUTHORIZED_ROLES || range.authorized_roles).join(',') 
              : (range.AUTHORIZED_ROLES || range.authorized_roles))
          : null,
        created_by: createdBy
      }));

      const createdRanges = await PolicyRange.bulkCreate(ranges);
      console.log(`? Created ${createdRanges.length} ranges for policy ${policyId}`);
      return createdRanges;
    } catch (error) {
      console.error('? Error bulk creating ranges:', error.message);
      throw error;
    }
  }

  // Delete all ranges for a policy
  static async deleteRangesByPolicyId(policyId) {
    try {
      const deleted = await PolicyRange.destroy({
        where: { policy_id: policyId }
      });
      console.log(`? Deleted ${deleted} ranges for policy ${policyId}`);
      return deleted;
    } catch (error) {
      console.error('? Error deleting ranges:', error.message);
      throw error;
    }
  }
}

// ================================================================
// ? TRANSACTION POLICY MODEL
// ================================================================
class TransactionPolicy extends Model {
  // ================================================================
  // ? CREATE POLICY
  // ================================================================
  static async createPolicy(policyData) {
    try {
      const {
        POLICY_TYPE,
        ROLE_NM,
        BU_ID,
        branch_code,
        description,
        created_by,
        RANGES,
        effective_from,
        effective_to,
        status
      } = policyData;

      // Generate policy_id if not provided
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(2, 7).toUpperCase();
      const policyId = `TPOL-${timestamp}-${random}`;

      // Create the policy
      const policy = await TransactionPolicy.create({
        policy_id: policyId,
        policy_type: POLICY_TYPE,
        role_name: ROLE_NM.toUpperCase(),
        bu_id: BU_ID || null,
        branch_code: branch_code || null,
        description: description || `Policy for ${ROLE_NM} - ${POLICY_TYPE}`,
        created_by: created_by || 1,
        status: status || 'ACTIVE',
        effective_from: effective_from || null,
        effective_to: effective_to || null
      });

      // ? Create ranges if provided
      if (RANGES && Array.isArray(RANGES) && RANGES.length > 0) {
        await PolicyRange.bulkCreateRanges(policy.id, RANGES, created_by || 1);
      }

      // Fetch the complete policy with ranges
      const completePolicy = await TransactionPolicy.findByPk(policy.id, {
        include: [{ model: PolicyRange, as: 'ranges' }]
      });

      console.log(`? Policy created: ${policyId}`);
      return completePolicy;

    } catch (error) {
      console.error('? Error creating policy:', error.message);
      throw error;
    }
  }

  // ================================================================
  // ? UPDATE POLICY
  // ================================================================
  static async updatePolicy(id, updateData) {
    try {
      const { RANGES, status, description, effective_to, updated_by } = updateData;

      // Find the policy
      const policy = await TransactionPolicy.findOne({
        where: { 
          [Op.or]: [
            { id: id },
            { policy_id: id }
          ]
        }
      });

      if (!policy) {
        throw new Error(`Policy with ID ${id} not found`);
      }

      // Update policy fields
      const updates = {};
      if (status) updates.status = status;
      if (description) updates.description = description;
      if (effective_to) updates.effective_to = effective_to;
      if (updated_by) updates.updated_by = updated_by;
      
      if (Object.keys(updates).length > 0) {
        await policy.update(updates);
      }

      // Update ranges if provided
      if (RANGES && Array.isArray(RANGES)) {
        // Delete existing ranges
        await PolicyRange.deleteRangesByPolicyId(policy.id);
        
        // Create new ranges
        await PolicyRange.bulkCreateRanges(policy.id, RANGES, updated_by || policy.created_by);
      }

      // Fetch updated policy with ranges
      const updatedPolicy = await TransactionPolicy.findByPk(policy.id, {
        include: [{ model: PolicyRange, as: 'ranges' }]
      });

      console.log(`? Policy updated: ${policy.policy_id}`);
      return updatedPolicy;

    } catch (error) {
      console.error('? Error updating policy:', error.message);
      throw error;
    }
  }

  // ================================================================
  // ? GET ALL POLICIES
  // ================================================================
  static async getAllPolicies(filters = {}) {
    try {
      const whereClause = {};

      if (filters.role_name) {
        whereClause.role_name = filters.role_name.toUpperCase();
      }
      if (filters.policy_type) {
        whereClause.policy_type = filters.policy_type;
      }
      if (filters.status) {
        whereClause.status = filters.status;
      } else {
        whereClause.status = 'ACTIVE';
      }
      if (filters.bu_id) {
        whereClause.bu_id = filters.bu_id;
      }
      if (filters.branch_code) {
        whereClause.branch_code = filters.branch_code;
      }

      const policies = await TransactionPolicy.findAll({
        where: whereClause,
        include: [{ model: PolicyRange, as: 'ranges' }],
        order: [['created_at', 'DESC']]
      });

      console.log(`?? Found ${policies.length} policies`);
      return policies;
    } catch (error) {
      console.error('? Error getting policies:', error.message);
      return [];
    }
  }

  // ================================================================
  // ? GET POLICY BY ID
  // ================================================================
  static async getPolicyById(id) {
    try {
      const policy = await TransactionPolicy.findOne({
        where: {
          [Op.or]: [
            { id: id },
            { policy_id: id }
          ]
        },
        include: [{ model: PolicyRange, as: 'ranges' }]
      });

      return policy;
    } catch (error) {
      console.error('? Error getting policy by ID:', error.message);
      return null;
    }
  }

  // ================================================================
  // ? GET POLICIES BY ROLE
  // ================================================================
  static async getPoliciesByRole(roleName, policyType = null) {
    try {
      const whereClause = {
        role_name: roleName.toUpperCase(),
        status: 'ACTIVE'
      };

      if (policyType) {
        whereClause.policy_type = policyType;
      }

      const policies = await TransactionPolicy.findAll({
        where: whereClause,
        include: [{ model: PolicyRange, as: 'ranges' }],
        order: [['created_at', 'DESC']]
      });

      return policies;
    } catch (error) {
      console.error('? Error getting policies by role:', error.message);
      return [];
    }
  }

  // ================================================================
  // ? DEACTIVATE POLICY
  // ================================================================
  static async deactivatePolicy(id) {
    try {
      const policy = await TransactionPolicy.findOne({
        where: {
          [Op.or]: [
            { id: id },
            { policy_id: id }
          ]
        }
      });

      if (!policy) {
        throw new Error(`Policy with ID ${id} not found`);
      }

      await policy.update({
        status: 'INACTIVE',
        effective_to: new Date()
      });

      console.log(`? Policy deactivated: ${policy.policy_id}`);
      return policy;
    } catch (error) {
      console.error('? Error deactivating policy:', error.message);
      throw error;
    }
  }

  // In TransactionPolicy.js
static async checkRequiresApproval(policyType, roleName, amount, buId, branchCode) {
  try {
    const whereClause = {
      policy_type: policyType,
      role_name: roleName.toUpperCase(),
      status: 'ACTIVE'
    };

    if (buId) {
      whereClause.bu_id = buId;
    }
    if (branchCode) {
      whereClause.branch_code = branchCode;
    }

    // Get the policy
    const policy = await TransactionPolicy.findOne({
      where: whereClause
    });

    if (!policy) {
      console.log('?? No policy found for:', { policyType, roleName, buId, branchCode });
      return {
        policy: null,
        range: null,
        requiresApproval: true,
        authorizedRoles: ['SUPERVISOR', 'MANAGER'],
        message: 'No policy found, defaulting to require approval'
      };
    }

    console.log(`? Policy found: ${policy.policy_id}`);

    // Check if amount is within range
    const minAmount = parseFloat(policy.min_amount || 0);
    const maxAmount = parseFloat(policy.max_amount || 999999999.99);
    
    let matchedRange = null;
    if (amount >= minAmount && amount <= maxAmount) {
      matchedRange = policy;
    }

    if (!matchedRange) {
      console.log(`?? Amount ?${amount.toLocaleString()} outside range for ${roleName}`);
      return {
        policy: policy,
        range: null,
        requiresApproval: true,
        authorizedRoles: ['SUPERVISOR', 'MANAGER'],
        message: 'Amount outside defined range'
      };
    }

    const requiresApproval = policy.requires_approval === 1 || policy.requires_approval === true;
    const authorizedRoles = policy.authorized_roles 
      ? policy.authorized_roles.split(',').map(r => r.trim())
      : ['SUPERVISOR', 'MANAGER'];

    console.log(`? Policy check: ${requiresApproval ? 'REQUIRES' : 'AUTO'} approval for ?${amount.toLocaleString()}`);

    return {
      policy: policy,
      range: matchedRange,
      requiresApproval: requiresApproval,
      authorizedRoles: authorizedRoles,
      message: requiresApproval 
        ? `Amount ?${amount.toLocaleString()} requires approval from ${authorizedRoles.join(', ')}`
        : `Amount ?${amount.toLocaleString()} is auto-approved`
    };

  } catch (error) {
    console.error('? Error checking policy:', error.message);
    return {
      policy: null,
      range: null,
      requiresApproval: true,
      authorizedRoles: ['SUPERVISOR', 'MANAGER'],
      message: 'Error checking policy, defaulting to require approval'
    };
  }
}

  // ================================================================
  // ? GET POLICY STATISTICS
  // ================================================================
  static async getPolicyStats() {
    try {
      const totalPolicies = await TransactionPolicy.count();
      const activePolicies = await TransactionPolicy.count({
        where: { status: 'ACTIVE' }
      });
      const inactivePolicies = await TransactionPolicy.count({
        where: { status: 'INACTIVE' }
      });

      // Get policies by type
      const depositPolicies = await TransactionPolicy.count({
        where: { policy_type: 'Deposit', status: 'ACTIVE' }
      });
      const withdrawalPolicies = await TransactionPolicy.count({
        where: { policy_type: 'Withdrawal', status: 'ACTIVE' }
      });

      // Get policies by role
      const roleStats = await TransactionPolicy.findAll({
        attributes: [
          'role_name',
          [sequelize.fn('COUNT', sequelize.col('role_name')), 'count']
        ],
        where: { status: 'ACTIVE' },
        group: ['role_name']
      });

      return {
        total: totalPolicies,
        active: activePolicies,
        inactive: inactivePolicies,
        byType: {
          deposit: depositPolicies,
          withdrawal: withdrawalPolicies
        },
        byRole: roleStats
      };
    } catch (error) {
      console.error('? Error getting policy stats:', error.message);
      return null;
    }
  }

  // ================================================================
  // ? INITIALIZE TABLES
  // ================================================================
  static async initializeTables() {
    try {
      // Create transaction_policies table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS transaction_policies (
          id INT PRIMARY KEY AUTO_INCREMENT,
          policy_id VARCHAR(50) NOT NULL UNIQUE,
          policy_type ENUM('Deposit', 'Withdrawal') NOT NULL,
          role_name VARCHAR(100) NOT NULL,
          bu_id VARCHAR(20),
          branch_code VARCHAR(50),
          status ENUM('ACTIVE', 'INACTIVE', 'DELETED') DEFAULT 'ACTIVE',
          effective_from DATETIME,
          effective_to DATETIME,
          description TEXT,
          created_by INT NOT NULL,
          updated_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_role_name (role_name),
          INDEX idx_policy_type (policy_type),
          INDEX idx_status (status)
        )
      `);

      // Create policy_ranges table
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS policy_ranges (
          id INT PRIMARY KEY AUTO_INCREMENT,
          policy_id INT NOT NULL,
          min_amount DECIMAL(20,2) DEFAULT 0,
          max_amount DECIMAL(20,2) DEFAULT 999999999.99,
          requires_approval BOOLEAN DEFAULT FALSE,
          authorized_roles VARCHAR(255),
          created_by INT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (policy_id) REFERENCES transaction_policies(id) ON DELETE CASCADE,
          INDEX idx_policy_id (policy_id)
        )
      `);

      console.log('? Transaction policy tables initialized');
      return true;
    } catch (error) {
      console.error('? Error initializing tables:', error.message);
      return false;
    }
  }
}

// ================================================================
// ? TRANSACTION POLICY MODEL INITIALIZATION
// ================================================================
TransactionPolicy.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    policy_id: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    policy_type: {
      type: DataTypes.ENUM('Deposit', 'Withdrawal'),
      allowNull: false,
    },
    role_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    bu_id: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    branch_code: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'DELETED'),
      allowNull: false,
      defaultValue: 'ACTIVE',
    },
    effective_from: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    effective_to: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    updated_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'TransactionPolicy',
    tableName: 'transaction_policies',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
  }
);

// ================================================================
// ? POLICY RANGE MODEL INITIALIZATION
// ================================================================
PolicyRange.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    policy_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'transaction_policies',
        key: 'id'
      },
      onDelete: 'CASCADE',
    },
    min_amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0,
    },
    max_amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 999999999.99,
    },
    requires_approval: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    authorized_roles: {
      type: DataTypes.STRING(255),
      allowNull: true,
      get() {
        const rawValue = this.getDataValue('authorized_roles');
        return rawValue ? rawValue.split(',').map(r => r.trim()) : [];
      },
      set(value) {
        if (Array.isArray(value)) {
          this.setDataValue('authorized_roles', value.join(','));
        } else {
          this.setDataValue('authorized_roles', value);
        }
      }
    },
    created_by: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'PolicyRange',
    tableName: 'policy_ranges',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
  }
);

// ================================================================
// ? ASSOCIATIONS
// ================================================================
TransactionPolicy.hasMany(PolicyRange, {
  foreignKey: 'policy_id',
  as: 'ranges',
  onDelete: 'CASCADE'
});

PolicyRange.belongsTo(TransactionPolicy, {
  foreignKey: 'policy_id',
  as: 'policy'
});

// ================================================================
// ? EXPORTS
// ================================================================
export default TransactionPolicy;
export { TransactionPolicy, PolicyRange };
