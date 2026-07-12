// src/models/RoleModule.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class RoleModule extends Model {}

RoleModule.init(
  {
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'roles',
        key: 'role_id',
      },
      onDelete: 'CASCADE',
    },
    moduleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true,
      references: {
        model: 'modules',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
  },
  {
    sequelize,
    modelName: 'RoleModule',
    tableName: 'role_modules',
    timestamps: false,
    underscored: false, // keep camelCase for column names
  }
);

export default RoleModule;