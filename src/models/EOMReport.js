// models/EOMReport.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class EOMReport extends Model {
  /**
   * Get report by ID
   */
  static async findByReportId(reportId, options = {}) {
    return await this.findOne({
      where: { report_id: reportId },
      ...options
    });
  }

  /**
   * Get reports by month/year
   */
  static async findByMonthYear(month, year, options = {}) {
    return await this.findAll({
      where: { 
        month: month,
        year: year 
      },
      order: [['generated_at', 'DESC']],
      ...options
    });
  }

  /**
   * Get reports by organization and branch
   */
  static async findByOrganizationAndBranch(organizationCode, branchCode, options = {}) {
    return await this.findAll({
      where: { 
        organization_code: organizationCode,
        branch_code: branchCode
      },
      order: [['generated_at', 'DESC']],
      ...options
    });
  }

  /**
   * Get latest report for a month/year
   */
  static async getLatestReport(month, year, organizationCode, branchCode) {
    return await this.findOne({
      where: {
        month: month,
        year: year,
        organization_code: organizationCode,
        branch_code: branchCode,
        status: 'COMPLETED'
      },
      order: [['generated_at', 'DESC']]
    });
  }

  /**
   * Get reports by status
   */
  static async findByStatus(status, options = {}) {
    return await this.findAll({
      where: { status },
      order: [['generated_at', 'DESC']],
      ...options
    });
  }

  /**
   * Mark report as archived
   */
  async archive() {
    this.status = 'ARCHIVED';
    this.archived_at = new Date();
    await this.save();
  }

  /**
   * Get financial summary from report data
   */
  getFinancialSummary() {
    if (!this.report_data) return null;
    
    try {
      const data = typeof this.report_data === 'string' 
        ? JSON.parse(this.report_data) 
        : this.report_data;
      
      return data.summary || data.financialStatement || data;
    } catch (error) {
      console.error('Error parsing report data:', error);
      return null;
    }
  }

  /**
   * Get account details from report
   */
  getAccountDetails() {
    if (!this.report_data) return [];
    
    try {
      const data = typeof this.report_data === 'string' 
        ? JSON.parse(this.report_data) 
        : this.report_data;
      
      return data.accountDetails || [];
    } catch (error) {
      console.error('Error parsing report data:', error);
      return [];
    }
  }

  /**
   * Check if report is complete
   */
  isComplete() {
    return this.status === 'COMPLETED';
  }

  /**
   * Check if report is archived
   */
  isArchived() {
    return this.status === 'ARCHIVED';
  }

  /**
   * Get report as JSON
   */
  toJSON() {
    const data = super.toJSON();
    
    if (data.report_data && typeof data.report_data === 'string') {
      try {
        data.report_data = JSON.parse(data.report_data);
      } catch (error) {
        console.error('Error parsing report_data:', error);
      }
    }
    
    return data;
  }
}

EOMReport.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Auto-increment primary key'
    },
    report_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'Unique report identifier (EOM-REPORT-YYYY-MM-{timestamp})'
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Month (1-12)'
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
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
    report_data: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: 'Complete report data as JSON',
      get() {
        const rawValue = this.getDataValue('report_data');
        if (typeof rawValue === 'string') {
          try {
            return JSON.parse(rawValue);
          } catch (error) {
            console.error('Error parsing report_data:', error);
            return rawValue;
          }
        }
        return rawValue;
      },
      set(value) {
        this.setDataValue('report_data', typeof value === 'object' ? JSON.stringify(value) : value);
      }
    },
    organization_code: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Organization code for multi-tenant'
    },
    branch_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '001',
      comment: 'Branch code'
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Date and time report was generated'
    },
    generated_by: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'system',
      comment: 'User who generated the report'
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'ARCHIVED', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING',
      comment: 'Report status'
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Date and time report was archived'
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata for the report'
    },
    // Audit fields
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
    modelName: 'EOMReport',
    tableName: 'eom_reports',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
    indexes: [
      { 
        name: 'idx_report_id', 
        fields: ['report_id'], 
        unique: true 
      },
      { 
        name: 'idx_month_year', 
        fields: ['month', 'year'] 
      },
      { 
        name: 'idx_org_branch', 
        fields: ['organization_code', 'branch_code'] 
      },
      { 
        name: 'idx_status', 
        fields: ['status'] 
      },
      { 
        name: 'idx_generated_at', 
        fields: ['generated_at'] 
      },
      { 
        name: 'idx_org_branch_month_year', 
        fields: ['organization_code', 'branch_code', 'month', 'year'] 
      }
    ],
    hooks: {
      beforeCreate: (report) => {
        if (!report.report_id) {
          const timestamp = Date.now();
          const monthStr = String(report.month).padStart(2, '0');
          report.report_id = `EOM-REPORT-${report.year}-${monthStr}-${timestamp}`;
        }
        if (!report.generated_at) {
          report.generated_at = new Date();
        }
      },
      beforeUpdate: (report) => {
        if (report.changed('status') && report.status === 'ARCHIVED' && !report.archived_at) {
          report.archived_at = new Date();
        }
        report.updated_at = new Date();
      }
    }
  }
);

// Associations
EOMReport.associate = (models) => {
  if (models.Organization) {
    EOMReport.belongsTo(models.Organization, {
      foreignKey: 'organization_code',
      targetKey: 'organization_code',
      as: 'organization'
    });
  }

  if (models.Branch) {
    EOMReport.belongsTo(models.Branch, {
      foreignKey: 'branch_code',
      targetKey: 'branch_code',
      as: 'branch'
    });
  }

  if (models.User) {
    EOMReport.belongsTo(models.User, {
      foreignKey: 'generated_by',
      targetKey: 'user_name',
      as: 'generatedBy'
    });
  }
};

export default EOMReport;
