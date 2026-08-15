// models/GLAccount.js – Corrected for renamed columns (snake_case)
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class GLAccount extends Model {
  /**
   * Ensure the gl_accounts table exists and has the required columns.
   * Uses Sequelize.sync (safe) to create/update the table.
   */
  static async createTableIfNotExists() {
    try {
      // Use sync with alter:false to avoid data loss – just creates missing tables/columns
      await this.sync({ alter: false });
      console.log('✅ GLAccount table synced (columns verified)');

      // Optional: check for the account_type column (if needed, but sync should have added it)
      const [results] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'gl_accounts' 
        AND COLUMN_NAME = 'account_type'
        AND TABLE_SCHEMA = DATABASE()
      `);
      if (results.length === 0) {
        console.log('📦 Adding account_type column...');
        await sequelize.query(`
          ALTER TABLE gl_accounts 
          ADD COLUMN account_type VARCHAR(255) NOT NULL DEFAULT 'GENERAL' 
          AFTER acct_desc
        `);
        console.log('✅ account_type column added');
      }
      return true;
    } catch (error) {
      console.error('❌ Error ensuring GLAccount table:', error.message);
      return false;
    }
  }
}

GLAccount.init(
  {
    // Core identifiers (mapped to snake_case columns)
    GL_ACCT_NO: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'gl_acct_no'
    },
    GL_ACCT_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: 'gl_acct_id'
    },
    CREATED_BY: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'created_by'
    },

    // COA structure (stored as JSON)
    coaStructure: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      field: 'coa_structure'
    },

    // Branch & Organization
    organizationName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'organization_name'
    },
    organizationCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'organization_code'
    },
    branchName: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'branch_name'
    },
    branchCode: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'branch_code'
    },
    branchType: {
      type: DataTypes.ENUM('MAIN', 'REGIONAL', 'SUB', 'MOBILE'),
      defaultValue: 'MAIN',
      field: 'branch_type'
    },

    // Account Classification
    categoryCode: {
      type: DataTypes.STRING,
      field: 'category_code'
    },
    categoryName: {
      type: DataTypes.STRING,
      defaultValue: 'Default Category',
      field: 'category_name'
    },
    parentCode: {
      type: DataTypes.STRING,
      field: 'parent_code'
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'level'
    },

    // Account Structure
    LEDGER_NO: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'ledger_no'
    },
    PARENT_ID: {
      type: DataTypes.INTEGER,
      field: 'parent_id'
    },
    subfolderId: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'subfolder_id'
    },
    BAL_CD: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'bal_cd'
    },
    SUB_LEDGER_NO: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'sub_ledger_no'
    },
    SEG_NO: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      field: 'seg_no'
    },
    CHART_OF_ACCT_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'chart_of_acct_id'
    },
    ACCT_DESC: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'acct_desc'
    },

    // Account type (renamed from accountType to match column)
    accountType: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'GENERAL',
      field: 'account_type'
    },

    GL_ACCT_CAT: {
      type: DataTypes.STRING,
      allowNull: false,
      field: 'gl_acct_cat'
    },

    // Transaction & Posting Controls
    JOURNAL_ID: {
      type: DataTypes.STRING,
      field: 'journal_id'
    },
    TRANSACTION_TYPE: {
      type: DataTypes.STRING,
      defaultValue: 'Asset Balance',
      field: 'transaction_type'
    },
    CR_ALLOWED: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'cr_allowed'
    },
    DR_ALLOWED: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'dr_allowed'
    },
    REC_ST: {
      type: DataTypes.ENUM('Active', 'Inactive', 'Suspended', 'Closed'),
      defaultValue: 'Active',
      field: 'rec_st'
    },
    POST_ALLOW: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'post_allow'
    },
    POST_FG: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'post_fg'
    },
    CONTROL_ACCT_FG: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'control_acct_fg'
    },
    SUSPENSE_ACCT_FG: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'suspense_acct_fg'
    },
    ALLOW_BAL_SWING_FG: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'allow_bal_swing_fg'
    },

    // Segmentation
    SEG_VALUE: {
      type: DataTypes.STRING,
      defaultValue: '',
      field: 'seg_value'
    },
    SEG_DESC: {
      type: DataTypes.STRING,
      defaultValue: 'Default Description',
      field: 'seg_desc'
    },
    SEG_TY_CD: {
      type: DataTypes.STRING,
      defaultValue: '',
      field: 'seg_ty_cd'
    },
    SEG_PLACEHLDR_ID: {
      type: DataTypes.STRING,
      defaultValue: '',
      field: 'seg_placehldr_id'
    },
    DELAY_GL_POSTING: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'delay_gl_posting'
    },

    // Financial Data
    LEDGER_BALANCE: {
      type: DataTypes.DECIMAL(20, 8),
      defaultValue: 0,
      field: 'ledger_balance'
    },
    AVAILABLE_BALANCE: {
      type: DataTypes.DECIMAL(20, 8),
      defaultValue: 0,
      field: 'available_balance'
    },
    OPENING_BALANCE: {
      type: DataTypes.DECIMAL(20, 8),
      defaultValue: 0,
      field: 'opening_balance'
    },
    CURRENT_BALANCE: {
      type: DataTypes.DECIMAL(20, 8),
      defaultValue: 0,
      field: 'current_balance'
    },
    CURRENCY_CODE: {
      type: DataTypes.STRING(10),
      defaultValue: 'NGN',
      field: 'currency_code'
    },

    // History & Audit (JSON fields)
    balanceHistory: {
      type: DataTypes.JSON,
      defaultValue: [],
      field: 'balance_history'
    },
    transactions: {
      type: DataTypes.JSON,
      defaultValue: [],
      field: 'transactions'
    },

    // Settlement & References
    SETTLEMENT_GL_ACCT_NO: {
      type: DataTypes.STRING,
      field: 'settlement_gl_acct_no'
    },
    INTER_BRANCH_ACCOUNT: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'inter_branch_account'
    },

    // Legacy System Compatibility
    legacyReference: {
      type: DataTypes.JSON,
      defaultValue: {},
      field: 'legacy_reference'
    },
    systemSource: {
      type: DataTypes.ENUM('LEGACY', 'NEW_SYSTEM', 'MIGRATED'),
      defaultValue: 'NEW_SYSTEM',
      field: 'system_source'
    },

    // Sync Status
    syncStatus: {
      type: DataTypes.JSON,
      defaultValue: {},
      field: 'sync_status'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: {},
      field: 'metadata'
    },
    branchTimezone: {
      type: DataTypes.STRING,
      defaultValue: 'Africa/Lagos',
      field: 'branch_timezone'
    }
  },
  {
    sequelize,
    modelName: 'GLAccount',
    tableName: 'gl_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false, // This tells Sequelize to use snake_case for timestamps
    // Add hooks to ensure dates are properly set
    hooks: {
      beforeCreate: (instance) => {
        if (!instance.created_at) {
          instance.created_at = new Date();
        }
        if (!instance.updated_at) {
          instance.updated_at = new Date();
        }
      },
      beforeUpdate: (instance) => {
        instance.updated_at = new Date();
      }
    }
  }
);

// Add convenience static methods (keep your existing ones)
GLAccount.findByAccountType = async (accountType, options = {}) => {
  const whereClause = { accountType, REC_ST: 'Active' };
  if (options.organizationCode) whereClause.organizationCode = options.organizationCode;
  if (options.branchCode) whereClause.branchCode = options.branchCode;
  return await GLAccount.findAll({
    where: whereClause,
    order: options.order || [['created_at', 'DESC']],
    limit: options.limit
  });
};

// Add other static methods you previously had (e.g., findByBranch, findByOrganizationAndType, etc.)
GLAccount.findByBranch = async (organizationCode, branchCode) => {
  return await GLAccount.findAll({
    where: { organizationCode, branchCode, REC_ST: 'Active' }
  });
};

GLAccount.findByOrganizationAndType = async (organizationCode, accountType) => {
  return await GLAccount.findAll({
    where: { organizationCode, accountType, REC_ST: 'Active' }
  });
};

GLAccount.findInterBranchAccounts = async (organizationCode) => {
  return await GLAccount.findAll({
    where: { organizationCode, INTER_BRANCH_ACCOUNT: true, REC_ST: 'Active' }
  });
};

// Instance methods
GLAccount.prototype.canPost = function(type) {
  if (type === 'DR') return this.DR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  if (type === 'CR') return this.CR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  return false;
};

GLAccount.prototype.isBranchSpecific = function() {
  const metadata = typeof this.metadata === 'string' ? JSON.parse(this.metadata) : this.metadata;
  return metadata?.branchSpecific || false;
};

GLAccount.prototype.getFrontendData = function() {
  const metadata = typeof this.metadata === 'string' ? JSON.parse(this.metadata) : this.metadata;
  const coaStructure = typeof this.coaStructure === 'string' ? JSON.parse(this.coaStructure) : this.coaStructure;
  return {
    id: this.id,
    GL_ACCT_NO: this.GL_ACCT_NO,
    GL_ACCT_ID: this.GL_ACCT_ID,
    ACCT_DESC: this.ACCT_DESC,
    accountType: this.accountType,
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
    createdAt: this.created_at || this.createdAt,
    updatedAt: this.updated_at || this.updatedAt
  };
};

export default GLAccount;
