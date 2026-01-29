// models/DepositAccountInterestAudit.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountInterestAudit extends Model {
  // Static method: Find by deposit account interest ID
  static async findByInterestId(interestId) {
    return this.findAll({
      where: { DEPOSIT_ACCT_INT_ID: interestId },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Find by deposit account ID
  static async findByDepositAccountId(accountId) {
    return this.findAll({
      where: { DEPOSIT_ACCT_ID: accountId },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Find by audit action
  static async findByAuditAction(action) {
    return this.findAll({
      where: { AUDIT_ACTION: action },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Find by audit user
  static async findByAuditUser(user) {
    return this.findAll({
      where: { AUDIT_USER: user },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Find audits by date range
  static async findByDateRange(startDate, endDate) {
    return this.findAll({
      where: {
        AUDIT_TS: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Get audit summary by action type
  static async getAuditSummaryByAction() {
    const result = await this.findAll({
      attributes: [
        'AUDIT_ACTION',
        [sequelize.fn('COUNT', sequelize.col('AUDIT_ACTION')), 'count'],
        [sequelize.fn('MIN', sequelize.col('AUDIT_TS')), 'firstAudit'],
        [sequelize.fn('MAX', sequelize.col('AUDIT_TS')), 'lastAudit']
      ],
      group: ['AUDIT_ACTION'],
      order: [[sequelize.fn('COUNT', sequelize.col('AUDIT_ACTION')), 'DESC']]
    });

    return result.map(row => ({
      action: row.AUDIT_ACTION,
      count: row.get('count'),
      firstAudit: row.get('firstAudit'),
      lastAudit: row.get('lastAudit')
    }));
  }

  // Static method: Get rate change history for account
  static async getRateChangeHistory(accountId) {
    const audits = await this.findAll({
      where: { 
        DEPOSIT_ACCT_ID: accountId,
        AUDIT_ACTION: 'RATE_CHANGE'
      },
      order: [['AUDIT_TS', 'DESC']]
    });

    return audits.map(audit => ({
      auditId: audit.id,
      auditDate: audit.AUDIT_TS,
      auditUser: audit.AUDIT_USER,
      previousRate: audit._previousDataValues?.ABSOLUTE_RATE || audit.ABSOLUTE_RATE,
      newRate: audit.ABSOLUTE_RATE,
      previousMargin: audit._previousDataValues?.MARGIN_RATE || audit.MARGIN_RATE,
      newMargin: audit.MARGIN_RATE,
      effectiveDate: audit.EFFECTIVE_DT,
      rateType: audit.INT_RATE_TY
    }));
  }

  // Instance method: Get audit details
  getAuditDetails() {
    return {
      auditId: this.id,
      depositInterestId: this.DEPOSIT_ACCT_INT_ID,
      depositAccountId: this.DEPOSIT_ACCT_ID,
      depositProductInterestId: this.DEPOSIT_PROD_INT_ID,
      interestRateType: this.INT_RATE_TY,
      indexRateId: this.INDEX_RATE_ID,
      rateStructure: this.RATE_STRUCT_CD,
      marginRate: this.MARGIN_RATE,
      minRate: this.MIN_RATE,
      maxRate: this.MAX_RATE,
      absoluteRate: this.ABSOLUTE_RATE,
      fixedRate: this.FIXED_RATE,
      penaltyMarginRate: this.PENAL_MARGIN_RATE,
      penaltyMarginType: this.PENAL_MARGIN_TY_CD,
      accrualBasis: this.ACCRUAL_BASIS_TY,
      accrualBalanceBasis: this.ACCRUAL_BAL_BASIS_TY,
      marginType: this.MARGIN_TY_CD,
      marginBalanceBasis: this.MARGIN_BAL_BASIS_TY,
      rateChangeFrequency: `${this.RATE_CHANGE_FREQ_CD} ${this.RATE_CHANGE_FREQ_VALUE}`,
      maxRateChanges: this.MAX_NO_OF_RATE_CHANGES,
      settlementFrequency: `${this.SETLMNT_FREQ_CD} ${this.SETLMNT_FREQ_VALUE}`,
      waiverAmount: this.WAIVER_AMT,
      minInterestAmount: this.MIN_INT_AMT,
      overrideFlag: this.OVR_FG,
      recordStatus: this.REC_ST,
      version: this.VERSION_NO,
      lastSettlement: this.LAST_SETLMNT_DT,
      nextSettlement: this.NEXT_SETLMNT_DT,
      effectiveDate: this.EFFECTIVE_DT,
      auditAction: this.AUDIT_ACTION,
      auditUser: this.AUDIT_USER,
      auditTimestamp: this.AUDIT_TS,
      createdBy: this.CREATED_BY,
      userId: this.USER_ID,
      createDate: this.CREATE_DT,
      rowTimestamp: this.ROW_TS
    };
  }

  // Instance method: Check if INSERT action
  isInsertAction() {
    return this.AUDIT_ACTION === 'INSERT';
  }

  // Instance method: Check if UPDATE action
  isUpdateAction() {
    return this.AUDIT_ACTION === 'UPDATE';
  }

  // Instance method: Check if DELETE action
  isDeleteAction() {
    return this.AUDIT_ACTION === 'DELETE';
  }

  // Instance method: Check if RATE_CHANGE action
  isRateChangeAction() {
    return this.AUDIT_ACTION === 'RATE_CHANGE';
  }

  // Virtual getter: Rate change description
  get rateChangeDescription() {
    if (this.INT_RATE_TY === 'FIXED') {
      return `Fixed Rate: ${this.ABSOLUTE_RATE}%`;
    } else if (this.INT_RATE_TY === 'FLOATING') {
      return `Floating Rate: ${this.MARGIN_RATE}% margin (${this.MIN_RATE}%-${this.MAX_RATE}% range)`;
    } else {
      return `${this.INT_RATE_TY} Rate: ${this.ABSOLUTE_RATE}%`;
    }
  }

  // Virtual getter: Settlement schedule
  get settlementSchedule() {
    return `Settle every ${this.SETLMNT_FREQ_VALUE} ${this.SETLMNT_FREQ_CD}(s), Next: ${this.NEXT_SETLMNT_DT ? this.NEXT_SETLMNT_DT.toLocaleDateString() : 'N/A'}`;
  }
}

DepositAccountInterestAudit.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  DEPOSIT_ACCT_INT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account interest identifier'
  },
  
  DEPOSIT_ACCT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account identifier'
  },
  
  DEPOSIT_PROD_INT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit product interest identifier'
  },
  
  INT_RATE_TY: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Interest rate type'
  },
  
  INDEX_RATE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Index rate identifier'
  },
  
  RATE_STRUCT_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Rate structure code'
  },
  
  MARGIN_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Margin rate'
  },
  
  MIN_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Minimum rate'
  },
  
  MAX_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Maximum rate'
  },
  
  ABSOLUTE_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Absolute rate'
  },
  
  ACCRUAL_BASIS_TY: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Accrual basis type'
  },
  
  ACCRUAL_BAL_BASIS_TY: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Accrual balance basis type'
  },
  
  MARGIN_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Margin type code'
  },
  
  MARGIN_BAL_BASIS_TY: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: 'Margin balance basis type'
  },
  
  RATE_CHANGE_FREQ_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Rate change frequency code'
  },
  
  MAX_NO_OF_RATE_CHANGES: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Maximum number of rate changes'
  },
  
  RATE_CHANGE_FREQ_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Rate change frequency value'
  },
  
  SETLMNT_FREQ_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Settlement frequency code'
  },
  
  SETLMNT_FREQ_VALUE: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Settlement frequency value'
  },
  
  WAIVER_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Waiver amount'
  },
  
  MIN_INT_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'Minimum interest amount'
  },
  
  OVR_FG: {
    type: DataTypes.STRING(1),
    allowNull: false,
    comment: 'Override flag'
  },
  
  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: false,
    comment: 'Record status'
  },
  
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
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
  
  LAST_SETLMNT_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Last settlement date'
  },
  
  NEXT_SETLMNT_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Next settlement date'
  },
  
  FIXED_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Fixed rate'
  },
  
  EFFECTIVE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Effective date'
  },
  
  PENAL_MARGIN_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Penalty margin rate'
  },
  
  PENAL_MARGIN_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Penalty margin type code'
  },
  
  AUDIT_ACTION: {
    type: DataTypes.STRING(20),
    allowNull: false,
    validate: {
      isIn: [['INSERT', 'UPDATE', 'DELETE', 'RATE_CHANGE', 'SETTLEMENT', 'WAIVER']]
    },
    comment: 'Audit action'
  },
  
  AUDIT_USER: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Audit user'
  },
  
  AUDIT_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Audit timestamp'
  },
  
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
  modelName: 'DepositAccountInterestAudit',
  tableName: 'deposit_account_interest_aud',
  timestamps: true,
  hooks: {
    beforeCreate: (audit) => {
      // Set audit timestamp if not provided
      if (!audit.AUDIT_TS) {
        audit.AUDIT_TS = new Date();
      }
      
      // Set row timestamp if not provided
      if (!audit.ROW_TS) {
        audit.ROW_TS = new Date();
      }
      
      // Set system timestamps if not provided
      const now = new Date();
      if (!audit.CREATE_DT) audit.CREATE_DT = now;
      if (!audit.SYS_CREATE_TS) audit.SYS_CREATE_TS = now;
      
      // Validate rate ranges
      if (parseFloat(audit.MIN_RATE) > parseFloat(audit.MAX_RATE)) {
        throw new Error('MIN_RATE cannot be greater than MAX_RATE');
      }
      
      if (parseFloat(audit.ABSOLUTE_RATE) < parseFloat(audit.MIN_RATE) || 
          parseFloat(audit.ABSOLUTE_RATE) > parseFloat(audit.MAX_RATE)) {
        throw new Error('ABSOLUTE_RATE must be between MIN_RATE and MAX_RATE');
      }
    },
    
    beforeUpdate: (audit) => {
      // Update row timestamp on every update
      audit.ROW_TS = new Date();
      
      // Update audit timestamp if not already set
      if (!audit.AUDIT_TS) {
        audit.AUDIT_TS = new Date();
      }
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['DEPOSIT_ACCT_INT_ID'] },
    { fields: ['DEPOSIT_ACCT_ID'] },
    { fields: ['DEPOSIT_PROD_INT_ID'] },
    { fields: ['AUDIT_ACTION'] },
    { fields: ['AUDIT_USER'] },
    { fields: ['AUDIT_TS'] },
    { fields: ['INDEX_RATE_ID'] },
    
    // Composite indexes for common queries
    { fields: ['DEPOSIT_ACCT_ID', 'AUDIT_TS'] },
    { fields: ['DEPOSIT_ACCT_INT_ID', 'AUDIT_TS'] },
    { fields: ['AUDIT_ACTION', 'AUDIT_TS'] },
    { fields: ['AUDIT_USER', 'AUDIT_TS'] },
    { fields: ['INT_RATE_TY', 'AUDIT_TS'] },
    { fields: ['REC_ST', 'AUDIT_TS'] },
    { fields: ['EFFECTIVE_DT', 'AUDIT_TS'] },
    { fields: ['NEXT_SETLMNT_DT', 'AUDIT_TS'] }
  ],
  scopes: {
    recent: {
      order: [['AUDIT_TS', 'DESC']],
      limit: 100
    },
    byAccount: (accountId) => ({
      where: { DEPOSIT_ACCT_ID: accountId }
    }),
    byInterestId: (interestId) => ({
      where: { DEPOSIT_ACCT_INT_ID: interestId }
    }),
    byAuditAction: (action) => ({
      where: { AUDIT_ACTION: action }
    }),
    byAuditUser: (user) => ({
      where: { AUDIT_USER: user }
    }),
    byDateRange: (startDate, endDate) => ({
      where: {
        AUDIT_TS: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    insertActions: {
      where: { AUDIT_ACTION: 'INSERT' }
    },
    updateActions: {
      where: { AUDIT_ACTION: 'UPDATE' }
    },
    deleteActions: {
      where: { AUDIT_ACTION: 'DELETE' }
    },
    rateChangeActions: {
      where: { AUDIT_ACTION: 'RATE_CHANGE' }
    },
    settlementActions: {
      where: { AUDIT_ACTION: 'SETTLEMENT' }
    },
    waiverActions: {
      where: { AUDIT_ACTION: 'WAIVER' }
    },
    activeRecords: {
      where: { REC_ST: 'A' }
    },
    byRateType: (rateType) => ({
      where: { INT_RATE_TY: rateType }
    }),
    fixedRate: {
      where: { INT_RATE_TY: 'FIXED' }
    },
    floatingRate: {
      where: { INT_RATE_TY: 'FLOATING' }
    },
    thisMonth: {
      where: {
        AUDIT_TS: {
          [Op.gte]: new Date(new Date().setDate(1))
        }
      }
    },
    pendingSettlement: {
      where: {
        NEXT_SETLMNT_DT: {
          [Op.lte]: new Date()
        }
      }
    }
  }
});

export default DepositAccountInterestAudit;
