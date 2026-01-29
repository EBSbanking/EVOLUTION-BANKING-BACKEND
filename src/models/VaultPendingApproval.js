// models/VaultPendingApproval.js - Factory function
export default (sequelize, DataTypes) => {
  const VaultPendingApproval = sequelize.define('VaultPendingApproval', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    vault_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    approval_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    // ... other fields
  }, {
    tableName: 'vault_pending_approvals',
    timestamps: true,
    underscored: true
  });

  VaultPendingApproval.associate = function(models) {
    VaultPendingApproval.belongsTo(models.Vault, { 
      foreignKey: 'vault_id', 
      as: 'vault' 
    });
    
    VaultPendingApproval.hasMany(models.VaultApprovalRequiredRole, { 
      foreignKey: 'approval_id', 
      sourceKey: 'approval_id',
      as: 'required_roles' 
    });
    
    VaultPendingApproval.hasMany(models.VaultCurrentApprover, { 
      foreignKey: 'approval_id', 
      sourceKey: 'approval_id',
      as: 'current_approvers' 
    });
  };

  return VaultPendingApproval;
};