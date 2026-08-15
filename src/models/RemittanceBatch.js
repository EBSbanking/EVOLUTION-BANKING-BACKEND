// models/RemittanceBatch.js - MySQL/Sequelize Version
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const RemittanceBatch = sequelize.define('RemittanceBatch', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  BATCH_ID: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false,
    field: 'batch_id'
  },
  START_DATE: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'start_date'
  },
  END_DATE: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'end_date'
  },
  TOTAL_TRANSACTIONS: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'total_transactions'
  },
  TOTAL_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'total_amount'
  },
  STATUS: {
    type: DataTypes.ENUM('GENERATED', 'IN_REMITTANCE', 'REMITTED', 'FAILED'),
    allowNull: false,
    defaultValue: 'GENERATED',
    field: 'status'
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
  GENERATED_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'generated_date'
  },
  CSV_PATH: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'csv_path'
  },
  CSV_CONTENT: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'csv_content'
  },
  UPLOAD_RESPONSE: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'upload_response'
  },
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
  }
}, {
  tableName: 'remittance_batches',
  timestamps: true,
  createdAt: 'CREATED_DATE',
  updatedAt: false,
  underscored: false,
  indexes: [
    {
      unique: true,
      fields: ['batch_id']
    },
    {
      unique: false,
      fields: ['status']
    },
    {
      unique: false,
      fields: ['start_date', 'end_date']
    },
    {
      unique: false,
      fields: ['generated_date']
    }
  ]
});

// Helper methods
RemittanceBatch.createBatch = async (data) => {
  try {
    const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    
    return await RemittanceBatch.create({
      BATCH_ID: batchId,
      START_DATE: data.startDate,
      END_DATE: data.endDate,
      TOTAL_TRANSACTIONS: data.totalTransactions || 0,
      TOTAL_AMOUNT: data.totalAmount || 0,
      STATUS: 'GENERATED',
      GENERATED_DATE: new Date(),
      CSV_PATH: data.csvPath || null,
      CSV_CONTENT: data.csvContent || null,
      CREATED_BY: data.createdBy || 'SYSTEM'
    });
  } catch (error) {
    console.error('Error creating remittance batch:', error.message);
    throw error;
  }
};

RemittanceBatch.updateBatch = async (batchId, updateData) => {
  try {
    const batch = await RemittanceBatch.findOne({
      where: { BATCH_ID: batchId }
    });
    
    if (!batch) {
      throw new Error('Batch not found');
    }
    
    await batch.update(updateData);
    return batch;
  } catch (error) {
    console.error('Error updating remittance batch:', error.message);
    throw error;
  }
};

RemittanceBatch.getPendingBatches = async () => {
  try {
    return await RemittanceBatch.findAll({
      where: {
        STATUS: ['GENERATED', 'IN_REMITTANCE']
      },
      order: [['GENERATED_DATE', 'ASC']]
    });
  } catch (error) {
    console.error('Error getting pending batches:', error.message);
    throw error;
  }
};

RemittanceBatch.initializeTable = async () => {
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS remittance_batches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        batch_id VARCHAR(50) UNIQUE NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        total_transactions INT NOT NULL DEFAULT 0,
        total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        status ENUM('GENERATED', 'IN_REMITTANCE', 'REMITTED', 'FAILED') NOT NULL DEFAULT 'GENERATED',
        remitted_date DATETIME,
        remittance_reference VARCHAR(50),
        generated_date DATETIME NOT NULL,
        csv_path VARCHAR(255),
        csv_content TEXT,
        upload_response JSON,
        created_by VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        
        INDEX idx_status (status),
        INDEX idx_dates (start_date, end_date),
        INDEX idx_generated_date (generated_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    
    console.log('✅ Remittance batches table initialized');
    return true;
  } catch (error) {
    console.error('Error initializing remittance batches table:', error.message);
    return false;
  }
};

export default RemittanceBatch;
