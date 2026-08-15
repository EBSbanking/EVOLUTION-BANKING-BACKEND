// models/UserActivityLog.js

import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class UserActivityLog extends Model {
  static associate(models) {
    // Association with User
    this.belongsTo(models.User, {
      foreignKey: 'user_id',
      targetKey: 'id',
      as: 'User'
    });
    
    // Association with UserSession
    this.belongsTo(models.UserSession, {
      foreignKey: 'session_id',
      targetKey: 'id',
      as: 'Session'
    });
  }
}

UserActivityLog.init(
  {
    id: {
      type: DataTypes.INTEGER,  // ✅ Match users.id type
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,  // ✅ Match users.id type
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    session_id: {
      type: DataTypes.INTEGER,  // ✅ Match user_sessions.id type
      allowNull: true,
      references: {
        model: 'user_sessions',
        key: 'id'
      }
    },
    action_type: {
      type: DataTypes.ENUM(
        'LOGIN',
        'LOGOUT',
        'VIEW_PAGE',
        'SEARCH',
        'CREATE',
        'UPDATE',
        'DELETE',
        'EXPORT',
        'IMPORT',
        'PRINT',
        'DOWNLOAD',
        'API_CALL',
        'ERROR'
      ),
      allowNull: false,
      defaultValue: 'VIEW_PAGE'
    },
    action: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    method: {
      type: DataTypes.STRING(10),
      allowNull: true
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    request_body: {
      type: DataTypes.JSON,
      allowNull: true
    },
    response_status: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    response_time: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    error_message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'UserActivityLog',
    tableName: 'user_activity_logs',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default UserActivityLog;
