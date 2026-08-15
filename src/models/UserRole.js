// models/UserRole.js - FULLY CORRECTED VERSION
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';

const UserRole = sequelize.define('UserRole', {
  // ✅ role_id field to match database schema
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    autoIncrement: true,
    primaryKey: true,
    field: 'role_id'
  },
  
  ROLE_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'ROLE_NM'
  },
  SYSUSER_ID: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'SYSUSER_ID'
  },
  Business_Unit: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'Business_Unit'
  },
  BU_ID: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: '000',
    field: 'BU_ID'
  },

  // Array of role IDs (from ROLE_MAPPING)
  USER_ROLE_IDS: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    field: 'USER_ROLE_IDS'
  },

  // Array of role names
  ROLE_NMS: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    field: 'ROLE_NMS'
  },

  EFF_FROM_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'EFF_FROM_DT'
  },
  EFF_TO_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'EFF_TO_DT'
  },

  DEF_ROLE_FG: {
    type: DataTypes.ENUM('Y', 'N'),
    allowNull: false,
    defaultValue: 'N',
    field: 'DEF_ROLE_FG'
  },
  SUPERVISOR_FG: {
    type: DataTypes.ENUM('Y', 'N'),
    allowNull: false,
    defaultValue: 'N',
    field: 'SUPERVISOR_FG'
  },
  MULTI_CRNCY_FG: {
    type: DataTypes.ENUM('Y', 'N'),
    allowNull: false,
    defaultValue: 'N',
    field: 'MULTI_CRNCY_FG'
  },

  WF_ITEM_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'WF_ITEM_ACCESS_LEVEL'
  },

  REC_ST: {
    type: DataTypes.ENUM('Y', 'N', 'A'),
    allowNull: false,
    defaultValue: 'A',
    field: 'REC_ST'
  },

  VERSION_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'VERSION_NO'
  },

  ROW_TS: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'ROW_TS'
  },

  // Actual user_id database field
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'user_id',
    references: {
      model: 'users',
      key: 'id'
    }
  },

  // Virtual field that maps to user_id
  USER_ID: {
    type: DataTypes.VIRTUAL,
    get() {
      return this.user_id;
    },
    set(value) {
      this.setDataValue('user_id', value);
    }
  },

  CREATE_DT: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'CREATE_DT'
  },
  CREATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'SYSTEM',
    field: 'CREATED_BY'
  },

  // Access level arrays (stored as JSON)
  VAULT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'VAULT_ACCESS_LEVEL'
  },
  DRAWER_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'DRAWER_ACCESS_LEVEL'
  },
  TXN_ENQUIRY_ACCESS_LVL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'TXN_ENQUIRY_ACCESS_LVL'
  },
  CREDIT_APPL_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'CREDIT_APPL_ACCESS_LEVEL'
  },
  CUSTOMER_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'CUSTOMER_ACCESS_LEVEL'
  },
  ACCOUNT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'ACCOUNT_ACCESS_LEVEL'
  },
  REPORT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'REPORT_ACCESS_LEVEL'
  },
  CUST_POSTING_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'CUST_POSTING_ACCESS_LEVEL'
  },
  GL_POSTING_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'GL_POSTING_ACCESS_LEVEL'
  },
  FIXED_ASSET_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'FIXED_ASSET_ACCESS_LEVEL'
  },
  LOAN_FEE_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'LOAN_FEE_ACCESS_LEVEL'
  },
  LOAN_OPERATIONS_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'LOAN_OPERATIONS_ACCESS_LEVEL'
  },
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'PERMISSION_MANAGEMENT_ACCESS_LEVEL'
  },
  SYSTEM_ADMIN_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'SYSTEM_ADMIN_ACCESS_LEVEL'
  },
  DASHBOARD_ACCESS_LEVEL: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: ['BU'],
    field: 'DASHBOARD_ACCESS_LEVEL'
  },
}, {
  tableName: 'user_roles',
  timestamps: false,
  underscored: true,
  indexes: [
    { 
      unique: true, 
      fields: ['BU_ID', 'user_id'], 
      name: 'user_roles_bu_user_unique' 
    },
    { 
      fields: ['user_id'], 
      name: 'user_roles_user_id_idx' 
    },
    { 
      fields: ['BU_ID'], 
      name: 'user_roles_bu_id_idx' 
    },
    { 
      fields: ['ROLE_NM'], 
      name: 'user_roles_role_nm_idx' 
    },
    { 
      fields: ['SYSUSER_ID'], 
      name: 'user_roles_sysuser_id_idx' 
    },
    {
      fields: ['role_id'],
      name: 'user_roles_role_id_idx'
    }
  ],
  hooks: {
    beforeSync: async (options) => {
      try {
        console.log('🔄 Checking user_roles table schema before sync...');
        
        const [results] = await sequelize.query(`
          SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'user_roles' 
          AND TABLE_SCHEMA = DATABASE()
          AND COLUMN_NAME = 'user_id'
        `);
        
        if (results.length === 0) {
          console.log('⚠️ user_id column not found, it will be created by sync');
        } else {
          const columnInfo = results[0];
          console.log('📊 Current user_id column:', columnInfo);
          
          if (columnInfo.IS_NULLABLE === 'NO' && !columnInfo.COLUMN_DEFAULT) {
            console.log('🔧 Auto-fixing: Making user_id nullable');
            try {
              await sequelize.query(`
                ALTER TABLE user_roles MODIFY user_id INT NULL
              `);
              console.log('✅ Auto-fix applied: user_id is now nullable');
            } catch (fixError) {
              console.warn('⚠️ Could not auto-fix user_id column:', fixError.message);
            }
          }
        }
      } catch (error) {
        console.warn('⚠️ Schema check failed:', error.message);
      }
    }
  }
});

