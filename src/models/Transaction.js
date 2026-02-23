// models/Transaction.js - COMPLETE FIXED VERSION (Using camelCase columns)
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';

// Get all transaction types
const getAllTransactionTypes = () => [
  'DEPOSIT','WITHDRAWAL','TRANSFER','LOAN_DISBURSEMENT',
  'LOAN_REPAYMENT','FEE_CHARGE','INTEREST_CREDIT','INTEREST_CHARGE',
  'PENALTY_CHARGE','SALARY_PAYMENT','BILL_PAYMENT','ATM_WITHDRAWAL',
  'ONLINE_TRANSFER','MOBILE_TRANSFER','STANDING_ORDER','DIRECT_DEBIT',
  'CHEQUE_DEPOSIT','CASH_DEPOSIT','CASH_WITHDRAWAL','REVERSAL','ADJUSTMENT',
  'REFUND','THRIFT_OPENING','THRIFT_COLLECTION','THRIFT_WITHDRAWAL','THRIFT_BANK_PAYMENT' 
];

const Transaction = sequelize.define('Transaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  
  // Map model fields to database columns
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
    type: DataTypes.INTEGER,
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
    type: DataTypes.INTEGER,
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
  
  // NOTE: created_at/updated_at fields removed - Sequelize will auto-manage them
  // with timestamps: true using the createdAt/updatedAt columns in the database
  
}, {
  tableName: 'transactions',
  timestamps: true,
  createdAt: 'createdAt',  // Use camelCase column in database
  updatedAt: 'updatedAt',  // Use camelCase column in database
  underscored: false,      // Don't use underscored names for auto-generated fields
  indexes: [
    {
      unique: true,
      fields: ['transaction_identifier']
    },
    {
      unique: true,
      fields: ['reference']
    },
    {
      fields: ['account_number']
    },
    {
      fields: ['account_id']
    },
    {
      fields: ['transaction_date']
    },
    {
      fields: ['transaction_type']
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['created_by']
    },
    // Compound indexes
    {
      fields: ['account_number', 'transaction_date']
    },
    {
      fields: ['customer_id', 'status']
    },
    {
      fields: ['transaction_date', 'status']
    },
    {
      fields: ['account_number', 'transaction_type']
    }
  ]
});

