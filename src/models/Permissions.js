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
  // Permission arrays stored as JSON – all 35 categories
  DRAWER_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  CUSTOMER_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  ACCOUNT_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  TRANSACTION_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  DASHBOARD_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  REPORT_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  THRIFT_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  LOAN_OPERATIONS_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  LOAN_FEE_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  POSTING_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  FIXED_ASSET_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  SYSTEM_ADMIN_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  CREDIT_APPL_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  APPROVAL_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  TREASURY_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  OPERATIONS_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  WORKFLOW_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  AML_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  BUSINESS_UNIT_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  SECURITY_PROFILE_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  DEPOSIT_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  GUARANTOR_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  RATE_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  PRODUCT_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  HOLIDAY_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  MARKETING_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  AGENCY_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  ANALYTICS_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  RISK_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  RECONCILIATION_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  PERFORMANCE_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] },
  STATISTICS_ACCESS_LEVEL: { type: DataTypes.JSON, allowNull: true, defaultValue: [] }
}, {
  sequelize,
  modelName: 'Permissions',
  tableName: 'permissions',
  timestamps: true,
  indexes: [
    
    // ❌ No index on BU_ROLE_ID – we rely on application logic for uniqueness
    // ❌ No other indexes that might cause problems during table creation
  ]
});

export default Permissions;