// models/LoanDisbursement.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

class LoanDisbursement extends Model {
  // Static methods
  static findByApplicationId(applicationId) {
    return LoanDisbursement.findOne({
      where: { APPL_ID: applicationId }
    });
  }

  static findByAccountNumber(accountNumber) {
    return LoanDisbursement.findAll({
      where: { ACCT_NO: accountNumber },
      order: [['DISBURSEMENT_DATE', 'DESC']]
    });
  }

  static findByCustomerId(customerId) {
    return LoanDisbursement.findAll({
      where: { CUST_ID: customerId },
      order: [['DISBURSEMENT_DATE', 'DESC']]
    });
  }

  static findByStatus(status) {
    return LoanDisbursement.findAll({
      where: { STATUS: status },
      order: [['DISBURSEMENT_DATE', 'DESC']]
    });
  }

  static findPendingDisbursements() {
    return LoanDisbursement.findAll({
      where: { STATUS: 'PENDING' },
      order: [['createdAt', 'ASC']]
    });
  }

  static findByDateRange(startDate, endDate) {
    return LoanDisbursement.findAll({
      where: {
        DISBURSEMENT_DATE: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['DISBURSEMENT_DATE', 'DESC']]
    });
  }

  // Instance methods
  async approve(approvedBy) {
    return this.update({
      STATUS: 'APPROVED',
      APPROVED_BY: approvedBy,
      APPROVAL_DATE: new Date()
    });
  }

  async reject(reason, rejectedBy) {
    return this.update({
      STATUS: 'REJECTED',
      FAILURE_REASON: reason,
      APPROVED_BY: rejectedBy,
      APPROVAL_DATE: new Date()
    });
  }

  async execute(executedBy) {
    return this.update({
      STATUS: 'EXECUTED',
      EXECUTED_BY: executedBy,
      EXECUTION_DATE: new Date(),
      DISBURSEMENT_DATE: new Date()
    });
  }

  async disburse(disbursedBy, transactionReference = null) {
    const updateData = {
      STATUS: 'DISBURSED',
      DISBURSED_BY: disbursedBy,
      EXECUTION_DATE: new Date(),
      DISBURSEMENT_DATE: new Date()
    };

    if (transactionReference) {
      updateData.TRANSACTION_REFERENCE = transactionReference;
    }

    return this.update(updateData);
  }

  async cancel(reason, cancelledBy) {
    return this.update({
      STATUS: 'CANCELLED',
      CANCELLATION_REASON: reason,
      APPROVED_BY: cancelledBy,
      APPROVAL_DATE: new Date()
    });
  }

  async fail(reason) {
    return this.update({
      STATUS: 'FAILED',
      FAILURE_REASON: reason
    });
  }

  async updateEMI(newEMI) {
    return this.update({ EMI_AMOUNT: newEMI });
  }

  async updateInterestRate(newRate) {
    return this.update({ INTEREST_RATE: newRate });
  }

  // Status check methods
  isPending() {
    return this.STATUS === 'PENDING';
  }

  isApproved() {
    return this.STATUS === 'APPROVED';
  }

  isExecuted() {
    return this.STATUS === 'EXECUTED';
  }

  isDisbursed() {
    return this.STATUS === 'DISBURSED';
  }

  isRejected() {
    return this.STATUS === 'REJECTED';
  }

  isFailed() {
    return this.STATUS === 'FAILED';
  }

  isCancelled() {
    return this.STATUS === 'CANCELLED';
  }

  // Calculation methods
  calculateEMI() {
    const principal = parseFloat(this.AMOUNT) || 0;
    const annualRate = parseFloat(this.INTEREST_RATE) || 0;
    const term = this.TERM_VALUE || 1;
    const method = this.CALCULATION_METHOD || 'REDUCING_BALANCE';

    let emi;
    if (method === 'FLAT_RATE' || method === 'FIXED_RATE') {
      const totalInterest = principal * (annualRate / 100);
      emi = (principal + totalInterest) / term;
    } else {
      const monthlyRate = annualRate / 100 / 12;
      if (monthlyRate === 0) {
        emi = principal / term;
      } else {
        emi = principal * monthlyRate * Math.pow(1 + monthlyRate, term) /
              (Math.pow(1 + monthlyRate, term) - 1);
      }
    }
    return isFinite(emi) ? emi.toFixed(2) : '0.00';
  }

