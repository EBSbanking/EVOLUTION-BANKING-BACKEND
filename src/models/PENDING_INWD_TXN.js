import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class PendingGLTransaction extends Model {}

PendingGLTransaction.init({
  INWD_FUNDS_XFER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  XFER_REF: {
    type: DataTypes.STRING(100),
    allowNull: false,
  },
  GL_ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: false,
  },
  TRANSACTION_TYPE: {
    type: DataTypes.ENUM('DEBIT', 'CREDIT'),
    allowNull: false,
  },
  AMOUNT: {
    type: DataTypes.DECIMAL(20, 8), // Adjust precision and scale as needed
    allowNull: false,
  },
  CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  TRANSACTION_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
  },
  JOURNAL_ID: {
    type: DataTypes.INTEGER,
  },
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'PROCESSED', 'FAILED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  processedAt: {
    type: DataTypes.DATE,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  errorMessage: {
    type: DataTypes.STRING(4000),
  },
}, {
  sequelize,
  modelName: 'PendingGLTransaction',
  tableName: 'PendingGLTransactions', // Sequelize will pluralize the model name
  timestamps: false, // Disable automatic createdAt and updatedAt
  hooks: {
    // Add hooks if you need custom JSON transformation like Mongoose getters
    afterFind: (result) => {
      if (!result) return;
      
      if (Array.isArray(result)) {
        result.forEach(instance => {
          if (instance.dataValues.AMOUNT && typeof instance.dataValues.AMOUNT === 'object') {
            // Convert Decimal to string/number for JSON
            instance.dataValues.AMOUNT = parseFloat(instance.dataValues.AMOUNT);
          }
        });
      } else if (result.dataValues && result.dataValues.AMOUNT && typeof result.dataValues.AMOUNT === 'object') {
        result.dataValues.AMOUNT = parseFloat(result.dataValues.AMOUNT);
      }
    }
  }
});

export default PendingGLTransaction;