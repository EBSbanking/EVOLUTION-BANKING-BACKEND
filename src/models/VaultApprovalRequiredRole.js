// models/VaultApprovalRequiredRole.js
export default (sequelize, DataTypes) => {
  const VaultApprovalRequiredRole = sequelize.define('VaultApprovalRequiredRole', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    approval_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      references: {
        model: 'vault_pending_approvals',
        key: 'approval_id'
      }
    },
    required_role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        len: { args: [1, 50], msg: 'Required role must be between 1 and 50 characters' }
      }
    },
    approval_order: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: { args: [1], msg: 'Approval order must be at least 1' }
      }
    },
    min_approvers_required: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: { args: [1], msg: 'Minimum approvers required must be at least 1' }
      }
    },
    is_mandatory: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
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
    tableName: 'vault_approval_required_roles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['approval_id'] },
      { fields: ['required_role'] },
      { fields: ['approval_order'] },
      { 
        name: 'idx_approval_role_order',
        fields: ['approval_id', 'approval_order'] 
      }
    ]
  });

  VaultApprovalRequiredRole.associate = function(models) {
    VaultApprovalRequiredRole.belongsTo(models.VaultPendingApproval, {
      foreignKey: 'approval_id',
      targetKey: 'approval_id',
      as: 'approval'
    });
  };

  return VaultApprovalRequiredRole;
};