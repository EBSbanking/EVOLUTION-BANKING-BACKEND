// src/models/BusinessRole.js - COMPLETE FIXED VERSION with sync: false
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

// Import ROLE_MAPPING but defer its usage
let ROLE_MAPPING = {};
let ROLE_MAPPING_LOADED = false;

// Function to lazy load role mapping
const getRoleMapping = () => {
  if (!ROLE_MAPPING_LOADED) {
    try {
      // Import dynamically to avoid circular dependency
      const mapping = require('../constants/roleMapping.js');
      ROLE_MAPPING = mapping.ROLE_MAPPING || {};
      ROLE_MAPPING_LOADED = true;
    } catch (error) {
      console.warn('⚠️ Could not load ROLE_MAPPING, using empty mapping:', error.message);
      ROLE_MAPPING = {};
      ROLE_MAPPING_LOADED = true;
    }
  }
  return ROLE_MAPPING;
};

// Helper functions that lazily access ROLE_MAPPING
const getAllRoleIds = () => {
  const mapping = getRoleMapping();
  return Object.keys(mapping).map(id => parseInt(id));
};

const getAllRoleNames = () => {
  const mapping = getRoleMapping();
  return Object.values(mapping).map(role => role.ROLE_NM);
};

const getRoleById = (id) => {
  const mapping = getRoleMapping();
  return mapping[id];
};

const isValidRoleId = (id) => {
  const mapping = getRoleMapping();
  return mapping.hasOwnProperty(id);
};

const isValidRoleName = (name) => {
  if (!name) return false;
  const mapping = getRoleMapping();
  const upperName = name.toUpperCase();
  return Object.values(mapping).some(role => role.ROLE_NM === upperName);
};

class BusinessRole extends Model {}

