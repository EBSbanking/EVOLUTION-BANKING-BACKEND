// src/models/Vault.js
import { DataTypes, Model, Op } from 'sequelize'; 
import sequelize from '../../config/db.js';

class Vault extends Model {
  // ==================== STATIC METHODS ====================
  
  static async findById(id) {
    return this.findByPk(id);
  }

  static async findByCode(vaultCode) {
    return this.findOne({
      where: { vault_cd: vaultCode }
    });
  }

  static async findByBranchCode(branchCode) {
    return this.findAll({
      where: { branch_code: branchCode }
    });
  }

  static async findActive() {
    return this.findAll({
      where: { is_active: true }
    });
  }

  static async findByStatus(status) {
    return this.findAll({
      where: { vault_status: status }
    });
  }

  static async getUtilization(vaultId) {
    const vault = await this.findByPk(vaultId);
    if (!vault) return null;
    
    const capacity = parseFloat(vault.vault_capacity) || 0;
    const balance = parseFloat(vault.cash_on_hand) || 0;
    const utilization = capacity > 0 ? (balance / capacity) * 100 : 0;
    
    return {
      capacity,
      balance,
      utilization: Math.round(utilization * 100) / 100,
      available: capacity - balance
    };
  }

  static async getBranchSummary(branchCode) {
    const vaults = await this.findAll({
      where: { branch_code: branchCode }
    });
    
    const summary = {
      totalVaults: vaults.length,
      activeVaults: vaults.filter(v => v.is_active).length,
      totalCapacity: 0,
      totalBalance: 0,
      totalAvailable: 0,
      vaults: vaults
    };
    
    vaults.forEach(vault => {
      const capacity = parseFloat(vault.vault_capacity) || 0;
      const balance = parseFloat(vault.cash_on_hand) || 0;
      summary.totalCapacity += capacity;
      summary.totalBalance += balance;
      summary.totalAvailable += (capacity - balance);
    });
    
    return summary;
  }

  static async hasSufficientCapacity(vaultId, amount) {
    const vault = await this.findByPk(vaultId);
    if (!vault) return false;
    
    const capacity = parseFloat(vault.vault_capacity) || 0;
    const balance = parseFloat(vault.cash_on_hand) || 0;
    return (balance + amount) <= capacity;
  }

  // ==================== INSTANCE METHODS ====================
  
  async updateBalance(amount, transaction = null) {
    const currentBalance = parseFloat(this.cash_on_hand) || 0;
    const newBalance = currentBalance + amount;
    
    if (newBalance < 0) {
      throw new Error('Insufficient vault balance');
    }
    
    this.cash_on_hand = newBalance;
    this.last_activity_date = new Date();
    
    if (transaction) {
      await this.save({ transaction });
    } else {
      await this.save();
    }
    
    return this;
  }

  get isOperational() {
    return this.vault_status === 'OPERATIONAL' && this.is_active;
  }

  get formattedCapacity() {
    return parseFloat(this.vault_capacity || 0).toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN'
    });
  }

  get formattedCashOnHand() {
    return parseFloat(this.cash_on_hand || 0).toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN'
    });
  }

  get utilizationPercentage() {
    const capacity = parseFloat(this.vault_capacity) || 1;
    const balance = parseFloat(this.cash_on_hand) || 0;
    return Math.round((balance / capacity) * 100);
  }

  get isNearCapacity() {
    return this.utilizationPercentage > 80;
  }

  get isOverCapacity() {
    return this.utilizationPercentage > 95;
  }
}

// ==================== MODEL INITIALIZATION ====================

