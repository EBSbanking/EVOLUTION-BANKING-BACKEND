// models/EOMClosingPeriod.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class EOMClosingPeriod extends Model {
  /**
   * Check if a month is closed
   */
  static async isMonthClosed(month, year, organizationCode = 1, branchCode = '001') {
    const record = await this.findOne({
      where: {
        month: month,
        year: year,
        organization_code: organizationCode,
        branch_code: branchCode,
        status: 'CLOSED'
      }
    });
    return !!record;
  }

  /**
   * Check if a date is in a closed period (prevents backdating)
   */
  static async isDateInClosedPeriod(date, organizationCode = 1, branchCode = '001') {
    const d = new Date(date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();
    
    return await this.isMonthClosed(month, year, organizationCode, branchCode);
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
      order: [['year', 'DESC'], ['month', 'DESC']]
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
      order: [['year', 'DESC'], ['month', 'DESC']]
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
      order: [['year', 'DESC'], ['month', 'DESC']]
    });
  }

  /**
   * Get open periods
   */
  static async getOpenPeriods(organizationCode = 1, branchCode = '001') {
    return await this.getPeriodsByStatus('OPEN', organizationCode, branchCode);
  }

  /**
   * Get reopened periods
   */
  static async getReopenedPeriods(organizationCode = 1, branchCode = '001') {
    return await this.getPeriodsByStatus('REOPENED', organizationCode, branchCode);
  }

  /**
   * Get period by month and year
   */
  static async getPeriodByMonthYear(month, year, organizationCode = 1, branchCode = '001') {
    return await this.findOne({
      where: {
        month: month,
        year: year,
        organization_code: organizationCode,
        branch_code: branchCode
      }
    });
  }

  /**
   * Create or update a closing period
   */
  static async upsertPeriod(month, year, data, organizationCode = 1, branchCode = '001') {
    const existing = await this.getPeriodByMonthYear(month, year, organizationCode, branchCode);
    
    if (existing) {
      await existing.update(data);
      return existing;
    } else {
      return await this.create({
        month,
        year,
        period_start: new Date(year, month - 1, 1),
        period_end: new Date(year, month, 0),
        organization_code: organizationCode,
        branch_code: branchCode,
        ...data
      });
    }
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
   * Reopen a closed period
   */
  async reopen(userId, reason) {
    if (this.status !== 'CLOSED') {
      throw new Error(`Only closed periods can be reopened. Current status: ${this.status}`);
    }
    
    this.status = 'REOPENED';
    this.reopened_by = userId;
    this.reopened_at = new Date();
    this.reopening_reason = reason;
    this.updated_at = new Date();
    await this.save();
  }

  /**
   * Check if period is closed
   */
  isClosed() {
    return this.status === 'CLOSED';
  }

  /**
   * Check if period is open
   */
  isOpen() {
    return this.status === 'OPEN';
  }

  /**
   * Check if period is reopened
   */
  isReopened() {
    return this.status === 'REOPENED';
  }

  /**
   * Get period display name
   */
  getDisplayName() {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[this.month - 1]} ${this.year}`;
  }

  /**
   * Get status display
   */
  getStatusDisplay() {
    const statusMap = {
      'OPEN': 'Open',
      'CLOSED': 'Closed',
      'REOPENED': 'Reopened'
    };
    return statusMap[this.status] || this.status;
  }

  /**
   * Get period range as string
   */
  getPeriodRange() {
    const start = new Date(this.period_start);
    const end = new Date(this.period_end);
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleDateString('en-US', options)}`;
  }

  /**
   * Get summary of the period
   */
  getSummary() {
    return {
      id: this.id,
      month: this.month,
      year: this.year,
      displayName: this.getDisplayName(),
      periodRange: this.getPeriodRange(),
      status: this.status,
      statusDisplay: this.getStatusDisplay(),
      isClosed: this.isClosed(),
      isOpen: this.isOpen(),
      isReopened: this.isReopened(),
      closedBy: this.closed_by,
      closedAt: this.closed_at,
      totalEntries: this.total_entries,
      totalAmount: this.total_amount,
      reportId: this.report_id,
      reopenedBy: this.reopened_by,
      reopenedAt: this.reopened_at,
      reopeningReason: this.reopening_reason,
      notes: this.notes,
      organizationCode: this.organization_code,
      branchCode: this.branch_code,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }
}

