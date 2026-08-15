// models/CustomerTransaction.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

class CustomerTransaction extends Model {
  // Static methods
  static async findByAccountNumber(accountNumber, limit = 50) {
    return this.findAll({
      where: { accountNumber },
      order: [['transactionDate', 'DESC']],
      limit
    });
  }

  static async findByCustomerId(customerId, limit = 50) {
    return this.findAll({
      where: { customerId },
      order: [['transactionDate', 'DESC']],
      limit
    });
  }

  static async findByDateRange(startDate, endDate, accountNumber = null) {
    const where = {
      transactionDate: {
        [Op.between]: [startDate, endDate]
      }
    };
    
    if (accountNumber) {
      where.accountNumber = accountNumber;
    }
    
    return this.findAll({
      where,
      order: [['transactionDate', 'DESC']]
    });
  }

  static async getTransactionSummary(accountNumber, startDate, endDate) {
    const transactions = await this.findAll({
      where: {
        accountNumber,
        transactionDate: {
          [Op.between]: [startDate, endDate]
        },
        status: 'COMPLETED'
      }
    });

    const summary = {
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalTransfers: 0,
      transactionCount: transactions.length,
      averageAmount: 0,
      largestTransaction: 0,
      smallestTransaction: 0
    };

    const amounts = [];
    
    transactions.forEach(txn => {
      const amount = parseFloat(txn.amount || 0);
      
      switch(txn.transactionType) {
        case 'DEPOSIT':
          summary.totalDeposits += amount;
          break;
        case 'WITHDRAWAL':
          summary.totalWithdrawals += amount;
          break;
        case 'TRANSFER':
          summary.totalTransfers += amount;
          break;
      }
      
      amounts.push(amount);
    });

    if (amounts.length > 0) {
      summary.averageAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      summary.largestTransaction = Math.max(...amounts);
      summary.smallestTransaction = Math.min(...amounts);
    }

    return summary;
  }
}

// Helper to generate unique IDs
const generateId = (prefix = 'TXN') => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}${timestamp}${random}`.slice(0, 20);
};

CustomerTransaction.init({
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
    field: 'id'
  },

  transactionId: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    field: 'transaction_id'
  },

  referenceNo: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    field: 'reference_no'
  },

  accountNumber: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'account_number'
  },

  customerId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    field: 'customer_id'
  },

  customerCode: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'customer_code'
  },

  transactionType: {
    type: DataTypes.ENUM(
      'DEPOSIT',
      'WITHDRAWAL',
      'TRANSFER',
      'BILL_PAYMENT',
      'LOAN_DISBURSEMENT',
      'LOAN_REPAYMENT',
      'INTEREST_CREDIT',
      'CHARGE',
      'REVERSAL',
      'ADJUSTMENT'
    ),
    allowNull: false,
    field: 'transaction_type'
  },

  amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'amount',
    get() {
      const value = this.getDataValue('amount');
      return value ? parseFloat(value) : 0;
    }
  },

  balanceBefore: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'balance_before',
    get() {
      const value = this.getDataValue('balanceBefore');
      return value ? parseFloat(value) : 0;
    }
  },

  balanceAfter: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'balance_after',
    get() {
      const value = this.getDataValue('balanceAfter');
      return value ? parseFloat(value) : 0;
    }
  },

  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'NGN',
    field: 'currency'
  },

  narration: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'narration'
  },

  category: {
    type: DataTypes.ENUM('CASH', 'TRANSFER', 'CHEQUE', 'ONLINE', 'ATM', 'MOBILE', 'OTHER'),
    defaultValue: 'CASH',
    field: 'category'
  },

  counterpartyAccount: {
    type: DataTypes.STRING(50),
    field: 'counterparty_account'
  },
  
  counterpartyName: {
    type: DataTypes.STRING(255),
    field: 'counterparty_name'
  },
  
  counterpartyBank: {
    type: DataTypes.STRING(255),
    field: 'counterparty_bank'
  },

  branchCode: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'branch_code'
  },
  
  branchName: {
    type: DataTypes.STRING(255),
    field: 'branch_name'
  },
  
  tellerId: {
    type: DataTypes.STRING(50),
    field: 'teller_id'
  },
  
  userId: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'user_id'
  },
  
  userName: {
    type: DataTypes.STRING(255),
    field: 'user_name'
  },

  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'DECLINED'),
    defaultValue: 'COMPLETED',
    allowNull: false,
    field: 'status'
  },
  
  authorizationCode: {
    type: DataTypes.STRING(100),
    field: 'authorization_code'
  },
  
  approvedBy: {
    type: DataTypes.STRING(100),
    field: 'approved_by'
  },

  transactionDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'transaction_date'
  },
  
  valueDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'value_date'
  },
  
  postedDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'posted_date'
  },

  channel: {
    type: DataTypes.ENUM('BRANCH', 'ATM', 'MOBILE', 'ONLINE', 'POS', 'AGENT', 'OTHER'),
    defaultValue: 'BRANCH',
    field: 'channel'
  },
  
  deviceId: {
    type: DataTypes.STRING(100),
    field: 'device_id'
  },
  
  ipAddress: {
    type: DataTypes.STRING(45),
    field: 'ip_address'
  },

  isReversal: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_reversal'
  },
  
  reversedTransactionId: {
    type: DataTypes.STRING(20),
    field: 'reversed_transaction_id'
  },
  
  reversalReason: {
    type: DataTypes.STRING(255),
    field: 'reversal_reason'
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
  modelName: 'CustomerTransaction',
  tableName: 'customer_transactions',
  timestamps: true,
  underscored: false,
  freezeTableName: true,
  // IMPORTANT: Add this to tell Sequelize to use field mappings in indexes
  // Sequelize v6+ needs this configuration
  sequelizeOptions: {
    define: {
      fieldMapping: true  // This tells Sequelize to use field mappings for indexes
    }
  },
  hooks: {
    beforeCreate: async (transaction) => {
      try {
        if (!transaction.transactionId) {
          transaction.transactionId = generateId('TXN');
        }
        if (!transaction.referenceNo) {
          transaction.referenceNo = generateId('REF');
        }
      } catch (error) {
        logger.error('Error in CustomerTransaction beforeCreate hook:', error);
        throw error;
      }
    }
  },
  // FIX: Remove indexes OR use raw SQL for indexes after table creation
  // The best approach is to NOT define indexes in the model and add them separately
  // OR use the field names directly (not recommended as it's confusing)
  indexes: []  // Remove all indexes from here
});

// Add instance methods
CustomerTransaction.prototype.formattedDate = function () {
  return this.transactionDate
    ? this.transactionDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
};

CustomerTransaction.prototype.formattedTime = function () {
  return this.transactionDate
    ? this.transactionDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : '';
};

CustomerTransaction.prototype.formattedAmount = function () {
  const amount = parseFloat(this.amount || 0);
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.currency || 'NGN'
  }).format(amount);
};

export default CustomerTransaction;
