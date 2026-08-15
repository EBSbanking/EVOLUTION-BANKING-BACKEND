// models/EMTLAuditLog.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const EMTLAuditLog = sequelize.define('EMTLAuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  POLICY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'policy_id'
  },
  FIELD_CHANGED: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'field_changed'
  },
  OLD_VALUE: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'old_value'
  },
  NEW_VALUE: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'new_value'
  },
  CHANGED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'changed_by'
  },
  CHANGE_REASON: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'change_reason'
  },
  IP_ADDRESS: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'ip_address'
  },
  USER_AGENT: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'user_agent'
  },
  CHANGED_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'changed_date'
  }
}, {
  tableName: 'emtl_audit_logs',
  timestamps: true,
  createdAt: 'CHANGED_DATE',
  updatedAt: false,
  underscored: false,
  indexes: [
    {
      unique: false,
      fields: ['policy_id']
    },
    {
      unique: false,
      fields: ['changed_by']
    },
    {
      unique: false,
      fields: ['changed_date']
    }
  ]
});

// Helper methods
EMTLAuditLog.logChange = async (data) => {
  try {
    return await EMTLAuditLog.create({
      POLICY_ID: data.policyId,
      FIELD_CHANGED: data.field || 'MULTIPLE_FIELDS',
      OLD_VALUE: data.oldValues ? JSON.stringify(data.oldValues) : null,
      NEW_VALUE: data.newValues ? JSON.stringify(data.newValues) : null,
      CHANGED_BY: data.changedBy,
      CHANGE_REASON: data.reason || 'Policy update',
      IP_ADDRESS: data.ipAddress || null,
      USER_AGENT: data.userAgent || null,
      CHANGED_DATE: new Date()
    });
  } catch (error) {
    console.error('Error logging EMTL audit:', error.message);
    throw error;
  }
};

EMTLAuditLog.getAuditTrail = async (policyId, limit = 100) => {
  try {
    const whereClause = {};
    if (policyId) {
      whereClause.POLICY_ID = policyId;
    }
    
    return await EMTLAuditLog.findAll({
      where: whereClause,
      order: [['CHANGED_DATE', 'DESC']],
      limit: limit
    });
  } catch (error) {
    console.error('Error getting EMTL audit trail:', error.message);
    throw error;
  }
};

EMTLAuditLog.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS emtl_audit_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        policy_id INT NOT NULL,
        field_changed VARCHAR(50) NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_by VARCHAR(50) NOT NULL,
        change_reason TEXT,
        ip_address VARCHAR(50),
        user_agent TEXT,
        changed_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_policy_id (policy_id),
        INDEX idx_changed_by (changed_by),
        INDEX idx_changed_date (changed_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ EMTL audit logs table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing EMTL audit logs table:', error.message);
    return false;
  }
};

export default EMTLAuditLog;
