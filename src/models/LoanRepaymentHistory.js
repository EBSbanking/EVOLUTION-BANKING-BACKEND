// src/models/LoanRepaymentHistory.js - Converted to Class + Direct Export
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js'; // adjust path to your sequelize instance

class LoanRepaymentHistory extends Model {
  // Define associations
  static associate(models) {
    // Belongs to Loan Account
    LoanRepaymentHistory.belongsTo(models.LoanAccount, {
      foreignKey: 'loan_account_id',
      as: 'loanAccount'
    });
  }
}

// Initialize the model
LoanRepaymentHistory.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    loan_account_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'loan_accounts',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    account_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    customer_id: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    repayment_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    principal_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    interest_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    penalty_amount: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0,
      validate: {
        min: 0
      }
    },
    total_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0,
        isPositive(value) {
          if (value <= 0) {
            throw new Error('Total amount must be greater than 0');
          }
        }
      }
    },
    reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      validate: {
        len: [0, 100]
      }
    },
    created_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      defaultValue: 'SYSTEM'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    }
  },
  {
    sequelize,
    modelName: 'LoanRepaymentHistory',
    tableName: 'loan_repayment_history',
    timestamps: false, // We're using custom created_at
    indexes: [
      {
        name: 'idx_loan_account',
        fields: ['loan_account_id']
      },
      {
        name: 'idx_account_number',
        fields: ['account_number']
      },
      {
        name: 'idx_customer',
        fields: ['customer_id']
      },
      {
        name: 'idx_repayment_date',
        fields: ['repayment_date']
      }
    ]
  }
);

export default LoanRepaymentHistory;
