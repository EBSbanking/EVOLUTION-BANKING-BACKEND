// models/LoanRepaymentTransaction.js - UPDATED WITH FULL FEATURES
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

class LoanRepaymentTransaction extends Model {}

LoanRepaymentTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    a_c_c_t__i_d: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'a_c_c_t__i_d'  // Explicitly map to database column
    },
    a_c_c_t__n_o: {
      type: DataTypes.STRING(50),
      allowNull: false,
      trim: true,
      field: 'a_c_c_t__n_o'
    },
    c_u_s_t__i_d: {
      type: DataTypes.STRING(50),
      allowNull: false,
      trim: true,
      field: 'c_u_s_t__i_d'
    },
    t_r_a_n_s_a_c_t_i_o_n__d_a_t_e: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 't_r_a_n_s_a_c_t_i_o_n__d_a_t_e'
    },
    t_r_a_n_s_a_c_t_i_o_n__t_y_p_e: {
      type: DataTypes.ENUM('REPAYMENT', 'INTEREST', 'PENALTY'),
      allowNull: false,
      defaultValue: 'REPAYMENT',
      field: 't_r_a_n_s_a_c_t_i_o_n__t_y_p_e'
    },
    a_m_o_u_n_t: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0
      },
      field: 'a_m_o_u_n_t'
    },
    p_r_i_n_c_i_p_a_l__a_m_o_u_n_t: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0
      },
      field: 'p_r_i_n_c_i_p_a_l__a_m_o_u_n_t'
    },
    i_n_t_e_r_e_s_t__a_m_o_u_n_t: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        min: 0
      },
      field: 'i_n_t_e_r_e_s_t__a_m_o_u_n_t'
    },
    p_a_y_m_e_n_t__m_e_t_h_o_d: {
      type: DataTypes.ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY'),
      allowNull: false,
      defaultValue: 'CASH',
      field: 'p_a_y_m_e_n_t__m_e_t_h_o_d'
    },
    t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      trim: true,
      field: 't_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e'
    },
    r_e_p_a_y_m_e_n_t__t_y_p_e: {
      type: DataTypes.ENUM('INTEREST_FIRST', 'PRINCIPAL_FIRST', 'REPAYMENT', 'FULL_PAYMENT', 'PARTIAL_PAYMENT', 'LOAN'),
      defaultValue: 'REPAYMENT',
      field: 'r_e_p_a_y_m_e_n_t__t_y_p_e'
    },
    i_s__i_n_s_t_a_l_l_m_e_n_t: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'i_s__i_n_s_t_a_l_l_m_e_n_t'
    },
    c_r_e_a_t_e_d__b_y: {
      type: DataTypes.STRING(100),
      allowNull: false,
      trim: true,
      field: 'c_r_e_a_t_e_d__b_y'
    },
    s_t_a_t_u_s: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'),
      defaultValue: 'COMPLETED',
      field: 's_t_a_t_u_s'
    },
    r_e_c_e_i_p_t__n_o: {
      type: DataTypes.STRING(50),
      trim: true,
      field: 'r_e_c_e_i_p_t__n_o'
    },
    b_r_a_n_c_h__c_o_d_e: {
      type: DataTypes.STRING(10),
      defaultValue: '001',
      field: 'b_r_a_n_c_h__c_o_d_e'
    },
    p_r_o_d_u_c_t__c_o_d_e: {
      type: DataTypes.STRING(20),
      defaultValue: 'DEFAULT',
      field: 'p_r_o_d_u_c_t__c_o_d_e'
    },
    n_o_t_e_s: {
      type: DataTypes.TEXT,
      trim: true,
      field: 'n_o_t_e_s'
    },
    a_p_p_r_o_v_e_d__b_y: {
      type: DataTypes.STRING(100),
      trim: true,
      field: 'a_p_p_r_o_v_e_d__b_y'
    },
    a_p_p_r_o_v_a_l__d_a_t_e: {
      type: DataTypes.DATE,
      field: 'a_p_p_r_o_v_a_l__d_a_t_e'
    },
    r_e_v_e_r_s_a_l__t_r_a_n_s_a_c_t_i_o_n__i_d: {
      type: DataTypes.INTEGER,
      field: 'r_e_v_e_r_s_a_l__t_r_a_n_s_a_c_t_i_o_n__i_d'
    },
    i_s__r_e_v_e_r_s_e_d: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'i_s__r_e_v_e_r_s_e_d'
    },
    r_e_v_e_r_s_a_l__d_a_t_e: {
      type: DataTypes.DATE,
      field: 'r_e_v_e_r_s_a_l__d_a_t_e'
    },
    r_e_v_e_r_s_a_l__r_e_a_s_o_n: {
      type: DataTypes.TEXT,
      trim: true,
      field: 'r_e_v_e_r_s_a_l__r_e_a_s_o_n'
    },
    g_l__p_o_s_t_e_d: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'g_l__p_o_s_t_e_d'
    },
    g_l__p_o_s_t_i_n_g__d_a_t_e: {
      type: DataTypes.DATE,
      field: 'g_l__p_o_s_t_i_n_g__d_a_t_e'
    },
    g_l__t_r_a_n_s_a_c_t_i_o_n__i_d: {
      type: DataTypes.STRING(100),
      trim: true,
      field: 'g_l__t_r_a_n_s_a_c_t_i_o_n__i_d'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'LoanRepaymentTransaction',
    tableName: 'loan_repayment_transactions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    freezeTableName: true,
    indexes: [
      {
        name: 'idx_acct_no_transaction_date',
        fields: ['a_c_c_t__n_o', 't_r_a_n_s_a_c_t_i_o_n__d_a_t_e']
      },
      {
        name: 'idx_cust_id_transaction_date',
        fields: ['c_u_s_t__i_d', 't_r_a_n_s_a_c_t_i_o_n__d_a_t_e']
      },
      {
        name: 'idx_transaction_reference',
        fields: ['t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e'],
        unique: true
      },
      {
        name: 'idx_transaction_date',
        fields: ['t_r_a_n_s_a_c_t_i_o_n__d_a_t_e']
      },
      {
        name: 'idx_acct_id',
        fields: ['a_c_c_t__i_d']
      },
      {
        name: 'idx_status',
        fields: ['s_t_a_t_u_s']
      },
      {
        name: 'idx_branch_code',
        fields: ['b_r_a_n_c_h__c_o_d_e']
      },
      {
        name: 'idx_product_code',
        fields: ['p_r_o_d_u_c_t__c_o_d_e']
      },
      {
        name: 'idx_transaction_type',
        fields: ['t_r_a_n_s_a_c_t_i_o_n__t_y_p_e']
      },
      {
        name: 'idx_payment_method',
        fields: ['p_a_y_m_e_n_t__m_e_t_h_o_d']
      },
      {
        name: 'idx_receipt_no',
        fields: ['r_e_c_e_i_p_t__n_o']
      },
      {
        name: 'idx_created_by',
        fields: ['c_r_e_a_t_e_d__b_y']
      }
    ],
    hooks: {
      beforeCreate: async (transaction) => {
        // Generate TRANSACTION_REFERENCE if not provided
        if (!transaction.t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e || transaction.t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e.trim() === '') {
          const timestamp = Date.now();
          const random = Math.random().toString(36).substr(2, 9).toUpperCase();
          transaction.t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e = `TXN-${timestamp}-${random}`;
        }

        // Generate RECEIPT_NO if not provided and transaction is completed
        if (!transaction.r_e_c_e_i_p_t__n_o && transaction.s_t_a_t_u_s === 'COMPLETED') {
          const date = new Date();
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          transaction.r_e_c_e_i_p_t__n_o = `RCPT-${year}${month}${day}-${randomNum}`;
        }

        // Validate amount consistency
        const total = (parseFloat(transaction.p_r_i_n_c_i_p_a_l__a_m_o_u_n_t) || 0) + 
                      (parseFloat(transaction.i_n_t_e_r_e_s_t__a_m_o_u_n_t) || 0);
        const transactionAmount = parseFloat(transaction.a_m_o_u_n_t) || 0;
        
        if (Math.abs(total - transactionAmount) > 0.01) { // Allow small rounding differences
          throw new Error(`Transaction amount (${transactionAmount}) does not match principal + interest (${total})`);
        }
      },
      beforeUpdate: async (transaction) => {
        // Prevent modification of certain fields once transaction is completed
        if (transaction.s_t_a_t_u_s === 'COMPLETED' && transaction.changed('a_m_o_u_n_t')) {
          throw new Error('Cannot modify amount of a completed transaction');
        }

        // If reversing transaction, set reversal fields
        if (transaction.changed('s_t_a_t_u_s') && transaction.s_t_a_t_u_s === 'CANCELLED' && 
            transaction.previous('s_t_a_t_u_s') === 'COMPLETED') {
          transaction.i_s__r_e_v_e_r_s_e_d = true;
          transaction.r_e_v_e_r_s_a_l__d_a_t_e = new Date();
        }

        // Set approval date if approved
        if (transaction.changed('s_t_a_t_u_s') && transaction.s_t_a_t_u_s === 'COMPLETED' && 
            transaction.a_p_p_r_o_v_e_d__b_y && !transaction.a_p_p_r_o_v_a_l__d_a_t_e) {
          transaction.a_p_p_r_o_v_a_l__d_a_t_e = new Date();
        }
      }
    },
    getterMethods: {
      totalAmount() {
        const principal = parseFloat(this.p_r_i_n_c_i_p_a_l__a_m_o_u_n_t) || 0;
        const interest = parseFloat(this.i_n_t_e_r_e_s_t__a_m_o_u_n_t) || 0;
        return (principal + interest).toFixed(2);
      },
      transactionDateFormatted() {
        return this.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e.toISOString().split('T')[0];
      },
      isFullyPaid() {
        const amount = parseFloat(this.a_m_o_u_n_t) || 0;
        const principal = parseFloat(this.p_r_i_n_c_i_p_a_l__a_m_o_u_n_t) || 0;
        const interest = parseFloat(this.i_n_t_e_r_e_s_t__a_m_o_u_n_t) || 0;
        return Math.abs(amount - (principal + interest)) < 0.01;
      }
    }
  }
);

