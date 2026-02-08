// models/Account.js
// (renamed from AccountSimplified.js for clarity)

import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';  // adjust path if needed

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
      // index: true,  // uncomment if you frequently query by customer
    },

    account_number: {
      type: DataTypes.STRING(10),
      allowNull: false,
      unique: true,
      // This should be your primary lookup field for most operations
    },

    acct_no: {
      type: DataTypes.STRING(10),
      allowNull: true,
      // Legacy/alternative account number field (if needed)
    },

    acct_nm: {
      type: DataTypes.STRING(255),
      allowNull: true,
      // Account name / description
    },

    account_type: {
      type: DataTypes.ENUM('SAVINGS', 'CURRENT', 'LOAN', 'FIXED_DEPOSIT', 'OTHER'),
      allowNull: true,
      defaultValue: 'SAVINGS',
    },

    product_type: {
      type: DataTypes.STRING(225),
      allowNull: false,
    },

    product: {
      type: DataTypes.STRING(225),
      allowNull: false,
    },

    branch: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },

    ledger_balance: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0.00,
    },

    available_balance: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0.00,
    },

    cleared_balance: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      defaultValue: 0.00,
    },

    rec_st: {
      type: DataTypes.ENUM(
        'ACTIVE',
        'DORMANT',
        'SUSPENDED',
        'CLOSED',
        'INACTIVE',
        'PENDING'
      ),
      allowNull: false,
      defaultValue: 'PENDING',
    },

    currency: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'NGN',
    },

    online_enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    dr_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    cr_allowed: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    last_activity_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: 'accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        name: 'idx_account_number',
        unique: true,
        fields: ['account_number'],
      },
      {
        name: 'idx_customer_id',
        fields: ['customer_id'],
      },
      {
        name: 'idx_rec_st',
        fields: ['rec_st'],
      },
    ],
  }
);

// === Associations (add these in your models/index.js or here) ===
// Example:
// Account.belongsTo(Customer, { foreignKey: 'customer_id', as: 'customer' });
// Customer.hasMany(Account, { foreignKey: 'customer_id', as: 'accounts' });

// You can also add:
// Account.hasMany(LoanAccount, { foreignKey: 'account_number', sourceKey: 'account_number', as: 'loans' });
// etc.

export default Account;