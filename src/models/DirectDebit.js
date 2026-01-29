// models/DirectDebit.js - COMPLETE FIXED VERSION
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DirectDebit extends Model {
  // Static method: Find direct debit by ID
  static async findById(directDebitId, options = {}) {
    return this.findOne({
      where: { DIRECT_DR_ID: directDebitId },
      ...options
    });
  }

  // Static method: Find direct debits by source account
  static async findBySourceAccount(accountNumber, options = {}) {
    const defaultOptions = {
      where: { FROM_DEPOSIT_ACCT_NO: accountNumber },
      order: [['NEXT_PAY_DT', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find direct debits by destination account
  static async findByDestinationAccount(accountNumber, options = {}) {
    const defaultOptions = {
      where: { TO_DEPOSIT_ACCT_NO: accountNumber },
      order: [['NEXT_PAY_DT', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find direct debits by customer/beneficiary
  static async findByBeneficiary(beneficiaryId, options = {}) {
    const defaultOptions = {
      where: { BENEFICIARY_ID: beneficiaryId },
      order: [['NEXT_PAY_DT', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find active direct debits due for payment
  static async findDueForPayment(date = new Date(), options = {}) {
    const defaultOptions = {
      where: {
        REC_ST: 'Y',
        NEXT_PAY_DT: {
          [Op.lte]: date
        },
        EXPIRY_DT: {
          [Op.gt]: date
        }
      },
      order: [['NEXT_PAY_DT', 'ASC']],
      limit: options.limit || 100
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get direct debit summary by status
  static async getSummaryByStatus() {
    const results = await this.findAll({
      attributes: [
        'REC_ST',
        [sequelize.fn('COUNT', sequelize.col('DIRECT_DR_ID')), 'count'],
        [sequelize.fn('SUM', sequelize.col('PAY_AMT')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('PAY_AMT')), 'averageAmount']
      ],
      group: ['REC_ST'],
      raw: true
    });

    const summary = {
      active: { count: 0, totalAmount: 0, averageAmount: 0 },
      inactive: { count: 0, totalAmount: 0, averageAmount: 0 }
    };

    results.forEach(result => {
      const status = result.REC_ST === 'Y' ? 'active' : 'inactive';
      summary[status] = {
        count: parseInt(result.count) || 0,
        totalAmount: parseFloat(result.totalAmount) || 0,
        averageAmount: parseFloat(result.averageAmount) || 0
      };
    });

    return summary;
  }

  // Static method: Calculate next payment dates
  static async calculateNextPayments(directDebitId) {
    const directDebit = await this.findByPk(directDebitId);
    
    if (!directDebit) {
      throw new Error('Direct debit not found');
    }

    const paymentSchedule = [];
    const startDate = new Date(directDebit.NEXT_PAY_DT);
    let currentDate = new Date(startDate);

    for (let i = 0; i < directDebit.NO_OF_PAYMENTS; i++) {
      // Add payment date
      paymentSchedule.push({
        paymentNumber: i + 1,
        paymentDate: new Date(currentDate),
        amount: parseFloat(directDebit.PAY_AMT),
        status: currentDate <= new Date() ? 'Due' : 'Upcoming'
      });

      // Calculate next payment date based on frequency
      switch (directDebit.PAY_FREQ_CD) {
        case 'DAILY':
          currentDate.setDate(currentDate.getDate() + directDebit.PAY_FREQ_VALUE);
          break;
        case 'WEEKLY':
          currentDate.setDate(currentDate.getDate() + (7 * directDebit.PAY_FREQ_VALUE));
          break;
        case 'MONTHLY':
          currentDate.setMonth(currentDate.getMonth() + directDebit.PAY_FREQ_VALUE);
          break;
        case 'QUARTERLY':
          currentDate.setMonth(currentDate.getMonth() + (3 * directDebit.PAY_FREQ_VALUE));
          break;
        case 'YEARLY':
          currentDate.setFullYear(currentDate.getFullYear() + directDebit.PAY_FREQ_VALUE);
          break;
        default:
          currentDate.setMonth(currentDate.getMonth() + 1); // Default to monthly
      }

      // Stop if past expiry date
      if (currentDate > directDebit.EXPIRY_DT) {
        break;
      }
    }

    return {
      directDebitId: directDebit.DIRECT_DR_ID,
      totalPayments: directDebit.NO_OF_PAYMENTS,
      paymentAmount: parseFloat(directDebit.PAY_AMT),
      nextPaymentDate: directDebit.NEXT_PAY_DT,
      expiryDate: directDebit.EXPIRY_DT,
      paymentSchedule: paymentSchedule
    };
  }

  // Static method: Process direct debit payment
  static async processPayment(directDebitId, transactionRef) {
    const directDebit = await this.findByPk(directDebitId);
    
    if (!directDebit) {
      throw new Error('Direct debit not found');
    }

    if (directDebit.REC_ST !== 'Y') {
      throw new Error('Direct debit is not active');
    }

    const now = new Date();
    if (directDebit.NEXT_PAY_DT > now) {
      throw new Error('Payment is not due yet');
    }

    if (directDebit.EXPIRY_DT < now) {
      throw new Error('Direct debit has expired');
    }

    // Calculate next payment date
    let nextPaymentDate = new Date(directDebit.NEXT_PAY_DT);
    switch (directDebit.PAY_FREQ_CD) {
      case 'DAILY':
        nextPaymentDate.setDate(nextPaymentDate.getDate() + directDebit.PAY_FREQ_VALUE);
        break;
      case 'WEEKLY':
        nextPaymentDate.setDate(nextPaymentDate.getDate() + (7 * directDebit.PAY_FREQ_VALUE));
        break;
      case 'MONTHLY':
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + directDebit.PAY_FREQ_VALUE);
        break;
      case 'QUARTERLY':
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + (3 * directDebit.PAY_FREQ_VALUE));
        break;
      case 'YEARLY':
        nextPaymentDate.setFullYear(nextPaymentDate.getFullYear() + directDebit.PAY_FREQ_VALUE);
        break;
      default:
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
    }

    // Update direct debit record
    await directDebit.update({
      NEXT_PAY_DT: nextPaymentDate,
      ROW_TS: now,
      VERSION_NO: directDebit.VERSION_NO + 1
    });

    return {
      success: true,
      directDebitId: directDebit.DIRECT_DR_ID,
      transactionRef: transactionRef,
      paymentAmount: parseFloat(directDebit.PAY_AMT),
      fromAccount: directDebit.FROM_DEPOSIT_ACCT_NO,
      toAccount: directDebit.TO_DEPOSIT_ACCT_NO,
      paymentDate: now,
      nextPaymentDate: nextPaymentDate,
      paymentsRemaining: directDebit.NO_OF_PAYMENTS - 1 // Would need to track actual payments made
    };
  }

  // Instance method: Get direct debit details
  getDirectDebitDetails() {
    return {
      directDebitId: this.DIRECT_DR_ID,
      accounts: {
        fromAccount: this.FROM_DEPOSIT_ACCT_NO,
        toAccount: this.TO_DEPOSIT_ACCT_NO,
        beneficiaryId: this.BENEFICIARY_ID,
        serviceProviderId: this.SVCE_PROVIDER_ID
      },
      paymentDetails: {
        description: this.DIRECT_DR_DESC,
        mandateType: this.DIRECT_DR_MANDATE_TY_CD,
        transferMethod: this.XFER_MTHD_CD,
        paymentCurrency: this.PAY_CRNCY_ID,
        paymentAmount: parseFloat(this.PAY_AMT),
        maxPaymentAmount: parseFloat(this.MAX_PAY_AMT)
      },
      schedule: {
        scheduleType: this.SCHED_TY_CD,
        nextPaymentDate: this.NEXT_PAY_DT,
        numberOfPayments: this.NO_OF_PAYMENTS,
        paymentFrequency: this.PAY_FREQ_CD,
        paymentFrequencyValue: this.PAY_FREQ_VALUE,
        expiryDate: this.EXPIRY_DT,
        nonBusinessDayOption: this.NON_BUS_DUE_DT_OPTN_CD
      },
      references: {
        referenceText: this.REF_TXT,
        supplementaryReference: this.SUPPLEMENTARY_REF_TXT,
        paymentReasonId: this.PAY_RSN_ID,
        supplementaryInstruction: this.SUPPLEMENTARY_INSTRUCTION
      },
      status: {
        recordStatus: this.REC_ST,
        version: this.VERSION_NO,
        isActive: this.REC_ST === 'Y',
        isExpired: new Date(this.EXPIRY_DT) < new Date()
      },
      metadata: {
        userId: this.USER_ID,
        createdBy: this.CREATED_BY,
        createdDate: this.CREATE_DT,
        systemCreateTimestamp: this.SYS_CREATE_TS,
        rowTimestamp: this.ROW_TS
      }
    };
  }

  // Instance method: Check if payment is due
  isPaymentDue(date = new Date()) {
    return (
      this.REC_ST === 'Y' &&
      new Date(this.NEXT_PAY_DT) <= date &&
      new Date(this.EXPIRY_DT) >= date
    );
  }

  // Instance method: Calculate remaining payments
  getRemainingPayments() {
    const today = new Date();
    const expiryDate = new Date(this.EXPIRY_DT);
    
    if (today > expiryDate || this.REC_ST !== 'Y') {
      return 0;
    }

    // This is a simplified calculation - in practice, you'd need to track actual payments made
    return this.NO_OF_PAYMENTS;
  }

  // Instance method: Validate payment amount
  validatePaymentAmount(amount) {
    const paymentAmount = parseFloat(this.PAY_AMT);
    const maxAmount = parseFloat(this.MAX_PAY_AMT);
    const proposedAmount = parseFloat(amount);

    if (proposedAmount > maxAmount) {
      return {
        valid: false,
        reason: `Payment amount ${proposedAmount} exceeds maximum allowed amount ${maxAmount}`
      };
    }

    if (Math.abs(proposedAmount - paymentAmount) > 0.01) {
      return {
        valid: false,
        reason: `Payment amount ${proposedAmount} does not match scheduled amount ${paymentAmount}`
      };
    }

    return { valid: true };
  }

  // Instance method: Get formatted payment schedule
  getPaymentSchedule() {
    const schedule = [];
    let currentDate = new Date(this.NEXT_PAY_DT);
    const expiryDate = new Date(this.EXPIRY_DT);

    for (let i = 0; i < this.NO_OF_PAYMENTS && currentDate <= expiryDate; i++) {
      schedule.push({
        paymentNumber: i + 1,
        dueDate: new Date(currentDate),
        amount: parseFloat(this.PAY_AMT),
        status: currentDate < new Date() ? 'Overdue' : 
                currentDate.toDateString() === new Date().toDateString() ? 'Due Today' : 'Upcoming'
      });

      // Calculate next date
      switch (this.PAY_FREQ_CD) {
        case 'DAILY':
          currentDate.setDate(currentDate.getDate() + this.PAY_FREQ_VALUE);
          break;
        case 'WEEKLY':
          currentDate.setDate(currentDate.getDate() + (7 * this.PAY_FREQ_VALUE));
          break;
        case 'MONTHLY':
          currentDate.setMonth(currentDate.getMonth() + this.PAY_FREQ_VALUE);
          break;
        case 'QUARTERLY':
          currentDate.setMonth(currentDate.getMonth() + (3 * this.PAY_FREQ_VALUE));
          break;
        case 'YEARLY':
          currentDate.setFullYear(currentDate.getFullYear() + this.PAY_FREQ_VALUE);
          break;
        default:
          currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    return schedule;
  }

  // Virtual getter: Formatted payment amount
  get formattedPaymentAmount() {
    const amount = parseFloat(this.PAY_AMT);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.PAY_CRNCY_ID || 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  }

  // Virtual getter: Days until next payment
  get daysUntilNextPayment() {
    const today = new Date();
    const nextPayment = new Date(this.NEXT_PAY_DT);
    const diffTime = nextPayment - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Virtual getter: Is expired?
  get isExpired() {
    return new Date(this.EXPIRY_DT) < new Date();
  }

  // Virtual getter: Payment frequency description
  get frequencyDescription() {
    const frequencyMap = {
      DAILY: 'Daily',
      WEEKLY: 'Weekly',
      MONTHLY: 'Monthly',
      QUARTERLY: 'Quarterly',
      YEARLY: 'Yearly',
      BIWEEKLY: 'Bi-weekly',
      BIMONTHLY: 'Bi-monthly'
    };

    const description = frequencyMap[this.PAY_FREQ_CD] || this.PAY_FREQ_CD;
    return this.PAY_FREQ_VALUE > 1 ? 
      `Every ${this.PAY_FREQ_VALUE} ${description.toLowerCase()}s` : 
      description;
  }
}

DirectDebit.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Internal ID for database relationships'
  },

  DIRECT_DR_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    comment: 'Direct debit identifier'
  },

  FROM_DEPOSIT_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Source deposit account number'
  },

  DIRECT_DR_DESC: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Direct debit description'
  },

  DIRECT_DR_MANDATE_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Direct debit mandate type code'
  },

  XFER_MTHD_CD: {
    type: DataTypes.STRING(8),
    allowNull: false,
    comment: 'Transfer method code'
  },

  PAY_CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: false,
    comment: 'Payment currency code (e.g., USD, EUR, NGN)'
  },

  PAY_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Payment amount'
  },

  TO_DEPOSIT_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Destination deposit account number'
  },

  MAX_PAY_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Maximum payment amount'
  },

  SCHED_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Schedule type code'
  },

  NEXT_PAY_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Next payment date'
  },

  NO_OF_PAYMENTS: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Number of payments',
    validate: {
      min: {
        args: [1],
        msg: 'Number of payments must be at least 1'
      }
    }
  },

  PAY_FREQ_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Payment frequency code'
  },

  PAY_FREQ_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Payment frequency value',
    validate: {
      min: {
        args: [1],
        msg: 'Payment frequency value must be at least 1'
      }
    }
  },

  EXPIRY_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Expiry date'
  },

  NON_BUS_DUE_DT_OPTN_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Non-business day due date option code'
  },

  REF_TXT: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Reference text'
  },

  SUPPLEMENTARY_REF_TXT: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Supplementary reference text'
  },

  PAY_RSN_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Payment reason identifier'
  },

  SVCE_PROVIDER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Service provider identifier'
  },

  BENEFICIARY_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Beneficiary identifier'
  },

  SUPPLEMENTARY_INSTRUCTION: {
    type: DataTypes.STRING(255),
    allowNull: false,
    comment: 'Supplementary instruction'
  },

  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: false,
    validate: {
      isIn: [['Y', 'N']]
    },
    comment: 'Record status (Y=Active, N=Inactive)'
  },

  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version number'
  },

  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Row timestamp'
  },

  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User identifier'
  },

  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Create date'
  },

  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created by user'
  },

  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'System create timestamp'
  },

  // Sequelize timestamps
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  // Add these fields to your DirectDebit schema
LOAN_ACCOUNT_NO: {
  type: DataTypes.STRING(50),
  allowNull: true,
  comment: 'Loan account number for loan repayments'
},

