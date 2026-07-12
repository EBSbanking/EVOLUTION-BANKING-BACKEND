// models/Transaction.js - Updated with drawer reference fields
import { DataTypes, Op, QueryTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

// Helper function: get all transaction types
const getAllTransactionTypes = () => [
  'DEPOSIT','WITHDRAWAL','TRANSFER','LOAN_DISBURSEMENT',
  'LOAN_REPAYMENT','FEE_CHARGE','INTEREST_CREDIT','INTEREST_CHARGE',
  'PENALTY_CHARGE','SALARY_PAYMENT','BILL_PAYMENT','ATM_WITHDRAWAL',
  'ONLINE_TRANSFER','MOBILE_TRANSFER','STANDING_ORDER','DIRECT_DEBIT',
  'CHEQUE_DEPOSIT','CASH_DEPOSIT','CASH_WITHDRAWAL','REVERSAL','ADJUSTMENT',
  'REFUND','THRIFT_OPENING','THRIFT_COLLECTION','THRIFT_WITHDRAWAL','THRIFT_BANK_PAYMENT'
];

class Transaction extends Model {
  // ----- Static Methods -----
  static async generateTransactionIds() {
    try {
      const [lastTransaction] = await sequelize.query(
        'SELECT MAX(transaction_identifier) as max_id FROM transactions',
        { type: QueryTypes.SELECT }
      );
      
      let nextTransactionId = 1;
      if (lastTransaction?.max_id) {
        nextTransactionId = parseInt(lastTransaction.max_id, 10) + 1;
      }
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000);
      
      return {
        TRANSACTION_IDENTIFIER: String(nextTransactionId),
        EVENT_ID: String(nextTransactionId),
        JOURNAL_ID: `JRN${timestamp}${randomSuffix}`,
        TRAN_JOURNAL_ID: `TJ${timestamp}${randomSuffix}`,
        TRANSACTION_ID: `TXN${String(nextTransactionId).padStart(10, '0')}`
      };
    } catch (error) {
      console.error('Error generating transaction IDs:', error.message);
      throw error;
    }
  }

  static async getTransactionByReference(reference) {
    try {
      const transaction = await Transaction.findOne({
        where: { REFERENCE: reference }
      });
      return transaction;
    } catch (error) {
      console.error('Error getting transaction by reference:', error.message);
      throw error;
    }
  }

  static async getTransactionsByDateRange(startDate, endDate, filters = {}) {
    try {
      const whereClause = {
        transaction_date: {
          [Op.between]: [startDate, endDate]
        }
      };
      
      if (filters.account_number) whereClause.account_number = filters.account_number;
      if (filters.customer_id) whereClause.customer_id = filters.customer_id;
      if (filters.transaction_type) whereClause.transaction_type = filters.transaction_type;
      if (filters.status) whereClause.status = filters.status;
      if (filters.bu_id) whereClause.bu_id = filters.bu_id;
      if (filters.drawer_no) whereClause.drawer_no = filters.drawer_no;
      if (filters.drawer_id) whereClause.drawer_id = filters.drawer_id;
      
      const transactions = await Transaction.findAll({
        where: whereClause,
        order: [['transaction_date', 'DESC']]
      });
      return transactions;
    } catch (error) {
      console.error('Error getting transactions by date range:', error.message);
      throw error;
    }
  }

  static async getTransactionsByDrawer(drawerNo, drawerId = null, filters = {}) {
    try {
      const whereClause = {
        [Op.or]: [
          { drawer_no: drawerNo },
          { drawer_id: drawerId }
        ]
      };
      
      if (filters.start_date && filters.end_date) {
        whereClause.transaction_date = {
          [Op.between]: [filters.start_date, filters.end_date]
        };
      }
      if (filters.transaction_type) whereClause.transaction_type = filters.transaction_type;
      if (filters.status) whereClause.status = filters.status;
      
      const transactions = await Transaction.findAll({
        where: whereClause,
        order: [['transaction_date', 'DESC']]
      });
      return transactions;
    } catch (error) {
      console.error('Error getting transactions by drawer:', error.message);
      throw error;
    }
  }

  static async getDrawerTransactionSummary(drawerNo, drawerId = null, period = 'today') {
    try {
      let dateFilter = {};
      const now = new Date();
      
      if (period === 'today') {
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateFilter = {
          [Op.between]: [today, tomorrow]
        };
      } else if (period === 'week') {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        dateFilter = {
          [Op.between]: [weekAgo, now]
        };
      } else if (period === 'month') {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        dateFilter = {
          [Op.between]: [monthAgo, now]
        };
      }
      
      const whereClause = {
        [Op.or]: [
          { drawer_no: drawerNo },
          { drawer_id: drawerId }
        ],
        status: 'COMPLETED'
      };
      
      if (Object.keys(dateFilter).length > 0) {
        whereClause.transaction_date = dateFilter;
      }
      
      const transactions = await Transaction.findAll({
        where: whereClause,
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
          [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN transaction_direction = 'CREDIT' THEN amount ELSE 0 END`)), 'totalCredits'],
          [sequelize.fn('SUM', sequelize.literal(`CASE WHEN transaction_direction = 'DEBIT' THEN amount ELSE 0 END`)), 'totalDebits']
        ]
      });
      
      return transactions[0] || { totalTransactions: 0, totalAmount: 0, totalCredits: 0, totalDebits: 0 };
    } catch (error) {
      console.error('Error getting drawer transaction summary:', error.message);
      throw error;
    }
  }

  static async approveTransaction(transactionId, approvedBy, notes = '') {
    try {
      const transaction = await Transaction.findByPk(transactionId);
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.status !== 'PENDING_APPROVAL') throw new Error('Transaction is not pending approval');
      
      await transaction.update({
        status: 'COMPLETED',
        APPROVED_BY: approvedBy,
        APPROVAL_DATE: new Date(),
        APPROVAL_NOTES: notes
      });
      return transaction;
    } catch (error) {
      console.error('Error approving transaction:', error.message);
      throw error;
    }
  }

  static async rejectTransaction(transactionId, rejectedBy, notes = '') {
    try {
      const transaction = await Transaction.findByPk(transactionId);
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.status !== 'PENDING_APPROVAL') throw new Error('Transaction is not pending approval');
      
      await transaction.update({
        status: 'FAILED',
        REJECTED_BY: rejectedBy,
        REJECTION_DATE: new Date(),
        REJECTION_NOTES: notes
      });
      return transaction;
    } catch (error) {
      console.error('Error rejecting transaction:', error.message);
      throw error;
    }
  }

  static async reverseTransaction(transactionId, reversedBy, reason = '') {
    try {
      const transaction = await Transaction.findByPk(transactionId);
      if (!transaction) throw new Error('Transaction not found');
      if (transaction.status !== 'COMPLETED') throw new Error('Only completed transactions can be reversed');
      
      const reversalData = {
        ...transaction.toJSON(),
        id: undefined,
        TRANSACTION_IDENTIFIER: await Transaction.getNextTransactionId(),
        transactionDirection: transaction.transactionDirection === 'CREDIT' ? 'DEBIT' : 'CREDIT',
        status: 'REVERSED',
        createdBy: reversedBy,
        description: `Reversal: ${transaction.description || ''} - ${reason}`,
        REFERENCE: `REV-${transaction.REFERENCE}`,
        metadata: {
          ...transaction.metadata,
          original_transaction_id: transaction.id,
          reversal_reason: reason,
          reversed_by: reversedBy,
          reversed_at: new Date()
        }
      };
      
      const reversal = await Transaction.create(reversalData);
      
      await transaction.update({
        status: 'REVERSED',
        metadata: {
          ...transaction.metadata,
          reversed_by: reversedBy,
          reversed_at: new Date(),
          reversal_reason: reason,
          reversal_transaction_id: reversal.id
        }
      });
      return reversal;
    } catch (error) {
      console.error('Error reversing transaction:', error.message);
      throw error;
    }
  }

  static async getNextTransactionId() {
    try {
      const [lastTransaction] = await sequelize.query(
        'SELECT MAX(transaction_identifier) as max_id FROM transactions',
        { type: QueryTypes.SELECT }
      );
      let nextId = 1;
      if (lastTransaction?.max_id) {
        nextId = parseInt(lastTransaction.max_id, 10) + 1;
      }
      return String(nextId);
    } catch (error) {
      console.error('Error getting next transaction ID:', error.message);
      throw error;
    }
  }

  static async getTransactionStats(filters = {}) {
    try {
      let whereClause = '';
      const replacements = [];
      
      if (filters.start_date && filters.end_date) {
        whereClause = 'WHERE transaction_date BETWEEN ? AND ?';
        replacements.push(filters.start_date, filters.end_date);
      }
      if (filters.bu_id) {
        whereClause += whereClause ? ' AND bu_id = ?' : 'WHERE bu_id = ?';
        replacements.push(filters.bu_id);
      }
      if (filters.drawer_no) {
        whereClause += whereClause ? ' AND drawer_no = ?' : 'WHERE drawer_no = ?';
        replacements.push(filters.drawer_no);
      }
      
      const [stats] = await sequelize.query(`
        SELECT 
          COUNT(*) as total_transactions,
          SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_transactions,
          SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_transactions,
          SUM(CASE WHEN status = 'PENDING_APPROVAL' THEN 1 ELSE 0 END) as pending_approval_transactions,
          SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_transactions,
          SUM(CASE WHEN status = 'REVERSED' THEN 1 ELSE 0 END) as reversed_transactions,
          SUM(CASE WHEN transaction_direction = 'CREDIT' THEN amount ELSE 0 END) as total_credits,
          SUM(CASE WHEN transaction_direction = 'DEBIT' THEN amount ELSE 0 END) as total_debits,
          COUNT(DISTINCT customer_id) as unique_customers,
          COUNT(DISTINCT account_number) as unique_accounts,
          SUM(CASE WHEN flagged_for_aml = 1 THEN 1 ELSE 0 END) as aml_flagged_transactions
        FROM transactions 
        ${whereClause}
      `, { replacements, type: QueryTypes.SELECT });
      return stats[0];
    } catch (error) {
      console.error('Error getting transaction stats:', error.message);
      throw error;
    }
  }

  static async initializeTable() {
    try {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          account_number VARCHAR(50) NOT NULL,
          account_id VARCHAR(50) NOT NULL,
          drawer_no VARCHAR(50) NULL,
          drawer_id INT NULL,
          bu_id INT NOT NULL,
          customer_id VARCHAR(50) NOT NULL,
          account_name VARCHAR(255) NOT NULL,
          amount DECIMAL(15,2) NOT NULL,
          transaction_direction ENUM('CREDIT', 'DEBIT') DEFAULT 'CREDIT',
          transaction_date DATETIME NOT NULL,
          transaction_type ENUM(
            'DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'LOAN_DISBURSEMENT', 'LOAN_REPAYMENT',
            'FEE_CHARGE', 'INTEREST_CREDIT', 'INTEREST_CHARGE', 'PENALTY_CHARGE',
            'SALARY_PAYMENT', 'BILL_PAYMENT', 'ATM_WITHDRAWAL', 'ONLINE_TRANSFER',
            'MOBILE_TRANSFER', 'STANDING_ORDER', 'DIRECT_DEBIT', 'CHEQUE_DEPOSIT',
            'CASH_DEPOSIT', 'CASH_WITHDRAWAL', 'REVERSAL', 'ADJUSTMENT', 'REFUND',
            'THRIFT_OPENING', 'THRIFT_COLLECTION', 'THRIFT_WITHDRAWAL', 'THRIFT_BANK_PAYMENT'
          ) NOT NULL,
          transaction_identifier VARCHAR(50) NOT NULL,
          transaction_id VARCHAR(50),
          event_id VARCHAR(50) NOT NULL,
          journal_id VARCHAR(100) NOT NULL,
          reference VARCHAR(100) UNIQUE NOT NULL,
          description TEXT,
          currency ENUM('NGN', 'USD', 'GBP', 'EUR') DEFAULT 'NGN',
          created_by VARCHAR(50) NOT NULL,
          status ENUM('PENDING', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'REVERSED') DEFAULT 'PENDING',
          flagged_for_aml BOOLEAN DEFAULT false,
          aml_reason VARCHAR(255),
          aml_threshold_used DECIMAL(15,2) DEFAULT 0.00,
          approval_notes TEXT,
          approved_by VARCHAR(50),
          approval_date DATETIME,
          rejection_notes TEXT,
          rejected_by VARCHAR(50),
          rejection_date DATETIME,
          metadata JSON,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_account_number (account_number),
          INDEX idx_account_id (account_id),
          INDEX idx_drawer_no (drawer_no),
          INDEX idx_drawer_id (drawer_id),
          INDEX idx_transaction_date (transaction_date),
          INDEX idx_transaction_type (transaction_type),
          INDEX idx_customer_id (customer_id),
          INDEX idx_status (status),
          INDEX idx_created_by (created_by),
          INDEX idx_account_number_date (account_number, transaction_date),
          INDEX idx_customer_status (customer_id, status),
          INDEX idx_date_status (transaction_date, status),
          INDEX idx_account_type (account_number, transaction_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('✅ Transactions table initialized');
      
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS transaction_sequence (
          id INT AUTO_INCREMENT PRIMARY KEY,
          last_value BIGINT DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        
        INSERT INTO transaction_sequence (last_value) 
        SELECT COALESCE(MAX(CAST(transaction_identifier AS UNSIGNED)), 0) 
        FROM transactions 
        WHERE NOT EXISTS (SELECT 1 FROM transaction_sequence LIMIT 1);
      `);
      console.log('✅ Transaction sequence initialized');
      return true;
    } catch (error) {
      console.error('Error initializing transactions table:', error.message);
      return false;
    }
  }

  static async syncTable() {
    try {
      await Transaction.sync({ alter: true });
      console.log('✅ Transaction table synced');
      return true;
    } catch (error) {
      console.error('Error syncing Transaction table:', error.message);
      return false;
    }
  }
}

// Initialize the model
Transaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    ACCT_NO: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'account_number'
    },
    ACCT_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'account_id'
    },
    DRAWER_NO: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'drawer_no'
    },
    DRAWER_ID: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'drawer_id'
    },
    BU_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'bu_id'
    },
    CUST_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'customer_id'
    },
    ACCT_NM: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'account_name'
    },
    AMOUNT: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'amount'
    },
    transactionDirection: {
      type: DataTypes.ENUM('CREDIT', 'DEBIT'),
      allowNull: false,
      defaultValue: 'CREDIT',
      field: 'transaction_direction'
    },
    TRANSACTIONDATE: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'transaction_date'
    },
    TRANSACTION_TYPE: {
      type: DataTypes.ENUM(...getAllTransactionTypes()),
      allowNull: false,
      field: 'transaction_type'
    },
    TRANSACTION_IDENTIFIER: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      field: 'transaction_identifier'
    },
    TRANSACTION_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'transaction_id'
    },
    EVENT_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'event_id'
    },
    TRAN_JOURNAL_ID: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'journal_id'
    },
    REFERENCE: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
      field: 'reference'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'description'
    },
    currency: {
      type: DataTypes.ENUM('NGN', 'USD', 'GBP', 'EUR'),
      defaultValue: 'NGN',
      field: 'currency'
    },
    createdBy: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'created_by'
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'PENDING_APPROVAL', 'COMPLETED', 'FAILED', 'REVERSED'),
      defaultValue: 'PENDING',
      field: 'status'
    },
    FLAGGED_FOR_AML: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'flagged_for_aml'
    },
    AML_REASON: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'aml_reason'
    },
    AML_THRESHOLD_USED: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0.00,
      field: 'aml_threshold_used'
    },
    APPROVAL_NOTES: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'approval_notes'
    },
    APPROVED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'approved_by'
    },
    APPROVAL_DATE: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approval_date'
    },
    REJECTION_NOTES: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'rejection_notes'
    },
    REJECTED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'rejected_by'
    },
    REJECTION_DATE: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejection_date'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      field: 'metadata'
    }
  },
  {
    sequelize,
    modelName: 'Transaction',
    tableName: 'transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      { fields: ['account_number'] },
      { fields: ['account_id'] },
      { fields: ['drawer_no'] },
      { fields: ['drawer_id'] },
      { fields: ['transaction_date'] },
      { fields: ['transaction_type'] },
      { fields: ['customer_id'] },
      { fields: ['status'] },
      { fields: ['created_by'] },
      { fields: ['account_number', 'transaction_date'] },
      { fields: ['customer_id', 'status'] },
      { fields: ['transaction_date', 'status'] },
      { fields: ['account_number', 'transaction_type'] }
    ]
  }
);

