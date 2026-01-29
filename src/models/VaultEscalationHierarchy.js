// models/VaultEscalationHierarchy.js
export default (sequelize, DataTypes) => {
  const VaultEscalationHierarchy = sequelize.define('VaultEscalationHierarchy', {
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
    escalation_level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: { args: [1], msg: 'Escalation level must be at least 1' }
      }
    },
    role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        len: { args: [1, 50], msg: 'Role must be between 1 and 50 characters' }
      }
    },
    user_id: {
      type: DataTypes.STRING(24),
      allowNull: true,
      validate: {
        len: { args: [0, 24], msg: 'User ID must be between 0 and 24 characters' }
      }
    },
    notification_method: {
      type: DataTypes.ENUM('EMAIL', 'SMS', 'IN_APP', 'ALL'),
      defaultValue: 'EMAIL'
    },
    response_time_hours: {
      type: DataTypes.INTEGER,
      defaultValue: 24,
      validate: {
        min: { args: [1], msg: 'Response time must be at least 1 hour' }
      }
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
    tableName: 'vault_escalation_hierarchy',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['vault_id'] },
      { fields: ['escalation_level'] },
      { fields: ['role'] },
      { 
        name: 'idx_vault_level',
        fields: ['vault_id', 'escalation_level'],
        unique: true
      }
    ]
  });

  VaultEscalationHierarchy.associate = function(models) {
    VaultEscalationHierarchy.belongsTo(models.Vault, { 
      foreignKey: 'vault_id', 
      as: 'vault' 
    });
  };

  return VaultEscalationHierarchy;
};