  calculateNetDisbursement() {
    const amount = parseFloat(this.AMOUNT) || 0;
    const fees = parseFloat(this.FEES_AMOUNT) || 0;
    const upfront = parseFloat(this.UPFRONT_INTEREST_AMOUNT) || 0;
    const net = amount - fees - upfront;
    return net > 0 ? net.toFixed(2) : '0.00';
  }

  calculateTotalInterest() {
    const principal = parseFloat(this.AMOUNT) || 0;
    const annualRate = parseFloat(this.INTEREST_RATE) || 0;
    const term = this.TERM_VALUE || 1;
    const method = this.CALCULATION_METHOD || 'REDUCING_BALANCE';

    if (method === 'FLAT_RATE' || method === 'FIXED_RATE') {
      return (principal * (annualRate / 100)).toFixed(2);
    } else {
      const emi = parseFloat(this.calculateEMI());
      const totalRepayment = emi * term;
      return (totalRepayment - principal).toFixed(2);
    }
  }

  calculateTotalRepayment() {
    const principal = parseFloat(this.AMOUNT) || 0;
    const totalInterest = parseFloat(this.calculateTotalInterest());
    return (principal + totalInterest).toFixed(2);
  }

  getDisbursementDetails() {
    return {
      id: this.id,
      ACCT_NO: this.ACCT_NO,
      APPL_ID: this.APPL_ID,
      CUST_ID: this.CUST_ID,
      AMOUNT: parseFloat(this.AMOUNT) || 0,
      INTEREST_RATE: parseFloat(this.INTEREST_RATE) || 0,
      TERM_VALUE: this.TERM_VALUE,
      TERM_CD: this.TERM_CD,
      EMI_AMOUNT: parseFloat(this.EMI_AMOUNT) || 0,
      NET_DISBURSEMENT_AMOUNT: parseFloat(this.NET_DISBURSEMENT_AMOUNT) || 0,
      STATUS: this.STATUS,
      DISBURSEMENT_DATE: this.DISBURSEMENT_DATE,
      START_DT: this.START_DT,
      MATURITY_DT: this.MATURITY_DT,
      TRANSACTION_REFERENCE: this.TRANSACTION_REFERENCE,
      CREATED_BY: this.CREATED_BY,
      APPROVED_BY: this.APPROVED_BY,
      APPROVAL_DATE: this.APPROVAL_DATE
    };
  }

  // Getters
  get principalAmount() {
    return parseFloat(this.AMOUNT) || 0;
  }

  get emiAmountNumeric() {
    return parseFloat(this.EMI_AMOUNT) || 0;
  }

  get netAmountNumeric() {
    return parseFloat(this.NET_DISBURSEMENT_AMOUNT) || 0;
  }

  get totalInterestNumeric() {
    return parseFloat(this.TOTAL_INTEREST) || 0;
  }

  get totalRepaymentNumeric() {
    return parseFloat(this.TOTAL_REPAYMENT) || 0;
  }