BusinessRole.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    ROLE_NM: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Role name is required',
        },
        customValidation(value) {
          const roleNames = getAllRoleNames();
          if (roleNames.length > 0 && !roleNames.includes(value.toUpperCase())) {
            throw new Error(`Invalid role name. Valid names are: ${roleNames.join(', ')}`);
          }
        },
      },
    },
    REC_ST: {
      type: DataTypes.ENUM('Active', 'Deactivated'),
      allowNull: false,
      defaultValue: 'Active',
      validate: {
        notEmpty: {
          msg: 'Record status is required',
        },
        isIn: {
          args: [['Active', 'Deactivated']],
          msg: 'Status must be either Active or Deactivated',
        },
      },
    },
    VERSION_NO: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: {
          args: [1],
          msg: 'Version number cannot be less than 1',
        },
      },
    },
    USER_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'User ID is required',
        },
      },
    },
    CREATE_DT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    SYS_CREATE_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    CREATED_BY: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Creator user is required',
        },
      },
    },
    CREATED_BY_ROLE: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Unknown',
    },
    ROW_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ROLE_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Role ID is required',
        },
        customValidation(value) {
          const roleIds = getAllRoleIds();
          if (roleIds.length > 0 && !roleIds.includes(value)) {
            throw new Error(`Invalid role ID. Valid IDs are: ${roleIds.join(', ')}`);
          }
        },
      },
    },
    BUSINESS_UNIT: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Business unit is required',
        },
      },
    },
    BU_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Business unit ID is required',
        },
        min: {
          args: [1],
          msg: 'Business unit ID must be positive',
        },
      },
    },
    SUPERVISOR_FG: {
      type: DataTypes.ENUM('Y', 'N'),
      allowNull: false,
      defaultValue: 'N',
      set(value) {
        let flag = 'N';
        if (typeof value === 'boolean') {
          flag = value ? 'Y' : 'N';
        } else if (typeof value === 'number') {
          flag = value > 0 ? 'Y' : 'N';
        } else if (typeof value === 'string') {
          flag = value.toString().toUpperCase() === 'Y' ? 'Y' : 'N';
        }
        this.setDataValue('SUPERVISOR_FG', flag);
      },
      get() {
        return this.getDataValue('SUPERVISOR_FG');
      },
    },
    ALLOW_TXN_POSTING_FG: {
      type: DataTypes.ENUM('Y', 'N'),
      allowNull: false,
      defaultValue: 'N',
      set(value) {
        let flag = 'N';
        if (typeof value === 'boolean') {
          flag = value ? 'Y' : 'N';
        } else if (typeof value === 'number') {
          flag = value > 0 ? 'Y' : 'N';
        } else if (typeof value === 'string') {
          flag = value.toString().toUpperCase() === 'Y' ? 'Y' : 'N';
        }
        this.setDataValue('ALLOW_TXN_POSTING_FG', flag);
      },
      get() {
        return this.getDataValue('ALLOW_TXN_POSTING_FG');
      },
    },
    LAST_UPDATED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    LAST_UPDATED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    ADMIN_OVERRIDE: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    WF_ITEM_ACCESS_LEVEL: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: '',
      validate: {
        len: {
          args: [0, 50],
          msg: 'Access level cannot exceed 50 characters',
        },
      },
    },
    
    // Virtual fields
    role_details: {
      type: DataTypes.VIRTUAL,
      get() {
        return getRoleById(this.ROLE_ID);
      },
    },
    is_active: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.REC_ST === 'Active';
      },
    },
    is_supervisor: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.SUPERVISOR_FG === 'Y';
      },
    },
    can_post_transactions: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.ALLOW_TXN_POSTING_FG === 'Y';
      },
    },
  },
  {
    sequelize,
    modelName: 'BusinessRole',
    tableName: 'business_roles',
    timestamps: true,
    underscored: false,
    sync: false, // ✅ ADDED - Prevents auto-sync errors (fixes BU_ROLE_ID error)
    hooks: {
      beforeValidate: (businessRole) => {
        // Uppercase ROLE_NM
        if (businessRole.ROLE_NM) {
          businessRole.ROLE_NM = businessRole.ROLE_NM.toUpperCase().trim();
        }
        
        // Uppercase USER_ID
        if (businessRole.USER_ID) {
          businessRole.USER_ID = businessRole.USER_ID.toUpperCase().trim();
        }
        
        // Trim string fields
        ['CREATED_BY', 'CREATED_BY_ROLE', 'BUSINESS_UNIT', 'LAST_UPDATED_BY'].forEach(field => {
          if (businessRole[field]) {
            businessRole[field] = businessRole[field].toString().trim();
          }
        });
        
        // Set default transaction posting based on role
        if (businessRole.isNewRecord && !businessRole.ALLOW_TXN_POSTING_FG) {
          const roleConfig = getRoleById(businessRole.ROLE_ID);
          if (roleConfig?.defaultTransactionPosting) {
            businessRole.ALLOW_TXN_POSTING_FG = 'Y';
          }
        }
        
        // Validate ROLE_ID and ROLE_NM consistency
        if (businessRole.ROLE_ID && businessRole.ROLE_NM) {
          const roleConfig = getRoleById(businessRole.ROLE_ID);
          if (roleConfig && businessRole.ROLE_NM.toUpperCase() !== roleConfig.ROLE_NM.toUpperCase()) {
            throw new Error(
              `Role mismatch: ROLE_ID ${businessRole.ROLE_ID} expects ROLE_NM "${roleConfig.ROLE_NM}", got "${businessRole.ROLE_NM}"`
            );
          }
        }
      },
      beforeCreate: (businessRole) => {
        // Set immutable fields
        businessRole.CREATE_DT = new Date();
        businessRole.SYS_CREATE_TS = new Date();
        businessRole.ROW_TS = new Date();
        
        // Default CREATED_BY_ROLE if not set
        if (!businessRole.CREATED_BY_ROLE || businessRole.CREATED_BY_ROLE === 'Unknown') {
          businessRole.CREATED_BY_ROLE = businessRole.ROLE_NM || 'Unknown';
        }
      },
      beforeUpdate: (businessRole) => {
        // Update timestamps
        businessRole.ROW_TS = new Date();
        businessRole.LAST_UPDATED_DT = new Date();
      },
      beforeSave: (businessRole) => {
        // Force version increment on update
        if (!businessRole.isNewRecord && businessRole.changed()) {
          businessRole.VERSION_NO += 1;
        }
      },
    },
   
  }
);

// Remove association code since Branch model doesn't exist
// BusinessRole.associate = (models) => {
//   // No associations for now
// };

// === INSTANCE METHODS ===
BusinessRole.prototype.getRoleDetails = function () {
  return getRoleById(this.ROLE_ID);
};

BusinessRole.prototype.isActive = function () {
  return this.REC_ST === 'Active';
};

BusinessRole.prototype.isSupervisor = function () {
  return this.SUPERVISOR_FG === 'Y';
};

BusinessRole.prototype.canPostTransactions = function () {
  return this.ALLOW_TXN_POSTING_FG === 'Y';
};

BusinessRole.prototype.getBasicInfo = function () {
  return {
    id: this.id,
    ROLE_NM: this.ROLE_NM,
    ROLE_ID: this.ROLE_ID,
    USER_ID: this.USER_ID,
    BUSINESS_UNIT: this.BUSINESS_UNIT,
    BU_ID: this.BU_ID,
    REC_ST: this.REC_ST,
    SUPERVISOR_FG: this.SUPERVISOR_FG,
    ALLOW_TXN_POSTING_FG: this.ALLOW_TXN_POSTING_FG,
    role_details: this.role_details,
  };
};

