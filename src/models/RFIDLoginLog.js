// models/RFIDLoginLog.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

const RFIDLoginLog = sequelize.define('RFIDLoginLog', {
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
    }
  },
  token_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'rfid_tokens',
      key: 'id'
    }
  },
  // Physical token information
  serial_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'S/N: 0927984580'
  },
  batch_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'B/N: 0927965'
  },
  card_number: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  raw_data: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Login attempt details
  success: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  status: {
    type: DataTypes.ENUM(
      'Success', 
      'Failed', 
      'TokenNotFound', 
      'UserNotFound', 
      'InactiveToken', 
      'TokenNotAssigned',
      'TokenExpired',
      'Locked'
    ),
    allowNull: false,
    defaultValue: 'Failed'
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  error_code: {
    type: DataTypes.ENUM(
      'TOKEN_NOT_FOUND',
      'USER_NOT_FOUND',
      'INACTIVE_TOKEN',
      'ACCOUNT_LOCKED',
      'INVALID_PASSWORD',
      'TOKEN_EXPIRED',
      'TOKEN_NOT_ASSIGNED'
    ),
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: false,
    validate: {
      notNull: { msg: 'IP address is required' },
      notEmpty: true
    }
  },
  user_agent: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  session_id: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // 2FA context
  two_factor_step: {
    type: DataTypes.ENUM('initial_login', 'token_verification', 'completed'),
    allowNull: false,
    defaultValue: 'initial_login'
  },
  attempt_time: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  location_data: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  device_type: {
    type: DataTypes.ENUM('desktop', 'mobile', 'tablet', 'unknown'),
    allowNull: false,
    defaultValue: 'unknown'
  }
}, {
  tableName: 'rfid_login_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['token_id'] },
    { fields: ['serial_number'] },
    { fields: ['success'] },
    { fields: ['status'] },
    { fields: ['attempt_time'] },
    { fields: ['ip_address'] },
    { fields: ['user_id', 'attempt_time'] },
    { fields: ['serial_number', 'attempt_time'] },
    { fields: ['two_factor_step'] }
  ]
});

// Define associations
RFIDLoginLog.associate = (models) => {
  RFIDLoginLog.belongsTo(models.User, {
    foreignKey: 'user_id',
    as: 'user'
  });
  
  RFIDLoginLog.belongsTo(models.RFIDToken, {
    foreignKey: 'token_id',
    as: 'token'
  });
};

// Static methods
RFIDLoginLog.getRecentAttempts = async function(serialNumber, hours = 24) {
  const timeThreshold = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  return this.findAll({
    where: {
      serial_number: serialNumber,
      attempt_time: { [Op.gte]: timeThreshold }
    },
    order: [['attempt_time', 'DESC']]
  });
};

RFIDLoginLog.getFailedAttempts = async function(serialNumber, hours = 1) {
  const timeThreshold = new Date(Date.now() - (hours * 60 * 60 * 1000));
  
  return this.findAll({
    where: {
      serial_number: serialNumber,
      success: false,
      attempt_time: { [Op.gte]: timeThreshold }
    },
    order: [['attempt_time', 'DESC']]
  });
};

RFIDLoginLog.getUserLogs = async function(userId, limit = 50) {
  return this.findAll({
    where: { user_id: userId },
    order: [['attempt_time', 'DESC']],
    limit: limit,
    include: [{
      model: sequelize.models.RFIDToken,
      as: 'token',
      attributes: ['serial_number', 'batch_number', 'card_number']
    }]
  });
};

export default RFIDLoginLog;
