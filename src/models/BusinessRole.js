// =============================================
// src/models/BusinessRole.js - FULL UPDATED VERSION
// =============================================
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

// ========== LAZY LOAD ROLE MAPPING (avoid circular deps) ==========
let ROLE_MAPPING = {};
let ROLE_MAPPING_LOADED = false;

const getRoleMapping = () => {
  if (!ROLE_MAPPING_LOADED) {
    try {
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

// ========== HELPER FUNCTIONS ==========
const getAllRoleIds = () => Object.keys(getRoleMapping()).map(id => parseInt(id));
const getAllRoleNames = () => Object.values(getRoleMapping()).map(role => role.ROLE_NM);
const getRoleById = (id) => getRoleMapping()[id];
const isValidRoleId = (id) => getRoleMapping().hasOwnProperty(id);
const isValidRoleName = (name) => {
  if (!name) return false;
  const upper = name.toUpperCase();
  return Object.values(getRoleMapping()).some(role => role.ROLE_NM === upper);
};

// ========== MODEL DEFINITION ==========
class BusinessRole extends Model {}

BusinessRole.init(
  {
    // Primary Key
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    // Role Name
    ROLE_NM: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Role name is required' },
        customValidation(value) {
          const names = getAllRoleNames();
          if (names.length > 0 && !names.includes(value.toUpperCase())) {
            throw new Error(`Invalid role name. Valid names: ${names.join(', ')}`);
          }
        },
      },
    },
    // Role ID
    ROLE_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Role ID is required' },
        customValidation(value) {
          const ids = getAllRoleIds();
          if (ids.length > 0 && !ids.includes(value)) {
            throw new Error(`Invalid role ID. Valid IDs: ${ids.join(', ')}`);
          }
        },
      },
    },
    // User ID
    USER_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: { notEmpty: { msg: 'User ID is required' } },
    },
    // Business Unit Name
    BUSINESS_UNIT: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: { notEmpty: { msg: 'Business unit is required' } },
    },
    // Business Unit ID
    BU_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notEmpty: { msg: 'Business unit ID is required' },
        min: { args: [1], msg: 'Business unit ID must be positive' },
      },
    },
    // Record Status
    REC_ST: {
      type: DataTypes.ENUM('Active', 'Deactivated'),
      allowNull: false,
      defaultValue: 'Active',
      validate: {
        isIn: { args: [['Active', 'Deactivated']], msg: 'Status must be Active or Deactivated' },
      },
    },
    // Version Number
    VERSION_NO: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: { args: [1], msg: 'Version cannot be less than 1' } },
    },
    // Supervisor Flag
    SUPERVISOR_FG: {
      type: DataTypes.ENUM('Y', 'N'),
      allowNull: false,
      defaultValue: 'N',
      set(value) {
        let flag = 'N';
        if (typeof value === 'boolean') flag = value ? 'Y' : 'N';
        else if (typeof value === 'number') flag = value > 0 ? 'Y' : 'N';
        else if (typeof value === 'string') flag = value.toUpperCase() === 'Y' ? 'Y' : 'N';
        this.setDataValue('SUPERVISOR_FG', flag);
      },
    },
    // Allow Transaction Posting Flag
    ALLOW_TXN_POSTING_FG: {
      type: DataTypes.ENUM('Y', 'N'),
      allowNull: false,
      defaultValue: 'N',
      set(value) {
        let flag = 'N';
        if (typeof value === 'boolean') flag = value ? 'Y' : 'N';
        else if (typeof value === 'number') flag = value > 0 ? 'Y' : 'N';
        else if (typeof value === 'string') flag = value.toUpperCase() === 'Y' ? 'Y' : 'N';
        this.setDataValue('ALLOW_TXN_POSTING_FG', flag);
      },
    },
    // ✅ Exchange Rate Override Flag – FIXED (was missing in DB)
    ALLOW_EXCH_RATE_OVR_FG: {
      type: DataTypes.ENUM('Y', 'N'),
      allowNull: false,
      defaultValue: 'N',
      set(value) {
        let flag = 'N';
        if (typeof value === 'boolean') flag = value ? 'Y' : 'N';
        else if (typeof value === 'number') flag = value > 0 ? 'Y' : 'N';
        else if (typeof value === 'string') flag = value.toUpperCase() === 'Y' ? 'Y' : 'N';
        this.setDataValue('ALLOW_EXCH_RATE_OVR_FG', flag);
      },
    },
    // Default Role Flag
    DEF_ROLE_FG: {
      type: DataTypes.ENUM('Y', 'N'),
      allowNull: false,
      defaultValue: 'N',
      set(value) {
        let flag = 'N';
        if (typeof value === 'boolean') flag = value ? 'Y' : 'N';
        else if (typeof value === 'number') flag = value > 0 ? 'Y' : 'N';
        else if (typeof value === 'string') flag = value.toUpperCase() === 'Y' ? 'Y' : 'N';
        this.setDataValue('DEF_ROLE_FG', flag);
      },
    },
    // Workflow Item Access Level
    WF_ITEM_ACCESS_LEVEL: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: '',
      validate: { len: { args: [0, 50], msg: 'Access level max 50 chars' } },
    },
    // ===== AUDIT FIELDS =====
    CREATED_BY: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: { notEmpty: { msg: 'Creator is required' } },
    },
    CREATED_BY_ROLE: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'Unknown',
    },
    LAST_UPDATED_BY: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    LAST_UPDATED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
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
    ROW_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    ADMIN_OVERRIDE: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    // ===== VIRTUAL FIELDS =====
    role_details: {
      type: DataTypes.VIRTUAL,
      get() { return getRoleById(this.ROLE_ID); },
    },
    is_active: {
      type: DataTypes.VIRTUAL,
      get() { return this.REC_ST === 'Active'; },
    },
    is_supervisor: {
      type: DataTypes.VIRTUAL,
      get() { return this.SUPERVISOR_FG === 'Y'; },
    },
    can_post_transactions: {
      type: DataTypes.VIRTUAL,
      get() { return this.ALLOW_TXN_POSTING_FG === 'Y'; },
    },
    can_override_exchange_rate: {
      type: DataTypes.VIRTUAL,
      get() { return this.ALLOW_EXCH_RATE_OVR_FG === 'Y'; },
    },
    is_default_role: {
      type: DataTypes.VIRTUAL,
      get() { return this.DEF_ROLE_FG === 'Y'; },
    },
  },
  {
    sequelize,
    modelName: 'BusinessRole',
    tableName: 'business_roles',
    timestamps: false,          // ✅ CRITICAL: disable automatic timestamps
    underscored: false,
    sync: false,
    createdAt: false,           // ✅ Explicitly disable
    updatedAt: false,           // ✅ Explicitly disable

    // ===== HOOKS =====
    hooks: {
      beforeValidate: (role) => {
        // Normalize string fields to uppercase
        if (role.ROLE_NM) role.ROLE_NM = role.ROLE_NM.toUpperCase().trim();
        if (role.USER_ID) role.USER_ID = role.USER_ID.toUpperCase().trim();
        if (role.BUSINESS_UNIT) role.BUSINESS_UNIT = role.BUSINESS_UNIT.toUpperCase().trim();
        if (role.CREATED_BY) role.CREATED_BY = role.CREATED_BY.toUpperCase().trim();
        if (role.CREATED_BY_ROLE && role.CREATED_BY_ROLE !== 'Unknown') {
          role.CREATED_BY_ROLE = role.CREATED_BY_ROLE.toUpperCase().trim();
        }
        if (role.LAST_UPDATED_BY) role.LAST_UPDATED_BY = role.LAST_UPDATED_BY.toUpperCase().trim();

        // Set defaults for new records
        if (role.isNewRecord) {
          ['SUPERVISOR_FG', 'ALLOW_TXN_POSTING_FG', 'ALLOW_EXCH_RATE_OVR_FG', 'DEF_ROLE_FG'].forEach((f) => {
            if (role[f] === undefined || role[f] === null) role[f] = 'N';
          });
        }

        // Validate ROLE_ID ↔ ROLE_NM consistency
        if (role.ROLE_ID && role.ROLE_NM) {
          const config = getRoleById(role.ROLE_ID);
          if (config && role.ROLE_NM !== config.ROLE_NM) {
            throw new Error(
              `Role mismatch: ROLE_ID ${role.ROLE_ID} expects "${config.ROLE_NM}", got "${role.ROLE_NM}"`
            );
          }
        }
      },

      beforeCreate: (role) => {
        const now = new Date();
        role.CREATE_DT = now;
        role.SYS_CREATE_TS = now;
        role.ROW_TS = now;
        if (!role.CREATED_BY_ROLE || role.CREATED_BY_ROLE === 'Unknown') {
          role.CREATED_BY_ROLE = role.ROLE_NM || 'Unknown';
        }
        if (!role.VERSION_NO) role.VERSION_NO = 1;
        if (!role.REC_ST) role.REC_ST = 'Active';
      },

      beforeUpdate: (role) => {
        role.ROW_TS = new Date();
        role.LAST_UPDATED_DT = new Date();
        if (role.changed()) {
          role.VERSION_NO += 1;
        }
      },

      afterCreate: (role) => {
        console.log(`✅ Business role created: ${role.ROLE_NM} for ${role.USER_ID}`);
      },

      afterUpdate: (role) => {
        console.log(`🔄 Business role updated: ${role.ROLE_NM} for ${role.USER_ID} (v${role.VERSION_NO})`);
      },
    },
  }
);