// ======================
// INSTANCE METHODS
// ======================

// Format transaction for response
LoanRepaymentTransaction.prototype.formatForResponse = function() {
  const response = {
    id: this.id,
    accountId: this.a_c_c_t__i_d,
    accountNumber: this.a_c_c_t__n_o,
    customerId: this.c_u_s_t__i_d,
    transactionDate: this.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e,
    transactionDateFormatted: this.transactionDateFormatted,
    transactionType: this.t_r_a_n_s_a_c_t_i_o_n__t_y_p_e,
    amount: parseFloat(this.a_m_o_u_n_t),
    principalAmount: parseFloat(this.p_r_i_n_c_i_p_a_l__a_m_o_u_n_t),
    interestAmount: parseFloat(this.i_n_t_e_r_e_s_t__a_m_o_u_n_t),
    totalAmount: parseFloat(this.totalAmount),
    paymentMethod: this.p_a_y_m_e_n_t__m_e_t_h_o_d,
    transactionReference: this.t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e,
    repaymentType: this.r_e_p_a_y_m_e_n_t__t_y_p_e,
    isInstallment: this.i_s__i_n_s_t_a_l_l_m_e_n_t,
    createdBy: this.c_r_e_a_t_e_d__b_y,
    status: this.s_t_a_t_u_s,
    receiptNo: this.r_e_c_e_i_p_t__n_o,
    branchCode: this.b_r_a_n_c_h__c_o_d_e,
    productCode: this.p_r_o_d_u_c_t__c_o_d_e,
    notes: this.n_o_t_e_s,
    approvedBy: this.a_p_p_r_o_v_e_d__b_y,
    approvalDate: this.a_p_p_r_o_v_a_l__d_a_t_e,
    isReversed: this.i_s__r_e_v_e_r_s_e_d,
    reversalDate: this.r_e_v_e_r_s_a_l__d_a_t_e,
    reversalReason: this.r_e_v_e_r_s_a_l__r_e_a_s_o_n,
    glPosted: this.g_l__p_o_s_t_e_d,
    glPostingDate: this.g_l__p_o_s_t_i_n_g__d_a_t_e,
    glTransactionId: this.g_l__t_r_a_n_s_a_c_t_i_o_n__i_d,
    isFullyPaid: this.isFullyPaid,
    createdAt: this.created_at,
    updatedAt: this.updated_at
  };

  // Add loan account details if eager loaded
  if (this.LoanAccount) {
    response.loanAccount = {
      id: this.LoanAccount.id,
      accountNumber: this.LoanAccount.a_c_c_t__n_o,
      accountName: this.LoanAccount.a_c_c_t__n_m,
      customerName: this.LoanAccount.c_u_s_t__n_m,
      productCode: this.LoanAccount.p_r_o_d_u_c_t__c_o_d_e,
      branchCode: this.LoanAccount.b_r_a_n_c_h__i_d
    };
  }

  return response;
};

