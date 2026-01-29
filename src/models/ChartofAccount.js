// models/ChartofAccount.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class ChartofAccount extends Model {
  // ... (keep all your static and instance methods)
}

ChartofAccount.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    field: 'id'
  },
  
  name: { 
    type: DataTypes.STRING(225),
    allowNull: false,
    field: 'name'
  },
  
  glcode: { 
    type: DataTypes.STRING(225),
    allowNull: true,
    unique: true,
    field: 'glcode'
  },
  
  type: { 
    type: DataTypes.STRING(225),
    allowNull: false,
    field: 'type'
  },
  
  account_usage: { 
    type: DataTypes.STRING(225),
    allowNull: false,
    field: 'account_usage'
  },
  
  gl_group: { 
    type: DataTypes.STRING(225),
    allowNull: true,
    field: 'gl_group'
  },
  
  balance: { 
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'balance'
  },
  
  unreconciled_balance: { 
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'unreconciled_balance'
  },
  
  manual_entries: { 
    type: DataTypes.STRING(3),
    allowNull: false,
    validate: {
      isIn: [['YES', 'NO', 'yes', 'no']]
    },
    field: 'manual_entries'
  },
  
  description: { 
    type: DataTypes.STRING(225),
    allowNull: false,
    field: 'description'
  },
  
  status: { 
    type: DataTypes.STRING(225),
    allowNull: false,
    defaultValue: 'ACTIVE',
    validate: {
      isIn: [['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED', 'active', 'inactive', 'suspended', 'deleted']]
    },
    field: 'status'
  },
  
  organizationCode: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'organization_code'
  },
  
  branchCode: { 
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'branch_code'
  },
  
  glAccountId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'gl_account_id'
  },
  
  glAccountNo: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'gl_account_no'
  },
  
  mappedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'mapped_at'
  },
  
  mappingStatus: {
    type: DataTypes.STRING(20),
    allowNull: true,
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'MAPPED', 'FAILED', 'SYNCED']]
    },
    field: 'mapping_status'
  },
  
  lastSyncDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_sync_date'
  },
  
  syncError: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'sync_error'
  },
  
  originalId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    field: 'original_id'
  },
  
  sourceSystem: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'source_system'
  },
  
  migrationBatch: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'migration_batch'
  },
  
  migratedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'migrated_at'
  },
  
  category: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'category'
  },
  
  subCategory: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'sub_category'
  },
  
  isControlAccount: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_control_account'
  },
  
  isSuspenseAccount: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_suspense_account'
  },
  
  allowNegativeBalance: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'allow_negative_balance'
  },
  
  postingRules: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'posting_rules'
  },
  
  taxImplications: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'tax_implications'
  },
  
  regulatoryRequirements: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'regulatory_requirements'
  },
  
  reportingCategory: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'reporting_category'
  },
  
  version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'version'
  },
  
  createdBy: {
    type: DataTypes.STRING(100),
    allowNull: false,
    defaultValue: 'system',
    field: 'created_by'
  },
  
  updatedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'updated_by'
  },
  
  isDeleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_deleted'
  },
  
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'deleted_at'
  },
  
  deletedBy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'deleted_by'
  },
  
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
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
  // FIXED: Indexes now use the actual database column names
  indexes: [
    { 
      fields: ['organization_code', 'branch_code'],  // Use actual column names
      name: 'idx_org_branch' 
    },
    { 
      fields: ['glcode', 'organization_code'],
      name: 'idx_glcode_org',
      unique: true 
    },
    { 
      fields: ['type', 'account_usage'],
      name: 'idx_type_usage' 
    },
    { 
      fields: ['gl_group', 'status'],
      name: 'idx_glgroup_status' 
    },
    { 
      fields: ['gl_account_id'],
      name: 'idx_gl_account_id' 
    },
    { 
      fields: ['mapping_status'],
      name: 'idx_mapping_status' 
    },
    { 
      fields: ['original_id'],
      name: 'idx_original_id' 
    },
    { 
      fields: ['source_system'],
      name: 'idx_source_system' 
    },
    { 
      fields: ['status', 'is_deleted'],
      name: 'idx_status_deleted' 
    }
  ]
});

export default ChartofAccount;