EOMClosingPeriod.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Auto-increment primary key'
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 12
      },
      comment: 'Month (1-12)'
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 2000,
        max: 2100
      },
      comment: 'Year'
    },
    period_start: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'Start date of the period'
    },
    period_end: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: 'End date of the period'
    },
    closing_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Date when the period was closed'
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CLOSED', 'REOPENED'),
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
      comment: 'Reference to the EOM report'
    },
    reopened_by: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'User who reopened the period'
    },
    reopened_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time when period was reopened'
    },
    reopening_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Reason for reopening'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes'
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
    modelName: 'EOMClosingPeriod',
    tableName: 'eom_closing_periods',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
    indexes: [
      { 
        name: 'idx_month_year_org_branch', 
        fields: ['month', 'year', 'organization_code', 'branch_code'],
        unique: true 
      },
      { 
        name: 'idx_status', 
        fields: ['status'] 
      },
      { 
        name: 'idx_closed_at', 
        fields: ['closed_at'] 
      },
      { 
        name: 'idx_org_branch', 
        fields: ['organization_code', 'branch_code'] 
      },
      { 
        name: 'idx_closed_by', 
        fields: ['closed_by'] 
      },
      { 
        name: 'idx_reopened_by', 
        fields: ['reopened_by'] 
      }
    ],
    hooks: {
      beforeCreate: (record) => {
        // Set period start and end if not provided
        if (!record.period_start) {
          record.period_start = new Date(record.year, record.month - 1, 1);
        }
        if (!record.period_end) {
          record.period_end = new Date(record.year, record.month, 0);
        }
        // Set closed_at if status is CLOSED
        if (record.status === 'CLOSED' && !record.closed_at) {
          record.closed_at = new Date();
        }
      },
      beforeUpdate: (record) => {
        if (record.changed('status')) {
          // Set closed_at when status changes to CLOSED
          if (record.status === 'CLOSED' && !record.closed_at) {
            record.closed_at = new Date();
          }
          // Set reopened_at when status changes to REOPENED
          if (record.status === 'REOPENED' && !record.reopened_at) {
            record.reopened_at = new Date();
          }
        }
        record.updated_at = new Date();
      },
      afterCreate: (record) => {
        console.log(`✅ EOM closing period created: ${record.getDisplayName()} (${record.status})`);
      },
      afterUpdate: (record) => {
        if (record.changed('status')) {
          console.log(`🔄 EOM closing period updated: ${record.getDisplayName()} -> ${record.status}`);
        }
      }
    }
  }
);

// Associations
EOMClosingPeriod.associate = (models) => {
  // Belongs to Organization
  if (models.Organization) {
    EOMClosingPeriod.belongsTo(models.Organization, {
      foreignKey: 'organization_code',
      targetKey: 'organization_code',
      as: 'organization'
    });
  }

  // Belongs to Branch
  if (models.Branch) {
    EOMClosingPeriod.belongsTo(models.Branch, {
      foreignKey: 'branch_code',
      targetKey: 'branch_code',
      as: 'branch'
    });
  }

  // Belongs to User (closed_by)
  if (models.User) {
    EOMClosingPeriod.belongsTo(models.User, {
      foreignKey: 'closed_by',
      targetKey: 'user_name',
      as: 'closedBy'
    });
    
    EOMClosingPeriod.belongsTo(models.User, {
      foreignKey: 'reopened_by',
      targetKey: 'user_name',
      as: 'reopenedBy'
    });
  }

  // Belongs to EOMReport
  if (models.EOMReport) {
    EOMClosingPeriod.belongsTo(models.EOMReport, {
      foreignKey: 'report_id',
      targetKey: 'report_id',
      as: 'report'
    });
  }
};

export default EOMClosingPeriod;
