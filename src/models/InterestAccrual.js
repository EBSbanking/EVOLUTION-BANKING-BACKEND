// interestAccrual.js - UPDATED
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class InterestAccrual extends Model {}

InterestAccrual.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Check what column name actually exists for account number
  // It might be 'account_no', 'ACCOUNT_NO', 'account_number', etc.
  account_no: {  // Changed from ACCT_NO to match your database
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'account_no', // Explicitly map to database column
    validate: {
      notEmpty: true
    }
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  dailyInterest: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: false,
    field: 'daily_interest', // Map to database column
    validate: {
      min: 0
    }
  },
  principal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  annualRate: {
    type: DataTypes.DECIMAL(5, 3),
    allowNull: false,
    field: 'annual_rate', // Map to database column
    validate: {
      min: 0,
      max: 100
    }
  },
  accrualType: {
    type: DataTypes.ENUM('DAILY_INTEREST', 'MONTHLY_COMPOUND', 'QUARTERLY_COMPOUND'),
    defaultValue: 'DAILY_INTEREST',
    field: 'accrual_type' // Map to database column
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'POSTED', 'REVERSED', 'FAILED'),
    defaultValue: 'PENDING'
  }
}, {
  sequelize,
  modelName: 'InterestAccrual',
  tableName: 'interest_accruals',
  timestamps: true,
  underscored: true, // This helps with snake_case mapping
  indexes: [
    {
      name: 'idx_acct_date',
      fields: ['account_no', 'date'] // Use model field name
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_date_status',
      fields: ['date', 'status']
    }
  ]
});

export default InterestAccrual;