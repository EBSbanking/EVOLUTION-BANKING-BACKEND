import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class GLAccount extends Model {}

GLAccount.init({
  // ==================== CORE IDENTIFIERS ====================
  GL_ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  GL_ACCT_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  CREATED_BY: {
    type: DataTypes.STRING,
    allowNull: false
  },
  
  // ==================== CHART OF ACCOUNTS STRUCTURE ====================
  // COA segments stored as JSON
  coaStructure: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    get() {
      const value = this.getDataValue('coaStructure');
      return typeof value === 'string' ? JSON.parse(value) : value;
    },
    set(value) {
      this.setDataValue('coaStructure', JSON.stringify(value));
    }
  },
  
  // ==================== BRANCH & ORGANIZATION ====================
  organizationName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  organizationCode: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  branchName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  branchCode: {
    type: DataTypes.STRING,
    allowNull: false
  },
  branchType: {
    type: DataTypes.ENUM('MAIN', 'REGIONAL', 'SUB', 'MOBILE'),
    defaultValue: 'MAIN'
  },
  
  // ==================== ACCOUNT CLASSIFICATION ====================
  categoryCode: {
    type: DataTypes.STRING
  },
  categoryName: {
    type: DataTypes.STRING,
    defaultValue: 'Default Category'
  },
  parentCode: {
    type: DataTypes.STRING
  },
  level: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  
  // ==================== ACCOUNT STRUCTURE ====================
  LEDGER_NO: {
    type: DataTypes.STRING,
    allowNull: false
  },
  PARENT_ID: {
    type: DataTypes.INTEGER
  },
  subfolderId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  BAL_CD: {
    type: DataTypes.STRING,
    allowNull: false
  },
  SUB_LEDGER_NO: {
    type: DataTypes.STRING,
    allowNull: false
  },
  SEG_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  CHART_OF_ACCT_ID: {
    type: DataTypes.STRING,
    allowNull: false
  },
  ACCT_DESC: {
    type: DataTypes.STRING,
    allowNull: false
  },
  
  // ==================== ADDED: ACCOUNT TYPE ====================
  accountType: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'GENERAL'
  },
  
  GL_ACCT_CAT: {
    type: DataTypes.STRING,
    allowNull: false
  },
  
  // ==================== TRANSACTION & POSTING CONTROLS ====================
  JOURNAL_ID: {
    type: DataTypes.STRING
  },
  TRANSACTION_TYPE: {
    type: DataTypes.STRING,
    defaultValue: 'Asset Balance'
  },
  CR_ALLOWED: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  DR_ALLOWED: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  REC_ST: {
    type: DataTypes.ENUM('Active', 'Inactive', 'Suspended', 'Closed'),
    defaultValue: 'Active'
  },
  POST_ALLOW: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  POST_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  CONTROL_ACCT_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  SUSPENSE_ACCT_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  ALLOW_BAL_SWING_FG: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // ==================== SEGMENTATION ====================
  SEG_VALUE: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  SEG_DESC: {
    type: DataTypes.STRING,
    defaultValue: 'Default Description'
  },
  SEG_TY_CD: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  SEG_PLACEHLDR_ID: {
    type: DataTypes.STRING,
    defaultValue: ''
  },
  DELAY_GL_POSTING: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // ==================== FINANCIAL DATA ====================
  LEDGER_BALANCE: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  AVAILABLE_BALANCE: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  OPENING_BALANCE: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  CURRENT_BALANCE: {
    type: DataTypes.DECIMAL(20, 8),
    defaultValue: 0
  },
  CURRENCY_CODE: {
    type: DataTypes.STRING(10),
    defaultValue: 'NGN'
  },
  
  // ==================== HISTORY & AUDIT ====================
  balanceHistory: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  transactions: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  
  // ==================== SETTLEMENT & REFERENCES ====================
  SETTLEMENT_GL_ACCT_NO: {
    type: DataTypes.STRING
  },
  INTER_BRANCH_ACCOUNT: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // ==================== LEGACY SYSTEM COMPATIBILITY ====================
  legacyReference: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  systemSource: {
    type: DataTypes.ENUM('LEGACY', 'NEW_SYSTEM', 'MIGRATED'),
    defaultValue: 'NEW_SYSTEM'
  },
  
  // ==================== SYNC STATUS ====================
  syncStatus: {
    type: DataTypes.JSON,
    defaultValue: {}
  },
  
  // ==================== METADATA ====================
  metadata: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    get() {
      const value = this.getDataValue('metadata');
      return typeof value === 'string' ? JSON.parse(value) : value;
    },
    set(value) {
      this.setDataValue('metadata', JSON.stringify(value));
    }
  },
  
  branchTimezone: {
    type: DataTypes.STRING,
    defaultValue: 'Africa/Lagos'
  }
}, {
  sequelize,
  modelName: 'GLAccount',
  tableName: 'gl_accounts',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    // Unique indexes
    {
      unique: true,
      fields: ['GL_ACCT_NO']
    },
    {
      unique: true,
      fields: ['GL_ACCT_ID']
    },
    
    // Account type indexes
    {
      fields: ['accountType']
    },
    {
      fields: ['organizationCode', 'accountType']
    },
    {
      fields: ['organizationCode', 'branchCode', 'accountType']
    },
    
    // Organization and branch indexes
    {
      fields: ['organizationCode', 'branchCode']
    },
    {
      fields: ['organizationName', 'branchCode', 'GL_ACCT_NO']
    },
    {
      fields: ['organizationCode', 'GL_ACCT_NO', 'branchCode']
    },
    
    // Status and operational indexes
    {
      fields: ['organizationCode', 'branchCode', 'REC_ST']
    },
    {
      fields: ['organizationCode', 'REC_ST']
    },
    
    // Balance indexes
    {
      fields: ['organizationCode', 'LEDGER_BALANCE']
    },
    {
      fields: ['organizationCode', 'OPENING_BALANCE']
    },
    
    // Legacy system indexes
    {
      fields: ['systemSource']
    },
    {
      fields: ['organizationCode', 'systemSource']
    }
  ]
});