// ===== INSTANCE METHODS =====
BusinessRole.prototype.getRoleDetails = function () { return getRoleById(this.ROLE_ID); };
BusinessRole.prototype.isActive = function () { return this.REC_ST === 'Active'; };
BusinessRole.prototype.isSupervisor = function () { return this.SUPERVISOR_FG === 'Y'; };
BusinessRole.prototype.canPostTransactions = function () { return this.ALLOW_TXN_POSTING_FG === 'Y'; };
BusinessRole.prototype.canOverrideExchangeRate = function () { return this.ALLOW_EXCH_RATE_OVR_FG === 'Y'; };
BusinessRole.prototype.isDefaultRole = function () { return this.DEF_ROLE_FG === 'Y'; };
BusinessRole.prototype.getBU_ID = function () { return this.BU_ID; };

BusinessRole.prototype.getFullInfo = function () {
  return {
    id: this.id,
    ROLE_NM: this.ROLE_NM,
    ROLE_ID: this.ROLE_ID,
    USER_ID: this.USER_ID,
    BUSINESS_UNIT: this.BUSINESS_UNIT,
    BU_ID: this.BU_ID,
    REC_ST: this.REC_ST,
    VERSION_NO: this.VERSION_NO,
    SUPERVISOR_FG: this.SUPERVISOR_FG,
    ALLOW_TXN_POSTING_FG: this.ALLOW_TXN_POSTING_FG,
    ALLOW_EXCH_RATE_OVR_FG: this.ALLOW_EXCH_RATE_OVR_FG,
    DEF_ROLE_FG: this.DEF_ROLE_FG,
    WF_ITEM_ACCESS_LEVEL: this.WF_ITEM_ACCESS_LEVEL,
    CREATED_BY: this.CREATED_BY,
    CREATED_BY_ROLE: this.CREATED_BY_ROLE,
    LAST_UPDATED_BY: this.LAST_UPDATED_BY,
    LAST_UPDATED_DT: this.LAST_UPDATED_DT,
    CREATE_DT: this.CREATE_DT,
    SYS_CREATE_TS: this.SYS_CREATE_TS,
    ROW_TS: this.ROW_TS,
    ADMIN_OVERRIDE: this.ADMIN_OVERRIDE,
    role_details: this.role_details,
    is_active: this.is_active,
    is_supervisor: this.is_supervisor,
    can_post_transactions: this.can_post_transactions,
    can_override_exchange_rate: this.can_override_exchange_rate,
    is_default_role: this.is_default_role,
  };
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
    ALLOW_EXCH_RATE_OVR_FG: this.ALLOW_EXCH_RATE_OVR_FG,
    DEF_ROLE_FG: this.DEF_ROLE_FG,
    WF_ITEM_ACCESS_LEVEL: this.WF_ITEM_ACCESS_LEVEL,
    role_details: this.role_details,
  };
};

