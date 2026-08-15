// migrations/20250101-create-eom-tables.js
import { DataTypes } from 'sequelize';

export async function up(queryInterface, Sequelize) {
  // Create eom_closing_periods table
  await queryInterface.createTable('eom_closing_periods', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 12
      }
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 2000,
        max: 2100
      }
    },
    period_start: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    period_end: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    closing_date: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CLOSED', 'REOPENED'),
      allowNull: false,
      defaultValue: 'OPEN'
    },
    organization_code: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    branch_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '001'
    },
    closed_by: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    total_entries: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    total_amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00
    },
    report_id: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    reopened_by: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    reopened_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    reopening_reason: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  // Add indexes
  await queryInterface.addIndex('eom_closing_periods', 
    ['month', 'year', 'organization_code', 'branch_code'], 
    { unique: true, name: 'idx_month_year_org_branch' }
  );
  await queryInterface.addIndex('eom_closing_periods', ['status'], { name: 'idx_status' });
  await queryInterface.addIndex('eom_closing_periods', ['closed_at'], { name: 'idx_closed_at' });
  await queryInterface.addIndex('eom_closing_periods', ['organization_code', 'branch_code'], { name: 'idx_org_branch' });

  // Create eom_reports table
  await queryInterface.createTable('eom_reports', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false
    },
    report_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true
    },
    month: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    year: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    period_start: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    period_end: {
      type: DataTypes.DATEONLY,
      allowNull: false
    },
    report_data: {
      type: DataTypes.JSON,
      allowNull: false
    },
    organization_code: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1
    },
    branch_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '001'
    },
    generated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    generated_by: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'system'
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'ARCHIVED', 'FAILED'),
      allowNull: false,
      defaultValue: 'PENDING'
    },
    archived_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {}
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    }
  });

  // Add indexes for eom_reports
  await queryInterface.addIndex('eom_reports', ['report_id'], { unique: true, name: 'idx_report_id' });
  await queryInterface.addIndex('eom_reports', ['month', 'year'], { name: 'idx_month_year' });
  await queryInterface.addIndex('eom_reports', ['organization_code', 'branch_code'], { name: 'idx_org_branch' });
  await queryInterface.addIndex('eom_reports', ['status'], { name: 'idx_status' });
}

export async function down(queryInterface, Sequelize) {
  await queryInterface.dropTable('eom_reports');
  await queryInterface.dropTable('eom_closing_periods');
}