// ==================== STATIC METHODS ====================

/**
 * Helper function to create the table if it doesn't exist
 * This can be called during application startup or before operations
 */
GLAccount.createTableIfNotExists = async function() {
  try {
    // Check if table exists
    const [tables] = await sequelize.query(
      "SHOW TABLES LIKE 'gl_accounts'"
    );
    
    if (tables.length === 0) {
      console.log('📦 Creating gl_accounts table...');
      
      // Use raw SQL to create table with all fields
      await sequelize.query(`
        CREATE TABLE gl_accounts (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          
          -- Core identifiers
          GL_ACCT_NO VARCHAR(255) UNIQUE NOT NULL,
          GL_ACCT_ID VARCHAR(255) UNIQUE NOT NULL,
          CREATED_BY VARCHAR(255) NOT NULL,
          
          -- COA structure
          coaStructure JSON,
          
          -- Branch & Organization
          organizationName VARCHAR(255) NOT NULL,
          organizationCode INT NOT NULL,
          branchName VARCHAR(255) NOT NULL,
          branchCode VARCHAR(255) NOT NULL,
          branchType ENUM('MAIN', 'REGIONAL', 'SUB', 'MOBILE') DEFAULT 'MAIN',
          
          -- Account Classification
          categoryCode VARCHAR(255),
          categoryName VARCHAR(255) DEFAULT 'Default Category',
          parentCode VARCHAR(255),
          level INT NOT NULL,
          
          -- Account Structure
          LEDGER_NO VARCHAR(255) NOT NULL,
          PARENT_ID BIGINT,
          subfolderId VARCHAR(255) NOT NULL,
          BAL_CD VARCHAR(255) NOT NULL,
          SUB_LEDGER_NO VARCHAR(255) NOT NULL,
          SEG_NO INT DEFAULT 1,
          CHART_OF_ACCT_ID VARCHAR(255) NOT NULL,
          ACCT_DESC VARCHAR(255) NOT NULL,
          accountType VARCHAR(255) NOT NULL DEFAULT 'GENERAL',  -- ← ADDED THIS LINE
          GL_ACCT_CAT VARCHAR(255) NOT NULL,
          
          -- Transaction & Posting Controls
          JOURNAL_ID VARCHAR(255),
          TRANSACTION_TYPE VARCHAR(255) DEFAULT 'Asset Balance',
          CR_ALLOWED BOOLEAN DEFAULT TRUE,
          DR_ALLOWED BOOLEAN DEFAULT TRUE,
          REC_ST ENUM('Active', 'Inactive', 'Suspended', 'Closed') DEFAULT 'Active',
          POST_ALLOW BOOLEAN DEFAULT TRUE,
          POST_FG BOOLEAN DEFAULT FALSE,
          CONTROL_ACCT_FG BOOLEAN DEFAULT FALSE,
          SUSPENSE_ACCT_FG BOOLEAN DEFAULT FALSE,
          ALLOW_BAL_SWING_FG BOOLEAN DEFAULT FALSE,
          
          -- Segmentation
          SEG_VALUE VARCHAR(255) DEFAULT '',
          SEG_DESC VARCHAR(255) DEFAULT 'Default Description',
          SEG_TY_CD VARCHAR(255) DEFAULT '',
          SEG_PLACEHLDR_ID VARCHAR(255) DEFAULT '',
          DELAY_GL_POSTING BOOLEAN DEFAULT FALSE,
          
          -- Financial Data
          LEDGER_BALANCE DECIMAL(20,8) DEFAULT 0,
          AVAILABLE_BALANCE DECIMAL(20,8) DEFAULT 0,
          OPENING_BALANCE DECIMAL(20,8) DEFAULT 0,
          CURRENT_BALANCE DECIMAL(20,8) DEFAULT 0,
          CURRENCY_CODE VARCHAR(10) DEFAULT 'NGN',
          
          -- History & Audit
          balanceHistory JSON DEFAULT '[]',
          transactions JSON DEFAULT '[]',
          
          -- Settlement & References
          SETTLEMENT_GL_ACCT_NO VARCHAR(255),
          INTER_BRANCH_ACCOUNT BOOLEAN DEFAULT FALSE,
          
          -- Legacy System Compatibility
          legacyReference JSON DEFAULT '{}',
          systemSource ENUM('LEGACY', 'NEW_SYSTEM', 'MIGRATED') DEFAULT 'NEW_SYSTEM',
          
          -- Sync Status
          syncStatus JSON DEFAULT '{}',
          
          -- Metadata
          metadata JSON NOT NULL DEFAULT '{}',
          branchTimezone VARCHAR(50) DEFAULT 'Africa/Lagos',
          
          -- Timestamps
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          -- Indexes
          INDEX idx_gl_acct_no (GL_ACCT_NO),
          INDEX idx_gl_acct_id (GL_ACCT_ID),
          INDEX idx_account_type (accountType),  -- ← ADDED THIS INDEX
          INDEX idx_org_account_type (organizationCode, accountType),  -- ← ADDED THIS INDEX
          INDEX idx_org_branch_account_type (organizationCode, branchCode, accountType),  -- ← ADDED THIS INDEX
          INDEX idx_org_branch (organizationCode, branchCode),
          INDEX idx_org_branch_status (organizationCode, branchCode, REC_ST),
          INDEX idx_org_gl_acct (organizationCode, GL_ACCT_NO, branchCode),
          INDEX idx_org_status (organizationCode, REC_ST),
          INDEX idx_balance (organizationCode, LEDGER_BALANCE),
          INDEX idx_opening_balance (organizationCode, OPENING_BALANCE),
          INDEX idx_system_source (systemSource),
          INDEX idx_org_system (organizationCode, systemSource)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      console.log('✅ gl_accounts table created successfully');
      return true;
    }
    
    console.log('✅ gl_accounts table already exists');
    
    // Check if accountType column exists, if not add it
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'gl_accounts' 
      AND COLUMN_NAME = 'accountType'
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    if (columns.length === 0) {
      console.log('📦 Adding accountType column to existing gl_accounts table...');
      await sequelize.query(`
        ALTER TABLE gl_accounts 
        ADD COLUMN accountType VARCHAR(255) NOT NULL DEFAULT 'GENERAL' 
        AFTER ACCT_DESC
      `);
      
      // Add indexes for accountType
      await sequelize.query(`
        CREATE INDEX idx_account_type ON gl_accounts (accountType)
      `);
      await sequelize.query(`
        CREATE INDEX idx_org_account_type ON gl_accounts (organizationCode, accountType)
      `);
      await sequelize.query(`
        CREATE INDEX idx_org_branch_account_type ON gl_accounts (organizationCode, branchCode, accountType)
      `);
      
      console.log('✅ accountType column added to gl_accounts table');
    } else {
      console.log('✅ accountType column already exists in gl_accounts table');
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Error creating/updating gl_accounts table:', error.message);
    return false;
  }
};

// Instance methods (custom methods)
GLAccount.prototype.canPost = function(type) {
  if (type === 'DR') return this.DR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  if (type === 'CR') return this.CR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  return false;
};

GLAccount.prototype.isBranchSpecific = function() {
  return this.metadata?.branchSpecific || false;
};

GLAccount.prototype.getFrontendData = function() {
  const metadata = typeof this.metadata === 'string' ? JSON.parse(this.metadata) : this.metadata;
  const coaStructure = typeof this.coaStructure === 'string' ? JSON.parse(this.coaStructure) : this.coaStructure;
  
  return {
    id: this.id,
    GL_ACCT_NO: this.GL_ACCT_NO,
    GL_ACCT_ID: this.GL_ACCT_ID,
    ACCT_DESC: this.ACCT_DESC,
    accountType: this.accountType,  // Now using direct column instead of metadata
    accountClass: metadata?.accountClass,
    normalBalance: metadata?.normalBalance,
    organizationCode: this.organizationCode,
    organizationName: this.organizationName,
    branchCode: this.branchCode,
    branchName: this.branchName,
    LEDGER_BALANCE: this.LEDGER_BALANCE,
    AVAILABLE_BALANCE: this.AVAILABLE_BALANCE,
    CURRENCY_CODE: this.CURRENCY_CODE,
    REC_ST: this.REC_ST,
    coaStructure: coaStructure,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Define class methods (static methods)
GLAccount.findByBranch = async function(organizationCode, branchCode) {
  return await this.findAll({
    where: {
      organizationCode,
      branchCode,
      REC_ST: 'Active'
    }
  });
};

GLAccount.findByOrganizationAndType = async function(organizationCode, accountType) {
  return await this.findAll({
    where: {
      organizationCode,
      accountType,  // Now using direct column
      REC_ST: 'Active'
    }
  });
};

GLAccount.findByAccountType = async function(accountType, options = {}) {
  const whereClause = {
    accountType,  // Using direct column
    REC_ST: 'Active'
  };
  
  if (options.organizationCode) {
    whereClause.organizationCode = options.organizationCode;
  }
  
  if (options.branchCode) {
    whereClause.branchCode = options.branchCode;
  }
  
  return await this.findAll({
    where: whereClause,
    order: options.order || [['createdAt', 'DESC']],
    limit: options.limit
  });
};

GLAccount.findInterBranchAccounts = async function(organizationCode) {
  return await this.findAll({
    where: {
      organizationCode,
      INTER_BRANCH_ACCOUNT: true,
      REC_ST: 'Active'
    }
  });
};

// New method: Find accounts by multiple types
GLAccount.findByAccountTypes = async function(accountTypes, options = {}) {
  const whereClause = {
    accountType: accountTypes,  // Using IN operator for multiple types
    REC_ST: 'Active'
  };
  
  if (options.organizationCode) {
    whereClause.organizationCode = options.organizationCode;
  }
  
  if (options.branchCode) {
    whereClause.branchCode = options.branchCode;
  }
  
  return await this.findAll({
    where: whereClause,
    order: options.order || [['createdAt', 'DESC']],
    limit: options.limit
  });
};

// Association method
GLAccount.associate = (models) => {
  // Add associations if needed
  // Example: GLAccount.hasMany(models.Transaction, { foreignKey: 'accountId' });
};

export default GLAccount;