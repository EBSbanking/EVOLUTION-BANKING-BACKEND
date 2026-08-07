// models/ForbiddenPassword.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class ForbiddenPassword extends Model {}

ForbiddenPassword.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'Forbidden password that cannot be used by users',
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      comment: 'Whether this forbidden password is active',
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who added this password to forbidden list',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'ForbiddenPassword',
    tableName: 'forbidden_passwords',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        fields: ['password'],
        unique: true,
      },
      {
        fields: ['is_active'],
      },
    ],
  }
);

export default ForbiddenPassword;