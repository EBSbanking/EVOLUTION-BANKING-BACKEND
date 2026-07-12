// src/models/User.js - Complete with BusinessRole association

import { DataTypes, Op, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';
import sequelize from '../../config/db.js';   // <-- real Sequelize instance

class User extends Model {}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    user_id: { type: DataTypes.INTEGER, unique: true, allowNull: true },
    username: { type: DataTypes.STRING, unique: true, allowNull: true },
    user_name: { type: DataTypes.STRING, unique: true, allowNull: true },
    password: { type: DataTypes.STRING, allowNull: false },
    default_password: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
    passwordHistory: { type: DataTypes.JSON, defaultValue: [] },
    passwordChangedAt: { type: DataTypes.DATE, allowNull: true },
    password_expiry_date: { type: DataTypes.DATE, allowNull: true },
    temp_password_token: { type: DataTypes.STRING, allowNull: true },
    temp_token_expire: { type: DataTypes.DATE, allowNull: true },
    is_first_login: { type: DataTypes.BOOLEAN, defaultValue: true },
    force_password_change: { type: DataTypes.BOOLEAN, defaultValue: false },
    first_name: DataTypes.STRING,
    last_name: DataTypes.STRING,
    middle_name: DataTypes.STRING,
    preferred_name: DataTypes.STRING,
    job_title: DataTypes.STRING,
    email: { type: DataTypes.STRING, unique: true, allowNull: true, validate: { isEmail: true } },
    employer_number: DataTypes.STRING,
    customer_number: DataTypes.STRING,
    roles: { type: DataTypes.JSON, defaultValue: [] },
    primary_role: DataTypes.STRING,
    BU_ROLE_ID: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Business Role ID - links to business_roles table via ROLE_ID',
    },
    primary_business_role: { type: DataTypes.STRING, defaultValue: 'Staff' },
    main_business_unit: DataTypes.STRING,
    responsibility_centre: DataTypes.STRING,
    branch: DataTypes.INTEGER,
    start_date: DataTypes.DATE,
    expiry_date: DataTypes.DATE,
    earliest_login_time: { type: DataTypes.TIME, defaultValue: '00:00:00' },
    latest_login_time: { type: DataTypes.TIME, defaultValue: '23:59:59' },
    internal_employee_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    enable_multi_session: { type: DataTypes.BOOLEAN, defaultValue: false },
    validate_ip_address: { type: DataTypes.BOOLEAN, defaultValue: false },
    ip_address: DataTypes.STRING,
    is_supervisor: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_main_BU: { type: DataTypes.BOOLEAN, defaultValue: false },
    status: { type: DataTypes.ENUM('Active', 'Deactivated', 'ForceLocked'), defaultValue: 'Active' },
    failed_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    lock_until: DataTypes.DATE,
    reset_token: DataTypes.STRING,
    session_token: DataTypes.STRING,
    token: DataTypes.STRING,
    current_sessions: { type: DataTypes.JSON, defaultValue: [] },
    login_history: { type: DataTypes.JSON, defaultValue: [] },
    force_lock_reason: DataTypes.STRING,
    force_locked_by: DataTypes.INTEGER,
    force_locked_at: DataTypes.DATE,
    last_login: DataTypes.DATE,
    last_updated: DataTypes.DATE,
    created_by: DataTypes.INTEGER,
    updated_by: DataTypes.INTEGER,
    businessUnit: DataTypes.STRING,
    accessibleBusinessUnits: { type: DataTypes.JSON, defaultValue: [] },
    permissions: { type: DataTypes.JSON, defaultValue: [] },
    isAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_active: { type: DataTypes.STRING, defaultValue: 'Active' },
    utype: { type: DataTypes.STRING, defaultValue: 'Staff' },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,                // <-- uses the imported sequelize instance
    modelName: 'User',
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    defaultScope: {
      attributes: { exclude: ['password', 'default_password', 'reset_token', 'temp_password_token'] },
    },
    scopes: {
      withSensitiveData: {
        attributes: { include: ['password', 'default_password', 'reset_token', 'temp_password_token'] },
      },
      withBusinessRole: {
        include: [{
          association: 'businessRole',
          attributes: ['BU_ID', 'ROLE_NM', 'ROLE_ID', 'BUSINESS_UNIT', 'SUPERVISOR_FG', 'ALLOW_TXN_POSTING_FG']
        }]
      },
      active: { where: { status: 'Active' } },
      needsPasswordChange: {
        where: {
          [Op.or]: [
            { is_first_login: true },
            { force_password_change: true },
            { password_expiry_date: { [Op.lt]: new Date() } },
          ],
        },
      },
    },
    hooks: {
      beforeCreate: async (user) => {
        await hashPasswordIfNeeded(user);
        normalizeRoles(user);
        if (!user.default_password && user.password) user.default_password = user.password;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 90);
        user.password_expiry_date = expiry;
        if (!user.is_active) user.is_active = 'Active';
        if (!user.utype) user.utype = 'Staff';
        user.created_at = new Date();
        user.updated_at = new Date();
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          await hashPasswordIfNeeded(user);
          user.passwordChangedAt = new Date();
          const history = user.passwordHistory || [];
          user.passwordHistory = [user.previous('password'), ...history].slice(0, 5);
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + 90);
          user.password_expiry_date = expiry;
          user.is_first_login = false;
          user.force_password_change = false;
          if (user.default_password === user.previous('password')) user.default_password = null;
        }
        normalizeRoles(user);
        user.updated_at = new Date();
      },
      afterUpdate: async (user) => {
        if (user.changed('password') || user.changed('force_password_change')) {
          user.temp_password_token = null;
          user.temp_token_expire = null;
          await user.save({ fields: ['temp_password_token', 'temp_token_expire'] });
        }
      },
    },
  }
);

