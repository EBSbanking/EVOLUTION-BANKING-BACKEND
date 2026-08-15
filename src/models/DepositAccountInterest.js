// models/DepositAccountInterestAudit.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountInterestAudit extends Model {
  // Static method: Find audits by deposit interest ID
  static async findByDepositInterestId(depositInterestId) {
    return this.findAll({
      where: { DEPOSIT_ACCT_INT_ID: depositInterestId },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Find audits by deposit account ID
  static async findByDepositAccountId(depositAccountId) {
    return this.findAll({
      where: { DEPOSIT_ACCT_ID: depositAccountId },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Find audits by user ID
  static async findByUserId(userId) {
    return this.findAll({
      where: { USER_ID: userId },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Find audits by audit user
  static async findByAuditUser(auditUser) {
    return this.findAll({
      where: { AUDIT_USER: auditUser },
      order: [['AUDIT_TS', 'DESC']]
    });
  }

  // Static method: Get recent audits
  static async getRecentAudits(limit = 50) {
    return this.findAll({
      order: [['AUDIT_TS', 'DESC']],
      limit: limit
    });
  }

  // Static method: Get audit summary
  static async getAuditSummary(startDate, endDate) {
    const audits = await this.findAll({
      where: {
        AUDIT_TS: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['AUDIT_TS', 'DESC']]
    });

    const summary = {
      totalAudits: audits.length,
      byAction: {},
      byUser: {},
      dateRange: { startDate, endDate }
    };

    audits.forEach(audit => {
      // Group by action
      summary.byAction[audit.AUDIT_ACTION] = 
        (summary.byAction[audit.AUDIT_ACTION] || 0) + 1;

      // Group by audit user
      summary.byUser[audit.AUDIT_USER] = 
        (summary.byUser[audit.AUDIT_USER] || 0) + 1;
    });

    return summary;
  }

  // Instance method: Get audit details
  getAuditDetails() {
    return {
      auditId: this.id,
      depositInterestId: this.DEPOSIT_ACCT_INT_ID,
      depositAccountId: this.DEPOSIT_ACCT_ID,
      productInterestId: this.DEPOSIT_PROD_INT_ID,
      interestRateType: this.INT_RATE_TY,
      auditAction: this.AUDIT_ACTION,
      auditUser: this.AUDIT_USER,
      auditTimestamp: this.AUDIT_TS,
      marginRate: this.MARGIN_RATE,
      fixedRate: this.FIXED_RATE,
      absoluteRate: this.ABSOLUTE_RATE,
      rateStructure: this.RATE_STRUCT_CD,
      effectiveDate: this.EFFECTIVE_DT,
      recordStatus: this.REC_ST,
      version: this.VERSION_NO,
      createdBy: this.CREATED_BY,
      createdDate: this.CREATE_DT,
      lastSettlementDate: this.LAST_SETLMNT_DT,
      nextSettlementDate: this.NEXT_SETLMNT_DT,
      userId: this.USER_ID,
      systemCreateTimestamp: this.SYS_CREATE_TS,
      rowTimestamp: this.ROW_TS
    };
  }

  // Instance method: Check if audit is recent
  isRecent() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return this.AUDIT_TS > thirtyDaysAgo;
  }

  // Virtual getter: Formatted audit timestamp
  get formattedAuditTime() {
    return this.AUDIT_TS.toLocaleString();
  }

  // Virtual getter: Formatted rates
  get formattedRates() {
    return {
      marginRate: parseFloat(this.MARGIN_RATE).toFixed(6),
      fixedRate: parseFloat(this.FIXED_RATE).toFixed(6),
      absoluteRate: parseFloat(this.ABSOLUTE_RATE).toFixed(6),
      minRate: parseFloat(this.MIN_RATE).toFixed(6),
      maxRate: parseFloat(this.MAX_RATE).toFixed(6),
      penaltyMarginRate: parseFloat(this.PENAL_MARGIN_RATE).toFixed(6)
    };
  }

  // Virtual getter: Is active record?
  get isActiveRecord() {
    return this.REC_ST === 'A';
  }
}

DepositAccountInterestAudit.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  // Foreign keys
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

  // Interest rate information
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

  // Accrual and margin details
  ACCRUAL_BASIS_TY: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Accrual basis type'
  },

  ACCRUAL_BAL_BASIS_TY: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Accrual balance basis type'
  },

  MARGIN_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Margin type code'
  },

  MARGIN_BAL_BASIS_TY: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Margin balance basis type'
  },

  // Rate change frequency
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

  // Settlement details
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
    validate: {
      isIn: [['A', 'I']] // A=Active, I=Inactive
    },
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

  // Audit specific fields
  AUDIT_ACTION: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Audit action (CREATE, UPDATE, DELETE, etc.)'
  },

  AUDIT_USER: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User who performed the audit'
  },

  AUDIT_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Audit timestamp',
    defaultValue: DataTypes.NOW
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
  modelName: 'DepositAccountInterestAudit',
  tableName: 'deposit_account_interest_aud',
  timestamps: true,
  hooks: {
    beforeValidate: (audit) => {
      // Ensure uppercase for status and flags
      if (audit.REC_ST) audit.REC_ST = audit.REC_ST.toUpperCase();
      if (audit.OVR_FG) audit.OVR_FG = audit.OVR_FG.toUpperCase();
      
      // Ensure AUDIT_ACTION is uppercase
      if (audit.AUDIT_ACTION) audit.AUDIT_ACTION = audit.AUDIT_ACTION.toUpperCase();
    },
    
    beforeCreate: (audit) => {
      // Set timestamps if not provided
      const now = new Date();
      if (!audit.CREATE_DT) audit.CREATE_DT = now;
      if (!audit.SYS_CREATE_TS) audit.SYS_CREATE_TS = now;
      if (!audit.ROW_TS) audit.ROW_TS = now;
      if (!audit.AUDIT_TS) audit.AUDIT_TS = now;
      if (!audit.EFFECTIVE_DT) audit.EFFECTIVE_DT = now;
    },
    
    beforeUpdate: (audit) => {
      // Update audit timestamp on every update
      audit.AUDIT_TS = new Date();
      audit.ROW_TS = new Date();
      
      // Increment version number on update
      if (audit.changed() && !audit.changed('VERSION_NO')) {
        audit.VERSION_NO = (audit.VERSION_NO || 0) + 1;
      }
    }
  },
 
  scopes: {
    recent: {
      order: [['AUDIT_TS', 'DESC']],
      limit: 50
    },
    byDepositInterest: (depositInterestId) => ({
      where: { DEPOSIT_ACCT_INT_ID: depositInterestId }
    }),
    byDepositAccount: (depositAccountId) => ({
      where: { DEPOSIT_ACCT_ID: depositAccountId }
    }),
    byUser: (userId) => ({
      where: { USER_ID: userId }
    }),
    byAuditUser: (auditUser) => ({
      where: { AUDIT_USER: auditUser }
    }),
    byAction: (action) => ({
      where: { AUDIT_ACTION: action }
    }),
    active: {
      where: { REC_ST: 'A' }
    },
    inactive: {
      where: { REC_ST: 'I' }
    },
    dateRange: (startDate, endDate) => ({
      where: {
        AUDIT_TS: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    effectiveDateRange: (startDate, endDate) => ({
      where: {
        EFFECTIVE_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    })
  }
});

export default DepositAccountInterestAudit;
