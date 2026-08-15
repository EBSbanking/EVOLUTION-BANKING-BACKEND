// models/VaultRoleAccessMatrix.js
export default (sequelize, DataTypes) => {
  const VaultRoleAccessMatrix = sequelize.define('VaultRoleAccessMatrix', {
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
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        len: { args: [1, 50], msg: 'Role must be between 1 and 50 characters' }
      }
    },
    access_level: {
      type: DataTypes.ENUM('VIEW', 'OPERATE', 'MANAGE', 'ADMIN'),
      defaultValue: 'VIEW'
    },
    can_view: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    can_operate: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    can_configure: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    can_approve: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
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
    tableName: 'vault_role_access_matrix',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['vault_id'] },
      { fields: ['role'] },
      { fields: ['access_level'] },
      { 
        name: 'idx_vault_role',
        fields: ['vault_id', 'role'],
        unique: true
      }
    ]
  });

  VaultRoleAccessMatrix.associate = function(models) {
    VaultRoleAccessMatrix.belongsTo(models.Vault, { 
      foreignKey: 'vault_id', 
      as: 'vault' 
    });
  };

  return VaultRoleAccessMatrix;
};
