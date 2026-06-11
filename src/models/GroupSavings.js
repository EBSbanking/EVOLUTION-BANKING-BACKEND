// models/GroupSavings.js - UPDATED VERSION with improved members handling and associations

import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

// Import Group model for association
import Group from './Group.js';

// SAFE UTILITY FUNCTIONS FOR THE MODEL
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
  // STATIC METHODS
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

  // INSTANCE METHODS
  async updateBalance(amount, balanceType = 'AVAILABLE_BALANCE') {
    try {
      const currentBalance = safeParseFloat(this[balanceType], 0);
      const newBalance = currentBalance + safeParseFloat(amount, 0);
      
      const updateData = {
        [balanceType]: newBalance.toFixed(2)
      };
      
      // Sync all balances if updating available balance
      if (balanceType === 'AVAILABLE_BALANCE') {
        updateData.LEDGER_BAL = newBalance.toFixed(2);
        updateData.CLEARED_BAL = newBalance.toFixed(2);
        updateData.currentBalance = newBalance;
      }
      
      await this.update(updateData);
      await this.reload(); // Reload to get updated values
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

  // GETTERS (Virtual fields equivalent)
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
  
  // GROUP IDENTIFICATION
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Groups',
      key: 'id'
    }
  },
  groupCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    set(value) {
      this.setDataValue('groupCode', value.trim().toUpperCase());
    },
    validate: {
      notEmpty: true,
      len: [1, 50]
    }
  },
  groupName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    set(value) {
      this.setDataValue('groupName', value.trim());
    },
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  
  // SAVINGS CONFIGURATION
  savingsType: {
    type: DataTypes.ENUM('union_purse', 'emergency_fund', 'project_fund', 'general_savings', 'project_savings'),
    defaultValue: 'union_purse',
    allowNull: false
  },
  
  // ACCOUNT INFORMATION
  accountNumber: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true,
    validate: {
      is: /^\d{10}$/, // Ensure 10-digit account number
      notEmpty: true
    }
  },
  
  // FINANCIAL FIELDS - WITH SAFE DEFAULTS
  targetAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  minimumContribution: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  
  // BALANCE FIELDS - COMPREHENSIVE WITH SAFE HANDLING
  LEDGER_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  CLEARED_BAL: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  AVAILABLE_BALANCE: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  // Backward compatibility field
  currentBalance: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  
  // CONTRIBUTION SETTINGS
  contributionFrequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly', 'quarterly', 'custom'),
    allowNull: false,
    defaultValue: 'monthly'
  },
  nextContributionDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  // MANAGEMENT & ACCESS CONTROL
  managedBy: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    validate: {
      isValidArray(value) {
        let arrayValue = value;
        
        // Handle string input
        if (typeof value === 'string') {
          try {
            arrayValue = JSON.parse(value);
          } catch (e) {
            arrayValue = [];
          }
        }
        
        if (!Array.isArray(arrayValue)) {
          arrayValue = [];
        }
        
        // Filter and validate
        const validManagers = arrayValue
          .filter(v => v && /^\d+$/.test(String(v)) && String(v) !== '0')
          .map(v => String(v).padStart(10, '0'));
        
        if (validManagers.length < 1 || validManagers.length > 50) {
          throw new Error('ManagedBy must have 1-50 managers');
        }
      }
    },
    // Add getter to ensure array is returned
    get() {
      const rawValue = this.getDataValue('managedBy');
      if (!rawValue) return [];
      if (Array.isArray(rawValue)) return rawValue;
      try {
        const parsed = JSON.parse(rawValue);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },
    // Add setter to ensure proper storage
    set(value) {
      let arrayValue = [];
      if (Array.isArray(value)) {
        arrayValue = value;
      } else if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          arrayValue = Array.isArray(parsed) ? parsed : [];
        } catch {
          arrayValue = [];
        }
      }
      this.setDataValue('managedBy', arrayValue);
    }
  },
  
  members: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [],
    // Getter to ensure array is returned
    get() {
      const rawValue = this.getDataValue('members');
      if (!rawValue) return [];
      
      // If it's already an array, return it
      if (Array.isArray(rawValue)) return rawValue;
      
      // If it's a string, try to parse it
      if (typeof rawValue === 'string') {
        try {
          const parsed = JSON.parse(rawValue);
          return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          // If parsing fails, extract numbers
          const numbers = rawValue.match(/\d+/g);
          return numbers ? numbers.map(n => n.padStart(10, '0')) : [];
        }
      }
      
      return [];
    },
    // Setter to ensure proper storage
    set(value) {
      let arrayValue = [];
      
      if (Array.isArray(value)) {
        arrayValue = value;
      } else if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          arrayValue = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
          // If parsing fails, extract numbers
          const numbers = value.match(/\d+/g);
          arrayValue = numbers ? numbers : [];
        }
      }
      
      // Filter, pad, and deduplicate values
      arrayValue = arrayValue
        .filter(v => v && /^\d+$/.test(String(v)) && String(v) !== '0')
        .map(v => String(v).padStart(10, '0'))
        .filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates
      
      this.setDataValue('members', arrayValue);
    },
    // Validation
    validate: {
      isValidArray(value) {
        // Get the actual array value (could be string or array)
        let arrayValue = value;
        
        if (typeof value === 'string') {
          try {
            arrayValue = JSON.parse(value);
          } catch (e) {
            arrayValue = [];
          }
        }
        
        if (!Array.isArray(arrayValue)) {
          arrayValue = [];
        }
        
        // Filter valid members
        const validMembers = arrayValue
          .filter(v => v && /^\d+$/.test(String(v)) && String(v) !== '0')
          .map(v => String(v).padStart(10, '0'));
        
        if (validMembers.length < 1 || validMembers.length > 100) {
          throw new Error('Members must have 1-100 members');
        }
      }
    }
  },
  
  // WITHDRAWAL RULES
  withdrawalRules: {
    type: DataTypes.JSON,
    defaultValue: {
      minWithdrawal: 0.00,
      maxWithdrawal: 0.00,
      approvalRequired: true,
      minApprovers: 1,
      withdrawalFrequency: 'anytime'
    },
    validate: {
      isValidRules(value) {
        if (!value || typeof value !== 'object') {
          throw new Error('Withdrawal rules must be an object');
        }
      }
    },
    get() {
      const rawValue = this.getDataValue('withdrawalRules');
      if (!rawValue) return {};
      if (typeof rawValue === 'object') return rawValue;
      try {
        return JSON.parse(rawValue);
      } catch {
        return {};
      }
    },
    set(value) {
      this.setDataValue('withdrawalRules', value || {});
    }
  },
  
  // PRODUCT LINKING (OPTIONAL)
  linkedProductId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      isInt: true,
      min: 1
    }
  },
  linkedProductCode: {
    type: DataTypes.STRING(50),
    allowNull: true,
    set(value) {
      if (value) {
        this.setDataValue('linkedProductCode', value.trim());
      }
    }
  },
  
  // STATUS & AUDIT FIELDS
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'closed', 'suspended'),
    defaultValue: 'active',
    allowNull: false
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // AUDIT FIELDS
  createdById: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  closedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  closedById: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  closureReason: {
    type: DataTypes.STRING(500),
    allowNull: true,
    set(value) {
      if (value) {
        this.setDataValue('closureReason', value.trim());
      }
    }
  }
}, {
  sequelize,
  modelName: 'GroupSavings',
  tableName: 'GroupSavings',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeSave: async (groupSavings, options) => {
      try {
        // Sync status with isActive
        if (groupSavings.status === 'active') {
          groupSavings.isActive = true;
        } else if (['inactive', 'closed', 'suspended'].includes(groupSavings.status)) {
          groupSavings.isActive = false;
        }
        
        // SAFE BALANCE INITIALIZATION
        const currentBal = safeParseFloat(groupSavings.currentBalance, 0);
        const defaultBalance = currentBal.toFixed(2);
        
        // Initialize balance fields safely
        if (!groupSavings.LEDGER_BAL || groupSavings.changed('currentBalance')) {
          groupSavings.LEDGER_BAL = defaultBalance;
        }
        
        if (!groupSavings.CLEARED_BAL || groupSavings.changed('currentBalance')) {
          groupSavings.CLEARED_BAL = defaultBalance;
        }
        
        if (!groupSavings.AVAILABLE_BALANCE || groupSavings.changed('currentBalance')) {
          groupSavings.AVAILABLE_BALANCE = defaultBalance;
        }
        
        // Sync currentBalance with AVAILABLE_BALANCE for backward compatibility
        if (groupSavings.AVAILABLE_BALANCE && groupSavings.changed('AVAILABLE_BALANCE')) {
          groupSavings.currentBalance = safeParseFloat(groupSavings.AVAILABLE_BALANCE);
        }
        
        // Set closure timestamp if status changed to closed
        if (groupSavings.changed('status') && groupSavings.status === 'closed' && !groupSavings.closedAt) {
          groupSavings.closedAt = new Date();
        }
        
        // Deduplicate arrays (using getters to ensure we have arrays)
        if (groupSavings.managedBy && Array.isArray(groupSavings.managedBy)) {
          groupSavings.managedBy = [...new Set(groupSavings.managedBy)];
        }
        if (groupSavings.members && Array.isArray(groupSavings.members)) {
          groupSavings.members = [...new Set(groupSavings.members)];
        }
        
        // Generate accountNumber if not provided
        if (!groupSavings.accountNumber) {
          const timestamp = Date.now() % 1000000000;
          groupSavings.accountNumber = `GS${timestamp}`.padStart(10, '0').slice(-10);
        }
        
        // Calculate next contribution date if not set
        if (!groupSavings.nextContributionDate) {
          const now = new Date();
          const freq = groupSavings.contributionFrequency || 'monthly';
          let futureDate = new Date(now);
          
          switch (freq) {
            case 'daily': 
              futureDate.setDate(now.getDate() + 1);
              break;
            case 'weekly': 
              futureDate.setDate(now.getDate() + 7);
              break;
            case 'monthly': 
              futureDate.setMonth(now.getMonth() + 1);
              break;
            case 'quarterly': 
              futureDate.setMonth(now.getMonth() + 3);
              break;
            default: 
              futureDate.setMonth(now.getMonth() + 1);
          }
          
          groupSavings.nextContributionDate = futureDate;
        }
        
      } catch (error) {
        console.error('Error in beforeSave hook:', error);
        // Ensure we don't block the save operation
      }
    }
  },
  
});

// ============================================
// DEFINE ASSOCIATIONS
// ============================================

// GroupSavings belongs to Group
GroupSavings.belongsTo(Group, {
  foreignKey: 'groupId',
  as: 'group',
  onDelete: 'RESTRICT',
  onUpdate: 'CASCADE'
});

// GroupSavings has many contributions
GroupSavings.hasMany(Group, {
  foreignKey: 'groupId',
  as: 'savingsAccounts'
});

console.log('✅ GroupSavings model loaded with associations');

export default GroupSavings;