  get daysSinceDisbursement() {
    if (!this.DISBURSEMENT_DATE) return null;
    const today = new Date();
    const disbursementDate = new Date(this.DISBURSEMENT_DATE);
    const diffTime = today - disbursementDate;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  get loanDurationDays() {
    if (!this.START_DT || !this.MATURITY_DT) return null;
    const start = new Date(this.START_DT);
    const maturity = new Date(this.MATURITY_DT);
    const diffTime = maturity - start;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  get isActiveLoan() {
    return this.isDisbursed() && (!this.MATURITY_DT || new Date(this.MATURITY_DT) > new Date());
  }
}

LoanDisbursement.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // ==================== CORE REQUIRED FIELDS ====================
  ACCT_NO: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [10, 20]
    }
  },
  INTEREST_RATE: {
    type: DataTypes.DECIMAL(6, 4), // Supports up to 9999.9999%
    allowNull: false,
    validate: {
      isDecimal: true,
      min: 0,
      max: 100
    }
  },
  TERM_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isInt: true,
      min: 1
    }
  },
  TERM_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      isIn: [['D', 'W', 'BW', 'M', 'Q', 'Y', 'DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']]
    },
    set(value) {
      if (value) {
        this.setDataValue('TERM_CD', value.toUpperCase());
      }
    }
  },
  AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  CUST_ID: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  APPL_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    },
    set(value) {
      if (value) {
        this.setDataValue('APPL_ID', value.trim());
      }
    }
  },

  // ==================== CALCULATION FIELDS ====================
  CALCULATION_METHOD: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'REDUCING_BALANCE',
    validate: {
      isIn: [['FLAT_RATE', 'REDUCING_BALANCE', 'FIXED_RATE', 'EMI']]
    }
  },
  PAYMENT_FREQUENCY: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'MONTHLY',
    validate: {
      isIn: [['DAILY', 'WEEKLY', 'BI_WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUALLY', 'ANNUALLY']]
    }
  },
  EMI_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  TOTAL_INTEREST: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  TOTAL_REPAYMENT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    validate: {
      isDecimal: true,
      min: 0
    }
  },

  // ==================== INTEREST CONFIGURATION ====================
  INTEREST_CONFIGURATION: {
    type: DataTypes.JSON,
    defaultValue: {
      INTEREST_TYPE: 'COMPOUND',
      CALCULATION_METHOD: 'REDUCING_BALANCE',
      INTEREST_RATE: 0,
      RATE_TYPE: 'REDUCING',
      IS_TERM_BASED_RATE: false
    },
    validate: {
      isValidConfiguration(value) {
        if (!value || typeof value !== 'object') {
          throw new Error('Interest configuration must be an object');
        }
        
        const validInterestTypes = ['FIXED', 'VARIABLE', 'TIERED', 'FIXED_RATE', 'VARIABLE_RATE', 'SIMPLE', 'COMPOUND'];
        if (value.INTEREST_TYPE && !validInterestTypes.includes(value.INTEREST_TYPE)) {
          throw new Error('Invalid INTEREST_TYPE in interest configuration');
        }
        
        const validCalculationMethods = ['DECLINING_BALANCE', 'REDUCING_BALANCE', 'FLAT_RATE', 'COMPOUND', 'DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'];
        if (value.CALCULATION_METHOD && !validCalculationMethods.includes(value.CALCULATION_METHOD)) {
          throw new Error('Invalid CALCULATION_METHOD in interest configuration');
        }
        
        const validRateTypes = ['FIXED', 'FLOATING', 'TIERED', 'REDUCING'];
        if (value.RATE_TYPE && !validRateTypes.includes(value.RATE_TYPE)) {
          throw new Error('Invalid RATE_TYPE in interest configuration');
        }
      }
    }
  },

  // ==================== REFERENCES ====================
  LOAN_ACCOUNT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'LoanAccounts',
      key: 'id'
    }
  },
  CREDIT_APPLICATION_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'CreditApplications',
      key: 'id'
    }
  },
  GUARANTOR_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Guarantors',
      key: 'id'
    }
  },
  REPAYMENT_SCHEDULE_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'RepaymentSchedules',
      key: 'id'
    }
  },

  // ==================== LOAN DETAILS (with safe defaults in controller) ====================
  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isInt: true,
      min: 1
    }
  },
  PRODUCT_TYPE: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['INDIVIDUAL_LOAN', 'BUSINESS_LOAN', 'MORTGAGE', 'PERSONAL_LOAN', 'AUTO_LOAN', 'EDUCATION_LOAN']]
    }
  },
  ACCT_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  CRNCY_ID: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN',
    validate: {
      len: [3, 3]
    }
  },
  BU_ID: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  PRIMARY_OFFICER_ID: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  REPAY_SRC_ACCT_NO: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  START_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isDate: true
    }
  },
  MATURITY_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    validate: {
      isDate: true,
      isAfterStartDate(value) {
        if (new Date(value) <= new Date(this.START_DT)) {
          throw new Error('Maturity date must be after start date');
        }
      }
    }
  },
  LOAN_CYCLE: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      isInt: true,
      min: 1
    }
  },

  // ==================== DISBURSEMENT DETAILS ====================
  DISBURSEMENT_DATE: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  FEES_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  UPFRONT_INTEREST_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00,
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  NET_DISBURSEMENT_AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    validate: {
      isDecimal: true,
      min: 0
    }
  },
  STATUS: {
    type: DataTypes.STRING(20),
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'APPROVED', 'EXECUTED', 'DISBURSED', 'REJECTED', 'FAILED', 'CANCELLED']]
    },
    set(value) {
      if (value) {
        this.setDataValue('STATUS', value.toUpperCase());
      }
    }
  },
  DISBURSEMENT_TYPE: {
    type: DataTypes.STRING(20),
    defaultValue: 'CUSTOMER_ACCOUNT',
    validate: {
      isIn: [['CUSTOMER_ACCOUNT', 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'MOBILE_MONEY']]
    }
  },

  // ==================== WORKFLOW & IDs ====================
  TRANSACTION_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  EVENT_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  JOURNAL_ID: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  TRANSACTION_REFERENCE: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true
  },

  // ==================== USER FIELDS ====================
  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },
  APPROVED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  APPROVAL_DATE: {
    type: DataTypes.DATE,
    allowNull: true
  },
  EXECUTED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  EXECUTION_DATE: {
    type: DataTypes.DATE,
    allowNull: true
  },
  DISBURSED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true
  },

  // Optional notes
  REMARKS: {
    type: DataTypes.STRING(500),
    allowNull: true
  },
  FAILURE_REASON: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  CANCELLATION_REASON: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  TRANSACTION_NOTES: {
    type: DataTypes.STRING(1000),
    allowNull: true
  },

  // Optional extra info
  Borrower_address: {
    type: DataTypes.JSON,
    defaultValue: {
      street: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'Nigeria'
    }
  },
  REPAYMENT_SCHEDULE: {
    type: DataTypes.JSON,
    defaultValue: []
  }
}, {
  sequelize,
  modelName: 'LoanDisbursement',
  tableName: 'LoanDisbursements',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  hooks: {
    beforeSave: async (disbursement, options) => {
      try {
        // EMI calculation fallback
        if (!disbursement.EMI_AMOUNT && disbursement.AMOUNT && disbursement.INTEREST_RATE && disbursement.TERM_VALUE) {
          disbursement.EMI_AMOUNT = disbursement.calculateEMI();
        }

        // Net amount recalculation
        disbursement.NET_DISBURSEMENT_AMOUNT = disbursement.calculateNetDisbursement();

        // Calculate total interest and repayment
        if (!disbursement.TOTAL_INTEREST) {
          disbursement.TOTAL_INTEREST = disbursement.calculateTotalInterest();
        }
        
        if (!disbursement.TOTAL_REPAYMENT) {
          disbursement.TOTAL_REPAYMENT = disbursement.calculateTotalRepayment();
        }

        // Auto-set dates on status change
        if (disbursement.changed('STATUS')) {
          const now = new Date();
          if (disbursement.STATUS === 'APPROVED' && !disbursement.APPROVAL_DATE) {
            disbursement.APPROVAL_DATE = now;
          }
          
          if ((disbursement.STATUS === 'EXECUTED' || disbursement.STATUS === 'DISBURSED') && 
              !disbursement.EXECUTION_DATE) {
            disbursement.EXECUTION_DATE = now;
            disbursement.DISBURSEMENT_DATE = now;
          }
        }

        // Generate transaction reference if missing
        if (!disbursement.TRANSACTION_REFERENCE && disbursement.isNewRecord) {
          disbursement.TRANSACTION_REFERENCE = `DISB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        }

        // Set interest configuration default values
        if (!disbursement.INTEREST_CONFIGURATION) {
          disbursement.INTEREST_CONFIGURATION = {
            INTEREST_TYPE: 'COMPOUND',
            CALCULATION_METHOD: 'REDUCING_BALANCE',
            INTEREST_RATE: parseFloat(disbursement.INTEREST_RATE) || 0,
            RATE_TYPE: 'REDUCING',
            IS_TERM_BASED_RATE: false
          };
        }

      } catch (err) {
        logger.error('LoanDisbursement beforeSave hook error:', err);
        throw err;
      }
    }
  },
  indexes: [
    {
      name: 'idx_loan_disbursement_appl_id',
      fields: ['APPL_ID'],
      unique: true
    },
    {
      name: 'idx_loan_disbursement_acct_no',
      fields: ['ACCT_NO']
    },
    {
      name: 'idx_loan_disbursement_cust_id',
      fields: ['CUST_ID']
    },
    {
      name: 'idx_loan_disbursement_loan_account_id',
      fields: ['LOAN_ACCOUNT_ID']
    },
    {
      name: 'idx_loan_disbursement_guarantor_id',
      fields: ['GUARANTOR_ID']
    },
    {
      name: 'idx_loan_disbursement_status_date',
      fields: ['STATUS', 'DISBURSEMENT_DATE']
    },
    {
      name: 'idx_loan_disbursement_transaction_id',
      fields: ['TRANSACTION_ID']
    },
    {
      name: 'idx_loan_disbursement_prod_id',
      fields: ['PROD_ID']
    },
    {
      name: 'idx_loan_disbursement_start_dt',
      fields: ['START_DT']
    },
    {
      name: 'idx_loan_disbursement_maturity_dt',
      fields: ['MATURITY_DT']
    },
    {
      name: 'idx_loan_disbursement_transaction_reference',
      fields: ['TRANSACTION_REFERENCE'],
      unique: true
    }
  ]
});

export default LoanDisbursement;
