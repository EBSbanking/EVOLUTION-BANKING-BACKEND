import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class PendingGLTransaction extends Model {}

PendingGLTransaction.init({
  JOURNAL_ID: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  TRANSACTION_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  GL_ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  TRANSACTION_TYPE: {
    type: DataTypes.ENUM('DR', 'CR'),
    allowNull: false,
  },
  AMOUNT: {
    type: DataTypes.DECIMAL(20, 8), // Adjust precision/scale as needed
    allowNull: false,
    validate: {
      min: 0,
    },
  },
  CREATED_BY: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  SUB_LEDGER_NO: {
    type: DataTypes.STRING(10),
    defaultValue: '000',
  },
  SEG_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  ACCT_DESC: {
    type: DataTypes.STRING,
  },
  BAL_CD: {
    type: DataTypes.STRING(10),
    defaultValue: '01',
  },
  GL_ACCT_CAT: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  CURRENCY_CODE: {
    type: DataTypes.STRING(10),
    defaultValue: 'NGN',
  },
  EXCHANGE_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 1,
  },
  REFERENCE_ID: {
    type: DataTypes.STRING,
  },
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'PROCESSED', 'FAILED', 'APPROVED'),
    defaultValue: 'PENDING',
  },
  errorMessage: {
    type: DataTypes.STRING(4000),
  },
  processedAt: {
    type: DataTypes.DATE,
  },
  APPROVED_BY: {
    type: DataTypes.STRING,
  },
  APPROVED_DATE: {
    type: DataTypes.DATE,
  },
  TRANSACTION_DATE: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
  debitAccount: {
    type: DataTypes.INTEGER, // Assuming GLAccount uses integer IDs
    references: {
      model: 'GLAccounts',
      key: 'id',
    },
  },
  creditAccount: {
    type: DataTypes.INTEGER, // Assuming GLAccount uses integer IDs
    references: {
      model: 'GLAccounts',
      key: 'id',
    },
  },
}, {
  sequelize,
  modelName: 'PendingGLTransaction',
  tableName: 'pending_gl_transactions',
  timestamps: true, // This will create createdAt and updatedAt
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  indexes: [
    {
      unique: true,
      fields: ['TRANSACTION_ID'],
    },
    {
      fields: ['JOURNAL_ID'],
    },
    {
      fields: ['STATUS'],
    },
    {
      fields: ['GL_ACCT_NO'],
    },
    {
      fields: ['TRANSACTION_DATE'],
    },
    {
      fields: ['debitAccount'],
    },
    {
      fields: ['creditAccount'],
    },
  ],
});

// Define associations (optional, in separate association file or here)
PendingGLTransaction.associate = (models) => {
  PendingGLTransaction.belongsTo(models.GLAccount, {
    foreignKey: 'debitAccount',
    as: 'debitGLAccount',
  });
  
  PendingGLTransaction.belongsTo(models.GLAccount, {
    foreignKey: 'creditAccount',
    as: 'creditGLAccount',
  });
};

export default PendingGLTransaction;