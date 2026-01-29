// models/DirectDebitRequest.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DirectDebitRequest extends Model {
  // Static method: Find request by ID
  static async findById(requestId, options = {}) {
    return this.findOne({
      where: { DIRECT_DR_REQ_ID: requestId },
      ...options
    });
  }

  // Static method: Find requests by source account
  static async findBySourceAccount(accountId, options = {}) {
    const defaultOptions = {
      where: { FROM_ACCT_ID: accountId },
      order: [['NEXT_REQ_DT', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find requests by payee account
  static async findByPayeeAccount(accountNumber, options = {}) {
    const defaultOptions = {
      where: { PAYEE_ACCT_NO: accountNumber },
      order: [['NEXT_REQ_DT', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find requests by payee name
  static async findByPayeeName(payeeName, options = {}) {
    const defaultOptions = {
      where: {
        PAYEE_NM: {
          [Op.like]: `%${payeeName}%`
        }
      },
      order: [['PAYEE_NM', 'ASC'], ['NEXT_REQ_DT', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find pending requests due for processing
  static async findDueForProcessing(date = new Date(), options = {}) {
    const defaultOptions = {
      where: {
        REC_ST: 'A', // Active requests
        NEXT_REQ_DT: {
          [Op.lte]: date
        },
        [Op.or]: [
          { EXPIRY_DT: null },
          { EXPIRY_DT: { [Op.gt]: date } }
        ]
      },
      order: [['NEXT_REQ_DT', 'ASC']],
      limit: options.limit || 100
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get request summary by status
  static async getSummaryByStatus() {
    const results = await this.findAll({
      attributes: [
        'REC_ST',
        [sequelize.fn('COUNT', sequelize.col('DIRECT_DR_REQ_ID')), 'count'],
        [
          sequelize.fn('SUM',
            sequelize.literal(`CASE WHEN REGULAR_PAY_AMT IS NOT NULL THEN REGULAR_PAY_AMT ELSE 0 END`)
          ),
          'totalRegularAmount'
        ],
        [
          sequelize.fn('AVG',
            sequelize.literal(`CASE WHEN REGULAR_PAY_AMT IS NOT NULL THEN REGULAR_PAY_AMT ELSE 0 END`)
          ),
          'averageRegularAmount'
        ]
      ],
      group: ['REC_ST'],
      raw: true
    });

    const summary = {
      active: { count: 0, totalRegularAmount: 0, averageRegularAmount: 0 },
      inactive: { count: 0, totalRegularAmount: 0, averageRegularAmount: 0 },
      pending: { count: 0, totalRegularAmount: 0, averageRegularAmount: 0 }
    };

    results.forEach(result => {
      let status;
      switch (result.REC_ST) {
        case 'A': status = 'active'; break;
        case 'I': status = 'inactive'; break;
        case 'P': status = 'pending'; break;
        default: status = 'other';
      }
      
      if (summary[status]) {
        summary[status] = {
          count: parseInt(result.count) || 0,
          totalRegularAmount: parseFloat(result.totalRegularAmount) || 0,
          averageRegularAmount: parseFloat(result.averageRegularAmount) || 0
        };
      }
    });

    return summary;
  }

  // Static method: Calculate next request dates
  static async calculateNextRequests(requestId) {
    const request = await this.findByPk(requestId);
    
    if (!request) {
      throw new Error('Direct debit request not found');
    }

    const requestSchedule = [];
    const startDate = new Date(request.NEXT_REQ_DT);
    let currentDate = new Date(startDate);

    for (let i = 0; i < request.NO_OF_PAYMENTS || i < 12; i++) { // Limit to 12 if NO_OF_PAYMENTS is 0
      // Determine payment amount based on payment number
      let paymentAmount;
      if (i === 0 && request.FIRST_PAY_AMT) {
        paymentAmount = parseFloat(request.FIRST_PAY_AMT);
      } else if (i === (request.NO_OF_PAYMENTS - 1) && request.LAST_PAY_AMT) {
        paymentAmount = parseFloat(request.LAST_PAY_AMT);
      } else {
        paymentAmount = parseFloat(request.REGULAR_PAY_AMT) || 0;
      }

      // Add request date
      requestSchedule.push({
        requestNumber: i + 1,
        requestDate: new Date(currentDate),
        amount: paymentAmount,
        currency: i === 0 ? request.FIRST_PAY_CRNCY_ID : 
                 i === (request.NO_OF_PAYMENTS - 1) ? request.LAST_PAY_CRNCY_ID :
                 request.REGULAR_PAY_CRNCY_ID,
        status: currentDate <= new Date() ? 'Due' : 'Upcoming'
      });

      // Stop if we have processed all payments
      if (request.NO_OF_PAYMENTS > 0 && i >= request.NO_OF_PAYMENTS - 1) {
        break;
      }

      // Stop if past expiry date
      if (request.EXPIRY_DT && currentDate > request.EXPIRY_DT) {
        break;
      }

      // Calculate next date based on frequency
      switch (request.PAY_FREQ_CD) {
        case 'DAILY':
          currentDate.setDate(currentDate.getDate() + request.PAY_FREQ_VALUE);
          break;
        case 'WEEKLY':
          currentDate.setDate(currentDate.getDate() + (7 * request.PAY_FREQ_VALUE));
          break;
        case 'MONTHLY':
          currentDate.setMonth(currentDate.getMonth() + request.PAY_FREQ_VALUE);
          break;
        case 'QUARTERLY':
          currentDate.setMonth(currentDate.getMonth() + (3 * request.PAY_FREQ_VALUE));
          break;
        case 'YEARLY':
          currentDate.setFullYear(currentDate.getFullYear() + request.PAY_FREQ_VALUE);
          break;
        default:
          currentDate.setMonth(currentDate.getMonth() + 1); // Default to monthly
      }
    }

    return {
      requestId: request.DIRECT_DR_REQ_ID,
      totalPayments: request.NO_OF_PAYMENTS || 'Unlimited',
      nextRequestDate: request.NEXT_REQ_DT,
      expiryDate: request.EXPIRY_DT,
      requestSchedule: requestSchedule
    };
  }

  // Static method: Process request (create actual direct debit)
  static async processRequest(requestId, userId) {
    const request = await this.findByPk(requestId);
    
    if (!request) {
      throw new Error('Direct debit request not found');
    }

    if (request.REC_ST !== 'A') {
      throw new Error('Direct debit request is not active');
    }

    const now = new Date();
    if (request.NEXT_REQ_DT > now) {
      throw new Error('Request is not due yet');
    }

    if (request.EXPIRY_DT && request.EXPIRY_DT < now) {
      throw new Error('Direct debit request has expired');
    }

    // Determine payment amount
    let paymentAmount;
    let paymentCurrency;
    let isFirstPayment = false;
    let isLastPayment = false;

    // Check if this is the first payment
    if (request.FIRST_PAY_AMT && request.NEXT_REQ_DT.toDateString() === request.CREATE_DT.toDateString()) {
      paymentAmount = parseFloat(request.FIRST_PAY_AMT);
      paymentCurrency = request.FIRST_PAY_CRNCY_ID;
      isFirstPayment = true;
    } 
    // Check if this is the last payment (if NO_OF_PAYMENTS is set)
    else if (request.NO_OF_PAYMENTS > 0 && request.LAST_PAY_AMT) {
      // This is a simplified check - in reality, you'd track how many payments have been made
      paymentAmount = parseFloat(request.LAST_PAY_AMT);
      paymentCurrency = request.LAST_PAY_CRNCY_ID;
      isLastPayment = true;
    } 
    // Regular payment
    else {
      paymentAmount = parseFloat(request.REGULAR_PAY_AMT) || 0;
      paymentCurrency = request.REGULAR_PAY_CRNCY_ID;
    }

    if (paymentAmount <= 0) {
      throw new Error('Invalid payment amount');
    }

    // Calculate next request date
    let nextRequestDate = new Date(request.NEXT_REQ_DT);
    switch (request.PAY_FREQ_CD) {
      case 'DAILY':
        nextRequestDate.setDate(nextRequestDate.getDate() + request.PAY_FREQ_VALUE);
        break;
      case 'WEEKLY':
        nextRequestDate.setDate(nextRequestDate.getDate() + (7 * request.PAY_FREQ_VALUE));
        break;
      case 'MONTHLY':
        nextRequestDate.setMonth(nextRequestDate.getMonth() + request.PAY_FREQ_VALUE);
        break;
      case 'QUARTERLY':
        nextRequestDate.setMonth(nextRequestDate.getMonth() + (3 * request.PAY_FREQ_VALUE));
        break;
      case 'YEARLY':
        nextRequestDate.setFullYear(nextRequestDate.getFullYear() + request.PAY_FREQ_VALUE);
        break;
      default:
        nextRequestDate.setMonth(nextRequestDate.getMonth() + 1);
    }

    // If this was the last payment, deactivate the request
    let newStatus = request.REC_ST;
    if (isLastPayment) {
      newStatus = 'I'; // Inactive
    }

    // Update request record
    await request.update({
      NEXT_REQ_DT: nextRequestDate,
      ROW_TS: now,
      REC_ST: newStatus,
      VERSION_NO: request.VERSION_NO + 1
    });

    return {
      success: true,
      requestId: request.DIRECT_DR_REQ_ID,
      paymentAmount: paymentAmount,
      paymentCurrency: paymentCurrency,
      fromAccountId: request.FROM_ACCT_ID,
      payeeAccount: request.PAYEE_ACCT_NO,
      payeeName: request.PAYEE_NM,
      bankName: request.BANK_NM,
      branchName: request.BRANCH_NM,
      processedDate: now,
      nextRequestDate: nextRequestDate,
      isFirstPayment: isFirstPayment,
      isLastPayment: isLastPayment,
      statusAfterProcessing: newStatus
    };
  }

  // Static method: Create direct debit from request
  static async createDirectDebitFromRequest(requestId, userId) {
    const request = await this.findByPk(requestId);
    
    if (!request) {
      throw new Error('Direct debit request not found');
    }

    const processResult = await this.processRequest(requestId, userId);
    
    if (!processResult.success) {
      throw new Error('Failed to process request');
    }

    // Here you would create an actual DirectDebit record
    // This is a placeholder for the actual implementation
    const directDebitData = {
      DIRECT_DR_ID: `DD_${request.DIRECT_DR_REQ_ID}_${Date.now()}`,
      FROM_DEPOSIT_ACCT_NO: request.FROM_ACCT_ID.toString(),
      DIRECT_DR_DESC: request.DIRECT_DR_REQ_DESC || `Direct debit from request ${request.DIRECT_DR_REQ_ID}`,
      DIRECT_DR_MANDATE_TY_CD: request.DIRECT_DR_MANDATE_TY_CD,
      XFER_MTHD_CD: 'STANDING', // Default transfer method
      PAY_CRNCY_ID: processResult.paymentCurrency,
      PAY_AMT: processResult.paymentAmount,
      TO_DEPOSIT_ACCT_NO: request.PAYEE_ACCT_NO,
      MAX_PAY_AMT: processResult.paymentAmount, // Same as payment amount for requests
      SCHED_TY_CD: request.SCHED_TY_CD,
      NEXT_PAY_DT: request.NEXT_REQ_DT,
      NO_OF_PAYMENTS: 1, // Single payment for this request
      PAY_FREQ_CD: 'ONCE', // One-time payment
      PAY_FREQ_VALUE: 0,
      EXPIRY_DT: request.EXPIRY_DT,
      NON_BUS_DUE_DT_OPTN_CD: request.NON_BUS_DT_OPTN_CD,
      REF_TXT: `Request: ${request.DIRECT_DR_REQ_ID}`,
      SUPPLEMENTARY_REF_TXT: request.SUPPLEMENTARY_INSTR,
      PAY_RSN_ID: 1, // Default payment reason
      SVCE_PROVIDER_ID: request.BANK_CD,
      BENEFICIARY_ID: request.PAYEE_ACCT_ID || request.PAYEE_ACCT_NO,
      SUPPLEMENTARY_INSTRUCTION: request.SUPPLEMENTARY_INSTR,
      REC_ST: 'Y',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      USER_ID: userId,
      CREATE_DT: new Date(),
      CREATED_BY: userId,
      SYS_CREATE_TS: new Date()
    };

    return {
      requestProcessed: processResult,
      directDebitData: directDebitData,
      message: 'Direct debit created successfully from request'
    };
  }

  // Instance method: Get request details
  getRequestDetails() {
    return {
      requestId: this.DIRECT_DR_REQ_ID,
      description: this.DIRECT_DR_REQ_DESC,
      accounts: {
        fromAccountId: this.FROM_ACCT_ID,
        payeeAccountNumber: this.PAYEE_ACCT_NO,
        payeeAccountId: this.PAYEE_ACCT_ID,
        payeeName: this.PAYEE_NM
      },
      mandate: {
        mandateType: this.DIRECT_DR_MANDATE_TY_CD,
        scheduleType: this.SCHED_TY_CD,
        requestMethod: this.REQUEST_MTHD_CD
      },
      paymentDetails: {
        firstPayment: {
          currency: this.FIRST_PAY_CRNCY_ID,
          amount: parseFloat(this.FIRST_PAY_AMT) || null
        },
        regularPayment: {
          currency: this.REGULAR_PAY_CRNCY_ID,
          amount: parseFloat(this.REGULAR_PAY_AMT) || null
        },
        lastPayment: {
          currency: this.LAST_PAY_CRNCY_ID,
          amount: parseFloat(this.LAST_PAY_AMT) || null
        }
      },
      schedule: {
        nextRequestDate: this.NEXT_REQ_DT,
        numberOfPayments: this.NO_OF_PAYMENTS,
        paymentFrequency: this.PAY_FREQ_CD,
        paymentFrequencyValue: this.PAY_FREQ_VALUE,
        expiryDate: this.EXPIRY_DT,
        nonBusinessDayOption: this.NON_BUS_DT_OPTN_CD
      },
      bankDetails: {
        bicId: this.BIC_ID,
        bankCode: this.BANK_CD,
        bankName: this.BANK_NM,
        branchName: this.BRANCH_NM,
        branchCity: this.BRANCH_CITY,
        branchCountryId: this.BRANCH_CNTRY_ID
      },
      instructions: {
        supplementaryInstruction: this.SUPPLEMENTARY_INSTR
      },
      status: {
        recordStatus: this.REC_ST,
        version: this.VERSION_NO,
        isActive: this.REC_ST === 'A',
        isPending: this.REC_ST === 'P',
        isInactive: this.REC_ST === 'I',
        isExpired: this.EXPIRY_DT && new Date(this.EXPIRY_DT) < new Date()
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

  // Instance method: Check if request is due
  isRequestDue(date = new Date()) {
    return (
      (this.REC_ST === 'A' || this.REC_ST === 'P') &&
      new Date(this.NEXT_REQ_DT) <= date &&
      (!this.EXPIRY_DT || new Date(this.EXPIRY_DT) >= date)
    );
  }

  // Instance method: Validate request for processing
  validateForProcessing() {
    const errors = [];
    
    if (this.REC_ST !== 'A' && this.REC_ST !== 'P') {
      errors.push('Request status must be Active or Pending');
    }
    
    if (!this.NEXT_REQ_DT) {
      errors.push('Next request date is required');
    }
    
    if (this.EXPIRY_DT && new Date(this.EXPIRY_DT) < new Date()) {
      errors.push('Request has expired');
    }
    
    // Check if any payment amount is set
    if (!this.FIRST_PAY_AMT && !this.REGULAR_PAY_AMT && !this.LAST_PAY_AMT) {
      errors.push('At least one payment amount must be specified');
    }
    
    // Check required bank details
    if (!this.BANK_CD || !this.BANK_NM || !this.BRANCH_NM) {
      errors.push('Bank code, name, and branch name are required');
    }
    
    // Check payee details
    if (!this.PAYEE_NM || !this.PAYEE_ACCT_NO) {
      errors.push('Payee name and account number are required');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Instance method: Get formatted payment amount
  getFormattedPaymentAmount(paymentType = 'regular') {
    let amount;
    let currency;
    
    switch (paymentType.toLowerCase()) {
      case 'first':
        amount = parseFloat(this.FIRST_PAY_AMT);
        currency = this.FIRST_PAY_CRNCY_ID;
        break;
      case 'last':
        amount = parseFloat(this.LAST_PAY_AMT);
        currency = this.LAST_PAY_CRNCY_ID;
        break;
      case 'regular':
      default:
        amount = parseFloat(this.REGULAR_PAY_AMT);
        currency = this.REGULAR_PAY_CRNCY_ID;
        break;
    }
    
    if (!amount || isNaN(amount)) return 'N/A';
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  }

  // Instance method: Get frequency description
  getFrequencyDescription() {
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

  // Virtual getter: Days until next request
  get daysUntilNextRequest() {
    const today = new Date();
    const nextRequest = new Date(this.NEXT_REQ_DT);
    const diffTime = nextRequest - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Virtual getter: Is active?
  get isActive() {
    return this.REC_ST === 'A';
  }

  // Virtual getter: Is pending?
  get isPending() {
    return this.REC_ST === 'P';
  }

  // Virtual getter: Has expired?
  get hasExpired() {
    return this.EXPIRY_DT && new Date(this.EXPIRY_DT) < new Date();
  }

  // Virtual getter: Current payment amount
  get currentPaymentAmount() {
    const now = new Date();
    const createDate = new Date(this.CREATE_DT);
    
    // If it's the first payment date
    if (this.FIRST_PAY_AMT && now.toDateString() === createDate.toDateString()) {
      return parseFloat(this.FIRST_PAY_AMT);
    }
    
    // Otherwise return regular payment amount
    return parseFloat(this.REGULAR_PAY_AMT) || 0;
  }

  // Virtual getter: Current payment currency
  get currentPaymentCurrency() {
    const now = new Date();
    const createDate = new Date(this.CREATE_DT);
    
    // If it's the first payment date
    if (this.FIRST_PAY_CRNCY_ID && now.toDateString() === createDate.toDateString()) {
      return this.FIRST_PAY_CRNCY_ID;
    }
    
    // Otherwise return regular payment currency
    return this.REGULAR_PAY_CRNCY_ID || 'USD';
  }
}

DirectDebitRequest.init({
  // Primary key
  DIRECT_DR_REQ_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: 'Direct debit request identifier'
  },

  DIRECT_DR_REQ_DESC: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Direct debit request description'
  },

  FROM_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Source account identifier'
  },

  DIRECT_DR_MANDATE_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Direct debit mandate type code'
  },

  SCHED_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Schedule type code'
  },

  FIRST_PAY_CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: true,
    comment: 'First payment currency code'
  },

  LAST_PAY_CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: true,
    comment: 'Last payment currency code'
  },

  REGULAR_PAY_CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: true,
    comment: 'Regular payment currency code'
  },

  FIRST_PAY_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'First payment amount'
  },

  REGULAR_PAY_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Regular payment amount'
  },

  LAST_PAY_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Last payment amount'
  },

  NEXT_REQ_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Next request date'
  },

  NO_OF_PAYMENTS: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Number of payments (0 for unlimited)',
    validate: {
      min: {
        args: [0],
        msg: 'Number of payments cannot be negative'
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
    defaultValue: 0,
    comment: 'Payment frequency value',
    validate: {
      min: {
        args: [0],
        msg: 'Payment frequency value cannot be negative'
      }
    }
  },

  EXPIRY_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Expiry date'
  },

  NON_BUS_DT_OPTN_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Non-business day option code'
  },

  REQUEST_MTHD_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Request method code'
  },

  BIC_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'BIC identifier'
  },

  BANK_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Bank code'
  },

  BANK_NM: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Bank name'
  },

  BRANCH_NM: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Branch name'
  },

  BRANCH_CITY: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Branch city'
  },

  BRANCH_CNTRY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Branch country identifier'
  },

  SUPPLEMENTARY_INSTR: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Supplementary instruction'
  },

  PAYEE_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Payee name'
  },

  PAYEE_ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: false,
    comment: 'Payee account number'
  },

  PAYEE_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Payee account identifier'
  },

  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: false,
    validate: {
      isIn: [['A', 'I', 'P']] // A=Active, I=Inactive, P=Pending
    },
    comment: 'Record status'
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

  // Sequelize timestamps (mapped to existing fields)
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'ROW_TS',
    defaultValue: DataTypes.NOW
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'SYS_CREATE_TS',
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DirectDebitRequest',
  tableName: 'direct_debit_request',
  timestamps: true,
  hooks: {
    beforeValidate: (request) => {
      // Trim string fields
      const stringFields = [
        'DIRECT_DR_REQ_DESC', 'DIRECT_DR_MANDATE_TY_CD', 'SCHED_TY_CD',
        'FIRST_PAY_CRNCY_ID', 'LAST_PAY_CRNCY_ID', 'REGULAR_PAY_CRNCY_ID',
        'PAY_FREQ_CD', 'NON_BUS_DT_OPTN_CD', 'REQUEST_MTHD_CD',
        'BANK_CD', 'BANK_NM', 'BRANCH_NM', 'BRANCH_CITY',
        'SUPPLEMENTARY_INSTR', 'PAYEE_NM', 'PAYEE_ACCT_NO',
        'USER_ID', 'CREATED_BY'
      ];
      
      stringFields.forEach(field => {
        if (request[field]) {
          request[field] = request[field].toString().trim();
        }
      });

      // Ensure uppercase for certain fields
      if (request.REC_ST) request.REC_ST = request.REC_ST.toUpperCase();
      if (request.FIRST_PAY_CRNCY_ID) request.FIRST_PAY_CRNCY_ID = request.FIRST_PAY_CRNCY_ID.toUpperCase();
      if (request.LAST_PAY_CRNCY_ID) request.LAST_PAY_CRNCY_ID = request.LAST_PAY_CRNCY_ID.toUpperCase();
      if (request.REGULAR_PAY_CRNCY_ID) request.REGULAR_PAY_CRNCY_ID = request.REGULAR_PAY_CRNCY_ID.toUpperCase();
      if (request.PAY_FREQ_CD) request.PAY_FREQ_CD = request.PAY_FREQ_CD.toUpperCase();
      if (request.SCHED_TY_CD) request.SCHED_TY_CD = request.SCHED_TY_CD.toUpperCase();
      if (request.DIRECT_DR_MANDATE_TY_CD) request.DIRECT_DR_MANDATE_TY_CD = request.DIRECT_DR_MANDATE_TY_CD.toUpperCase();
      if (request.BANK_CD) request.BANK_CD = request.BANK_CD.toUpperCase();

      // Validate currency codes
      const currencyFields = ['FIRST_PAY_CRNCY_ID', 'LAST_PAY_CRNCY_ID', 'REGULAR_PAY_CRNCY_ID'];
      currencyFields.forEach(field => {
        if (request[field] && request[field].length !== 3) {
          throw new Error(`${field} must be a 3-character currency code`);
        }
      });
    },
    
    beforeCreate: (request) => {
      // Set timestamps if not provided
      const now = new Date();
      if (!request.CREATE_DT) request.CREATE_DT = now;
      if (!request.SYS_CREATE_TS) request.SYS_CREATE_TS = now;
      if (!request.ROW_TS) request.ROW_TS = now;
      
      // Validate dates
      if (request.NEXT_REQ_DT) {
        if (request.NEXT_REQ_DT < now) {
          throw new Error('NEXT_REQ_DT cannot be in the past for new requests');
        }
        
        if (request.EXPIRY_DT && request.NEXT_REQ_DT > request.EXPIRY_DT) {
          throw new Error('NEXT_REQ_DT cannot be after EXPIRY_DT');
        }
      }
      
      // Set default REC_ST if not provided
      if (!request.REC_ST) request.REC_ST = 'P'; // Default to Pending
      
      // Validate that at least one payment amount is set
      if (!request.FIRST_PAY_AMT && !request.REGULAR_PAY_AMT && !request.LAST_PAY_AMT) {
        throw new Error('At least one payment amount (FIRST_PAY_AMT, REGULAR_PAY_AMT, or LAST_PAY_AMT) must be specified');
      }
      
      // Validate frequency codes
      const validFrequencies = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'BIWEEKLY', 'BIMONTHLY'];
      if (request.PAY_FREQ_CD && !validFrequencies.includes(request.PAY_FREQ_CD.toUpperCase())) {
        throw new Error(`Invalid PAY_FREQ_CD: ${request.PAY_FREQ_CD}. Must be one of: ${validFrequencies.join(', ')}`);
      }
    },
    
    beforeUpdate: (request) => {
      // Update row timestamp
      request.ROW_TS = new Date();
      
      // Increment version number on update
      if (request.changed() && !request.changed('VERSION_NO')) {
        request.VERSION_NO = (request.VERSION_NO || 0) + 1;
      }
      
      // Validate that NEXT_REQ_DT is not updated to be after EXPIRY_DT
      if (request.changed('NEXT_REQ_DT') || request.changed('EXPIRY_DT')) {
        const nextRequestDate = request.NEXT_REQ_DT;
        const expiryDate = request.EXPIRY_DT;
        
        if (nextRequestDate && expiryDate && nextRequestDate > expiryDate) {
          throw new Error('NEXT_REQ_DT cannot be after EXPIRY_DT');
        }
      }
    }
  },
  indexes: [
    // Primary index
    { fields: ['DIRECT_DR_REQ_ID'], unique: true },
    
    // Account-related indexes
    { fields: ['FROM_ACCT_ID'] },
    { fields: ['PAYEE_ACCT_NO'] },
    { fields: ['PAYEE_ACCT_ID'] },
    { fields: ['FROM_ACCT_ID', 'PAYEE_ACCT_NO'] },
    
    // Payee indexes
    { fields: ['PAYEE_NM'] },
    { fields: ['PAYEE_NM', 'PAYEE_ACCT_NO'] },
    
    // Bank-related indexes
    { fields: ['BANK_CD'] },
    { fields: ['BANK_NM'] },
    { fields: ['BRANCH_NM'] },
    { fields: ['BANK_CD', 'BRANCH_NM'] },
    
    // Status indexes
    { fields: ['REC_ST'] },
    { fields: ['REC_ST', 'EXPIRY_DT'] },
    { fields: ['REC_ST', 'NEXT_REQ_DT'] },
    
    // Date indexes for scheduling
    { fields: ['NEXT_REQ_DT'] },
    { fields: ['EXPIRY_DT'] },
    { fields: ['NEXT_REQ_DT', 'EXPIRY_DT'] },
    { fields: ['CREATE_DT'] },
    { fields: ['REC_ST', 'NEXT_REQ_DT', 'EXPIRY_DT'] },
    
    // Payment-related indexes
    { fields: ['PAY_FREQ_CD'] },
    { fields: ['REGULAR_PAY_CRNCY_ID'] },
    { fields: ['FIRST_PAY_CRNCY_ID'] },
    { fields: ['LAST_PAY_CRNCY_ID'] },
    
    // Composite indexes for common queries
    { fields: ['FROM_ACCT_ID', 'REC_ST', 'NEXT_REQ_DT'] },
    { fields: ['PAYEE_ACCT_NO', 'REC_ST', 'EXPIRY_DT'] },
    { fields: ['BANK_CD', 'REC_ST', 'NEXT_REQ_DT'] },
    
    // User-related indexes
    { fields: ['USER_ID'] },
    { fields: ['CREATED_BY'] }
  ],
  scopes: {
    active: {
      where: { REC_ST: 'A' }
    },
    inactive: {
      where: { REC_ST: 'I' }
    },
    pending: {
      where: { REC_ST: 'P' }
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
        REC_ST: 'A',
        [Op.or]: [
          { EXPIRY_DT: null },
          { EXPIRY_DT: { [Op.gt]: new Date() } }
        ]
      }
    },
    dueForProcessing: {
      where: {
        REC_ST: { [Op.in]: ['A', 'P'] },
        NEXT_REQ_DT: {
          [Op.lte]: new Date()
        },
        [Op.or]: [
          { EXPIRY_DT: null },
          { EXPIRY_DT: { [Op.gt]: new Date() } }
        ]
      }
    },
    bySourceAccount: (accountId) => ({
      where: { FROM_ACCT_ID: accountId }
    }),
    byPayeeAccount: (accountNumber) => ({
      where: { PAYEE_ACCT_NO: accountNumber }
    }),
    byPayeeName: (payeeName) => ({
      where: {
        PAYEE_NM: {
          [Op.like]: `%${payeeName}%`
        }
      }
    }),
    byBank: (bankCode) => ({
      where: { BANK_CD: bankCode }
    }),
    byCurrency: (currency) => ({
      where: {
        [Op.or]: [
          { FIRST_PAY_CRNCY_ID: currency },
          { REGULAR_PAY_CRNCY_ID: currency },
          { LAST_PAY_CRNCY_ID: currency }
        ]
      }
    }),
    byFrequency: (frequency) => ({
      where: { PAY_FREQ_CD: frequency }
    }),
    withFirstPayment: {
      where: { FIRST_PAY_AMT: { [Op.ne]: null } }
    },
    withLastPayment: {
      where: { LAST_PAY_AMT: { [Op.ne]: null } }
    },
    unlimitedPayments: {
      where: { NO_OF_PAYMENTS: 0 }
    },
    limitedPayments: {
      where: { NO_OF_PAYMENTS: { [Op.gt]: 0 } }
    },
    dateRange: (startDate, endDate) => ({
      where: {
        CREATE_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    requestDateRange: (startDate, endDate) => ({
      where: {
        NEXT_REQ_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    sortedByNextRequest: {
      order: [['NEXT_REQ_DT', 'ASC']]
    },
    sortedByCreation: {
      order: [['CREATE_DT', 'DESC']]
    },
    sortedByAmount: {
      order: [[sequelize.literal('COALESCE(REGULAR_PAY_AMT, FIRST_PAY_AMT, LAST_PAY_AMT)'), 'DESC']]
    },
    highValue: {
      where: {
        [Op.or]: [
          { REGULAR_PAY_AMT: { [Op.gte]: 10000 } },
          { FIRST_PAY_AMT: { [Op.gte]: 10000 } },
          { LAST_PAY_AMT: { [Op.gte]: 10000 } }
        ]
      }
    },
    withPagination: (page, pageSize) => ({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }
});

export default DirectDebitRequest;
