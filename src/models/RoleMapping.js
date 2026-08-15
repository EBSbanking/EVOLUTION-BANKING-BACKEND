// models/RoleMapping.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const RoleMapping = sequelize.define('RoleMapping', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    field: 'id'
  },
  ROLE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'role_id'
  },
  ROLE_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'role_name'
  },
  Business_Unit: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'business_unit'
  },
  USER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'user_id'
  },
  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'created_by'
  },
  EFF_FROM_DT: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'effective_from_date'
  },
  DEF_ROLE_FG: {
    type: DataTypes.ENUM('Y', 'N'),
    allowNull: false,
    defaultValue: 'N',
    field: 'default_role_flag'
  },
  SUPERVISOR_FG: {
    type: DataTypes.ENUM('Y', 'N'),
    allowNull: false,
    defaultValue: 'N',
    field: 'supervisor_flag'
  },
  WF_ITEM_ACCESS_LEVEL: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'workflow_access_level'
  },
  REC_ST: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'DELETED'),
    allowNull: false,
    defaultValue: 'ACTIVE',
    field: 'record_status'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    onUpdate: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'role_mappings',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      unique: false,
      fields: ['role_id']
    },
    {
      unique: false,
      fields: ['user_id']
    },
    {
      unique: false,
      fields: ['business_unit']
    },
    {
      unique: false,
      fields: ['record_status']
    },
    {
      unique: false,
      fields: ['effective_from_date']
    }
  ]
});

// Helper methods for RoleMapping
RoleMapping.createRoleMapping = async (roleData) => {
  try {
    const roleMapping = await RoleMapping.create(roleData);
    return roleMapping;
  } catch (error) {
    console.error('Error creating role mapping:', error.message);
    throw error;
  }
};

RoleMapping.getUserRoles = async (userId, businessUnit = null) => {
  try {
    const whereClause = {
      user_id: userId,
      record_status: 'ACTIVE'
    };
    
    if (businessUnit) {
      whereClause.business_unit = businessUnit;
    }
    
    const roles = await RoleMapping.findAll({
      where: whereClause,
      order: [['effective_from_date', 'DESC']]
    });
    
    return roles;
  } catch (error) {
    console.error('Error getting user roles:', error.message);
    throw error;
  }
};

RoleMapping.getDefaultRole = async (userId, businessUnit) => {
  try {
    const role = await RoleMapping.findOne({
      where: {
        user_id: userId,
        business_unit: businessUnit,
        default_role_flag: 'Y',
        record_status: 'ACTIVE'
      },
      order: [['effective_from_date', 'DESC']]
    });
    
    return role;
  } catch (error) {
    console.error('Error getting default role:', error.message);
    throw error;
  }
};

RoleMapping.updateRoleStatus = async (roleMappingId, status) => {
  try {
    const role = await RoleMapping.findByPk(roleMappingId);
    
    if (!role) {
      throw new Error('Role mapping not found');
    }
    
    role.record_status = status;
    await role.save();
    
    return role;
  } catch (error) {
    console.error('Error updating role status:', error.message);
    throw error;
  }
};

RoleMapping.getSupervisors = async (businessUnit) => {
  try {
    const supervisors = await RoleMapping.findAll({
      where: {
        business_unit: businessUnit,
        supervisor_flag: 'Y',
        record_status: 'ACTIVE'
      },
      order: [['role_name', 'ASC']]
    });
    
    return supervisors;
  } catch (error) {
    console.error('Error getting supervisors:', error.message);
    throw error;
  }
};

RoleMapping.getRolesByBusinessUnit = async (businessUnit) => {
  try {
    const roles = await RoleMapping.findAll({
      where: {
        business_unit: businessUnit,
        record_status: 'ACTIVE'
      },
      attributes: ['role_id', 'role_name'],
      group: ['role_id', 'role_name'],
      order: [['role_name', 'ASC']]
    });
    
    return roles;
  } catch (error) {
    console.error('Error getting roles by business unit:', error.message);
    throw error;
  }
};

// Initialize table if it doesn't exist
RoleMapping.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS role_mappings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_id INT NOT NULL,
        role_name VARCHAR(100) NOT NULL,
        business_unit VARCHAR(100) NOT NULL,
        user_id VARCHAR(50) NOT NULL,
        created_by VARCHAR(50) NOT NULL,
        effective_from_date DATE NOT NULL,
        default_role_flag ENUM('Y', 'N') DEFAULT 'N',
        supervisor_flag ENUM('Y', 'N') DEFAULT 'N',
        workflow_access_level VARCHAR(50) NOT NULL,
        record_status ENUM('ACTIVE', 'INACTIVE', 'DELETED') DEFAULT 'ACTIVE',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_role_id (role_id),
        INDEX idx_user_id (user_id),
        INDEX idx_business_unit (business_unit),
        INDEX idx_record_status (record_status),
        INDEX idx_effective_date (effective_from_date),
        UNIQUE KEY unique_user_role_bu (user_id, role_id, business_unit, effective_from_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Role mappings table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing role mappings table:', error.message);
    return false;
  }
};

// Sync the model (creates table if it doesn't exist)
RoleMapping.syncTable = async () => {
  try {
    await RoleMapping.sync({ alter: false });
    console.log('✅ RoleMapping table synced');
    return true;
  } catch (error) {
    console.error('Error syncing RoleMapping table:', error.message);
    return false;
  }
};

export default RoleMapping;
