// models/Notification.js - FIXED VERSION WITH PROPER IMPORT
import { DataTypes, Model, Op } from 'sequelize';
import { sequelize } from '../../config/db.js'; // FIXED: Use named import

class Notification extends Model {}

Notification.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  ROLE_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Target role (e.g., Supervisor, Manager)',
    field: 'ROLE_ID'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: 'Notification content',
    field: 'message'
  },
  WORK_ITEM_ID: {
    type: DataTypes.STRING(50), // Changed to STRING to match your WORK_ITEM_ID format
    allowNull: false,
    comment: 'Associated workflow item ID',
    field: 'WORK_ITEM_ID'
  },
  EVENT_ID: {
    type: DataTypes.STRING(50), // Changed to STRING to match your EVENT_ID format
    allowNull: true,
    comment: 'Optional event ID for tracking',
    field: 'EVENT_ID'
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'viewed', 'read', 'archived', 'failed'),
    defaultValue: 'pending',
    comment: 'Status of the notification',
    field: 'status'
  },
  notification_type: { // Changed to match your SQL lowercase format
    type: DataTypes.ENUM('system', 'email', 'sms', 'push', 'in_app', 'whatsapp'),
    defaultValue: 'system',
    comment: 'Type of notification',
    field: 'notification_type'
  },
  recipient_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Specific user ID if notification is for a specific user',
    field: 'recipient_id'
  },
  recipient_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Name of the recipient',
    field: 'recipient_name'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium',
    comment: 'Priority level of notification',
    field: 'priority'
  },
  metadata: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON string for additional data',
    field: 'metadata',
    get() {
      const rawValue = this.getDataValue('metadata');
      try {
        return rawValue ? JSON.parse(rawValue) : {};
      } catch (error) {
        console.error('Error parsing metadata JSON:', error);
        return {};
      }
    },
    set(value) {
      this.setDataValue('metadata', value ? JSON.stringify(value) : null);
    }
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When notification was sent',
    field: 'sent_at'
  },
  viewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When notification was viewed',
    field: 'viewed_at'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'When notification expires',
    field: 'expires_at'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'Notification',
  tableName: 'notifications',
  timestamps: false, // Set to false since we're managing timestamps manually
  freezeTableName: true,
  hooks: {
    beforeCreate: (notification) => {
      // Ensure status is lowercase
      if (notification.status) {
        notification.status = notification.status.toLowerCase();
      }
      
      // Ensure notification_type is lowercase
      if (notification.notification_type) {
        notification.notification_type = notification.notification_type.toLowerCase();
      }
      
      // Ensure priority is lowercase
      if (notification.priority) {
        notification.priority = notification.priority.toLowerCase();
      }
    },
    
    beforeUpdate: (notification) => {
      // Auto-update timestamps based on status changes
      if (notification.changed('status')) {
        const now = new Date();
        const status = notification.status.toLowerCase();
        
        if (status === 'sent' && !notification.sent_at) {
          notification.sent_at = now;
        }
        
        if (status === 'viewed' && !notification.viewed_at) {
          notification.viewed_at = now;
        }
      }
    }
  }
});

// Static methods
Notification.findPendingByRole = async function(roleId, options = {}) {
  const { limit = 100, priority } = options;
  
  const where = {
    ROLE_ID: roleId,
    status: 'pending'
  };
  
  if (priority) {
    where.priority = priority.toLowerCase();
  }
  
  return await this.findAll({
    where,
    order: [
      ['priority', 'DESC'],
      ['created_at', 'ASC']
    ],
    limit
  });
};

Notification.findUnreadByUser = async function(userId, roleId, options = {}) {
  const { limit = 50 } = options;
  
  const where = {
    [Op.or]: [
      { recipient_id: userId },
      { ROLE_ID: roleId }
    ],
    status: { [Op.in]: ['sent', 'pending'] }
  };
  
  return await this.findAll({
    where,
    order: [['created_at', 'DESC']],
    limit
  });
};

// Instance methods
Notification.prototype.markAsViewed = async function() {
  this.status = 'viewed';
  this.viewed_at = new Date();
  return await this.save();
};

Notification.prototype.markAsSent = async function() {
  this.status = 'sent';
  this.sent_at = new Date();
  return await this.save();
};

Notification.prototype.isExpired = function() {
  if (!this.expires_at) return false;
  return new Date() > this.expires_at;
};

export default Notification;