// src/models/RolesVw.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const RolesVw = sequelize.define('RolesVw', {
  role_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
  },
  role_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'roles_vw',
  timestamps: false, // View doesn't have timestamps
  underscored: false,
  freezeTableName: true,
});

export default RolesVw;