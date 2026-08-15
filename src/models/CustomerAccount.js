// models/CustomerAccount.js – Matches actual customer_accounts table
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class CustomerAccount extends Model {
  // ==================== INSTANCE METHODS ====================
  getAccountSummary() {
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
      allowDebit: this.allow_debit === 1 || this.allow_debit === true,
      allowCredit: this.allow_credit === 1 || this.allow_credit === true,
      smsAlert: this.sms_alert,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  // Check if account allows debit
  isDebitAllowed() {
    return this.allow_debit === 1 || this.allow_debit === true;
  }

  // Check if account allows credit
  isCreditAllowed() {
    return this.allow_credit === 1 || this.allow_credit === true;
  }

  // Check if account is active
  isActive() {
    return this.status === 'ACTIVE';
  }

  // Check if account has sufficient balance
  hasSufficientBalance(amount) {
    const available = parseFloat(this.available_balance) || 0;
    return available >= amount;
  }

  // Get available balance as number
  getAvailableBalance() {
    return parseFloat(this.available_balance) || 0;
  }

  // Get ledger balance as number
  getLedgerBalance() {
    return parseFloat(this.ledger_balance) || 0;
  }
}

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
    // ? Add ACCT_NO as a virtual alias for account_number
    ACCT_NO: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('account_number');
      },
      set(value) {
        this.setDataValue('account_number', value);
      }
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
    // ? Ensure TINYINT(1) is handled correctly
    allow_debit: {
      type: DataTypes.TINYINT,
      defaultValue: 1,
      field: 'allow_debit',
      get() {
        const value = this.getDataValue('allow_debit');
        return value === 1 || value === true;
      },
      set(value) {
        this.setDataValue('allow_debit', value ? 1 : 0);
      }
    },
    allow_credit: {
      type: DataTypes.TINYINT,
      defaultValue: 1,
      field: 'allow_credit',
      get() {
        const value = this.getDataValue('allow_credit');
        return value === 1 || value === true;
      },
      set(value) {
        this.setDataValue('allow_credit', value ? 1 : 0);
      }
    },
    // ? Add DR_ALLOWED as an alias for allow_debit
    DR_ALLOWED: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('allow_debit') === 1 || this.getDataValue('allow_debit') === true;
      }
    },
    // ? Add CR_ALLOWED as an alias for allow_credit
    CR_ALLOWED: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('allow_credit') === 1 || this.getDataValue('allow_credit') === true;
      }
    },
    sms_alert: {
      type: DataTypes.ENUM('Yes', 'No'),
      defaultValue: 'No',
      field: 'sms_alert'
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

// ==================== STATIC METHODS ====================
CustomerAccount.findByAccountNumber = async function(accountNumber, options = {}) {
  return await this.findOne({
    where: { account_number: accountNumber },
    ...options
  });
};

CustomerAccount.findByCustomerId = async function(customerId, options = {}) {
  return await this.findAll({
    where: { CUST_ID: customerId },
    order: [['created_at', 'DESC']],
    ...options
  });
};

CustomerAccount.findActiveAccounts = async function(options = {}) {
  return await this.findAll({
    where: { status: 'ACTIVE' },
    order: [['created_at', 'DESC']],
    ...options
  });
};

CustomerAccount.findActiveByCurrency = async function(currency, options = {}) {
  return await this.findAll({
    where: {
      status: 'ACTIVE',
      currency: currency
    },
    ...options
  });
};

export default CustomerAccount;
