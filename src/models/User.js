// src/models/User.js - UPDATED WITH CORRECT ROLE ASSOCIATION
import { DataTypes, Op, Model } from 'sequelize';
import {getSequelize}  from '../../config/db.js';
import bcrypt from 'bcrypt';
import logger from '../utils/logger.js';

const sequelize = getSequelize();

class User extends Model {}

User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    user_id: {
      type: DataTypes.INTEGER,
      unique: true,
      allowNull: true,
    },
    username: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    user_name: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    default_password: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    passwordHistory: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    passwordChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    password_expiry_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    temp_password_token: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    temp_token_expire: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    is_first_login: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    force_password_change: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    first_name: DataTypes.STRING,
    last_name: DataTypes.STRING,
    middle_name: DataTypes.STRING,
    preferred_name: DataTypes.STRING,
    job_title: DataTypes.STRING,
    email: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: true,
      validate: { isEmail: true },
    },
    employer_number: DataTypes.STRING,
    customer_number: DataTypes.STRING,
    roles: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    primary_role: DataTypes.STRING,
    BU_ROLE_ID: DataTypes.STRING,
    primary_business_role: {
      type: DataTypes.STRING,
      defaultValue: 'Staff',
    },
    main_business_unit: DataTypes.STRING,
    responsibility_centre: DataTypes.STRING,
    branch: DataTypes.INTEGER,
    start_date: DataTypes.DATE,
    expiry_date: DataTypes.DATE,
    earliest_login_time: {
      type: DataTypes.TIME,
      defaultValue: '00:00:00',
    },
    latest_login_time: {
      type: DataTypes.TIME,
      defaultValue: '23:59:59',
    },
    internal_employee_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    enable_multi_session: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    validate_ip_address: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    ip_address: DataTypes.STRING,
    is_supervisor: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_main_BU: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM('Active', 'Deactivated', 'ForceLocked'),
      defaultValue: 'Active',
    },
    failed_attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lock_until: DataTypes.DATE,
    reset_token: DataTypes.STRING,
    session_token: DataTypes.STRING,
    token: DataTypes.STRING,
    current_sessions: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    login_history: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    force_lock_reason: DataTypes.STRING,
    force_locked_by: DataTypes.INTEGER,
    force_locked_at: DataTypes.DATE,
    last_login: DataTypes.DATE,
    last_updated: DataTypes.DATE,
    created_by: DataTypes.INTEGER,
    updated_by: DataTypes.INTEGER,
    businessUnit: DataTypes.STRING,
    accessibleBusinessUnits: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    permissions: {
      type: DataTypes.JSON,
      defaultValue: [],
    },
    isAdmin: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    is_active: {
      type: DataTypes.STRING,
      defaultValue: 'Active',
    },
    utype: {
      type: DataTypes.STRING,
      defaultValue: 'Staff',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
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
      attributes: { 
        exclude: ['password', 'default_password', 'reset_token', 'temp_password_token'] 
      },
    },
    scopes: {
      withSensitiveData: {
        attributes: { 
          include: ['password', 'default_password', 'reset_token', 'temp_password_token'] 
        },
      },
      active: { 
        where: { status: 'Active' } 
      },
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

        if (!user.default_password && user.password) {
          user.default_password = user.password;
        }

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

          if (user.default_password === user.previous('password')) {
            user.default_password = null;
          }
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

// ============================================
// ASSOCIATIONS
// ============================================

// Add static method for associations
User.associate = function(models) {
  // Associate with Role model through user_roles join table
  User.belongsToMany(models.Role, {
    through: 'user_roles',
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'roles', // We'll use 'roles' as alias for consistency
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE'
  });
};

// ============================================
// INSTANCE METHODS
// ============================================

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

// UPDATED: Now uses ConfigurationService for global login hours + user overrides
User.prototype.isWithinLoginHours = async function () {
  const configService = await import('../Services/ConfigurationService.js');
  const loginConfig = await configService.default.getLoginHours();
  
  // If login hour restriction is globally disabled, allow login
  if (!loginConfig.enabled) {
    return true;
  }

  const now = new Date();
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Use user-specific times if set, otherwise fall back to config defaults
  const earliestTime = this.earliest_login_time || loginConfig.earliest;
  const latestTime = this.latest_login_time || loginConfig.latest;
  
  const earliestMinutes = earliestTime 
    ? (parseInt(earliestTime.split(':')[0]) * 60 + parseInt(earliestTime.split(':')[1] || '0'))
    : 0;
  
  const latestMinutes = latestTime 
    ? (parseInt(latestTime.split(':')[0]) * 60 + parseInt(latestTime.split(':')[1] || '0'))
    : 1439; // 23:59

  return currentTimeInMinutes >= earliestMinutes && currentTimeInMinutes <= latestMinutes;
};

// NEW: Check if user has roles that can bypass login hour restrictions
User.prototype.canBypassLoginHours = async function () {
  const configService = await import('../Services/ConfigurationService.js');
  const userRoles = this.getAllRoles();
  return await configService.default.canBypassLoginHours(userRoles);
};

User.prototype.getSafeInfo = function () {
  return {
    id: this.id,
    user_id: this.user_id,
    username: this.username,
    user_name: this.user_name,
    email: this.email,
    first_name: this.first_name,
    last_name: this.last_name,
    middle_name: this.middle_name,
    preferred_name: this.preferred_name,
    job_title: this.job_title,
    roles: this.roles,
    primary_role: this.primary_role,
    BU_ROLE_ID: this.BU_ROLE_ID,
    primary_business_role: this.primary_business_role,
    main_business_unit: this.main_business_unit,
    businessUnit: this.businessUnit,
    accessibleBusinessUnits: this.accessibleBusinessUnits,
    responsibility_centre: this.responsibility_centre,
    branch: this.branch,
    status: this.status,
    is_supervisor: this.is_supervisor,
    is_main_BU: this.is_main_BU,
    isAdmin: this.isAdmin,
    permissions: this.permissions,
    last_login: this.last_login,
    passwordChangedAt: this.passwordChangedAt,
    password_expiry_date: this.password_expiry_date,
    is_first_login: this.is_first_login,
    requiresPasswordChange: this.requiresPasswordChange(),
    created_at: this.created_at,
    updated_at: this.updated_at,
  };
};

// ============================================
// STATIC METHODS
// ============================================

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

// ============================================
// NEW METHODS FOR PERMISSION SYSTEM
// ============================================

/**
 * Get user's roles from database (including associated Role models)
 */
User.prototype.getRolesWithPermissions = async function () {
  try {
    // Use eager loading to get roles with permissions
    const userWithRoles = await User.findOne({
      where: { id: this.id },
      include: [{
        association: 'roles', // This matches the alias in the association
        required: false // LEFT JOIN
      }]
    });
    
    return userWithRoles?.roles || [];
  } catch (error) {
    logger.error('Error getting user roles with permissions:', error);
    return [];
  }
};

/**
 * Get all permissions from user's roles
 */
User.prototype.getAllPermissions = async function () {
  try {
    const roles = await this.getRolesWithPermissions();
    const allPermissions = new Set();
    
    // Combine permissions from all roles
    for (const role of roles) {
      const permissions = role.permissions || [];
      
      // Handle wildcard permission
      if (permissions.includes('*')) {
        return ['*']; // Return wildcard if any role has full access
      }
      
      permissions.forEach(perm => {
        if (perm && typeof perm === 'string') {
          allPermissions.add(perm);
        }
      });
    }
    
    // Also include permissions from the user's permissions field
    const userPermissions = this.permissions || [];
    if (Array.isArray(userPermissions)) {
      userPermissions.forEach(perm => {
        if (perm && typeof perm === 'string') {
          allPermissions.add(perm);
        }
      });
    }
    
    return Array.from(allPermissions);
  } catch (error) {
    logger.error('Error getting user permissions:', error);
    return [];
  }
};

/**
 * Check if user has a specific permission
 */
User.prototype.hasPermission = async function (permission) {
  try {
    const allPermissions = await this.getAllPermissions();
    
    // Check for wildcard permission
    if (allPermissions.includes('*')) {
      return true;
    }
    
    return allPermissions.includes(permission);
  } catch (error) {
    logger.error('Error checking user permission:', error);
    return false;
  }
};

/**
 * Check if user has any of the specified permissions
 */
User.prototype.hasAnyPermission = async function (permissions) {
  try {
    if (!Array.isArray(permissions)) {
      permissions = [permissions];
    }
    
    const allPermissions = await this.getAllPermissions();
    
    // Check for wildcard permission
    if (allPermissions.includes('*')) {
      return true;
    }
    
    return permissions.some(perm => allPermissions.includes(perm));
  } catch (error) {
    logger.error('Error checking user permissions:', error);
    return false;
  }
};

/**
 * Check if user has all specified permissions
 */
User.prototype.hasAllPermissions = async function (permissions) {
  try {
    if (!Array.isArray(permissions)) {
      permissions = [permissions];
    }
    
    const allPermissions = await this.getAllPermissions();
    
    // Check for wildcard permission
    if (allPermissions.includes('*')) {
      return true;
    }
    
    return permissions.every(perm => allPermissions.includes(perm));
  } catch (error) {
    logger.error('Error checking user permissions:', error);
    return false;
  }
};

/**
 * Get user info with roles and permissions for API responses
 */
User.prototype.getUserInfoWithPermissions = async function () {
  try {
    const safeInfo = this.getSafeInfo();
    const roles = await this.getRolesWithPermissions();
    const permissions = await this.getAllPermissions();
    
    return {
      ...safeInfo,
      detailedRoles: roles.map(role => ({
        id: role.id,
        name: role.name,
        code: role.code,
        description: role.description,
        permissions: role.permissions
      })),
      allPermissions: permissions,
      hasFullAccess: permissions.includes('*')
    };
  } catch (error) {
    logger.error('Error getting user info with permissions:', error);
    return this.getSafeInfo();
  }
};

export default User;