// Mark transaction as reversed
LoanRepaymentTransaction.prototype.markAsReversed = async function(reversalReason, reversedBy, transaction = null) {
  try {
    await this.update({
      i_s__r_e_v_e_r_s_e_d: true,
      r_e_v_e_r_s_a_l__d_a_t_e: new Date(),
      r_e_v_e_r_s_a_l__r_e_a_s_o_n: reversalReason,
      s_t_a_t_u_s: 'CANCELLED'
    }, { transaction });

    return this;
  } catch (error) {
    console.error('Error marking transaction as reversed:', error);
    throw error;
  }
};

// ======================
// CLASS/STATIC METHODS
// ======================

// Find transactions by account number
LoanRepaymentTransaction.findByAccountNumber = function(accountNo, options = {}) {
  const { startDate, endDate, status, limit = 50, offset = 0 } = options;
  
  const where = { a_c_c_t__n_o: accountNo };
  
  if (startDate || endDate) {
    where.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e = {};
    if (startDate) where.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e[Op.gte] = new Date(startDate);
    if (endDate) where.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e[Op.lte] = new Date(endDate);
  }
  
  if (status) {
    where.s_t_a_t_u_s = status;
  }
  
  return this.findAll({
    where,
    include: [{
      model: sequelize.models.LoanAccount,
      as: 'LoanAccount',
      attributes: ['id', 'a_c_c_t__n_o', 'a_c_c_t__n_m', 'c_u_s_t__n_m', 'p_r_o_d_u_c_t__c_o_d_e', 'b_r_a_n_c_h__i_d']
    }],
    order: [['t_r_a_n_s_a_c_t_i_o_n__d_a_t_e', 'DESC']],
    limit,
    offset
  });
};

