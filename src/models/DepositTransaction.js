// models/DepositTransaction.js - COMPLETE WITH FIXED FIELD MAPPINGS
import { DataTypes, Model, Op } from 'sequelize';
import { sequelize } from '../../config/db.js'; // FIXED: Using named import

// Helper function to validate GL account number format
const isValidGLAcctNo = (glAcctNo) => {
  const regex = /^(\d{1,3}-){5}\d{1,3}$/;
  return regex.test(glAcctNo);
};

// Helper function to calculate amount from denominations
const calculateAmountFromDenominations = (currencyCount) => {
  const {
    OneThousandNaira = 0,
    FiveHundredNaira = 0,
    TwoHundredNaira = 0,
    OneHundredNaira = 0,
    FiftyNaira = 0,
    TwentyNaira = 0,
    TenNaira = 0,
    FiveNaira = 0
  } = currencyCount;

  return (
    OneThousandNaira * 1000 +
    FiveHundredNaira * 500 +
    TwoHundredNaira * 200 +
    OneHundredNaira * 100 +
    FiftyNaira * 50 +
    TwentyNaira * 20 +
    TenNaira * 10 +
    FiveNaira * 5
  );
};

class DepositTransaction extends Model {
  // Static method: Get transactions by account number
  static async findByAccountNumber(accountNumber, options = {}) {
    const defaultOptions = {
      where: { ACCT_NO: accountNumber },
      order: [['TRANSACTION_DATE', 'DESC']],
      limit: options.limit || 50
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get transactions by customer ID
  static async findByCustomerId(customerId, options = {}) {
    const defaultOptions = {
      where: { CUST_ID: customerId },
      order: [['TRANSACTION_DATE', 'DESC']],
      limit: options.limit || 50
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get transactions by teller ID
  static async findByTellerId(tellerId, options = {}) {
    const defaultOptions = {
      where: { tellerId: tellerId },
      order: [['TRANSACTION_DATE', 'DESC']],
      limit: options.limit || 50
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get transactions by reference number
  static async findByReferenceNumber(refNo, options = {}) {
    return this.findOne({
      where: { TRANSACTION_REF_NO: refNo },
      ...options
    });
  }

  // Static method: Get teller statistics
  static async getTellerStats(tellerId, responsibilityCentre, startDate, endDate) {
    const whereClause = {
      tellerId: tellerId,
      responsibility_centre: responsibilityCentre,
      transactionDate: {
        [Op.between]: [startDate, endDate]
      },
      STATUS: 'Approved'
    };

    const results = await this.findAll({
      where: whereClause,
      attributes: [
        'type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
      ],
      group: ['type'],
      raw: true
    });

    // Format results
    const stats = {
      deposit: { count: 0, totalAmount: 0 },
      withdrawal: { count: 0, totalAmount: 0 },
      transfer: { count: 0, totalAmount: 0 }
    };

    results.forEach(result => {
      if (result.type && stats[result.type]) {
        stats[result.type] = {
          count: parseInt(result.count) || 0,
          totalAmount: parseFloat(result.totalAmount) || 0
        };
      }
    });

    return stats;
  }

  // Static method: Get daily transaction summary
  static async getDailySummary(tellerId, responsibilityCentre, date) {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    const whereClause = {
      tellerId: tellerId,
      responsibility_centre: responsibilityCentre,
      transactionDate: {
        [Op.between]: [startDate, endDate]
      },
      STATUS: 'Approved'
    };

    const result = await this.findOne({
      where: whereClause,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
        [
          sequelize.fn('SUM',
            sequelize.literal(`CASE WHEN type = 'deposit' THEN AMOUNT ELSE 0 END`)
          ),
          'totalDeposits'
        ],
        [
          sequelize.fn('SUM',
            sequelize.literal(`CASE WHEN type = 'withdrawal' THEN AMOUNT ELSE 0 END`)
          ),
          'totalWithdrawals'
        ],
        [
          sequelize.fn('SUM',
            sequelize.literal(`CASE WHEN type = 'transfer' THEN AMOUNT ELSE 0 END`)
          ),
          'totalTransfers'
        ]
      ],
      raw: true
    });

    return {
      totalTransactions: parseInt(result?.totalTransactions) || 0,
      totalDeposits: parseFloat(result?.totalDeposits) || 0,
      totalWithdrawals: parseFloat(result?.totalWithdrawals) || 0,
      totalTransfers: parseFloat(result?.totalTransfers) || 0
    };
  }

  // Static method: Get pending transactions
  static async getPendingTransactions(options = {}) {
    const defaultOptions = {
      where: { STATUS: 'Pending' },
      order: [['TRANSACTION_DATE', 'ASC']],
      limit: options.limit || 100
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Approve transaction
  static async approveTransaction(transactionId, approvedBy) {
    const transaction = await this.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.STATUS !== 'Pending') {
      throw new Error(`Transaction is already ${transaction.STATUS}`);
    }
    
    return transaction.update({
      STATUS: 'Approved',
      APPROVED_BY: approvedBy,
      APPROVED_DATE: new Date(),
      REC_ST: 'Active'
    });
  }

  // Static method: Reject transaction
  static async rejectTransaction(transactionId, rejectedBy, reason = '') {
    const transaction = await this.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.STATUS !== 'Pending') {
      throw new Error(`Transaction is already ${transaction.STATUS}`);
    }
    
    return transaction.update({
      STATUS: 'Rejected',
      REJECTED_BY: rejectedBy,
      REJECTED_DATE: new Date(),
      REC_ST: 'Inactive',
      DESCRIPTION: reason ? `${transaction.DESCRIPTION || ''} | Rejected: ${reason}`.trim() : transaction.DESCRIPTION
    });
  }

  // Static method: Get transaction summary by date range
  static async getTransactionSummary(startDate, endDate, options = {}) {
    const whereClause = {
      transactionDate: {
        [Op.between]: [startDate, endDate]
      },
      ...options.where
    };

    const results = await this.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('transactionDate')), 'date'],
        'type',
        'responsibility_centre',
        [sequelize.fn('COUNT', sequelize.col('id')), 'transactionCount'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
      ],
      group: [
        sequelize.fn('DATE', sequelize.col('transactionDate')),
        'type',
        'responsibility_centre'
      ],
      order: [
        [sequelize.fn('DATE', sequelize.col('transactionDate')), 'DESC'],
        ['type', 'ASC']
      ],
      raw: true
    });

    return results.map(result => ({
      date: result.date,
      type: result.type,
      responsibility_centre: result.responsibility_centre,
      transactionCount: parseInt(result.transactionCount) || 0,
      totalAmount: parseFloat(result.totalAmount) || 0
    }));
  }

  // Instance method: Get transaction details
  getTransactionDetails() {
    const currencyCount = this.CURRENCY_COUNT || {};
    
    return {
      transactionId: this.id,
      accountInfo: {
        accountId: this.ACCT_ID,
        accountNumber: this.ACCT_NO,
        accountName: this.ACCT_NM,
        customerId: this.CUST_ID,
        depositorName: this.DEPOSITOR_NAME
      },
      transactionInfo: {
        type: this.type || this.TRANSACTION_TYPE?.toLowerCase(),
        originalType: this.TRANSACTION_TYPE,
        amount: parseFloat(this.AMOUNT),
        referenceNumber: this.TRANSACTION_REF_NO,
        glAccountNumber: this.GL_ACCT_NO,
        businessUnit: this.BUSINESS_UNIT,
        description: this.DESCRIPTION
      },
      currencyDenominations: {
        oneThousandNaira: currencyCount.OneThousandNaira || 0,
        fiveHundredNaira: currencyCount.FiveHundredNaira || 0,
        twoHundredNaira: currencyCount.TwoHundredNaira || 0,
        oneHundredNaira: currencyCount.OneHundredNaira || 0,
        fiftyNaira: currencyCount.FiftyNaira || 0,
        twentyNaira: currencyCount.TwentyNaira || 0,
        tenNaira: currencyCount.TenNaira || 0,
        fiveNaira: currencyCount.FiveNaira || 0,
        totalNotes: currencyCount.TOTAL_CURRENCY_COUNT || 0
      },
      financialInfo: {
        balanceAfterTransaction: parseFloat(this.BALANCE_AFTER_TRANSACTION) || 0,
        glTransactionId: this.GL_TransactionId,
        queueTransactionId: this.QueueTransactionId
      },
      dates: {
        transactionDate: this.TRANSACTION_DATE,
        valueDate: this.VALUE_DATE,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        approvedDate: this.APPROVED_DATE,
        rejectedDate: this.REJECTED_DATE
      },
      statusInfo: {
        recordStatus: this.REC_ST,
        transactionStatus: this.STATUS,
        isApproved: this.STATUS === 'Approved',
        isPending: this.STATUS === 'Pending',
        isRejected: this.STATUS === 'Rejected'
      },
      personnelInfo: {
        userId: this.USER_ID,
        tellerId: this.tellerId,
        responsibilityCentre: this.responsibility_centre,
        approvedBy: this.APPROVED_BY,
        rejectedBy: this.REJECTED_BY
      }
    };
  }

  // Instance method: Validate currency denominations
  validateCurrencyDenominations() {
    if (!this.CURRENCY_COUNT) {
      return { isValid: true, calculatedAmount: 0 };
    }

    const calculatedAmount = calculateAmountFromDenominations(this.CURRENCY_COUNT);
    const transactionAmount = parseFloat(this.AMOUNT) || 0;

    return {
      isValid: Math.abs(calculatedAmount - transactionAmount) < 0.01, // Allow small floating point differences
      calculatedAmount: calculatedAmount,
      transactionAmount: transactionAmount,
      difference: Math.abs(calculatedAmount - transactionAmount)
    };
  }

  // Instance method: Update currency denominations
  updateCurrencyDenominations(denominations) {
    const currencyCount = {
      OneThousandNaira: denominations.oneThousandNaira || 0,
      FiveHundredNaira: denominations.fiveHundredNaira || 0,
      TwoHundredNaira: denominations.twoHundredNaira || 0,
      OneHundredNaira: denominations.oneHundredNaira || 0,
      FiftyNaira: denominations.fiftyNaira || 0,
      TwentyNaira: denominations.twentyNaira || 0,
      TenNaira: denominations.tenNaira || 0,
      FiveNaira: denominations.fiveNaira || 0,
      TOTAL_CURRENCY_COUNT: 0
    };

    // Calculate total count
    currencyCount.TOTAL_CURRENCY_COUNT = Object.values(currencyCount)
      .slice(0, 8) // Exclude TOTAL_CURRENCY_COUNT
      .reduce((sum, count) => sum + count, 0);

    this.CURRENCY_COUNT = currencyCount;
    
    // Update amount if not set
    if (!this.AMOUNT) {
      this.AMOUNT = calculateAmountFromDenominations(currencyCount);
      this.amount = this.AMOUNT;
    }

    return this;
  }

  // Instance method: Get formatted transaction
  getFormattedTransaction() {
    const details = this.getTransactionDetails();
    
    return {
      transactionRef: details.transactionInfo.referenceNumber,
      account: `${details.accountInfo.accountNumber} - ${details.accountInfo.accountName}`,
      type: details.transactionInfo.type.toUpperCase(),
      amount: details.transactionInfo.amount.toLocaleString('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2
      }),
      date: details.dates.transactionDate.toLocaleDateString('en-GB'),
      time: details.dates.transactionDate.toLocaleTimeString('en-GB'),
      status: details.statusInfo.transactionStatus,
      teller: details.personnelInfo.tellerId,
      branch: details.personnelInfo.responsibilityCentre
    };
  }

