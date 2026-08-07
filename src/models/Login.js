// models/Login.js - UPDATED WITH FIXED STATUS ENUM
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
  username: {
    type: DataTypes.STRING(50),
    allowNull: true,
    trim: true,
    unique: false
  },
  login_time: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: false,
    validate: {
      notNull: { msg: 'IP address is required' },
      notEmpty: true
    }
  },
  session_id: {
    type: DataTypes.STRING,
    allowNull: true,
    trim: true
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true,
    trim: true
  },
  // ✅ FIXED: Added 'Pending' and 'Pending_2FA' to ENUM
  status: {
    type: DataTypes.ENUM('Success', 'Failed', 'Locked', 'Expired', 'Pending', 'Pending_2FA'),
    allowNull: false,
    validate: {
      notNull: { msg: 'Status is required' }
    }
  },
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  error: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null
  },
  error_code: {
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
      'SESSION_LIMIT_EXCEEDED',
      'RFID_TOKEN_NOT_FOUND',
      'RFID_TOKEN_INACTIVE',
      'RFID_TOKEN_NOT_ASSIGNED',
      'RFID_VERIFICATION_FAILED',
      'TWO_FA_REQUIRED',
      'TWO_FA_EXPIRED',
      'TWO_FA_INVALID_TOKEN',
      'TWO_FA_MAX_ATTEMPTS'
    ),
    allowNull: true,
    defaultValue: null
  },
  attempt_identifier: {
    type: DataTypes.STRING,
    allowNull: false,
    trim: true,
    validate: {
      notNull: { msg: 'Attempt identifier is required' },
      notEmpty: true
    }
  },
  login_type: {
    type: DataTypes.ENUM('password', 'sso', 'token', 'auto', 'rfid', 'rfid_2fa', 'email_2fa', 'sms_2fa'),
    allowNull: false,
    defaultValue: 'password'
  },
  device_type: {
    type: DataTypes.ENUM('desktop', 'mobile', 'tablet', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown'
  },
  location_data: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  failed_attempts_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Failed attempts count cannot be negative' }
    }
  },
  password_changed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  legacy_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: null
  },
  business_unit: {
    type: DataTypes.STRING,
    allowNull: true,
    trim: true,
    defaultValue: null
  },
  role: {
    type: DataTypes.STRING,
    allowNull: true,
    trim: true,
    defaultValue: null
  },
  // ========== RFID 2FA Fields ==========
  rfid_used: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indicates if RFID token was used for this login'
  },
  rfid_token_serial: {
    type: DataTypes.STRING(50),
    allowNull: true,
    trim: true,
    comment: 'Serial number of the RFID token used (S/N: 0927984580)'
  },
  two_factor_type: {
    type: DataTypes.ENUM('none', 'rfid', 'email', 'sms', 'totp'),
    allowNull: false,
    defaultValue: 'none',
    comment: 'Type of 2FA used for this login'
  },
  rfid_verification_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when RFID token was verified'
  },
  rfid_attempt_count: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of RFID attempts during this login session'
  },
  // ========== Email 2FA Fields ==========
  email_2fa_sent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indicates if email 2FA was sent'
  },
  email_2fa_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indicates if email 2FA was verified'
  },
  email_2fa_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when email 2FA was sent'
  },
  email_2fa_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when email 2FA was verified'
  },
  // ========== SMS 2FA Fields ==========
  sms_2fa_sent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indicates if SMS 2FA was sent'
  },
  sms_2fa_verified: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Indicates if SMS 2FA was verified'
  },
  sms_2fa_sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when SMS 2FA was sent'
  },
  sms_2fa_verified_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when SMS 2FA was verified'
  },
  sms_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to SMS record for tracking'
  },
  // ========== 2FA Session Fields ==========
  two_fa_session_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    trim: true,
    comment: 'Session ID for 2FA flow'
  },
  two_fa_method_used: {
    type: DataTypes.ENUM('none', 'rfid', 'email', 'sms'),
    allowNull: false,
    defaultValue: 'none',
    comment: 'Which 2FA method was ultimately used'
  },
  two_fa_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Total 2FA attempts for this login'
  },
  two_fa_completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Timestamp when 2FA was completed'
  }
}, {
  tableName: 'logins',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  getterMethods: {
    formatted_login_time() {
      return this.login_time ? new Date(this.login_time).toLocaleString() : 'N/A';
    },
    is_recent() {
      if (!this.login_time) return false;
      const now = new Date();
      const loginTime = new Date(this.login_time);
      const hoursDiff = (now - loginTime) / (1000 * 60 * 60);
      return hoursDiff < 24;
    },
    two_factor_status() {
      if (this.two_factor_type === 'none') return 'No 2FA';
      if (this.rfid_used && this.two_factor_type === 'rfid') return 'RFID Verified';
      if (this.email_2fa_verified && this.two_factor_type === 'email') return 'Email Verified';
      if (this.sms_2fa_verified && this.two_factor_type === 'sms') return 'SMS Verified';
      return '2FA Required';
    },
    rfid_token_display() {
      return this.rfid_token_serial || 'Not Used';
    },
    two_fa_summary() {
      const methods = [];
      if (this.rfid_used) methods.push('RFID');
      if (this.email_2fa_verified) methods.push('Email');
      if (this.sms_2fa_verified) methods.push('SMS');
      return methods.length > 0 ? methods.join(' + ') : 'None';
    }
  },
  indexes: [
    // Basic indexes
    { fields: ['user_id'] },
    { fields: ['user_name'] },
    { fields: ['username'] },
    { fields: ['status'] },
    { fields: ['success'] },
    { fields: ['login_time'] },
    { fields: ['ip_address'] },
    { fields: ['attempt_identifier'] },
    { fields: ['session_id'] },
    { fields: ['error_code'] },
    { fields: ['legacy_user_id'] },
    { fields: ['business_unit'] },
    { fields: ['role'] },
    // RFID indexes
    { fields: ['rfid_used'] },
    { fields: ['rfid_token_serial'] },
    // 2FA indexes
    { fields: ['two_factor_type'] },
    { fields: ['rfid_verification_time'] },
    { fields: ['email_2fa_verified'] },
    { fields: ['sms_2fa_verified'] },
    { fields: ['two_fa_session_id'] },
    { fields: ['two_fa_method_used'] },
    // Compound indexes
    { fields: ['user_name', 'login_time'] },
    { fields: ['ip_address', 'login_time'] },
    { fields: ['status', 'login_time'] },
    { fields: ['user_id', 'login_time'] },
    { fields: ['login_type', 'login_time'] },
    { fields: ['device_type', 'login_time'] },
    { fields: ['user_id', 'rfid_used'] },
    { fields: ['rfid_token_serial', 'login_time'] },
    { fields: ['two_factor_type', 'login_time'] },
    { fields: ['user_id', 'two_factor_type', 'success'] },
    { fields: ['email_2fa_sent', 'email_2fa_verified'] },
    { fields: ['sms_2fa_sent', 'sms_2fa_verified'] }
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
    constraints: false
  });
};

