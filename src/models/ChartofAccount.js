// models/ChartofAccount.js - with hierarchical support (parent-child)
import { DataTypes, Model, QueryTypes } from 'sequelize';
import sequelize from '../../config/db.js';

class ChartofAccount extends Model {
  static async initializeTable() {
    try {
      console.log('🔄 Checking ChartofAccount table...');
      
      const [results] = await sequelize.query(`
        SELECT COUNT(*) as tableExists 
        FROM information_schema.tables 
        WHERE table_schema = DATABASE() 
        AND table_name = 'chart_of_accounts'
      `, { type: QueryTypes.SELECT });
      
      if (results.tableExists === 0) {
        console.log('📊 Creating ChartofAccount table...');
        await sequelize.query(`
          CREATE TABLE chart_of_accounts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(225) NOT NULL,
            glcode VARCHAR(225) UNIQUE,
            type VARCHAR(225) NOT NULL,
            account_usage VARCHAR(225) NOT NULL,
            gl_group VARCHAR(225),
            balance DECIMAL(20,2) DEFAULT 0.00 NOT NULL,
            unreconciled_balance DECIMAL(20,2) DEFAULT 0.00 NOT NULL,
            manual_entries VARCHAR(3) NOT NULL,
            description VARCHAR(225) NOT NULL,
            status VARCHAR(225) DEFAULT 'ACTIVE' NOT NULL,
            organization_code INT NOT NULL,
            branch_code VARCHAR(50) NOT NULL,
            
            -- HIERARCHY FIELDS
            parent_id INT NULL,
            account_level INT DEFAULT 1,
            is_folder BOOLEAN DEFAULT FALSE,
            sort_order INT DEFAULT 0,
            account_path VARCHAR(500),
            
            gl_account_id INT,
            gl_account_no VARCHAR(50),
            mapped_at DATETIME,
            mapping_status VARCHAR(20) DEFAULT 'PENDING',
            last_sync_date DATETIME,
            sync_error TEXT,
            original_id BIGINT,
            source_system VARCHAR(100),
            migration_batch VARCHAR(100),
            migrated_at DATETIME,
            category VARCHAR(100),
            sub_category VARCHAR(100),
            is_control_account BOOLEAN DEFAULT FALSE,
            is_suspense_account BOOLEAN DEFAULT FALSE,
            allow_negative_balance BOOLEAN DEFAULT FALSE,
            posting_rules JSON,
            tax_implications VARCHAR(100),
            regulatory_requirements JSON,
            reporting_category VARCHAR(100),
            version INT DEFAULT 1,
            created_by VARCHAR(100) DEFAULT 'system' NOT NULL,
            updated_by VARCHAR(100),
            is_deleted BOOLEAN DEFAULT FALSE,
            deleted_at DATETIME,
            deleted_by VARCHAR(100),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP NOT NULL,
            
            -- Indexes
            INDEX idx_org_branch (organization_code, branch_code),
            UNIQUE INDEX idx_glcode_org (glcode, organization_code),
            INDEX idx_type_usage (type, account_usage),
            INDEX idx_glgroup_status (gl_group, status),
            INDEX idx_gl_account_id (gl_account_id),
            INDEX idx_mapping_status (mapping_status),
            INDEX idx_original_id (original_id),
            INDEX idx_source_system (source_system),
            INDEX idx_status_deleted (status, is_deleted),
            
            -- Hierarchy indexes
            INDEX idx_parent_id (parent_id),
            INDEX idx_account_level (account_level),
            INDEX idx_is_folder (is_folder),
            
            CONSTRAINT fk_chart_parent
              FOREIGN KEY (parent_id)
              REFERENCES chart_of_accounts(id)
              ON DELETE SET NULL
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);
        console.log('✅ ChartofAccount table created');
      } else {
        console.log('✅ ChartofAccount table already exists');
        
        // Add missing columns (including hierarchy columns)
        try {
          await sequelize.query(`
            ALTER TABLE chart_of_accounts 
            ADD COLUMN IF NOT EXISTS parent_id INT NULL AFTER branch_code,
            ADD COLUMN IF NOT EXISTS account_level INT DEFAULT 1 AFTER parent_id,
            ADD COLUMN IF NOT EXISTS is_folder BOOLEAN DEFAULT FALSE AFTER account_level,
            ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0 AFTER is_folder,
            ADD COLUMN IF NOT EXISTS account_path VARCHAR(500) AFTER sort_order,
            
            ADD COLUMN IF NOT EXISTS gl_account_id INT AFTER branch_code,
            ADD COLUMN IF NOT EXISTS gl_account_no VARCHAR(50) AFTER gl_account_id,
            ADD COLUMN IF NOT EXISTS mapped_at DATETIME AFTER gl_account_no,
            ADD COLUMN IF NOT EXISTS mapping_status VARCHAR(20) DEFAULT 'PENDING' AFTER mapped_at,
            ADD COLUMN IF NOT EXISTS last_sync_date DATETIME AFTER mapping_status,
            ADD COLUMN IF NOT EXISTS sync_error TEXT AFTER last_sync_date,
            ADD COLUMN IF NOT EXISTS original_id BIGINT AFTER sync_error,
            ADD COLUMN IF NOT EXISTS source_system VARCHAR(100) AFTER original_id,
            ADD COLUMN IF NOT EXISTS migration_batch VARCHAR(100) AFTER source_system,
            ADD COLUMN IF NOT EXISTS migrated_at DATETIME AFTER migration_batch,
            ADD COLUMN IF NOT EXISTS category VARCHAR(100) AFTER migrated_at,
            ADD COLUMN IF NOT EXISTS sub_category VARCHAR(100) AFTER category,
            ADD COLUMN IF NOT EXISTS is_control_account BOOLEAN DEFAULT FALSE AFTER sub_category,
            ADD COLUMN IF NOT EXISTS is_suspense_account BOOLEAN DEFAULT FALSE AFTER is_control_account,
            ADD COLUMN IF NOT EXISTS allow_negative_balance BOOLEAN DEFAULT FALSE AFTER is_suspense_account,
            ADD COLUMN IF NOT EXISTS posting_rules JSON AFTER allow_negative_balance,
            ADD COLUMN IF NOT EXISTS tax_implications VARCHAR(100) AFTER posting_rules,
            ADD COLUMN IF NOT EXISTS regulatory_requirements JSON AFTER tax_implications,
            ADD COLUMN IF NOT EXISTS reporting_category VARCHAR(100) AFTER regulatory_requirements,
            ADD COLUMN IF NOT EXISTS version INT DEFAULT 1 AFTER reporting_category,
            ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE AFTER updated_by,
            ADD COLUMN IF NOT EXISTS deleted_at DATETIME AFTER is_deleted,
            ADD COLUMN IF NOT EXISTS deleted_by VARCHAR(100) AFTER deleted_at
          `);
          console.log('✅ ChartofAccount table columns verified (hierarchy columns added)');
        } catch (alterError) {
          console.warn('⚠️ Could not alter ChartofAccount table:', alterError.message);
        }
      }
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize ChartofAccount table:', error);
      throw error;
    }
  }
}

ChartofAccount.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    field: 'id'
  },
  name: { type: DataTypes.STRING(225), allowNull: false, field: 'name' },
  glcode: { type: DataTypes.STRING(225), allowNull: true, unique: true, field: 'glcode' },
  type: { type: DataTypes.STRING(225), allowNull: false, field: 'type' },
  account_usage: { type: DataTypes.STRING(225), allowNull: false, field: 'account_usage' },
  gl_group: { type: DataTypes.STRING(225), allowNull: true, field: 'gl_group' },
  balance: { type: DataTypes.DECIMAL(20, 2), allowNull: false, defaultValue: 0, field: 'balance' },
  unreconciled_balance: { type: DataTypes.DECIMAL(20, 2), allowNull: false, defaultValue: 0, field: 'unreconciled_balance' },
  manual_entries: { 
    type: DataTypes.STRING(3), 
    allowNull: false, 
    validate: { isIn: [['YES', 'NO', 'yes', 'no']] },
    field: 'manual_entries'
  },
  description: { type: DataTypes.STRING(225), allowNull: false, field: 'description' },
  status: { 
    type: DataTypes.STRING(225), 
    allowNull: false, 
    defaultValue: 'ACTIVE',
    validate: { isIn: [['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED', 'active', 'inactive', 'suspended', 'deleted']] },
    field: 'status'
  },
  organizationCode: { type: DataTypes.INTEGER, allowNull: false, field: 'organization_code' },
  branchCode: { type: DataTypes.STRING(50), allowNull: false, field: 'branch_code' },

  // ========== HIERARCHY FIELDS ==========
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'parent_id'
  },
  accountLevel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'account_level'
  },
  isFolder: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_folder'
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'sort_order'
  },
  accountPath: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'account_path'
  },
  // ==========================================

  glAccountId: { type: DataTypes.INTEGER, allowNull: true, field: 'gl_account_id' },
  glAccountNo: { type: DataTypes.STRING(50), allowNull: true, field: 'gl_account_no' },
  mappedAt: { type: DataTypes.DATE, allowNull: true, field: 'mapped_at' },
  mappingStatus: { 
    type: DataTypes.STRING(20), 
    allowNull: true, 
    defaultValue: 'PENDING',
    validate: { isIn: [['PENDING', 'MAPPED', 'FAILED', 'SYNCED']] },
    field: 'mapping_status'
  },
  lastSyncDate: { type: DataTypes.DATE, allowNull: true, field: 'last_sync_date' },
  syncError: { type: DataTypes.TEXT, allowNull: true, field: 'sync_error' },
  originalId: { type: DataTypes.BIGINT, allowNull: true, field: 'original_id' },
  sourceSystem: { type: DataTypes.STRING(100), allowNull: true, field: 'source_system' },
  migrationBatch: { type: DataTypes.STRING(100), allowNull: true, field: 'migration_batch' },
  migratedAt: { type: DataTypes.DATE, allowNull: true, field: 'migrated_at' },
  category: { type: DataTypes.STRING(100), allowNull: true, field: 'category' },
  subCategory: { type: DataTypes.STRING(100), allowNull: true, field: 'sub_category' },
  isControlAccount: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_control_account' },
  isSuspenseAccount: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_suspense_account' },
  allowNegativeBalance: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'allow_negative_balance' },
  postingRules: { type: DataTypes.JSON, allowNull: true, field: 'posting_rules' },
  taxImplications: { type: DataTypes.STRING(100), allowNull: true, field: 'tax_implications' },
  regulatoryRequirements: { type: DataTypes.JSON, allowNull: true, field: 'regulatory_requirements' },
  reportingCategory: { type: DataTypes.STRING(100), allowNull: true, field: 'reporting_category' },
  version: { type: DataTypes.INTEGER, defaultValue: 1, field: 'version' },
  createdBy: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'system', field: 'created_by' },
  updatedBy: { type: DataTypes.STRING(100), allowNull: true, field: 'updated_by' },
  isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_deleted' },
  deletedAt: { type: DataTypes.DATE, allowNull: true, field: 'deleted_at' },
  deletedBy: { type: DataTypes.STRING(100), allowNull: true, field: 'deleted_by' },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' },
  updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'updated_at' }
}, {
  sequelize,
  modelName: 'ChartofAccount',
  tableName: 'chart_of_accounts',
  timestamps: true,
  underscored: false,
  freezeTableName: true,
  hooks: {
    beforeSave: async (account) => {
      if (account.manual_entries) {
        account.manual_entries = account.manual_entries.toUpperCase();
      }
      if (account.status && account.status !== 'DELETED') {
        account.status = account.status.toUpperCase();
      }
      if (account.balance < 0 && !account.allowNegativeBalance) {
        throw new Error('Negative balance not allowed for this account');
      }
      if (account.unreconciled_balance > account.balance) {
        account.unreconciled_balance = account.balance;
      }
      if (account.changed()) {
        account.version = (account.version || 0) + 1;
      }
    }
  },
  indexes: [
    { fields: ['organization_code', 'branch_code'], name: 'idx_org_branch' },
    { fields: ['glcode', 'organization_code'], name: 'idx_glcode_org', unique: true },
    { fields: ['type', 'account_usage'], name: 'idx_type_usage' },
    { fields: ['gl_group', 'status'], name: 'idx_glgroup_status' },
    { fields: ['gl_account_id'], name: 'idx_gl_account_id' },
    { fields: ['mapping_status'], name: 'idx_mapping_status' },
    { fields: ['original_id'], name: 'idx_original_id' },
    { fields: ['source_system'], name: 'idx_source_system' },
    { fields: ['status', 'is_deleted'], name: 'idx_status_deleted' },
    // Hierarchy indexes
    { fields: ['parent_id'], name: 'idx_parent_id' },
    { fields: ['account_level'], name: 'idx_account_level' },
    { fields: ['is_folder'], name: 'idx_is_folder' }
  ]
});

// ============================================
// SELF-REFERENCING ASSOCIATIONS (raw column name)
// ============================================
ChartofAccount.belongsTo(ChartofAccount, {
  foreignKey: 'parent_id',   // ✅ raw column name
  as: 'parent'
});

ChartofAccount.hasMany(ChartofAccount, {
  foreignKey: 'parent_id',   // ✅ raw column name
  as: 'children'
});

export default ChartofAccount;