  // Instance method: Check if transaction is valid for processing
  isValidForProcessing() {
    const validation = this.validateCurrencyDenominations();
    
    return (
      this.STATUS === 'Pending' &&
      this.AMOUNT > 0 &&
      this.ACCT_NO &&
      this.GL_ACCT_NO &&
      isValidGLAcctNo(this.GL_ACCT_NO) &&
      this.TRANSACTION_REF_NO &&
      this.CUST_ID &&
      this.USER_ID &&
      this.tellerId &&
      this.responsibility_centre &&
      validation.isValid
    );
  }

  // Instance method: Get currency summary
  getCurrencySummary() {
    if (!this.CURRENCY_COUNT) {
      return {
        totalNotes: 0,
        denominations: [],
        breakdown: {}
      };
    }

    const cc = this.CURRENCY_COUNT;
    const denominations = [
      { name: '₦1000', value: 1000, count: cc.OneThousandNaira || 0 },
      { name: '₦500', value: 500, count: cc.FiveHundredNaira || 0 },
      { name: '₦200', value: 200, count: cc.TwoHundredNaira || 0 },
      { name: '₦100', value: 100, count: cc.OneHundredNaira || 0 },
      { name: '₦50', value: 50, count: cc.FiftyNaira || 0 },
      { name: '₦20', value: 20, count: cc.TwentyNaira || 0 },
      { name: '₦10', value: 10, count: cc.TenNaira || 0 },
      { name: '₦5', value: 5, count: cc.FiveNaira || 0 }
    ];

    const totalNotes = denominations.reduce((sum, d) => sum + d.count, 0);
    
    return {
      totalNotes: totalNotes,
      denominations: denominations.filter(d => d.count > 0),
      breakdown: denominations.reduce((acc, d) => {
        if (d.count > 0) {
          acc[d.name] = {
            count: d.count,
            amount: d.value * d.count
          };
        }
        return acc;
      }, {})
    };
  }

