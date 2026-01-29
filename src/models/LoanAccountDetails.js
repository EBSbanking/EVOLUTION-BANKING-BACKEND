import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanAccountDetails = sequelize.define('LoanAccountDetails', {
  // ===== CORE ACCOUNT IDENTIFICATION =====
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  ACCT_NO: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    validate: {
      is: /^[A-Z0-9]{10,20}$/
    }
  },
  CUST_ID: {
    type: DataTypes.STRING,
    allowNull: false
  },
  CUST_NM: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  PROD_ID: {
    type: DataTypes.STRING,
    allowNull: false
  },
  APPL_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN'
  },
  BU_ID: {
    type: DataTypes.STRING,
    allowNull: false
  },
  PRIMARY_OFFICER_ID: {
    type: DataTypes.STRING,
    allowNull: false
  },
  SECONDARY_OFFICER_ID: {
    type: DataTypes.STRING,
    allowNull: true
  },
  creditReference: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  loanCycle: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: 1,
      max: 10
    }
  },

  // ===== LOAN TERMS & DISBURSEMENT =====
  START_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  MATURITY_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isAfterStartDate(value) {
        if (value <= this.START_DT) {
          throw new Error('Maturity date must be after start date');
        }
      }
    }
  },
  TERM_CD: {
    type: DataTypes.ENUM('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'),
    allowNull: false,
    defaultValue: 'MONTHLY'
  },
  TERM_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 360
    },
    comment: 'Loan term in months for monthly, weeks for weekly, etc.'
  },
  DISBURSEMENT_DATE: {
    type: DataTypes.DATE,
    allowNull: true
  },
  DISBURSEMENT_LIMIT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true
  },
  TRANSACTION_TYPE: {
    type: DataTypes.ENUM('CASH', 'TRANSFER', 'CHECK', 'WIRE'),
    allowNull: true,
    defaultValue: null
  },
  fundingAcctNo: {
    type: DataTypes.STRING,
    allowNull: true
  },
  REPAY_SRC_ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: true
  },

  // ===== INTEREST RATES =====
  INTEREST_RATE: {
    type: DataTypes.DECIMAL(7, 4),
    allowNull: false,
    validate: {
      min: 0,
      max: 100
    }
  },
  INDEX_RATE_ID: {
    type: DataTypes.STRING,
    allowNull: true
  },
  accruedInterest: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  lastAccrualAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  averageDailyAccrualInterestRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true
  },

  // ===== FINANCIAL BALANCES =====
  LOAN_AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    validate: {
      min: 0
    }
  },
  OUTSTANDING_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0
  },
  AVAILABLE_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0
  },
  LEDGER_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0
  },
  CLEARED_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0
  },
  payOffBalance: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  provision: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    validate: {
      min: 0
    }
  },
  equalPeriodicPaymentAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true
  },

  // ===== STATUS & TRACKING =====
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'CLOSED', 'DELINQUENT', 'DEFAULTED', 'WRITTEN_OFF'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  LOAN_STATUS: {
    type: DataTypes.ENUM('APPLICATION', 'APPROVED', 'DISBURSED', 'REPAYING', 'CLOSED', 'DEFAULTED'),
    allowNull: false,
    defaultValue: 'APPLICATION'
  },
  APPROVAL_STATUS: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'PENDING'
  },
  lastSettlementDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  nextSettlementDate: {
    type: DataTypes.DATE,
    allowNull: true
  },

  // ===== AUDIT FIELDS =====
  CREATED_BY: {
    type: DataTypes.STRING,
    allowNull: false
  },
  CREATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  lastModifiedBy: {
    type: DataTypes.STRING,
    allowNull: true
  },
  lastModifiedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'loan_account_details',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'lastModifiedAt',
  hooks: {
    beforeCreate: (loanAccount, options) => {
      // Auto-calculate payoff balance
      if (loanAccount.LEDGER_BALANCE && loanAccount.accruedInterest) {
        loanAccount.payOffBalance = parseFloat((loanAccount.LEDGER_BALANCE + loanAccount.accruedInterest).toFixed(2));
      }
      
      // Set lastModifiedBy if not set
      if (!loanAccount.lastModifiedBy && loanAccount.CREATED_BY) {
        loanAccount.lastModifiedBy = loanAccount.CREATED_BY;
      }
      
      // Ensure consistent statuses
      if (loanAccount.LOAN_STATUS === 'DISBURSED' && loanAccount.STATUS === 'APPROVED') {
        loanAccount.STATUS = 'ACTIVE';
      }
    },
    
    beforeUpdate: (loanAccount, options) => {
      // Auto-calculate payoff balance on update
      if (loanAccount.LEDGER_BALANCE && loanAccount.accruedInterest) {
        loanAccount.payOffBalance = parseFloat((loanAccount.LEDGER_BALANCE + loanAccount.accruedInterest).toFixed(2));
      }
      
      // Update lastModifiedAt is handled automatically by Sequelize timestamps
      
      // Ensure consistent statuses
      if (loanAccount.LOAN_STATUS === 'DISBURSED' && loanAccount.STATUS === 'APPROVED') {
        loanAccount.STATUS = 'ACTIVE';
      }
    }
  },
  getterMethods: {
    remainingTerm() {
      if (!this.MATURITY_DT) return 0;
      const months = (new Date(this.MATURITY_DT) - new Date()) / (1000 * 60 * 60 * 24 * 30);
      return Math.max(0, Math.ceil(months));
    },
    
    daysPastDue() {
      if (!this.nextSettlementDate || !['DELINQUENT', 'DEFAULTED'].includes(this.STATUS)) return 0;
      return Math.floor((new Date() - new Date(this.nextSettlementDate)) / (1000 * 60 * 60 * 24));
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['ACCT_NO']
    },
    {
      unique: true,
      fields: ['APPL_ID']
    },
    {
      fields: ['CUST_ID', 'STATUS']
    },
    {
      fields: ['PROD_ID', 'STATUS']
    },
    {
      fields: ['MATURITY_DT']
    },
    {
      fields: ['nextSettlementDate']
    },
    {
      fields: ['STATUS']
    },
    {
      fields: ['LOAN_STATUS']
    }
  ]
});

