// models/DepositAccountSummary.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountSummary extends Model {
  // Static method: Find summary by account ID
  static async findByAccountId(accountId) {
    return this.findOne({
      where: { ACCT_ID: accountId }
    });
  }

  // Static method: Find summary by account number
  static async findByAccountNumber(accountNumber) {
    return this.findOne({
      where: { ACCT_NO: accountNumber }
    });
  }

  // Static method: Update account balance
  static async updateAccountBalance(accountId, transactionType, amount) {
    const summary = await this.findByAccountId(accountId);
    
    if (!summary) {
      throw new Error('Account summary not found');
    }

    const ledgerBal = parseFloat(summary.LEDGER_BAL);
    const clearedBal = parseFloat(summary.CLEARED_BAL);
    const newAmount = parseFloat(amount);

    const updates = {
      LAST_ACTIVITY_DT: new Date(),
      ROW_TS: new Date(),
      VERSION_NO: summary.VERSION_NO + 1
    };

    if (transactionType === 'DEPOSIT' || transactionType === 'CREDIT') {
      updates.LEDGER_BAL = ledgerBal + newAmount;
      updates.CLEARED_BAL = clearedBal + newAmount;
      updates.LAST_DEPOSIT_DT = new Date();
      updates.LAST_DEPOSIT_AMT = newAmount;
      updates.CR_TURNOVER = parseFloat(summary.CR_TURNOVER) + newAmount;
      updates.CR_COUNT = summary.CR_COUNT + 1;
    } else if (transactionType === 'WITHDRAWAL' || transactionType === 'DEBIT') {
      updates.LEDGER_BAL = ledgerBal - newAmount;
      updates.CLEARED_BAL = clearedBal - newAmount;
      updates.LAST_WITHDRAWL_DT = new Date();
      updates.LAST_WITHDRAWL_AMT = newAmount;
      updates.DR_TURNOVER = parseFloat(summary.DR_TURNOVER) + newAmount;
      updates.DR_COUNT = summary.DR_COUNT + 1;
    }

    // Update min/max balances
    if (updates.LEDGER_BAL < parseFloat(summary.MIN_LEDGER_BAL)) {
      updates.MIN_LEDGER_BAL = updates.LEDGER_BAL;
      updates.MIN_LEDGER_BAL_DT = new Date();
    }
    
    if (updates.LEDGER_BAL > parseFloat(summary.MAX_LEDGER_BAL)) {
      updates.MAX_LEDGER_BAL = updates.LEDGER_BAL;
      updates.MAX_LEDGER_BAL_DT = new Date();
    }

    if (updates.CLEARED_BAL < parseFloat(summary.MIN_CLEARED_BAL)) {
      updates.MIN_CLEARED_BAL = updates.CLEARED_BAL;
      updates.MIN_CLEARED_BAL_DT = new Date();
    }
    
    if (updates.CLEARED_BAL > parseFloat(summary.MAX_CLEARED_BAL)) {
      updates.MAX_CLEARED_BAL = updates.CLEARED_BAL;
      updates.MAX_CLEARED_BAL_DT = new Date();
    }

    // Update average balances
    const daysSinceLastActivity = Math.floor((new Date() - summary.LAST_ACTIVITY_DT) / (1000 * 60 * 60 * 24)) || 1;
    const totalDays = daysSinceLastActivity + summary.DR_COUNT + summary.CR_COUNT;
    
    updates.AVG_LEDGER_BAL = (
      (parseFloat(summary.AVG_LEDGER_BAL) * totalDays) + updates.LEDGER_BAL
    ) / (totalDays + 1);
    
    updates.AVG_CLEARED_BAL = (
      (parseFloat(summary.AVG_CLEARED_BAL) * totalDays) + updates.CLEARED_BAL
    ) / (totalDays + 1);

    await summary.update(updates);
    return summary.reload();
  }

  // Static method: Calculate available balance
  static async calculateAvailableBalance(accountId) {
    const summary = await this.findByAccountId(accountId);
    
    if (!summary) {
      throw new Error('Account summary not found');
    }

    const ledgerBal = parseFloat(summary.LEDGER_BAL);
    const reservedFund = parseFloat(summary.RESERVED_FUND);
    const earmarkedFund = parseFloat(summary.EARMARKED_FUND);
    const provisionBal = parseFloat(summary.PROVISION_BAL);
    const penalBal = parseFloat(summary.PENAL_BAL);
    const cumulativeLienAmt = parseFloat(summary.CUMULATIVE_LIEN_AMT);

    return {
      ledgerBalance: ledgerBal,
      availableBalance: ledgerBal - reservedFund - earmarkedFund - provisionBal - penalBal - cumulativeLienAmt,
      components: {
        ledgerBalance: ledgerBal,
        reservedFund: reservedFund,
        earmarkedFund: earmarkedFund,
        provisionBal: provisionBal,
        penalBal: penalBal,
        cumulativeLienAmt: cumulativeLienAmt
      }
    };
  }

  // Static method: Get account performance metrics
  static async getPerformanceMetrics(accountId) {
    const summary = await this.findByAccountId(accountId);
    
    if (!summary) {
      throw new Error('Account summary not found');
    }

    const ledgerBal = parseFloat(summary.LEDGER_BAL);
    const clearedBal = parseFloat(summary.CLEARED_BAL);
    const avgLedgerBal = parseFloat(summary.AVG_LEDGER_BAL);
    const avgClearedBal = parseFloat(summary.AVG_CLEARED_BAL);
    const drTurnover = parseFloat(summary.DR_TURNOVER);
    const crTurnover = parseFloat(summary.CR_TURNOVER);
    const totalCharges = parseFloat(summary.TOTAL_CHRGS);
    const totalTax = parseFloat(summary.TOTAL_TAX);
    const totalCost = parseFloat(summary.TOTAL_COST);

    return {
      accountId: summary.ACCT_ID,
      accountNumber: summary.ACCT_NO,
      currentBalances: {
        ledger: ledgerBal,
        cleared: clearedBal,
        available: await this.calculateAvailableBalance(accountId)
      },
      activityMetrics: {
        totalTransactions: summary.DR_COUNT + summary.CR_COUNT,
        debitCount: summary.DR_COUNT,
        creditCount: summary.CR_COUNT,
        chequeCount: summary.CHQ_COUNT,
        debitTurnover: drTurnover,
        creditTurnover: crTurnover,
        netTurnover: crTurnover - drTurnover
      },
      financialMetrics: {
        avgLedgerBalance: avgLedgerBal,
        avgClearedBalance: avgClearedBal,
        minLedgerBalance: parseFloat(summary.MIN_LEDGER_BAL),
        maxLedgerBalance: parseFloat(summary.MAX_LEDGER_BAL),
        minClearedBalance: parseFloat(summary.MIN_CLEARED_BAL),
        maxClearedBalance: parseFloat(summary.MAX_CLEARED_BAL),
        totalCharges: totalCharges,
        totalTax: totalTax,
        totalCost: totalCost,
        costToBalanceRatio: totalCost / (avgLedgerBal || 1)
      },
      interestMetrics: {
        debitInterestAccrued: parseFloat(summary.DR_INT_ACCRUED),
        creditInterestAccrued: parseFloat(summary.CR_INT_ACCRUED),
        debitInterestCharged: parseFloat(summary.DR_INT_CHRGD),
        creditInterestPaid: parseFloat(summary.CR_INT_PAID),
        debitInterestPerDay: parseFloat(summary.DR_INT_PER_DAY),
        creditInterestPerDay: parseFloat(summary.CR_INT_PER_DAY),
        debitEffectiveRate: parseFloat(summary.DR_CALCULATED_EFF_INT_RATE),
        creditEffectiveRate: parseFloat(summary.CR_CALCULATED_EFF_INT_RATE)
      },
      dates: {
        lastActivity: summary.LAST_ACTIVITY_DT,
        lastDeposit: summary.LAST_DEPOSIT_DT,
        lastWithdrawal: summary.LAST_WITHDRAWL_DT,
        accountCycleStart: summary.ACCT_CYCLE_START_DT,
        accountCycleEnd: summary.ACCT_CYCLE_END_DT,
        nextStatement: summary.NEXT_STMNT_DT
      }
    };
  }

  // Static method: Recalculate account statistics
  static async recalculateStatistics(accountId) {
    const summary = await this.findByAccountId(accountId);
    
    if (!summary) {
      throw new Error('Account summary not found');
    }

    return summary.update({
      STAT_UPD_FG: 'Y',
      ROW_TS: new Date(),
      VERSION_NO: summary.VERSION_NO + 1
    });
  }

  // Instance method: Get account summary details
  getAccountSummary() {
    return {
      accountId: this.ACCT_ID,
      accountNumber: this.ACCT_NO,
      productId: this.PROD_ID,
      balances: {
        ledger: this.LEDGER_BAL,
        cleared: this.CLEARED_BAL,
        uncleared1: this.UNCLEARED1_BAL,
        uncleared2: this.UNCLEARED2_BAL,
        reservedFund: this.RESERVED_FUND,
        earmarkedFund: this.EARMARKED_FUND,
        creditPending: this.CR_PENDING_BAL,
        debitPending: this.DR_PENDING_BAL,
        provision: this.PROVISION_BAL,
        prepaidCharge: this.PREPAID_CHRG_BAL,
        penal: this.PENAL_BAL,
        cumulativeLien: this.CUMULATIVE_LIEN_AMT
      },
      interest: {
        debitAccrued: this.DR_INT_ACCRUED,
        creditAccrued: this.CR_INT_ACCRUED,
        debitAccruedYTD: this.DR_INT_ACCRUED_YTD,
        debitAccruedLTD: this.DR_INT_ACCRUED_LTD,
        creditAccruedYTD: this.CR_INT_ACCRUED_YTD,
        creditAccruedLTD: this.CR_INT_ACCRUED_LTD,
        debitAccruedPTD: this.DR_INT_ACCRUED_PTD,
        creditAccruedPTD: this.CR_INT_ACCRUED_PTD,
        debitPerDay: this.DR_INT_PER_DAY,
        creditPerDay: this.CR_INT_PER_DAY,
        debitRemainderAccrued: this.DR_INT_REMAINDER_ACCRUED,
        creditRemainderAccrued: this.CR_INT_REMAINDER_ACCRUED,
        debitRemainderPerDay: this.DR_INT_REMAINDER_PER_DAY,
        creditRemainderPerDay: this.CR_INT_REMAINDER_PER_DAY,
        debitCharged: this.DR_INT_CHRGD,
        creditPaid: this.CR_INT_PAID,
        debitPaid: this.DR_INT_PAID,
        debitEffectiveRate: this.DR_CALCULATED_EFF_INT_RATE,
        creditEffectiveRate: this.CR_CALCULATED_EFF_INT_RATE,
        penalEffectiveRate: this.PENAL_EFFECTIVE_RATE,
        penalPerDay: this.PENAL_INT_PER_DAY
      },
      turnover: {
        debit: this.DR_TURNOVER,
        credit: this.CR_TURNOVER,
        debitCount: this.DR_COUNT,
        creditCount: this.CR_COUNT,
        chequeCount: this.CHQ_COUNT,
        ytdReturns: this.YTD_RETURNS_COUNT,
        ytdClearingReturns: this.YTD_CLEARING_RETURNS_COUNT
      },
      averages: {
        ledgerBalance: this.AVG_LEDGER_BAL,
        clearedBalance: this.AVG_CLEARED_BAL,
        ledgerBalancePerDay: this.AVG_LEDGER_BAL_PER_DAY,
        clearedBalancePerDay: this.AVG_CLEARED_BAL_PER_DAY
      },
      extremes: {
        minLedgerBalance: this.MIN_LEDGER_BAL,
        minClearedBalance: this.MIN_CLEARED_BAL,
        maxLedgerBalance: this.MAX_LEDGER_BAL,
        maxClearedBalance: this.MAX_CLEARED_BAL
      },
      charges: {
        applied: this.CHRG_APPLIED,
        totalCharges: this.TOTAL_CHRGS,
        totalTax: this.TOTAL_TAX,
        totalCost: this.TOTAL_COST
      },
      dates: {
        lastActivity: this.LAST_ACTIVITY_DT,
        lastDeposit: this.LAST_DEPOSIT_DT,
        lastWithdrawal: this.LAST_WITHDRAWL_DT,
        lastOverdraft: this.LAST_OD_DT,
        lastProvision: this.LAST_PROV_DT,
        delinquent: this.DELINQUENT_DT,
        lastAccrual: this.LAST_ACCRUAL_TIME,
        lastProductUpdate: this.LAST_PROD_UPD_DT,
        earliestBackvalue: this.EARLIEST_BACKVALUE_DT,
        lastBackvalue: this.LAST_BACKVALUE_DT,
        debitLastBackdated: this.DR_LAST_BACKDATED_TXN_DT,
        creditLastBackdated: this.CR_LAST_BACKDATED_TXN_DT,
        debitLastAccrual: this.DR_LAST_ACCRUAL_DT,
        debitNextAccrual: this.DR_NEXT_ACCRUAL_DT,
        creditLastAccrual: this.CR_LAST_ACCRUAL_DT,
        creditNextAccrual: this.CR_NEXT_ACCRUAL_DT,
        maxLedgerBalanceDate: this.MAX_LEDGER_BAL_DT,
        maxClearedBalanceDate: this.MAX_CLEARED_BAL_DT,
        minLedgerBalanceDate: this.MIN_LEDGER_BAL_DT,
        minClearedBalanceDate: this.MIN_CLEARED_BAL_DT,
        avgBalanceDate: this.AVG_BAL_DT,
        accountCycleStart: this.ACCT_CYCLE_START_DT,
        accountCycleEnd: this.ACCT_CYCLE_END_DT,
        statementStart: this.STMNT_START_DT,
        nextStatement: this.NEXT_STMNT_DT,
        currentAccrual: this.CURRENT_ACCRUAL_DT
      },
      cycleBalances: {
        openingLedger: this.ACCT_CYCLE_OPENING_LED_BAL,
        openingCleared: this.ACCT_CYCLE_OPENING_CLR_BAL,
        closingLedger: this.ACCT_CYCLE_CLOSING_LED_BAL,
        closingCleared: this.ACCT_CYCLE_CLOSING_CLR_BAL,
        forwardLedger: this.LEDGER_BAL_FWD,
        forwardCleared: this.CLEARED_BAL_FWD,
        forwardDebit: this.DR_BAL_FWD,
        forwardCredit: this.CR_BAL_FWD
      },
      statementInfo: {
        count: this.STMNT_COUNT,
        openingBalance: this.STMNT_OPENNING_BAL
      },
      status: {
        recordStatus: this.REC_ST,
        version: this.VERSION_NO,
        statUpdateFlag: this.STAT_UPD_FG,
        tempReclassification: this.TEMP_RECLASSIFICATION_ST,
        accrualDueFlag: this.ACCRUAL_DUE_FG,
        debitInterestOverride: this.DR_INT_OVR_FG,
        creditInterestOverride: this.CR_INT_OVR_FG,
        balanceChangeFlag: this.BAL_CHNG_FG
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

  // Instance method: Check if account is active
  isActive() {
    return this.REC_ST === 'A';
  }

  // Instance method: Check if account is delinquent
  isDelinquent() {
    return this.DELINQUENT_DT !== null;
  }

  // Instance method: Get net balance
  get netBalance() {
    return parseFloat(this.LEDGER_BAL);
  }

  // Instance method: Get available balance
  get availableBalance() {
    const ledgerBal = parseFloat(this.LEDGER_BAL);
    const reservedFund = parseFloat(this.RESERVED_FUND);
    const earmarkedFund = parseFloat(this.EARMARKED_FUND);
    const provisionBal = parseFloat(this.PROVISION_BAL);
    const penalBal = parseFloat(this.PENAL_BAL);
    const cumulativeLienAmt = parseFloat(this.CUMULATIVE_LIEN_AMT);
    
    return ledgerBal - reservedFund - earmarkedFund - provisionBal - penalBal - cumulativeLienAmt;
  }

  // Instance method: Get formatted balances
  get formattedBalances() {
    return {
      ledgerBalance: parseFloat(this.LEDGER_BAL).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      clearedBalance: parseFloat(this.CLEARED_BAL).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }),
      availableBalance: this.availableBalance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    };
  }

  // Instance method: Get transaction summary
  get transactionSummary() {
    return {
      totalTransactions: this.DR_COUNT + this.CR_COUNT,
      debitTransactions: this.DR_COUNT,
      creditTransactions: this.CR_COUNT,
      totalTurnover: parseFloat(this.DR_TURNOVER) + parseFloat(this.CR_TURNOVER),
      netTurnover: parseFloat(this.CR_TURNOVER) - parseFloat(this.DR_TURNOVER)
    };
  }
}