LOAN_ID: {
  type: DataTypes.STRING(50),
  allowNull: true,
  comment: 'Loan identifier'
},

REPAYMENT_TYPE: {
  type: DataTypes.STRING(20),
  allowNull: true,
  defaultValue: 'STANDARD',
  validate: {
    isIn: [['STANDARD', 'EARLY', 'PARTIAL', 'BALLOON']]
  },
  comment: 'Type of loan repayment'
},

INSTALLMENT_NUMBER: {
  type: DataTypes.INTEGER,
  allowNull: true,
  comment: 'Installment number for tracking'
},

TOTAL_INSTALLMENTS: {
  type: DataTypes.INTEGER,
  allowNull: true,
  comment: 'Total number of installments'
},

PRINCIPAL_AMOUNT: {
  type: DataTypes.DECIMAL(20, 2),
  allowNull: true,
  comment: 'Principal portion of payment'
},

INTEREST_AMOUNT: {
  type: DataTypes.DECIMAL(20, 2),
  allowNull: true,
  comment: 'Interest portion of payment'
},

PENALTY_AMOUNT: {
  type: DataTypes.DECIMAL(20, 2),
  allowNull: true,
  defaultValue: 0,
  comment: 'Penalty amount if any'
},

LOAN_PRODUCT_CODE: {
  type: DataTypes.STRING(50),
  allowNull: true,
  comment: 'Loan product code'
},

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DirectDebit',
  tableName: 'direct_debit',
  timestamps: true,
  hooks: {
    beforeValidate: (directDebit) => {
      // Trim string fields
      const stringFields = [
        'DIRECT_DR_ID', 'FROM_DEPOSIT_ACCT_NO', 'DIRECT_DR_DESC',
        'DIRECT_DR_MANDATE_TY_CD', 'XFER_MTHD_CD', 'PAY_CRNCY_ID',
        'TO_DEPOSIT_ACCT_NO', 'SCHED_TY_CD', 'PAY_FREQ_CD',
        'NON_BUS_DUE_DT_OPTN_CD', 'REF_TXT', 'SUPPLEMENTARY_REF_TXT',
        'SVCE_PROVIDER_ID', 'BENEFICIARY_ID', 'SUPPLEMENTARY_INSTRUCTION',
        'USER_ID', 'CREATED_BY'
      ];
      
      stringFields.forEach(field => {
        if (directDebit[field]) {
          directDebit[field] = directDebit[field].toString().trim();
        }
      });

      // Ensure uppercase for certain fields
      if (directDebit.REC_ST) directDebit.REC_ST = directDebit.REC_ST.toUpperCase();
      if (directDebit.PAY_CRNCY_ID) directDebit.PAY_CRNCY_ID = directDebit.PAY_CRNCY_ID.toUpperCase();
      if (directDebit.PAY_FREQ_CD) directDebit.PAY_FREQ_CD = directDebit.PAY_FREQ_CD.toUpperCase();
      if (directDebit.SCHED_TY_CD) directDebit.SCHED_TY_CD = directDebit.SCHED_TY_CD.toUpperCase();

      // Validate PAY_AMT <= MAX_PAY_AMT
      if (directDebit.PAY_AMT && directDebit.MAX_PAY_AMT) {
        const payAmount = parseFloat(directDebit.PAY_AMT);
        const maxAmount = parseFloat(directDebit.MAX_PAY_AMT);
        
        if (payAmount > maxAmount) {
          throw new Error(`PAY_AMT (${payAmount}) cannot exceed MAX_PAY_AMT (${maxAmount})`);
        }
      }
    },
    
    beforeCreate: (directDebit) => {
      // Set timestamps if not provided
      const now = new Date();
      if (!directDebit.CREATE_DT) directDebit.CREATE_DT = now;
      if (!directDebit.SYS_CREATE_TS) directDebit.SYS_CREATE_TS = now;
      if (!directDebit.ROW_TS) directDebit.ROW_TS = now;
      
      // Validate dates
      if (directDebit.NEXT_PAY_DT && directDebit.EXPIRY_DT) {
        if (directDebit.NEXT_PAY_DT > directDebit.EXPIRY_DT) {
          throw new Error('NEXT_PAY_DT cannot be after EXPIRY_DT');
        }
      }
      
      // Ensure NEXT_PAY_DT is not in the past for new records
      if (directDebit.NEXT_PAY_DT && directDebit.NEXT_PAY_DT < now) {
        throw new Error('NEXT_PAY_DT cannot be in the past for new direct debits');
      }
      
      // Set default REC_ST if not provided
      if (!directDebit.REC_ST) directDebit.REC_ST = 'Y';
      
      // Validate frequency codes
      const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'BIWEEKLY', 'BIMONTHLY'];
      if (directDebit.PAY_FREQ_CD && !validFrequencies.includes(directDebit.PAY_FREQ_CD.toUpperCase())) {
        throw new Error(`Invalid PAY_FREQ_CD: ${directDebit.PAY_FREQ_CD}. Must be one of: ${validFrequencies.join(', ')}`);
      }
    },
    
    beforeUpdate: (directDebit) => {
      // Update row timestamp
      directDebit.ROW_TS = new Date();
      
      // Increment version number on update
      if (directDebit.changed() && !directDebit.changed('VERSION_NO')) {
        directDebit.VERSION_NO = (directDebit.VERSION_NO || 0) + 1;
      }
      
      // Validate that NEXT_PAY_DT is not updated to be after EXPIRY_DT
      if (directDebit.changed('NEXT_PAY_DT') || directDebit.changed('EXPIRY_DT')) {
        const nextPayDate = directDebit.NEXT_PAY_DT;
        const expiryDate = directDebit.EXPIRY_DT;
        
        if (nextPayDate && expiryDate && nextPayDate > expiryDate) {
          throw new Error('NEXT_PAY_DT cannot be after EXPIRY_DT');
        }
      }
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['id'] },
    { fields: ['DIRECT_DR_ID'], unique: true },
    
    // Account-related indexes
    { fields: ['FROM_DEPOSIT_ACCT_NO'] },
    { fields: ['TO_DEPOSIT_ACCT_NO'] },
    { fields: ['FROM_DEPOSIT_ACCT_NO', 'TO_DEPOSIT_ACCT_NO'] },
    
    // Beneficiary and service provider indexes
    { fields: ['BENEFICIARY_ID'] },
    { fields: ['SVCE_PROVIDER_ID'] },
    { fields: ['BENEFICIARY_ID', 'SVCE_PROVIDER_ID'] },
    
    // Status indexes
    { fields: ['REC_ST'] },
    { fields: ['REC_ST', 'EXPIRY_DT'] },
    
    // Date indexes for scheduling
    { fields: ['NEXT_PAY_DT'] },
    { fields: ['EXPIRY_DT'] },
    { fields: ['NEXT_PAY_DT', 'EXPIRY_DT'] },
    { fields: ['REC_ST', 'NEXT_PAY_DT', 'EXPIRY_DT'] },
    
    // Payment-related indexes
    { fields: ['PAY_FREQ_CD'] },
    { fields: ['PAY_CRNCY_ID'] },
    { fields: ['PAY_RSN_ID'] },
    
    // Composite indexes for common queries
    { fields: ['FROM_DEPOSIT_ACCT_NO', 'REC_ST', 'NEXT_PAY_DT'] },
    { fields: ['BENEFICIARY_ID', 'REC_ST', 'EXPIRY_DT'] },
    { fields: ['SVCE_PROVIDER_ID', 'REC_ST', 'NEXT_PAY_DT'] },
    
    // User-related indexes
    { fields: ['USER_ID'] },
    { fields: ['CREATED_BY'] },
    { fields: ['CREATE_DT'] }
  ],
  scopes: {
    active: {
      where: { REC_ST: 'Y' }
    },
    inactive: {
      where: { REC_ST: 'N' }
    },
    expired: {
      where: {
        EXPIRY_DT: {
          [Op.lt]: new Date()
        }
      }
    },
    activeAndNotExpired: {
      where: {
        REC_ST: 'Y',
        EXPIRY_DT: {
          [Op.gt]: new Date()
        }
      }
    },
    dueForPayment: {
      where: {
        REC_ST: 'Y',
        NEXT_PAY_DT: {
          [Op.lte]: new Date()
        },
        EXPIRY_DT: {
          [Op.gt]: new Date()
        }
      }
    },
    bySourceAccount: (accountNumber) => ({
      where: { FROM_DEPOSIT_ACCT_NO: accountNumber }
    }),
    byDestinationAccount: (accountNumber) => ({
      where: { TO_DEPOSIT_ACCT_NO: accountNumber }
    }),
    byBeneficiary: (beneficiaryId) => ({
      where: { BENEFICIARY_ID: beneficiaryId }
    }),
    byServiceProvider: (providerId) => ({
      where: { SVCE_PROVIDER_ID: providerId }
    }),
    byCurrency: (currency) => ({
      where: { PAY_CRNCY_ID: currency }
    }),
    byFrequency: (frequency) => ({
      where: { PAY_FREQ_CD: frequency }
    }),
    dateRange: (startDate, endDate) => ({
      where: {
        CREATE_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    paymentDateRange: (startDate, endDate) => ({
      where: {
        NEXT_PAY_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    sortedByNextPayment: {
      order: [['NEXT_PAY_DT', 'ASC']]
    },
    sortedByCreation: {
      order: [['CREATE_DT', 'DESC']]
    },
    sortedByAmount: {
      order: [['PAY_AMT', 'DESC']]
    },
    highValue: {
      where: { PAY_AMT: { [Op.gte]: 10000 } }
    },
    lowValue: {
      where: { PAY_AMT: { [Op.lt]: 1000 } }
    },
    withPagination: (page, pageSize) => ({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }
});

export default DirectDebit;