  // Virtual getter: Formatted amount
  get formattedAmount() {
    return parseFloat(this.AMOUNT).toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2
    });
  }

  // Virtual getter: Formatted balance
  get formattedBalance() {
    if (!this.BALANCE_AFTER_TRANSACTION) return 'N/A';
    return parseFloat(this.BALANCE_AFTER_TRANSACTION).toLocaleString('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2
    });
  }

  // Virtual getter: Is approved?
  get isApproved() {
    return this.STATUS === 'Approved';
  }

  // Virtual getter: Is pending?
  get isPending() {
    return this.STATUS === 'Pending';
  }

  // Virtual getter: Is rejected?
  get isRejected() {
    return this.STATUS === 'Rejected';
  }

  // Virtual getter: Transaction age in hours
  get transactionAge() {
    const now = new Date();
    const transactionTime = new Date(this.TRANSACTION_DATE || this.createdAt);
    const diffHours = Math.abs(now - transactionTime) / (1000 * 60 * 60);
    return Math.floor(diffHours);
  }
}

DepositTransaction.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Transaction identifier'
  },

  // Account information - FIXED FIELD MAPPINGS
  ACCT_ID: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'a_c_c_t__i_d',
    comment: 'Account identifier'
  },

  ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'a_c_c_t__n_o',
    comment: 'Account number'
  },

  ACCT_NM: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'a_c_c_t__n_m',
    comment: 'Account name'
  },

  GL_ACCT_NO: {
    type: DataTypes.STRING(25),
    allowNull: false,
    field: 'g_l__a_c_c_t__n_o',
    comment: 'GL account number (format: xx-xx-xx-xx-xx-xx)',
    validate: {
      isValidGLAccount(value) {
        if (!isValidGLAcctNo(value)) {
          throw new Error('Invalid GL_ACCT_NO format. It should be in the format xx-xx-xx-xx-xx-xx (e.g., 2-400-100-200-101-1)');
        }
      }
    }
  },

  TRANSACTION_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 't_r_a_n_s_a_c_t_i_o_n__t_y_p_e',
    comment: 'Transaction type',
    validate: {
      isIn: [['Deposit']]
    }
  },

  AMOUNT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Transaction amount',
    validate: {
      min: {
        args: [0],
        msg: 'Amount must be a positive number'
      }
    }
  },

  TRANSACTION_REF_NO: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 't_r_a_n_s_a_c_t_i_o_n__r_e_f__n_o',
    unique: true,
    comment: 'Transaction reference number'
  },

  BALANCE_AFTER_TRANSACTION: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'b_a_l_a_n_c_e__a_f_t_e_r__t_r_a_n_s_a_c_t_i_o_n',
    comment: 'Balance after transaction',
    validate: {
      min: {
        args: [0],
        msg: 'Balance cannot be negative'
      }
    }
  },

  VALUE_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'v_a_l_u_e__d_a_t_e',
    comment: 'Value date'
  },

  TRANSACTION_DATE: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 't_r_a_n_s_a_c_t_i_o_n__d_a_t_e',
    comment: 'Transaction date'
  },

  BUSINESS_UNIT: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'b_u_s_i_n_e_s_s__u_n_i_t',
    defaultValue: '001',
    comment: 'Business unit code'
  },

  DEPOSITOR_NAME: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'd_e_p_o_s_i_t_o_r__n_a_m_e',
    comment: 'Depositor name'
  },

  // Currency count as JSON field
  CURRENCY_COUNT: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'c_u_r_r_e_n_c_y__c_o_u_n_t',
    defaultValue: () => ({
      OneThousandNaira: 0,
      FiveHundredNaira: 0,
      TwoHundredNaira: 0,
      OneHundredNaira: 0,
      FiftyNaira: 0,
      TwentyNaira: 0,
      TenNaira: 0,
      FiveNaira: 0,
      TOTAL_CURRENCY_COUNT: 0
    }),
    comment: 'Currency denomination counts'
  },

  REC_ST: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 'r_e_c__s_t',
    defaultValue: 'Pending',
    validate: {
      isIn: [['Pending', 'Active', 'Inactive']]
    },
    comment: 'Record status'
  },

  STATUS: {
    type: DataTypes.STRING(10),
    allowNull: false,
    field: 's_t_a_t_u_s',
    defaultValue: 'Pending',
    validate: {
      isIn: [['Pending', 'Approved', 'Rejected']]
    },
    comment: 'Transaction status'
  },

  DESCRIPTION: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'd_e_s_c_r_i_p_t_i_o_n',
    comment: 'Transaction description'
  },

  CUST_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'c_u_s_t__i_d',
    comment: 'Customer identifier'
  },

  USER_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'u_s_e_r__i_d',
    comment: 'User identifier'
  },

  APPROVED_BY: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__b_y',
    comment: 'Approved by user'
  },

  APPROVED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'a_p_p_r_o_v_e_d__d_a_t_e',
    comment: 'Approval date'
  },

  REJECTED_BY: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'r_e_j_e_c_t_e_d__b_y',
    comment: 'Rejected by user'
  },

  REJECTED_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'r_e_j_e_c_t_e_d__d_a_t_e',
    comment: 'Rejection date'
  },

  GL_TransactionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'g_l__transaction_id',
    comment: 'GL transaction identifier'
  },

  QueueTransactionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'queue_transaction_id',
    comment: 'Queue transaction identifier'
  },

  // Teller dashboard fields
  tellerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Teller identifier'
  },

  responsibility_centre: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Responsibility centre/branch'
  },

  type: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['deposit', 'withdrawal', 'transfer']]
    },
    comment: 'Transaction type for dashboard'
  },

  // Alias field for AMOUNT
  amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Transaction amount (alias)',
    validate: {
      min: {
        args: [0],
        msg: 'Amount must be a positive number'
      }
    }
  },

  // Alias field for TRANSACTION_DATE
  transactionDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Transaction date (alias)'
  },

  // Sequelize timestamps
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DepositTransaction',
  tableName: 'deposit_transaction',
  timestamps: true,
  hooks: {
    beforeValidate: (transaction) => {
      // Trim string fields
      const stringFields = [
        'ACCT_ID', 'ACCT_NO', 'ACCT_NM', 'GL_ACCT_NO',
        'TRANSACTION_TYPE', 'TRANSACTION_REF_NO', 'BUSINESS_UNIT',
        'DEPOSITOR_NAME', 'DESCRIPTION', 'CUST_ID', 'USER_ID',
        'APPROVED_BY', 'REJECTED_BY', 'responsibility_centre'
      ];
      
      stringFields.forEach(field => {
        if (transaction[field]) {
          transaction[field] = transaction[field].toString().trim();
        }
      });

      // Sync amount fields
      if (transaction.AMOUNT !== undefined && transaction.amount !== transaction.AMOUNT) {
        transaction.amount = transaction.AMOUNT;
      } else if (transaction.amount !== undefined && transaction.AMOUNT !== transaction.amount) {
        transaction.AMOUNT = transaction.amount;
      }

      // Sync date fields
      if (transaction.TRANSACTION_DATE !== undefined && transaction.transactionDate !== transaction.TRANSACTION_DATE) {
        transaction.transactionDate = transaction.TRANSACTION_DATE;
      } else if (transaction.transactionDate !== undefined && transaction.TRANSACTION_DATE !== transaction.transactionDate) {
        transaction.TRANSACTION_DATE = transaction.transactionDate;
      }

      // Set type from TRANSACTION_TYPE if not provided
      if (!transaction.type && transaction.TRANSACTION_TYPE) {
        transaction.type = transaction.TRANSACTION_TYPE.toLowerCase();
      }

      // Ensure uppercase for enum fields
      if (transaction.STATUS) transaction.STATUS = transaction.STATUS.charAt(0).toUpperCase() + transaction.STATUS.slice(1).toLowerCase();
      if (transaction.REC_ST) transaction.REC_ST = transaction.REC_ST.charAt(0).toUpperCase() + transaction.REC_ST.slice(1).toLowerCase();
      if (transaction.type) transaction.type = transaction.type.toLowerCase();
    },

    beforeCreate: (transaction) => {
      // Validate currency denominations
      if (transaction.CURRENCY_COUNT) {
        const calculatedAmount = calculateAmountFromDenominations(transaction.CURRENCY_COUNT);
        const transactionAmount = parseFloat(transaction.AMOUNT) || 0;

        // Update total count
        transaction.CURRENCY_COUNT.TOTAL_CURRENCY_COUNT = 
          (transaction.CURRENCY_COUNT.OneThousandNaira || 0) +
          (transaction.CURRENCY_COUNT.FiveHundredNaira || 0) +
          (transaction.CURRENCY_COUNT.TwoHundredNaira || 0) +
          (transaction.CURRENCY_COUNT.OneHundredNaira || 0) +
          (transaction.CURRENCY_COUNT.FiftyNaira || 0) +
          (transaction.CURRENCY_COUNT.TwentyNaira || 0) +
          (transaction.CURRENCY_COUNT.TenNaira || 0) +
          (transaction.CURRENCY_COUNT.FiveNaira || 0);

        // Validate amount matches
        if (Math.abs(calculatedAmount - transactionAmount) >= 0.01) {
          throw new Error(`AMOUNT (${transactionAmount}) must match the sum of currency denominations (${calculatedAmount})`);
        }
      }

      // Set default dates if not provided
      const now = new Date();
      if (!transaction.TRANSACTION_DATE) {
        transaction.TRANSACTION_DATE = now;
        transaction.transactionDate = now;
      }
      if (!transaction.VALUE_DATE) transaction.VALUE_DATE = now;

      // Ensure teller dashboard fields are set
      if (!transaction.tellerId) {
        throw new Error('tellerId is required');
      }
      if (!transaction.responsibility_centre) {
        throw new Error('responsibility_centre is required');
      }
      if (!transaction.type) {
        throw new Error('type is required');
      }
    },

    beforeUpdate: (transaction) => {
      // Validate currency denominations on update if changed
      if (transaction.changed('CURRENCY_COUNT') || transaction.changed('AMOUNT')) {
        if (transaction.CURRENCY_COUNT) {
          const calculatedAmount = calculateAmountFromDenominations(transaction.CURRENCY_COUNT);
          const transactionAmount = parseFloat(transaction.AMOUNT) || 0;

          if (Math.abs(calculatedAmount - transactionAmount) >= 0.01) {
            throw new Error(`AMOUNT (${transactionAmount}) must match the sum of currency denominations (${calculatedAmount})`);
          }
        }
      }

      // Handle status changes
      if (transaction.changed('STATUS')) {
        const now = new Date();
        
        if (transaction.STATUS === 'Approved' && !transaction.APPROVED_DATE) {
          transaction.APPROVED_DATE = now;
          transaction.REC_ST = 'Active';
        } else if (transaction.STATUS === 'Rejected' && !transaction.REJECTED_DATE) {
          transaction.REJECTED_DATE = now;
          transaction.REC_ST = 'Inactive';
        }
      }
    }
  },
  indexes: [
    // Primary index
    { fields: ['id'] },
    
    // Account-related indexes
    { fields: ['ACCT_NO'] },
    { fields: ['CUST_ID'] },
    { fields: ['ACCT_NO', 'TRANSACTION_DATE'] },
    { fields: ['CUST_ID', 'TRANSACTION_DATE'] },
    
    // Reference number index (unique)
    { fields: ['TRANSACTION_REF_NO'], unique: true },
    
    // Teller dashboard indexes
    { fields: ['tellerId'] },
    { fields: ['responsibility_centre'] },
    { fields: ['type'] },
    { fields: ['transactionDate'] },
    { fields: ['tellerId', 'responsibility_centre'] },
    { fields: ['tellerId', 'transactionDate'] },
    { fields: ['responsibility_centre', 'transactionDate'] },
    { fields: ['tellerId', 'responsibility_centre', 'transactionDate'] },
    { fields: ['responsibility_centre', 'transactionDate', 'type'] },
    
    // Status indexes
    { fields: ['STATUS'] },
    { fields: ['REC_ST'] },
    { fields: ['STATUS', 'TRANSACTION_DATE'] },
    
    // GL-related indexes
    { fields: ['GL_ACCT_NO'] },
    { fields: ['GL_TransactionId'] },
    { fields: ['QueueTransactionId'] },
    
    // Date range indexes
    { fields: ['TRANSACTION_DATE'] },
    { fields: ['VALUE_DATE'] },
    { fields: ['APPROVED_DATE'] },
    { fields: ['REJECTED_DATE'] },
    
    // Amount-based indexes
    { fields: ['AMOUNT'] },
    { fields: ['type', 'AMOUNT'] },
    
    // User-related indexes
    { fields: ['USER_ID'] },
    { fields: ['APPROVED_BY'] },
    { fields: ['REJECTED_BY'] }
  ],
  scopes: {
    // Status scopes
    pending: {
      where: { STATUS: 'Pending' }
    },
    approved: {
      where: { STATUS: 'Approved' }
    },
    rejected: {
      where: { STATUS: 'Rejected' }
    },
    active: {
      where: { REC_ST: 'Active' }
    },
    inactive: {
      where: { REC_ST: 'Inactive' }
    },
    
    // Type scopes
    deposits: {
      where: { type: 'deposit' }
    },
    withdrawals: {
      where: { type: 'withdrawal' }
    },
    transfers: {
      where: { type: 'transfer' }
    },
    
    // Account scopes
    byAccountNumber: (accountNumber) => ({
      where: { ACCT_NO: accountNumber }
    }),
    byCustomerId: (customerId) => ({
      where: { CUST_ID: customerId }
    }),
    byTellerId: (tellerId) => ({
      where: { tellerId: tellerId }
    }),
    byResponsibilityCentre: (centre) => ({
      where: { responsibility_centre: centre }
    }),
    
    // Date scopes
    byDateRange: (startDate, endDate) => ({
      where: {
        transactionDate: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    byValueDateRange: (startDate, endDate) => ({
      where: {
        VALUE_DATE: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    today: {
      where: {
        transactionDate: {
          [Op.gte]: new Date().setHours(0, 0, 0, 0)
        }
      }
    },
    thisWeek: {
      where: {
        transactionDate: {
          [Op.gte]: new Date(new Date() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    },
    thisMonth: {
      where: {
        transactionDate: {
          [Op.gte]: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    },
    
    // Amount scopes
    highValue: {
      where: { AMOUNT: { [Op.gte]: 1000000 } }
    },
    lowValue: {
      where: { AMOUNT: { [Op.lt]: 10000 } }
    },
    
    // Sorting scopes
    sortedByDate: {
      order: [['TRANSACTION_DATE', 'DESC']]
    },
    sortedByAmount: {
      order: [['AMOUNT', 'DESC']]
    },
    sortedByAccount: {
      order: [['ACCT_NO', 'ASC'], ['TRANSACTION_DATE', 'DESC']]
    },
    
    // Limit scopes
    limitResults: (limit) => ({
      limit: limit
    }),
    withPagination: (page, pageSize) => ({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }
});

export default DepositTransaction;