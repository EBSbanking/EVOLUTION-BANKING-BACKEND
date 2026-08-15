// models/OverdueLoan.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class OverdueLoan extends Model {}

OverdueLoan.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  loan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Loan ID reference'
  },
  cust_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Customer ID'
  },
  amount_due: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: 'Amount due'
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    comment: 'Due date'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'OVERDUE', 'PAID', 'PARTIAL_PAID', 'WRITTEN_OFF', 'SETTLED'),
    defaultValue: 'PENDING',
    allowNull: false,
    comment: 'Overdue status'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Last updated timestamp'
  },
  // Additional useful fields
  days_overdue: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of days overdue'
  },
  last_payment_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date of last payment'
  },
  last_payment_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Amount of last payment'
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional remarks'
  },
  assigned_to: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID assigned to handle this overdue'
  },
  collection_status: {
    type: DataTypes.ENUM('NOT_STARTED', 'CONTACTED', 'NEGOTIATING', 'PROMISED_PAYMENT', 'LEGAL_ACTION', 'CLOSED'),
    defaultValue: 'NOT_STARTED',
    comment: 'Collection process status'
  }
}, {
  sequelize,
  modelName: 'OverdueLoan',
  tableName: 'overdue_loans',
  timestamps: false, // We'll handle updated_at manually
  hooks: {
    beforeValidate: (overdueLoan) => {
      // Calculate days overdue
      if (overdueLoan.due_date) {
        const dueDate = new Date(overdueLoan.due_date);
        const today = new Date();
        const diffTime = today - dueDate;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        overdueLoan.days_overdue = diffDays > 0 ? diffDays : 0;
      }
    },
    beforeUpdate: (overdueLoan) => {
      // Auto-update updated_at
      overdueLoan.updated_at = new Date();
    }
  },
  indexes: [
    {
      name: 'idx_loan_id',
      fields: ['loan_id'],
      unique: true
    },
    {
      name: 'idx_cust_id',
      fields: ['cust_id']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_due_date',
      fields: ['due_date']
    },
    {
      name: 'idx_days_overdue',
      fields: ['days_overdue']
    },
    {
      name: 'idx_updated_at',
      fields: ['updated_at']
    },
    {
      name: 'idx_assigned_to',
      fields: ['assigned_to']
    },
    {
      name: 'idx_collection_status',
      fields: ['collection_status']
    },
    {
      name: 'idx_cust_status',
      fields: ['cust_id', 'status']
    },
    {
      name: 'idx_due_date_status',
      fields: ['due_date', 'status']
    }
  ]
});

// Static methods (unchanged)
OverdueLoan.findByLoanId = async function(loanId) {
  return await this.findOne({
    where: { loan_id: loanId }
  });
};

OverdueLoan.findByCustomerId = async function(customerId, options = {}) {
  const { 
    status, 
    minAmount, 
    maxAmount,
    startDate,
    endDate
  } = options;

  const where = { cust_id: customerId };

  if (status) where.status = status;
  if (minAmount) where.amount_due = { [Op.gte]: minAmount };
  if (maxAmount) where.amount_due = { [Op.lte]: maxAmount };
  
  if (startDate || endDate) {
    where.due_date = {};
    if (startDate) where.due_date[Op.gte] = new Date(startDate);
    if (endDate) where.due_date[Op.lte] = new Date(endDate);
  }

  return await this.findAll({
    where,
    order: [['due_date', 'ASC']]
  });
};

OverdueLoan.getOverdueSummary = async function() {
  return await this.findAll({
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount_due')), 'total_amount_due']
    ],
    group: ['status'],
    raw: true
  });
};

// Instance methods (updated - removed penalty-related methods)
OverdueLoan.prototype.markAsPaid = async function(paymentAmount = null, paymentDate = null) {
  this.status = 'PAID';
  
  if (paymentAmount) {
    this.last_payment_amount = paymentAmount;
  }
  
  if (paymentDate) {
    this.last_payment_date = paymentDate;
  } else {
    this.last_payment_date = new Date();
  }
  
  return await this.save();
};

OverdueLoan.prototype.markAsPartialPaid = async function(paymentAmount, paymentDate = null) {
  this.status = 'PARTIAL_PAID';
  this.last_payment_amount = paymentAmount;
  this.last_payment_date = paymentDate || new Date();
  
  const newAmount = parseFloat(this.amount_due) - parseFloat(paymentAmount);
  this.amount_due = newAmount > 0 ? newAmount : 0;
  
  return await this.save();
};

OverdueLoan.prototype.isSeverelyOverdue = function() {
  return this.days_overdue > 90;
};

// New method to get total amount (including penalties from related Penalty model)
OverdueLoan.prototype.getTotalAmount = async function() {
  const Penalty = sequelize.models.Penalty;
  const totalPenalty = await Penalty.sum('amount', {
    where: { 
      loan_id: this.loan_id,
      status: 'ACTIVE'
    }
  });
  
  const baseAmount = parseFloat(this.amount_due) || 0;
  const penaltyAmount = parseFloat(totalPenalty) || 0;
  
  return baseAmount + penaltyAmount;
};

export default OverdueLoan;
