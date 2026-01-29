import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

const Login = sequelize.define('Login', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    },
    defaultValue: null
  },
  user_name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Unknown',
    trim: true
  },
  username: { // ✅ ADDED: Legacy username field for compatibility
    type: DataTypes.STRING(50),
    allowNull: true,
    trim: true,
    unique: false // Not unique for multiple login attempts
  },
  login_time: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  ip_address: {
    type: DataTypes.STRING(45), // IPv6 support (45 chars)
    allowNull: false,
    validate: {
      notNull: { msg: 'IP address is required' },
      notEmpty: true
    }
  },
  session_id: { // ✅ ADDED: Session tracking
    type: DataTypes.STRING,
    allowNull: true,
    trim: true
  },
  user_agent: { // ✅ ADDED: Browser/device info
    type: DataTypes.TEXT,
    allowNull: true,
    trim: true
  },
  status: {
    type: DataTypes.ENUM('Success', 'Failed', 'Locked', 'Expired'), // ✅ EXPANDED: Added more status types
    allowNull: false,
    validate: {
      notNull: { msg: 'Status is required' }
    }
  },
  success: { // ✅ ADDED: Boolean flag for easy filtering
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null
  },
  error_code: { // ✅ FIXED: Removed null from ENUM values
    type: DataTypes.ENUM(
      'USER_NOT_FOUND',
      'INVALID_PASSWORD', 
      'ACCOUNT_DISABLED',
      'ACCOUNT_LOCKED',
      'ACCOUNT_EXPIRED',
      'OUTSIDE_LOGIN_HOURS',
      'IP_NOT_ALLOWED',
      'MULTI_SESSION_VIOLATION',
      'PASSWORD_EXPIRED',
      'FIRST_LOGIN_REQUIRED',
      'SESSION_LIMIT_EXCEEDED'
    ),
    allowNull: true,
    defaultValue: null
  },
  attempt_identifier: {  // New field to track what was entered
    type: DataTypes.STRING,
    allowNull: false,
    trim: true,
    validate: {
      notNull: { msg: 'Attempt identifier is required' },
      notEmpty: true
    }
  },
  login_type: { // ✅ ADDED: Type of login attempt
    type: DataTypes.ENUM('password', 'sso', 'token', 'auto'),
    allowNull: false,
    defaultValue: 'password'
  },
  device_type: { // ✅ ADDED: Device information
    type: DataTypes.ENUM('desktop', 'mobile', 'tablet', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown'
  },
  location_data: { // ✅ ADDED: Geographic data (stored as JSON)
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  failed_attempts_count: { // ✅ ADDED: Track consecutive failures
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Failed attempts count cannot be negative' }
    }
  },
  password_changed: { // ✅ ADDED: Track if password was recently changed
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  legacy_user_id: { // ✅ ADDED: For legacy system compatibility
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  },
  business_unit: { // ✅ ADDED: User's business unit context
    type: DataTypes.STRING,
    allowNull: true,
    trim: true,
    defaultValue: null
  },
  role: { // ✅ ADDED: User's role at time of login
    type: DataTypes.STRING,
    allowNull: true,
    trim: true,
    defaultValue: null
  }
}, {
  tableName: 'logins',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true, // This ensures camelCase model fields map to snake_case DB columns
  getterMethods: {
    // ✅ ADDED: Virtual for formatted login time
    formatted_login_time() {
      return this.login_time ? new Date(this.login_time).toLocaleString() : 'N/A';
    },
    
    // ✅ ADDED: Virtual for login duration (if logout time is tracked elsewhere)
    is_recent() {
      if (!this.login_time) return false;
      const now = new Date();
      const loginTime = new Date(this.login_time);
      const hoursDiff = (now - loginTime) / (1000 * 60 * 60);
      return hoursDiff < 24; // Within last 24 hours
    }
  },
  indexes: [
    // Basic indexes
    {
      fields: ['user_id']
    },
    {
      fields: ['user_name']
    },
    {
      fields: ['username']
    },
    {
      fields: ['status']
    },
    {
      fields: ['success']
    },
    {
      fields: ['login_time']
    },
    {
      fields: ['ip_address']
    },
    {
      fields: ['attempt_identifier']
    },
    {
      fields: ['session_id']
    },
    {
      fields: ['error_code']
    },
    {
      fields: ['legacy_user_id']
    },
    {
      fields: ['business_unit']
    },
    {
      fields: ['role']
    },
    
    // Compound indexes for common queries
    {
      fields: ['user_name', 'login_time']
    },
    {
      fields: ['ip_address', 'login_time']
    },
    {
      fields: ['status', 'login_time']
    },
    {
      fields: ['user_id', 'login_time']
    },
    {
      fields: ['login_type', 'login_time']
    },
    {
      fields: ['device_type', 'login_time']
    }
  ]
});

// Define associations
Login.associate = (models) => {
  Login.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
  
  Login.belongsTo(models.User, {
    foreignKey: 'legacy_user_id',
    as: 'legacyUser',
    constraints: false // Since not all legacy users might exist
  });
};

// ✅ ADDED: Static method to get recent failed attempts
Login.getRecentFailedAttempts = async function(identifier, hours = 1) {
  const timeThreshold = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  return this.findAll({
    where: {
      [Op.or]: [
        { user_name: identifier },
        { username: identifier },
        { attempt_identifier: identifier }
      ],
      status: 'Failed',
      login_time: { [Op.gte]: timeThreshold }
    },
    order: [['login_time', 'DESC']]
  });
};