// Helper functions
async function hashPasswordIfNeeded(user) {
  if (user.password && !user.password.startsWith('$2')) {
    user.password = await bcrypt.hash(user.password, 10);
  }
  if (user.default_password && !user.default_password.startsWith('$2')) {
    user.default_password = await bcrypt.hash(user.default_password, 10);
  }
}

function normalizeRoles(user) {
  if (!Array.isArray(user.roles)) user.roles = [];
}

// ========== Instance Methods ==========
User.prototype.correctPassword = async function (candidate) {
  return await bcrypt.compare(candidate, this.password);
};

User.prototype.isDefaultPassword = async function (candidate) {
  if (!this.default_password) return false;
  return await bcrypt.compare(candidate, this.default_password);
};

User.prototype.isPasswordExpired = function () {
  if (!this.password_expiry_date) return false;
  return new Date() > this.password_expiry_date;
};

User.prototype.requiresPasswordChange = function () {
  return this.is_first_login || this.force_password_change || this.isPasswordExpired();
};

User.prototype.generateTempToken = async function () {
  const crypto = await import('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  this.temp_password_token = token;
  this.temp_token_expire = new Date(Date.now() + 10 * 60 * 1000);
  await this.save();
  return token;
};

User.prototype.validateTempToken = function (token) {
  return (
    this.temp_password_token === token &&
    this.temp_token_expire &&
    new Date() < this.temp_token_expire
  );
};

User.prototype.getAllRoles = function () {
  return this.roles.length ? this.roles : [this.BU_ROLE_ID].filter(Boolean);
};

User.prototype.hasAnyRole = function (roles) {
  return roles.some((r) => this.getAllRoles().includes(r));
};

User.prototype.isWithinLoginHours = async function () { /* ... keep as is ... */ };
User.prototype.canBypassLoginHours = async function () { /* ... keep as is ... */ };
User.prototype.getSafeInfo = function () { /* ... keep as is ... */ };
User.prototype.getRolesWithPermissions = async function () { /* ... keep as is ... */ };
User.prototype.getAllPermissions = async function () { /* ... keep as is ... */ };
User.prototype.hasPermission = async function (permission) { /* ... keep as is ... */ };
User.prototype.hasAnyPermission = async function (permissions) { /* ... keep as is ... */ };
User.prototype.hasAllPermissions = async function (permissions) { /* ... keep as is ... */ };
User.prototype.getUserInfoWithPermissions = async function () { /* ... keep as is ... */ };

// ✅ Get BU_ID from business role
User.prototype.getBU_ID = async function() {
  // If BU_ID is already set directly, return it
  if (this.BU_ID) return this.BU_ID;
  
  // If we have a businessRole association loaded
  if (this.businessRole) {
    return this.businessRole.BU_ID;
  }
  
  // If we have BU_ROLE_ID but no association loaded, fetch it
  if (this.BU_ROLE_ID) {
    try {
      const BusinessRole = (await import('./BusinessRole.js')).default;
      const businessRole = await BusinessRole.findOne({
        where: { ROLE_ID: this.BU_ROLE_ID }
      });
      if (businessRole) {
        return businessRole.BU_ID;
      }
    } catch (error) {
      logger.error('Error fetching business role:', error);
    }
  }
  
  return null;
};

// ========== Static Methods ==========
User.findByUsernameWithPassword = function (identifier) {
  return this.scope('withSensitiveData').findOne({
    where: {
      [Op.or]: [
        { user_name: { [Op.like]: identifier } },
        { username: { [Op.like]: identifier } }
      ]
    }
  });
};

User.findByUsernameWithSensitiveData = function (identifier) {
  return this.scope('withSensitiveData').findOne({
    where: {
      [Op.or]: [
        { user_name: { [Op.like]: identifier } },
        { username: { [Op.like]: identifier } }
      ]
    }
  });
};

User.findUsersNeedingPasswordChange = function () {
  return this.scope('needsPasswordChange').findAll();
};

User.validatePasswordStrength = function (password) {
  const minLength = 8;
  const checks = [
    { test: password.length >= minLength, msg: `Password must be at least ${minLength} characters` },
    { test: /[A-Z]/.test(password), msg: 'Must contain uppercase letter' },
    { test: /[a-z]/.test(password), msg: 'Must contain lowercase letter' },
    { test: /\d/.test(password), msg: 'Must contain a number' },
    { test: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password), msg: 'Must contain special character' },
  ];
  const failed = checks.find((c) => !c.test);
  return failed ? { valid: false, message: failed.msg } : { valid: true };
};

User.createLegacySession = async function (sessionData) {
  this.token = sessionData.session_id;
  this.last_updated = new Date();
  const history = this.login_history || [];
  history.push({
    session_id: sessionData.session_id,
    ip_address: sessionData.ip_address,
    user_agent: sessionData.user_agent,
    login_time: new Date()
  });
  this.login_history = history.slice(-50);
  await this.save();
};

// ========== Associations (to be called after all models are loaded) ==========
export const associateUser = (models) => {
  if (models.Role) {
    User.belongsToMany(models.Role, {
      through: 'user_roles',
      foreignKey: 'user_id',
      otherKey: 'role_id',
      as: 'roles',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  }
  
  // ✅ Add BusinessRole association
  if (models.BusinessRole) {
    User.belongsTo(models.BusinessRole, {
      foreignKey: 'BU_ROLE_ID',
      targetKey: 'ROLE_ID',
      as: 'businessRole',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  }
};

export default User;