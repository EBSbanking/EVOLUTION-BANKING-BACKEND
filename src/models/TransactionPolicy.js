// models/TransactionPolicy.js - MySQL/Sequelize Version - FULLY UPDATED
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';

// Separate model for policy ranges
const TransactionPolicyRange = sequelize.define('TransactionPolicyRange', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  transaction_policy_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'transaction_policy_id'
  },
  MIN_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'min_amount'
  },
  MAX_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'max_amount'
  },
  requiresApproval: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_approval'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'transaction_policy_ranges',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  indexes: [
    {
      unique: false,
      fields: ['transaction_policy_id']
    },
    {
      unique: false,
      fields: ['min_amount', 'max_amount']
    }
  ],
  hooks: {
    beforeCreate: (record) => {
      record.created_at = new Date();
      record.updated_at = new Date();
    },
    beforeUpdate: (record) => {
      record.updated_at = new Date();
    }
  }
});

// Separate model for authorized roles
const TransactionPolicyRole = sequelize.define('TransactionPolicyRole', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  transaction_policy_range_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'transaction_policy_range_id'
  },
  ROLE_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'role_name'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'transaction_policy_roles',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  indexes: [
    {
      unique: false,
      fields: ['transaction_policy_range_id']
    },
    {
      unique: false,
      fields: ['role_name']
    },
    {
      unique: true,
      fields: ['transaction_policy_range_id', 'role_name']
    }
  ],
  hooks: {
    beforeCreate: (record) => {
      record.created_at = new Date();
      record.updated_at = new Date();
    },
    beforeUpdate: (record) => {
      record.updated_at = new Date();
    }
  }
});

// Main TransactionPolicy model
const TransactionPolicy = sequelize.define('TransactionPolicy', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  POLICY_ID: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    field: 'policy_id'
  },
  POLICY_TYPE: {
    type: DataTypes.ENUM('Deposit', 'Withdrawal'),
    allowNull: false,
    field: 'policy_type'
  },
  ROLE_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'role_name'
  },
  BU_ID: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'bu_id'
  },
  branch_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'branch_code'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'DELETED'),
    defaultValue: 'ACTIVE',
    field: 'status'
  },
  effective_from: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'effective_from'
  },
  effective_to: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'effective_to'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'created_by'
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'updated_by'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'transaction_policies',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['policy_id']
    },
    {
      unique: false,
      fields: ['policy_type', 'role_name']
    },
    {
      unique: false,
      fields: ['status']
    },
    {
      unique: false,
      fields: ['bu_id']
    },
    {
      unique: false,
      fields: ['branch_code']
    }
  ],
  hooks: {
    beforeCreate: (record) => {
      record.created_at = new Date();
      record.updated_at = new Date();
    },
    beforeUpdate: (record) => {
      record.updated_at = new Date();
    }
  }
});

// Define relationships
TransactionPolicy.hasMany(TransactionPolicyRange, {
  foreignKey: 'transaction_policy_id',
  as: 'ranges'
});

TransactionPolicyRange.belongsTo(TransactionPolicy, {
  foreignKey: 'transaction_policy_id',
  as: 'policy'
});

TransactionPolicyRange.hasMany(TransactionPolicyRole, {
  foreignKey: 'transaction_policy_range_id',
  as: 'authorized_roles'
});

TransactionPolicyRole.belongsTo(TransactionPolicyRange, {
  foreignKey: 'transaction_policy_range_id',
  as: 'policy_range'
});

// ==================== HELPER METHODS ====================

