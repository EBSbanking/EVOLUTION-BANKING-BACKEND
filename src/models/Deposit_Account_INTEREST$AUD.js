// models/DepositAccountInterestAudit.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountInterestAudit extends Model {
  static async findByInterestId(interestId) {
    return this.findAll({
      where: { depositAcctIntId: interestId },
      order: [['auditTimestamp', 'DESC']]
    });
  }

  static async findByDepositAccountId(accountId) {
    return this.findAll({
      where: { depositAcctId: accountId },
      order: [['auditTimestamp', 'DESC']]
    });
  }

  static async findByAuditAction(action) {
    return this.findAll({
      where: { auditAction: action },
      order: [['auditTimestamp', 'DESC']]
    });
  }

  static async findByAuditUser(user) {
    return this.findAll({
      where: { auditUser: user },
      order: [['auditTimestamp', 'DESC']]
    });
  }

  static async findByDateRange(startDate, endDate) {
    return this.findAll({
      where: {
        auditTimestamp: { [Op.between]: [startDate, endDate] }
      },
      order: [['auditTimestamp', 'DESC']]
    });
  }

  static async getAuditSummaryByAction() {
    const result = await this.findAll({
      attributes: [
        'auditAction',
        [sequelize.fn('COUNT', sequelize.col('auditAction')), 'count'],
        [sequelize.fn('MIN', sequelize.col('auditTimestamp')), 'firstAudit'],
        [sequelize.fn('MAX', sequelize.col('auditTimestamp')), 'lastAudit']
      ],
      group: ['auditAction'],
      order: [[sequelize.fn('COUNT', sequelize.col('auditAction')), 'DESC']]
    });
    return result.map(row => ({
      action: row.auditAction,
      count: row.get('count'),
      firstAudit: row.get('firstAudit'),
      lastAudit: row.get('lastAudit')
    }));
  }

  static async getRateChangeHistory(accountId) {
    const audits = await this.findAll({
      where: { depositAcctId: accountId, auditAction: 'RATE_CHANGE' },
      order: [['auditTimestamp', 'DESC']]
    });
    return audits.map(audit => ({
      auditId: audit.id,
      auditDate: audit.auditTimestamp,
      auditUser: audit.auditUser,
      previousRate: audit._previousDataValues?.absoluteRate || audit.absoluteRate,
      newRate: audit.absoluteRate,
      previousMargin: audit._previousDataValues?.marginRate || audit.marginRate,
      newMargin: audit.marginRate,
      effectiveDate: audit.effectiveDate,
      rateType: audit.interestRateType
    }));
  }

  getAuditDetails() {
    return {
      auditId: this.id,
      depositInterestId: this.depositAcctIntId,
      depositAccountId: this.depositAcctId,
      depositProductInterestId: this.depositProdIntId,
      interestRateType: this.interestRateType,
      indexRateId: this.indexRateId,
      rateStructure: this.rateStructureCode,
      marginRate: this.marginRate,
      minRate: this.minRate,
      maxRate: this.maxRate,
      absoluteRate: this.absoluteRate,
      fixedRate: this.fixedRate,
      penaltyMarginRate: this.penaltyMarginRate,
      penaltyMarginType: this.penaltyMarginTypeCode,
      accrualBasis: this.accrualBasisType,
      accrualBalanceBasis: this.accrualBalanceBasisType,
      marginType: this.marginTypeCode,
      marginBalanceBasis: this.marginBalanceBasisType,
      rateChangeFrequency: `${this.rateChangeFrequencyCode} ${this.rateChangeFrequencyValue}`,
      maxRateChanges: this.maxRateChanges,
      settlementFrequency: `${this.settlementFrequencyCode} ${this.settlementFrequencyValue}`,
      waiverAmount: this.waiverAmount,
      minInterestAmount: this.minInterestAmount,
      overrideFlag: this.overrideFlag,
      recordStatus: this.recordStatus,
      version: this.versionNo,
      lastSettlement: this.lastSettlementDate,
      nextSettlement: this.nextSettlementDate,
      effectiveDate: this.effectiveDate,
      auditAction: this.auditAction,
      auditUser: this.auditUser,
      auditTimestamp: this.auditTimestamp,
      createdBy: this.createdBy,
      userId: this.userId,
      createDate: this.createDate,
      rowTimestamp: this.rowTimestamp
    };
  }

  isInsertAction() { return this.auditAction === 'INSERT'; }
  isUpdateAction() { return this.auditAction === 'UPDATE'; }
  isDeleteAction() { return this.auditAction === 'DELETE'; }
  isRateChangeAction() { return this.auditAction === 'RATE_CHANGE'; }

  get rateChangeDescription() {
    if (this.interestRateType === 'FIXED') {
      return `Fixed Rate: ${this.absoluteRate}%`;
    } else if (this.interestRateType === 'FLOATING') {
      return `Floating Rate: ${this.marginRate}% margin (${this.minRate}%-${this.maxRate}% range)`;
    }
    return `${this.interestRateType} Rate: ${this.absoluteRate}%`;
  }

  get settlementSchedule() {
    return `Settle every ${this.settlementFrequencyValue} ${this.settlementFrequencyCode}(s), Next: ${this.nextSettlementDate ? this.nextSettlementDate.toLocaleDateString() : 'N/A'}`;
  }
}

