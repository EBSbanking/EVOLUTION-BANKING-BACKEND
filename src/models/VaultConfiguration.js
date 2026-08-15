// src/models/VaultConfiguration.js - FIXED
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultConfiguration extends Model {
  // ==================== STATIC METHODS ====================
  
  static async findByVaultId(vaultId) {
    return this.findOne({
      where: { vault_id: vaultId }
    });
  }

  static async findByCategory(category) {
    return this.findAll({
      where: { category, is_active: true }
    });
  }

  static async getActiveConfigurations(vaultId) {
    return this.findAll({
      where: { 
        vault_id: vaultId,
        is_active: true 
      }
    });
  }

  static async getConfigurationByKey(vaultId, configKey) {
    return this.findOne({
      where: { 
        vault_id: vaultId,
        config_key: configKey,
        is_active: true 
      }
    });
  }

  // ==================== INSTANCE METHODS ====================
  
  get isActive() {
    return this.is_active === true || this.is_active === 1;
  }

  get formattedConfigValue() {
    try {
      return typeof this.config_value === 'string' 
        ? JSON.parse(this.config_value) 
        : this.config_value;
    } catch {
      return this.config_value;
    }
  }
}

// ==================== MODEL INITIALIZATION ====================

VaultConfiguration.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  vault_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'vaults',
      key: 'id'
    },
    validate: {
      notNull: { msg: 'vault_id is required' }
    }
  },
  config_key: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      len: { args: [1, 50], msg: 'config_key must be between 1 and 50 characters' }
    }
  },
  config_value: {
    type: DataTypes.JSON,
    allowNull: true
  },
  category: {
    type: DataTypes.ENUM('SECURITY', 'OPERATIONS', 'MAINTENANCE', 'PERSONNEL', 'LIMITS'),
    allowNull: false
  },
  updated_by: {
    type: DataTypes.STRING(24),
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true  // ✅ Fixed: was 'falses' before
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
  sequelize,
  modelName: 'VaultConfiguration',
  tableName: 'vault_configurations',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  hooks: {
    beforeCreate: (config) => {
      if (config.is_active === undefined || config.is_active === null) {
        config.is_active = true;  // ✅ Fixed: was 'falses' before
      }
      if (!config.created_at) config.created_at = new Date();
      if (!config.updated_at) config.updated_at = new Date();
    },
    beforeUpdate: (config) => {
      config.updated_at = new Date();
    }
  },
  
  indexes: [
    { fields: ['vault_id'], unique: true },
    { fields: ['category'] },
    { fields: ['config_key'] },
    { fields: ['is_active'] },
    { fields: ['vault_id', 'category'] },
    { fields: ['vault_id', 'is_active'] },
    { fields: ['category', 'is_active'] }
  ],
  
  scopes: {
    active: { where: { is_active: true } },
    inactive: { where: { is_active: false } },
    byCategory: (category) => ({ where: { category } }),
    byVault: (vaultId) => ({ where: { vault_id: vaultId } }),
    security: { where: { category: 'SECURITY' } },
    operations: { where: { category: 'OPERATIONS' } },
    maintenance: { where: { category: 'MAINTENANCE' } },
    personnel: { where: { category: 'PERSONNEL' } },
    limits: { where: { category: 'LIMITS' } }
  }
});

export default VaultConfiguration;
