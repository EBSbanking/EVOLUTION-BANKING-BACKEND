import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Define enums
export const GL_ACCT_CATEGORIES = {
  ASSET: 'ASSET',
  LIABILITY: 'LIABILITY',
  EQUITY: 'EQUITY',
  REVENUE: 'REVENUE',
  EXPENSE: 'EXPENSE',
  CONTROL: 'CONTROL',
  SUSPENSE: 'SUSPENSE',
  TAX: 'TAX'
};

export const RECORD_STATUS = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  CLOSED: 'Closed'
};

export const TRANSACTION_TYPES = {
  DEBIT: 'DR',
  CREDIT: 'CR'
};

export const BALANCE_TYPE = {
  DEBIT: 'DEBIT',
  CREDIT: 'CREDIT',
  BALANCED: 'BALANCED'
};

export const FINANCIAL_STATEMENT_TYPES = {
  BALANCE_SHEET: 'BALANCE_SHEET',
  INCOME_STATEMENT: 'INCOME_STATEMENT',
  CONTROL: 'CONTROL',
  SUSPENSE: 'SUSPENSE',
  TAX: 'TAX',
  OTHER: 'OTHER'
};

// Safe trim function for setters
const safeTrim = (value) => {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  // Convert to string if it's not already a string
  return String(value).trim();
};

class Ledger extends Model {
  // Static method to find by GL account number
  static async findByAccountNumber(glAcctNo, options = {}) {
    return await this.findOne({
      where: { GL_ACCT_NO: glAcctNo },
      ...options
    });
  }

  // Static method to find by GL account ID
  static async findByAccountId(glAcctId, options = {}) {
    return await this.findOne({
      where: { GL_ACCT_ID: glAcctId },
      ...options
    });
  }

  // Static method to find active ledgers
  static async findActiveLedgers() {
    return await this.findAll({
      where: { REC_ST: RECORD_STATUS.ACTIVE },
      order: [['GL_ACCT_NO', 'ASC']]
    });
  }