DepositAccountInterestAudit.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  depositAcctIntId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account interest identifier'
  },
  depositAcctId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account identifier'
  },
  depositProdIntId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit product interest identifier'
  },
  interestRateType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Interest rate type'
  },
  indexRateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Index rate identifier'
  },
  rateStructureCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Rate structure code'
  },
  marginRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Margin rate'
  },
  minRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Minimum rate'
  },
  maxRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Maximum rate'
  },
  absoluteRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Absolute rate'
  },
  accrualBasisType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Accrual basis type'
  },
  accrualBalanceBasisType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Accrual balance basis type'
  },
  marginTypeCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Margin type code'
  },
  marginBalanceBasisType: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Margin balance basis type'
  },
  rateChangeFrequencyCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Rate change frequency code'
  },
  maxRateChanges: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Maximum number of rate changes'
  },
  rateChangeFrequencyValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Rate change frequency value'
  },
  settlementFrequencyCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Settlement frequency code'
  },
  settlementFrequencyValue: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Settlement frequency value'
  },
  waiverAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Waiver amount'
  },
  minInterestAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Minimum interest amount'
  },
  overrideFlag: {
    type: DataTypes.STRING(1),
    allowNull: false,
    comment: 'Override flag'
  },
  recordStatus: {
    type: DataTypes.STRING(1),
    allowNull: false,
    comment: 'Record status'
  },
  versionNo: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Version number'
  },
  rowTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Row timestamp'
  },
  userId: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User identifier'
  },
  createDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Create date'
  },
  createdBy: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created by user'
  },
  systemCreateTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'System create timestamp'
  },
  lastSettlementDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Last settlement date'
  },
  nextSettlementDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Next settlement date'
  },
  fixedRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Fixed rate'
  },
  effectiveDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Effective date'
  },
  penaltyMarginRate: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Penalty margin rate'
  },
  penaltyMarginTypeCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Penalty margin type code'
  },
  auditAction: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['INSERT', 'UPDATE', 'DELETE', 'RATE_CHANGE', 'SETTLEMENT', 'WAIVER']]
    },
    comment: 'Audit action'
  },
  auditUser: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Audit user'
  },
  auditTimestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Audit timestamp'
  }
}, {
  sequelize,
  modelName: 'DepositAccountInterestAudit',
  tableName: 'deposit_account_interest_aud',
  timestamps: true,
  
  hooks: {
    beforeCreate: (audit) => {
      if (!audit.auditTimestamp) audit.auditTimestamp = new Date();
      if (!audit.rowTimestamp) audit.rowTimestamp = new Date();
      const now = new Date();
      if (!audit.createDate) audit.createDate = now;
      if (!audit.systemCreateTimestamp) audit.systemCreateTimestamp = now;

      if (parseFloat(audit.minRate) > parseFloat(audit.maxRate)) {
        throw new Error('MIN_RATE cannot be greater than MAX_RATE');
      }
      if (parseFloat(audit.absoluteRate) < parseFloat(audit.minRate) ||
          parseFloat(audit.absoluteRate) > parseFloat(audit.maxRate)) {
        throw new Error('ABSOLUTE_RATE must be between MIN_RATE and MAX_RATE');
      }
    },
    beforeUpdate: (audit) => {
      audit.rowTimestamp = new Date();
      if (!audit.auditTimestamp) audit.auditTimestamp = new Date();
    }
  },
  scopes: {
    recent: { order: [['auditTimestamp', 'DESC']], limit: 100 },
    byAccount: (accountId) => ({ where: { depositAcctId: accountId } }),
    byInterestId: (interestId) => ({ where: { depositAcctIntId: interestId } }),
    byAuditAction: (action) => ({ where: { auditAction: action } }),
    byAuditUser: (user) => ({ where: { auditUser: user } }),
    byDateRange: (start, end) => ({ where: { auditTimestamp: { [Op.between]: [start, end] } } }),
    insertActions: { where: { auditAction: 'INSERT' } },
    updateActions: { where: { auditAction: 'UPDATE' } },
    deleteActions: { where: { auditAction: 'DELETE' } },
    rateChangeActions: { where: { auditAction: 'RATE_CHANGE' } },
    settlementActions: { where: { auditAction: 'SETTLEMENT' } },
    waiverActions: { where: { auditAction: 'WAIVER' } },
    activeRecords: { where: { recordStatus: 'A' } },
    byRateType: (rateType) => ({ where: { interestRateType: rateType } }),
    fixedRate: { where: { interestRateType: 'FIXED' } },
    floatingRate: { where: { interestRateType: 'FLOATING' } },
    thisMonth: { where: { auditTimestamp: { [Op.gte]: new Date(new Date().setDate(1)) } } },
    pendingSettlement: { where: { nextSettlementDate: { [Op.lte]: new Date() } } }
  }
});

export default DepositAccountInterestAudit;