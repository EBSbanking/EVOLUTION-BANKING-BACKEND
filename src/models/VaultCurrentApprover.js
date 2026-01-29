// models/VaultCurrentApprover.js
export default (sequelize, DataTypes) => {
  const VaultCurrentApprover = sequelize.define('VaultCurrentApprover', {
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
    approver_id: {
      type: DataTypes.STRING(24),
      allowNull: false,
      validate: {
        len: { args: [1, 24], msg: 'Approver ID must be between 1 and 24 characters' }
      }
    },
    approver_role: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        len: { args: [1, 50], msg: 'Approver role must be between 1 and 50 characters' }
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
    status: {
      type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED'),
      defaultValue: 'PENDING'
    },
    approved_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    comments: {
      type: DataTypes.TEXT,
      allowNull: true,
      validate: {
        len: { args: [0, 1000], msg: 'Comments must not exceed 1000 characters' }
      }
    },
    is_escalated: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    escalated_to: {
      type: DataTypes.STRING(24),
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
    tableName: 'vault_current_approvers',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['approval_id'] },
      { fields: ['approver_id'] },
      { fields: ['status'] },
      { fields: ['approval_order'] },
      { 
        name: 'idx_approval_approver',
        fields: ['approval_id', 'approver_id'] 
      },
      { 
        name: 'idx_approval_status',
        fields: ['approval_id', 'status'] 
      }
    ]
  });

  VaultCurrentApprover.associate = function(models) {
    VaultCurrentApprover.belongsTo(models.VaultPendingApproval, {
      foreignKey: 'approval_id',
      targetKey: 'approval_id',
      as: 'approval'
    });
  };

  return VaultCurrentApprover;
};