  // Static method to find ledgers by category
  static async findByCategory(category, options = {}) {
    const defaultOptions = {
      where: { 
        GL_ACCT_CAT: category,
        REC_ST: RECORD_STATUS.ACTIVE 
      },
      order: [['GL_ACCT_NO', 'ASC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find ledgers by business unit
  static async findByBusinessUnit(buId, options = {}) {
    const defaultOptions = {
      where: { 
        BU_ID: buId,
        REC_ST: RECORD_STATUS.ACTIVE 
      },
      order: [['GL_ACCT_NO', 'ASC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find ledgers by organization
  static async findByOrganization(organizationName, options = {}) {
    const defaultOptions = {
      where: { 
        organizationName,
        REC_ST: RECORD_STATUS.ACTIVE 
      },
      order: [['GL_ACCT_NO', 'ASC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find control accounts
  static async findControlAccounts(options = {}) {
    const defaultOptions = {
      where: { 
        CONTROL_ACCT_FG: true,
        REC_ST: RECORD_STATUS.ACTIVE 
      },
      order: [['GL_ACCT_NO', 'ASC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find suspense accounts
  static async findSuspenseAccounts(options = {}) {
    const defaultOptions = {
      where: { 
        SUSPENSE_ACCT_FG: true,
        REC_ST: RECORD_STATUS.ACTIVE 
      },
      order: [['GL_ACCT_NO', 'ASC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to get ledger statistics
  static async getStatistics(organizationName = null) {
    const whereClause = organizationName ? { organizationName } : {};
    
    const result = await this.findAll({
      attributes: [
        'GL_ACCT_CAT',
        'REC_ST',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('LEDGER_BALANCE')), 'totalBalance']
      ],
      where: whereClause,
      group: ['GL_ACCT_CAT', 'REC_ST'],
      raw: true
    });
    
    return result.reduce((stats, row) => {
      const category = row.GL_ACCT_CAT;
      const status = row.REC_ST;
      
      if (!stats[category]) {
        stats[category] = {
          Active: { count: 0, balance: 0 },
          Inactive: { count: 0, balance: 0 },
          Closed: { count: 0, balance: 0 }
        };
      }
      
      stats[category][status].count = parseInt(row.count);
      stats[category][status].balance = parseFloat(row.totalBalance) || 0;
      
      return stats;
    }, {});
  }

  // Instance method to check if posting is allowed
  canPost(txnType) {
    const normalizedTxnType = txnType.toUpperCase();
    return (normalizedTxnType === 'DR' && this.DR_ALLOWED) || 
           (normalizedTxnType === 'CR' && this.CR_ALLOWED);
  }

  // Instance method to update ledger balance
  async updateBalance(amount, txnType, options = {}) {
    if (!this.canPost(txnType)) {
      throw new Error(`Posting ${txnType} not allowed for this account`);
    }
    
    if (!this.POST_ALLOW) {
      throw new Error('Posting not allowed for this account');
    }
    
    if (this.REC_ST !== RECORD_STATUS.ACTIVE) {
      throw new Error('Cannot post to inactive or closed account');
    }
    
    // Calculate new balance based on account category
    let newBalance = this.LEDGER_BALANCE;
    
    // Asset and Expense accounts increase with debit, decrease with credit
    // Liability, Equity, and Revenue accounts increase with credit, decrease with debit
    const isDebit = txnType.toUpperCase() === 'DR';
    
    switch (this.GL_ACCT_CAT) {
      case GL_ACCT_CATEGORIES.ASSET:
      case GL_ACCT_CATEGORIES.EXPENSE:
      case GL_ACCT_CATEGORIES.CONTROL:
      case GL_ACCT_CATEGORIES.SUSPENSE:
      case GL_ACCT_CATEGORIES.TAX:
        newBalance = isDebit ? newBalance + amount : newBalance - amount;
        break;
      case GL_ACCT_CATEGORIES.LIABILITY:
      case GL_ACCT_CATEGORIES.EQUITY:
      case GL_ACCT_CATEGORIES.REVENUE:
        newBalance = isDebit ? newBalance - amount : newBalance + amount;
        break;
      default:
        throw new Error('Invalid account category');
    }
    
    // Check for balance swing if not allowed
    if (!this.ALLOW_BAL_SWING_FG && newBalance < 0) {
      throw new Error('Balance swing not allowed for this account');
    }
    
    this.LEDGER_BALANCE = newBalance;
    this.CURRENT_BALANCE = newBalance;
    this.AVAILABLE_BALANCE = newBalance;
    this.ROW_TS = new Date();
    
    return await this.save(options);
  }

  // Instance method to check if account is active
  get isActive() {
    return this.REC_ST === RECORD_STATUS.ACTIVE;
  }

  // Instance method to check if account is a control account
  get isControlAccount() {
    return this.CONTROL_ACCT_FG;
  }

  // Instance method to check if account is a suspense account
  get isSuspenseAccount() {
    return this.SUSPENSE_ACCT_FG;
  }

  // Instance method to get account classification
  get classification() {
    if (this.CONTROL_ACCT_FG) return 'Control Account';
    if (this.SUSPENSE_ACCT_FG) return 'Suspense Account';
    if (this.GL_ACCT_CAT === GL_ACCT_CATEGORIES.TAX) return 'Tax Account';
    return 'Regular Account';
  }

  // Instance method to get account summary
  getSummary() {
    return {
      accountNumber: this.GL_ACCT_NO,
      accountId: this.GL_ACCT_ID,
      description: this.ACCT_DESC,
      category: this.GL_ACCT_CAT,
      categoryName: this.categoryName,
      balance: this.LEDGER_BALANCE,
      currentBalance: this.CURRENT_BALANCE,
      availableBalance: this.AVAILABLE_BALANCE,
      openingBalance: this.OPENING_BALANCE,
      status: this.REC_ST,
      businessUnit: this.BU_ID,
      organization: this.organizationName,
      organizationCode: this.organizationCode,
      branch: this.branchName,
      branchCode: this.branchCode,
      currencyCode: this.CURRENCY_CODE,
      postingAllowed: this.POST_ALLOW,
      debitAllowed: this.DR_ALLOWED,
      creditAllowed: this.CR_ALLOWED,
      allowNegative: this.ALLOW_BAL_SWING_FG,
      classification: this.classification,
      level: this.level,
      parentAccount: this.PARENT_ID,
      childAccounts: this.childAccounts,
      metadata: this.metadata,
      coaStructure: this.coaStructure,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Instance method to parse JSON fields
  parseJSONFields() {
    const result = { ...this.dataValues };
    
    // Parse JSON fields
    const jsonFields = ['metadata', 'coaStructure', 'childAccounts'];
    jsonFields.forEach(field => {
      if (result[field] && typeof result[field] === 'string') {
        try {
          result[field] = JSON.parse(result[field]);
        } catch (e) {
          logger.warn(`Failed to parse ${field}:`, e.message);
          result[field] = {};
        }
      }
    });
    
    return result;
  }
}

Ledger.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Auto-increment primary key'
  },
  GL_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'General Ledger Account Number',
    validate: {
      notEmpty: {
        msg: 'GL_ACCT_NO is required'
      },
      len: {
        args: [1, 50],
        msg: 'GL_ACCT_NO must be between 1 and 50 characters'
      }
    },
    set(value) {
      this.setDataValue('GL_ACCT_NO', safeTrim(value));
    }
  },
  GL_ACCT_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'General Ledger Account Identifier',
    validate: {
      notEmpty: {
        msg: 'GL_ACCT_ID is required'
      },
      len: {
        args: [1, 50],
        msg: 'GL_ACCT_ID must be between 1 and 50 characters'
      }
    },
    set(value) {
      this.setDataValue('GL_ACCT_ID', safeTrim(value));
    }
  },
  CHART_OF_ACCT_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: '10001',
    comment: 'Chart of Accounts Identifier',
    validate: {
      notEmpty: {
        msg: 'CHART_OF_ACCT_ID is required'
      }
    },
    set(value) {
      this.setDataValue('CHART_OF_ACCT_ID', safeTrim(value));
    }
  },
  BAL_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Balance Code',
    validate: {
      notEmpty: {
        msg: 'BAL_CD is required'
      },
      len: {
        args: [1, 10],
        msg: 'BAL_CD must be between 1 and 10 characters'
      }
    },
    set(value) {
      this.setDataValue('BAL_CD', safeTrim(value));
    }
  },
  SUB_LEDGER_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Sub Ledger Number',
    validate: {
      notEmpty: {
        msg: 'SUB_LEDGER_NO is required'
      },
      len: {
        args: [1, 50],
        msg: 'SUB_LEDGER_NO must be between 1 and 50 characters'
      }
    },
    set(value) {
      this.setDataValue('SUB_LEDGER_NO', safeTrim(value));
    }
  },
  ACCT_DESC: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'GL Account',
    comment: 'Account Description',
    validate: {
      notEmpty: {
        msg: 'ACCT_DESC is required'
      },
      len: {
        args: [1, 255],
        msg: 'ACCT_DESC must be between 1 and 255 characters'
      }
    },
    set(value) {
      this.setDataValue('ACCT_DESC', safeTrim(value));
    }
  },
  LEDGER_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Ledger Number',
    validate: {
      notEmpty: {
        msg: 'LEDGER_NO is required'
      },
      len: {
        args: [1, 50],
        msg: 'LEDGER_NO must be between 1 and 50 characters'
      }
    },
    set(value) {
      this.setDataValue('LEDGER_NO', safeTrim(value));
    }
  },
  BU_ID: {
    type: DataTypes.STRING(3),
    allowNull: false,
    comment: 'Business Unit Identifier',
    validate: {
      notEmpty: {
        msg: 'BU_ID is required'
      },
      is: {
        args: /^\d{3}$/,
        msg: 'BU_ID must be a 3-digit number'
      }
    },
    set(value) {
      this.setDataValue('BU_ID', safeTrim(value));
    }
  },
  GL_ACCT_CAT: {
    type: DataTypes.ENUM(Object.values(GL_ACCT_CATEGORIES)),
    allowNull: false,
    comment: 'GL Account Category'
  },
  CR_ALLOWED: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Credit Posting Allowed'
  },
  DR_ALLOWED: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Debit Posting Allowed'
  },
  REC_ST: {
    type: DataTypes.ENUM(Object.values(RECORD_STATUS)),
    defaultValue: RECORD_STATUS.ACTIVE,
    comment: 'Record Status'
  },
  POST_ALLOW: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Posting Allowed'
  },
  POST_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Posting Flag'
  },
  CONTROL_ACCT_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Control Account Flag'
  },
  CREATED_BY: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Created By User',
    validate: {
      notEmpty: {
        msg: 'CREATED_BY is required'
      }
    },
    set(value) {
      this.setDataValue('CREATED_BY', safeTrim(value));
    }
  },
  SUSPENSE_ACCT_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Suspense Account Flag'
  },
  ALLOW_BAL_SWING_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Allow Balance Swing Flag'
  },
  PARENT_ID: {
    type: DataTypes.STRING(50),
    defaultValue: '1',
    comment: 'Parent Account ID',
    set(value) {
      this.setDataValue('PARENT_ID', safeTrim(value));
    }
  },
  SEG_VALUE: {
    type: DataTypes.STRING(100),
    defaultValue: '',
    comment: 'Segment Value',
    set(value) {
      this.setDataValue('SEG_VALUE', safeTrim(value));
    }
  },
  SEG_DESC: {
    type: DataTypes.STRING(255),
    defaultValue: '',
    comment: 'Segment Description',
    set(value) {
      this.setDataValue('SEG_DESC', safeTrim(value));
    }
  },
  SEG_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Segment Number',
    validate: {
      notEmpty: {
        msg: 'SEG_NO is required'
      },
      len: {
        args: [1, 50],
        msg: 'SEG_NO must be between 1 and 50 characters'
      }
    },
    set(value) {
      this.setDataValue('SEG_NO', safeTrim(value));
    }
  },
  subfolderId: {
    type: DataTypes.STRING(50),
    defaultValue: '1',
    comment: 'Subfolder ID',
    set(value) {
      this.setDataValue('subfolderId', safeTrim(value));
    }
  },
  DELAY_GL_POSTING: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Delay GL Posting Flag'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Row Timestamp'
  },
  LEDGER_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0.00,
    comment: 'Current Ledger Balance',
    validate: {
      min: {
        args: [-999999999999.99],
        msg: 'Balance cannot be less than -999,999,999,999.99'
      },
      max: {
        args: [999999999999.99],
        msg: 'Balance cannot exceed 999,999,999,999.99'
      }
    }
  },
  organizationName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Organization Name',
    validate: {
      notEmpty: {
        msg: 'organizationName is required'
      }
    },
    set(value) {
      this.setDataValue('organizationName', safeTrim(value));
    }
  },
  branchName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Branch Name',
    validate: {
      notEmpty: {
        msg: 'branchName is required'
      }
    },
    set(value) {
      this.setDataValue('branchName', safeTrim(value));
    }
  },
  // New fields for COA alignment
  organizationCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Organization Code',
    validate: {
      notEmpty: {
        msg: 'organizationCode is required'
      }
    },
    set(value) {
      this.setDataValue('organizationCode', safeTrim(value));
    }
  },
  branchCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Branch Code',
    validate: {
      notEmpty: {
        msg: 'branchCode is required'
      }
    },
    set(value) {
      this.setDataValue('branchCode', safeTrim(value));
    }
  },
  branchType: {
    type: DataTypes.STRING(50),
    defaultValue: 'MAIN',
    comment: 'Branch Type',
    set(value) {
      this.setDataValue('branchType', safeTrim(value));
    }
  },
  OPENING_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0.00,
    comment: 'Opening Balance'
  },
  CURRENT_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0.00,
    comment: 'Current Balance'
  },
  AVAILABLE_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0.00,
    comment: 'Available Balance'
  },
  CURRENCY_CODE: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN',
    comment: 'Currency Code',
    validate: {
      len: {
        args: [3, 3],
        msg: 'Currency code must be 3 characters'
      }
    },
    set(value) {
      this.setDataValue('CURRENCY_CODE', safeTrim(value ? value.toUpperCase() : value));
    }
  },
  JOURNAL_ID: {
    type: DataTypes.STRING(100),
    comment: 'Journal ID',
    set(value) {
      this.setDataValue('JOURNAL_ID', safeTrim(value));
    }
  },
  TRANSACTION_TYPE: {
    type: DataTypes.STRING(100),
    comment: 'Transaction Type',
    set(value) {
      this.setDataValue('TRANSACTION_TYPE', safeTrim(value));
    }
  },
  metadata: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    comment: 'Account Metadata',
    get() {
      const rawValue = this.getDataValue('metadata');
      try {
        return rawValue ? JSON.parse(rawValue) : {};
      } catch (e) {
        logger.warn('Failed to parse metadata:', e.message);
        return {};
      }
    },
    set(value) {
      const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
      this.setDataValue('metadata', jsonValue);
    }
  },
  coaStructure: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    comment: 'COA Structure Configuration',
    get() {
      const rawValue = this.getDataValue('coaStructure');
      try {
        return rawValue ? JSON.parse(rawValue) : {};
      } catch (e) {
        logger.warn('Failed to parse coaStructure:', e.message);
        return {};
      }
    },
    set(value) {
      const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
      this.setDataValue('coaStructure', jsonValue);
    }
  },
  categoryCode: {
    type: DataTypes.STRING(50),
    comment: 'Category Code',
    set(value) {
      this.setDataValue('categoryCode', safeTrim(value));
    }
  },
  categoryName: {
    type: DataTypes.STRING(255),
    comment: 'Category Name',
    set(value) {
      this.setDataValue('categoryName', safeTrim(value));
    }
  },
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 4,
    comment: 'Account Level in Hierarchy',
    validate: {
      min: {
        args: [1],
        msg: 'Level must be at least 1'
      },
      max: {
        args: [10],
        msg: 'Level cannot exceed 10'
      }
    }
  },
  childAccounts: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    comment: 'Child Accounts Array',
    get() {
      const rawValue = this.getDataValue('childAccounts');
      try {
        return rawValue ? JSON.parse(rawValue) : [];
      } catch (e) {
        logger.warn('Failed to parse childAccounts:', e.message);
        return [];
      }
    },
    set(value) {
      const jsonValue = Array.isArray(value) ? JSON.stringify(value) : value;
      this.setDataValue('childAccounts', jsonValue);
    }
  },
  productType: {
    type: DataTypes.STRING(100),
    comment: 'Product Type',
    set(value) {
      this.setDataValue('productType', safeTrim(value));
    }
  }
}, {
  sequelize,
  modelName: 'Ledger',
  tableName: 'LEDGERS',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  comment: 'General Ledger Accounts',
  indexes: [
    {
      name: 'idx_gl_acct_no',
      fields: ['GL_ACCT_NO'],
      unique: true
    },
    {
      name: 'idx_gl_acct_id',
      fields: ['GL_ACCT_ID'],
      unique: true
    },
    {
      name: 'idx_chart_of_acct',
      fields: ['CHART_OF_ACCT_ID']
    },
    {
      name: 'idx_bu_id',
      fields: ['BU_ID']
    },
    {
      name: 'idx_gl_acct_cat',
      fields: ['GL_ACCT_CAT']
    },
    {
      name: 'idx_rec_st',
      fields: ['REC_ST']
    },
    {
      name: 'idx_organization',
      fields: ['organizationName']
    },
    {
      name: 'idx_branch',
      fields: ['branchName']
    },
    {
      name: 'idx_ledger_no',
      fields: ['LEDGER_NO']
    },
    {
      name: 'idx_sub_ledger',
      fields: ['SUB_LEDGER_NO']
    },
    {
      name: 'idx_seg_no',
      fields: ['SEG_NO']
    },
    {
      name: 'idx_created_by',
      fields: ['CREATED_BY']
    },
    {
      name: 'idx_organization_code',
      fields: ['organizationCode']
    },
    {
      name: 'idx_branch_code',
      fields: ['branchCode']
    },
    {
      name: 'idx_composite_bu_category',
      fields: ['BU_ID', 'GL_ACCT_CAT', 'REC_ST']
    },
    {
      name: 'idx_composite_org_branch',
      fields: ['organizationName', 'branchName']
    },
    {
      name: 'idx_control_accounts',
      fields: ['CONTROL_ACCT_FG', 'REC_ST']
    },
    {
      name: 'idx_suspense_accounts',
      fields: ['SUSPENSE_ACCT_FG', 'REC_ST']
    },
    {
      name: 'idx_balance',
      fields: ['LEDGER_BALANCE']
    },
    {
      name: 'idx_level',
      fields: ['level']
    }
  ],
  hooks: {
    beforeValidate: (ledger, options) => {
      // Use safeTrim for all string fields
      const stringFields = [
        'GL_ACCT_NO', 'GL_ACCT_ID', 'CHART_OF_ACCT_ID', 'BAL_CD',
        'SUB_LEDGER_NO', 'ACCT_DESC', 'LEDGER_NO', 'BU_ID',
        'CREATED_BY', 'PARENT_ID', 'SEG_VALUE', 'SEG_DESC',
        'SEG_NO', 'subfolderId', 'organizationName', 'branchName',
        'organizationCode', 'branchCode', 'branchType', 'CURRENCY_CODE',
        'JOURNAL_ID', 'TRANSACTION_TYPE', 'categoryCode', 'categoryName',
        'productType'
      ];
      
      stringFields.forEach(field => {
        if (ledger[field] !== null && ledger[field] !== undefined) {
          ledger[field] = safeTrim(ledger[field]);
        }
      });
      
      // Ensure BU_ID is exactly 3 digits
      if (ledger.BU_ID && /^\d+$/.test(ledger.BU_ID)) {
        ledger.BU_ID = ledger.BU_ID.padStart(3, '0');
      }
    },
    
    beforeCreate: (ledger, options) => {
      // Set ROW_TS if not provided
      if (!ledger.ROW_TS) {
        ledger.ROW_TS = new Date();
      }
      
      // Set default balances if not provided
      if (ledger.OPENING_BALANCE === null || ledger.OPENING_BALANCE === undefined) {
        ledger.OPENING_BALANCE = 0;
      }
      if (ledger.CURRENT_BALANCE === null || ledger.CURRENT_BALANCE === undefined) {
        ledger.CURRENT_BALANCE = ledger.OPENING_BALANCE;
      }
      if (ledger.AVAILABLE_BALANCE === null || ledger.AVAILABLE_BALANCE === undefined) {
        ledger.AVAILABLE_BALANCE = ledger.OPENING_BALANCE;
      }
      if (ledger.LEDGER_BALANCE === null || ledger.LEDGER_BALANCE === undefined) {
        ledger.LEDGER_BALANCE = ledger.OPENING_BALANCE;
      }
      
      // Validate account number format
      if (ledger.GL_ACCT_NO && !/^[A-Z0-9\-_]+$/.test(ledger.GL_ACCT_NO)) {
        throw new Error('GL_ACCT_NO can only contain letters, numbers, hyphens, and underscores');
      }
      
      // Set default values for flags based on account category
      if (ledger.GL_ACCT_CAT === GL_ACCT_CATEGORIES.EQUITY) {
        // Equity accounts typically don't allow debit postings
        if (ledger.DR_ALLOWED === undefined || ledger.DR_ALLOWED === null) {
          ledger.DR_ALLOWED = false;
        }
      }
      
      // Validate balance based on account category
      if (ledger.GL_ACCT_CAT === GL_ACCT_CATEGORIES.ASSET || 
          ledger.GL_ACCT_CAT === GL_ACCT_CATEGORIES.EXPENSE) {
        // Asset and Expense accounts typically have debit balances
        if (ledger.LEDGER_BALANCE < 0 && !ledger.ALLOW_BAL_SWING_FG) {
          throw new Error('Asset and Expense accounts cannot have credit balances');
        }
      }
    },
    
    beforeUpdate: (ledger, options) => {
      // Update ROW_TS on modification
      ledger.ROW_TS = new Date();
      
      // Prevent changing certain fields if account has transactions
      const immutableFields = ['GL_ACCT_NO', 'GL_ACCT_ID', 'CHART_OF_ACCT_ID'];
      for (const field of immutableFields) {
        if (ledger.changed(field)) {
          throw new Error(`Cannot change ${field} after creation`);
        }
      }
      
      // Validate status transitions
      if (ledger.changed('REC_ST')) {
        const oldStatus = ledger.previous('REC_ST');
        const newStatus = ledger.REC_ST;
        
        // Can't reactivate closed accounts
        if (oldStatus === RECORD_STATUS.CLOSED && newStatus !== RECORD_STATUS.CLOSED) {
          throw new Error('Cannot reactivate closed accounts');
        }
        
        // Can't close accounts with non-zero balance
        if (newStatus === RECORD_STATUS.CLOSED && Math.abs(ledger.LEDGER_BALANCE) > 0.01) {
          throw new Error('Cannot close account with non-zero balance');
        }
      }
      
      // Validate balance changes
      if (ledger.changed('LEDGER_BALANCE')) {
        const oldBalance = ledger.previous('LEDGER_BALANCE');
        const newBalance = ledger.LEDGER_BALANCE;
        
        // Balance should only be updated through transactions, not directly
        logger.warn(`Ledger balance changed directly from ${oldBalance} to ${newBalance}`, {
          accountNo: ledger.GL_ACCT_NO,
          accountId: ledger.GL_ACCT_ID
        });
      }
    },
    
    afterCreate: (ledger, options) => {
      logger.info(`Ledger account created`, {
        accountNo: ledger.GL_ACCT_NO,
        accountId: ledger.GL_ACCT_ID,
        category: ledger.GL_ACCT_CAT,
        businessUnit: ledger.BU_ID,
        organization: ledger.organizationName,
        branch: ledger.branchName
      });
    },
    
    afterUpdate: (ledger, options) => {
      if (ledger.changed('REC_ST')) {
        logger.info(`Ledger account status changed`, {
          accountNo: ledger.GL_ACCT_NO,
          oldStatus: ledger.previous('REC_ST'),
          newStatus: ledger.REC_ST
        });
      }
    }
  }
});

export default Ledger;