// ========================
// Instance Methods
// ========================

UserRole.prototype.getUserRoleNames = function() {
  const roleNames = this.ROLE_NMS?.length > 0
    ? this.ROLE_NMS
    : (this.USER_ROLE_IDS || []).map(id => ROLE_MAPPING[id]?.ROLE_NM || 'Unknown Role');

  return roleNames.map(name => `${name}, ${this.Business_Unit}`).join(' | ');
};

// ✅ FIXED: Changed BU_ROLE_ID to role_id
UserRole.prototype.getCombinedPermissions = async function() {
  try {
    const { default: Permissions } = await import('./Permissions.js');

    const permissionDocs = await Permissions.findAll({
      where: {
        role_id: { [Op.in]: this.USER_ROLE_IDS || [] }  // Changed from BU_ROLE_ID to role_id
      },
      raw: true,
    });

    const combined = {};

    permissionDocs.forEach(doc => {
      if (doc.permissions) {
        Object.keys(doc.permissions).forEach(category => {
          if (!combined[category]) combined[category] = [];
          combined[category] = [...new Set([...combined[category], ...doc.permissions[category]])];
        });
      }
    });

    return combined;
  } catch (error) {
    console.error('Error fetching combined permissions:', error.message);
    return {};
  }
};

UserRole.prototype.hasAnyRole = function(roleNames) {
  const userRoles = this.ROLE_NMS?.length > 0
    ? this.ROLE_NMS
    : (this.USER_ROLE_IDS || []).map(id => ROLE_MAPPING[id]?.ROLE_NM).filter(Boolean);

  return roleNames.some(name => userRoles.includes(name));
};

UserRole.prototype.hasAllRoles = function(roleNames) {
  const userRoles = this.ROLE_NMS?.length > 0
    ? this.ROLE_NMS
    : (this.USER_ROLE_IDS || []).map(id => ROLE_MAPPING[id]?.ROLE_NM).filter(Boolean);

  return roleNames.every(name => userRoles.includes(name));
};

UserRole.prototype.isUser = function(userId) {
  return this.SYSUSER_ID === userId || this.user_id === userId;
};

// ========================
// Class Methods
// ========================

UserRole.findByRole = function(roleName) {
  const matchingRoleIds = Object.keys(ROLE_MAPPING)
    .filter(key => ROLE_MAPPING[key]?.ROLE_NM === roleName)
    .map(Number);

  return this.findAll({
    where: {
      [Op.or]: [
        { ROLE_NMS: { [Op.contains]: [roleName] } },
        { USER_ROLE_IDS: { [Op.overlap]: matchingRoleIds } }
      ]
    }
  });
};

UserRole.findByUserId = function(userId) {
  return this.findAll({ 
    where: { 
      [Op.or]: [
        { user_id: userId },
        { SYSUSER_ID: userId }
      ]
    } 
  });
};

UserRole.findByBusinessUnitAndUserId = function(buId, userId) {
  return this.findOne({ 
    where: { 
      BU_ID: buId,
      [Op.or]: [
        { user_id: userId },
        { SYSUSER_ID: userId }
      ]
    } 
  });
};

