// models/DepositAccountHistory.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountHistory extends Model {
  // Static method: Find by account number
  static async findByAccountNo(accountNo, options = {}) {
    const { 
      startDate, 
      endDate, 
      page = 1, 
      limit = 50,
      drCrInd 
    } = options;
    
    const offset = (page - 1) * limit;
    
    const where = { ACCT_NO: accountNo };
    
    if (startDate || endDate) {
      where.TRAN_DT = {};
      if (startDate) where.TRAN_DT[Op.gte] = startDate;
      if (endDate) where.TRAN_DT[Op.lte] = endDate;
    }
    
    if (drCrInd) {
      where.DR_CR_IND = drCrInd;
    }
    
    const { count, rows: history } = await this.findAndCountAll({
      where,
      order: [['TRAN_DT', 'DESC'], ['ACCT_HIST_ID', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    
    return {
      history,
      pagination: {
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    };
  }

  // Static method: Find by deposit account ID
  static async findByDepositAccountId(depositAccountId) {
    return this.findAll({
      where: { DEPOSIT_ACCT_ID: depositAccountId },
      order: [['TRAN_DT', 'DESC']]
    });
  }

  // Static method: Find by transaction date range
  static async findByDateRange(startDate, endDate) {
    return this.findAll({
      where: {
        TRAN_DT: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['TRAN_DT', 'DESC']]
    });
  }

  // Static method: Get account statement
  static async getAccountStatement(accountNo, startDate, endDate) {
    const history = await this.findAll({
      where: {
        ACCT_NO: accountNo,
        TRAN_DT: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['TRAN_DT', 'ASC'], ['ACCT_HIST_ID', 'ASC']]
    });
    
    let runningBalance = 0;
    const statement = history.map(record => {
      const amount = record.ACCT_AMT || 0;
      runningBalance += record.DR_CR_IND === 'D' ? -amount : amount;
      
      return {
        date: record.TRAN_DT,
        valueDate: record.VALUE_DT,
        description: record.TRAN_DESC,
        reference: record.TRAN_REF_TXT,
        debitCredit: record.DR_CR_IND,
        amount: amount,
        charges: record.TOTAL_CHRG_AMT || 0,
        tax: record.TOTAL_TAX_AMT || 0,
        netAmount: record.TXN_AMT || 0,
        balance: runningBalance,
        chequeNumber: record.CHQ_NO,
        channelId: record.CHANNEL_ID
      };
    });
    
    return {
      accountNo,
      period: `${startDate.toDateString()} to ${endDate.toDateString()}`,
      transactionCount: history.length,
      openingBalance: statement[0]?.balance - statement[0]?.amount || 0,
      closingBalance: runningBalance,
      statement
    };
  }

  // Static method: Get transaction summary by date
  static async getDailyTransactionSummary(accountNo, date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const transactions = await this.findAll({
      where: {
        ACCT_NO: accountNo,
        TRAN_DT: {
          [Op.between]: [startOfDay, endOfDay]
        }
      },
      order: [['TRAN_DT', 'ASC']]
    });
    
    const summary = {
      date,
      totalTransactions: transactions.length,
      totalDebits: 0,
      totalCredits: 0,
      totalCharges: 0,
      totalTax: 0,
      transactions: []
    };
    
    transactions.forEach(txn => {
      const amount = txn.ACCT_AMT || 0;
      const charges = txn.TOTAL_CHRG_AMT || 0;
      const tax = txn.TOTAL_TAX_AMT || 0;
      
      if (txn.DR_CR_IND === 'D') {
        summary.totalDebits += amount;
      } else if (txn.DR_CR_IND === 'C') {
        summary.totalCredits += amount;
      }
      
      summary.totalCharges += charges;
      summary.totalTax += tax;
      
      summary.transactions.push({
        time: txn.TRAN_DT,
        description: txn.TRAN_DESC,
        reference: txn.TRAN_REF_TXT,
        type: txn.DR_CR_IND,
        amount,
        charges,
        tax,
        netAmount: amount - charges - tax,
        balance: txn.STMNT_BAL || 0
      });
    });
    
    summary.netFlow = summary.totalCredits - summary.totalDebits;
    
    return summary;
  }

  // Instance method: Get transaction details
  getTransactionDetails() {
    return {
      historyId: this.ACCT_HIST_ID,
      depositAccountId: this.DEPOSIT_ACCT_ID,
      accountNumber: this.ACCT_NO,
      contraAccount: this.CONTRA_ACCT_NO,
      transactionDate: this.TRAN_DT,
      valueDate: this.VALUE_DT,
      transactionType: this.DR_CR_IND,
      description: this.TRAN_DESC,
      reference: this.TRAN_REF_TXT,
      chequeNumber: this.CHQ_NO,
      transactionAmount: this.TXN_AMT,
      accountAmount: this.ACCT_AMT,
      charges: this.TOTAL_CHRG_AMT,
      tax: this.TOTAL_TAX_AMT,
      eventCost: this.EVENT_COST,
      exchangeRate: this.EXCH_RATE,
      accountCurrency: this.ACCT_CRNCY_ID,
      transactionCurrency: this.TXN_CRNCY_ID,
      statementBalance: this.STMNT_BAL,
      depositorPayeeName: this.DEPOSITOR_PAYEE_NM,
      channelId: this.CHANNEL_ID,
      eventId: this.EVENT_ID,
      supervisorId: this.SUPERVISOR_ID,
      createdBy: this.CREATED_BY,
      userId: this.USER_ID,
      recordStatus: this.REC_ST,
      version: this.VERSION_NO,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // Instance method: Check if debit transaction
  isDebit() {
    return this.DR_CR_IND === 'D';
  }

  // Instance method: Check if credit transaction
  isCredit() {
    return this.DR_CR_IND === 'C';
  }

  // Instance method: Get net amount
  getNetAmount() {
    const amount = this.ACCT_AMT || 0;
    const charges = this.TOTAL_CHRG_AMT || 0;
    const tax = this.TOTAL_TAX_AMT || 0;
    const net = this.isDebit() ? -(amount + charges + tax) : amount - charges - tax;
    return net;
  }

  // Virtual getter: Formatted transaction date
  get formattedTransactionDate() {
    return this.TRAN_DT ? this.TRAN_DT.toLocaleString() : 'N/A';
  }

  // Virtual getter: Formatted value date
  get formattedValueDate() {
    return this.VALUE_DT ? this.VALUE_DT.toLocaleDateString() : 'N/A';
  }
}

DepositAccountHistory.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  ACCT_HIST_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Account history identifier'
  },
  
  DEPOSIT_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account identifier'
  },
  
  ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: false,
    comment: 'Account number'
  },
  
  CONTRA_ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Contra account number'
  },
  
  TRAN_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Transaction date'
  },
  
  VALUE_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Value date'
  },
  
  TOTAL_CHRG_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Total charges amount'
  },
  
  TOTAL_TAX_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Total tax amount'
  },
  
  EVENT_COST: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Event cost'
  },
  
  EXCH_RATE: {
    type: DataTypes.DECIMAL(15, 6),
    allowNull: true,
    comment: 'Exchange rate'
  },
  
  TRAN_REF_TXT: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Transaction reference text'
  },
  
  CHQ_NO: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Cheque number'
  },
  
  TRAN_DESC: {
    type: DataTypes.STRING(300),
    allowNull: true,
    comment: 'Transaction description'
  },
  
  SUPERVISOR_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Supervisor identifier'
  },
  
  STMNT_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Statement balance'
  },
  
  DR_CR_IND: {
    type: DataTypes.STRING(2),
    allowNull: true,
    validate: {
      isIn: [['D', 'C']] // D=Debit, C=Credit
    },
    comment: 'Debit/Credit indicator'
  },
  
  PASSBOOK_UPDATED: {
    type: DataTypes.STRING(1),
    allowNull: true,
    validate: {
      isIn: [['Y', 'N']]
    },
    comment: 'Passbook updated flag'
  },
  
  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: true,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I']] // A=Active, I=Inactive
    },
    comment: 'Record status'
  },
  
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 1,
    comment: 'Version number'
  },
  
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Row timestamp'
  },
  
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: true,
    comment: 'User identifier'
  },
  
  ORIGIN_BU_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Origin business unit identifier'
  },
  
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Create date'
  },
  
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: true,
    comment: 'Created by user'
  },
  
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'System create timestamp'
  },
  
  CHRG_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Charge identifier'
  },
  
  TAX_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Tax identifier'
  },
  
  CHANNEL_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Channel identifier'
  },
  
  EVENT_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Event identifier'
  },
  
  PARENT_EVENT_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Parent event identifier'
  },
  
  TXN_CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Transaction currency identifier'
  },
  
  TXN_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Transaction amount'
  },
  
  ACCT_CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Account currency identifier'
  },
  
  ACCT_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Account amount'
  },
  
  CONTRA_ACCT_CRNCY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Contra account currency identifier'
  },
  
  CONTRA_ACCT_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Contra account amount'
  },
  
  CONTRA_ACCT_TY_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Contra account type identifier'
  },
  
  DEPOSITOR_PAYEE_NM: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Depositor/Payee name'
  },
  
  SRC_OF_FUNDS_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Source of funds identifier'
  },
  
  TRAN_JOURNAL_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Transaction journal identifier'
  },
  
  TXN_MEMO_TYPE_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Transaction memo type code'
  },
  
  ORIGINATOR_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Originator identifier'
  },
  
  EVENT_JOURNAL_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Event journal identifier'
  },
  
  STMNT_BAL2: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Statement balance 2'
  },
  
  BACKDATE_PROCESSING_ST: {
    type: DataTypes.STRING(1),
    allowNull: true,
    validate: {
      isIn: [['Y', 'N']]
    },
    comment: 'Backdate processing status'
  },
  
  EVENT_CHRG_JOURNAL_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Event charge journal identifier'
  },
  
  EVENT_TAX_JOURNAL_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Event tax journal identifier'
  },
  
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DepositAccountHistory',
  tableName: 'deposit_account_history',
  timestamps: true,
  hooks: {
    beforeCreate: (history) => {
      // Set transaction date if not provided
      if (!history.TRAN_DT) {
        history.TRAN_DT = new Date();
      }
      
      // Set value date to transaction date if not provided
      if (!history.VALUE_DT) {
        history.VALUE_DT = history.TRAN_DT;
      }
      
      // Set system timestamps if not provided
      const now = new Date();
      if (!history.ROW_TS) history.ROW_TS = now;
      if (!history.CREATE_DT) history.CREATE_DT = now;
      if (!history.SYS_CREATE_TS) history.SYS_CREATE_TS = now;
      
      // Set default record status
      if (!history.REC_ST) history.REC_ST = 'A';
      
      // Set default version number
      if (!history.VERSION_NO) history.VERSION_NO = 1;
    },
    
    beforeUpdate: (history) => {
      // Update row timestamp on every update
      history.ROW_TS = new Date();
      
      // Increment version number on update
      if (history.changed() && !history.changed('VERSION_NO')) {
        history.VERSION_NO = (history.VERSION_NO || 0) + 1;
      }
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['ACCT_HIST_ID'], unique: true },
    { fields: ['ACCT_NO'] },
    { fields: ['DEPOSIT_ACCT_ID'] },
    { fields: ['TRAN_DT'] },
    { fields: ['DR_CR_IND'] },
    { fields: ['REC_ST'] },
    { fields: ['CONTRA_ACCT_NO'] },
    { fields: ['TRAN_REF_TXT'] },
    { fields: ['CHQ_NO'] },
    
    // Composite indexes for common queries
    { fields: ['ACCT_NO', 'TRAN_DT'] },
    { fields: ['ACCT_NO', 'DR_CR_IND'] },
    { fields: ['ACCT_NO', 'REC_ST', 'TRAN_DT'] },
    { fields: ['DEPOSIT_ACCT_ID', 'TRAN_DT'] },
    { fields: ['TRAN_DT', 'DR_CR_IND'] },
    { fields: ['ACCT_NO', 'VALUE_DT'] },
    { fields: ['EVENT_ID', 'TRAN_DT'] },
    { fields: ['CHANNEL_ID', 'TRAN_DT'] }
  ],
  scopes: {
    active: {
      where: { REC_ST: 'A' }
    },
    debits: {
      where: { DR_CR_IND: 'D' }
    },
    credits: {
      where: { DR_CR_IND: 'C' }
    },
    byAccount: (accountNo) => ({
      where: { ACCT_NO: accountNo }
    }),
    byDepositAccount: (depositAccountId) => ({
      where: { DEPOSIT_ACCT_ID: depositAccountId }
    }),
    byDateRange: (startDate, endDate) => ({
      where: {
        TRAN_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    recent: {
      order: [['TRAN_DT', 'DESC']],
      limit: 100
    },
    today: {
      where: {
        TRAN_DT: {
          [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    },
    thisWeek: {
      where: {
        TRAN_DT: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 7))
        }
      }
    },
    thisMonth: {
      where: {
        TRAN_DT: {
          [Op.gte]: new Date(new Date().setDate(new Date().getDate() - 30))
        }
      }
    },
    byChannel: (channelId) => ({
      where: { CHANNEL_ID: channelId }
    }),
    byEvent: (eventId) => ({
      where: { EVENT_ID: eventId }
    })
  }
});

export default DepositAccountHistory;
