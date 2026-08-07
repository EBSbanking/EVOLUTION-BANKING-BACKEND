// models/UserSession.js

import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class UserSession extends Model {
  static associate(models) {
    // ✅ Use 'User' as the alias (matches the include in sessionTracker)
    this.belongsTo(models.User, { 
      foreignKey: 'user_id', 
      targetKey: 'id',
      as: 'User'  // ← This must match the include alias
    });
  }
}

UserSession.init(
  {
    id: {
      type: DataTypes.INTEGER,  // ✅ Changed from BIGINT to INT to match users.id
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,  // ✅ Changed from BIGINT to INT to match users.id
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    session_id: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    token: {
      type: DataTypes.TEXT,
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
    login_time: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    last_activity: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    logout_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    device_type: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    browser: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    os: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    session_duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0
    },
    request_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    last_request_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    },
    last_request_method: {
      type: DataTypes.STRING(10),
      allowNull: true
    }
  },
  {
    sequelize,
    modelName: 'UserSession',
    tableName: 'user_sessions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
  }
);

export default UserSession;