Vault.init({
  id: { 
    type: DataTypes.INTEGER, 
    autoIncrement: true, 
    primaryKey: true 
  },
  
  vault_id: { 
    type: DataTypes.INTEGER, 
    allowNull: false, 
    unique: true,
    validate: {
      isInt: true,
      min: 1
    }
  },
  
  vault_cd: { 
    type: DataTypes.STRING(20), 
    allowNull: false, 
    unique: true,
    validate: {
      len: [1, 20]
    }
  },
  
  vault_nm: { 
    type: DataTypes.STRING(100), 
    allowNull: false,
    validate: {
      len: [1, 100]
    }
  },

  drawer_id: { 
    type: DataTypes.INTEGER, 
    allowNull: false,
    validate: {
      isInt: true,
      min: 1
    }
  },
  
  drawer_ref: { 
    type: DataTypes.INTEGER,
    allowNull: true
  },
  
  branch_ref: { 
    type: DataTypes.INTEGER,
    allowNull: true
  },
  
  branch_code: { 
    type: DataTypes.STRING(10),
    allowNull: true
  },
  
  location_code: { 
    type: DataTypes.STRING(20),
    allowNull: true
  },

  vault_category: { 
    type: DataTypes.ENUM(
      'MAIN_VAULT',
      'BRANCH_VAULT',
      'TEMPORARY_VAULT',
      'CASH_VAULT',
      'BULLION_VAULT',
      'HIGH_SECURITY_VAULT'
    ), 
    defaultValue: 'BRANCH_VAULT', 
    allowNull: false 
  },
  
  security_level: { 
    type: DataTypes.ENUM(
      'LEVEL_1',
      'LEVEL_2',
      'LEVEL_3',
      'LEVEL_4'
    ), 
    defaultValue: 'LEVEL_2', 
    allowNull: false 
  },
  
  requires_dual_control: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },
  
  min_authorized_persons: { 
    type: DataTypes.INTEGER, 
    defaultValue: 2,
    validate: {
      min: 1,
      max: 10
    }
  },
  
  max_authorized_persons: { 
    type: DataTypes.INTEGER, 
    defaultValue: 4,
    validate: {
      min: 1,
      max: 20
    }
  },

  vault_capacity: { 
    type: DataTypes.DECIMAL(20, 2), 
    defaultValue: 10000000.00,
    validate: {
      min: 0
    }
  },
  
  total_compartments: { 
    type: DataTypes.INTEGER, 
    defaultValue: 10,
    validate: {
      min: 1
    }
  },
  
  available_compartments: { 
    type: DataTypes.INTEGER, 
    defaultValue: 10,
    validate: {
      min: 0
    }
  },

  access_opening_time: { 
    type: DataTypes.TIME,
    allowNull: true
  },
  
  access_closing_time: { 
    type: DataTypes.TIME,
    allowNull: true
  },
  
  after_hours_access: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: false 
  },

  security_breach_count: { 
    type: DataTypes.INTEGER, 
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  
  last_security_check: { 
    type: DataTypes.DATE,
    allowNull: true
  },
  
  next_security_audit: { 
    type: DataTypes.DATE,
    allowNull: true
  },

  insurance_policy_number: { 
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  insurance_company: { 
    type: DataTypes.STRING(100),
    allowNull: true
  },
  
  insurance_coverage_amount: { 
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },

  maintenance_last_date: { 
    type: DataTypes.DATE,
    allowNull: true
  },
  
  maintenance_next_date: { 
    type: DataTypes.DATE,
    allowNull: true
  },
  
  maintenance_frequency: { 
    type: DataTypes.INTEGER, 
    defaultValue: 90,
    validate: {
      min: 1
    }
  },

  cash_on_hand: { 
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0,
    validate: {
      min: 0
    }
  },
  
  limit_max_single_deposit: { 
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  
  limit_max_single_withdrawal: { 
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  
  limit_daily_deposit: { 
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },
  
  limit_daily_withdrawal: { 
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    validate: {
      min: 0
    }
  },

  vault_status: { 
    type: DataTypes.ENUM(
      'OPERATIONAL',
      'MAINTENANCE',
      'EMERGENCY_LOCKDOWN',
      'INVENTORY',
      'DECOMMISSIONED'
    ), 
    defaultValue: 'OPERATIONAL', 
    allowNull: false 
  },
  
  is_active: { 
    type: DataTypes.BOOLEAN, 
    defaultValue: true 
  },

  created_by: { 
    type: DataTypes.STRING(24), 
    allowNull: false,
    validate: {
      len: [1, 24]
    }
  },
  
  updated_by: { 
    type: DataTypes.STRING(24),
    allowNull: true
  },
  
  last_activity_date: { 
    type: DataTypes.DATE, 
    defaultValue: DataTypes.NOW 
  }

}, {
  sequelize,
  modelName: 'Vault',
  tableName: 'vaults',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  hooks: {
    beforeCreate: (vault) => {
      if (!vault.created_by) {
        throw new Error('created_by is required');
      }
      if (!vault.last_activity_date) {
        vault.last_activity_date = new Date();
      }
      if (!vault.vault_status) {
        vault.vault_status = 'OPERATIONAL';
      }
      if (!vault.is_active) {
        vault.is_active = true;
      }
      if (vault.vault_capacity && parseFloat(vault.vault_capacity) < 0) {
        throw new Error('vault_capacity cannot be negative');
      }
    },
    
    beforeUpdate: (vault) => {
      vault.last_activity_date = new Date();
      if (vault.changed('is_active') && vault.is_active === false) {
        vault.vault_status = 'DECOMMISSIONED';
      }
    }
  },
  
  indexes: [
    { fields: ['vault_id'], unique: true },
    { fields: ['vault_cd'], unique: true },
    { fields: ['branch_code'] },
    { fields: ['drawer_id'] },
    { fields: ['vault_status'] },
    { fields: ['is_active'] },
    { fields: ['created_by'] },
    { fields: ['branch_code', 'vault_status'] },
    { fields: ['vault_category'] },
    { fields: ['security_level'] }
  ],
  
  scopes: {
    active: { where: { is_active: true } },
    operational: { where: { vault_status: 'OPERATIONAL', is_active: true } },
    maintenance: { where: { vault_status: 'MAINTENANCE' } },
    byBranch: (branchCode) => ({ where: { branch_code: branchCode } }),
    byCategory: (category) => ({ where: { vault_category: category } }),
    bySecurityLevel: (level) => ({ where: { security_level: level } }),
    byCreator: (userId) => ({ where: { created_by: userId } }),
    highSecurity: { where: { security_level: { [Op.in]: ['LEVEL_3', 'LEVEL_4'] } } }
  }
});

export default Vault;
