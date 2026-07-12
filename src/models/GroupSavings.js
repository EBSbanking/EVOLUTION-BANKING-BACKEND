// models/GroupSavings.js - UPDATED with automatic column creation

import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Group from './Group.js';

// SAFE UTILITY FUNCTIONS
const safeParseFloat = (value, defaultValue = 0) => {
  if (!value && value !== 0) return defaultValue;
  try {
    if (typeof value === 'object' && value.toString) {
      return parseFloat(value.toString()) || defaultValue;
    }
    return parseFloat(value) || defaultValue;
  } catch (error) {
    return defaultValue;
  }
};

const safeString = (value, defaultValue = '') => {
  if (!value) return defaultValue;
  try {
    return String(value);
  } catch (error) {
    return defaultValue;
  }
};

class GroupSavings extends Model {
  // ============================================
  // 🔧 AUTO‑FIX MISSING COLUMNS
  // ============================================
  static async ensureColumns() {
    const columns = ['LEDGER_BAL', 'CLEARED_BAL', 'AVAILABLE_BALANCE'];
    const tableName = 'GroupSavings';
    
    for (const col of columns) {
      try {
        // Check if column exists
        const [results] = await sequelize.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
          { replacements: [tableName, col] }
        );
        if (results.length === 0) {
          // Column missing – add it
          console.log(`🔧 Adding missing column ${col} to ${tableName}...`);
          await sequelize.query(
            `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col}\` DECIMAL(15,2) DEFAULT 0`
          );
          console.log(`✅ Column ${col} added successfully.`);
        }
      } catch (error) {
        console.error(`❌ Failed to ensure column ${col}:`, error.message);
      }
    }
  }

  // ============================================
  // STATIC METHODS
  // ============================================
  static async initializeBalances() {
    try {
      const docs = await GroupSavings.findAll({
        where: {
          [Op.or]: [
            { LEDGER_BAL: null },
            { CLEARED_BAL: null },
            { AVAILABLE_BALANCE: null }
          ]
        }
      });
      
      for (const doc of docs) {
        try {
          const balance = safeParseFloat(doc.currentBalance, 0);
          await doc.update({
            LEDGER_BAL: balance.toFixed(2),
            CLEARED_BAL: balance.toFixed(2),
            AVAILABLE_BALANCE: balance.toFixed(2)
          });
        } catch (docError) {
          console.error(`Error initializing balances for doc ${doc.id}:`, docError);
          continue;
        }
      }
      
      return docs.length;
    } catch (error) {
      console.error('Error in initializeBalances:', error);
      return 0;
    }
  }

  static findByGroupCode(groupCode) {
    return GroupSavings.findOne({
      where: {
        groupCode: groupCode.toUpperCase(),
        status: 'active'
      }
    });
  }

  static findActiveSavings() {
    return GroupSavings.findAll({
      where: { status: 'active' }
    });
  }

  static findBySavingsType(savingsType) {
    return GroupSavings.findAll({
      where: {
        savingsType,
        status: 'active'
      }
    });
  }

  // ============================================
  // INSTANCE METHODS
  // ============================================
  async updateBalance(amount, balanceType = 'AVAILABLE_BALANCE') {
    try {
      const currentBalance = safeParseFloat(this[balanceType], 0);
      const newBalance = currentBalance + safeParseFloat(amount, 0);
      
      const updateData = {
        [balanceType]: newBalance.toFixed(2)
      };
      
      if (balanceType === 'AVAILABLE_BALANCE') {
        updateData.LEDGER_BAL = newBalance.toFixed(2);
        updateData.CLEARED_BAL = newBalance.toFixed(2);
        updateData.currentBalance = newBalance;
      }
      
      await this.update(updateData);
      await this.reload();
      return this;
    } catch (error) {
      console.error('Error in updateBalance:', error);
      throw new Error(`Failed to update balance: ${error.message}`);
    }
  }

  canWithdraw(amount) {
    try {
      const availableBalance = safeParseFloat(this.AVAILABLE_BALANCE, 0);
      const minWithdrawal = safeParseFloat(this.withdrawalRules?.minWithdrawal, 0);
      const maxWithdrawal = safeParseFloat(this.withdrawalRules?.maxWithdrawal, 0);
      
      if (amount > availableBalance) return false;
      if (minWithdrawal > 0 && amount < minWithdrawal) return false;
      if (maxWithdrawal > 0 && amount > maxWithdrawal) return false;
      
      return true;
    } catch (error) {
      console.error('Error in canWithdraw:', error);
      return false;
    }
  }

  async closeAccount(userId, reason = '') {
    try {
      await this.update({
        status: 'closed',
        closedAt: new Date(),
        closedBy: userId,
        closureReason: reason,
        isActive: false
      });
      return this;
    } catch (error) {
      console.error('Error in closeAccount:', error);
      throw new Error(`Failed to close account: ${error.message}`);
    }
  }

  getSafeBalance() {
    return {
      ledgerBalance: safeParseFloat(this.LEDGER_BAL, 0),
      clearedBalance: safeParseFloat(this.CLEARED_BAL, 0),
      availableBalance: safeParseFloat(this.AVAILABLE_BALANCE, 0),
      currentBalance: safeParseFloat(this.currentBalance, 0)
    };
  }

  get ledgerBalanceVirtual() {
    try {
      if (!this.LEDGER_BAL) return '0.00';
      return safeString(this.LEDGER_BAL, '0.00');
    } catch (error) {
      console.error('Error in ledgerBalanceVirtual:', error);
      return '0.00';
    }
  }

  get availableBalanceVirtual() {
    try {
      if (!this.AVAILABLE_BALANCE) return '0.00';
      return safeString(this.AVAILABLE_BALANCE, '0.00');
    } catch (error) {
      console.error('Error in availableBalanceVirtual:', error);
      return '0.00';
    }
  }

  get formattedBalances() {
    return {
      ledgerBalance: safeParseFloat(this.LEDGER_BAL, 0),
      clearedBalance: safeParseFloat(this.CLEARED_BAL, 0),
      availableBalance: safeParseFloat(this.AVAILABLE_BALANCE, 0),
      currentBalance: safeParseFloat(this.currentBalance, 0)
    };
  }

  get progressToTarget() {
    try {
      const currentBalance = safeParseFloat(this.AVAILABLE_BALANCE, 0);
      const target = safeParseFloat(this.targetAmount, 0);
      return target > 0 ? (currentBalance / target) * 100 : 0;
    } catch (error) {
      console.error('Error in progressToTarget:', error);
      return 0;
    }
  }

  get isTargetAchieved() {
    try {
      const currentBalance = safeParseFloat(this.AVAILABLE_BALANCE, 0);
      const target = safeParseFloat(this.targetAmount, 0);
      return currentBalance >= target;
    } catch (error) {
      console.error('Error in isTargetAchieved:', error);
      return false;
    }
  }

  get displayName() {
    return `${this.groupCode} - ${this.groupName}`;
  }
}

