// src/models/User.js - Complete with 2FA fields and user_id as STRING

import { DataTypes, Op, Model } from 'sequelize';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';
import sequelize from '../../config/db.js';

class User extends Model {}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    // ✅ CHANGED: user_id from INTEGER to STRING to store values like 'PCO01'
    user_id: { 
      type: DataTypes.STRING(255), 
      unique: true, 
      allowNull: true,
      comment: 'User identifier - same as user_name'
    },
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
    
    // ========== 2FA Fields ==========
    // RFID 2FA
    rfid_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Indicates if RFID 2FA is enabled for this user'
    },
    
    // General 2FA Settings
    two_factor_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Master switch for 2FA'
    },
    two_factor_methods: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {
        hardware_token: false,
        email_token: false,
        sms_token: false
      },
      comment: 'Available 2FA methods for this user'
    },
    two_factor_phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
      trim: true,
      comment: 'Phone number for SMS 2FA'
    },
    two_factor_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
      trim: true,
      comment: 'Email for email 2FA (if different from primary email)'
    },
    two_factor_secret: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Secret key for TOTP backup'
    },
    two_factor_backup_codes: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Backup codes for emergency 2FA access'
    },
    two_factor_last_used: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp of last 2FA usage'
    },
    two_factor_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Timestamp when 2FA was last verified'
    },
    two_factor_trusted_devices: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
      comment: 'List of trusted devices for 2FA'
    },
    BU_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Business Unit ID'
    }
  },
  {
    sequelize,
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
      with2FA: {
        attributes: { include: ['rfid_enabled', 'two_factor_enabled', 'two_factor_methods', 'two_factor_phone', 'two_factor_email'] }
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
      with2FAEnabled: {
        where: {
          two_factor_enabled: true
        }
      }
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
        
        // ✅ Auto-set user_id to user_name if not provided
        if (!user.user_id && user.user_name) {
          user.user_id = user.user_name;
        }
        
        // Initialize 2FA settings
        if (!user.two_factor_methods) {
          user.two_factor_methods = {
            hardware_token: false,
            email_token: false,
            sms_token: false
          };
        }
        if (!user.two_factor_trusted_devices) {
          user.two_factor_trusted_devices = [];
        }
        if (!user.two_factor_backup_codes) {
          user.two_factor_backup_codes = [];
        }
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
        
        // ✅ Keep user_id in sync with user_name
        if (user.changed('user_name') && !user.changed('user_id')) {
          user.user_id = user.user_name;
        }
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

// Password methods
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

// Role methods
User.prototype.getAllRoles = function () {
  return this.roles.length ? this.roles : [this.BU_ROLE_ID].filter(Boolean);
};

User.prototype.hasAnyRole = function (roles) {
  return roles.some((r) => this.getAllRoles().includes(r));
};

User.prototype.getBU_ID = async function() {
  if (this.BU_ID) return this.BU_ID;
  if (this.businessRole) {
    return this.businessRole.BU_ID;
  }
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

// ========== 2FA Methods ==========

// Check if 2FA is enabled for this user
User.prototype.is2FAEnabled = function() {
  return this.two_factor_enabled === true;
};

// Check if specific 2FA method is enabled
User.prototype.is2FAMethodEnabled = function(method) {
  if (!this.two_factor_methods) return false;
  return this.two_factor_methods[method] === true;
};

// Get enabled 2FA methods
User.prototype.getEnabled2FAMethods = function() {
  const methods = [];
  if (!this.two_factor_methods) return methods;
  
  if (this.two_factor_methods.hardware_token && this.rfid_enabled) {
    methods.push('hardware_token');
  }
  if (this.two_factor_methods.email_token && (this.email || this.two_factor_email)) {
    methods.push('email_token');
  }
  if (this.two_factor_methods.sms_token && this.two_factor_phone) {
    methods.push('sms_token');
  }
  return methods;
};

// Get available 2FA methods with details
User.prototype.getAvailable2FAMethods = function() {
  const methods = [];
  
  if (this.two_factor_methods?.hardware_token && this.rfid_enabled) {
    methods.push({
      type: 'hardware_token',
      label: 'Hardware Token (RFID)',
      icon: '🔑',
      description: 'Tap your HID Mini Token on the reader',
      available: true
    });
  }
  
  if (this.two_factor_methods?.email_token && (this.email || this.two_factor_email)) {
    methods.push({
      type: 'email_token',
      label: 'Email Token',
      icon: '📧',
      description: `Send code to ${this.two_factor_email || this.email}`,
      available: true
    });
  }
  
  if (this.two_factor_methods?.sms_token && this.two_factor_phone) {
    methods.push({
      type: 'sms_token',
      label: 'SMS Token',
      icon: '📱',
      description: `Send code to ${this.two_factor_phone}`,
      available: true
    });
  }
  
  return methods;
};

// Generate backup codes for 2FA
User.prototype.generateBackupCodes = async function(count = 10) {
  const crypto = await import('crypto');
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  this.two_factor_backup_codes = codes;
  await this.save();
  return codes;
};

// Verify backup code
User.prototype.verifyBackupCode = async function(code) {
  if (!this.two_factor_backup_codes || !Array.isArray(this.two_factor_backup_codes)) {
    return false;
  }
  const index = this.two_factor_backup_codes.indexOf(code);
  if (index === -1) return false;
  
  // Remove used code
  this.two_factor_backup_codes.splice(index, 1);
  await this.save();
  return true;
};

// Add trusted device
User.prototype.addTrustedDevice = async function(deviceInfo) {
  if (!this.two_factor_trusted_devices) {
    this.two_factor_trusted_devices = [];
  }
  
  const existing = this.two_factor_trusted_devices.find(
    d => d.device_id === deviceInfo.device_id
  );
  
  if (existing) {
    existing.last_used = new Date();
    existing.user_agent = deviceInfo.user_agent;
  } else {
    this.two_factor_trusted_devices.push({
      device_id: deviceInfo.device_id,
      user_agent: deviceInfo.user_agent,
      ip_address: deviceInfo.ip_address,
      added_at: new Date(),
      last_used: new Date()
    });
  }
  
  await this.save();
  return this.two_factor_trusted_devices;
};

// Check if device is trusted
User.prototype.isDeviceTrusted = function(deviceId) {
  if (!this.two_factor_trusted_devices) return false;
  return this.two_factor_trusted_devices.some(d => d.device_id === deviceId);
};

// Remove trusted device
User.prototype.removeTrustedDevice = async function(deviceId) {
  if (!this.two_factor_trusted_devices) return false;
  this.two_factor_trusted_devices = this.two_factor_trusted_devices.filter(
    d => d.device_id !== deviceId
  );
  await this.save();
  return true;
};

// ========== Existing Methods ==========

User.prototype.isWithinLoginHours = async function () { /* keep as is */ };
User.prototype.canBypassLoginHours = async function () { /* keep as is */ };
User.prototype.getSafeInfo = function () { /* keep as is */ };
User.prototype.getRolesWithPermissions = async function () { /* keep as is */ };
User.prototype.getAllPermissions = async function () { /* keep as is */ };
User.prototype.hasPermission = async function (permission) { /* keep as is */ };
User.prototype.hasAnyPermission = async function (permissions) { /* keep as is */ };
User.prototype.hasAllPermissions = async function (permissions) { /* keep as is */ };
User.prototype.getUserInfoWithPermissions = async function () { /* keep as is */ };

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

// Find users with 2FA enabled
User.findWith2FAEnabled = function() {
  return this.scope('with2FAEnabled').findAll({
    attributes: ['id', 'user_name', 'username', 'email', 'two_factor_methods', 'two_factor_phone']
  });
};

// Find users with specific 2FA method
User.findWith2FAMethod = function(method) {
  return this.findAll({
    where: {
      two_factor_enabled: true,
      [Op.and]: [
        sequelize.literal(`JSON_EXTRACT(two_factor_methods, '$.${method}') = true`)
      ]
    },
    attributes: ['id', 'user_name', 'username', 'email', 'two_factor_methods', 'two_factor_phone']
  });
};

// ========== Associations ==========
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
  
  if (models.BusinessRole) {
    User.belongsTo(models.BusinessRole, {
      foreignKey: 'BU_ROLE_ID',
      targetKey: 'ROLE_ID',
      as: 'businessRole',
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });
  }

  // ✅ ADD THIS: Association with UserSession
  if (models.UserSession) {
    User.hasMany(models.UserSession, {
      foreignKey: 'user_id',
      sourceKey: 'id',
      as: 'sessions',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  }

  // ✅ ADD THIS: Association with UserActivityLog
  if (models.UserActivityLog) {
    User.hasMany(models.UserActivityLog, {
      foreignKey: 'user_id',
      sourceKey: 'id',
      as: 'activities',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE'
    });
  }
};

export default User;
