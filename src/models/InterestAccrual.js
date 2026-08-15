// models/InterestAccrual.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class InterestAccrual extends Model {
  static associate(models) {
    // Add associations if needed
    this.belongsTo(models.CustomerAccount, {
      foreignKey: 'account_no',
      targetKey: 'account_number',
      as: 'customerAccount'
    });
    this.belongsTo(models.LoanAccount, {
      foreignKey: 'account_no',
      targetKey: 'ACCT_NO',
      as: 'loanAccount'
    });
  }
}

InterestAccrual.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  account_no: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'account_no',
    validate: {
      notEmpty: true
    }
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'date'
  },
  daily_interest: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'daily_interest',
    validate: {
      min: 0
    }
  },
  principal: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'principal',
    validate: {
      min: 0
    }
  },
  annual_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    field: 'annual_rate',
    validate: {
      min: 0,
      max: 100
    }
  },
  accrual_type: {
    type: DataTypes.ENUM('DAILY_INTEREST', 'MONTHLY_COMPOUND', 'QUARTERLY_COMPOUND'),
    defaultValue: 'DAILY_INTEREST',
    field: 'accrual_type'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'POSTED', 'REVERSED', 'FAILED'),
    defaultValue: 'PENDING',
    field: 'status'
  },
  product_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'product_type'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'product_id'
  },
  customer_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'customer_id'
  },
  gl_interest_accrued: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'gl_interest_accrued'
  },
  gl_interest_income: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'gl_interest_income'
  },
  gl_interest_expense: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'gl_interest_expense'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'InterestAccrual',
  tableName: 'interest_accruals',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  indexes: [
    {
      name: 'idx_acct_date',
      fields: ['account_no', 'date']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_date_status',
      fields: ['date', 'status']
    },
    {
      name: 'idx_product_type',
      fields: ['product_type']
    },
    {
      name: 'idx_customer_id',
      fields: ['customer_id']
    }
  ]
});

export default InterestAccrual;
