// models/EMTLTransaction.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const EMTLTransaction = sequelize.define('EMTLTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  TRANSACTION_ID: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    field: 'transaction_id'
  },
  TRANSACTION_REFERENCE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'transaction_reference'
  },
  CUSTOMER_NO: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'customer_no'
  },
  ACCOUNT_NO: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'account_no'
  },
  AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'amount'
  },
  TRANSFER_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'transfer_amount'
  },
  TRANSFER_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'transfer_date'
  },
  CHANNEL: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'channel'
  },
  TRANSACTION_TYPE: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'transaction_type'
  },
  
  // Status Tracking
  STATUS: {
    type: DataTypes.ENUM('PENDING_REMITTANCE', 'IN_REMITTANCE', 'REMITTED', 'FAILED'),
    allowNull: false,
    defaultValue: 'PENDING_REMITTANCE',
    field: 'status'
  },
  
  // Remittance Tracking
  REMITTANCE_BATCH_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'remittance_batch_id'
  },
  REMITTED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'remitted_date'
  },
  REMITTANCE_REFERENCE: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'remittance_reference'
  },
  
  // GL Reference
  JOURNAL_ENTRY_ID: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'journal_entry_id'
  },
  GL_ACCOUNT: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '2401000001',
    field: 'gl_account'
  },
  
  // Levy Calculation Details
  LEVY_CALCULATION: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'levy_calculation'
  },
  
  // Audit
  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'SYSTEM',
    field: 'created_by'
  },
  CREATED_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_date'
  },
  UPDATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'updated_by'
  },
  UPDATED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'updated_date'
  }
}, {
  tableName: 'emtl_transactions',
  timestamps: true,
  createdAt: 'CREATED_DATE',
  updatedAt: 'UPDATED_DATE',
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['transaction_id']
    },
    {
      unique: false,
      fields: ['customer_no']
    },
    {
      unique: false,
      fields: ['account_no']
    },
    {
      unique: false,
      fields: ['status']
    },
    {
      unique: false,
      fields: ['remittance_batch_id']
    },
    {
      unique: false,
      fields: ['transfer_date']
    }
  ]
});

// Helper methods
EMTLTransaction.createRecord = async (data) => {
  try {
    return await EMTLTransaction.create({
      TRANSACTION_ID: data.transactionId || `EMTL-${Date.now()}`,
      TRANSACTION_REFERENCE: data.transactionReference || `REF-${Date.now()}`,
      CUSTOMER_NO: data.customerNo,
      ACCOUNT_NO: data.accountNo,
      AMOUNT: data.amount,
      TRANSFER_AMOUNT: data.transferAmount,
      TRANSFER_DATE: data.transferDate || new Date(),
      CHANNEL: data.channel || 'WEB',
      TRANSACTION_TYPE: data.transactionType || 'TRANSFER',
      STATUS: 'PENDING_REMITTANCE',
      GL_ACCOUNT: data.glAccount || '2401000001',
      LEVY_CALCULATION: data.levyCalculation || null,
      CREATED_BY: data.createdBy || 'SYSTEM',
      CREATED_DATE: new Date()
    });
  } catch (error) {
    console.error('Error creating EMTL record:', error.message);
    throw error;
  }
};

EMTLTransaction.getPendingRemittances = async (dateFrom, dateTo) => {
  try {
    const whereClause = {
      STATUS: 'PENDING_REMITTANCE'
    };
    
    if (dateFrom && dateTo) {
      whereClause.TRANSFER_DATE = {
        [Op.between]: [dateFrom, dateTo]
      };
    }
    
    return await EMTLTransaction.findAll({
      where: whereClause,
      order: [['TRANSFER_DATE', 'ASC']]
    });
  } catch (error) {
    console.error('Error getting pending remittances:', error.message);
    throw error;
  }
};

EMTLTransaction.markAsRemitted = async (batchId, remittanceReference, transactionIds) => {
  try {
    const result = await EMTLTransaction.update(
      {
        STATUS: 'REMITTED',
        REMITTANCE_BATCH_ID: batchId,
        REMITTANCE_REFERENCE: remittanceReference,
        REMITTED_DATE: new Date(),
        UPDATED_BY: 'SYSTEM',
        UPDATED_DATE: new Date()
      },
      {
        where: {
          TRANSACTION_ID: { [Op.in]: transactionIds }
        }
      }
    );
    
    return result;
  } catch (error) {
    console.error('Error marking EMTL as remitted:', error.message);
    throw error;
  }
};

EMTLTransaction.getRemittanceStats = async (dateFrom, dateTo) => {
  try {
    const [stats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(amount) as total_amount,
        SUM(CASE WHEN status = 'PENDING_REMITTANCE' THEN amount ELSE 0 END) as pending_amount,
        SUM(CASE WHEN status = 'REMITTED' THEN amount ELSE 0 END) as remitted_amount,
        COUNT(CASE WHEN status = 'PENDING_REMITTANCE' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'REMITTED' THEN 1 END) as remitted_count
      FROM emtl_transactions
      WHERE transfer_date BETWEEN ? AND ?
    `, {
      replacements: [dateFrom, dateTo],
      type: sequelize.QueryTypes.SELECT
    });
    
    return stats;
  } catch (error) {
    console.error('Error getting EMTL stats:', error.message);
    throw error;
  }
};

EMTLTransaction.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS emtl_transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        transaction_id VARCHAR(50) UNIQUE NOT NULL,
        transaction_reference VARCHAR(50) NOT NULL,
        customer_no VARCHAR(20) NOT NULL,
        account_no VARCHAR(20) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        transfer_amount DECIMAL(15,2) NOT NULL,
        transfer_date DATETIME NOT NULL,
        channel VARCHAR(20) NOT NULL,
        transaction_type VARCHAR(20) NOT NULL,
        
        -- Status Tracking
        status ENUM('PENDING_REMITTANCE', 'IN_REMITTANCE', 'REMITTED', 'FAILED') NOT NULL DEFAULT 'PENDING_REMITTANCE',
        
        -- Remittance Tracking
        remittance_batch_id VARCHAR(50),
        remitted_date DATETIME,
        remittance_reference VARCHAR(50),
        
        -- GL Reference
        journal_entry_id VARCHAR(50),
        gl_account VARCHAR(20) NOT NULL DEFAULT '2401000001',
        
        -- Levy Calculation
        levy_calculation JSON,
        
        -- Audit
        created_by VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(50),
        updated_date TIMESTAMP NULL,
        
        INDEX idx_customer_no (customer_no),
        INDEX idx_account_no (account_no),
        INDEX idx_status (status),
        INDEX idx_remittance_batch (remittance_batch_id),
        INDEX idx_transfer_date (transfer_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ EMTL transactions table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing EMTL transactions table:', error.message);
    return false;
  }
};

export default EMTLTransaction;