// ========== Static Methods ==========

// Get recent failed attempts
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

// Get user login history
Login.getUserLoginHistory = async function(userIdentifier, limit = 50) {
  let where = {};
  
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

// Get suspicious login attempts
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

// Clean old login records
Login.cleanOldRecords = async function(daysToKeep = 90) {
  const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000));
  
  return this.destroy({
    where: {
      login_time: { [Op.lt]: cutoffDate }
    }
  });
};

// Get login statistics
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
  
  // Get 2FA statistics
  const rfidLogins = await this.count({ where: { ...where, two_factor_type: 'rfid', success: true } });
  const emailLogins = await this.count({ where: { ...where, two_factor_type: 'email', success: true } });
  const smsLogins = await this.count({ where: { ...where, two_factor_type: 'sms', success: true } });
  
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
    twoFAStats: {
      rfid: rfidLogins,
      email: emailLogins,
      sms: smsLogins,
      total: rfidLogins + emailLogins + smsLogins
    },
    timeRange: {
      start: startDate || 'Beginning',
      end: endDate || 'Now'
    }
  };
};

// Get 2FA login statistics
Login.get2FAStatistics = async function(startDate = null, endDate = null) {
  const where = {};
  
  if (startDate) {
    where.login_time = where.login_time || {};
    where.login_time[Op.gte] = new Date(startDate);
  }
  
  if (endDate) {
    where.login_time = where.login_time || {};
    where.login_time[Op.lte] = new Date(endDate);
  }
  
  const total2FALogins = await this.count({
    where: {
      ...where,
      two_factor_type: { [Op.ne]: 'none' },
      success: true
    }
  });
  
  const methodStats = {
    rfid: await this.count({
      where: { ...where, two_factor_type: 'rfid', success: true }
    }),
    email: await this.count({
      where: { ...where, two_factor_type: 'email', success: true }
    }),
    sms: await this.count({
      where: { ...where, two_factor_type: 'sms', success: true }
    })
  };
  
  const failed2FA = await this.count({
    where: {
      ...where,
      two_factor_type: { [Op.ne]: 'none' },
      success: false,
      [Op.or]: [
        { error_code: 'TWO_FA_INVALID_TOKEN' },
        { error_code: 'TWO_FA_EXPIRED' },
        { error_code: 'TWO_FA_MAX_ATTEMPTS' }
      ]
    }
  });
  
  return {
    total2FALogins,
    methodStats,
    failed2FA,
    successRate: total2FALogins > 0 ? (total2FALogins / (total2FALogins + failed2FA) * 100).toFixed(2) : 0
  };
};

