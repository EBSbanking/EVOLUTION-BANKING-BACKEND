// src/models/ScheduledTask.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const ScheduledTask = sequelize.define('ScheduledTask', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  task_id: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  task_type: {
    type: DataTypes.ENUM('YEAR_END_CLOSING', 'MONTH_END_CLOSING', 'INTEREST_CALCULATION', 'OTHER'),
    allowNull: false
  },
  configuration: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: 'Task configuration parameters'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SKIPPED'),
    defaultValue: 'PENDING'
  },
  user_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  branch_id: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  started_at: {
    type: DataTypes.DATE
  },
  completed_at: {
    type: DataTypes.DATE
  },
  failed_at: {
    type: DataTypes.DATE
  },
  cancelled_at: {
    type: DataTypes.DATE
  },
  cancelled_by: {
    type: DataTypes.STRING(100)
  },
  cancellation_reason: {
    type: DataTypes.TEXT
  },
  duration: {
    type: DataTypes.INTEGER,
    comment: 'Execution duration in milliseconds'
  },
  result_summary: {
    type: DataTypes.JSON,
    comment: 'Task execution result summary'
  },
  error: {
    type: DataTypes.TEXT
  },
  next_run_date: {
    type: DataTypes.DATE,
    comment: 'Next scheduled run date'
  },
  last_run_date: {
    type: DataTypes.DATE,
    comment: 'Last successful run date'
  }
}, {
  tableName: 'scheduled_tasks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
 
});

export default ScheduledTask;