// Create a new policy
TransactionPolicy.createPolicy = async (policyData) => {
  try {
    // Generate POLICY_ID if not provided
    if (!policyData.POLICY_ID) {
      const timestamp = Date.now();
      policyData.POLICY_ID = `TPOL-${timestamp}-${Math.random().toString(36).substr(2, 5)}`;
    }
    
    const transaction = await sequelize.transaction();
    
    try {
      // Create main policy
      const policy = await TransactionPolicy.create(policyData, { transaction });
      
      // Create ranges
      if (policyData.RANGES && Array.isArray(policyData.RANGES)) {
        for (const rangeData of policyData.RANGES) {
          const range = await TransactionPolicyRange.create({
            transaction_policy_id: policy.id,
            MIN_AMOUNT: rangeData.MIN_AMOUNT || 0,
            MAX_AMOUNT: rangeData.MAX_AMOUNT,
            requiresApproval: rangeData.requiresApproval || false
          }, { transaction });
          
          // Create authorized roles for this range
          if (rangeData.AUTHORIZED_ROLES && Array.isArray(rangeData.AUTHORIZED_ROLES)) {
            for (const roleName of rangeData.AUTHORIZED_ROLES) {
              await TransactionPolicyRole.create({
                transaction_policy_range_id: range.id,
                ROLE_NM: roleName
              }, { transaction });
            }
          }
        }
      }
      
      await transaction.commit();
      
      // Return policy with ranges and roles
      return await TransactionPolicy.findByPk(policy.id, {
        include: [
          {
            model: TransactionPolicyRange,
            as: 'ranges',
            include: [
              {
                model: TransactionPolicyRole,
                as: 'authorized_roles'
              }
            ]
          }
        ]
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error creating transaction policy:', error.message);
    throw error;
  }
};

// Get policy by ID
TransactionPolicy.getPolicyById = async (policyId) => {
  try {
    const policy = await TransactionPolicy.findOne({
      where: {
        [Op.or]: [
          { id: policyId },
          { POLICY_ID: policyId }
        ]
      },
      include: [
        {
          model: TransactionPolicyRange,
          as: 'ranges',
          include: [
            {
              model: TransactionPolicyRole,
              as: 'authorized_roles'
            }
          ]
        }
      ]
    });
    
    return policy;
  } catch (error) {
    console.error('Error getting transaction policy by ID:', error.message);
    throw error;
  }
};

// Get policies by type and role - UPDATED with better BU_ID handling
TransactionPolicy.getPoliciesByTypeAndRole = async (policyType, roleName, buId = null, branchCode = null) => {
  try {
    const whereClause = {
      policy_type: policyType,
      role_name: roleName.toUpperCase(),
      status: 'ACTIVE'
    };
    
    // Build OR conditions for BU_ID and branch_code
    const orConditions = [];
    
    // Handle BU_ID - if provided, match specific BU or 'ALL'
    if (buId && buId !== null && buId !== 'null' && buId !== '') {
      orConditions.push(
        { bu_id: 'ALL' },
        { bu_id: buId.toString() }
      );
    }
    
    // Handle branch_code - if provided, match specific branch or 'ALL'
    if (branchCode && branchCode !== null && branchCode !== 'null' && branchCode !== '') {
      orConditions.push(
        { branch_code: 'ALL' },
        { branch_code: branchCode.toString() }
      );
    }
    
    // If we have OR conditions, add them to the where clause
    if (orConditions.length > 0) {
      whereClause[Op.or] = orConditions;
    }
    
    console.log('📋 Policy where clause:', JSON.stringify(whereClause, null, 2));
    
    const policies = await TransactionPolicy.findAll({
      where: whereClause,
      include: [
        {
          model: TransactionPolicyRange,
          as: 'ranges',
          include: [
            {
              model: TransactionPolicyRole,
              as: 'authorized_roles'
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });
    
    console.log(`📋 Found ${policies.length} policies matching criteria`);
    return policies;
  } catch (error) {
    console.error('Error getting policies by type and role:', error.message);
    throw error;
  }
};

// Check if transaction requires approval - UPDATED with logging
TransactionPolicy.checkRequiresApproval = async (policyType, roleName, amount, buId = null, branchCode = null) => {
  try {
    console.log('🔍 Checking transaction policy for:', {
      policyType,
      roleName,
      amount,
      buId,
      branchCode
    });
    
    const policies = await TransactionPolicy.getPoliciesByTypeAndRole(policyType, roleName, buId, branchCode);
    
    console.log(`📋 Found ${policies?.length || 0} active policies for ${roleName} - ${policyType}`);
    
    if (!policies || policies.length === 0) {
      console.log('⚠️ No active policies found for', roleName, '-', policyType);
      return {
        requiresApproval: false,
        policy: null,
        range: null,
        authorizedRoles: [],
        hasPolicy: false,
        hasRange: false
      };
    }
    
    // Find matching range across all policies
    for (const policy of policies) {
      console.log(`📋 Checking policy ${policy.POLICY_ID} with ${policy.ranges?.length || 0} ranges`);
      
      if (!policy.ranges || policy.ranges.length === 0) {
        console.log(`⚠️ Policy ${policy.POLICY_ID} has no ranges`);
        continue;
      }
      
      for (const range of policy.ranges) {
        const minAmount = parseFloat(range.MIN_AMOUNT);
        const maxAmount = parseFloat(range.MAX_AMOUNT);
        const txnAmount = parseFloat(amount);
        
        console.log(`📊 Range: ${minAmount} - ${maxAmount}, Amount: ${txnAmount}`);
        console.log(`📊 Condition: ${txnAmount} >= ${minAmount} && ${txnAmount} <= ${maxAmount} = ${txnAmount >= minAmount && txnAmount <= maxAmount}`);
        
        if (txnAmount >= minAmount && txnAmount <= maxAmount) {
          const authorizedRoles = range.authorized_roles.map(role => role.ROLE_NM);
          const requiresApproval = range.requiresApproval === true || range.requiresApproval === 1;
          
          console.log(`✅ Found matching range! Requires approval: ${requiresApproval}`);
          console.log(`📋 Authorized roles: ${authorizedRoles.join(', ')}`);
          
          return {
            requiresApproval: requiresApproval,
            policy: policy,
            range: range,
            authorizedRoles: authorizedRoles,
            hasPolicy: true,
            hasRange: true
          };
        }
      }
    }
    
    // No matching range found
    console.log(`⚠️ No matching range found for amount: ${amount}`);
    return {
      requiresApproval: false,
      policy: null,
      range: null,
      authorizedRoles: [],
      hasPolicy: true,
      hasRange: false
    };
  } catch (error) {
    console.error('Error checking approval requirement:', error.message);
    throw error;
  }
};

// Get all policies with filters
TransactionPolicy.getAllPolicies = async (filters = {}) => {
  try {
    const whereClause = {};
    
    if (filters.policy_type) {
      whereClause.policy_type = filters.policy_type;
    }
    
    if (filters.role_name) {
      whereClause.role_name = filters.role_name.toUpperCase();
    }
    
    if (filters.status) {
      whereClause.status = filters.status;
    }
    
    if (filters.bu_id) {
      whereClause.bu_id = filters.bu_id;
    }
    
    if (filters.branch_code) {
      whereClause.branch_code = filters.branch_code;
    }
    
    const policies = await TransactionPolicy.findAll({
      where: whereClause,
      include: [
        {
          model: TransactionPolicyRange,
          as: 'ranges',
          include: [
            {
              model: TransactionPolicyRole,
              as: 'authorized_roles'
            }
          ]
        }
      ],
      order: [['created_at', 'DESC']]
    });
    
    return policies;
  } catch (error) {
    console.error('Error getting all transaction policies:', error.message);
    throw error;
  }
};

// Update policy
TransactionPolicy.updatePolicy = async (policyId, updateData) => {
  try {
    const policy = await TransactionPolicy.getPolicyById(policyId);
    
    if (!policy) {
      throw new Error('Transaction policy not found');
    }
    
    const transaction = await sequelize.transaction();
    
    try {
      // Update main policy fields
      await policy.update(updateData, { transaction });
      
      // If ranges are being updated
      if (updateData.RANGES && Array.isArray(updateData.RANGES)) {
        // Delete existing ranges and roles
        await TransactionPolicyRange.destroy({
          where: { transaction_policy_id: policy.id },
          transaction
        });
        
        // Create new ranges and roles
        for (const rangeData of updateData.RANGES) {
          const range = await TransactionPolicyRange.create({
            transaction_policy_id: policy.id,
            MIN_AMOUNT: rangeData.MIN_AMOUNT || 0,
            MAX_AMOUNT: rangeData.MAX_AMOUNT,
            requiresApproval: rangeData.requiresApproval || false
          }, { transaction });
          
          // Create authorized roles for this range
          if (rangeData.AUTHORIZED_ROLES && Array.isArray(rangeData.AUTHORIZED_ROLES)) {
            for (const roleName of rangeData.AUTHORIZED_ROLES) {
              await TransactionPolicyRole.create({
                transaction_policy_range_id: range.id,
                ROLE_NM: roleName
              }, { transaction });
            }
          }
        }
      }
      
      await transaction.commit();
      
      // Return updated policy
      return await TransactionPolicy.getPolicyById(policy.id);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error('Error updating transaction policy:', error.message);
    throw error;
  }
};

// Deactivate policy
TransactionPolicy.deactivatePolicy = async (policyId) => {
  try {
    const policy = await TransactionPolicy.getPolicyById(policyId);
    
    if (!policy) {
      throw new Error('Transaction policy not found');
    }
    
    await policy.update({
      status: 'INACTIVE',
      effective_to: new Date()
    });
    
    return policy;
  } catch (error) {
    console.error('Error deactivating transaction policy:', error.message);
    throw error;
  }
};

// Get policy statistics
TransactionPolicy.getPolicyStats = async () => {
  try {
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_policies,
        SUM(CASE WHEN policy_type = 'Deposit' THEN 1 ELSE 0 END) as deposit_policies,
        SUM(CASE WHEN policy_type = 'Withdrawal' THEN 1 ELSE 0 END) as withdrawal_policies,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as active_policies,
        SUM(CASE WHEN status = 'INACTIVE' THEN 1 ELSE 0 END) as inactive_policies,
        COUNT(DISTINCT role_name) as unique_roles_covered,
        COUNT(DISTINCT bu_id) as unique_business_units,
        MAX(created_at) as last_policy_created
      FROM transaction_policies
    `);
    
    return stats[0];
  } catch (error) {
    console.error('Error getting policy stats:', error.message);
    throw error;
  }
};

// Initialize tables
TransactionPolicy.initializeTables = async () => {
  try {
    // Main policies table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transaction_policies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        policy_id VARCHAR(50) UNIQUE NOT NULL,
        policy_type ENUM('Deposit', 'Withdrawal') NOT NULL,
        role_name VARCHAR(100) NOT NULL,
        bu_id VARCHAR(20),
        branch_code VARCHAR(50),
        status ENUM('ACTIVE', 'INACTIVE', 'DELETED') DEFAULT 'ACTIVE',
        effective_from DATE,
        effective_to DATE,
        description TEXT,
        created_by INT NOT NULL,
        updated_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_policy_id (policy_id),
        INDEX idx_policy_type_role (policy_type, role_name),
        INDEX idx_status (status),
        INDEX idx_bu_id (bu_id),
        INDEX idx_branch_code (branch_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Transaction policies table initialized');
    
    // Policy ranges table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transaction_policy_ranges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_policy_id INT NOT NULL,
        min_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        max_amount DECIMAL(15,2) NOT NULL,
        requires_approval BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_transaction_policy_id (transaction_policy_id),
        INDEX idx_amount_range (min_amount, max_amount),
        CONSTRAINT fk_policy_range_policy FOREIGN KEY (transaction_policy_id) REFERENCES transaction_policies(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Transaction policy ranges table initialized');
    
    // Policy roles table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transaction_policy_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_policy_range_id INT NOT NULL,
        role_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_policy_range_id (transaction_policy_range_id),
        INDEX idx_role_name (role_name),
        UNIQUE KEY unique_range_role (transaction_policy_range_id, role_name),
        CONSTRAINT fk_policy_role_range FOREIGN KEY (transaction_policy_range_id) REFERENCES transaction_policy_ranges(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Transaction policy roles table initialized');
    
    return true;
  } catch (error) {
    console.error('Error initializing transaction policy tables:', error.message);
    return false;
  }
};

// Sync tables
TransactionPolicy.syncTables = async () => {
  try {
    await TransactionPolicy.sync({ alter: true });
    await TransactionPolicyRange.sync({ alter: true });
    await TransactionPolicyRole.sync({ alter: true });
    console.log('✅ TransactionPolicy tables synced');
    return true;
  } catch (error) {
    console.error('Error syncing TransactionPolicy tables:', error.message);
    return false;
  }
};

// Ensure table columns exist
TransactionPolicy.ensureTableColumns = async () => {
  try {
    // Check and add updated_at to transaction_policy_roles if missing
    const [columns] = await sequelize.query(`SHOW COLUMNS FROM transaction_policy_roles`);
    const columnNames = columns.map(col => col.Field);
    
    if (!columnNames.includes('updated_at')) {
      console.log('📝 Adding updated_at column to transaction_policy_roles...');
      await sequelize.query(`
        ALTER TABLE transaction_policy_roles 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      `);
      console.log('✅ Added updated_at column to transaction_policy_roles');
    }
    
    // Check and add updated_at to transaction_policy_ranges if missing
    const [rangeColumns] = await sequelize.query(`SHOW COLUMNS FROM transaction_policy_ranges`);
    const rangeColumnNames = rangeColumns.map(col => col.Field);
    
    if (!rangeColumnNames.includes('updated_at')) {
      console.log('📝 Adding updated_at column to transaction_policy_ranges...');
      await sequelize.query(`
        ALTER TABLE transaction_policy_ranges 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      `);
      console.log('✅ Added updated_at column to transaction_policy_ranges');
    }
    
    return true;
  } catch (error) {
    console.error('Error ensuring table columns:', error.message);
    return false;
  }
};

export { TransactionPolicy, TransactionPolicyRange, TransactionPolicyRole };
export default TransactionPolicy;