// ========== Instance Methods ==========

// Mark as successful login
Login.prototype.markAsSuccessful = async function(sessionId = null, userAgent = null) {
  this.status = 'Success';
  this.success = true;
  this.error = null;
  this.error_code = null;
  this.failed_attempts_count = 0;
  
  if (sessionId) {
    this.session_id = sessionId;
  }
  
  if (userAgent) {
    this.user_agent = userAgent;
  }
  
  return this.save();
};

// Mark as failed with specific error
Login.prototype.markAsFailed = async function(errorMessage, errorCode = null) {
  this.status = 'Failed';
  this.success = false;
  this.error = errorMessage;
  this.error_code = errorCode;
  this.failed_attempts_count = (this.failed_attempts_count || 0) + 1;
  
  return this.save();
};

// Mark as RFID 2FA login
Login.prototype.markAsRFIDLogin = async function(serialNumber, verificationTime = null) {
  this.rfid_used = true;
  this.rfid_token_serial = serialNumber;
  this.two_factor_type = 'rfid';
  this.rfid_verification_time = verificationTime || new Date();
  this.login_type = 'rfid_2fa';
  this.rfid_attempt_count = (this.rfid_attempt_count || 0) + 1;
  this.two_fa_method_used = 'rfid';
  this.two_fa_completed_at = new Date();
  this.status = 'Success';
  this.success = true;
  
  return this.save();
};

// Mark as Email 2FA login
Login.prototype.markAsEmail2FALogin = async function() {
  this.email_2fa_verified = true;
  this.email_2fa_verified_at = new Date();
  this.two_factor_type = 'email';
  this.login_type = 'email_2fa';
  this.two_fa_method_used = 'email';
  this.two_fa_completed_at = new Date();
  this.status = 'Success';
  this.success = true;
  
  return this.save();
};

