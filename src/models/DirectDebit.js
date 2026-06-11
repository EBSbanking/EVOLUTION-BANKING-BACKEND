// src/models/DirectDebit.js - SIMPLIFIED FOR AUTO-COLLECTION
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';

const DirectDebit = sequelize.define('DirectDebit', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  mandate_reference: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    field: 'mandate_reference'
  },
  loan_account_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'loan_account_number'
  },
  source_account_number: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'source_account_number'
  },
  amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'amount'
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_date'
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'end_date'
  },
  frequency: {
    type: DataTypes.ENUM('ONCE', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'),
    defaultValue: 'MONTHLY',
    field: 'frequency'
  },
  next_payment_date: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'next_payment_date'
  },
  last_payment_date: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_payment_date'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'CANCELLED'),
    defaultValue: 'ACTIVE',
    field: 'status'
  },
  failure_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'failure_count'
  },
  last_failure_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'last_failure_reason'
  },
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'created_by'
  }
}, {
  tableName: 'direct_debits',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['loan_account_number'] },
    { fields: ['source_account_number'] },
    { fields: ['status'] },
    { fields: ['next_payment_date'] }
  ]
});

// Helper methods for auto-collection
DirectDebit.findActiveForLoan = async function(loanAccountNo) {
  return await this.findOne({
    where: {
      loan_account_number: loanAccountNo,
      status: 'ACTIVE',
      next_payment_date: {
        [Op.lte]: new Date()
      },
      [Op.or]: [
        { end_date: null },
        { end_date: { [Op.gt]: new Date() } }
      ]
    }
  });
};

DirectDebit.recordAttempt = async function(id, success, reason = null) {
  const debit = await this.findByPk(id);
  if (!debit) return null;
  
  const updates = {
    failure_count: success ? 0 : (debit.failure_count + 1),
    last_failure_reason: success ? null : reason
  };
  
  if (success) {
    updates.last_payment_date = new Date();
    // Calculate next payment date based on frequency
    const nextDate = new Date(debit.next_payment_date);
    switch (debit.frequency) {
      case 'DAILY': nextDate.setDate(nextDate.getDate() + 1); break;
      case 'WEEKLY': nextDate.setDate(nextDate.getDate() + 7); break;
      case 'MONTHLY': nextDate.setMonth(nextDate.getMonth() + 1); break;
      case 'QUARTERLY': nextDate.setMonth(nextDate.getMonth() + 3); break;
      case 'YEARLY': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
    }
    updates.next_payment_date = nextDate;
  }
  
  return await debit.update(updates);
};

export default DirectDebit;