DepositAccountSummary.init({
  // Primary key
  ACCT_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    allowNull: false,
    comment: 'Account identifier'
  },

  ACCT_NO: {
    type: DataTypes.STRING(60),
    allowNull: true,
    comment: 'Account number'
  },

  // Balance fields
  LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Ledger balance'
  },

  CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Cleared balance'
  },

  UNCLEARED1_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Uncleared balance 1'
  },

  UNCLEARED2_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Uncleared balance 2'
  },

  RESERVED_FUND: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Reserved fund'
  },

  EARMARKED_FUND: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Earmarked fund'
  },

  DR_INT_ACCRUED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest accrued'
  },

  CR_INT_ACCRUED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest accrued'
  },

  // Date fields
  LAST_ACTIVITY_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last activity date'
  },

  LAST_DEPOSIT_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last deposit date'
  },

  LAST_DEPOSIT_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Last deposit amount'
  },

  LAST_WITHDRAWL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last withdrawal date'
  },

  LAST_WITHDRAWL_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Last withdrawal amount'
  },

  LAST_OD_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last overdraft date'
  },

  // Interest fields
  DR_INT_PER_DAY: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest per day'
  },

  CR_INT_PER_DAY: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest per day'
  },

  DR_BAL_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit balance forward'
  },

  CR_BAL_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit balance forward'
  },

  LEDGER_BAL_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Ledger balance forward'
  },

  CLEARED_BAL_FWD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Cleared balance forward'
  },

  DR_TURNOVER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit turnover'
  },

  CR_TURNOVER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit turnover'
  },

  CHQ_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Cheque count'
  },

  MIN_LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Minimum ledger balance'
  },

  MIN_CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Minimum cleared balance'
  },

  MAX_LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Maximum ledger balance'
  },

  MAX_CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Maximum cleared balance'
  },

  AVG_LEDGER_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Average ledger balance'
  },

  AVG_CLEARED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Average cleared balance'
  },

  AVG_LEDGER_BAL_PER_DAY: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Average ledger balance per day'
  },

  AVG_CLEARED_BAL_PER_DAY: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Average cleared balance per day'
  },

  DR_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit count'
  },

  CR_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit count'
  },

  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Record status'
  },

  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: true,
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

  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Create date'
  },

  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'System create timestamp'
  },

  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: true,
    comment: 'Created by user'
  },

  ACCT_CYCLE_START_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Account cycle start date'
  },

  MAX_LEDGER_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Maximum ledger balance date'
  },

  MAX_CLEARED_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Maximum cleared balance date'
  },

  MIN_LEDGER_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Minimum ledger balance date'
  },

  MIN_CLEARED_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Minimum cleared balance date'
  },

  AVG_BAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Average balance date'
  },

  CHRG_APPLIED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Charges applied'
  },

  CR_INT_PAID: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest paid'
  },

  DR_INT_CHRGD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest charged'
  },

  TOTAL_COST: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Total cost'
  },

  TOTAL_CHRGS: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Total charges'
  },

  TOTAL_TAX: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Total tax'
  },

  CR_PENDING_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit pending balance'
  },

  DR_PENDING_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit pending balance'
  },

  ACCT_CYCLE_END_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Account cycle end date'
  },

  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Product identifier'
  },

  DR_INT_REMAINDER_ACCRUED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest remainder accrued'
  },

  CR_INT_REMAINDER_ACCRUED: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest remainder accrued'
  },

  DR_INT_REMAINDER_PER_DAY: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest remainder per day'
  },

  CR_INT_REMAINDER_PER_DAY: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest remainder per day'
  },

  YTD_RETURNS_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Year-to-date returns count'
  },

  YTD_CLEARING_RETURNS_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Year-to-date clearing returns count'
  },

  STAT_UPD_FG: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Statistics update flag'
  },

  TEMP_RECLASSIFICATION_ST: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Temporary reclassification status'
  },

  LAST_ACCRUAL_TIME: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last accrual time'
  },

  DR_INT_ACCRUED_PTD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest accrued period-to-date'
  },

  CR_INT_ACCRUED_PTD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest accrued period-to-date'
  },

  CUMULATIVE_LIEN_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Cumulative lien amount'
  },

  ACCRUAL_DUE_FG: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Accrual due flag'
  },

  LAST_PROD_UPD_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last product update date'
  },

  EARLIEST_BACKVALUE_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Earliest backvalue date'
  },

  LAST_BACKVALUE_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last backvalue date'
  },

  ACCT_CYCLE_OPENING_LED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Account cycle opening ledger balance'
  },

  ACCT_CYCLE_OPENING_CLR_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Account cycle opening cleared balance'
  },

  ACCT_CYCLE_CLOSING_LED_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Account cycle closing ledger balance'
  },

  ACCT_CYCLE_CLOSING_CLR_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Account cycle closing cleared balance'
  },

  STMNT_START_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Statement start date'
  },

  NEXT_STMNT_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Next statement date'
  },

  STMNT_COUNT: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Statement count'
  },

  STMNT_OPENNING_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Statement opening balance'
  },

  PROVISION_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Provision balance'
  },

  CURRENT_ACCRUAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Current accrual date'
  },

  PREPAID_CHRG_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Prepaid charge balance'
  },

  CR_CALCULATED_EFF_INT_RATE: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: true,
    comment: 'Credit calculated effective interest rate'
  },

  DR_CALCULATED_EFF_INT_RATE: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: true,
    comment: 'Debit calculated effective interest rate'
  },

  DR_LAST_ACCRUAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Debit last accrual date'
  },

  DR_NEXT_ACCRUAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Debit next accrual date'
  },

  CR_LAST_ACCRUAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Credit last accrual date'
  },

  CR_NEXT_ACCRUAL_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Credit next accrual date'
  },

  DR_INT_OVR_FG: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Debit interest override flag'
  },

  CR_INT_OVR_FG: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Credit interest override flag'
  },

  DR_INT_ACCRUED_YTD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest accrued year-to-date'
  },

  DR_INT_ACCRUED_LTD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest accrued life-to-date'
  },

  CR_INT_ACCRUED_YTD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest accrued year-to-date'
  },

  CR_INT_ACCRUED_LTD: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Credit interest accrued life-to-date'
  },

  DR_LAST_BACKDATED_TXN_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Debit last backdated transaction date'
  },

  CR_LAST_BACKDATED_TXN_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Credit last backdated transaction date'
  },

  DR_INT_PAID: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Debit interest paid'
  },

  BAL_CHNG_FG: {
    type: DataTypes.STRING(1),
    allowNull: true,
    comment: 'Balance change flag'
  },

  PENAL_BAL: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Penalty balance'
  },

  PENAL_EFFECTIVE_RATE: {
    type: DataTypes.DECIMAL(12, 6),
    allowNull: true,
    comment: 'Penalty effective rate'
  },

  PENAL_INT_PER_DAY: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0,
    comment: 'Penalty interest per day'
  },

  DELINQUENT_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Delinquent date'
  },

  LAST_PROV_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Last provision date'
  }
}, {
  sequelize,
  modelName: 'DepositAccountSummary',
  tableName: 'deposit_account_summary',
  timestamps: true,                       // Enables Sequelize to manage createdAt/updatedAt
  createdAt: 'created_at',                // Maps Sequelize's createdAt to column `created_at`
  updatedAt: 'updated_at',                // Maps Sequelize's updatedAt to column `updated_at`
  // The updated_at column will be automatically updated on every save
  // (equivalent to `ON UPDATE CURRENT_TIMESTAMP` in SQL)

  hooks: {
    beforeValidate: (summary) => {
      // Ensure uppercase for flags and statuses
      const uppercaseFields = [
        'REC_ST', 'STAT_UPD_FG', 'TEMP_RECLASSIFICATION_ST', 
        'ACCRUAL_DUE_FG', 'DR_INT_OVR_FG', 'CR_INT_OVR_FG', 'BAL_CHNG_FG'
      ];
      
      uppercaseFields.forEach(field => {
        if (summary[field]) {
          summary[field] = summary[field].toUpperCase();
        }
      });
      
      // Trim string fields
      if (summary.ACCT_NO) summary.ACCT_NO = summary.ACCT_NO.trim();
      if (summary.USER_ID) summary.USER_ID = summary.USER_ID.trim();
      if (summary.CREATED_BY) summary.CREATED_BY = summary.CREATED_BY.trim();
      
      // Ensure balances are not negative
      const balanceFields = [
        'LEDGER_BAL', 'CLEARED_BAL', 'UNCLEARED1_BAL', 'UNCLEARED2_BAL',
        'RESERVED_FUND', 'EARMARKED_FUND', 'DR_INT_ACCRUED', 'CR_INT_ACCRUED'
      ];
      
      balanceFields.forEach(field => {
        if (summary[field] && parseFloat(summary[field]) < 0) {
          summary[field] = 0;
        }
      });
    },
    
    beforeCreate: (summary) => {
      // Set timestamps if not provided
      const now = new Date();
      if (!summary.CREATE_DT) summary.CREATE_DT = now;
      if (!summary.SYS_CREATE_TS) summary.SYS_CREATE_TS = now;
      if (!summary.ROW_TS) summary.ROW_TS = now;
      if (!summary.LAST_ACTIVITY_DT) summary.LAST_ACTIVITY_DT = now;
      if (!summary.REC_ST) summary.REC_ST = 'A';
      if (!summary.VERSION_NO) summary.VERSION_NO = 1;
      
      // Initialize dates if not provided
      if (!summary.ACCT_CYCLE_START_DT) summary.ACCT_CYCLE_START_DT = now;
      if (!summary.ACCT_CYCLE_END_DT) {
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + 1);
        summary.ACCT_CYCLE_END_DT = endDate;
      }
      
      if (!summary.NEXT_STMNT_DT) {
        const nextStatement = new Date(now);
        nextStatement.setMonth(nextStatement.getMonth() + 1);
        summary.NEXT_STMNT_DT = nextStatement;
      }
      
      // Initialize min/max balances with current ledger balance
      const ledgerBal = parseFloat(summary.LEDGER_BAL) || 0;
      summary.MIN_LEDGER_BAL = ledgerBal;
      summary.MAX_LEDGER_BAL = ledgerBal;
      summary.MIN_CLEARED_BAL = ledgerBal;
      summary.MAX_CLEARED_BAL = ledgerBal;
      summary.MIN_LEDGER_BAL_DT = now;
      summary.MAX_LEDGER_BAL_DT = now;
      summary.MIN_CLEARED_BAL_DT = now;
      summary.MAX_CLEARED_BAL_DT = now;
      summary.AVG_BAL_DT = now;
      
      // Initialize average balances
      summary.AVG_LEDGER_BAL = ledgerBal;
      summary.AVG_CLEARED_BAL = ledgerBal;
      summary.AVG_LEDGER_BAL_PER_DAY = ledgerBal;
      summary.AVG_CLEARED_BAL_PER_DAY = ledgerBal;
      
      // Initialize cycle balances
      summary.ACCT_CYCLE_OPENING_LED_BAL = ledgerBal;
      summary.ACCT_CYCLE_OPENING_CLR_BAL = ledgerBal;
      summary.ACCT_CYCLE_CLOSING_LED_BAL = ledgerBal;
      summary.ACCT_CYCLE_CLOSING_CLR_BAL = ledgerBal;
      summary.LEDGER_BAL_FWD = ledgerBal;
      summary.CLEARED_BAL_FWD = ledgerBal;
      summary.STMNT_OPENNING_BAL = ledgerBal;
    },
    
    beforeUpdate: (summary) => {
      // Update row timestamp
      summary.ROW_TS = new Date();
      
      // Increment version number on update
      if (summary.changed() && !summary.changed('VERSION_NO')) {
        summary.VERSION_NO = (summary.VERSION_NO || 0) + 1;
      }
      
      // Update last activity date if balance changed
      if (summary.changed('LEDGER_BAL') || summary.changed('CLEARED_BAL')) {
        summary.LAST_ACTIVITY_DT = new Date();
        summary.BAL_CHNG_FG = 'Y';
      }
    }
  },
  indexes: [
    // Primary index
    { fields: ['ACCT_ID'], unique: true },
    
    // Account number index
    { fields: ['ACCT_NO'] },
    
    // Product index
    { fields: ['PROD_ID'] },
    
    // Status indexes
    { fields: ['REC_ST'] },
    { fields: ['STAT_UPD_FG'] },
    { fields: ['ACCRUAL_DUE_FG'] },
    { fields: ['TEMP_RECLASSIFICATION_ST'] },
    
    // Date indexes for queries
    { fields: ['LAST_ACTIVITY_DT'] },
    { fields: ['LAST_DEPOSIT_DT'] },
    { fields: ['LAST_WITHDRAWL_DT'] },
    { fields: ['ACCT_CYCLE_START_DT'] },
    { fields: ['ACCT_CYCLE_END_DT'] },
    { fields: ['NEXT_STMNT_DT'] },
    { fields: ['DELINQUENT_DT'] },
    
    // Balance indexes
    { fields: ['LEDGER_BAL'] },
    { fields: ['CLEARED_BAL'] },
    { fields: ['AVG_LEDGER_BAL'] },
    { fields: ['AVG_CLEARED_BAL'] },
    
    // Composite indexes for common queries
    { fields: ['PROD_ID', 'REC_ST'] },
    { fields: ['REC_ST', 'LAST_ACTIVITY_DT'] },
    { fields: ['REC_ST', 'LEDGER_BAL'] },
    { fields: ['PROD_ID', 'ACCT_CYCLE_END_DT'] },
    { fields: ['ACCT_CYCLE_START_DT', 'ACCT_CYCLE_END_DT'] },
    
    // Performance indexes
    { fields: ['DR_TURNOVER'] },
    { fields: ['CR_TURNOVER'] },
    { fields: ['DR_COUNT'] },
    { fields: ['CR_COUNT'] },
    
    // User indexes
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
    byAccountId: (accountId) => ({
      where: { ACCT_ID: accountId }
    }),
    byAccountNumber: (accountNumber) => ({
      where: { ACCT_NO: accountNumber }
    }),
    byProduct: (productId) => ({
      where: { PROD_ID: productId }
    }),
    withPositiveBalance: {
      where: { LEDGER_BAL: { [Op.gt]: 0 } }
    },
    withNegativeBalance: {
      where: { LEDGER_BAL: { [Op.lt]: 0 } }
    },
    delinquent: {
      where: { DELINQUENT_DT: { [Op.ne]: null } }
    },
    needStatement: {
      where: {
        NEXT_STMNT_DT: {
          [Op.lte]: new Date()
        }
      }
    },
    highActivity: {
      where: {
        [Op.or]: [
          { DR_COUNT: { [Op.gt]: 100 } },
          { CR_COUNT: { [Op.gt]: 100 } }
        ]
      }
    },
    recentActivity: {
      where: {
        LAST_ACTIVITY_DT: {
          [Op.gte]: new Date(new Date() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
        }
      }
    },
    sortedByBalance: {
      order: [['LEDGER_BAL', 'DESC']]
    },
    sortedByActivity: {
      order: [['LAST_ACTIVITY_DT', 'DESC']]
    }
  }
});

export default DepositAccountSummary;