// ----- Hooks (registered after init) -----
Transaction.beforeCreate(async (transaction, options) => {
  console.log('Before create hook - Checking IDs:', { 
    TRANSACTION_IDENTIFIER: transaction.TRANSACTION_IDENTIFIER,
    EVENT_ID: transaction.EVENT_ID, 
    TRAN_JOURNAL_ID: transaction.TRAN_JOURNAL_ID,
    REFERENCE: transaction.REFERENCE,
    DRAWER_NO: transaction.DRAWER_NO,
    DRAWER_ID: transaction.DRAWER_ID
  });

  const hasProvidedIds = transaction.TRANSACTION_IDENTIFIER && transaction.EVENT_ID && transaction.TRAN_JOURNAL_ID && transaction.REFERENCE;
  
  if (!hasProvidedIds) {
    console.log('Auto-generating transaction IDs...');
    
    try {
      const [lastTransaction] = await sequelize.query(
        'SELECT MAX(CAST(transaction_identifier AS UNSIGNED)) as max_id FROM transactions',
        { type: QueryTypes.SELECT }
      );
      
      let nextTransactionId = 1;
      if (lastTransaction && lastTransaction.max_id) {
        nextTransactionId = Number(lastTransaction.max_id) + 1;
      }
      
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000);
      
      if (!transaction.TRANSACTION_IDENTIFIER) {
        transaction.TRANSACTION_IDENTIFIER = String(nextTransactionId);
      }
      if (!transaction.EVENT_ID) {
        transaction.EVENT_ID = String(nextTransactionId);
      }
      if (!transaction.TRAN_JOURNAL_ID) {
        transaction.TRAN_JOURNAL_ID = `JRN${timestamp}${randomSuffix}`;
      }
      if (!transaction.REFERENCE) {
        transaction.REFERENCE = `TXN${String(nextTransactionId).padStart(10, '0')}`;
      }
      if (!transaction.TRANSACTION_ID) {
        transaction.TRANSACTION_ID = `TXN${String(nextTransactionId).padStart(10, '0')}`;
      }
      
      console.log('Auto-generated IDs:', { 
        TRANSACTION_IDENTIFIER: transaction.TRANSACTION_IDENTIFIER,
        EVENT_ID: transaction.EVENT_ID,
        TRAN_JOURNAL_ID: transaction.TRAN_JOURNAL_ID,
        REFERENCE: transaction.REFERENCE
      });
    } catch (error) {
      console.error('Error generating transaction IDs:', error);
      const fallbackId = String(Math.floor(Math.random() * 1000000));
      
      if (!transaction.TRANSACTION_IDENTIFIER) transaction.TRANSACTION_IDENTIFIER = fallbackId;
      if (!transaction.EVENT_ID) transaction.EVENT_ID = fallbackId;
      if (!transaction.TRAN_JOURNAL_ID) transaction.TRAN_JOURNAL_ID = `JRN${Date.now()}`;
      if (!transaction.REFERENCE) transaction.REFERENCE = `TXN${fallbackId}`;
      if (!transaction.TRANSACTION_ID) transaction.TRANSACTION_ID = `TXN${fallbackId}`;
    }
  } else {
    console.log('Using provided IDs:', { 
      TRANSACTION_IDENTIFIER: transaction.TRANSACTION_IDENTIFIER,
      EVENT_ID: transaction.EVENT_ID,
      TRAN_JOURNAL_ID: transaction.TRAN_JOURNAL_ID,
      REFERENCE: transaction.REFERENCE
    });
  }
});

export default Transaction;