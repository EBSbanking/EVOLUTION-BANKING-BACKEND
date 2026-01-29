// models/Penalty.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Penalty extends Model {}

Penalty.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  loan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Reference to loan/overdue loan'
  },
  penalty_type: {
    type: DataTypes.ENUM('LATE_PAYMENT', 'PROCESSING_FEE', 'ADMINISTRATIVE', 'LEGAL', 'OTHER'),
    defaultValue: 'LATE_PAYMENT',
    comment: 'Type of penalty'
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: 'Penalty amount'
  },
  rate: {
    type: DataTypes.DECIMAL(5, 3),
    allowNull: true,
    comment: 'Penalty rate (percentage)'
  },
  calculation_basis: {
    type: DataTypes.ENUM('PRINCIPAL', 'OUTSTANDING', 'FIXED_AMOUNT', 'DAILY_RATE'),
    defaultValue: 'OUTSTANDING',
    comment: 'Basis for penalty calculation'
  },
  period_start: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Start date for penalty calculation'
  },
  period_end: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'End date for penalty calculation'
  },
  days_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Number of days penalty applies'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Penalty description'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'WAIVED', 'PAID', 'CANCELLED', 'PENDING'),
    defaultValue: 'ACTIVE',
    comment: 'Penalty status'
  },
  applied_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID who applied the penalty'
  },
  applied_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Date penalty was applied'
  },
  waived_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User ID who waived the penalty'
  },
  waived_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date penalty was waived'
  },
  waived_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for waiving penalty'
  },
  paid_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date penalty was paid'
  },
  reference_number: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Payment/reference number'
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: 'Additional metadata'
  }
}, {
  sequelize,
  modelName: 'Penalty',
  tableName: 'penalties',
  timestamps: true,
  indexes: [
    {
      name: 'idx_loan_id',
      fields: ['loan_id']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_penalty_type',
      fields: ['penalty_type']
    },
    {
      name: 'idx_applied_date',
      fields: ['applied_date']
    },
    {
      name: 'idx_loan_status',
      fields: ['loan_id', 'status']
    },
    {
      name: 'idx_period_start',
      fields: ['period_start']
    },
    {
      name: 'idx_period_end',
      fields: ['period_end']
    }
  ]
});

// Static methods
Penalty.findByLoanId = async function(loanId, options = {}) {
  const { status } = options;
  
  const where = { loan_id: loanId };
  if (status) where.status = status;
  
  return await this.findAll({
    where,
    order: [['applied_date', 'DESC']]
  });
};

Penalty.calculateLatePayment = async function(loanId, overdueDays, principalAmount, penaltyRate = 0.005) {
  // Default: 0.5% per day
  const penaltyAmount = principalAmount * penaltyRate * overdueDays;
  
  return await this.create({
    loan_id: loanId,
    penalty_type: 'LATE_PAYMENT',
    amount: penaltyAmount,
    rate: penaltyRate * 100, // Store as percentage
    calculation_basis: 'DAILY_RATE',
    period_start: new Date(),
    days_count: overdueDays,
    description: `Late payment penalty for ${overdueDays} days overdue`
  });
};

Penalty.getTotalActiveByLoan = async function(loanId) {
  const total = await this.sum('amount', {
    where: { 
      loan_id: loanId,
      status: 'ACTIVE'
    }
  });
  
  return total || 0;
};

// Instance methods
Penalty.prototype.waive = async function(userId, reason = null) {
  this.status = 'WAIVED';
  this.waived_by = userId;
  this.waived_date = new Date();
  this.waived_reason = reason;
  
  return await this.save();
};

Penalty.prototype.markAsPaid = async function(referenceNumber = null) {
  this.status = 'PAID';
  this.paid_date = new Date();
  this.reference_number = referenceNumber;
  
  return await this.save();
};

Penalty.prototype.getCalculatedAmount = function() {
  // For dynamic calculation if needed
  if (this.calculation_basis === 'DAILY_RATE' && this.rate && this.days_count) {
    const dailyRate = this.rate / 100 / 30; // Assuming monthly calculation
    return this.amount; // Or recalculate: principal * dailyRate * days_count
  }
  return this.amount;
};

export default Penalty;