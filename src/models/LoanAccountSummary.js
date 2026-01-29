import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanAccountSummary = sequelize.define('LoanAccountSummary', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    references: {
      model: 'LoanAccounts', // Assuming you have a LoanAccount model
      key: 'id'
    },
    validate: {
      notNull: { msg: 'Account ID is required' }
    }
  },
  ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Account number is required' },
      notEmpty: true
    }
  },
  CUST_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Customer ID is required' },
      notEmpty: true
    }
  },
  ORIGINAL_PRINCIPAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    validate: {
      notNull: { msg: 'Original principal amount is required' },
      min: { args: [0], msg: 'Principal cannot be negative' }
    }
  },
  OUTSTANDING_PRINCIPAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    validate: {
      notNull: { msg: 'Outstanding principal is required' },
      min: { args: [0], msg: 'Outstanding principal cannot be negative' }
    }
  },
  TOTAL_INTEREST: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Interest cannot be negative' }
    }
  },
  PAID_INTEREST: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Paid interest cannot be negative' }
    }
  },
  TOTAL_REPAYMENT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Total repayment cannot be negative' }
    }
  },
  INSTALLMENT_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    validate: {
      notNull: { msg: 'Installment amount is required' },
      min: { args: [0], msg: 'Installment amount cannot be negative' }
    }
  },
  PAID_INSTALLMENTS: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Paid installments cannot be negative' }
    }
  },
  TOTAL_INSTALLMENTS: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      notNull: { msg: 'Total installments is required' },
      min: { args: [1], msg: 'Total installments must be at least 1' }
    }
  },
  NEXT_PAYMENT_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      notNull: { msg: 'Next payment date is required' },
      isDate: true
    }
  },
  LAST_PAYMENT_DT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  LAST_PAYMENT_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Last payment amount cannot be negative' }
    }
  },
  MATURITY_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      notNull: { msg: 'Maturity date is required' },
      isDate: true
    }
  },
  START_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      notNull: { msg: 'Start date is required' },
      isDate: true
    }
  },
  PAYMENT_FREQUENCY: {
    type: DataTypes.ENUM('DAILY', 'WEEKLY', 'BI-WEEKLY', 'MONTHLY', 'QUARTERLY'),
    allowNull: false,
    defaultValue: 'MONTHLY'
  },
  LOAN_STATUS: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'ACTIVE', 'DELINQUENT', 'CLOSED', 'WRITTEN_OFF'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  DELINQUENT_DAYS: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    validate: {
      min: { args: [0], msg: 'Delinquent days cannot be negative' }
    }
  },
  CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0
  },
  CUR_PAYOFF: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0
  },
  LAST_CUST_ACTIVITY_DT: {
    type: DataTypes.DATE,
    allowNull: true
  },
  REC_ST: {
    type: DataTypes.ENUM('A', 'I', 'S', 'C'),
    allowNull: false,
    defaultValue: 'A'
  },
  CREATED_BY: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notNull: { msg: 'Created by is required' },
      notEmpty: true
    }
  },
  UPDATED_BY: {
    type: DataTypes.STRING,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON, // For MySQL 5.7+, use DataTypes.JSON
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'loan_account_summaries',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeCreate: (summary, options) => {
      // Format numeric fields to 2 decimal places
      ['ORIGINAL_PRINCIPAL', 'OUTSTANDING_PRINCIPAL', 'TOTAL_INTEREST', 'PAID_INTEREST', 
       'TOTAL_REPAYMENT', 'INSTALLMENT_AMOUNT', 'LAST_PAYMENT_AMOUNT', 'CLEARED_BAL', 'CUR_PAYOFF'].forEach(field => {
        if (summary[field] !== undefined) {
          summary[field] = parseFloat(summary[field].toFixed(2));
        }
      });
      
      // Uppercase string fields
      if (summary.PAYMENT_FREQUENCY) summary.PAYMENT_FREQUENCY = summary.PAYMENT_FREQUENCY.toUpperCase();
      if (summary.LOAN_STATUS) summary.LOAN_STATUS = summary.LOAN_STATUS.toUpperCase();
      if (summary.REC_ST) summary.REC_ST = summary.REC_ST.toUpperCase();
    },
    
    beforeUpdate: (summary, options) => {
      // Format numeric fields to 2 decimal places
      ['ORIGINAL_PRINCIPAL', 'OUTSTANDING_PRINCIPAL', 'TOTAL_INTEREST', 'PAID_INTEREST', 
       'TOTAL_REPAYMENT', 'INSTALLMENT_AMOUNT', 'LAST_PAYMENT_AMOUNT', 'CLEARED_BAL', 'CUR_PAYOFF'].forEach(field => {
        if (summary.changed(field) && summary[field] !== undefined) {
          summary[field] = parseFloat(summary[field].toFixed(2));
        }
      });
      
      // Uppercase string fields
      if (summary.changed('PAYMENT_FREQUENCY') && summary.PAYMENT_FREQUENCY) {
        summary.PAYMENT_FREQUENCY = summary.PAYMENT_FREQUENCY.toUpperCase();
      }
      if (summary.changed('LOAN_STATUS') && summary.LOAN_STATUS) {
        summary.LOAN_STATUS = summary.LOAN_STATUS.toUpperCase();
      }
      if (summary.changed('REC_ST') && summary.REC_ST) {
        summary.REC_ST = summary.REC_ST.toUpperCase();
      }
    },
    
    beforeSave: (summary, options) => {
      // Calculate delinquent days
      if (summary.NEXT_PAYMENT_DT && summary.LOAN_STATUS === 'ACTIVE') {
        const today = new Date();
        const nextPayment = new Date(summary.NEXT_PAYMENT_DT);
        
        if (nextPayment < today) {
          summary.DELINQUENT_DAYS = Math.floor((today - nextPayment) / (1000 * 60 * 60 * 24));
          if (summary.DELINQUENT_DAYS > 30) {
            summary.LOAN_STATUS = 'DELINQUENT';
          }
        } else {
          summary.DELINQUENT_DAYS = 0;
        }
      }
      
      // Set UPDATED_BY if not set
      if (!summary.UPDATED_BY && summary.CREATED_BY) {
        summary.UPDATED_BY = summary.CREATED_BY;
      }
    }
  },
  getterMethods: {
    REMAINING_INSTALLMENTS() {
      return Math.max(0, this.TOTAL_INSTALLMENTS - this.PAID_INSTALLMENTS);
    },
    
    TOTAL_OUTSTANDING() {
      const outstandingInterest = this.TOTAL_INTEREST - this.PAID_INTEREST;
      const outstanding = Number(this.OUTSTANDING_PRINCIPAL) + Math.max(0, Number(outstandingInterest));
      return parseFloat(outstanding.toFixed(2));
    },
    
    COLLECTION_RATE() {
      if (Number(this.ORIGINAL_PRINCIPAL) === 0) return 0;
      const principalPaid = Number(this.ORIGINAL_PRINCIPAL) - Number(this.OUTSTANDING_PRINCIPAL);
      const rate = (principalPaid / Number(this.ORIGINAL_PRINCIPAL)) * 100;
      return parseFloat(rate.toFixed(2));
    },
    
    PAYMENT_STATUS() {
      if (!this.NEXT_PAYMENT_DT) return 'UNKNOWN';
      
      const today = new Date();
      const nextPayment = new Date(this.NEXT_PAYMENT_DT);
      
      if (nextPayment < today) {
        const daysOverdue = Math.floor((today - nextPayment) / (1000 * 60 * 60 * 24));
        return `OVERDUE_${daysOverdue}DAYS`;
      } else if (nextPayment.toDateString() === today.toDateString()) {
        return 'DUE_TODAY';
      } else {
        return 'UPCOMING';
      }
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['ACCT_ID']
    },
    {
      fields: ['ACCT_NO']
    },
    {
      fields: ['CUST_ID']
    },
    {
      fields: ['LOAN_STATUS']
    },
    {
      fields: ['ACCT_NO', 'REC_ST']
    },
    {
      fields: ['CUST_ID', 'REC_ST']
    },
    {
      fields: ['NEXT_PAYMENT_DT', 'LOAN_STATUS']
    },
    {
      fields: ['LOAN_STATUS', 'REC_ST']
    }
  ]
});

