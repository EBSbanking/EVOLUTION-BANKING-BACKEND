import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanProvision = sequelize.define('LoanProvision', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  loan_account_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'loan_accounts', key: 'id' }
  },
  acct_no: {                               // denormalized for quick lookup
    type: DataTypes.STRING(255),
    allowNull: false
  },
  disbursement_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false
  },
  provision_rate: {
    type: DataTypes.DECIMAL(5, 4),
    allowNull: false,
    defaultValue: 0.01
  },
  provision_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false
  },
  gl_account: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  provision_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'REVERSED', 'PARTIALLY_RELEASED'),
    defaultValue: 'ACTIVE'
  },
  reversed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reversal_reason: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'loan_provisions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default LoanProvision;