// Before create hook
Transaction.beforeCreate(async (transaction, options) => {
  console.log('Before create hook - Checking IDs:', { 
    TRANSACTION_IDENTIFIER: transaction.TRANSACTION_IDENTIFIER,
    EVENT_ID: transaction.EVENT_ID, 
    TRAN_JOURNAL_ID: transaction.TRAN_JOURNAL_ID,
    REFERENCE: transaction.REFERENCE
  });

  // Only auto-generate if IDs are not provided
  const hasProvidedIds = transaction.TRANSACTION_IDENTIFIER && transaction.EVENT_ID && transaction.TRAN_JOURNAL_ID && transaction.REFERENCE;
  
  if (!hasProvidedIds) {
    console.log('Auto-generating transaction IDs...');
    
    try {
      // Get the next available TRANSACTION_IDENTIFIER
      const [lastTransaction] = await sequelize.query(
        'SELECT MAX(transaction_identifier) as max_id FROM transactions',
        { type: sequelize.QueryTypes.SELECT }
      );
      
      let nextTransactionId = 1;
      if (lastTransaction && lastTransaction.max_id) {
        nextTransactionId = Number(lastTransaction.max_id) + 1;
      }
      
      const timestamp = Date.now();
      const randomSuffix = Math.floor(Math.random() * 1000);
      
      // Generate identifiers only if not provided
      if (!transaction.TRANSACTION_IDENTIFIER) {
        transaction.TRANSACTION_IDENTIFIER = nextTransactionId;
      }
      if (!transaction.EVENT_ID) {
        transaction.EVENT_ID = nextTransactionId;
      }
      if (!transaction.TRAN_JOURNAL_ID) {
        transaction.TRAN_JOURNAL_ID = `JRN${timestamp}${randomSuffix}`;
      }
      if (!transaction.REFERENCE) {
        transaction.REFERENCE = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
      }
      if (!transaction.TRANSACTION_ID) {
        transaction.TRANSACTION_ID = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
      }
      
      console.log('Auto-generated IDs:', { 
        TRANSACTION_IDENTIFIER: transaction.TRANSACTION_IDENTIFIER,
        EVENT_ID: transaction.EVENT_ID,
        TRAN_JOURNAL_ID: transaction.TRAN_JOURNAL_ID,
        REFERENCE: transaction.REFERENCE
      });
    } catch (error) {
      console.error('Error generating transaction IDs:', error);
      // Fallback IDs
      const fallbackId = Number(Date.now().toString().slice(-9));
      
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

  // Ensure timestamps are set (Sequelize should handle this, but just in case)
  if (!transaction.createdAt) {
    transaction.createdAt = new Date();
  }
  if (!transaction.updatedAt) {
    transaction.updatedAt = new Date();
  }
});

// Before update hook
Transaction.beforeUpdate((transaction) => {
  transaction.updatedAt = new Date();
});

// Generate transaction IDs helper
Transaction.generateTransactionIds = async () => {
  try {
    const [lastTransaction] = await sequelize.query(
      'SELECT MAX(transaction_identifier) as max_id FROM transactions',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    const nextTransactionId = (lastTransaction?.max_id || 0) + 1;
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    
    return {
      TRANSACTION_IDENTIFIER: nextTransactionId,
      EVENT_ID: nextTransactionId,
      JOURNAL_ID: `JRN${timestamp}${randomSuffix}`,
      TRAN_JOURNAL_ID: `TJ${timestamp}${randomSuffix}`,
      TRANSACTION_ID: `TXN${nextTransactionId}`
    };
  } catch (error) {
    console.error('Error generating transaction IDs:', error.message);
    throw error;
  }
};

// Get transaction by reference
Transaction.getTransactionByReference = async (reference) => {
  try {
    const transaction = await Transaction.findOne({
      where: { reference: reference }
    });
    
    return transaction;
  } catch (error) {
    console.error('Error getting transaction by reference:', error.message);
    throw error;
  }
};

// Get transactions by date range
Transaction.getTransactionsByDateRange = async (startDate, endDate, filters = {}) => {
  try {
    const whereClause = {
      transaction_date: {
        [Op.between]: [startDate, endDate]
      }
    };
    
    if (filters.account_number) {
      whereClause.account_number = filters.account_number;
    }
    
    if (filters.customer_id) {
      whereClause.customer_id = filters.customer_id;
    }
    
    if (filters.transaction_type) {
      whereClause.transaction_type = filters.transaction_type;
    }
    
    if (filters.status) {
      whereClause.status = filters.status;
    }
    
    if (filters.bu_id) {
      whereClause.bu_id = filters.bu_id;
    }
    
    const transactions = await Transaction.findAll({
      where: whereClause,
      order: [['transaction_date', 'DESC']]
    });
    
    return transactions;
  } catch (error) {
    console.error('Error getting transactions by date range:', error.message);
    throw error;
  }
};

// Approve transaction
Transaction.approveTransaction = async (transactionId, approvedBy, notes = '') => {
  try {
    const transaction = await Transaction.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status !== 'PENDING_APPROVAL') {
      throw new Error('Transaction is not pending approval');
    }
    
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
};

// Reject transaction
Transaction.rejectTransaction = async (transactionId, rejectedBy, notes = '') => {
  try {
    const transaction = await Transaction.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status !== 'PENDING_APPROVAL') {
      throw new Error('Transaction is not pending approval');
    }
    
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
};

// Reverse transaction
Transaction.reverseTransaction = async (transactionId, reversedBy, reason = '') => {
  try {
    const transaction = await Transaction.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status !== 'COMPLETED') {
      throw new Error('Only completed transactions can be reversed');
    }
    
    // Create reversal transaction
    const reversalData = {
      ...transaction.toJSON(),
      id: undefined,
      TRANSACTION_ID: await Transaction.getNextTransactionId(),
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
    
    // Mark original as reversed
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
};

// Get next transaction ID
Transaction.getNextTransactionId = async () => {
  try {
    const [lastTransaction] = await sequelize.query(
      'SELECT MAX(transaction_identifier) as max_id FROM transactions',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    return (lastTransaction?.max_id || 0) + 1;
  } catch (error) {
    console.error('Error getting next transaction ID:', error.message);
    throw error;
  }
};

// Get transaction stats
Transaction.getTransactionStats = async (filters = {}) => {
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
    `, { replacements });
    
    return stats[0];
  } catch (error) {
    console.error('Error getting transaction stats:', error.message);
    throw error;
  }
};

// Initialize table if it doesn't exist
Transaction.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_number VARCHAR(50) NOT NULL,
        account_id VARCHAR(50) NOT NULL,
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
        transaction_identifier INT UNIQUE NOT NULL,
        transaction_id VARCHAR(50),
        event_id INT NOT NULL,
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
        createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_account_number (account_number),
        INDEX idx_account_id (account_id),
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
    
    // Create sequence table for transaction IDs if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS transaction_sequence (
        id INT AUTO_INCREMENT PRIMARY KEY,
        last_value INT DEFAULT 0,
        updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      
      INSERT INTO transaction_sequence (last_value) 
      SELECT COALESCE(MAX(transaction_identifier), 0) 
      FROM transactions 
      WHERE NOT EXISTS (SELECT 1 FROM transaction_sequence LIMIT 1);
    `);
    
    console.log('✅ Transaction sequence initialized');
    
    return true;
  } catch (error) {
    console.error('Error initializing transactions table:', error.message);
    return false;
  }
};

// Sync the model
Transaction.syncTable = async () => {
  try {
    await Transaction.sync({ alter: true });
    console.log('✅ Transaction table synced');
    return true;
  } catch (error) {
    console.error('Error syncing Transaction table:', error.message);
    return false;
  }
};

export default Transaction;