// models/reconciliation.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Reconciliation extends Model {}

Reconciliation.init(
  {
    JOURNAL_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    GL_ACCT_NO: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    TRANSACTION_ID: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true
      }
    },
    AMOUNT: {
      type: DataTypes.DECIMAL(15, 2), // Using DECIMAL for currency amounts
      allowNull: false,
      validate: {
        min: 0
      }
    },
    CURRENCY_CODE: {
      type: DataTypes.STRING(3),
      defaultValue: 'NGN',
      validate: {
        len: [3, 3] // Currency codes are typically 3 characters
      }
    },
    EXTERNAL_REF: {
      type: DataTypes.STRING,
      defaultValue: ''
    },
    STATUS: {
      type: DataTypes.ENUM('Pending', 'Reconciled', 'Discrepancy'),
      defaultValue: 'Pending'
    },
    CREATED_AT: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'Reconciliation',
    tableName: 'reconciliations',
    timestamps: true, // This will add createdAt and updatedAt automatically
    underscored: true, // Optional: if you want snake_case column names
    indexes: [
      {
        unique: true,
        fields: ['TRANSACTION_ID']
      },
      {
        fields: ['STATUS']
      },
      {
        fields: ['GL_ACCT_NO']
      }
    ]
  }
);

// Optional: Add hooks or custom methods
Reconciliation.beforeValidate((reconciliation) => {
  // Any pre-validation logic
  if (!reconciliation.CURRENCY_CODE) {
    reconciliation.CURRENCY_CODE = 'NGN';
  }
});

export default Reconciliation;