// models/DepositAccountMonthlyStat.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountMonthlyStat extends Model {
  // Static method: Find monthly stats by deposit account ID
  static async findByDepositAccountId(depositAccountId, options = {}) {
    const defaultOptions = {
      where: { DEPOSIT_ACCT_ID: depositAccountId },
      order: [['START_DT', 'DESC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find monthly stats by account number
  static async findByAccountNumber(accountNumber, options = {}) {
    const defaultOptions = {
      where: { ACCT_NO: accountNumber },
      order: [['START_DT', 'DESC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find monthly stats by date range
  static async findByDateRange(startDate, endDate, options = {}) {
    const defaultOptions = {
      where: {
        START_DT: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['START_DT', 'ASC'], ['DEPOSIT_ACCT_ID', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get stats for specific month and year
  static async getByMonthYear(year, month, options = {}) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0); // Last day of the month
    
    return this.findByDateRange(startDate, endDate, options);
  }

  // Static method: Get financial summary for period
  static async getFinancialSummary(startDate, endDate) {
    const stats = await this.findAll({
      where: {
        START_DT: {
          [Op.between]: [startDate, endDate]
        },
        REC_ST: 'A'
      },
      order: [['START_DT', 'ASC']]
    });

    const summary = {
      totalAccounts: new Set(stats.map(s => s.DEPOSIT_ACCT_ID)).size,
      totalMonths: stats.length,
      totalDebitInterest: 0,
      totalCreditInterest: 0,
      totalTax: 0,
      totalCharges: 0,
      totalCost: 0,
      totalDebitTurnover: 0,
      totalCreditTurnover: 0,
      byMonth: {},
      byAccount: {}
    };

    stats.forEach(stat => {
      const monthKey = `${stat.START_DT.getFullYear()}-${stat.START_DT.getMonth() + 1}`;
      
      // Initialize month data if not exists
      if (!summary.byMonth[monthKey]) {
        summary.byMonth[monthKey] = {
          month: monthKey,
          totalDebitInterest: 0,
          totalCreditInterest: 0,
          totalTax: 0,
          totalCharges: 0,
          accountCount: 0
        };
      }

      // Initialize account data if not exists
      const accountKey = stat.DEPOSIT_ACCT_ID;
      if (!summary.byAccount[accountKey]) {
        summary.byAccount[accountKey] = {
          accountId: stat.DEPOSIT_ACCT_ID,
          accountNumber: stat.ACCT_NO,
          totalDebitInterest: 0,
          totalCreditInterest: 0,
          totalTax: 0,
          totalCharges: 0,
          monthCount: 0
        };
      }

      // Convert Decimal128 to Number for calculations
      const debitInterest = parseFloat(stat.DR_INT_CHRGD);
      const creditInterest = parseFloat(stat.CR_INT_PAID);
      const tax = parseFloat(stat.TOTAL_TAX);
      const charges = parseFloat(stat.CHRG_APPLIED);
      const cost = parseFloat(stat.TOTAL_COST);
      const debitTurnover = parseFloat(stat.DR_TURNOVER);
      const creditTurnover = parseFloat(stat.CR_TURNOVER);

      // Update totals
      summary.totalDebitInterest += debitInterest;
      summary.totalCreditInterest += creditInterest;
      summary.totalTax += tax;
      summary.totalCharges += charges;
      summary.totalCost += cost;
      summary.totalDebitTurnover += debitTurnover;
      summary.totalCreditTurnover += creditTurnover;

      // Update month data
      summary.byMonth[monthKey].totalDebitInterest += debitInterest;
      summary.byMonth[monthKey].totalCreditInterest += creditInterest;
      summary.byMonth[monthKey].totalTax += tax;
      summary.byMonth[monthKey].totalCharges += charges;
      summary.byMonth[monthKey].accountCount++;

      // Update account data
      summary.byAccount[accountKey].totalDebitInterest += debitInterest;
      summary.byAccount[accountKey].totalCreditInterest += creditInterest;
      summary.byAccount[accountKey].totalTax += tax;
      summary.byAccount[accountKey].totalCharges += charges;
      summary.byAccount[accountKey].monthCount++;
    });

    // Calculate averages
    summary.averageDebitInterest = summary.totalDebitInterest / summary.totalMonths;
    summary.averageCreditInterest = summary.totalCreditInterest / summary.totalMonths;
    summary.averageMonthlyCost = summary.totalCost / summary.totalMonths;

    return summary;
  }

  // Static method: Get account performance summary
  static async getAccountPerformanceSummary(depositAccountId, year = null) {
    const whereClause = { DEPOSIT_ACCT_ID: depositAccountId, REC_ST: 'A' };
    
    if (year) {
      const startDate = new Date(year, 0, 1);
      const endDate = new Date(year, 11, 31);
      whereClause.START_DT = { [Op.between]: [startDate, endDate] };
    }

    const stats = await this.findAll({
      where: whereClause,
      order: [['START_DT', 'ASC']]
    });

    if (stats.length === 0) {
      return null;
    }

    const performance = {
      accountId: depositAccountId,
      accountNumber: stats[0].ACCT_NO,
      period: year ? `${year}` : 'All Time',
      totalMonths: stats.length,
      monthlyStats: [],
      totals: {
        debitInterest: 0,
        creditInterest: 0,
        tax: 0,
        charges: 0,
        cost: 0,
        debitCount: 0,
        creditCount: 0,
        debitTurnover: 0,
        creditTurnover: 0
      },
      averages: {},
      ranges: {}
    };

    // Initialize min/max values
    const balances = stats.map(s => parseFloat(s.AVG_LEDGER_BAL));
    const interestRates = stats.map(s => parseFloat(s.AVG_DR_INT_RATE));

    stats.forEach(stat => {
      const monthlyData = {
        month: stat.START_DT.toLocaleString('default', { month: 'short', year: 'numeric' }),
        startDate: stat.START_DT,
        endDate: stat.END_DT,
        ledgerBalance: parseFloat(stat.LEDGER_BAL_FWD),
        clearedBalance: parseFloat(stat.CLEARED_BAL_FWD),
        debitInterest: parseFloat(stat.DR_INT_CHRGD),
        creditInterest: parseFloat(stat.CR_INT_PAID),
        tax: parseFloat(stat.TOTAL_TAX),
        charges: parseFloat(stat.CHRG_APPLIED),
        cost: parseFloat(stat.TOTAL_COST),
        debitCount: stat.DR_COUNT,
        creditCount: stat.CR_COUNT,
        debitTurnover: parseFloat(stat.DR_TURNOVER),
        creditTurnover: parseFloat(stat.CR_TURNOVER),
        avgBalance: parseFloat(stat.AVG_LEDGER_BAL),
        avgInterestRate: parseFloat(stat.AVG_DR_INT_RATE)
      };

      performance.monthlyStats.push(monthlyData);

      // Update totals
      performance.totals.debitInterest += monthlyData.debitInterest;
      performance.totals.creditInterest += monthlyData.creditInterest;
      performance.totals.tax += monthlyData.tax;
      performance.totals.charges += monthlyData.charges;
      performance.totals.cost += monthlyData.cost;
      performance.totals.debitCount += monthlyData.debitCount;
      performance.totals.creditCount += monthlyData.creditCount;
      performance.totals.debitTurnover += monthlyData.debitTurnover;
      performance.totals.creditTurnover += monthlyData.creditTurnover;
    });

    // Calculate averages
    performance.averages = {
      monthlyDebitInterest: performance.totals.debitInterest / performance.totalMonths,
      monthlyCreditInterest: performance.totals.creditInterest / performance.totalMonths,
      monthlyCost: performance.totals.cost / performance.totalMonths,
      monthlyDebitCount: performance.totals.debitCount / performance.totalMonths,
      monthlyCreditCount: performance.totals.creditCount / performance.totalMonths,
      avgBalance: balances.reduce((a, b) => a + b, 0) / balances.length,
      avgInterestRate: interestRates.reduce((a, b) => a + b, 0) / interestRates.length
    };

    // Calculate ranges
    performance.ranges = {
      minBalance: Math.min(...balances),
      maxBalance: Math.max(...balances),
      minInterestRate: Math.min(...interestRates),
      maxInterestRate: Math.max(...interestRates)
    };

    return performance;
  }

  // Instance method: Get stat details
  getStatDetails() {
    return {
      monthlyStatId: this.MONTHLY_STAT_ID,
      depositAccountId: this.DEPOSIT_ACCT_ID,
      accountNumber: this.ACCT_NO,
      period: {
        startDate: this.START_DT,
        endDate: this.END_DT,
        month: this.START_DT.getMonth() + 1,
        year: this.START_DT.getFullYear()
      },
      balances: {
        ledgerBalanceForward: this.LEDGER_BAL_FWD,
        clearedBalanceForward: this.CLEARED_BAL_FWD,
        avgLedgerBalance: this.AVG_LEDGER_BAL,
        avgClearedBalance: this.AVG_CLEARED_BAL,
        minLedgerBalance: this.MIN_LEDGER_BAL,
        maxLedgerBalance: this.MAX_LEDGER_BAL,
        minClearedBalance: this.MIN_CLEARED_BAL,
        maxClearedBalance: this.MAX_CLEARED_BAL
      },
      interest: {
        debitAccruedForward: this.DR_INT_ACCRUED_FWD,
        creditAccruedForward: this.CR_INT_ACCRUED_FWD,
        debitCharged: this.DR_INT_CHRGD,
        creditPaid: this.CR_INT_PAID,
        avgDebitRate: this.AVG_DR_INT_RATE,
        avgDebitMargin: this.AVG_DR_INT_MARGIN,
        avgCreditRate: this.AVG_CR_INT_RATE,
        avgCreditMargin: this.AVG_CR_INT_MARGIN
      },
      charges: {
        chargesAccruedForward: this.CHRG_ACCRUED_FWD,
        chargesApplied: this.CHRG_APPLIED,
        totalTax: this.TOTAL_TAX,
        totalCost: this.TOTAL_COST
      },
      transactionActivity: {
        debitCount: this.DR_COUNT,
        creditCount: this.CR_COUNT,
        domesticChequeCount: this.DOMESTIC_CHQ_COUNT,
        foreignChequeCount: this.FOREIGN_CHQ_COUNT,
        chequeCount: this.CHQ_COUNT,
        debitTurnover: this.DR_TURNOVER,
        creditTurnover: this.CR_TURNOVER
      },
      dates: {
        maxLedgerBalanceDate: this.MAX_LEDGER_BAL_DT,
        maxClearedBalanceDate: this.MAX_CLEARED_BAL_DT,
        minLedgerBalanceDate: this.MIN_LEDGER_BAL_DT,
        minClearedBalanceDate: this.MIN_CLEARED_BAL_DT,
        avgBalanceDate: this.AVG_BAL_DT
      },
      status: this.REC_ST,
      version: this.VERSION_NO,
      metadata: {
        userId: this.USER_ID,
        createdBy: this.CREATED_BY,
        createdDate: this.CREATE_DT,
        systemCreateTimestamp: this.SYS_CREATE_TS,
        rowTimestamp: this.ROW_TS
      }
    };
  }

  // Instance method: Check if stat is active
  isActive() {
    return this.REC_ST === 'A';
  }

  // Instance method: Get month name
  get monthName() {
    return this.START_DT.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  // Instance method: Get formatted balances
  get formattedBalances() {
    return {
      ledgerBalanceForward: parseFloat(this.LEDGER_BAL_FWD).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      clearedBalanceForward: parseFloat(this.CLEARED_BAL_FWD).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      avgLedgerBalance: parseFloat(this.AVG_LEDGER_BAL).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    };
  }

  // Instance method: Get net interest
  get netInterest() {
    const debitInterest = parseFloat(this.DR_INT_CHRGD);
    const creditInterest = parseFloat(this.CR_INT_PAID);
    return creditInterest - debitInterest;
  }

  // Instance method: Get net turnover
  get netTurnover() {
    const debitTurnover = parseFloat(this.DR_TURNOVER);
    const creditTurnover = parseFloat(this.CR_TURNOVER);
    return creditTurnover - debitTurnover;
  }

  // Instance method: Get total transactions
  get totalTransactions() {
    return this.DR_COUNT + this.CR_COUNT;
  }

  // Instance method: Get total cheques
  get totalCheques() {
    return this.DOMESTIC_CHQ_COUNT + this.FOREIGN_CHQ_COUNT;
  }
}

DepositAccountMonthlyStat.init({
  // Auto-increment primary key
  MONTHLY_STAT_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Monthly statistics identifier (auto-incremented)'
  },

  // Foreign key
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

  // Period dates
  START_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Start date of the monthly period'
  },

  END_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'End date of the monthly period'
  },

  // Balance fields
  LEDGER_BAL_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Ledger balance forward'
  },

  CLEARED_BAL_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Cleared balance forward'
  },

  DR_INT_ACCRUED_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Debit interest accrued forward'
  },

  CR_INT_ACCRUED_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Credit interest accrued forward'
  },

  DR_INT_CHRGD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Debit interest charged during month'
  },

  CR_INT_PAID: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Credit interest paid during month'
  },

  TOTAL_TAX: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Total tax for the month'
  },

  CHRG_ACCRUED_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Charges accrued forward'
  },

  CHRG_APPLIED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Charges applied during month'
  },

  TOTAL_COST: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Total cost for the month'
  },

  // Count fields
  DOMESTIC_CHQ_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Domestic cheque count'
  },

  FOREIGN_CHQ_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Foreign cheque count'
  },

  AVG_LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Average ledger balance'
  },

  AVG_CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Average cleared balance'
  },

  AVG_DR_INT_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Average debit interest rate'
  },

  AVG_DR_INT_MARGIN: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Average debit interest margin'
  },

  AVG_CR_INT_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Average credit interest rate'
  },

  AVG_CR_INT_MARGIN: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Average credit interest margin'
  },

  DR_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Debit transaction count'
  },

  CR_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Credit transaction count'
  },

  DR_TURNOVER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Debit turnover amount'
  },

  CR_TURNOVER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Credit turnover amount'
  },

  CHQ_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Total cheque count'
  },

  MIN_LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Minimum ledger balance'
  },

  MIN_CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Minimum cleared balance'
  },

  MAX_LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Maximum ledger balance'
  },

  MAX_CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Maximum cleared balance'
  },

  // Date fields for min/max balances
  MAX_LEDGER_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Date of maximum ledger balance'
  },

  MAX_CLEARED_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Date of maximum cleared balance'
  },

  MIN_LEDGER_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Date of minimum ledger balance'
  },

  MIN_CLEARED_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Date of minimum cleared balance'
  },

  AVG_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Date for average balance calculation'
  },

  // Status and metadata
  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I']] // A=Active, I=Inactive
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

  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'System create timestamp'
  },

  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created by user'
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
  modelName: 'DepositAccountMonthlyStat',
  tableName: 'deposit_account_monthly_stat',
  timestamps: true,
  hooks: {
    beforeValidate: (stat) => {
      // Ensure uppercase for status
      if (stat.REC_ST) {
        stat.REC_ST = stat.REC_ST.toUpperCase();
      }
      
      // Ensure CHQ_COUNT equals sum of domestic and foreign cheques
      if (stat.DOMESTIC_CHQ_COUNT !== undefined && stat.FOREIGN_CHQ_COUNT !== undefined) {
        stat.CHQ_COUNT = stat.DOMESTIC_CHQ_COUNT + stat.FOREIGN_CHQ_COUNT;
      }
      
      // Trim account number
      if (stat.ACCT_NO) {
        stat.ACCT_NO = stat.ACCT_NO.trim();
      }
    },
    
    beforeCreate: (stat) => {
      // Set timestamps if not provided
      const now = new Date();
      if (!stat.CREATE_DT) stat.CREATE_DT = now;
      if (!stat.SYS_CREATE_TS) stat.SYS_CREATE_TS = now;
      if (!stat.ROW_TS) stat.ROW_TS = now;
      
      // Validate period dates
      if (stat.START_DT >= stat.END_DT) {
        throw new Error('START_DT must be earlier than END_DT');
      }
      
      // Ensure month period is exactly one month
      const start = new Date(stat.START_DT);
      const end = new Date(stat.END_DT);
      const diffMonths = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      
      if (diffMonths !== 1) {
        throw new Error('Monthly stat must cover exactly one month period');
      }
    },
    
    beforeUpdate: (stat) => {
      // Update row timestamp
      stat.ROW_TS = new Date();
      
      // Increment version number on update
      if (stat.changed() && !stat.changed('VERSION_NO')) {
        stat.VERSION_NO = (stat.VERSION_NO || 0) + 1;
      }
    },
    
    beforeSave: (stat) => {
      // Validate that balances are not negative
      const balanceFields = [
        'LEDGER_BAL_FWD', 'CLEARED_BAL_FWD', 'DR_INT_CHRGD', 
        'CR_INT_PAID', 'TOTAL_TAX', 'CHRG_APPLIED', 'TOTAL_COST'
      ];
      
      balanceFields.forEach(field => {
        if (parseFloat(stat[field]) < 0) {
          throw new Error(`${field} cannot be negative`);
        }
      });
    }
  },
  
  scopes: {
    active: {
      where: { REC_ST: 'A' }
    },
    inactive: {
      where: { REC_ST: 'I' }
    },
    byDepositAccount: (depositAccountId) => ({
      where: { DEPOSIT_ACCT_ID: depositAccountId }
    }),
    byAccountNumber: (accountNumber) => ({
      where: { ACCT_NO: accountNumber }
    }),
    byYear: (year) => ({
      where: sequelize.where(
        sequelize.fn('YEAR', sequelize.col('START_DT')),
        year
      )
    }),
    byMonth: (year, month) => ({
      where: {
        [Op.and]: [
          sequelize.where(
            sequelize.fn('YEAR', sequelize.col('START_DT')),
            year
          ),
          sequelize.where(
            sequelize.fn('MONTH', sequelize.col('START_DT')),
            month
          )
        ]
      }
    }),
    dateRange: (startDate, endDate) => ({
      where: {
        START_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    recent: {
      order: [['START_DT', 'DESC']],
      limit: 12
    },
    withHighActivity: {
      where: {
        [Op.or]: [
          { DR_COUNT: { [Op.gt]: 100 } },
          { CR_COUNT: { [Op.gt]: 100 } },
          { DR_TURNOVER: { [Op.gt]: 1000000 } },
          { CR_TURNOVER: { [Op.gt]: 1000000 } }
        ]
      }
    },
    sortedByBalance: {
      order: [['AVG_LEDGER_BAL', 'DESC']]
    },
    sortedByInterest: {
      order: [['CR_INT_PAID', 'DESC']]
    }
  }
});

export default DepositAccountMonthlyStat;