// Find transactions by customer ID
LoanRepaymentTransaction.findByCustomerId = function(customerId, options = {}) {
  const { startDate, endDate, status, limit = 50, offset = 0 } = options;
  
  const where = { c_u_s_t__i_d: customerId };
  
  if (startDate || endDate) {
    where.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e = {};
    if (startDate) where.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e[Op.gte] = new Date(startDate);
    if (endDate) where.t_r_a_n_s_a_c_t_i_o_n__d_a_t_e[Op.lte] = new Date(endDate);
  }
  
  if (status) {
    where.s_t_a_t_u_s = status;
  }
  
  return this.findAll({
    where,
    include: [{
      model: sequelize.models.LoanAccount,
      as: 'LoanAccount',
      attributes: ['id', 'a_c_c_t__n_o', 'a_c_c_t__n_m', 'c_u_s_t__n_m', 'p_r_o_d_u_c_t__c_o_d_e', 'b_r_a_n_c_h__i_d']
    }],
    order: [['t_r_a_n_s_a_c_t_i_o_n__d_a_t_e', 'DESC']],
    limit,
    offset
  });
};

// Get transaction summary for account
LoanRepaymentTransaction.getAccountSummary = async function(accountNo) {
  try {
    const result = await this.findAll({
      where: {
        a_c_c_t__n_o: accountNo,
        s_t_a_t_u_s: 'COMPLETED'
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('a_m_o_u_n_t')), 'total_paid'],
        [sequelize.fn('SUM', sequelize.col('p_r_i_n_c_i_p_a_l__a_m_o_u_n_t')), 'total_principal_paid'],
        [sequelize.fn('SUM', sequelize.col('i_n_t_e_r_e_s_t__a_m_o_u_n_t')), 'total_interest_paid'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.fn('MAX', sequelize.col('t_r_a_n_s_a_c_t_i_o_n__d_a_t_e')), 'last_payment_date']
      ],
      raw: true
    });

    const summary = result[0] || {
      total_paid: '0.00',
      total_principal_paid: '0.00',
      total_interest_paid: '0.00',
      transaction_count: '0',
      last_payment_date: null
    };

    return {
      totalPaid: parseFloat(summary.total_paid) || 0,
      totalPrincipalPaid: parseFloat(summary.total_principal_paid) || 0,
      totalInterestPaid: parseFloat(summary.total_interest_paid) || 0,
      transactionCount: parseInt(summary.transaction_count) || 0,
      lastPaymentDate: summary.last_payment_date
    };
  } catch (error) {
    console.error('Error getting account transaction summary:', error);
    throw error;
  }
};