// Define associations
LoanAccountSummary.associate = (models) => {
  LoanAccountSummary.belongsTo(models.LoanAccount, {
    foreignKey: 'ACCT_ID',
    as: 'loanAccount'
  });
  
  LoanAccountSummary.belongsTo(models.Customer, {
    foreignKey: 'CUST_ID',
    targetKey: 'CUST_ID', // Adjust based on your Customer model
    as: 'customer'
  });
};

// Static method to find by account number
LoanAccountSummary.findByAccountNumber = async function(accountNo) {
  return this.findOne({ where: { ACCT_NO: accountNo } });
};

// Static method to find overdue accounts
LoanAccountSummary.findOverdueAccounts = async function() {
  const today = new Date();
  return this.findAll({
    where: {
      NEXT_PAYMENT_DT: { [Op.lt]: today },
      LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DELINQUENT'] },
      REC_ST: 'A'
    }
  });
};

// Static method to update summary from transaction
LoanAccountSummary.updateFromTransaction = async function(transaction) {
  if (transaction.TRANSACTION_TYPE !== 'CREDIT') return null;
  
  const summary = await this.findOne({ where: { ACCT_NO: transaction.ACCT_NO } });
  if (!summary) return null;
  
  // Update payment details
  summary.LAST_PAYMENT_DT = transaction.TRANSACTIONDATE;
  summary.LAST_PAYMENT_AMOUNT = transaction.AMOUNT;
  summary.TOTAL_REPAYMENT = Number(summary.TOTAL_REPAYMENT) + Number(transaction.AMOUNT);
  summary.PAID_INSTALLMENTS += 1;
  summary.LAST_CUST_ACTIVITY_DT = new Date();
  
  // Calculate next payment date based on frequency
  const nextPayment = new Date(summary.NEXT_PAYMENT_DT);
  switch (summary.PAYMENT_FREQUENCY) {
    case 'WEEKLY':
      nextPayment.setDate(nextPayment.getDate() + 7);
      break;
    case 'BI-WEEKLY':
      nextPayment.setDate(nextPayment.getDate() + 14);
      break;
    case 'MONTHLY':
      nextPayment.setMonth(nextPayment.getMonth() + 1);
      break;
    case 'QUARTERLY':
      nextPayment.setMonth(nextPayment.getMonth() + 3);
      break;
    default:
      nextPayment.setMonth(nextPayment.getMonth() + 1);
  }
  
  summary.NEXT_PAYMENT_DT = nextPayment;
  
  // Update loan status
  if (summary.OUTSTANDING_PRINCIPAL <= 0) {
    summary.LOAN_STATUS = 'CLOSED';
  }
  
  return await summary.save();
};

export default LoanAccountSummary;