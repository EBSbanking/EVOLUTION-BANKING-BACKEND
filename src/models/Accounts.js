// models/Account.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Account = sequelize.define(
  'Account',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true,
    },
    customer_id: {
      type: DataTypes.BIGINT,
      allowNull: false,
      // ✅ index removed – we rely on application queries; you can add later via migration
    },
    account_number: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,          // ✅ this is enough – no need for manual index entry
    },
    acct_no: { type: DataTypes.STRING(10), allowNull: true },
    acct_nm: { type: DataTypes.STRING(255), allowNull: true },
    account_type: { type: DataTypes.ENUM('SAVINGS', 'CURRENT', 'LOAN', 'FIXED_DEPOSIT', 'OTHER'), allowNull: true, defaultValue: 'SAVINGS' },
    product_type: { type: DataTypes.STRING(225), allowNull: false },
    product: { type: DataTypes.STRING(225), allowNull: false },
    branch: { type: DataTypes.BIGINT, allowNull: false },
    ledger_balance: { type: DataTypes.DECIMAL(20,2), allowNull: false, defaultValue: 0.00 },
    available_balance: { type: DataTypes.DECIMAL(20,2), allowNull: false, defaultValue: 0.00 },
    cleared_balance: { type: DataTypes.DECIMAL(20,2), allowNull: false, defaultValue: 0.00 },
    rec_st: { type: DataTypes.ENUM('ACTIVE','DORMANT','SUSPENDED','CLOSED','INACTIVE','PENDING'), allowNull: false, defaultValue: 'PENDING' },
    currency: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'NGN' },
    online_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    dr_allowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    cr_allowed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    last_activity_date: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
     modelName: 'Accounts',
    tableName: 'accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    // ❌ indexes array removed completely – no manual indexes
  }
);

export default Account;