// Define associations
LoanAccountDetails.associate = (models) => {
  // Assuming you have Customer, Product models
  LoanAccountDetails.belongsTo(models.Customer, {
    foreignKey: 'CUST_ID',
    targetKey: 'CUST_ID', // Adjust if your Customer model uses a different primary key
    as: 'customer'
  });
  
  LoanAccountDetails.belongsTo(models.Product, {
    foreignKey: 'PROD_ID',
    targetKey: 'PROD_ID', // Adjust if your Product model uses a different primary key
    as: 'product'
  });
  
  LoanAccountDetails.belongsTo(models.User, {
    foreignKey: 'PRIMARY_OFFICER_ID',
    targetKey: 'user_id', // Adjust based on your User model
    as: 'primaryOfficer'
  });
  
  LoanAccountDetails.belongsTo(models.User, {
    foreignKey: 'SECONDARY_OFFICER_ID',
    targetKey: 'user_id', // Adjust based on your User model
    as: 'secondaryOfficer'
  });
  
  LoanAccountDetails.belongsTo(models.User, {
    foreignKey: 'CREATED_BY',
    targetKey: 'user_id', // Adjust based on your User model
    as: 'createdByUser'
  });
};

// Add class methods
LoanAccountDetails.findByStatus = function(status) {
  return this.findAll({ where: { STATUS: status } });
};

// Add instance methods
LoanAccountDetails.prototype.calculateNextPayment = function() {
  // Implementation for calculating next payment based on repayment frequency
  // This would use TERM_CD and lastSettlementDate to determine next payment date and amount
  
  // Example implementation:
  if (!this.lastSettlementDate || !this.TERM_CD) {
    return null;
  }
  
  const lastDate = new Date(this.lastSettlementDate);
  let nextDate;
  
  switch (this.TERM_CD) {
    case 'DAILY':
      nextDate = new Date(lastDate.setDate(lastDate.getDate() + 1));
      break;
    case 'WEEKLY':
      nextDate = new Date(lastDate.setDate(lastDate.getDate() + 7));
      break;
    case 'BIWEEKLY':
      nextDate = new Date(lastDate.setDate(lastDate.getDate() + 14));
      break;
    case 'MONTHLY':
      nextDate = new Date(lastDate.setMonth(lastDate.getMonth() + 1));
      break;
    case 'QUARTERLY':
      nextDate = new Date(lastDate.setMonth(lastDate.getMonth() + 3));
      break;
    case 'YEARLY':
      nextDate = new Date(lastDate.setFullYear(lastDate.getFullYear() + 1));
      break;
    default:
      return null;
  }
  
  return {
    nextPaymentDate: nextDate,
    // You might want to calculate the payment amount here
    estimatedAmount: this.equalPeriodicPaymentAmount || null
  };
};

export default LoanAccountDetails;