// models/VaultAccessAttempt.js
export default (sequelize, DataTypes) => {
  const VaultAccessAttempt = sequelize.define('VaultAccessAttempt', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    vault_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    user_id: {
      type: DataTypes.STRING(24),
      allowNull: false
    },
    attempt_type: {
      type: DataTypes.ENUM('ACCESS', 'AUTHENTICATION', 'TRANSACTION'),
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM('SUCCESS', 'FAILED', 'BLOCKED'),
      allowNull: false
    },
    ip_address: {
      type: DataTypes.STRING(45),
      allowNull: true
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'vault_access_attempts',
    timestamps: true,
    underscored: true
  });

  VaultAccessAttempt.associate = function(models) {
    VaultAccessAttempt.belongsTo(models.Vault, { 
      foreignKey: 'vault_id', 
      as: 'vault' 
    });
  };

  return VaultAccessAttempt;
};