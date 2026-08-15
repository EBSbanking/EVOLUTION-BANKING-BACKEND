// models/License.js - Minimal working version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const License = sequelize.define('License', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  issued_to: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  license_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  expires: {
    type: DataTypes.DATE,
    allowNull: false
  },
  encrypted_key: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  is_used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  max_users: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_branches: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  features: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'licenses',
  timestamps: false
});

export default License;