// Get daily transaction summary
LoanRepaymentTransaction.getDailySummary = async function(date) {
  try {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);

    const result = await this.findAll({
      where: {
        t_r_a_n_s_a_c_t_i_o_n__d_a_t_e: {
          [Op.between]: [startDate, endDate]
        },
        s_t_a_t_u_s: 'COMPLETED'
      },
      attributes: [
        'b_r_a_n_c_h__c_o_d_e',
        'p_a_y_m_e_n_t__m_e_t_h_o_d',
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.fn('SUM', sequelize.col('a_m_o_u_n_t')), 'total_amount'],
        [sequelize.fn('SUM', sequelize.col('p_r_i_n_c_i_p_a_l__a_m_o_u_n_t')), 'total_principal'],
        [sequelize.fn('SUM', sequelize.col('i_n_t_e_r_e_s_t__a_m_o_u_n_t')), 'total_interest']
      ],
      group: ['b_r_a_n_c_h__c_o_d_e', 'p_a_y_m_e_n_t__m_e_t_h_o_d'],
      order: [['b_r_a_n_c_h__c_o_d_e', 'ASC'], ['p_a_y_m_e_n_t__m_e_t_h_o_d', 'ASC']],
      raw: true
    });

    return result.map(row => ({
      branchCode: row.b_r_a_n_c_h__c_o_d_e,
      paymentMethod: row.p_a_y_m_e_n_t__m_e_t_h_o_d,
      transactionCount: parseInt(row.transaction_count) || 0,
      totalAmount: parseFloat(row.total_amount) || 0,
      totalPrincipal: parseFloat(row.total_principal) || 0,
      totalInterest: parseFloat(row.total_interest) || 0
    }));
  } catch (error) {
    console.error('Error getting daily transaction summary:', error);
    throw error;
  }
};

