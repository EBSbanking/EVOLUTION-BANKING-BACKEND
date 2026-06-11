// models/PaymentHistory.js

import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const PaymentHistory = sequelize.define('PaymentHistory', {
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
    comment: 'Reference to the loan account'
  },
  
  payment_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Date when payment was made'
  },
  
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    },
    comment: 'Total payment amount'
  },
  
  principal_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    },
    comment: 'Principal portion of payment'
  },
  
  interest_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    },
    comment: 'Interest portion of payment'
  },
  
  penalty_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    comment: 'Penalty portion of payment (if any)'
  },
  
  fees_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    comment: 'Fees portion of payment (if any)'
  },
  
  installment_no: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Installment number this payment belongs to'
  },
  
  payment_method: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'CASH',
    validate: {
      isIn: [['CASH', 'BANK_TRANSFER', 'CHEQUE', 'POS', 'MOBILE_MONEY', 'DIRECT_DEBIT', 'BULK_UPLOAD']]
    },
    comment: 'Method used for payment'
  },
  
  is_early_payment: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether payment was made before due date'
  },
  
  is_overdue_payment: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether payment was made after due date'
  },
  
  is_partial_payment: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: false,
    comment: 'Whether this is a partial payment'
  },
  
  transaction_reference: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true,
    comment: 'Reference to the transaction record'
  },
  
  receipt_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Receipt number if generated'
  },
  
  collected_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Name/ID of person who collected payment'
  },
  
  branch_code: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Branch where payment was collected'
  },
  
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes about payment'
  },
  
  metadata: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    comment: 'Additional metadata in JSON format'
  },
  
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  updated_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'payment_history',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_payment_history_loan_account',
      fields: ['loan_account_id']
    },
    {
      name: 'idx_payment_history_payment_date',
      fields: ['payment_date']
    },
    {
      name: 'idx_payment_history_installment',
      fields: ['loan_account_id', 'installment_no']
    },
    {
      name: 'idx_payment_history_transaction_ref',
      fields: ['transaction_reference'],
      unique: true
    },
    {
      name: 'idx_payment_history_receipt',
      fields: ['receipt_number']
    },
    {
      name: 'idx_payment_history_method',
      fields: ['payment_method']
    },
    {
      name: 'idx_payment_history_early_overdue',
      fields: ['is_early_payment', 'is_overdue_payment']
    }
  ]
});

// Define associations
PaymentHistory.associate = (models) => {
  PaymentHistory.belongsTo(models.LoanAccount, {
    foreignKey: 'loan_account_id',
    as: 'loanAccount'
  });
  
  PaymentHistory.belongsTo(models.Transaction, {
    foreignKey: 'transaction_reference',
    targetKey: 'transaction_reference',
    as: 'transaction'
  });
};

// Instance methods
PaymentHistory.prototype.markAsReconciled = async function() {
  this.metadata = {
    ...this.metadata,
    reconciled: true,
    reconciledAt: new Date()
  };
  return this.save();
};

// Static methods
PaymentHistory.getPaymentsByLoanAccount = async function(loanAccountId, options = {}) {
  return this.findAll({
    where: { loan_account_id: loanAccountId },
    order: [['payment_date', 'DESC'], ['installment_no', 'ASC']],
    ...options
  });
};

PaymentHistory.getPaymentsByDateRange = async function(startDate, endDate, options = {}) {
  return this.findAll({
    where: {
      payment_date: {
        [Op.between]: [startDate, endDate]
      }
    },
    order: [['payment_date', 'DESC']],
    ...options
  });
};

PaymentHistory.getTotalPaidByLoanAccount = async function(loanAccountId) {
  const result = await this.findOne({
    where: { loan_account_id: loanAccountId },
    attributes: [
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_paid'],
      [sequelize.fn('SUM', sequelize.col('principal_amount')), 'total_principal'],
      [sequelize.fn('SUM', sequelize.col('interest_amount')), 'total_interest'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'payment_count']
    ],
    raw: true
  });
  
  return {
    totalPaid: parseFloat(result?.total_paid || 0),
    totalPrincipal: parseFloat(result?.total_principal || 0),
    totalInterest: parseFloat(result?.total_interest || 0),
    paymentCount: parseInt(result?.payment_count || 0)
  };
};

PaymentHistory.getPaymentSummaryByInstallment = async function(loanAccountId, installmentNo) {
  return this.findOne({
    where: {
      loan_account_id: loanAccountId,
      installment_no: installmentNo
    },
    attributes: [
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_paid'],
      [sequelize.fn('SUM', sequelize.col('principal_amount')), 'total_principal'],
      [sequelize.fn('SUM', sequelize.col('interest_amount')), 'total_interest'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'payment_count']
    ],
    raw: true
  });
};

// Hook to update loan account last payment info after create
PaymentHistory.afterCreate(async (payment, options) => {
  try {
    // Update loan account's last payment info
    const LoanAccount = sequelize.models.LoanAccount;
    if (LoanAccount) {
      await LoanAccount.update(
        {
          LAST_PAYMENT_DATE: payment.payment_date,
          LAST_PAYMENT_AMOUNT: payment.amount,
          last_payment_method: payment.payment_method,
          updated_at: new Date()
        },
        {
          where: { id: payment.loan_account_id },
          transaction: options.transaction
        }
      );
    }
  } catch (error) {
    console.error('Error updating loan account after payment creation:', error);
    // Don't throw - we don't want to fail the payment creation
  }
});

export default PaymentHistory;