// Mark as SMS 2FA login
Login.prototype.markAsSMS2FALogin = async function(smsId = null) {
  this.sms_2fa_verified = true;
  this.sms_2fa_verified_at = new Date();
  this.two_factor_type = 'sms';
  this.login_type = 'sms_2fa';
  this.two_fa_method_used = 'sms';
  this.two_fa_completed_at = new Date();
  this.status = 'Success';
  this.success = true;
  
  if (smsId) {
    this.sms_id = smsId;
  }
  
  return this.save();
};

// Mark RFID verification failure
Login.prototype.markRFIDFailed = async function(errorMessage) {
  this.rfid_attempt_count = (this.rfid_attempt_count || 0) + 1;
  this.error = errorMessage || 'RFID verification failed';
  this.error_code = 'RFID_VERIFICATION_FAILED';
  this.status = 'Failed';
  this.success = false;
  this.two_fa_attempts = (this.two_fa_attempts || 0) + 1;
  
  return this.save();
};

// Mark 2FA token failure (email/SMS)
Login.prototype.mark2FAFailed = async function(errorMessage, errorCode = 'TWO_FA_INVALID_TOKEN') {
  this.error = errorMessage || '2FA verification failed';
  this.error_code = errorCode;
  this.status = 'Failed';
  this.success = false;
  this.two_fa_attempts = (this.two_fa_attempts || 0) + 1;
  
  return this.save();
};

// Set 2FA session
Login.prototype.set2FASession = async function(sessionId, method) {
  this.two_fa_session_id = sessionId;
  this.two_factor_type = method;
  this.two_fa_attempts = 0;
  this.status = 'Pending_2FA';
  this.success = false;
  
  // Mark specific method as sent
  if (method === 'email') {
    this.email_2fa_sent = true;
    this.email_2fa_sent_at = new Date();
  } else if (method === 'sms') {
    this.sms_2fa_sent = true;
    this.sms_2fa_sent_at = new Date();
  }
  
  return this.save();
};

// Check if login is a 2FA login
Login.prototype.is2FALogin = function() {
  return this.two_factor_type !== 'none';
};

// Check if 2FA is pending
Login.prototype.is2FAPending = function() {
  return this.status === 'Pending_2FA' && this.two_factor_type !== 'none' && !this.success;
};

// Check if 2FA is completed
Login.prototype.is2FACompleted = function() {
  return this.success === true && this.two_factor_type !== 'none';
};

// Get 2FA method used
Login.prototype.get2FAMethod = function() {
  if (this.rfid_used && this.two_factor_type === 'rfid') return 'RFID';
  if (this.email_2fa_verified && this.two_factor_type === 'email') return 'Email';
  if (this.sms_2fa_verified && this.two_factor_type === 'sms') return 'SMS';
  return 'None';
};

// Get login details with 2FA info
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
    updatedAt: this.updated_at,
    // 2FA Details
    rfidUsed: this.rfid_used,
    rfidTokenSerial: this.rfid_token_serial,
    twoFactorType: this.two_factor_type,
    twoFactorStatus: this.two_factor_status,
    rfidVerificationTime: this.rfid_verification_time,
    rfidAttemptCount: this.rfid_attempt_count,
    rfidTokenDisplay: this.rfid_token_display,
    email2FASent: this.email_2fa_sent,
    email2FAVerified: this.email_2fa_verified,
    email2FASentAt: this.email_2fa_sent_at,
    email2FAVerifiedAt: this.email_2fa_verified_at,
    sms2FASent: this.sms_2fa_sent,
    sms2FAVerified: this.sms_2fa_verified,
    sms2FASentAt: this.sms_2fa_sent_at,
    sms2FAVerifiedAt: this.sms_2fa_verified_at,
    smsId: this.sms_id,
    twoFASessionId: this.two_fa_session_id,
    twoFAMethodUsed: this.two_fa_method_used,
    twoFAAttempts: this.two_fa_attempts,
    twoFACompletedAt: this.two_fa_completed_at,
    twoFASummary: this.two_fa_summary
  };
};

export default Login;