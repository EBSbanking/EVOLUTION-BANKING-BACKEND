// src/models/GLClosingPeriod.js (Simplified)
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const GLClosingPeriod = sequelize.define('GLClosingPeriod', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  fiscal_year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true
  },
  closing_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('OPEN', 'CLOSING_IN_PROGRESS', 'CLOSED', 'REVERSED'),
    defaultValue: 'OPEN'
  },
  closed_by: {
    type: DataTypes.STRING(100)
  },
  total_entries: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  total_amount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0.00
  },
  report_id: {
    type: DataTypes.STRING(100)
  },
  reversal_reason: {
    type: DataTypes.TEXT
  },
  reversed_by: {
    type: DataTypes.STRING(100)
  },
  reversed_at: {
    type: DataTypes.DATE
  },
  task_id: {
    type: DataTypes.STRING(100)
  },
  execution_mode: {
    type: DataTypes.ENUM('MANUAL', 'SCHEDULED', 'API'),
    defaultValue: 'MANUAL'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'gl_closing_periods',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['fiscal_year'] },
    { fields: ['status'] },
    { fields: ['task_id'] },
    { fields: ['closing_date'] }
  ]
});

// Instance methods
GLClosingPeriod.prototype.isOpen = function() {
  return this.status === 'OPEN';
};

GLClosingPeriod.prototype.isClosed = function() {
  return this.status === 'CLOSED';
};

GLClosingPeriod.prototype.canBeReversed = function() {
  return this.status === 'CLOSED' && !this.reversed_at;
};

export default GLClosingPeriod;