// ===== STATIC METHODS =====
BusinessRole.findByUserId = async function (userId, options = {}) {
  const { includeInactive = false, businessUnit = null } = options;
  const where = { USER_ID: userId.toUpperCase() };
  if (!includeInactive) where.REC_ST = 'Active';
  if (businessUnit) where.BUSINESS_UNIT = businessUnit.toUpperCase();
  return await this.findAll({ where, order: [['ROLE_ID', 'ASC']] });
};

BusinessRole.findByRoleId = async function (roleId, options = {}) {
  const { includeInactive = false, businessUnit = null } = options;
  const where = { ROLE_ID: roleId };
  if (!includeInactive) where.REC_ST = 'Active';
  if (businessUnit) where.BUSINESS_UNIT = businessUnit.toUpperCase();
  return await this.findAll({ where, order: [['USER_ID', 'ASC']] });
};

BusinessRole.findByBusinessUnit = async function (businessUnit, options = {}) {
  const { includeInactive = false, buId = null } = options;
  const where = { BUSINESS_UNIT: businessUnit.toUpperCase() };
  if (!includeInactive) where.REC_ST = 'Active';
  if (buId) where.BU_ID = buId;
  return await this.findAll({ where, order: [['ROLE_NM', 'ASC'], ['USER_ID', 'ASC']] });
};