// ✅ ADDED: Static method to get user login history
Login.getUserLoginHistory = async function(userIdentifier, limit = 50) {
  let where = {};
  
  // Determine if identifier is numeric (user_id) or string (username)
  if (!isNaN(userIdentifier)) {
    where = { user_id: userIdentifier };
  } else {
    where = {
      [Op.or]: [
        { user_name: userIdentifier },
        { username: userIdentifier }
      ]
    };
  }
  
  return this.findAll({
    where,
    order: [['login_time', 'DESC']],
    limit: limit,
    include: [{
      model: sequelize.models.User,
      as: 'user',
      attributes: ['id', 'user_name', 'username', 'email', 'first_name', 'last_name', 'status'],
      required: false
    }]
  });
};

// ✅ ADDED: Static method to get suspicious login attempts
Login.getSuspiciousAttempts = async function(hours = 24, threshold = 5) {
  const timeThreshold = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  const results = await this.findAll({
    attributes: [
      'ip_address',
      [sequelize.fn('COUNT', sequelize.col('id')), 'attemptCount'],
      [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('attempt_identifier'))), 'uniqueUserCount'],
      [sequelize.fn('MAX', sequelize.col('login_time')), 'lastAttempt']
    ],
    where: {
      login_time: { [Op.gte]: timeThreshold },
      status: 'Failed'
    },
    group: ['ip_address'],
    having: sequelize.literal(`COUNT(id) >= ${threshold}`),
    order: [[sequelize.literal('attemptCount'), 'DESC']],
    raw: true
  });
  
  return results.map(result => ({
    ip_address: result.ip_address,
    attemptCount: parseInt(result.attemptCount),
    uniqueUserCount: parseInt(result.uniqueUserCount),
    lastAttempt: result.lastAttempt
  }));
};

// ✅ ADDED: Static method to clean old login records
Login.cleanOldRecords = async function(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
  
  return this.destroy({
    where: {
      login_time: { [Op.lt]: cutoffDate }
    }
  });
};

// ✅ ADDED: Static method to get login statistics
Login.getLoginStatistics = async function(startDate = null, endDate = null) {
  const where = {};
  
  if (startDate) {
    where.login_time = where.login_time || {};
    where.login_time[Op.gte] = new Date(startDate);
  }
  
  if (endDate) {
    where.login_time = where.login_time || {};
    where.login_time[Op.lte] = new Date(endDate);
  }
  
  const totalLogins = await this.count({ where });
  const successfulLogins = await this.count({ where: { ...where, success: true } });
  const failedLogins = await this.count({ where: { ...where, success: false } });
  
  const uniqueUsers = await this.count({
    where,
    distinct: true,
    col: 'user_id'
  });
  
  const uniqueIPs = await this.count({
    where,
    distinct: true,
    col: 'ip_address'
  });
  
  const topIPs = await this.findAll({
    attributes: [
      'ip_address',
      [sequelize.fn('COUNT', sequelize.col('id')), 'loginCount']
    ],
    where,
    group: ['ip_address'],
    order: [[sequelize.literal('loginCount'), 'DESC']],
    limit: 10,
    raw: true
  });
  
  return {
    totalLogins,
    successfulLogins,
    failedLogins,
    successRate: totalLogins > 0 ? (successfulLogins / totalLogins * 100).toFixed(2) : 0,
    uniqueUsers,
    uniqueIPs,
    topIPs: topIPs.map(ip => ({
      ip_address: ip.ip_address,
      loginCount: parseInt(ip.loginCount)
    })),
    timeRange: {
      start: startDate || 'Beginning',
      end: endDate || 'Now'
    }
  };
};

// ✅ ADDED: Instance method to mark as successful
Login.prototype.markAsSuccessful = async function(sessionId = null, userAgent = null) {
  this.status = 'Success';
  this.success = true;
  this.error = null;
  this.error_code = null;
  this.failed_attempts_count = 0; // Reset failed attempts on success
  
  if (sessionId) {
    this.session_id = sessionId;
  }
  
  if (userAgent) {
    this.user_agent = userAgent;
  }
  
  return this.save();
};

// ✅ ADDED: Instance method to mark as failed with specific error
Login.prototype.markAsFailed = async function(errorMessage, errorCode = null) {
  this.status = 'Failed';
  this.success = false;
  this.error = errorMessage;
  this.error_code = errorCode;
  this.failed_attempts_count = (this.failed_attempts_count || 0) + 1;
  
  return this.save();
};

// ✅ ADDED: Instance method to get login details
Login.prototype.getLoginDetails = function() {
  const location = this.location_data || {};
  return {
    id: this.id,
    userId: this.user_id,
    userName: this.user_name,
    username: this.username,
    loginTime: this.login_time,
    formattedLoginTime: this.formatted_login_time,
    ipAddress: this.ip_address,
    sessionId: this.session_id,
    userAgent: this.user_agent,
    status: this.status,
    success: this.success,
    error: this.error,
    errorCode: this.error_code,
    attemptIdentifier: this.attempt_identifier,
    loginType: this.login_type,
    deviceType: this.device_type,
    location: {
      country: location.country,
      city: location.city,
      timezone: location.timezone,
      coordinates: location.coordinates
    },
    failedAttemptsCount: this.failed_attempts_count,
    passwordChanged: this.password_changed,
    legacyUserId: this.legacy_user_id,
    businessUnit: this.business_unit,
    role: this.role,
    isRecent: this.is_recent,
    createdAt: this.created_at,
    updatedAt: this.updated_at
  };
};

export default Login;