UserRole.findBySysuserId = function(sysuserId) {
  return this.findAll({ where: { SYSUSER_ID: sysuserId } });
};

UserRole.bulkCreateUserRoles = async function(userRolesArray) {
  return this.bulkCreate(userRolesArray, {
    validate: true,
    ignoreDuplicates: true
  });
};

UserRole.updateUserRole = async function(userId, buId, updates) {
  const userRole = await this.findOne({
    where: {
      BU_ID: buId,
      [Op.or]: [
        { user_id: userId },
        { SYSUSER_ID: userId }
      ]
    }
  });

  if (!userRole) {
    throw new Error(`User role not found for user ${userId} in business unit ${buId}`);
  }

  return userRole.update(updates);
};

UserRole.deleteUserRole = async function(userId, buId) {
  const result = await this.destroy({
    where: {
      BU_ID: buId,
      [Op.or]: [
        { user_id: userId },
        { SYSUSER_ID: userId }
      ]
    }
  });

  return result > 0;
};

UserRole.findByBusinessUnit = function(buId) {
  return this.findAll({ 
    where: { BU_ID: buId },
    order: [['ROLE_NM', 'ASC']]
  });
};

UserRole.findActiveRolesByUser = function(userId) {
  const now = new Date();
  
  return this.findAll({
    where: {
      [Op.or]: [
        { user_id: userId },
        { SYSUSER_ID: userId }
      ],
      [Op.or]: [
        { EFF_TO_DT: null },
        { EFF_TO_DT: { [Op.gt]: now } }
      ],
      REC_ST: 'A'
    }
  });
};

UserRole.generateRoleId = async function() {
  const lastEntry = await this.findOne({
    order: [['role_id', 'DESC']],
    attributes: ['role_id']
  });

  let nextId = 1;
  if (lastEntry && lastEntry.role_id) {
    const parsed = parseInt(lastEntry.role_id, 10);
    if (!isNaN(parsed)) {
      nextId = parsed + 1;
    }
  }
  
  return nextId;
};

UserRole.syncModel = async function(options = {}) {
  try {
    await this.sync({ force: false, alter: false });
    
    const tableExists = await sequelize.queryInterface.showAllTables();
    
    if (tableExists.includes('user_roles')) {
      console.log('✅ user_roles table exists, checking indexes...');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error syncing UserRole model:', error.message);
    return false;
  }
};

UserRole.checkAndFixSchema = async function() {
  try {
    console.log('🔧 Manually checking and fixing user_roles schema...');
    
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'user_roles' 
      AND TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME = 'user_id'
    `);
    
    if (results.length === 0) {
      console.log('❌ user_id column does not exist in user_roles table');
      console.log('💡 Running sync to create missing column...');
      await this.sync({ alter: false });
      return { success: true, action: 'created_column' };
    }
    
    const columnInfo = results[0];
    console.log('📊 Current user_id column:', columnInfo);
    
    if (columnInfo.IS_NULLABLE === 'NO' && !columnInfo.COLUMN_DEFAULT) {
      console.log('🔧 Fixing: Making user_id nullable');
      try {
        await sequelize.query(`
          ALTER TABLE user_roles MODIFY user_id INT NULL
        `);
        console.log('✅ Fixed: user_id is now nullable');
        return { success: true, action: 'made_nullable' };
      } catch (fixError) {
        console.error('❌ Failed to fix user_id column:', fixError.message);
        return { success: false, error: fixError.message };
      }
    }
    
    console.log('✅ Schema is already correct');
    return { success: true, action: 'already_correct' };
  } catch (error) {
    console.error('❌ Error checking schema:', error.message);
    return { success: false, error: error.message };
  }
};

UserRole.createWithSchemaCheck = async function(data, options = {}) {
  try {
    return await this.create(data, options);
  } catch (error) {
    if (error.message.includes("Field 'user_id' doesn't have a default value") ||
        error.message.includes("Incorrect integer value")) {
      
      console.log('🔄 Create failed due to schema issue, attempting auto-fix...');
      const fixResult = await this.checkAndFixSchema();
      
      if (fixResult.success) {
        console.log('✅ Schema fixed, retrying create...');
        return await this.create(data, options);
      } else {
        throw new Error(`Create failed and schema fix failed: ${fixResult.error}`);
      }
    }
    throw error;
  }
};

export default UserRole;
