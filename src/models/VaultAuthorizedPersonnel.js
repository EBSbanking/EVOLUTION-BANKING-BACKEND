// models/VaultAuthorizedPersonnel.js
import { Model, DataTypes } from 'sequelize';

export default (sequelize, DataTypes) => {
  class VaultAuthorizedPersonnel extends Model {
    static associate(models) {
      this.belongsTo(models.Vault, { foreignKey: 'vault_id', as: 'vault' });
    }
  }

  VaultAuthorizedPersonnel.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    vault_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'vaults',
        key: 'id'
      }
    },
    user_id: {
      type: DataTypes.STRING(24),
      allowNull: false,
      validate: {
        len: { args: [1, 24], msg: 'User ID must be between 1 and 24 characters' }
      }
    },
    user_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        len: { args: [1, 100], msg: 'User name must be between 1 and 100 characters' }
      }
    },
    user_role: {
      type: DataTypes.ENUM('VAULT_MANAGER', 'SUPERVISOR', 'TELLER', 'CASH_OFFICER', 'AUDITOR', 'BRANCH_MANAGER', 'HEAD_TELLER', 'BRANCH_OFFICER_SUPERVISOR'),
      allowNull: false
    },
    access_level: {
      type: DataTypes.ENUM('FULL', 'LIMITED', 'VIEW_ONLY', 'EMERGENCY'),
      defaultValue: 'LIMITED'
    },
    authorization_start: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      validate: {
        isDate: { msg: 'Authorization start must be a valid date' },
        isBefore: { args: [new Date().toISOString()], msg: 'Authorization start cannot be in the future' }
      }
    },
    authorization_end: {
      type: DataTypes.DATE,
      validate: {
        isDate: { msg: 'Authorization end must be a valid date' },
        customValidator(value) {
          if (value && value <= this.authorization_start) {
            throw new Error('Authorization end date must be after start date');
          }
        }
      }
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    authorized_by: {
      type: DataTypes.STRING(24),
      allowNull: false,
      validate: {
        len: { args: [1, 24], msg: 'Authorized by must be between 1 and 24 characters' }
      }
    },
    authorization_notes: {
      type: DataTypes.TEXT,
      validate: {
        len: { args: [0, 500], msg: 'Authorization notes cannot exceed 500 characters' }
      }
    }
  }, {
    sequelize,
    modelName: 'VaultAuthorizedPersonnel',
    tableName: 'vault_authorized_personnel',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['vault_id', 'user_id', 'is_active'] },
      { fields: ['vault_id'] },
      { fields: ['user_id'] },
      { fields: ['user_role'] },
      { fields: ['is_active'] },
      { fields: ['access_level'] },
      { fields: ['authorization_start', 'authorization_end'] }
    ]
  });

  return VaultAuthorizedPersonnel;
};