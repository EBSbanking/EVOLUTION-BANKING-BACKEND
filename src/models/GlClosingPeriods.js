// models/GLClosingPeriod.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class GLClosingPeriod extends Model {
  /**
   * Check if a fiscal year is closed
   */
  static async isFiscalYearClosed(fiscalYear, organizationCode = 1, branchCode = '001') {
    const record = await this.findOne({
      where: {
        fiscal_year: fiscalYear,
        organization_code: organizationCode,
        branch_code: branchCode,
        status: 'CLOSED'
      }
    });
    return !!record;
  }

  /**
   * Get all closed periods for an organization
   */
  static async getClosedPeriods(organizationCode = 1, branchCode = '001') {
    return await this.findAll({
      where: {
        organization_code: organizationCode,
        branch_code: branchCode,
        status: 'CLOSED'
      },
      order: [['fiscal_year', 'DESC']]
    });
  }

  /**
   * Get the latest closed period
   */
  static async getLatestClosedPeriod(organizationCode = 1, branchCode = '001') {
    return await this.findOne({
      where: {
        organization_code: organizationCode,
        branch_code: branchCode,
        status: 'CLOSED'
      },
      order: [['fiscal_year', 'DESC']]
    });
  }

  /**
   * Get all periods by status
   */
  static async getPeriodsByStatus(status, organizationCode = 1, branchCode = '001') {
    return await this.findAll({
      where: {
        organization_code: organizationCode,
        branch_code: branchCode,
        status: status
      },
      order: [['fiscal_year', 'DESC']]
    });
  }

  /**
   * Get open periods
   */
  static async getOpenPeriods(organizationCode = 1, branchCode = '001') {
    return await this.getPeriodsByStatus('OPEN', organizationCode, branchCode);
  }

  /**
   * Get closing in progress periods
   */
  static async getClosingInProgressPeriods(organizationCode = 1, branchCode = '001') {
    return await this.getPeriodsByStatus('CLOSING_IN_PROGRESS', organizationCode, branchCode);
  }

  /**
   * Mark period as closing in progress
   */
  static async markClosingInProgress(fiscalYear, userId, organizationCode = 1, branchCode = '001') {
    const period = await this.findOne({
      where: {
        fiscal_year: fiscalYear,
        organization_code: organizationCode,
        branch_code: branchCode
      }
    });

    if (!period) {
      throw new Error(`Period for fiscal year ${fiscalYear} not found`);
    }

    if (period.status === 'CLOSED') {
      throw new Error(`Fiscal year ${fiscalYear} is already closed`);
    }

    period.status = 'CLOSING_IN_PROGRESS';
    period.updated_at = new Date();
    await period.save();

    return period;
  }

  /**
   * Check if period is open
   */
  isOpen() {
    return this.status === 'OPEN';
  }

  /**
   * Check if period is closed
   */
  isClosed() {
    return this.status === 'CLOSED';
  }

  /**
   * Check if period can be reversed
   */
  canBeReversed() {
    return this.status === 'CLOSED' && !this.reversed_at;
  }

  /**
   * Check if period is in progress
   */
  isInProgress() {
    return this.status === 'CLOSING_IN_PROGRESS';
  }

  /**
   * Mark as closed
   */
  async markAsClosed(userId, totalEntries = 0, totalAmount = 0, reportId = null) {
    this.status = 'CLOSED';
    this.closed_by = userId;
    this.closed_at = new Date();
    this.total_entries = totalEntries;
    this.total_amount = totalAmount;
    this.report_id = reportId;
    this.updated_at = new Date();
    await this.save();
  }

  /**
   * Mark as open (reopen)
   */
  async reopen(userId, reason) {
    if (!this.canBeReversed()) {
      throw new Error('This period cannot be reversed');
    }

    this.status = 'REVERSED';
    this.reversed_by = userId;
    this.reversed_at = new Date();
    this.reversal_reason = reason || 'No reason provided';
    this.updated_at = new Date();
    await this.save();
  }

  /**
   * Reset to open status (for failed closings)
   */
  async resetToOpen() {
    if (this.status !== 'CLOSING_IN_PROGRESS') {
      throw new Error('Only periods in progress can be reset');
    }

    this.status = 'OPEN';
    this.updated_at = new Date();
    await this.save();
  }
}

GLClosingPeriod.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Auto-increment primary key'
    },
    fiscal_year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Fiscal year'
    },
    closing_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Date when the period was closed'
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CLOSING_IN_PROGRESS', 'CLOSED', 'REVERSED'),
      allowNull: false,
      defaultValue: 'OPEN',
      comment: 'Period status'
    },
    organization_code: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Organization code'
    },
    branch_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '001',
      comment: 'Branch code'
    },
    closed_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who closed the period'
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time when period was closed'
    },
    total_entries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Total number of closing entries'
    },
    total_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      comment: 'Total amount of closing entries'
    },
    report_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Reference to the EOY report'
    },
    reversal_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for reversal'
    },
    reversed_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who reversed the closing'
    },
    reversed_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time when closing was reversed'
    },
    task_id: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Task ID for async processing'
    },
    execution_mode: {
      type: DataTypes.ENUM('MANUAL', 'SCHEDULED', 'API'),
      allowNull: false,
      defaultValue: 'MANUAL',
      comment: 'How the closing was executed'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes about the closing'
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Creation timestamp'
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Last update timestamp'
    }
  },
  {
    sequelize,
    modelName: 'GLClosingPeriod',
    tableName: 'gl_closing_periods',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
    indexes: [
      { 
        name: 'idx_fiscal_year_org_branch', 
        fields: ['fiscal_year', 'organization_code', 'branch_code'],
        unique: true 
      },
      { 
        name: 'idx_status', 
        fields: ['status'] 
      },
      { 
        name: 'idx_task_id', 
        fields: ['task_id'] 
      },
      { 
        name: 'idx_closed_at', 
        fields: ['closed_at'] 
      },
      { 
        name: 'idx_org_branch', 
        fields: ['organization_code', 'branch_code'] 
      }
    ],
    hooks: {
      beforeCreate: (record) => {
        if (!record.closed_at && record.status === 'CLOSED') {
          record.closed_at = new Date();
        }
      },
      beforeUpdate: (record) => {
        if (record.changed('status')) {
          if (record.status === 'CLOSED' && !record.closed_at) {
            record.closed_at = new Date();
          }
          if (record.status === 'REVERSED' && !record.reversed_at) {
            record.reversed_at = new Date();
          }
        }
        record.updated_at = new Date();
      },
      afterCreate: (record) => {
        console.log(`✅ GLClosingPeriod created for FY ${record.fiscal_year}`);
      },
      afterUpdate: (record) => {
        console.log(`🔄 GLClosingPeriod updated for FY ${record.fiscal_year}: ${record.status}`);
      }
    }
  }
);

// Associations
GLClosingPeriod.associate = (models) => {
  // Belongs to Organization
  if (models.Organization) {
    GLClosingPeriod.belongsTo(models.Organization, {
      foreignKey: 'organization_code',
      targetKey: 'organization_code',
      as: 'organization'
    });
  }

  // Belongs to Branch
  if (models.Branch) {
    GLClosingPeriod.belongsTo(models.Branch, {
      foreignKey: 'branch_code',
      targetKey: 'branch_code',
      as: 'branch'
    });
  }

  // Belongs to EOYReport
  if (models.EOYReport) {
    GLClosingPeriod.belongsTo(models.EOYReport, {
      foreignKey: 'report_id',
      targetKey: 'report_id',
      as: 'report'
    });
  }
};

export default GLClosingPeriod;
