// models/Permissions.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Permissions = sequelize.define('Permissions', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id',  // ✅ Explicitly map to database column
    comment: 'Internal ID for database relationships'
  },
  BU_ROLE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'BU_ROLE_ID',  // ✅ Explicitly map to database column
    comment: 'Business unit role identifier'
  },
  ROLE_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'ROLE_NAME',  // ✅ Explicitly map to database column
    comment: 'Role name'
  },
  DESCRIPTION: {
    type: DataTypes.STRING(500),
    allowNull: true,
    field: 'DESCRIPTION',  // ✅ Explicitly map to database column
    comment: 'Role description'
  },
  IS_ACTIVE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'IS_ACTIVE',  // ✅ Explicitly map to database column
    comment: 'Is role active?'
  },
  
  // ==================== PERMISSION ACCESS LEVELS ====================
  
  DRAWER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'DRAWER_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Drawer management permissions'
  },
  CUSTOMER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'CUSTOMER_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Customer management permissions'
  },
  ACCOUNT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'ACCOUNT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Account management permissions'
  },
  TRANSACTION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'TRANSACTION_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Transaction processing permissions'
  },
  DASHBOARD_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'DASHBOARD_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Dashboard viewing permissions'
  },
  
  // Loan & Credit Modules
  LOAN_OPERATIONS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'LOAN_OPERATIONS_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Loan operations permissions'
  },
  LOAN_FEE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'LOAN_FEE_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Loan fee management permissions'
  },
  LOAN_REPAYMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'LOAN_REPAYMENT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Loan repayment permissions'
  },
  GROUP_LOAN_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'GROUP_LOAN_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Group loan management permissions'
  },
  CREDIT_APPL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'CREDIT_APPL_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Credit application permissions'
  },
  LOAN_PORTFOLIO_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'LOAN_PORTFOLIO_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Loan portfolio permissions'
  },
  
  // Financial Modules
  POSTING_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'POSTING_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Financial posting permissions'
  },
  FIXED_ASSET_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'FIXED_ASSET_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Fixed asset management permissions'
  },
  RATE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'RATE_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Rate management permissions'
  },
  TREASURY_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'TREASURY_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Treasury management permissions'
  },
  RECONCILIATION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'RECONCILIATION_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Reconciliation permissions'
  },
  
  // Card Modules
  DEBIT_CARD_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'DEBIT_CARD_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Debit card management permissions'
  },
  
  // Vault Modules
  VAULT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'VAULT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Vault management permissions'
  },
  
  // Report & Analytics
  REPORT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'REPORT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Report viewing permissions'
  },
  ANALYTICS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'ANALYTICS_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Analytics permissions'
  },
  PERFORMANCE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'PERFORMANCE_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Performance monitoring permissions'
  },
  STATISTICS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'STATISTICS_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Statistics permissions'
  },
  
  // Security & Administration
  SYSTEM_ADMIN_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'SYSTEM_ADMIN_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'System administration permissions'
  },
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'PERMISSION_MANAGEMENT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Permission management permissions'
  },
  SECURITY_PROFILE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'SECURITY_PROFILE_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Security profile permissions'
  },
  USER_MANAGEMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'USER_MANAGEMENT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'User management permissions'
  },
  AUDIT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'AUDIT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Audit trail permissions'
  },
  NOTIFICATION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'NOTIFICATION_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Notification permissions'
  },
  PRINT_EXPORT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'PRINT_EXPORT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Print and export permissions'
  },
  QUEUE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'QUEUE_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Queue management permissions'
  },
  
  // Approvals & Workflows
  APPROVAL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'APPROVAL_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Approval permissions'
  },
  WORKFLOW_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'WORKFLOW_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Workflow management permissions'
  },
  OPERATIONS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'OPERATIONS_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Operations permissions'
  },
  BULK_OPERATIONS_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'BULK_OPERATIONS_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Bulk operations permissions'
  },
  
  // Compliance & Risk
  AML_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'AML_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'AML compliance permissions'
  },
  RISK_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'RISK_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Risk management permissions'
  },
  BVN_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'BVN_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'BVN validation permissions'
  },
  EMTL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'EMTL_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'EMTL configuration permissions'
  },
  
  // Business Units & Roles
  BUSINESS_UNIT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'BUSINESS_UNIT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Business unit permissions'
  },
  
  // Deposit & Collections
  DEPOSIT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'DEPOSIT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Deposit management permissions'
  },
  COLLECTION_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'COLLECTION_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Collection management permissions'
  },
  THRIFT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'THRIFT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Thrift management permissions'
  },
  STANDING_ORDER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'STANDING_ORDER_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Standing order permissions'
  },
  
  // Customer & Guarantor
  GUARANTOR_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'GUARANTOR_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Guarantor management permissions'
  },
  GROUP_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'GROUP_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Group management permissions'
  },
  
  // Collateral
  COLLATERAL_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'COLLATERAL_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Collateral management permissions'
  },
  
  // Products & Configuration
  PRODUCT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'PRODUCT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Product management permissions'
  },
  HOLIDAY_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'HOLIDAY_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Holiday management permissions'
  },
  SETTLEMENT_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'SETTLEMENT_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Settlement permissions'
  },
  
  // Marketing & Agency
  MARKETING_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'MARKETING_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Marketing permissions'
  },
  AGENCY_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'AGENCY_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Agency banking permissions'
  },
  MOBILE_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'MOBILE_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Mobile app permissions'
  },
  HELP_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'HELP_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Help and support permissions'
  },
  
  // Restricted Access
  RESTRICTED_CUSTOMER_ACCESS_LEVEL: { 
    type: DataTypes.JSON, 
    allowNull: true, 
    defaultValue: [],
    field: 'RESTRICTED_CUSTOMER_ACCESS_LEVEL',  // ✅ Explicitly map to database column
    comment: 'Permission keys for viewing restricted customer profiles'
  }
}, {
  sequelize,
  modelName: 'Permissions',
  tableName: 'permissions',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  underscored: false,  // ✅ Disable underscore conversion
  indexes: [
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