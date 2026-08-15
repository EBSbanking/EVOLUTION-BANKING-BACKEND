// models/AMLSystemConfig.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const AMLSystemConfig = sequelize.define('AMLSystemConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.STRING(50),
    defaultValue: 'SYSTEM_CONFIG',
    unique: true,
    allowNull: false
  },
  configs: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  created_by: {
    type: DataTypes.STRING(100),
    defaultValue: 'system'
  },
  updated_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  update_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'aml_system_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
 
});

export default AMLSystemConfig;
