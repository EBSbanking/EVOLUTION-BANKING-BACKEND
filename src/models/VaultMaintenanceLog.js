// models/VaultMaintenanceLog.js
export default (sequelize, DataTypes) => {
  const VaultMaintenanceLog = sequelize.define('VaultMaintenanceLog', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    vault_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    maintenance_type: {
      type: DataTypes.ENUM('ROUTINE', 'EMERGENCY', 'UPGRADE', 'REPAIR'),
      allowNull: false
    },
    performed_by: {
      type: DataTypes.STRING(24),
      allowNull: false
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
      defaultValue: 'SCHEDULED'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  }, {
    tableName: 'vault_maintenance_logs',
    timestamps: true,
    underscored: true
  });

  VaultMaintenanceLog.associate = function(models) {
    VaultMaintenanceLog.belongsTo(models.Vault, { 
      foreignKey: 'vault_id', 
      as: 'vault' 
    });
  };

  return VaultMaintenanceLog;
};