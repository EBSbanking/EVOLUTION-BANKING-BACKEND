// models/Permissions.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Permissions = sequelize.define('Permissions', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Internal ID for database relationships'
  },
  BU_ROLE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Business unit role identifier'
  },
  ROLE_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Role name'
  },
  DESCRIPTION: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Role description'
  },
  IS_ACTIVE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Is role active?'
  },
  
  // ==================== PERMISSION ACCESS LEVELS ====================
  
  // Core Modules
  DRAWER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Drawer management permissions'
  },
  CUSTOMER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Customer management permissions'
  },
  ACCOUNT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Account management permissions'
  },
  TRANSACTION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Transaction processing permissions'
  },
  DASHBOARD_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Dashboard viewing permissions'
  },
  
  // Loan & Credit Modules
  LOAN_OPERATIONS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Loan operations permissions'
  },
  LOAN_FEE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Loan fee management permissions'
  },
  LOAN_REPAYMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Loan repayment permissions'
  },
  GROUP_LOAN_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Group loan management permissions'
  },
  CREDIT_APPL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Credit application permissions'
  },
  LOAN_PORTFOLIO_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Loan portfolio permissions'
  },
  
  // Financial Modules
  POSTING_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Financial posting permissions'
  },
  FIXED_ASSET_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Fixed asset management permissions'
  },
  RATE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Rate management permissions'
  },
  TREASURY_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Treasury management permissions'
  },
  RECONCILIATION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Reconciliation permissions'
  },
  
  // Card Modules
  DEBIT_CARD_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Debit card management permissions'
  },
  
  // Vault Modules
  VAULT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Vault management permissions'
  },
  
  // Report & Analytics
  REPORT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Report viewing permissions'
  },
  ANALYTICS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Analytics permissions'
  },
  PERFORMANCE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Performance monitoring permissions'
  },
  STATISTICS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Statistics permissions'
  },
  
  // Security & Administration
  SYSTEM_ADMIN_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'System administration permissions'
  },
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Permission management permissions'
  },
  SECURITY_PROFILE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Security profile permissions'
  },
  USER_MANAGEMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'User management permissions'
  },
  AUDIT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Audit trail permissions'
  },
  NOTIFICATION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Notification permissions'
  },
  PRINT_EXPORT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Print and export permissions'
  },
  QUEUE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Queue management permissions'
  },
  
  // Approvals & Workflows
  APPROVAL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Approval permissions'
  },
  WORKFLOW_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Workflow management permissions'
  },
  OPERATIONS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Operations permissions'
  },
  BULK_OPERATIONS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Bulk operations permissions'
  },
  
  // Compliance & Risk
  AML_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'AML compliance permissions'
  },
  RISK_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Risk management permissions'
  },
  BVN_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'BVN validation permissions'
  },
  EMTL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'EMTL configuration permissions'
  },
  
  // Business Units & Roles
  BUSINESS_UNIT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Business unit permissions'
  },
  
  // Deposit & Collections
  DEPOSIT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Deposit management permissions'
  },
  COLLECTION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Collection management permissions'
  },
  THRIFT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Thrift management permissions'
  },
  STANDING_ORDER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Standing order permissions'
  },
  
  // Customer & Guarantor
  GUARANTOR_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Guarantor management permissions'
  },
  GROUP_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Group management permissions'
  },
  
  // Collateral
  COLLATERAL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Collateral management permissions'
  },
  
  // Products & Configuration
  PRODUCT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Product management permissions'
  },
  HOLIDAY_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Holiday management permissions'
  },
  SETTLEMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Settlement permissions'
  },
  
  // Marketing & Agency
  MARKETING_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Marketing permissions'
  },
  AGENCY_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Agency banking permissions'
  },
  MOBILE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Mobile app permissions'
  },
  HELP_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Help and support permissions'
  },
  
  // Restricted Access
  RESTRICTED_CUSTOMER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    comment: 'Permission keys for viewing restricted customer profiles'
  }
}, {
  sequelize,
  modelName: 'Permissions',
  tableName: 'permissions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    // Index for faster role lookups
    {
      fields: ['BU_ROLE_ID'],
      name: 'idx_permissions_bu_role_id'
    },
    {
      fields: ['IS_ACTIVE'],
      name: 'idx_permissions_is_active'
    },
    {
      fields: ['ROLE_NAME'],
      name: 'idx_permissions_role_name'
    }
  ]
});

export default Permissions;