// Create a reversal transaction
LoanRepaymentTransaction.createReversal = async function(transactionId, reversalData, transaction = null) {
  try {
    const originalTransaction = await this.findByPk(transactionId, { transaction });
    
    if (!originalTransaction) {
      throw new Error('Original transaction not found');
    }

    if (originalTransaction.i_s__r_e_v_e_r_s_e_d) {
      throw new Error('Transaction is already reversed');
    }

    // Create reversal transaction
    const reversalTransaction = await this.create({
      a_c_c_t__i_d: originalTransaction.a_c_c_t__i_d,
      a_c_c_t__n_o: originalTransaction.a_c_c_t__n_o,
      c_u_s_t__i_d: originalTransaction.c_u_s_t__i_d,
      t_r_a_n_s_a_c_t_i_o_n__d_a_t_e: new Date(),
      t_r_a_n_s_a_c_t_i_o_n__t_y_p_e: originalTransaction.t_r_a_n_s_a_c_t_i_o_n__t_y_p_e,
      a_m_o_u_n_t: -originalTransaction.a_m_o_u_n_t,
      p_r_i_n_c_i_p_a_l__a_m_o_u_n_t: -originalTransaction.p_r_i_n_c_i_p_a_l__a_m_o_u_n_t,
      i_n_t_e_r_e_s_t__a_m_o_u_n_t: -originalTransaction.i_n_t_e_r_e_s_t__a_m_o_u_n_t,
      p_a_y_m_e_n_t__m_e_t_h_o_d: originalTransaction.p_a_y_m_e_n_t__m_e_t_h_o_d,
      t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e: `REV-${originalTransaction.t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e}-${Date.now()}`,
      r_e_p_a_y_m_e_n_t__t_y_p_e: originalTransaction.r_e_p_a_y_m_e_n_t__t_y_p_e,
      i_s__i_n_s_t_a_l_l_m_e_n_t: originalTransaction.i_s__i_n_s_t_a_l_l_m_e_n_t,
      c_r_e_a_t_e_d__b_y: reversalData.createdBy || 'SYSTEM',
      s_t_a_t_u_s: 'COMPLETED',
      n_o_t_e_s: `Reversal of transaction ${originalTransaction.t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e}: ${reversalData.reason}`,
      r_e_v_e_r_s_a_l__t_r_a_n_s_a_c_t_i_o_n__i_d: originalTransaction.id,
      b_r_a_n_c_h__c_o_d_e: originalTransaction.b_r_a_n_c_h__c_o_d_e,
      p_r_o_d_u_c_t__c_o_d_e: originalTransaction.p_r_o_d_u_c_t__c_o_d_e
    }, { transaction });

    // Mark original as reversed
    await originalTransaction.markAsReversed(reversalData.reason, reversalData.createdBy, transaction);

    return reversalTransaction;
  } catch (error) {
    console.error('Error creating reversal transaction:', error);
    throw error;
  }
};

// ======================
// ASSOCIATIONS
// ======================

export function setupLoanRepaymentTransactionAssociations() {
  const { LoanAccount } = sequelize.models;
  
  LoanRepaymentTransaction.belongsTo(LoanAccount, {
    foreignKey: 'a_c_c_t__i_d',
    as: 'LoanAccount',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  });
  
  LoanAccount.hasMany(LoanRepaymentTransaction, {
    foreignKey: 'a_c_c_t__i_d',
    as: 'Transactions'
  });
  
  // Self-referencing for reversals
  LoanRepaymentTransaction.belongsTo(LoanRepaymentTransaction, {
    foreignKey: 'r_e_v_e_r_s_a_l__t_r_a_n_s_a_c_t_i_o_n__i_d',
    as: 'OriginalTransaction',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });
  
  LoanRepaymentTransaction.hasMany(LoanRepaymentTransaction, {
    foreignKey: 'r_e_v_e_r_s_a_l__t_r_a_n_s_a_c_t_i_o_n__i_d',
    as: 'ReversalTransactions'
  });
}

export default LoanRepaymentTransaction;