GroupSavings.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Groups', key: 'id' }
  },
  groupCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    set(value) { this.setDataValue('groupCode', value.trim().toUpperCase()); },
    validate: { notEmpty: true, len: [1, 50] }
  },
  groupName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    set(value) { this.setDataValue('groupName', value.trim()); },
    validate: { notEmpty: true, len: [1, 100] }
  },
  
  savingsType: {
    type: DataTypes.ENUM('union_purse', 'emergency_fund', 'project_fund', 'general_savings', 'project_savings'),
    defaultValue: 'union_purse',
    allowNull: false
  },
  
  accountNumber: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true,
    validate: { is: /^\d{10}$/, notEmpty: true }
  },
  
  targetAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: { isDecimal: true, min: 0 }
  },
  minimumContribution: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: { isDecimal: true, min: 0 }
  },
  
  LEDGER_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { isDecimal: true, min: 0 }
  },
  CLEARED_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { isDecimal: true, min: 0 }
  },
  AVAILABLE_BALANCE: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { isDecimal: true, min: 0 }
  },
  currentBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: { isDecimal: true, min: 0 }
  },
  
  contributionFrequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'quarterly', 'custom'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  nextContributionDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  managedBy: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    get() {
      const raw = this.getDataValue('managedBy');
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      try { return JSON.parse(raw) || []; } catch { return []; }
    },
    set(value) {
      let arr = [];
      if (Array.isArray(value)) arr = value;
      else if (typeof value === 'string') try { arr = JSON.parse(value); } catch { arr = []; }
      this.setDataValue('managedBy', arr);
    }
  },
  
  members: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    get() {
      const raw = this.getDataValue('members');
      if (!raw) return [];
      if (Array.isArray(raw)) return raw;
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { 
          const nums = raw.match(/\d+/g);
          return nums ? nums.map(n => n.padStart(10, '0')) : [];
        }
      }
      return [];
    },
    set(value) {
      let arr = [];
      if (Array.isArray(value)) arr = value;
      else if (typeof value === 'string') try { arr = JSON.parse(value); } catch { 
        const nums = value.match(/\d+/g);
        arr = nums || [];
      }
      arr = arr
        .filter(v => v && /^\d+$/.test(String(v)) && String(v) !== '0')
        .map(v => String(v).padStart(10, '0'))
        .filter((v, i, a) => a.indexOf(v) === i);
      this.setDataValue('members', arr);
    }
  },
  
  withdrawalRules: {
    type: DataTypes.JSON,
    defaultValue: {
      minWithdrawal: 0,
      maxWithdrawal: 0,
      approvalRequired: true,
      minApprovers: 1,
      withdrawalFrequency: 'anytime'
    },
    get() {
      const raw = this.getDataValue('withdrawalRules');
      if (!raw) return {};
      if (typeof raw === 'object') return raw;
      try { return JSON.parse(raw); } catch { return {}; }
    },
    set(value) { this.setDataValue('withdrawalRules', value || {}); }
  },
  
  linkedProductId: { type: DataTypes.INTEGER, allowNull: true },
  linkedProductCode: { type: DataTypes.STRING(50), allowNull: true },
  
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'closed', 'suspended'),
    defaultValue: 'active',
    allowNull: false
  },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  
  createdById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'Users', key: 'id' }
  },
  closedAt: { type: DataTypes.DATE, allowNull: true },
  closedById: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'Users', key: 'id' }
  },
  closureReason: {
    type: DataTypes.STRING(500),
    allowNull: true,
    set(value) { if (value) this.setDataValue('closureReason', value.trim()); }
  }
}, {
  sequelize,
  modelName: 'GroupSavings',
  tableName: 'GroupSavings',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeSave: async (groupSavings) => {
      try {
        if (groupSavings.status === 'active') {
          groupSavings.isActive = true;
        } else if (['inactive', 'closed', 'suspended'].includes(groupSavings.status)) {
          groupSavings.isActive = false;
        }
        
        const currentBal = safeParseFloat(groupSavings.currentBalance, 0);
        const defaultBalance = currentBal.toFixed(2);
        
        if (!groupSavings.LEDGER_BAL || groupSavings.changed('currentBalance')) {
          groupSavings.LEDGER_BAL = defaultBalance;
        }
        if (!groupSavings.CLEARED_BAL || groupSavings.changed('currentBalance')) {
          groupSavings.CLEARED_BAL = defaultBalance;
        }
        if (!groupSavings.AVAILABLE_BALANCE || groupSavings.changed('currentBalance')) {
          groupSavings.AVAILABLE_BALANCE = defaultBalance;
        }
        
        if (groupSavings.AVAILABLE_BALANCE && groupSavings.changed('AVAILABLE_BALANCE')) {
          groupSavings.currentBalance = safeParseFloat(groupSavings.AVAILABLE_BALANCE);
        }
        
        if (groupSavings.changed('status') && groupSavings.status === 'closed' && !groupSavings.closedAt) {
          groupSavings.closedAt = new Date();
        }
        
        if (groupSavings.managedBy && Array.isArray(groupSavings.managedBy)) {
          groupSavings.managedBy = [...new Set(groupSavings.managedBy)];
        }
        if (groupSavings.members && Array.isArray(groupSavings.members)) {
          groupSavings.members = [...new Set(groupSavings.members)];
        }
        
        if (!groupSavings.accountNumber) {
          const timestamp = Date.now() % 1000000000;
          groupSavings.accountNumber = `GS${timestamp}`.padStart(10, '0').slice(-10);
        }
        
        if (!groupSavings.nextContributionDate) {
          const now = new Date();
          const freq = groupSavings.contributionFrequency || 'monthly';
          let futureDate = new Date(now);
          switch (freq) {
            case 'daily': futureDate.setDate(now.getDate() + 1); break;
            case 'weekly': futureDate.setDate(now.getDate() + 7); break;
            case 'monthly': futureDate.setMonth(now.getMonth() + 1); break;
            case 'quarterly': futureDate.setMonth(now.getMonth() + 3); break;
            default: futureDate.setMonth(now.getMonth() + 1);
          }
          groupSavings.nextContributionDate = futureDate;
        }
      } catch (error) {
        console.error('Error in beforeSave hook:', error);
      }
    }
  }
});

// ============================================
// ASSOCIATIONS
// ============================================
GroupSavings.belongsTo(Group, {
  foreignKey: 'groupId',
  as: 'group',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

GroupSavings.hasMany(Group, {
  foreignKey: 'groupId',
  as: 'savingsAccounts'
});

console.log('✅ GroupSavings model loaded with associations');

export default GroupSavings;