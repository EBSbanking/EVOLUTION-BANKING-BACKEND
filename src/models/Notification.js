// models/Notification.js
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../../config/db.js';

class Notification extends Model {}

Notification.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
  },
  ROLE_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'User',
    // ✅ Add field mapping to match database exactly
    field: 'ROLE_ID',
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  WORK_ITEM_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'N/A',
    // ✅ Add field mapping to match database exactly
    field: 'WORK_ITEM_ID',
  },
  EVENT_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    // ✅ Add field mapping to match database exactly
    field: 'EVENT_ID',
  },
  status: {
    type: DataTypes.ENUM('pending', 'sent', 'viewed', 'read', 'archived', 'failed'),
    defaultValue: 'pending',
  },
  notification_type: {
    type: DataTypes.ENUM('system', 'email', 'sms', 'push', 'in_app', 'whatsapp'),
    defaultValue: 'system',
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium',
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
  },
  recipient_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  recipient_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  viewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  }
}, {
  sequelize,
  modelName: 'Notification',
  tableName: 'notifications',
  timestamps: false,
  // ✅ Add these to prevent automatic field transformation
  underscored: false,
  freezeTableName: true,
  hooks: {
    beforeCreate: (notification) => {
      const now = new Date();
      notification.created_at = now;
      notification.updated_at = now;
      
      // Ensure ROLE_ID has a value
      if (!notification.ROLE_ID) {
        notification.ROLE_ID = 'User';
      }
      
      // Ensure WORK_ITEM_ID has a value
      if (!notification.WORK_ITEM_ID) {
        notification.WORK_ITEM_ID = 'N/A';
      }
      
      // Auto-fill user_id from recipient_id if user_id is null
      if (!notification.user_id && notification.recipient_id) {
        notification.user_id = notification.recipient_id;
      }
      if (!notification.user_id) {
        notification.user_id = 1;
      }
    },
    beforeUpdate: (notification) => {
      notification.updated_at = new Date();
      
      // Auto-fill user_id from recipient_id if user_id is null
      if (!notification.user_id && notification.recipient_id) {
        notification.user_id = notification.recipient_id;
      }
      
      if (notification.changed('status')) {
        const status = notification.status;
        if (status === 'sent' && !notification.sent_at) {
          notification.sent_at = new Date();
        }
        if (status === 'viewed' && !notification.viewed_at) {
          notification.viewed_at = new Date();
        }
      }
    }
  }
});

export default Notification;