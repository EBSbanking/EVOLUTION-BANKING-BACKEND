// models/CustomerAccount.js – Matches actual customer_accounts table (with available_balance, allow_debit, allow_credit)
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class CustomerAccount extends Model {}

CustomerAccount.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: 'id'
    },
    CUST_ID: {
      type: DataTypes.STRING(20),
      allowNull: false,
      field: 'CUST_ID'
    },
    account_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
      field: 'account_number'
    },
    account_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'account_name'
    },
    depositor_name: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'depositor_name'
    },
    product_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'product_id'
    },
    product_code: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'product_code'
    },
    branch_id: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'branch_id'
    },
    status: {
      type: DataTypes.ENUM('ACTIVE', 'DORMANT', 'CLOSED', 'PENDING'),
      defaultValue: 'PENDING',
      field: 'status'
    },
    opening_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      field: 'opening_balance'
    },
    current_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      field: 'current_balance'
    },
    ledger_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      field: 'ledger_balance'
    },
    available_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      field: 'available_balance'
    },
    cleared_balance: {
      type: DataTypes.DECIMAL(20, 2),
      defaultValue: 0.00,
      field: 'cleared_balance'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'NGN',
      field: 'currency'
    },
    prod_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'prod_id'
    },
    // ✅ NEW: Debit / credit permission flags
    allow_debit: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'allow_debit'
    },
    allow_credit: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'allow_credit'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'CustomerAccount',
    tableName: 'customer_accounts',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false
  }
);

// ==================== INSTANCE METHODS ====================
CustomerAccount.prototype.getAccountSummary = function() {
  return {
    id: this.id,
    customerId: this.CUST_ID,
    accountNumber: this.account_number,
    accountName: this.account_name,
    depositorName: this.depositor_name,
    productId: this.product_id,
    productCode: this.product_code,
    branchId: this.branch_id,
    status: this.status,
    openingBalance: parseFloat(this.opening_balance) || 0,
    currentBalance: parseFloat(this.current_balance) || 0,
    ledgerBalance: parseFloat(this.ledger_balance) || 0,
    availableBalance: parseFloat(this.available_balance) || 0,
    clearedBalance: parseFloat(this.cleared_balance) || 0,
    currency: this.currency,
    prodId: this.prod_id,
    allowDebit: this.allow_debit,     // ✅ ADDED
    allowCredit: this.allow_credit,   // ✅ ADDED
    createdAt: this.created_at,
    updatedAt: this.updated_at
  };
};

// ==================== STATIC METHODS ====================
CustomerAccount.findByAccountNumber = async function(accountNumber) {
  return await this.findOne({ where: { account_number: accountNumber } });
};

CustomerAccount.findByCustomerId = async function(customerId) {
  return await this.findAll({
    where: { CUST_ID: customerId },
    order: [['created_at', 'DESC']]
  });
};

CustomerAccount.findActiveAccounts = async function() {
  return await this.findAll({
    where: { status: 'ACTIVE' },
    order: [['created_at', 'DESC']]
  });
};

export default CustomerAccount;