BusinessRole.getUserRolesSummary = async function (userId) {
  const roles = await this.findAll({
    where: { USER_ID: userId.toUpperCase(), REC_ST: 'Active' },
    attributes: ['ROLE_ID', 'ROLE_NM', 'BUSINESS_UNIT', 'BU_ID', 'SUPERVISOR_FG', 'ALLOW_TXN_POSTING_FG', 'ALLOW_EXCH_RATE_OVR_FG', 'DEF_ROLE_FG', 'WF_ITEM_ACCESS_LEVEL'],
    raw: true,
  });
  return roles.map(r => ({
    ...r,
    role_details: getRoleById(r.ROLE_ID),
    is_supervisor: r.SUPERVISOR_FG === 'Y',
    can_post_transactions: r.ALLOW_TXN_POSTING_FG === 'Y',
    can_override_exchange_rate: r.ALLOW_EXCH_RATE_OVR_FG === 'Y',
    is_default_role: r.DEF_ROLE_FG === 'Y',
  }));
};

BusinessRole.getBusinessUnitSummary = async function (businessUnit, buId = null) {
  const where = { BUSINESS_UNIT: businessUnit.toUpperCase(), REC_ST: 'Active' };
  if (buId) where.BU_ID = buId;
  const roles = await this.findAll({
    where,
    attributes: [
      'ROLE_ID',
      'ROLE_NM',
      [sequelize.fn('COUNT', sequelize.col('USER_ID')), 'user_count'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN SUPERVISOR_FG = 'Y' THEN 1 ELSE 0 END")), 'supervisor_count'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN ALLOW_TXN_POSTING_FG = 'Y' THEN 1 ELSE 0 END")), 'txn_poster_count'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN ALLOW_EXCH_RATE_OVR_FG = 'Y' THEN 1 ELSE 0 END")), 'exchange_rate_override_count'],
      [sequelize.fn('SUM', sequelize.literal("CASE WHEN DEF_ROLE_FG = 'Y' THEN 1 ELSE 0 END")), 'default_role_count'],
    ],
    group: ['ROLE_ID', 'ROLE_NM'],
    raw: true,
  });
  return roles.map(r => ({
    ROLE_ID: r.ROLE_ID,
    ROLE_NM: r.ROLE_NM,
    user_count: parseInt(r.user_count) || 0,
    supervisor_count: parseInt(r.supervisor_count) || 0,
    txn_poster_count: parseInt(r.txn_poster_count) || 0,
    exchange_rate_override_count: parseInt(r.exchange_rate_override_count) || 0,
    default_role_count: parseInt(r.default_role_count) || 0,
    role_details: getRoleById(r.ROLE_ID),
  }));
};

BusinessRole.validateRoleData = function (data) {
  const errors = [];
  const required = ['ROLE_NM', 'ROLE_ID', 'USER_ID', 'BUSINESS_UNIT', 'BU_ID', 'CREATED_BY'];
  for (const field of required) {
    if (!data[field] || data[field].toString().trim().length === 0) {
      errors.push(`${field} is required`);
    }
  }
  if (data.ROLE_ID && data.ROLE_NM) {
    const config = getRoleById(data.ROLE_ID);
    if (config && data.ROLE_NM.toUpperCase() !== config.ROLE_NM) {
      errors.push(`ROLE_NM "${data.ROLE_NM}" doesn't match ROLE_ID ${data.ROLE_ID}. Expected: "${config.ROLE_NM}"`);
    }
  }
  if (data.REC_ST && !['Active', 'Deactivated'].includes(data.REC_ST)) {
    errors.push('REC_ST must be "Active" or "Deactivated"');
  }
  ['SUPERVISOR_FG', 'ALLOW_TXN_POSTING_FG', 'ALLOW_EXCH_RATE_OVR_FG', 'DEF_ROLE_FG'].forEach(f => {
    if (data[f] && !['Y', 'N'].includes(data[f].toUpperCase())) {
      errors.push(`${f} must be "Y" or "N"`);
    }
  });
  return errors;
};

// ===== QUERY SCOPES =====
BusinessRole.addScope('active', { where: { REC_ST: 'Active' } });
BusinessRole.addScope('supervisors', { where: { SUPERVISOR_FG: 'Y' } });
BusinessRole.addScope('transactionPosters', { where: { ALLOW_TXN_POSTING_FG: 'Y' } });
BusinessRole.addScope('exchangeRateOverriders', { where: { ALLOW_EXCH_RATE_OVR_FG: 'Y' } });
BusinessRole.addScope('defaultRoles', { where: { DEF_ROLE_FG: 'Y' } });
BusinessRole.addScope('byBusinessUnit', (bu) => ({ where: { BUSINESS_UNIT: bu.toUpperCase() } }));
BusinessRole.addScope('byRole', (id) => ({ where: { ROLE_ID: id } }));
BusinessRole.addScope('byUser', (id) => ({ where: { USER_ID: id.toUpperCase() } }));

export default BusinessRole;