// === STATIC METHODS ===
BusinessRole.findByUserId = async function (userId, options = {}) {
  const { includeInactive = false } = options;
  
  const whereClause = { USER_ID: userId.toUpperCase() };
  if (!includeInactive) {
    whereClause.REC_ST = 'Active';
  }
  
  return await this.findAll({
    where: whereClause,
    order: [['ROLE_ID', 'ASC']],
  });
};

BusinessRole.getUserRolesSummary = async function (userId) {
  const roles = await this.findAll({
    where: {
      USER_ID: userId.toUpperCase(),
      REC_ST: 'Active',
    },
    attributes: ['ROLE_ID', 'ROLE_NM', 'BUSINESS_UNIT', 'BU_ID', 'SUPERVISOR_FG', 'ALLOW_TXN_POSTING_FG'],
    raw: true,
  });
  
  return roles.map(role => ({
    ...role,
    role_details: getRoleById(role.ROLE_ID),
    is_supervisor: role.SUPERVISOR_FG === 'Y',
    can_post_transactions: role.ALLOW_TXN_POSTING_FG === 'Y',
  }));
};

BusinessRole.getBusinessUnitSummary = async function (businessUnit, buId = null) {
  const whereClause = { BUSINESS_UNIT: businessUnit, REC_ST: 'Active' };
  if (buId) {
    whereClause.BU_ID = buId;
  }
  
  const roles = await this.findAll({
    where: whereClause,
    attributes: [
      'ROLE_ID',
      'ROLE_NM',
      [sequelize.fn('COUNT', sequelize.col('USER_ID')), 'user_count'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN SUPERVISOR_FG = 'Y' THEN 1 ELSE 0 END")), 'supervisor_count'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN ALLOW_TXN_POSTING_FG = 'Y' THEN 1 ELSE 0 END")), 'txn_poster_count'],
    ],
    group: ['ROLE_ID', 'ROLE_NM'],
    raw: true,
  });
  
  return roles.map(role => ({
    ROLE_ID: role.ROLE_ID,
    ROLE_NM: role.ROLE_NM,
    user_count: parseInt(role.user_count) || 0,
    supervisor_count: parseInt(role.supervisor_count) || 0,
    txn_poster_count: parseInt(role.txn_poster_count) || 0,
    role_details: getRoleById(role.ROLE_ID),
  }));
};

BusinessRole.validateRoleData = function (roleData) {
  const errors = [];
  
  // Required fields
  if (!roleData.ROLE_NM || roleData.ROLE_NM.trim().length === 0) {
    errors.push('Role name (ROLE_NM) is required');
  }
  
  if (!roleData.ROLE_ID || !isValidRoleId(roleData.ROLE_ID)) {
    errors.push('Valid role ID (ROLE_ID) is required');
  }
  
  if (!roleData.USER_ID || roleData.USER_ID.trim().length === 0) {
    errors.push('User ID (USER_ID) is required');
  }
  
  if (!roleData.BUSINESS_UNIT || roleData.BUSINESS_UNIT.trim().length === 0) {
    errors.push('Business unit (BUSINESS_UNIT) is required');
  }
  
  if (!roleData.BU_ID || roleData.BU_ID < 1) {
    errors.push('Valid business unit ID (BU_ID) is required');
  }
  
  if (!roleData.CREATED_BY || roleData.CREATED_BY.trim().length === 0) {
    errors.push('Created by (CREATED_BY) is required');
  }
  
  // Role consistency
  if (roleData.ROLE_ID && roleData.ROLE_NM) {
    const roleConfig = getRoleById(roleData.ROLE_ID);
    if (roleConfig && roleData.ROLE_NM.toUpperCase() !== roleConfig.ROLE_NM.toUpperCase()) {
      errors.push(`ROLE_NM "${roleData.ROLE_NM}" doesn't match ROLE_ID ${roleData.ROLE_ID}. Expected: "${roleConfig.ROLE_NM}"`);
    }
  }
  
  // Status validation
  if (roleData.REC_ST && !['Active', 'Deactivated'].includes(roleData.REC_ST)) {
    errors.push('REC_ST must be either "Active" or "Deactivated"');
  }
  
  return errors;
};

// === QUERY SCOPES ===
BusinessRole.addScope('active', {
  where: { REC_ST: 'Active' },
});

BusinessRole.addScope('supervisors', {
  where: { SUPERVISOR_FG: 'Y' },
});

BusinessRole.addScope('transactionPosters', {
  where: { ALLOW_TXN_POSTING_FG: 'Y' },
});

BusinessRole.addScope('byBusinessUnit', (businessUnit) => ({
  where: { BUSINESS_UNIT: businessUnit },
}));

BusinessRole.addScope('byRole', (roleId) => ({
  where: { ROLE_ID: roleId },
}));

export default BusinessRole;