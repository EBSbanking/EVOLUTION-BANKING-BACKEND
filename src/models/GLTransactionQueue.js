// GLTransactionQueue.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js'; // Adjust path as needed

const GLTransactionQueue = sequelize.define('GLTransactionQueue', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  GL_ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  TRANSACTION_TYPE: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  AMOUNT: {
    type: DataTypes.DECIMAL(15, 2), // For precise monetary values
    allowNull: false,
    validate: {
      isDecimal: true,
      min: 0.01
    }
  },
  CREATED_BY: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  JOURNAL_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  SUB_LEDGER_NO: {
    type: DataTypes.STRING,
    defaultValue: '0000'
  },
  SEG_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  // 👇 System queue processing (tech status)
  QUEUE_STATUS: {
    type: DataTypes.ENUM('Pending', 'Processed', 'Failed', 'Rejected'),
    defaultValue: 'Pending'
  },
  // 👇 Business approval status
  APPROVAL_STATUS: {
    type: DataTypes.ENUM('Pending', 'Approved', 'Rejected'),
    defaultValue: 'Pending'
  },
  APPROVED_BY: {
    type: DataTypes.STRING
  },
  APPROVED_AT: {
    type: DataTypes.DATE
  },
  CREATED_AT: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  PROCESSED_AT: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'GLTransactionQueues',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  indexes: [
    {
      name: 'idx_gl_account_queue_status',
      fields: ['GL_ACCT_NO', 'QUEUE_STATUS']
    },
    {
      name: 'idx_approval_status',
      fields: ['APPROVAL_STATUS']
    },
    {
      name: 'idx_journal_id',
      fields: ['JOURNAL_ID']
    }
  ]
});

export default GLTransactionQueue;